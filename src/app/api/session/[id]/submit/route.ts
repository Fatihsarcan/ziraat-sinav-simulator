import { NextResponse } from "next/server";
import { rawDb } from "../../../../../lib/server.ts";
import { submitSession } from "../../../../../core/exam-engine.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { auto?: boolean };
  try {
    const result = submitSession(Number(id), { auto: body.auto === true }, rawDb());
    return NextResponse.json({ ok: true, score: result.score, passed: result.passed });
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 400 });
  }
}
