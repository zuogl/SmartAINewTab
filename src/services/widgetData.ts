import type { WidgetCurrencyCode } from "@/domain/types";

const CACHE_PREFIX = "smartNewTab.widgetCache.v1.";
const WEATHER_TTL = 20 * 60 * 1_000;
const CURRENCY_TTL = 4 * 60 * 60 * 1_000;
const HOT_SEARCH_TTL = 10 * 60 * 1_000;
const REQUEST_TIMEOUT = 9_000;

export const WEATHER_SERVICE_URL = "https://api.open-meteo.com";
export const CURRENCY_SERVICE_URL = "https://api.frankfurter.dev";

export interface WeatherDay {
  date: string;
  code: number;
  high: number;
  low: number;
  precipitationProbability: number;
}

export interface WeatherForecast {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  code: number;
  updatedAt: string;
  days: WeatherDay[];
}

export interface CurrencyRate {
  base: WidgetCurrencyCode;
  quote: WidgetCurrencyCode;
  rate: number;
  date: string;
}

export type HotSearchPlatform = "baidu" | "bilibili" | "github" | "hacker-news";

export function hotSearchServiceUrls(platform: HotSearchPlatform): string[] {
  const urls: Record<HotSearchPlatform, string> = {
    baidu: "https://top.baidu.com",
    bilibili: "https://s.search.bilibili.com",
    github: "https://api.github.com",
    "hacker-news": "https://hacker-news.firebaseio.com",
  };
  return [urls[platform]];
}

export interface HotSearchItem {
  id: string;
  title: string;
  url: string;
  metric?: string;
}

export interface HotSearchFeed {
  platform: HotSearchPlatform;
  updatedAt: number;
  items: HotSearchItem[];
}

export async function loadWeatherForecast(
  latitude: number,
  longitude: number,
  force = false,
): Promise<WeatherForecast> {
  const key = `weather:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
  return cachedRequest(key, WEATHER_TTL, force, async () => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "4",
    });
    const payload = await requestJson<{
      current?: {
        time?: string;
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    }>(`${WEATHER_SERVICE_URL}/v1/forecast?${params}`);
    const current = payload.current;
    const daily = payload.daily;
    if (
      typeof current?.temperature_2m !== "number" ||
      !Array.isArray(daily?.time)
    ) {
      throw new Error("天气服务返回了无法识别的数据");
    }
    return {
      temperature: current.temperature_2m,
      apparentTemperature: numberOr(current.apparent_temperature, current.temperature_2m),
      humidity: numberOr(current.relative_humidity_2m, 0),
      windSpeed: numberOr(current.wind_speed_10m, 0),
      code: numberOr(current.weather_code, 0),
      updatedAt: current.time ?? new Date().toISOString(),
      days: daily.time.slice(0, 4).map((date, index) => ({
        date,
        code: numberOr(daily.weather_code?.[index], 0),
        high: numberOr(daily.temperature_2m_max?.[index], 0),
        low: numberOr(daily.temperature_2m_min?.[index], 0),
        precipitationProbability: numberOr(
          daily.precipitation_probability_max?.[index],
          0,
        ),
      })),
    };
  });
}

export async function loadCurrencyRate(
  base: WidgetCurrencyCode,
  quote: WidgetCurrencyCode,
  force = false,
): Promise<CurrencyRate> {
  if (base === quote) return { base, quote, rate: 1, date: "即时" };
  return cachedRequest(`currency:${base}:${quote}`, CURRENCY_TTL, force, async () => {
    const payload = await requestJson<{
      date?: string;
      base?: string;
      quote?: string;
      rate?: number;
    }>(`${CURRENCY_SERVICE_URL}/v2/rate/${base}/${quote}`);
    if (typeof payload.rate !== "number" || !Number.isFinite(payload.rate)) {
      throw new Error("汇率服务返回了无法识别的数据");
    }
    return {
      base,
      quote,
      rate: payload.rate,
      date: payload.date ?? "最近工作日",
    };
  });
}

export async function loadHotSearchFeed(
  platform: HotSearchPlatform,
  force = false,
): Promise<HotSearchFeed> {
  return cachedRequest(`hot:${platform}`, HOT_SEARCH_TTL, force, async () => {
    const items = await hotSearchLoaders[platform]();
    if (items.length === 0) throw new Error("该平台当前没有返回榜单");
    return { platform, updatedAt: Date.now(), items: items.slice(0, 8) };
  });
}

const hotSearchLoaders: Record<
  HotSearchPlatform,
  () => Promise<HotSearchItem[]>
> = {
  baidu: async () => {
    const payload = await requestJson<{
      data?: {
        cards?: Array<{
          content?: Array<{ content?: Array<{ word?: string; url?: string; index?: number }> }>;
        }>;
      };
    }>("https://top.baidu.com/api/board?platform=wise&tab=realtime");
    const rows = payload.data?.cards
      ?.flatMap((card) => card.content ?? [])
      .flatMap((content) => content.content ?? []) ?? [];
    return rows
      .filter((row): row is typeof row & { word: string } => Boolean(row.word))
      .map((row, index) => ({
        id: `baidu-${index}-${row.word}`,
        title: row.word,
        url: row.url || `https://www.baidu.com/s?wd=${encodeURIComponent(row.word)}`,
        metric: row.index ? `#${row.index}` : undefined,
      }));
  },
  bilibili: async () => {
    const payload = await requestJson<{
      list?: Array<{
        hot_id?: number;
        keyword?: string;
        show_name?: string;
        heat_score?: number;
      }>;
    }>("https://s.search.bilibili.com/main/hotword");
    return (payload.list ?? [])
      .filter((row) => Boolean(row.show_name || row.keyword))
      .map((row, index) => {
        const title = row.show_name || row.keyword || "";
        return {
          id: String(row.hot_id ?? `bilibili-${index}`),
          title,
          url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}`,
          metric: compactNumber(row.heat_score),
        };
      });
  },
  github: async () => {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      q: `created:>${since}`,
      sort: "stars",
      order: "desc",
      per_page: "8",
    });
    const payload = await requestJson<{
      items?: Array<{
        id?: number;
        full_name?: string;
        html_url?: string;
        stargazers_count?: number;
      }>;
    }>(`https://api.github.com/search/repositories?${params}`, {
      Accept: "application/vnd.github+json",
    });
    return (payload.items ?? [])
      .filter((row): row is typeof row & { full_name: string; html_url: string } =>
        Boolean(row.full_name && row.html_url),
      )
      .map((row) => ({
        id: String(row.id ?? row.full_name),
        title: row.full_name,
        url: row.html_url,
        metric: row.stargazers_count ? `★ ${compactNumber(row.stargazers_count)}` : undefined,
      }));
  },
  "hacker-news": async () => {
    const ids = await requestJson<number[]>(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
    );
    const rows = await Promise.all(
      ids.slice(0, 8).map((id) =>
        requestJson<{
          id?: number;
          title?: string;
          url?: string;
          score?: number;
        }>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`),
      ),
    );
    return rows
      .filter((row): row is typeof row & { id: number; title: string } =>
        Boolean(row.id && row.title),
      )
      .map((row) => ({
        id: String(row.id),
        title: row.title,
        url: row.url || `https://news.ycombinator.com/item?id=${row.id}`,
        metric: row.score ? `${row.score} points` : undefined,
      }));
  },
};

async function requestJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`远程服务请求失败（${response.status}）`);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("远程服务响应超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedRequest<T>(
  key: string,
  ttl: number,
  force: boolean,
  loader: () => Promise<T>,
): Promise<T> {
  if (!force) {
    const cached = readCache<T>(key);
    if (cached && Date.now() - cached.savedAt < ttl) return cached.value;
  }
  try {
    const value = await loader();
    writeCache(key, value);
    return value;
  } catch (error) {
    const stale = readCache<T>(key);
    if (stale) return stale.value;
    throw error;
  }
}

function readCache<T>(key: string): { savedAt: number; value: T } | undefined {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: number; value?: T };
    if (typeof parsed.savedAt !== "number" || parsed.value === undefined) return undefined;
    return { savedAt: parsed.savedAt, value: parsed.value };
  } catch {
    return undefined;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ savedAt: Date.now(), value }),
    );
  } catch {
    // Widgets still work when cache storage is unavailable.
  }
}

function numberOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function compactNumber(value?: number) {
  if (!value) return undefined;
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
