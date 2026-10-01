import Link from "next/link";
import { db } from "../../lib/server.ts";
import { listSessions } from "../../db/repos/sessions.ts";
import { fullExamResults } from "../../core/analytics.ts";
import { Badge, Card, EmptyState, PageHeader, PassFail } from "../_components/ui.tsx";
import { dateTimeTR, duration, MODE_LABEL, num, pct } from "../../lib/format.ts";
import type { ExamResult } from "../../core/types.ts";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  const database = db();
  const sessions = listSessions({ limit: 200 }, database);
  const submitted = sessions.filter((s) => s.status === "submitted");
  const exams = fullExamResults(database);

  if (sessions.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Sınav Geçmişi" />
        <EmptyState
          title="Henüz kayıtlı oturum yok"
          description="İlk gerçek sınav simülasyonunu çözdüğünde tüm geçmişin burada listelenecek."
          action={
            <Link href="/exam" className="btn btn-primary">
              Gerçek Sınav Simülasyonu
            </Link>
          }
        />
      </div>
    );
  }

  const resultById = new Map<number, ExamResult>();
  for (const s of submitted) {
    if (s.resultJson) resultById.set(s.id, JSON.parse(s.resultJson) as ExamResult);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sınav Geçmişi"
        description={`${exams.length} gerçek sınav · ${submitted.length - exams.length} çalışma oturumu`}
        actions={
          exams.length >= 2 ? (
            <Link
              href={`/history/compare?previous=${exams[exams.length - 2]!.sessionId}&current=${exams[exams.length - 1]!.sessionId}`}
              className="btn"
            >
              Son iki sınavı karşılaştır
            </Link>
          ) : null
        }
      />

      <Card title="Tüm Oturumlar" padded={false}>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Tür</th>
                <th>Soru</th>
                <th>Puan</th>
                <th>D / Y / B</th>
                <th>Bölüm barajları</th>
                <th>Süre</th>
                <th>Sonuç</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const result = resultById.get(session.id);
                return (
                  <tr key={session.id}>
                    <td className="whitespace-nowrap">{dateTimeTR(session.startedAt)}</td>
                    <td>
                      <span className="badge badge-muted">{MODE_LABEL[session.mode]}</span>
                      {session.autoSubmitted ? (
                        <span className="badge badge-warn ml-1">otomatik</span>
                      ) : null}
                    </td>
                    <td className="mono">{session.totalQuestions}</td>
                    <td className="mono font-semibold">
                      {session.score === null ? "—" : num(session.score, 1)}
                    </td>
                    <td className="mono whitespace-nowrap">
                      {result ? `${result.correct} / ${result.wrong} / ${result.blank}` : "—"}
                    </td>
                    <td>
                      {result ? (
                        <span className="flex gap-1 flex-wrap">
                          {result.sections.map((s) => (
                            <span
                              key={s.sectionId}
                              className={`badge badge-${s.passed ? "pass" : "fail"}`}
                              title={`${s.label}: ${s.correct}/${s.total}`}
                            >
                              {s.sectionId === "general"
                                ? "GK+GY"
                                : s.sectionId === "english"
                                  ? "ENG"
                                  : "TEK"}{" "}
                              {pct(s.accuracy, 0)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="mono whitespace-nowrap">
                      {result ? duration(result.time.totalTimeMs) : "—"}
                    </td>
                    <td>
                      {session.status === "in_progress" ? (
                        <Badge tone="warn">Devam ediyor</Badge>
                      ) : session.status === "abandoned" ? (
                        <Badge tone="muted">İptal</Badge>
                      ) : session.passed === null ? (
                        <Badge tone="muted">—</Badge>
                      ) : (
                        <PassFail passed={session.passed} />
                      )}
                    </td>
                    <td>
                      <Link
                        href={
                          session.status === "in_progress"
                            ? `/exam/${session.id}`
                            : `/exam/${session.id}/result`
                        }
                        className="btn text-[12px] py-1"
                      >
                        {session.status === "in_progress" ? "Devam et" : "Aç"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {exams.length >= 2 ? (
        <Card title="Hızlı Karşılaştırma" subtitle="İki gerçek sınav seç">
          <form className="flex flex-wrap gap-3 items-end" method="get" action="/history/compare">
            <div>
              <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
                Önceki
              </label>
              <select name="previous" className="select" defaultValue={exams[exams.length - 2]!.sessionId}>
                {exams.map((e) => (
                  <option key={e.sessionId} value={e.sessionId}>
                    {e.submittedAt.slice(0, 10)} — {e.score} puan
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] block mb-1">
                Sonraki
              </label>
              <select name="current" className="select" defaultValue={exams[exams.length - 1]!.sessionId}>
                {exams.map((e) => (
                  <option key={e.sessionId} value={e.sessionId}>
                    {e.submittedAt.slice(0, 10)} — {e.score} puan
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Karşılaştır
            </button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
