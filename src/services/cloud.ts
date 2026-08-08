import type { BackupDocument } from "./backup";
import {
  decryptCloudBackup,
  encryptBackupForCloud,
  type EncryptedVault,
} from "./cloudCrypto";
import type { CloudState, CloudUser } from "@/domain/types";
import {
  clearCloudState,
  loadCloudState,
  saveCloudState,
} from "./storage";
import { isLoopbackHostname, isPublicHostname } from "./networkSecurity";

interface CloudVaultResponse {
  vault:
    | (Omit<EncryptedVault, "expectedRevision"> & {
        revision: number;
        updatedAt: number;
      })
    | null;
}

export interface CloudVaultMetadata {
  revision: number;
  updatedAt: number;
}

interface CloudVaultMetadataResponse {
  vault: CloudVaultMetadata | null;
}

export type CloudBackupConflictReason =
  | "missing-baseline"
  | "remote-changed";

export interface CloudBackupConflict {
  localRevision: number;
  remoteRevision: number;
  remoteUpdatedAt?: number;
  reason: CloudBackupConflictReason;
}

export interface CloudUploadOptions {
  /** The exact remote revision the user explicitly approved replacing. */
  overwriteRemoteRevision?: number;
}

export class CloudBackupConflictError extends Error {
  readonly conflict: CloudBackupConflict;

  constructor(conflict: CloudBackupConflict) {
    super(
      conflict.reason === "missing-baseline"
        ? "云端已有一份本机尚未同步的备份"
        : "云端备份已在其他位置更新",
    );
    this.name = "CloudBackupConflictError";
    this.conflict = conflict;
  }
}

export async function signInWithGoogle(
  apiBaseUrl: string,
): Promise<CloudState> {
  const base = normalizeApiBase(apiBaseUrl);
  if (
    typeof chrome === "undefined" ||
    !chrome.identity?.launchWebAuthFlow ||
    !chrome.runtime?.id
  ) {
    throw new Error("Google 登录只能在已加载的 Chrome 扩展中使用");
  }
  const redirectUri = chrome.identity.getRedirectURL("google");
  const clientState = randomBase64Url(32);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const authUrl = new URL(`${base}/v1/auth/google/start`);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("client_state", clientState);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  const finalUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });
  if (!finalUrl) throw new Error("Google 登录未返回授权结果");
  const callback = new URL(finalUrl);
  if (callback.searchParams.get("state") !== clientState) {
    throw new Error("Google 登录状态校验失败，请重试");
  }
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("Google 登录缺少一次性授权码");
  const response = await fetch(`${base}/v1/auth/google/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier }),
  });
  const payload = await readResponse<{
    sessionToken: string;
    user: CloudUser;
  }>(response);
  const previous = await loadCloudState();
  const accountState: CloudState =
    previous.user?.id === payload.user.id
      ? {
          ...previous,
          sessionToken: payload.sessionToken,
          user: payload.user,
        }
      : {
          sessionToken: payload.sessionToken,
          user: payload.user,
          revision: 0,
        };
  const metadata = await fetchVaultMetadata(
    base,
    payload.sessionToken,
  );
  const next: CloudState = {
    ...accountState,
    remoteRevision: metadata?.revision ?? 0,
    remoteUpdatedAt: metadata?.updatedAt,
  };
  await saveCloudState(next);
  return next;
}

export async function uploadCloudBackup(
  apiBaseUrl: string,
  backup: BackupDocument,
  recoveryPassword?: string,
  options: CloudUploadOptions = {},
): Promise<CloudState> {
  const state = await requireSession();
  const metadata = await fetchVaultMetadata(
    apiBaseUrl,
    state.sessionToken!,
  );
  const remoteRevision = metadata?.revision ?? 0;
  const approvedRevision = options.overwriteRemoteRevision;
  if (
    approvedRevision === undefined
      ? remoteRevision !== state.revision
      : remoteRevision !== approvedRevision
  ) {
    throw conflictError(state.revision, metadata);
  }
  const expectedRevision = approvedRevision ?? state.revision;
  const encrypted = await encryptBackupForCloud(
    backup,
    { ...state, revision: expectedRevision },
    recoveryPassword,
  );
  const response = await authenticatedFetch(
    apiBaseUrl,
    state.sessionToken!,
    "/v1/vault",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(encrypted.vault),
    },
  );
  const responsePayload = await readPayload(response);
  if (response.status === 409) {
    throw conflictError(state.revision, {
      revision: numericValue(responsePayload.currentRevision),
      updatedAt: optionalNumericValue(responsePayload.currentUpdatedAt),
    });
  }
  const result = readSuccessfulPayload<{
    revision: number;
    updatedAt: number;
  }>(response, responsePayload);
  const next: CloudState = {
    ...encrypted.nextState,
    revision: result.revision,
    remoteRevision: result.revision,
    remoteUpdatedAt: result.updatedAt,
    lastSyncedAt: result.updatedAt,
  };
  await saveCloudState(next);
  return next;
}

export async function downloadCloudBackup(
  apiBaseUrl: string,
  recoveryPassword: string,
): Promise<BackupDocument> {
  const state = await requireSession();
  const response = await authenticatedFetch(
    apiBaseUrl,
    state.sessionToken!,
    "/v1/vault",
  );
  const { vault } = await readResponse<CloudVaultResponse>(response);
  if (!vault) throw new Error("云端还没有可恢复的备份");
  const decrypted = await decryptCloudBackup(vault, recoveryPassword);
  await saveCloudState({
    ...state,
    vaultKey: decrypted.vaultKey,
    keyEnvelope: decrypted.keyEnvelope,
    revision: vault.revision,
    remoteRevision: vault.revision,
    remoteUpdatedAt: vault.updatedAt,
    lastSyncedAt: vault.updatedAt,
  });
  return decrypted.backup;
}

export async function signOutCloud(apiBaseUrl: string): Promise<void> {
  const state = await loadCloudState();
  if (state.sessionToken) {
    try {
      await authenticatedFetch(
        apiBaseUrl,
        state.sessionToken,
        "/v1/logout",
        { method: "POST" },
      );
    } catch {
      // Local sign-out must remain available if the backend is offline.
    }
  }
  await clearCloudState();
}

export async function deleteCloudBackup(
  apiBaseUrl: string,
): Promise<CloudState> {
  const state = await requireSession();
  const response = await authenticatedFetch(
    apiBaseUrl,
    state.sessionToken!,
    "/v1/vault",
    { method: "DELETE" },
  );
  await readResponse<{ ok: true }>(response);
  const next: CloudState = {
    ...state,
    revision: 0,
    remoteRevision: 0,
    remoteUpdatedAt: undefined,
    lastSyncedAt: undefined,
  };
  await saveCloudState(next);
  return next;
}

export async function deleteCloudAccount(apiBaseUrl: string): Promise<void> {
  const state = await requireSession();
  const response = await authenticatedFetch(
    apiBaseUrl,
    state.sessionToken!,
    "/v1/account",
    { method: "DELETE" },
  );
  await readResponse<{ ok: true }>(response);
  await clearCloudState();
}

async function requireSession(): Promise<CloudState> {
  const state = await loadCloudState();
  if (!state.sessionToken || !state.user) {
    throw new Error("请先使用 Google 账户登录");
  }
  return state;
}

async function authenticatedFetch(
  apiBaseUrl: string,
  sessionToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${sessionToken}`);
  return fetch(`${normalizeApiBase(apiBaseUrl)}${path}`, {
    ...init,
    headers,
  });
}

async function fetchVaultMetadata(
  apiBaseUrl: string,
  sessionToken: string,
): Promise<CloudVaultMetadata | null> {
  const metadataResponse = await authenticatedFetch(
    apiBaseUrl,
    sessionToken,
    "/v1/vault/meta",
  );
  if (metadataResponse.status === 404) {
    // Older deployed Workers did not expose the lightweight metadata route.
    // Keep the extension safe and functional until that Worker is upgraded.
    const vaultResponse = await authenticatedFetch(
      apiBaseUrl,
      sessionToken,
      "/v1/vault",
    );
    const { vault } = await readResponse<CloudVaultResponse>(vaultResponse);
    return vault
      ? { revision: vault.revision, updatedAt: vault.updatedAt }
      : null;
  }
  const { vault } = await readResponse<CloudVaultMetadataResponse>(
    metadataResponse,
  );
  return vault;
}

function conflictError(
  localRevision: number,
  remote: { revision: number; updatedAt?: number } | null,
): CloudBackupConflictError {
  const remoteRevision = remote?.revision ?? 0;
  return new CloudBackupConflictError({
    localRevision,
    remoteRevision,
    remoteUpdatedAt: remote?.updatedAt,
    reason:
      localRevision === 0 && remoteRevision > 0
        ? "missing-baseline"
        : "remote-changed",
  });
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await readPayload(response);
  return readSuccessfulPayload<T>(response, payload);
}

type CloudResponsePayload = Record<string, unknown> & { error?: string };

async function readPayload(response: Response): Promise<CloudResponsePayload> {
  return (await response.json().catch(() => ({}))) as CloudResponsePayload;
}

function readSuccessfulPayload<T>(
  response: Response,
  payload: CloudResponsePayload,
): T {
  if (!response.ok) {
    if (response.status === 401) throw new Error("登录已过期，请重新登录");
    if (response.status === 409) {
      throw new Error("云端已有更新，请先恢复云端备份再重新上传");
    }
    throw new Error(cloudError(payload.error));
  }
  return payload as T;
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function cloudError(code?: string): string {
  const messages: Record<string, string> = {
    origin_not_allowed: "当前扩展 ID 尚未加入后端允许列表",
    redirect_uri_not_allowed: "当前 Google 回调地址尚未加入后端允许列表",
    payload_too_large: "备份文件超过云端大小限制",
    invalid_or_expired_code: "登录授权码已过期，请重试",
    invalid_auth_start: "登录安全参数无效，请更新扩展后重试",
    too_many_auth_attempts: "登录尝试过多，请稍后再试",
    recent_auth_required: "为保护账户，请先重新使用 Google 登录后再删除账户",
    vault_deletion_in_progress: "云备份正在删除，请稍后再上传",
    vault_unavailable: "云端备份暂时不可用，请稍后重试",
    vault_corrupt: "云端备份完整性校验失败，请勿覆盖并联系支持",
  };
  return messages[code ?? ""] ?? "云端请求失败";
}

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("请先填写 Cloudflare Worker 地址");
  const url = new URL(trimmed);
  if (url.username || url.password) throw new Error("云端地址不能包含用户名或密码");
  const local = isLoopbackHostname(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("云端地址必须使用 HTTPS（本地 localhost 除外）");
  }
  if (!local && !isPublicHostname(url.hostname)) {
    throw new Error("云端地址不能使用内网、保留或本机地址");
  }
  return url.toString().replace(/\/$/, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
