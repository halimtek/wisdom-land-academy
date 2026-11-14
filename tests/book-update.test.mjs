import test from 'node:test';
import assert from 'node:assert/strict';
import { planBookFileUpdate } from '../src/lib/book-update.mjs';

const current = { filePath: 'old.pdf', coverImagePath: 'school-content/old.png' };

test('metadata-only edit writes neither filePath nor coverImagePath and removes nothing', () => {
  const plan = planBookFileUpdate(current, {});
  assert.deepEqual(plan.data, {});
  assert.deepEqual(plan.removeAfterCommit, []);
  assert.ok(!('coverImagePath' in plan.data), 'must not write back a previously read cover path');
});

test('new cover only: writes the cover, removes the cover the locked row pointed to', () => {
  const plan = planBookFileUpdate(current, { newCoverPath: 'school-content/new.png' });
  assert.deepEqual(plan.data, { coverImagePath: 'school-content/new.png' });
  assert.deepEqual(plan.removeAfterCommit, ['school-content/old.png']);
});

test('new PDF only: writes filePath, keeps the cover', () => {
  const plan = planBookFileUpdate(current, { newFilePath: 'new.pdf' });
  assert.deepEqual(plan.data, { filePath: 'new.pdf' });
  assert.deepEqual(plan.removeAfterCommit, ['old.pdf']);
});

test('both replaced', () => {
  const plan = planBookFileUpdate(current, { newFilePath: 'new.pdf', newCoverPath: 'school-content/new.png' });
  assert.deepEqual(plan.data, { filePath: 'new.pdf', coverImagePath: 'school-content/new.png' });
  assert.deepEqual(plan.removeAfterCommit, ['old.pdf', 'school-content/old.png']);
});

test('book without a cover gets one: nothing to remove', () => {
  const plan = planBookFileUpdate({ filePath: 'old.pdf', coverImagePath: null }, { newCoverPath: 'school-content/new.png' });
  assert.deepEqual(plan.removeAfterCommit, []);
});

test('concurrent edit: decisions follow the locked row, so a replaced cover is never restored or deleted twice', () => {
  // Admin A read cover X earlier; admin B has since replaced it with Y (and X was deleted).
  // A's transaction locks the row and sees Y.
  const lockedNow = { filePath: 'old.pdf', coverImagePath: 'school-content/Y.png' };
  const metadataOnly = planBookFileUpdate(lockedNow, {});
  assert.deepEqual(metadataOnly.data, {}, 'Y stays; stale X is never written back');
  const withNewCover = planBookFileUpdate(lockedNow, { newCoverPath: 'school-content/Z.png' });
  assert.deepEqual(withNewCover.removeAfterCommit, ['school-content/Y.png'], 'removes Y (really replaced), not stale X');
});
