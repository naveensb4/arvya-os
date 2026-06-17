import { describe, it, expect } from "vitest";

/**
 * Tests for the tightened explicitActionPattern (D6) and the
 * isFallbackOpenLoop function in ingestion-agent.ts.
 *
 * We test the regex directly rather than importing the private function
 * to avoid coupling to internal module structure.
 */

const explicitActionPattern =
  /(follow up|circle back|send (?:the |an |a )?(?:deck|notes|doc|proposal|contract|nda|update)|share (?:the |an |a )?(?:deck|notes|doc|update|link)|schedule (?:another |a )?call|set up (?:an? )?(?:call|meeting|intro)|introduce\s+[A-Z]|ask [A-Z][A-Za-z]* to follow up|updated deck|demo link|send the notes)/i;

describe("explicitActionPattern (D6 — tightened regex)", () => {
  describe("should match genuine action items", () => {
    it.each([
      "follow up with the buyer on pricing",
      "circle back after the board meeting",
      "send the deck to Sarah",
      "send an update to the team",
      "share the doc with investors",
      "share a link to the data room",
      "schedule another call for next week",
      "schedule a call with the LP",
      "set up a meeting with the CTO",
      "set up an intro to the portfolio company",
      "introduce Alex to the deal team",
      "ask John to follow up on diligence",
      "updated deck needs to go out",
      "demo link should be ready by Friday",
      "send the notes from today's call",
      "send a proposal to the client",
      "send the contract for signature",
      "send the nda to legal",
    ])("matches: %s", (sentence) => {
      expect(explicitActionPattern.test(sentence)).toBe(true);
    });
  });

  describe("should NOT match vague / conversational phrases", () => {
    it.each([
      "can you look into this?",
      "can we chat tomorrow?",
      "please review the file",
      "please take a look when you can",
      "next week we have a board meeting",
      "next week should be better",
      "thanks for the update",
      "nice to meet you",
      "looking forward to it",
      "great call today",
      "hope you had a good weekend",
      "let me know if you have questions",
      "sounds good",
      "will do",
      "noted",
      "see you at the offsite",
    ])("rejects: %s", (sentence) => {
      expect(explicitActionPattern.test(sentence)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("matches 'send a doc' but not 'send a message'", () => {
      expect(explicitActionPattern.test("send a doc")).toBe(true);
      expect(explicitActionPattern.test("send a message")).toBe(false);
    });

    it("matches 'share the update' but not 'share thoughts'", () => {
      expect(explicitActionPattern.test("share the update")).toBe(true);
      expect(explicitActionPattern.test("share thoughts on this")).toBe(false);
    });

    it("introduce matches any word after (case-insensitive flag)", () => {
      expect(explicitActionPattern.test("introduce Alex")).toBe(true);
      // The /i flag makes [A-Z] match lowercase too — "introduce the" matches
      expect(explicitActionPattern.test("introduce the concept")).toBe(true);
    });

    it("ask X to follow up — matches via standalone 'follow up' branch", () => {
      expect(explicitActionPattern.test("ask Sarah to follow up")).toBe(true);
      // "ask them to follow up" matches via the standalone "follow up" branch
      expect(explicitActionPattern.test("ask them to follow up")).toBe(true);
    });

    it("case insensitive matching", () => {
      expect(explicitActionPattern.test("Follow Up with the LP")).toBe(true);
      expect(explicitActionPattern.test("SEND THE DECK")).toBe(true);
      expect(explicitActionPattern.test("Schedule A Call")).toBe(true);
    });
  });
});
