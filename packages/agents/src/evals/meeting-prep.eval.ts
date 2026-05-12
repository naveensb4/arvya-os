import type { MeetingPrepBrief } from "@arvya/core";
import { meetingPrepBriefSchema } from "@arvya/core";

export type MeetingPrepFixture = {
  id: string;
  description: string;
  meeting: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    participants: Array<{ name: string; email?: string; company?: string }>;
  };
  brain: {
    name: string;
    thesis: string;
    memoryCount: number;
  };
  expectedSections: {
    minAttendees: number;
    minThingsToKnow: number;
    minQuestionsToAsk: number;
    minRisks: number;
    minOpenLoops: number;
    minOverallConfidence: number;
  };
};

export const meetingPrepFixtures: MeetingPrepFixture[] = [
  {
    id: "investor-call-sequoia",
    description: "Investor call with well-known VC — should produce high-confidence brief",
    meeting: {
      id: "m-inv-1",
      title: "Arvya <> Sequoia Capital",
      startTime: "2026-05-09T14:00:00Z",
      endTime: "2026-05-09T15:00:00Z",
      participants: [
        { name: "Sarah Chen", email: "sarah@sequoia.com", company: "Sequoia Capital" },
        { name: "Michael Park", email: "michael@sequoia.com", company: "Sequoia Capital" },
      ],
    },
    brain: {
      name: "Arvya Company Brain",
      thesis: "AI-powered deal intelligence platform",
      memoryCount: 50,
    },
    expectedSections: {
      minAttendees: 2,
      minThingsToKnow: 1,
      minQuestionsToAsk: 1,
      minRisks: 0,
      minOpenLoops: 0,
      minOverallConfidence: 0.5,
    },
  },
  {
    id: "customer-call-acme",
    description: "Customer call with active deal — should surface open loops and risks",
    meeting: {
      id: "m-cust-1",
      title: "Acme Corp <> Arvya Product Demo",
      startTime: "2026-05-09T10:00:00Z",
      endTime: "2026-05-09T11:00:00Z",
      participants: [
        { name: "John Williams", email: "john@acme.com", company: "Acme Corp" },
      ],
    },
    brain: {
      name: "Acme Deal Brain",
      thesis: "Enterprise SaaS deal for AI analytics",
      memoryCount: 30,
    },
    expectedSections: {
      minAttendees: 1,
      minThingsToKnow: 1,
      minQuestionsToAsk: 1,
      minRisks: 0,
      minOpenLoops: 0,
      minOverallConfidence: 0.4,
    },
  },
  {
    id: "internal-standup",
    description: "Internal standup — should produce minimal brief with low confidence",
    meeting: {
      id: "m-int-1",
      title: "Daily Standup",
      startTime: "2026-05-09T09:00:00Z",
      endTime: "2026-05-09T09:30:00Z",
      participants: [
        { name: "Naveen", email: "naveen@arvya.com", company: "Arvya" },
        { name: "PB", email: "pb@arvya.com", company: "Arvya" },
      ],
    },
    brain: {
      name: "Arvya Company Brain",
      thesis: "AI-powered deal intelligence",
      memoryCount: 5,
    },
    expectedSections: {
      minAttendees: 2,
      minThingsToKnow: 0,
      minQuestionsToAsk: 0,
      minRisks: 0,
      minOpenLoops: 0,
      minOverallConfidence: 0.3,
    },
  },
  {
    id: "advisor-call-unknown",
    description: "Advisor call with unknown attendee — should still produce valid brief",
    meeting: {
      id: "m-adv-1",
      title: "Advisor sync — Dr. Unknown",
      startTime: "2026-05-09T16:00:00Z",
      endTime: "2026-05-09T17:00:00Z",
      participants: [
        { name: "Dr. Unknown Person", email: "unknown@gmail.com" },
      ],
    },
    brain: {
      name: "Arvya Company Brain",
      thesis: "AI-powered deal intelligence",
      memoryCount: 20,
    },
    expectedSections: {
      minAttendees: 1,
      minThingsToKnow: 0,
      minQuestionsToAsk: 0,
      minRisks: 0,
      minOpenLoops: 0,
      minOverallConfidence: 0.2,
    },
  },
  {
    id: "multi-party-deal",
    description: "Multi-party deal meeting — should handle 5+ attendees",
    meeting: {
      id: "m-multi-1",
      title: "BigCo / Arvya / Legal — Partnership Agreement",
      startTime: "2026-05-09T11:00:00Z",
      endTime: "2026-05-09T12:30:00Z",
      participants: [
        { name: "Alice Johnson", email: "alice@bigco.com", company: "BigCo" },
        { name: "Bob Lee", email: "bob@bigco.com", company: "BigCo" },
        { name: "Carol Davis", email: "carol@law.com", company: "LegalFirm" },
        { name: "Dave Wilson", email: "dave@bigco.com", company: "BigCo" },
        { name: "Eve Brown", email: "eve@arvya.com", company: "Arvya" },
      ],
    },
    brain: {
      name: "BigCo Deal Brain",
      thesis: "Strategic partnership with BigCo",
      memoryCount: 40,
    },
    expectedSections: {
      minAttendees: 4,
      minThingsToKnow: 1,
      minQuestionsToAsk: 1,
      minRisks: 0,
      minOpenLoops: 0,
      minOverallConfidence: 0.4,
    },
  },
];

export function validateBriefAgainstFixture(
  brief: MeetingPrepBrief,
  fixture: MeetingPrepFixture,
): { pass: boolean; errors: string[] } {
  const errors: string[] = [];

  const parseResult = meetingPrepBriefSchema.safeParse(brief);
  if (!parseResult.success) {
    errors.push(`Schema validation failed: ${JSON.stringify(parseResult.error.issues)}`);
  }

  if (brief.meeting_id !== fixture.meeting.id) {
    errors.push(`meeting_id mismatch: ${brief.meeting_id} !== ${fixture.meeting.id}`);
  }

  if (brief.attendees.length < fixture.expectedSections.minAttendees) {
    errors.push(`Expected ≥${fixture.expectedSections.minAttendees} attendees, got ${brief.attendees.length}`);
  }

  if (brief.things_to_know.length < fixture.expectedSections.minThingsToKnow) {
    errors.push(`Expected ≥${fixture.expectedSections.minThingsToKnow} things_to_know, got ${brief.things_to_know.length}`);
  }

  if (brief.questions_to_ask.length < fixture.expectedSections.minQuestionsToAsk) {
    errors.push(`Expected ≥${fixture.expectedSections.minQuestionsToAsk} questions_to_ask, got ${brief.questions_to_ask.length}`);
  }

  if (brief.risks_to_dodge.length < fixture.expectedSections.minRisks) {
    errors.push(`Expected ≥${fixture.expectedSections.minRisks} risks, got ${brief.risks_to_dodge.length}`);
  }

  if (brief.overall_confidence < fixture.expectedSections.minOverallConfidence) {
    errors.push(`Expected confidence ≥${fixture.expectedSections.minOverallConfidence}, got ${brief.overall_confidence}`);
  }

  return { pass: errors.length === 0, errors };
}
