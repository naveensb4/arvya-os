import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptConnectorCredentials, encryptConnectorCredentials, isEncryptedEnvelope } from "@/lib/connectors/credential-crypto";

describe("connector credential crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes through plaintext when key is not configured", () => {
    vi.stubEnv("CONNECTOR_CREDENTIALS_KEY", "");
    const creds = { access_token: "abc" };
    const stored = encryptConnectorCredentials(creds);
    expect(stored).toEqual(creds);
    expect(decryptConnectorCredentials(stored)).toEqual(creds);
  });

  it("encrypts and decrypts credentials when key is configured", () => {
    vi.stubEnv("CONNECTOR_CREDENTIALS_KEY", "dev-secret");
    const creds = { access_token: "abc", refresh_token: "def", expires_at: "2026-06-01T00:00:00.000Z" };
    const stored = encryptConnectorCredentials(creds);
    expect(isEncryptedEnvelope(stored)).toBe(true);
    expect(decryptConnectorCredentials(stored)).toEqual(creds);
  });

  it("throws if encrypted credentials are present but key is missing", () => {
    vi.stubEnv("CONNECTOR_CREDENTIALS_KEY", "dev-secret");
    const stored = encryptConnectorCredentials({ access_token: "abc" });
    vi.stubEnv("CONNECTOR_CREDENTIALS_KEY", "");
    expect(() => decryptConnectorCredentials(stored)).toThrow(/CONNECTOR_CREDENTIALS_KEY/);
  });
});
