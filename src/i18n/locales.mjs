// Languages of the WLA website and library. Plain JS (no Next.js imports) so the
// proxy, server, client and unit tests can all share it.

export const LOCALES = /** @type {const} */ (['en', 'am', 'om', 'ar']);
export const DEFAULT_LOCALE = 'en';
/** Remembers the last language a visitor used (set by the proxy). Not a secret. */
export const LOCALE_COOKIE = 'wla_lang';

export const LOCALE_INFO = {
  en: { name: 'English', short: 'EN', dir: 'ltr', intl: 'en-GB' },
  am: { name: 'አማርኛ', short: 'አማ', dir: 'ltr', intl: 'am-ET' },
  om: { name: 'Afaan Oromoo', short: 'OM', dir: 'ltr', intl: 'om-ET' },
  // Western digits in Arabic too, so page numbers and PINs look the same in every language.
  ar: { name: 'العربية', short: 'ع', dir: 'rtl', intl: 'ar-u-nu-latn' },
};

/** @param {unknown} value @returns {value is 'en' | 'am' | 'om' | 'ar'} */
export function isLocale(value) {
  return typeof value === 'string' && LOCALES.includes(/** @type {any} */ (value));
}

// Language tags browsers send for Afaan Oromo besides "om".
const ALIASES = { gaz: 'om', orm: 'om', hae: 'om' };

/**
 * Picks the best supported language from an Accept-Language header
 * (e.g. "am-ET,am;q=0.9,en;q=0.8"). Falls back to English.
 * @param {string | null | undefined} header
 */
export function matchAcceptLanguage(header) {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header.split(',').map((part, index) => {
    const [tag, ...params] = part.trim().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const quality = q ? Number(q.slice(2)) : 1;
    return { base: tag.trim().toLowerCase().split('-')[0], quality: Number.isFinite(quality) ? quality : 0, index };
  }).filter((entry) => entry.base && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { base } of ranked) {
    const locale = /** @type {Record<string, string>} */ (ALIASES)[base] ?? base;
    if (isLocale(locale)) return locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Adds a language prefix to an app path: ("am", "/library?x=1") -> "/am/library?x=1".
 * Paths that are not app pages (API, files, other sites, anchors) are returned unchanged.
 * @param {string} locale @param {string} path
 */
export function localePath(locale, path) {
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/api/') || /^\/[^?#]*\.[a-z0-9]+(?:[?#]|$)/i.test(path)) return path;
  const { rest } = splitLocale(path);
  return rest === '/' ? `/${locale}` : rest.startsWith('/?') || rest.startsWith('/#') ? `/${locale}${rest.slice(1)}` : `/${locale}${rest}`;
}

/**
 * Splits "/am/library/books" into { locale: "am", rest: "/library/books" }.
 * @param {string} pathname
 */
export function splitLocale(pathname) {
  const match = /^\/([a-z]{2})(?=\/|\?|#|$)(.*)$/.exec(pathname);
  if (match && isLocale(match[1])) return { locale: match[1], rest: match[2].startsWith('/') ? match[2] : `/${match[2]}` };
  return { locale: null, rest: pathname };
}

/**
 * Fills {placeholders} in a message: fmt("Page {n} of {total}", { n: 2, total: 9 }).
 * Unknown placeholders are left as they are.
 * @param {string} template @param {Record<string, string | number>} [values]
 */
export function fmt(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole));
}

/**
 * Chooses the singular or plural form and fills {n}: plural(3, msg.books) -> "3 books".
 * @param {number} n @param {{ one: string; other: string }} forms
 */
export function plural(n, forms) {
  return fmt(n === 1 ? forms.one : forms.other, { n });
}
