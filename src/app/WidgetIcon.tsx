import {
  Brain,
  CalendarDots,
  ChartDonut,
  ClockCountdown,
  CloudSun,
  CurrencyDollar,
  Fire,
  FirstAidKit,
  GlobeHemisphereEast,
  NotePencil,
  Quotes,
  Tag,
  Timer,
} from "@phosphor-icons/react";
import type { WidgetId } from "@/domain/types";

export function WidgetIcon({ id, size = 20 }: { id: WidgetId; size?: number }) {
  const props = { size, weight: "duotone" as const };
  switch (id) {
    case "weather":
      return <CloudSun {...props} />;
    case "calendar":
      return <CalendarDots {...props} />;
    case "world-clock":
      return <GlobeHemisphereEast {...props} />;
    case "currency":
      return <CurrencyDollar {...props} />;
    case "hot-search":
      return <Fire {...props} />;
    case "bookmark-stats":
      return <ChartDonut {...props} />;
    case "ai-progress":
      return <Brain {...props} />;
    case "bookmark-health":
      return <FirstAidKit {...props} />;
    case "recent-bookmarks":
      return <ClockCountdown {...props} />;
    case "tag-overview":
      return <Tag {...props} />;
    case "focus-timer":
      return <Timer {...props} />;
    case "quick-note":
      return <NotePencil {...props} />;
    case "daily-quote":
      return <Quotes {...props} />;
  }
}
