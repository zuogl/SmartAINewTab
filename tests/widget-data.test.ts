import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadCurrencyRate,
  loadHotSearchFeed,
  loadWeatherForecast,
} from "@/services/widgetData";

describe("widget remote data adapters", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("normalizes Open-Meteo forecast data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      current: {
        time: "2026-08-03T19:00",
        temperature_2m: 28.4,
        apparent_temperature: 30.1,
        relative_humidity_2m: 67,
        weather_code: 2,
        wind_speed_10m: 12,
      },
      daily: {
        time: ["2026-08-03", "2026-08-04"],
        weather_code: [2, 61],
        temperature_2m_max: [31, 29],
        temperature_2m_min: [24, 23],
        precipitation_probability_max: [10, 80],
      },
    })));

    const result = await loadWeatherForecast(31.23, 121.47, true);
    expect(result.temperature).toBe(28.4);
    expect(result.days[1]).toMatchObject({ code: 61, high: 29, low: 23 });
  });

  it("normalizes exchange rates without inventing a value", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      date: "2026-08-03",
      base: "CNY",
      quote: "USD",
      rate: 0.1394,
    })));
    await expect(loadCurrencyRate("CNY", "USD", true)).resolves.toEqual({
      base: "CNY",
      quote: "USD",
      rate: 0.1394,
      date: "2026-08-03",
    });
  });

  it("parses public Baidu and Bilibili lists and surfaces remote failures", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const hostname = new URL(String(input)).hostname;
      if (hostname === "top.baidu.com") {
        return Response.json({
          data: { cards: [{ content: [{ content: [{ word: "测试热点", index: 1 }] }] }] },
        });
      }
      if (hostname === "s.search.bilibili.com") {
        return Response.json({
          list: [{ hot_id: 7, show_name: "B站热点", heat_score: 12345 }],
        });
      }
      return new Response("unavailable", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await loadHotSearchFeed("baidu", true)).items[0]?.title).toBe("测试热点");
    expect((await loadHotSearchFeed("bilibili", true)).items[0]?.url).toContain("search.bilibili.com");
    await expect(loadHotSearchFeed("github", true)).rejects.toThrow("503");
  });
});
