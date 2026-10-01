import { NextResponse } from "next/server";
import { rawDb } from "../../../../lib/server.ts";
import { startPractice, type PracticeRequest } from "../../../../core/exam-engine.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PracticeRequest | null;
  if (!body || typeof body.count !== "number" || body.count <= 0) {
    return NextResponse.json({ ok: false, message: "Geçersiz istek: soru sayısı gerekli." }, { status: 400 });
  }

  const result = startPractice(
    {
      mode: body.mode,
      count: Math.min(200, Math.max(1, Math.round(body.count))),
      section: body.section,
      category: body.category,
      subtopic: body.subtopic,
      durationMinutes: body.durationMinutes ?? null,
    },
    rawDb(),
  );

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      sessionId: result.session.id,
      shortfalls: result.shortfalls,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      reason: result.reason,
      message: result.message,
      sessionId: "session" in result ? result.session.id : null,
    },
    { status: 409 },
  );
}
