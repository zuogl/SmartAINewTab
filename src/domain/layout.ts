import { nanoid } from "nanoid";
import type {
  BookmarkCategory,
  BookmarkGroup,
  BookmarkRecord,
  CategoryIcon,
  WorkspaceLayout,
} from "./types";
import { LAYOUT_VERSION } from "./types";
import { chooseCategoryIcon } from "./categoryIcons";

export const UNCATEGORIZED_CATEGORY_ID = "category-uncategorized";
export const UNCATEGORIZED_TITLE = "未分类";

export function buildWorkspaceFromBookmarks(
  bookmarks: BookmarkRecord[],
): WorkspaceLayout {
  const categories: BookmarkCategory[] = [
    createUncategorizedCategory(bookmarks.map((item) => item.id)),
  ];

  return {
    version: LAYOUT_VERSION,
    activeCategoryId: categories[0]!.id,
    categories,
    customBookmarks: [],
    hiddenBookmarkIds: [],
    updatedAt: Date.now(),
  };
}

export function reconcileWorkspace(
  workspace: WorkspaceLayout,
  bookmarks: BookmarkRecord[],
): WorkspaceLayout {
  const validIds = new Set([
    ...bookmarks.map((item) => item.id),
    ...workspace.customBookmarks.map((item) => item.id),
  ]);
  const next = structuredClone(workspace);
  const placed = new Set<string>();

  for (const category of next.categories) {
    category.bookmarkIds = uniqueValidPlacements(
      category.bookmarkIds ?? [],
      validIds,
      placed,
    );
    for (const group of category.groups) {
      group.bookmarkIds = uniqueValidPlacements(
        group.bookmarkIds,
        validIds,
        placed,
      );
    }
  }

  const unplaced = bookmarks.filter(
    (item) => !placed.has(item.id) && !next.hiddenBookmarkIds.includes(item.id),
  );

  const uncategorized = ensureUncategorizedCategory(next);
  for (const bookmark of unplaced) uncategorized.bookmarkIds.push(bookmark.id);

  if (next.placementOverrides) {
    for (const bookmarkId of Object.keys(next.placementOverrides)) {
      if (!validIds.has(bookmarkId)) delete next.placementOverrides[bookmarkId];
    }
  }

  if (!next.categories.some((item) => item.id === next.activeCategoryId)) {
    next.activeCategoryId = next.categories[0]?.id ?? "";
  }
  next.updatedAt = Date.now();
  return next;
}

export function lockBookmarkPlacement(
  workspace: WorkspaceLayout,
  bookmarkId: string,
  source: "manual" | "command",
): void {
  workspace.placementOverrides ??= {};
  workspace.placementOverrides[bookmarkId] = {
    source,
    locked: true,
    updatedAt: Date.now(),
  };
}

export function unlockBookmarkPlacement(
  workspace: WorkspaceLayout,
  bookmarkId: string,
): void {
  if (!workspace.placementOverrides) return;
  delete workspace.placementOverrides[bookmarkId];
}

export function createGroup(title: string): BookmarkGroup {
  return {
    id: `group-${nanoid(8)}`,
    title,
    collapsed: false,
    bookmarkIds: [],
  };
}

export function createCategory(
  title: string,
  usedIcons: CategoryIcon[] = [],
): BookmarkCategory {
  return {
    id: `category-${nanoid(8)}`,
    title,
    icon: chooseCategoryIcon(title, usedIcons),
    bookmarkIds: [],
    groups: [],
  };
}

export function createUncategorizedCategory(
  bookmarkIds: string[] = [],
): BookmarkCategory {
  return {
    id: UNCATEGORIZED_CATEGORY_ID,
    title: UNCATEGORIZED_TITLE,
    icon: "archive",
    bookmarkIds,
    groups: [],
  };
}

export function ensureUncategorizedCategory(
  workspace: WorkspaceLayout,
): BookmarkCategory {
  let category = workspace.categories.find(
    (item) =>
      item.id === UNCATEGORIZED_CATEGORY_ID ||
      item.title === UNCATEGORIZED_TITLE,
  );
  if (!category) {
    category = createUncategorizedCategory();
    workspace.categories.unshift(category);
  }
  category.bookmarkIds ??= [];
  return category;
}

export function moveBookmarkInWorkspace(
  workspace: WorkspaceLayout,
  bookmarkId: string,
  targetCategoryId: string,
  targetGroupId?: string,
  beforeBookmarkId?: string,
): boolean {
  const targetCategory = workspace.categories.find(
    (category) => category.id === targetCategoryId,
  );
  const targetGroup = targetGroupId
    ? targetCategory?.groups.find((group) => group.id === targetGroupId)
    : undefined;
  if (!targetCategory || (targetGroupId && !targetGroup)) return false;

  removeBookmarkFromWorkspace(workspace, bookmarkId);

  const targetIds = targetGroup?.bookmarkIds ?? targetCategory.bookmarkIds;
  const targetIndex = beforeBookmarkId
    ? targetIds.indexOf(beforeBookmarkId)
    : -1;
  if (targetIndex >= 0) targetIds.splice(targetIndex, 0, bookmarkId);
  else targetIds.push(bookmarkId);
  workspace.activeCategoryId = targetCategoryId;
  return true;
}

export function moveBookmarkRelativeInWorkspace(
  workspace: WorkspaceLayout,
  bookmarkId: string,
  targetBookmarkId: string,
  targetCategoryId: string,
  targetGroupId: string | undefined,
  position: "before" | "after",
): boolean {
  if (bookmarkId === targetBookmarkId) return false;
  const targetCategory = workspace.categories.find(
    (category) => category.id === targetCategoryId,
  );
  const targetGroup = targetGroupId
    ? targetCategory?.groups.find((group) => group.id === targetGroupId)
    : undefined;
  if (!targetCategory || (targetGroupId && !targetGroup)) return false;

  const targetIds = targetGroup?.bookmarkIds ?? targetCategory.bookmarkIds;
  const targetIndex = targetIds.indexOf(targetBookmarkId);
  if (targetIndex < 0) return false;
  const beforeBookmarkId =
    position === "before"
      ? targetBookmarkId
      : targetIds
          .slice(targetIndex + 1)
          .find((candidateId) => candidateId !== bookmarkId);

  return moveBookmarkInWorkspace(
    workspace,
    bookmarkId,
    targetCategoryId,
    targetGroupId,
    beforeBookmarkId,
  );
}

export function createGroupFromBookmarkDrop(
  workspace: WorkspaceLayout,
  bookmarkId: string,
  targetBookmarkId: string,
  targetCategoryId: string,
  preferredTitle = "新分组",
): BookmarkGroup | undefined {
  if (bookmarkId === targetBookmarkId) return undefined;
  const category = workspace.categories.find(
    (item) => item.id === targetCategoryId,
  );
  if (!category) return undefined;
  const placed = new Set(
    workspace.categories.flatMap((item) => getCategoryBookmarkIds(item)),
  );
  if (!placed.has(bookmarkId) || !placed.has(targetBookmarkId)) return undefined;

  removeBookmarkFromWorkspace(workspace, bookmarkId);
  removeBookmarkFromWorkspace(workspace, targetBookmarkId);
  const group = createGroup(uniqueGroupTitle(category, preferredTitle));
  group.bookmarkIds.push(targetBookmarkId, bookmarkId);
  category.groups.push(group);
  workspace.activeCategoryId = targetCategoryId;
  return group;
}

export function removeBookmarkFromWorkspace(
  workspace: WorkspaceLayout,
  bookmarkId: string,
): void {
  for (const category of workspace.categories) {
    category.bookmarkIds = (category.bookmarkIds ?? []).filter(
      (id) => id !== bookmarkId,
    );
    for (const group of category.groups) {
      group.bookmarkIds = group.bookmarkIds.filter((id) => id !== bookmarkId);
    }
  }
}

export function getCategoryBookmarkIds(
  category: BookmarkCategory,
): string[] {
  return [
    ...(category.bookmarkIds ?? []),
    ...category.groups.flatMap((group) => group.bookmarkIds),
  ];
}

function uniqueGroupTitle(
  category: BookmarkCategory,
  preferredTitle: string,
): string {
  const base = preferredTitle.trim() || "新分组";
  const titles = new Set(category.groups.map((group) => group.title));
  if (!titles.has(base)) return base;
  let index = 2;
  while (titles.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function uniqueValidPlacements(
  values: string[],
  validIds: Set<string>,
  placed: Set<string>,
): string[] {
  const result: string[] = [];
  for (const id of values) {
    if (!validIds.has(id) || placed.has(id)) continue;
    placed.add(id);
    result.push(id);
  }
  return result;
}
