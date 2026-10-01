"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "../_components/ui.tsx";
import { SOURCE_LEVELS } from "../../config/exam-style.ts";

interface ImportResult {
  batchId: number;
  detected: number;
  imported: number;
  duplicates: number;
  rejected: number;
  withAnswer: number;
  unclassified: number;
  warnings: string[];
  rejectedSamples: { questionText: string; reasons: string[] }[];
}

export function ImportPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/reference/import", {
        method: "POST",
        body: new FormData(form),
      });
      const payload = (await response.json()) as
        | { ok: true; result: ImportResult }
        | { ok: false; message: string };

      if (!payload.ok) {
        setError(payload.message);
        return;
      }
      setResult(payload.result);
      form.reset();
      router.refresh();
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Kaynak İçe Aktar"
      subtitle="PDF, JSON veya TXT. Cevap anahtarı varsa aynı dosyada olması yeterli — otomatik eşleştirilir."
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12px] text-[var(--text-muted)]">Dosya (PDF / JSON / TXT)</span>
            <input
              type="file"
              name="file"
              accept=".pdf,.json,.txt,.md"
              required
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-[12px] text-[var(--text-muted)]">Kaynak güven seviyesi</span>
            <select name="sourceLevel" required defaultValue="B" className="select mt-1">
              {SOURCE_LEVELS.filter((l) => l.level !== "E").map((level) => (
                <option key={level.level} value={level.level}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[12px] text-[var(--text-muted)]">
              Kaynak adı (zorunlu — kaynağı bilinmeyen soru &ldquo;çıkmış soru&rdquo; sayılmaz)
            </span>
            <input
              type="text"
              name="sourceName"
              required
              minLength={3}
              placeholder="ör. Ziraat Bankası Uzman Yrd. 2025 soru kitapçığı"
              className="input mt-1"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] text-[var(--text-muted)]">Yıl</span>
              <input
                type="text"
                name="sourceYear"
                inputMode="numeric"
                pattern="\d{4}"
                placeholder="2025"
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-[var(--text-muted)]">Kaynak URL (varsa)</span>
              <input type="url" name="sourceUrl" placeholder="https://..." className="input mt-1" />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "İşleniyor…" : "İçe aktar"}
          </button>
          <span className="text-[12px] text-[var(--text-muted)]">
            Taranmış (görüntü) PDF&apos;lerden metin çıkarılamaz — o durumda metni kopyalayıp
            .txt olarak yükle.
          </span>
        </div>
      </form>

      {error ? (
        <p className="mt-3 text-[13px]" style={{ color: "var(--fail)" }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-2 text-[13px]">
          <p>
            <b>{result.detected}</b> soru tespit edildi · <b>{result.imported}</b> eklendi ·{" "}
            <b>{result.duplicates}</b> tekrar · <b>{result.rejected}</b> elendi ·{" "}
            <b>{result.withAnswer}</b> tanesinin cevabı biliniyor.
          </p>
          {result.unclassified > 0 ? (
            <p style={{ color: "var(--warn)" }}>
              {result.unclassified} soru bir müfredat konusuna bağlanamadı — inceleme
              kuyruğunda kategoriyi elle seçmen gerekecek.
            </p>
          ) : null}
          {result.warnings.map((warning, i) => (
            <p key={i} style={{ color: "var(--warn)" }}>
              ⚠ {warning}
            </p>
          ))}
          {result.rejectedSamples.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-[var(--text-muted)]">
                Elenen örnekler ({result.rejectedSamples.length})
              </summary>
              <ul className="mt-2 space-y-1 pl-4 list-disc text-[12px] text-[var(--text-muted)]">
                {result.rejectedSamples.map((sample, i) => (
                  <li key={i}>
                    {sample.questionText}
                    <span className="block" style={{ color: "var(--fail)" }}>
                      {sample.reasons.join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
