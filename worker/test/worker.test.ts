import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "../src/crypto";
import worker from "../src/index";
import {
  validateGoogleClaims,
  verifyGoogleIdToken,
} from "../src/google";

const sessionToken = "test-session-token";

beforeEach(async () => {
  const objects = await env.BACKGROUNDS.list();
  if (objects.objects.length > 0) {
    await env.BACKGROUNDS.delete(objects.objects.map((item) => item.key));
  }
  const vaultObjects = await env.VAULTS.list();
  if (vaultObjects.objects.length > 0) {
    await env.VAULTS.delete(vaultObjects.objects.map((item) => item.key));
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM vault_deletion_jobs"),
    env.DB.prepare("DELETE FROM pending_r2_deletions"),
    env.DB.prepare("DELETE FROM vaults"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_flows"),
    env.DB.prepare("DELETE FROM users"),
  ]);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users
      (id, google_sub, email, display_name, created_at, updated_at)
     VALUES ('user-1', 'google-1', 'test@example.com', 'Test', ?, ?)`,
  )
    .bind(now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO sessions
      (id, user_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES ('session-1', 'user-1', ?, ?, ?, ?)`,
  )
    .bind(await sha256(sessionToken), now + 60_000, now, now)
    .run();
});

describe("SmartAINewTab sync worker", () => {
  it("reports health", async () => {
    const response = await exports.default.fetch(
      new Request("http://localhost/health"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "smart-new-tab-sync",
    });
  });

  it("requires authentication for vaults", async () => {
    const response = await exports.default.fetch(
      request("/v1/vault", {
        headers: { Origin: configuredExtensionOrigin() },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("lists and streams public R2 backgrounds without authentication", async () => {
    await env.BACKGROUNDS.put(
      "public/original/sea-cliffs.webp",
      new Uint8Array([82, 73, 70, 70]),
      {
        httpMetadata: {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000",
        },
        customMetadata: {
          name: "晨曦海崖",
          category: "ocean",
          width: "1672",
          height: "941",
          attribution: "SmartAINewTab 原创",
        },
      },
    );

    const catalog = await exports.default.fetch(
      request("/v1/backgrounds", { headers: { Origin: "https://example.com" } }),
    );
    expect(catalog.status).toBe(200);
    expect(catalog.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await catalog.json()).toMatchObject({
      backgrounds: [
        {
          id: "sea-cliffs",
          name: "晨曦海崖",
          category: "ocean",
          width: 1672,
          height: 941,
          attribution: "SmartAINewTab 原创",
          license: "Project-generated asset",
        },
      ],
    });

    const image = await exports.default.fetch(
      request("/v1/backgrounds/sea-cliffs"),
    );
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/webp");
    expect([...new Uint8Array(await image.arrayBuffer())]).toEqual([82, 73, 70, 70]);
  });

  it("requires authentication when an extension GET omits Origin", async () => {
    const response = await exports.default.fetch(request("/v1/vault"));
    expect(response.status).toBe(401);
  });

  it("stores and reads an encrypted vault", async () => {
    const stored = await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(vaultBody(0)),
      }),
    );
    expect(stored.status).toBe(200);
    expect(await stored.json()).toMatchObject({ revision: 1 });

    const metadataRow = await env.DB.prepare(
      `SELECT ciphertext, object_key, object_size, checksum
       FROM vaults WHERE user_id = 'user-1'`,
    ).first<{
      ciphertext: string;
      object_key: string;
      object_size: number;
      checksum: string;
    }>();
    expect(metadataRow).toMatchObject({
      ciphertext: "",
      object_key: expect.stringMatching(/^vaults\/user-1\/1-/),
      object_size: expect.any(Number),
      checksum: "1234567890abcdef",
    });
    const storedObject = await env.VAULTS.get(metadataRow!.object_key);
    expect(storedObject).not.toBeNull();
    expect(JSON.parse(await storedObject!.text())).toMatchObject({
      storageVersion: 1,
      vault: {
        ciphertext: "encrypted-snapshot",
        checksum: "1234567890abcdef",
        checksumKind: "ciphertext-sha256",
      },
    });

    const read = await exports.default.fetch(
      request("/v1/vault", { headers: authHeaders() }),
    );
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      vault: {
        revision: 1,
        schemaVersion: 1,
        ciphertext: "encrypted-snapshot",
        checksumKind: "ciphertext-sha256",
        kdf: { name: "PBKDF2-SHA-256" },
      },
    });

    const metadata = await exports.default.fetch(
      request("/v1/vault/meta", { headers: authHeaders() }),
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      vault: {
        revision: 1,
        updatedAt: expect.any(Number),
      },
    });
  });

  it("returns null metadata before the first cloud backup", async () => {
    const response = await exports.default.fetch(
      request("/v1/vault/meta", { headers: authHeaders() }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ vault: null });
  });

  it("allows an authenticated extension GET without an Origin header", async () => {
    await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(vaultBody(0)),
      }),
    );

    const response = await exports.default.fetch(
      request("/v1/vault", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      vault: { revision: 1, ciphertext: "encrypted-snapshot" },
    });
  });

  it("rejects stale revisions", async () => {
    await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(vaultBody(0)),
      }),
    );
    const stale = await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(vaultBody(0)),
      }),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: "revision_conflict",
      currentRevision: 1,
      currentUpdatedAt: expect.any(Number),
    });
  });

  it("stores encrypted payloads larger than the D1 row limit in R2", async () => {
    const ciphertext = "x".repeat(2_100_000);
    const response = await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ ...vaultBody(0), ciphertext }),
      }),
    );
    expect(response.status).toBe(200);

    const row = await env.DB.prepare(
      `SELECT length(ciphertext) AS legacy_size, object_key, object_size
       FROM vaults WHERE user_id = 'user-1'`,
    ).first<{
      legacy_size: number;
      object_key: string;
      object_size: number;
    }>();
    expect(row?.legacy_size).toBe(0);
    expect(row?.object_size).toBeGreaterThan(2_000_000);
    expect((await env.VAULTS.get(row!.object_key))?.size).toBe(
      row?.object_size,
    );
  });

  it("migrates a legacy D1 ciphertext row to R2 during maintenance", async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO vaults
        (user_id, revision, schema_version, ciphertext, iv, checksum,
         wrapped_key, wrapped_key_iv, kdf_name, kdf_iterations, kdf_salt,
         updated_at, object_key, object_size)
       VALUES ('user-1', 4, 1, 'legacy-encrypted-snapshot', 'abcdefghijklmnop',
         '1234567890abcdef', 'wrapped-vault-key', 'ponmlkjihgfedcba',
         'PBKDF2-SHA-256', 310000, '12345678', ?, NULL, NULL)`,
    )
      .bind(now)
      .run();
    const tasks: Promise<unknown>[] = [];
    await worker.scheduled(
      {} as ScheduledController,
      env,
      {
        waitUntil(task) {
          tasks.push(task);
        },
        passThroughOnException() {},
      } as ExecutionContext,
    );
    await Promise.all(tasks);

    const row = await env.DB.prepare(
      `SELECT ciphertext, object_key, object_size
       FROM vaults WHERE user_id = 'user-1'`,
    ).first<{
      ciphertext: string;
      object_key: string;
      object_size: number;
    }>();
    expect(row?.ciphertext).toBe("");
    expect(row?.object_key).toMatch(/^vaults\/user-1\/4-/);
    expect((await env.VAULTS.get(row!.object_key))?.size).toBe(
      row?.object_size,
    );
  });

  it("deletes the R2 vault object when deleting a cloud backup", async () => {
    await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(vaultBody(0)),
      }),
    );
    const row = await env.DB.prepare(
      "SELECT object_key FROM vaults WHERE user_id = 'user-1'",
    ).first<{ object_key: string }>();

    const response = await exports.default.fetch(
      request("/v1/vault", {
        method: "DELETE",
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(await env.VAULTS.get(row!.object_key)).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT user_id FROM vaults WHERE user_id = 'user-1'",
      ).first(),
    ).toBeNull();
  });

  it("deletes the account and every private R2 vault object", async () => {
    await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(vaultBody(0)),
      }),
    );
    await env.VAULTS.put("vaults/user-1/orphan.json", "opaque");

    const response = await exports.default.fetch(
      request("/v1/account", {
        method: "DELETE",
        headers: authHeaders(),
      }),
    );
    expect(response.status).toBe(200);
    expect(
      (await env.VAULTS.list({ prefix: "vaults/user-1/" })).objects,
    ).toHaveLength(0);
    expect(
      await env.DB.prepare("SELECT id FROM users WHERE id = 'user-1'").first(),
    ).toBeNull();
  });

  it("requires revision zero when creating a new vault", async () => {
    const response = await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(vaultBody(5)),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "revision_conflict",
      currentRevision: 0,
    });
  });

  it("rejects a foreign extension origin", async () => {
    const response = await exports.default.fetch(
      request("/v1/vault", {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          Origin: "chrome-extension://another-extension",
        },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("binds an OAuth exchange code to the initiating PKCE verifier", async () => {
    const now = Date.now();
    const code = "c".repeat(48);
    const verifier = "v".repeat(64);
    await env.DB.prepare(
      `INSERT INTO oauth_flows
        (id, state_hash, nonce, extension_redirect_uri, exchange_code_hash,
         user_id, status, expires_at, created_at, client_state,
         code_challenge, client_key)
       VALUES ('flow-1', 'state-hash', 'nonce', ?, ?, 'user-1', 'authorized',
         ?, ?, ?, ?, 'client-key')`,
    )
      .bind(
        configuredRedirectUri(),
        await sha256(code),
        now + 60_000,
        now,
        "s".repeat(43),
        await sha256(verifier),
      )
      .run();

    const rejected = await exports.default.fetch(
      request("/v1/auth/google/exchange", {
        method: "POST",
        headers: {
          Origin: configuredExtensionOrigin(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, codeVerifier: "x".repeat(64) }),
      }),
    );
    expect(rejected.status).toBe(400);

    const accepted = await exports.default.fetch(
      request("/v1/auth/google/exchange", {
        method: "POST",
        headers: {
          Origin: configuredExtensionOrigin(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, codeVerifier: verifier }),
      }),
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      sessionToken: expect.any(String),
      user: { id: "user-1" },
    });
  });

  it("rejects oversized public exchange bodies before JSON parsing", async () => {
    const response = await exports.default.fetch(
      request("/v1/auth/google/exchange", {
        method: "POST",
        headers: { Origin: configuredExtensionOrigin() },
        body: "x".repeat(5_000),
      }),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
  });

  it("treats an empty exchange body as an invalid request instead of an internal error", async () => {
    const response = await exports.default.fetch(
      request("/v1/auth/google/exchange", {
        method: "POST",
        headers: { Origin: configuredExtensionOrigin() },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  it("caps pending OAuth starts per edge client before another row is written", async () => {
    const startUrl = new URL("http://localhost/v1/auth/google/start");
    startUrl.searchParams.set("redirect_uri", configuredRedirectUri());
    startUrl.searchParams.set("client_state", "s".repeat(43));
    startUrl.searchParams.set("code_challenge", "c".repeat(43));
    for (let index = 0; index < 8; index += 1) {
      const response = await exports.default.fetch(
        request(`/v1/auth/google/start?${startUrl.searchParams.toString()}`, {
          redirect: "manual",
        }),
      );
      if (response.status !== 302) {
        throw new Error(`OAuth start ${index} failed: ${response.status} ${await response.text()}`);
      }
    }
    const limited = await exports.default.fetch(
      request(`/v1/auth/google/start?${startUrl.searchParams.toString()}`, {
        redirect: "manual",
      }),
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "too_many_auth_attempts" });
  });

  it("requires a fresh session before irreversible account deletion", async () => {
    await env.DB.prepare(
      "UPDATE sessions SET created_at = ? WHERE id = 'session-1'",
    )
      .bind(Date.now() - 11 * 60_000)
      .run();
    const response = await exports.default.fetch(
      request("/v1/account", { method: "DELETE", headers: authHeaders() }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "recent_auth_required" });
    expect(
      await env.DB.prepare("SELECT id FROM users WHERE id = 'user-1'").first(),
    ).not.toBeNull();
  });

  it("blocks a new vault write while durable deletion is pending", async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO vault_deletion_jobs
        (user_id, object_prefix, reason, queued_at, updated_at)
       VALUES ('user-1', 'vaults/user-1/', 'vault', ?, ?)`,
    )
      .bind(now, now)
      .run();
    const response = await exports.default.fetch(
      request("/v1/vault", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(vaultBody(0)),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "vault_deletion_in_progress" });
    expect((await env.VAULTS.list({ prefix: "vaults/user-1/" })).objects).toHaveLength(0);
  });
});

describe("Google claim validation", () => {
  it("accepts expected claims", () => {
    expect(
      validateGoogleClaims(
        {
          iss: "https://accounts.google.com",
          aud: "client-id",
          exp: 2_000,
          nonce: "nonce",
          sub: "google-user",
          email: "test@example.com",
          email_verified: true,
        },
        "client-id",
        "nonce",
        1_000,
      ),
    ).toMatchObject({ sub: "google-user", email: "test@example.com" });
  });

  it("rejects a mismatched nonce", () => {
    expect(() =>
      validateGoogleClaims(
        {
          iss: "https://accounts.google.com",
          aud: "client-id",
          exp: 2_000,
          nonce: "wrong",
          sub: "google-user",
          email: "test@example.com",
          email_verified: true,
        },
        "client-id",
        "nonce",
        1_000,
      ),
    ).toThrow("nonce");
  });

  it("verifies the Google ID token signature before trusting claims", async () => {
    const keyPair = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const header = encodeJson({ alg: "RS256", kid: "test-key" });
    const payload = encodeJson({
      iss: "https://accounts.google.com",
      aud: "client-id",
      exp: Math.floor(Date.now() / 1_000) + 60,
      nonce: "nonce",
      sub: "google-user",
      email: "test@example.com",
      email_verified: true,
    });
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        keys: [
          {
            ...publicJwk,
            kty: "RSA",
            kid: "test-key",
            alg: "RS256",
            use: "sig",
          },
        ],
      }),
    );

    await expect(
      verifyGoogleIdToken(
        `${signingInput}.${encodeBytes(new Uint8Array(signature))}`,
        "client-id",
        "nonce",
        "https://example.test/jwks",
      ),
    ).resolves.toMatchObject({ sub: "google-user" });
  });
});

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${sessionToken}`,
    "Content-Type": "application/json",
    Origin: configuredExtensionOrigin(),
  };
}

function configuredExtensionOrigin(): string {
  const origin = env.ALLOWED_EXTENSION_ORIGINS.split(",")
    .map((item) => item.trim())
    .find((item) => item.startsWith("chrome-extension://"));
  if (!origin) throw new Error("Missing configured extension origin");
  return origin;
}

function configuredRedirectUri(): string {
  const redirect = env.ALLOWED_EXTENSION_REDIRECT_URIS.split(",")
    .map((item) => item.trim())
    .find(Boolean);
  if (!redirect) throw new Error("Missing configured redirect URI");
  return redirect;
}

function vaultBody(expectedRevision: number) {
  return {
    expectedRevision,
    schemaVersion: 1,
    ciphertext: "encrypted-snapshot",
    iv: "abcdefghijklmnop",
    checksum: "1234567890abcdef",
    checksumKind: "ciphertext-sha256",
    wrappedKey: "wrapped-vault-key",
    wrappedKeyIv: "ponmlkjihgfedcba",
    kdf: {
      name: "PBKDF2-SHA-256",
      iterations: 310_000,
      salt: "12345678",
    },
  };
}

function encodeJson(value: unknown): string {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
