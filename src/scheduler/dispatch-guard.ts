export class DispatchGuard {
  private readonly sessions = new Set<string>();

  tryAcquire(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      return false;
    }
    this.sessions.add(sessionId);

    return true;
  }

  release(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }
}
