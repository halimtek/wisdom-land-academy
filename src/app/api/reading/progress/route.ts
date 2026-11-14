import { NextResponse } from 'next/server';
import { getReader } from '@/lib/reader-auth';
import { readerProgress } from '@/lib/reading-service';

// The signed-in student's progress per book (for covers, "Continue reading", resume).
export async function GET() {
  const reader = await getReader();
  if (!reader) return NextResponse.json({ signedIn: false, books: [] }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ signedIn: true, books: await readerProgress(reader.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
