import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "../../../../lib/server.ts";
import { getSessionResult, getSessionReview } from "../../../../core/exam-engine.ts";
import { getSession } from "../../../../db/repos/sessions.ts";
import { fullExamResults } from "../../../../core/analytics.ts";
import { Badge, Callout, Card, Meter, PageHeader, PassFail, Stat } from "../../../_components/ui.tsx";
import { ReviewList, type ReviewRow } from "./review-list.tsx";
import { dateTimeTR, duration, MODE_LABEL, num, pct } from "../../../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = Number(id);
  const database = db();

  const session = getSession(sessionId, database);
  if (!session) notFound();
  if (session.status === "in_progress") redirect(`/exam/${sessionId}`);

  const result = getSessionResult(sessionId, database);
  if (!result) notFound();

  const review = getSessionReview(sessionId, database);
  const reviewRows: ReviewRow[] = review.map((item) => ({
    position: item.position,
    questionId: item.question.id,
    sectionLabel:
      result.sections.find((s) => s.sectionId === item.question.section)?.label ??
      item.question.section,
    category: item.question.category,
    subtopic: item.question.subtopic,
    difficulty: item.question.difficulty,
    passage: item.question.passage,
    questionText: item.question.questionText,
    options: {
      A: item.question.optionA,
      B: item.question.optionB,
      C: item.question.optionC,
      D: item.question.optionD,
    },
    correctAnswer: item.question.correctAnswer,
    selectedAnswer: item.selectedAnswer,
    isCorrect: item.isCorrect,
    explanation: item.question.explanation,
    explanationTr: item.question.explanationTr,
    source: item.question.source,
    sourceUrl: item.question.sourceUrl,
    timeSpentMs: item.timeSpentMs,
    flagged: item.flagged,
  }));

  // Onceki gercek sinavla karsilastirma icin baglanti.
  const allExams = result.mode === "full_exam" ? fullExamResults(database) : [];
  const currentIndex = allExams.findIndex((e) => e.sessionId === sessionId);
  const previous = currentIndex > 0 ? allExams[currentIndex - 1] : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sınav Sonucu"
        description={`${MODE_LABEL[result.mode]} · ${dateTimeTR(result.submittedAt)}${result.autoSubmitted ? " · süre dolduğu için otomatik teslim edildi" : ""}`}
        actions={
          <>
            {previous ? (
              <Link
                href={`/history/compare?previous=${previous.sessionId}&current=${sessionId}`}
                className="btn"
              >
                Önceki sınavla karşılaştır
              </Link>
            ) : null}
            <Link href="/history" className="btn">
              Sınav geçmişi
            </Link>
            <Link href="/" className="btn btn-primary">
              Dashboard
            </Link>
          </>
        }
      />

      {/* --- Genel sonuç --- */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-wide font-semibold text-[var(--text-subtle)]">
              Puan
            </div>
            <div
              className="mono text-[52px] font-semibold leading-none"
              style={{ color: result.passed ? "var(--pass)" : "var(--fail)" }}
            >
              {num(result.score, 1)}
            </div>
          </div>
          <div className="text-[28px]">
            <PassFail passed={result.passed} />
          </div>
          <div className="flex-1 min-w-[260px]">
            {result.failReasons.length === 0 ? (
              <Callout tone="pass" title="Tüm koşullar sağlandı">
                Her bölümün barajı tuttu ve toplam puan barajın üzerinde.
              </Callout>
            ) : (
              <Callout tone="fail" title="Başarısızlık nedenleri">
                <ul className="list-disc pl-4 space-y-0.5">
                  {result.failReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Doğru" value={result.correct} tone="pass" />
        <Stat label="Yanlış" value={result.wrong} tone="fail" />
        <Stat label="Boş" value={result.blank} />
        <Stat label="Doğruluk" value={pct(result.accuracy)} />
        <Stat label="Kullanılan Süre" value={duration(result.time.totalTimeMs)} />
        <Stat label="Soru Başına" value={duration(result.time.avgPerQuestionMs)} />
      </div>

      {/* --- Bölüm sonuçları --- */}
      <Card title="Bölüm Sonuçları" subtitle="Her bölüm ayrı barajdır">
        <div className="grid gap-4 md:grid-cols-3">
          {result.sections.map((section) => (
            <div key={section.sectionId} className="border border-[var(--border)] rounded-lg p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-semibold text-[13px]">{section.label}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {section.ordinal}. Bölüm
                  </div>
                </div>
                <PassFail passed={section.passed} />
              </div>

              <div className="mono text-[26px] font-semibold leading-none mb-1">
                {section.correct}
                <span className="text-[15px] text-[var(--text-muted)]"> / {section.total}</span>
              </div>
              <div className="text-[13px] mb-2.5">
                {pct(section.accuracy)}{" "}
                <span className="text-[var(--text-muted)]">
                  · gereken {section.requiredCorrect} doğru (%
                  {(section.passRatio * 100).toFixed(0)})
                </span>
              </div>

              <Meter
                value={section.accuracy}
                threshold={section.passRatio}
                tone={section.passed ? "pass" : "fail"}
              />

              <dl className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div>
                  <dt className="text-[10px] uppercase text-[var(--text-subtle)]">Doğru</dt>
                  <dd className="mono text-[14px]">{section.correct}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[var(--text-subtle)]">Yanlış</dt>
                  <dd className="mono text-[14px]">{section.wrong}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[var(--text-subtle)]">Boş</dt>
                  <dd className="mono text-[14px]">{section.blank}</dd>
                </div>
              </dl>

              <div className="text-[11px] text-[var(--text-muted)] mt-2 pt-2 border-t border-[var(--border)]">
                {duration(section.timeSpentMs)} · soru başına{" "}
                {duration(section.avgTimePerQuestionMs)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* --- Kategori kırılımı --- */}
        <Card title="Kategori Bazlı Performans" subtitle="Teknik bölüm resmî 8 konu başlığına göre ayrılır">
          <div className="space-y-2.5">
            {result.categoryBreakdown.map((cat) => (
              <div key={cat.category}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[12.5px] truncate">{cat.category}</span>
                  <span className="mono text-[12px] shrink-0">
                    {cat.correct}/{cat.total}{" "}
                    <span className="text-[var(--text-muted)]">{pct(cat.accuracy, 0)}</span>
                  </span>
                </div>
                <Meter value={cat.accuracy} tone={cat.accuracy >= 0.6 ? "pass" : "fail"} />
              </div>
            ))}
          </div>
        </Card>

        {/* --- Zayıf / güçlü --- */}
        <Card title="Zayıf ve Güçlü Konular" subtitle="En az 2 soru sorulan alt konular">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase font-semibold mb-2" style={{ color: "var(--fail)" }}>
                Zayıf Konular
              </div>
              {result.weakTopics.length === 0 ? (
                <p className="text-[12px] text-[var(--text-muted)]">Belirgin zayıf konu yok.</p>
              ) : (
                <ol className="space-y-1.5">
                  {result.weakTopics.map((topic, i) => (
                    <li key={topic.subtopic} className="text-[12.5px]">
                      <span className="text-[var(--text-subtle)] mono">{i + 1}.</span>{" "}
                      {topic.subtopic}{" "}
                      <span className="mono text-[var(--text-muted)]">
                        {pct(topic.accuracy, 0)} ({topic.correct}/{topic.total})
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <div className="text-[11px] uppercase font-semibold mb-2" style={{ color: "var(--pass)" }}>
                Güçlü Konular
              </div>
              {result.strongTopics.length === 0 ? (
                <p className="text-[12px] text-[var(--text-muted)]">Yeterli veri yok.</p>
              ) : (
                <ol className="space-y-1.5">
                  {result.strongTopics.map((topic, i) => (
                    <li key={topic.subtopic} className="text-[12.5px]">
                      <span className="text-[var(--text-subtle)] mono">{i + 1}.</span>{" "}
                      {topic.subtopic}{" "}
                      <span className="mono text-[var(--text-muted)]">
                        {pct(topic.accuracy, 0)} ({topic.correct}/{topic.total})
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <Link href="/practice?mode=mistake_concepts&count=20" className="btn w-full">
              Bu konulardan yeni sorularla çalış
            </Link>
          </div>
        </Card>
      </div>

      {/* --- Zaman yönetimi --- */}
      <Card
        title="Zaman Yönetimi"
        subtitle="Soru başına süre ölçümlerinden üretilir"
        actions={
          <Badge
            tone={
              result.time.verdict === "Good"
                ? "pass"
                : result.time.verdict === "Watch"
                  ? "warn"
                  : "fail"
            }
          >
            {result.time.verdict}
          </Badge>
        }
      >
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-2">
              Bölüm bazlı süre
            </div>
            <ul className="space-y-2">
              {result.time.bySection.map((s) => (
                <li key={s.sectionId}>
                  <div className="flex justify-between text-[12.5px] mb-1">
                    <span>{s.label}</span>
                    <span className="mono">
                      {duration(s.timeMs)} <span className="text-[var(--text-muted)]">{pct(s.share, 0)}</span>
                    </span>
                  </div>
                  <Meter value={s.share} tone="accent" />
                </li>
              ))}
            </ul>
            <div className="mt-3 text-[12px] text-[var(--text-muted)]">
              Medyan süre: <span className="mono">{duration(result.time.medianPerQuestionMs)}</span>
              {result.time.allottedTimeMs !== null ? (
                <>
                  {" · "}Sınav süresi:{" "}
                  <span className="mono">{duration(result.time.allottedTimeMs)}</span>
                </>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-2">
              En yavaş sorular
            </div>
            <ol className="space-y-1.5">
              {result.time.slowest.map((t) => (
                <li key={t.position} className="text-[12px] flex gap-2">
                  <span className="mono text-[var(--text-subtle)] shrink-0">#{t.position}</span>
                  <span className="flex-1 truncate">{t.questionText}</span>
                  <span className="mono shrink-0">{duration(t.timeSpentMs)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-2">
              En hızlı sorular
            </div>
            <ol className="space-y-1.5">
              {result.time.fastest.map((t) => (
                <li key={t.position} className="text-[12px] flex gap-2">
                  <span className="mono text-[var(--text-subtle)] shrink-0">#{t.position}</span>
                  <span className="flex-1 truncate">{t.questionText}</span>
                  <span className="mono shrink-0">{duration(t.timeSpentMs)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {result.time.notes.length > 0 ? (
          <ul className="mt-4 pt-3 border-t border-[var(--border)] text-[12.5px] text-[var(--text-muted)] list-disc pl-4 space-y-1">
            {result.time.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* --- Soru soru inceleme --- */}
      <Card
        title="Soru Soru İnceleme"
        subtitle="Doğru cevaplar ve açıklamalar sınav bittikten SONRA gösterilir"
      >
        <ReviewList rows={reviewRows} />
      </Card>
    </div>
  );
}
