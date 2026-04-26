import { getRepository, type ConnectorConfig } from "@/lib/db/repository";

export type ConnectorCredentials = Record<string, unknown>;

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
