const PUBLIC_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOSTNAME_SUFFIXES = [
  ".home.arpa",
  ".internal",
  ".lan",
  ".local",
  ".localdomain",
  ".localhost",
  ".onion",
];

export function safePublicHttpUrl(value: string | URL): URL | undefined {
  try {
    const url = value instanceof URL ? new URL(value) : new URL(value);
    if (!PUBLIC_PROTOCOLS.has(url.protocol)) return undefined;
    if (url.username || url.password || !isPublicHostname(url.hostname)) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

export function isPublicHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!value) return false;

  const ipv4 = parseIpv4(value);
  if (ipv4) return isPublicIpv4(ipv4);
  if (looksLikeIpv4(value)) return false;
  if (value.includes(":")) return isPublicIpv6(value);
  if (isBlockedHostname(value)) return false;
  return isValidPublicDnsName(value);
}

function isBlockedHostname(value: string): boolean {
  if (!value.includes(".")) return true;
  return BLOCKED_HOSTNAME_SUFFIXES.some(
    (suffix) => value === suffix.slice(1) || value.endsWith(suffix),
  );
}

function isValidPublicDnsName(value: string): boolean {
  if (value.length > 253) return false;
  return value.split(".").every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
}

export function isLoopbackHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (value === "localhost" || value.endsWith(".localhost")) return true;
  const ipv4 = parseIpv4(value);
  if (ipv4) return ipv4[0] === 127;
  const groups = parseIpv6(value);
  return Boolean(groups && groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1);
}

function looksLikeIpv4(value: string): boolean {
  return /^\d+(?:\.\d+){3}$/.test(value);
}

function parseIpv4(value: string): [number, number, number, number] | undefined {
  if (!looksLikeIpv4(value)) return undefined;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }
  return parts as [number, number, number, number];
}

function isPublicIpv4([a, b, c]: [number, number, number, number]): boolean {
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpv6(value: string): boolean {
  const groups = parseIpv6(value);
  if (!groups) return false;

  // IPv4-mapped IPv6 must be classified by its embedded IPv4 address.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPublicIpv4([
      groups[6]! >> 8,
      groups[6]! & 0xff,
      groups[7]! >> 8,
      groups[7]! & 0xff,
    ]);
  }

  // Only global unicast IPv6 (2000::/3) is accepted. This rejects unspecified,
  // loopback, link-local, ULA, multicast and documentation-only destinations.
  return !(
    (groups[0]! & 0xe000) !== 0x2000 ||
    (groups[0] === 0x2001 && groups[1] === 0x0db8)
  );
}

function parseIpv6(value: string): number[] | undefined {
  if (!value.includes(":")) return undefined;
  const normalized = normalizeEmbeddedIpv4(value);
  if (!normalized) return undefined;
  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const left = parseIpv6Half(halves[0] ?? "");
  const right = parseIpv6Half(halves[1] ?? "");
  if (!left || !right) return undefined;
  if (halves.length === 1) return left.length === 8 ? left : undefined;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return undefined;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function normalizeEmbeddedIpv4(value: string): string | undefined {
  const lastColon = value.lastIndexOf(":");
  const suffix = value.slice(lastColon + 1);
  if (!suffix.includes(".")) return value;
  const ipv4 = parseIpv4(suffix);
  if (!ipv4) return undefined;
  const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
  const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
  return `${value.slice(0, lastColon + 1)}${high}:${low}`;
}

function parseIpv6Half(value: string): number[] | undefined {
  if (!value) return [];
  const groups = value.split(":");
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return undefined;
  return groups.map((group) => Number.parseInt(group, 16));
}
