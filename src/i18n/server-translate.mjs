// Matches the exact English messages the server produces (API routes, actions,
// validators) against the templates in messages/en.ts `server`, so the same message
// can be returned in the visitor's language. Plain JS so it can be unit tested.
import { fmt } from './locales.mjs';

/**
 * @param {Record<string, string>} englishServer en.server templates, e.g. "“{title}” was deleted."
 * @returns {(text: string, targetServer: Record<string, string>) => string}
 */
export function createServerTranslator(englishServer) {
  const matchers = Object.entries(englishServer)
    // Longer templates first: "“{title}” was deleted. Its stored file…" before "“{title}” was deleted."
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, template]) => {
      /** @type {string[]} */
      const names = [];
      const source = template.split(/(\{\w+\})/).map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        if (name) { names.push(name); return '([\\s\\S]+?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      return { key, regex: new RegExp(`^${source}$`), names };
    });
  return (text, targetServer) => {
    for (const { key, regex, names } of matchers) {
      const match = regex.exec(text);
      if (!match) continue;
      const target = targetServer[key];
      return typeof target === 'string' ? fmt(target, Object.fromEntries(names.map((name, i) => [name, match[i + 1]]))) : text;
    }
    return text; // unknown message: shown as it is
  };
}
