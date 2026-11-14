// Network and disk helpers for src/lib/storage.ts. Plain JavaScript so the
// node:test suite (tests/storage-io.test.mjs) can exercise them directly.

import { open, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** A storage request that took too long. The message never contains credentials. */
export class StorageTimeoutError extends Error {
  /** @param {string} action @param {number} timeoutMs */
  constructor(action, timeoutMs) {
    super(`Supabase storage ${action} timed out after ${timeoutMs / 1000}s`);
    this.name = 'StorageTimeoutError';
  }
}

/**
 * Runs one request with a deadline covering the response AND `consume(response)`
 * (reading its body). On timeout the request is aborted (the upstream connection
 * is closed) and a StorageTimeoutError is thrown.
 * @template T
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ action: string, timeoutMs: number, fetchImpl?: typeof fetch }} options
 * @param {(response: Response) => Promise<T>} consume
 * @returns {Promise<T>}
 */
export async function timedRequest(url, init, { action, timeoutMs, fetchImpl = fetch }, consume) {
  const controller = new AbortController();
  const timeout = new StorageTimeoutError(action, timeoutMs);
  const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    return await consume(response);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === timeout) throw timeout;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Starts a streamed download. `headersTimeoutMs` limits the wait for the response;
 * afterwards the body is wrapped so that no single upstream read may stall for
 * more than `idleTimeoutMs`. Cancelling the returned body (client disconnect),
 * a stall, or a failed `check(response)` aborts the upstream request.
 * @param {string} url
 * @param {RequestInit} init
 * @param {{ action: string, headersTimeoutMs: number, idleTimeoutMs: number, fetchImpl?: typeof fetch }} options
 * @param {(response: Response) => Promise<void> | void} check throws to reject the response
 * @returns {Promise<ReadableStream<Uint8Array>>}
 */
export async function timedDownload(url, init, { action, headersTimeoutMs, idleTimeoutMs, fetchImpl = fetch }, check) {
  const controller = new AbortController();
  const timeout = new StorageTimeoutError(action, headersTimeoutMs);
  const timer = setTimeout(() => controller.abort(timeout), headersTimeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal });
    await check(response);
    if (!response.body) throw new Error(`Supabase storage ${action} returned no body`);
  } catch (error) {
    controller.abort();
    if (error === timeout || controller.signal.reason === timeout) throw timeout;
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return withIdleTimeout(response.body, { action, idleTimeoutMs, abort: (reason) => controller.abort(reason) });
}

/**
 * Pull-through wrapper: errors the stream with StorageTimeoutError (and calls
 * `abort`) if the upstream produces no data for `idleTimeoutMs` while the
 * consumer is waiting. The timer runs only during reads, so a slow client is
 * never mistaken for a stalled upstream. No controller method is called after
 * the stream has finished, errored or been cancelled.
 * @param {ReadableStream<Uint8Array>} body
 * @param {{ action: string, idleTimeoutMs: number, abort: (reason?: unknown) => void }} options
 * @returns {ReadableStream<Uint8Array>}
 */
export function withIdleTimeout(body, { action, idleTimeoutMs, abort }) {
  const reader = body.getReader();
  let settled = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  return new ReadableStream({
    async pull(controller) {
      if (settled) return;
      const stalled = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new StorageTimeoutError(`${action} (stalled download)`, idleTimeoutMs)), idleTimeoutMs);
      });
      try {
        const { done, value } = await Promise.race([reader.read(), stalled]);
        if (settled) return;
        if (done) { settled = true; controller.close(); return; }
        controller.enqueue(value);
      } catch (error) {
        if (settled) return;
        settled = true;
        abort(error);
        reader.cancel(error).catch(() => undefined);
        controller.error(error);
      } finally {
        clearTimeout(timer);
      }
    },
    async cancel(reason) {
      settled = true;
      clearTimeout(timer);
      abort(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  }, { highWaterMark: 0 });
}

/**
 * Writes a NEW file from a web stream. Fails with EEXIST (touching nothing) if the
 * file already exists; if writing fails part-way, the incomplete file is removed.
 * @param {string} target
 * @param {ReadableStream<Uint8Array>} source
 * @param {{ mode?: number }} [options]
 */
export async function writeNewFile(target, source, { mode = 0o640 } = {}) {
  // 'wx': exclusive create. Only a file created here is ever removed.
  const handle = await open(target, 'wx', mode);
  try {
    await pipeline(Readable.fromWeb(/** @type {any} */ (source)), handle.createWriteStream());
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(target).catch((cleanupError) => {
      if (cleanupError?.code !== 'ENOENT') console.error(`[storage] Could not remove incomplete file ${target}`, cleanupError);
    });
    throw error;
  }
}
