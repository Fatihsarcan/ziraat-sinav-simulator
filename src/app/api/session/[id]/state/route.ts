import { NextResponse } from "next/server";
import { db } from "../../../../../lib/server.ts";
import { getSessionState } from "../../../../../core/exam-engine.ts";

export const dynamic = "force-dynamic";

/**
 * Istemci sayaci bu ucdan senkronize olur. Kalan sure DAIMA sunucudaki
 * `deadline_at` degerinden hesaplanir; sayfa yenilense de sifirlanmaz.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const database = db(); // suresi dolmus oturumlari otomatik teslim eder
  const state = getSessionState(Number(id), database);
  if (!state) return NextResponse.json({ ok: false, message: "Oturum bulunamadı." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    status: state.session.status,
    remainingSeconds: state.remainingSeconds,
    expired: state.expired,
    counts: state.counts,
    serverTime: new Date().toISOString(),
  });
}
