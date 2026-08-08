import { nanoid } from "nanoid";
import { PREVIEW_BOOKMARKS } from "@/domain/seed";
import type { BookmarkDraft, BookmarkRecord } from "@/domain/types";
import { isChromeDefaultRootFolder } from "@/domain/bookmarkFolders";
import { enrichWithMetadata, saveEditableTags } from "./database";
import { requestHostPermissions } from "./hostPermissions";

export interface AppRuntime {
  kind: "chrome" | "preview";
  loadBookmarks(): Promise<BookmarkRecord[]>;
  saveBookmark(
    draft: BookmarkDraft,
    existing?: BookmarkRecord,
  ): Promise<BookmarkRecord>;
  deleteBookmark(bookmark: BookmarkRecord): Promise<void>;
  restoreBookmarks(bookmarks: BookmarkRecord[]): Promise<BookmarkRecord[]>;
  openUrl(url: string, newTab: boolean): Promise<void>;
  faviconUrl(bookmark: BookmarkRecord): string | undefined;
  requestHostPermissions(endpoints: string[]): Promise<boolean>;
  notifyBackground(): Promise<void>;
}

let previewBookmarks = structuredClone(PREVIEW_BOOKMARKS);

export function createPreviewRuntime(): AppRuntime {
  return {
    kind: "preview",
    async loadBookmarks() {
      return enrichWithMetadata(structuredClone(previewBookmarks));
    },
    async saveBookmark(draft, existing) {
      const record: BookmarkRecord = {
        id: existing?.id ?? `custom-${nanoid(10)}`,
        parentId: existing?.parentId,
        title: draft.title.trim(),
        url: normalizeUrl(draft.url),
        source: "preview",
        folderPath: existing?.folderPath ?? [],
        tags: draft.tags,
        aiTags: draft.aiTags,
        summary: existing?.summary,
        aiCategory: existing?.aiCategory,
        aiGroup: existing?.aiGroup,
        dateAdded: existing?.dateAdded ?? Date.now(),
      };
      const savedTags = await saveEditableTags(
        record.id,
        draft.tags,
        draft.aiTags,
      );
      record.tags = savedTags.manualTags;
      record.aiTags = savedTags.aiTags;
      const index = previewBookmarks.findIndex((item) => item.id === record.id);
      if (index >= 0) previewBookmarks[index] = record;
      else previewBookmarks.push(record);
      return record;
    },
    async deleteBookmark(bookmark) {
      previewBookmarks = previewBookmarks.filter((item) => item.id !== bookmark.id);
    },
    async restoreBookmarks(bookmarks) {
      const restored = bookmarks.map((bookmark) => ({
        ...structuredClone(bookmark),
        id: `custom-${nanoid(10)}`,
        source: "preview" as const,
        dateAdded: Date.now(),
      }));
      previewBookmarks.push(...restored);
      return restored;
    },
    async openUrl(url, newTab) {
      if (newTab) window.open(url, "_blank", "noopener,noreferrer");
      else window.location.assign(url);
    },
    faviconUrl(bookmark) {
      return `https://icons.duckduckgo.com/ip3/${new URL(bookmark.url).hostname}.ico`;
    },
    async requestHostPermissions() {
      return true;
    },
    async notifyBackground() {
      return;
    },
  };
}

export function createChromeRuntime(): AppRuntime {
  return {
    kind: "chrome",
    async loadBookmarks() {
      const tree = await chrome.bookmarks.getTree();
      return enrichWithMetadata(flattenBookmarkTree(tree));
    },
    async saveBookmark(draft, existing) {
      if (existing?.source === "chrome") {
        const updated = await chrome.bookmarks.update(existing.id, {
          title: draft.title.trim(),
          url: normalizeUrl(draft.url),
        });
        const savedTags = await saveEditableTags(
          updated.id,
          draft.tags,
          draft.aiTags,
        );
        return toBookmarkRecord(
          updated,
          existing.folderPath,
          savedTags.manualTags,
          savedTags.aiTags,
        );
      }
      const created = await chrome.bookmarks.create({
        title: draft.title.trim(),
        url: normalizeUrl(draft.url),
      });
      const savedTags = await saveEditableTags(
        created.id,
        draft.tags,
        draft.aiTags,
      );
      return toBookmarkRecord(
        created,
        [],
        savedTags.manualTags,
        savedTags.aiTags,
      );
    },
    async deleteBookmark(bookmark) {
      if (bookmark.source === "chrome") {
        await chrome.bookmarks.remove(bookmark.id);
      }
    },
    async restoreBookmarks(bookmarks) {
      const restored: BookmarkRecord[] = [];
      for (const bookmark of bookmarks) {
        let parentId: string | undefined;
        if (bookmark.parentId) {
          try {
            const [parent] = await chrome.bookmarks.get(bookmark.parentId);
            if (parent && !parent.url) parentId = parent.id;
          } catch {
            parentId = undefined;
          }
        }
        const created = await chrome.bookmarks.create({
          parentId,
          title: bookmark.title,
          url: bookmark.url,
        });
        const savedTags = await saveEditableTags(
          created.id,
          bookmark.tags,
          bookmark.aiTags,
        );
        restored.push(
          toBookmarkRecord(
            created,
            bookmark.folderPath,
            savedTags.manualTags,
            savedTags.aiTags,
          ),
        );
      }
      return restored;
    },
    async openUrl(url, newTab) {
      if (newTab) await chrome.tabs.create({ url });
      else location.assign(url);
    },
    faviconUrl(bookmark) {
      return chrome.runtime.getURL(
        `/_favicon/?pageUrl=${encodeURIComponent(bookmark.url)}&size=256`,
      );
    },
    async requestHostPermissions(endpoints) {
      return requestHostPermissions(endpoints);
    },
    async notifyBackground() {
      await chrome.runtime.sendMessage({ type: "ai:pump" });
    },
  };
}

export function flattenBookmarkTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): BookmarkRecord[] {
  const output: BookmarkRecord[] = [];

  function visit(node: chrome.bookmarks.BookmarkTreeNode, path: string[]) {
    if (node.url) {
      output.push(toBookmarkRecord(node, path));
      return;
    }
    const nextPath =
      node.id === "0" || !node.title || isChromeDefaultRootFolder(node)
        ? path
        : [...path, node.title];
    node.children?.forEach((child) => visit(child, nextPath));
  }

  nodes.forEach((node) => visit(node, []));
  return output;
}

function toBookmarkRecord(
  node: chrome.bookmarks.BookmarkTreeNode,
  folderPath: string[],
  tags: string[] = [],
  aiTags: string[] = [],
): BookmarkRecord {
  return {
    id: node.id,
    parentId: node.parentId,
    title: node.title || new URL(node.url!).hostname,
    url: node.url!,
    source: "chrome",
    folderPath,
    tags,
    aiTags,
    dateAdded: node.dateAdded,
  };
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
