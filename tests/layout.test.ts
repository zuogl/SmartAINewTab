import { describe, expect, it } from "vitest";
import {
  buildWorkspaceFromBookmarks,
  createCategory,
  createGroupFromBookmarkDrop,
  moveBookmarkInWorkspace,
  moveBookmarkRelativeInWorkspace,
  reconcileWorkspace,
} from "@/domain/layout";
import type { BookmarkRecord } from "@/domain/types";

function bookmark(
  id: string,
  title: string,
  folderPath: string[],
): BookmarkRecord {
  return {
    id,
    title,
    url: `https://${id}.example.com`,
    source: "chrome",
    folderPath,
    tags: [],
    aiTags: [],
  };
}

describe("reversible sidecar layout", () => {
  it("puts every Chrome bookmark in one unclassified category without mutating bookmarks", () => {
    const bookmarks = [
      bookmark("one", "One", ["书签栏", "工作"]),
      bookmark("two", "Two", ["其他书签"]),
    ];
    const before = structuredClone(bookmarks);
    const workspace = buildWorkspaceFromBookmarks(bookmarks);

    expect(workspace.categories.map((item) => item.title)).toEqual(["未分类"]);
    expect(workspace.categories[0]?.bookmarkIds).toEqual(["one", "two"]);
    expect(bookmarks).toEqual(before);
  });

  it("preserves user order and only appends newly discovered bookmarks", () => {
    const bookmarks = [
      bookmark("one", "One", ["工作"]),
      bookmark("two", "Two", ["工作"]),
      bookmark("three", "Three", ["工作"]),
    ];
    const workspace = buildWorkspaceFromBookmarks(bookmarks.slice(0, 2));
    workspace.categories[0]!.bookmarkIds = ["two", "one"];

    const reconciled = reconcileWorkspace(workspace, bookmarks);

    expect(reconciled.categories[0]!.bookmarkIds).toEqual([
      "two",
      "one",
      "three",
    ]);
  });

  it("moves a bookmark across categories and groups exactly once", () => {
    const workspace = buildWorkspaceFromBookmarks([
      bookmark("one", "One", ["书签栏"]),
      bookmark("two", "Two", ["书签栏"]),
    ]);
    const target = createCategory(
      "开发",
      workspace.categories.map((category) => category.icon),
    );
    const targetGroup = {
      id: "group-development",
      title: "开发工具",
      collapsed: false,
      bookmarkIds: [] as string[],
    };
    target.groups.push(targetGroup);
    workspace.categories.push(target);

    expect(
      moveBookmarkInWorkspace(
        workspace,
        "one",
        target.id,
        targetGroup.id,
      ),
    ).toBe(true);
    expect(workspace.categories[0]?.bookmarkIds).toEqual(["two"]);
    expect(targetGroup.bookmarkIds).toEqual(["one"]);
    expect(workspace.activeCategoryId).toBe(target.id);
  });

  it("moves a grouped bookmark back to the large-category root", () => {
    const workspace = buildWorkspaceFromBookmarks([
      bookmark("one", "One", ["书签栏"]),
      bookmark("two", "Two", ["书签栏"]),
    ]);
    const category = workspace.categories[0]!;
    const group = {
      id: "group-tools",
      title: "工具",
      collapsed: false,
      bookmarkIds: [] as string[],
    };
    category.groups.push(group);
    moveBookmarkInWorkspace(workspace, "one", category.id, group.id);

    expect(moveBookmarkInWorkspace(workspace, "one", category.id)).toBe(true);
    expect(group.bookmarkIds).toEqual([]);
    expect(category.bookmarkIds).toEqual(["two", "one"]);
  });

  it("reorders loose bookmarks without creating a group", () => {
    const workspace = buildWorkspaceFromBookmarks([
      bookmark("one", "One", ["书签栏"]),
      bookmark("two", "Two", ["书签栏"]),
      bookmark("three", "Three", ["书签栏"]),
    ]);
    const category = workspace.categories[0]!;

    expect(
      moveBookmarkRelativeInWorkspace(
        workspace,
        "three",
        "one",
        category.id,
        undefined,
        "before",
      ),
    ).toBe(true);
    expect(category.bookmarkIds).toEqual(["three", "one", "two"]);
    expect(category.groups).toEqual([]);
  });

  it("moves and inserts a bookmark at an exact position across categories", () => {
    const workspace = buildWorkspaceFromBookmarks([
      bookmark("one", "One", ["书签栏"]),
      bookmark("two", "Two", ["书签栏"]),
      bookmark("three", "Three", ["书签栏"]),
      bookmark("four", "Four", ["书签栏"]),
      bookmark("five", "Five", ["书签栏"]),
    ]);
    const source = workspace.categories[0]!;
    const target = createCategory("开发");
    workspace.categories.push(target);
    moveBookmarkInWorkspace(workspace, "four", target.id);
    moveBookmarkInWorkspace(workspace, "five", target.id);

    expect(
      moveBookmarkRelativeInWorkspace(
        workspace,
        "two",
        "five",
        target.id,
        undefined,
        "before",
      ),
    ).toBe(true);
    expect(source.bookmarkIds).toEqual(["one", "three"]);
    expect(target.bookmarkIds).toEqual(["four", "two", "five"]);
    expect(workspace.activeCategoryId).toBe(target.id);
  });

  it("reorders bookmarks inside an existing group instead of nesting groups", () => {
    const workspace = buildWorkspaceFromBookmarks([
      bookmark("one", "One", ["书签栏"]),
      bookmark("two", "Two", ["书签栏"]),
      bookmark("three", "Three", ["书签栏"]),
    ]);
    const category = workspace.categories[0]!;
    const group = {
      id: "group-tools",
      title: "工具",
      collapsed: false,
      bookmarkIds: [] as string[],
    };
    category.groups.push(group);
    for (const id of ["one", "two", "three"]) {
      moveBookmarkInWorkspace(workspace, id, category.id, group.id);
    }

    expect(
      moveBookmarkRelativeInWorkspace(
        workspace,
        "three",
        "one",
        category.id,
        group.id,
        "before",
      ),
    ).toBe(true);
    expect(group.bookmarkIds).toEqual(["three", "one", "two"]);
    expect(category.groups).toHaveLength(1);
  });

  it("creates a uniquely named group when one bookmark is dropped on another", () => {
    const workspace = buildWorkspaceFromBookmarks([
      bookmark("one", "One", ["书签栏"]),
      bookmark("two", "Two", ["书签栏"]),
      bookmark("three", "Three", ["书签栏"]),
    ]);
    const category = workspace.categories[0]!;
    category.groups.push({
      id: "existing-group",
      title: "新分组",
      collapsed: false,
      bookmarkIds: [],
    });

    const created = createGroupFromBookmarkDrop(
      workspace,
      "one",
      "two",
      category.id,
    );

    expect(created?.title).toBe("新分组 2");
    expect(created?.bookmarkIds).toEqual(["two", "one"]);
    expect(category.bookmarkIds).toEqual(["three"]);
  });
});
