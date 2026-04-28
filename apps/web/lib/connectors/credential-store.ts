import { getRepository, type ConnectorConfig } from "@/lib/db/repository";

export type ConnectorCredentials = Record<string, unknown>;

/**
 * Connector credential storage.
 *
 * Credentials are persisted via the repository on the ConnectorConfig row.
 * In Supabase mode this is a JSONB column; in the in-memory mode it is a
 * plain object. Tokens never touch disk through any code path other than
 * the repository.
 *
 * SECURITY TODO (workstream-d):
 * Tokens are stored at rest in plaintext today. Supabase encrypts the
 * underlying storage volume, but we should layer envelope encryption on
 * top of the credentials payload (e.g. KMS-wrapped DEK + AES-GCM) before
 * shipping a multi-tenant build. The contract here (read/write/merge)
 * is the single chokepoint where that change must land — any new
 * connector code must continue to route through this store rather than
 * touching `config.credentials` directly. See
 * docs/sprint/workstream-d-connectors.md for the full plan.
 */
export class ConnectorCredentialStore {
  async read(config: ConnectorConfig): Promise<ConnectorCredentials | null> {
    return config.credentials ?? null;
  }

  async write(configId: string, credentials: ConnectorCredentials | null) {
    return getRepository().updateConnectorConfig(configId, { credentials });
  }

  async merge(config: ConnectorConfig, credentials: ConnectorCredentials) {
    return this.write(config.id, {
      ...(config.credentials ?? {}),
      ...credentials,
    });
  }
}

export const connectorCredentialStore = new ConnectorCredentialStore();
