import { NextResponse } from "next/server";
import { rawDb } from "../../../../lib/server.ts";
import { deleteQuestion, setQualityStatus } from "../../../../db/repos/questions.ts";
import type { QualityStatus } from "../../../../core/types.ts";

export const dynamic = "force-dynamic";

const ALLOWED: QualityStatus[] = ["verified", "review_needed", "rejected"];

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as
    | { qualityStatus?: QualityStatus; notes?: string }
    | null;
  if (!body?.qualityStatus || !ALLOWED.includes(body.qualityStatus)) {
    return NextResponse.json({ ok: false, message: "Geçersiz durum." }, { status: 400 });
  }
  setQualityStatus(Number(id), body.qualityStatus, body.notes ?? null, rawDb());
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    deleteQuestion(Number(id), rawDb());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Soru silinemedi — geçmiş bir sınavda kullanılmış olabilir. Bunun yerine 'Reddedildi' olarak işaretle. " +
          `(${(error as Error).message})`,
      },
      { status: 409 },
    );
  }
}
