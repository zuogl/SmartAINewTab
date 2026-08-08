import { DEFAULT_SETTINGS } from "./constants";
import type { ScreenDisplayPreferences, TimeStyle } from "./types";
import type { AppLocale } from "@/i18n";

export const TIME_STYLE_OPTIONS = [
  { value: "minimal", title: "极简留白", titleEn: "Minimal", description: "轻盈无框数字", descriptionEn: "Light, borderless digits" },
  { value: "bold", title: "宽屏粗体", titleEn: "Wide Bold", description: "醒目的大字时刻", descriptionEn: "Large, prominent time" },
  { value: "split", title: "分屏卡片", titleEn: "Split Cards", description: "时分秒独立分区", descriptionEn: "Separate hour, minute, and second cards" },
  { value: "flip", title: "翻页时钟", titleEn: "Flip Clock", description: "经典机械翻页感", descriptionEn: "Classic mechanical flip style" },
  { value: "neon", title: "霓虹数码", titleEn: "Neon Digital", description: "薄荷色发光数字", descriptionEn: "Glowing mint digits" },
  { value: "terminal", title: "终端矩阵", titleEn: "Terminal", description: "命令行仪表风格", descriptionEn: "Command-line dashboard style" },
  { value: "serif", title: "东方雅韵", titleEn: "Serif", description: "衬线字与古典气质", descriptionEn: "Serif type with a classic tone" },
  { value: "outline", title: "轮廓数字", titleEn: "Outline", description: "通透描边字形", descriptionEn: "Transparent outlined digits" },
  { value: "boxed", title: "仪表边框", titleEn: "Boxed", description: "完整边框包裹", descriptionEn: "A complete instrument-style frame" },
  { value: "stacked", title: "错落层叠", titleEn: "Stacked", description: "主次错位排版", descriptionEn: "Offset visual hierarchy" },
  { value: "compact", title: "胶囊时刻", titleEn: "Compact", description: "紧凑圆角信息块", descriptionEn: "Compact rounded information block" },
  { value: "soft", title: "柔光玻璃", titleEn: "Soft Glass", description: "轻柔半透明面板", descriptionEn: "A soft translucent panel" },
] as const satisfies ReadonlyArray<{
  value: TimeStyle;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
}>;

const TIME_STYLE_IDS = new Set<string>(
  TIME_STYLE_OPTIONS.map((option) => option.value),
);

const LEGACY_TIME_STYLE_MAP: Record<string, TimeStyle> = {
  digital: "minimal",
  date: "minimal",
  chinese: "serif",
};

export function normalizeTimeStyle(value: unknown): TimeStyle {
  if (typeof value !== "string") {
    return DEFAULT_SETTINGS.screenDisplay.timeStyle;
  }
  if (TIME_STYLE_IDS.has(value)) return value as TimeStyle;
  return LEGACY_TIME_STYLE_MAP[value] ?? DEFAULT_SETTINGS.screenDisplay.timeStyle;
}

export function normalizeScreenDisplayPreferences(
  value: unknown,
): ScreenDisplayPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS.screenDisplay };
  }
  const stored = value as Record<string, unknown>;
  return {
    showTime:
      typeof stored.showTime === "boolean"
        ? stored.showTime
        : DEFAULT_SETTINGS.screenDisplay.showTime,
    showDailyQuote:
      typeof stored.showDailyQuote === "boolean"
        ? stored.showDailyQuote
        : DEFAULT_SETTINGS.screenDisplay.showDailyQuote,
    alwaysShowCategoryRail:
      typeof stored.alwaysShowCategoryRail === "boolean"
        ? stored.alwaysShowCategoryRail
        : DEFAULT_SETTINGS.screenDisplay.alwaysShowCategoryRail,
    timeStyle: normalizeTimeStyle(stored.timeStyle),
    showDate:
      typeof stored.showDate === "boolean"
        ? stored.showDate
        : DEFAULT_SETTINGS.screenDisplay.showDate,
    showWeekday:
      typeof stored.showWeekday === "boolean"
        ? stored.showWeekday
        : DEFAULT_SETTINGS.screenDisplay.showWeekday,
    showLunarDate:
      typeof stored.showLunarDate === "boolean"
        ? stored.showLunarDate
        : DEFAULT_SETTINGS.screenDisplay.showLunarDate,
  };
}

export function formatClockTime(date: Date): [string, string, string] {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) =>
    String(value).padStart(2, "0"),
  ) as [string, string, string];
}

export function formatCalendarLine(
  date: Date,
  preferences: Pick<
    ScreenDisplayPreferences,
    "showDate" | "showWeekday"
  >,
  locale: AppLocale = "zh-CN",
): string {
  const parts: string[] = [];
  if (preferences.showDate) {
    parts.push(
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: locale === "en" ? "short" : "long",
        day: "numeric",
      }).format(date),
    );
  }
  if (preferences.showWeekday) {
    parts.push(new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date));
  }
  return parts.join(" · ");
}

export function formatLunarDate(date: Date, locale: AppLocale = "zh-CN"): string {
  try {
    if (locale !== "zh-CN" && locale !== "zh-TW") {
      const prefix = locale === "ja" ? "旧暦" : locale === "ko" ? "음력" : "Lunar";
      const formatted = new Intl.DateTimeFormat(`${locale}-u-ca-chinese`, {
        month: "long",
        day: "numeric",
      }).format(date);
      return `${prefix} ${formatted}`;
    }
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric",
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const rawDay = parts.find((part) => part.type === "day")?.value;
    const day = rawDay ? lunarDayName(Number(rawDay)) : undefined;
    if (!month || !day) return "";
    return locale === "zh-TW" ? `農曆${month}${day}` : `农历${month}${day}`;
  } catch {
    return "";
  }
}

function lunarDayName(day: number): string {
  const names = [
    "",
    "初一",
    "初二",
    "初三",
    "初四",
    "初五",
    "初六",
    "初七",
    "初八",
    "初九",
    "初十",
    "十一",
    "十二",
    "十三",
    "十四",
    "十五",
    "十六",
    "十七",
    "十八",
    "十九",
    "二十",
    "廿一",
    "廿二",
    "廿三",
    "廿四",
    "廿五",
    "廿六",
    "廿七",
    "廿八",
    "廿九",
    "三十",
  ];
  return names[day] ?? String(day);
}
