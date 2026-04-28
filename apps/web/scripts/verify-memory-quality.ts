import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { mergeMemoryObjectsForIngestion, mergeRelationshipsForIngestion } from "../lib/brain/memory-quality";
import { createBrain, updateMemoryObjectReview } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenaiApiKey = process.env.OPENAI_API_KEY;

  delete process.env.DATABASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  resetRepositoryForTests();
  resetAiClientForTests();

  try {
    const repository = getRepository();
    assert.equal(repository.mode, "in_memory");

    const brain = await createBrain({
      name: "Memory Quality Verification Brain",
      kind: "company",
      thesis: "Verify Arvya Company Brain memory dedupe, relationship merging, source display metadata, and edits.",
    });
    const firstSource = await repository.createSourceItem({
      brainId: brain.id,
      title: "Investor call one",
      type: "transcript",
      content: "Mr. Naveen Siva said Arvya Inc. needs company memory that compounds.",
    });
    const secondSource = await repository.createSourceItem({
      brainId: brain.id,
      title: "Investor call two",
      type: "transcript",
      content: "Naveen Siva repeated that Arvya should merge duplicate people, companies, and relationships.",
    });

    const firstMemories = await mergeMemoryObjectsForIngestion({
      repository,
      brainId: brain.id,
      sourceItemId: firstSource.id,
      memoryObjects: [
        {
          objectType: "person",
          name: "Mr. Naveen Siva",
          description: "Founder associated with Arvya.",
          sourceQuote: "Mr. Naveen Siva said Arvya Inc. needs company memory that compounds.",
          confidence: 0.88,
        },
        {
          objectType: "company",
          name: "Arvya Inc.",
          description: "Company building a compounding operating brain.",
          sourceQuote: "Arvya Inc. needs company memory that compounds.",
          confidence: 0.9,
        },
      ],
    });
    await mergeRelationshipsForIngestion({
      repository,
      brainId: brain.id,
      sourceItemId: firstSource.id,
      memoryObjects: firstMemories,
      relationships: [
        {
          fromName: "Mr. Naveen Siva",
          toName: "Arvya Inc.",
          relationshipType: "founder_of",
          sourceQuote: "Mr. Naveen Siva said Arvya Inc. needs company memory that compounds.",
          confidence: 0.86,
        },
      ],
    });

    const secondMemories = await mergeMemoryObjectsForIngestion({
      repository,
      brainId: brain.id,
      sourceItemId: secondSource.id,
      memoryObjects: [
        {
          objectType: "person",
          name: "Naveen Siva",
          description: "Founder pushing memory quality improvements.",
          sourceQuote: "Naveen Siva repeated that Arvya should merge duplicate people.",
          confidence: 0.93,
        },
        {
          objectType: "company",
          name: "Arvya",
          description: "Company Brain target for memory quality improvements.",
          sourceQuote: "Arvya should merge duplicate people, companies, and relationships.",
          confidence: 0.95,
        },
      ],
    });
    await mergeRelationshipsForIngestion({
      repository,
      brainId: brain.id,
      sourceItemId: secondSource.id,
      memoryObjects: secondMemories,
      relationships: [
        {
          fromName: "Naveen Siva",
          toName: "Arvya",
          relationshipType: "founder_of",
          sourceQuote: "Naveen Siva repeated that Arvya should merge duplicate people, companies, and relationships.",
          confidence: 0.94,
        },
      ],
    });

    const memories = await repository.listMemoryObjects(brain.id);
    const people = memories.filter((memory) => memory.objectType === "person");
    const companies = memories.filter((memory) => memory.objectType === "company");
    assert.equal(people.length, 1, "expected repeated person mentions to merge into one memory");
    assert.equal(companies.length, 1, "expected repeated company mentions to merge into one memory");

    const [person] = people;
    const [company] = companies;
    assert.equal(person.properties?.mentionCount, 2);
    assert.equal(company.properties?.mentionCount, 2);
    assert.deepEqual(new Set(company.properties?.sourceItemIds as string[]), new Set([firstSource.id, secondSource.id]));
    assert.ok((company.properties?.aliases as string[]).includes("Arvya Inc."));
    assert.ok((company.properties?.aliases as string[]).includes("Arvya"));
    assert.ok(company.description.includes("Company building a compounding operating brain."));
    assert.ok(company.description.includes("Company Brain target for memory quality improvements."));
    assert.equal(company.confidence, 0.95);

    const relationships = await repository.listRelationships(brain.id);
    assert.equal(relationships.length, 1, "expected duplicate relationship edges to merge");
    assert.equal(relationships[0].relationshipType, "founder_of");
    assert.equal(relationships[0].fromObjectId, person.id);
    assert.equal(relationships[0].toObjectId, company.id);
    assert.equal(relationships[0].properties?.mentionCount, 2);
    assert.equal(relationships[0].confidence, 0.94);

    const edited = await updateMemoryObjectReview(brain.id, company.id, {
      name: "Arvya",
      description: "Arvya Company Brain canonical company record.",
      confidence: 0.99,
      sourceQuote: null,
      status: "open",
    });
    assert.equal(edited?.name, "Arvya");
    assert.equal(edited?.confidence, 0.99);
    assert.equal(edited?.sourceQuote, undefined);
    assert.equal(edited?.status, "open");
    assert.equal(edited?.properties?.manuallyEdited, true);
    assert.equal(edited?.properties?.mentionCount, 2, "editing should preserve merged memory metadata");

    console.log("Memory quality verification passed.");
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAnthropicApiKey) process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    if (originalOpenaiApiKey) process.env.OPENAI_API_KEY = originalOpenaiApiKey;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
