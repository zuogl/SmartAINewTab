import { CheckCircle, GlobeSimple } from "@phosphor-icons/react";
import { useEffect } from "react";
import type { FaviconLoadProgress } from "@/services/favicon";
import { useI18n } from "@/i18n";

export const FAVICON_COMPLETE_VISIBILITY_MS = 10_000;

export function FaviconLoadStatus({
  progress,
  onDismiss,
}: {
  progress: FaviconLoadProgress;
  onDismiss(): void;
}) {
  const { t } = useI18n();
  const complete = progress.status === "complete";
  const percent =
    progress.total === 0
      ? 100
      : Math.round((progress.processed / progress.total) * 100);

  useEffect(() => {
    if (!complete) return;
    const timeout = window.setTimeout(
      onDismiss,
      FAVICON_COMPLETE_VISIBILITY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [
    complete,
    onDismiss,
    progress.failed,
    progress.success,
    progress.total,
  ]);

  return (
    <aside
      className={`favicon-load-status${complete ? " complete" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="favicon-load-track"
        role="progressbar"
        aria-label={t("网站图标加载进度")}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.processed}
        aria-valuetext={`${percent}%`}
      >
        <span
          className="favicon-load-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="favicon-load-summary">
        <span className="favicon-load-state">
          {complete
            ? t("网站图标加载完成 · 共 {count} 个", {
                count: progress.total,
              })
            : t("正在加载网站图标 {processed}/{total}", {
                processed: progress.processed,
                total: progress.total,
              })}
        </span>
        <span className="favicon-load-counts">
          <span className="favicon-load-success">
            <CheckCircle size={14} weight="fill" />
            {t("成功 {count}", { count: progress.success })}
          </span>
          <span className="favicon-load-failed">
            <GlobeSimple size={14} weight="duotone" />
            {t("灰色地球 {count}", { count: progress.failed })}
          </span>
        </span>
      </div>
    </aside>
  );
}
