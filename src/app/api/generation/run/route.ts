import { NextResponse } from "next/server";
import { rawDb } from "../../../../lib/server.ts";
import {
  generateForCategory,
  generationPlan,
  generationStatus,
  runGenerationPlan,
} from "../../../../question-engine/index.ts";

export const dynamic = "force-dynamic";
// Web arastirmasi + uretim + dogrulama uzun surebilir.
export const maxDuration = 600;

export async function POST(request: Request) {
  const status = generationStatus();
  if (!status.available) {
    return NextResponse.json({ ok: false, message: status.reason }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "plan" | "category";
    category?: string;
    section?: "general" | "english" | "technical";
    subtopic?: string;
    count?: number;
    maxSteps?: number;
  };

  const database = rawDb();

  try {
    if (body.mode === "category" && body.category && body.section) {
      const outcome = await generateForCategory(
        {
          section: body.section,
          category: body.category,
          subtopics: body.subtopic ? [body.subtopic] : undefined,
          count: Math.min(20, Math.max(1, body.count ?? 8)),
        },
        database,
      );
      return NextResponse.json({ ok: outcome.error === null, outcome });
    }

    const plan = generationPlan({ maxSteps: Math.min(8, body.maxSteps ?? 3) }, database);
    if (plan.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Tüm kategoriler eşiğin üzerinde — üretilecek bir şey yok.",
        result: null,
      });
    }
    const result = await runGenerationPlan(plan, database);
    return NextResponse.json({ ok: !result.aborted, result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 });
  }
}
