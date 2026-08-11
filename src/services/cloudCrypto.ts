import type {
  BackupDocument,
} from "./backup";
import { serializeBackup } from "./backup";
import type { CloudState, WrappedVaultKey } from "@/domain/types";

const KDF_ITERATIONS = 310_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CIPHERTEXT_CHECKSUM_KIND = "ciphertext-sha256" as const;

export interface EncryptedVault extends WrappedVaultKey {
  expectedRevision: number;
  schemaVersion: number;
  ciphertext: string;
  iv: string;
  checksum: string;
  /** Missing only on legacy backups whose checksum was calculated from plaintext. */
  checksumKind?: typeof CIPHERTEXT_CHECKSUM_KIND;
}

export async function encryptBackupForCloud(
  backup: BackupDocument,
  state: CloudState,
  recoveryPassword?: string,
): Promise<{ vault: EncryptedVault; nextState: CloudState }> {
  let vaultKeyBytes = state.vaultKey
    ? base64UrlToBytes(state.vaultKey)
    : crypto.getRandomValues(new Uint8Array(32));
  let keyEnvelope = state.keyEnvelope;
  if (!keyEnvelope) {
    if (!recoveryPassword || recoveryPassword.length < 12) {
      throw new Error("首次云备份需要至少 12 位恢复密码");
    }
    keyEnvelope = await wrapVaultKey(vaultKeyBytes, recoveryPassword);
  }

  const plaintext = encoder.encode(serializeBackup(backup));
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(vaultKeyBytes),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  );
  const ciphertextBytes = new Uint8Array(ciphertext);
  const checksum = await crypto.subtle.digest("SHA-256", ciphertextBytes);
  const nextState: CloudState = {
    ...state,
    vaultKey: bytesToBase64Url(vaultKeyBytes),
    keyEnvelope,
  };
  vaultKeyBytes = new Uint8Array();
  return {
    vault: {
      expectedRevision: state.revision,
      schemaVersion: backup.schemaVersion,
      ciphertext: bytesToBase64Url(ciphertextBytes),
      iv: bytesToBase64Url(iv),
      checksum: bytesToBase64Url(new Uint8Array(checksum)),
      checksumKind: CIPHERTEXT_CHECKSUM_KIND,
      ...keyEnvelope,
    },
    nextState,
  };
}

export async function decryptCloudBackup(
  vault: Omit<EncryptedVault, "expectedRevision">,
  recoveryPassword: string,
): Promise<{ backup: BackupDocument; vaultKey: string; keyEnvelope: WrappedVaultKey }> {
  if (!recoveryPassword) throw new Error("请输入恢复密码");
  let ciphertextBytes: Uint8Array;
  try {
    ciphertextBytes = base64UrlToBytes(vault.ciphertext);
  } catch {
    throw new Error("云端备份完整性校验失败");
  }
  if (vault.checksumKind === CIPHERTEXT_CHECKSUM_KIND) {
    const checksum = await crypto.subtle.digest(
      "SHA-256",
      toArrayBuffer(ciphertextBytes),
    );
    if (bytesToBase64Url(new Uint8Array(checksum)) !== vault.checksum) {
      throw new Error("云端备份完整性校验失败");
    }
  }
  const vaultKeyBytes = await unwrapVaultKey(vault, recoveryPassword);
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(vaultKeyBytes),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(base64UrlToBytes(vault.iv)) },
      key,
      toArrayBuffer(ciphertextBytes),
    );
  } catch {
    throw new Error("恢复密码错误或云端备份已损坏");
  }
  if (!vault.checksumKind) {
    const legacyChecksum = await crypto.subtle.digest("SHA-256", plaintext);
    if (bytesToBase64Url(new Uint8Array(legacyChecksum)) !== vault.checksum) {
      throw new Error("云端备份完整性校验失败");
    }
  }
  const backup = JSON.parse(decoder.decode(plaintext)) as BackupDocument;
  return {
    backup,
    vaultKey: bytesToBase64Url(vaultKeyBytes),
    keyEnvelope: {
      wrappedKey: vault.wrappedKey,
      wrappedKeyIv: vault.wrappedKeyIv,
      kdf: vault.kdf,
    },
  };
}

async function wrapVaultKey(
  vaultKey: Uint8Array,
  password: string,
): Promise<WrappedVaultKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await deriveWrappingKey(password, salt, KDF_ITERATIONS);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    wrappingKey,
    toArrayBuffer(vaultKey),
  );
  return {
    wrappedKey: bytesToBase64Url(new Uint8Array(wrapped)),
    wrappedKeyIv: bytesToBase64Url(iv),
    kdf: {
      name: "PBKDF2-SHA-256",
      iterations: KDF_ITERATIONS,
      salt: bytesToBase64Url(salt),
    },
  };
}

async function unwrapVaultKey(
  envelope: WrappedVaultKey,
  password: string,
): Promise<Uint8Array> {
  const wrappingKey = await deriveWrappingKey(
    password,
    base64UrlToBytes(envelope.kdf.salt),
    envelope.kdf.iterations,
  );
  try {
    const unwrapped = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(base64UrlToBytes(envelope.wrappedKeyIv)),
      },
      wrappingKey,
      toArrayBuffer(base64UrlToBytes(envelope.wrappedKey)),
    );
    return new Uint8Array(unwrapped);
  } catch {
    throw new Error("恢复密码错误或密钥数据已损坏");
  }
}

async function deriveWrappingKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
