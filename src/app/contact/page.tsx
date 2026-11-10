import { prisma } from '@/lib/prisma';
import { PublicContact, SchoolSite } from '@/components/school-site';

export const instant = false;

export default async function ContactPage() {
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 'main' } });
  return <SchoolSite settings={settings}>
    <section className="school-page-banner contact-banner"><span className="school-eyebrow">CONTACT US</span><h1>Let’s start<br /><em>a conversation.</em></h1><p>For verified school contact information, please see the details provided by the administration below.</p></section>
    <section className="school-contact-page"><PublicContact settings={settings} /></section>
  </SchoolSite>;
}
