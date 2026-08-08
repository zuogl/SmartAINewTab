import {
  AirplaneTilt,
  Archive,
  BookOpen,
  BookmarkSimple,
  Briefcase,
  ChartLineUp,
  Code,
  GlobeHemisphereWest,
  GraduationCap,
  Heart,
  House,
  Lightbulb,
  MusicNotes,
  Newspaper,
  Palette,
  ShoppingBag,
  Stack,
  UsersThree,
  VideoCamera,
  Wrench,
  type IconProps,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { CategoryIcon } from "@/domain/types";

export const CATEGORY_ICON_OPTIONS: ReadonlyArray<{
  value: CategoryIcon;
  label: string;
}> = [
  { value: "briefcase", label: "工作" },
  { value: "bookmark", label: "收藏" },
  { value: "layers", label: "资源" },
  { value: "study", label: "学习" },
  { value: "heart", label: "生活" },
  { value: "globe", label: "网站" },
  { value: "code", label: "开发" },
  { value: "chart", label: "数据" },
  { value: "palette", label: "设计" },
  { value: "book", label: "阅读" },
  { value: "home", label: "主页" },
  { value: "news", label: "资讯" },
  { value: "tools", label: "工具" },
  { value: "shopping", label: "购物" },
  { value: "travel", label: "旅行" },
  { value: "music", label: "音乐" },
  { value: "video", label: "视频" },
  { value: "community", label: "社区" },
  { value: "idea", label: "灵感" },
  { value: "archive", label: "归档" },
] as const;

const iconMap: Record<CategoryIcon, ComponentType<IconProps>> = {
  briefcase: Briefcase,
  bookmark: BookmarkSimple,
  layers: Stack,
  study: GraduationCap,
  heart: Heart,
  globe: GlobeHemisphereWest,
  code: Code,
  chart: ChartLineUp,
  palette: Palette,
  book: BookOpen,
  home: House,
  news: Newspaper,
  tools: Wrench,
  shopping: ShoppingBag,
  travel: AirplaneTilt,
  music: MusicNotes,
  video: VideoCamera,
  community: UsersThree,
  idea: Lightbulb,
  archive: Archive,
};

export function CategoryGlyph({
  name,
  ...props
}: IconProps & { name: CategoryIcon }) {
  const Icon = iconMap[name];
  return <Icon {...props} />;
}
