/**
 * Notification delivery with a retained-undelivered queue.
 *
 * FR-034: a notification that could not be delivered is retained and
 * re-surfaced, never discarded. On a local app the delivery channel is
 * routinely unavailable — the machine is asleep, the session is locked — and
 * silently dropping an alert is the failure this product cannot afford.
 */

export interface Notification {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** True event time, so a replayed alert is not mistaken for a live one (FR-057). */
  readonly occurredAt: string;
}

export interface NotificationTransport {
  deliver(notification: Notification): Promise<void>;
}

export class NotificationQueue {
  readonly #pending: Notification[] = [];
  readonly #delivered = new Set<string>();

  constructor(private readonly transport: NotificationTransport) {}

  pending(): readonly Notification[] {
    return [...this.#pending];
  }

  async push(notification: Notification): Promise<void> {
    if (this.#delivered.has(notification.id)) return;
    if (this.#pending.some((n) => n.id === notification.id)) return;
    this.#pending.push(notification);
    await this.flush();
  }

  /** Attempt delivery of everything retained. Safe to call repeatedly. */
  async flush(): Promise<void> {
    const queued = [...this.#pending];
    for (const notification of queued) {
      try {
        await this.transport.deliver(notification);
        this.#delivered.add(notification.id);
        const index = this.#pending.indexOf(notification);
        if (index >= 0) this.#pending.splice(index, 1);
      } catch {
        // Keep it queued. A failed channel is temporary; a lost alert is not.
        break;
      }
    }
  }
}
