import { z } from "zod";

const encodedBlob = z.string().min(1).max(8_000_000);

export const exchangeSchema = z.object({
  code: z.string().min(20).max(500),
  codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

export const authStartSchema = z.object({
  redirectUri: z.string().url().max(2_000),
  clientState: z.string().regex(/^[A-Za-z0-9_-]{32,200}$/),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

export const vaultPayloadSchema = z.object({
  schemaVersion: z.number().int().min(1).max(100),
  ciphertext: encodedBlob,
  iv: z.string().min(8).max(200),
  checksum: z.string().min(16).max(200),
  checksumKind: z.literal("ciphertext-sha256").optional(),
  wrappedKey: encodedBlob.max(2_000),
  wrappedKeyIv: z.string().min(8).max(200),
  kdf: z.object({
    name: z.literal("PBKDF2-SHA-256"),
    iterations: z.number().int().min(100_000).max(2_000_000),
    salt: z.string().min(8).max(200),
  }),
});

export const vaultSchema = vaultPayloadSchema.extend({
  expectedRevision: z.number().int().min(0),
});
