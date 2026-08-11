import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { LanguagePreference } from "@/domain/types";
import jaMessages from "./locales/ja.json";
import koMessages from "./locales/ko.json";
import zhTwMessages from "./locales/zh-TW.json";

export type AppLocale = "zh-CN" | "zh-TW" | "ja" | "ko" | "en";
type TranslationValues = Record<string, string | number>;

const EN_MESSAGES = {
  "设置": "Settings",
  "SmartAINewTab 设置": "SmartAINewTab Settings",
  "设置分类": "Settings categories",
  "AI 与模型": "AI & Models",
  "AI 标签任务": "AI Tagging",
  "书签体检": "Bookmark Health",
  "备份与恢复": "Backup & Restore",
  "账户与云同步": "Account & Cloud Sync",
  "背景与外观": "Background & Appearance",
  "小部件中心": "Widgets",
  "屏幕展示": "Display",
  "通用偏好": "General",
  "选择国内外主流大模型服务商、模型与本地 BYOK 密钥。":
    "Choose an AI provider, model, and locally stored BYOK key.",
  "批量处理未标注网页，查看整体进度与每个书签的完整结果。":
    "Process untagged pages in batches and review progress and results.",
  "在本地识别重复候选，并通过可恢复后台任务检测死链、跳转和访问异常。":
    "Find duplicates locally and check dead links, redirects, and access errors with resumable jobs.",
  "安全导出布局、分组与标签，或从已有备份恢复。":
    "Safely export layouts, groups, and tags, or restore an existing backup.",
  "连接 Google 账户，并通过 SmartAINewTab 云端保存端到端加密备份。":
    "Connect a Google account and store end-to-end encrypted backups in SmartAINewTab Cloud.",
  "选择、上传并轮播新标签页背景，实时预览最终效果。":
    "Choose, upload, and rotate new-tab backgrounds with a live preview.",
  "从 13 种预设中选择 2–8 个，并配置首屏顺序与数据偏好。":
    "Choose 2–8 of 13 widgets and configure their order and data preferences.",
  "控制首页时间与每日古籍警句，并选择时间的排版样式。":
    "Control the home clock and daily quote, and choose a clock style.",
  "调整界面语言、本地搜索与网址打开方式。":
    "Adjust the interface language, local search, and link behavior.",
  "界面语言": "Interface language",
  "跟随浏览器": "Use browser language",
  "简体中文": "Simplified Chinese",
  "英语": "English",
  "语言设置保存后立即生效，不会翻译或改写书签内容。":
    "The language changes immediately after saving and never translates or rewrites bookmark content.",
  "自动匹配：中国大陆使用简体中文，港澳台使用繁體中文，日本使用日本語，韩国使用한국어，其他国家和地区使用 English。":
    "Automatic selection: Simplified Chinese for mainland China, Traditional Chinese for Hong Kong, Macao, and Taiwan, Japanese for Japan, Korean for South Korea, and English elsewhere.",
  "摘要参与本地检索": "Include summaries in local search",
  "默认在新标签页打开网址": "Open links in a new tab by default",
  "始终显示右侧一级分类": "Always show the category rail",
  "关闭后分类栏隐藏，鼠标移动到屏幕最右侧时立即显示":
    "When off, the rail appears only when the pointer reaches the right edge.",
  "显示空的“未分类”分类": "Show an empty Uncategorized category",
  "关闭后，当未分类书签为 0 时隐藏；新增未分类书签后自动显示。":
    "When off, Uncategorized is hidden at zero bookmarks and reappears automatically when a new uncategorized bookmark is added.",
  "有未保存的更改": "Unsaved changes",
  "所有更改已保存": "All changes saved",
  "正在保存…": "Saving…",
  "设置已保存": "Settings saved",
  "Provider 域名授权未通过": "Provider host permission was not granted",
  "保存设置": "Save settings",
  "AI Provider（BYOK）": "AI Provider (BYOK)",
  "仅在你主动检索、执行标签任务或启用自动标签时发送书签元数据。":
    "Bookmark metadata is sent only when you search with AI, run tagging, or enable automatic tagging.",
  "启用 AI 增强": "Enable AI features",
  "模型服务商": "Model provider",
  "国内": "China",
  "海外": "Global",
  "国内主流模型": "Popular models in China",
  "海外主流模型": "Popular global models",
  "自定义兼容服务": "Custom compatible service",
  "模型": "Model",
  "自定义模型 ID": "Custom model ID",
  "请输入模型 ID": "Enter a model ID",
  "以服务商控制台显示的模型 ID 为准":
    "Use the model ID shown in the provider console",
  "API Endpoint（高级配置）": "API Endpoint (advanced)",
  "隐藏 API Key": "Hide API Key",
  "显示 API Key": "Show API Key",
  "自定义": "Custom",
  "Endpoint 需要接受 Bearer Token，并提供 Chat Completions 兼容响应。":
    "The endpoint must accept a Bearer token and return a Chat Completions-compatible response.",
  "完整备份与恢复": "Full backup and restore",
  "导出分类、分组、排序、AI 标签和设置；任何大模型 API Key 都不会进入备份。":
    "Export categories, groups, ordering, AI tags, and settings. Provider API keys are never included.",
  "导出完整备份": "Export full backup",
  "恢复完整备份": "Restore full backup",
  "从备份恢复": "Restore from backup",
  "Google 账户与加密云备份": "Google account and encrypted cloud backup",
  "恢复密码（首次备份或恢复时使用）":
    "Recovery password (used for the first backup and restore)",
  "至少 12 位；服务端无法找回":
    "At least 12 characters; the server cannot recover it",
  "Google 用户": "Google user",
  "使用 Google 登录": "Sign in with Google",
  "退出": "Sign out",
  "退出登录": "Sign out",
  "上传当前备份": "Upload current backup",
  "从云端恢复": "Restore from cloud",
  "删除云端数据": "Delete cloud data",
  "删除操作不会删除本机 Chrome 书签，也不会影响本地导出的备份文件。":
    "Deletion never removes local Chrome bookmarks or exported backup files.",
  "删除云端备份": "Delete cloud backup",
  "永久删除账户": "Permanently delete account",
  "删除云端账户": "Delete cloud account",
  "确认删除云端备份？": "Delete the cloud backup?",
  "确认永久删除云端账户？": "Permanently delete the cloud account?",
  "云端密文和同步版本会被删除；当前浏览器里的书签、布局和账户登录保持不变。":
    "Encrypted cloud data and sync revisions will be deleted. Local bookmarks, layout, and sign-in remain unchanged.",
  "Google 账户资料、登录会话、云端备份及其元数据会被删除，并立即退出登录。此操作不可撤销。":
    "Google account profile, sessions, cloud backups, and metadata will be deleted and you will be signed out. This cannot be undone.",
  "确认删除备份": "Delete backup",
  "确认删除账户": "Delete account",
  "首次全量任务会先完成所有标签与一级分类，再统一规划少量必要分组。":
    "The first full run completes tags and categories before planning a small number of useful groups.",
  "处理范围": "Scope",
  "本次处理范围": "Processing scope",
  "未处理书签": "Untagged bookmarks",
  "已有 AI 结果": "Existing AI results",
  "全部书签": "All bookmarks",
  "仅未处理（{count}）": "Untagged only ({count})",
  "仅已有 AI 结果（{count}）": "Existing AI results only ({count})",
  "全部书签（{count}）": "All bookmarks ({count})",
  "全部 {count} 个（主动选择）": "All {count} (explicit selection)",
  "最多 {count} 个书签": "Up to {count} bookmarks",
  "本次数量": "Amount",
  "本次打标签数量": "Tagging amount",
  "开始处理": "Start",
  "重新处理": "Reprocess",
  "检查并整理": "Review and organize",
  "新书签自动打标签": "Automatically tag new bookmarks",
  "AI 自动整理分类与分组": "Let AI organize categories and groups",
  "恢复 AI 整理前布局": "Restore the pre-AI layout",
  "已完成网页": "Completed pages",
  "AI 标签总体完成进度": "Overall AI tagging progress",
  "显示时间": "Show clock",
  "首页搜索框上方显示精确到秒的本地时间":
    "Show local time with seconds above the home search box",
  "显示每日警句": "Show daily quote",
  "每天固定展示一条中国古籍原文及出处":
    "Show one quotation from a Chinese classic each day",
  "时间内容": "Clock content",
  "内容开关独立于视觉样式，并会实时反映到下方所有预览":
    "Content toggles are independent of visual style and update every preview.",
  "显示公历日期": "Show date",
  "例如 2026年8月3日": "For example, Aug 3, 2026",
  "显示星期": "Show weekday",
  "可与公历日期单独组合": "Can be combined independently with the date",
  "显示农历": "Show Chinese lunar date",
  "根据本地日期自动换算农历月日":
    "Convert the local date to the Chinese lunar month and day",
  "时间样式": "Clock style",
  "12 种纯视觉样式；日期、星期和农历由上方独立控制":
    "12 visual styles; date, weekday, and lunar date are controlled above.",
  "操作失败，请重试": "The operation failed. Try again.",
  "背景实时预览": "Live background preview",
  "暂无可用背景": "No backgrounds available",
  "搜索 Google 或输入网址": "Search Google or enter a URL",
  "SmartAINewTab 背景": "SmartAINewTab background",
  "当前使用": "In use",
  "背景来源": "Background source",
  "精选": "Featured",
  "我的": "My uploads",
  "云端": "Cloud",
  "刷新": "Refresh",
  "还没有上传背景": "No uploaded backgrounds yet",
  "云端图库暂时不可用": "The cloud gallery is temporarily unavailable",
  "支持 JPG、PNG、WebP、AVIF，单张不超过 20 MB。":
    "Supports JPG, PNG, WebP, and AVIF up to 20 MB per image.",
  "离线精选仍可正常使用，你也可以稍后刷新。":
    "Built-in backgrounds remain available offline. You can refresh later.",
  "上传背景": "Upload background",
  "应用背景": "Apply background",
  "背景轮播设置": "Background rotation settings",
  "轮播设置": "Rotation",
  "已选择 {count} 张": "{count} selected",
  "自动轮播": "Automatic rotation",
  "频率": "Frequency",
  "每次打开新标签页": "Every new tab",
  "每 15 分钟": "Every 15 minutes",
  "每 1 小时": "Every hour",
  "每天": "Daily",
  "顺序": "Order",
  "按顺序轮播": "Sequential",
  "随机": "Random",
  "遮罩 {value}%": "Overlay {value}%",
  "模糊 {value}px": "Blur {value}px",
  "我的本地背景": "My local backgrounds",
  "Cloudflare 精选图库": "Cloudflare featured gallery",
  "SmartAINewTab 内置背景": "SmartAINewTab built-in backgrounds",
  "首页小部件": "Home widgets",
  "小部件只出现在大分类之前的第一屏，并按数量自动切换尺寸":
    "Widgets appear on the first screen before categories and resize automatically.",
  "已显示": "Visible",
  "已隐藏": "Hidden",
  "首屏小部件": "Active widgets",
  "允许 2–8 个。2–5 个会突出核心组件，6–8 个使用高密度双排布局。":
    "Choose 2–8. Two to five emphasize key widgets; six to eight use a dense two-row layout.",
  "恢复默认": "Restore defaults",
  "天气城市": "Weather city",
  "默认换算": "Default conversion",
  "默认源货币": "Default source currency",
  "默认目标货币": "Default target currency",
  "全部小部件": "All widgets",
  "已启用的小部件可以调整首屏顺序":
    "Active widgets can be reordered on the first screen.",
  "联网": "Online",
  "混合": "Mixed",
  "本地": "Local",
  "第 {position} 位": "Position {position}",
  "开启小部件时至少保留 {count} 个":
    "Keep at least {count} widgets when widgets are enabled",
  "首屏最多展示 {count} 个小部件":
    "The first screen supports up to {count} widgets",
  "已从首屏移除": "Removed from the first screen",
  "已加入首屏，将根据空间自动调整尺寸":
    "Added to the first screen; size will adjust automatically",
  "已恢复默认的 6 个小部件": "Restored the default six widgets",
  "今日面板": "Today",
  "{count} 个小部件 · 向下滚动查看大分类":
    "{count} widgets · Scroll down to view categories",
  "管理小部件": "Manage widgets",
  "管理": "Manage",
  "实时": "Live",
  "检测覆盖": "Check coverage",
  "{count} 项需要查看": "{count} items need attention",
  "当前没有健康提醒": "No health alerts",
  "{duplicates} 组重复 · {dead} 条死链候选":
    "{duplicates} duplicate groups · {dead} dead-link candidates",
  "打开书签体检": "Open bookmark health",
  "未获得天气服务域名授权": "Weather service access was not granted",
  "正在获取天气…": "Loading weather…",
  "体感 {value}°": "Feels like {value}°",
  "湿度 {value}%": "Humidity {value}%",
  "风速 {value} km/h": "Wind {value} km/h",
  "上个月": "Previous month",
  "回到本月": "Return to this month",
  "下个月": "Next month",
  "今": "Today",
  "节假日": "Holidays",
  "周末以淡色显示": "Weekends are dimmed",
  "未获得汇率服务域名授权": "Currency service access was not granted",
  "换算金额": "Amount to convert",
  "源货币": "Source currency",
  "目标货币": "Target currency",
  "加载中": "Loading",
  "未获得该榜单服务域名授权": "Trending service access was not granted",
  "正在读取榜单…": "Loading trends…",
  "小分组": "Groups",
  "待整理": "To organize",
  "AI 标签覆盖 {tagged}/{total}": "AI tag coverage {tagged}/{total}",
  "已进入小分组 {grouped} 个 · 隐藏 {hidden} 个":
    "{grouped} in groups · {hidden} hidden",
  "当前任务": "Current task",
  "标签覆盖": "Tag coverage",
  "尚无任务": "No tasks yet",
  "已处理 {processed} · 失败 {failed}": "Processed {processed} · Failed {failed}",
  "{tagged}/{total} 个书签已有 AI 标签":
    "{tagged}/{total} bookmarks have AI tags",
  "{time} 更新": "Updated {time}",
  "暂无带时间记录的书签": "No timestamped bookmarks yet",
  "完成 AI 标签任务后会生成标签雷达":
    "A tag cloud appears after an AI tagging task completes",
  "专注一个清晰的小目标": "Focus on one clear goal",
  "开始": "Start",
  "重置": "Reset",
  "快捷便签内容": "Quick note content",
  "写下今天最重要的事情…": "Write down today's most important task…",
  "已保存在本机": "Saved locally",
  "授权并重试": "Allow and retry",
  "数据暂时不可用": "Data is temporarily unavailable",
  "标签": "Tags",
  "AI 与手动标签共同参与书签搜索和分类判断":
    "AI and manual tags both contribute to search and categorization.",
  "AI 标签": "AI tags",
  "由 AI 生成，也可以手动调整": "Generated by AI and editable manually",
  "手动标签": "Manual tags",
  "你自己补充的标签": "Tags you add yourself",
  "编辑标签": "Edit tag",
  "删除标签": "Delete tag",
  "{label}列表": "{label} list",
  "编辑 {label} {tag}": "Edit {label} {tag}",
  "删除 {label} {tag}": "Delete {label} {tag}",
  "新增 {label}": "Add {label}",
  "添加{label}": "Add {label}",
  "添加 {label}": "Add {label}",
  "网站图标加载进度": "Website icon loading progress",
  "网站图标加载完成 · 共 {count} 个": "Website icons loaded · {count} total",
  "正在加载网站图标 {processed}/{total}": "Loading website icons {processed}/{total}",
  "成功 {count}": "Loaded {count}",
  "灰色地球 {count}": "Fallback icons {count}",
  "书签健康概览": "Bookmark health overview",
  "本轮已检测": "Checked this run",
  "已检测": "Checked",
  "本地重复候选组": "Local duplicate groups",
  "本轮疑似死链": "Suspected dead this run",
  "疑似死链": "Suspected dead",
  "本轮确认死链": "Confirmed dead this run",
  "确认死链": "Confirmed dead",
  "本轮永久或临时跳转": "Redirects this run",
  "永久或临时跳转": "Redirects",
  "运行书签体检": "Run bookmark health check",
  "重复链接在本地计算；开始联网体检时 Chrome 会询问网站访问权限，常规检测不携带 Cookie，也不会调用大模型。":
    "Duplicates are calculated locally. Chrome asks for website access before online checks; regular checks send no cookies and call no AI model.",
  "检测范围": "Check scope",
  "仅从未检测或 URL 已变化": "Never checked or URL changed",
  "未检测及已过期结果": "Unchecked and expired results",
  "重新检测全部书签": "Recheck all bookmarks",
  "最多 10 个": "Up to 10",
  "最多 50 个": "Up to 50",
  "最多 100 个": "Up to 100",
  "全部": "All",
  "开始体检": "Start check",
  "书签体检进度": "Bookmark health progress",
  "继续": "Resume",
  "重新授权并继续": "Reauthorize and resume",
  "继续剩余任务": "Resume remaining tasks",
  "放弃剩余任务": "Discard remaining tasks",
  "暂停": "Pause",
  "定期自动体检": "Scheduled health checks",
  "开启时申请网站访问权限，仅在到期时检测未检查或过期的结果":
    "Requests website access when enabled and checks only unchecked or expired results when due.",
  "周期": "Interval",
  "每 7 天": "Every 7 days",
  "每 14 天": "Every 14 days",
  "每 30 天": "Every 30 days",
  "正常结果有效期": "Healthy-result validity",
  "7 天": "7 days",
  "14 天": "14 days",
  "30 天": "30 days",
  "新增或修改后检测": "Check after adding or editing",
  "开启时申请网站访问权限，保存新书签或修改 URL 后加入后台队列":
    "Requests website access and queues checks after a bookmark is added or its URL changes.",
  "检测结果": "Results",
  "删除与合并需要单独确认；普通跳转只提供人工核对":
    "Deletion and merging require confirmation; ordinary redirects are for manual review only.",
  "清空本地结果": "Clear local results",
  "体检结果分类": "Health result categories",
  "重复候选": "Duplicates",
  "跳转": "Redirects",
  "访问受限": "Access restricted",
  "请求限流": "Rate limited",
  "HTTP 异常": "HTTP errors",
  "服务端异常": "Server errors",
  "网络异常": "Network errors",
  "无法检测": "Unsupported",
  "已忽略": "Ignored",
  "搜索网页或全部书签": "Search the web or all bookmarks",
  "搜索全部书签，例如：找一下做域名分析的网站":
    "Search all bookmarks, e.g. find domain analysis tools",
  "用自然语言描述要整理的书签，Enter 后先生成执行计划":
    "Describe how to organize bookmarks; press Enter to preview a plan",
  "输入自然语言命令": "Enter a natural-language command",
  "搜索网页": "Search the web",
  "搜索全部书签": "Search all bookmarks",
  "搜索模式": "Search mode",
  "AI 命令": "AI Command",
  "首页内容滚动区域": "Home content",
  "大分类": "Categories",
  "新增大分类": "Add category",
  "链接已复制": "Link copied",
  "编辑图标": "Edit bookmark",
  "添加图标": "Add bookmark",
  "编辑大分类": "Edit category",
  "删除图标": "Delete bookmark",
  "取消": "Cancel",
  "删除": "Delete",
  "确定删除“{title}”吗？": "Delete “{title}”?",
  " 这会同时从 Chrome 原生书签中删除。":
    " This will also delete it from Chrome bookmarks.",
  "当前页打开": "Open in this tab",
  "新标签页打开": "Open in new tab",
  "复制链接": "Copy link",
  "编辑": "Edit",
  "大分类管理": "Category management",
  "新建分组": "New group",
  "编辑名称与图标": "Edit name and icon",
  "删除大分类": "Delete category",
  "名称": "Name",
  "网址": "URL",
  "文件夹": "Group",
  "未放入分组": "Ungrouped",
  "输入名称": "Enter a name",
  "大分类名称": "Category name",
  "例如：开发工具": "e.g. Developer Tools",
  "选择图标": "Choose an icon",
  "请填写名称和网址": "Enter a name and URL",
  "网址格式不正确": "The URL is invalid",
  "添加": "Add",
  "保存": "Save",
  "新增分组": "Add group",
  "重命名分组": "Rename group",
  "新增分类": "Add category",
  "重命名分类": "Rename category",
  "书签搜索不可用": "Bookmark search unavailable",
  "AI 书签搜索失败": "AI bookmark search failed",
  "没有找到相关书签": "No related bookmarks found",
  "没有找到高度相关书签": "No highly relevant bookmarks found",
  "找到 {count} 个相关书签": "Found {count} related bookmarks",
  "找到 {count} 个高度相关书签": "Found {count} highly relevant bookmarks",
  "书签搜索结果": "Bookmark search results",
  "书签搜索结果列表": "Bookmark search result list",
  "证据分层排序": "Evidence-ranked",
  "完整条件匹配": "Full-condition match",
  "AI 主题检索": "AI topic search",
  "AI 语义检索": "AI semantic search",
  "理解为": "Interpreted as",
  "打开 AI 设置": "Open AI settings",
  "未分类": "Uncategorized",
  "直接命中": "Direct match",
  "等价名称": "Equivalent name",
  "相关主题": "Related topic",
  "条件完整": "Complete conditions",
  "可验证命中": "Verifiable match",
  "描述你希望怎样整理书签": "Describe how you want to organize bookmarks",
  "AI 只生成计划，确认后才执行":
    "AI creates a plan and runs it only after confirmation",
  "自然语言命令示例": "Natural-language command examples",
  "AI 命令执行计划": "AI command plan",
  "正在生成安全执行计划": "Creating a safe execution plan",
  "命令没有完成": "Command did not complete",
  "命令执行结果": "Command result",
  "关闭命令面板": "Close command panel",
  "重新解析": "Parse again",
  "AI 理解": "AI interpretation",
  "书签结构统计": "Bookmark structure statistics",
  "命令提示": "Command notices",
  "命令候选书签": "Command candidate bookmarks",
  "全选": "Select all",
  "全不选": "Select none",
  "撤销本次操作": "Undo this action",
  "确认执行": "Confirm and run",
  "关闭": "Close",
  "完成": "Done",
  "正在整理书签…": "Organizing bookmarks…",
  "{count} 个书签": "{count} bookmarks",
  "{title}书签与分组": "{title} bookmarks and groups",
  "添加未分组书签": "Add ungrouped bookmark",
  "添加书签": "Add bookmark",
  "未分组": "Ungrouped",
  "关闭分组": "Close group",
  "添加书签，或从其他位置拖入这里": "Add a bookmark or drag one here",
  "移动书签到": "Move bookmark to",
  "移动到": "Move to",
  "松开创建分组": "Drop to create a group",
} as const;

export type TranslationKey = keyof typeof EN_MESSAGES;
export const TRANSLATION_KEYS = Object.keys(EN_MESSAGES) as TranslationKey[];

const LOCALIZED_MESSAGES: Record<Exclude<AppLocale, "zh-CN">, Record<string, string>> = {
  en: EN_MESSAGES,
  "zh-TW": zhTwMessages,
  ja: jaMessages,
  ko: koMessages,
};

export function resolveLanguage(
  preference: LanguagePreference,
  browserLanguage = typeof navigator === "undefined"
    ? "zh-CN"
    : navigator.language,
): AppLocale {
  if (preference !== "system") return preference;

  const normalized = browserLanguage.replaceAll("_", "-").toLowerCase();
  if (normalized.startsWith("zh")) {
    return normalized.includes("hant") ||
      normalized.startsWith("zh-tw") ||
      normalized.startsWith("zh-hk") ||
      normalized.startsWith("zh-mo")
      ? "zh-TW"
      : "zh-CN";
  }
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";
  return "en";
}

export function translate(
  preference: LanguagePreference,
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  const locale = resolveLanguage(preference);
  const template = locale === "zh-CN"
    ? key
    : LOCALIZED_MESSAGES[locale][key] ?? EN_MESSAGES[key];
  return Object.entries(values).reduce(
    (result, [name, value]) =>
      result.replaceAll("{" + name + "}", String(value)),
    template as string,
  );
}

export function localizeText(
  locale: AppLocale,
  source: string,
  englishFallback: string,
): string {
  if (locale === "zh-CN") return source;
  if (locale === "en") return englishFallback;
  return LOCALIZED_MESSAGES[locale][source] ?? englishFallback;
}

interface I18nContextValue {
  language: LanguagePreference;
  locale: AppLocale;
  t(key: TranslationKey, values?: TranslationValues): string;
  localize(source: string, englishFallback: string): string;
}

const I18nContext = createContext<I18nContextValue>({
  language: "system",
  locale: "zh-CN",
  t: (key, values) => translate("zh-CN", key, values),
  localize: (source) => source,
});

export function I18nProvider({
  language,
  children,
}: {
  language: LanguagePreference;
  children: ReactNode;
}) {
  const locale = resolveLanguage(language);
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale,
      t: (key, values) => translate(language, key, values),
      localize: (source, englishFallback) =>
        localizeText(locale, source, englishFallback),
    }),
    [language, locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
