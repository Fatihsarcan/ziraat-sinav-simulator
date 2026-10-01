import { NextResponse } from "next/server";
import { rawDb } from "../../../../../lib/server.ts";
import { updateAnswers, type AnswerUpdate } from "../../../../../core/exam-engine.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { updates?: AnswerUpdate[] } | null;
  if (!body?.updates || !Array.isArray(body.updates)) {
    return NextResponse.json({ ok: false, message: "Geçersiz istek." }, { status: 400 });
  }

  const result = updateAnswers(Number(id), body.updates, rawDb());
  if (result.rejected) {
    return NextResponse.json({ ok: false, message: result.rejected }, { status: 409 });
  }
  return NextResponse.json({ ok: true, accepted: result.accepted });
}
