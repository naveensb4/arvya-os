import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SlackMessenger } from "../slack-messenger";

let fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

beforeEach(() => {
  fetchCalls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const body = JSON.parse(init?.body as string);
    fetchCalls.push({ url: input as string, body });
    return new Response(JSON.stringify({ ok: true, ts: "msg-ts-1" }), { status: 200 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SlackMessenger", () => {
  it("postThinking sends a chat.postMessage with Thinking text", async () => {
    const messenger = new SlackMessenger("xoxb-test", "C123", "thread-ts");
    await messenger.postThinking();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain("chat.postMessage");
    expect(fetchCalls[0].body.text).toContain("Thinking");
    expect(fetchCalls[0].body.thread_ts).toBe("thread-ts");
  });

  it("updateFinal replaces the thinking message via chat.update", async () => {
    const messenger = new SlackMessenger("xoxb-test", "C123", "thread-ts");
    await messenger.postThinking();
    await messenger.updateFinal("Here is your answer");

    const updateCall = fetchCalls.find((c) => c.url.includes("chat.update"));
    expect(updateCall).toBeDefined();
    expect(updateCall!.body.text).toBe("Here is your answer");
    expect(updateCall!.body.ts).toBe("msg-ts-1");
  });

  it("updateFinal posts new message if postThinking was never called", async () => {
    const messenger = new SlackMessenger("xoxb-test", "C123", "thread-ts");
    await messenger.updateFinal("Direct answer");

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain("chat.postMessage");
    expect(fetchCalls[0].body.text).toBe("Direct answer");
  });
});
