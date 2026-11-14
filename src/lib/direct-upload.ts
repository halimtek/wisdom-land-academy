// Browser helper for admin forms. With Supabase storage, files are uploaded
// straight from the browser to a private bucket through a signed upload URL, so
// large PDFs never pass through the Next.js server (Vercel limits request bodies
// to 4.5 MB). The form then sends only the object key (`${field}Key`), which the
// server verifies before saving. With local storage nothing changes: the file
// stays in the form.

import { xhrUpload } from '@/lib/upload-progress.mjs';

export type DirectUploadField = { name: string; kind: 'pdf' | 'image' };

/** Progress of one form field: preparing (signed URL request) or uploading (bytes). */
export type DirectUploadProgress =
  | { stage: 'preparing'; field: string; kind: DirectUploadField['kind'] }
  | { stage: 'uploading'; field: string; kind: DirectUploadField['kind']; percent: number | null };

/** An upload problem with a message that is safe to show to the administrator. */
export class DirectUploadError extends Error {
  name = 'DirectUploadError';
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
    if (!planResponse.ok || !plan) throw new DirectUploadError(plan?.error ?? 'The upload could not be prepared. Try again.');
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
      throw new DirectUploadError(`“${file.name}” could not be uploaded. Check the connection and try again.`);
    }
    if (!uploaded.ok) throw new DirectUploadError(`“${file.name}” could not be uploaded (error ${uploaded.status}). Try again.`);

    form.delete(name);
    form.set(`${name}Key`, plan.key);
  }
}
