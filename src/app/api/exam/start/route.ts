import { NextResponse } from "next/server";
import { rawDb } from "../../../../lib/server.ts";
import { startFullExam } from "../../../../core/exam-engine.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { allowPartial?: boolean };
  const result = startFullExam({ allowPartial: body.allowPartial === true }, rawDb());

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
      shortfalls: "shortfalls" in result ? result.shortfalls : [],
      sessionId: "session" in result ? result.session.id : null,
    },
    { status: 409 },
  );
}
