import type { SchoolContentKind } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { PublicContact, SchoolContentGrid, SchoolSite, SectionHeading } from './school-site';

const pageContent: Record<SchoolContentKind, { title: string; eyebrow: string; description: string; emptyTitle: string; emptyText: string }> = {
  ACTIVITY: { title: 'Activities & Events', eyebrow: 'LIFE AT WLA', description: 'School activities and events shared by the Wisdom Land Academy community.', emptyTitle: 'School activities will appear here', emptyText: 'Approved event updates will be added by the school when they are ready to share.' },
  ANNOUNCEMENT: { title: 'News & Announcements', eyebrow: 'LATEST FROM WLA', description: 'Verified announcements and news from Wisdom Land Academy.', emptyTitle: 'No announcements yet', emptyText: 'News and school announcements will be posted here by the administration.' },
  STAFF_PROFILE: { title: 'Our Staff', eyebrow: 'OUR SCHOOL COMMUNITY', description: 'Meet the approved staff profiles shared by Wisdom Land Academy.', emptyTitle: 'Staff profiles are being prepared', emptyText: 'Approved staff introductions will appear here when the school adds them.' },
  STUDENT_PROJECT: { title: 'Our Students', eyebrow: 'STUDENT WORK', description: 'Approved projects, achievements, and learning experiences from WLA students.', emptyTitle: 'Student work will appear here', emptyText: 'The school will share student projects after the necessary student or guardian authorization is confirmed.' },
};

export default async function SchoolContentArchive({ kind }: { kind: SchoolContentKind }) {
  const [settings, items] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 'main' } }),
    prisma.schoolContent.findMany({ where: { kind, isPublished: true }, orderBy: { updatedAt: 'desc' }, take: 40 }),
  ]);
  const content = pageContent[kind];
  return <SchoolSite settings={settings}>
    <section className="school-page-banner"><span className="school-eyebrow">{content.eyebrow}</span><h1>{content.title}</h1><p>{content.description}</p></section>
    <section className="school-content-archive"><div className="school-section-wrap"><SectionHeading eyebrow={content.eyebrow} title={content.title} /><SchoolContentGrid items={items} emptyTitle={content.emptyTitle} emptyText={content.emptyText} /></div></section>
    <section className="school-contact-band"><div><span className="school-eyebrow">WISDOM LAND ACADEMY · GRADES 1–8</span><h2>Where Passion Becomes a Profession.</h2></div><PublicContact settings={settings} /></section>
  </SchoolSite>;
}
