import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import SchoolContentManager from './school-content-manager';

// Website content and authorization are intentionally loaded per request.

export default async function AdminWebsiteContentPage() {
  await requireRole('ADMIN');
  const items = await prisma.schoolContent.findMany({ orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }] });
  return <><div className="admin-page-heading"><div><span className="welcome-label">PUBLIC SCHOOL WEBSITE</span><h1>Website content</h1><p>Manage activities, announcements, staff profiles, and approved student projects.</p></div><span className="count-badge">{items.length} {items.length === 1 ? 'item' : 'items'}</span></div><p className="admin-consent-notice">Only published items appear on public pages. Publishing student work requires confirmation that the required student or guardian authorization has been obtained. Use approved photos and information only.</p><SchoolContentManager items={items.map((item) => ({ ...item, eventDate: item.eventDate?.toISOString() ?? null }))} /></>;
}
