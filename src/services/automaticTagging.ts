import type { AiJob, BookmarkRecord } from "@/domain/types";
import { isChromeDefaultRootFolder } from "@/domain/bookmarkFolders";
import { enqueueAutomaticTaggingJob } from "./ai";
import { loadSettings } from "./storage";

export async function enqueueCreatedBookmarkIfEnabled(
  node: chrome.bookmarks.BookmarkTreeNode,
): Promise<AiJob | undefined> {
  if (!node.url) return undefined;

  const settings = await loadSettings();
  if (
    !settings.autoTagNewBookmarks ||
    !settings.provider.enabled ||
    !settings.provider.apiKey.trim()
  ) {
    return undefined;
  }

  const bookmark: BookmarkRecord = {
    id: node.id,
    parentId: node.parentId,
    title: node.title || node.url,
    url: node.url,
    source: "chrome",
    folderPath: await resolveChromeFolderPath(node.parentId),
    tags: [],
    aiTags: [],
    dateAdded: node.dateAdded,
  };
  return enqueueAutomaticTaggingJob(bookmark);
}

export async function resolveChromeFolderPath(
  parentId?: string,
): Promise<string[]> {
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId = parentId;

  while (currentId && currentId !== "0" && !visited.has(currentId)) {
    visited.add(currentId);
    let parent: chrome.bookmarks.BookmarkTreeNode | undefined;
    try {
      [parent] = await chrome.bookmarks.get(currentId);
    } catch {
      break;
    }
    if (!parent) break;
    if (parent.title && !isChromeDefaultRootFolder(parent)) {
      path.unshift(parent.title);
    }
    currentId = parent.parentId;
  }

  return path;
}
