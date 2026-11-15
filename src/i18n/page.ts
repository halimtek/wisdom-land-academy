// Language helpers for Server Components (pages and layouts under app/[lang]).
// next/root-params cannot be used in Route Handlers or Server Actions; those use
// requestLocale() from ./server instead.
import { lang } from 'next/root-params';
import { DEFAULT_LOCALE, LOCALE_INFO, isLocale, localePath, type Locale } from './locales.mjs';
import { getMessages } from './server';

/** Language of the current page, from the /[lang] segment. */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Messages, language, link helper and Intl locale for the current page. */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, m: await getMessages(locale), path: (href: string) => localePath(locale, href), intl: LOCALE_INFO[locale].intl };
}
