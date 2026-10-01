"use client";

import { useMemo, useState } from "react";
import type { OptionKey } from "../../../../core/types.ts";
import { duration, DIFFICULTY_LABEL } from "../../../../lib/format.ts";
import { Explanation } from "../../../_components/ui.tsx";

const OPTIONS: OptionKey[] = ["A", "B", "C", "D"];

export interface ReviewRow {
  position: number;
  questionId: number;
  sectionLabel: string;
  category: string;
  subtopic: string;
  difficulty: "easy" | "medium" | "hard";
  passage: string | null;
  questionText: string;
  options: Record<OptionKey, string>;
  correctAnswer: OptionKey;
  selectedAnswer: OptionKey | null;
  isCorrect: boolean | null;
  explanation: string;
  explanationTr: string | null;
  source: string | null;
  sourceUrl: string | null;
  timeSpentMs: number;
  flagged: boolean;
}

type Filter = "all" | "wrong" | "blank" | "flagged" | "correct";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "wrong", label: "Yanlışlar" },
  { key: "blank", label: "Boşlar" },
  { key: "flagged", label: "İşaretlediklerim" },
  { key: "correct", label: "Doğrular" },
  { key: "all", label: "Tümü" },
];

export function ReviewList({ rows }: { rows: ReviewRow[] }) {
  const [filter, setFilter] = useState<Filter>("wrong");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const counts = useMemo(
    () => ({
      all: rows.length,
      wrong: rows.filter((r) => r.isCorrect === false).length,
      blank: rows.filter((r) => r.selectedAnswer === null).length,
      flagged: rows.filter((r) => r.flagged).length,
      correct: rows.filter((r) => r.isCorrect === true).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "wrong":
        return rows.filter((r) => r.isCorrect === false);
      case "blank":
        return rows.filter((r) => r.selectedAnswer === null);
      case "flagged":
        return rows.filter((r) => r.flagged);
      case "correct":
        return rows.filter((r) => r.isCorrect === true);
      default:
        return rows;
    }
  }, [filter, rows]);

  function toggle(position: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="btn text-[12px] py-1"
            onClick={() => setFilter(f.key)}
            style={
              filter === f.key
                ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }
                : undefined
            }
          >
            {f.label} <span className="mono">({counts[f.key]})</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          className="btn text-[12px] py-1"
          onClick={() =>
            setOpen((prev) => (prev.size > 0 ? new Set() : new Set(filtered.map((r) => r.position))))
          }
        >
          {open.size > 0 ? "Hepsini kapat" : "Hepsini aç"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-6 text-center">
          Bu filtreye uyan soru yok.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => {
            const expanded = open.has(row.position);
            const tone =
              row.isCorrect === true
                ? "var(--pass)"
                : row.selectedAnswer === null
                  ? "var(--text-muted)"
                  : "var(--fail)";
            return (
              <li key={row.position} className="border border-[var(--border)] rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-3 flex items-start gap-3 hover:bg-[var(--surface-2)]"
                  onClick={() => toggle(row.position)}
                >
                  <span
                    className="mono shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "var(--surface-2)", color: tone }}
                  >
                    {row.position}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] leading-snug line-clamp-2">
                      {row.questionText}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)] mt-1">
                      {row.sectionLabel} · {row.subtopic} · {DIFFICULTY_LABEL[row.difficulty]} ·{" "}
                      {duration(row.timeSpentMs)}
                      {row.flagged ? " · ★ işaretli" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 mono text-[12px] font-semibold" style={{ color: tone }}>
                    {row.selectedAnswer ?? "—"} / {row.correctAnswer}
                  </span>
                </button>

                {expanded ? (
                  <div className="px-3 pb-3 border-t border-[var(--border)] pt-3">
                    {row.passage ? (
                      <div className="mb-3 p-3 rounded-lg bg-[var(--surface-2)] scroll-x">
                        <pre className="mono text-[12px] whitespace-pre-wrap m-0">{row.passage}</pre>
                      </div>
                    ) : null}
                    <div className="space-y-1.5 mb-3">
                      {OPTIONS.map((option) => {
                        const isCorrect = option === row.correctAnswer;
                        const isSelected = option === row.selectedAnswer;
                        const background = isCorrect
                          ? "var(--pass-soft)"
                          : isSelected
                            ? "var(--fail-soft)"
                            : "transparent";
                        return (
                          <div
                            key={option}
                            className="flex items-start gap-2.5 p-2 rounded-md text-[13px]"
                            style={{ background }}
                          >
                            <span className="mono font-semibold shrink-0 w-5">{option}</span>
                            <span className="flex-1">{row.options[option]}</span>
                            {isCorrect ? <span className="badge badge-pass">Doğru</span> : null}
                            {isSelected && !isCorrect ? (
                              <span className="badge badge-fail">Senin cevabın</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <Explanation
                      text={row.explanation}
                      turkish={row.explanationTr}
                      source={row.source}
                      sourceUrl={row.sourceUrl}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
