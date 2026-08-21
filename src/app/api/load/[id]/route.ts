import { NextResponse } from 'next/server';
import { db } from '@/db';
import { gameSaves } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const results = await db.select().from(gameSaves).where(eq(gameSaves.id, id));
    if (results.length === 0) {
      return NextResponse.json({ error: 'Save not found' }, { status: 404 });
    }
    return NextResponse.json(results[0]);
  } catch (error) {
    console.error('Load error:', error);
    return NextResponse.json({ error: 'Failed to load game' }, { status: 500 });
  }
}
