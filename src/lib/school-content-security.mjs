export const MAX_SCHOOL_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = [
  { mimeType: 'image/jpeg', extensions: ['.jpg', '.jpeg'], extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', extensions: ['.png'], extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/webp', extensions: ['.webp'], extension: 'webp', signature: [0x52, 0x49, 0x46, 0x46], webp: true },
];

/** @param {{filename: unknown, mimeType: unknown, size: unknown, signature: Uint8Array}} file */
export function validateSchoolImageUpload(file) {
  if (typeof file.filename !== 'string' || file.filename.length > 255) return 'Choose a JPEG, PNG, or WebP image.';
  if (typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 12 || file.size > MAX_SCHOOL_IMAGE_BYTES) {
    return `Images must be between 12 bytes and ${Math.floor(MAX_SCHOOL_IMAGE_BYTES / (1024 * 1024))} MB.`;
  }
  const imageType = IMAGE_TYPES.find((candidate) => candidate.mimeType === file.mimeType);
  if (!imageType) return 'Images must use JPEG, PNG, or WebP format.';
  if (!imageType.extensions.some((extension) => file.filename.toLowerCase().endsWith(extension))) {
    return 'The file extension does not match the image type.';
  }
  if (!imageType.signature.every((byte, index) => file.signature[index] === byte)) return 'The uploaded file does not match its image type.';
  if (imageType.webp && new TextDecoder().decode(file.signature.subarray(8, 12)) !== 'WEBP') return 'The uploaded file does not match its image type.';
  return null;
}

/** @param {unknown} candidate */
export function isSafeSchoolImagePath(candidate) {
  return typeof candidate === 'string' && /^school-content\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(candidate);
}

/** @param {{kind: unknown, isPublished: unknown, consentConfirmed: unknown, displayName?: unknown, roleTitle?: unknown}} content */
export function validateSchoolContentPublication(content) {
  if (content.kind === 'STUDENT_PROJECT' && content.isPublished === true && content.consentConfirmed !== true) {
    return 'Confirm the required student or guardian authorization before publishing a student project.';
  }
  if (content.kind === 'STAFF_PROFILE' && content.isPublished === true) {
    if (typeof content.displayName !== 'string' || !content.displayName.trim()) return 'Add the approved staff member name before publishing this profile.';
    if (typeof content.roleTitle !== 'string' || !content.roleTitle.trim()) return 'Add the staff member title before publishing this profile.';
  }
  return null;
}
