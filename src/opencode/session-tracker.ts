export class SessionTracker {
  private readonly activity = new Map<string, "idle" | "busy" | "unknown">();

  observe(sessionId: string): void {
    if (!this.activity.has(sessionId)) {
      this.activity.set(sessionId, "unknown");
    }
  }

  set(sessionId: string, activity: "idle" | "busy" | "unknown"): void {
    this.activity.set(sessionId, activity);
  }

  get(sessionId: string): "idle" | "busy" | "unknown" {
    return this.activity.get(sessionId) ?? "unknown";
  }

  delete(sessionId: string): void {
    this.activity.delete(sessionId);
  }
}
