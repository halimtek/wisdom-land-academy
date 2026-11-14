'use client';

import { FileText, Globe2, LockKeyhole, Plus, Trash2, Upload, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, type FormEvent } from 'react';
import { createGrade, createSubject, deleteBook } from '@/app/actions/books';
import type { BookActionState } from '@/app/actions/books';
import { DirectUploadError, prepareDirectUploads } from '@/lib/direct-upload';

type GradeOption = { id: string; name: string; subjects: { id: string; name: string }[] };
type ManagedBook = {
  id: string; title: string; author: string | null; description: string | null; subjectId: string | null; bookType: 'GRADE_BASED' | 'GENERAL'; coverImagePath: string | null; accessAllStudents: boolean; isPublished: boolean;
  subject: { id: string; name: string; grade: { id: string; name: string } } | null;
  allowedGrades: { grade: { id: string; name: string } }[];
  permissions: { id: string }[];
  _count: { progress: number };
};

export default function BookManager({ grades, books }: { grades: GradeOption[]; books: ManagedBook[] }) {
  return <>
    <CatalogSetup grades={grades} />
    <BookEditor grades={grades} />
    <section className="managed-books">
      <div className="section-heading"><div><span className="welcome-label">CURRENT COLLECTION</span><h2>Books in the library</h2></div></div>
      {books.length ? <div className="book-admin-list">{books.map((book) => <BookCard key={book.id} book={book} grades={grades} />)}</div> : <div className="empty-admin"><FileText size={26} /><p>No books yet. Add the first PDF textbook above.</p></div>}
    </section>
  </>;
}

function CatalogSetup({ grades }: { grades: GradeOption[] }) {
  const router = useRouter();
  const [gradeState, gradeAction, addingGrade] = useActionState(createGrade, {} as BookActionState);
  const [subjectState, subjectAction, addingSubject] = useActionState(createSubject, {} as BookActionState);
  useEffect(() => {
    if (gradeState.success) router.refresh();
  }, [gradeState, router]);
  useEffect(() => {
    if (subjectState.success) router.refresh();
  }, [router, subjectState]);

  return <section className="catalog-setup" aria-labelledby="catalog-setup-title">
    <div className="catalog-setup-heading"><div><span className="welcome-label">SCHOOL STRUCTURE</span><h2 id="catalog-setup-title">Grades and subjects</h2><p>Set up the school catalog before assigning books.</p></div><span className="count-badge">{grades.length} {grades.length === 1 ? 'grade' : 'grades'}</span></div>
    {!grades.length && <p className="catalog-empty-note">No grades are set up yet. Add a grade below, then add its subjects before uploading textbooks.</p>}
    <div className="catalog-setup-forms">
      <form action={gradeAction} className="catalog-form"><label className="form-field">Add grade<input name="name" required minLength={1} maxLength={80} placeholder="e.g. Grade 1" /></label><button className="secondary-action" disabled={addingGrade}>{addingGrade ? 'Adding…' : 'Add grade'}</button><ActionFeedback state={gradeState} /></form>
      <form action={subjectAction} className="catalog-form"><label className="form-field">Grade<select name="gradeId" required disabled={!grades.length} defaultValue=""><option value="">Choose grade</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label><label className="form-field">Add subject<input name="name" required minLength={1} maxLength={100} placeholder="e.g. Mathematics" /></label><button className="secondary-action" disabled={addingSubject || !grades.length}>{addingSubject ? 'Adding…' : 'Add subject'}</button><ActionFeedback state={subjectState} /></form>
    </div>
  </section>;
}

function ActionFeedback({ state }: { state: BookActionState }) {
  if (!state.error && !state.success) return null;
  return <p className={state.error ? 'action-feedback error' : 'action-feedback'} role={state.error ? 'alert' : 'status'} aria-live="polite">{state.error ?? state.success}</p>;
}

function BookEditor({ grades, book }: { grades: GradeOption[]; book?: ManagedBook }) {
  const router = useRouter();
  const [bookType, setBookType] = useState<'GRADE_BASED' | 'GENERAL'>(book?.bookType ?? 'GRADE_BASED');
  const [gradeId, setGradeId] = useState(book?.subject?.grade.id ?? grades[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState(book?.subjectId ?? '');
  const [accessAllStudents, setAccessAllStudents] = useState(book?.accessAllStudents ?? true);
  const [allowedGradeIds, setAllowedGradeIds] = useState<string[]>(book?.allowedGrades.map((entry) => entry.grade.id) ?? []);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const subjects = grades.find((grade) => grade.id === gradeId)?.subjects ?? [];
  const selectedSubjectId = subjects.some((subject) => subject.id === subjectId) ? subjectId : '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setFeedback('');
    setFeedbackError(false);
    try {
      const data = new FormData(form);
      // Supabase storage: PDF and cover go straight to the private bucket first.
      await prepareDirectUploads(data, [{ name: 'file', kind: 'pdf' }, { name: 'cover', kind: 'image' }]);
      const response = await fetch('/api/admin/books', { method: 'POST', body: data });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) { setFeedbackError(true); setFeedback(result.error ?? 'The book could not be saved.'); return; }
      setFeedback(result.message ?? 'Saved.');
      if (!book) {
        form.reset();
        setBookType('GRADE_BASED');
        setGradeId('');
        setSubjectId('');
        setAccessAllStudents(true);
        setAllowedGradeIds([]);
      }
      router.refresh();
    } catch (error) {
      setFeedbackError(true);
      setFeedback(error instanceof DirectUploadError ? error.message : 'The server could not be reached. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return <form className={book ? 'book-edit-form' : 'book-create-form'} onSubmit={submit}>
    {!book && <div className="form-section-title"><span className="add-icon"><Plus size={18} /></span><div><h2>Add a textbook</h2><p>Upload a PDF and place it in the right grade and subject.</p></div></div>}
    {book && <input type="hidden" name="bookId" value={book.id} />}
    <div className="book-form-grid">
      <label className="form-field">Book type<select name="bookType" value={bookType} onChange={(event) => setBookType(event.target.value as 'GRADE_BASED' | 'GENERAL')}><option value="GRADE_BASED">Grade-Based Book</option><option value="GENERAL">General Library Book</option></select></label>
      <label className="form-field">Book title<input name="title" required minLength={2} maxLength={180} defaultValue={book?.title} placeholder="e.g. English Student Book" /></label>
      <label className="form-field">Author <span className="field-optional">Optional</span><input name="author" maxLength={120} defaultValue={book?.author ?? ''} placeholder="Author name" /></label>
      {bookType === 'GRADE_BASED' && <>
        <label className="form-field">Grade<select name="gradeId" value={gradeId} onChange={(event) => { setGradeId(event.target.value); setSubjectId(''); }} required disabled={!grades.length}><option value="">Choose grade</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
        <label className="form-field">Subject<select name="subjectId" value={selectedSubjectId} onChange={(event) => setSubjectId(event.target.value)} required disabled={!subjects.length}><option value="">{subjects.length ? 'Choose subject' : gradeId ? 'No subjects for this grade' : 'Choose a grade first'}</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      </>}
      {bookType === 'GENERAL' && <>
        <input type="hidden" name="gradeId" value="" />
        <input type="hidden" name="subjectId" value="" />
        <label className="form-field form-field-wide">Access<label className="consent-check"><input type="checkbox" name="accessAllStudents" checked={accessAllStudents} onChange={(event) => setAccessAllStudents(event.target.checked)} /><span>All students</span></label></label>
        {!accessAllStudents && <label className="form-field form-field-wide">Allowed grades<select name="allowedGradeIds" multiple value={allowedGradeIds} onChange={(event) => setAllowedGradeIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>}
      </>}
      <label className="form-field form-field-wide">Description <span className="field-optional">Optional</span><textarea name="description" rows={2} maxLength={3000} defaultValue={book?.description ?? ''} placeholder="A short description for students" /></label>
      <label className="form-field form-field-wide file-picker">{book ? 'Replace PDF' : 'PDF textbook'}{book && <span className="field-optional">Optional</span>}<input name="file" type="file" accept="application/pdf,.pdf" required={!book} /><span className="file-note">PDF only · 50 MB maximum. The file is stored privately.</span></label>
      <label className="form-field form-field-wide file-picker">Cover image <span className="field-optional">Optional</span><input name="cover" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">Optional cover image for the library catalog.</span></label>
    </div>
    <div className="publish-control"><label><input type="checkbox" name="isPublished" defaultChecked={book?.isPublished ?? false} /><span><strong>Publish to school library</strong><small>Anyone on the school network can read a published book. Draft books are unavailable to all readers.</small></span></label><span className={book?.isPublished ? 'publish-state published' : 'publish-state'}>{book?.isPublished ? <><Globe2 size={14} />Published</> : <><LockKeyhole size={14} />Draft</>}</span></div>
    <div className="book-form-footer"><p className={feedbackError ? 'action-feedback error' : 'action-feedback'} role={feedbackError ? 'alert' : 'status'} aria-live="polite">{feedback}</p><button className="primary-action" disabled={pending || (bookType === 'GRADE_BASED' && (!grades.length || !subjects.length))}><Upload size={16} />{pending ? 'Saving…' : book ? 'Save book' : 'Upload book'}</button></div>
    {bookType === 'GRADE_BASED' && (!grades.length ? <p className="inline-warning">Create a grade and its subjects in the Grades and subjects section above to enable book uploads.</p> : gradeId && !subjects.length ? <p className="inline-warning">This grade has no subjects yet. Add one in the Grades and subjects section above.</p> : null)}
  </form>;
}

function BookCard({ book, grades }: { book: ManagedBook; grades: GradeOption[] }) {
  const router = useRouter();
  const [deleteState, deleteAction, deleting] = useActionState(deleteBook, {} as BookActionState);
  useEffect(() => {
    if (deleteState.success) router.refresh();
  }, [deleteState, router]);

  return <article className="book-admin-card">
    <details>
      <summary className="book-card-summary"><span className="book-card-icon"><FileText size={19} /></span><span className="book-card-copy"><strong>{book.title}</strong><small>{book.bookType === 'GENERAL' ? 'General Library' : `${book.subject?.grade.name ?? ''} · ${book.subject?.name ?? ''}`}</small></span><span className={`book-publication-pill${book.isPublished ? ' published' : ''}`}>{book.isPublished ? <Globe2 size={13} /> : <LockKeyhole size={13} />}{book.isPublished ? 'Public' : 'Draft'}</span><span className="book-access-count" title="Preserved individual permission records"><Users size={14} />{book.permissions.length}</span><span className="edit-label">Edit</span></summary>
      <div className="book-card-expanded"><BookEditor key={book.id} grades={grades} book={book} /></div>
    </details>
    <div className="permission-section"><div className="permission-heading"><Users size={16} /><div><strong>Individual student grants</strong><span>{book.permissions.length} existing grant {book.permissions.length === 1 ? 'record is' : 'records are'} preserved. Publication controls library access now.</span></div></div>
      <p className="legacy-permission-note">Published books are available to everyone on the LAN. Draft books are unavailable to everyone, even when an older student grant exists.</p>
      {book._count.progress > 0 && <p className="progress-note">{book._count.progress} saved reading {book._count.progress === 1 ? 'record' : 'records'} · deletion is disabled to preserve progress.</p>}
    </div>
    <div className="delete-area"><form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Delete “${book.title}”?`)) event.preventDefault(); }}><input type="hidden" name="bookId" value={book.id} /><button className="delete-action" disabled={deleting || book._count.progress > 0}><Trash2 size={15} />{deleting ? 'Deleting…' : 'Delete book'}</button><span className="action-feedback" role="status">{deleteState.error ?? deleteState.success}</span></form></div>
  </article>;
}

