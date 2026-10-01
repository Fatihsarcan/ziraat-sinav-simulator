"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OptionKey, QualityStatus } from "../../core/types.ts";
import { DIFFICULTY_LABEL, STATUS_LABEL, dateTR } from "../../lib/format.ts";
import { Explanation } from "../_components/ui.tsx";

const OPTIONS: OptionKey[] = ["A", "B", "C", "D"];

export interface QuestionRowView {
  id: number;
  section: string;
  sectionLabel: string;
  category: string;
  subtopic: string;
  difficulty: "easy" | "medium" | "hard";
  cefrLevel: string | null;
  questionText: string;
  passage: string | null;
  options: Record<OptionKey, string>;
  correctAnswer: OptionKey;
  explanation: string;
  explanationTr: string | null;
  qualityStatus: QualityStatus;
  qualityNotes: string | null;
  origin: string;
  generatorModel: string | null;
  source: string | null;
  sourceUrl: string | null;
  timeSensitive: boolean;
  createdAt: string;
  timesAsked: number;
  timesCorrect: number;
  timesWrong: number;
  lastAskedAt: string | null;
  avgAnswerMs: number | null;

  // Stil / kavram / kalite katmani
  concept: string | null;
  styleTypeLabel: string | null;
  qualityScore: number | null;
  estimatedSeconds: number | null;
  isNegative: boolean;
  historical: boolean;
  sourceLevel: string | null;
  sourceYear: number | null;
}

const STATUS_TONE: Record<QualityStatus, string> = {
  verified: "pass",
  review_needed: "warn",
  rejected: "fail",
};

export function QuestionTable({ rows }: { rows: QuestionRowView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: number, status: QualityStatus) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qualityStatus: status, notes: "Elle güncellendi." }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!data.ok) setError(data.message ?? "Güncellenemedi.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">Soru bulunamadı.</p>;
  }

  return (
    <div>
      {error ? (
        <div className="rounded-lg p-3 text-[13px] mb-3" style={{ background: "var(--fail-soft)" }}>
          {error}
        </div>
      ) : null}

      <ul className="space-y-2">
        {rows.map((row) => {
          const expanded = open === row.id;
          const accuracy =
            row.timesAsked === 0 ? null : Math.round((row.timesCorrect / row.timesAsked) * 100);
          return (
            <li key={row.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full text-left p-3 flex items-start gap-3 hover:bg-[var(--surface-2)]"
                onClick={() => setOpen(expanded ? null : row.id)}
              >
                <span className="mono text-[11px] text-[var(--text-subtle)] shrink-0 pt-0.5">
                  #{row.id}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] leading-snug line-clamp-2">
                    {row.questionText}
                  </span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-1">
                    {row.sectionLabel} · {row.category} › {row.subtopic} ·{" "}
                    {DIFFICULTY_LABEL[row.difficulty]}
                    {row.cefrLevel ? ` · ${row.cefrLevel}` : ""} · {row.origin}
                    {row.timesAsked > 0
                      ? ` · ${row.timesAsked} kez soruldu (%${accuracy} doğru)`
                      : " · hiç sorulmadı"}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-1.5">
                  {row.historical ? (
                    <span className="badge badge-info" title="Gerçek/eski sınav sorusu — gerçek sınav simülasyonuna girmez">
                      çıkmış{row.sourceYear ? ` ${row.sourceYear}` : ""}
                    </span>
                  ) : null}
                  {row.timeSensitive ? <span className="badge badge-info">zamana bağlı</span> : null}
                  {row.qualityScore !== null ? (
                    <span
                      className={`badge badge-${row.qualityScore >= 85 ? "pass" : row.qualityScore >= 70 ? "info" : "warn"}`}
                      title="Kalite skoru (0-100). 70'in altı gerçek sınava alınmaz."
                    >
                      {row.qualityScore}
                    </span>
                  ) : null}
                  <span className={`badge badge-${STATUS_TONE[row.qualityStatus]}`}>
                    {STATUS_LABEL[row.qualityStatus]}
                  </span>
                </span>
              </button>

              {expanded ? (
                <div className="px-3 pb-3 border-t border-[var(--border)] pt-3">
                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    {row.concept ? (
                      <span>
                        <b>Ölçülen kavram:</b> {row.concept}
                      </span>
                    ) : null}
                    {row.styleTypeLabel ? (
                      <span>
                        <b>Soru tipi:</b> {row.styleTypeLabel}
                      </span>
                    ) : null}
                    {row.estimatedSeconds ? (
                      <span>
                        <b>Tahmini süre:</b> {row.estimatedSeconds} sn
                      </span>
                    ) : null}
                    {row.isNegative ? <span>olumsuz kök (&ldquo;hangisi değildir&rdquo;)</span> : null}
                    {row.sourceLevel ? (
                      <span>
                        <b>Kaynak seviyesi:</b> {row.sourceLevel}
                      </span>
                    ) : null}
                  </div>
                  {row.passage ? (
                    <div className="mb-3 p-3 rounded-lg bg-[var(--surface-2)] scroll-x">
                      <pre className="mono text-[12px] whitespace-pre-wrap m-0">{row.passage}</pre>
                    </div>
                  ) : null}

                  <div className="space-y-1.5 mb-3">
                    {OPTIONS.map((option) => (
                      <div
                        key={option}
                        className="flex items-start gap-2.5 p-2 rounded-md text-[13px]"
                        style={{
                          background:
                            option === row.correctAnswer ? "var(--pass-soft)" : "transparent",
                        }}
                      >
                        <span className="mono font-semibold shrink-0 w-5">{option}</span>
                        <span className="flex-1">{row.options[option]}</span>
                        {option === row.correctAnswer ? (
                          <span className="badge badge-pass">Doğru</span>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <Explanation
                    text={row.explanation}
                    turkish={row.explanationTr}
                    className="mb-3"
                  />

                  <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[12px] mb-3">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted)]">Oluşturulma</dt>
                      <dd className="mono">{dateTR(row.createdAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted)]">Son soruluş</dt>
                      <dd className="mono">{row.lastAskedAt ? dateTR(row.lastAskedAt) : "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted)]">Doğru / Yanlış</dt>
                      <dd className="mono">
                        {row.timesCorrect} / {row.timesWrong}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-muted)]">Ortalama cevap süresi</dt>
                      <dd className="mono">
                        {row.avgAnswerMs === null ? "—" : `${Math.round(row.avgAnswerMs / 1000)} sn`}
                      </dd>
                    </div>
                    {row.generatorModel ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--text-muted)]">Üreten model</dt>
                        <dd className="mono">{row.generatorModel}</dd>
                      </div>
                    ) : null}
                    {row.sourceUrl ? (
                      <div className="flex justify-between gap-2 sm:col-span-2">
                        <dt className="text-[var(--text-muted)]">Kaynak</dt>
                        <dd className="truncate">
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                            style={{ color: "var(--accent)" }}
                          >
                            {row.source ?? row.sourceUrl}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {row.qualityNotes ? (
                    <div
                      className="rounded-lg p-2.5 text-[12px] mb-3"
                      style={{ background: "var(--warn-soft)" }}
                    >
                      <b>Kalite notları:</b> {row.qualityNotes}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {(["verified", "review_needed", "rejected"] as QualityStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="btn text-[12px] py-1"
                        disabled={busy === row.id || row.qualityStatus === status}
                        onClick={() => void setStatus(row.id, status)}
                        style={
                          row.qualityStatus === status
                            ? { opacity: 0.5 }
                            : status === "rejected"
                              ? { color: "var(--fail)", borderColor: "var(--fail)" }
                              : undefined
                        }
                      >
                        {STATUS_LABEL[status]} olarak işaretle
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
