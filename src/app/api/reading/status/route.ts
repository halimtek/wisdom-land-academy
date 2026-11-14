import { NextResponse } from 'next/server';
import { getReader, rememberedProfiles } from '@/lib/reader-auth';
import { readingSummary } from '@/lib/reading-service';

// Who is reading on this device, and today's progress. Never cached.
export async function GET() {
  const [reader, profiles] = await Promise.all([getReader(), rememberedProfiles({ prune: true })]);
  const summary = reader ? await readingSummary(reader.id) : null;
  return NextResponse.json({
    reader: reader && { firstName: reader.firstName, fullName: reader.fullName, gradeName: reader.gradeName },
    profiles: profiles.map((p) => ({ id: p.id, firstName: p.firstName, gradeName: p.gradeName, hasPin: p.hasPin, active: p.userId === reader?.id })),
    today: summary?.today ?? null,
    streak: summary?.streak ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
