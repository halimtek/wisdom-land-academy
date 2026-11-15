'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearReadingPin, createStudent, setReadingPin, type StudentActionState } from '@/app/actions/students';
import { useI18n } from '@/i18n/client';
import { fmt, plural } from '@/i18n/locales.mjs';

type GradeOption = { id: string; name: string };
type StudentRow = {
  id: string;
  username: string;
  fullName: string;
  grade: { name: string } | null;
  hasReadingPin: boolean;
};

export default function StudentManager({ grades, students }: { grades: GradeOption[]; students: StudentRow[] }) {
  const router = useRouter();
  const { m, path } = useI18n();
  const t = m.admin.students;
  const [state, action, pending] = useActionState(createStudent, {} as StudentActionState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state]);

  return <>
    <section className="student-create-panel" aria-labelledby="create-student-heading">
      <div className="form-section-title"><span className="add-icon" aria-hidden="true"><Plus size={18} /></span><div><h2 id="create-student-heading">{t.createTitle}</h2><p>{t.createIntro}</p></div></div>
      <form action={action} className="student-create-form" ref={formRef}>
        <label className="form-field">{t.fullName}<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} /></label>
        <label className="form-field">{t.username}<input name="username" autoComplete="username" required minLength={3} maxLength={80} pattern="[A-Za-z0-9._-]+" aria-describedby="student-username-hint" /><span className="file-note" id="student-username-hint">{t.usernameHint}</span></label>
        <label className="form-field">{t.grade}<select name="gradeId" required defaultValue="" disabled={!grades.length}><option value="">{t.chooseGrade}</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
        <label className="form-field">{t.password}<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
        <label className="form-field">{t.confirmPassword}<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
        <div className="student-create-footer">
          <p className={state.error ? 'action-feedback error' : 'action-feedback'} role={state.error ? 'alert' : 'status'} aria-live="polite">{state.error ?? state.success ?? t.shareHint}</p>
          <button className="primary-action" type="submit" disabled={pending || !grades.length}>{pending ? t.creating : t.create}</button>
        </div>
        {!grades.length && <p className="inline-warning">{t.needGradeBefore} <a href={path('/admin/books')}>{t.needGradeLink}</a> {t.needGradeAfter}</p>}
      </form>
    </section>

    <section className="managed-books student-list-section" aria-labelledby="student-list-heading">
      <div className="section-heading"><div><span className="welcome-label">{t.listEyebrow}</span><h2 id="student-list-heading">{t.listTitle}</h2></div><span className="count-badge">{plural(students.length, t.count)}</span></div>
      {students.length ? <div className="student-admin-list">{students.map((student) => <article className="student-admin-row" key={student.id}><span className="student-avatar" aria-hidden="true">{student.fullName.trim().charAt(0).toUpperCase()}</span><span className="student-admin-name"><strong dir="auto">{student.fullName}</strong><small dir="ltr">@{student.username}</small></span><span className="student-grade-chip">{student.grade?.name ?? t.noGrade}</span><ReadingPinControl student={student} /></article>)}</div> : <div className="empty-admin"><p>{t.empty}</p></div>}
    </section>
  </>;
}

/** Set, change or remove a student's 4-digit reading PIN (used on shared iPads). */
function ReadingPinControl({ student }: { student: StudentRow }) {
  const router = useRouter();
  const { m } = useI18n();
  const t = m.admin.students;
  const [editing, setEditing] = useState(false);
  const [setState, setAction, saving] = useActionState(async (previous: StudentActionState, formData: FormData) => {
    const result = await setReadingPin(previous, formData);
    if (result.success) setEditing(false);
    return result;
  }, {} as StudentActionState);
  const [clearState, clearAction, clearing] = useActionState(clearReadingPin, {} as StudentActionState);
  useEffect(() => { if (setState.success) router.refresh(); }, [setState, router]);
  useEffect(() => { if (clearState.success) router.refresh(); }, [clearState, router]);
  const message = setState.error ?? clearState.error ?? setState.success ?? clearState.success;
  return (
    <div className="student-pin">
      {editing ? (
        <form action={setAction} className="student-pin-form">
          <input type="hidden" name="studentId" value={student.id} />
          <label className="sr-only" htmlFor={`pin-${student.id}`}>{fmt(t.pinFor, { name: student.fullName })}</label>
          <input id={`pin-${student.id}`} name="pin" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required autoComplete="off" placeholder={t.pinPlaceholder} dir="ltr" />
          <button className="secondary-action" disabled={saving}>{saving ? m.common.saving : t.savePin}</button>
          <button type="button" className="student-pin-cancel" onClick={() => setEditing(false)}>{m.common.cancel}</button>
        </form>
      ) : (
        <>
          <span className={`student-pin-state${student.hasReadingPin ? ' is-set' : ''}`}><KeyRound size={14} aria-hidden="true" />{student.hasReadingPin ? t.pinSet : t.noPin}</span>
          <button type="button" className="student-pin-cancel" onClick={() => setEditing(true)}>{student.hasReadingPin ? t.changePin : t.setPin}</button>
          {student.hasReadingPin && <form action={clearAction}><input type="hidden" name="studentId" value={student.id} /><button className="student-pin-cancel" disabled={clearing}>{t.remove}</button></form>}
        </>
      )}
      {message && <span className={setState.error || clearState.error ? 'action-feedback error' : 'action-feedback'} role="status">{message}</span>}
    </div>
  );
}

