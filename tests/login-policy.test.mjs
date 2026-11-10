import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationForRole, loginModeMatchesRole } from '../src/lib/login-policy.mjs';
import { roleIsAllowed } from '../src/lib/auth-policy.mjs';
import { canReadPublishedBook } from '../src/lib/book-security.mjs';

test('the selected login option only accepts a matching stored role', () => {
  assert.equal(loginModeMatchesRole('STUDENT', 'STUDENT'), true);
  assert.equal(loginModeMatchesRole('TEACHER', 'TEACHER'), true);
  assert.equal(loginModeMatchesRole('ADMIN', 'ADMIN'), true);
  assert.equal(loginModeMatchesRole('STUDENT', 'ADMIN'), false);
  assert.equal(loginModeMatchesRole('ADMIN', 'STUDENT'), false);
  assert.equal(loginModeMatchesRole('TEACHER', 'STUDENT'), false);
});

test('successful students and staff go to their role-appropriate pages', () => {
  assert.equal(destinationForRole('STUDENT'), '/library');
  assert.equal(destinationForRole('TEACHER'), '/library');
  assert.equal(destinationForRole('ADMIN'), '/admin');
});

test('students and teachers are denied administrator-only route access', () => {
  assert.equal(roleIsAllowed('STUDENT', ['ADMIN']), false);
  assert.equal(roleIsAllowed('TEACHER', ['ADMIN']), false);
  assert.equal(roleIsAllowed('ADMIN', ['ADMIN']), true);
});

test('public read-only library access does not grant access to administrator routes', () => {
  assert.equal(canReadPublishedBook({ isPublished: true }), true);
  assert.equal(roleIsAllowed(null, ['ADMIN']), false);
  for (const role of ['STUDENT', 'TEACHER']) {
    assert.equal(roleIsAllowed(role, ['ADMIN']), false);
  }
  assert.equal(roleIsAllowed('ADMIN', ['ADMIN']), true);
});
