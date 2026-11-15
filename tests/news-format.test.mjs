import test from 'node:test';
import assert from 'node:assert/strict';
import { excerpt, newsDate, paragraphs, readingMinutes, sortNews } from '../src/lib/news-format.mjs';

const d = (s) => new Date(`${s}T12:00:00Z`);

test('story date: the publication date set in Admin, otherwise the creation day', () => {
  assert.equal(newsDate({ eventDate: d('2026-10-01'), createdAt: d('2026-11-01') }).toISOString(), d('2026-10-01').toISOString());
  assert.equal(newsDate({ eventDate: null, createdAt: d('2026-11-01') }).toISOString(), d('2026-11-01').toISOString());
});

test('news is sorted newest first, ties broken by the latest change', () => {
  const items = [
    { id: 'old', eventDate: d('2026-09-01'), createdAt: d('2026-11-10'), updatedAt: d('2026-11-10') },
    { id: 'new', eventDate: null, createdAt: d('2026-11-12'), updatedAt: d('2026-11-12') },
    { id: 'same-day-edited', eventDate: d('2026-11-12'), createdAt: d('2026-11-01'), updatedAt: d('2026-11-14') },
  ];
  assert.deepEqual(sortNews(items).map((i) => i.id), ['same-day-edited', 'new', 'old']);
});

test('reading time is whole minutes, at least 1, for any script', () => {
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes('word '.repeat(450)), 2);
  assert.equal(readingMinutes('ትምህርት '.repeat(1000), null, 'more words'), 5);
});

test('paragraphs split at blank lines; single line breaks stay inside', () => {
  assert.deepEqual(paragraphs('First line\nsame paragraph\n\n\nSecond\r\n\r\nThird  '), ['First line\nsame paragraph', 'Second', 'Third']);
  assert.deepEqual(paragraphs(null), []);
  assert.deepEqual(paragraphs('<b>not html</b>'), ['<b>not html</b>'], 'text is never parsed as HTML');
});

test('excerpt uses the summary, or cuts the text at a word with an ellipsis', () => {
  assert.equal(excerpt('Short summary.', 'Body'), 'Short summary.');
  assert.equal(excerpt(null, 'One two three four five six seven', 20), 'One two three four…');
  assert.equal(excerpt('', null), '');
});
