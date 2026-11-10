import * as z from 'zod';
import { NextResponse } from 'next/server';
import type { SchoolContentKind } from '@/generated/prisma/enums';
import { getCurrentUser } from '@/lib/auth';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import { MAX_SCHOOL_IMAGE_BYTES, validateSchoolContentPublication, validateSchoolImageUpload } from '@/lib/school-content-security.mjs';
import { removeSchoolImage, storeSchoolImage } from '@/lib/school-media';
import { prisma } from '@/lib/prisma';

const Kinds = ['ACTIVITY', 'ANNOUNCEMENT', 'STAFF_PROFILE', 'STUDENT_PROJECT'] as const;
const MAX_FORM_BYTES = MAX_SCHOOL_IMAGE_BYTES + 512 * 1024;
const ContentSchema = z.object({
  kind: z.enum(Kinds),
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().max(300).optional(),
  body: z.string().trim().max(5000).optional(),
  displayName: z.string().trim().max(120).optional(),
  roleTitle: z.string().trim().max(120).optional(),
  eventDate: z.string().trim().max(10).optional(),
  imageAlt: z.string().trim().max(180).optional(),
  isPublished: z.boolean(),
  consentConfirmed: z.boolean(),
  contentId: z.string().trim().min(1).max(100).optional(),
});

async function adminResponse() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!roleIsAllowed(user.role, ['ADMIN'])) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  return null;
}

async function readForm(request: Request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FORM_BYTES) throw new RangeError('Form is too large.');
  if (!request.body) throw new TypeError('Form body is missing.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FORM_BYTES) {
        await reader.cancel();
        throw new RangeError('Form is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    body: new Uint8Array(body),
  });
  return boundedRequest.formData();
}

function field(form: FormData, name: string, required = false) {
  const values = form.getAll(name);
  if (values.length > 1 || (required && values.length !== 1)) return { invalid: true as const, value: null };
  return { invalid: false as const, value: values[0] ?? null };
}

function checkbox(value: FormDataEntryValue | null) {
  if (value === null) return false;
  return value === 'on';
}

function readContentData(form: FormData, contentId?: string) {
  const allowed = new Set(['kind', 'title', 'summary', 'body', 'displayName', 'roleTitle', 'eventDate', 'imageAlt', 'isPublished', 'consentConfirmed', 'image', 'removeImage', ...(contentId ? ['contentId'] : [])]);
  for (const key of form.keys()) if (!allowed.has(key)) return { error: 'The form contains an unexpected field.' } as const;

  const names = ['kind', 'title', 'summary', 'body', 'displayName', 'roleTitle', 'eventDate', 'imageAlt', 'isPublished', 'consentConfirmed', 'image', 'removeImage'];
  const values = Object.fromEntries(names.map((name) => [name, field(form, name)]));
  const contentIdValue = contentId ? field(form, 'contentId', true) : null;
  if (Object.values(values).some((entry) => entry.invalid) || contentIdValue?.invalid) return { error: 'Each form field must be provided at most once.' } as const;
  const raw = Object.fromEntries(names.filter((name) => !['isPublished', 'consentConfirmed', 'image', 'removeImage'].includes(name)).map((name) => [name, values[name as keyof typeof values].value ?? '']));
  const publishValue = values.isPublished.value;
  const consentValue = values.consentConfirmed.value;
  const removeImageValue = values.removeImage.value;
  if ((publishValue !== null && publishValue !== 'on') || (consentValue !== null && consentValue !== 'on') || (removeImageValue !== null && removeImageValue !== 'on')) return { error: 'Invalid checkbox value.' } as const;

  const parsed = ContentSchema.safeParse({
    ...raw,
    isPublished: checkbox(publishValue),
    consentConfirmed: checkbox(consentValue),
    ...(contentId ? { contentId: contentIdValue?.value } : {}),
  });
  if (!parsed.success) return { error: 'Check the content title and ensure text fields are within their limits.' } as const;
  const eventDate = parsed.data.eventDate ? new Date(`${parsed.data.eventDate}T12:00:00.000Z`) : null;
  if (parsed.data.eventDate && (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.eventDate) || Number.isNaN(eventDate?.getTime()) || eventDate?.toISOString().slice(0, 10) !== parsed.data.eventDate)) return { error: 'Enter a valid event date.' } as const;

  const content = { ...parsed.data, eventDate, consentConfirmed: parsed.data.kind === 'STUDENT_PROJECT' && parsed.data.consentConfirmed };
  const publicationError = validateSchoolContentPublication(content);
  if (publicationError) return { error: publicationError } as const;

  const imageValue = values.image.value;
  if (imageValue !== null && !(imageValue instanceof File)) return { error: 'Choose a valid image file.' } as const;
  const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
  return { error: null, content, image, removeImage: removeImageValue === 'on' } as const;
}

export async function POST(request: Request) {
  const denied = await adminResponse();
  if (denied) return denied;
  return writeContent(request, false);
}

export async function PUT(request: Request) {
  const denied = await adminResponse();
  if (denied) return denied;
  return writeContent(request, true);
}

async function writeContent(request: Request, update: boolean) {
  let form: FormData;
  try {
    form = await readForm(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof RangeError ? 'Images are limited to 5 MB.' : 'Invalid form submission.' }, { status: error instanceof RangeError ? 413 : 400 });
  }

  const result = readContentData(form, update ? 'contentId' : undefined);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  if (update && !result.content.contentId) return NextResponse.json({ error: 'Content identifier is required.' }, { status: 400 });

  let imagePath: string | undefined;
  if (result.image) {
    const signature = new Uint8Array(await result.image.slice(0, 12).arrayBuffer());
    const imageError = validateSchoolImageUpload({ filename: result.image.name, mimeType: result.image.type, size: result.image.size, signature });
    if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
    if (!result.content.imageAlt?.trim()) return NextResponse.json({ error: 'Add descriptive alternative text for the uploaded image.' }, { status: 400 });
  }

  let previousImage: string | null = null;
  try {
    if (update) {
      const previous = await prisma.schoolContent.findUnique({ where: { id: result.content.contentId }, select: { id: true, imagePath: true } });
      if (!previous) return NextResponse.json({ error: 'Content item not found.' }, { status: 404 });
      previousImage = previous.imagePath;
    }

    if (result.image) imagePath = await storeSchoolImage(result.image);

    const data = {
      kind: result.content.kind as SchoolContentKind,
      title: result.content.title,
      summary: result.content.summary || null,
      body: result.content.body || null,
      displayName: result.content.displayName || null,
      roleTitle: result.content.roleTitle || null,
      eventDate: result.content.eventDate,
      imageAlt: result.content.imageAlt || null,
      isPublished: result.content.isPublished,
      consentConfirmed: result.content.consentConfirmed,
      ...(imagePath ? { imagePath } : result.removeImage ? { imagePath: null } : {}),
    };
    const saved = update
      ? await prisma.schoolContent.update({ where: { id: result.content.contentId }, data, select: { id: true } })
      : await prisma.schoolContent.create({ data, select: { id: true } });
    if (previousImage && (imagePath || result.removeImage)) await removeSchoolImage(previousImage).catch(() => undefined);
    return NextResponse.json({ id: saved.id, message: update ? 'Website content updated.' : 'Website content created.' }, { status: update ? 200 : 201 });
  } catch {
    if (imagePath) await removeSchoolImage(imagePath).catch(() => undefined);
    return NextResponse.json({ error: 'Content could not be saved. Check private storage and try again.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await adminResponse();
  if (denied) return denied;
  const parsed = z.object({ contentId: z.string().trim().min(1).max(100) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid content identifier.' }, { status: 400 });
  const item = await prisma.schoolContent.findUnique({ where: { id: parsed.data.contentId }, select: { id: true, imagePath: true } });
  if (!item) return NextResponse.json({ error: 'Content item not found.' }, { status: 404 });
  await prisma.schoolContent.delete({ where: { id: item.id } });
  await removeSchoolImage(item.imagePath).catch(() => undefined);
  return NextResponse.json({ message: 'Website content deleted.' });
}
