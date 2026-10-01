import { NextResponse } from "next/server";
import { rawDb } from "../../../../lib/server.ts";
import { importReferenceSource } from "../../../../question-engine/import-reference.ts";
import { recomputeAllStyleProfiles } from "../../../../question-engine/style-analyzer.ts";
import { SOURCE_LEVEL_KEYS, type SourceLevel } from "../../../../config/exam-style.ts";

export const dynamic = "force-dynamic";
/** Buyuk PDF'lerin ayristirilmasi uzun surebilir. */
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;

function detectKind(filename: string, declared: string | null): "pdf" | "json" | "txt" | null {
  const lowered = filename.toLowerCase();
  if (declared === "pdf" || declared === "json" || declared === "txt") return declared;
  if (lowered.endsWith(".pdf")) return "pdf";
  if (lowered.endsWith(".json")) return "json";
  if (lowered.endsWith(".txt") || lowered.endsWith(".md")) return "txt";
  return null;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Dosya okunamadı. Formu tekrar gönderin." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Dosya seçilmedi." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, message: `Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Sınır 25 MB.` },
      { status: 400 },
    );
  }

  const kind = detectKind(file.name, (form.get("kind") as string | null) ?? null);
  if (!kind) {
    return NextResponse.json(
      { ok: false, message: "Desteklenmeyen dosya türü. PDF, JSON veya TXT gönderin." },
      { status: 400 },
    );
  }

  const sourceLevel = String(form.get("sourceLevel") ?? "") as SourceLevel;
  if (!SOURCE_LEVEL_KEYS.includes(sourceLevel)) {
    return NextResponse.json(
      { ok: false, message: "Kaynak güven seviyesi (A–E) seçilmedi." },
      { status: 400 },
    );
  }

  const sourceName = String(form.get("sourceName") ?? "").trim();
  if (sourceName.length < 3) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Kaynak adı gerekli. Kaynağı bilinmeyen soru 'çıkmış soru' olarak işaretlenemez.",
      },
      { status: 400 },
    );
  }

  const yearRaw = String(form.get("sourceYear") ?? "").trim();
  const sourceYear = yearRaw.length > 0 && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  const sourceUrl = String(form.get("sourceUrl") ?? "").trim() || null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = kind === "pdf" ? buffer : buffer.toString("utf8");

  try {
    const database = rawDb();
    const result = importReferenceSource(
      { filename: file.name, kind, sourceLevel, sourceName, sourceYear, sourceUrl },
      content,
      database,
    );
    // Yeni referanslar stil profilini degistirir.
    recomputeAllStyleProfiles(database);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: `İçe aktarma başarısız: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
