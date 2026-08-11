import {
  CATEGORY_ICON_VALUES,
  type BookmarkCategory,
  type CategoryIcon,
} from "./types";

export const CATEGORY_ICONS: readonly CategoryIcon[] = CATEGORY_ICON_VALUES;

const PREFERRED_ICONS: Record<string, CategoryIcon> = {
  未分类: "archive",
  其他: "bookmark",
  工作: "briefcase",
  工作办公: "briefcase",
  收藏: "bookmark",
  项目: "layers",
  产品运营: "layers",
  项目管理: "checklist",
  学习: "study",
  学习教育: "study",
  生活: "home",
  生活服务: "home",
  资讯: "news",
  新闻资讯: "news",
  开发: "code",
  开发技术: "code",
  数据库: "database",
  云服务: "cloud",
  运维: "terminal",
  版本控制: "git",
  运营: "chart",
  营销增长: "marketing",
  SEO: "trend",
  财经投资: "bank",
  金融: "bank",
  支付: "credit-card",
  设计: "palette",
  设计创意: "palette",
  工具: "tools",
  效率工具: "tools",
  购物: "shopping",
  购物消费: "shopping",
  旅行: "travel",
  旅行地图: "travel",
  音乐: "music",
  视频: "video",
  影音娱乐: "video",
  社交: "community",
  社交社区: "community",
  灵感: "idea",
  AI与自动化: "robot",
  人工智能: "robot",
  自动化: "magic",
  商业创业: "rocket",
  研究知识: "book",
  笔记: "notebook",
  写作发布: "pen",
  游戏: "game",
  健康运动: "health",
  运动健身: "fitness",
  播客: "headphones",
  地图导航: "map",
};

export function chooseCategoryIcon(
  title: string,
  usedIcons: Iterable<CategoryIcon>,
): CategoryIcon {
  const used = new Set(usedIcons);
  const preferred = PREFERRED_ICONS[title];
  if (preferred && !used.has(preferred)) return preferred;
  return CATEGORY_ICONS.find((icon) => !used.has(icon)) ?? iconFromTitle(title);
}

export function ensureUniqueCategoryIcons(
  categories: BookmarkCategory[],
): BookmarkCategory[] {
  const used = new Set<CategoryIcon>();
  return categories.map((category) => {
    const preferred = PREFERRED_ICONS[category.title] ?? category.icon;
    const icon = !used.has(preferred)
      ? preferred
      : chooseCategoryIcon(category.title, used);
    used.add(icon);
    return { ...category, icon };
  });
}

function iconFromTitle(title: string): CategoryIcon {
  let hash = 0;
  for (const character of title) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return CATEGORY_ICONS[Math.abs(hash) % CATEGORY_ICONS.length]!;
}
