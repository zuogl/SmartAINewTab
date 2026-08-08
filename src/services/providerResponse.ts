const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;

export async function fetchProviderJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ response: Response; payload: T }> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (!response.ok) return { response, payload: undefined as T };
    const text = await readBoundedText(
      response,
      options.maxBytes ?? DEFAULT_MAX_BYTES,
    );
    return { response, payload: JSON.parse(text) as T };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Provider 请求超时");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("Content-Length");
  if (declared) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0 || length > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Provider 响应超过 ${maxBytes} 字节上限`);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error(`Provider 响应超过 ${maxBytes} 字节上限`);
    }
    return new TextDecoder().decode(bytes);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Provider 响应超过 ${maxBytes} 字节上限`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
