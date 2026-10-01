import { NextResponse } from "next/server";
import { rawDb } from "../../../lib/server.ts";
import { importJson, type ExportPayload } from "../../../lib/backup.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { payload?: ExportPayload; mode?: "merge" | "replace" }
    | null;
  if (!body?.payload) {
    return NextResponse.json({ ok: false, message: "Dosya içeriği okunamadı." }, { status: 400 });
  }
  try {
    const result = importJson(body.payload, { mode: body.mode ?? "merge" }, rawDb());
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 400 });
  }
}
