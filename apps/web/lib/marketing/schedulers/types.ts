import type { MarketingChannelPost } from "@arvya/core";

export type SchedulePostMode = "schedule" | "now";

export type SchedulePostMedia = {
  imageUrls: string[];
  kind: "diagram" | "screenshot_mock" | "carousel" | "video_script" | "none";
};

export type SchedulePostInput = {
  post: MarketingChannelPost;
  scheduledAt: string;
  mode?: SchedulePostMode;
  media?: SchedulePostMedia;
};

export type ScheduledPostResult = {
  provider: string;
  schedulerPostId: string;
  scheduledAt: string;
  liveUrl?: string;
  shared?: boolean;
  raw?: Record<string, unknown>;
};

export type SchedulerClient = {
  schedulePost(input: SchedulePostInput): Promise<ScheduledPostResult>;
  refreshMetrics?(posts: MarketingChannelPost[]): Promise<Array<{
    postId: string;
    rawMetrics: Record<string, unknown>;
    impressions?: number;
    reactions?: number;
    comments?: number;
    shares?: number;
    clicks?: number;
    saves?: number;
    follows?: number;
  }>>;
};
