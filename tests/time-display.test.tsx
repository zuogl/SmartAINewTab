import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeClock } from "@/app/HomeClock";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import {
  formatLunarDate,
  TIME_STYLE_OPTIONS,
} from "@/domain/timeDisplay";

const previewDate = new Date(2026, 7, 3, 16, 28, 9);

afterEach(cleanup);

describe("time display", () => {
  it("offers at least ten genuinely selectable visual styles", () => {
    expect(TIME_STYLE_OPTIONS).toHaveLength(12);
    expect(new Set(TIME_STYLE_OPTIONS.map((option) => option.value)).size).toBe(
      12,
    );
  });

  it("renders date, weekday and lunar date as independent content", () => {
    const { rerender } = render(
      <HomeClock
        date={previewDate}
        preferences={{
          ...DEFAULT_SETTINGS.screenDisplay,
          showDate: false,
          showWeekday: true,
          showLunarDate: false,
        }}
      />,
    );

    expect(screen.getByText("星期一")).toBeInTheDocument();
    expect(screen.queryByText(/2026年8月3日/)).not.toBeInTheDocument();
    expect(screen.queryByText(/农历/)).not.toBeInTheDocument();

    rerender(
      <HomeClock
        date={previewDate}
        preferences={{
          ...DEFAULT_SETTINGS.screenDisplay,
          showDate: true,
          showWeekday: false,
          showLunarDate: true,
        }}
      />,
    );

    expect(screen.getByText("2026年8月3日")).toBeInTheDocument();
    expect(screen.queryByText(/星期/)).not.toBeInTheDocument();
    expect(screen.getByText(formatLunarDate(previewDate))).toBeInTheDocument();
  });

  it("uses the selected visual style without changing the displayed content", () => {
    const { container } = render(
      <HomeClock
        date={previewDate}
        preferences={{
          ...DEFAULT_SETTINGS.screenDisplay,
          timeStyle: "flip",
          showLunarDate: true,
        }}
        preview
      />,
    );

    expect(container.querySelector(".home-time-flip.is-preview")).toBeTruthy();
    expect(screen.getByText("2026年8月3日 · 星期一")).toBeInTheDocument();
    expect(screen.getByText(formatLunarDate(previewDate))).toBeInTheDocument();
  });
});
