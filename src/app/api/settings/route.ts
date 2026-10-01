import { NextResponse } from "next/server";
import { rawDb } from "../../../lib/server.ts";
import { saveExamConfigOverride, type ExamConfigOverride } from "../../../config/load-config.ts";
import { SETTING_KEYS, setSetting } from "../../../db/repos/settings.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { override?: ExamConfigOverride; generationModel?: string }
    | null;
  if (!body) return NextResponse.json({ ok: false, message: "Geçersiz istek." }, { status: 400 });

  const database = rawDb();
  try {
    if (body.generationModel !== undefined) {
      setSetting(SETTING_KEYS.generationModel, body.generationModel.trim(), database);
    }
    if (body.override) {
      const config = saveExamConfigOverride(body.override, database);
      return NextResponse.json({ ok: true, config });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 400 });
  }
}
