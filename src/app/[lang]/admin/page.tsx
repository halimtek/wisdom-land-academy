import { ArrowUpRight, BookOpen, Globe2, GraduationCap, Layers, LibraryBig, LockKeyhole, Newspaper, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireRole } from '@/lib/auth';
import { fmt } from '@/i18n/locales.mjs';
import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';

export default async function AdminDashboardPage() {
  await requireRole('ADMIN');
  const { m, path, intl } = await getI18n();
  const t = m.admin.dash;
  const dateLabel = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  // All figures are live database counts.
  const [publication, students, grades, subjects, recent] = await Promise.all([
    prisma.book.groupBy({ by: ['isPublished'], _count: { _all: true } }),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.grade.count(),
    prisma.subject.count(),
    prisma.book.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 6,
      select: { id: true, title: true, isPublished: true, updatedAt: true, bookType: true, subject: { select: { name: true, grade: { select: { name: true } } } } },
    }),
  ]);
  const published = publication.find((group) => group.isPublished)?._count._all ?? 0;
  const unpublished = publication.find((group) => !group.isPublished)?._count._all ?? 0;

  return (
    <div className="ad-page">
      <header className="al-heading">
        <div>
          <span className="welcome-label">{t.eyebrow}</span>
          <h1>{m.admin.dashboard}</h1>
          <p>{t.intro}</p>
        </div>
        <div className="al-heading-actions">
          <Link href={path('/admin/books')} className="al-button al-button-primary"><BookOpen size={16} aria-hidden="true" />{t.manageBooks}</Link>
        </div>
      </header>

      <section className="ad-stats" aria-label={t.statsLabel}>
        <Stat href={path('/admin/books')} label={t.totalBooks} value={published + unpublished} icon={<LibraryBig size={18} />} />
        <Stat href={path('/admin/books?status=published')} label={m.admin.published} value={published} icon={<Globe2 size={18} />} tone="published" />
        <Stat href={path('/admin/books?status=unpublished')} label={m.admin.unpublished} value={unpublished} icon={<LockKeyhole size={18} />} tone="draft" />
        <Stat href={path('/admin/students')} label={m.admin.studentsLabel} value={students} icon={<Users size={18} />} />
        <Stat href={path('/admin/books')} label={t.grades} value={grades} icon={<GraduationCap size={18} />} />
        <Stat href={path('/admin/books')} label={t.subjects} value={subjects} icon={<Layers size={18} />} />
      </section>

      <div className="ad-grid">
        <section className="ad-card" aria-labelledby="recent-books-title">
          <div className="ad-card-header"><h2 id="recent-books-title">{t.recent}</h2><Link href={path('/admin/books?sort=updated')}>{t.viewAll}</Link></div>
          {recent.length === 0 ? (
            <p className="ad-empty">{t.noBooks} <Link href={path('/admin/books')}>{t.addFirst}</Link>.</p>
          ) : (
            <ul className="ad-recent">
              {recent.map((book) => (
                <li key={book.id}>
                  <span>
                    <strong dir="auto">{book.title}</strong>
                    <small>{book.bookType === 'GENERAL' ? m.admin.generalLibrary : `${book.subject?.grade.name ?? '—'} · ${book.subject?.name ?? '—'}`} · {fmt(t.updated, { date: dateLabel.format(book.updatedAt) })}</small>
                  </span>
                  {book.isPublished
                    ? <span className="al-badge is-published"><Globe2 size={13} aria-hidden="true" />{m.admin.published}</span>
                    : <span className="al-badge is-draft"><LockKeyhole size={13} aria-hidden="true" />{m.admin.unpublished}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ad-card" aria-labelledby="quick-links-title">
          <div className="ad-card-header"><h2 id="quick-links-title">{t.administration}</h2></div>
          <nav className="ad-links" aria-label={t.sections}>
            <QuickLink href={path('/admin/books')} icon={<BookOpen size={18} />} title={t.books} text={t.booksText} />
            <QuickLink href={path('/admin/students')} icon={<GraduationCap size={18} />} title={m.admin.studentsLabel} text={t.studentsText} />
            <QuickLink href={path('/admin/content')} icon={<Newspaper size={18} />} title={t.contentTitle} text={t.contentText} />
            <QuickLink href={path('/admin/settings')} icon={<Settings size={18} />} title={m.admin.settingsLabel} text={t.settingsText} />
          </nav>
        </section>
      </div>
    </div>
  );
}

function Stat({ href, label, value, icon, tone }: { href: string; label: string; value: number; icon: ReactNode; tone?: 'published' | 'draft' }) {
  return (
    <Link href={href} className={`ad-stat${tone ? ` is-${tone}` : ''}`}>
      <span className="ad-stat-icon" aria-hidden="true">{icon}</span>
      <span><strong>{value}</strong><small>{label}</small></span>
    </Link>
  );
}

function QuickLink({ href, icon, title, text }: { href: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="ad-link">
      <span className="al-stat-icon" aria-hidden="true">{icon}</span>
      <span><strong>{title}</strong><small>{text}</small></span>
      <ArrowUpRight size={16} aria-hidden="true" className="flip-rtl" />
    </Link>
  );
}
