import Image from 'next/image';
import Link from 'next/link';
import { fmt } from '@/i18n/locales.mjs';
import { getI18n } from '@/i18n/page';
import { SchoolNavigation } from './school-navigation';

export type SchoolSettingsView = {
  aboutText?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
  logoImagePath?: string | null;
  logoImageAlt?: string | null;
  heroImagePath?: string | null;
  heroImageAlt?: string | null;
};

export type PublicSchoolContent = {
  id: string;
  kind: 'ACTIVITY' | 'ANNOUNCEMENT' | 'STAFF_PROFILE' | 'STUDENT_PROJECT';
  title: string;
  summary: string | null;
  body?: string | null;
  displayName?: string | null;
  roleTitle?: string | null;
  eventDate?: Date | null;
  imagePath?: string | null;
  imageAlt?: string | null;
};

export function SchoolSite({ settings, children }: { settings: SchoolSettingsView | null; children: React.ReactNode }) {
  return <div className="school-site"><SchoolNavigation logoImagePath={settings?.logoImagePath ?? null} logoImageAlt={settings?.logoImageAlt ?? null} /><main>{children}</main><SchoolFooter settings={settings} /></div>;
}

export async function SchoolFooter({ settings }: { settings: SchoolSettingsView | null }) {
  const { m, path } = await getI18n();
  return <footer className="school-footer"><div className="school-footer-inner"><div><Link href={path('/')} className="school-footer-brand"><Image src={settings?.logoImagePath ? '/api/site-media/logo' : '/images/wla-emblem.png'} alt={settings?.logoImagePath ? settings.logoImageAlt || m.common.logoAlt : m.common.emblemAlt} width={62} height={62} unoptimized={Boolean(settings?.logoImagePath)} /><span>{m.common.brandFirst} <b>{m.common.brandSecond}</b></span></Link><p>{m.common.tagline}</p></div><div className="school-footer-links"><Link href={path('/about')}>{m.nav.about}</Link><Link href={path('/academics')}>{m.nav.academics}</Link><Link href={path('/library')}>{m.nav.library}</Link><Link href={path('/contact')}>{m.nav.contact}</Link></div><p className="school-footer-contact" dir="auto">{settings?.contactAddress || m.footer.contactPending}</p></div><div className="school-footer-bottom"><span>{fmt(m.footer.copyright, { year: new Date().getFullYear() })}</span><Link href={path('/login?mode=ADMIN')}>{m.nav.adminLogin}</Link></div></footer>;
}

export async function SchoolHeroPhoto({ settings }: { settings: SchoolSettingsView | null }) {
  const { m } = await getI18n();
  return settings?.heroImagePath ? <Image className="school-hero-photo" src="/api/site-media/hero" width={1100} height={760} alt={settings.heroImageAlt || m.site.heroAlt} priority unoptimized /> : <div className="school-hero-photo-placeholder" role="group" aria-label={m.site.photoPending}><div className="school-photo-placeholder-art"><span className="school-photo-orbit school-photo-orbit-one" /><span className="school-photo-orbit school-photo-orbit-two" /><Image src="/images/wla-emblem.png" alt={m.common.emblemAlt} width={220} height={220} priority /></div><span className="school-photo-placeholder-label">{m.site.photoPendingHint}</span></div>;
}

export function SectionHeading({ eyebrow, title, description, href, action }: { eyebrow: string; title: string; description?: string; href?: string; action?: string }) {
  return <div className="school-section-heading"><div><span className="school-eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{href && action && <Link className="school-text-link" href={href}>{action}<span aria-hidden="true">↗</span></Link>}</div>;
}

export async function SchoolContentGrid({ items, emptyTitle, emptyText }: { items: PublicSchoolContent[]; emptyTitle: string; emptyText: string }) {
  const { intl } = await getI18n();
  if (!items.length) return <div className="school-empty-card"><span className="school-empty-mark" aria-hidden="true">W</span><h3>{emptyTitle}</h3><p>{emptyText}</p></div>;
  return <div className="school-content-grid">{items.map((item) => <article className={`school-content-card${item.kind === 'STAFF_PROFILE' ? ' staff-content-card' : ''}`} key={item.id}>
    {item.imagePath ? <Image className="school-content-image" src={`/api/site-media/content-${encodeURIComponent(item.id)}`} width={620} height={390} alt={item.imageAlt || ''} unoptimized /> : <div className="school-content-image-placeholder" aria-hidden="true"><span>WLA</span></div>}
    <div className="school-content-card-body">{item.eventDate && <time className="school-content-date" dateTime={item.eventDate.toISOString()}>{item.eventDate.toLocaleDateString(intl, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time>}{item.displayName && <span className="school-content-person" dir="auto">{item.displayName}</span>}{item.roleTitle && <span className="school-content-role" dir="auto">{item.roleTitle}</span>}<h3 dir="auto">{item.title}</h3>{item.summary && <p dir="auto">{item.summary}</p>}{item.body && <p className="school-content-full-body" dir="auto">{item.body}</p>}</div>
  </article>)}</div>;
}

export async function PublicContact({ settings }: { settings: SchoolSettingsView | null }) {
  const { m, path } = await getI18n();
  const hasContact = Boolean(settings?.contactPhone || settings?.contactEmail || settings?.contactAddress);
  return <div className="school-contact-grid">{hasContact ? <div className="school-contact-details">
    {settings?.contactAddress && <div><span>{m.site.visit}</span><p dir="auto">{settings.contactAddress}</p></div>}
    {settings?.contactPhone && <div><span>{m.site.call}</span><p><a href={`tel:${settings.contactPhone.replace(/[^+\d]/g, '')}`} dir="ltr">{settings.contactPhone}</a></p></div>}
    {settings?.contactEmail && <div><span>{m.site.email}</span><p><a href={`mailto:${settings.contactEmail}`} dir="ltr">{settings.contactEmail}</a></p></div>}
  </div> : <div className="school-empty-card"><span className="school-empty-mark" aria-hidden="true">W</span><h3>{m.site.contactPendingTitle}</h3><p>{m.site.contactPendingText}</p></div>}<aside className="school-contact-note"><span className="school-eyebrow">{m.common.schoolNameUpper}</span><h2>{m.site.contactNoteTitle}</h2><p>{m.site.contactNoteText}</p><Link className="school-button school-button-light" href={path('/library')}>{m.site.exploreLibrary}</Link></aside></div>;
}
