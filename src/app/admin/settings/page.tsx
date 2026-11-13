import { Globe2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import SiteSettingsForm from './site-settings-form';

// Settings and authorization are intentionally loaded per request.

export default async function AdminSettingsPage() {
  await requireRole('ADMIN');
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 'main' } });
  return <>
    <div className="admin-page-heading"><div><span className="welcome-label">SCHOOL CONFIGURATION</span><h1>Settings</h1><p>Manage verified school information and branding for the public website.</p></div></div>
    <SiteSettingsForm settings={settings} />
    <section className="settings-card" aria-labelledby="library-access-title">
      <span className="settings-card-icon"><Globe2 size={19} /></span>
      <div><h2 id="library-access-title">School network library</h2><p>Books marked Published in Manage Books can be browsed and read by anyone who can reach this site on the school network. Books marked Draft are unavailable through the reader.</p></div>
      <div className="settings-policy"><span><Globe2 size={15} />Published books · public read-only</span><span><LockKeyhole size={15} />Drafts · not readable</span><span><ShieldCheck size={15} />Administration · authenticated admins only</span></div>
    </section>
  </>;
}
