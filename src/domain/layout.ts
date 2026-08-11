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

  syncWorkspaceRootOrders(next);

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
    rootOrder: [],
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
    rootOrder: [...bookmarkIds],
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
  syncCategoryRootOrder(category);
  return category;
}

export function getCategoryRootOrder(category: BookmarkCategory): string[] {
  const looseIds = category.bookmarkIds ?? [];
  const groupIds = category.groups.map((group) => group.id);
  const validIds = new Set([...looseIds, ...groupIds]);
  const seen = new Set<string>();
  const order: string[] = [];

  for (const id of category.rootOrder ?? []) {
    if (!validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of [...looseIds, ...groupIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  return order;
}

export function syncCategoryRootOrder(category: BookmarkCategory): void {
  category.rootOrder = getCategoryRootOrder(category);
}

export function syncWorkspaceRootOrders(workspace: WorkspaceLayout): void {
  for (const category of workspace.categories) {
    syncCategoryRootOrder(category);
  }
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
  if (targetGroup) {
    syncCategoryRootOrder(targetCategory);
  } else {
    const rootOrder = getCategoryRootOrder(targetCategory).filter(
      (id) => id !== bookmarkId,
    );
    const rootIndex = beforeBookmarkId
      ? rootOrder.indexOf(beforeBookmarkId)
      : -1;
    if (rootIndex >= 0) rootOrder.splice(rootIndex, 0, bookmarkId);
    else rootOrder.push(bookmarkId);
    targetCategory.rootOrder = rootOrder;
  }
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

  if (!targetGroup) {
    if (!targetCategory.bookmarkIds.includes(targetBookmarkId)) return false;
    return moveBookmarkRelativeToRootItemInWorkspace(
      workspace,
      bookmarkId,
      targetBookmarkId,
      targetCategoryId,
      position,
    );
  }

  const targetIds = targetGroup.bookmarkIds;
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

export function moveBookmarkRelativeToRootItemInWorkspace(
  workspace: WorkspaceLayout,
  bookmarkId: string,
  targetRootItemId: string,
  targetCategoryId: string,
  position: "before" | "after",
): boolean {
  if (bookmarkId === targetRootItemId) return false;
  const targetCategory = workspace.categories.find(
    (category) => category.id === targetCategoryId,
  );
  if (!targetCategory) return false;
  const initialOrder = getCategoryRootOrder(targetCategory);
  if (!initialOrder.includes(targetRootItemId)) return false;

  removeBookmarkFromWorkspace(workspace, bookmarkId);
  const rootOrder = getCategoryRootOrder(targetCategory);
  const targetIndex = rootOrder.indexOf(targetRootItemId);
  if (targetIndex < 0) return false;
  rootOrder.splice(
    position === "before" ? targetIndex : targetIndex + 1,
    0,
    bookmarkId,
  );

  const looseIds = new Set([...targetCategory.bookmarkIds, bookmarkId]);
  targetCategory.bookmarkIds = rootOrder.filter((id) => looseIds.has(id));
  targetCategory.rootOrder = rootOrder;
  workspace.activeCategoryId = targetCategoryId;
  return true;
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
  if (!category.bookmarkIds.includes(targetBookmarkId)) return undefined;
  const placed = new Set(
    workspace.categories.flatMap((item) => getCategoryBookmarkIds(item)),
  );
  if (!placed.has(bookmarkId) || !placed.has(targetBookmarkId)) return undefined;

  const rootOrder = getCategoryRootOrder(category);
  const targetRootIndex = rootOrder.indexOf(targetBookmarkId);
  if (targetRootIndex < 0) return undefined;
  const beforeTarget = rootOrder
    .slice(0, targetRootIndex)
    .filter((id) => id !== bookmarkId && id !== targetBookmarkId);
  const afterTarget = rootOrder
    .slice(targetRootIndex + 1)
    .filter((id) => id !== bookmarkId && id !== targetBookmarkId);

  removeBookmarkFromWorkspace(workspace, bookmarkId);
  removeBookmarkFromWorkspace(workspace, targetBookmarkId);
  const group = createGroup(uniqueGroupTitle(category, preferredTitle));
  group.bookmarkIds.push(targetBookmarkId, bookmarkId);
  category.groups.push(group);
  category.rootOrder = [...beforeTarget, group.id, ...afterTarget];
  workspace.activeCategoryId = targetCategoryId;
  return group;
}

export function moveGroupInWorkspace(
  workspace: WorkspaceLayout,
  groupId: string,
  sourceCategoryId: string,
  targetCategoryId: string,
  overRootItemId?: string,
): boolean {
  const sourceCategory = workspace.categories.find(
    (category) => category.id === sourceCategoryId,
  );
  const targetCategory = workspace.categories.find(
    (category) => category.id === targetCategoryId,
  );
  const group = sourceCategory?.groups.find((item) => item.id === groupId);
  if (!sourceCategory || !targetCategory || !group) return false;

  if (sourceCategory === targetCategory) {
    const order = getCategoryRootOrder(sourceCategory);
    const from = order.indexOf(groupId);
    const to = overRootItemId ? order.indexOf(overRootItemId) : order.length - 1;
    if (from < 0 || to < 0 || from === to) return false;
    order.splice(from, 1);
    order.splice(to, 0, groupId);
    sourceCategory.rootOrder = order;
    alignGroupsToRootOrder(sourceCategory);
    workspace.activeCategoryId = targetCategoryId;
    return true;
  }

  sourceCategory.groups = sourceCategory.groups.filter(
    (item) => item.id !== groupId,
  );
  sourceCategory.rootOrder = getCategoryRootOrder(sourceCategory).filter(
    (id) => id !== groupId,
  );

  const targetOrder = getCategoryRootOrder(targetCategory);
  const targetIndex = overRootItemId
    ? targetOrder.indexOf(overRootItemId)
    : -1;
  targetCategory.groups.push(group);
  if (targetIndex >= 0) targetOrder.splice(targetIndex, 0, groupId);
  else targetOrder.push(groupId);
  targetCategory.rootOrder = targetOrder;
  alignGroupsToRootOrder(targetCategory);
  workspace.activeCategoryId = targetCategoryId;
  return true;
}

export function dissolveGroupInCategory(
  category: BookmarkCategory,
  groupId: string,
): boolean {
  const group = category.groups.find((item) => item.id === groupId);
  if (!group) return false;
  const rootOrder = getCategoryRootOrder(category);
  const groupIndex = rootOrder.indexOf(groupId);

  category.groups = category.groups.filter((item) => item.id !== groupId);
  category.bookmarkIds.push(
    ...group.bookmarkIds.filter((id) => !category.bookmarkIds.includes(id)),
  );
  const nextOrder = rootOrder.filter(
    (id) => id !== groupId && !group.bookmarkIds.includes(id),
  );
  nextOrder.splice(
    groupIndex >= 0 ? groupIndex : nextOrder.length,
    0,
    ...group.bookmarkIds,
  );
  category.rootOrder = nextOrder;
  return true;
}

export function removeBookmarkFromWorkspace(
  workspace: WorkspaceLayout,
  bookmarkId: string,
): void {
  for (const category of workspace.categories) {
    const rootOrder = getCategoryRootOrder(category);
    category.bookmarkIds = (category.bookmarkIds ?? []).filter(
      (id) => id !== bookmarkId,
    );
    for (const group of category.groups) {
      group.bookmarkIds = group.bookmarkIds.filter((id) => id !== bookmarkId);
    }
    category.rootOrder = rootOrder.filter((id) => id !== bookmarkId);
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

export function visibleCategoriesForDisplay(
  categories: BookmarkCategory[],
  showEmptyUncategorizedCategory: boolean,
): BookmarkCategory[] {
  if (showEmptyUncategorizedCategory) return categories;
  return categories.filter(
    (category) =>
      (category.id !== UNCATEGORIZED_CATEGORY_ID &&
        category.title !== UNCATEGORIZED_TITLE) ||
      getCategoryBookmarkIds(category).length > 0,
  );
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

function alignGroupsToRootOrder(category: BookmarkCategory): void {
  const positions = new Map(
    getCategoryRootOrder(category).map((id, index) => [id, index]),
  );
  category.groups.sort(
    (left, right) =>
      (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
