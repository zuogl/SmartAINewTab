import type { ScreenDisplayPreferences } from "@/domain/types";
import {
  formatCalendarLine,
  formatClockTime,
  formatLunarDate,
} from "@/domain/timeDisplay";
import { useI18n } from "@/i18n";

interface HomeClockProps {
  date: Date;
  preferences: ScreenDisplayPreferences;
  preview?: boolean;
}

export function HomeClock({
  date,
  preferences,
  preview = false,
}: HomeClockProps) {
  const { locale } = useI18n();
  const [hours, minutes, seconds] = formatClockTime(date);
  const calendarLine = formatCalendarLine(date, preferences, locale);
  const lunarLine = preferences.showLunarDate
    ? formatLunarDate(date, locale)
    : "";
  const accessibleLabel = [
    `${hours}:${minutes}:${seconds}`,
    calendarLine,
    lunarLine,
  ]
    .filter(Boolean)
    .join(locale === "zh-CN" || locale === "zh-TW" ? "，" : locale === "ja" ? "、" : ", ");

  return (
    <time
      className={`home-time home-time-${preferences.timeStyle}${preview ? " is-preview" : ""}`}
      dateTime={date.toISOString()}
      aria-label={accessibleLabel}
    >
      <span className="clock-face" aria-hidden="true">
        <span className="clock-segment">{hours}</span>
        <span className="clock-separator">:</span>
        <span className="clock-segment">{minutes}</span>
        <span className="clock-separator">:</span>
        <span className="clock-segment clock-seconds">{seconds}</span>
      </span>
      {(calendarLine || lunarLine) && (
        <span className="clock-details" aria-hidden="true">
          {calendarLine && <span className="clock-calendar">{calendarLine}</span>}
          {lunarLine && <span className="clock-lunar">{lunarLine}</span>}
        </span>
      )}
    </time>
  );
}
