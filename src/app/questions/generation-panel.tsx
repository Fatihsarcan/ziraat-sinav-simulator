"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SectionId } from "../../core/types.ts";

export interface GenerationPanelProps {
  available: boolean;
  reason: string | null;
  model: string;
  categories: { key: string; label: string; section: SectionId; deficit: number; verified: number }[];
  plan: { category: string; label: string; count: number; deficit: number }[];
}

interface StepOutcome {
  requested: number;
  generated: number;
  accepted: number;
  reviewNeeded: number;
  rejected: number;
  duplicates: number;
  usedWebSearch: boolean;
  sourcesRecorded: number;
  error: string | null;
  details: { questionText: string; status: string; reason: string }[];
}

export function GenerationPanel(props: GenerationPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<{ label: string; outcome: StepOutcome }[]>([]);
  const [category, setCategory] = useState(props.categories[0]?.key ?? "");
  const [count, setCount] = useState(8);

  if (!props.available) {
    return (
      <div className="rounded-lg p-3.5 text-[13px]" style={{ background: "var(--info-soft)" }}>
        <p className="font-semibold mb-1" style={{ color: "var(--info)" }}>
          Soru üretimi kapalı
        </p>
        <p>{props.reason}</p>
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">
          Anahtar olmadan üretim <b>taklit edilmez</b>; uygulama mevcut soru bankasıyla normal
          şekilde çalışmaya devam eder.
        </p>
      </div>
    );
  }

  async function run(body: Record<string, unknown>, label: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    setOutcomes([]);
    try {
      const res = await fetch("/api/generation/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        outcome?: StepOutcome;
        result?: { steps: { step: { label: string }; outcome: StepOutcome }[]; error: string | null };
      };

      if (data.outcome) {
        setOutcomes([{ label, outcome: data.outcome }]);
      } else if (data.result) {
        setOutcomes(data.result.steps.map((s) => ({ label: s.step.label, outcome: s.outcome })));
      }
      if (data.message) setMessage(data.message);
      if (!data.ok) setError(data.message ?? data.result?.error ?? "Üretim tamamlanamadı.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selected = props.categories.find((c) => c.key === category);

  return (
    <div className="space-y-4">
      <div className="text-[12px] text-[var(--text-muted)]">
        Model: <span className="mono">{props.model}</span> · Akış:{" "}
        <b>web araştırması → soru üretimi → bağımsız doğrulama → tekrar kontrolü</b>. Doğrulayıcı,
        üreticinin işaretlediği cevabı görmeden soruyu kendisi çözer; cevaplar uyuşmazsa soru
        reddedilir.
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] items-end">
        <div>
          <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
            Kategori
          </label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {props.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} ({c.verified}
                {c.deficit > 0 ? `, eksik ${c.deficit}` : ""})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
            Adet
          </label>
          <input
            type="number"
            className="input"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !selected}
          onClick={() =>
            void run(
              { mode: "category", category, section: selected?.section, count },
              selected?.label ?? category,
            )
          }
        >
          {busy ? "Üretiliyor..." : "Bu kategoriden üret"}
        </button>
      </div>

      <div className="border-t border-[var(--border)] pt-3">
        <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-2">
          Otomatik plan (en büyük eksikten başlayarak)
        </div>
        {props.plan.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">
            Tüm kategoriler eşiğin üzerinde — üretilecek bir şey yok.
          </p>
        ) : (
          <>
            <ul className="text-[12.5px] space-y-1 mb-3">
              {props.plan.map((step) => (
                <li key={step.category} className="flex justify-between gap-2">
                  <span className="truncate">{step.label}</span>
                  <span className="mono text-[var(--text-muted)] shrink-0">
                    +{step.count} (eksik {step.deficit})
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void run({ mode: "plan", maxSteps: 3 }, "Plan")}
            >
              {busy ? "Çalışıyor..." : "Planın ilk 3 adımını çalıştır"}
            </button>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
              Her adım web araştırması içerdiği için birkaç dakika sürebilir. Sınav başlatmak bu
              işlemi beklemez — sınav yalnızca mevcut doğrulanmış sorulardan kurulur.
            </p>
          </>
        )}
      </div>

      {message ? (
        <div className="rounded-lg p-3 text-[13px]" style={{ background: "var(--info-soft)" }}>
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg p-3 text-[13px]" style={{ background: "var(--fail-soft)" }}>
          {error}
        </div>
      ) : null}

      {outcomes.length > 0 ? (
        <div className="space-y-3">
          {outcomes.map(({ label, outcome }) => (
            <div key={label} className="border border-[var(--border)] rounded-lg p-3">
              <div className="font-semibold text-[13px] mb-2">{label}</div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center mb-2">
                {[
                  ["Üretilen", outcome.generated],
                  ["Doğrulandı", outcome.accepted],
                  ["İnceleme", outcome.reviewNeeded],
                  ["Reddedildi", outcome.rejected],
                  ["Tekrar", outcome.duplicates],
                  ["Kaynak", outcome.sourcesRecorded],
                ].map(([k, v]) => (
                  <div key={String(k)} className="p-1.5 rounded bg-[var(--surface-2)]">
                    <div className="mono text-[16px] font-semibold">{v as number}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{k as string}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Web araması: {outcome.usedWebSearch ? "kullanıldı" : "kullanılmadı"}
                {outcome.error ? ` · Hata: ${outcome.error}` : ""}
              </div>
              {outcome.details.length > 0 ? (
                <details className="mt-2">
                  <summary className="text-[12px] cursor-pointer text-[var(--text-muted)]">
                    Eleme gerekçeleri ({outcome.details.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5 text-[12px]">
                    {outcome.details.map((d, i) => (
                      <li key={i} className="border-l-2 pl-2" style={{ borderColor: "var(--border-strong)" }}>
                        <span className="badge badge-muted">{d.status}</span>{" "}
                        {d.questionText.slice(0, 90)}
                        <div className="text-[var(--text-muted)]">{d.reason}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
