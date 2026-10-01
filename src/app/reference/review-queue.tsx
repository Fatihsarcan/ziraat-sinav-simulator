"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, EmptyState } from "../_components/ui.tsx";
import type { ReferenceQuestion } from "../../db/repos/reference.ts";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

interface CategoryOption {
  key: string;
  label: string;
  section: string;
  subtopics: string[];
}

/**
 * INSAN ONAY KUYRUGU (sartname #13)
 *
 * Onay, soruyu ana bankaya "cikmis soru" olarak tasir. Dogru cevabi bilinmeyen
 * sorularda once dogru sik elle isaretlenmelidir — uygulama cevap uydurmaz.
 */
export function ReviewQueue({
  items,
  total,
  categories,
}: {
  items: ReferenceQuestion[];
  total: number;
  categories: CategoryOption[];
}) {
  return (
    <Card
      title={`İnceleme Kuyruğu (${total})`}
      subtitle="Onayladığın sorular soru bankasına 'çıkmış soru' olarak eklenir ve Çıkmış Sorular modunda çözülür."
      padded={false}
    >
      {items.length === 0 ? (
        <EmptyState
          title="Kuyrukta bekleyen soru yok"
          description="İçe aktardığın sorular burada tek tek incelemeni bekler."
        />
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {items.map((item) => (
            <ReviewRow key={item.id} item={item} categories={categories} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ReviewRow({ item, categories }: { item: ReferenceQuestion; categories: CategoryOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState(item.category ?? "");
  const [subtopic, setSubtopic] = useState(item.subtopic ?? "");
  const [correctIndex, setCorrectIndex] = useState<number | null>(item.correctIndex);

  const selectedCategory = categories.find((c) => c.key === category);

  async function send(state: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/reference/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state,
          category: category || undefined,
          subtopic: subtopic || undefined,
          correctIndex: correctIndex ?? undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; message?: string };
      if (!payload.ok) {
        setError(payload.message ?? "İşlem başarısız.");
        return;
      }
      setMessage(payload.message ?? "Tamam.");
      router.refresh();
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Badge tone={item.sourceLevel === "A" ? "pass" : item.sourceLevel === "B" ? "info" : "warn"}>
          Seviye {item.sourceLevel}
        </Badge>
        <span className="text-[var(--text-muted)]">
          {item.sourceName}
          {item.sourceYear ? ` · ${item.sourceYear}` : ""}
        </span>
        {item.correctIndex === null ? (
          <Badge tone="fail">Cevap bilinmiyor</Badge>
        ) : (
          <Badge tone="muted">Cevap: {LETTERS[item.correctIndex]}</Badge>
        )}
        {item.optionCount !== 4 ? (
          <Badge tone="warn">{item.optionCount} şıklı</Badge>
        ) : null}
      </div>

      {item.passage ? (
        <pre className="mono text-[12px] whitespace-pre-wrap bg-[var(--surface-2)] p-3 rounded-[8px]">
          {item.passage}
        </pre>
      ) : null}

      <p className="text-[14px]">{item.questionText}</p>

      <ul className="space-y-1">
        {item.options.map((option, index) => (
          <li key={index} className="flex items-start gap-2 text-[13px]">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name={`answer-${item.id}`}
                checked={correctIndex === index}
                onChange={() => setCorrectIndex(index)}
                className="mt-1"
              />
              <span>
                <b>{LETTERS[index]})</b> {option}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] text-[var(--text-muted)]">Kategori</span>
          <select
            className="select mt-1"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSubtopic("");
            }}
          >
            <option value="">— seçilmedi —</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] text-[var(--text-muted)]">Alt konu</span>
          <select
            className="select mt-1"
            value={subtopic}
            onChange={(e) => setSubtopic(e.target.value)}
            disabled={!selectedCategory}
          >
            <option value="">— seçilmedi —</option>
            {(selectedCategory?.subtopics ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => send("approved")}
        >
          Onayla ve soru bankasına ekle
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => send("rejected")}
        >
          Reddet
        </button>
        {correctIndex === null ? (
          <span className="text-[12px]" style={{ color: "var(--warn)" }}>
            Onaylamadan önce doğru şıkkı işaretle.
          </span>
        ) : null}
      </div>

      {message ? (
        <p className="text-[13px]" style={{ color: "var(--pass)" }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-[13px]" style={{ color: "var(--fail)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
