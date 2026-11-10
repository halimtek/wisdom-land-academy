'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type Item = { id: string; kind: 'ACTIVITY' | 'ANNOUNCEMENT' | 'STAFF_PROFILE' | 'STUDENT_PROJECT'; title: string; summary: string | null; body: string | null; displayName: string | null; roleTitle: string | null; eventDate: string | null; imagePath: string | null; imageAlt: string | null; isPublished: boolean; consentConfirmed: boolean };
const kinds: { value: Item['kind']; label: string }[] = [{ value: 'ACTIVITY', label: 'Activity or event' }, { value: 'ANNOUNCEMENT', label: 'News or announcement' }, { value: 'STAFF_PROFILE', label: 'Staff profile' }, { value: 'STUDENT_PROJECT', label: 'Student project' }];

export default function SchoolContentManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Item['kind']>('ACTIVITY');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, item?: Item) {
    event.preventDefault(); setPending(true); setMessage(''); setError(false);
    try {
      const form = new FormData(event.currentTarget);
      if (item) form.set('contentId', item.id);
      const response = await fetch('/api/admin/site-content', { method: item ? 'PUT' : 'POST', body: form });
      const result = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? result.message ?? 'Saved.' : result.error ?? 'Could not save content.'); setError(!response.ok);
      if (response.ok) router.refresh();
    } catch { setMessage('The server could not be reached. Try again.'); setError(true); }
    finally { setPending(false); }
  }
  async function remove(item: Item) {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    setPending(true); setMessage(''); setError(false);
    try {
      const response = await fetch('/api/admin/site-content', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentId: item.id }) });
      const result = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? result.message ?? 'Deleted.' : result.error ?? 'Could not delete content.'); setError(!response.ok); if (response.ok) router.refresh();
    } catch { setMessage('The server could not be reached. Try again.'); setError(true); }
    finally { setPending(false); }
  }
  return <div className="school-content-admin">
    <section className="school-content-editor"><div className="section-heading"><div><span className="welcome-label">ADD PUBLIC CONTENT</span><h2>Create website content</h2></div></div>
      <form onSubmit={(event) => submit(event)} className="school-content-form">
        <label className="form-field">Content type<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as Item['kind'])}>{kinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="form-field">Title<input name="title" required minLength={2} maxLength={160} /></label>
        <label className="form-field">Short description <span className="field-optional">Optional</span><textarea name="summary" rows={2} maxLength={300} /></label>
        {(kind === 'STAFF_PROFILE' || kind === 'STUDENT_PROJECT') && <label className="form-field">Approved display name <span className="field-optional">Optional except for published staff profiles</span><input name="displayName" maxLength={120} /></label>}
        {kind === 'STAFF_PROFILE' && <label className="form-field">Staff title / role<input name="roleTitle" maxLength={120} placeholder="e.g. Mathematics Teacher" /></label>}
        {kind === 'ACTIVITY' && <label className="form-field">Event date <span className="field-optional">Optional</span><input name="eventDate" type="date" /></label>}
        <label className="form-field form-field-wide">Full text <span className="field-optional">Optional</span><textarea name="body" rows={4} maxLength={5000} /></label>
        <label className="form-field form-field-wide file-picker">Photo <span className="field-optional">Optional · JPEG, PNG, WebP · up to 5 MB</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">Stored outside public/ and shown only while this content is published.</span></label>
        <label className="form-field form-field-wide">Photo description for accessibility <input name="imageAlt" maxLength={180} /></label>
        {kind === 'STUDENT_PROJECT' && <label className="consent-check"><input type="checkbox" name="consentConfirmed" /><span>I confirm that the required student or guardian authorization has been obtained for this student project and any identifiable information or photo.</span></label>}
        <label className="consent-check"><input type="checkbox" name="isPublished" /><span>Publish this item on the public school website</span></label>
        <div className="book-form-footer"><p className={error ? 'action-feedback error' : 'action-feedback'} role={error ? 'alert' : 'status'} aria-live="polite">{message}</p><button className="primary-action" disabled={pending}>{pending ? 'Saving…' : 'Create content'}</button></div>
      </form>
    </section>
    <section className="managed-books"><div className="section-heading"><div><span className="welcome-label">CONTENT LIBRARY</span><h2>Existing website content</h2></div></div>
      {items.length ? <div className="school-managed-list">{items.map((item) => <details className="school-managed-item" key={item.id}><summary><span className="school-managed-type">{kinds.find((option) => option.value === item.kind)?.label}</span><strong>{item.title}</strong><span className={`book-publication-pill${item.isPublished ? ' published' : ''}`}>{item.isPublished ? 'Published' : 'Draft'}</span></summary><div className="school-managed-body"><form onSubmit={(event) => submit(event, item)} className="school-content-form">
        <input type="hidden" name="kind" value={item.kind} />
        <label className="form-field">Title<input name="title" defaultValue={item.title} required minLength={2} maxLength={160} /></label>
        <label className="form-field">Short description<textarea name="summary" defaultValue={item.summary ?? ''} rows={2} maxLength={300} /></label>
        {(item.kind === 'STAFF_PROFILE' || item.kind === 'STUDENT_PROJECT') && <label className="form-field">Display name<input name="displayName" defaultValue={item.displayName ?? ''} maxLength={120} /></label>}
        {item.kind === 'STAFF_PROFILE' && <label className="form-field">Staff title / role<input name="roleTitle" defaultValue={item.roleTitle ?? ''} maxLength={120} /></label>}
        {item.kind === 'ACTIVITY' && <label className="form-field">Event date<input name="eventDate" type="date" defaultValue={item.eventDate?.slice(0, 10) ?? ''} /></label>}
        <label className="form-field form-field-wide">Full text<textarea name="body" defaultValue={item.body ?? ''} rows={4} maxLength={5000} /></label>
        <label className="form-field form-field-wide file-picker">Replace photo <input name="image" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">Current photo: {item.imagePath ? 'uploaded' : 'none'}</span></label>
        <label className="form-field form-field-wide">Photo description<input name="imageAlt" defaultValue={item.imageAlt ?? ''} maxLength={180} /></label>
        {item.imagePath && <label className="consent-check"><input type="checkbox" name="removeImage" /><span>Remove the current photo</span></label>}
        {item.kind === 'STUDENT_PROJECT' && <label className="consent-check"><input type="checkbox" name="consentConfirmed" defaultChecked={item.consentConfirmed} /><span>Required student or guardian authorization has been obtained</span></label>}
        <label className="consent-check"><input type="checkbox" name="isPublished" defaultChecked={item.isPublished} /><span>Published on public website</span></label>
        <div className="book-form-footer"><button className="primary-action" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button><button className="delete-action" type="button" disabled={pending} onClick={() => remove(item)}>Delete item</button></div>
      </form></div></details>)}</div> : <div className="empty-admin"><p>No website content yet. Add approved content above when it is available.</p></div>}
    </section>
  </div>;
}
