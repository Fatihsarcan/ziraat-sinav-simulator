import { NextResponse } from "next/server";
import { rawDb } from "../../../../../lib/server.ts";
import { cancelSession } from "../../../../../core/exam-engine.ts";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  cancelSession(Number(id), rawDb());
  return NextResponse.json({ ok: true });
}
