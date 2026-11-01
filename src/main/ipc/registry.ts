import type { ZodType } from 'zod';
import type { IpcError, IpcErrorCode } from '@shared/types';

/**
 * IPC channel registry.
 *
 * Every payload is validated here, on the main side. The renderer is untrusted
 * UI — its types are a convenience, not a trust boundary (contracts/ipc-api.md).
 */

export class IpcFailure extends Error {
  override readonly name = 'IpcFailure';

  constructor(
    readonly code: IpcErrorCode,
    override readonly message: string,
    readonly recoverable: boolean,
    readonly action?: string,
  ) {
    super(message);
  }

  toJSON(): IpcError {
    return this.action === undefined
      ? { code: this.code, message: this.message, recoverable: this.recoverable }
      : {
          code: this.code,
          message: this.message,
          recoverable: this.recoverable,
          action: this.action,
        };
  }
}

type Handler = (payload: unknown) => Promise<unknown>;

export class IpcRegistry {
  readonly #handlers = new Map<string, Handler>();

  channels(): string[] {
    return [...this.#handlers.keys()];
  }

  handle<T>(
    channel: string,
    schema: ZodType<T>,
    handler: (payload: T) => Promise<unknown>,
  ): void {
    this.#handlers.set(channel, async (raw) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new IpcFailure('VALIDATION_FAILED', `Invalid payload for ${channel}`, false);
      }
      return handler(parsed.data);
    });
  }

  /**
   * A read channel that must survive being offline.
   *
   * FR-059 and SC-015: connectivity may fail a sync, never a read. Stored data
   * is served with dataComplete false rather than an error.
   */
  handleOfflineSafe<T>(
    channel: string,
    schema: ZodType<T>,
    handler: (payload: T) => Promise<unknown>,
    offlineFallback: (payload: T) => Promise<unknown>,
  ): void {
    this.handle(channel, schema, async (payload) => {
      try {
        return await handler(payload);
      } catch (error) {
        if (error instanceof IpcFailure && error.code === 'NETWORK_UNAVAILABLE') {
          return offlineFallback(payload);
        }
        throw error;
      }
    });
  }

  async invoke(channel: string, payload: unknown): Promise<unknown> {
    const handler = this.#handlers.get(channel);
    if (!handler) {
      throw new IpcFailure('INTERNAL', `Unknown channel: ${channel}`, false);
    }
    try {
      return await handler(payload);
    } catch (error) {
      if (error instanceof IpcFailure) throw error;
      // Dev builds only: the terminal is the one place the real cause can be read.
      if (import.meta.env?.DEV) console.error(`[ipc] ${channel} failed:`, error);
      // Never surface a raw error message: it may carry a connection string,
      // a token, or a file path (FR-047).
      throw new IpcFailure('INTERNAL', 'An unexpected error occurred', false);
    }
  }
}
