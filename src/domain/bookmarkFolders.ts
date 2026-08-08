const DEFAULT_ROOT_IDS = new Set(["1", "2", "3"]);
const DEFAULT_ROOT_TITLES = new Set(
  [
    "书签栏",
    "收藏夹栏",
    "其他书签",
    "移动设备书签",
    "移动设备上的书签",
    "bookmarks bar",
    "other bookmarks",
    "mobile bookmarks",
  ].map((title) => title.toLocaleLowerCase()),
);

export function isChromeDefaultRootFolder(
  node: Pick<chrome.bookmarks.BookmarkTreeNode, "id" | "parentId" | "title">,
): boolean {
  if (node.parentId === "0") return true;
  return DEFAULT_ROOT_IDS.has(node.id) &&
    DEFAULT_ROOT_TITLES.has((node.title ?? "").trim().toLocaleLowerCase());
}

export function sanitizeUserFolderPath(path: readonly string[]): string[] {
  const cleaned = path.map((title) => title.trim()).filter(Boolean);
  if (
    cleaned.length > 0 &&
    DEFAULT_ROOT_TITLES.has(cleaned[0]!.toLocaleLowerCase())
  ) {
    return cleaned.slice(1);
  }
  return cleaned;
}
