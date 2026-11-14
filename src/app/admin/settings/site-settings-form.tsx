'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DirectUploadError, prepareDirectUploads } from '@/lib/direct-upload';

type Settings = { aboutText: string | null; contactPhone: string | null; contactEmail: string | null; contactAddress: string | null; logoImagePath: string | null; logoImageAlt: string | null; heroImagePath: string | null; heroImageAlt: string | null } | null;
export default function SiteSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(''); setError(false);
    const form = new FormData(event.currentTarget);
    try {
      await prepareDirectUploads(form, [{ name: 'logoImage', kind: 'image' }, { name: 'heroImage', kind: 'image' }]);
      const response = await fetch('/api/admin/site-settings', { method: 'PUT', body: form });
      const result = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? result.message ?? 'Settings saved.' : result.error ?? 'Could not save settings.'); setError(!response.ok); if (response.ok) router.refresh();
    } catch (err) { setMessage(err instanceof DirectUploadError ? err.message : 'The server could not be reached. Try again.'); setError(true); }
    finally { setPending(false); }
  }
  return <section className="site-settings-card"><div className="section-heading"><div><span className="welcome-label">PUBLIC WEBSITE</span><h2>School details and branding</h2><p>Enter verified details and use approved school imagery only.</p></div></div>
    <form className="school-content-form" onSubmit={submit}>
      <label className="form-field form-field-wide">About the school <span className="field-optional">Optional · up to 1,200 characters</span><textarea name="aboutText" rows={4} maxLength={1200} defaultValue={settings?.aboutText ?? ''} /></label>
      <label className="form-field">Contact phone<input name="contactPhone" maxLength={50} defaultValue={settings?.contactPhone ?? ''} /></label>
      <label className="form-field">Contact email<input name="contactEmail" type="email" maxLength={254} defaultValue={settings?.contactEmail ?? ''} /></label>
      <label className="form-field form-field-wide">Contact address<input name="contactAddress" maxLength={250} defaultValue={settings?.contactAddress ?? ''} /></label>
      <label className="form-field file-picker">School logo <span className="field-optional">JPEG, PNG, WebP · 5 MB maximum</span><input type="file" name="logoImage" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">{settings?.logoImagePath ? 'A logo is currently uploaded.' : 'No logo uploaded.'} Stored privately; delivered only as public branding.</span></label>
      <label className="form-field">Logo alternative text<input name="logoImageAlt" maxLength={180} defaultValue={settings?.logoImageAlt ?? ''} /></label>
      {settings?.logoImagePath && <label className="consent-check"><input type="checkbox" name="removeLogo" /><span>Remove the current logo</span></label>}
      <label className="form-field form-field-wide file-picker">Hero school photo <span className="field-optional">JPEG, PNG, WebP · 5 MB maximum</span><input type="file" name="heroImage" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">{settings?.heroImagePath ? 'A hero photo is currently uploaded.' : 'No school photo uploaded.'} Use an authentic photo cleared for school website use.</span></label>
      <label className="form-field">Photo alternative text<input name="heroImageAlt" maxLength={180} defaultValue={settings?.heroImageAlt ?? ''} /></label>
      {settings?.heroImagePath && <label className="consent-check"><input type="checkbox" name="removeHero" /><span>Remove the current hero photo</span></label>}
      <div className="book-form-footer"><p className={error ? 'action-feedback error' : 'action-feedback'} role={error ? 'alert' : 'status'} aria-live="polite">{message}</p><button className="primary-action" disabled={pending}>{pending ? 'Saving…' : 'Save website settings'}</button></div>
    </form>
  </section>;
}
