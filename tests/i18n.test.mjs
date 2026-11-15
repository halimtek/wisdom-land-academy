import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { LOCALES, LOCALE_INFO, fmt, isLocale, localePath, matchAcceptLanguage, plural, splitLocale } from '../src/i18n/locales.mjs';
import { createServerTranslator } from '../src/i18n/server-translate.mjs';
import { en } from '../src/i18n/messages/en.ts';

test('four languages; only Arabic is right-to-left', () => {
  assert.deepEqual([...LOCALES], ['en', 'am', 'om', 'ar']);
  assert.deepEqual(LOCALES.filter((code) => LOCALE_INFO[code].dir === 'rtl'), ['ar']);
  assert.equal(isLocale('am'), true);
  for (const bad of ['fr', 'EN', '', null, 'en-US']) assert.equal(isLocale(bad), false, String(bad));
});

test('device language: best supported match by quality, Oromo aliases, English fallback', () => {
  assert.equal(matchAcceptLanguage('am-ET,am;q=0.9,en;q=0.8'), 'am');
  assert.equal(matchAcceptLanguage('fr-FR,fr;q=0.9,ar;q=0.5'), 'ar');
  assert.equal(matchAcceptLanguage('en-US,om;q=0.9'), 'en');
  assert.equal(matchAcceptLanguage('en;q=0.3,om;q=0.9'), 'om');
  assert.equal(matchAcceptLanguage('gaz'), 'om');
  assert.equal(matchAcceptLanguage('ar;q=0,am;q=0.2'), 'am', 'q=0 means "not acceptable"');
  for (const header of [null, '', 'fr,de', '*']) assert.equal(matchAcceptLanguage(header), 'en', String(header));
});

test('localePath adds or replaces the language prefix and leaves non-pages alone', () => {
  assert.equal(localePath('am', '/'), '/am');
  assert.equal(localePath('am', '/library?tab=1#x'), '/am/library?tab=1#x');
  assert.equal(localePath('ar', '/en/admin/books'), '/ar/admin/books');
  assert.equal(localePath('om', '/?q=1'), '/om?q=1');
  assert.equal(localePath('om', '/en'), '/om');
  assert.equal(localePath('am', '/english-page'), '/am/english-page', 'only a whole segment is a language');
  for (const untouched of ['/api/books/1/file', '/images/wla-emblem.png', '/manifest.webmanifest', 'https://example.org/', '//cdn.example', '#top', 'mailto:x@y.z']) {
    assert.equal(localePath('am', untouched), untouched, untouched);
  }
});

test('splitLocale finds a leading language segment only', () => {
  assert.deepEqual(splitLocale('/ar/admin/books'), { locale: 'ar', rest: '/admin/books' });
  assert.deepEqual(splitLocale('/am'), { locale: 'am', rest: '/' });
  assert.deepEqual(splitLocale('/admin'), { locale: null, rest: '/admin' });
  assert.deepEqual(splitLocale('/fr/about'), { locale: null, rest: '/fr/about' });
});

test('fmt fills placeholders; plural picks the form', () => {
  assert.equal(fmt('Page {n} of {total}', { n: 2, total: 9 }), 'Page 2 of 9');
  assert.equal(fmt('Hi {name}! {missing}', { name: 'Abebe' }), 'Hi Abebe! {missing}');
  assert.equal(plural(1, { one: '{n} book', other: '{n} books' }), '1 book');
  assert.equal(plural(0, { one: '{n} book', other: '{n} books' }), '0 books');
});

test('server messages: every English template matches itself and carries its values', () => {
  const translate = createServerTranslator(en.server);
  const upper = Object.fromEntries(Object.entries(en.server).map(([k, v]) => [k, `<${k}> ${v}`]));
  for (const [key, template] of Object.entries(en.server)) {
    const filled = fmt(template, { n: 7, title: 'Amharic Grade 3', name: 'Abebe Kebede', username: 'abebe.k' });
    assert.equal(translate(filled, upper), `<${key}> ${filled}`, key);
  }
  assert.equal(translate('Something new the server says.', upper), 'Something new the server says.', 'unknown text is unchanged');
  // The longer "deleted" message must not be swallowed by the shorter one.
  assert.match(translate('“Maths” was deleted. Its stored file could not be removed and has been logged for cleanup.', upper), /^<deletedFileKept>/);
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx|mjs)$/.test(name) ? [full] : [];
  });
}

test('every user-facing message the server returns has a translation template', () => {
  const translate = createServerTranslator(en.server);
  const marked = Object.fromEntries(Object.keys(en.server).map((k) => [k, '✓']));
  const files = [
    ...sourceFiles('src/app/api/admin'), ...sourceFiles('src/app/api/reading'), ...sourceFiles('src/app/actions'),
    'src/lib/school-content-security.mjs', 'src/lib/book-security.mjs', 'src/lib/uploads.ts', 'src/lib/admin-books.mjs',
  ];
  const missing = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const literals = [
      ...source.matchAll(/(?:error|message|success):\s*(?:[^'`"\n]*\?\s*)?(['`])((?:(?!\1).)+)\1/g),
      ...source.matchAll(/(?:return|UploadRejectedError\()\s*(['`])([A-Z“"][^'`\n]{8,})\1/g),
      ...source.matchAll(/:\s*(['`])((?:(?!\1).)+[.!])\1\s*\}/g),
    ].map((m) => m[2]);
    for (const literal of new Set(literals)) {
      if (!/^[A-Z“]/.test(literal) || !/[.!]$/.test(literal)) continue; // not a sentence shown to people
      // Template literals: try sample values for ${…} (a number, or a word such as "published").
      const known = ['42', 'published', 'unpublished'].some((value) => translate(literal.replace(/\$\{[^}]+\}/g, value), marked) === '✓');
      if (!known) missing.push(`${file}: ${literal}`);
    }
  }
  assert.deepEqual(missing, [], 'add these to en.server (and translate them)');
});
