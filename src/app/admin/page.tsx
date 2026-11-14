import { ArrowUpRight, BookOpen, Globe2, GraduationCap, Layers, LibraryBig, LockKeyhole, Newspaper, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const dateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default async function AdminDashboardPage() {
  await requireRole('ADMIN');

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
          <span className="welcome-label">SCHOOL LIBRARY</span>
          <h1>Dashboard</h1>
          <p>An overview of the Wisdom Land Academy library and school structure.</p>
        </div>
        <div className="al-heading-actions">
          <Link href="/admin/books" className="al-button al-button-primary"><BookOpen size={16} aria-hidden="true" />Manage books</Link>
        </div>
      </header>

      <section className="ad-stats" aria-label="Library statistics">
        <Stat href="/admin/books" label="Total books" value={published + unpublished} icon={<LibraryBig size={18} />} />
        <Stat href="/admin/books?status=published" label="Published" value={published} icon={<Globe2 size={18} />} tone="published" />
        <Stat href="/admin/books?status=unpublished" label="Unpublished" value={unpublished} icon={<LockKeyhole size={18} />} tone="draft" />
        <Stat href="/admin/students" label="Students" value={students} icon={<Users size={18} />} />
        <Stat href="/admin/books" label="Grades" value={grades} icon={<GraduationCap size={18} />} />
        <Stat href="/admin/books" label="Subjects" value={subjects} icon={<Layers size={18} />} />
      </section>

      <div className="ad-grid">
        <section className="ad-card" aria-labelledby="recent-books-title">
          <div className="ad-card-header"><h2 id="recent-books-title">Recently updated books</h2><Link href="/admin/books?sort=updated">View all</Link></div>
          {recent.length === 0 ? (
            <p className="ad-empty">No books yet. <Link href="/admin/books">Add the first book</Link>.</p>
          ) : (
            <ul className="ad-recent">
              {recent.map((book) => (
                <li key={book.id}>
                  <span>
                    <strong>{book.title}</strong>
                    <small>{book.bookType === 'GENERAL' ? 'General library' : `${book.subject?.grade.name ?? '—'} · ${book.subject?.name ?? '—'}`} · updated {dateLabel.format(book.updatedAt)}</small>
                  </span>
                  {book.isPublished
                    ? <span className="al-badge is-published"><Globe2 size={13} aria-hidden="true" />Published</span>
                    : <span className="al-badge is-draft"><LockKeyhole size={13} aria-hidden="true" />Unpublished</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ad-card" aria-labelledby="quick-links-title">
          <div className="ad-card-header"><h2 id="quick-links-title">Administration</h2></div>
          <nav className="ad-links" aria-label="Administration sections">
            <QuickLink href="/admin/books" icon={<BookOpen size={18} />} title="Books" text="Upload, publish and organize textbooks" />
            <QuickLink href="/admin/students" icon={<GraduationCap size={18} />} title="Students" text="Create accounts and assign grades" />
            <QuickLink href="/admin/content" icon={<Newspaper size={18} />} title="Website content" text="News, activities, staff and projects" />
            <QuickLink href="/admin/settings" icon={<Settings size={18} />} title="Settings" text="School details, logo and hero image" />
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
      <ArrowUpRight size={16} aria-hidden="true" />
    </Link>
  );
}
