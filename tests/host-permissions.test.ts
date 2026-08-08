import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL_WEB_HOST_PERMISSIONS,
  hasAllWebHostPermissions,
  hasHostPermission,
  hostPermissionOrigin,
  requestAllWebHostPermissions,
  requestHostPermissions,
} from "@/services/hostPermissions";

describe("optional host permissions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes web endpoints to origin-level permission patterns", () => {
    expect(hostPermissionOrigin("https://api.example.com/v1/chat")).toBe(
      "https://api.example.com/*",
    );
    expect(hostPermissionOrigin("http://127.0.0.1:11434/api")).toBe(
      "http://127.0.0.1:11434/*",
    );
    expect(hostPermissionOrigin("chrome://settings")).toBeUndefined();
    expect(hostPermissionOrigin("not a url")).toBeUndefined();
  });

  it("does not require prompts outside a Chrome extension context", async () => {
    await expect(
      requestHostPermissions(["https://api.example.com/v1"]),
    ).resolves.toBe(true);
    await expect(requestAllWebHostPermissions()).resolves.toBe(true);
    await expect(hasHostPermission("https://example.com")).resolves.toBe(true);
  });

  it("requests only unique exact origins for a user-triggered feature", async () => {
    const request = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request,
      },
    });

    await expect(
      requestHostPermissions([
        "https://api.example.com/v1/chat",
        "https://api.example.com/another-path",
        "http://localhost:11434/api",
      ]),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({
      origins: [
        "https://api.example.com/*",
        "http://localhost:11434/*",
      ],
    });
  });

  it("requests and checks full web access only when an automatic feature needs it", async () => {
    const request = vi.fn().mockResolvedValue(false);
    const contains = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      permissions: { contains, request },
    });

    await expect(requestAllWebHostPermissions()).resolves.toBe(false);
    expect(request).toHaveBeenCalledWith({
      origins: [...ALL_WEB_HOST_PERMISSIONS],
    });
    await expect(hasAllWebHostPermissions()).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({
      origins: [...ALL_WEB_HOST_PERMISSIONS],
    });
  });
});
