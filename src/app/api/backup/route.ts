import { NextResponse } from "next/server";
import { rawDb } from "../../../lib/server.ts";
import { createBackup, listBackups } from "../../../lib/backup.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  rawDb();
  return NextResponse.json({ ok: true, backups: listBackups() });
}

export async function POST() {
  rawDb();
  try {
    return NextResponse.json({ ok: true, backup: createBackup() });
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 });
  }
}
