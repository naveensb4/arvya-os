import { getRepository, type ConnectorConfig } from "@/lib/db/repository";

import { decryptConnectorCredentials, encryptConnectorCredentials } from "./credential-crypto";

export type ConnectorCredentials = Record<string, unknown>;

/**
 * Connector credential storage.
 *
 * Credentials are persisted via the repository on the ConnectorConfig row.
 * In Supabase mode this is a JSONB column; in the in-memory mode it is a
 * plain object. Tokens never touch disk through any code path other than
 * the repository.
 */
export class ConnectorCredentialStore {
  async read(config: ConnectorConfig): Promise<ConnectorCredentials | null> {
    return decryptConnectorCredentials(config.credentials ?? null);
  }

  async write(configId: string, credentials: ConnectorCredentials | null) {
    const encrypted = credentials ? encryptConnectorCredentials(credentials) : null;
    return getRepository().updateConnectorConfig(configId, { credentials: encrypted });
  }

  async merge(config: ConnectorConfig, credentials: ConnectorCredentials) {
    const existing = await this.read(config);
    return this.write(config.id, {
      ...(existing ?? {}),
      ...credentials,
    });
  }
}

export const connectorCredentialStore = new ConnectorCredentialStore();
