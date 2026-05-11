import "dotenv/config";

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = process.env.BUFFER_API_TOKEN?.trim();
  if (!token) {
    throw new Error("BUFFER_API_TOKEN is missing. Create one at https://publish.buffer.com/settings/api and add it to .env.local.");
  }
  const response = await fetch(process.env.BUFFER_API_URL?.trim() || "https://api.buffer.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json() as T & { errors?: unknown };
  if (!response.ok || json.errors) {
    throw new Error(`Buffer API request failed: ${JSON.stringify(json.errors ?? json).slice(0, 800)}`);
  }
  return json;
}

async function main() {
  const orgs = await graphql<{
    data?: { account?: { organizations?: Array<{ id: string; name?: string }> } };
  }>(`
    query GetOrganizations {
      account {
        organizations { id name }
      }
    }
  `);
  const organizations = orgs.data?.account?.organizations ?? [];
  if (organizations.length === 0) throw new Error("No Buffer organizations found for this API token.");

  for (const organization of organizations) {
    const channels = await graphql<{
      data?: { channels?: Array<{ id: string; name?: string; service?: string }> };
    }>(`
      query GetChannels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) {
          id
          name
          service
        }
      }
    `, { organizationId: organization.id });

    console.log(`Organization: ${organization.name ?? organization.id} (${organization.id})`);
    for (const channel of channels.data?.channels ?? []) {
      console.log(`- ${channel.service}: ${channel.name ?? "Unnamed"} -> ${channel.id}`);
    }
  }

  console.log("\nSet these in .env.local:");
  console.log('BUFFER_LINKEDIN_COMPANY_CHANNEL_ID="<linkedin channel id>"');
  console.log('BUFFER_X_CHANNEL_ID="<x channel id, optional>"');
  console.log('MARKETING_OS_DRY_RUN="false"');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
