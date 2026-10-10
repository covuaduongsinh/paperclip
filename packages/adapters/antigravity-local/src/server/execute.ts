import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  buildRuntimeToolsEnv,
  buildInvocationEnvForLogs,
  ensurePathInEnv,
  joinPromptSections,
  parseObject,
  renderTemplate,
  runChildProcess,
  selectInitialCommunicationGuidance,
  selectPaperclipPromptSections,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_ANTIGRAVITY_LOCAL_MODEL } from "../index.js";
import { isAntigravityUnknownSessionError, parseAntigravityJsonl } from "./parse.js";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveAntigravityCommand(command: string): Promise<string> {
  const trimmed = command.trim();
  if (trimmed && trimmed !== "agy" && trimmed !== "agy.exe") {
    return trimmed;
  }

  // Check default install location in user home
  const home = os.homedir();
  const defaultBin = process.platform === "win32"
    ? path.join(home, ".gemini", "bin", "agy.exe")
    : path.join(home, ".gemini", "bin", "agy");

  if (await fileExists(defaultBin)) {
    return defaultBin;
  }

  return trimmed || "agy";
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  const rawCommand = asString(config.command, "agy");
  const command = await resolveAntigravityCommand(rawCommand);
  const cwd = asString(config.cwd, process.cwd());
  const model = asString(config.model, DEFAULT_ANTIGRAVITY_LOCAL_MODEL);
  const effort = asString(config.effort, "").trim();
  const extraArgs = asStringArray(config.extraArgs);
  const promptTemplate = asString(config.promptTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 15);

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {
    ...buildPaperclipEnv(agent, ctx.agentIdentity),
    ...buildRuntimeToolsEnv(ctx.runtimeTools),
  };
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === "string") env[k] = v;
  }
  env.PAPERCLIP_RUN_ID = runId;
  if (authToken) env.PAPERCLIP_API_KEY = authToken;

  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const runtimeSessionId = asString(runtimeSessionParams.conversationId, runtime.sessionId ?? "").trim();
  const runtimeSessionCwd = asString(runtimeSessionParams.cwd, "").trim();

  const canResumeSession =
    runtimeSessionId.length > 0 &&
    (runtimeSessionCwd.length === 0 || path.resolve(runtimeSessionCwd) === path.resolve(cwd));

  let instructionsPrefix = "";
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  if (instructionsFilePath) {
    try {
      const instructionsContents = await fs.readFile(instructionsFilePath, "utf8");
      instructionsPrefix = `${instructionsContents}\n\n`;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await onLog(
        "stdout",
        `[paperclip] Warning: could not read agent instructions file "${instructionsFilePath}": ${reason}\n`,
      );
    }
  }

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };

  const buildPrompt = (resumedSession: boolean) => {
    const { taskContextNote, wakePrompt } = selectPaperclipPromptSections(context, {
      resumedSession,
      includeCommunicationGuidance: false,
    });
    const renderedPrompt = resumedSession && wakePrompt.length > 0
      ? ""
      : renderTemplate(promptTemplate, templateData);

    const basePrompt = joinPromptSections([
      instructionsPrefix,
      wakePrompt,
      taskContextNote,
      renderedPrompt,
    ]);

    return joinPromptSections([
      selectInitialCommunicationGuidance(context, { resumedSession }),
      basePrompt,
    ]);
  };

  const runAttempt = async (resumeSessionId: string | null) => {
    const prompt = buildPrompt(Boolean(resumeSessionId));

    const args = [
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
    ];

    if (resumeSessionId) {
      args.push("--conversation", resumeSessionId);
    }
    if (model) {
      args.push("--model", model);
    }
    if (effort) {
      args.push("--effort", effort);
    }
    if (extraArgs.length > 0) {
      args.push(...extraArgs);
    }
    args.push("--print", prompt);

    const runtimeEnv = ensurePathInEnv({ ...process.env, ...env } as Record<string, string>);
    const loggedEnv = buildInvocationEnvForLogs(env, {
      runtimeEnv,
      includeRuntimeKeys: ["HOME", "USERPROFILE"],
      resolvedCommand: command,
    });

    if (onMeta) {
      await onMeta({
        adapterType: "antigravity_local",
        command,
        cwd,
        commandArgs: args.map((v, i) => (i === args.length - 1 ? `<prompt ${prompt.length} chars>` : v)),
        env: loggedEnv,
        prompt,
        context,
      });
    }

    const proc = await runChildProcess(runId, command, args, {
      cwd,
      env,
      timeoutSec,
      graceSec,
      onLog,
      onSpawn: ctx.onSpawn,
    });

    return { proc, prompt };
  };

  const initialSessionId = canResumeSession ? runtimeSessionId : null;
  let attempt = await runAttempt(initialSessionId);

  // If resuming failed because the conversation ID no longer exists, retry once with a fresh conversation
  if (
    initialSessionId &&
    !attempt.proc.timedOut &&
    (attempt.proc.exitCode ?? 0) !== 0 &&
    isAntigravityUnknownSessionError(attempt.proc.stdout, attempt.proc.stderr)
  ) {
    await onLog(
      "stdout",
      `[paperclip] Antigravity conversation "${initialSessionId}" not found. Starting a fresh conversation.\n`,
    );
    attempt = await runAttempt(null);
  }

  const { proc } = attempt;
  const parsed = parseAntigravityJsonl(proc.stdout);

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Timed out after ${timeoutSec}s`,
    };
  }

  const exitCode = proc.exitCode ?? 0;
  const finalErrorMessage = parsed.errorMessage ?? (exitCode !== 0 ? `Antigravity exited with code ${exitCode}` : null);
  const activeSessionId = parsed.sessionId || initialSessionId;

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    errorMessage: finalErrorMessage,
    sessionId: activeSessionId,
    sessionParams: activeSessionId ? { conversationId: activeSessionId, cwd } : null,
    sessionDisplayId: activeSessionId,
    provider: "google",
    model,
    summary: parsed.summary,
    usage: {
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      cachedInputTokens: parsed.cachedInputTokens,
    },
    resultJson: {
      status: parsed.status,
      thinkingTokens: parsed.thinkingTokens,
      totalTokens: parsed.totalTokens,
    },
  };
}
