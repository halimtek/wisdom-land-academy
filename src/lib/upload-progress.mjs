// Upload progress for direct browser -> Supabase Storage uploads.
// Plain JavaScript so tests/upload-progress.test.mjs can exercise it with a fake XHR.

/**
 * Percentage for a progress bar (integer 0–100). Never returns 100 until the
 * request has completed successfully: the last bytes leaving the browser are not
 * the same as the server having stored the file.
 * @param {number} loaded bytes sent so far
 * @param {number} total total bytes (0 or unknown -> 0)
 * @param {boolean} [completed] true only after a successful (2xx) response
 * @returns {number}
 */
export function uploadPercent(loaded, total, completed = false) {
  if (completed) return 100;
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0 || loaded <= 0) return 0;
  return Math.min(99, Math.floor((loaded / total) * 100));
}

/** A network-level upload failure (no HTTP response): offline, aborted or blocked. */
export class UploadTransportError extends Error {
  /** @param {'network' | 'aborted' | 'timeout'} kind */
  constructor(kind) {
    super(`Upload ${kind === 'network' ? 'failed (network error)' : kind}`);
    this.name = 'UploadTransportError';
    this.kind = kind;
  }
}

/**
 * Sends `body` with XMLHttpRequest so upload progress can be observed.
 * Resolves with the HTTP status (like fetch: a 4xx/5xx is a resolved, not-ok result);
 * rejects with UploadTransportError when no response arrives.
 * `onProgress` receives an integer percentage, or null when the browser cannot
 * compute it; it reports 100 only after a 2xx response.
 * @param {{ url: string, method?: string, headers?: Record<string, string>, body: Blob,
 *           onProgress?: (percent: number | null) => void, XHR?: typeof XMLHttpRequest }} options
 * @returns {Promise<{ ok: boolean, status: number }>}
 */
export function xhrUpload({ url, method = 'PUT', headers = {}, body, onProgress, XHR = globalThis.XMLHttpRequest }) {
  return new Promise((resolve, reject) => {
    const xhr = new XHR();
    let last = -1;
    const report = (value) => {
      if (!onProgress || value === last) return;
      last = value;
      onProgress(value);
    };
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      report(event.lengthComputable ? uploadPercent(event.loaded, event.total) : null);
    };
    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (ok) report(100);
      resolve({ ok, status: xhr.status });
    };
    xhr.onerror = () => reject(new UploadTransportError('network'));
    xhr.onabort = () => reject(new UploadTransportError('aborted'));
    xhr.ontimeout = () => reject(new UploadTransportError('timeout'));
    report(0);
    xhr.send(body);
  });
}
