import pc from "picocolors";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function printAntigravityStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    console.log(line);
    return;
  }

  const event = asString(parsed.event).trim();

  if (event === "init") {
    const conversationId = asString(parsed.conversation_id);
    console.log(pc.blue(`Antigravity session initialized (conversation=${conversationId})`));
    return;
  }

  if (event === "step_update") {
    const stepUpdate = asRecord(parsed.step_update);
    if (!stepUpdate) return;

    const stepType = asString(stepUpdate.step_type).trim();

    if (stepType === "agent_response") {
      const delta = asString(stepUpdate.text_delta);
      if (delta) {
        process.stdout.write(pc.green(delta));
      }
      return;
    }

    if (stepType === "tool") {
      const state = asString(stepUpdate.state).trim();
      const toolName = asString(stepUpdate.tool_name).trim();
      if (state === "ACTIVE") {
        console.log(pc.yellow(`[tool call: ${toolName}]`));
      } else if (state === "DONE") {
        console.log(pc.yellow(`[tool done: ${toolName}]`));
      }
      return;
    }

    return;
  }

  if (event === "result") {
    const res = asRecord(parsed.result);
    const status = asString(res?.status, "SUCCESS");
    const conversationId = asString(res?.conversation_id);
    console.log(pc.blue(`\nAntigravity completed [${status}] (conversation=${conversationId})`));
    return;
  }

  if (event === "error") {
    const text = asString(parsed.message) || asString(parsed.error) || "Antigravity error";
    console.log(pc.red(`error: ${text}`));
    return;
  }

  const payload = asRecord(parsed);
  console.log(pc.gray(`event: ${event || "unknown"} ${payload ? JSON.stringify(payload) : line}`));
}
