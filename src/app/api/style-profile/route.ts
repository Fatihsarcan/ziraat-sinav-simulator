import { NextResponse } from "next/server";
import { rawDb } from "../../../lib/server.ts";
import {
  allStyleProfiles,
  recomputeAllStyleProfiles,
} from "../../../question-engine/style-analyzer.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, profiles: allStyleProfiles(rawDb()) });
}

/** Stil profillerini yeniden hesaplar (referans seti degistiginde). */
export async function POST() {
  const profiles = recomputeAllStyleProfiles(rawDb());
  return NextResponse.json({ ok: true, profiles });
}
