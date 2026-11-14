// Browser helper for admin forms. With Supabase storage, files are uploaded
// straight from the browser to a private bucket through a signed upload URL, so
// large PDFs never pass through the Next.js server (Vercel limits request bodies
// to 4.5 MB). The form then sends only the object key (`${field}Key`), which the
// server verifies before saving. With local storage nothing changes: the file
// stays in the form.

export type DirectUploadField = { name: string; kind: 'pdf' | 'image' };

/** An upload problem with a message that is safe to show to the administrator. */
export class DirectUploadError extends Error {
  name = 'DirectUploadError';
}

type Plan = { direct: false } | { direct: true; key: string; uploadUrl: string; headers: Record<string, string> };

export async function prepareDirectUploads(form: FormData, fields: DirectUploadField[]) {
  for (const { name, kind } of fields) {
    const file = form.get(name);
    if (!(file instanceof File) || file.size === 0) continue;

    const planResponse = await fetch('/api/admin/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, filename: file.name, contentType: file.type, size: file.size }),
    });
    const plan = await planResponse.json().catch(() => null) as (Plan & { error?: string }) | null;
    if (!planResponse.ok || !plan) throw new DirectUploadError(plan?.error ?? 'The upload could not be prepared. Try again.');
    if (!plan.direct) return; // local storage: the form uploads the files itself

    let uploaded: Response;
    try {
      uploaded = await fetch(plan.uploadUrl, { method: 'PUT', headers: plan.headers, body: file });
    } catch {
      throw new DirectUploadError(`“${file.name}” could not be uploaded. Check the connection and try again.`);
    }
    if (!uploaded.ok) throw new DirectUploadError(`“${file.name}” could not be uploaded (error ${uploaded.status}). Try again.`);

    form.delete(name);
    form.set(`${name}Key`, plan.key);
  }
}
