import type { Event } from "@opencode-ai/sdk";

export type NormalizedEvent =
  | { type: "idle" | "busy"; sessionId: string }
  | { type: "deleted"; sessionId: string }
  | { type: "permission-asked"; sessionId: string; permissionId: string }
  | {
      type: "permission-replied";
      sessionId: string;
      permissionId: string;
      allowed: boolean;
    }
  | {
      type: "human-message";
      sessionId: string;
      messageId: string;
      createdAt: number;
    }
  | { type: "session-error"; sessionId: string; error: string }
  | { type: "ignored" };

export function normalizeEvent(event: Event): NormalizedEvent {
  switch (event.type) {
    case "session.idle":
      return { type: "idle", sessionId: event.properties.sessionID };
    case "session.status":
      return event.properties.status.type === "busy"
        ? { type: "busy", sessionId: event.properties.sessionID }
        : event.properties.status.type === "idle"
          ? { type: "idle", sessionId: event.properties.sessionID }
          : { type: "ignored" };
    case "session.deleted":
      return { type: "deleted", sessionId: event.properties.info.id };
    case "permission.updated":
      return {
        type: "permission-asked",
        sessionId: event.properties.sessionID,
        permissionId: event.properties.id,
      };
    case "permission.replied":
      return {
        type: "permission-replied",
        sessionId: event.properties.sessionID,
        permissionId: event.properties.permissionID,
        allowed:
          event.properties.response !== "reject" &&
          event.properties.response !== "deny",
      };
    case "message.updated":
      return event.properties.info.role === "user"
        ? {
            type: "human-message",
            sessionId: event.properties.info.sessionID,
            messageId: event.properties.info.id,
            createdAt: event.properties.info.time.created,
          }
        : { type: "ignored" };
    case "session.error":
      return event.properties.sessionID
        ? {
            type: "session-error",
            sessionId: event.properties.sessionID,
            error: JSON.stringify(
              event.properties.error ?? "Unknown session error",
            ),
          }
        : { type: "ignored" };
    default:
      return { type: "ignored" };
  }
}
