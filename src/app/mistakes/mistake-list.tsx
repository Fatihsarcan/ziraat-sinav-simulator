"use client";

import { useState } from "react";
import Link from "next/link";
import type { MistakeEntry, OptionKey } from "../../core/types.ts";
import { DIFFICULTY_LABEL, dateTimeTR } from "../../lib/format.ts";
import { Explanation } from "../_components/ui.tsx";

const OPTIONS: OptionKey[] = ["A", "B", "C", "D"];

export function MistakeList({ items }: { items: MistakeEntry[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const expanded = open.has(item.id);
        return (
          <li key={item.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full text-left p-3 flex items-start gap-3 hover:bg-[var(--surface-2)]"
              onClick={() => toggle(item.id)}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] leading-snug line-clamp-2">
                  {item.questionText}
                </span>
                <span className="block text-[11px] text-[var(--text-muted)] mt-1">
                  {item.category} › {item.subtopic} · {DIFFICULTY_LABEL[item.difficulty]} ·{" "}
                  {dateTimeTR(item.createdAt)} · {item.sessionLabel}
                </span>
              </span>
              <span className="shrink-0 flex items-center gap-2">
                {item.resolvedAt ? (
                  <span className="badge badge-pass">Sonra doğru çözüldü</span>
                ) : (
                  <span className="badge badge-fail">Açık</span>
                )}
                <span className="mono text-[12px] font-semibold">
                  {item.wasBlank ? "boş" : item.selectedAnswer} / {item.correctAnswer}
                </span>
              </span>
            </button>

            {expanded ? (
              <div className="px-3 pb-3 border-t border-[var(--border)] pt-3">
                {item.passage ? (
                  <div className="mb-3 p-3 rounded-lg bg-[var(--surface-2)] scroll-x">
                    <pre className="mono text-[12px] whitespace-pre-wrap m-0">{item.passage}</pre>
                  </div>
                ) : null}

                <div className="space-y-1.5 mb-3">
                  {OPTIONS.map((option) => {
                    const isCorrect = option === item.correctAnswer;
                    const isSelected = option === item.selectedAnswer;
                    return (
                      <div
                        key={option}
                        className="flex items-start gap-2.5 p-2 rounded-md text-[13px]"
                        style={{
                          background: isCorrect
                            ? "var(--pass-soft)"
                            : isSelected
                              ? "var(--fail-soft)"
                              : "transparent",
                        }}
                      >
                        <span className="mono font-semibold shrink-0 w-5">{option}</span>
                        <span className="flex-1">{item.options[option]}</span>
                        {isCorrect ? <span className="badge badge-pass">Doğru</span> : null}
                        {isSelected && !isCorrect ? (
                          <span className="badge badge-fail">Senin cevabın</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <Explanation
                  text={item.explanation}
                  turkish={item.explanationTr}
                  source={item.source}
                  sourceUrl={item.sourceUrl}
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  <Link
                    href={`/practice?mode=custom&category=${encodeURIComponent(item.category)}&subtopic=${encodeURIComponent(item.subtopic)}&count=10`}
                    className="btn"
                  >
                    Bu alt konudan 10 soru çöz
                  </Link>
                  <Link href={`/exam/${item.sessionId}/result`} className="btn">
                    Sınav sonucunu aç
                  </Link>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
