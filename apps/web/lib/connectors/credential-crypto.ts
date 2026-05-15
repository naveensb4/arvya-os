import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENCRYPTED_MARKER = "__arvya_encrypted_v1";
const ALGORITHM = "aes-256-gcm";

export type EncryptedCredentialsEnvelope = {
  [ENCRYPTED_MARKER]: true;
  iv: string;
  tag: string;
  ciphertext: string;
};

function credentialKey(): Buffer | null {
  const raw = process.env.CONNECTOR_CREDENTIALS_KEY?.trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedCredentialsEnvelope {
  return Boolean(
    value &&
    typeof value === "object" &&
    ENCRYPTED_MARKER in value &&
    (value as Record<string, unknown>)[ENCRYPTED_MARKER] === true,
  );
}

export function encryptConnectorCredentials(credentials: Record<string, unknown>): Record<string, unknown> {
  const key = credentialKey();
  if (!key) return credentials;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    [ENCRYPTED_MARKER]: true,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptConnectorCredentials(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (!isEncryptedEnvelope(value)) return value as Record<string, unknown>;

  const key = credentialKey();
  if (!key) {
    throw new Error("Encrypted connector credentials found but CONNECTOR_CREDENTIALS_KEY is not configured.");
  }

  const iv = Buffer.from(value.iv, "base64");
  const tag = Buffer.from(value.tag, "base64");
  const ciphertext = Buffer.from(value.ciphertext, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(plaintext.toString("utf8"));
  return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
}
