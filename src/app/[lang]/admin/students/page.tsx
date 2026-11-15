import { requireRole } from '@/lib/auth';
import { plural } from '@/i18n/locales.mjs';
import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import StudentManager from './student-manager';

export default async function AdminStudentsPage() {
  await requireRole('ADMIN');
  const { m } = await getI18n();
  const t = m.admin.students;
  const [grades, students] = await Promise.all([
    prisma.grade.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { role: 'STUDENT' },
      orderBy: [{ grade: { name: 'asc' } }, { fullName: 'asc' }],
      select: { id: true, username: true, fullName: true, readingPinHash: true, grade: { select: { name: true } } },
    }),
  ]);

  return <>
    <div className="admin-page-heading"><div><span className="welcome-label">{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></div><span className="count-badge">{plural(students.length, t.count)}</span></div>
    <StudentManager grades={grades} students={students.map(({ readingPinHash, ...student }) => ({ ...student, hasReadingPin: Boolean(readingPinHash) }))} />
  </>;
}
