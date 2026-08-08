import { nanoid } from "nanoid";
import type {
  BookmarkCategory,
  BookmarkRecord,
  WorkspaceLayout,
} from "@/domain/types";
import {
  createUncategorizedCategory,
  ensureUncategorizedCategory,
  UNCATEGORIZED_TITLE,
} from "@/domain/layout";
import {
  chooseCategoryIcon,
  ensureUniqueCategoryIcons,
} from "@/domain/categoryIcons";
import {
  BASE_CATEGORY_CANDIDATES,
  MAX_AI_CATEGORIES,
  normalizeCategoryTitle,
  normalizeGroupTitle,
  OTHER_CATEGORY_TITLE,
} from "@/domain/taxonomy";
import { MAX_AI_GROUPS_PER_CATEGORY } from "./grouping";

export { MAX_AI_CATEGORIES, MAX_AI_GROUPS_PER_CATEGORY };

interface Placement {
  bookmark: BookmarkRecord;
  category: string;
  group?: string;
  index: number;
}

export function buildAiOrganizedWorkspace(
  current: WorkspaceLayout,
  bookmarks: BookmarkRecord[],
  categoryPlan: readonly string[] = BASE_CATEGORY_CANDIDATES,
): WorkspaceLayout {
  const hidden = new Set(current.hiddenBookmarkIds);
  const visibleBookmarks = bookmarks.filter(
    (bookmark) => !hidden.has(bookmark.id),
  );
  const lockedIds = new Set(
    Object.entries(current.placementOverrides ?? {})
      .filter(([, override]) => override.locked)
      .map(([bookmarkId]) => bookmarkId),
  );
  const aiManagedBookmarks = visibleBookmarks.filter(
    (bookmark) => !lockedIds.has(bookmark.id),
  );
  const unclassifiedIds: string[] = [];
  const placements: Placement[] = [];

  for (const [index, bookmark] of aiManagedBookmarks.entries()) {
    if (!hasAiClassification(bookmark)) {
      unclassifiedIds.push(bookmark.id);
      continue;
    }
    const category = normalizeCategoryTitle(
      bookmark.aiCategory || inferPlacement(bookmark).category,
      categoryPlan,
    );
    if (category === UNCATEGORIZED_TITLE) {
      unclassifiedIds.push(bookmark.id);
      continue;
    }
    placements.push({
      bookmark,
      category,
      group: normalizeGroupTitle(bookmark.aiGroup),
      index,
    });
  }

  const categoryCounts = countBy(placements.map((item) => item.category));
  const categoryTitles = boundedCategories(categoryCounts, MAX_AI_CATEGORIES);
  const retainedCategoryTitles = categoryTitles.filter(
    (title) => title !== OTHER_CATEGORY_TITLE,
  );
  const previousActiveTitle = current.categories.find(
    (category) => category.id === current.activeCategoryId,
  )?.title;
  const categories: BookmarkCategory[] = [
    createUncategorizedCategory(unclassifiedIds),
    ...categoryTitles.map((categoryTitle, categoryIndex) => {
      const categoryPlacements = placements.filter((item) =>
        categoryTitle === OTHER_CATEGORY_TITLE
          ? !retainedCategoryTitles.includes(item.category)
          : item.category === categoryTitle,
      );
      const groupCounts = countBy(
        categoryPlacements
          .map((item) => item.group)
          .filter((group): group is string => Boolean(group)),
      );
      const groupTitles = topLabels(groupCounts, MAX_AI_GROUPS_PER_CATEGORY);
      const groups = groupTitles.map((groupTitle, groupIndex) => ({
        id: `ai-group-${slug(categoryTitle)}-${slug(groupTitle)}-${groupIndex}`,
        title: groupTitle,
        collapsed:
          current.categories
            .find((category) => category.title === categoryTitle)
            ?.groups.find((group) => group.title === groupTitle)?.collapsed ?? false,
        bookmarkIds: categoryPlacements
          .filter((item) => item.group === groupTitle)
          .sort((left, right) => left.index - right.index)
          .map((item) => item.bookmark.id),
      }));
      const groupedIds = new Set(groups.flatMap((group) => group.bookmarkIds));
      return {
        id: `ai-category-${slug(categoryTitle)}-${categoryIndex}`,
        title: categoryTitle,
        icon: chooseCategoryIcon(categoryTitle, []),
        bookmarkIds: categoryPlacements
          .filter((item) => !groupedIds.has(item.bookmark.id))
          .sort((left, right) => left.index - right.index)
          .map((item) => item.bookmark.id),
        groups,
      } satisfies BookmarkCategory;
    }),
  ];

  appendLockedPlacements(
    categories,
    current,
    lockedIds,
    new Set(visibleBookmarks.map((bookmark) => bookmark.id)),
  );
  const categoriesWithUniqueIcons = ensureUniqueCategoryIcons(categories);
  const activeCategoryId =
    categoriesWithUniqueIcons.find(
      (category) => category.title === previousActiveTitle,
    )?.id ?? categoriesWithUniqueIcons[0]!.id;

  return {
    ...structuredClone(current),
    activeCategoryId,
    categories: categoriesWithUniqueIcons,
    updatedAt: Date.now(),
  };
}

export function placeBookmarkInAiWorkspace(
  current: WorkspaceLayout,
  bookmark: BookmarkRecord,
  categoryPlan: readonly string[] = BASE_CATEGORY_CANDIDATES,
): WorkspaceLayout {
  const next = structuredClone(current);
  if (next.hiddenBookmarkIds.includes(bookmark.id)) return next;
  if (next.placementOverrides?.[bookmark.id]?.locked) return next;

  removeBookmark(next, bookmark.id);
  const uncategorized = ensureUncategorizedCategory(next);
  if (!hasAiClassification(bookmark)) {
    uncategorized.bookmarkIds.push(bookmark.id);
    return finish(next);
  }

  const categoryTitle = normalizeCategoryTitle(
    bookmark.aiCategory || inferPlacement(bookmark).category,
    categoryPlan,
  );
  if (categoryTitle === UNCATEGORIZED_TITLE) {
    uncategorized.bookmarkIds.push(bookmark.id);
    return finish(next);
  }

  let category = findByTitle(next.categories, categoryTitle);
  if (!category && countAiManagedCategories(next.categories) < MAX_AI_CATEGORIES) {
    category = newCategory(categoryTitle, next.categories);
    next.categories.push(category);
  }
  if (!category) {
    category = findByTitle(next.categories, OTHER_CATEGORY_TITLE);
    if (!category) {
      category = newCategory(OTHER_CATEGORY_TITLE, next.categories);
      next.categories.push(category);
    }
  }

  const groupTitle = normalizeGroupTitle(bookmark.aiGroup);
  const group = groupTitle ? findByTitle(category.groups, groupTitle) : undefined;
  if (group) group.bookmarkIds.push(bookmark.id);
  else category.bookmarkIds.push(bookmark.id);
  return finish(next);
}

export function inferPlacement(bookmark: BookmarkRecord): { category: string } {
  const value = [
    bookmark.title,
    bookmark.url,
    ...bookmark.folderPath,
    ...bookmark.tags,
    ...bookmark.aiTags,
  ]
    .join(" ")
    .toLocaleLowerCase();
  if (/(github|gitlab|代码|编程|开发|api|npm|cloudflare|vercel|数据库)/i.test(value)) {
    return { category: "开发技术" };
  }
  if (/(chatgpt|deepseek|claude|大模型|人工智能|机器学习|\bai\b|\bllm\b)/i.test(value)) {
    return { category: "AI与自动化" };
  }
  if (/(seo|关键词|流量|营销|增长|similarweb|ahrefs|semrush)/i.test(value)) {
    return { category: "营销增长" };
  }
  if (/(figma|设计|图片|配色|字体|素材|摄影)/i.test(value)) {
    return { category: "设计创意" };
  }
  if (/(课程|学习|教程|教育|学校)/i.test(value)) {
    return { category: "学习教育" };
  }
  if (/(论文|研究|知识|文档|阅读)/i.test(value)) {
    return { category: "研究知识" };
  }
  if (/(新闻|资讯|博客|媒体|周刊)/i.test(value)) {
    return { category: "新闻资讯" };
  }
  if (/(购物|商城|商品|优惠)/i.test(value)) return { category: "购物消费" };
  if (/(旅行|旅游|地图|酒店|航班)/i.test(value)) return { category: "旅行地图" };
  if (/(音乐|视频|电影|播客|影音)/i.test(value)) return { category: "影音娱乐" };
  if (/(游戏|game|gaming)/i.test(value)) return { category: "游戏" };
  return { category: "工作办公" };
}

function appendLockedPlacements(
  categories: BookmarkCategory[],
  current: WorkspaceLayout,
  lockedIds: Set<string>,
  visibleIds: Set<string>,
): void {
  for (const currentCategory of current.categories) {
    const lockedLoose = (currentCategory.bookmarkIds ?? []).filter(
      (bookmarkId) => lockedIds.has(bookmarkId) && visibleIds.has(bookmarkId),
    );
    const lockedGroups = currentCategory.groups
      .map((group) => ({
        group,
        bookmarkIds: group.bookmarkIds.filter(
          (bookmarkId) => lockedIds.has(bookmarkId) && visibleIds.has(bookmarkId),
        ),
      }))
      .filter((entry) => entry.bookmarkIds.length > 0);
    if (lockedLoose.length === 0 && lockedGroups.length === 0) continue;

    let targetCategory = findByTitle(categories, currentCategory.title);
    if (!targetCategory) {
      targetCategory = {
        id: categories.some((category) => category.id === currentCategory.id)
          ? `locked-${nanoid(8)}`
          : currentCategory.id,
        title: currentCategory.title,
        icon: currentCategory.icon,
        bookmarkIds: [],
        groups: [],
      };
      categories.push(targetCategory);
    }
    targetCategory.bookmarkIds.push(...lockedLoose);
    for (const { group, bookmarkIds } of lockedGroups) {
      let targetGroup = findByTitle(targetCategory.groups, group.title);
      if (!targetGroup) {
        targetGroup = {
          id: targetCategory.groups.some((item) => item.id === group.id)
            ? `locked-group-${nanoid(8)}`
            : group.id,
          title: group.title,
          collapsed: group.collapsed,
          bookmarkIds: [],
        };
        targetCategory.groups.push(targetGroup);
      }
      targetGroup.bookmarkIds.push(...bookmarkIds);
    }
  }
}

function removeBookmark(workspace: WorkspaceLayout, bookmarkId: string): void {
  for (const category of workspace.categories) {
    category.bookmarkIds = category.bookmarkIds.filter((id) => id !== bookmarkId);
    for (const group of category.groups) {
      group.bookmarkIds = group.bookmarkIds.filter((id) => id !== bookmarkId);
    }
  }
}

function finish(workspace: WorkspaceLayout): WorkspaceLayout {
  workspace.categories = ensureUniqueCategoryIcons(workspace.categories);
  workspace.updatedAt = Date.now();
  return workspace;
}

function boundedCategories(counts: Map<string, number>, limit: number): string[] {
  const labels = topLabels(counts, Number.MAX_SAFE_INTEGER);
  if (labels.length <= limit) return labels;
  return [
    ...labels.filter((title) => title !== OTHER_CATEGORY_TITLE).slice(0, limit - 1),
    OTHER_CATEGORY_TITLE,
  ];
}

function topLabels(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort(
      ([leftTitle, leftCount], [rightTitle, rightCount]) =>
        rightCount - leftCount || leftTitle.localeCompare(rightTitle, "zh-CN"),
    )
    .slice(0, limit)
    .map(([title]) => title);
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function newCategory(
  title: string,
  categories: BookmarkCategory[] = [],
): BookmarkCategory {
  return {
    id: `ai-category-${nanoid(8)}`,
    title,
    icon: chooseCategoryIcon(
      title,
      categories.map((category) => category.icon),
    ),
    bookmarkIds: [],
    groups: [],
  };
}

function hasAiClassification(bookmark: BookmarkRecord): boolean {
  return Boolean(bookmark.aiTags.length > 0 || bookmark.aiCategory);
}

function findByTitle<T extends { title: string }>(
  items: T[],
  title: string,
): T | undefined {
  const normalized = title.trim().toLocaleLowerCase("zh-CN");
  return items.find(
    (item) => item.title.trim().toLocaleLowerCase("zh-CN") === normalized,
  );
}

function countAiManagedCategories(categories: BookmarkCategory[]): number {
  return categories.filter((category) => category.title !== UNCATEGORIZED_TITLE).length;
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-|-$/g, "") || "bookmarks"
  );
}
