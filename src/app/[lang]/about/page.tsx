import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import { PublicContact, SchoolSite, SectionHeading } from '@/components/school-site';

// Cached (ISR). Admin edits refresh it immediately via revalidatePublicPages();
// the 5-minute window only matters for changes made outside the admin pages.
export const revalidate = 300;

export default async function AboutPage() {
  const [settings, { m }] = await Promise.all([prisma.schoolSettings.findUnique({ where: { id: 'main' } }), getI18n()]);
  const a = m.about;
  return <SchoolSite settings={settings}>
    <section className="school-page-banner"><span className="school-eyebrow">{a.eyebrow}</span><h1>{a.titleLine1}<br /><em>{a.titleLine2}</em></h1><p>{a.intro}</p></section>
    <section className="school-story-section"><div className="school-story-mark"><span>WLA</span><small>{a.storyGrades}<br />1 — 8</small></div><div><SectionHeading eyebrow={a.ourSchool} title={m.common.schoolName} /><p className="school-story-copy" dir="auto">{settings?.aboutText || a.storyPending}</p><p className="school-tagline">“{m.common.tagline}”</p></div></section>
    <section className="school-contact-band"><div><span className="school-eyebrow">{a.connectEyebrow}</span><h2>{a.connectTitle}</h2></div><PublicContact settings={settings} /></section>
  </SchoolSite>;
}
