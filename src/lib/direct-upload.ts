// Browser helper for admin forms. With Supabase storage, files are uploaded
// straight from the browser to a private bucket through a signed upload URL, so
// large PDFs never pass through the Next.js server (Vercel limits request bodies
// to 4.5 MB). The form then sends only the object key (`${field}Key`), which the
// server verifies before saving. With local storage nothing changes: the file
// stays in the form.

import { xhrUpload } from '@/lib/upload-progress.mjs';
import { fmt } from '@/i18n/locales.mjs';
import type { Messages } from '@/i18n/messages/en';

export type DirectUploadField = { name: string; kind: 'pdf' | 'image' };

/** Progress of one form field: preparing (signed URL request) or uploading (bytes). */
export type DirectUploadProgress =
  | { stage: 'preparing'; field: string; kind: DirectUploadField['kind'] }
  | { stage: 'uploading'; field: string; kind: DirectUploadField['kind']; percent: number | null };

/** An upload problem with a message that is safe to show to the administrator. */
type UploadMessageKey = 'notPrepared' | 'failed' | 'failedStatus';

/**
 * Upload failure. `message` is English (logs); describe() returns the text for the
 * screen in the visitor's language. A message from the server is already translated.
 */
export class DirectUploadError extends Error {
  name = 'DirectUploadError';
  constructor(message: string, readonly key?: UploadMessageKey, readonly values: Record<string, string | number> = {}) {
    super(message);
  }
  describe(m: Messages): string {
    return this.key ? fmt(m.upload[this.key], this.values) : this.message;
  }
}

type Plan = { direct: false } | { direct: true; key: string; uploadUrl: string; headers: Record<string, string> };

export async function prepareDirectUploads(
  form: FormData,
  fields: DirectUploadField[],
  onProgress?: (progress: DirectUploadProgress) => void,
) {
  for (const { name, kind } of fields) {
    const file = form.get(name);
    if (!(file instanceof File) || file.size === 0) continue;

    onProgress?.({ stage: 'preparing', field: name, kind });
    const planResponse = await fetch('/api/admin/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, filename: file.name, contentType: file.type, size: file.size }),
    });
    const plan = await planResponse.json().catch(() => null) as (Plan & { error?: string }) | null;
    if (!planResponse.ok || !plan) throw plan?.error ? new DirectUploadError(plan.error) : new DirectUploadError('The upload could not be prepared. Try again.', 'notPrepared');
    if (!plan.direct) return; // local storage: the form uploads the files itself

    // XMLHttpRequest (not fetch) so the real number of uploaded bytes can be shown.
    let uploaded: { ok: boolean; status: number };
    try {
      uploaded = await xhrUpload({
        url: plan.uploadUrl,
        method: 'PUT',
        headers: plan.headers,
        body: file,
        onProgress: (percent) => onProgress?.({ stage: 'uploading', field: name, kind, percent }),
      });
    } catch {
      throw new DirectUploadError(`“${file.name}” could not be uploaded. Check the connection and try again.`, 'failed', { name: file.name });
    }
    if (!uploaded.ok) throw new DirectUploadError(`“${file.name}” could not be uploaded (error ${uploaded.status}). Try again.`, 'failedStatus', { name: file.name, status: uploaded.status });

    form.delete(name);
    form.set(`${name}Key`, plan.key);
  }
}
