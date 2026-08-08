import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { createPreviewWorkspace } from "@/domain/seed";
import type { BackupDocument } from "@/services/backup";
import {
  CloudBackupConflictError,
  deleteCloudAccount,
  deleteCloudBackup,
  signInWithGoogle,
  uploadCloudBackup,
} from "@/services/cloud";
import { loadCloudState, saveCloudState } from "@/services/storage";

const API_BASE_URL = "https://sync.example.com";
const VAULT_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("cloud backup version safety", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      identity: {
        getRedirectURL: () =>
          "https://extension-id.chromiumapp.org/google",
        launchWebAuthFlow: async ({ url }: { url: string }) => {
          const authUrl = new URL(url);
          const state = authUrl.searchParams.get("client_state");
          return `https://extension-id.chromiumapp.org/google?code=one-time-code&state=${state}`;
        },
      },
    });
  });

  it("drops another account's key but records the remote revision as observation, not baseline", async () => {
    await saveCloudState({
      sessionToken: "old-session",
      user: { id: "old-user", email: "old@example.com" },
      vaultKey: "old-vault-key",
      revision: 8,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/auth/google/exchange")) {
          return Response.json({
            sessionToken: "new-session",
            user: { id: "new-user", email: "new@example.com" },
          });
        }
        if (url.endsWith("/v1/vault/meta")) {
          return Response.json({
            vault: { revision: 5, updatedAt: 1_754_000_000_000 },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const next = await signInWithGoogle(API_BASE_URL);

    expect(next).toEqual({
      sessionToken: "new-session",
      user: { id: "new-user", email: "new@example.com" },
      revision: 0,
      remoteRevision: 5,
      remoteUpdatedAt: 1_754_000_000_000,
    });
    await expect(loadCloudState()).resolves.toEqual(next);
  });

  it("stops before encryption when this browser has no baseline for an existing cloud backup", async () => {
    await saveCloudState(sessionState(0));
    const fetchMock = vi.fn(async () =>
      Response.json({
        vault: { revision: 3, updatedAt: 1_754_000_000_000 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await uploadCloudBackup(
      API_BASE_URL,
      backupFixture(),
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CloudBackupConflictError);
    expect((error as CloudBackupConflictError).conflict).toEqual({
      localRevision: 0,
      remoteRevision: 3,
      remoteUpdatedAt: 1_754_000_000_000,
      reason: "missing-baseline",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the full vault route while an older Worker is still deployed", async () => {
    await saveCloudState(sessionState(0));
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/vault/meta")) {
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        if (url.endsWith("/v1/vault")) {
          return Response.json({
            vault: { revision: 2, updatedAt: 1_754_000_000_000 },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await uploadCloudBackup(
      API_BASE_URL,
      backupFixture(),
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CloudBackupConflictError);
    expect((error as CloudBackupConflictError).conflict.remoteRevision).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the exact remote revision the user approved when overwriting", async () => {
    await saveCloudState(sessionState(0, true));
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("/v1/vault/meta")) {
          return Response.json({
            vault: { revision: 3, updatedAt: 1_754_000_000_000 },
          });
        }
        if (url.endsWith("/v1/vault") && init?.method === "PUT") {
          return Response.json({ revision: 4, updatedAt: 1_754_000_001_000 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const next = await uploadCloudBackup(
      API_BASE_URL,
      backupFixture(),
      undefined,
      { overwriteRemoteRevision: 3 },
    );

    const write = requests.find((item) => item.init?.method === "PUT");
    expect(JSON.parse(String(write?.init?.body))).toMatchObject({
      expectedRevision: 3,
    });
    expect(next).toMatchObject({
      revision: 4,
      remoteRevision: 4,
      remoteUpdatedAt: 1_754_000_001_000,
      lastSyncedAt: 1_754_000_001_000,
    });
  });

  it("reopens the conflict when the remote changes after confirmation", async () => {
    await saveCloudState(sessionState(0, true));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/v1/vault/meta")) {
          return Response.json({
            vault: { revision: 3, updatedAt: 1_754_000_000_000 },
          });
        }
        if (url.endsWith("/v1/vault") && init?.method === "PUT") {
          return Response.json(
            {
              error: "revision_conflict",
              currentRevision: 4,
              currentUpdatedAt: 1_754_000_002_000,
            },
            { status: 409 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const error = await uploadCloudBackup(
      API_BASE_URL,
      backupFixture(),
      undefined,
      { overwriteRemoteRevision: 3 },
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CloudBackupConflictError);
    expect((error as CloudBackupConflictError).conflict).toEqual({
      localRevision: 0,
      remoteRevision: 4,
      remoteUpdatedAt: 1_754_000_002_000,
      reason: "missing-baseline",
    });
  });

  it("deletes only the remote backup and resets the local sync baseline", async () => {
    await saveCloudState({
      ...sessionState(4, true),
      remoteRevision: 4,
      remoteUpdatedAt: 1_754_000_000_000,
      lastSyncedAt: 1_754_000_000_000,
    });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("DELETE");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer session-token",
        );
        return Response.json({ ok: true });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const next = await deleteCloudBackup(API_BASE_URL);

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      `${API_BASE_URL}/v1/vault`,
    );
    expect(next).toMatchObject({
      revision: 0,
      remoteRevision: 0,
      user: { id: "user-1" },
      vaultKey: VAULT_KEY,
    });
    expect(next.remoteUpdatedAt).toBeUndefined();
    expect(next.lastSyncedAt).toBeUndefined();
    await expect(loadCloudState()).resolves.toEqual(next);
  });

  it("deletes the cloud account and clears local cloud credentials", async () => {
    await saveCloudState(sessionState(2, true));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );

    await deleteCloudAccount(API_BASE_URL);

    await expect(loadCloudState()).resolves.toEqual({ revision: 0 });
  });
});

function sessionState(revision: number, withKey = false) {
  return {
    sessionToken: "session-token",
    user: { id: "user-1", email: "user@example.com" },
    revision,
    ...(withKey
      ? {
          vaultKey: VAULT_KEY,
          keyEnvelope: {
            wrappedKey: "wrapped-key",
            wrappedKeyIv: "wrapped-key-iv",
            kdf: {
              name: "PBKDF2-SHA-256" as const,
              iterations: 310_000,
              salt: "salt",
            },
          },
        }
      : {}),
  };
}

function backupFixture(): BackupDocument {
  const { apiKey: _apiKey, ...provider } = DEFAULT_SETTINGS.provider;
  return {
    format: "smart-new-tab-backup",
    schemaVersion: 1,
    exportedAt: "2026-08-03T00:00:00.000Z",
    layout: createPreviewWorkspace(),
    settings: {
      ...DEFAULT_SETTINGS,
      provider,
    },
    bookmarks: [],
  };
}
