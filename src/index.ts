import type { Plugin } from "@opencode-ai/plugin";
import { JsonStore } from "./storage/json-store.js";
import { defaultStatePath } from "./storage/paths.js";
import { parseConfig } from "./core/config.js";
import { LoopService } from "./commands/service.js";
import { LoopScheduler } from "./scheduler/scheduler.js";
import { V1Adapter } from "./opencode/v1-adapter.js";
import { SessionTracker } from "./opencode/session-tracker.js";
import { normalizeEvent } from "./opencode/event-normalizer.js";
import { createTools } from "./opencode/tools.js";
import { CommandDispatcher } from "./commands/dispatcher.js";
import {
  buildCompactionContext,
  buildSystemReminder,
  hasReminder,
} from "./core/prompt-builder.js";
import { OPEN_STATUSES } from "./core/types.js";

const OpenLoopPlugin: Plugin = async (input, options) => {
  const { config, warnings } = parseConfig(options);
  const tracker = new SessionTracker();
  const adapter = new V1Adapter(input.client, input.directory, tracker);
  const service = new LoopService(
    new JsonStore(defaultStatePath()),
    config,
    input.project.id,
  );
  const scheduler = new LoopScheduler(service, adapter);
  adapter.onGeneratedMessage = (messageId) =>
    scheduler.trackGeneratedMessage(messageId);
  const executionContext = new Map<
    string,
    {
      agent: string;
      providerId: string | null;
      modelId: string | null;
      variant: string | null;
    }
  >();
  const dispatcher = new CommandDispatcher(service, scheduler, (sessionId) => {
    const current = executionContext.get(sessionId);

    return current?.providerId && current.modelId
      ? {
          providerId: current.providerId,
          modelId: current.modelId,
          variant: current.variant,
        }
      : undefined;
  });
  const tools = createTools(service, scheduler, dispatcher);

  for (const warning of warnings) {
    await adapter.log({
      name: "config.invalid",
      level: "warn",
      reason: warning,
    });
  }
  await scheduler.start();

  return {
    dispose: () => scheduler.dispose(),
    config: async (hostConfig) => {
      if (!config.registerCommand) {
        return;
      }
      hostConfig.command ??= {};
      hostConfig.command[config.commandName] = {
        description: "Create and manage safe autonomous loops",
        template:
          "The user invoked /loop. Call the loop_command tool exactly once with the complete argument text below. Do not infer arguments from other conversation context. If a loop is created, immediately perform iteration one in this same turn.\n\n$ARGUMENTS",
      };
    },
    tool: tools,
    event: async ({ event }) => {
      const normalized = normalizeEvent(event);
      if (normalized.type === "ignored") {
        return;
      }
      scheduler.observe(normalized.sessionId);
      if (normalized.type === "idle") {
        tracker.set(normalized.sessionId, "idle");
        await scheduler.onIdle(normalized.sessionId);
      } else if (normalized.type === "busy") {
        tracker.set(normalized.sessionId, "busy");
        await scheduler.onBusy(normalized.sessionId);
      } else if (normalized.type === "deleted") {
        tracker.delete(normalized.sessionId);
        await scheduler.onSessionDeleted(normalized.sessionId);
      } else if (normalized.type === "permission-asked") {
        await scheduler.onPermissionAsked(
          normalized.sessionId,
          normalized.permissionId,
        );
      } else if (normalized.type === "permission-replied") {
        await scheduler.onPermissionReplied(
          normalized.sessionId,
          normalized.permissionId,
          normalized.allowed,
        );
      } else if (normalized.type === "human-message") {
        await scheduler.onHumanMessage(
          normalized.sessionId,
          normalized.messageId,
          normalized.createdAt,
        );
      } else if (normalized.type === "session-error") {
        await scheduler.onSessionError(normalized.sessionId, normalized.error);
      }
    },
    "chat.message": async (chatInput) => {
      scheduler.observe(chatInput.sessionID);
      executionContext.set(chatInput.sessionID, {
        agent: chatInput.agent ?? "",
        providerId: chatInput.model?.providerID ?? null,
        modelId: chatInput.model?.modelID ?? null,
        variant: chatInput.variant ?? null,
      });
      if (chatInput.messageID) {
        await scheduler.onHumanMessage(
          chatInput.sessionID,
          chatInput.messageID,
          Date.now(),
        );
      }
    },
    "permission.ask": async (permission) =>
      scheduler.onPermissionAsked(permission.sessionID, permission.id),
    "experimental.chat.system.transform": async ({ sessionID }, output) => {
      if (!sessionID || hasReminder(output.system)) {
        return;
      }
      const loop = (await service.forSession(sessionID)).find((candidate) =>
        OPEN_STATUSES.has(candidate.status),
      );
      if (loop) {
        output.system.push(buildSystemReminder(loop));
      }
    },
    "experimental.session.compacting": async ({ sessionID }, output) => {
      const loops = (await service.forSession(sessionID)).filter((loop) =>
        OPEN_STATUSES.has(loop.status),
      );
      if (loops.length) {
        output.context.push(buildCompactionContext(loops));
      }
    },
  };
};

export default OpenLoopPlugin;
