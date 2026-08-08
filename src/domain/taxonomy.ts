import { UNCATEGORIZED_TITLE } from "./layout";

export const OTHER_CATEGORY_TITLE = "其他";
export const MAX_AI_CATEGORIES = 24;

export const BASE_CATEGORY_CANDIDATES = [
  "工作办公",
  "开发技术",
  "AI与自动化",
  "设计创意",
  "产品运营",
  "营销增长",
  "商业创业",
  "财经投资",
  "学习教育",
  "研究知识",
  "新闻资讯",
  "写作发布",
  "效率工具",
  "社交社区",
  "影音娱乐",
  "游戏",
  "购物消费",
  "旅行地图",
  "健康运动",
  "生活服务",
] as const;

const CATEGORY_ALIASES: Record<string, string> = {
  工作: "工作办公",
  办公: "工作办公",
  商务: "工作办公",
  work: "工作办公",
  office: "工作办公",
  开发: "开发技术",
  编程: "开发技术",
  技术: "开发技术",
  代码: "开发技术",
  运维: "开发技术",
  development: "开发技术",
  dev: "开发技术",
  programming: "开发技术",
  coding: "开发技术",
  ai: "AI与自动化",
  人工智能: "AI与自动化",
  机器学习: "AI与自动化",
  llm: "AI与自动化",
  automation: "AI与自动化",
  设计: "设计创意",
  design: "设计创意",
  创意: "设计创意",
  产品: "产品运营",
  运营: "产品运营",
  product: "产品运营",
  operation: "产品运营",
  operations: "产品运营",
  seo: "营销增长",
  营销: "营销增长",
  增长: "营销增长",
  marketing: "营销增长",
  growth: "营销增长",
  商业: "商业创业",
  创业: "商业创业",
  business: "商业创业",
  startup: "商业创业",
  财经: "财经投资",
  金融: "财经投资",
  理财: "财经投资",
  投资: "财经投资",
  finance: "财经投资",
  investing: "财经投资",
  学习: "学习教育",
  教育: "学习教育",
  课程: "学习教育",
  study: "学习教育",
  learning: "学习教育",
  education: "学习教育",
  研究: "研究知识",
  知识: "研究知识",
  阅读: "研究知识",
  research: "研究知识",
  knowledge: "研究知识",
  资讯: "新闻资讯",
  新闻: "新闻资讯",
  媒体: "新闻资讯",
  news: "新闻资讯",
  media: "新闻资讯",
  写作: "写作发布",
  发布: "写作发布",
  writing: "写作发布",
  publishing: "写作发布",
  工具: "效率工具",
  生产力: "效率工具",
  tools: "效率工具",
  utilities: "效率工具",
  productivity: "效率工具",
  社交: "社交社区",
  社区: "社交社区",
  social: "社交社区",
  community: "社交社区",
  娱乐: "影音娱乐",
  音乐: "影音娱乐",
  视频: "影音娱乐",
  电影: "影音娱乐",
  entertainment: "影音娱乐",
  music: "影音娱乐",
  video: "影音娱乐",
  game: "游戏",
  games: "游戏",
  gaming: "游戏",
  购物: "购物消费",
  消费: "购物消费",
  shopping: "购物消费",
  旅行: "旅行地图",
  旅游: "旅行地图",
  地图: "旅行地图",
  travel: "旅行地图",
  maps: "旅行地图",
  健康: "健康运动",
  运动: "健康运动",
  health: "健康运动",
  fitness: "健康运动",
  生活: "生活服务",
  服务: "生活服务",
  life: "生活服务",
  services: "生活服务",
};

export function normalizeCategoryTitle(
  value: string | undefined,
  allowedCategories: readonly string[] = BASE_CATEGORY_CANDIDATES,
): string {
  const cleaned = cleanTitle(value, 16);
  if (!cleaned || cleaned === UNCATEGORIZED_TITLE) return UNCATEGORIZED_TITLE;
  if (cleaned === OTHER_CATEGORY_TITLE) return OTHER_CATEGORY_TITLE;
  const aliased = CATEGORY_ALIASES[cleaned.toLocaleLowerCase()] ?? cleaned;
  const allowed = allowedCategories.find(
    (category) => category.toLocaleLowerCase() === aliased.toLocaleLowerCase(),
  );
  return allowed ?? OTHER_CATEGORY_TITLE;
}

export function normalizeCategoryPlan(
  values: unknown,
  existingCategories: readonly string[] = [],
): string[] {
  const source = Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string")
    : [];
  const allowedCustom = new Set(
    existingCategories
      .map((value) => cleanTitle(value, 16))
      .filter(
        (value) =>
          value && value !== UNCATEGORIZED_TITLE && value !== OTHER_CATEGORY_TITLE,
      ),
  );
  const output: string[] = [];
  let newCustomCategoryCount = 0;
  for (const raw of source) {
    const cleaned = cleanTitle(raw, 16);
    if (!cleaned || cleaned === UNCATEGORIZED_TITLE || cleaned === OTHER_CATEGORY_TITLE) {
      continue;
    }
    const canonical = CATEGORY_ALIASES[cleaned.toLocaleLowerCase()] ?? cleaned;
    const isBase = BASE_CATEGORY_CANDIDATES.includes(
      canonical as (typeof BASE_CATEGORY_CANDIDATES)[number],
    );
    const isExistingCustom = allowedCustom.has(canonical);
    const alreadyIncluded = output.some(
      (category) => category.toLocaleLowerCase() === canonical.toLocaleLowerCase(),
    );
    if (alreadyIncluded) continue;
    if (!isBase && !isExistingCustom) {
      if (newCustomCategoryCount >= 4) continue;
      newCustomCategoryCount += 1;
    }
    output.push(canonical);
    if (output.length >= MAX_AI_CATEGORIES) break;
  }
  return output.length > 0 ? output : [...BASE_CATEGORY_CANDIDATES];
}

export function normalizeGroupTitle(value: string | undefined): string | undefined {
  const cleaned = cleanTitle(value, 16);
  if (!cleaned || /^(其他|综合|常用|收藏|相关工具|待确认)$/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function cleanTitle(value: string | undefined, maxLength: number): string {
  return Array.from(
    (value ?? "")
      .trim()
      .replace(/[<>/\\|]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^(?:分类|分组)\s*[:：-]\s*/i, ""),
  )
    .slice(0, maxLength)
    .join("");
}
