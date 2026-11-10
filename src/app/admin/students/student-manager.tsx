'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createStudent, type StudentActionState } from '@/app/actions/students';

type GradeOption = { id: string; name: string };
type StudentRow = {
  id: string;
  username: string;
  fullName: string;
  grade: { name: string } | null;
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
      {students.length ? <div className="student-admin-list">{students.map((student) => <article className="student-admin-row" key={student.id}><span className="student-avatar" aria-hidden="true">{student.fullName.trim().charAt(0).toUpperCase()}</span><span className="student-admin-name"><strong>{student.fullName}</strong><small>@{student.username}</small></span><span className="student-grade-chip">{student.grade?.name ?? 'No grade assigned'}</span></article>)}</div> : <div className="empty-admin"><p>No student accounts yet. Create one above to test the library.</p></div>}
    </section>
  </>;
}
