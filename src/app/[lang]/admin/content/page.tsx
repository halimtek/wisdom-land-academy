import { requireRole } from '@/lib/auth';
import { plural } from '@/i18n/locales.mjs';
import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import SchoolContentManager from './school-content-manager';

// Website content and authorization are intentionally loaded per request.

export default async function AdminWebsiteContentPage() {
  await requireRole('ADMIN');
  const { m } = await getI18n();
  const t = m.admin.content;
  const items = await prisma.schoolContent.findMany({ orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }] });
  return <><div className="admin-page-heading"><div><span className="welcome-label">{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></div><span className="count-badge">{plural(items.length, t.itemCount)}</span></div><p className="admin-consent-notice">{t.consent}</p><SchoolContentManager items={items.map((item) => ({ ...item, eventDate: item.eventDate?.toISOString() ?? null }))} /></>;
}
