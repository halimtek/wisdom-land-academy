'use client';

import {
  AlertTriangle, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileText, Globe2, Layers, Loader2,
  LockKeyhole, MoreHorizontal, Pencil, Plus, Search, Trash2, Users, X,
} from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react';
import { deleteBookById, setBooksPublication } from '@/app/actions/books';
import { PAGE_SIZES, SORTS, bookQueryString, pageWindow, parseBookQuery } from '@/lib/admin-books.mjs';
import { BookEditor, CatalogSetup, type GradeOption, type ManagedBook } from './book-manager';

export type LibraryBook = ManagedBook & { createdAtLabel: string; updatedAtLabel: string };
type Query = { q: string; status: string; type: string; grade: string; subject: string; sort: string; page: number; pageSize: number };
type Pagination = { page: number; pageSize: number; totalPages: number; total: number; from: number; to: number };
type Counts = { all: number; published: number; unpublished: number };
type Notice = { kind: 'success' | 'error'; text: string } | null;
type Confirm =
  | { kind: 'delete'; book: LibraryBook }
  | { kind: 'bulk'; publish: boolean; ids: string[] }
  | null;

const STATUS_TABS = [
  { value: 'all', label: 'All books' },
  { value: 'published', label: 'Published' },
  { value: 'unpublished', label: 'Unpublished' },
] as const;

// The table (wide screens) and the cards (narrow screens) are both in the markup and
// toggled by CSS. Cover images are rendered only in the layout actually shown, so each
// cover is requested once (a hidden lazy copy can abort the visible one's request).
const NARROW = '(max-width: 900px)';
const subscribeLayout = (onChange: () => void) => { const query = window.matchMedia(NARROW); query.addEventListener('change', onChange); return () => query.removeEventListener('change', onChange); };
function useVisibleLayout(): 'table' | 'cards' | null {
  return useSyncExternalStore(subscribeLayout, () => (window.matchMedia(NARROW).matches ? 'cards' : 'table'), () => null);
}

function gradeLabel(book: LibraryBook) {
  if (book.bookType === 'GRADE_BASED') return book.subject?.grade.name ?? '—';
  if (book.accessAllStudents) return 'All grades';
  const names = book.allowedGrades.map((entry) => entry.grade.name);
  return names.length ? names.join(', ') : 'No grades';
}

export default function BookLibrary({ books, grades, query, pagination, tabCounts, libraryCounts }: {
  books: LibraryBook[]; grades: GradeOption[]; query: Query; pagination: Pagination; tabCounts: Counts; libraryCounts: Counts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNavigation] = useTransition();
  const [acting, startAction] = useTransition();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editor, setEditor] = useState<{ book?: LibraryBook } | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [search, setSearch] = useState(query.q);
  const busy = useRef(false); // one book action at a time (no duplicate clicks)
  const layout = useVisibleLayout();

  // Keep the search box in sync with the URL (back/forward, "Clear filters").
  const [syncedQ, setSyncedQ] = useState(query.q);
  if (syncedQ !== query.q) { setSyncedQ(query.q); setSearch(query.q); }

  // Drop selections that are no longer on this page (after filtering, paging, deleting).
  const pageIds = useMemo(() => new Set(books.map((book) => book.id)), [books]);
  const visibleSelected = [...selected].filter((id) => pageIds.has(id));

  // Always build URLs from the latest query: the debounced search runs later and
  // must not restore filters that were changed or cleared in the meantime.
  const latestQuery = useRef(query);
  useEffect(() => { latestQuery.current = query; }, [query]);
  function navigate(changes: Partial<Query>) {
    const search = bookQueryString(latestQuery.current, changes);
    latestQuery.current = parseBookQuery(Object.fromEntries(new URLSearchParams(search.slice(1)))); // target of this navigation
    startNavigation(() => router.replace(`${pathname}${search}`, { scroll: false }));
  }

  // Debounced search: the URL (and server query) updates 350 ms after typing stops.
  useEffect(() => {
    if (search.trim() === latestQuery.current.q) return;
    const timer = setTimeout(() => { if (search.trim() !== latestQuery.current.q) navigate({ q: search.trim() }); }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (notice?.kind !== 'success') return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function run(ids: string[], task: () => Promise<{ error?: string; success?: string }>, after?: () => void) {
    if (busy.current) return;
    busy.current = true;
    setBusyIds(new Set(ids));
    setNotice(null);
    startAction(async () => {
      try {
        const result = await task();
        setNotice(result.error ? { kind: 'error', text: result.error } : { kind: 'success', text: result.success ?? 'Done.' });
        if (!result.error) after?.();
      } catch {
        setNotice({ kind: 'error', text: 'The server could not be reached. Nothing was changed; please try again.' });
      } finally {
        busy.current = false;
        setBusyIds(new Set());
      }
    });
  }

  const togglePublication = (book: LibraryBook) =>
    run([book.id], () => setBooksPublication({ ids: [book.id], publish: !book.isPublished }));

  function confirmAction() {
    if (!confirm) return;
    if (confirm.kind === 'delete') {
      const { book } = confirm;
      setConfirm(null);
      run([book.id], () => deleteBookById(book.id), () => setSelected((prev) => { const next = new Set(prev); next.delete(book.id); return next; }));
    } else {
      const { ids, publish } = confirm;
      setConfirm(null);
      run(ids, () => setBooksPublication({ ids, publish }), () => setSelected(new Set()));
    }
  }

  const toggleSelected = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allOnPageSelected = books.length > 0 && visibleSelected.length === books.length;
  const toggleAll = () => setSelected(allOnPageSelected ? new Set() : new Set(books.map((book) => book.id)));
  const filtersActive = Boolean(query.q || query.grade || query.subject || query.type || query.status !== 'all');
  const subjectsForFilter = query.grade ? grades.filter((grade) => grade.id === query.grade) : grades;

  const rowProps = { busyIds, acting, onEdit: (book: LibraryBook) => setEditor({ book }), onToggle: togglePublication, onDelete: (book: LibraryBook) => setConfirm({ kind: 'delete', book }) };

  return (
    <div className="al-page">
      <header className="al-heading">
        <div>
          <span className="welcome-label">LIBRARY ADMINISTRATION</span>
          <h1>Manage Books</h1>
          <p>Find, organize and publish the school&apos;s PDF textbooks.</p>
        </div>
        <div className="al-heading-actions">
          <button type="button" className="al-button al-button-secondary" onClick={() => setCatalogOpen(true)}><Layers size={16} aria-hidden="true" />Grades &amp; subjects</button>
          <button type="button" className="al-button al-button-primary" onClick={() => setEditor({})}><Plus size={16} aria-hidden="true" />Add book</button>
        </div>
      </header>

      <section className="al-stats" aria-label="Library totals">
        <StatCard label="All books" value={libraryCounts.all} icon={<BookOpen size={18} />} active={query.status === 'all'} onClick={() => navigate({ status: 'all' })} />
        <StatCard label="Published" value={libraryCounts.published} icon={<Globe2 size={18} />} tone="published" active={query.status === 'published'} onClick={() => navigate({ status: 'published' })} />
        <StatCard label="Unpublished" value={libraryCounts.unpublished} icon={<LockKeyhole size={18} />} tone="draft" active={query.status === 'unpublished'} onClick={() => navigate({ status: 'unpublished' })} />
      </section>

      <section className="al-panel" aria-label="Books">
        <div className="al-tabs" role="group" aria-label="Publication status">
          {STATUS_TABS.map((tab) => (
            <button key={tab.value} type="button" className={`al-tab${query.status === tab.value ? ' is-active' : ''}`} aria-pressed={query.status === tab.value} onClick={() => navigate({ status: tab.value })}>
              {tab.label}<span className="al-tab-count">{tabCounts[tab.value]}</span>
            </button>
          ))}
        </div>

        <form className="al-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); navigate({ q: search.trim() }); }}>
          <label className="al-search">
            <Search size={16} aria-hidden="true" />
            <span className="al-sr">Search books</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, author, subject or grade" maxLength={100} autoComplete="off" enterKeyHint="search" />
            {search && <button type="button" className="al-search-clear" aria-label="Clear search" onClick={() => { setSearch(''); navigate({ q: '' }); }}><X size={14} /></button>}
          </label>
          <label className="al-select"><span>Grade</span>
            <select value={query.grade} onChange={(event) => {
              const grade = event.target.value;
              const keepSubject = grade && grades.find((g) => g.id === grade)?.subjects.some((s) => s.id === query.subject);
              navigate({ grade, subject: keepSubject ? query.subject : '' });
            }}>
              <option value="">All grades</option>
              {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
            </select>
          </label>
          <label className="al-select"><span>Subject</span>
            <select value={query.subject} onChange={(event) => navigate({ subject: event.target.value })}>
              <option value="">All subjects</option>
              {subjectsForFilter.map((grade) => grade.subjects.length > 0 && (
                <optgroup key={grade.id} label={grade.name}>{grade.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</optgroup>
              ))}
            </select>
          </label>
          <label className="al-select"><span>Category</span>
            <select value={query.type} onChange={(event) => navigate({ type: event.target.value })}>
              <option value="">All categories</option>
              <option value="GRADE_BASED">Grade-based</option>
              <option value="GENERAL">General library</option>
            </select>
          </label>
          <label className="al-select"><span>Sort</span>
            <select value={query.sort} onChange={(event) => navigate({ sort: event.target.value })}>
              {Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {filtersActive && <button type="button" className="al-button al-button-ghost" onClick={() => { setSearch(''); navigate({ q: '', grade: '', subject: '', type: '', status: 'all' }); }}><X size={14} aria-hidden="true" />Clear filters</button>}
        </form>

        <div className={`al-loading-line${navigating ? ' is-active' : ''}`} aria-hidden="true" />
        <div className="al-notice-region" aria-live="polite" role="status">
          {notice && (
            <div className={`al-notice is-${notice.kind}`}>
              {notice.kind === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
              <span>{notice.text}</span>
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={14} /></button>
            </div>
          )}
        </div>

        {visibleSelected.length > 0 && (
          <div className="al-bulkbar" role="region" aria-label="Bulk actions">
            <strong>{visibleSelected.length} selected</strong>
            <button type="button" className="al-button al-button-secondary" disabled={acting} onClick={() => setConfirm({ kind: 'bulk', publish: true, ids: visibleSelected })}><Globe2 size={15} aria-hidden="true" />Publish selected</button>
            <button type="button" className="al-button al-button-secondary" disabled={acting} onClick={() => setConfirm({ kind: 'bulk', publish: false, ids: visibleSelected })}><LockKeyhole size={15} aria-hidden="true" />Unpublish selected</button>
            <button type="button" className="al-button al-button-ghost" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        )}

        <div className={`al-results${navigating ? ' is-pending' : ''}`} aria-busy={navigating}>
          {books.length === 0 ? (
            <EmptyState hasBooks={libraryCounts.all > 0} filtersActive={filtersActive} onAdd={() => setEditor({})} onClear={() => { setSearch(''); navigate({ q: '', grade: '', subject: '', type: '', status: 'all' }); }} />
          ) : (
            <>
              <table className="al-table">
                <caption className="al-sr">Books, page {pagination.page} of {pagination.totalPages}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="al-col-check"><SelectAll checked={allOnPageSelected} indeterminate={visibleSelected.length > 0 && !allOnPageSelected} onChange={toggleAll} /></th>
                    <th scope="col" className="al-col-book">Book</th>
                    <th scope="col">Grade</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                    <th scope="col">Added</th>
                    <th scope="col" className="al-col-actions"><span className="al-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((book) => (
                    <tr key={book.id} className={selected.has(book.id) ? 'is-selected' : undefined}>
                      <td className="al-col-check"><input type="checkbox" checked={selected.has(book.id)} onChange={() => toggleSelected(book.id)} aria-label={`Select ${book.title}`} /></td>
                      <td className="al-col-book"><BookIdentity book={book} showCover={layout === 'table'} /></td>
                      <td>{gradeLabel(book)}</td>
                      <td>{book.subject?.name ?? '—'}</td>
                      <td>{book.bookType === 'GENERAL' ? 'General' : 'Grade-based'}</td>
                      <td><StatusBadge published={book.isPublished} busy={busyIds.has(book.id)} /></td>
                      <td className="al-date" title={`Updated ${book.updatedAtLabel}`}>{book.createdAtLabel}</td>
                      <td className="al-col-actions"><ActionsMenu book={book} {...rowProps} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="al-cards" aria-label={`Books, page ${pagination.page} of ${pagination.totalPages}`}>
                {books.map((book) => (
                  <li key={book.id} className={`al-card${selected.has(book.id) ? ' is-selected' : ''}`}>
                    <input type="checkbox" className="al-card-check" checked={selected.has(book.id)} onChange={() => toggleSelected(book.id)} aria-label={`Select ${book.title}`} />
                    <BookIdentity book={book} showCover={layout === 'cards'} />
                    <div className="al-card-meta">
                      <span>{gradeLabel(book)}</span>
                      {book.subject && <span>{book.subject.name}</span>}
                      <span>{book.bookType === 'GENERAL' ? 'General' : 'Grade-based'}</span>
                      <span>Added {book.createdAtLabel}</span>
                    </div>
                    <div className="al-card-footer">
                      <StatusBadge published={book.isPublished} busy={busyIds.has(book.id)} />
                      <ActionsMenu book={book} {...rowProps} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {pagination.total > 0 && (
          <nav className="al-pagination" aria-label="Pagination">
            <p>Showing <strong>{pagination.from}–{pagination.to}</strong> of <strong>{pagination.total}</strong> {pagination.total === 1 ? 'book' : 'books'}</p>
            <div className="al-pages">
              <button type="button" className="al-page-button" disabled={pagination.page <= 1 || navigating} onClick={() => navigate({ page: pagination.page - 1 })} aria-label="Previous page"><ChevronLeft size={16} /></button>
              {pageWindow(pagination.page, pagination.totalPages).map((page, index) => page === null
                ? <span key={`gap-${index}`} className="al-page-gap" aria-hidden="true">…</span>
                : <button key={page} type="button" className={`al-page-button${page === pagination.page ? ' is-current' : ''}`} aria-current={page === pagination.page ? 'page' : undefined} aria-label={`Page ${page}`} disabled={navigating} onClick={() => navigate({ page })}>{page}</button>)}
              <button type="button" className="al-page-button" disabled={pagination.page >= pagination.totalPages || navigating} onClick={() => navigate({ page: pagination.page + 1 })} aria-label="Next page"><ChevronRight size={16} /></button>
            </div>
            <label className="al-select al-page-size"><span>Per page</span>
              <select value={pagination.pageSize} onChange={(event) => navigate({ pageSize: Number(event.target.value) })}>
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </nav>
        )}
      </section>

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm?.kind === 'delete' ? 'Delete this book?' : confirm?.publish ? 'Publish selected books?' : 'Unpublish selected books?'} size="small">
        {confirm?.kind === 'delete' && (
          <div className="al-confirm">
            <p>You are about to permanently delete:</p>
            <p className="al-confirm-title">“{confirm.book.title}”</p>
            {confirm.book._count.progress > 0 ? (
              <p className="al-confirm-warning"><AlertTriangle size={16} aria-hidden="true" />This book has {confirm.book._count.progress} saved reading {confirm.book._count.progress === 1 ? 'record' : 'records'}, so it cannot be deleted. You can unpublish it instead.</p>
            ) : (
              <p className="al-confirm-warning"><AlertTriangle size={16} aria-hidden="true" />The PDF{confirm.book.coverImagePath ? ' and cover image' : ''} will be removed from storage. This cannot be undone.</p>
            )}
            <div className="al-dialog-actions">
              <button type="button" className="al-button al-button-secondary" data-autofocus onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" className="al-button al-button-danger" disabled={confirm.book._count.progress > 0 || acting} onClick={confirmAction}><Trash2 size={15} aria-hidden="true" />Delete book</button>
            </div>
          </div>
        )}
        {confirm?.kind === 'bulk' && (
          <div className="al-confirm">
            <p>{confirm.publish
              ? `${confirm.ids.length} ${confirm.ids.length === 1 ? 'book' : 'books'} will become readable by everyone on the school library.`
              : `${confirm.ids.length} ${confirm.ids.length === 1 ? 'book' : 'books'} will be hidden from all readers until published again.`}</p>
            <div className="al-dialog-actions">
              <button type="button" className="al-button al-button-secondary" data-autofocus onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" className="al-button al-button-primary" disabled={acting} onClick={confirmAction}>{confirm.publish ? <Globe2 size={15} aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />}{confirm.publish ? 'Publish' : 'Unpublish'} {confirm.ids.length}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editor !== null} onClose={() => setEditor(null)} title={editor?.book ? `Edit “${editor.book.title}”` : 'Add a book'} preventClose={editorBusy}>
        {editor && (
          <div className="al-editor">
            {editor.book && (editor.book.permissions.length > 0 || editor.book._count.progress > 0) && (
              <p className="al-editor-note"><Users size={15} aria-hidden="true" />{editor.book.permissions.length} individual student grant {editor.book.permissions.length === 1 ? 'record is' : 'records are'} preserved. Publication controls library access.{editor.book._count.progress > 0 ? ` ${editor.book._count.progress} reading progress ${editor.book._count.progress === 1 ? 'record' : 'records'} saved.` : ''}</p>
            )}
            <BookEditor key={editor.book?.id ?? 'new'} grades={grades} book={editor.book} onBusyChange={setEditorBusy} onSaved={(message) => setNotice({ kind: 'success', text: message })} />
          </div>
        )}
      </Modal>

      <Modal open={catalogOpen} onClose={() => setCatalogOpen(false)} title="Grades and subjects">
        <CatalogSetup grades={grades} />
      </Modal>
    </div>
  );
}

function StatCard({ label, value, icon, tone, active, onClick }: { label: string; value: number; icon: ReactNode; tone?: 'published' | 'draft'; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`al-stat${tone ? ` is-${tone}` : ''}${active ? ' is-active' : ''}`} aria-pressed={active} onClick={onClick}>
      <span className="al-stat-icon" aria-hidden="true">{icon}</span>
      <span><strong>{value}</strong><small>{label}</small></span>
    </button>
  );
}

function BookIdentity({ book, showCover }: { book: LibraryBook; showCover: boolean }) {
  // Published covers go through the image optimizer (small thumbnails). Unpublished
  // covers are loaded directly by the browser, which sends the admin session cookie
  // (the optimizer fetches without it). A missing/broken image falls back to the icon.
  const [coverFailed, setCoverFailed] = useState(false);
  const src = `/api/site-media/book-cover-${book.id}`;
  return (
    <div className="al-identity">
      <span className="al-thumb">
        {book.coverImagePath && showCover && !coverFailed
          ? <Image src={src} alt="" width={40} height={54} sizes="40px" unoptimized={!book.isPublished} loading="lazy" onError={() => setCoverFailed(true)} />
          : <FileText size={18} aria-hidden="true" />}
      </span>
      <span className="al-identity-text">
        <strong>{book.title}</strong>
        <small>{book.author || 'Unknown author'}</small>
      </span>
    </div>
  );
}

function StatusBadge({ published, busy }: { published: boolean; busy: boolean }) {
  if (busy) return <span className="al-badge is-busy"><Loader2 size={13} className="al-spin" aria-hidden="true" />Updating…</span>;
  return published
    ? <span className="al-badge is-published"><Globe2 size={13} aria-hidden="true" />Published</span>
    : <span className="al-badge is-draft"><LockKeyhole size={13} aria-hidden="true" />Unpublished</span>;
}

function SelectAll({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label="Select all books on this page" />;
}

function ActionsMenu({ book, busyIds, acting, onEdit, onToggle, onDelete }: {
  book: LibraryBook; busyIds: Set<string>; acting: boolean;
  onEdit: (book: LibraryBook) => void; onToggle: (book: LibraryBook) => void; onDelete: (book: LibraryBook) => void;
}) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const disabled = acting || busyIds.has(book.id);

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(wrapper.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    items()[0]?.focus();
    const onPointer = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current?.focus(); return; }
      if (event.key === 'Tab') { setOpen(false); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const list = items(); const index = list.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggleMenu() {
    if (!open && button.current) setUpward(button.current.getBoundingClientRect().bottom + 230 > window.innerHeight);
    setOpen((value) => !value);
  }
  const choose = (action: () => void) => { setOpen(false); action(); };

  return (
    <div className="al-menu" ref={wrapper}>
      <button ref={button} type="button" className="al-menu-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={`Actions for ${book.title}`} disabled={disabled} onClick={toggleMenu}>
        {disabled ? <Loader2 size={16} className="al-spin" /> : <MoreHorizontal size={18} />}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={`Actions for ${book.title}`} className={`al-menu-list${upward ? ' is-up' : ''}`}>
          <button type="button" role="menuitem" onClick={() => choose(() => onToggle(book))}>
            {book.isPublished ? <><LockKeyhole size={15} aria-hidden="true" />Unpublish</> : <><Globe2 size={15} aria-hidden="true" />Publish</>}
          </button>
          <button type="button" role="menuitem" onClick={() => choose(() => onEdit(book))}><Pencil size={15} aria-hidden="true" />Edit details</button>
          {book.isPublished
            ? <a role="menuitem" href={`/library/books/${book.id}`} target="_blank" rel="noopener" onClick={() => setOpen(false)}><Eye size={15} aria-hidden="true" />Preview in library</a>
            : <span role="menuitem" aria-disabled="true" className="is-disabled" title="Unpublished books are not visible in the library"><Eye size={15} aria-hidden="true" />Preview (publish first)</span>}
          <span className="al-menu-separator" role="separator" />
          <button type="button" role="menuitem" className="is-danger" onClick={() => choose(() => onDelete(book))}><Trash2 size={15} aria-hidden="true" />Delete…</button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasBooks, filtersActive, onAdd, onClear }: { hasBooks: boolean; filtersActive: boolean; onAdd: () => void; onClear: () => void }) {
  if (!hasBooks) {
    return <div className="al-empty"><BookOpen size={28} aria-hidden="true" /><h2>No books yet</h2><p>Add the first PDF textbook to start the school library.</p><button type="button" className="al-button al-button-primary" onClick={onAdd}><Plus size={16} aria-hidden="true" />Add book</button></div>;
  }
  return <div className="al-empty"><Search size={28} aria-hidden="true" /><h2>No books match</h2><p>Try a different search or remove some filters.</p>{filtersActive && <button type="button" className="al-button al-button-secondary" onClick={onClear}>Clear filters</button>}</div>;
}

/** Accessible modal based on <dialog>: focus is moved in and restored, Esc closes
 *  (unless `preventClose`, e.g. during an upload), background scrolling is locked. */
function Modal({ open, onClose, title, children, size, preventClose = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'small'; preventClose?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus(); // e.g. Cancel in destructive dialogs
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`al-dialog${size === 'small' ? ' is-small' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!preventClose) onClose(); }}
      onClose={() => { if (open) onClose(); }}
      onClick={(event) => { if (event.target === ref.current && !preventClose) onClose(); }}
    >
      {open && (
        <div className="al-dialog-body">
          <div className="al-dialog-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="al-icon-button" aria-label="Close" disabled={preventClose} onClick={onClose}><X size={18} /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
