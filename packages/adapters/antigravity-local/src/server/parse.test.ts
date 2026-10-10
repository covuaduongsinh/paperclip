import { describe, expect, it } from "vitest";
import { isAntigravityUnknownSessionError, parseAntigravityJsonl } from "./parse.js";
import { sessionCodec } from "./index.js";
import { buildAntigravityLocalConfig } from "../ui/build-config.js";
import { parseAntigravityStdoutLine } from "../ui/parse-stdout.js";

describe("parseAntigravityJsonl", () => {
  it("collects init, step_update and result events properly", () => {
    const lines = [
      JSON.stringify({ event: "init", conversation_id: "conv-123", init: { cwd: "/tmp" } }),
      JSON.stringify({
        event: "step_update",
        step_update: {
          conversation_id: "conv-123",
          step_index: 1,
          state: "ACTIVE",
          step_type: "agent_response",
          text_delta: "Hello ",
        },
      }),
      JSON.stringify({
        event: "step_update",
        step_update: {
          conversation_id: "conv-123",
          step_index: 1,
          state: "DONE",
          step_type: "agent_response",
          text_delta: "world!",
          usage: {
            input_tokens: 1500,
            output_tokens: 45,
            thinking_tokens: 20,
            cache_read_tokens: 500,
            total_tokens: 1545,
          },
        },
      }),
      JSON.stringify({
        event: "result",
        result: {
          conversation_id: "conv-123",
          status: "SUCCESS",
          response: "Hello world!",
          usage: {
            input_tokens: 1500,
            output_tokens: 45,
            thinking_tokens: 20,
            cache_read_tokens: 500,
            total_tokens: 1545,
          },
        },
      }),
    ].join("\n");

    const parsed = parseAntigravityJsonl(lines);

    expect(parsed).toEqual({
      sessionId: "conv-123",
      summary: "Hello world!",
      errorMessage: null,
      status: "SUCCESS",
      inputTokens: 1500,
      outputTokens: 45,
      cachedInputTokens: 500,
      thinkingTokens: 20,
      totalTokens: 1545,
    });
  });

  it("extracts error when status is not SUCCESS", () => {
    const lines = [
      JSON.stringify({
        event: "result",
        result: {
          conversation_id: "conv-err",
          status: "ERROR",
          error: "Permission denied",
        },
      }),
    ].join("\n");

    const parsed = parseAntigravityJsonl(lines);
    expect(parsed.errorMessage).toBe("Permission denied");
    expect(parsed.status).toBe("ERROR");
  });
});

describe("isAntigravityUnknownSessionError", () => {
  it("detects conversation/session not found errors", () => {
    expect(isAntigravityUnknownSessionError("conversation not found", "")).toBe(true);
    expect(isAntigravityUnknownSessionError("", "unknown conversation conv-123")).toBe(true);
    expect(isAntigravityUnknownSessionError("", "invalid session")).toBe(true);
    expect(isAntigravityUnknownSessionError("all normal", "")).toBe(false);
  });
});

describe("sessionCodec", () => {
  it("serializes and deserializes session params", () => {
    const serialized = sessionCodec.serialize({ conversationId: "conv-456", cwd: "/home/user/project" });
    expect(serialized).toEqual({ conversationId: "conv-456", cwd: "/home/user/project" });

    const deserialized = sessionCodec.deserialize(serialized);
    expect(deserialized).toEqual({ conversationId: "conv-456", cwd: "/home/user/project" });

    expect(sessionCodec.getDisplayId?.(deserialized)).toBe("conv-456");
  });
});

describe("buildAntigravityLocalConfig", () => {
  it("builds adapterConfig from form values", () => {
    const config = buildAntigravityLocalConfig({
      cwd: "/my/repo",
      model: "gemini-3.7-flash-high",
      thinkingEffort: "high",
      command: "agy",
      extraArgs: "--mode,accept-edits",
      envBindings: [],
      envVars: "",
    } as never);

    expect(config.cwd).toBe("/my/repo");
    expect(config.model).toBe("gemini-3.7-flash-high");
    expect(config.effort).toBe("high");
    expect(config.extraArgs).toEqual(["--mode", "accept-edits"]);
  });
});

describe("parseAntigravityStdoutLine", () => {
  it("converts tool calls to TranscriptEntry objects", () => {
    const initEntry = parseAntigravityStdoutLine(
      JSON.stringify({ event: "init", conversation_id: "conv-99" }),
      "2026-10-10T00:00:00Z",
    );
    expect(initEntry).toEqual([{ kind: "init", ts: "2026-10-10T00:00:00Z", model: "antigravity", sessionId: "conv-99" }]);

    const toolCallEntry = parseAntigravityStdoutLine(
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_type: "tool",
          state: "ACTIVE",
          tool_name: "view_file",
          tool_info: { name: "view_file", parameters: { path: "README.md" } },
        },
      }),
      "2026-10-10T00:00:01Z",
    );
    expect(toolCallEntry).toEqual([
      {
        kind: "tool_call",
        ts: "2026-10-10T00:00:01Z",
        name: "view_file",
        input: { path: "README.md" },
        toolUseId: "view_file-0",
      },
    ]);
  });
});

describe("testEnvironment", () => {
  it("runs environment test successfully", async () => {
    const { testEnvironment } = await import("./test.js");
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "antigravity_local",
      config: { cwd: process.cwd() },
    });
    expect(result.adapterType).toBe("antigravity_local");
    expect(["pass", "warn"]).toContain(result.status);
    expect(result.checks.some((c) => c.code === "command_ok")).toBe(true);
  });
});

