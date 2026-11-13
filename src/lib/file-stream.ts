import 'server-only';

import { open, type FileHandle } from 'node:fs/promises';

const CHUNK_BYTES = 64 * 1024;

/**
 * Streams bytes `start`..`end` (inclusive) of a file as a Web ReadableStream for a
 * Route Handler `Response`.
 *
 * Replaces `Readable.toWeb(createReadStream(path))`, whose lifecycle depends on the
 * consumer cancelling it: a Response body that is never read (HEAD requests, which
 * Next.js answers by calling GET and discarding the body, or a client that
 * disconnects before the response is sent) kept its file descriptor open forever,
 * and Node's adapter enqueues/closes its controller from stream events without
 * checking whether the web stream has already been closed or cancelled
 * (`TypeError: Invalid state: Controller is already closed`, ERR_INVALID_STATE).
 *
 * Here everything is driven by `pull()` (highWaterMark 0):
 * - the file is opened only when the consumer actually reads, so an unread body
 *   costs no file descriptor;
 * - no controller method is called after the stream is finished, errored or
 *   cancelled, and `close()`/`error()` are always called before awaiting cleanup;
 * - the file handle is closed exactly once (end, error or cancel);
 * - at most `end - start + 1` bytes are sent, so the body always matches the
 *   Content-Length header; a file that shrinks mid-transfer is reported as an error.
 *
 * Client cancellation is normal and not logged. Real I/O errors are logged and
 * propagated with `controller.error()`, which aborts the response.
 */
export function createFileStream(
  absolutePath: string,
  { start = 0, end, label }: { start?: number; end: number; label: string },
): ReadableStream<Uint8Array> {
  let handle: FileHandle | null = null;
  let position = start;
  let finished = false;
  let inFlight: Promise<void> | null = null;

  async function release() {
    const current = handle;
    handle = null;
    if (!current) return;
    try {
      await current.close();
    } catch (error) {
      console.error(`[file-stream] Could not close ${label}`, error);
    }
  }

  async function readNext(controller: ReadableStreamDefaultController<Uint8Array>) {
    try {
      if (!handle) handle = await open(absolutePath, 'r');
      if (finished) return; // cancelled while opening; cancel() releases the handle

      const remaining = end - position + 1;
      if (remaining <= 0) {
        finished = true;
        controller.close();
        await release();
        return;
      }

      const buffer = new Uint8Array(Math.min(CHUNK_BYTES, remaining));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (finished) return; // cancelled while reading

      if (bytesRead === 0) {
        throw new Error(`File ended ${remaining} bytes early (it may have been replaced or truncated)`);
      }
      position += bytesRead;
      controller.enqueue(bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead));

      if (position > end) {
        finished = true;
        controller.close();
        await release();
      }
    } catch (error) {
      if (finished) return;
      finished = true;
      console.error(`[file-stream] Error while streaming ${label}`, error);
      controller.error(error);
      await release();
    }
  }

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (finished) return;
        inFlight = readNext(controller);
        await inFlight;
        inFlight = null;
      },
      async cancel() {
        // The client went away or the body was discarded: expected, not an error.
        finished = true;
        if (inFlight) await inFlight;
        await release();
      },
    },
    { highWaterMark: 0 },
  );
}
