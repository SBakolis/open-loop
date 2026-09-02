import {
  tool,
  type ToolContext,
  type ToolDefinition,
} from "@opencode-ai/plugin";
import { parseDuration } from "../core/durations.js";
import { formatDetail, formatList } from "../commands/formatters.js";
import { CommandDispatcher } from "../commands/dispatcher.js";
import { LoopService } from "../commands/service.js";
import { LoopScheduler } from "../scheduler/scheduler.js";

function response(report: string, data: unknown = null): string {
  return JSON.stringify({ ok: true, report, data }, null, 2);
}

function observed<T extends Record<string, unknown>>(
  scheduler: LoopScheduler,
  execute: (args: T, context: ToolContext) => Promise<string>,
) {
  return async (args: T, context: ToolContext): Promise<string> => {
    scheduler.observe(context.sessionID);
    try {
      return await execute(args, context);
    } catch (error) {
      return JSON.stringify(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      );
    }
  };
}

export function createTools(
  service: LoopService,
  scheduler: LoopScheduler,
  dispatcher: CommandDispatcher,
): Record<string, ToolDefinition> {
  const id = tool.schema
    .string()
    .describe("Loop ID from create_loop or list_loops");

  return {
    loop_command: tool({
      description:
        "Parse and execute an exact /loop command argument string. Use only when the user invoked /loop.",
      args: { arguments: tool.schema.string() },
      execute: observed(scheduler, async ({ arguments: input }, context) => {
        const result = await dispatcher.execute(input, context);

        return response(result.report, result.loop ?? null);
      }),
    }),
    create_loop: tool({
      description:
        "Create a loop from canonical arguments such as `until -- goal` or `every 5m -- instruction`. The current tool turn is iteration one.",
      args: { command: tool.schema.string() },
      execute: observed(scheduler, async ({ command }, context) => {
        const result = await dispatcher.execute(command, context);
        if (!result.loop) {
          throw new Error("Expected a loop creation command");
        }

        return response(result.report, result.loop);
      }),
    }),
    list_loops: tool({
      description: "List loops belonging to the calling OpenCode session.",
      args: {},
      execute: observed(scheduler, async (_args, context) => {
        const loops = await service.forSession(context.sessionID);

        return response(formatList(loops), loops);
      }),
    }),
    get_loop: tool({
      description: "Get one loop belonging to the calling session.",
      args: { loop_id: id },
      execute: observed(scheduler, async ({ loop_id }, context) => {
        const loop = await service.getOwned(context.sessionID, loop_id);

        return response(formatDetail(loop), loop);
      }),
    }),
    pause_loop: lifecycleTool(
      "Pause autonomous dispatch for a loop.",
      id,
      scheduler,
      async (loopId, context) => service.pause(context.sessionID, loopId),
      "Paused",
    ),
    resume_loop: lifecycleTool(
      "Resume a paused or blocked loop.",
      id,
      scheduler,
      async (loopId, context) => service.resume(context.sessionID, loopId),
      "Resumed",
    ),
    run_loop: lifecycleTool(
      "Queue an open loop to run now, subject to idle and safety checks.",
      id,
      scheduler,
      async (loopId, context) => scheduler.runNow(context.sessionID, loopId),
      "Queued",
    ),
    stop_loop: tool({
      description:
        "Stop future iterations of a loop. Set abort only for an explicit user request to abort the current turn.",
      args: {
        loop_id: id,
        reason: tool.schema.string().min(1).optional(),
        abort: tool.schema.boolean().optional(),
      },
      execute: observed(
        scheduler,
        async ({ loop_id, reason, abort }, context) => {
          const loop = await service.stop(
            context.sessionID,
            loop_id,
            reason ?? "agent_or_user_stopped",
          );
          if (abort) {
            await scheduler.abortSession(context.sessionID);
          }

          return response(`Stopped ${loop.id}.`, loop);
        },
      ),
    }),
    schedule_next_run: tool({
      description:
        "Schedule the next dynamic-loop iteration. Delays are clamped to configured safety limits.",
      args: {
        loop_id: id,
        delay: tool.schema.string(),
        reason: tool.schema.string().min(1).max(4_000),
      },
      execute: observed(
        scheduler,
        async ({ loop_id, delay, reason }, context) => {
          const milliseconds = parseDuration(
            delay,
            service.config.maxDurationMs,
          );
          const loop = await service.schedule(
            context.sessionID,
            loop_id,
            milliseconds,
            reason,
          );

          return response(
            `Scheduled ${loop.id} for ${new Date(loop.nextRunAt!).toISOString()}.`,
            loop,
          );
        },
      ),
    }),
    complete_loop: tool({
      description:
        "Submit meaningful completion evidence for a goal loop. Configured command verification still cannot be bypassed.",
      args: {
        loop_id: id,
        evidence: tool.schema.string().min(10).max(4_000),
        checks: tool.schema
          .array(
            tool.schema.object({
              name: tool.schema.string(),
              result: tool.schema.enum(["pass", "fail", "not_run"]),
              summary: tool.schema.string().optional(),
            }),
          )
          .optional(),
      },
      execute: observed(scheduler, async ({ loop_id, evidence }, context) => {
        const loop = await service.complete(
          context.sessionID,
          loop_id,
          evidence,
        );

        return response(
          loop.status === "completed"
            ? `Completed ${loop.id}.`
            : `Evidence recorded; verifier has not passed for ${loop.id}.`,
          loop,
        );
      }),
    }),
    block_loop: tool({
      description:
        "Block a goal loop on concrete user input or an external blocker.",
      args: {
        loop_id: id,
        blocker: tool.schema.string().min(1).max(4_000),
        requested_input: tool.schema.string().optional(),
      },
      execute: observed(
        scheduler,
        async ({ loop_id, blocker, requested_input }, context) => {
          const detail = requested_input
            ? `${blocker}\nRequested input: ${requested_input}`
            : blocker;
          const loop = await service.block(context.sessionID, loop_id, detail);

          return response(`Blocked ${loop.id}.`, loop);
        },
      ),
    }),
    steer_loop: tool({
      description:
        "Append a durable instruction for the next iteration without replacing the original objective.",
      args: {
        loop_id: id,
        instruction: tool.schema.string().min(1).max(4_000),
      },
      execute: observed(
        scheduler,
        async ({ loop_id, instruction }, context) => {
          const loop = await service.steer(
            context.sessionID,
            loop_id,
            instruction,
          );

          return response(`Steering note saved for ${loop.id}.`, loop);
        },
      ),
    }),
    clear_loops: tool({
      description: "Remove terminal loop history for the calling session only.",
      args: {},
      execute: observed(scheduler, async (_args, context) => {
        const count = await service.clear(context.sessionID);

        return response(`Cleared ${count} terminal loop record(s).`, { count });
      }),
    }),
  };
}

function lifecycleTool(
  description: string,
  id: ReturnType<typeof tool.schema.string>,
  scheduler: LoopScheduler,
  operation: (
    id: string,
    context: ToolContext,
  ) => Promise<{ id: string; status: string }>,
  verb: string,
): ToolDefinition {
  return tool({
    description,
    args: { loop_id: id },
    execute: observed(scheduler, async ({ loop_id }, context) => {
      const loop = await operation(loop_id, context);

      return response(`${verb} ${loop.id} (${loop.status}).`, loop);
    }),
  });
}
