import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVE_WIDGET_IDS,
  DEFAULT_WIDGET_PREFERENCES,
  getChineseHoliday,
  MAX_ACTIVE_WIDGETS,
  MIN_ACTIVE_WIDGETS,
  normalizeWidgetPreferences,
  WIDGET_DEFINITIONS,
  widgetVisualSize,
} from "@/domain/widgets";

describe("widget configuration domain", () => {
  it("offers thirteen distinct presets and defaults to six first-screen widgets", () => {
    expect(WIDGET_DEFINITIONS).toHaveLength(13);
    expect(new Set(WIDGET_DEFINITIONS.map((widget) => widget.id)).size).toBe(13);
    expect(DEFAULT_ACTIVE_WIDGET_IDS).toHaveLength(6);
    expect(DEFAULT_ACTIVE_WIDGET_IDS).toEqual(
      expect.arrayContaining([
        "currency",
        "world-clock",
        "calendar",
        "weather",
        "hot-search",
      ]),
    );
    expect(DEFAULT_WIDGET_PREFERENCES.enabled).toBe(true);
  });

  it("normalizes malformed preferences into the two-to-eight invariant", () => {
    const tooFew = normalizeWidgetPreferences({ activeIds: ["weather"] });
    expect(tooFew.activeIds.length).toBeGreaterThanOrEqual(MIN_ACTIVE_WIDGETS);

    const tooMany = normalizeWidgetPreferences({
      activeIds: WIDGET_DEFINITIONS.map((widget) => widget.id),
    });
    expect(tooMany.activeIds).toHaveLength(MAX_ACTIVE_WIDGETS);

    const invalid = normalizeWidgetPreferences({
      activeIds: ["not-a-widget" as never, "weather", "weather"],
      weatherLocationId: "unknown" as never,
      currencyBase: "USD",
      currencyQuote: "USD",
    });
    expect(invalid.activeIds[0]).toBe("weather");
    expect(new Set(invalid.activeIds).size).toBe(invalid.activeIds.length);
    expect(invalid.weatherLocationId).toBe("shanghai");
    expect(invalid.currencyBase).not.toBe(invalid.currencyQuote);
  });

  it("assigns different visual density for the same widget as first-screen count changes", () => {
    expect(widgetVisualSize(2, 0)).toBe("large");
    expect(widgetVisualSize(3, 0)).toBe("large");
    expect(widgetVisualSize(3, 1)).toBe("medium");
    expect(widgetVisualSize(5, 0)).toBe("large");
    expect(widgetVisualSize(5, 1)).toBe("compact");
    expect(widgetVisualSize(6, 0)).toBe("compact");
    expect(widgetVisualSize(7, 0)).toBe("medium");
    expect(widgetVisualSize(8, 7)).toBe("compact");
  });

  it("marks fixed Chinese holidays and weekends remain a presentation concern", () => {
    expect(getChineseHoliday(new Date(2026, 0, 1))).toBe("元旦");
    expect(getChineseHoliday(new Date(2026, 4, 1))).toBe("劳动节");
    expect(getChineseHoliday(new Date(2026, 9, 2))).toBe("国庆节");
    expect(getChineseHoliday(new Date(2026, 7, 3))).toBeUndefined();
  });
});
