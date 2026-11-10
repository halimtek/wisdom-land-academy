'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const navigation = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About Us' },
  { href: '/academics', label: 'Academics' },
  { href: '/activities', label: 'Activities' },
  { href: '/students', label: 'Students' },
  { href: '/staff', label: 'Our Staff' },
  { href: '/news', label: 'News & Announcements' },
  { href: '/library', label: 'Digital Library' },
  { href: '/contact', label: 'Contact Us' },
];

export function SchoolNavigation({
  logoImagePath,
  logoImageAlt,
}: {
  logoImagePath: string | null;
  logoImageAlt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function close() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    function handleResize() {
      if (window.innerWidth > 1100) close();
    }

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="school-header">
      <div className="school-header-inner">
        <Link
          href="/"
          className="school-brand"
          onClick={close}
          aria-label="Wisdom Land Academy home"
        >
          <Image
            src={logoImagePath ? '/api/site-media/logo' : '/images/wla-emblem.png'}
            alt={logoImageAlt || 'Wisdom Land Academy'}
            width={58}
            height={58}
            unoptimized={Boolean(logoImagePath)}
            priority
          />

          <span className="school-brand-name">
            WISDOM LAND <b>ACADEMY</b>
            <small>GRADES 1–8</small>
          </span>
        </Link>

        <button
          className="school-menu-toggle"
          type="button"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
          aria-controls="school-main-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? (
            <X size={24} aria-hidden="true" />
          ) : (
            <Menu size={24} aria-hidden="true" />
          )}
        </button>

        <nav
          id="school-main-navigation"
          className={`school-main-navigation${open ? ' school-navigation-open' : ''}`}
          aria-label="Main navigation"
        >
          {navigation.map(({ href, label }) => {
            const active =
              href === '/'
                ? pathname === '/'
                : pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                className={active ? 'school-nav-link active' : 'school-nav-link'}
                aria-current={active ? 'page' : undefined}
                onClick={close}
              >
                {label}
              </Link>
            );
          })}

          <Link
            className="school-admin-login"
            href="/login?mode=ADMIN"
            onClick={close}
          >
            Admin Login ↗
          </Link>
        </nav>
      </div>

      {open && (
        <button
          type="button"
          className="school-nav-backdrop"
          aria-label="Close navigation menu"
          aria-hidden="true"
          onClick={close}
        />
      )}
    </header>
  );
}
