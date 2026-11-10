'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { progressPercent, recentBookIds } from '@/lib/reading-state.mjs';
import { useReadingState } from '@/lib/reading-storage';
import { BookCover } from './book-cover';
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

type ReadingSnapshot = ReturnType<typeof useReadingState>;

function Card({ book, reading }: { book: CatalogBook; reading: ReadingSnapshot }) {
  const local = reading.books[book.id];
  const resumePage = local && local.page > 1 ? local.page : book.page && book.page > 1 ? book.page : 0;
  const percent = local ? progressPercent(local) : 0;
  const category = book.bookType === 'GENERAL' || !book.subject ? 'General Library' : `${book.grade?.name ?? ''} · ${book.subject.name}`;
  return (
    <Link href={`/library/books/${book.id}`} className="wla-card">
      <div className="wla-card-cover">
        <BookCover id={book.id} title={book.title} hasCover={Boolean(book.coverImagePath)} sizes={COVER_SIZES} />
        {percent > 0 && <div className="wla-progress-line wla-progress-cover" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>}
      </div>
      <div className="wla-card-info">
        <p>{category}</p>
        <h3>{book.title}</h3>
        <span>{book.author || 'Wisdom Land Academy'}</span>
        {resumePage > 0 && <small>Continue from page {resumePage}</small>}
      </div>
    </Link>
  );
}

function Section({ title, hint, list, reading }: { title: string; hint: string; list: CatalogBook[]; reading: ReadingSnapshot }) {
  return (
    <section className="wla-section">
      <div className="wla-section-head"><h2>{title} <span>{list.length}</span></h2><p>{hint}</p></div>
      <div className="wla-grid">{list.map((b) => <Card key={b.id} book={b} reading={reading} />)}</div>
    </section>
  );
}

export default function LibraryCatalog({ books }: { books: CatalogBook[] }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [gradeId, setGradeId] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const reading = useReadingState();

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
    const needle = query.trim().toLowerCase();
    return books.filter((b) => {
      if (tab === 'general' && b.bookType !== 'GENERAL') return false;
      if (tab === 'grade' && b.bookType !== 'GRADE_BASED') return false;
      if (gradeId !== 'all' && b.grade?.id !== gradeId) return false;
      if (subjectId !== 'all' && b.subject?.id !== subjectId) return false;
      if (!needle) return true;
      return [b.title, b.author, b.description, b.grade?.name, b.subject?.name].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [books, query, tab, gradeId, subjectId]);

  const general = visible.filter((b) => b.bookType === 'GENERAL');
  const graded = visible.filter((b) => b.bookType === 'GRADE_BASED');

  // Continue reading: browser-local progress joined to books that are still published.
  const continueBooks = useMemo(() => {
    const byId = new Map(books.map((b) => [b.id, b]));
    return recentBookIds(reading, 8)
      .map((id) => byId.get(id))
      .filter((b): b is CatalogBook => Boolean(b) && (reading.books[b!.id]?.page ?? 0) > 1);
  }, [books, reading]);

  const recentlyAdded = useMemo(() => [...books].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6), [books]);

  function clearAll() {
    setQuery(''); setTab('all'); setGradeId('all'); setSubjectId('all');
  }

  return (
    <main className="wla-lib">
      <header className="wla-lib-hero">
        <p className="wla-eyebrow">Wisdom Land Academy · Grades 1–8</p>
        <h1>Digital Library</h1>
        <p>Where Passion Becomes a Profession. Pick a book and start reading.</p>
        <label className="wla-search">
          <Search size={20} aria-hidden="true" />
          <span className="wla-sr">Search by title or author</span>
          <input type="search" inputMode="search" enterKeyHint="search" placeholder="Search by title or author" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={20} aria-hidden="true" /></button>}
        </label>
      </header>

      <div className="wla-filters">
        <div className="wla-tabs" role="tablist" aria-label="Library collections">
          {([['all', 'All books'], ['general', 'General Library'], ['grade', 'By grade']] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''}
              onClick={() => { setTab(value); if (value === 'general') { setGradeId('all'); setSubjectId('all'); } }}>
              {label}
            </button>
          ))}
        </div>
        {tab !== 'general' && grades.length > 0 && (
          <div className="wla-selects">
            <label>Grade
              <select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSubjectId('all'); }}>
                <option value="all">All grades</option>
                {grades.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label>Subject
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="all">All subjects</option>
                {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>
      <p className="wla-hint" role="status">{visible.length} {visible.length === 1 ? 'book' : 'books'} found</p>

      {!filtering && continueBooks.length > 0 && (
        <Section reading={reading} title="Continue reading" hint="Pick up right where you stopped on this device." list={continueBooks} />
      )}
      {!filtering && books.length > 6 && <Section reading={reading} title="Recently added" hint="The newest books in the library." list={recentlyAdded} />}
      {general.length > 0 && <Section reading={reading} title="General Library" hint="Books for everyone, outside the grade collections." list={general} />}
      {graded.length > 0 && <Section reading={reading} title="Books by grade" hint="Learning materials organised by grade and subject." list={graded} />}

      {visible.length === 0 && (
        <div className="wla-empty">
          <BookOpen size={44} aria-hidden="true" />
          <h2>{books.length === 0 ? 'No books yet' : 'No books found'}</h2>
          <p>{books.length === 0 ? 'Books will appear here as soon as the school publishes them.' : 'Check the spelling, or try a different grade or subject.'}</p>
          {books.length > 0 && <button type="button" className="wla-button wla-button-gold" onClick={clearAll}>Clear search and filters</button>}
        </div>
      )}
    </main>
  );
}