import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import StudentManager from './student-manager';

export const instant = false;

export default async function AdminStudentsPage() {
  await requireRole('ADMIN');
  const [grades, students] = await Promise.all([
    prisma.grade.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { role: 'STUDENT' },
      orderBy: [{ grade: { name: 'asc' } }, { fullName: 'asc' }],
      select: { id: true, username: true, fullName: true, grade: { select: { name: true } } },
    }),
  ]);

  return <>
    <div className="admin-page-heading"><div><span className="welcome-label">SCHOOL ADMINISTRATION</span><h1>Manage Students</h1><p>Create school accounts and assign each student to a grade.</p></div><span className="count-badge">{students.length} {students.length === 1 ? 'student' : 'students'}</span></div>
    <StudentManager grades={grades} students={students} />
  </>;
}
