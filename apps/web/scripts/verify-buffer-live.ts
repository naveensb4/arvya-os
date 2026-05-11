import "dotenv/config";

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = process.env.BUFFER_API_TOKEN?.trim();
  if (!token) throw new Error("BUFFER_API_TOKEN is missing.");
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
    throw new Error(`Buffer API request failed: ${JSON.stringify(json.errors ?? json).slice(0, 1000)}`);
  }
  return json;
}

async function main() {
  const channelId = process.env.BUFFER_LINKEDIN_COMPANY_CHANNEL_ID?.trim();
  if (!channelId) throw new Error("BUFFER_LINKEDIN_COMPANY_CHANNEL_ID is missing.");

  const dueAt = new Date("2099-01-01T16:00:00.000Z").toISOString();
  const created = await graphql<{
    data?: { createPost?: { post?: { id: string; dueAt?: string; channelId?: string }; message?: string } };
  }>(`
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id dueAt channelId } }
        ... on MutationError { message }
      }
    }
  `, {
    input: {
      channelId,
      text: "[TEST - DO NOT PUBLISH] Arvya Marketing OS live Buffer connection test.",
      schedulingType: "automatic",
      mode: "customScheduled",
      dueAt,
    },
  });

  const post = created.data?.createPost?.post;
  const message = created.data?.createPost?.message;
  if (!post?.id || message) throw new Error(`Buffer createPost failed: ${message ?? JSON.stringify(created)}`);

  const deleted = await graphql<{
    data?: { deletePost?: { id?: string; message?: string } };
  }>(`
    mutation DeletePost($input: DeletePostInput!) {
      deletePost(input: $input) {
        ... on DeletePostSuccess { id }
        ... on VoidMutationError { message }
      }
    }
  `, { input: { id: post.id } });

  if (deleted.data?.deletePost?.message) throw new Error(`Created ${post.id}, but delete failed: ${deleted.data.deletePost.message}`);

  console.log("Buffer live LinkedIn verification passed", {
    channelId: post.channelId,
    createdPostId: post.id,
    dueAt: post.dueAt,
    deletedPostId: deleted.data?.deletePost?.id,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
