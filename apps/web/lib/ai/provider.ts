import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z, ZodError } from "zod";
import type {
  AiClient,
  AiCompleteInput,
  AiCompletion,
  AiStructuredCompletion,
  AiStructuredInput,
  ModelProvider,
} from "@arvya/core";

function zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<
    string,
    unknown
  >;
}

type EnvConfig = {
  anthropicKey?: string;
  anthropicModel: string;
  openaiKey?: string;
  openaiModel: string;
  embeddingModel: string;
  defaultProvider?: ModelProvider;
  defaultModel?: string;
};

function readConfig(): EnvConfig {
  const rawDefaultProvider = process.env.DEFAULT_MODEL_PROVIDER?.trim();
  const defaultProvider =
    rawDefaultProvider === "anthropic" || rawDefaultProvider === "openai" || rawDefaultProvider === "local"
      ? rawDefaultProvider
      : undefined;
  const defaultModel = process.env.DEFAULT_MODEL?.trim() || undefined;
  const providerDefaultModel =
    defaultProvider === "anthropic" && defaultModel && !/^gpt-|^o\d/i.test(defaultModel)
      ? defaultModel
      : defaultProvider === "openai" && defaultModel && !/^claude/i.test(defaultModel)
        ? defaultModel
        : undefined;

  return {
    anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel:
      process.env.ANTHROPIC_MODEL?.trim() ||
      (defaultProvider === "anthropic" ? providerDefaultModel : undefined) ||
      "claude-sonnet-4-5",
    openaiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    openaiModel:
      process.env.OPENAI_MODEL?.trim() ||
      (defaultProvider === "openai" ? providerDefaultModel : undefined) ||
      "gpt-4.1-mini",
    embeddingModel:
      process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
    defaultProvider,
    defaultModel,
  };
}

function pickPreferredProvider(config: EnvConfig): ModelProvider {
  if (config.defaultProvider === "anthropic" && config.anthropicKey) return "anthropic";
  if (config.defaultProvider === "openai" && config.openaiKey) return "openai";
  if (config.anthropicKey) return "anthropic";
  if (config.openaiKey) return "openai";
  return "local";
}

function ensureJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Model returned empty response");
  }

  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fence) {
    const fenced = tryParse(fence[1]);
    if (fenced !== undefined) return fenced;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const carved = tryParse(trimmed.slice(firstBrace, lastBrace + 1));
    if (carved !== undefined) return carved;
  }

  throw new Error(`Model response was not valid JSON: ${trimmed.slice(0, 200)}`);
}

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function setNestedValue(target: unknown, path: PropertyKey[], value: unknown) {
  let cursor = target;
  for (const segment of path.slice(0, -1)) {
    if (cursor === null || typeof cursor !== "object") return false;
    cursor = (cursor as Record<PropertyKey, unknown>)[segment];
  }

  const last = path.at(-1);
  if (last === undefined || cursor === null || typeof cursor !== "object") return false;
  (cursor as Record<PropertyKey, unknown>)[last] = value;
  return true;
}

function getNestedValue(target: unknown, path: PropertyKey[]) {
  return path.reduce<unknown>((cursor, segment) => {
    if (cursor === null || typeof cursor !== "object") return undefined;
    return (cursor as Record<PropertyKey, unknown>)[segment];
  }, target);
}

function parseStructuredOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;

    const repaired = JSON.parse(JSON.stringify(value)) as unknown;
    let repairedAny = false;
    for (const issue of error.issues) {
      if (issue.code !== "too_big" || issue.origin !== "string" || typeof issue.maximum !== "number") continue;
      const current = getNestedValue(repaired, issue.path);
      if (typeof current !== "string") continue;
      repairedAny = setNestedValue(repaired, issue.path, current.slice(0, issue.maximum)) || repairedAny;
    }

    if (!repairedAny) throw error;
    return schema.parse(repaired);
  }
}

class LiveAiClient implements AiClient {
  readonly available = true;
  readonly preferredProvider: ModelProvider;
  readonly embeddingModel: string | null;

  private readonly config: EnvConfig;
  private anthropic?: Anthropic;
  private openai?: OpenAI;

  constructor(config: EnvConfig) {
    this.config = config;
    this.preferredProvider = pickPreferredProvider(config);
    this.embeddingModel = config.openaiKey ? config.embeddingModel : null;
  }

  private getAnthropic(): Anthropic {
    if (!this.config.anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    if (!this.anthropic) {
      this.anthropic = new Anthropic({ apiKey: this.config.anthropicKey });
    }
    return this.anthropic;
  }

  private getOpenAi(): OpenAI {
    if (!this.config.openaiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: this.config.openaiKey });
    }
    return this.openai;
  }

  async complete(input: AiCompleteInput): Promise<AiCompletion> {
    if (this.preferredProvider === "anthropic") {
      const client = this.getAnthropic();
      const response = await client.messages.create({
        model: this.config.anthropicModel,
        max_tokens: input.maxTokens ?? 1500,
        temperature: input.temperature ?? 0.2,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
      });
      const text = response.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
      return {
        text,
        provider: "anthropic",
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      };
    }

    const client = this.getOpenAi();
    const response = await client.chat.completions.create({
      model: this.config.openaiModel,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1500,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
    });
    return {
      text: response.choices[0]?.message.content ?? "",
      provider: "openai",
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };
  }

  async completeStructured<T>(
    input: AiStructuredInput<T>,
  ): Promise<AiStructuredCompletion<T>> {
    const jsonSchema = zodToJsonSchema(input.schema);

    if (this.preferredProvider === "anthropic") {
      const client = this.getAnthropic();
      const response = await client.messages.create({
        model: this.config.anthropicModel,
        max_tokens: input.maxTokens ?? 2400,
        temperature: input.temperature ?? 0.1,
        system: input.system,
        tools: [
          {
            name: input.schemaName,
            description:
              input.schemaDescription ?? `Structured output for ${input.schemaName}`,
            input_schema: jsonSchema as Anthropic.Tool["input_schema"],
          },
        ],
        tool_choice: { type: "tool", name: input.schemaName },
        messages: [{ role: "user", content: input.prompt }],
      });

      const toolUse = response.content.find((part) => part.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error(
          `Anthropic structured call did not return a tool_use block (schema=${input.schemaName})`,
        );
      }

      const data = parseStructuredOutput(input.schema, toolUse.input);
      return {
        data,
        provider: "anthropic",
        raw: JSON.stringify(toolUse.input),
      };
    }

    const client = this.getOpenAi();
    const response = await client.chat.completions.create({
      model: this.config.openaiModel,
      temperature: input.temperature ?? 0.1,
      max_tokens: input.maxTokens ?? 2400,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          description: input.schemaDescription,
          schema: jsonSchema,
          strict: false,
        },
      },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
    });

    const text = response.choices[0]?.message.content ?? "";
    const parsed = ensureJsonObject(text);
    const data = parseStructuredOutput(input.schema, parsed);
    return {
      data,
      provider: "openai",
      raw: text,
    };
  }

  async embed(texts: string[]): Promise<number[][] | null> {
    if (!this.embeddingModel) return null;
    if (texts.length === 0) return [];
    const client = this.getOpenAi();
    const response = await client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((row) => row.embedding as number[]);
  }
}

class StubAiClient implements AiClient {
  readonly available = false;
  readonly preferredProvider: ModelProvider = "local";
  readonly embeddingModel: string | null = null;

  async complete(): Promise<AiCompletion> {
    throw new Error(
      "AI provider is not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable LLM calls.",
    );
  }

  async completeStructured<T>(): Promise<AiStructuredCompletion<T>> {
    throw new Error(
      "AI provider is not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable structured LLM calls.",
    );
  }

  async embed(): Promise<number[][] | null> {
    return null;
  }
}

let cachedClient: AiClient | null = null;

export function getAiClient(): AiClient {
  if (cachedClient) return cachedClient;
  const config = readConfig();
  const hasAnyKey = Boolean(config.anthropicKey || config.openaiKey);
  cachedClient = hasAnyKey ? new LiveAiClient(config) : new StubAiClient();
  return cachedClient;
}

export function resetAiClientForTests() {
  cachedClient = null;
}

export { z };
