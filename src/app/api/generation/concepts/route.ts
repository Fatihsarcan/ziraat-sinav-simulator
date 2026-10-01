import { NextResponse } from "next/server";
import { rawDb } from "../../../../lib/server.ts";
import {
  generateForConcept,
  generateForConceptGaps,
  generationStatus,
} from "../../../../question-engine/index.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Yanlis yapilan KAVRAMLARDAN yeni soru uretir (sartname #8).
 * Tek kavram icin `concept` + `category` + `subtopic` gonderilir; govde bossa
 * en oncelikli kavram bosluklari sirayla islenir.
 */
export async function POST(request: Request) {
  const status = generationStatus();
  if (!status.available) {
    return NextResponse.json({ ok: false, message: status.reason }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    concept?: string;
    category?: string;
    subtopic?: string;
    count?: number;
    maxConcepts?: number;
  };

  const database = rawDb();
  try {
    if (body.concept && body.category && body.subtopic) {
      const outcome = await generateForConcept(
        { concept: body.concept, category: body.category, subtopic: body.subtopic },
        Math.min(20, Math.max(1, body.count ?? 4)),
        database,
      );
      return NextResponse.json({ ok: !outcome.error, outcome });
    }

    const results = await generateForConceptGaps(
      {
        maxConcepts: Math.min(10, Math.max(1, body.maxConcepts ?? 5)),
        perConcept: Math.min(10, Math.max(1, body.count ?? 4)),
      },
      database,
    );
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 });
  }
}
