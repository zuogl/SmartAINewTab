import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookmarkRecord } from "@/domain/types";
import { database } from "@/services/database";
import { createChromeRuntime, flattenBookmarkTree } from "@/services/runtime";

describe("Chrome favicon source", () => {
  beforeEach(async () => {
    await database.metadata.clear();
  });

  it("requests a Retina-safe favicon size", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (path: string) => `chrome-extension://test${path}`,
      },
    });
    const bookmark: BookmarkRecord = {
      id: "bookmark-1",
      title: "Example",
      url: "https://example.com/path",
      source: "chrome",
      folderPath: [],
      tags: [],
      aiTags: [],
    };

    expect(createChromeRuntime().faviconUrl(bookmark)).toContain("size=256");
  });

  it("returns and persists edited AI and manual tags after a Chrome bookmark save", async () => {
    vi.stubGlobal("chrome", {
      bookmarks: {
        update: vi.fn().mockResolvedValue({
          id: "bookmark-1",
          parentId: "1",
          title: "Updated",
          url: "https://example.com",
          dateAdded: 123,
        }),
      },
      runtime: {
        getURL: (path: string) => `chrome-extension://test${path}`,
      },
    });
    const existing: BookmarkRecord = {
      id: "bookmark-1",
      parentId: "1",
      title: "Example",
      url: "https://example.com",
      source: "chrome",
      folderPath: ["工作"],
      tags: ["旧手动标签"],
      aiTags: ["旧 AI 标签"],
    };

    const saved = await createChromeRuntime().saveBookmark(
      {
        title: "Updated",
        url: "https://example.com",
        categoryId: "cat-work",
        groupId: "group-tools",
        tags: ["手动标签"],
        aiTags: ["AI 标签"],
      },
      existing,
    );

    expect(saved).toMatchObject({
      tags: ["手动标签"],
      aiTags: ["AI 标签"],
    });
    expect(await database.metadata.get("bookmark-1")).toMatchObject({
      manualTags: ["手动标签"],
      tags: ["AI 标签"],
    });
  });

  it("keeps user folders but removes Chrome default root folders from paths", () => {
    const tree: chrome.bookmarks.BookmarkTreeNode[] = [
      {
        id: "0",
        title: "",
        syncing: false,
        children: [
          {
            id: "1",
            parentId: "0",
            title: "Bookmarks Bar",
            syncing: false,
            children: [
              {
                id: "folder-research",
                parentId: "1",
                title: "Research",
                syncing: false,
                children: [
                  {
                    id: "bookmark-1",
                    parentId: "folder-research",
                    title: "Example",
                    url: "https://example.com",
                    syncing: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    expect(flattenBookmarkTree(tree)[0]?.folderPath).toEqual(["Research"]);
  });

  it("restores deleted bookmarks into their surviving parent and assigns new IDs", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "restored-id",
      parentId: "folder-1",
      title: "Restored",
      url: "https://example.com/restored",
      dateAdded: 456,
    });
    vi.stubGlobal("chrome", {
      bookmarks: {
        get: vi.fn().mockResolvedValue([
          { id: "folder-1", parentId: "1", title: "工作" },
        ]),
        create,
      },
      runtime: {
        getURL: (path: string) => `chrome-extension://test${path}`,
      },
    });
    const restored = await createChromeRuntime().restoreBookmarks([
      {
        id: "deleted-id",
        parentId: "folder-1",
        title: "Restored",
        url: "https://example.com/restored",
        source: "chrome",
        folderPath: ["工作"],
        tags: ["手动"],
        aiTags: ["AI"],
      },
    ]);

    expect(create).toHaveBeenCalledWith({
      parentId: "folder-1",
      title: "Restored",
      url: "https://example.com/restored",
    });
    expect(restored[0]).toMatchObject({
      id: "restored-id",
      tags: ["手动"],
      aiTags: ["AI"],
    });
  });
});
