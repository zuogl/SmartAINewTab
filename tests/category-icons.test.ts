import { describe, expect, it } from "vitest";
import {
  CATEGORY_ICONS,
  chooseCategoryIcon,
} from "@/domain/categoryIcons";
import { CATEGORY_ICON_VALUES } from "@/domain/types";
import {
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICON_OPTIONS,
} from "@/app/icons";

describe("expanded category icon catalog", () => {
  it("keeps the type, picker, and automatic allocator on one complete catalog", () => {
    expect(CATEGORY_ICON_VALUES.length).toBeGreaterThanOrEqual(60);
    expect(CATEGORY_ICONS).toEqual(CATEGORY_ICON_VALUES);
    expect(CATEGORY_ICON_OPTIONS.map((option) => option.value).sort()).toEqual(
      [...CATEGORY_ICON_VALUES].sort(),
    );
    expect(new Set(CATEGORY_ICON_OPTIONS.map((option) => option.value)).size).toBe(
      CATEGORY_ICON_VALUES.length,
    );
    expect(CATEGORY_ICON_GROUPS).toHaveLength(11);
  });

  it("assigns dedicated semantic icons to categories that previously shared fallbacks", () => {
    expect(chooseCategoryIcon("AI与自动化", [])).toBe("robot");
    expect(chooseCategoryIcon("财经投资", [])).toBe("bank");
    expect(chooseCategoryIcon("健康运动", [])).toBe("health");
    expect(chooseCategoryIcon("游戏", [])).toBe("game");
    expect(chooseCategoryIcon("写作发布", [])).toBe("pen");
  });
});
