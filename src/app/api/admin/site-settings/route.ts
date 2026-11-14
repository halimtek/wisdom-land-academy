import * as z from 'zod';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import { prisma } from '@/lib/prisma';
import { revalidatePublicPages } from '@/lib/revalidate-public';
import { removeObjectQuietly, StorageTimeoutError } from '@/lib/storage';
import { acceptUpload, hasUpload, UploadRejectedError } from '@/lib/uploads';

const MAX_FORM_BYTES = 11 * 1024 * 1024;
const SettingsSchema = z.object({
  aboutText: z.string().trim().max(1200),
  contactPhone: z.string().trim().max(50),
  contactEmail: z.string().trim().max(254).email().or(z.literal('')),
  contactAddress: z.string().trim().max(250),
  logoImageAlt: z.string().trim().max(180),
  heroImageAlt: z.string().trim().max(180),
});

async function requireAdmin() {
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
  return new Request(request.url, {
    method: 'PUT',
    headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    body: new Uint8Array(body),
  }).formData();
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await readForm(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof RangeError ? 'Each image is limited to 5 MB.' : 'Invalid form submission.' }, { status: error instanceof RangeError ? 413 : 400 });
  }
  const allowed = new Set(['aboutText', 'contactPhone', 'contactEmail', 'contactAddress', 'logoImageAlt', 'heroImageAlt', 'logoImage', 'heroImage', 'logoImageKey', 'heroImageKey', 'removeLogo', 'removeHero']);
  for (const key of form.keys()) if (!allowed.has(key)) return NextResponse.json({ error: 'The form contains an unexpected field.' }, { status: 400 });
  const single = (name: string) => {
    const values = form.getAll(name);
    return values.length === 1 && typeof values[0] === 'string' ? values[0] : null;
  };
  if (['aboutText', 'contactPhone', 'contactEmail', 'contactAddress', 'logoImageAlt', 'heroImageAlt'].some((name) => form.getAll(name).length !== 1)) {
    return NextResponse.json({ error: 'Each settings field must be provided once.' }, { status: 400 });
  }
  const parsed = SettingsSchema.safeParse({
    aboutText: single('aboutText'),
    contactPhone: single('contactPhone'),
    contactEmail: single('contactEmail'),
    contactAddress: single('contactAddress'),
    logoImageAlt: single('logoImageAlt'),
    heroImageAlt: single('heroImageAlt'),
  });
  if (!parsed.success) return NextResponse.json({ error: 'Check the contact details and image descriptions.' }, { status: 400 });

  const boolField = (name: string) => {
    const values = form.getAll(name);
    return values.length <= 1 && (values.length === 0 || values[0] === 'on');
  };
  if (!boolField('removeLogo') || !boolField('removeHero')) return NextResponse.json({ error: 'Invalid image option.' }, { status: 400 });
  const removeLogo = form.get('removeLogo') === 'on';
  const removeHero = form.get('removeHero') === 'on';
  const getImage = (name: string) => {
    const values = form.getAll(name);
    if (values.length > 1) return { invalid: true as const, image: null };
    const value = values[0];
    if (value === undefined || (value instanceof File && value.size === 0)) return { invalid: false as const, image: null };
    return value instanceof File ? { invalid: false as const, image: value } : { invalid: true as const, image: null };
  };
  // Each image arrives as a file (local storage) or as the key of a direct upload
  // to Supabase Storage (`logoImageKey` / `heroImageKey`).
  const logo = { invalid: getImage('logoImage').invalid, image: hasUpload(form, 'logoImage') };
  const hero = { invalid: getImage('heroImage').invalid, image: hasUpload(form, 'heroImage') };
  if (logo.invalid || hero.invalid || (logo.image && removeLogo) || (hero.image && removeHero)) return NextResponse.json({ error: 'Choose one image action for each image.' }, { status: 400 });
  if (logo.image && !parsed.data.logoImageAlt) return NextResponse.json({ error: 'Add alternative text for the logo.' }, { status: 400 });
  if (hero.image && !parsed.data.heroImageAlt) return NextResponse.json({ error: 'Add alternative text for the hero image.' }, { status: 400 });

  const existing = await prisma.schoolSettings.findUnique({ where: { id: 'main' } });
  let newLogoPath: string | undefined;
  let newHeroPath: string | undefined;
  let committed = false;
  try {
    newLogoPath = (await acceptUpload('image', form, 'logoImage')) ?? undefined;
    newHeroPath = (await acceptUpload('image', form, 'heroImage')) ?? undefined;
    await prisma.schoolSettings.upsert({
      where: { id: 'main' },
      create: {
        id: 'main',
        aboutText: parsed.data.aboutText || null,
        contactPhone: parsed.data.contactPhone || null,
        contactEmail: parsed.data.contactEmail || null,
        contactAddress: parsed.data.contactAddress || null,
        logoImageAlt: parsed.data.logoImageAlt || (logo.image || removeLogo ? null : undefined),
        heroImageAlt: parsed.data.heroImageAlt || (hero.image || removeHero ? null : undefined),
        logoImagePath: newLogoPath ?? (removeLogo ? null : undefined),
        heroImagePath: newHeroPath ?? (removeHero ? null : undefined),
      },
      update: {
        aboutText: parsed.data.aboutText || null,
        contactPhone: parsed.data.contactPhone || null,
        contactEmail: parsed.data.contactEmail || null,
        contactAddress: parsed.data.contactAddress || null,
        logoImageAlt: parsed.data.logoImageAlt || (logo.image || removeLogo ? null : undefined),
        heroImageAlt: parsed.data.heroImageAlt || (hero.image || removeHero ? null : undefined),
        ...(newLogoPath ? { logoImagePath: newLogoPath } : removeLogo ? { logoImagePath: null } : {}),
        ...(newHeroPath ? { heroImagePath: newHeroPath } : removeHero ? { heroImagePath: null } : {}),
      },
    });
    committed = true;
    // Previous images are removed only after the settings point to the new ones.
    if (existing?.logoImagePath && (newLogoPath || removeLogo)) await removeObjectQuietly(existing.logoImagePath, 'logo replaced');
    if (existing?.heroImagePath && (newHeroPath || removeHero)) await removeObjectQuietly(existing.heroImagePath, 'hero image replaced');
    revalidatePublicPages();
    return NextResponse.json({ message: 'School website settings saved.' });
  } catch (error) {
    if (!committed) {
      await removeObjectQuietly(newLogoPath, 'settings save failed');
      await removeObjectQuietly(newHeroPath, 'settings save failed');
    }
    if (error instanceof UploadRejectedError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('[admin/site-settings] Settings could not be saved', error);
    if (error instanceof StorageTimeoutError) return NextResponse.json({ error: 'File storage did not respond in time. Nothing was changed; please try again.' }, { status: 504 });
    return NextResponse.json({ error: 'Settings could not be saved. Check private storage and try again.' }, { status: 500 });
  }
}
