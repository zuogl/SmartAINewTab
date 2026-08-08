import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  Check,
  GearSix,
  Pause,
  Play,
  Stop,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { ClassicQuote } from "@/domain/classicQuotes";
import { UNCATEGORIZED_CATEGORY_ID } from "@/domain/layout";
import type {
  AiJob,
  BookmarkHealthPreferences,
  BookmarkHealthRecord,
  BookmarkRecord,
  WidgetCurrencyCode,
  WidgetId,
  WidgetPreferences,
  WorkspaceLayout,
} from "@/domain/types";
import {
  detectDuplicateGroups,
  summarizeBookmarkHealth,
} from "@/domain/bookmarkHealth";
import { loadBookmarkHealthRecords } from "@/services/bookmarkHealth";
import {
  getChineseHoliday,
  WEATHER_LOCATIONS,
  WIDGET_CURRENCIES,
  WIDGET_DEFINITIONS,
  widgetVisualSize,
  WORLD_CLOCKS,
  type WidgetVisualSize,
} from "@/domain/widgets";
import {
  CURRENCY_SERVICE_URL,
  hotSearchServiceUrls,
  loadCurrencyRate,
  loadHotSearchFeed,
  loadWeatherForecast,
  WEATHER_SERVICE_URL,
  type CurrencyRate,
  type HotSearchFeed,
  type HotSearchPlatform,
  type WeatherForecast,
} from "@/services/widgetData";
import { requestHostPermissions } from "@/services/hostPermissions";
import { WidgetIcon } from "./WidgetIcon";
import { useI18n, type AppLocale } from "@/i18n";

const QUICK_NOTE_KEY = "smartNewTab.widget.quickNote.v1";

interface WidgetDashboardProps {
  preferences: WidgetPreferences;
  healthPreferences: BookmarkHealthPreferences;
  now: Date;
  bookmarks: BookmarkRecord[];
  workspace: WorkspaceLayout;
  jobs: AiJob[];
  dailyQuote: ClassicQuote;
  onOpen(url: string): void;
  onOpenBookmark(url: string): void;
  onManage(): void;
  onOpenHealth(): void;
}

export function WidgetDashboard({
  preferences,
  healthPreferences,
  now,
  bookmarks,
  workspace,
  jobs,
  dailyQuote,
  onOpen,
  onOpenBookmark,
  onManage,
  onOpenHealth,
}: WidgetDashboardProps) {
  const { t, localize } = useI18n();
  const activeIds = preferences.activeIds.slice(0, 8);
  const definitions = new Map(WIDGET_DEFINITIONS.map((widget) => [widget.id, widget]));
  return (
    <section
      className={`widget-dashboard widget-count-${activeIds.length}`}
      aria-label={t("首屏小部件")}
    >
      <header className="widget-dashboard-heading">
        <div>
          <strong>{t("今日面板")}</strong>
          <span>
            {t("{count} 个小部件 · 向下滚动查看大分类", {
              count: activeIds.length,
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={onManage}
          aria-label={t("管理小部件")}
        >
          <GearSix size={16} /> {t("管理")}
        </button>
      </header>
      <div className="widget-grid">
        {activeIds.map((id, index) => {
          const definition = definitions.get(id);
          if (!definition) return null;
          const size = widgetVisualSize(activeIds.length, index);
          return (
            <article
              key={id}
              className="home-widget"
              data-widget-id={id}
              data-size={size}
            >
              <header className="home-widget-header">
                <span><WidgetIcon id={id} size={18} /></span>
                <strong>
                  {localize(definition.title, definition.titleEn)}
                </strong>
                {definition.dataSource === "remote" && <small>{t("实时")}</small>}
              </header>
              <WidgetBody
                id={id}
                size={size}
                preferences={preferences}
                healthPreferences={healthPreferences}
                now={now}
                bookmarks={bookmarks}
                workspace={workspace}
                jobs={jobs}
                dailyQuote={dailyQuote}
                onOpen={onOpen}
                onOpenBookmark={onOpenBookmark}
                onOpenHealth={onOpenHealth}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function WidgetBody({
  id,
  size,
  preferences,
  healthPreferences,
  now,
  bookmarks,
  workspace,
  jobs,
  dailyQuote,
  onOpen,
  onOpenBookmark,
  onOpenHealth,
}: {
  id: WidgetId;
  size: WidgetVisualSize;
  preferences: WidgetPreferences;
  healthPreferences: BookmarkHealthPreferences;
  now: Date;
  bookmarks: BookmarkRecord[];
  workspace: WorkspaceLayout;
  jobs: AiJob[];
  dailyQuote: ClassicQuote;
  onOpen(url: string): void;
  onOpenBookmark(url: string): void;
  onOpenHealth(): void;
}) {
  switch (id) {
    case "weather":
      return <WeatherWidget size={size} preferences={preferences} />;
    case "calendar":
      return <CalendarWidget size={size} now={now} />;
    case "world-clock":
      return <WorldClockWidget size={size} now={now} />;
    case "currency":
      return <CurrencyWidget size={size} preferences={preferences} />;
    case "hot-search":
      return <HotSearchWidget size={size} onOpen={onOpen} />;
    case "bookmark-stats":
      return <BookmarkStatsWidget bookmarks={bookmarks} workspace={workspace} />;
    case "ai-progress":
      return <AiProgressWidget bookmarks={bookmarks} jobs={jobs} />;
    case "bookmark-health":
      return (
        <BookmarkHealthWidget
          bookmarks={bookmarks}
          preferences={healthPreferences}
          onOpenHealth={onOpenHealth}
        />
      );
    case "recent-bookmarks":
      return <RecentBookmarksWidget size={size} bookmarks={bookmarks} onOpen={onOpenBookmark} />;
    case "tag-overview":
      return <TagOverviewWidget bookmarks={bookmarks} />;
    case "focus-timer":
      return <FocusTimerWidget />;
    case "quick-note":
      return <QuickNoteWidget />;
    case "daily-quote":
      return <DailyQuoteWidget quote={dailyQuote} />;
  }
}

function BookmarkHealthWidget({
  bookmarks,
  preferences,
  onOpenHealth,
}: {
  bookmarks: BookmarkRecord[];
  preferences: BookmarkHealthPreferences;
  onOpenHealth(): void;
}) {
  const { t } = useI18n();
  const [records, setRecords] = useState<BookmarkHealthRecord[]>([]);
  useEffect(() => {
    let mounted = true;
    const refresh = () =>
      void loadBookmarkHealthRecords().then((next) => {
        if (mounted) setRecords(next);
      });
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);
  const duplicates = useMemo(
    () =>
      detectDuplicateGroups(
        bookmarks,
        records,
        preferences.ignoredDuplicateKeys,
      ),
    [bookmarks, preferences.ignoredDuplicateKeys, records],
  );
  const summary = useMemo(
    () => summarizeBookmarkHealth(bookmarks, records, duplicates),
    [bookmarks, duplicates, records],
  );
  const coverage = summary.total
    ? Math.round((summary.checked / summary.total) * 100)
    : 0;
  const alerts =
    summary.confirmedDead + summary.suspectedDead + summary.duplicateGroups;
  return (
    <div className="health-widget widget-body">
      <div
        className="health-widget-ring"
        style={{ "--progress": `${coverage * 3.6}deg` } as React.CSSProperties}
      >
        <span><strong>{coverage}%</strong><small>{t("检测覆盖")}</small></span>
      </div>
      <div className="health-widget-copy">
        <strong>{alerts ? t("{count} 项需要查看", { count: alerts }) : t("当前没有健康提醒")}</strong>
        <span>{t("{duplicates} 组重复 · {dead} 条死链候选", {
          duplicates: summary.duplicateGroups,
          dead: summary.suspectedDead + summary.confirmedDead,
        })}</span>
        <button type="button" onClick={onOpenHealth}>{t("打开书签体检")}</button>
      </div>
    </div>
  );
}

function WeatherWidget({
  size,
  preferences,
}: {
  size: WidgetVisualSize;
  preferences: WidgetPreferences;
}) {
  const { locale, t, localize } = useI18n();
  const location = WEATHER_LOCATIONS.find(
    (item) => item.id === preferences.weatherLocationId,
  ) ?? WEATHER_LOCATIONS[1]!;
  const [forecast, setForecast] = useState<WeatherForecast>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  async function authorizeAndReload() {
    if (!(await requestHostPermissions([WEATHER_SERVICE_URL]))) {
      setError(t("未获得天气服务域名授权"));
      return;
    }
    setReload((value) => value + 1);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void loadWeatherForecast(location.latitude, location.longitude, reload > 0)
      .then((value) => active && setForecast(value))
      .catch((reason) => active && setError(readableError(reason, locale)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [location.latitude, location.longitude, reload]);
  if (loading && !forecast) return <WidgetLoading label={t("正在获取天气…")} />;
  if (error && !forecast) return <WidgetError message={error} onRetry={authorizeAndReload} />;
  if (!forecast) return null;
  return (
    <div className="weather-widget widget-body">
      <div className="weather-current">
        <span className="weather-symbol">{weatherSymbol(forecast.code)}</span>
        <div>
          <strong>{Math.round(forecast.temperature)}°</strong>
          <span>{weatherLabel(forecast.code, locale)} · {localize(location.label, location.labelEn)}</span>
        </div>
      </div>
      <div className="weather-metrics">
        <span>{t("体感 {value}°", { value: Math.round(forecast.apparentTemperature) })}</span>
        <span>{t("湿度 {value}%", { value: Math.round(forecast.humidity) })}</span>
        {size !== "compact" && <span>{t("风速 {value} km/h", { value: Math.round(forecast.windSpeed) })}</span>}
      </div>
      <div className="weather-days">
        {forecast.days.slice(1, size === "compact" ? 3 : 4).map((day) => (
          <span key={day.date}>
            <small>{weekdayShort(day.date, locale)}</small>
            <b>{weatherSymbol(day.code)}</b>
            <em>{Math.round(day.high)}°/{Math.round(day.low)}°</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function CalendarWidget({ size, now }: { size: WidgetVisualSize; now: Date }) {
  const { locale, t } = useI18n();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const days = useMemo(() => calendarDays(cursor), [cursor]);
  const visibleDays = size === "compact"
    ? days.filter((day) => sameCalendarWeek(day.date, now)).slice(0, 7)
    : days;
  return (
    <div className="calendar-widget widget-body">
      <div className="calendar-toolbar">
        <strong>{new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(cursor)}</strong>
        {size !== "compact" && (
          <span>
            <button type="button" aria-label={t("上个月")} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><CaretLeft size={14} /></button>
            <button type="button" aria-label={t("回到本月")} onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))}>{t("今")}</button>
            <button type="button" aria-label={t("下个月")} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><CaretRight size={14} /></button>
          </span>
        )}
      </div>
      <div className="calendar-weekdays">{calendarWeekdays(locale).map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-days">
        {visibleDays.map((day) => {
          const holiday = getChineseHoliday(day.date);
          const isToday = sameDate(day.date, now);
          return (
            <span
              key={day.key}
              className={`${day.inMonth ? "" : "is-outside"}${isToday ? " is-today" : ""}${holiday ? " is-holiday" : ""}`}
              title={holiday ? holidayLabel(holiday, locale) : undefined}
            >
              <b>{day.date.getDate()}</b>
              {holiday && size !== "compact" && <small>{holidayLabel(holiday, locale).replace("节", "")}</small>}
            </span>
          );
        })}
      </div>
      <div className="calendar-legend"><i />{t("节假日")} <span>{t("周末以淡色显示")}</span></div>
    </div>
  );
}

function WorldClockWidget({ size, now }: { size: WidgetVisualSize; now: Date }) {
  const { locale, localize } = useI18n();
  const clocks = WORLD_CLOCKS.slice(0, size === "compact" ? 3 : 4);
  return (
    <div className="world-clock-widget widget-body">
      {clocks.map((clock) => {
        const time = new Intl.DateTimeFormat(locale, {
          timeZone: clock.zone,
          hour: "2-digit",
          minute: "2-digit",
          second: size === "large" ? "2-digit" : undefined,
          hour12: false,
        }).format(now);
        const day = new Intl.DateTimeFormat(locale, {
          timeZone: clock.zone,
          weekday: "short",
          month: "numeric",
          day: "numeric",
        }).format(now);
        return (
          <div key={clock.id}>
            <span><b>{clock.flag}</b>{localize(clock.city, clock.cityEn)}</span>
            <strong>{time}</strong>
            <small>{day}</small>
          </div>
        );
      })}
    </div>
  );
}

function CurrencyWidget({
  size,
  preferences,
}: {
  size: WidgetVisualSize;
  preferences: WidgetPreferences;
}) {
  const { locale, t } = useI18n();
  const [base, setBase] = useState<WidgetCurrencyCode>(preferences.currencyBase);
  const [quote, setQuote] = useState<WidgetCurrencyCode>(preferences.currencyQuote);
  const [amount, setAmount] = useState("100");
  const [rate, setRate] = useState<CurrencyRate>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  async function authorizeAndReload() {
    if (!(await requestHostPermissions([CURRENCY_SERVICE_URL]))) {
      setError(t("未获得汇率服务域名授权"));
      return;
    }
    setReload((value) => value + 1);
  }
  useEffect(() => {
    let active = true;
    setError("");
    void loadCurrencyRate(base, quote, reload > 0)
      .then((value) => active && setRate(value))
      .catch((reason) => active && setError(readableError(reason, locale)));
    return () => { active = false; };
  }, [base, quote, reload]);
  const converted = Math.max(0, Number(amount) || 0) * (rate?.rate ?? 0);
  return (
    <div className="currency-widget widget-body">
      <div className="currency-row">
        <input aria-label={t("换算金额")} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} />
        <select aria-label={t("源货币")} value={base} onChange={(event) => setBase(event.target.value as WidgetCurrencyCode)}>
          {WIDGET_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
        </select>
      </div>
      <div className="currency-equals">≈</div>
      <div className="currency-result">
        <strong>{rate ? converted.toLocaleString(locale, { maximumFractionDigits: size === "large" ? 4 : 2 }) : "—"}</strong>
        <select aria-label={t("目标货币")} value={quote} onChange={(event) => setQuote(event.target.value as WidgetCurrencyCode)}>
          {WIDGET_CURRENCIES.filter((currency) => currency.code !== base).map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
        </select>
      </div>
      {error ? (
        <button className="widget-inline-error" onClick={() => void authorizeAndReload()}><ArrowClockwise size={13} /> {error}</button>
      ) : (
        <small className="currency-caption">1 {base} = {rate?.rate.toFixed(4) ?? "…"} {quote} · {rate?.date ?? t("加载中")}</small>
      )}
    </div>
  );
}

function HotSearchWidget({ size, onOpen }: { size: WidgetVisualSize; onOpen(url: string): void }) {
  const { locale, t } = useI18n();
  const [platform, setPlatform] = useState<HotSearchPlatform>("baidu");
  const [feed, setFeed] = useState<HotSearchFeed>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  async function selectPlatform(next: HotSearchPlatform) {
    if (!(await requestHostPermissions(hotSearchServiceUrls(next)))) {
      setError(t("未获得该榜单服务域名授权"));
      return;
    }
    setPlatform(next);
    if (next === platform) setReload((value) => value + 1);
  }
  async function authorizeAndReload() {
    if (!(await requestHostPermissions(hotSearchServiceUrls(platform)))) {
      setError(t("未获得该榜单服务域名授权"));
      return;
    }
    setReload((value) => value + 1);
  }
  useEffect(() => {
    let active = true;
    setFeed(undefined);
    setError("");
    void loadHotSearchFeed(platform, reload > 0)
      .then((value) => active && setFeed(value))
      .catch((reason) => active && setError(readableError(reason, locale)));
    return () => { active = false; };
  }, [platform, reload]);
  const labels: Array<[HotSearchPlatform, string]> = [
    ["baidu", locale === "zh-CN" || locale === "zh-TW" ? "百度" : "Baidu"],
    ["bilibili", locale === "zh-CN" || locale === "zh-TW" ? "B站" : "Bilibili"],
    ["github", "GitHub"],
    ["hacker-news", "HN"],
  ];
  return (
    <div className="hot-search-widget widget-body">
      <div className="hot-platforms">
        {labels.map(([id, label]) => (
          <button type="button" key={id} className={platform === id ? "is-active" : ""} onClick={() => void selectPlatform(id)}>{label}</button>
        ))}
      </div>
      {error ? <WidgetError message={error} onRetry={authorizeAndReload} /> : !feed ? <WidgetLoading label={t("正在读取榜单…")} /> : (
        <ol className="hot-search-list">
          {feed.items.slice(0, size === "large" ? 8 : size === "medium" ? 6 : 4).map((item, index) => (
            <li key={item.id}>
              <button type="button" onClick={() => onOpen(item.url)}>
                <b>{index + 1}</b><span>{item.title}</span>{item.metric && <small>{item.metric}</small>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BookmarkStatsWidget({ bookmarks, workspace }: { bookmarks: BookmarkRecord[]; workspace: WorkspaceLayout }) {
  const { t } = useI18n();
  const category = workspace.categories.find((item) => item.id === UNCATEGORIZED_CATEGORY_ID);
  const groupCount = workspace.categories.reduce((sum, item) => sum + item.groups.length, 0);
  const groupedCount = workspace.categories.reduce(
    (sum, item) => sum + item.groups.reduce((groupSum, group) => groupSum + group.bookmarkIds.length, 0),
    0,
  );
  const tagged = bookmarks.filter((bookmark) => bookmark.aiTags.length > 0).length;
  return (
    <div className="stats-widget widget-body">
      <div><strong>{bookmarks.length}</strong><span>{t("全部书签")}</span></div>
      <div><strong>{workspace.categories.length}</strong><span>{t("大分类")}</span></div>
      <div><strong>{groupCount}</strong><span>{t("小分组")}</span></div>
      <div><strong>{category?.bookmarkIds.length ?? 0}</strong><span>{t("待整理")}</span></div>
      <div className="stats-progress"><span style={{ width: `${bookmarks.length ? Math.round((tagged / bookmarks.length) * 100) : 0}%` }} /><small>{t("AI 标签覆盖 {tagged}/{total}", { tagged, total: bookmarks.length })}</small></div>
      <small className="stats-footnote">{t("已进入小分组 {grouped} 个 · 隐藏 {hidden} 个", { grouped: groupedCount, hidden: workspace.hiddenBookmarkIds.length })}</small>
    </div>
  );
}

function AiProgressWidget({ bookmarks, jobs }: { bookmarks: BookmarkRecord[]; jobs: AiJob[] }) {
  const { locale, t } = useI18n();
  const latest = jobs[0];
  const tagged = bookmarks.filter((bookmark) => bookmark.aiTags.length > 0).length;
  const coverage = bookmarks.length ? Math.round((tagged / bookmarks.length) * 100) : 0;
  const progress = latest?.bookmarkIds.length
    ? Math.round((latest.processed / latest.bookmarkIds.length) * 100)
    : coverage;
  return (
    <div className="ai-progress-widget widget-body">
      <div className="ai-progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
        <span><strong>{progress}%</strong><small>{latest ? t("当前任务") : t("标签覆盖")}</small></span>
      </div>
      <div className="ai-progress-copy">
        <strong>{latest ? aiStatusText(latest.status, latest.phase, locale) : t("尚无任务")}</strong>
        <span>{latest
          ? t("已处理 {processed} · 失败 {failed}", { processed: latest.processed, failed: latest.failed })
          : t("{tagged}/{total} 个书签已有 AI 标签", { tagged, total: bookmarks.length })}</span>
        {latest && <small>{t("{time} 更新", { time: new Date(latest.updatedAt).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" }) })}</small>}
      </div>
    </div>
  );
}

function RecentBookmarksWidget({ size, bookmarks, onOpen }: { size: WidgetVisualSize; bookmarks: BookmarkRecord[]; onOpen(url: string): void }) {
  const { locale, t } = useI18n();
  const recent = [...bookmarks]
    .filter((bookmark) => bookmark.dateAdded)
    .sort((left, right) => (right.dateAdded ?? 0) - (left.dateAdded ?? 0))
    .slice(0, size === "large" ? 7 : size === "medium" ? 5 : 3);
  return (
    <div className="recent-widget widget-body">
      {recent.length === 0 ? <p className="widget-empty">{t("暂无带时间记录的书签")}</p> : recent.map((bookmark) => (
        <button key={bookmark.id} type="button" onClick={() => onOpen(bookmark.url)}>
          <span>{bookmark.title.slice(0, 1).toUpperCase()}</span>
          <b>{bookmark.title}</b>
          <small>{bookmark.dateAdded ? relativeTime(bookmark.dateAdded, locale) : ""}</small>
        </button>
      ))}
    </div>
  );
}

function TagOverviewWidget({ bookmarks }: { bookmarks: BookmarkRecord[] }) {
  const { t } = useI18n();
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bookmark of bookmarks) {
      for (const tag of [...bookmark.tags, ...bookmark.aiTags]) {
        const normalized = tag.trim();
        if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }
    return [...counts].sort((left, right) => right[1] - left[1]).slice(0, 12);
  }, [bookmarks]);
  return (
    <div className="tag-overview-widget widget-body">
      {tags.length ? tags.map(([tag, count], index) => (
        <span key={tag} style={{ "--tag-weight": Math.max(0.78, 1.18 - index * 0.035) } as React.CSSProperties}>{tag}<small>{count}</small></span>
      )) : <p className="widget-empty">{t("完成 AI 标签任务后会生成标签雷达")}</p>}
    </div>
  );
}

function FocusTimerWidget() {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          setRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  const progress = 1 - seconds / (25 * 60);
  return (
    <div className="focus-widget widget-body">
      <div className="focus-time"><strong>{minutes}:{remainder}</strong><span>{t("专注一个清晰的小目标")}</span></div>
      <div className="focus-track"><span style={{ width: `${progress * 100}%` }} /></div>
      <div className="focus-actions">
        <button type="button" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}{running ? t("暂停") : t("开始")}</button>
        <button type="button" onClick={() => { setRunning(false); setSeconds(25 * 60); }}><Stop size={15} />{t("重置")}</button>
      </div>
    </div>
  );
}

function QuickNoteWidget() {
  const { t } = useI18n();
  const [note, setNote] = useState(() => {
    try { return localStorage.getItem(QUICK_NOTE_KEY) ?? ""; } catch { return ""; }
  });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(QUICK_NOTE_KEY, note); } catch { /* local-only note */ }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 900);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [note]);
  return (
    <div className="quick-note-widget widget-body">
      <textarea aria-label={t("快捷便签内容")} value={note} maxLength={800} onChange={(event) => { setSaved(false); setNote(event.target.value); }} placeholder={t("写下今天最重要的事情…")} />
      <small>{saved ? <><Check size={12} /> {t("已保存在本机")}</> : `${note.length}/800`}</small>
    </div>
  );
}

function DailyQuoteWidget({ quote }: { quote: ClassicQuote }) {
  return (
    <div className="quote-widget widget-body">
      <blockquote>“{quote.text}”</blockquote>
      <span>{quote.source}</span>
    </div>
  );
}

function WidgetLoading({ label }: { label: string }) {
  return <div className="widget-loading"><i /><span>{label}</span></div>;
}

function WidgetError({ message, onRetry }: { message: string; onRetry(): void | Promise<void> }) {
  const { t } = useI18n();
  return <div className="widget-error"><span>{message}</span><button type="button" onClick={() => void onRetry()}><ArrowClockwise size={14} />{t("授权并重试")}</button></div>;
}

function calendarDays(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      date,
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      inMonth: date.getMonth() === cursor.getMonth(),
    };
  });
}

function sameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function sameCalendarWeek(left: Date, right: Date) {
  const monday = (date: Date) => {
    const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
    return value.getTime();
  };
  return monday(left) === monday(right);
}

function weekdayShort(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(`${value}T12:00:00`));
}

function calendarWeekdays(locale: AppLocale) {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
      new Date(2026, 7, 3 + index, 12),
    ),
  );
}

function weatherSymbol(code: number) {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "❄️";
  return "⛈️";
}

function weatherLabel(code: number, locale: AppLocale) {
  const labels: Record<AppLocale, readonly string[]> = {
    "zh-CN": ["晴", "多云", "有雾", "有雨", "有雪", "阵雨", "阵雪", "雷雨"],
    "zh-TW": ["晴朗", "多雲", "有霧", "有雨", "有雪", "陣雨", "陣雪", "雷雨"],
    ja: ["晴れ", "曇り", "霧", "雨", "雪", "にわか雨", "にわか雪", "雷雨"],
    ko: ["맑음", "흐림", "안개", "비", "눈", "소나기", "눈 소나기", "뇌우"],
    en: ["Clear", "Cloudy", "Foggy", "Rain", "Snow", "Showers", "Snow showers", "Thunderstorm"],
  };
  const index = code === 0 ? 0 : code <= 3 ? 1 : code <= 48 ? 2 : code <= 67 ? 3 : code <= 77 ? 4 : code <= 82 ? 5 : code <= 86 ? 6 : 7;
  return labels[locale][index];
}

function aiStatusText(status: AiJob["status"], phase: AiJob["phase"] | undefined, locale: AppLocale) {
  const localized: Record<Exclude<AppLocale, "zh-CN">, {
    phases: Partial<Record<NonNullable<AiJob["phase"]>, string>>;
    statuses: Record<AiJob["status"], string>;
    processing: string;
  }> = {
    en: {
      phases: { planning: "Planning categories", tagging: "Tagging and categorizing", "waiting-retry": "Waiting to retry failed items", grouping: "Planning groups", rebuilding: "Rebuilding workspace" },
      statuses: { queued: "Waiting", running: "Processing", paused: "Paused", cancelled: "Cancelled", failed: "Task failed", completed: "Latest task completed" },
      processing: "Processing",
    },
    "zh-TW": {
      phases: { planning: "正在規劃一級分類", tagging: "正在加上標籤與分類", "waiting-retry": "等待重試失敗項目", grouping: "正在規劃全域分組", rebuilding: "正在重建工作區" },
      statuses: { queued: "等待處理", running: "正在處理", paused: "已暫停", cancelled: "已取消", failed: "任務失敗", completed: "最近任務已完成" },
      processing: "正在處理",
    },
    ja: {
      phases: { planning: "カテゴリーを計画中", tagging: "タグ付けと分類を実行中", "waiting-retry": "失敗項目の再試行待ち", grouping: "グループを計画中", rebuilding: "ワークスペースを再構築中" },
      statuses: { queued: "待機中", running: "処理中", paused: "一時停止", cancelled: "キャンセル済み", failed: "タスク失敗", completed: "最新タスク完了" },
      processing: "処理中",
    },
    ko: {
      phases: { planning: "카테고리 계획 중", tagging: "태그 및 분류 처리 중", "waiting-retry": "실패 항목 재시도 대기 중", grouping: "그룹 계획 중", rebuilding: "작업 공간 재구성 중" },
      statuses: { queued: "대기 중", running: "처리 중", paused: "일시 중지됨", cancelled: "취소됨", failed: "작업 실패", completed: "최근 작업 완료" },
      processing: "처리 중",
    },
  };
  if (locale !== "zh-CN") {
    const labels = localized[locale];
    if (phase && phase !== "completed" && (status === "queued" || status === "running" || status === "failed")) {
      return labels.phases[phase] ?? labels.processing;
    }
    return labels.statuses[status];
  }
  const phaseLabels: Partial<Record<NonNullable<AiJob["phase"]>, string>> = {
    planning: "正在规划一级分类",
    tagging: "正在打标签与分类",
    "waiting-retry": "等待失败项重试",
    grouping: "正在全局规划分组",
    rebuilding: "正在重建工作区",
  };
  if (
    phase &&
    phase !== "completed" &&
    (status === "queued" || status === "running" || status === "failed")
  ) {
    return phaseLabels[phase] ?? "正在处理";
  }
  const labels: Record<AiJob["status"], string> = {
    queued: "等待处理",
    running: "正在处理",
    paused: "已暂停",
    cancelled: "已取消",
    failed: "任务失败",
    completed: "最近任务已完成",
  };
  return labels[status];
}

function relativeTime(timestamp: number, locale: AppLocale) {
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (locale !== "zh-CN") {
    const words: Record<Exclude<AppLocale, "zh-CN">, { today: string; yesterday: string; days(count: number): string }> = {
      en: { today: "Today", yesterday: "Yesterday", days: (count) => `${count} days ago` },
      "zh-TW": { today: "今天", yesterday: "昨天", days: (count) => `${count} 天前` },
      ja: { today: "今日", yesterday: "昨日", days: (count) => `${count}日前` },
      ko: { today: "오늘", yesterday: "어제", days: (count) => `${count}일 전` },
    };
    if (days === 0) return words[locale].today;
    if (days === 1) return words[locale].yesterday;
    if (days < 30) return words[locale].days(days);
    return new Date(timestamp).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
  }
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function readableError(error: unknown, locale: AppLocale) {
  if (error instanceof Error) return error.message;
  return {
    "zh-CN": "数据暂时不可用",
    "zh-TW": "資料暫時無法使用",
    ja: "データを一時的に利用できません",
    ko: "데이터를 일시적으로 사용할 수 없습니다",
    en: "Data is temporarily unavailable",
  }[locale];
}

function holidayLabel(holiday: string, locale: AppLocale) {
  if (locale === "zh-CN") return holiday;
  const labels: Record<Exclude<AppLocale, "zh-CN">, Record<string, string>> = {
    "zh-TW": { 元旦: "元旦", 劳动节: "勞動節", 国庆节: "國慶節", 清明节: "清明節", 春节: "春節", 端午节: "端午節", 中秋节: "中秋節" },
    ja: { 元旦: "元日", 劳动节: "労働節", 国庆节: "国慶節", 清明节: "清明節", 春节: "春節", 端午节: "端午節", 中秋节: "中秋節" },
    ko: { 元旦: "신정", 劳动节: "노동절", 国庆节: "국경절", 清明节: "청명절", 春节: "춘절", 端午节: "단오절", 中秋节: "중추절" },
    en: { 元旦: "New Year's Day", 劳动节: "Labor Day", 国庆节: "National Day", 清明节: "Qingming Festival", 春节: "Spring Festival", 端午节: "Dragon Boat Festival", 中秋节: "Mid-Autumn Festival" },
  };
  return labels[locale][holiday] ?? holiday;
}
