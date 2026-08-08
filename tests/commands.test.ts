import { describe, expect, it } from "vitest";
import {
  bookmarkCommandSpecSchema,
  buildBookmarkCommandPlan,
  executeBookmarkCommandPlan,
} from "@/domain/commands";
import {
  buildWorkspaceFromBookmarks,
  createCategory,
  createGroup,
  moveBookmarkInWorkspace,
} from "@/domain/layout";
import type { BookmarkRecord, WorkspaceLayout } from "@/domain/types";

const bookmarks: BookmarkRecord[] = Array.from({ length: 9 }, (_, index) => ({
  id: `bookmark-${index + 1}`,
  title: `Bookmark ${index + 1}`,
  url: `https://example-${index + 1}.com`,
  source: "preview",
  folderPath: [],
  tags: [],
  aiTags: index === 8 ? ["出海", "跨境业务"] : [],
}));

function commandWorkspace(): WorkspaceLayout {
  const workspace = buildWorkspaceFromBookmarks(bookmarks);
  const overseas = createCategory("出海", workspace.categories.map((item) => item.icon));
  const development = createCategory(
    "开发",
    [...workspace.categories, overseas].map((item) => item.icon),
  );
  const knowledge = createGroup("出海知识");
  const vue = createGroup("Vue");
  const frontend = createGroup("前端框架");
  overseas.groups.push(knowledge);
  development.groups.push(vue, frontend, createGroup("空分组"));
  workspace.categories.push(overseas, development);
  for (const bookmark of bookmarks.slice(0, 6)) {
    moveBookmarkInWorkspace(workspace, bookmark.id, overseas.id, knowledge.id);
  }
  moveBookmarkInWorkspace(workspace, "bookmark-7", development.id, vue.id);
  moveBookmarkInWorkspace(workspace, "bookmark-8", development.id, frontend.id);
  return workspace;
}

describe("natural-language bookmark command domain", () => {
  it("rejects operations outside the local allowlist", () => {
    expect(() =>
      bookmarkCommandSpecSchema.parse({
        operation: "deleteAllBookmarks",
        summary: "删除全部书签",
      }),
    ).toThrow();
  });

  it("builds a selectable semantic plan and locks confirmed placements", () => {
    const workspace = commandWorkspace();
    const plan = buildBookmarkCommandPlan(
      "/把出海相关书签放到出海分类",
      {
        operation: "moveSemanticBookmarks",
        summary: "移动出海相关书签",
        query: "出海相关",
        targetCategory: "出海",
        targetGroup: null,
        createCategory: false,
        createGroup: false,
      },
      workspace,
      bookmarks,
      [
        { id: "bookmark-8", reason: "标签涉及跨境业务" },
        { id: "bookmark-9", reason: "AI 标签包含出海" },
        { id: "invented-id", reason: "模型虚构" },
      ],
    );

    expect(plan.selectionMode).toBe("bookmarks");
    expect(plan.candidates.map((candidate) => candidate.id)).toEqual([
      "bookmark-8",
      "bookmark-9",
    ]);

    const result = executeBookmarkCommandPlan(plan, workspace, ["bookmark-9"]);
    const overseas = result.workspace.categories.find((item) => item.title === "出海")!;
    expect(overseas.bookmarkIds).toContain("bookmark-9");
    expect(overseas.bookmarkIds).not.toContain("bookmark-8");
    expect(result.workspace.placementOverrides?.["bookmark-9"]).toMatchObject({
      source: "command",
      locked: true,
    });
  });

  it("dissolves every group over the threshold without creating a group", () => {
    const workspace = commandWorkspace();
    const plan = buildBookmarkCommandPlan(
      "/解散超过5个书签的小分组",
      {
        operation: "dissolveOversizedGroups",
        summary: "解散超过五个书签的小分组",
        threshold: 5,
        category: null,
        deleteEmptyGroups: true,
        createGroup: false,
      },
      workspace,
      bookmarks,
    );

    expect(plan.groupImpacts).toHaveLength(1);
    expect(plan.candidates).toHaveLength(6);
    const result = executeBookmarkCommandPlan(plan, workspace);
    const overseas = result.workspace.categories.find((item) => item.title === "出海")!;
    expect(overseas.groups).toHaveLength(0);
    expect(overseas.bookmarkIds).toEqual(
      expect.arrayContaining(bookmarks.slice(0, 6).map((bookmark) => bookmark.id)),
    );
  });

  it("trims only the excess bookmarks when the user asks to keep a limit", () => {
    const workspace = commandWorkspace();
    const plan = buildBookmarkCommandPlan(
      "/每组只保留5个",
      {
        operation: "trimOversizedGroups",
        summary: "每组保留五个书签",
        limit: 5,
        category: null,
      },
      workspace,
      bookmarks,
    );
    expect(plan.candidates.map((candidate) => candidate.id)).toEqual(["bookmark-6"]);
    const result = executeBookmarkCommandPlan(plan, workspace);
    const overseas = result.workspace.categories.find((item) => item.title === "出海")!;
    expect(overseas.groups[0]?.bookmarkIds).toEqual(
      bookmarks.slice(0, 5).map((bookmark) => bookmark.id),
    );
    expect(overseas.bookmarkIds).toContain("bookmark-6");
  });

  it("merges, renames and removes empty groups deterministically", () => {
    let workspace = commandWorkspace();
    const merge = buildBookmarkCommandPlan(
      "/合并 Vue 到前端框架",
      {
        operation: "mergeGroups",
        summary: "合并开发分组",
        sourceCategory: "开发",
        sourceGroup: "Vue",
        targetCategory: "开发",
        targetGroup: "前端框架",
        createTargetGroup: false,
      },
      workspace,
      bookmarks,
    );
    workspace = executeBookmarkCommandPlan(merge, workspace).workspace;
    const development = workspace.categories.find((item) => item.title === "开发")!;
    expect(development.groups.find((group) => group.title === "Vue")).toBeUndefined();
    expect(
      development.groups.find((group) => group.title === "前端框架")?.bookmarkIds,
    ).toEqual(expect.arrayContaining(["bookmark-7", "bookmark-8"]));

    const rename = buildBookmarkCommandPlan(
      "/把开发改成技术",
      {
        operation: "renameCategory",
        summary: "重命名开发分类",
        sourceCategory: "开发",
        newName: "技术",
      },
      workspace,
      bookmarks,
    );
    workspace = executeBookmarkCommandPlan(rename, workspace).workspace;
    expect(workspace.categories.some((category) => category.title === "技术")).toBe(true);

    const removeEmpty = buildBookmarkCommandPlan(
      "/删除空分组",
      {
        operation: "deleteEmptyGroups",
        summary: "删除所有空分组",
        category: null,
      },
      workspace,
      bookmarks,
    );
    workspace = executeBookmarkCommandPlan(removeEmpty, workspace).workspace;
    expect(
      workspace.categories.flatMap((category) => category.groups).some(
        (group) => group.bookmarkIds.length === 0,
      ),
    ).toBe(false);
  });

  it("moves complete categories and groups to an existing destination", () => {
    let workspace = commandWorkspace();
    const moveGroup = buildBookmarkCommandPlan(
      "/把 Vue 分组移动到出海分类",
      {
        operation: "moveGroupBookmarks",
        summary: "移动 Vue 分组书签",
        sourceCategory: "开发",
        sourceGroup: "Vue",
        targetCategory: "出海",
        targetGroup: null,
        createCategory: false,
        createGroup: false,
      },
      workspace,
      bookmarks,
    );
    workspace = executeBookmarkCommandPlan(moveGroup, workspace).workspace;
    expect(
      workspace.categories.find((category) => category.title === "出海")?.bookmarkIds,
    ).toContain("bookmark-7");

    const moveCategory = buildBookmarkCommandPlan(
      "/把开发分类全部移动到出海分类",
      {
        operation: "moveCategoryBookmarks",
        summary: "移动开发分类书签",
        sourceCategory: "开发",
        targetCategory: "出海",
        targetGroup: null,
        createCategory: false,
        createGroup: false,
      },
      workspace,
      bookmarks,
    );
    workspace = executeBookmarkCommandPlan(moveCategory, workspace).workspace;
    expect(
      workspace.categories.find((category) => category.title === "出海")?.bookmarkIds,
    ).toEqual(expect.arrayContaining(["bookmark-7", "bookmark-8"]));
  });

  it("renames a group and refuses conflicts or protected category renames", () => {
    const workspace = commandWorkspace();
    const rename = buildBookmarkCommandPlan(
      "/把 Vue 分组改名为 Vue生态",
      {
        operation: "renameGroup",
        summary: "重命名 Vue 分组",
        category: "开发",
        sourceGroup: "Vue",
        newName: "Vue生态",
      },
      workspace,
      bookmarks,
    );
    const renamed = executeBookmarkCommandPlan(rename, workspace).workspace;
    expect(
      renamed.categories
        .find((category) => category.title === "开发")
        ?.groups.some((group) => group.title === "Vue生态"),
    ).toBe(true);

    expect(() =>
      buildBookmarkCommandPlan(
        "/把 Vue 改成前端框架",
        {
          operation: "renameGroup",
          summary: "制造重名冲突",
          category: "开发",
          sourceGroup: "Vue",
          newName: "前端框架",
        },
        workspace,
        bookmarks,
      ),
    ).toThrow("已经存在");
    expect(() =>
      buildBookmarkCommandPlan(
        "/重命名未分类",
        {
          operation: "renameCategory",
          summary: "重命名系统分类",
          sourceCategory: "未分类",
          newName: "其他",
        },
        workspace,
        bookmarks,
      ),
    ).toThrow("不能重命名");
  });

  it("builds local statistics without mutating the layout", () => {
    const workspace = commandWorkspace();
    const plan = buildBookmarkCommandPlan(
      "/统计",
      { operation: "showStatistics", summary: "查看当前统计" },
      workspace,
      bookmarks,
    );
    expect(plan.isMutation).toBe(false);
    expect(plan.statistics).toContainEqual({ label: "书签总数", value: "9" });
    expect(executeBookmarkCommandPlan(plan, workspace).workspace).toEqual(workspace);
  });
});
