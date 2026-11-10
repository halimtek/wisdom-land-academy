import * as z from 'zod';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import { removeSchoolImage, storeSchoolImage } from '@/lib/school-media';
import { prisma } from '@/lib/prisma';

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
  const allowed = new Set(['aboutText', 'contactPhone', 'contactEmail', 'contactAddress', 'logoImageAlt', 'heroImageAlt', 'logoImage', 'heroImage', 'removeLogo', 'removeHero']);
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
  const logo = getImage('logoImage');
  const hero = getImage('heroImage');
  if (logo.invalid || hero.invalid || (logo.image && removeLogo) || (hero.image && removeHero)) return NextResponse.json({ error: 'Choose one image action for each image.' }, { status: 400 });
  if (logo.image && !parsed.data.logoImageAlt) return NextResponse.json({ error: 'Add alternative text for the logo.' }, { status: 400 });
  if (hero.image && !parsed.data.heroImageAlt) return NextResponse.json({ error: 'Add alternative text for the hero image.' }, { status: 400 });

  const existing = await prisma.schoolSettings.findUnique({ where: { id: 'main' } });
  let newLogoPath: string | undefined;
  let newHeroPath: string | undefined;
  try {
    if (logo.image) newLogoPath = await storeSchoolImage(logo.image);
    if (hero.image) newHeroPath = await storeSchoolImage(hero.image);
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
    if (existing?.logoImagePath && (newLogoPath || removeLogo)) await removeSchoolImage(existing.logoImagePath).catch(() => undefined);
    if (existing?.heroImagePath && (newHeroPath || removeHero)) await removeSchoolImage(existing.heroImagePath).catch(() => undefined);
    return NextResponse.json({ message: 'School website settings saved.' });
  } catch {
    if (newLogoPath) await removeSchoolImage(newLogoPath).catch(() => undefined);
    if (newHeroPath) await removeSchoolImage(newHeroPath).catch(() => undefined);
    return NextResponse.json({ error: 'Settings could not be saved. Check private storage and try again.' }, { status: 500 });
  }
}
