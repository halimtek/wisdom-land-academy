'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DirectUploadError, prepareDirectUploads } from '@/lib/direct-upload';
import { useI18n } from '@/i18n/client';

type Settings = { aboutText: string | null; contactPhone: string | null; contactEmail: string | null; contactAddress: string | null; logoImagePath: string | null; logoImageAlt: string | null; heroImagePath: string | null; heroImageAlt: string | null } | null;
export default function SiteSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const { m } = useI18n();
  const t = m.admin.settings;
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
      setMessage(response.ok ? result.message ?? t.saved : result.error ?? t.notSaved); setError(!response.ok); if (response.ok) router.refresh();
    } catch (err) { setMessage(err instanceof DirectUploadError ? err.describe(m) : t.unreachable); setError(true); }
    finally { setPending(false); }
  }
  return <section className="site-settings-card"><div className="section-heading"><div><span className="welcome-label">{t.formEyebrow}</span><h2>{t.formTitle}</h2><p>{t.formIntro}</p></div></div>
    <form className="school-content-form" onSubmit={submit}>
      <label className="form-field form-field-wide">{t.about} <span className="field-optional">{t.aboutHint}</span><textarea name="aboutText" rows={4} maxLength={1200} defaultValue={settings?.aboutText ?? ''} /></label>
      <label className="form-field">{t.phone}<input name="contactPhone" maxLength={50} defaultValue={settings?.contactPhone ?? ''} /></label>
      <label className="form-field">{t.email}<input name="contactEmail" type="email" maxLength={254} defaultValue={settings?.contactEmail ?? ''} /></label>
      <label className="form-field form-field-wide">{t.address}<input name="contactAddress" maxLength={250} defaultValue={settings?.contactAddress ?? ''} /></label>
      <label className="form-field file-picker">{t.logo} <span className="field-optional">{t.imageHint}</span><input type="file" name="logoImage" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">{settings?.logoImagePath ? t.logoUploaded : t.noLogo} {t.logoNote}</span></label>
      <label className="form-field">{t.logoAlt}<input name="logoImageAlt" maxLength={180} defaultValue={settings?.logoImageAlt ?? ''} /></label>
      {settings?.logoImagePath && <label className="consent-check"><input type="checkbox" name="removeLogo" /><span>{t.removeLogo}</span></label>}
      <label className="form-field form-field-wide file-picker">{t.hero} <span className="field-optional">{t.imageHint}</span><input type="file" name="heroImage" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">{settings?.heroImagePath ? t.heroUploaded : t.noHero} {t.heroNote}</span></label>
      <label className="form-field">{t.heroAlt}<input name="heroImageAlt" maxLength={180} defaultValue={settings?.heroImageAlt ?? ''} /></label>
      {settings?.heroImagePath && <label className="consent-check"><input type="checkbox" name="removeHero" /><span>{t.removeHero}</span></label>}
      <div className="book-form-footer"><p className={error ? 'action-feedback error' : 'action-feedback'} role={error ? 'alert' : 'status'} aria-live="polite">{message}</p><button className="primary-action" disabled={pending}>{pending ? m.common.saving : t.save}</button></div>
    </form>
  </section>;
}
