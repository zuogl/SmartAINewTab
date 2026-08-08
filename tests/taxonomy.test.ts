import { describe, expect, it } from "vitest";
import {
  BASE_CATEGORY_CANDIDATES,
  MAX_AI_CATEGORIES,
  normalizeCategoryPlan,
  normalizeCategoryTitle,
  normalizeGroupTitle,
} from "@/domain/taxonomy";

describe("adaptive bookmark taxonomy", () => {
  it("provides a broad candidate set without restoring a fixed 11-category limit", () => {
    expect(BASE_CATEGORY_CANDIDATES.length).toBeGreaterThan(11);
    expect(BASE_CATEGORY_CANDIDATES.length).toBeLessThanOrEqual(MAX_AI_CATEGORIES);
    expect(BASE_CATEGORY_CANDIDATES).toEqual(
      expect.arrayContaining(["开发技术", "AI与自动化", "生活服务", "影音娱乐"]),
    );
  });

  it("normalizes aliases and routes categories outside the active plan to other", () => {
    const plan = ["效率工具", "开发技术", "影音娱乐"];
    expect(normalizeCategoryTitle("工具", plan)).toBe("效率工具");
    expect(normalizeCategoryTitle("开发", plan)).toBe("开发技术");
    expect(normalizeCategoryTitle("临时灵感", plan)).toBe("其他");
    expect(normalizeCategoryTitle(undefined, plan)).toBe("未分类");
  });

  it("keeps existing custom categories, limits new custom categories, and caps the plan", () => {
    const plan = normalizeCategoryPlan(
      [
        "开发",
        "我的项目",
        "自定义一",
        "自定义二",
        "自定义三",
        "自定义四",
        "自定义五",
        ...Array.from({ length: 30 }, (_, index) => `额外-${index}`),
      ],
      ["我的项目"],
    );

    expect(plan).toContain("开发技术");
    expect(plan).toContain("我的项目");
    expect(plan).toEqual(expect.arrayContaining(["自定义一", "自定义四"]));
    expect(plan).not.toContain("自定义五");
    expect(plan.length).toBeLessThanOrEqual(MAX_AI_CATEGORIES);
  });

  it("rejects broad placeholder names as secondary groups", () => {
    expect(normalizeGroupTitle("常用")).toBeUndefined();
    expect(normalizeGroupTitle("其他")).toBeUndefined();
    expect(normalizeGroupTitle("React 生态")).toBe("React 生态");
  });
});
