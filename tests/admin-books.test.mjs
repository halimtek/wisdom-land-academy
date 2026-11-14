import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAGE_SIZE, MAX_BULK_IDS, bookQueryString, buildBookOrderBy, buildBookWhere, pageWindow, paginate,
  parseBookQuery, parsePublicationRequest, storageKeysToRemove,
} from '../src/lib/admin-books.mjs';

test('parseBookQuery: defaults and safe normalisation of URL values', () => {
  assert.deepEqual(parseBookQuery({}), { q: '', status: 'all', type: '', grade: '', subject: '', sort: 'newest', page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const q = parseBookQuery({ q: '  Grade   1 \n Maths ', status: 'published', type: 'GENERAL', grade: 'cmgrade1', subject: 'cmsub_1', sort: 'title-desc', page: '3', size: '50' });
  assert.deepEqual(q, { q: 'Grade 1 Maths', status: 'published', type: 'GENERAL', grade: 'cmgrade1', subject: 'cmsub_1', sort: 'title-desc', page: 3, pageSize: 50 });
});

test('parseBookQuery: rejects unknown or malicious values instead of trusting them', () => {
  const q = parseBookQuery({ status: 'pending', type: 'SECRET', grade: "x' OR 1=1", subject: '../../etc', sort: 'createdAt;drop', page: '-4', size: '1000' });
  assert.equal(q.status, 'all');
  assert.equal(q.type, '');
  assert.equal(q.grade, '');
  assert.equal(q.subject, '');
  assert.equal(q.sort, 'newest');
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(parseBookQuery({ q: 'x'.repeat(500) }).q.length, 100, 'search is length-limited');
  assert.equal(parseBookQuery({ page: ['2', '9'] }).page, 2, 'repeated params use the first value');
  assert.equal(parseBookQuery({ page: 'abc' }).page, 1);
});

test('buildBookWhere: no filters means all books', () => {
  assert.deepEqual(buildBookWhere(parseBookQuery({})), {});
});

test('buildBookWhere: search covers title, author, description, subject and grade (case-insensitive)', () => {
  const where = buildBookWhere(parseBookQuery({ q: 'maths' }));
  const contains = { contains: 'maths', mode: 'insensitive' };
  assert.deepEqual(where, { AND: [{ OR: [
    { title: contains }, { author: contains }, { description: contains },
    { subject: { name: contains } }, { subject: { grade: { name: contains } } },
  ] }] });
});

test('buildBookWhere: filters combine with AND; status can be ignored for tab counts', () => {
  const query = parseBookQuery({ q: 'reader', status: 'unpublished', type: 'GRADE_BASED', grade: 'g1', subject: 's1' });
  const where = buildBookWhere(query);
  assert.equal(where.AND.length, 5);
  assert.ok(where.AND.some((c) => c.isPublished === false));
  assert.ok(where.AND.some((c) => c.bookType === 'GRADE_BASED'));
  assert.ok(where.AND.some((c) => c.subjectId === 's1'));
  const grade = where.AND.find((c) => c.OR && c.OR.some((o) => o.subject?.gradeId));
  assert.deepEqual(grade, { OR: [{ subject: { gradeId: 'g1' } }, { bookType: 'GENERAL', allowedGrades: { some: { gradeId: 'g1' } } }] });
  const forTabs = buildBookWhere(query, { ignoreStatus: true });
  assert.equal(forTabs.AND.length, 4);
  assert.ok(!forTabs.AND.some((c) => 'isPublished' in c));
  assert.deepEqual(buildBookWhere(parseBookQuery({ status: 'published' })), { AND: [{ isPublished: true }] });
});

test('buildBookOrderBy: all sorts are stable (id tie-breaker)', () => {
  assert.deepEqual(buildBookOrderBy('newest'), [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(buildBookOrderBy('oldest'), [{ createdAt: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(buildBookOrderBy('title-asc'), [{ title: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(buildBookOrderBy('title-desc'), [{ title: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(buildBookOrderBy('updated'), [{ updatedAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(buildBookOrderBy('unknown'), buildBookOrderBy('newest'));
});

test('paginate: clamps out-of-range pages and reports the visible range', () => {
  assert.deepEqual(paginate(45, 2, 20), { page: 2, pageSize: 20, totalPages: 3, total: 45, skip: 20, take: 20, from: 21, to: 40 });
  assert.equal(paginate(45, 9, 20).page, 3, 'past the end -> last page');
  assert.deepEqual([paginate(45, 9, 20).from, paginate(45, 9, 20).to], [41, 45]);
  assert.deepEqual(paginate(0, 4, 10), { page: 1, pageSize: 10, totalPages: 1, total: 0, skip: 0, take: 10, from: 0, to: 0 });
});

test('bookQueryString: keeps filters across pages, drops defaults, resets page on filter change', () => {
  const query = parseBookQuery({ q: 'math', status: 'published', grade: 'g1', sort: 'title-asc', page: '3', size: '50' });
  assert.equal(bookQueryString(query), '?q=math&status=published&grade=g1&sort=title-asc&size=50&page=3');
  assert.equal(bookQueryString(query, { page: 4 }), '?q=math&status=published&grade=g1&sort=title-asc&size=50&page=4');
  assert.equal(bookQueryString(query, { status: 'unpublished' }), '?q=math&status=unpublished&grade=g1&sort=title-asc&size=50', 'filter change -> page 1');
  assert.equal(bookQueryString(parseBookQuery({})), '');
  assert.deepEqual(parseBookQuery(Object.fromEntries(new URLSearchParams(bookQueryString(query).slice(1)))), query, 'round-trips through the URL');
});

test('pageWindow: compact page list with gaps', () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(1, 5), [1, 2, null, 5]);
  assert.deepEqual(pageWindow(6, 12), [1, null, 5, 6, 7, null, 12]);
  assert.deepEqual(pageWindow(12, 12), [1, null, 11, 12]);
});

test('parsePublicationRequest: server-side validation of publish/unpublish input', () => {
  assert.deepEqual(parsePublicationRequest({ ids: ['a1', 'b2', 'a1'], publish: true }), { ok: true, ids: ['a1', 'b2'], publish: true });
  assert.deepEqual(parsePublicationRequest({ ids: ['a1'], publish: false }), { ok: true, ids: ['a1'], publish: false });
  for (const bad of [null, 'x', { ids: ['a1'] }, { ids: ['a1'], publish: 'true' }, { ids: [], publish: true }, { ids: 'a1', publish: true },
    { ids: ['a1', { id: 1 }], publish: true }, { ids: ["a'; DROP TABLE"], publish: true }]) {
    assert.equal(parsePublicationRequest(bad).ok, false, JSON.stringify(bad));
  }
  const tooMany = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => `id${i}`);
  assert.equal(parsePublicationRequest({ ids: tooMany, publish: true }).ok, false);
});

test('storageKeysToRemove: deletes only files no other record still uses', () => {
  const book = { filePath: 'aaa.pdf', coverImagePath: 'school-content/c.png' };
  assert.deepEqual(storageKeysToRemove(book, () => 0), ['aaa.pdf', 'school-content/c.png']);
  assert.deepEqual(storageKeysToRemove(book, (key) => (key === 'school-content/c.png' ? 1 : 0)), ['aaa.pdf'], 'shared cover is kept');
  assert.deepEqual(storageKeysToRemove({ filePath: 'aaa.pdf', coverImagePath: null }, () => 0), ['aaa.pdf']);
  assert.deepEqual(storageKeysToRemove(book, () => 2), []);
});
