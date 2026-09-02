import { describe, expect, it } from "vitest";
import { verifyCommand } from "../../src/verification/command-verifier.js";
import {
  redact,
  truncateBytes,
} from "../../src/verification/output-sanitizer.js";

describe("command verifier", () => {
  it("accepts exit zero and reports non-zero", async () => {
    const pass = await verifyCommand({
      command: `${process.execPath} -e "process.exit(0)"`,
      directory: process.cwd(),
      timeoutMs: 2_000,
      outputLimitBytes: 1_024,
    });
    const fail = await verifyCommand({
      command: `${process.execPath} -e "process.exit(3)"`,
      directory: process.cwd(),
      timeoutMs: 2_000,
      outputLimitBytes: 1_024,
    });
    expect(pass.passed).toBe(true);
    expect(fail).toMatchObject({ passed: false, exitCode: 3 });
  });

  it("times out, caps output, and redacts secrets", async () => {
    const result = await verifyCommand({
      command: `${process.execPath} -e "setTimeout(()=>{},5000)"`,
      directory: process.cwd(),
      timeoutMs: 30,
      outputLimitBytes: 100,
    });
    expect(result.timedOut).toBe(true);
    expect(Buffer.byteLength(truncateBytes("x".repeat(500), 20))).toBeLessThan(
      40,
    );
    expect(redact("api_key=super-secret-value")).not.toContain(
      "super-secret-value",
    );
  });
});
