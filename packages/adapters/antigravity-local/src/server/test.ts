import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, ensurePathInEnv } from "@paperclipai/adapter-utils/server-utils";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  const home = os.homedir();
  const defaultBin = process.platform === "win32"
    ? path.join(home, ".gemini", "bin", "agy.exe")
    : path.join(home, ".gemini", "bin", "agy");

  if (await fileExists(defaultBin)) {
    return defaultBin;
  }
  return trimmed || "agy";
}

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = ctx.config ?? {};
  const cwd = asString(config.cwd, process.cwd());
  const rawCommand = asString(config.command, "agy");

  // Check CWD
  try {
    const stat = await fs.stat(cwd);
    if (!stat.isDirectory()) {
      checks.push({
        code: "invalid_cwd",
        level: "error",
        message: `Working directory "${cwd}" is not a directory.`,
      });
    } else {
      checks.push({
        code: "cwd_ok",
        level: "info",
        message: `Working directory "${cwd}" exists.`,
      });
    }
  } catch {
    checks.push({
      code: "missing_cwd",
      level: "warn",
      message: `Working directory "${cwd}" does not exist yet (will be created if possible).`,
    });
  }

  // Check command
  const resolvedCommand = await resolveAntigravityCommand(rawCommand);
  try {
    const env = ensurePathInEnv({ ...process.env });
    const { stdout } = await execFileAsync(resolvedCommand, ["--version"], { env, timeout: 5000 });
    checks.push({
      code: "command_ok",
      level: "info",
      message: `Antigravity CLI is available (${resolvedCommand}, version ${stdout.trim()}).`,
    });
  } catch (err) {
    checks.push({
      code: "command_not_found",
      level: "error",
      message: `Failed to execute Antigravity CLI at "${resolvedCommand}".`,
      detail: err instanceof Error ? err.message : String(err),
      hint: "Make sure Antigravity CLI (agy) is installed in PATH or at ~/.gemini/bin/agy.exe",
    });
  }

  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");
  const status = hasError ? "fail" : hasWarn ? "warn" : "pass";

  return {
    adapterType: "antigravity_local",
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}
