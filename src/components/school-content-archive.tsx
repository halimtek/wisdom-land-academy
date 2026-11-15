import type { SchoolContentKind } from '@/generated/prisma/enums';
import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import { PublicContact, SchoolContentGrid, SchoolSite, SectionHeading } from './school-site';

export default async function SchoolContentArchive({ kind }: { kind: SchoolContentKind }) {
  const [settings, items] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 'main' } }),
    prisma.schoolContent.findMany({ where: { kind, isPublished: true }, orderBy: { updatedAt: 'desc' }, take: 40 }),
  ]);
  const { m } = await getI18n();
  const content = m.archive[kind];
  return <SchoolSite settings={settings}>
    <section className="school-page-banner"><span className="school-eyebrow">{content.eyebrow}</span><h1>{content.title}</h1><p>{content.description}</p></section>
    <section className="school-content-archive"><div className="school-section-wrap"><SectionHeading eyebrow={content.eyebrow} title={content.title} /><SchoolContentGrid items={items} emptyTitle={content.emptyTitle} emptyText={content.emptyText} /></div></section>
    <section className="school-contact-band"><div><span className="school-eyebrow">{m.archive.bandEyebrow}</span><h2>{m.common.tagline}</h2></div><PublicContact settings={settings} /></section>
  </SchoolSite>;
}
