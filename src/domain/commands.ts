import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createCategory,
  createGroup,
  getCategoryBookmarkIds,
  lockBookmarkPlacement,
  moveBookmarkInWorkspace,
  syncWorkspaceRootOrders,
  UNCATEGORIZED_CATEGORY_ID,
} from "./layout";
import type {
  BookmarkCategory,
  BookmarkGroup,
  BookmarkRecord,
  WorkspaceLayout,
} from "./types";

const MAX_COMMAND_CATEGORIES = 20;
const MAX_COMMAND_GROUPS_PER_CATEGORY = 5;

const labelSchema = z.string().trim().min(1).max(40);
const summarySchema = z.string().trim().min(1).max(160);
const nullableLabelSchema = labelSchema.nullable();

export const bookmarkCommandSpecSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("moveSemanticBookmarks"),
      summary: summarySchema,
      query: labelSchema.max(120),
      targetCategory: labelSchema,
      targetGroup: nullableLabelSchema,
      createCategory: z.boolean(),
      createGroup: z.boolean(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("moveCategoryBookmarks"),
      summary: summarySchema,
      sourceCategory: labelSchema,
      targetCategory: labelSchema,
      targetGroup: nullableLabelSchema,
      createCategory: z.boolean(),
      createGroup: z.boolean(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("moveGroupBookmarks"),
      summary: summarySchema,
      sourceCategory: labelSchema,
      sourceGroup: labelSchema,
      targetCategory: labelSchema,
      targetGroup: nullableLabelSchema,
      createCategory: z.boolean(),
      createGroup: z.boolean(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("dissolveOversizedGroups"),
      summary: summarySchema,
      threshold: z.number().int().min(1).max(100_000),
      category: nullableLabelSchema,
      deleteEmptyGroups: z.boolean(),
      createGroup: z.literal(false),
    })
    .strict(),
  z
    .object({
      operation: z.literal("trimOversizedGroups"),
      summary: summarySchema,
      limit: z.number().int().min(1).max(100_000),
      category: nullableLabelSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("mergeGroups"),
      summary: summarySchema,
      sourceCategory: labelSchema,
      sourceGroup: labelSchema,
      targetCategory: labelSchema,
      targetGroup: labelSchema,
      createTargetGroup: z.boolean(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("renameCategory"),
      summary: summarySchema,
      sourceCategory: labelSchema,
      newName: labelSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("renameGroup"),
      summary: summarySchema,
      category: labelSchema,
      sourceGroup: labelSchema,
      newName: labelSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("deleteEmptyGroups"),
      summary: summarySchema,
      category: nullableLabelSchema,
    })
    .strict(),
  z.object({ operation: z.literal("showStatistics"), summary: summarySchema }).strict(),
  z.object({ operation: z.literal("showHelp"), summary: summarySchema }).strict(),
  z.object({ operation: z.literal("undoLastCommand"), summary: summarySchema }).strict(),
  z.object({ operation: z.literal("redoLastCommand"), summary: summarySchema }).strict(),
]);

export type BookmarkCommandSpec = z.infer<typeof bookmarkCommandSpecSchema>;

export interface SemanticBookmarkMatch {
  id: string;
  reason: string;
}

export interface CommandBookmarkCandidate {
  id: string;
  title: string;
  url: string;
  reason: string;
  fromCategoryId: string;
  fromCategory: string;
  fromGroupId?: string;
  fromGroup?: string;
}

export interface CommandGroupImpact {
  categoryId: string;
  category: string;
  groupId: string;
  group: string;
  bookmarkCount: number;
  action: string;
}

export interface BookmarkCommandPlan {
  id: string;
  input: string;
  spec: BookmarkCommandSpec;
  title: string;
  description: string;
  warnings: string[];
  candidates: CommandBookmarkCandidate[];
  groupImpacts: CommandGroupImpact[];
  statistics: Array<{ label: string; value: string }>;
  selectionMode: "bookmarks" | "fixed" | "none";
  isMutation: boolean;
  canExecute: boolean;
}

export interface CommandExecutionResult {
  workspace: WorkspaceLayout;
  changedBookmarkIds: string[];
  message: string;
}

export const BOOKMARK_COMMAND_EXAMPLES = [
  "/整理一下，把所有出海相关的书签移动到出海大分类，不创建小分组",
  "/把书签数量超过 5 个的小分组全部解散，书签留在原大分类",
  "/每个小分组最多保留 5 个书签，多余的移到所属大分类",
  "/把开发分类里的 Vue 分组合并到前端框架分组",
  "/删除所有空的小分组",
  "/统计当前分类和分组情况",
  "/撤销刚才的整理",
];

export const BOOKMARK_COMMAND_EXAMPLES_EN = [
  "/Move all overseas-business bookmarks to the Overseas category without creating groups",
  "/Dissolve every group with more than 5 bookmarks and keep them in their category",
  "/Keep at most 5 bookmarks in each group and move the rest to the category",
  "/Merge the Vue group in Development into the Frontend Frameworks group",
  "/Delete all empty groups",
  "/stats",
  "/undo",
];

export const BOOKMARK_COMMAND_EXAMPLES_ZH_TW = [
  "/將所有出海業務相關書籤移到「出海」分類，不建立分組",
  "/解散所有超過 5 個書籤的分組，書籤保留在原分類",
  "/每個分組最多保留 5 個書籤，其餘移到所屬分類",
  "/將「開發」分類中的 Vue 分組合併到「前端框架」分組",
  "/刪除所有空白分組",
  "/stats",
  "/undo",
];

export const BOOKMARK_COMMAND_EXAMPLES_JA = [
  "/海外ビジネス関連のブックマークをすべて「海外」カテゴリーへ移動し、グループは作成しない",
  "/ブックマークが 5 件を超えるグループをすべて解除し、元のカテゴリーに残す",
  "/各グループは最大 5 件まで残し、それ以外をカテゴリーへ移動する",
  "/「開発」カテゴリーの Vue グループを「フロントエンドフレームワーク」グループへ統合する",
  "/空のグループをすべて削除する",
  "/stats",
  "/undo",
];

export const BOOKMARK_COMMAND_EXAMPLES_KO = [
  "/해외 비즈니스 관련 북마크를 모두 해외 카테고리로 이동하고 그룹은 만들지 않기",
  "/북마크가 5개를 초과하는 모든 그룹을 해제하고 원래 카테고리에 유지하기",
  "/각 그룹에는 최대 5개만 남기고 나머지는 해당 카테고리로 이동하기",
  "/개발 카테고리의 Vue 그룹을 프런트엔드 프레임워크 그룹에 병합하기",
  "/빈 그룹 모두 삭제하기",
  "/stats",
  "/undo",
];

export function buildBookmarkCommandPlan(
  input: string,
  spec: BookmarkCommandSpec,
  workspace: WorkspaceLayout,
  bookmarks: BookmarkRecord[],
  semanticMatches: SemanticBookmarkMatch[] = [],
): BookmarkCommandPlan {
  const placements = buildPlacementIndex(workspace);
  const bookmarkMap = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const hiddenIds = new Set(workspace.hiddenBookmarkIds);
  const warnings: string[] = [];
  const candidates: CommandBookmarkCandidate[] = [];
  const groupImpacts: CommandGroupImpact[] = [];
  let title = commandOperationTitle(spec.operation);
  let description = spec.summary;
  let selectionMode: BookmarkCommandPlan["selectionMode"] = "fixed";
  let isMutation = true;
  let canExecute = true;
  let statistics: BookmarkCommandPlan["statistics"] = [];

  const addCandidate = (bookmarkId: string, reason: string) => {
    if (hiddenIds.has(bookmarkId)) return;
    const bookmark = bookmarkMap.get(bookmarkId);
    const placement = placements.get(bookmarkId);
    if (!bookmark || !placement) return;
    if (candidates.some((candidate) => candidate.id === bookmarkId)) return;
    candidates.push({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      reason,
      fromCategoryId: placement.categoryId,
      fromCategory: placement.category,
      fromGroupId: placement.groupId,
      fromGroup: placement.group,
    });
  };

  switch (spec.operation) {
    case "moveSemanticBookmarks": {
      selectionMode = "bookmarks";
      const target = findCategoryByTitle(workspace, spec.targetCategory);
      validateDestination(workspace, target, spec.targetGroup, spec.createCategory, spec.createGroup);
      if (!target) warnings.push(`将新建大分类“${spec.targetCategory}”`);
      if (spec.targetGroup && !findGroupByTitle(target, spec.targetGroup)) {
        warnings.push(`将新建小分组“${spec.targetGroup}”`);
      }
      for (const match of semanticMatches) {
        const placement = placements.get(match.id);
        if (
          placement &&
          sameLabel(placement.category, spec.targetCategory) &&
          sameNullableLabel(placement.group, spec.targetGroup)
        ) {
          continue;
        }
        addCandidate(match.id, match.reason || `符合“${spec.query}”`);
      }
      description = `把与“${spec.query}”相关的书签移动到 ${destinationText(spec.targetCategory, spec.targetGroup)}`;
      canExecute = candidates.length > 0;
      if (!canExecute) warnings.push("没有找到需要移动的匹配书签");
      break;
    }
    case "moveCategoryBookmarks": {
      const source = requireCategory(workspace, spec.sourceCategory);
      const target = findCategoryByTitle(workspace, spec.targetCategory);
      validateDestination(workspace, target, spec.targetGroup, spec.createCategory, spec.createGroup);
      if (!target) warnings.push(`将新建大分类“${spec.targetCategory}”`);
      for (const bookmarkId of getCategoryBookmarkIds(source)) {
        addCandidate(bookmarkId, `当前位于大分类“${source.title}”`);
      }
      description = `把“${source.title}”中的全部书签移动到 ${destinationText(spec.targetCategory, spec.targetGroup)}`;
      canExecute = candidates.length > 0;
      break;
    }
    case "moveGroupBookmarks": {
      const sourceCategory = requireCategory(workspace, spec.sourceCategory);
      const sourceGroup = requireGroup(sourceCategory, spec.sourceGroup);
      const target = findCategoryByTitle(workspace, spec.targetCategory);
      validateDestination(workspace, target, spec.targetGroup, spec.createCategory, spec.createGroup);
      if (
        target?.id === sourceCategory.id &&
        spec.targetGroup &&
        sameLabel(spec.targetGroup, sourceGroup.title)
      ) {
        throw new Error("来源和目标是同一个小分组");
      }
      for (const bookmarkId of sourceGroup.bookmarkIds) {
        addCandidate(bookmarkId, `当前位于“${sourceCategory.title} / ${sourceGroup.title}”`);
      }
      description = `把“${sourceCategory.title} / ${sourceGroup.title}”中的全部书签移动到 ${destinationText(spec.targetCategory, spec.targetGroup)}`;
      canExecute = candidates.length > 0;
      break;
    }
    case "dissolveOversizedGroups": {
      const categories = scopedCategories(workspace, spec.category);
      for (const category of categories) {
        for (const group of category.groups) {
          if (group.bookmarkIds.length <= spec.threshold) continue;
          groupImpacts.push(groupImpact(category, group, "整组移出并解散"));
          for (const bookmarkId of group.bookmarkIds) {
            addCandidate(bookmarkId, `“${group.title}”包含 ${group.bookmarkIds.length} 个书签`);
          }
        }
      }
      description = `把书签数量大于 ${spec.threshold} 的小分组整组移到所属大分类，并${spec.deleteEmptyGroups ? "删除空分组" : "保留空分组"}`;
      canExecute = groupImpacts.length > 0;
      if (!canExecute) warnings.push(`没有书签数量大于 ${spec.threshold} 的小分组`);
      break;
    }
    case "trimOversizedGroups": {
      const categories = scopedCategories(workspace, spec.category);
      for (const category of categories) {
        for (const group of category.groups) {
          if (group.bookmarkIds.length <= spec.limit) continue;
          groupImpacts.push(groupImpact(category, group, `保留前 ${spec.limit} 个，移出其余书签`));
          for (const bookmarkId of group.bookmarkIds.slice(spec.limit)) {
            addCandidate(bookmarkId, `超过“${group.title}”的 ${spec.limit} 个上限`);
          }
        }
      }
      description = `每个小分组最多保留 ${spec.limit} 个书签，其余移到所属大分类`;
      canExecute = candidates.length > 0;
      if (!canExecute) warnings.push(`没有超过 ${spec.limit} 个书签的小分组`);
      break;
    }
    case "mergeGroups": {
      const sourceCategory = requireCategory(workspace, spec.sourceCategory);
      const sourceGroup = requireGroup(sourceCategory, spec.sourceGroup);
      const targetCategory = requireCategory(workspace, spec.targetCategory);
      const targetGroup = findGroupByTitle(targetCategory, spec.targetGroup);
      if (!targetGroup && !spec.createTargetGroup) {
        throw new Error(`目标小分组“${spec.targetGroup}”不存在，且命令未允许创建`);
      }
      if (
        !targetGroup &&
        spec.createTargetGroup &&
        targetCategory.groups.length >= MAX_COMMAND_GROUPS_PER_CATEGORY
      ) {
        throw new Error(
          `大分类“${targetCategory.title}”最多保留 ${MAX_COMMAND_GROUPS_PER_CATEGORY} 个小分组`,
        );
      }
      if (sourceCategory.id === targetCategory.id && targetGroup?.id === sourceGroup.id) {
        throw new Error("来源和目标是同一个小分组");
      }
      if (!targetGroup) warnings.push(`将新建小分组“${spec.targetGroup}”`);
      groupImpacts.push(groupImpact(sourceCategory, sourceGroup, `合并到“${targetCategory.title} / ${spec.targetGroup}”`));
      for (const bookmarkId of sourceGroup.bookmarkIds) {
        addCandidate(bookmarkId, `来自待合并分组“${sourceGroup.title}”`);
      }
      description = `把“${sourceCategory.title} / ${sourceGroup.title}”合并到“${targetCategory.title} / ${spec.targetGroup}”`;
      canExecute = candidates.length > 0;
      break;
    }
    case "renameCategory": {
      const source = requireCategory(workspace, spec.sourceCategory);
      if (source.id === UNCATEGORIZED_CATEGORY_ID) throw new Error("不能重命名系统大分类“未分类”");
      const conflict = findCategoryByTitle(workspace, spec.newName);
      if (conflict && conflict.id !== source.id) throw new Error(`大分类“${spec.newName}”已经存在`);
      description = `把大分类“${source.title}”重命名为“${spec.newName}”`;
      canExecute = !sameLabel(source.title, spec.newName);
      break;
    }
    case "renameGroup": {
      const category = requireCategory(workspace, spec.category);
      const source = requireGroup(category, spec.sourceGroup);
      const conflict = findGroupByTitle(category, spec.newName);
      if (conflict && conflict.id !== source.id) throw new Error(`小分组“${spec.newName}”已经存在`);
      description = `把“${category.title} / ${source.title}”重命名为“${spec.newName}”`;
      canExecute = !sameLabel(source.title, spec.newName);
      break;
    }
    case "deleteEmptyGroups": {
      const categories = scopedCategories(workspace, spec.category);
      for (const category of categories) {
        for (const group of category.groups) {
          if (group.bookmarkIds.length === 0) {
            groupImpacts.push(groupImpact(category, group, "删除空分组"));
          }
        }
      }
      description = spec.category
        ? `删除大分类“${spec.category}”中的空分组`
        : "删除全部大分类中的空分组";
      canExecute = groupImpacts.length > 0;
      if (!canExecute) warnings.push("当前没有空的小分组");
      break;
    }
    case "showStatistics": {
      isMutation = false;
      selectionMode = "none";
      statistics = workspaceStatistics(workspace);
      title = "当前书签结构统计";
      description = "查看当前大分类、小分组和书签分布，不修改任何内容";
      break;
    }
    case "showHelp": {
      isMutation = false;
      selectionMode = "none";
      title = "自然语言命令帮助";
      description = "以下示例可以直接输入搜索框；AI 会先生成计划，确认后才执行";
      break;
    }
    case "undoLastCommand":
      selectionMode = "none";
      title = "撤销上一次命令";
      description = "恢复到上一次命令执行前的完整布局";
      break;
    case "redoLastCommand":
      selectionMode = "none";
      title = "重做上一次命令";
      description = "重新应用最近一次被撤销的布局变更";
      break;
  }

  return {
    id: `command-plan-${nanoid(10)}`,
    input,
    spec,
    title,
    description,
    warnings,
    candidates,
    groupImpacts,
    statistics,
    selectionMode,
    isMutation,
    canExecute,
  };
}

export function executeBookmarkCommandPlan(
  plan: BookmarkCommandPlan,
  workspace: WorkspaceLayout,
  selectedBookmarkIds: string[] = plan.candidates.map((candidate) => candidate.id),
): CommandExecutionResult {
  const next = structuredClone(workspace);
  if (!plan.isMutation) {
    return {
      workspace: next,
      changedBookmarkIds: [],
      message: "命令已完成",
    };
  }
  const selected = new Set(selectedBookmarkIds);
  const changedBookmarkIds: string[] = [];
  const moveAndLock = (bookmarkId: string, categoryId: string, groupId?: string) => {
    if (!selected.has(bookmarkId)) return;
    if (moveBookmarkInWorkspace(next, bookmarkId, categoryId, groupId)) {
      lockBookmarkPlacement(next, bookmarkId, "command");
      changedBookmarkIds.push(bookmarkId);
    }
  };

  switch (plan.spec.operation) {
    case "moveSemanticBookmarks":
    case "moveCategoryBookmarks":
    case "moveGroupBookmarks": {
      const spec = plan.spec;
      const targetCategory = ensureTargetCategory(
        next,
        spec.targetCategory,
        spec.createCategory,
      );
      const targetGroup = spec.targetGroup
        ? ensureTargetGroup(targetCategory, spec.targetGroup, spec.createGroup)
        : undefined;
      for (const candidate of plan.candidates) {
        moveAndLock(candidate.id, targetCategory.id, targetGroup?.id);
      }
      break;
    }
    case "dissolveOversizedGroups":
    case "trimOversizedGroups": {
      for (const candidate of plan.candidates) {
        moveAndLock(candidate.id, candidate.fromCategoryId);
      }
      if (plan.spec.operation === "dissolveOversizedGroups" && plan.spec.deleteEmptyGroups) {
        const impactedIds = new Set(plan.groupImpacts.map((impact) => impact.groupId));
        for (const category of next.categories) {
          category.groups = category.groups.filter(
            (group) => !impactedIds.has(group.id) || group.bookmarkIds.length > 0,
          );
        }
      }
      break;
    }
    case "mergeGroups": {
      const sourceCategory = requireCategory(next, plan.spec.sourceCategory);
      const sourceGroup = requireGroup(sourceCategory, plan.spec.sourceGroup);
      const targetCategory = requireCategory(next, plan.spec.targetCategory);
      const targetGroup = ensureTargetGroup(
        targetCategory,
        plan.spec.targetGroup,
        plan.spec.createTargetGroup,
      );
      for (const candidate of plan.candidates) {
        moveAndLock(candidate.id, targetCategory.id, targetGroup.id);
      }
      sourceCategory.groups = sourceCategory.groups.filter(
        (group) => group.id !== sourceGroup.id || group.bookmarkIds.length > 0,
      );
      break;
    }
    case "renameCategory": {
      requireCategory(next, plan.spec.sourceCategory).title = plan.spec.newName;
      break;
    }
    case "renameGroup": {
      const category = requireCategory(next, plan.spec.category);
      requireGroup(category, plan.spec.sourceGroup).title = plan.spec.newName;
      break;
    }
    case "deleteEmptyGroups": {
      const categoryIds = new Set(plan.groupImpacts.map((impact) => impact.categoryId));
      const groupIds = new Set(plan.groupImpacts.map((impact) => impact.groupId));
      for (const category of next.categories) {
        if (!categoryIds.has(category.id)) continue;
        category.groups = category.groups.filter((group) => !groupIds.has(group.id));
      }
      break;
    }
    case "showStatistics":
    case "showHelp":
    case "undoLastCommand":
    case "redoLastCommand":
      break;
  }

  syncWorkspaceRootOrders(next);
  next.updatedAt = Date.now();
  return {
    workspace: next,
    changedBookmarkIds,
    message: commandResultMessage(plan, changedBookmarkIds.length),
  };
}

export function commandOperationTitle(operation: BookmarkCommandSpec["operation"]): string {
  const titles: Record<BookmarkCommandSpec["operation"], string> = {
    moveSemanticBookmarks: "按语义移动书签",
    moveCategoryBookmarks: "移动大分类书签",
    moveGroupBookmarks: "移动小分组书签",
    dissolveOversizedGroups: "解散超限小分组",
    trimOversizedGroups: "移出小分组超额书签",
    mergeGroups: "合并小分组",
    renameCategory: "重命名大分类",
    renameGroup: "重命名小分组",
    deleteEmptyGroups: "删除空小分组",
    showStatistics: "查看结构统计",
    showHelp: "查看命令帮助",
    undoLastCommand: "撤销命令",
    redoLastCommand: "重做命令",
  };
  return titles[operation];
}

function buildPlacementIndex(workspace: WorkspaceLayout) {
  const placements = new Map<
    string,
    { categoryId: string; category: string; groupId?: string; group?: string }
  >();
  for (const category of workspace.categories) {
    for (const bookmarkId of category.bookmarkIds ?? []) {
      placements.set(bookmarkId, { categoryId: category.id, category: category.title });
    }
    for (const group of category.groups) {
      for (const bookmarkId of group.bookmarkIds) {
        placements.set(bookmarkId, {
          categoryId: category.id,
          category: category.title,
          groupId: group.id,
          group: group.title,
        });
      }
    }
  }
  return placements;
}

function findCategoryByTitle(workspace: WorkspaceLayout, title: string) {
  return workspace.categories.find((category) => sameLabel(category.title, title));
}

function requireCategory(workspace: WorkspaceLayout, title: string): BookmarkCategory {
  const category = findCategoryByTitle(workspace, title);
  if (!category) throw new Error(`找不到大分类“${title}”`);
  return category;
}

function findGroupByTitle(category: BookmarkCategory | undefined, title: string) {
  return category?.groups.find((group) => sameLabel(group.title, title));
}

function requireGroup(category: BookmarkCategory, title: string): BookmarkGroup {
  const group = findGroupByTitle(category, title);
  if (!group) throw new Error(`在大分类“${category.title}”中找不到小分组“${title}”`);
  return group;
}

function validateDestination(
  workspace: WorkspaceLayout,
  category: BookmarkCategory | undefined,
  groupTitle: string | null,
  createCategory: boolean,
  createGroup: boolean,
) {
  if (!category && !createCategory) throw new Error("目标大分类不存在，且命令未允许创建");
  if (!category && createCategory && workspace.categories.length >= MAX_COMMAND_CATEGORIES) {
    throw new Error(`最多保留 ${MAX_COMMAND_CATEGORIES} 个大分类，无法创建目标分类`);
  }
  if (groupTitle && category && !findGroupByTitle(category, groupTitle) && !createGroup) {
    throw new Error(`目标小分组“${groupTitle}”不存在，且命令未允许创建`);
  }
  if (groupTitle && !category && !createGroup) {
    throw new Error(`目标小分组“${groupTitle}”不存在，且命令未允许创建`);
  }
  if (
    groupTitle &&
    category &&
    !findGroupByTitle(category, groupTitle) &&
    createGroup &&
    category.groups.length >= MAX_COMMAND_GROUPS_PER_CATEGORY
  ) {
    throw new Error(
      `大分类“${category.title}”最多保留 ${MAX_COMMAND_GROUPS_PER_CATEGORY} 个小分组`,
    );
  }
}

function ensureTargetCategory(
  workspace: WorkspaceLayout,
  title: string,
  allowCreate: boolean,
): BookmarkCategory {
  const existing = findCategoryByTitle(workspace, title);
  if (existing) return existing;
  if (!allowCreate) throw new Error(`目标大分类“${title}”不存在`);
  if (workspace.categories.length >= MAX_COMMAND_CATEGORIES) {
    throw new Error(`最多保留 ${MAX_COMMAND_CATEGORIES} 个大分类，无法创建“${title}”`);
  }
  const category = createCategory(title, workspace.categories.map((item) => item.icon));
  workspace.categories.push(category);
  return category;
}

function ensureTargetGroup(
  category: BookmarkCategory,
  title: string,
  allowCreate: boolean,
): BookmarkGroup {
  const existing = findGroupByTitle(category, title);
  if (existing) return existing;
  if (!allowCreate) throw new Error(`目标小分组“${title}”不存在`);
  if (category.groups.length >= MAX_COMMAND_GROUPS_PER_CATEGORY) {
    throw new Error(
      `大分类“${category.title}”最多保留 ${MAX_COMMAND_GROUPS_PER_CATEGORY} 个小分组`,
    );
  }
  const group = createGroup(title);
  category.groups.push(group);
  return group;
}

function scopedCategories(workspace: WorkspaceLayout, category: string | null) {
  return category ? [requireCategory(workspace, category)] : workspace.categories;
}

function groupImpact(
  category: BookmarkCategory,
  group: BookmarkGroup,
  action: string,
): CommandGroupImpact {
  return {
    categoryId: category.id,
    category: category.title,
    groupId: group.id,
    group: group.title,
    bookmarkCount: group.bookmarkIds.length,
    action,
  };
}

function workspaceStatistics(workspace: WorkspaceLayout) {
  const groupCount = workspace.categories.reduce(
    (total, category) => total + category.groups.length,
    0,
  );
  const groupedCount = workspace.categories.reduce(
    (total, category) =>
      total + category.groups.reduce((sum, group) => sum + group.bookmarkIds.length, 0),
    0,
  );
  const looseCount = workspace.categories.reduce(
    (total, category) => total + (category.bookmarkIds ?? []).length,
    0,
  );
  const emptyGroups = workspace.categories.reduce(
    (total, category) => total + category.groups.filter((group) => group.bookmarkIds.length === 0).length,
    0,
  );
  const oversizedGroups = workspace.categories.reduce(
    (total, category) => total + category.groups.filter((group) => group.bookmarkIds.length > 5).length,
    0,
  );
  return [
    { label: "大分类", value: String(workspace.categories.length) },
    { label: "小分组", value: String(groupCount) },
    { label: "书签总数", value: String(groupedCount + looseCount) },
    { label: "分组内书签", value: String(groupedCount) },
    { label: "未放入分组", value: String(looseCount) },
    { label: "空小分组", value: String(emptyGroups) },
    { label: "超过 5 个书签的小分组", value: String(oversizedGroups) },
  ];
}

function destinationText(category: string, group: string | null) {
  return group ? `“${category} / ${group}”` : `大分类“${category}”的未分组区域`;
}

function sameLabel(left: string, right: string) {
  return left.trim().toLocaleLowerCase("zh-CN") === right.trim().toLocaleLowerCase("zh-CN");
}

function sameNullableLabel(left: string | undefined, right: string | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return sameLabel(left, right);
}

function commandResultMessage(plan: BookmarkCommandPlan, changedCount: number) {
  switch (plan.spec.operation) {
    case "renameCategory":
    case "renameGroup":
      return "重命名已完成";
    case "deleteEmptyGroups":
      return `已删除 ${plan.groupImpacts.length} 个空小分组`;
    case "dissolveOversizedGroups":
      return `已移出 ${changedCount} 个书签并处理 ${plan.groupImpacts.length} 个小分组`;
    case "trimOversizedGroups":
      return `已从 ${plan.groupImpacts.length} 个小分组移出 ${changedCount} 个超额书签`;
    case "mergeGroups":
      return `已合并小分组并移动 ${changedCount} 个书签`;
    default:
      return changedCount > 0 ? `已移动 ${changedCount} 个书签` : "命令已执行";
  }
}
