import type { BookmarkRecord, WorkspaceLayout } from "./types";
import { buildWorkspaceFromBookmarks, createGroup } from "./layout";

export const PREVIEW_BOOKMARKS: BookmarkRecord[] = [
  bookmark("preview-google", "Google", "https://www.google.com", ["搜索", "效率"]),
  bookmark("preview-youtube", "YouTube", "https://www.youtube.com", ["视频"]),
  bookmark("preview-gmail", "Gmail", "https://mail.google.com", ["邮件", "工作"]),
  bookmark("preview-drive", "Google Drive", "https://drive.google.com", ["云盘", "工作"]),
  bookmark("preview-notion", "Notion", "https://www.notion.so", ["笔记", "知识库"]),
  bookmark("preview-github", "GitHub", "https://github.com", ["代码", "开发"]),
  bookmark("preview-figma", "Figma", "https://www.figma.com", ["设计", "协作"]),
  bookmark("preview-slack", "Slack", "https://slack.com", ["沟通", "工作"]),
  bookmark("preview-x", "Twitter", "https://x.com", ["社交", "资讯"]),
  bookmark("preview-chatgpt", "ChatGPT", "https://chatgpt.com", ["AI", "效率"]),
  bookmark(
    "preview-semrush",
    "Semrush Domain Overview",
    "https://www.semrush.com/analytics/overview/",
    ["SEO", "域名分析", "竞品"],
    "分析域名流量、关键词与外链情况",
  ),
  bookmark(
    "preview-ahrefs",
    "Ahrefs Site Explorer",
    "https://ahrefs.com/site-explorer",
    ["SEO", "域名分析", "外链"],
    "网站和域名 SEO 分析工具",
  ),
  bookmark("preview-mdn", "MDN Web Docs", "https://developer.mozilla.org", ["前端", "文档"]),
  bookmark("preview-coursera", "Coursera", "https://www.coursera.org", ["课程", "学习"]),
  bookmark("preview-readwise", "Readwise", "https://readwise.io", ["阅读", "知识库"]),
];

function bookmark(
  id: string,
  title: string,
  url: string,
  tags: string[],
  summary?: string,
): BookmarkRecord {
  return {
    id,
    title,
    url,
    tags,
    aiTags: [],
    summary,
    source: "preview",
    folderPath: [],
  };
}

export function createPreviewWorkspace(): WorkspaceLayout {
  const workspace = buildWorkspaceFromBookmarks(PREVIEW_BOOKMARKS);
  const category = workspace.categories[0]!;
  category.bookmarkIds = [
    "preview-google",
    "preview-youtube",
    "preview-gmail",
  ];
  const collaboration = createGroup("工作协作");
  collaboration.bookmarkIds = [
    "preview-drive",
    "preview-notion",
    "preview-slack",
  ];
  const creation = createGroup("开发与设计");
  creation.bookmarkIds = [
    "preview-github",
    "preview-figma",
    "preview-chatgpt",
    "preview-mdn",
  ];
  const research = createGroup("研究与学习");
  research.bookmarkIds = [
    "preview-x",
    "preview-semrush",
    "preview-ahrefs",
    "preview-coursera",
    "preview-readwise",
  ];
  category.groups = [collaboration, creation, research];
  return workspace;
}
