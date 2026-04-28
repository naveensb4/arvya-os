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
        `${name} connector is not implemented in this milestone. ` +
          `See VISION.md "Company-Wide Source Coverage / Sequencing" and ` +
          `docs/sprint/workstream-d-connectors.md for the path to making it real.`,
      );
    },
  };
}
