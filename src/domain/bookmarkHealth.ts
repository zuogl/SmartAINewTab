import type {
  BookmarkHealthPreferences,
  BookmarkHealthJob,
  BookmarkHealthRedirectHop,
  BookmarkHealthRedirectKind,
  BookmarkHealthRecord,
  BookmarkRecord,
} from "./types";

const TRACKING_PARAMETERS = new Set([
  "gclid",
  "dclid",
  "fbclid",
  "gbraid",
  "wbraid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "yclid",
]);

export const DEFAULT_BOOKMARK_HEALTH_PREFERENCES: BookmarkHealthPreferences = {
  scheduledScanEnabled: false,
  scheduleIntervalDays: 7,
  autoCheckNewBookmarks: false,
  staleAfterDays: 14,
  ignoredDuplicateKeys: [],
  ignoredDeadBookmarkIds: [],
};

export type DuplicateConfidence = "exact" | "tracking" | "destination";

export interface DuplicateGroup {
  key: string;
  confidence: DuplicateConfidence;
  canonicalUrl: string;
  bookmarks: BookmarkRecord[];
}

export interface BookmarkHealthSummary {
  total: number;
  checked: number;
  healthy: number;
  redirected: number;
  authRequired: number;
  rateLimited: number;
  httpError: number;
  serverError: number;
  networkError: number;
  transient: number;
  suspectedDead: number;
  confirmedDead: number;
  unsupported: number;
  duplicateGroups: number;
  duplicateBookmarks: number;
}

const TEMPORARY_REDIRECT_STATUSES = new Set([302, 303, 307]);
const PERMANENT_REDIRECT_STATUSES = new Set([301, 308]);

export function differsOnlyByFragment(
  initialValue: string,
  finalValue: string,
): boolean {
  try {
    const initial = new URL(initialValue);
    const final = new URL(finalValue);
    const hashesDiffer = initial.hash !== final.hash;
    initial.hash = "";
    final.hash = "";
    return hashesDiffer && initial.toString() === final.toString();
  } catch {
    return false;
  }
}

export function isLikelyLoginRedirect(
  initialValue: string,
  finalValue: string,
): boolean {
  try {
    const initial = new URL(initialValue);
    const final = new URL(finalValue);
    if (sameUrlWithoutHash(initial, final)) return false;
    return !isLoginPath(initial.pathname) && isLoginPath(final.pathname);
  } catch {
    return false;
  }
}

export function classifyBookmarkRedirect(
  initialValue: string,
  finalValue: string,
  chain: BookmarkHealthRedirectHop[],
): BookmarkHealthRedirectKind {
  if (chain.some((hop) => TEMPORARY_REDIRECT_STATUSES.has(hop.status))) {
    return "temporary";
  }
  const allPermanent =
    chain.length > 0 &&
    chain.every((hop) => PERMANENT_REDIRECT_STATUSES.has(hop.status));
  if (!allPermanent) return "other";
  try {
    const initial = new URL(initialValue);
    const final = new URL(finalValue);
    if (!sameCanonicalHost(initial, final)) return "cross-domain";
    if (isSafeCanonicalChange(initial, final)) {
      return "permanent-canonical";
    }
    if (!sameUrlWithoutHash(initial, final)) return "same-site-path";
  } catch {
    return "other";
  }
  return "other";
}

export function normalizeBookmarkHealthPreferences(
  value?: Partial<BookmarkHealthPreferences>,
): BookmarkHealthPreferences {
  const interval = value?.scheduleIntervalDays;
  const staleAfter = value?.staleAfterDays;
  return {
    scheduledScanEnabled:
      value?.scheduledScanEnabled ??
      DEFAULT_BOOKMARK_HEALTH_PREFERENCES.scheduledScanEnabled,
    scheduleIntervalDays:
      interval === 14 || interval === 30 ? interval : 7,
    autoCheckNewBookmarks:
      value?.autoCheckNewBookmarks ??
      DEFAULT_BOOKMARK_HEALTH_PREFERENCES.autoCheckNewBookmarks,
    staleAfterDays:
      staleAfter === 7 || staleAfter === 30 ? staleAfter : 14,
    lastScheduledScanAt:
      typeof value?.lastScheduledScanAt === "number"
        ? value.lastScheduledScanAt
        : undefined,
    ignoredDuplicateKeys: uniqueStrings(value?.ignoredDuplicateKeys),
    ignoredDeadBookmarkIds: uniqueStrings(value?.ignoredDeadBookmarkIds),
  };
}

export function migrateLegacyBookmarkHealthRecord(
  record: BookmarkHealthRecord,
): BookmarkHealthRecord {
  if (
    !record.verifiedBy &&
    (record.status === "suspected-dead" || record.status === "confirmed-dead")
  ) {
    return {
      ...record,
      status: "network-error",
      consecutiveFailures: 0,
      firstFailureAt: undefined,
      nextCheckAt: 0,
      error: "旧版死链结果未经过 GET 复核，请使用新策略复检",
    };
  }
  if (
    (record.detectorVersion ?? 0) < 3 &&
    record.status === "redirected" &&
    record.finalUrl
  ) {
    if (differsOnlyByFragment(record.checkedUrl, record.finalUrl)) {
      return {
        ...record,
        status: "healthy",
        finalUrl: record.checkedUrl,
        redirectCount: 0,
        redirectKind: undefined,
        redirectChain: [],
        consecutiveFailures: 0,
        detectorVersion: 3,
        error: undefined,
      };
    }
    return {
      ...record,
      redirectKind: "other",
      redirectChain: [],
      nextCheckAt: 0,
      detectorVersion: 3,
      error: "旧版结果未记录跳转状态码，请复检后再决定是否更新地址",
    };
  }
  return record;
}

export function exactUrlKey(value: string): string | undefined {
  return normalizedUrl(value, false);
}

export function trackingUrlKey(value: string): string | undefined {
  return normalizedUrl(value, true);
}

export function detectDuplicateGroups(
  bookmarks: BookmarkRecord[],
  healthRecords: BookmarkHealthRecord[] = [],
  ignoredKeys: string[] = [],
): DuplicateGroup[] {
  const parent = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark.id]));
  const healthById = new Map(
    healthRecords.map((record) => [record.bookmarkId, record]),
  );

  const exactKeys = groupByKey(bookmarks, (bookmark) => exactUrlKey(bookmark.url));
  const trackingKeys = groupByKey(bookmarks, (bookmark) => trackingUrlKey(bookmark.url));
  const destinationKeys = groupByKey(bookmarks, (bookmark) => {
    const record = healthById.get(bookmark.id);
    if (!record?.finalUrl) return undefined;
    if (record.status !== "healthy" && record.status !== "redirected") {
      return undefined;
    }
    return exactUrlKey(record.finalUrl);
  });

  for (const groups of [exactKeys, trackingKeys, destinationKeys]) {
    for (const members of groups.values()) unionMembers(parent, members);
  }

  const components = new Map<string, BookmarkRecord[]>();
  for (const bookmark of bookmarks) {
    const root = findRoot(parent, bookmark.id);
    components.set(root, [...(components.get(root) ?? []), bookmark]);
  }

  const ignored = new Set(ignoredKeys);
  const output: DuplicateGroup[] = [];
  for (const members of components.values()) {
    if (members.length < 2) continue;
    const commonExact = commonKey(members, (bookmark) => exactUrlKey(bookmark.url));
    const commonTracking = commonKey(members, (bookmark) => trackingUrlKey(bookmark.url));
    const commonDestination = commonKey(members, (bookmark) => {
      const record = healthById.get(bookmark.id);
      return record?.finalUrl ? exactUrlKey(record.finalUrl) : undefined;
    });
    const confidence: DuplicateConfidence = commonExact
      ? "exact"
      : commonTracking
        ? "tracking"
        : "destination";
    const canonicalUrl =
      commonExact ??
      commonTracking ??
      commonDestination ??
      exactUrlKey(members[0]!.url) ??
      members[0]!.url;
    const key = `${confidence}:${canonicalUrl}`;
    if (ignored.has(key)) continue;
    output.push({
      key,
      confidence,
      canonicalUrl,
      bookmarks: [...members].sort(
        (left, right) => (left.dateAdded ?? 0) - (right.dateAdded ?? 0),
      ),
    });
  }

  const confidenceOrder: Record<DuplicateConfidence, number> = {
    exact: 0,
    tracking: 1,
    destination: 2,
  };
  return output.sort(
    (left, right) =>
      confidenceOrder[left.confidence] - confidenceOrder[right.confidence] ||
      right.bookmarks.length - left.bookmarks.length ||
      left.canonicalUrl.localeCompare(right.canonicalUrl),
  );
}

export function summarizeBookmarkHealth(
  bookmarks: BookmarkRecord[],
  records: BookmarkHealthRecord[],
  duplicateGroups: DuplicateGroup[],
): BookmarkHealthSummary {
  const bookmarkIds = new Set(bookmarks.map((bookmark) => bookmark.id));
  const currentRecords = records.filter((record) => bookmarkIds.has(record.bookmarkId));
  const count = (statuses: BookmarkHealthRecord["status"][]) =>
    currentRecords.filter((record) => statuses.includes(record.status)).length;
  const duplicateIds = new Set(
    duplicateGroups.flatMap((group) => group.bookmarks.map((bookmark) => bookmark.id)),
  );
  return {
    total: bookmarks.length,
    checked: currentRecords.length,
    healthy: count(["healthy"]),
    redirected: count(["redirected"]),
    authRequired: count(["auth-required"]),
    rateLimited: count(["rate-limited"]),
    httpError: count(["http-error"]),
    serverError: count(["server-error"]),
    networkError: count(["network-error", "temporary-error"]),
    transient: count([
      "rate-limited",
      "http-error",
      "server-error",
      "network-error",
      "temporary-error",
    ]),
    suspectedDead: count(["suspected-dead"]),
    confirmedDead: count(["confirmed-dead"]),
    unsupported: count(["unsupported"]),
    duplicateGroups: duplicateGroups.length,
    duplicateBookmarks: duplicateIds.size,
  };
}

export function summarizeBookmarkHealthRun(
  baseline: BookmarkHealthSummary,
  job: BookmarkHealthJob,
): BookmarkHealthSummary {
  const statuses = job.items.flatMap((item) =>
    item.status === "completed" && item.resultStatus
      ? [item.resultStatus]
      : [],
  );
  const count = (expected: BookmarkHealthRecord["status"][]) =>
    statuses.filter((status) => expected.includes(status)).length;
  return {
    ...baseline,
    checked: statuses.length,
    healthy: count(["healthy"]),
    redirected: count(["redirected"]),
    authRequired: count(["auth-required"]),
    rateLimited: count(["rate-limited"]),
    httpError: count(["http-error"]),
    serverError: count(["server-error"]),
    networkError: count(["network-error", "temporary-error"]),
    transient: count([
      "rate-limited",
      "http-error",
      "server-error",
      "network-error",
      "temporary-error",
    ]),
    suspectedDead: count(["suspected-dead"]),
    confirmedDead: count(["confirmed-dead"]),
    unsupported: count(["unsupported"]),
  };
}

function normalizedUrl(value: string, removeTracking: boolean): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    if (removeTracking) {
      for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
          url.searchParams.delete(key);
        }
      }
      const entries = [...url.searchParams.entries()].sort(
        ([leftKey, leftValue], [rightKey, rightValue]) =>
          leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
      );
      url.search = "";
      for (const [key, entryValue] of entries) url.searchParams.append(key, entryValue);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function isLoginPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  return (
    /(^|\/)(login|log-in|signin|sign-in|sign_in)$/.test(normalized) ||
    /(^|\/)(account|auth|user)\/(login|signin|sign-in)$/.test(normalized) ||
    /(^|\/)session\/new$/.test(normalized)
  );
}

function sameCanonicalHost(left: URL, right: URL): boolean {
  return stripWww(left.hostname) === stripWww(right.hostname);
}

function stripWww(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function sameUrlWithoutHash(left: URL, right: URL): boolean {
  const leftCopy = new URL(left);
  const rightCopy = new URL(right);
  leftCopy.hash = "";
  rightCopy.hash = "";
  return leftCopy.toString() === rightCopy.toString();
}

function isSafeCanonicalChange(initial: URL, final: URL): boolean {
  const safeProtocolChange =
    initial.protocol === final.protocol ||
    (initial.protocol === "http:" && final.protocol === "https:");
  if (!safeProtocolChange || initial.port !== final.port) return false;
  if (initial.search !== final.search) return false;
  return normalizeTrailingSlash(initial.pathname) === normalizeTrailingSlash(final.pathname);
}

function normalizeTrailingSlash(pathname: string): string {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

function groupByKey(
  bookmarks: BookmarkRecord[],
  keyFor: (bookmark: BookmarkRecord) => string | undefined,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const bookmark of bookmarks) {
    const key = keyFor(bookmark);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), bookmark.id]);
  }
  return new Map([...groups].filter(([, ids]) => ids.length > 1));
}

function unionMembers(parent: Map<string, string>, members: string[]) {
  const first = members[0];
  if (!first) return;
  for (const member of members.slice(1)) {
    const left = findRoot(parent, first);
    const right = findRoot(parent, member);
    if (left !== right) parent.set(right, left);
  }
}

function findRoot(parent: Map<string, string>, value: string): string {
  const current = parent.get(value) ?? value;
  if (current === value) return value;
  const root = findRoot(parent, current);
  parent.set(value, root);
  return root;
}

function commonKey(
  bookmarks: BookmarkRecord[],
  keyFor: (bookmark: BookmarkRecord) => string | undefined,
): string | undefined {
  const keys = bookmarks.map(keyFor);
  const first = keys[0];
  return first && keys.every((key) => key === first) ? first : undefined;
}

function uniqueStrings(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
