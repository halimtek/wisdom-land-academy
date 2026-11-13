import { prisma } from '@/lib/prisma';
import { PublicContact, SchoolSite } from '@/components/school-site';

// Cached (ISR). Admin edits refresh it immediately via revalidatePublicPages();
// the 5-minute window only matters for changes made outside the admin pages.
export const revalidate = 300;

export default async function ContactPage() {
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 'main' } });
  return <SchoolSite settings={settings}>
    <section className="school-page-banner contact-banner"><span className="school-eyebrow">CONTACT US</span><h1>Let’s start<br /><em>a conversation.</em></h1><p>For verified school contact information, please see the details provided by the administration below.</p></section>
    <section className="school-contact-page"><PublicContact settings={settings} /></section>
  </SchoolSite>;
}
