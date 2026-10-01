import Link from "next/link";
import { db } from "../../lib/server.ts";
import { listMistakes, weakestMistakeTopics } from "../../db/repos/mistakes.ts";
import { loadExamConfig } from "../../config/load-config.ts";
import { ALL_CATEGORIES } from "../../config/curriculum.ts";
import { Card, EmptyState, PageHeader, Stat } from "../_components/ui.tsx";
import { MistakeList } from "./mistake-list.tsx";
import { ConceptGaps } from "./concept-gaps.tsx";
import { conceptGaps } from "../../core/exam-engine.ts";
import { generationStatus } from "../../question-engine/llm-client.ts";
import type { SectionId } from "../../core/types.ts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function MistakesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const database = db();
  const config = loadExamConfig(database);

  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };

  const section = one("section") as SectionId | "";
  const category = one("category");
  const subtopic = one("subtopic");
  const includeResolved = one("resolved") === "1";
  const search = one("q");
  const page = Math.max(1, Number(one("page")) || 1);

  const { items, total } = listMistakes(
    {
      section: section || undefined,
      category: category || undefined,
      subtopic: subtopic || undefined,
      includeResolved,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
    database,
  );

  const all = listMistakes({ includeResolved: true, limit: 1 }, database);
  const open = listMistakes({ limit: 1 }, database);
  const topTopics = weakestMistakeTopics(6, 90, database);
  const gaps = conceptGaps(12, database);
  const genStatus = generationStatus();

  const categoriesForFilter = section
    ? ALL_CATEGORIES.filter((c) => c.section === section)
    : ALL_CATEGORIES;

  function queryString(overrides: Record<string, string>) {
    const next = new URLSearchParams();
    const base: Record<string, string> = {
      section,
      category,
      subtopic,
      q: search,
      resolved: includeResolved ? "1" : "",
      ...overrides,
    };
    for (const [key, value] of Object.entries(base)) {
      if (value) next.set(key, value);
    }
    return next.toString();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Yanlış Soru Defteri"
        description="Her yanlış otomatik kaydedilir. Bir soruyu sonradan doğru çözsen bile geçmiş kayıt silinmez, yalnızca “çözüldü” olarak işaretlenir."
      />

      <ConceptGaps
        gaps={gaps.map((gap) => ({
          concept: gap.concept,
          category: gap.category,
          subtopic: gap.subtopic,
          wrongCount: gap.wrongCount,
          unresolvedCount: gap.unresolvedCount,
          lastWrongAt: gap.lastWrongAt,
        }))}
        generationAvailable={genStatus.available}
        generationReason={genStatus.reason}
      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Toplam Yanlış" value={all.total} />
        <Stat label="Açık" value={open.total} tone={open.total > 0 ? "fail" : "pass"} />
        <Stat label="Çözülmüş" value={all.total - open.total} tone="pass" />
        <Stat label="Listelenen" value={total} />
      </div>

      {topTopics.length > 0 ? (
        <Card title="En Çok Yanlış Yapılan Konular" subtitle="Son 90 gün">
          <div className="flex flex-wrap gap-2">
            {topTopics.map((topic) => (
              <Link
                key={`${topic.category}-${topic.subtopic}`}
                href={`/mistakes?category=${encodeURIComponent(topic.category)}&subtopic=${encodeURIComponent(topic.subtopic)}`}
                className="badge badge-warn hover:underline"
              >
                {topic.subtopic} · {topic.mistakes}
              </Link>
            ))}
          </div>
          <Link href="/practice?mode=mistake_concepts&count=20" className="btn btn-primary mt-3">
            Bu konulardan yeni sorularla çalış
          </Link>
        </Card>
      ) : null}

      <Card title="Filtreler" padded>
        <form className="grid gap-3 md:grid-cols-5 items-end" method="get">
          <div>
            <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
              Bölüm
            </label>
            <select name="section" defaultValue={section} className="select">
              <option value="">Tümü</option>
              {config.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shortLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
              Kategori
            </label>
            <select name="category" defaultValue={category} className="select">
              <option value="">Tümü</option>
              {categoriesForFilter.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
              Soru metninde ara
            </label>
            <input name="q" defaultValue={search} className="input" placeholder="örn. JOIN" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" name="resolved" value="1" defaultChecked={includeResolved} />
              Çözülenler
            </label>
            <button type="submit" className="btn btn-primary">
              Uygula
            </button>
          </div>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Bu filtreye uyan yanlış yok"
          description="Henüz sınav çözmediysen önce bir sınav veya çalışma tamamla."
          action={
            <Link href="/exam" className="btn btn-primary">
              Gerçek Sınav Simülasyonu
            </Link>
          }
        />
      ) : (
        <Card title={`Yanlışlar (${total})`} subtitle={`Sayfa ${page} / ${totalPages}`}>
          <MistakeList items={items} />

          {totalPages > 1 ? (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--border)]">
              <Link
                href={`/mistakes?${queryString({ page: String(page - 1) })}`}
                className="btn"
                style={page <= 1 ? { pointerEvents: "none", opacity: 0.4 } : undefined}
              >
                ← Önceki
              </Link>
              <span className="text-[12px] text-[var(--text-muted)]">
                {page} / {totalPages}
              </span>
              <Link
                href={`/mistakes?${queryString({ page: String(page + 1) })}`}
                className="btn"
                style={page >= totalPages ? { pointerEvents: "none", opacity: 0.4 } : undefined}
              >
                Sonraki →
              </Link>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
