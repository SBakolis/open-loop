import type { ToolContext } from "@opencode-ai/plugin";
import { parseCommand } from "../core/parser.js";
import type { LoopRecord, ManagementCommand } from "../core/types.js";
import { LoopScheduler } from "../scheduler/scheduler.js";
import { LoopService } from "./service.js";
import { formatDetail, formatList } from "./formatters.js";
import { LOOP_HELP } from "./help.js";

export class CommandDispatcher {
  constructor(
    private readonly service: LoopService,
    private readonly scheduler: LoopScheduler,
    private readonly executionContext?: (
      sessionId: string,
    ) =>
      | { providerId: string; modelId: string; variant: string | null }
      | undefined,
  ) {}

  async execute(
    input: string,
    context: ToolContext,
  ): Promise<{ report: string; loop?: LoopRecord }> {
    this.scheduler.observe(context.sessionID);
    const command = parseCommand(
      input,
      this.service.config.bareMode,
      this.service.config.maxDurationMs,
    );
    if (command.kind === "start") {
      command.persistent =
        command.persistent && this.service.config.persistByDefault;
      const loop = await this.service.create(
        command,
        context,
        this.executionContext?.(context.sessionID),
      );

      return {
        loop,
        report: `Created ${loop.id} (${loop.mode}${loop.persistent ? "" : ", ephemeral"}). This tool call is iteration 1: begin the requested work now.`,
      };
    }

    return this.management(command, context);
  }

  private async management(
    command: ManagementCommand,
    context: ToolContext,
  ): Promise<{ report: string; loop?: LoopRecord }> {
    const loops = await this.service.forSession(context.sessionID);
    if (command.action === "help") {
      return { report: LOOP_HELP };
    }
    if (
      command.action === "list" ||
      (command.action === "status" && !command.loopId)
    ) {
      return { report: formatList(loops) };
    }
    if (command.action === "clear") {
      return {
        report: `Cleared ${await this.service.clear(context.sessionID)} terminal loop record(s).`,
      };
    }
    if (command.action === "stop" && command.all) {
      let count = 0;
      for (const loop of loops) {
        if (
          [
            "active",
            "due",
            "dispatching",
            "running",
            "paused",
            "blocked",
          ].includes(loop.status)
        ) {
          await this.service.stop(context.sessionID, loop.id);
          count++;
        }
      }
      if (command.abort) {
        await this.scheduler.abortSession(context.sessionID);
      }

      return { report: `Stopped ${count} loop(s).` };
    }
    const id = command.loopId ?? resolveSingle(loops);
    if (command.action === "status") {
      return {
        report: formatDetail(
          await this.service.getOwned(context.sessionID, id),
        ),
      };
    }
    if (command.action === "pause") {
      return result(await this.service.pause(context.sessionID, id), "Paused");
    }
    if (command.action === "resume") {
      return result(
        await this.service.resume(context.sessionID, id),
        "Resumed",
      );
    }
    if (command.action === "run") {
      return result(
        await this.scheduler.runNow(context.sessionID, id),
        "Queued",
      );
    }
    if (command.action === "steer") {
      return result(
        await this.service.steer(context.sessionID, id, command.prompt!),
        "Steering note saved for",
      );
    }
    const loop = await this.service.stop(context.sessionID, id);
    if (command.abort) {
      await this.scheduler.abortSession(context.sessionID);
    }

    return result(loop, "Stopped");
  }
}

function resolveSingle(loops: LoopRecord[]): string {
  const manageable = loops.filter((loop) =>
    ["active", "due", "dispatching", "running", "paused", "blocked"].includes(
      loop.status,
    ),
  );
  if (manageable.length !== 1) {
    throw new Error(`${formatList(manageable)}\nSpecify a loop ID.`);
  }

  return manageable[0]!.id;
}

function result(
  loop: LoopRecord,
  action: string,
): { report: string; loop: LoopRecord } {
  return { loop, report: `${action} ${loop.id} (${loop.status}).` };
}
