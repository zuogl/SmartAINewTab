import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BackgroundSettings } from "@/app/BackgroundSettings";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import type { BackgroundAsset, BackgroundPreferences } from "@/domain/types";
import { BUILTIN_BACKGROUNDS } from "@/services/backgrounds";

const uploaded: BackgroundAsset = {
  id: "upload:test-background",
  name: "测试背景",
  source: "upload",
  category: "nature",
  url: "blob:test-background",
  thumbnailUrl: "blob:test-background-thumbnail",
};

function preferences(currentAssetId: string): BackgroundPreferences {
  return {
    ...DEFAULT_SETTINGS.background,
    currentAssetId,
    playlistIds: [...DEFAULT_SETTINGS.background.playlistIds, uploaded.id],
  };
}

describe("BackgroundSettings", () => {
  it("keeps the selected asset in sync after an uploaded background is applied", async () => {
    const assets = [...BUILTIN_BACKGROUNDS, uploaded];
    const props = {
      assets,
      busy: false,
      onChange: vi.fn(),
      onApply: vi.fn(async () => undefined),
      onUpload: vi.fn(async () => undefined),
      onDelete: vi.fn(async () => undefined),
      onRefreshCloud: vi.fn(async () => undefined),
    };
    const { rerender } = render(
      createElement(BackgroundSettings, {
        ...props,
        preferences: preferences("builtin:misty-mountains"),
      }),
    );

    fireEvent.click(screen.getByRole("tab", { name: /我的\s*1/ }));
    rerender(
      createElement(BackgroundSettings, {
        ...props,
        preferences: preferences(uploaded.id),
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "当前使用" })).toBeDisabled();
    });
  });
});
