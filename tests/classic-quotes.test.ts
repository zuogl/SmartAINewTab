import { describe, expect, it } from "vitest";
import {
  CLASSIC_QUOTES,
  classicQuoteForDate,
} from "@/domain/classicQuotes";

describe("daily classic quotes", () => {
  it("keeps every quote attributed to a Chinese classic", () => {
    expect(CLASSIC_QUOTES.length).toBeGreaterThanOrEqual(30);
    for (const quote of CLASSIC_QUOTES) {
      expect(quote.text.length).toBeGreaterThan(4);
      expect(quote.source).toMatch(/^《.+》$/);
    }
  });

  it("returns the same quote throughout a local calendar day", () => {
    const morning = new Date(2026, 7, 3, 0, 0, 1);
    const evening = new Date(2026, 7, 3, 23, 59, 59);

    expect(classicQuoteForDate(morning)).toEqual(classicQuoteForDate(evening));
  });
});
