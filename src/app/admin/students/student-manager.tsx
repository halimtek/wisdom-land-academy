'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearReadingPin, createStudent, setReadingPin, type StudentActionState } from '@/app/actions/students';

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
      <div className="form-section-title"><span className="add-icon" aria-hidden="true"><Plus size={18} /></span><div><h2 id="create-student-heading">Create a student account</h2><p>Use a unique username and set a temporary password of at least 12 characters.</p></div></div>
      <form action={action} className="student-create-form" ref={formRef}>
        <label className="form-field">Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} /></label>
        <label className="form-field">Username<input name="username" autoComplete="username" required minLength={3} maxLength={80} pattern="[A-Za-z0-9._-]+" aria-describedby="student-username-hint" /><span className="file-note" id="student-username-hint">Letters, numbers, dots, underscores, and hyphens.</span></label>
        <label className="form-field">Grade<select name="gradeId" required defaultValue="" disabled={!grades.length}><option value="">Choose grade</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
        <label className="form-field">Temporary password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
        <label className="form-field">Confirm temporary password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
        <div className="student-create-footer">
          <p className={state.error ? 'action-feedback error' : 'action-feedback'} role={state.error ? 'alert' : 'status'} aria-live="polite">{state.error ?? state.success ?? 'Share the temporary password with the student through your school-approved channel.'}</p>
          <button className="primary-action" type="submit" disabled={pending || !grades.length}>{pending ? 'Creating account…' : 'Create student account'}</button>
        </div>
        {!grades.length && <p className="inline-warning">Create a grade in <a href="/admin/books">book management</a> before adding students.</p>}
      </form>
    </section>

    <section className="managed-books student-list-section" aria-labelledby="student-list-heading">
      <div className="section-heading"><div><span className="welcome-label">SCHOOL ACCOUNTS</span><h2 id="student-list-heading">Students</h2></div><span className="count-badge">{students.length} {students.length === 1 ? 'student' : 'students'}</span></div>
      {students.length ? <div className="student-admin-list">{students.map((student) => <article className="student-admin-row" key={student.id}><span className="student-avatar" aria-hidden="true">{student.fullName.trim().charAt(0).toUpperCase()}</span><span className="student-admin-name"><strong>{student.fullName}</strong><small>@{student.username}</small></span><span className="student-grade-chip">{student.grade?.name ?? 'No grade assigned'}</span><ReadingPinControl student={student} /></article>)}</div> : <div className="empty-admin"><p>No student accounts yet. Create one above to test the library.</p></div>}
    </section>
  </>;
}

/** Set, change or remove a student's 4-digit reading PIN (used on shared iPads). */
function ReadingPinControl({ student }: { student: StudentRow }) {
  const router = useRouter();
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
          <label className="sr-only" htmlFor={`pin-${student.id}`}>New 4-digit reading PIN for {student.fullName}</label>
          <input id={`pin-${student.id}`} name="pin" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required autoComplete="off" placeholder="4 digits" />
          <button className="secondary-action" disabled={saving}>{saving ? 'Saving…' : 'Save PIN'}</button>
          <button type="button" className="student-pin-cancel" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <>
          <span className={`student-pin-state${student.hasReadingPin ? ' is-set' : ''}`}><KeyRound size={14} aria-hidden="true" />{student.hasReadingPin ? 'Reading PIN set' : 'No reading PIN'}</span>
          <button type="button" className="student-pin-cancel" onClick={() => setEditing(true)}>{student.hasReadingPin ? 'Change PIN' : 'Set PIN'}</button>
          {student.hasReadingPin && <form action={clearAction}><input type="hidden" name="studentId" value={student.id} /><button className="student-pin-cancel" disabled={clearing}>Remove</button></form>}
        </>
      )}
      {message && <span className={setState.error || clearState.error ? 'action-feedback error' : 'action-feedback'} role="status">{message}</span>}
    </div>
  );
}

