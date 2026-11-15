import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import { PublicContact, SchoolSite } from '@/components/school-site';

// Cached (ISR). Admin edits refresh it immediately via revalidatePublicPages();
// the 5-minute window only matters for changes made outside the admin pages.
export const revalidate = 300;

export default async function ContactPage() {
  const [settings, { m }] = await Promise.all([prisma.schoolSettings.findUnique({ where: { id: 'main' } }), getI18n()]);
  const c = m.contact;
  return <SchoolSite settings={settings}>
    <section className="school-page-banner contact-banner"><span className="school-eyebrow">{c.eyebrow}</span><h1>{c.titleLine1}<br /><em>{c.titleLine2}</em></h1><p>{c.intro}</p></section>
    <section className="school-contact-page"><PublicContact settings={settings} /></section>
  </SchoolSite>;
}
