const MAX_HEAD_BYTES = 96 * 1024;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 3;

const KNOWN_SITE_NAMES: Record<string, string> = {
  "google.com": "Google",
  "youtube.com": "YouTube",
  "github.com": "GitHub",
  "gitlab.com": "GitLab",
  "figma.com": "Figma",
  "notion.so": "Notion",
  "chatgpt.com": "ChatGPT",
  "openai.com": "OpenAI",
  "deepseek.com": "DeepSeek",
  "cloudflare.com": "Cloudflare",
  "vercel.com": "Vercel",
  "semrush.com": "Semrush",
  "ahrefs.com": "Ahrefs",
  "reddit.com": "Reddit",
  "x.com": "X",
  "twitter.com": "Twitter",
  "linkedin.com": "LinkedIn",
  "wikipedia.org": "Wikipedia",
};

export interface PageHeadMetadata {
  finalUrl: string;
  title?: string;
  description?: string;
  keywords: string[];
  iconUrls: string[];
  siteName?: string;
  applicationName?: string;
  ogTitle?: string;
  ogDescription?: string;
}

export async function fetchPageHeadMetadata(
  value: string,
): Promise<PageHeadMetadata | undefined> {
  if (!isChromeExtensionContext()) return undefined;
  const initial = safePublicHttpUrl(value);
  if (!initial) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = initial;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      if (!(await hasPagePermission(current))) return undefined;
      const response = await fetch(current.toString(), {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "manual",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("Location");
        if (!location || redirect === MAX_REDIRECTS) return undefined;
        const next = safePublicHttpUrl(new URL(location, current).toString());
        if (!next) return undefined;
        current = next;
        continue;
      }
      if (!response.ok || !isHtmlResponse(response)) return undefined;
      const html = await readHeadOnly(response, controller);
      return parsePageHeadMetadata(html, current.toString());
    }
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
  return undefined;
}

export function parsePageHeadMetadata(
  html: string,
  finalUrl: string,
): PageHeadMetadata {
  const head = html.split(/<\/head\s*>|<body\b/i, 1)[0] ?? html;
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    const key = (attributes.name || attributes.property || "").toLowerCase();
    const content = cleanText(attributes.content || "", 800);
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  const titleMatch = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return {
    finalUrl,
    title: optional(cleanText(titleMatch?.[1] ?? "", 240)),
    description: optional(cleanText(meta.get("description") ?? "", 600)),
    keywords: splitKeywords(meta.get("keywords") ?? ""),
    iconUrls: extractIconUrls(head, finalUrl),
    siteName: optional(cleanText(meta.get("og:site_name") ?? "", 120)),
    applicationName: optional(
      cleanText(meta.get("application-name") ?? "", 120),
    ),
    ogTitle: optional(cleanText(meta.get("og:title") ?? "", 240)),
    ogDescription: optional(
      cleanText(meta.get("og:description") ?? "", 600),
    ),
  };
}

function extractIconUrls(head: string, finalUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const page = safePublicHttpUrl(finalUrl);
  if (!page) return urls;

  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    const relTokens = (attributes.rel ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!relTokens.some((token) => token === "icon" || token.endsWith("-icon"))) {
      continue;
    }

    const href = decodeEntities(attributes.href ?? "").trim();
    if (!href) continue;
    try {
      const resolved = new URL(href, finalUrl);
      if (
        !safePublicHttpUrl(resolved) ||
        resolved.origin !== page.origin
      ) {
        continue;
      }
      const value = resolved.toString();
      if (seen.has(value)) continue;
      seen.add(value);
      urls.push(value);
      if (urls.length >= 12) break;
    } catch {
      // Ignore malformed icon declarations and continue with other candidates.
    }
  }

  return urls;
}

export function inferSiteIdentity(
  value: string,
  metadata?: PageHeadMetadata,
): string | undefined {
  const explicit = cleanText(
    metadata?.siteName || metadata?.applicationName || "",
    80,
  );
  if (explicit) return explicit;
  const url = safePublicHttpUrl(value);
  if (!url) return undefined;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const known = Object.entries(KNOWN_SITE_NAMES).find(
    ([domain]) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  return known?.[1];
}

export function pagePermissionOrigins(values: string[]): string[] {
  const origins = new Set<string>();
  for (const value of values) {
    const url = safePublicHttpUrl(value);
    if (!url) continue;
    origins.add(`${url.protocol}//${url.host}/*`);
    if (url.protocol === "http:") origins.add(`https://${url.host}/*`);
  }
  return [...origins];
}

function isChromeExtensionContext(): boolean {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime?.id) &&
    Boolean(chrome.permissions?.contains)
  );
}

async function hasPagePermission(url: URL): Promise<boolean> {
  return chrome.permissions.contains({
    origins: [`${url.protocol}//${url.host}/*`],
  });
}

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get("Content-Type")?.toLowerCase();
  return !contentType || contentType.includes("text/html") || contentType.includes("xhtml");
}

async function readHeadOnly(
  response: Response,
  controller: AbortController,
): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, MAX_HEAD_BYTES);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  while (bytes < MAX_HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (/<\/head\s*>/i.test(html)) break;
  }
  await reader.cancel().catch(() => undefined);
  controller.abort();
  return html.slice(0, MAX_HEAD_BYTES);
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name || name === "meta") continue;
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function splitKeywords(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[,，;；|]/)
    .map((keyword) => cleanText(keyword, 50))
    .filter((keyword) => {
      const key = keyword.toLocaleLowerCase();
      if (!keyword || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 16);
}

function cleanText(value: string, maxLength: number): string {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    }
    return named[entity.toLowerCase()] ?? "";
  });
}

function optional(value: string): string | undefined {
  return value || undefined;
}
import { safePublicHttpUrl } from "./networkSecurity";
