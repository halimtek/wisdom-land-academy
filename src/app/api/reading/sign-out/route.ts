import { NextResponse } from 'next/server';
import { endReaderSession } from '@/lib/reader-auth';

// Ends the active reader (the student stays remembered on this device).
export async function POST() {
  await endReaderSession();
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
