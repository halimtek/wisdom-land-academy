'use client';

import { BookOpen, GraduationCap, LayoutDashboard, LogOut, Newspaper, Settings } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { logout } from '@/app/actions/auth';
import { LanguageSwitcher, useI18n } from '@/i18n/client';
import { splitLocale } from '@/i18n/locales.mjs';

const links = [
  { href: '/admin', label: 'dashboard', Icon: LayoutDashboard },
  { href: '/admin/books', label: 'manageBooks', Icon: BookOpen },
  { href: '/admin/students', label: 'studentsLabel', Icon: GraduationCap },
  { href: '/admin/content', label: 'websiteContent', Icon: Newspaper },
  { href: '/admin/settings', label: 'settingsLabel', Icon: Settings },
] as const;

// The dashboard is active only on /admin itself; other sections also on their sub-pages.
const isActive = (pathname: string, href: string) => (href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

export default function AdminShell({ children, fullName }: { children: ReactNode; fullName: string }) {
  const { m, path } = useI18n();
  const pathname = splitLocale(usePathname()).rest;

  return <div className="admin-app-shell">
    <aside className="admin-sidebar">
      <Link href={path('/admin')} className="admin-brand"><Image src="/images/wla-emblem.png" alt="" width={48} height={48} /><span>{m.common.brandFirst} <b>{m.common.brandSecond}</b></span></Link>
      <div className="admin-nav-label">{m.admin.administration}</div>
      <nav className="admin-navigation" aria-label={m.admin.navLabel}>
        {links.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return <Link href={path(href)} className={`admin-nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} key={href}><Icon size={18} aria-hidden="true" /><span>{m.admin[label]}</span></Link>;
        })}
        <form action={logout} className="admin-logout-form"><button className="admin-nav-link" type="submit"><LogOut size={18} className="flip-rtl" /><span>{m.admin.logout}</span></button></form>
      </nav>
      <div className="admin-sidebar-footer"><span className="admin-user-dot" />{m.admin.signedInAs} <strong>{fullName}</strong></div>
    </aside>
    <div className="admin-main-area">
      <header className="admin-topbar"><span>{m.common.schoolName}</span><span className="admin-topbar-end"><LanguageSwitcher tone="dark" /><span className="admin-topbar-user">{fullName}<b>{m.admin.administrator}</b></span></span></header>
      <main className="admin-page-content">{children}</main>
    </div>
  </div>;
}
