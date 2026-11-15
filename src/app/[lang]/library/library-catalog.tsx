'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { progressPercent, recentBookIds } from '@/lib/reading-state.mjs';
import { useReadingState } from '@/lib/reading-storage';
import { useReading } from '@/lib/reading-client';
import { ReaderBar } from '@/components/reading/whos-reading';
import { BookCover } from './book-cover';
import { useI18n } from '@/i18n/client';
import { fmt, plural } from '@/i18n/locales.mjs';
import './library-v2.css';

export type CatalogBook = {
  id: string;
  bookType: 'GRADE_BASED' | 'GENERAL';
  title: string;
  author: string | null;
  description: string | null;
  grade: { id: string; name: string } | null | undefined;
  subject: { id: string; name: string } | null | undefined;
  page?: number;
  coverImagePath?: string | null;
  createdAt: string;
};

type Tab = 'all' | 'general' | 'grade';
const byName = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], undefined, { numeric: true });
const COVER_SIZES = '(max-width: 640px) 46vw, (max-width: 1024px) 28vw, 200px';

type ProgressInfo = { percent: number; resumePage: number; finished: boolean };
type ProgressFor = (bookId: string) => ProgressInfo;

function Card({ book, progressFor }: { book: CatalogBook; progressFor: ProgressFor }) {
  const { m, path } = useI18n();
  const { percent, resumePage, finished } = progressFor(book.id);
  const category = book.bookType === 'GENERAL' || !book.subject ? m.library.generalTitle : `${book.grade?.name ?? ''} · ${book.subject.name}`;
  return (
    <Link href={path(`/library/books/${book.id}`)} className="wla-card">
      <div className="wla-card-cover">
        <BookCover id={book.id} title={book.title} hasCover={Boolean(book.coverImagePath)} sizes={COVER_SIZES} noCoverLabel={fmt(m.library.noCover, { title: book.title })} coverAlt={fmt(m.library.coverOf, { title: book.title })} />
        {percent > 0 && <div className="wla-progress-line wla-progress-cover" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>}
      </div>
      <div className="wla-card-info">
        <p dir="auto">{category}</p>
        <h3 dir="auto">{book.title}</h3>
        <span dir="auto">{book.author || m.common.schoolName}</span>
        {finished ? <small className="wr-finished-badge">{m.library.finished}</small> : resumePage > 0 && <small>{fmt(m.library.continueFrom, { n: resumePage })}</small>}
      </div>
    </Link>
  );
}

function Section({ title, hint, list, progressFor }: { title: string; hint: string; list: CatalogBook[]; progressFor: ProgressFor }) {
  return (
    <section className="wla-section">
      <div className="wla-section-head"><h2>{title} <span>{list.length}</span></h2><p>{hint}</p></div>
      <div className="wla-grid">{list.map((b) => <Card key={b.id} book={b} progressFor={progressFor} />)}</div>
    </section>
  );
}

export default function LibraryCatalog({ books }: { books: CatalogBook[] }) {
  const { m, locale } = useI18n();
  const t = m.library;
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [gradeId, setGradeId] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const reading = useReadingState();
  // Signed-in student ("Who's reading?"): their own saved progress. Otherwise this
  // device's local progress (which siblings sharing the iPad have in common).
  const { status, progress } = useReading();
  const serverProgress = status?.reader ? progress : null;
  const progressFor: ProgressFor = (bookId) => {
    if (serverProgress) {
      const p = serverProgress.get(bookId);
      if (!p) return { percent: 0, resumePage: 0, finished: false };
      return { percent: p.totalPages ? Math.round((p.pagesViewed / p.totalPages) * 100) : 0, resumePage: p.page > 1 ? p.page : 0, finished: p.finished };
    }
    const local = reading.books[bookId];
    return { percent: local ? progressPercent(local) : 0, resumePage: local && local.page > 1 ? local.page : 0, finished: false };
  };

  const grades = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of books) if (b.grade) map.set(b.grade.id, b.grade.name);
    return [...map.entries()].sort(byName);
  }, [books]);

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of books) if (b.subject && b.grade && (gradeId === 'all' || b.grade.id === gradeId)) map.set(b.subject.id, b.subject.name);
    return [...map.entries()].sort(byName);
  }, [books, gradeId]);

  const filtering = query.trim() !== '' || tab !== 'all' || gradeId !== 'all' || subjectId !== 'all';

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return books.filter((b) => {
      if (tab === 'general' && b.bookType !== 'GENERAL') return false;
      if (tab === 'grade' && b.bookType !== 'GRADE_BASED') return false;
      if (gradeId !== 'all' && b.grade?.id !== gradeId) return false;
      if (subjectId !== 'all' && b.subject?.id !== subjectId) return false;
      if (!needle) return true;
      return [b.title, b.author, b.description, b.grade?.name, b.subject?.name].some((v) => v?.toLocaleLowerCase(locale).includes(needle));
    });
  }, [books, query, tab, gradeId, subjectId, locale]);

  const general = visible.filter((b) => b.bookType === 'GENERAL');
  const graded = visible.filter((b) => b.bookType === 'GRADE_BASED');

  // Continue reading: the signed-in student's own books, otherwise this device's local progress.
  const continueBooks = useMemo(() => {
    const byId = new Map(books.map((b) => [b.id, b]));
    if (serverProgress) {
      return [...serverProgress.values()].filter((p) => !p.finished && p.page > 1).slice(0, 8)
        .map((p) => byId.get(p.bookId)).filter((b): b is CatalogBook => Boolean(b));
    }
    return recentBookIds(reading, 8)
      .map((id) => byId.get(id))
      .filter((b): b is CatalogBook => Boolean(b) && (reading.books[b!.id]?.page ?? 0) > 1);
  }, [books, reading, serverProgress]);

  const recentlyAdded = useMemo(() => [...books].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6), [books]);

  function clearAll() {
    setQuery(''); setTab('all'); setGradeId('all'); setSubjectId('all');
  }

  return (
    <main className="wla-lib">
      <header className="wla-lib-hero">
        <p className="wla-eyebrow">{m.common.schoolName} · {m.common.grades}</p>
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
        <label className="wla-search">
          <Search size={20} aria-hidden="true" />
          <span className="wla-sr">{t.search}</span>
          <input type="search" inputMode="search" enterKeyHint="search" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button type="button" aria-label={t.clearSearch} onClick={() => setQuery('')}><X size={20} aria-hidden="true" /></button>}
        </label>
      </header>

      <ReaderBar />

      <div className="wla-filters">
        <div className="wla-tabs" role="tablist" aria-label={t.collections}>
          {([['all', t.tabAll], ['general', t.tabGeneral], ['grade', t.tabGrade]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''}
              onClick={() => { setTab(value); if (value === 'general') { setGradeId('all'); setSubjectId('all'); } }}>
              {label}
            </button>
          ))}
        </div>
        {tab !== 'general' && grades.length > 0 && (
          <div className="wla-selects">
            <label>{t.grade}
              <select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSubjectId('all'); }}>
                <option value="all">{t.allGrades}</option>
                {grades.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label>{t.subject}
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="all">{t.allSubjects}</option>
                {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>
      <p className="wla-hint" role="status">{plural(visible.length, t.found)}</p>

      {!filtering && continueBooks.length > 0 && (
        <Section progressFor={progressFor} title={t.continueTitle} hint={serverProgress ? t.continueHintReader : t.continueHintDevice} list={continueBooks} />
      )}
      {!filtering && books.length > 6 && <Section progressFor={progressFor} title={t.recentTitle} hint={t.recentHint} list={recentlyAdded} />}
      {general.length > 0 && <Section progressFor={progressFor} title={t.generalTitle} hint={t.generalHint} list={general} />}
      {graded.length > 0 && <Section progressFor={progressFor} title={t.gradedTitle} hint={t.gradedHint} list={graded} />}

      {visible.length === 0 && (
        <div className="wla-empty">
          <BookOpen size={44} aria-hidden="true" />
          <h2>{books.length === 0 ? t.noBooksYet : t.noBooksFound}</h2>
          <p>{books.length === 0 ? t.noBooksYetText : t.noBooksFoundText}</p>
          {books.length > 0 && <button type="button" className="wla-button wla-button-gold" onClick={clearAll}>{t.clearAll}</button>}
        </div>
      )}
    </main>
  );
}