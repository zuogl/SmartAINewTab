import { describe, expect, it } from "vitest";
import {
  adjacentCategoryId,
  categoryBoundaryDirection,
} from "@/domain/categoryScroll";

describe("single-category boundary scrolling", () => {
  const viewport = { top: 0, bottom: 900 };

  it("moves forward only after the active category reaches the bottom", () => {
    expect(
      categoryBoundaryDirection({ top: -700, bottom: 1_200 }, viewport, 120),
    ).toBeUndefined();
    expect(
      categoryBoundaryDirection({ top: -900, bottom: 899 }, viewport, 120),
    ).toBe("next");
  });

  it("moves backward only after the active category reaches the top", () => {
    expect(
      categoryBoundaryDirection({ top: -20, bottom: 1_400 }, viewport, -120),
    ).toBeUndefined();
    expect(
      categoryBoundaryDirection({ top: 1, bottom: 901 }, viewport, -120),
    ).toBe("previous");
  });

  it("ignores the opposite wheel direction and zero movement", () => {
    expect(
      categoryBoundaryDirection({ top: 0, bottom: 900 }, viewport, -120),
    ).toBe("previous");
    expect(
      categoryBoundaryDirection({ top: 0, bottom: 900 }, viewport, 120),
    ).toBe("next");
    expect(
      categoryBoundaryDirection({ top: 0, bottom: 900 }, viewport, 0),
    ).toBeUndefined();
  });

  it("selects adjacent categories without wrapping at either end", () => {
    const categoryIds = ["uncategorized", "tools", "learning"];
    expect(adjacentCategoryId(categoryIds, "tools", "previous")).toBe(
      "uncategorized",
    );
    expect(adjacentCategoryId(categoryIds, "tools", "next")).toBe("learning");
    expect(
      adjacentCategoryId(categoryIds, "uncategorized", "previous"),
    ).toBeUndefined();
    expect(
      adjacentCategoryId(categoryIds, "learning", "next"),
    ).toBeUndefined();
    expect(adjacentCategoryId(categoryIds, "missing", "next")).toBeUndefined();
  });
});
