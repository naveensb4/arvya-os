type SlackApiResponse = { ok: boolean; ts?: string; error?: string };

export class SlackMessenger {
  private messageTs: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lastUpdateAt = 0;
  private pendingText: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly botToken: string,
    private readonly channel: string,
    private readonly threadTs: string,
  ) {}

  async postThinking(): Promise<void> {
    const resp = await this.slackPost("chat.postMessage", {
      channel: this.channel,
      thread_ts: this.threadTs,
      text: ":hourglass_flowing_sand: Thinking...",
    });
    this.messageTs = resp.ts ?? null;
  }

  updateStatus(text: string): void {
    this.enqueue(text);
  }

  async updateFinal(text: string): Promise<void> {
    this.cancelPending();
    if (!this.messageTs) {
      await this.slackPost("chat.postMessage", {
        channel: this.channel,
        thread_ts: this.threadTs,
        text,
      });
      return;
    }
    await this.waitForQueue();
    await this.slackPost("chat.update", {
      channel: this.channel,
      ts: this.messageTs,
      text,
    });
  }

  private enqueue(text: string): void {
    if (!this.messageTs) return;
    this.pendingText = text;
    if (this.flushTimer) return;

    const elapsed = Date.now() - this.lastUpdateAt;
    const delay = Math.max(0, 1100 - elapsed);

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const current = this.pendingText;
      if (!current) return;
      this.pendingText = null;
      this.queue = this.queue.then(() => this.doUpdate(current)).catch(() => {});
    }, delay);
  }

  private async doUpdate(text: string): Promise<void> {
    this.lastUpdateAt = Date.now();
    await this.slackPost("chat.update", {
      channel: this.channel,
      ts: this.messageTs!,
      text,
    });
  }

  private cancelPending(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingText = null;
  }

  private async waitForQueue(): Promise<void> {
    await this.queue;
  }

  private async slackPost(method: string, body: Record<string, unknown>): Promise<SlackApiResponse> {
    const resp = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await resp.json()) as SlackApiResponse;
    if (!data.ok) {
      console.error(`[slack-messenger] ${method} failed:`, data.error);
    }
    return data;
  }
}
