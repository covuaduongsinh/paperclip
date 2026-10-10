export const type = "antigravity_local";
export const label = "Antigravity CLI (local)";

export const DEFAULT_ANTIGRAVITY_LOCAL_MODEL = "gemini-3.7-flash-medium";

export const models = [
  { id: "gemini-3.7-flash-medium", label: "Gemini 3.7 Flash (Medium)" },
  { id: "gemini-3.7-flash-high", label: "Gemini 3.7 Flash (High)" },
  { id: "gemini-3.7-flash-low", label: "Gemini 3.7 Flash (Low)" },
  { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
  { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
  { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
  { id: "gemini-3.6-flash-medium", label: "Gemini 3.6 Flash (Medium)" },
  { id: "gemini-3.6-flash-high", label: "Gemini 3.6 Flash (High)" },
  { id: "gemini-3.6-flash-low", label: "Gemini 3.6 Flash (Low)" },
  { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" },
  { id: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro (Low)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
  { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)" },
  { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
];

export const ANTIGRAVITY_SUPPORTED_EFFORTS = ["low", "medium", "high", "max"] as const;
export type AntigravityEffort = (typeof ANTIGRAVITY_SUPPORTED_EFFORTS)[number];

export function antigravityReasoningEffortsForModel(_model: string): readonly string[] {
  return ANTIGRAVITY_SUPPORTED_EFFORTS;
}

export const agentConfigurationDoc = `# antigravity_local agent configuration

Adapter: antigravity_local

Use when:
- You want Paperclip to run Google Antigravity CLI (\`agy\`) locally on the host machine
- You want conversation sessions resumed across heartbeats with \`--conversation <id>\`
- You want full non-interactive execution with stream-json logging and automatic permission approval

Don't use when:
- You need webhook-style external invocation (use http or openclaw_gateway)
- You only need a one-shot script without an AI coding agent loop (use process)
- Antigravity CLI is not installed on the machine that runs Paperclip

Core fields:
- cwd (string, optional): absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- promptTemplate (string, optional): run prompt template
- model (string, optional): Antigravity model id. Defaults to gemini-3.7-flash-medium.
- effort (string, optional): reasoning effort (low | medium | high | max). Passed via \`--effort\`.
- command (string, optional): defaults to "agy" or full path to agy.exe
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (0 = wait until completion)
- graceSec (number, optional): SIGTERM grace period in seconds
`;
