import { marketingDryRunEnabled } from "@/lib/marketing/access";
import type { SchedulePostInput, ScheduledPostResult, SchedulerClient } from "./types";

function bufferChannelId(channel: string) {
  if (channel === "linkedin_company") return process.env.BUFFER_LINKEDIN_COMPANY_CHANNEL_ID?.trim();
  if (channel === "x") return process.env.BUFFER_X_CHANNEL_ID?.trim();
  return undefined;
}

export class BufferSchedulerClient implements SchedulerClient {
  readonly provider = "buffer";

  async schedulePost(input: SchedulePostInput): Promise<ScheduledPostResult> {
    const dryRun = marketingDryRunEnabled();
    const channelId = bufferChannelId(input.post.channel);
    const postNow = input.mode === "now";
    const mediaImages = input.media?.imageUrls ?? [];
    const isCarousel = input.media?.kind === "carousel" && mediaImages.length > 1;

    if (dryRun || !process.env.BUFFER_API_TOKEN || !channelId) {
      return {
        provider: this.provider,
        schedulerPostId: `dry-run:${input.post.id}`,
        scheduledAt: input.scheduledAt,
        shared: postNow,
        raw: {
          dryRun: true,
          reason: !process.env.BUFFER_API_TOKEN || !channelId ? "missing_buffer_config" : "dry_run_enabled",
          channelId,
          mode: input.mode ?? "schedule",
          mediaCount: mediaImages.length,
          mediaKind: input.media?.kind ?? "none",
        },
      };
    }

    const primaryImage = mediaImages[0];
    const extraImages = mediaImages.slice(1);
    const postInputBase: Record<string, unknown> = {
      channelId,
      text: input.post.bodyText,
      schedulingType: "automatic",
    };
    if (primaryImage) {
      postInputBase.media = [
        {
          type: "image",
          url: primaryImage,
        },
      ];
    }
    const postInput: Record<string, unknown> = postNow
      ? { ...postInputBase, mode: "shareNow" }
      : { ...postInputBase, mode: "customScheduled", dueAt: input.scheduledAt };

    const variables: Record<string, unknown> = { input: postInput };

    const response = await fetch(process.env.BUFFER_API_URL?.trim() || "https://api.buffer.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.BUFFER_API_TOKEN}`,
      },
      body: JSON.stringify({
        query: `
          mutation CreatePost($input: CreatePostInput!) {
            createPost(input: $input) {
              ... on PostActionSuccess {
                post {
                  id
                  text
                  dueAt
                  sentAt
                  channelId
                  externalLink
                  status
                  sharedNow
                  shareMode
                }
              }
              ... on MutationError {
                message
              }
            }
          }
        `,
        variables,
      }),
    });

    const json = (await response.json()) as {
      data?: {
        createPost?: {
          post?: {
            id?: string;
            dueAt?: string;
            sentAt?: string;
            externalLink?: string;
            status?: string;
            sharedNow?: boolean;
          };
          message?: string;
        };
      };
      errors?: unknown;
    };
    const result = json.data?.createPost;
    if (!response.ok || json.errors || result?.message) {
      throw new Error(`Buffer scheduling failed: ${JSON.stringify(json.errors ?? result?.message ?? json).slice(0, 500)}`);
    }

    const post = result?.post;
    return {
      provider: this.provider,
      schedulerPostId: post?.id ?? input.post.id,
      scheduledAt: post?.dueAt ?? post?.sentAt ?? input.scheduledAt,
      liveUrl: post?.externalLink,
      shared: post?.sharedNow ?? postNow,
      raw: {
        ...(json as Record<string, unknown>),
        attachedImageUrl: primaryImage,
        carouselFallback: isCarousel ? { mode: "first_slide_attached", remainingSlides: extraImages } : undefined,
        mediaKind: input.media?.kind ?? (primaryImage ? "image" : "none"),
      },
    };
  }
}

export function getSchedulerClient(): SchedulerClient {
  return new BufferSchedulerClient();
}
