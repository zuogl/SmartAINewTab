import { createElement, useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FAVICON_COMPLETE_VISIBILITY_MS,
  FaviconLoadStatus,
} from "@/app/FaviconLoadStatus";
import type { FaviconLoadProgress } from "@/services/favicon";

const completeProgress: FaviconLoadProgress = {
  status: "complete",
  total: 444,
  processed: 444,
  success: 134,
  failed: 310,
};

function CompleteStatusHarness() {
  const [visible, setVisible] = useState(true);
  return visible
    ? createElement(FaviconLoadStatus, {
        progress: completeProgress,
        onDismiss: () => setVisible(false),
      })
    : null;
}

describe("favicon completion status", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("stays visible for 10 seconds after completion and then disappears", () => {
    vi.useFakeTimers();
    render(createElement(CompleteStatusHarness));

    expect(screen.getByText("网站图标加载完成 · 共 444 个")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(FAVICON_COMPLETE_VISIBILITY_MS - 1);
    });
    expect(screen.getByText("网站图标加载完成 · 共 444 个")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.queryByText("网站图标加载完成 · 共 444 个"),
    ).not.toBeInTheDocument();
  });

  it("does not dismiss an in-progress load", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      createElement(FaviconLoadStatus, {
        progress: {
          ...completeProgress,
          status: "loading",
          processed: 200,
        },
        onDismiss,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(FAVICON_COMPLETE_VISIBILITY_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText("正在加载网站图标 200/444")).toBeInTheDocument();
  });

  it("restarts the 10-second window for a new completed collection", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(
      createElement(FaviconLoadStatus, {
        progress: completeProgress,
        onDismiss,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    rerender(
      createElement(FaviconLoadStatus, {
        progress: {
          ...completeProgress,
          total: 445,
          processed: 445,
          success: 135,
        },
        onDismiss,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
