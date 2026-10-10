import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { parseAntigravityJsonl, isAntigravityUnknownSessionError } from "./parse.js";

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const conversationId = typeof r.conversationId === "string" ? r.conversationId : null;
    if (!conversationId) return null;
    return {
      conversationId,
      cwd: typeof r.cwd === "string" ? r.cwd : "",
    };
  },
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!params) return null;
    return {
      conversationId: params.conversationId,
      cwd: params.cwd,
    };
  },
  getDisplayId(params: Record<string, unknown> | null): string | null {
    return typeof params?.conversationId === "string" ? params.conversationId : null;
  },
};
