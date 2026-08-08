import { describe, expect, it, vi } from "vitest";
import type { BookmarkRecord, WorkspaceLayout } from "@/domain/types";
import {
  assignBookmarkToExistingGroup,
  organizeGroupsGlobally,
} from "@/services/grouping";

function bookmark(id: string, category = "开发技术"): BookmarkRecord {
  return {
    id,
    title: `Bookmark ${id}`,
    url: `https://${id}.example.com`,
    source: "chrome",
    folderPath: ["Bookmarks Bar", "用户目录"],
    tags: [],
    aiTags: ["代码", "工具"],
    summary: "开发资料",
    aiCategory: category,
  };
}

describe("sparse global grouping", () => {
  it("allows every bookmark to remain directly in its first-level category", async () => {
    const bookmarks = [bookmark("a"), bookmark("b"), bookmark("c")];
    const requester = vi.fn(async (messages: Array<{ content: string }>) => {
      const input = JSON.parse(messages[1]!.content) as {
        category: string;
        bookmarks: Array<{ folderPath: string[] }>;
      };
      expect(input.category).toBe("开发技术");
      expect(input.bookmarks[0]?.folderPath).toEqual(["用户目录"]);
      return JSON.stringify({ groups: [] });
    });

    await expect(organizeGroupsGlobally(bookmarks, requester)).resolves.toEqual({
      assignments: [
        { bookmarkId: "a" },
        { bookmarkId: "b" },
        { bookmarkId: "c" },
      ],
    });
  });

  it("accepts a useful group with at least three members and leaves the rest ungrouped", async () => {
    const bookmarks = ["a", "b", "c", "d"].map((id) => bookmark(id));
    const result = await organizeGroupsGlobally(bookmarks, async () =>
      JSON.stringify({
        groups: [{ name: "React 生态", memberIds: ["a", "b", "c"] }],
      }),
    );

    expect(result.assignments).toEqual([
      { bookmarkId: "a", group: "React 生态" },
      { bookmarkId: "b", group: "React 生态" },
      { bookmarkId: "c", group: "React 生态" },
      { bookmarkId: "d" },
    ]);
  });

  it("isolates categories and safely ignores cross-category or malformed assignments", async () => {
    const bookmarks = [
      bookmark("a"),
      bookmark("b"),
      bookmark("c"),
      bookmark("d"),
      bookmark("x", "设计创意"),
      bookmark("y", "设计创意"),
      bookmark("z", "设计创意"),
    ];
    const requester = vi.fn(async (messages: Array<{ content: string }>) => {
      const input = JSON.parse(messages[1]!.content) as { category: string };
      return input.category === "开发技术"
        ? JSON.stringify({
            groups: [
              {
                name: "React 生态",
                memberIds: ["a", "b", "c", "x", "unknown"],
              },
              { name: "重复成员", memberIds: ["a", "d", "d"] },
              { name: "小组", memberIds: ["d", "x"] },
              { name: "超限组", memberIds: ["a", "b", "d"] },
            ],
          })
        : JSON.stringify({
            groups: [
              { name: "设计资源", memberIds: ["x", "y", "z", "a"] },
            ],
          });
    });

    await expect(organizeGroupsGlobally(bookmarks, requester)).resolves.toEqual({
      assignments: [
        { bookmarkId: "a", group: "React 生态" },
        { bookmarkId: "b", group: "React 生态" },
        { bookmarkId: "c", group: "React 生态" },
        { bookmarkId: "d" },
        { bookmarkId: "x", group: "设计资源" },
        { bookmarkId: "y", group: "设计资源" },
        { bookmarkId: "z", group: "设计资源" },
      ],
    });
    expect(requester).toHaveBeenCalledTimes(2);
  });

  it("treats every omitted bookmark as ungrouped", async () => {
    const bookmarks = ["a", "b", "c"].map((id) => bookmark(id));
    await expect(
      organizeGroupsGlobally(bookmarks, async () =>
        JSON.stringify({ groups: [] }),
      ),
    ).resolves.toEqual({
      assignments: [
        { bookmarkId: "a" },
        { bookmarkId: "b" },
        { bookmarkId: "c" },
      ],
    });
  });

  it("places a new bookmark only into a strongly matched existing group", async () => {
    const workspace: WorkspaceLayout = {
      version: 3,
      activeCategoryId: "category-dev",
      categories: [
        {
          id: "category-dev",
          title: "开发技术",
          icon: "code",
          bookmarkIds: [],
          groups: [
            {
              id: "group-react",
              title: "React 生态",
              collapsed: false,
              bookmarkIds: ["a", "b", "c"],
            },
          ],
        },
      ],
      customBookmarks: [],
      hiddenBookmarkIds: [],
      updatedAt: 1,
    };
    const existing = ["a", "b", "c"].map((id) => bookmark(id));
    const incoming = bookmark("new");

    await expect(
      assignBookmarkToExistingGroup(incoming, existing, workspace, async () =>
        JSON.stringify({ groupId: "group-react" }),
      ),
    ).resolves.toBe("group-react");
    await expect(
      assignBookmarkToExistingGroup(incoming, existing, workspace, async () =>
        JSON.stringify({ groupId: null }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      assignBookmarkToExistingGroup(incoming, existing, workspace, async () =>
        JSON.stringify({ groupId: "invented" }),
      ),
    ).resolves.toBeUndefined();
  });
});
