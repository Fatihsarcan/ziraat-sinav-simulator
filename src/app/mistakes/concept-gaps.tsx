"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, EmptyState } from "../_components/ui.tsx";

export interface ConceptGapView {
  concept: string;
  category: string;
  subtopic: string;
  wrongCount: number;
  unresolvedCount: number;
  lastWrongAt: string;
}

interface Outcome {
  requested: number;
  generated: number;
  accepted: number;
  reviewNeeded: number;
  rejected: number;
  duplicates: number;
  error: string | null;
}

/**
 * KAVRAM BOSLUKLARI (sartname #8)
 *
 * Yanlis yapilan her kavram icin: ayni soruyu tekrar sormak yerine AYNI
 * KAVRAMI farkli senaryoyla olcen YENI soru uretimi baslatilabilir.
 */
export function ConceptGaps({
  gaps,
  generationAvailable,
  generationReason,
}: {
  gaps: ConceptGapView[];
  generationAvailable: boolean;
  generationReason: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(gap: ConceptGapView) {
    setBusy(gap.concept);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/generation/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: gap.concept,
          category: gap.category,
          subtopic: gap.subtopic,
          count: 4,
        }),
      });
      const payload = (await response.json()) as
        | { ok: true; outcome: Outcome }
        | { ok: false; message?: string; outcome?: Outcome };

      if (!payload.ok) {
        setError(payload.message ?? payload.outcome?.error ?? "Üretim başarısız.");
        return;
      }
      const o = payload.outcome;
      setMessage(
        `“${gap.concept}” için ${o.generated} soru üretildi: ${o.accepted} onaylı, ` +
          `${o.reviewNeeded} beklemede, ${o.rejected} elendi, ${o.duplicates} tekrar.`,
      );
      router.refresh();
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Yanlış Yaptığın Kavramlar"
      subtitle="Aynı soruyu tekrar sormak yerine aynı kavramı farklı senaryoyla ölçen yeni soru üret."
      padded={false}
    >
      {gaps.length === 0 ? (
        <EmptyState
          title="Henüz kavram boşluğu yok"
          description="Bir sınav veya çalışma tamamladığında yanlışların burada kavram bazında toplanır."
        />
      ) : (
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Kavram</th>
                <th>Kategori › Alt konu</th>
                <th className="text-right">Yanlış</th>
                <th className="text-right">Açık</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr key={gap.concept + gap.subtopic}>
                  <td className="font-medium">{gap.concept}</td>
                  <td className="text-[12px] text-[var(--text-muted)]">
                    {gap.category} › {gap.subtopic}
                  </td>
                  <td className="mono text-right">{gap.wrongCount}</td>
                  <td className="text-right">
                    {gap.unresolvedCount > 0 ? (
                      <Badge tone="warn">{gap.unresolvedCount}</Badge>
                    ) : (
                      <Badge tone="pass">0</Badge>
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn"
                      disabled={!generationAvailable || busy !== null}
                      title={generationAvailable ? undefined : (generationReason ?? undefined)}
                      onClick={() => void generate(gap)}
                    >
                      {busy === gap.concept ? "Üretiliyor…" : "Bu kavramdan yeni soru üret"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!generationAvailable ? (
        <p className="p-4 pt-0 text-[12px] text-[var(--text-muted)]">{generationReason}</p>
      ) : null}
      {message ? (
        <p className="p-4 pt-0 text-[13px]" style={{ color: "var(--pass)" }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="p-4 pt-0 text-[13px]" style={{ color: "var(--fail)" }}>
          {error}
        </p>
      ) : null}
    </Card>
  );
}
