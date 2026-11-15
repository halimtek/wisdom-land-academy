import { Globe2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import SiteSettingsForm from './site-settings-form';

// Settings and authorization are intentionally loaded per request.

export default async function AdminSettingsPage() {
  await requireRole('ADMIN');
  const { m } = await getI18n();
  const t = m.admin.settings;
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 'main' } });
  return <>
    <div className="admin-page-heading"><div><span className="welcome-label">{t.eyebrow}</span><h1>{m.admin.settingsLabel}</h1><p>{t.intro}</p></div></div>
    <SiteSettingsForm settings={settings} />
    <section className="settings-card" aria-labelledby="library-access-title">
      <span className="settings-card-icon"><Globe2 size={19} /></span>
      <div><h2 id="library-access-title">{t.networkTitle}</h2><p>{t.networkText}</p></div>
      <div className="settings-policy"><span><Globe2 size={15} />{t.policyPublished}</span><span><LockKeyhole size={15} />{t.policyDrafts}</span><span><ShieldCheck size={15} />{t.policyAdmin}</span></div>
    </section>
  </>;
}
