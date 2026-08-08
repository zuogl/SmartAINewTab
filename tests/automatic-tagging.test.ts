import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { enqueueCreatedBookmarkIfEnabled } from "@/services/automaticTagging";
import { database } from "@/services/database";
import { saveSettings } from "@/services/storage";

describe("automatic tagging for newly created bookmarks", () => {
  beforeEach(async () => {
    await database.jobs.clear();
    await database.metadata.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("stays opt-in and skips folders or missing provider credentials", async () => {
    const bookmark = {
      id: "bookmark-1",
      parentId: "folder-1",
      title: "Domain tools",
      url: "https://example.com",
      syncing: false,
    } satisfies chrome.bookmarks.BookmarkTreeNode;

    await expect(
      enqueueCreatedBookmarkIfEnabled(bookmark),
    ).resolves.toBeUndefined();

    await saveSettings({
      ...DEFAULT_SETTINGS,
      autoTagNewBookmarks: true,
      provider: {
        ...DEFAULT_SETTINGS.provider,
        enabled: true,
        apiKey: "",
      },
    });
    await expect(
      enqueueCreatedBookmarkIfEnabled(bookmark),
    ).resolves.toBeUndefined();
    await expect(
      enqueueCreatedBookmarkIfEnabled({
        id: "folder-2",
        parentId: "0",
        title: "Folder",
        syncing: false,
      }),
    ).resolves.toBeUndefined();
    await expect(database.jobs.count()).resolves.toBe(0);
  });

  it("captures the folder path and queues each new bookmark only once", async () => {
    const folders: Record<string, chrome.bookmarks.BookmarkTreeNode> = {
      "folder-1": {
        id: "folder-1",
        parentId: "root-bar",
        title: "Research",
        syncing: false,
      },
      "root-bar": {
        id: "root-bar",
        parentId: "0",
        title: "Bookmarks Bar",
        syncing: false,
      },
    };
    const get = vi.fn(async (id: string) => {
      const folder = folders[id];
      return folder ? [folder] : [];
    });
    vi.stubGlobal("chrome", { bookmarks: { get } });
    await saveSettings({
      ...DEFAULT_SETTINGS,
      autoTagNewBookmarks: true,
      provider: {
        ...DEFAULT_SETTINGS.provider,
        enabled: true,
        apiKey: "test-only-key",
      },
    });

    const bookmark = {
      id: "bookmark-1",
      parentId: "folder-1",
      title: "Domain tools",
      url: "https://example.com",
      dateAdded: 123,
      syncing: false,
    } satisfies chrome.bookmarks.BookmarkTreeNode;
    const created = await enqueueCreatedBookmarkIfEnabled(bookmark);
    const duplicate = await enqueueCreatedBookmarkIfEnabled(bookmark);

    expect(created).toMatchObject({
      status: "queued",
      organizationMode: "none",
      bookmarkIds: ["bookmark-1"],
      items: [
        {
          id: "bookmark-1",
          folderPath: ["Research"],
        },
      ],
    });
    expect(duplicate).toBeUndefined();
    expect(await database.jobs.count()).toBe(1);
    expect(get).toHaveBeenCalledTimes(4);
  });
});
