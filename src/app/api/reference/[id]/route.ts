import { NextResponse } from "next/server";
import { rawDb } from "../../../../lib/server.ts";
import { reviewReferenceQuestion } from "../../../../question-engine/reference-review.ts";
import { recomputeAllStyleProfiles } from "../../../../question-engine/style-analyzer.ts";
import type { ReviewState } from "../../../../config/exam-style.ts";
import type { Difficulty, SectionId } from "../../../../core/types.ts";

export const dynamic = "force-dynamic";

const STATES: ReviewState[] = ["pending", "approved", "rejected"];

interface Body {
  state?: ReviewState;
  notes?: string | null;
  section?: SectionId;
  category?: string;
  subtopic?: string;
  difficulty?: Difficulty;
  correctIndex?: number;
  explanation?: string;
  timeSensitive?: boolean;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;

  if (!body?.state || !STATES.includes(body.state)) {
    return NextResponse.json(
      { ok: false, message: "Geçersiz durum. pending / approved / rejected bekleniyor." },
      { status: 400 },
    );
  }

  const database = rawDb();
  const result = reviewReferenceQuestion(
    Number(id),
    body.state,
    {
      notes: body.notes ?? null,
      overrides: {
        section: body.section,
        category: body.category,
        subtopic: body.subtopic,
        difficulty: body.difficulty,
        correctIndex: body.correctIndex,
        explanation: body.explanation,
        timeSensitive: body.timeSensitive,
      },
    },
    database,
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 409 });
  }

  // Onay/ret stil profiline dahil olan kumeyi degistirir.
  recomputeAllStyleProfiles(database);
  return NextResponse.json({ ok: true, message: result.message, questionId: result.questionId });
}
