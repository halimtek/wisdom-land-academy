import { ArrowUpRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';

export const instant = false;

export default async function AdminDashboardPage() {
  await requireRole('ADMIN');

  return <>
    <div className="admin-page-heading"><div><span className="welcome-label">SCHOOL LIBRARY</span><h1>Dashboard</h1><p>Manage the Wisdom Land Academy book collection.</p></div></div>
    <section className="dashboard-shortcuts" aria-labelledby="dashboard-shortcuts-title">
      <div className="section-heading"><div><span className="welcome-label">LIBRARY MANAGEMENT</span><h2 id="dashboard-shortcuts-title">Manage Books</h2></div></div>
      <div className="dashboard-shortcut-grid">
        <Link href="/admin/books" className="dashboard-shortcut"><span className="dashboard-shortcut-icon"><BookOpen size={20} /></span><span><strong>Open book management</strong><small>Upload and organize PDFs, manage publication, and configure grades and subjects.</small></span><ArrowUpRight size={18} /></Link>
      </div>
    </section>
  </>;
}
