'use client';

import { Globe2, LockKeyhole, Plus, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import { createGrade, createSubject } from '@/app/actions/books';
import type { BookActionState } from '@/app/actions/books';
import { DirectUploadError, prepareDirectUploads, type DirectUploadProgress } from '@/lib/direct-upload';

export type GradeOption = { id: string; name: string; subjects: { id: string; name: string }[] };
export type ManagedBook = {
  id: string; title: string; author: string | null; description: string | null; subjectId: string | null; bookType: 'GRADE_BASED' | 'GENERAL'; coverImagePath: string | null; accessAllStudents: boolean; isPublished: boolean;
  subject: { id: string; name: string; grade: { id: string; name: string } } | null;
  allowedGrades: { grade: { id: string; name: string } }[];
  permissions: { id: string }[];
  _count: { progress: number };
};

export function CatalogSetup({ grades }: { grades: GradeOption[] }) {
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

/**
 * Create/edit form with direct-to-storage upload and real-time progress.
 * `onBusyChange` lets a surrounding dialog block closing during an upload;
 * `onSaved` is called after the server confirmed the save.
 */
export function BookEditor({ grades, book, onBusyChange, onSaved }: { grades: GradeOption[]; book?: ManagedBook; onBusyChange?: (busy: boolean) => void; onSaved?: (message: string) => void }) {
  const router = useRouter();
  const [bookType, setBookType] = useState<'GRADE_BASED' | 'GENERAL'>(book?.bookType ?? 'GRADE_BASED');
  const [gradeId, setGradeId] = useState(book?.subject?.grade.id ?? grades[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState(book?.subjectId ?? '');
  const [accessAllStudents, setAccessAllStudents] = useState(book?.accessAllStudents ?? true);
  const [allowedGradeIds, setAllowedGradeIds] = useState<string[]>(book?.allowedGrades.map((entry) => entry.grade.id) ?? []);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  // Upload progress: `percent` null = waiting (no byte count available).
  const [progress, setProgress] = useState<{ label: string; percent: number | null } | null>(null);
  const submitting = useRef(false); // blocks a second submit (double click, Enter) while one is running
  const subjects = grades.find((grade) => grade.id === gradeId)?.subjects ?? [];
  const selectedSubjectId = subjects.some((subject) => subject.id === subjectId) ? subjectId : '';

  function showUploadProgress(update: DirectUploadProgress) {
    const what = update.kind === 'pdf' ? 'PDF' : 'cover';
    if (update.stage === 'preparing') setProgress({ label: `Preparing ${what} upload…`, percent: null });
    else setProgress({ label: `Uploading ${what}:`, percent: update.percent });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const form = event.currentTarget;
    setPending(true);
    onBusyChange?.(true);
    setFeedback('');
    setFeedbackError(false);
    setProgress({ label: 'Preparing upload…', percent: null });
    try {
      const data = new FormData(form);
      // Supabase storage: PDF and cover go straight to the private bucket first.
      await prepareDirectUploads(data, [{ name: 'file', kind: 'pdf' }, { name: 'cover', kind: 'image' }], showUploadProgress);
      setProgress({ label: 'Saving book details…', percent: null });
      const response = await fetch('/api/admin/books', { method: 'POST', body: data });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) { setProgress(null); setFeedbackError(true); setFeedback(result.error ?? 'The book could not be saved.'); return; }
      setProgress({ label: 'Upload complete.', percent: 100 });
      setFeedback(result.message ?? 'Saved.');
      onSaved?.(result.message ?? 'Saved.');
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
      setProgress(null);
      setFeedbackError(true);
      setFeedback(error instanceof DirectUploadError ? error.message : 'The server could not be reached. Please try again.');
    } finally {
      submitting.current = false;
      setPending(false);
      onBusyChange?.(false);
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
    {progress && <UploadProgress label={progress.label} percent={progress.percent} />}
    <div className="book-form-footer"><p className={feedbackError ? 'action-feedback error' : 'action-feedback'} role={feedbackError ? 'alert' : 'status'} aria-live="polite">{feedback}</p><button className="primary-action" disabled={pending || (bookType === 'GRADE_BASED' && (!grades.length || !subjects.length))}><Upload size={16} />{pending ? 'Saving…' : book ? 'Save book' : 'Upload book'}</button></div>
    {bookType === 'GRADE_BASED' && (!grades.length ? <p className="inline-warning">Create a grade and its subjects in the Grades and subjects section above to enable book uploads.</p> : gradeId && !subjects.length ? <p className="inline-warning">This grade has no subjects yet. Add one in the Grades and subjects section above.</p> : null)}
  </form>;
}

/** Progress bar + status text. Only the stage text is announced to screen readers
 *  (not every percent change); the bar exposes its value through progressbar ARIA. */
function UploadProgress({ label, percent }: { label: string; percent: number | null }) {
  const known = percent !== null;
  return (
    <div className="upload-progress">
      <div className="upload-progress-text">
        <span role="status" aria-live="polite">{label}</span>
        {known && <span className="upload-progress-percent" aria-hidden="true">{percent}%</span>}
      </div>
      <div
        className={known ? 'upload-progress-track' : 'upload-progress-track is-waiting'}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? percent : undefined}
        aria-valuetext={known ? `${percent}%` : 'In progress'}
      >
        <span className="upload-progress-bar" style={known ? { width: `${percent}%` } : undefined} />
      </div>
    </div>
  );
}
