import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProviderJson } from "@/services/providerResponse";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bounded Provider responses", () => {
  it("parses a successful response within the byte limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      fetchProviderJson<{ ok: boolean }>(
        "https://provider.example/v1/chat/completions",
        { method: "POST" },
        { maxBytes: 100 },
      ),
    ).resolves.toMatchObject({ payload: { ok: true } });
  });

  it("rejects a declared oversized response before parsing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("12345678901", {
          headers: { "Content-Length": "11" },
        }),
      ),
    );

    await expect(
      fetchProviderJson("https://provider.example/v1/chat/completions", {}, { maxBytes: 10 }),
    ).rejects.toThrow("Provider 响应超过 10 字节上限");
  });

  it("stops a chunked response once the streamed byte limit is exceeded", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123456"));
        controller.enqueue(new TextEncoder().encode("789012"));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));

    await expect(
      fetchProviderJson("https://provider.example/v1/chat/completions", {}, { maxBytes: 10 }),
    ).rejects.toThrow("Provider 响应超过 10 字节上限");
  });
});
