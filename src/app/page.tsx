import Link from "next/link";
import { db } from "../lib/server.ts";
import { dailyRecommendation, dashboardStats, progressSeries } from "../core/analytics.ts";
import { getActiveSession } from "../db/repos/sessions.ts";
import { coverageReport } from "../question-engine/index.ts";
import { generationStatus } from "../question-engine/llm-client.ts";
import { Badge, Callout, Card, Meter, PageHeader, Stat } from "./_components/ui.tsx";
import { ProgressChart } from "./_components/charts.tsx";
import { dateTimeTR, duration, MODE_LABEL, num, pct } from "../lib/format.ts";

export const dynamic = "force-dynamic";

/** Bolum ve zaman yonetimi degerlendirmelerinin ortak renk haritasi. */
const VERDICT_TONE: Record<string, "pass" | "warn" | "fail" | "muted"> = {
  Strong: "pass",
  Good: "pass",
  Moderate: "warn",
  Watch: "warn",
  "At Risk": "fail",
  "No Data": "muted",
};

export default function DashboardPage() {
  const database = db();
  const stats = dashboardStats(database);
  const progress = progressSeries(database);
  const recommendation = dailyRecommendation(database);
  const active = getActiveSession(database);
  const coverage = coverageReport(database);
  const genStatus = generationStatus();

  const readiness = stats.readiness;
  const readinessTone =
    readiness.score >= 75 ? "pass" : readiness.score >= 55 ? "warn" : "fail";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`${stats.config.examName} — ${new Date(stats.config.examDate).toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
        actions={
          <Link href="/exam" className="btn btn-primary btn-lg">
            Gerçek Sınav Simülasyonu
          </Link>
        }
      />

      {active ? (
        <Callout tone="warn" title="Devam eden bir oturumun var">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {MODE_LABEL[active.mode]} — {active.label} ({dateTimeTR(active.startedAt)} başladı)
            </span>
            <Link href={`/exam/${active.id}`} className="btn btn-primary">
              Devam et
            </Link>
          </div>
        </Callout>
      ) : null}

      {!genStatus.available ? (
        <Callout tone="info" title="Soru üretimi kapalı">
          {genStatus.reason} Mevcut soru bankasıyla sınav ve çalışma normal şekilde çalışır.
        </Callout>
      ) : null}

      {/* --- Üst istatistik şeridi --- */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <Stat
          label="Sınava Kalan"
          value={stats.daysLeft >= 0 ? `${stats.daysLeft} GÜN` : "GEÇTİ"}
          tone={stats.daysLeft <= 14 ? "fail" : stats.daysLeft <= 30 ? "warn" : "default"}
        />
        <Stat
          label="Hazırlık"
          value={`${num(readiness.score, 0)}/100`}
          tone={readinessTone}
          hint={readiness.sampleSize === 0 ? "veri yetersiz" : `${readiness.sampleSize} sınav`}
        />
        <Stat label="Son Puan" value={stats.latestScore ?? "—"} />
        <Stat label="Ortalama" value={stats.averageScore ?? "—"} />
        <Stat label="En İyi" value={stats.bestScore ?? "—"} />
        <Stat label="Çözülen Soru" value={num(stats.questionsSolved)} />
        <Stat
          label="Genel Doğruluk"
          value={pct(stats.overallAccuracy, 1)}
          hint={`soru başına ${duration(stats.avgTimePerQuestionMs)}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* --- Hazırlık detayı --- */}
        <Card
          title="Sınava Hazır Olma Seviyesi"
          subtitle="Ağırlıklı 6 bileşenden hesaplanır; her bileşenin gerekçesi aşağıda."
          className="lg:col-span-2"
        >
          <div className="flex items-baseline gap-3 mb-3">
            <span
              className="mono text-[42px] font-semibold leading-none"
              style={{
                color:
                  readinessTone === "pass"
                    ? "var(--pass)"
                    : readinessTone === "warn"
                      ? "var(--warn)"
                      : "var(--fail)",
              }}
            >
              {num(readiness.score, 0)}
            </span>
            <span className="text-[var(--text-muted)]">/ 100</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {readiness.sectionVerdicts.map((v) => (
              <span key={v.sectionId} className={`badge badge-${VERDICT_TONE[v.verdict]}`}>
                {v.label}: {v.verdict}
                {v.accuracy !== null ? ` (${pct(v.accuracy, 0)})` : ""}
              </span>
            ))}
            <span className={`badge badge-${VERDICT_TONE[readiness.timeManagement]}`}>
              Zaman Yönetimi: {readiness.timeManagement}
            </span>
          </div>

          <div className="space-y-2.5">
            {readiness.components.map((c) => (
              <div key={c.key} className="grid grid-cols-[150px_60px_1fr] gap-3 items-center">
                <div className="text-[13px]">
                  {c.label}
                  <span className="text-[var(--text-subtle)] text-[11px]"> ·{pct(c.weight, 0)}</span>
                </div>
                <div className="mono text-[13px] text-right">
                  {c.detail.startsWith("Yeterli veri yok") ? "—" : num(c.value, 0)}
                </div>
                <div>
                  <Meter value={c.value / 100} tone={c.value >= 60 ? "pass" : "fail"} />
                  <div className="text-[11px] text-[var(--text-muted)] mt-1">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {readiness.explanation.length > 0 ? (
            <ul className="mt-4 space-y-1 text-[12px] text-[var(--text-muted)] list-disc pl-4">
              {readiness.explanation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </Card>

        {/* --- Günlük öneri --- */}
        <Card
          title="Bugünün Önerisi"
          subtitle={`Toplam ${recommendation.totalQuestions} soru — gerçek performans verisine dayanır`}
        >
          <ol className="space-y-2.5">
            {recommendation.items.map((item, index) => (
              <li key={`${item.label}-${index}`} className="border-b border-[var(--border)] pb-2.5 last:border-0 last:pb-0">
                <Link href={item.link} className="font-medium text-[13px] hover:underline">
                  {item.label}
                </Link>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{item.reason}</p>
              </li>
            ))}
          </ol>
          {recommendation.rationale.length > 0 ? (
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-1">
                Gerekçe
              </div>
              <ul className="text-[12px] text-[var(--text-muted)] space-y-0.5 list-disc pl-4">
                {recommendation.rationale.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* --- İlerleme grafiği --- */}
        <Card
          title="Gelişim"
          subtitle="Gerçek sınav simülasyonlarındaki toplam puan"
          className="lg:col-span-2"
        >
          <ProgressChart data={progress} threshold={stats.config.thresholds.overallScore} />
        </Card>

        {/* --- Bölüm doğruluğu vs baraj --- */}
        <Card title="Bölüm Doğruluğu" subtitle="Tüm çözülen sorular · dikey çizgi = baraj">
          <div className="space-y-4">
            {stats.sectionAccuracy.map((s) => (
              <div key={s.sectionId}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[13px] font-medium">{s.label}</span>
                  <span className="mono text-[13px]">
                    {pct(s.accuracy)}{" "}
                    <span className="text-[var(--text-subtle)]">/ {pct(s.requiredRatio, 0)}</span>
                  </span>
                </div>
                <Meter
                  value={s.accuracy ?? 0}
                  threshold={s.requiredRatio}
                  tone={s.accuracy !== null && s.accuracy >= s.requiredRatio ? "pass" : "fail"}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--border)] space-y-2 text-[12px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Soru bankası</span>
              <span className="mono">
                {num(stats.bank.verified)} doğrulanmış / {num(stats.bank.total)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Eşik altı kategori</span>
              <span>
                {coverage.belowThreshold > 0 ? (
                  <Badge tone="warn">{coverage.belowThreshold} kategori</Badge>
                ) : (
                  <Badge tone="pass">Yeterli</Badge>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Yanlış defteri</span>
              <span className="mono">
                {num(stats.mistakes.unresolved)} açık / {num(stats.mistakes.total)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Tamamlanan çalışma</span>
              <span className="mono">{num(stats.totalPracticeSessions)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
