import type {
  BookmarkRecord,
  SearchEvidenceField,
  SearchMatchKind,
  WorkspaceLayout,
} from "./types";

export interface AiSearchConceptGroup {
  label: string;
  terms: string[];
}

export interface AiSearchPlan {
  searchMode: "precise" | "topic";
  interpretation: string;
  exactTerms: string[];
  equivalentTerms: string[];
  relatedTerms: string[];
  requiredConcepts: AiSearchConceptGroup[];
  downrankTerms: string[];
}

export interface RankedSearchCandidate {
  bookmark: BookmarkRecord;
  localScore: number;
  strictMatch: boolean;
  matchKind: SearchMatchKind;
  evidenceField: SearchEvidenceField;
  matchedTerms: string[];
  reason: string;
  categoryId?: string;
  groupId?: string;
  categoryTitle?: string;
  groupTitle?: string;
}

interface SearchPlacement {
  categoryId: string;
  categoryTitle: string;
  groupId?: string;
  groupTitle?: string;
}

interface SearchFields {
  title: string;
  url: string;
  tags: string;
  summary: string;
}

interface SearchEvidence {
  field: SearchEvidenceField;
  term: string;
  score: number;
}

const MAX_PRECISE_RESULTS = 20;
const DIRECT_WEIGHTS: Record<SearchEvidenceField, number> = {
  title: 100,
  url: 96,
  tags: 92,
  summary: 84,
};
const EQUIVALENT_WEIGHTS: Record<SearchEvidenceField, number> = {
  title: 88,
  url: 86,
  tags: 84,
  summary: 76,
};
const RELATED_WEIGHTS: Record<SearchEvidenceField, number> = {
  title: 68,
  url: 66,
  tags: 64,
  summary: 56,
};
const PRECISE_WEIGHTS: Record<SearchEvidenceField, number> = {
  title: 100,
  url: 95,
  tags: 92,
  summary: 82,
};
const MATCH_KIND_ORDER: Record<SearchMatchKind, number> = {
  direct: 0,
  equivalent: 1,
  precise: 1,
  related: 2,
};
const FIELD_LABELS: Record<SearchEvidenceField, string> = {
  title: "标题",
  url: "网址",
  tags: "标签",
  summary: "摘要",
};

/**
 * Executes an AI-produced query plan against verifiable bookmark fields.
 * AI supplies only query-level terminology. Inclusion, evidence, scoring and
 * ordering are deterministic, so the model cannot invent per-bookmark matches.
 */
export function rankSearchCandidates(
  query: string,
  plan: AiSearchPlan,
  bookmarks: BookmarkRecord[],
  workspace: WorkspaceLayout,
  limit = plan.searchMode === "topic" ? bookmarks.length : MAX_PRECISE_RESULTS,
): RankedSearchCandidate[] {
  const placements = createPlacementIndex(workspace);
  const candidates = bookmarks
    .map((bookmark): RankedSearchCandidate | undefined => {
      const placement = placements.get(bookmark.id);
      const fields = createSearchFields(bookmark);
      const evidence =
        plan.searchMode === "topic"
          ? topicEvidence(query, plan, fields)
          : preciseEvidence(query, plan, fields);
      if (!evidence) return undefined;
      return {
        bookmark,
        localScore: evidence.score,
        strictMatch: evidence.matchKind !== "related",
        matchKind: evidence.matchKind,
        evidenceField: evidence.field,
        matchedTerms: evidence.matchedTerms,
        reason: evidence.reason,
        categoryId: placement?.categoryId,
        groupId: placement?.groupId,
        categoryTitle: placement?.categoryTitle,
        groupTitle: placement?.groupTitle,
      };
    })
    .filter((candidate): candidate is RankedSearchCandidate => Boolean(candidate))
    .sort(
      (a, b) =>
        MATCH_KIND_ORDER[a.matchKind] - MATCH_KIND_ORDER[b.matchKind] ||
        b.localScore - a.localScore ||
        a.bookmark.title.localeCompare(b.bookmark.title),
    );

  return candidates.slice(0, Math.max(1, limit));
}

function topicEvidence(
  query: string,
  plan: AiSearchPlan,
  fields: SearchFields,
): (SearchEvidence & {
  matchKind: SearchMatchKind;
  matchedTerms: string[];
  reason: string;
}) | undefined {
  const normalizedQuery = normalize(query);
  const exactTerms = uniqueTerms([
    query,
    ...plan.exactTerms.filter((term) => normalize(term) === normalizedQuery),
  ]);
  const equivalentTerms = withoutTerms(plan.equivalentTerms, exactTerms);
  const relatedTerms = withoutTerms(plan.relatedTerms, [
    ...exactTerms,
    ...equivalentTerms,
  ]);

  const direct = bestEvidence(exactTerms, fields, DIRECT_WEIGHTS);
  if (direct) {
    return {
      ...direct,
      matchKind: "direct",
      matchedTerms: [direct.term],
      reason: `${FIELD_LABELS[direct.field]}直接包含“${direct.term}”`,
    };
  }

  const equivalent = bestEvidence(
    equivalentTerms,
    fields,
    EQUIVALENT_WEIGHTS,
  );
  if (equivalent) {
    return {
      ...equivalent,
      matchKind: "equivalent",
      matchedTerms: [equivalent.term],
      reason: `${FIELD_LABELS[equivalent.field]}包含严格等价名称“${equivalent.term}”`,
    };
  }

  const related = bestEvidence(relatedTerms, fields, RELATED_WEIGHTS);
  if (!related) return undefined;
  return {
    ...related,
    matchKind: "related",
    matchedTerms: [related.term],
    reason: `${FIELD_LABELS[related.field]}包含直接相关主题“${related.term}”`,
  };
}

function preciseEvidence(
  query: string,
  plan: AiSearchPlan,
  fields: SearchFields,
): (SearchEvidence & {
  matchKind: "precise";
  matchedTerms: string[];
  reason: string;
}) | undefined {
  const conceptEvidence = plan.requiredConcepts.map((group) => ({
    group,
    evidence: bestEvidence(group.terms, fields, PRECISE_WEIGHTS),
  }));
  if (
    conceptEvidence.length === 0 ||
    conceptEvidence.some((item) => !item.evidence)
  ) {
    return undefined;
  }

  const resolved = conceptEvidence.map((item) => ({
    group: item.group,
    evidence: item.evidence!,
  }));
  const phraseEvidence = bestEvidence([query], fields, DIRECT_WEIGHTS);
  const best =
    phraseEvidence ??
    resolved.reduce((current, item) =>
      item.evidence.score > current.score ? item.evidence : current,
    resolved[0]!.evidence);
  const averageEvidence =
    resolved.reduce((sum, item) => sum + item.evidence.score, 0) /
    resolved.length;
  const downrankCount = uniqueTerms(plan.downrankTerms).filter((term) =>
    fieldContains(fields, term),
  ).length;
  const score = phraseEvidence
    ? phraseEvidence.score
    : Math.max(60, Math.min(98, 80 + averageEvidence * 0.18 - downrankCount * 6));
  const matchedTerms = uniqueTerms(
    resolved.map((item) => item.evidence.term),
  );
  const evidenceDescription = resolved
    .map((item) => `${item.group.label}“${item.evidence.term}”`)
    .join("、");

  return {
    ...best,
    score: Math.round(score),
    matchKind: "precise",
    matchedTerms,
    reason: `完整命中${evidenceDescription}`,
  };
}

function createSearchFields(bookmark: BookmarkRecord): SearchFields {
  return {
    title: normalize(bookmark.title),
    url: normalize(bookmark.url),
    tags: normalize([...bookmark.tags, ...bookmark.aiTags].join(" ")),
    summary: normalize(bookmark.summary ?? ""),
  };
}

function bestEvidence(
  terms: string[],
  fields: SearchFields,
  weights: Record<SearchEvidenceField, number>,
): SearchEvidence | undefined {
  let best: SearchEvidence | undefined;
  for (const rawTerm of uniqueTerms(terms)) {
    const term = normalize(rawTerm);
    if (!isUsefulTerm(term)) continue;
    for (const field of Object.keys(fields) as SearchEvidenceField[]) {
      if (!fields[field].includes(term)) continue;
      const score = weights[field];
      if (!best || score > best.score) {
        best = { field, term: rawTerm.trim(), score };
      }
    }
  }
  return best;
}

function fieldContains(fields: SearchFields, rawTerm: string): boolean {
  const term = normalize(rawTerm);
  return Boolean(term) && Object.values(fields).some((field) => field.includes(term));
}

function withoutTerms(values: string[], excluded: string[]): string[] {
  const excludedKeys = new Set(excluded.map(normalize));
  return uniqueTerms(values).filter((value) => !excludedKeys.has(normalize(value)));
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalize(value);
    if (!isUsefulTerm(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUsefulTerm(term: string): boolean {
  if (!term) return false;
  if (/^[\u4e00-\u9fff]+$/.test(term)) return term.length >= 2;
  return term.length >= 2;
}

function createPlacementIndex(workspace: WorkspaceLayout) {
  const index = new Map<string, SearchPlacement>();
  for (const category of workspace.categories) {
    for (const bookmarkId of category.bookmarkIds ?? []) {
      index.set(bookmarkId, {
        categoryId: category.id,
        categoryTitle: category.title,
      });
    }
    for (const group of category.groups) {
      for (const bookmarkId of group.bookmarkIds) {
        index.set(bookmarkId, {
          categoryId: category.id,
          categoryTitle: category.title,
          groupId: group.id,
          groupTitle: group.title,
        });
      }
    }
  }
  return index;
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
