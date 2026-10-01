"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SettingsFormProps {
  examDate: string;
  durationMinutes: number;
  overallThreshold: number;
  sections: { id: string; label: string; passRatio: number; questionCount: number }[];
  subsections: { key: string; label: string; questionCount: number }[];
}

/** ISO tarihini datetime-local girisine cevirir. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SettingsForm(props: SettingsFormProps) {
  const router = useRouter();
  const [examDate, setExamDate] = useState(toLocalInput(props.examDate));
  const [duration, setDuration] = useState(props.durationMinutes);
  const [overall, setOverall] = useState(props.overallThreshold);
  const [ratios, setRatios] = useState<Record<string, number>>(
    Object.fromEntries(props.sections.map((s) => [s.id, Math.round(s.passRatio * 100)])),
  );
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(props.subsections.map((s) => [s.key, s.questionCount])),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          override: {
            examDate: new Date(examDate).toISOString(),
            durationMinutes: duration,
            subsectionQuestionCounts: counts,
            thresholds: {
              overallScore: overall,
              bySection: Object.fromEntries(
                Object.entries(ratios).map(([k, v]) => [k, v / 100]),
              ),
            },
          },
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        setMessage("Ayarlar kaydedildi. Yeni sınavlar bu yapıya göre oluşturulacak.");
        router.refresh();
      } else {
        setError(data.message ?? "Kaydedilemedi.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
            Hedef sınav tarihi ve saati
          </label>
          <input
            type="datetime-local"
            className="input"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
            Sınav süresi (dakika)
          </label>
          <input
            type="number"
            className="input"
            min={1}
            value={duration}
            onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div>
          <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
            Toplam puan barajı
          </label>
          <input
            type="number"
            className="input"
            min={0}
            max={100}
            value={overall}
            onChange={(e) => setOverall(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          />
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-2">
          Alt bölüm soru sayıları
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {props.subsections.map((sub) => (
            <div key={sub.key}>
              <label className="text-[12px] block mb-1">{sub.label}</label>
              <input
                type="number"
                className="input"
                min={0}
                value={counts[sub.key] ?? 0}
                onChange={(e) =>
                  setCounts((prev) => ({
                    ...prev,
                    [sub.key]: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </div>
          ))}
        </div>
        <p className="text-[12px] mt-2" style={{ color: total === 0 ? "var(--fail)" : "var(--text-muted)" }}>
          Toplam soru sayısı: <b className="mono">{total}</b>
        </p>
      </div>

      <div>
        <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-2">
          Bölüm barajları (%)
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {props.sections.map((section) => (
            <div key={section.id}>
              <label className="text-[12px] block mb-1">{section.label}</label>
              <input
                type="number"
                className="input"
                min={0}
                max={100}
                value={ratios[section.id] ?? 0}
                onChange={(e) =>
                  setRatios((prev) => ({
                    ...prev,
                    [section.id]: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      {message ? (
        <div className="rounded-lg p-3 text-[13px]" style={{ background: "var(--pass-soft)" }}>
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg p-3 text-[13px] whitespace-pre-wrap" style={{ background: "var(--fail-soft)" }}>
          {error}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? "Kaydediliyor..." : "Ayarları kaydet"}
        </button>
        <p className="text-[12px] text-[var(--text-muted)] self-center">
          Devam eden sınavlar başladıkları andaki yapıyı korur.
        </p>
      </div>
    </div>
  );
}
