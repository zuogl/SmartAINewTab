export type BookmarkDropIntent = "before" | "after" | "group";

export interface DropPoint {
  x: number;
  y: number;
}

export interface DropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BookmarkDropIntentOptions {
  canCreateGroup: boolean;
  centerHoverMs: number;
  groupDwellMs?: number;
}

export const BOOKMARK_GROUP_DWELL_MS = 520;

export function resolveBookmarkDropIntent(
  rect: DropRect,
  point: DropPoint,
  options: BookmarkDropIntentOptions,
): BookmarkDropIntent {
  const reorderIntent = point.x < rect.left + rect.width / 2
    ? "before"
    : "after";
  if (!options.canCreateGroup) return reorderIntent;

  const iconSize = Math.min(78, rect.width, rect.height);
  const groupCenter = {
    x: rect.left + rect.width / 2,
    y: rect.top + iconSize / 2,
  };
  const groupRadius = Math.min(28, iconSize * 0.36);
  const insideGroupTarget =
    Math.abs(point.x - groupCenter.x) <= groupRadius &&
    Math.abs(point.y - groupCenter.y) <= groupRadius;
  const dwellMs = options.groupDwellMs ?? BOOKMARK_GROUP_DWELL_MS;

  return insideGroupTarget && options.centerHoverMs >= dwellMs
    ? "group"
    : reorderIntent;
}

export function isBookmarkGroupCenter(
  rect: DropRect,
  point: DropPoint,
): boolean {
  return resolveBookmarkDropIntent(rect, point, {
    canCreateGroup: true,
    centerHoverMs: BOOKMARK_GROUP_DWELL_MS,
  }) === "group";
}
