import type { AppSettings, SearchEngine } from "./types";
import { DEFAULT_BOOKMARK_HEALTH_PREFERENCES } from "./bookmarkHealth";
import { DEFAULT_WIDGET_PREFERENCES } from "./widgets";

export const DEFAULT_CLOUD_API_BASE_URL =
  import.meta.env.WXT_CLOUD_API_BASE_URL?.trim() ?? "";

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: "google",
    name: "Google",
    queryUrl: "https://www.google.com/search?q=",
  },
  {
    id: "baidu",
    name: "百度",
    queryUrl: "https://www.baidu.com/s?wd=",
  },
  {
    id: "bing",
    name: "Bing",
    queryUrl: "https://www.bing.com/search?q=",
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    queryUrl: "https://duckduckgo.com/?q=",
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  language: "system",
  engineId: "google",
  cloudApiBaseUrl: DEFAULT_CLOUD_API_BASE_URL,
  provider: {
    enabled: false,
    endpoint: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiKey: "",
    batchSize: 10,
  },
  autoTagNewBookmarks: false,
  autoOrganizeBookmarks: true,
  includeSummaries: false,
  openInNewTab: false,
  bookmarkHealth: DEFAULT_BOOKMARK_HEALTH_PREFERENCES,
  screenDisplay: {
    showTime: true,
    showDailyQuote: true,
    alwaysShowCategoryRail: true,
    showEmptyUncategorizedCategory: true,
    timeStyle: "minimal",
    showDate: true,
    showWeekday: true,
    showLunarDate: false,
  },
  widgets: DEFAULT_WIDGET_PREFERENCES,
  background: {
    currentAssetId: "builtin:misty-mountains",
    rotationEnabled: false,
    rotationInterval: "newtab",
    rotationOrder: "random",
    playlistIds: [
      "builtin:misty-mountains",
      "builtin:sea-cliffs",
      "builtin:emerald-forest",
      "builtin:snow-peaks",
      "builtin:copper-dunes",
      "builtin:alpine-milky-way",
    ],
    shuffleRemainingIds: [],
    lastRotatedAt: 0,
    overlayOpacity: 18,
    blur: 0,
  },
};
