export type ConnectorSource = {
  externalId: string;
  title: string;
  type:
    | "transcript"
    | "email"
    | "note"
    | "document"
    | "github"
    | "strategy_output"
    | "web"
    | "manual";
  content: string;
  externalUri?: string;
  metadata?: Record<string, unknown>;
};

export type ConnectorSyncResult = {
  connector: string;
  sources: ConnectorSource[];
  nextCursor?: string;
};

export interface SourceConnector {
  readonly name: string;
  sync(input: {
    brainId: string;
    cursor?: string;
    since?: string;
  }): Promise<ConnectorSyncResult>;
}

export function notConfiguredConnector(name: string): SourceConnector {
  return {
    name,
    async sync() {
      throw new Error(
        `${name} connector is scaffolded but not configured. Manual source ingestion is the active MVP path.`,
      );
    },
  };
}
