import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCHOOL_IMAGE_BYTES,
  isSafeSchoolImagePath,
  validateSchoolContentPublication,
  validateSchoolImageUpload,
} from '../src/lib/school-content-security.mjs';

test('accepts only bounded image files whose type, extension, and signature agree', () => {
  assert.equal(validateSchoolImageUpload({ filename: 'campus.jpg', mimeType: 'image/jpeg', size: 16, signature: Uint8Array.from([0xff, 0xd8, 0xff]) }), null);
  assert.match(validateSchoolImageUpload({ filename: 'campus.png', mimeType: 'image/png', size: 16, signature: Uint8Array.from([0xff, 0xd8, 0xff]) }), /does not match/);
  assert.match(validateSchoolImageUpload({ filename: 'campus.jpg', mimeType: 'image/jpeg', size: MAX_SCHOOL_IMAGE_BYTES + 1, signature: Uint8Array.from([0xff, 0xd8, 0xff]) }), /between/);
});

test('school image storage paths must be generated UUID relative paths', () => {
  assert.equal(isSafeSchoolImagePath('school-content/123e4567-e89b-42d3-a456-426614174000.webp'), true);
  assert.equal(isSafeSchoolImagePath('../public/campus.png'), false);
  assert.equal(isSafeSchoolImagePath('/school-content/123e4567-e89b-42d3-a456-426614174000.webp'), false);
});

test('student projects need authorization confirmation before publication', () => {
  assert.match(validateSchoolContentPublication({ kind: 'STUDENT_PROJECT', isPublished: true, consentConfirmed: false }), /authorization/);
  assert.equal(validateSchoolContentPublication({ kind: 'STUDENT_PROJECT', isPublished: true, consentConfirmed: true }), null);
  assert.equal(validateSchoolContentPublication({ kind: 'STUDENT_PROJECT', isPublished: false, consentConfirmed: false }), null);
});

test('published staff profiles require approved name and title', () => {
  assert.match(validateSchoolContentPublication({ kind: 'STAFF_PROFILE', isPublished: true, displayName: '', roleTitle: '' }), /name/);
  assert.equal(validateSchoolContentPublication({ kind: 'STAFF_PROFILE', isPublished: true, displayName: 'Approved Name', roleTitle: 'Teacher' }), null);
});
