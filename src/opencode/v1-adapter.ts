import { randomBytes } from "node:crypto";
import type { PluginInput } from "@opencode-ai/plugin";
import type {
  NormalizedMessage,
  OpenCodeAdapter,
  StructuredLogEvent,
} from "../core/types.js";
import { SessionTracker } from "./session-tracker.js";

export class V1Adapter implements OpenCodeAdapter {
  onGeneratedMessage: ((messageId: string) => void) | null = null;
  constructor(
    private readonly client: PluginInput["client"],
    private readonly directory: string,
    readonly tracker: SessionTracker,
  ) {}

  async injectPrompt(
    input: Parameters<OpenCodeAdapter["injectPrompt"]>[0],
  ): Promise<{ accepted: boolean; messageId?: string }> {
    const messageId = `msg_${randomBytes(12).toString("hex")}`;
    this.onGeneratedMessage?.(messageId);
    const model =
      input.providerId && input.modelId
        ? { providerID: input.providerId, modelID: input.modelId }
        : undefined;
    const body = {
      messageID: messageId,
      ...(model ? { model } : {}),
      ...(input.agent ? { agent: input.agent } : {}),
      parts: [{ type: "text" as const, text: input.text }],
    };
    const response = await this.client.session.promptAsync({
      path: { id: input.sessionId },
      query: { directory: this.directory },
      body,
    });

    return response.error ? { accepted: false } : { accepted: true, messageId };
  }

  async abortSession(sessionId: string): Promise<boolean> {
    const response = await this.client.session.abort({
      path: { id: sessionId },
      query: { directory: this.directory },
    });

    return response.data === true;
  }

  async getSessionActivity(
    sessionId: string,
  ): Promise<"idle" | "busy" | "unknown"> {
    return this.tracker.get(sessionId);
  }

  async getSessionMessages(sessionId: string): Promise<NormalizedMessage[]> {
    const response = await this.client.session.messages({
      path: { id: sessionId },
      query: { directory: this.directory, limit: 20 },
    });

    return (response.data ?? []).map(({ info, parts }) => ({
      id: info.id,
      sessionId: info.sessionID,
      role: info.role,
      createdAt: info.time.created,
      text: parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n"),
      synthetic: parts.some(
        (part) => part.type === "text" && part.synthetic === true,
      ),
      toolCallCount: parts.filter((part) => part.type === "tool").length,
    }));
  }

  async log(event: StructuredLogEvent): Promise<void> {
    await this.client.app.log({
      body: {
        service: "open-loop",
        level: event.level,
        message: event.name,
        extra: {
          loopId: event.loopId,
          sessionId: event.sessionId,
          reason: event.reason,
          ...event.details,
        },
      },
    });
  }

  async notify(input: Parameters<OpenCodeAdapter["notify"]>[0]): Promise<void> {
    await this.client.tui.showToast({
      query: { directory: this.directory },
      body: input,
    });
  }
}
