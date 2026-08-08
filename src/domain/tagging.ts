import type {
  AiJob,
  AiTaggingLimit,
  AiTaggingScope,
  BookmarkRecord,
} from "./types";

export const AI_TAGGING_LIMIT_OPTIONS: AiTaggingLimit[] = [
  1,
  5,
  10,
  20,
  50,
  100,
  "all",
];

const RESERVED_JOB_STATUSES = new Set<AiJob["status"]>([
  "queued",
  "running",
  "paused",
  "failed",
]);

export function matchesTaggingScope(
  bookmark: BookmarkRecord,
  scope: AiTaggingScope,
): boolean {
  if (scope === "untagged") return bookmark.aiTags.length === 0;
  if (scope === "processed") return bookmark.aiTags.length > 0;
  return true;
}

export function selectTaggingCandidates(
  bookmarks: BookmarkRecord[],
  jobs: AiJob[],
  limit: AiTaggingLimit,
  scope: AiTaggingScope = "untagged",
): BookmarkRecord[] {
  const reservedBookmarkIds = new Set(
    jobs
      .filter((job) => RESERVED_JOB_STATUSES.has(job.status))
      .flatMap((job) => job.bookmarkIds),
  );
  const candidates = bookmarks.filter(
    (bookmark) =>
      matchesTaggingScope(bookmark, scope) &&
      !reservedBookmarkIds.has(bookmark.id),
  );
  return limit === "all" ? candidates : candidates.slice(0, limit);
}
