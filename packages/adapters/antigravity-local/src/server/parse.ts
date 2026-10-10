import { asNumber, asString, parseJson, parseObject } from "@paperclipai/adapter-utils/server-utils";

export interface ParsedAntigravityJsonl {
  sessionId: string | null;
  summary: string;
  errorMessage: string | null;
  status: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
}

export function parseAntigravityJsonl(stdout: string): ParsedAntigravityJsonl {
  let sessionId: string | null = null;
  let status: string | null = null;
  let errorMessage: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let thinkingTokens = 0;
  let totalTokens = 0;
  const textDeltas: string[] = [];
  let resultResponse = "";

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const eventName = asString(event.event, "").trim();

    if (eventName === "init") {
      sessionId = asString(event.conversation_id, "").trim() || sessionId;
      continue;
    }

    if (eventName === "step_update") {
      const stepUpdate = parseObject(event.step_update);
      sessionId = asString(stepUpdate.conversation_id, "").trim() || sessionId;
      const stepType = asString(stepUpdate.step_type, "").trim();

      if (stepType === "agent_response") {
        const delta = asString(stepUpdate.text_delta, "");
        if (delta) {
          textDeltas.push(delta);
        }
      }

      if (stepUpdate.usage) {
        const usage = parseObject(stepUpdate.usage);
        inputTokens = asNumber(usage.input_tokens, inputTokens);
        outputTokens = asNumber(usage.output_tokens, outputTokens);
        cachedInputTokens = asNumber(usage.cache_read_tokens, cachedInputTokens);
        thinkingTokens = asNumber(usage.thinking_tokens, thinkingTokens);
        totalTokens = asNumber(usage.total_tokens, totalTokens);
      }
      continue;
    }

    if (eventName === "result") {
      const res = parseObject(event.result);
      sessionId = asString(res.conversation_id, "").trim() || sessionId;
      status = asString(res.status, "").trim() || status;
      resultResponse = asString(res.response, "").trim();

      if (status && status !== "SUCCESS") {
        errorMessage = asString(res.error, "") || asString(res.message, "") || `Antigravity completed with status ${status}`;
      }

      if (res.usage) {
        const usage = parseObject(res.usage);
        inputTokens = asNumber(usage.input_tokens, inputTokens);
        outputTokens = asNumber(usage.output_tokens, outputTokens);
        cachedInputTokens = asNumber(usage.cache_read_tokens, cachedInputTokens);
        thinkingTokens = asNumber(usage.thinking_tokens, thinkingTokens);
        totalTokens = asNumber(usage.total_tokens, totalTokens);
      }
      continue;
    }

    if (eventName === "error") {
      const err = parseObject(event.error);
      const text = asString(err.message, "") || asString(err.error, "") || asString(event.message, "") || "Antigravity error";
      errorMessage = text;
    }
  }

  const collectedSummary = textDeltas.join("").trim();
  const summary = collectedSummary || resultResponse;

  return {
    sessionId,
    summary,
    errorMessage,
    status,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    thinkingTokens,
    totalTokens,
  };
}

export function isAntigravityUnknownSessionError(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return /unknown\s+(?:conversation|session)|(?:conversation|session)(?:\s+.*)?\s+not\s+found|resume\s+.*\s+not\s+found|invalid\s+(?:conversation|session)/i.test(haystack);
}
