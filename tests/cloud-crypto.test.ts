import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/domain/constants";
import { buildWorkspaceFromBookmarks } from "@/domain/layout";
import { PREVIEW_BOOKMARKS } from "@/domain/seed";
import { createBackupDocument, serializeBackup } from "@/services/backup";
import {
  decryptCloudBackup,
  encryptBackupForCloud,
} from "@/services/cloudCrypto";

describe("client-side cloud encryption", () => {
  it("round-trips a backup and rejects a wrong recovery password", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks(PREVIEW_BOOKMARKS),
      DEFAULT_SETTINGS,
      PREVIEW_BOOKMARKS,
    );
    const encrypted = await encryptBackupForCloud(
      backup,
      { revision: 0 },
      "correct-password-123",
    );

    expect(encrypted.vault.ciphertext).not.toContain(
      PREVIEW_BOOKMARKS[0]!.url,
    );
    expect(encrypted.vault.checksumKind).toBe("ciphertext-sha256");
    await expect(
      sha256Base64Url(base64UrlToBytes(encrypted.vault.ciphertext)),
    ).resolves.toBe(encrypted.vault.checksum);
    await expect(
      sha256Base64Url(new TextEncoder().encode(serializeBackup(backup))),
    ).resolves.not.toBe(encrypted.vault.checksum);
    await expect(
      decryptCloudBackup(encrypted.vault, "correct-password-123"),
    ).resolves.toMatchObject({
      backup: {
        format: "smart-new-tab-backup",
        bookmarks: expect.any(Array),
      },
    });
    await expect(
      decryptCloudBackup(encrypted.vault, "wrong-password-1234"),
    ).rejects.toThrow("恢复密码错误");
  });

  it("restores legacy plaintext-checksum vaults without creating new ones", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks(PREVIEW_BOOKMARKS),
      DEFAULT_SETTINGS,
      PREVIEW_BOOKMARKS,
    );
    const encrypted = await encryptBackupForCloud(
      backup,
      { revision: 0 },
      "correct-password-123",
    );
    const { checksumKind: _checksumKind, ...legacyVault } = encrypted.vault;
    legacyVault.checksum = await sha256Base64Url(
      new TextEncoder().encode(serializeBackup(backup)),
    );

    await expect(
      decryptCloudBackup(legacyVault, "correct-password-123"),
    ).resolves.toMatchObject({ backup: { format: "smart-new-tab-backup" } });
  });

  it("rejects tampered ciphertext before attempting recovery", async () => {
    const backup = await createBackupDocument(
      buildWorkspaceFromBookmarks(PREVIEW_BOOKMARKS),
      DEFAULT_SETTINGS,
      PREVIEW_BOOKMARKS,
    );
    const encrypted = await encryptBackupForCloud(
      backup,
      { revision: 0 },
      "correct-password-123",
    );

    await expect(
      decryptCloudBackup(
        { ...encrypted.vault, ciphertext: `${encrypted.vault.ciphertext}A` },
        "correct-password-123",
      ),
    ).rejects.toThrow("完整性校验失败");
  });
});

async function sha256Base64Url(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
