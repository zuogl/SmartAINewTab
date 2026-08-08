import type {
  WidgetCurrencyCode,
  WidgetId,
  WidgetPreferences,
  WidgetWeatherLocationId,
} from "./types";

export const MIN_ACTIVE_WIDGETS = 2;
export const MAX_ACTIVE_WIDGETS = 8;

export interface WidgetDefinition {
  id: WidgetId;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  dataSource: "local" | "remote" | "mixed";
}

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    id: "weather",
    title: "天气预报",
    titleEn: "Weather",
    description: "当前天气与未来三天预报",
    descriptionEn: "Current conditions and a three-day forecast",
    dataSource: "remote",
  },
  {
    id: "calendar",
    title: "节假日日历",
    titleEn: "Holiday Calendar",
    description: "月历、周末与中国传统节日",
    descriptionEn: "Monthly calendar, weekends, and Chinese holidays",
    dataSource: "local",
  },
  {
    id: "world-clock",
    title: "世界时间",
    titleEn: "World Clocks",
    description: "同时查看多个国家和地区时间",
    descriptionEn: "View time across multiple regions",
    dataSource: "local",
  },
  {
    id: "currency",
    title: "货币换算",
    titleEn: "Currency",
    description: "常用货币实时参考汇率换算",
    descriptionEn: "Reference exchange rates for common currencies",
    dataSource: "remote",
  },
  {
    id: "hot-search",
    title: "多平台热搜",
    titleEn: "Trending",
    description: "百度、B站、GitHub 与 Hacker News",
    descriptionEn: "Baidu, Bilibili, GitHub, and Hacker News",
    dataSource: "remote",
  },
  {
    id: "bookmark-stats",
    title: "书签概览",
    titleEn: "Bookmark Overview",
    description: "大分类、分组和待整理数量",
    descriptionEn: "Categories, groups, and items to organize",
    dataSource: "local",
  },
  {
    id: "ai-progress",
    title: "AI 整理进度",
    titleEn: "AI Progress",
    description: "最近一次标签任务和覆盖率",
    descriptionEn: "Latest tagging task and coverage",
    dataSource: "local",
  },
  {
    id: "bookmark-health",
    title: "书签健康",
    titleEn: "Bookmark Health",
    description: "重复链接、死链与最近体检覆盖率",
    descriptionEn: "Duplicates, dead links, and scan coverage",
    dataSource: "mixed",
  },
  {
    id: "recent-bookmarks",
    title: "最近收藏",
    titleEn: "Recent Bookmarks",
    description: "快速打开最近加入的书签",
    descriptionEn: "Quickly open recently added bookmarks",
    dataSource: "local",
  },
  {
    id: "tag-overview",
    title: "标签雷达",
    titleEn: "Tag Radar",
    description: "当前使用最频繁的标签",
    descriptionEn: "Most frequently used tags",
    dataSource: "local",
  },
  {
    id: "focus-timer",
    title: "专注计时",
    titleEn: "Focus Timer",
    description: "内置 25 分钟番茄钟",
    descriptionEn: "Built-in 25-minute focus timer",
    dataSource: "local",
  },
  {
    id: "quick-note",
    title: "快捷便签",
    titleEn: "Quick Note",
    description: "随手记录并保存在本机",
    descriptionEn: "Capture a note and keep it locally",
    dataSource: "local",
  },
  {
    id: "daily-quote",
    title: "古籍警句",
    titleEn: "Daily Classic",
    description: "每日一条中国古籍原文",
    descriptionEn: "A daily quotation from a Chinese classic",
    dataSource: "local",
  },
];

export const DEFAULT_ACTIVE_WIDGET_IDS: WidgetId[] = [
  "weather",
  "calendar",
  "world-clock",
  "currency",
  "hot-search",
  "bookmark-stats",
];

export const WEATHER_LOCATIONS: Array<{
  id: WidgetWeatherLocationId;
  label: string;
  labelEn: string;
  country: string;
  countryEn: string;
  latitude: number;
  longitude: number;
}> = [
  { id: "beijing", label: "北京", labelEn: "Beijing", country: "中国", countryEn: "China", latitude: 39.9042, longitude: 116.4074 },
  { id: "shanghai", label: "上海", labelEn: "Shanghai", country: "中国", countryEn: "China", latitude: 31.2304, longitude: 121.4737 },
  { id: "shenzhen", label: "深圳", labelEn: "Shenzhen", country: "中国", countryEn: "China", latitude: 22.5431, longitude: 114.0579 },
  { id: "hong-kong", label: "香港", labelEn: "Hong Kong", country: "中国", countryEn: "China", latitude: 22.3193, longitude: 114.1694 },
  { id: "singapore", label: "新加坡", labelEn: "Singapore", country: "新加坡", countryEn: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { id: "tokyo", label: "东京", labelEn: "Tokyo", country: "日本", countryEn: "Japan", latitude: 35.6762, longitude: 139.6503 },
  { id: "london", label: "伦敦", labelEn: "London", country: "英国", countryEn: "United Kingdom", latitude: 51.5072, longitude: -0.1276 },
  { id: "new-york", label: "纽约", labelEn: "New York", country: "美国", countryEn: "United States", latitude: 40.7128, longitude: -74.006 },
];

export const WORLD_CLOCKS = [
  { id: "shanghai", city: "上海", cityEn: "Shanghai", zone: "Asia/Shanghai", flag: "CN" },
  { id: "tokyo", city: "东京", cityEn: "Tokyo", zone: "Asia/Tokyo", flag: "JP" },
  { id: "london", city: "伦敦", cityEn: "London", zone: "Europe/London", flag: "GB" },
  { id: "new-york", city: "纽约", cityEn: "New York", zone: "America/New_York", flag: "US" },
] as const;

export const WIDGET_CURRENCIES: Array<{
  code: WidgetCurrencyCode;
  label: string;
  symbol: string;
}> = [
  { code: "CNY", label: "人民币", symbol: "¥" },
  { code: "USD", label: "美元", symbol: "$" },
  { code: "EUR", label: "欧元", symbol: "€" },
  { code: "GBP", label: "英镑", symbol: "£" },
  { code: "JPY", label: "日元", symbol: "¥" },
  { code: "HKD", label: "港币", symbol: "HK$" },
  { code: "SGD", label: "新加坡元", symbol: "S$" },
];

export const DEFAULT_WIDGET_PREFERENCES: WidgetPreferences = {
  enabled: true,
  activeIds: DEFAULT_ACTIVE_WIDGET_IDS,
  weatherLocationId: "shanghai",
  currencyBase: "CNY",
  currencyQuote: "USD",
};

export function normalizeWidgetPreferences(
  value?: Partial<WidgetPreferences>,
): WidgetPreferences {
  const allowed = new Set(WIDGET_DEFINITIONS.map((widget) => widget.id));
  const requested = [...new Set(value?.activeIds ?? DEFAULT_ACTIVE_WIDGET_IDS)].filter(
    (id): id is WidgetId => allowed.has(id as WidgetId),
  );
  const activeIds = [...requested];
  for (const fallback of DEFAULT_ACTIVE_WIDGET_IDS) {
    if (activeIds.length >= MIN_ACTIVE_WIDGETS) break;
    if (!activeIds.includes(fallback)) activeIds.push(fallback);
  }
  const validLocation = WEATHER_LOCATIONS.some(
    (location) => location.id === value?.weatherLocationId,
  );
  const validCurrency = (currency: unknown): currency is WidgetCurrencyCode =>
    WIDGET_CURRENCIES.some((item) => item.code === currency);
  let currencyBase = validCurrency(value?.currencyBase)
    ? value.currencyBase
    : DEFAULT_WIDGET_PREFERENCES.currencyBase;
  let currencyQuote = validCurrency(value?.currencyQuote)
    ? value.currencyQuote
    : DEFAULT_WIDGET_PREFERENCES.currencyQuote;
  if (currencyBase === currencyQuote) {
    currencyQuote = currencyBase === "USD" ? "CNY" : "USD";
  }
  return {
    enabled: value?.enabled ?? DEFAULT_WIDGET_PREFERENCES.enabled,
    activeIds: activeIds.slice(0, MAX_ACTIVE_WIDGETS),
    weatherLocationId: validLocation
      ? value!.weatherLocationId!
      : DEFAULT_WIDGET_PREFERENCES.weatherLocationId,
    currencyBase,
    currencyQuote,
  };
}

export type WidgetVisualSize = "compact" | "medium" | "large";

export function widgetVisualSize(
  count: number,
  index: number,
): WidgetVisualSize {
  if (count <= 2) return "large";
  if ((count === 3 || count === 5) && index === 0) return "large";
  if (count <= 4 || (count === 7 && index === 0)) return "medium";
  return "compact";
}

export function getChineseHoliday(date: Date): string | undefined {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 1 && day === 1) return "元旦";
  if (month === 5 && day === 1) return "劳动节";
  if (month === 10 && day >= 1 && day <= 3) return "国庆节";
  if (month === 4 && day === qingmingDay(date.getFullYear())) return "清明节";

  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric",
    }).formatToParts(date);
    const lunarMonth = parts.find((part) => part.type === "month")?.value;
    const lunarDay = parts.find((part) => part.type === "day")?.value;
    if (lunarMonth === "正月" && ["1", "2", "3", "初一", "初二", "初三"].includes(lunarDay ?? "")) {
      return "春节";
    }
    if (lunarMonth === "五月" && ["5", "初五"].includes(lunarDay ?? "")) return "端午节";
    if (lunarMonth === "八月" && ["15", "十五"].includes(lunarDay ?? "")) return "中秋节";
  } catch {
    // The fixed-date holidays above still remain available on older runtimes.
  }
  return undefined;
}

function qingmingDay(year: number) {
  const shortYear = year % 100;
  return Math.floor(shortYear * 0.2422 + 4.81) - Math.floor((shortYear - 1) / 4);
}
