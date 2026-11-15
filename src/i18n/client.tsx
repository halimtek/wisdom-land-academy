'use client';

import { ChevronDown, Globe2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { LOCALES, LOCALE_INFO, localePath, splitLocale, type Locale } from './locales.mjs';
import type { Messages } from './messages/en';

type I18n = { locale: Locale; m: Messages; path: (href: string) => string; intl: string };
const I18nContext = createContext<I18n | null>(null);

/** Provides the current language and its messages to Client Components (set in app/[lang]/layout). */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo<I18n>(() => ({ locale, m: messages, path: (href) => localePath(locale, href), intl: LOCALE_INFO[locale].intl }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

/**
 * Language indicator in the style of the GNOME/Ubuntu top bar: a compact code button
 * ("en ▾") that opens a menu listing every language in its own script, with a dot on
 * the current one. Keyboard: Enter/Space/↓ opens, ↑/↓/Home/End move, Esc closes.
 */
export function LanguageSwitcher({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { locale, m } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function choose(next: Locale) {
    setOpen(false);
    button.current?.focus();
    if (next === locale) return;
    const { rest } = splitLocale(pathname);
    router.push(`${localePath(next, rest)}${window.location.search}${window.location.hash}`);
  }

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(wrapper.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    (items().find((item) => item.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus();
    const onPointer = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current?.focus(); return; }
      if (event.key === 'Tab') { setOpen(false); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const list = items(); const index = list.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={wrapper} className={`lang-menu lang-menu-${tone} ${className}`.trim()}>
      <button ref={button} type="button" className="lang-menu-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-label={`${m.common.chooseLanguage}: ${LOCALE_INFO[locale].name}`} title={m.common.chooseLanguage}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } }}>
        <Globe2 size={15} aria-hidden="true" />
        <span className="lang-menu-code">{locale}</span>
        <ChevronDown size={14} aria-hidden="true" className={open ? 'lang-menu-chevron is-open' : 'lang-menu-chevron'} />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={m.common.language} className="lang-menu-list">
          <p className="lang-menu-heading" aria-hidden="true">{m.common.language}</p>
          {LOCALES.map((code) => (
            <button key={code} type="button" role="menuitemradio" aria-checked={code === locale} className="lang-menu-item" onClick={() => choose(code)}>
              <span className="lang-menu-radio" aria-hidden="true" />
              <span className="lang-menu-name"><bdi lang={code}>{LOCALE_INFO[code].name}</bdi></span>
              <span className="lang-menu-item-code" aria-hidden="true">{code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
