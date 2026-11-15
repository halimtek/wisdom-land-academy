'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LanguageSwitcher, useI18n } from '@/i18n/client';
import { splitLocale } from '@/i18n/locales.mjs';
import type { Messages } from '@/i18n/messages/en';

const navigation: { href: string; label: keyof Messages['nav'] }[] = [
  { href: '/', label: 'home' },
  { href: '/about', label: 'about' },
  { href: '/academics', label: 'academics' },
  { href: '/activities', label: 'activities' },
  { href: '/students', label: 'students' },
  { href: '/staff', label: 'staff' },
  { href: '/news', label: 'news' },
  { href: '/library', label: 'library' },
  { href: '/contact', label: 'contact' },
];

// Must match the breakpoint in globals.css ("WLA school header & navigation").
const DESKTOP_QUERY = '(min-width: 1101px)';

export function SchoolNavigation({
  logoImagePath,
  logoImageAlt,
}: {
  logoImagePath: string | null;
  logoImageAlt: string | null;
}) {
  const pathname = usePathname();
  const { m, path } = useI18n();
  const current = splitLocale(pathname).rest; // the page without its /en, /am… prefix
  // The menu is "open for" a specific route, so it closes automatically after
  // any navigation (link tap, back/forward) without an extra effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpenFor(null);
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpenFor(null);
      toggleRef.current?.focus();
    }

    // Switching to the desktop layout (rotation, window resize) closes the panel.
    const desktop = window.matchMedia(DESKTOP_QUERY);
    function handleBreakpoint(event: MediaQueryListEvent) {
      if (event.matches) setOpenFor(null);
    }

    // Lock background scrolling. iOS Safari needs the lock on <html> as well as <body>.
    const root = document.documentElement;
    const previousRoot = root.style.overflow;
    const previousBody = document.body.style.overflow;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', handleKeyDown);
    desktop.addEventListener('change', handleBreakpoint);

    return () => {
      root.style.overflow = previousRoot;
      document.body.style.overflow = previousBody;
      document.removeEventListener('keydown', handleKeyDown);
      desktop.removeEventListener('change', handleBreakpoint);
    };
  }, [open]);

  // Keyboard users tabbing out of the open menu close it instead of
  // continuing behind the backdrop.
  function handleBlur(event: React.FocusEvent<HTMLElement>) {
    if (!open) return;
    const next = event.relatedTarget as Node | null;
    if (next && !headerRef.current?.contains(next)) close();
  }

  return (
    <>
      <header
        ref={headerRef}
        className={`school-header${open ? ' school-header-menu-open' : ''}`}
        onBlur={handleBlur}
      >
        <div className="school-header-inner">
          <Link
            href={path('/')}
            className="school-brand"
            onClick={close}
            aria-label={m.nav.homeLabel}
          >
            <Image
              src={logoImagePath ? '/api/site-media/logo' : '/images/wla-emblem.png'}
              alt={logoImageAlt || m.common.schoolName}
              width={58}
              height={58}
              unoptimized={Boolean(logoImagePath)}
              priority
            />

            <span className="school-brand-name">
              {/* The brand stays in Latin letters and left-to-right in every language. */}
              <span className="school-brand-words" dir="ltr">{m.common.brandFirst} <b>{m.common.brandSecond}</b></span>
              <small>{m.common.gradesUpper}</small>
            </span>
          </Link>

          <LanguageSwitcher className="school-lang-switch" />

          <button
            ref={toggleRef}
            className="school-menu-toggle"
            type="button"
            aria-label={open ? m.nav.closeMenu : m.nav.openMenu}
            aria-expanded={open}
            aria-controls="school-main-navigation"
            onClick={() => setOpenFor(open ? null : pathname)}
          >
            {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
          </button>

          <nav
            id="school-main-navigation"
            className={`school-main-navigation${open ? ' school-navigation-open' : ''}`}
            aria-label={m.nav.mainNavigation}
          >
            {navigation.map(({ href, label }) => {
              const active =
                href === '/'
                  ? current === '/'
                  : current === href || current.startsWith(`${href}/`);

              return (
                <Link
                  key={href}
                  href={path(href)}
                  className={active ? 'school-nav-link active' : 'school-nav-link'}
                  aria-current={active ? 'page' : undefined}
                  onClick={close}
                >
                  {m.nav[label]}
                </Link>
              );
            })}

            <Link className="school-admin-login" href={path('/login?mode=ADMIN')} onClick={close}>
              {m.nav.adminLogin} <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Rendered outside <header>: the header's backdrop-filter would otherwise
          trap this fixed overlay inside the header box. Purely presentational;
          Escape and the toggle button provide the keyboard equivalents. */}
      {open && <div className="school-nav-backdrop" aria-hidden="true" onClick={close} />}
    </>
  );
}
