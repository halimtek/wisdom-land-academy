import { prisma } from '@/lib/prisma';
import { PublicContact, SchoolSite, SectionHeading } from '@/components/school-site';

export const instant = false;

export default async function AboutPage() {
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 'main' } });
  return <SchoolSite settings={settings}>
    <section className="school-page-banner"><span className="school-eyebrow">ABOUT WISDOM LAND ACADEMY</span><h1>A place to learn,<br /><em>grow, and discover.</em></h1><p>Wisdom Land Academy (WLA) serves learners in Grades 1–8.</p></section>
    <section className="school-story-section"><div className="school-story-mark"><span>WLA</span><small>GRADES<br />1 — 8</small></div><div><SectionHeading eyebrow="OUR SCHOOL" title="Wisdom Land Academy" /><p className="school-story-copy">{settings?.aboutText || 'School history, mission, and community information will be shared here by the school administration.'}</p><p className="school-tagline">“Where Passion Becomes a Profession.”</p></div></section>
    <section className="school-contact-band"><div><span className="school-eyebrow">CONNECT WITH WLA</span><h2>We welcome your questions.</h2></div><PublicContact settings={settings} /></section>
  </SchoolSite>;
}
