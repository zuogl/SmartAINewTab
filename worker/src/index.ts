import { z } from "zod";
import { randomToken, sha256 } from "./crypto";
import {
  buildGoogleAuthorizationUrl,
  verifyGoogleIdToken,
} from "./google";
import {
  authStartSchema,
  exchangeSchema,
  vaultPayloadSchema,
  vaultSchema,
} from "./schemas";
import type { AuthUser } from "./types";

const GOOGLE_CALLBACK_PATH = "/v1/auth/google/callback";
const MAX_BODY_BYTES = 8_500_000;
const MAX_EXCHANGE_BODY_BYTES = 4_096;
const MAX_PENDING_OAUTH_FLOWS_PER_CLIENT = 8;
const RECENT_AUTH_WINDOW_MS = 10 * 60_000;
const PUBLIC_BACKGROUND_PREFIX = "public/original/";
const PRIVATE_VAULT_PREFIX = "vaults/";
const MAINTENANCE_BATCH_SIZE = 5;
const BACKGROUND_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const storedVaultObjectSchema = z.object({
  storageVersion: z.literal(1),
  vault: vaultPayloadSchema,
});
const CURATED_BACKGROUND_METADATA: Record<
  string,
  {
    name: string;
    category: "nature" | "ocean" | "city" | "space" | "minimal";
    width: number;
    height: number;
  }
> = {
  "sea-cliffs": { name: "晨曦海崖", category: "ocean", width: 1672, height: 941 },
  "emerald-forest": { name: "翡翠森林", category: "nature", width: 1672, height: 941 },
  "snow-peaks": { name: "雪域群峰", category: "nature", width: 1672, height: 941 },
  "copper-dunes": { name: "暮色沙丘", category: "minimal", width: 1672, height: 941 },
  "alpine-milky-way": { name: "高山银河", category: "space", width: 1672, height: 941 },
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "smart-new-tab-sync" });
      }
      if (url.pathname === "/v1/backgrounds") {
        if (request.method === "OPTIONS") return publicPreflight();
        if (request.method === "GET") return await listPublicBackgrounds(request, env);
      }
      if (url.pathname.startsWith("/v1/backgrounds/")) {
        if (request.method === "OPTIONS") return publicPreflight();
        if (request.method === "GET") return await getPublicBackground(request, env);
      }
      if (request.method === "OPTIONS") return handlePreflight(request, env);
      if (
        url.pathname.startsWith("/v1/") &&
        !url.pathname.startsWith("/v1/auth/google/") &&
        hasDisallowedRequestOrigin(request, env)
      ) {
        return json({ error: "origin_not_allowed" }, 403);
      }

      if (request.method === "GET" && url.pathname === "/v1/auth/google/start") {
        return await startGoogleAuth(request, url, env);
      }
      if (request.method === "GET" && url.pathname === GOOGLE_CALLBACK_PATH) {
        return await completeGoogleAuth(url, env);
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/auth/google/exchange"
      ) {
        return await exchangeLogin(request, env);
      }

      const authenticated = await authenticate(request, env);
      if (!authenticated) {
        return withCors(request, env, json({ error: "unauthorized" }, 401));
      }

      if (request.method === "GET" && url.pathname === "/v1/me") {
        return withCors(request, env, json({ user: authenticated.user }));
      }
      if (request.method === "POST" && url.pathname === "/v1/logout") {
        await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
          .bind(authenticated.sessionId)
          .run();
        return withCors(request, env, json({ ok: true }));
      }
      if (request.method === "GET" && url.pathname === "/v1/vault") {
        return await getVault(request, env, authenticated.user.id, ctx);
      }
      if (request.method === "GET" && url.pathname === "/v1/vault/meta") {
        return await getVaultMetadata(request, env, authenticated.user.id);
      }
      if (request.method === "PUT" && url.pathname === "/v1/vault") {
        return await putVault(request, env, authenticated.user.id);
      }
      if (request.method === "DELETE" && url.pathname === "/v1/vault") {
        await env.DB.batch([
          prepareVaultDeletionJob(env, authenticated.user.id, "vault"),
          env.DB.prepare("DELETE FROM vaults WHERE user_id = ?").bind(
            authenticated.user.id,
          ),
        ]);
        await processVaultDeletionJob(env, authenticated.user.id);
        return withCors(request, env, json({ ok: true }));
      }
      if (request.method === "DELETE" && url.pathname === "/v1/account") {
        if (Date.now() - authenticated.sessionCreatedAt > RECENT_AUTH_WINDOW_MS) {
          return withCors(
            request,
            env,
            json({ error: "recent_auth_required" }, 403),
          );
        }
        await env.DB.batch([
          prepareVaultDeletionJob(env, authenticated.user.id, "account"),
          env.DB.prepare("DELETE FROM users WHERE id = ?").bind(
            authenticated.user.id,
          ),
        ]);
        try {
          await processVaultDeletionJob(env, authenticated.user.id);
        } catch {
          console.error(JSON.stringify({ event: "account_r2_cleanup_queued" }));
        }
        return withCors(request, env, json({ ok: true }));
      }

      return withCors(request, env, json({ error: "not_found" }, 404));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return withCors(
          request,
          env,
          json({ error: "invalid_request", details: error.issues }, 400),
        );
      }
      console.error(
        JSON.stringify({
          event: "request_failed",
          path: new URL(request.url).pathname,
          method: request.method,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      const status = error instanceof VaultStorageError
        ? error.status
        : error instanceof Error && error.message === "Request body too large"
          ? 413
          : 500;
      const errorCode = error instanceof VaultStorageError
        ? error.code
        : status === 413
          ? "payload_too_large"
          : "internal_error";
      return withCors(
        request,
        env,
        json({ error: errorCode }, status),
      );
    }
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(runScheduledMaintenance(env));
  },
} satisfies ExportedHandler<Env>;

async function listPublicBackgrounds(
  request: Request,
  env: Env,
): Promise<Response> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BACKGROUNDS.list({
      prefix: PUBLIC_BACKGROUND_PREFIX,
      cursor,
      limit: 500,
      include: ["httpMetadata", "customMetadata"],
    });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const origin = new URL(request.url).origin;
  const backgrounds = objects.flatMap((object) => {
    const fileName = object.key.slice(PUBLIC_BACKGROUND_PREFIX.length);
    const id = fileName.replace(/\.webp$/i, "");
    if (!fileName.endsWith(".webp") || !BACKGROUND_ID_PATTERN.test(id)) {
      return [];
    }
    const metadata = object.customMetadata ?? {};
    const curated = CURATED_BACKGROUND_METADATA[id];
    const url = `${origin}/v1/backgrounds/${encodeURIComponent(id)}`;
    return [{
      id,
      name: metadata.name || curated?.name || readableBackgroundName(id),
      category: backgroundCategory(metadata.category || curated?.category),
      url,
      thumbnailUrl: url,
      width: positiveMetadataNumber(metadata.width) ?? curated?.width,
      height: positiveMetadataNumber(metadata.height) ?? curated?.height,
      attribution:
        metadata.attribution || "OpenAI ImageGen 为 SmartAINewTab 生成（2026-08-08）",
      license: metadata.license || "Project-generated asset",
    }];
  });
  return publicCors(
    Response.json(
      { backgrounds, updatedAt: Date.now() },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        },
      },
    ),
  );
}

async function getPublicBackground(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.slice("/v1/backgrounds/".length));
  if (!BACKGROUND_ID_PATTERN.test(id)) {
    return publicCors(json({ error: "invalid_background_id" }, 400));
  }
  const object = await env.BACKGROUNDS.get(`${PUBLIC_BACKGROUND_PREFIX}${id}.webp`);
  if (!object) return publicCors(json({ error: "background_not_found" }, 404));
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", object.httpMetadata?.contentType || "image/webp");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  return publicCors(new Response(object.body, { headers }));
}

async function startGoogleAuth(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const start = authStartSchema.safeParse({
    redirectUri: url.searchParams.get("redirect_uri") ?? "",
    clientState: url.searchParams.get("client_state") ?? "",
    codeChallenge: url.searchParams.get("code_challenge") ?? "",
  });
  if (!start.success) return json({ error: "invalid_auth_start" }, 400);
  const extensionRedirectUri = start.data.redirectUri;
  if (!allowedList(env.ALLOWED_EXTENSION_REDIRECT_URIS).has(extensionRedirectUri)) {
    return json({ error: "redirect_uri_not_allowed" }, 400);
  }
  const clientKey = await oauthClientKey(request);
  const state = randomToken();
  const nonce = randomToken();
  const now = Date.now();
  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM oauth_flows
     WHERE client_key = ? AND status = 'pending' AND expires_at > ?`,
  )
    .bind(clientKey, now)
    .first<{ count: number }>();
  if ((active?.count ?? 0) >= MAX_PENDING_OAUTH_FLOWS_PER_CLIENT) {
    return json({ error: "too_many_auth_attempts" }, 429);
  }
  await env.DB.prepare(
    `INSERT INTO oauth_flows
      (id, state_hash, nonce, extension_redirect_uri, client_state,
       code_challenge, client_key, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      await sha256(state),
      nonce,
      extensionRedirectUri,
      start.data.clientState,
      start.data.codeChallenge,
      clientKey,
      now + 10 * 60_000,
      now,
    )
    .run();
  const callbackUrl = new URL(GOOGLE_CALLBACK_PATH, env.PUBLIC_BASE_URL).toString();
  return Response.redirect(
    buildGoogleAuthorizationUrl(env.GOOGLE_CLIENT_ID, callbackUrl, state, nonce),
    302,
  );
}

async function completeGoogleAuth(url: URL, env: Env): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!state || !code) {
    return json({ error: "missing_google_callback_values" }, 400);
  }
  const flow = await env.DB.prepare(
    `SELECT id, nonce, extension_redirect_uri, client_state
       FROM oauth_flows
      WHERE state_hash = ? AND status = 'pending' AND expires_at > ?`,
  )
    .bind(await sha256(state), Date.now())
    .first<{
      id: string;
      nonce: string;
      extension_redirect_uri: string;
      client_state: string;
    }>();
  if (!flow) return json({ error: "invalid_or_expired_state" }, 400);

  const callbackUrl = new URL(GOOGLE_CALLBACK_PATH, env.PUBLIC_BASE_URL).toString();
  const tokenResponse = await fetch(env.GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed (${tokenResponse.status})`);
  }
  const tokenPayload = z
    .object({ id_token: z.string().min(1) })
    .parse(await tokenResponse.json());
  const claims = await verifyGoogleIdToken(
    tokenPayload.id_token,
    env.GOOGLE_CLIENT_ID,
    flow.nonce,
    env.GOOGLE_JWKS_URL,
  );

  const now = Date.now();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?")
    .bind(claims.sub)
    .first<{ id: string }>();
  const proposedUserId = existing?.id ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users
      (id, google_sub, email, display_name, avatar_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_sub) DO UPDATE SET
       email = excluded.email,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       updated_at = excluded.updated_at`,
  )
    .bind(
      proposedUserId,
      claims.sub,
      claims.email,
      claims.name ?? null,
      claims.picture ?? null,
      now,
      now,
    )
    .run();
  const canonicalUser = await env.DB.prepare(
    "SELECT id FROM users WHERE google_sub = ?",
  )
    .bind(claims.sub)
    .first<{ id: string }>();
  if (!canonicalUser) throw new Error("Google user upsert failed");
  const userId = canonicalUser.id;

  const exchangeCode = randomToken();
  await env.DB.prepare(
    `UPDATE oauth_flows
        SET exchange_code_hash = ?, user_id = ?, status = 'authorized'
      WHERE id = ? AND status = 'pending'`,
  )
    .bind(await sha256(exchangeCode), userId, flow.id)
    .run();
  const redirect = new URL(flow.extension_redirect_uri);
  redirect.searchParams.set("code", exchangeCode);
  redirect.searchParams.set("state", flow.client_state);
  return Response.redirect(redirect.toString(), 302);
}

async function exchangeLogin(request: Request, env: Env): Promise<Response> {
  if (!isAllowedRequestOrigin(request, env)) {
    return json({ error: "origin_not_allowed" }, 403);
  }
  const body = exchangeSchema.parse(
    await readJson(request, MAX_EXCHANGE_BODY_BYTES),
  );
  const now = Date.now();
  const consumed = await env.DB.prepare(
    `UPDATE oauth_flows
        SET status = 'consumed', consumed_at = ?
      WHERE exchange_code_hash = ?
        AND code_challenge = ?
        AND status = 'authorized'
        AND expires_at > ?
      RETURNING user_id`,
  )
    .bind(
      now,
      await sha256(body.code),
      await pkceChallenge(body.codeVerifier),
      now,
    )
    .first<{ user_id: string }>();
  if (!consumed) {
    return withCors(
      request,
      env,
      json({ error: "invalid_or_expired_code" }, 400),
    );
  }
  const sessionToken = randomToken(48);
  const sessionId = crypto.randomUUID();
  const ttlDays = parsePositiveInt(env.SESSION_TTL_DAYS, 7);
  await env.DB.prepare(
    `INSERT INTO sessions
      (id, user_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      consumed.user_id,
      await sha256(sessionToken),
      now + ttlDays * 86_400_000,
      now,
      now,
    )
    .run();
  const user = await getUser(env, consumed.user_id);
  return withCors(request, env, json({ sessionToken, user }));
}

async function authenticate(
  request: Request,
  env: Env,
): Promise<{
  sessionId: string;
  sessionCreatedAt: number;
  user: AuthUser;
} | undefined> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return undefined;
  const row = await env.DB.prepare(
    `SELECT
       sessions.id AS session_id,
       sessions.created_at AS session_created_at,
       users.id AS user_id,
       users.email,
       users.display_name,
       users.avatar_url
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first<{
      session_id: string;
      session_created_at: number;
      user_id: string;
      email: string;
      display_name: string | null;
      avatar_url: string | null;
    }>();
  if (!row) return undefined;
  return {
    sessionId: row.session_id,
    sessionCreatedAt: row.session_created_at,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
    },
  };
}

async function getUser(env: Env, userId: string): Promise<AuthUser> {
  const row = await env.DB.prepare(
    "SELECT id, email, display_name, avatar_url FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<{
      id: string;
      email: string;
      display_name: string | null;
      avatar_url: string | null;
    }>();
  if (!row) throw new Error("Authenticated user missing");
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
  };
}

async function getVault(
  request: Request,
  env: Env,
  userId: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT
       revision, schema_version, ciphertext, iv, checksum,
       wrapped_key, wrapped_key_iv, kdf_name, kdf_iterations, kdf_salt, updated_at,
       object_key, object_size
     FROM vaults WHERE user_id = ?`,
  )
    .bind(userId)
    .first<VaultRow>();
  if (!row) {
    return withCors(request, env, json({ vault: null }));
  }

  const payload = row.object_key
    ? await readVaultObject(env, userId, row)
    : legacyVaultPayload(row);
  if (!row.object_key) {
    ctx.waitUntil(migrateLegacyVaultRow(env, userId, row));
  }
  return withCors(
    request,
    env,
    json({
      vault: {
        revision: row.revision,
        ...payload,
        updatedAt: row.updated_at,
      },
    }),
  );
}

async function getVaultMetadata(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT revision, updated_at FROM vaults WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ revision: number; updated_at: number }>();
  return withCors(
    request,
    env,
    json({
      vault: row
        ? { revision: row.revision, updatedAt: row.updated_at }
        : null,
    }),
  );
}

async function putVault(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const body = vaultSchema.parse(await readJson(request, MAX_BODY_BYTES));
  const deletion = await env.DB.prepare(
    "SELECT user_id FROM vault_deletion_jobs WHERE user_id = ?",
  )
    .bind(userId)
    .first();
  if (deletion) {
    return withCors(
      request,
      env,
      json({ error: "vault_deletion_in_progress" }, 409),
    );
  }
  const current = await env.DB.prepare(
    "SELECT revision, updated_at, object_key FROM vaults WHERE user_id = ?",
  )
    .bind(userId)
    .first<{
      revision: number;
      updated_at: number;
      object_key: string | null;
    }>();
  if ((current?.revision ?? 0) !== body.expectedRevision) {
    return revisionConflictResponse(request, env, current);
  }

  const { expectedRevision, ...vault } = body;
  const nextRevision = expectedRevision + 1;
  const objectKey = vaultObjectKey(userId, nextRevision);
  const serializedVault = JSON.stringify({ storageVersion: 1, vault });
  const objectSize = new TextEncoder().encode(serializedVault).byteLength;
  const now = Date.now();
  await env.VAULTS.put(objectKey, serializedVault, {
    httpMetadata: {
      contentType: "application/json",
      cacheControl: "no-store",
    },
    customMetadata: {
      storageVersion: "1",
      revision: String(nextRevision),
      checksum: vault.checksum,
    },
  });

  let result: { revision: number; updated_at: number } | null;
  try {
    result = await env.DB.prepare(
      `INSERT INTO vaults
        (user_id, revision, schema_version, ciphertext, iv, checksum,
         wrapped_key, wrapped_key_iv, kdf_name, kdf_iterations, kdf_salt,
         updated_at, object_key, object_size)
       SELECT ?, 1, 0, '', '', ?, '', '', '', 0, '', ?, ?, ?
       WHERE ? = 0
         AND NOT EXISTS (
           SELECT 1 FROM vault_deletion_jobs WHERE user_id = ?
         )
       ON CONFLICT(user_id) DO UPDATE SET
         revision = vaults.revision + 1,
         schema_version = 0,
         ciphertext = '',
         iv = '',
         checksum = excluded.checksum,
         wrapped_key = '',
         wrapped_key_iv = '',
         kdf_name = '',
         kdf_iterations = 0,
         kdf_salt = '',
         updated_at = excluded.updated_at,
         object_key = excluded.object_key,
         object_size = excluded.object_size
       WHERE vaults.revision = ?
         AND NOT EXISTS (
           SELECT 1 FROM vault_deletion_jobs WHERE user_id = ?
         )
       RETURNING revision, updated_at`,
    )
      .bind(
        userId,
        vault.checksum,
        now,
        objectKey,
        objectSize,
        expectedRevision,
        userId,
        expectedRevision,
        userId,
      )
      .first<{ revision: number; updated_at: number }>();
  } catch (error) {
    await deleteOrQueueR2Object(env, userId, objectKey);
    throw error;
  }
  if (!result) {
    await deleteOrQueueR2Object(env, userId, objectKey);
    const latest = await env.DB.prepare(
      "SELECT revision, updated_at FROM vaults WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ revision: number; updated_at: number }>();
    return revisionConflictResponse(request, env, latest);
  }
  if (current?.object_key && current.object_key !== objectKey) {
    await deleteOrQueueR2Object(env, userId, current.object_key);
  }
  return withCors(
    request,
    env,
    json({ revision: result.revision, updatedAt: result.updated_at }),
  );
}

interface VaultRow {
  revision: number;
  schema_version: number;
  ciphertext: string;
  iv: string;
  checksum: string;
  wrapped_key: string;
  wrapped_key_iv: string;
  kdf_name: string;
  kdf_iterations: number;
  kdf_salt: string;
  updated_at: number;
  object_key: string | null;
  object_size: number | null;
}

class VaultStorageError extends Error {
  constructor(
    readonly code: "vault_unavailable" | "vault_corrupt",
    readonly status: 500 | 503,
    message: string,
  ) {
    super(message);
    this.name = "VaultStorageError";
  }
}

function legacyVaultPayload(row: VaultRow): z.infer<typeof vaultPayloadSchema> {
  return vaultPayloadSchema.parse({
    schemaVersion: row.schema_version,
    ciphertext: row.ciphertext,
    iv: row.iv,
    checksum: row.checksum,
    wrappedKey: row.wrapped_key,
    wrappedKeyIv: row.wrapped_key_iv,
    kdf: {
      name: row.kdf_name,
      iterations: row.kdf_iterations,
      salt: row.kdf_salt,
    },
  });
}

async function readVaultObject(
  env: Env,
  userId: string,
  row: VaultRow,
): Promise<z.infer<typeof vaultPayloadSchema>> {
  if (!isOwnedVaultObjectKey(userId, row.object_key!)) {
    throw new VaultStorageError(
      "vault_corrupt",
      500,
      "Encrypted vault object is outside the user namespace",
    );
  }
  const object = await env.VAULTS.get(row.object_key!);
  if (!object) {
    throw new VaultStorageError(
      "vault_unavailable",
      503,
      "Encrypted vault object is unavailable",
    );
  }
  if (row.object_size === null || object.size !== row.object_size) {
    throw new VaultStorageError(
      "vault_corrupt",
      500,
      "Encrypted vault object size does not match metadata",
    );
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(await object.text());
  } catch {
    throw new VaultStorageError(
      "vault_corrupt",
      500,
      "Encrypted vault object is not valid JSON",
    );
  }
  const parsed = storedVaultObjectSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.vault.checksum !== row.checksum) {
    throw new VaultStorageError(
      "vault_corrupt",
      500,
      "Encrypted vault object does not match metadata",
    );
  }
  return parsed.data.vault;
}

async function migrateLegacyVaultRow(
  env: Env,
  userId: string,
  row: VaultRow,
): Promise<void> {
  if (row.object_key || !row.ciphertext) return;
  const vault = legacyVaultPayload(row);
  const objectKey = vaultObjectKey(userId, row.revision);
  const serializedVault = JSON.stringify({ storageVersion: 1, vault });
  const objectSize = new TextEncoder().encode(serializedVault).byteLength;
  await env.VAULTS.put(objectKey, serializedVault, {
    httpMetadata: {
      contentType: "application/json",
      cacheControl: "no-store",
    },
    customMetadata: {
      storageVersion: "1",
      revision: String(row.revision),
      checksum: vault.checksum,
    },
  });
  try {
    const migrated = await env.DB.prepare(
      `UPDATE vaults SET
         schema_version = 0,
         ciphertext = '',
         iv = '',
         wrapped_key = '',
         wrapped_key_iv = '',
         kdf_name = '',
         kdf_iterations = 0,
         kdf_salt = '',
         object_key = ?,
         object_size = ?
       WHERE user_id = ? AND revision = ? AND object_key IS NULL
       RETURNING object_key`,
    )
      .bind(objectKey, objectSize, userId, row.revision)
      .first<{ object_key: string }>();
    if (!migrated) await deleteOrQueueR2Object(env, userId, objectKey);
  } catch (error) {
    await deleteOrQueueR2Object(env, userId, objectKey);
    throw error;
  }
}

function vaultObjectKey(userId: string, revision: number): string {
  return `${PRIVATE_VAULT_PREFIX}${userId}/${revision}-${randomToken(12)}.json`;
}

function vaultObjectPrefix(userId: string): string {
  return `${PRIVATE_VAULT_PREFIX}${userId}/`;
}

function isOwnedVaultObjectKey(userId: string, objectKey: string): boolean {
  return objectKey.startsWith(vaultObjectPrefix(userId));
}

function prepareVaultDeletionJob(
  env: Env,
  userId: string,
  reason: "vault" | "account",
): D1PreparedStatement {
  const now = Date.now();
  return env.DB.prepare(
    `INSERT INTO vault_deletion_jobs
      (user_id, object_prefix, reason, queued_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       reason = CASE
         WHEN excluded.reason = 'account' THEN 'account'
         ELSE vault_deletion_jobs.reason
       END,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, vaultObjectPrefix(userId), reason, now, now);
}

async function processVaultDeletionJob(env: Env, userId: string): Promise<void> {
  const job = await env.DB.prepare(
    "SELECT object_prefix FROM vault_deletion_jobs WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ object_prefix: string }>();
  if (!job || job.object_prefix !== vaultObjectPrefix(userId)) return;

  while (true) {
    const page = await env.VAULTS.list({
      prefix: job.object_prefix,
      limit: 1_000,
    });
    const keys = page.objects
      .map((object) => object.key)
      .filter((key) => isOwnedVaultObjectKey(userId, key));
    if (keys.length === 0) break;
    await env.VAULTS.delete(keys);
  }

  const remaining = await env.VAULTS.list({ prefix: job.object_prefix, limit: 1 });
  if (remaining.objects.length > 0 || remaining.truncated) {
    throw new Error("Vault deletion is still pending");
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM vault_deletion_jobs WHERE user_id = ?").bind(userId),
    env.DB.prepare(
      "DELETE FROM pending_r2_deletions WHERE object_key LIKE ?",
    ).bind(`${job.object_prefix}%`),
  ]);
}

async function deleteOrQueueR2Object(
  env: Env,
  userId: string,
  objectKey: string,
): Promise<void> {
  if (!isOwnedVaultObjectKey(userId, objectKey)) {
    throw new Error("Refusing to delete an object outside the user namespace");
  }
  try {
    await env.VAULTS.delete(objectKey);
    await env.DB.prepare(
      "DELETE FROM pending_r2_deletions WHERE object_key = ?",
    )
      .bind(objectKey)
      .run();
  } catch {
    try {
      await env.DB.prepare(
        `INSERT INTO pending_r2_deletions (object_key, queued_at)
         VALUES (?, ?)
         ON CONFLICT(object_key) DO UPDATE SET queued_at = excluded.queued_at`,
      )
        .bind(objectKey, Date.now())
        .run();
    } catch {
      console.error(JSON.stringify({ event: "r2_cleanup_queue_failed" }));
    }
  }
}

function revisionConflictResponse(
  request: Request,
  env: Env,
  current?: { revision: number; updated_at?: number } | null,
): Response {
  return withCors(
    request,
    env,
    json(
      {
        error: "revision_conflict",
        currentRevision: current?.revision ?? 0,
        currentUpdatedAt: current?.updated_at,
      },
      409,
    ),
  );
}

async function migrateLegacyVaults(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT
       user_id, revision, schema_version, ciphertext, iv, checksum,
       wrapped_key, wrapped_key_iv, kdf_name, kdf_iterations, kdf_salt,
       updated_at, object_key, object_size
     FROM vaults
     WHERE object_key IS NULL AND ciphertext <> ''
     ORDER BY updated_at ASC
     LIMIT ?`,
  )
    .bind(MAINTENANCE_BATCH_SIZE)
    .all<VaultRow & { user_id: string }>();
  for (const row of results) {
    await migrateLegacyVaultRow(env, row.user_id, row);
  }
}

async function drainPendingR2Deletions(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT object_key FROM pending_r2_deletions
     ORDER BY queued_at ASC LIMIT ?`,
  )
    .bind(MAINTENANCE_BATCH_SIZE)
    .all<{ object_key: string }>();
  for (const row of results) {
    try {
      const active = await env.DB.prepare(
        "SELECT user_id FROM vaults WHERE object_key = ?",
      )
        .bind(row.object_key)
        .first();
      if (active || !vaultOwnerFromObjectKey(row.object_key)) {
        await env.DB.prepare(
          "DELETE FROM pending_r2_deletions WHERE object_key = ?",
        )
          .bind(row.object_key)
          .run();
        continue;
      }
      await env.VAULTS.delete(row.object_key);
      await env.DB.prepare(
        "DELETE FROM pending_r2_deletions WHERE object_key = ?",
      )
        .bind(row.object_key)
        .run();
    } catch {
      console.error(JSON.stringify({ event: "r2_cleanup_retry_failed" }));
    }
  }
}

function vaultOwnerFromObjectKey(objectKey: string): string | undefined {
  return objectKey.match(/^vaults\/([^/]+)\/.+$/)?.[1];
}

async function drainVaultDeletionJobs(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT user_id FROM vault_deletion_jobs
     ORDER BY queued_at ASC LIMIT ?`,
  )
    .bind(MAINTENANCE_BATCH_SIZE)
    .all<{ user_id: string }>();
  for (const job of results) {
    try {
      await processVaultDeletionJob(env, job.user_id);
    } catch {
      console.error(JSON.stringify({ event: "vault_deletion_retry_failed" }));
    }
  }
}

async function runScheduledMaintenance(env: Env): Promise<void> {
  await cleanExpiredRows(env);
  await migrateLegacyVaults(env);
  await drainVaultDeletionJobs(env);
  await drainPendingR2Deletions(env);
}

async function cleanExpiredRows(env: Env): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_flows WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
  ]);
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const declaredHeader = request.headers.get("Content-Length");
  if (declaredHeader !== null) {
    const declared = Number(declaredHeader);
    if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) {
      throw new Error("Request body too large");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return {};
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
        throw new Error("Request body too large");
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
  const text = new TextDecoder().decode(bytes);
  return text ? JSON.parse(text) : {};
}

function handlePreflight(request: Request, env: Env): Response {
  if (!isAllowedRequestOrigin(request, env)) {
    return json({ error: "origin_not_allowed" }, 403);
  }
  return withCors(request, env, new Response(null, { status: 204 }));
}

function isAllowedRequestOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(
    origin && allowedList(env.ALLOWED_EXTENSION_ORIGINS).has(origin),
  );
}

function hasDisallowedRequestOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(
    origin && !allowedList(env.ALLOWED_EXTENSION_ORIGINS).has(origin),
  );
}

function withCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedList(env.ALLOWED_EXTENSION_ORIGINS).has(origin)) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

function publicCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers });
}

function publicPreflight(): Response {
  return publicCors(new Response(null, { status: 204 }));
}

function allowedList(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

async function oauthClientKey(request: Request): Promise<string> {
  const address = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  return sha256(`oauth-start:${address}`);
}

async function pkceChallenge(codeVerifier: string): Promise<string> {
  return sha256(codeVerifier);
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readableBackgroundName(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function backgroundCategory(value?: string): "nature" | "ocean" | "city" | "space" | "minimal" {
  if (
    value === "ocean" ||
    value === "city" ||
    value === "space" ||
    value === "minimal"
  ) {
    return value;
  }
  return "nature";
}

function positiveMetadataNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
