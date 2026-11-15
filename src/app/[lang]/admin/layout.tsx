import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { getI18n } from '@/i18n/page';
import { requireRole } from '@/lib/auth';
import AdminShell from './admin-shell';
import './admin.css';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { m } = await getI18n();
  return <Suspense fallback={<div className="admin-auth-loading" role="status">{m.admin.checking}</div>}><AuthenticatedAdminShell>{children}</AuthenticatedAdminShell></Suspense>;
}

async function AuthenticatedAdminShell({ children }: { children: ReactNode }) {
  const admin = await requireRole('ADMIN');
  return <AdminShell fullName={admin.fullName}>{children}</AdminShell>;
}
