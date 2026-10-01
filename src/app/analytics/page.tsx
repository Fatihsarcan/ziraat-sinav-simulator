import Link from "next/link";
import { db } from "../../lib/server.ts";
import { analyticsPayload } from "../../core/analytics.ts";
import { Badge, Card, EmptyState, Meter, PageHeader } from "../_components/ui.tsx";
import {
  MasteryChart,
  ProgressChart,
  SectionTrendChart,
  TimeBySectionChart,
} from "../_components/charts.tsx";
import { masteryBand } from "../../core/mastery.ts";
import { num, pct } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

const BAND_TONE = {
  weak: "fail",
  moderate: "warn",
  good: "info",
  strong: "pass",
} as const;

const BAND_LABEL = {
  weak: "Zayıf",
  moderate: "Orta",
  good: "İyi",
  strong: "Güçlü",
} as const;

export default function AnalyticsPage() {
  const database = db();
  const data = analyticsPayload(database);

  const thresholds = {
    general: data.config.thresholds.bySection.general,
    english: data.config.thresholds.bySection.english,
    technical: data.config.thresholds.bySection.technical,
  };

  const weakest = [...data.mastery].sort((a, b) => a.masteryScore - b.masteryScore).slice(0, 15);

  if (data.progress.length === 0 && data.mastery.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Analiz" />
        <EmptyState
          title="Analiz için henüz veri yok"
          description="Bir gerçek sınav ya da çalışma tamamladığında trendler, ustalık skorları ve zaman analizi burada oluşur."
          action={
            <Link href="/exam" className="btn btn-primary">
              Gerçek Sınav Simülasyonu
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analiz"
        description="Zaman içindeki gelişimin, bölüm barajlarına göre konumun ve konu bazlı ustalığın."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Toplam Puan Trendi" subtitle="Gerçek sınav simülasyonları">
          <ProgressChart data={data.progress} threshold={data.config.thresholds.overallScore} />
        </Card>

        <Card title="Bölüm Doğruluk Trendi" subtitle="Bölüm barajlarıyla birlikte">
          <SectionTrendChart
            data={data.progress.map((p) => ({
              date: p.date,
              general: p.general,
              english: p.english,
              technical: p.technical,
            }))}
            thresholds={thresholds}
          />
        </Card>
      </div>

      <Card title="Bölüm Barajı Durumu" subtitle="Her sınavda barajın tutup tutmadığı">
        <div className="grid gap-4 md:grid-cols-3">
          {data.sectionTrend.map((section) => {
            const passes = section.points.filter((p) => p.passed).length;
            return (
              <div key={section.sectionId} className="border border-[var(--border)] rounded-lg p-3.5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-semibold text-[13px]">{section.label}</div>
                  <Badge tone={passes === section.points.length && passes > 0 ? "pass" : "warn"}>
                    {passes}/{section.points.length} baraj
                  </Badge>
                </div>
                <div className="text-[12px] text-[var(--text-muted)] mb-2">
                  {section.totalQuestions} soruda en az{" "}
                  <b className="mono">{section.requiredCorrect}</b> doğru gerekiyor.
                </div>
                <div className="flex gap-1 flex-wrap">
                  {section.points.map((p, index) => (
                    <span
                      key={`${p.date}-${index}`}
                      title={`${p.date}: %${p.accuracy}`}
                      className="mono text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: p.passed ? "var(--pass-soft)" : "var(--fail-soft)",
                        color: p.passed ? "var(--pass)" : "var(--fail)",
                      }}
                    >
                      {p.accuracy}
                    </span>
                  ))}
                  {section.points.length === 0 ? (
                    <span className="text-[12px] text-[var(--text-muted)]">Veri yok</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="En Zayıf Alt Konular"
          subtitle="Ustalık skoru 0-100; son cevaplar daha ağır, az denemede 50'ye çekilir"
        >
          <MasteryChart
            data={weakest.map((m) => ({
              label: `${m.subtopic}`,
              value: m.masteryScore,
              attempts: m.attempts,
            }))}
          />
        </Card>

        <Card title="Kategori Ustalığı" subtitle="Alt konuların deneme sayısıyla ağırlıklı ortalaması">
          <div className="space-y-3">
            {data.categoryMastery.map((c) => {
              const band = masteryBand(c.masteryScore);
              return (
                <div key={c.category}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[12.5px] truncate">{c.category}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className={`badge badge-${BAND_TONE[band]}`}>{BAND_LABEL[band]}</span>
                      <span className="mono text-[12px]">{num(c.masteryScore, 1)}</span>
                    </span>
                  </div>
                  <Meter
                    value={c.masteryScore / 100}
                    tone={band === "weak" ? "fail" : band === "strong" ? "pass" : "accent"}
                  />
                  <div className="text-[11px] text-[var(--text-subtle)] mt-0.5">
                    {c.attempts} deneme
                  </div>
                </div>
              );
            })}
            {data.categoryMastery.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">Henüz ustalık verisi yok.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card title="Bölüm Bazlı Süre Kullanımı" subtitle="Her gerçek sınavda dakika cinsinden">
        <TimeBySectionChart data={data.timeBySection} />
      </Card>

      <Card title="Tüm Alt Konular" padded={false}>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Bölüm</th>
                <th>Kategori</th>
                <th>Alt konu</th>
                <th className="text-right">Deneme</th>
                <th className="text-right">Doğru</th>
                <th className="text-right">Doğruluk</th>
                <th className="text-right">Ustalık</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {[...data.mastery]
                .sort((a, b) => a.masteryScore - b.masteryScore)
                .map((m) => {
                  const band = masteryBand(m.masteryScore);
                  return (
                    <tr key={m.id}>
                      <td>
                        {data.config.sections.find((s) => s.id === m.section)?.shortLabel ?? m.section}
                      </td>
                      <td className="text-[12px]">{m.category}</td>
                      <td className="text-[12px]">{m.subtopic}</td>
                      <td className="mono text-right">{m.attempts}</td>
                      <td className="mono text-right">{m.correct}</td>
                      <td className="mono text-right">
                        {m.attempts === 0 ? "—" : pct(m.correct / m.attempts, 0)}
                      </td>
                      <td className="mono text-right font-semibold">{num(m.masteryScore, 1)}</td>
                      <td>
                        <span className={`badge badge-${BAND_TONE[band]}`}>{BAND_LABEL[band]}</span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Hazırlık Skoru Nasıl Hesaplanıyor?">
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Bileşen</th>
                <th className="text-right">Ağırlık</th>
                <th className="text-right">Değer</th>
                <th>Gerekçe</th>
              </tr>
            </thead>
            <tbody>
              {data.readiness.components.map((c) => (
                <tr key={c.key}>
                  <td className="font-medium">{c.label}</td>
                  <td className="mono text-right">{pct(c.weight, 0)}</td>
                  <td className="mono text-right">
                    {c.detail.startsWith("Yeterli veri yok") ? "—" : num(c.value, 0)}
                  </td>
                  <td className="text-[12px] text-[var(--text-muted)]">{c.detail}</td>
                </tr>
              ))}
              <tr>
                <td className="font-semibold">TOPLAM</td>
                <td />
                <td className="mono text-right font-semibold">{num(data.readiness.score, 1)}</td>
                <td className="text-[12px] text-[var(--text-muted)]">
                  Veri bulunmayan bileşenler hesaba katılmaz; kalan ağırlıklar yeniden normalize
                  edilir.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
