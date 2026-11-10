import Image from 'next/image';
import Link from 'next/link';
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

export function SchoolFooter({ settings }: { settings: SchoolSettingsView | null }) {
  return <footer className="school-footer"><div className="school-footer-inner"><div><Link href="/" className="school-footer-brand"><Image src={settings?.logoImagePath ? '/api/site-media/logo' : '/images/wla-emblem.png'} alt={settings?.logoImagePath ? settings.logoImageAlt || 'Wisdom Land Academy logo' : 'Wisdom Land Academy book-and-stars emblem'} width={62} height={62} unoptimized={Boolean(settings?.logoImagePath)} /><span>WISDOM LAND <b>ACADEMY</b></span></Link><p>Where Passion Becomes a Profession.</p></div><div className="school-footer-links"><Link href="/about">About Us</Link><Link href="/academics">Academics</Link><Link href="/library">Digital Library</Link><Link href="/contact">Contact Us</Link></div><p className="school-footer-contact">{settings?.contactAddress || 'School contact details will be added here.'}</p></div><div className="school-footer-bottom"><span>© {new Date().getFullYear()} Wisdom Land Academy · Grades 1–8</span><Link href="/login?mode=ADMIN">Admin Login</Link></div></footer>;
}

export function SchoolHeroPhoto({ settings }: { settings: SchoolSettingsView | null }) {
  return settings?.heroImagePath ? <Image className="school-hero-photo" src="/api/site-media/hero" width={1100} height={760} alt={settings.heroImageAlt || 'Wisdom Land Academy school'} priority unoptimized /> : <div className="school-hero-photo-placeholder" role="group" aria-label="School photograph not yet provided"><div className="school-photo-placeholder-art"><span className="school-photo-orbit school-photo-orbit-one" /><span className="school-photo-orbit school-photo-orbit-two" /><Image src="/images/wla-emblem.png" alt="Wisdom Land Academy book-and-stars emblem" width={220} height={220} priority /></div><span className="school-photo-placeholder-label">Add an approved WLA campus photo in Website Settings</span></div>;
}

export function SectionHeading({ eyebrow, title, description, href, action }: { eyebrow: string; title: string; description?: string; href?: string; action?: string }) {
  return <div className="school-section-heading"><div><span className="school-eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{href && action && <Link className="school-text-link" href={href}>{action}<span aria-hidden="true">↗</span></Link>}</div>;
}

export function SchoolContentGrid({ items, emptyTitle, emptyText }: { items: PublicSchoolContent[]; emptyTitle: string; emptyText: string }) {
  if (!items.length) return <div className="school-empty-card"><span className="school-empty-mark" aria-hidden="true">W</span><h3>{emptyTitle}</h3><p>{emptyText}</p></div>;
  return <div className="school-content-grid">{items.map((item) => <article className={`school-content-card${item.kind === 'STAFF_PROFILE' ? ' staff-content-card' : ''}`} key={item.id}>
    {item.imagePath ? <Image className="school-content-image" src={`/api/site-media/content-${encodeURIComponent(item.id)}`} width={620} height={390} alt={item.imageAlt || ''} unoptimized /> : <div className="school-content-image-placeholder" aria-hidden="true"><span>WLA</span></div>}
    <div className="school-content-card-body">{item.eventDate && <time className="school-content-date" dateTime={item.eventDate.toISOString()}>{item.eventDate.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time>}{item.displayName && <span className="school-content-person">{item.displayName}</span>}{item.roleTitle && <span className="school-content-role">{item.roleTitle}</span>}<h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}{item.body && <p className="school-content-full-body">{item.body}</p>}</div>
  </article>)}</div>;
}

export function PublicContact({ settings }: { settings: SchoolSettingsView | null }) {
  const hasContact = Boolean(settings?.contactPhone || settings?.contactEmail || settings?.contactAddress);
  return <div className="school-contact-grid">{hasContact ? <div className="school-contact-details">
    {settings?.contactAddress && <div><span>VISIT</span><p>{settings.contactAddress}</p></div>}
    {settings?.contactPhone && <div><span>CALL</span><p><a href={`tel:${settings.contactPhone.replace(/[^+\d]/g, '')}`}>{settings.contactPhone}</a></p></div>}
    {settings?.contactEmail && <div><span>EMAIL</span><p><a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></p></div>}
  </div> : <div className="school-empty-card"><span className="school-empty-mark" aria-hidden="true">W</span><h3>Contact details are being prepared</h3><p>The school administrator will add verified contact information here.</p></div>}<aside className="school-contact-note"><span className="school-eyebrow">WISDOM LAND ACADEMY</span><h2>We’d be glad to hear from you.</h2><p>School contact information is published here once verified by the administration.</p><Link className="school-button school-button-light" href="/library">Explore the Digital Library</Link></aside></div>;
}
