'use client';

import { Globe2, LockKeyhole, Plus, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import { createGrade, createSubject } from '@/app/actions/books';
import type { BookActionState } from '@/app/actions/books';
import { DirectUploadError, prepareDirectUploads, type DirectUploadProgress } from '@/lib/direct-upload';
import { useI18n } from '@/i18n/client';
import { plural } from '@/i18n/locales.mjs';

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
  const { m } = useI18n();
  const t = m.admin.catalog;
  const [gradeState, gradeAction, addingGrade] = useActionState(createGrade, {} as BookActionState);
  const [subjectState, subjectAction, addingSubject] = useActionState(createSubject, {} as BookActionState);
  useEffect(() => {
    if (gradeState.success) router.refresh();
  }, [gradeState, router]);
  useEffect(() => {
    if (subjectState.success) router.refresh();
  }, [router, subjectState]);

  return <section className="catalog-setup" aria-labelledby="catalog-setup-title">
    <div className="catalog-setup-heading"><div><span className="welcome-label">{t.eyebrow}</span><h2 id="catalog-setup-title">{m.admin.books.catalogTitle}</h2><p>{t.intro}</p></div><span className="count-badge">{plural(grades.length, t.gradeCount)}</span></div>
    {!grades.length && <p className="catalog-empty-note">{t.empty}</p>}
    <div className="catalog-setup-forms">
      <form action={gradeAction} className="catalog-form"><label className="form-field">{t.addGrade}<input name="name" required minLength={1} maxLength={80} placeholder={t.gradePlaceholder} /></label><button className="secondary-action" disabled={addingGrade}>{addingGrade ? t.adding : t.addGrade}</button><ActionFeedback state={gradeState} /></form>
      <form action={subjectAction} className="catalog-form"><label className="form-field">{t.grade}<select name="gradeId" required disabled={!grades.length} defaultValue=""><option value="">{t.chooseGrade}</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label><label className="form-field">{t.addSubject}<input name="name" required minLength={1} maxLength={100} placeholder={t.subjectPlaceholder} /></label><button className="secondary-action" disabled={addingSubject || !grades.length}>{addingSubject ? t.adding : t.addSubject}</button><ActionFeedback state={subjectState} /></form>
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
  const { m } = useI18n();
  const t = m.admin.editor;
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
    const pdf = update.kind === 'pdf';
    if (update.stage === 'preparing') setProgress({ label: pdf ? t.preparingPdf : t.preparingCover, percent: null });
    else setProgress({ label: pdf ? t.uploadingPdf : t.uploadingCover, percent: update.percent });
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
    setProgress({ label: t.preparing, percent: null });
    try {
      const data = new FormData(form);
      // Supabase storage: PDF and cover go straight to the private bucket first.
      await prepareDirectUploads(data, [{ name: 'file', kind: 'pdf' }, { name: 'cover', kind: 'image' }], showUploadProgress);
      setProgress({ label: t.savingDetails, percent: null });
      const response = await fetch('/api/admin/books', { method: 'POST', body: data });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) { setProgress(null); setFeedbackError(true); setFeedback(result.error ?? t.notSaved); return; }
      setProgress({ label: t.complete, percent: 100 });
      setFeedback(result.message ?? t.saved);
      onSaved?.(result.message ?? t.saved);
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
      setFeedback(error instanceof DirectUploadError ? error.describe(m) : t.unreachable);
    } finally {
      submitting.current = false;
      setPending(false);
      onBusyChange?.(false);
    }
  }

  return <form className={book ? 'book-edit-form' : 'book-create-form'} onSubmit={submit}>
    {!book && <div className="form-section-title"><span className="add-icon"><Plus size={18} /></span><div><h2>{t.addTitle}</h2><p>{t.addIntro}</p></div></div>}
    {book && <input type="hidden" name="bookId" value={book.id} />}
    <div className="book-form-grid">
      <label className="form-field">{t.bookType}<select name="bookType" value={bookType} onChange={(event) => setBookType(event.target.value as 'GRADE_BASED' | 'GENERAL')}><option value="GRADE_BASED">{t.gradeBook}</option><option value="GENERAL">{t.generalBook}</option></select></label>
      <label className="form-field">{t.title}<input name="title" required minLength={2} maxLength={180} defaultValue={book?.title} placeholder={t.titlePlaceholder} /></label>
      <label className="form-field">{t.author} <span className="field-optional">{m.common.optional}</span><input name="author" maxLength={120} defaultValue={book?.author ?? ''} placeholder={t.authorPlaceholder} /></label>
      {bookType === 'GRADE_BASED' && <>
        <label className="form-field">{t.grade}<select name="gradeId" value={gradeId} onChange={(event) => { setGradeId(event.target.value); setSubjectId(''); }} required disabled={!grades.length}><option value="">{t.chooseGrade}</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
        <label className="form-field">{t.subject}<select name="subjectId" value={selectedSubjectId} onChange={(event) => setSubjectId(event.target.value)} required disabled={!subjects.length}><option value="">{subjects.length ? t.chooseSubject : gradeId ? t.noSubjects : t.gradeFirst}</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      </>}
      {bookType === 'GENERAL' && <>
        <input type="hidden" name="gradeId" value="" />
        <input type="hidden" name="subjectId" value="" />
        <label className="form-field form-field-wide">{t.access}<label className="consent-check"><input type="checkbox" name="accessAllStudents" checked={accessAllStudents} onChange={(event) => setAccessAllStudents(event.target.checked)} /><span>{t.allStudents}</span></label></label>
        {!accessAllStudents && <label className="form-field form-field-wide">{t.allowedGrades}<select name="allowedGradeIds" multiple value={allowedGradeIds} onChange={(event) => setAllowedGradeIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>}
      </>}
      <label className="form-field form-field-wide">{t.description} <span className="field-optional">{m.common.optional}</span><textarea name="description" rows={2} maxLength={3000} defaultValue={book?.description ?? ''} placeholder={t.descriptionPlaceholder} /></label>
      <label className="form-field form-field-wide file-picker">{book ? t.replacePdf : t.pdf}{book && <span className="field-optional">{m.common.optional}</span>}<input name="file" type="file" accept="application/pdf,.pdf" required={!book} /><span className="file-note">{t.pdfNote}</span></label>
      <label className="form-field form-field-wide file-picker">{t.cover} <span className="field-optional">{m.common.optional}</span><input name="cover" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" /><span className="file-note">{t.coverNote}</span></label>
    </div>
    <div className="publish-control"><label><input type="checkbox" name="isPublished" defaultChecked={book?.isPublished ?? false} /><span><strong>{t.publishLabel}</strong><small>{t.publishHint}</small></span></label><span className={book?.isPublished ? 'publish-state published' : 'publish-state'}>{book?.isPublished ? <><Globe2 size={14} />{m.admin.published}</> : <><LockKeyhole size={14} />{m.admin.draft}</>}</span></div>
    {progress && <UploadProgress label={progress.label} percent={progress.percent} />}
    <div className="book-form-footer"><p className={feedbackError ? 'action-feedback error' : 'action-feedback'} role={feedbackError ? 'alert' : 'status'} aria-live="polite">{feedback}</p><button className="primary-action" disabled={pending || (bookType === 'GRADE_BASED' && (!grades.length || !subjects.length))}><Upload size={16} />{pending ? m.common.saving : book ? t.saveBook : t.uploadBook}</button></div>
    {bookType === 'GRADE_BASED' && (!grades.length ? <p className="inline-warning">{t.noGradesWarning}</p> : gradeId && !subjects.length ? <p className="inline-warning">{t.noSubjectsWarning}</p> : null)}
  </form>;
}

/** Progress bar + status text. Only the stage text is announced to screen readers
 *  (not every percent change); the bar exposes its value through progressbar ARIA. */
function UploadProgress({ label, percent }: { label: string; percent: number | null }) {
  const { m } = useI18n();
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
        aria-valuetext={known ? `${percent}%` : m.admin.editor.inProgress}
      >
        <span className="upload-progress-bar" style={known ? { width: `${percent}%` } : undefined} />
      </div>
    </div>
  );
}
