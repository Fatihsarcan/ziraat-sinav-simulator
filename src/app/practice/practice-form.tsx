"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExamMode, SectionId } from "../../core/types.ts";

export interface PracticeTree {
  section: SectionId;
  label: string;
  categories: {
    key: string;
    label: string;
    official: boolean;
    subtopics: { key: string; available: number }[];
  }[];
}

export interface PracticeFormProps {
  tree: PracticeTree[];
  allowedCounts: readonly number[];
  defaultCount: number;
  initial: {
    mode?: string;
    section?: string;
    category?: string;
    subtopic?: string;
    count?: string;
  };
  hasMistakes: boolean;
  hasMastery: boolean;
  /** Onaylanmis cikmis soru sayisi — 0 ise "Cikmis Sorular" modu kapali. */
  historicalCount: number;
}

interface ModeOption {
  key: Exclude<ExamMode, "full_exam">;
  title: string;
  description: string;
  needsFilters: boolean;
}

const MODES: ModeOption[] = [
  {
    key: "practice",
    title: "Bölüm Çalışması",
    description: "Seçtiğin bölümden karışık sorular. Adaptif seçim zayıf konularına ağırlık verir.",
    needsFilters: true,
  },
  {
    key: "custom",
    title: "Özel Çalışma",
    description: "Kategori ve alt konu seçerek yalnızca o konudan soru çöz.",
    needsFilters: true,
  },
  {
    key: "weak_topics",
    title: "Zayıf Konular",
    description: "Ustalık skoru düşük alt konulardan otomatik seçim.",
    needsFilters: false,
  },
  {
    key: "mistake_concepts",
    title: "Zayıflıklarımı Çalış",
    description:
      "Yanlış yaptığın KAVRAMLARDAN farklı/yeni sorular getirir — aynı soruları tekrar sormaz.",
    needsFilters: false,
  },
  {
    key: "retry_mistakes",
    title: "Eski Yanlışları Tekrar Çöz",
    description: "Geçmişte yanlış yaptığın SORULARIN kendisini tekrar çözersin.",
    needsFilters: false,
  },
  {
    key: "historical",
    title: "Çıkmış Sorular",
    description:
      "İçe aktarıp onayladığın gerçek/eski sınav soruları. Kaynağı ve yılı gösterilir; bu sorular gerçek sınav simülasyonuna karışmaz.",
    needsFilters: true,
  },
];

export function PracticeForm(props: PracticeFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Exclude<ExamMode, "full_exam">>(
    (MODES.find((m) => m.key === props.initial.mode)?.key ?? "practice") as Exclude<
      ExamMode,
      "full_exam"
    >,
  );
  const [section, setSection] = useState<string>(props.initial.section ?? "");
  const [category, setCategory] = useState<string>(props.initial.category ?? "");
  const [subtopic, setSubtopic] = useState<string>(props.initial.subtopic ?? "");
  const [count, setCount] = useState<number>(
    Number(props.initial.count) || props.defaultCount,
  );
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMode = MODES.find((m) => m.key === mode)!;

  const categories = useMemo(() => {
    if (!section) return props.tree.flatMap((t) => t.categories);
    return props.tree.find((t) => t.section === section)?.categories ?? [];
  }, [props.tree, section]);

  const subtopics = useMemo(() => {
    const found = props.tree
      .flatMap((t) => t.categories)
      .find((c) => c.key === category);
    return found?.subtopics ?? [];
  }, [category, props.tree]);

  const availableForSelection = useMemo(() => {
    if (subtopic) return subtopics.find((s) => s.key === subtopic)?.available ?? 0;
    if (category) return subtopics.reduce((a, s) => a + s.available, 0);
    return categories.reduce(
      (a, c) => a + c.subtopics.reduce((x, s) => x + s.available, 0),
      0,
    );
  }, [categories, category, subtopic, subtopics]);

  const blocked =
    (mode === "retry_mistakes" || mode === "mistake_concepts") && !props.hasMistakes
      ? "Henüz yanlış geçmişin yok. Önce bir sınav veya çalışma tamamla."
      : mode === "weak_topics" && !props.hasMastery
        ? "Ustalık verisi yok. Önce birkaç soru çöz."
        : mode === "historical" && props.historicalCount === 0
          ? "İçeride onaylanmış çıkmış soru yok. Çıkmış Sorular ekranından bir kaynak içe aktarıp onaylaman gerekiyor."
          : null;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/practice/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          count,
          section: activeMode.needsFilters && section ? section : undefined,
          category: activeMode.needsFilters && category ? category : undefined,
          subtopic: activeMode.needsFilters && subtopic ? subtopic : undefined,
          durationMinutes: timed ? minutes : null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; sessionId?: number; message?: string };
      if (data.ok && data.sessionId) {
        router.push(`/exam/${data.sessionId}`);
        return;
      }
      setError(data.message ?? "Çalışma başlatılamadı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      {/* --- Mod seçimi --- */}
      <div className="space-y-2">
        {MODES.map((option) => {
          const active = option.key === mode;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              className="w-full text-left card p-4 border transition-colors"
              style={
                active
                  ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                  : undefined
              }
            >
              <div className="font-semibold text-[14px] mb-0.5">{option.title}</div>
              <div className="text-[12.5px] text-[var(--text-muted)]">{option.description}</div>
            </button>
          );
        })}
      </div>

      {/* --- Ayarlar --- */}
      <div className="card p-4 h-fit space-y-4">
        <div>
          <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-1.5">
            Soru sayısı
          </div>
          <div className="flex gap-1.5">
            {props.allowedCounts.map((c) => (
              <button
                key={c}
                type="button"
                className="btn flex-1"
                onClick={() => setCount(c)}
                style={
                  count === c
                    ? { background: "var(--accent)", color: "var(--accent-text)", borderColor: "var(--accent)" }
                    : undefined
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {activeMode.needsFilters ? (
          <>
            <div>
              <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1.5">
                Bölüm
              </label>
              <select
                className="select"
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setCategory("");
                  setSubtopic("");
                }}
              >
                <option value="">Tüm bölümler</option>
                {props.tree.map((t) => (
                  <option key={t.section} value={t.section}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {mode === "custom" ? (
              <>
                <div>
                  <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1.5">
                    Kategori
                  </label>
                  <select
                    className="select"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setSubtopic("");
                    }}
                  >
                    <option value="">Tüm kategoriler</option>
                    {categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1.5">
                    Alt konu
                  </label>
                  <select
                    className="select"
                    value={subtopic}
                    onChange={(e) => setSubtopic(e.target.value)}
                    disabled={!category}
                  >
                    <option value="">Tüm alt konular</option>
                    {subtopics.map((s) => (
                      <option key={s.key} value={s.key} disabled={s.available === 0}>
                        {s.key} ({s.available})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            <div className="text-[12px] text-[var(--text-muted)]">
              Bu seçime uyan doğrulanmış soru:{" "}
              <b className="mono text-[var(--text)]">{availableForSelection}</b>
              {availableForSelection < count ? (
                <span style={{ color: "var(--warn)" }}> — istenen {count} sorudan az</span>
              ) : null}
            </div>
          </>
        ) : null}

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
          Süre sınırı koy
        </label>
        {timed ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="input"
              min={1}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
            />
            <span className="text-[13px] text-[var(--text-muted)] whitespace-nowrap">dakika</span>
          </div>
        ) : null}

        {blocked ? (
          <div className="rounded-lg p-3 text-[12.5px]" style={{ background: "var(--warn-soft)" }}>
            {blocked}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg p-3 text-[12.5px]" style={{ background: "var(--fail-soft)" }}>
            {error}
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-primary btn-lg w-full"
          onClick={() => void start()}
          disabled={busy || blocked !== null}
        >
          {busy ? "Hazırlanıyor..." : `${count} soruluk çalışmayı başlat`}
        </button>
      </div>
    </div>
  );
}
