import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function parseAntigravityStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const parsed = asRecord(safeJsonParse(line));
  if (!parsed) {
    return [{ kind: "stdout", ts, text: line }];
  }

  const event = asString(parsed.event).trim();

  if (event === "init") {
    const conversationId = asString(parsed.conversation_id).trim();
    return [{ kind: "init", ts, model: "antigravity", sessionId: conversationId }];
  }

  if (event === "step_update") {
    const stepUpdate = asRecord(parsed.step_update);
    if (!stepUpdate) return [];

    const stepType = asString(stepUpdate.step_type).trim();

    if (stepType === "agent_response") {
      const delta = asString(stepUpdate.text_delta);
      if (delta) {
        return [{ kind: "assistant", ts, text: delta, delta: true }];
      }
      return [];
    }

    if (stepType === "tool") {
      const state = asString(stepUpdate.state).trim();
      const toolName = asString(stepUpdate.tool_name).trim();
      const toolInfo = asRecord(stepUpdate.tool_info);
      const stepIndex = asString(stepUpdate.step_index, "0");
      const toolUseId = `${toolName || "tool"}-${stepIndex}`;

      if (state === "ACTIVE") {
        return [
          {
            kind: "tool_call",
            ts,
            toolUseId,
            name: toolName || asString(toolInfo?.name, "tool"),
            input: toolInfo?.parameters ?? {},
          },
        ];
      }

      if (state === "DONE") {
        const output = asString(toolInfo?.output, "");
        return [
          {
            kind: "tool_result",
            ts,
            toolUseId,
            toolName: toolName || "tool",
            content: output,
            isError: false,
          },
        ];
      }
    }

    return [];
  }

  if (event === "result") {
    const res = asRecord(parsed.result);
    const text = asString(res?.response, "");
    const usage = asRecord(res?.usage);
    const inputTokens = typeof usage?.input_tokens === "number" ? usage.input_tokens : 0;
    const outputTokens = typeof usage?.output_tokens === "number" ? usage.output_tokens : 0;
    const cachedTokens = typeof usage?.cache_read_tokens === "number" ? usage.cache_read_tokens : 0;

    return [
      {
        kind: "result",
        ts,
        text,
        inputTokens,
        outputTokens,
        cachedTokens,
        costUsd: 0,
        subtype: "completed",
        isError: false,
        errors: [],
      },
    ];
  }

  if (event === "error") {
    const text = asString(parsed.message) || asString(parsed.error) || "Antigravity error";
    return [{ kind: "stderr", ts, text }];
  }

  return [{ kind: "system", ts, text: `event: ${event || "unknown"}` }];
}
