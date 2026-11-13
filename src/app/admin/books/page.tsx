import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import BookManager from './book-manager';

export default async function AdminBooksPage() {
  await requireRole('ADMIN');
  const [grades, books] = await Promise.all([
    prisma.grade.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, subjects: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
    }),
    prisma.book.findMany({
      orderBy: [{ subject: { grade: { name: 'asc' } } }, { subject: { name: 'asc' } }, { title: 'asc' }],
      select: {
        id: true, title: true, author: true, description: true, subjectId: true, bookType: true, coverImagePath: true, accessAllStudents: true, isPublished: true,
        subject: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
        allowedGrades: { select: { grade: { select: { id: true, name: true } } } },
        permissions: { select: { id: true } },
        _count: { select: { progress: true } },
      },
    }),
  ]);

  return <>
    <div className="admin-page-heading"><div><span className="welcome-label">LIBRARY ADMINISTRATION</span><h1>Manage Books</h1><p>Organize PDF textbooks, update details, and publish selected titles to the school network.</p></div><span className="count-badge">{books.length} {books.length === 1 ? 'book' : 'books'}</span></div>
    <BookManager grades={grades} books={books} />
  </>;
}
