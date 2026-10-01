import Link from "next/link";
import { db } from "../../lib/server.ts";
import { loadExamConfig } from "../../config/load-config.ts";
import { ALL_CATEGORIES } from "../../config/curriculum.ts";
import { listQuestions } from "../../db/repos/questions.ts";
import { coverageReport, generationPlan, listGenerationLog } from "../../question-engine/index.ts";
import { generationStatus } from "../../question-engine/llm-client.ts";
import { Badge, Card, PageHeader, Stat } from "../_components/ui.tsx";
import { GenerationPanel } from "./generation-panel.tsx";
import { QuestionTable, type QuestionRowView } from "./question-table.tsx";
import { dateTimeTR, num } from "../../lib/format.ts";
import type { Difficulty, QualityStatus, SectionId } from "../../core/types.ts";
import { styleTypeLabel } from "../../config/exam-style.ts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function QuestionsPage({
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
  const status = one("status") as QualityStatus | "";
  const difficulty = one("difficulty") as Difficulty | "";
  const search = one("q");
  const origin = one("origin"); // "" | "generated" | "historical"
  const page = Math.max(1, Number(one("page")) || 1);

  const { items, total } = listQuestions(
    {
      section: section || undefined,
      category: category || undefined,
      qualityStatus: status || undefined,
      difficulty: difficulty || undefined,
      search: search || undefined,
      historical: origin === "historical" ? true : origin === "generated" ? false : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
    database,
  );

  const coverage = coverageReport(database);
  const plan = generationPlan({ maxSteps: 5 }, database);
  const genStatus = generationStatus();
  const log = listGenerationLog(10, database);

  const sectionLabel = (id: SectionId) =>
    config.sections.find((s) => s.id === id)?.shortLabel ?? id;

  const rows: QuestionRowView[] = items.map((q) => ({
    id: q.id,
    section: q.section,
    sectionLabel: sectionLabel(q.section),
    category: q.category,
    subtopic: q.subtopic,
    difficulty: q.difficulty,
    cefrLevel: q.cefrLevel,
    questionText: q.questionText,
    passage: q.passage,
    options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    explanationTr: q.explanationTr,
    qualityStatus: q.qualityStatus,
    qualityNotes: q.qualityNotes,
    origin: q.origin,
    generatorModel: q.generatorModel,
    source: q.source,
    sourceUrl: q.sourceUrl,
    timeSensitive: q.timeSensitive,
    createdAt: q.createdAt,
    timesAsked: q.timesAsked,
    timesCorrect: q.timesCorrect,
    timesWrong: q.timesWrong,
    lastAskedAt: q.lastAskedAt,
    avgAnswerMs: q.timesAsked === 0 ? null : q.totalAnswerMs / q.timesAsked,
    concept: q.concept,
    styleTypeLabel: q.styleType ? styleTypeLabel(q.styleType) : null,
    qualityScore: q.qualityScore,
    estimatedSeconds: q.estimatedSeconds,
    isNegative: q.isNegative,
    historical: q.historical,
    sourceLevel: q.sourceLevel,
    sourceYear: q.sourceYear,
  }));

  const totals = coverage.categories.reduce(
    (acc, c) => ({
      verified: acc.verified + c.verified,
      review: acc.review + c.reviewNeeded,
      unseen: acc.unseen + c.unseen,
    }),
    { verified: 0, review: 0, unseen: 0 },
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function queryString(overrides: Record<string, string>) {
    const next = new URLSearchParams();
    const base: Record<string, string> = {
      section,
      category,
      status,
      difficulty,
      q: search,
      origin,
      ...overrides,
    };
    for (const [key, value] of Object.entries(base)) if (value) next.set(key, value);
    return next.toString();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Soru Bankası"
        description="Yalnızca “Onaylı” ve kalite skoru eşiğin üstündeki sorular gerçek sınava ve çalışmalara girer. Beklemedekiler bankada kalır ama seçilmez."
      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Onaylı" value={num(totals.verified)} tone="pass" />
        <Stat label="Beklemede" value={num(totals.review)} tone="warn" />
        <Stat label="Hiç Sorulmamış" value={num(totals.unseen)} hint="yeni sorular önceliklidir" />
        <Stat
          label="Eşik Altı Kategori"
          value={coverage.belowThreshold}
          tone={coverage.belowThreshold > 0 ? "warn" : "pass"}
          hint={`toplam eksik ${coverage.totalDeficit}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Kategori Doluluk Durumu" padded={false}>
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th className="text-right">Onaylı</th>
                  <th className="text-right">Beklemede</th>
                  <th className="text-right">Eşik</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {coverage.categories.map((c) => (
                  <tr key={c.category}>
                    <td className="text-[12px]">
                      <Link
                        href={`/questions?category=${encodeURIComponent(c.category)}`}
                        className="hover:underline"
                      >
                        {c.label}
                      </Link>
                      {!c.official ? (
                        <span className="badge badge-muted ml-1">türetilmiş</span>
                      ) : null}
                    </td>
                    <td className="mono text-right">{c.verified}</td>
                    <td className="mono text-right">{c.reviewNeeded}</td>
                    <td className="mono text-right">{c.threshold}</td>
                    <td>
                      {c.belowThreshold ? (
                        <Badge tone="warn">-{c.deficit}</Badge>
                      ) : (
                        <Badge tone="pass">yeterli</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Soru Üretimi" subtitle="Araştır → üret → bağımsız doğrula">
          <GenerationPanel
            available={genStatus.available}
            reason={genStatus.reason}
            model={genStatus.model}
            categories={ALL_CATEGORIES.map((c) => {
              const info = coverage.categories.find((x) => x.category === c.key);
              return {
                key: c.key,
                label: c.label,
                section: c.section,
                deficit: info?.deficit ?? 0,
                verified: info?.verified ?? 0,
              };
            })}
            plan={plan.map((p) => ({
              category: p.category,
              label: p.label,
              count: p.count,
              deficit: p.deficit,
            }))}
          />
        </Card>
      </div>

      {log.length > 0 ? (
        <Card title="Üretim Geçmişi" padded={false}>
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Kategori</th>
                  <th className="text-right">İstenen</th>
                  <th className="text-right">Kabul</th>
                  <th className="text-right">Red</th>
                  <th className="text-right">Tekrar</th>
                  <th>Web</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">{dateTimeTR(entry.startedAt)}</td>
                    <td className="text-[12px]">{entry.category}</td>
                    <td className="mono text-right">{entry.requested}</td>
                    <td className="mono text-right">{entry.accepted}</td>
                    <td className="mono text-right">{entry.rejected}</td>
                    <td className="mono text-right">{entry.duplicates}</td>
                    <td>{entry.usedWeb ? "evet" : "hayır"}</td>
                    <td>
                      <Badge
                        tone={
                          entry.status === "succeeded"
                            ? "pass"
                            : entry.status === "failed"
                              ? "fail"
                              : "warn"
                        }
                      >
                        {entry.status}
                      </Badge>
                      {entry.error ? (
                        <div className="text-[11px] text-[var(--text-muted)]">{entry.error}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card title="Filtreler">
        <form className="grid gap-3 md:grid-cols-7 items-end" method="get">
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
          <div className="md:col-span-2">
            <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
              Kategori
            </label>
            <select name="category" defaultValue={category} className="select">
              <option value="">Tümü</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
              Durum
            </label>
            <select name="status" defaultValue={status} className="select">
              <option value="">Tümü</option>
              <option value="verified">Onaylı</option>
              <option value="review_needed">Beklemede</option>
              <option value="rejected">Reddedildi</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
              Kaynak
            </label>
            <select name="origin" defaultValue={origin} className="select">
              <option value="">Tümü</option>
              <option value="generated">Üretilmiş</option>
              <option value="historical">Çıkmış soru</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
              Zorluk
            </label>
            <select name="difficulty" defaultValue={difficulty} className="select">
              <option value="">Tümü</option>
              <option value="easy">Kolay</option>
              <option value="medium">Orta</option>
              <option value="hard">Zor</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input name="q" defaultValue={search} className="input" placeholder="Ara..." />
            <button type="submit" className="btn btn-primary">
              Uygula
            </button>
          </div>
        </form>
      </Card>

      <Card title={`Sorular (${total})`} subtitle={`Sayfa ${page} / ${totalPages}`}>
        <QuestionTable rows={rows} />
        {totalPages > 1 ? (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--border)]">
            <Link
              href={`/questions?${queryString({ page: String(page - 1) })}`}
              className="btn"
              style={page <= 1 ? { pointerEvents: "none", opacity: 0.4 } : undefined}
            >
              ← Önceki
            </Link>
            <span className="text-[12px] text-[var(--text-muted)]">
              {page} / {totalPages}
            </span>
            <Link
              href={`/questions?${queryString({ page: String(page + 1) })}`}
              className="btn"
              style={page >= totalPages ? { pointerEvents: "none", opacity: 0.4 } : undefined}
            >
              Sonraki →
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
