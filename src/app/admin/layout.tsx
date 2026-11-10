import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { requireRole } from '@/lib/auth';
import AdminShell from './admin-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="admin-auth-loading" role="status">Checking administrator access…</div>}><AuthenticatedAdminShell>{children}</AuthenticatedAdminShell></Suspense>;
}

async function AuthenticatedAdminShell({ children }: { children: ReactNode }) {
  const admin = await requireRole('ADMIN');
  return <AdminShell fullName={admin.fullName}>{children}</AdminShell>;
}
