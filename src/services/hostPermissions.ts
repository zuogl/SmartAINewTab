export const ALL_WEB_HOST_PERMISSIONS = [
  "https://*/*",
  "http://*/*",
] as const;

export function hostPermissionOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return undefined;
  }
}

export async function requestHostPermissions(
  values: readonly string[],
): Promise<boolean> {
  if (!isChromeExtensionContext()) return true;
  const origins = uniqueOrigins(values);
  if (origins.length === 0 || !chrome.permissions.request) return false;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

export async function requestAllWebHostPermissions(): Promise<boolean> {
  if (!isChromeExtensionContext()) return true;
  if (!chrome.permissions.request) return false;
  try {
    return await chrome.permissions.request({
      origins: [...ALL_WEB_HOST_PERMISSIONS],
    });
  } catch {
    return false;
  }
}

export async function hasHostPermission(value: string): Promise<boolean> {
  if (!isChromeExtensionContext()) return true;
  const origin = hostPermissionOrigin(value);
  if (!origin) return false;
  return chrome.permissions.contains({ origins: [origin] });
}

export async function hasAllWebHostPermissions(): Promise<boolean> {
  if (!isChromeExtensionContext()) return true;
  return chrome.permissions.contains({
    origins: [...ALL_WEB_HOST_PERMISSIONS],
  });
}

function uniqueOrigins(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.flatMap((value) => {
        if (ALL_WEB_HOST_PERMISSIONS.includes(
          value as (typeof ALL_WEB_HOST_PERMISSIONS)[number],
        )) {
          return [value];
        }
        const origin = hostPermissionOrigin(value);
        return origin ? [origin] : [];
      }),
    ),
  ];
}

function isChromeExtensionContext(): boolean {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime?.id) &&
    Boolean(chrome.permissions?.contains)
  );
}
