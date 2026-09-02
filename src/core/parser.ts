import { LoopError } from "./errors.js";
import { isDurationToken, parseDuration } from "./durations.js";
import type {
  BareMode,
  ManagementCommand,
  ParsedCommand,
  StartCommand,
} from "./types.js";

type Token = { value: string; start: number; end: number; quoted: boolean };

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    while (/\s/.test(input[index] ?? "")) {
      index++;
    }
    if (index >= input.length) {
      break;
    }
    const start = index;
    let value = "";
    let quote: "'" | '"' | null = null;
    let quoted = false;
    while (index < input.length) {
      const character = input[index]!;
      if (!quote && /\s/.test(character)) {
        break;
      }
      if (!quote && (character === "'" || character === '"')) {
        quote = character;
        quoted = true;
        index++;
        continue;
      }
      if (quote && character === quote) {
        quote = null;
        index++;
        continue;
      }
      if (character === "\\" && index + 1 < input.length && quote !== "'") {
        value += input[index + 1];
        index += 2;
        continue;
      }
      value += character;
      index++;
    }
    if (quote) {
      throw new LoopError("unterminated_quote", "Unterminated quoted argument");
    }
    tokens.push({ value, start, end: index, quoted });
  }

  return tokens;
}

const MANAGEMENT = new Set([
  "help",
  "list",
  "status",
  "pause",
  "resume",
  "run",
  "stop",
  "clear",
  "steer",
]);

export function parseCommand(
  input: string,
  bareMode: BareMode = "goal",
  maxDurationMs = Number.MAX_SAFE_INTEGER,
): ParsedCommand {
  const source = input.replace(/^\s*\/loop(?:\s+|$)/, "");
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    return management("help");
  }
  const first = tokens[0]!;
  if (MANAGEMENT.has(first.value)) {
    return parseManagement(source, tokens);
  }

  let mode: StartCommand["mode"];
  let intervalMs: number | null = null;
  let index = 0;
  if (first.value === "until") {
    mode = "goal";
    index = 1;
  } else if (first.value === "dynamic") {
    mode = "dynamic";
    index = 1;
  } else if (first.value === "every") {
    mode = "interval";
    index = 1;
    const parsed = parseDurationAt(tokens, index, maxDurationMs);
    intervalMs = parsed.value;
    index = parsed.next;
  } else if (isDurationToken(first.value)) {
    mode = "interval";
    const parsed = parseDurationAt(tokens, 0, maxDurationMs);
    intervalMs = parsed.value;
    index = parsed.next;
  } else {
    if (bareMode === "error") {
      throw new LoopError(
        "ambiguous_bare_mode",
        "Use `/loop until -- <goal>` or `/loop dynamic -- <instruction>`",
      );
    }
    mode = bareMode;
  }

  const command: StartCommand = {
    kind: "start",
    mode,
    prompt: "",
    intervalMs,
    maxRuns: null,
    maxAgeMs: null,
    minDelayMs: null,
    verifyCommand: null,
    completionType: null,
    once: false,
    persistent: true,
    allowOverlap: false,
  };
  let promptStart: number | null = null;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (token.value === "--") {
      promptStart = token.end;
      if (/\s/.test(source[promptStart] ?? "")) {
        promptStart++;
      }
      break;
    }
    if (!token.value.startsWith("--")) {
      promptStart = token.start;
      break;
    }
    switch (token.value) {
      case "--max-runs":
        command.maxRuns = positiveInteger(
          requireValue(tokens, ++index, token.value),
          token.value,
        );
        break;
      case "--max-age": {
        const parsed = parseDurationAt(tokens, ++index, maxDurationMs);
        command.maxAgeMs = parsed.value;
        index = parsed.next - 1;
        break;
      }
      case "--min-delay": {
        const parsed = parseDurationAt(tokens, ++index, maxDurationMs);
        command.minDelayMs = parsed.value;
        index = parsed.next - 1;
        break;
      }
      case "--verify":
        command.verifyCommand = requireValue(
          tokens,
          ++index,
          token.value,
        ).value;
        break;
      case "--completion": {
        const value = requireValue(tokens, ++index, token.value).value;
        if (value !== "agent" && value !== "command" && value !== "hybrid") {
          throw new LoopError(
            "invalid_option",
            `Invalid completion policy: ${value}`,
          );
        }
        command.completionType = value;
        break;
      }
      case "--once":
        command.once = true;
        command.maxRuns = 1;
        break;
      case "--no-persist":
        command.persistent = false;
        break;
      case "--allow-overlap":
        command.allowOverlap = true;
        break;
      default:
        throw new LoopError("unknown_option", `Unknown option: ${token.value}`);
    }
    index++;
  }
  command.prompt = promptStart === null ? "" : source.slice(promptStart);
  if (!command.prompt.trim()) {
    throw new LoopError(
      "missing_prompt",
      "A loop objective or instruction is required",
    );
  }
  if (mode !== "goal" && command.verifyCommand) {
    throw new LoopError(
      "invalid_option",
      "--verify is only valid for goal loops",
    );
  }
  if (
    command.completionType &&
    !command.verifyCommand &&
    command.completionType !== "agent"
  ) {
    throw new LoopError(
      "invalid_option",
      `${command.completionType} completion requires --verify`,
    );
  }

  return command;
}

function parseManagement(source: string, tokens: Token[]): ManagementCommand {
  const action = tokens[0]!.value as ManagementCommand["action"];
  const result = management(action);
  let index = 1;
  if (action === "steer") {
    result.loopId = tokens[index]?.value ?? null;
    if (!result.loopId) {
      throw new LoopError("missing_loop_id", "steer requires a loop ID");
    }
    index++;
    const delimiter = tokens[index];
    const promptStart =
      delimiter?.value === "--"
        ? delimiter.end + (/\s/.test(source[delimiter.end] ?? "") ? 1 : 0)
        : delimiter?.start;
    result.prompt =
      promptStart === undefined ? null : source.slice(promptStart);
    if (!result.prompt?.trim()) {
      throw new LoopError(
        "missing_prompt",
        "steer requires an additional instruction",
      );
    }

    return result;
  }
  for (; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.value === "--all" && action === "stop") {
      result.all = true;
    } else if (token.value === "--abort" && action === "stop") {
      result.abort = true;
    } else if (!result.loopId && !token.value.startsWith("--")) {
      result.loopId = token.value;
    } else {
      throw new LoopError(
        "invalid_management_command",
        `Unexpected argument: ${token.value}`,
      );
    }
  }

  return result;
}

function management(action: ManagementCommand["action"]): ManagementCommand {
  return {
    kind: "management",
    action,
    loopId: null,
    all: false,
    abort: false,
    prompt: null,
  };
}

function requireValue(tokens: Token[], index: number, option: string): Token {
  const value = tokens[index];
  if (!value || value.value === "--") {
    throw new LoopError("missing_option_value", `${option} requires a value`);
  }

  return value;
}

function positiveInteger(token: Token, option: string): number {
  const value = Number(token.value);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new LoopError(
      "invalid_option",
      `${option} requires a positive integer`,
    );
  }

  return value;
}

function parseDurationAt(
  tokens: Token[],
  index: number,
  maxMs: number,
): { value: number; next: number } {
  const first = requireValue(tokens, index, "duration");
  if (
    /^\d+(?:\.\d+)?$/.test(first.value) &&
    tokens[index + 1] &&
    /^[a-z]+$/i.test(tokens[index + 1]!.value)
  ) {
    return {
      value: parseDuration(`${first.value} ${tokens[index + 1]!.value}`, maxMs),
      next: index + 2,
    };
  }

  return { value: parseDuration(first.value, maxMs), next: index + 1 };
}
