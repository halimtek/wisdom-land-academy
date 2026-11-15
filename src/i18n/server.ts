import 'server-only';

import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './locales.mjs';
import { createServerTranslator } from './server-translate.mjs';
import { en, type Messages } from './messages/en';

const loaders: Record<Locale, () => Promise<Messages>> = {
  en: async () => en,
  am: () => import('./messages/am').then((module) => module.am),
  om: () => import('./messages/om').then((module) => module.om),
  ar: () => import('./messages/ar').then((module) => module.ar),
};

export function getMessages(locale: Locale): Promise<Messages> {
  return loaders[locale]();
}

/**
 * Language for API routes and Server Actions, which have no /[lang] segment: the
 * page the request came from sets the wla_lang cookie (see src/proxy.ts).
 */
export async function requestLocale(): Promise<Locale> {
  try {
    const value = (await cookies()).get(LOCALE_COOKIE)?.value;
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

const translate = createServerTranslator(en.server);

/** Translates a known English server message; unknown text is returned unchanged. */
export function translateServerMessage(text: string, messages: Messages): string {
  return messages === en ? text : translate(text, messages.server);
}

/** Returns the result with its error/message/success text in the visitor's language. */
export async function localizeResult<T extends object>(result: T): Promise<T> {
  const locale = await requestLocale();
  if (locale === 'en') return result;
  const messages = await getMessages(locale);
  const out = { ...result } as Record<string, unknown>;
  for (const field of ['error', 'message', 'success']) {
    const value = out[field];
    if (typeof value === 'string') out[field] = translateServerMessage(value, messages);
  }
  return out as T;
}

/** JSON response whose error/message text is in the visitor's language. */
export async function localizedJson(body: object, init?: ResponseInit): Promise<Response> {
  return Response.json(await localizeResult(body), init);
}
