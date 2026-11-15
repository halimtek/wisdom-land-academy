'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DirectUploadError, prepareDirectUploads } from '@/lib/direct-upload';
import { useI18n } from '@/i18n/client';
import { fmt } from '@/i18n/locales.mjs';

type Item = { id: string; kind: 'ACTIVITY' | 'ANNOUNCEMENT' | 'STAFF_PROFILE' | 'STUDENT_PROJECT'; title: string; summary: string | null; body: string | null; displayName: string | null; roleTitle: string | null; eventDate: string | null; imagePath: string | null; imageAlt: string | null; isPublished: boolean; consentConfirmed: boolean };
const kinds: Item['kind'][] = ['ACTIVITY', 'ANNOUNCEMENT', 'STAFF_PROFILE', 'STUDENT_PROJECT'];

export default function SchoolContentManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const { m, path } = useI18n();
  const t = m.admin.content;
  const [kind, setKind] = useState<Item['kind']>('ACTIVITY');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, item?: Item) {
    event.preventDefault(); setPending(true); setMessage(''); setError(false);
    try {
      const form = new FormData(event.currentTarget);
      if (item) form.set('contentId', item.id);
      await prepareDirectUploads(form, [{ name: 'image', kind: 'image' }]);
      const response = await fetch('/api/admin/site-content', { method: item ? 'PUT' : 'POST', body: form });
      const result = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? result.message ?? t.saved : result.error ?? t.notSaved); setError(!response.ok);
      if (response.ok) router.refresh();
    } catch (err) { setMessage(err instanceof DirectUploadError ? err.describe(m) : t.unreachable); setError(true); }
    finally { setPending(false); }
  }
  async function remove(item: Item) {
    if (!window.confirm(fmt(t.confirmDelete, { title: item.title }))) return;
    setPending(true); setMessage(''); setError(false);
    try {
      const response = await fetch('/api/admin/site-content', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentId: item.id }) });
      const result = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? result.message ?? t.deleted : result.error ?? t.notDeleted); setError(!response.ok); if (response.ok) router.refresh();
    } catch { setMessage(t.unreachable); setError(true); }
    finally { setPending(false); }
  }
  return <div className="school-content-admin">
    <section className="school-content-editor"><div className="section-heading"><div><span className="welcome-label">{t.addEyebrow}</span><h2>{t.createTitle}</h2></div></div>
      <form onSubmit={(event) => submit(event)} className="school-content-form">
        <label className="form-field">{t.type}<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as Item['kind'])}>{kinds.map((option) => <option key={option} value={option}>{t.kinds[option]}</option>)}</select></label>
        <label className="form-field">{t.title_}<input name="title" required minLength={2} maxLength={160} /></label>
        <label className="form-field">{t.summary} <span className="field-optional">{m.common.optional}</span><textarea name="summary" rows={2} maxLength={300} /></label>
        {(kind === 'STAFF_PROFILE' || kind === 'STUDENT_PROJECT') && <label className="form-field">{t.displayNameApproved} <span className="field-optional">{t.displayNameHint}</span><input name="displayName" maxLength={120} /></label>}
        {kind === 'STAFF_PROFILE' && <label className="form-field">{t.role}<input name="roleTitle" maxLength={120} placeholder={t.rolePlaceholder} /></label>}
        {kind === 'ACTIVITY' && <label className="form-field">{t.eventDate} <span className="field-optional">{m.common.optional}</span><input name="eventDate" type="date" /></label>}
        {kind === 'ANNOUNCEMENT' && <label className="form-field">{t.newsDate} <span className="field-optional">{t.newsDateHint}</span><input name="eventDate" type="date" /></label>}
        <label className="form-field form-field-wide">{t.body} <span className="field-optional">{m.common.optional}</span><textarea name="body" rows={4} maxLength={5000} /></label>
        <label className="form-field form-field-wide file-picker">{t.photo} <span className="field-optional">{t.photoHint}</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">{t.photoNote}</span></label>
        <label className="form-field form-field-wide">{t.photoAlt} <input name="imageAlt" maxLength={180} /></label>
        {kind === 'STUDENT_PROJECT' && <label className="consent-check"><input type="checkbox" name="consentConfirmed" /><span>{t.consentProject}</span></label>}
        <label className="consent-check"><input type="checkbox" name="isPublished" /><span>{t.publishItem}</span></label>
        <div className="book-form-footer"><p className={error ? 'action-feedback error' : 'action-feedback'} role={error ? 'alert' : 'status'} aria-live="polite">{message}</p><button className="primary-action" disabled={pending}>{pending ? m.common.saving : t.create}</button></div>
      </form>
    </section>
    <section className="managed-books"><div className="section-heading"><div><span className="welcome-label">{t.libraryEyebrow}</span><h2>{t.existing}</h2></div></div>
      {items.length ? <div className="school-managed-list">{items.map((item) => <details className="school-managed-item" key={item.id}><summary><span className="school-managed-type">{t.kinds[item.kind]}</span><strong dir="auto">{item.title}</strong><span className={`book-publication-pill${item.isPublished ? ' published' : ''}`}>{item.isPublished ? m.admin.published : m.admin.draft}</span></summary><div className="school-managed-body"><form onSubmit={(event) => submit(event, item)} className="school-content-form">
        <input type="hidden" name="kind" value={item.kind} />
        <label className="form-field">{t.title_}<input name="title" defaultValue={item.title} required minLength={2} maxLength={160} /></label>
        <label className="form-field">{t.summary}<textarea name="summary" defaultValue={item.summary ?? ''} rows={2} maxLength={300} /></label>
        {(item.kind === 'STAFF_PROFILE' || item.kind === 'STUDENT_PROJECT') && <label className="form-field">{t.displayName}<input name="displayName" defaultValue={item.displayName ?? ''} maxLength={120} /></label>}
        {item.kind === 'STAFF_PROFILE' && <label className="form-field">{t.role}<input name="roleTitle" defaultValue={item.roleTitle ?? ''} maxLength={120} /></label>}
        {item.kind === 'ACTIVITY' && <label className="form-field">{t.eventDate}<input name="eventDate" type="date" defaultValue={item.eventDate?.slice(0, 10) ?? ''} /></label>}
        {item.kind === 'ANNOUNCEMENT' && <label className="form-field">{t.newsDate} <span className="field-optional">{t.newsDateHint}</span><input name="eventDate" type="date" defaultValue={item.eventDate?.slice(0, 10) ?? ''} /></label>}
        <label className="form-field form-field-wide">{t.body}<textarea name="body" defaultValue={item.body ?? ''} rows={4} maxLength={5000} /></label>
        <label className="form-field form-field-wide file-picker">{t.replacePhoto} <input name="image" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">{fmt(t.currentPhoto, { state: item.imagePath ? t.uploaded : t.none })}</span></label>
        <label className="form-field form-field-wide">{t.photoDescription}<input name="imageAlt" defaultValue={item.imageAlt ?? ''} maxLength={180} /></label>
        {item.imagePath && <label className="consent-check"><input type="checkbox" name="removeImage" /><span>{t.removePhoto}</span></label>}
        {item.kind === 'STUDENT_PROJECT' && <label className="consent-check"><input type="checkbox" name="consentConfirmed" defaultChecked={item.consentConfirmed} /><span>{t.consentObtained}</span></label>}
        <label className="consent-check"><input type="checkbox" name="isPublished" defaultChecked={item.isPublished} /><span>{t.publishedOnSite}</span></label>
        <div className="book-form-footer"><button className="primary-action" disabled={pending}>{pending ? m.common.saving : t.save}</button><button className="delete-action" type="button" disabled={pending} onClick={() => remove(item)}>{t.deleteItem}</button>{item.kind === 'ANNOUNCEMENT' && item.isPublished && <a className="secondary-action" href={path(`/news/${item.id}`)} target="_blank" rel="noopener">{t.viewStory}</a>}</div>
      </form></div></details>)}</div> : <div className="empty-admin"><p>{t.empty}</p></div>}
    </section>
  </div>;
}
