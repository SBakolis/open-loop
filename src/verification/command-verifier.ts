import { spawn } from "node:child_process";
import { fingerprint, redact, truncateBytes } from "./output-sanitizer.js";

export type VerificationResult = {
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  summary: string;
  fingerprint: string;
};

export async function verifyCommand(input: {
  command: string;
  directory: string;
  timeoutMs: number;
  outputLimitBytes: number;
}): Promise<VerificationResult> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(input.command, {
      cwd: input.directory,
      shell: true,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = truncateBytes(stdout + chunk.toString(), input.outputLimitBytes);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncateBytes(stderr + chunk.toString(), input.outputLimitBytes);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32") {
        child.kill("SIGKILL");
      } else if (child.pid) {
        process.kill(-child.pid, "SIGKILL");
      }
    }, input.timeoutMs);
    timer.unref();
    child.on("error", (error) => finish(null, error.message));
    child.on("close", (code) => finish(code, ""));

    let finished = false;
    function finish(exitCode: number | null, launchError: string): void {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      const output = redact(
        [launchError, stderr, stdout].filter(Boolean).join("\n"),
      ).trim();
      const summary = timedOut
        ? `Verifier timed out after ${input.timeoutMs}ms`
        : `Verifier exited ${exitCode ?? "without a code"}${output ? `: ${output}` : ""}`;
      resolve({
        passed: !timedOut && exitCode === 0,
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        summary: truncateBytes(
          summary,
          Math.min(input.outputLimitBytes, 8_000),
        ),
        fingerprint: fingerprint(`${exitCode}:${timedOut}:${output}`),
      });
    }
  });
}
