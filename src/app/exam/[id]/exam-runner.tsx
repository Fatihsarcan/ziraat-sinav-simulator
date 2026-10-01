"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamQuestionView, OptionKey, SectionId } from "../../../core/types.ts";
import { clock } from "../../../lib/format.ts";

const OPTIONS: OptionKey[] = ["A", "B", "C", "D"];
/** Bekleyen degisiklikler bu araliklarla sunucuya yazilir. */
const FLUSH_INTERVAL_MS = 4000;
/** Sayac sunucu saatiyle bu araliklarla yeniden hizalanir. */
const RESYNC_INTERVAL_MS = 20_000;

export interface RunnerProps {
  sessionId: number;
  label: string;
  isFullExam: boolean;
  questions: ExamQuestionView[];
  initialRemainingSeconds: number | null;
  sectionRanges: { sectionId: SectionId; label: string; from: number; to: number }[];
}

interface LocalAnswer {
  selected: OptionKey | null;
  flagged: boolean;
  /** Sunucuya henuz yazilmamis sure (ms). */
  pendingTimeMs: number;
  dirty: boolean;
}

export function ExamRunner(props: RunnerProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(props.initialRemainingSeconds);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<number, LocalAnswer>>(() => {
    const initial: Record<number, LocalAnswer> = {};
    for (const q of props.questions) {
      initial[q.questionId] = {
        selected: q.selectedAnswer,
        flagged: q.flagged,
        pendingTimeMs: 0,
        dirty: false,
      };
    }
    return initial;
  });

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const questionEnteredAt = useRef<number>(Date.now());
  const submittedRef = useRef(false);

  const current = props.questions[index]!;
  const total = props.questions.length;

  // --- Sunucuya yazma --------------------------------------------------------
  const flush = useCallback(
    async (keepalive = false) => {
      const snapshot = answersRef.current;
      const updates = Object.entries(snapshot)
        .filter(([, a]) => a.dirty || a.pendingTimeMs > 0)
        .map(([questionId, a]) => ({
          questionId: Number(questionId),
          selectedAnswer: a.selected,
          flagged: a.flagged,
          addTimeMs: a.pendingTimeMs,
        }));
      if (updates.length === 0) return;

      // Iyimser temizleme: ayni degisiklik iki kez gonderilmesin.
      setAnswers((prev) => {
        const next = { ...prev };
        for (const u of updates) {
          const entry = next[u.questionId];
          if (entry) next[u.questionId] = { ...entry, pendingTimeMs: 0, dirty: false };
        }
        return next;
      });

      try {
        const body = JSON.stringify({ updates });
        if (keepalive && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
          navigator.sendBeacon(
            `/api/session/${props.sessionId}/answer`,
            new Blob([body], { type: "application/json" }),
          );
          return;
        }
        await fetch(`/api/session/${props.sessionId}/answer`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive,
        });
      } catch {
        setError("Cevaplar kaydedilemedi — bağlantı sorunu olabilir. Tekrar denenecek.");
      }
    },
    [props.sessionId],
  );

  /** Aktif soruda gecen sureyi biriktirir. */
  const accumulateTime = useCallback(() => {
    const now = Date.now();
    const elapsed = now - questionEnteredAt.current;
    questionEnteredAt.current = now;
    if (elapsed <= 0) return;
    const questionId = props.questions[index]!.questionId;
    setAnswers((prev) => {
      const entry = prev[questionId];
      if (!entry) return prev;
      return { ...prev, [questionId]: { ...entry, pendingTimeMs: entry.pendingTimeMs + elapsed } };
    });
  }, [index, props.questions]);

  const submit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      accumulateTime();
      await flush();
      try {
        await fetch(`/api/session/${props.sessionId}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ auto }),
        });
      } catch {
        /* sunucu zaten suresi dolan oturumu otomatik teslim eder */
      }
      router.replace(`/exam/${props.sessionId}/result`);
    },
    [accumulateTime, flush, props.sessionId, router],
  );

  // --- Sayac ---------------------------------------------------------------
  useEffect(() => {
    if (remaining === null) return;
    const tick = setInterval(() => {
      setRemaining((value) => {
        if (value === null) return null;
        const next = value - 1;
        if (next <= 0) {
          void submit(true); // SURE BITTI -> OTOMATIK TESLIM
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [remaining === null, submit]);

  // --- Sunucu ile yeniden hizalama -----------------------------------------
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/session/${props.sessionId}/state`, { cache: "no-store" });
        const data = (await res.json()) as {
          ok: boolean;
          status: string;
          remainingSeconds: number | null;
          expired: boolean;
        };
        if (!data.ok) return;
        if (data.status === "submitted" && !submittedRef.current) {
          submittedRef.current = true;
          router.replace(`/exam/${props.sessionId}/result`);
          return;
        }
        // Sunucu kaynagi otoritedir; yerel sapma duzeltilir.
        if (data.remainingSeconds !== null) setRemaining(data.remainingSeconds);
      } catch {
        /* cevrimdisi olunabilir; yerel sayac calismaya devam eder */
      }
    }, RESYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [props.sessionId, router]);

  // --- Periyodik kaydetme ---------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      accumulateTime();
      void flush();
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [accumulateTime, flush]);

  // --- Sayfa kapanirken son kaydetme ---------------------------------------
  useEffect(() => {
    function onHide() {
      accumulateTime();
      void flush(true);
    }
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    return () => window.removeEventListener("pagehide", onHide);
  }, [accumulateTime, flush]);

  // --- Klavye kisayollari ---------------------------------------------------
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toUpperCase();
      if (OPTIONS.includes(key as OptionKey)) {
        select(key as OptionKey);
      } else if (event.key === "ArrowRight") {
        goTo(index + 1);
      } else if (event.key === "ArrowLeft") {
        goTo(index - 1);
      } else if (key === "F") {
        toggleFlag();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- Eylemler -------------------------------------------------------------
  function goTo(next: number) {
    if (next < 0 || next >= total || next === index) return;
    accumulateTime();
    setIndex(next);
    void flush();
  }

  function select(option: OptionKey) {
    setAnswers((prev) => {
      const entry = prev[current.questionId];
      if (!entry) return prev;
      // Ayni secenege tekrar tiklanirsa cevap temizlenir (bos birakma).
      const selected = entry.selected === option ? null : option;
      return { ...prev, [current.questionId]: { ...entry, selected, dirty: true } };
    });
  }

  function toggleFlag() {
    setAnswers((prev) => {
      const entry = prev[current.questionId];
      if (!entry) return prev;
      return { ...prev, [current.questionId]: { ...entry, flagged: !entry.flagged, dirty: true } };
    });
  }

  const counts = useMemo(() => {
    let answered = 0;
    let flagged = 0;
    for (const q of props.questions) {
      const a = answers[q.questionId];
      if (a?.selected) answered += 1;
      if (a?.flagged) flagged += 1;
    }
    return { answered, flagged, blank: total - answered };
  }, [answers, props.questions, total]);

  const timeTone =
    remaining === null
      ? "var(--text)"
      : remaining < 300
        ? "var(--fail)"
        : remaining < 900
          ? "var(--warn)"
          : "var(--text)";

  const currentAnswer = answers[current.questionId];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      {/* --- Üst bar --- */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center gap-4">
          <div className="font-semibold text-[14px] whitespace-nowrap">
            Soru {current.position} / {total}
          </div>
          <span className="badge badge-muted">{current.sectionLabel}</span>

          <div className="flex-1" />

          <div className="hidden sm:flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
            <span>
              Cevaplanan <b className="mono text-[var(--text)]">{counts.answered}</b>
            </span>
            <span>
              Boş <b className="mono text-[var(--text)]">{counts.blank}</b>
            </span>
            <span>
              İşaretli <b className="mono text-[var(--text)]">{counts.flagged}</b>
            </span>
          </div>

          {remaining !== null ? (
            <div
              className="mono text-[20px] font-semibold tabular-nums"
              style={{ color: timeTone }}
              aria-live="polite"
              aria-label="Kalan süre"
            >
              {clock(remaining)}
            </div>
          ) : (
            <span className="text-[12px] text-[var(--text-muted)]">Süresiz</span>
          )}

          <button type="button" className="btn" onClick={() => setShowNav((v) => !v)}>
            {showNav ? "Paneli gizle" : "Panel"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowConfirm(true)}
            disabled={submitting}
          >
            Sınavı Bitir
          </button>
        </div>
      </header>

      {error ? (
        <div className="bg-[var(--warn-soft)] text-[var(--warn)] text-[12px] px-4 py-1.5 text-center">
          {error}
        </div>
      ) : null}

      <div className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-6 grid gap-5 lg:grid-cols-[1fr_260px]">
        {/* --- Soru --- */}
        <div>
          <div className="card p-5">
            {current.passage ? (
              <div className="mb-4 p-3.5 rounded-lg bg-[var(--surface-2)] scroll-x">
                <pre className="mono text-[12.5px] whitespace-pre-wrap leading-relaxed m-0">
                  {current.passage}
                </pre>
              </div>
            ) : null}

            <p className="text-[15px] leading-relaxed font-medium mb-5 whitespace-pre-wrap">
              {current.questionText}
            </p>

            <div className="space-y-2">
              {OPTIONS.map((option) => {
                const selected = currentAnswer?.selected === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => select(option)}
                    className="w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors"
                    style={{
                      borderColor: selected ? "var(--accent)" : "var(--border)",
                      background: selected ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    <span
                      className="mono shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[12px] font-semibold"
                      style={{
                        background: selected ? "var(--accent)" : "var(--surface-2)",
                        color: selected ? "var(--accent-text)" : "var(--text-muted)",
                      }}
                    >
                      {option}
                    </span>
                    <span className="text-[14px] leading-relaxed">{current.options[option]}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-[var(--text-subtle)] mt-4">
              Kısayollar: A/B/C/D seçim · ← → gezinme · F işaretle. Seçili şıkka tekrar tıklayarak
              cevabı boşaltabilirsin.
            </p>
          </div>

          {/* --- Gezinme --- */}
          <div className="flex items-center gap-2 mt-4">
            <button type="button" className="btn" onClick={() => goTo(index - 1)} disabled={index === 0}>
              ← Önceki
            </button>
            <button
              type="button"
              className="btn"
              onClick={toggleFlag}
              style={
                currentAnswer?.flagged
                  ? { background: "var(--warn-soft)", color: "var(--warn)", borderColor: "var(--warn)" }
                  : undefined
              }
            >
              {currentAnswer?.flagged ? "★ İşaretli" : "☆ İncelemek için işaretle"}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => goTo(index + 1)}
              disabled={index === total - 1}
            >
              Sonraki →
            </button>
          </div>
        </div>

        {/* --- Soru navigasyon paneli --- */}
        {showNav ? (
          <aside className="card p-3 h-fit lg:sticky lg:top-[72px]">
            <div className="flex flex-wrap gap-2 text-[11px] mb-3">
              <span className="flex items-center gap-1.5">
                <i className="w-3 h-3 rounded-[3px] inline-block" style={{ background: "var(--accent)" }} />
                Cevaplı
              </span>
              <span className="flex items-center gap-1.5">
                <i
                  className="w-3 h-3 rounded-[3px] inline-block border"
                  style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
                />
                Boş
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-3 h-3 rounded-[3px] inline-block" style={{ background: "var(--warn)" }} />
                İşaretli
              </span>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {props.sectionRanges.map((range) => (
                <div key={range.sectionId}>
                  <div className="text-[11px] font-semibold text-[var(--text-subtle)] uppercase mb-1.5">
                    {range.label} ({range.from}–{range.to})
                  </div>
                  <div className="grid grid-cols-8 gap-1">
                    {props.questions
                      .filter((q) => q.position >= range.from && q.position <= range.to)
                      .map((q) => {
                        const a = answers[q.questionId];
                        const isCurrent = q.position === current.position;
                        const background = a?.flagged
                          ? "var(--warn)"
                          : a?.selected
                            ? "var(--accent)"
                            : "var(--surface)";
                        const color =
                          a?.flagged || a?.selected ? "var(--accent-text)" : "var(--text-muted)";
                        return (
                          <button
                            key={q.questionId}
                            type="button"
                            onClick={() => goTo(props.questions.indexOf(q))}
                            title={`Soru ${q.position}`}
                            className="mono text-[10px] h-6 rounded-[4px] border"
                            style={{
                              background,
                              color,
                              borderColor: isCurrent ? "var(--text)" : "var(--border-strong)",
                              borderWidth: isCurrent ? 2 : 1,
                              fontWeight: isCurrent ? 700 : 500,
                            }}
                          >
                            {q.position}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        ) : null}
      </div>

      {/* --- Teslim onayı --- */}
      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgb(0 0 0 / 0.5)" }}>
          <div className="card p-5 max-w-md w-full">
            <h2 className="font-semibold text-[16px] mb-2">Sınavı teslim et</h2>
            <p className="text-[13px] text-[var(--text-muted)] mb-3">
              Teslim ettikten sonra cevapları değiştiremezsin.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="p-2 rounded-lg bg-[var(--surface-2)]">
                <div className="mono text-[20px] font-semibold">{counts.answered}</div>
                <div className="text-[11px] text-[var(--text-muted)]">Cevaplı</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--surface-2)]">
                <div className="mono text-[20px] font-semibold" style={{ color: counts.blank > 0 ? "var(--fail)" : undefined }}>
                  {counts.blank}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">Boş</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--surface-2)]">
                <div className="mono text-[20px] font-semibold">{counts.flagged}</div>
                <div className="text-[11px] text-[var(--text-muted)]">İşaretli</div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn" onClick={() => setShowConfirm(false)} disabled={submitting}>
                Sınava dön
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submit(false)} disabled={submitting}>
                {submitting ? "Teslim ediliyor..." : "Teslim et ve sonucu gör"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
