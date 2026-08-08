import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import {
  BUILTIN_BACKGROUNDS,
  MAX_BACKGROUND_FILE_BYTES,
  normalizeBackgroundPreferences,
  rotateBackground,
  shouldRotateBackground,
  validateBackgroundFile,
} from "@/services/backgrounds";

describe("background library", () => {
  it("ships a unique offline catalog with the default background available", () => {
    const ids = BUILTIN_BACKGROUNDS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_SETTINGS.background.currentAssetId);
    expect(BUILTIN_BACKGROUNDS.every((item) => item.url.startsWith("/assets/")))
      .toBe(true);
  });

  it("rejects unsupported or oversized uploads", () => {
    expect(() =>
      validateBackgroundFile({ type: "image/svg+xml", size: 1_024 }),
    ).toThrow("JPG");
    expect(() =>
      validateBackgroundFile({
        type: "image/png",
        size: MAX_BACKGROUND_FILE_BYTES + 1,
      }),
    ).toThrow("20 MB");
  });

  it("repairs missing selections after a local image is deleted", () => {
    const next = normalizeBackgroundPreferences(
      {
        ...DEFAULT_SETTINGS.background,
        currentAssetId: "upload:missing",
        playlistIds: ["upload:missing", "builtin:sea-cliffs"],
      },
      BUILTIN_BACKGROUNDS,
    );
    expect(next.currentAssetId).toBe("builtin:sea-cliffs");
    expect(next.playlistIds).toEqual(["builtin:sea-cliffs"]);
  });
});

describe("background rotation", () => {
  const enabled = {
    ...DEFAULT_SETTINGS.background,
    rotationEnabled: true,
    playlistIds: [
      "builtin:misty-mountains",
      "builtin:sea-cliffs",
      "builtin:emerald-forest",
    ],
  };

  it("rotates sequentially without skipping", () => {
    const next = rotateBackground(
      { ...enabled, rotationOrder: "sequential" },
      BUILTIN_BACKGROUNDS,
      1_000,
    );
    expect(next.currentAssetId).toBe("builtin:sea-cliffs");
    expect(next.lastRotatedAt).toBe(1_000);
  });

  it("uses a shuffle queue so adjacent random backgrounds do not repeat", () => {
    const first = rotateBackground(enabled, BUILTIN_BACKGROUNDS, 1_000, () => 0);
    const second = rotateBackground(first, BUILTIN_BACKGROUNDS, 2_000, () => 0);
    expect(first.currentAssetId).not.toBe(enabled.currentAssetId);
    expect(second.currentAssetId).not.toBe(first.currentAssetId);
    expect(new Set([enabled.currentAssetId, first.currentAssetId, second.currentAssetId]).size)
      .toBe(3);
  });

  it("honors new-tab and elapsed-time rotation modes", () => {
    expect(
      shouldRotateBackground(
        { ...enabled, rotationInterval: "newtab" },
        "newtab",
        10,
      ),
    ).toBe(true);
    expect(
      shouldRotateBackground(
        { ...enabled, rotationInterval: "15m", lastRotatedAt: 0 },
        "timer",
        15 * 60_000 - 1,
      ),
    ).toBe(false);
    expect(
      shouldRotateBackground(
        { ...enabled, rotationInterval: "15m", lastRotatedAt: 0 },
        "timer",
        15 * 60_000,
      ),
    ).toBe(true);
  });
});
