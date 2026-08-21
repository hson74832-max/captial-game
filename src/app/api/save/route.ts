import { NextResponse } from 'next/server';
import { db } from '@/db';
import { gameSaves } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const { id, name, state } = await request.json();
    
    const existing = await db.select().from(gameSaves).where(eq(gameSaves.id, id));
    
    if (existing.length > 0) {
      await db.update(gameSaves)
        .set({ state, updatedAt: new Date() })
        .where(eq(gameSaves.id, id));
    } else {
      await db.insert(gameSaves).values({ id, name, state });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json({ error: 'Failed to save game' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const saves = await db.select({
      id: gameSaves.id,
      name: gameSaves.name,
      updatedAt: gameSaves.updatedAt,
    }).from(gameSaves);
    return NextResponse.json(saves);
  } catch {
    return NextResponse.json([]);
  }
}
