import type { GoogleClaims } from "./types";
import { z } from "zod";

const encoder = new TextEncoder();

const jwksSchema = z.object({
  keys: z.array(
    z.object({
      kty: z.literal("RSA"),
      kid: z.string(),
      n: z.string(),
      e: z.string(),
      alg: z.string().optional(),
      use: z.string().optional(),
    }),
  ),
});

export function validateGoogleClaims(
  raw: Record<string, unknown>,
  expectedAudience: string,
  expectedNonce: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): GoogleClaims {
  const issuer = raw.iss;
  if (issuer !== "https://accounts.google.com" && issuer !== "accounts.google.com") {
    throw new Error("Google issuer mismatch");
  }
  const audiences = Array.isArray(raw.aud) ? raw.aud : [raw.aud];
  if (!audiences.includes(expectedAudience)) throw new Error("Google audience mismatch");
  if (typeof raw.exp !== "number" || raw.exp <= nowSeconds) {
    throw new Error("Google ID token expired");
  }
  if (raw.nonce !== expectedNonce) throw new Error("Google nonce mismatch");
  if (typeof raw.sub !== "string" || !raw.sub) throw new Error("Google subject missing");
  if (
    typeof raw.email !== "string" ||
    !raw.email ||
    raw.email_verified !== true
  ) {
    throw new Error("Verified Google email required");
  }
  return {
    sub: raw.sub,
    email: raw.email,
    name: typeof raw.name === "string" ? raw.name : undefined,
    picture: typeof raw.picture === "string" ? raw.picture : undefined,
  };
}

export function buildGoogleAuthorizationUrl(
  clientId: string,
  callbackUrl: string,
  state: string,
  nonce: string,
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export async function verifyGoogleIdToken(
  token: string,
  expectedAudience: string,
  expectedNonce: string,
  jwksUrl: string,
): Promise<GoogleClaims> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("Invalid Google ID token");
  }
  const header = z
    .object({ alg: z.literal("RS256"), kid: z.string().min(1) })
    .parse(JSON.parse(decodeBase64UrlText(parts[0])));
  const response = await fetch(jwksUrl);
  if (!response.ok) throw new Error("Unable to load Google signing keys");
  const keys = jwksSchema.parse(await response.json()).keys;
  const jwk = keys.find(
    (candidate) =>
      candidate.kid === header.kid &&
      (!candidate.alg || candidate.alg === "RS256") &&
      (!candidate.use || candidate.use === "sig"),
  );
  if (!jwk) throw new Error("Google signing key not found");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(decodeBase64UrlBytes(parts[2])),
    toArrayBuffer(encoder.encode(`${parts[0]}.${parts[1]}`)),
  );
  if (!valid) throw new Error("Google ID token signature invalid");
  return validateGoogleClaims(
    JSON.parse(decodeBase64UrlText(parts[1])) as Record<string, unknown>,
    expectedAudience,
    expectedNonce,
  );
}

function decodeBase64UrlText(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
