'use client';

import { BookOpen, LayoutDashboard, LogOut, Newspaper, Settings } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { logout } from '@/app/actions/auth';

const links = [
  { href: '/admin/books', label: 'Manage Books', Icon: BookOpen },
  { href: '/admin', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/admin/content', label: 'Website Content', Icon: Newspaper },
  { href: '/admin/settings', label: 'Settings', Icon: Settings },
];

export default function AdminShell({ children, fullName }: { children: ReactNode; fullName: string }) {
  const pathname = usePathname();

  return <div className="admin-app-shell">
    <aside className="admin-sidebar">
      <Link href="/admin" className="admin-brand"><Image src="/images/wla-emblem.png" alt="" width={48} height={48} /><span>WISDOM LAND <b>ACADEMY</b></span></Link>
      <div className="admin-nav-label">ADMINISTRATION</div>
      <nav className="admin-navigation" aria-label="Administrator navigation">
        {links.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return <Link href={href} className={`admin-nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} key={href}><Icon size={18} /><span>{label}</span></Link>;
        })}
        <form action={logout} className="admin-logout-form"><button className="admin-nav-link" type="submit"><LogOut size={18} /><span>Logout</span></button></form>
      </nav>
      <div className="admin-sidebar-footer"><span className="admin-user-dot" />Signed in as <strong>{fullName}</strong></div>
    </aside>
    <div className="admin-main-area">
      <header className="admin-topbar"><span>Wisdom Land Academy</span><span className="admin-topbar-user">{fullName}<b>Administrator</b></span></header>
      <main className="admin-page-content">{children}</main>
    </div>
  </div>;
}
