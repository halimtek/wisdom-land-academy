// Formatting helpers for school news stories (plain JS so they can be unit tested).

const WORDS_PER_MINUTE = 200;

/**
 * The date shown on a story: the publication date chosen in Admin, or else the day
 * the story was created.
 * @param {{ eventDate?: Date | null; createdAt: Date }} item
 */
export function newsDate(item) {
  return item.eventDate ?? item.createdAt;
}

/** Newest first by newsDate, then by last change. */
export function sortNews(items) {
  return [...items].sort((a, b) => newsDate(b).getTime() - newsDate(a).getTime() || b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Estimated reading time in whole minutes (at least 1). Counts words separated by
 * spaces, so it works for Amharic, Oromo, Arabic and English alike.
 * @param {...(string | null | undefined)} texts
 */
export function readingMinutes(...texts) {
  const words = texts.filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Splits the story text into paragraphs at blank lines. Single line breaks stay
 * inside a paragraph (shown as line breaks). Plain text only; no HTML is ever parsed.
 * @param {string | null | undefined} body
 */
export function paragraphs(body) {
  if (!body) return [];
  return body.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map((p) => p.trim()).filter(Boolean);
}

/** A short excerpt for cards: the summary, or the start of the text cut at a word. */
export function excerpt(summary, body, max = 180) {
  const text = (summary || paragraphs(body)[0] || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}
