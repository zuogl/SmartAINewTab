import { describe, expect, it } from "vitest";
import {
  buildWorkspaceFromBookmarks,
  getCategoryBookmarkIds,
} from "@/domain/layout";
import type { BookmarkRecord } from "@/domain/types";
import {
  buildAiOrganizedWorkspace,
  MAX_AI_CATEGORIES,
  MAX_AI_GROUPS_PER_CATEGORY,
  placeBookmarkInAiWorkspace,
} from "@/services/organization";

function bookmark(
  id: string,
  aiCategory: string,
  aiGroup?: string,
): BookmarkRecord {
  return {
    id,
    title: id,
    url: `https://${id}.example.com`,
    source: "chrome",
    folderPath: ["书签栏"],
    tags: [],
    aiTags: [],
    aiCategory,
    aiGroup,
  };
}

describe("bounded AI sidecar organization", () => {
  it("caps categories and groups while keeping every bookmark exactly once", () => {
    const categoryPlan = Array.from({ length: 25 }, (_, index) => `主题${index}`);
    const bookmarks = Array.from({ length: 100 }, (_, index) =>
      bookmark(
        `bookmark-${index}`,
        `主题${index % 25}`,
        `小组${index % 7}`,
      ),
    );
    const original = buildWorkspaceFromBookmarks(bookmarks);
    const organized = buildAiOrganizedWorkspace(original, bookmarks, categoryPlan);
    const placed = organized.categories.flatMap(getCategoryBookmarkIds);

    expect(
      organized.categories.filter((category) => category.title !== "未分类")
        .length,
    ).toBeLessThanOrEqual(MAX_AI_CATEGORIES);
    expect(
      organized.categories.every(
        (category) =>
          category.groups.length <= MAX_AI_GROUPS_PER_CATEGORY,
      ),
    ).toBe(true);
    expect(new Set(placed).size).toBe(bookmarks.length);
    expect(placed).toHaveLength(bookmarks.length);
    expect(organized.categories.some((category) => category.title === "其他")).toBe(
      true,
    );
    expect(new Set(organized.categories.map((category) => category.icon)).size)
      .toBeGreaterThan(11);
  });

  it("reuses matching structure and never exceeds the category limit", () => {
    const initial = Array.from({ length: 4 }, (_, index) =>
      bookmark(`seed-${index}`, "开发技术", "开发框架"),
    );
    let workspace = buildAiOrganizedWorkspace(
      buildWorkspaceFromBookmarks(initial),
      initial,
    );
    const existingCategory = workspace.categories[1]!;
    const existingGroup = existingCategory.groups[0]!;
    const matching = bookmark(
      "matching",
      existingCategory.title,
      existingGroup.title,
    );

    workspace = placeBookmarkInAiWorkspace(workspace, matching);
    expect(
      workspace.categories
        .find((category) => category.id === existingCategory.id)
        ?.groups.find((group) => group.id === existingGroup.id)?.bookmarkIds,
    ).toContain("matching");

    workspace = placeBookmarkInAiWorkspace(
      workspace,
      bookmark("overflow", "全新分类", "全新分组"),
    );
    expect(workspace.categories.length).toBeLessThanOrEqual(MAX_AI_CATEGORIES);
    expect(
      workspace.categories.find((category) => category.title === "其他")
        ?.bookmarkIds,
    ).toContain("overflow");
    expect(
      workspace.categories.some((category) =>
        category.groups.some((group) => group.bookmarkIds.includes("overflow")),
      ),
    ).toBe(false);
    expect(
      workspace.categories
        .find((category) => category.title === "开发技术")
        ?.groups.find((group) => group.title === "开发框架")?.bookmarkIds,
    ).toContain("matching");
  });

  it("keeps untagged URLs unclassified and moves a URL immediately after tagging", () => {
    const untagged = bookmark("untagged", "", "");
    const workspace = buildWorkspaceFromBookmarks([untagged]);
    const stillUnclassified = buildAiOrganizedWorkspace(workspace, [untagged]);

    expect(stillUnclassified.categories).toHaveLength(1);
    expect(stillUnclassified.categories[0]?.title).toBe("未分类");

    const tagged = {
      ...untagged,
      aiTags: ["代码", "工具"],
      aiCategory: "开发",
      aiGroup: "开发工具",
    };
    const moved = placeBookmarkInAiWorkspace(stillUnclassified, tagged);
    expect(moved.categories[0]?.bookmarkIds).toEqual([]);
    expect(
      moved.categories.find((category) => category.title === "开发技术")
        ?.bookmarkIds,
    ).toContain("untagged");
    expect(
      moved.categories.find((category) => category.title === "开发技术")?.groups,
    ).toEqual([]);
  });

  it("preserves command-locked placement during incremental and full AI organization", () => {
    const locked = bookmark("locked", "开发", "开发工具");
    const workspace = buildWorkspaceFromBookmarks([locked]);
    workspace.categories[0]!.title = "出海";
    workspace.categories[0]!.id = "category-overseas";
    workspace.placementOverrides = {
      locked: {
        source: "command",
        locked: true,
        updatedAt: 1,
      },
    };

    const incremental = placeBookmarkInAiWorkspace(workspace, {
      ...locked,
      aiTags: ["代码"],
    });
    expect(incremental.categories[0]?.title).toBe("出海");
    expect(incremental.categories[0]?.bookmarkIds).toContain("locked");

    const rebuilt = buildAiOrganizedWorkspace(workspace, [
      { ...locked, aiTags: ["代码"] },
    ]);
    expect(
      rebuilt.categories.find((category) => category.title === "出海")?.bookmarkIds,
    ).toContain("locked");
    expect(
      rebuilt.categories.some((category) =>
        category.groups.some((group) => group.bookmarkIds.includes("locked")),
      ),
    ).toBe(false);
  });
});
