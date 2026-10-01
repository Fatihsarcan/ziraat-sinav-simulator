import Link from "next/link";
import { db } from "../../lib/server.ts";
import { loadExamConfig } from "../../config/load-config.ts";
import { requiredCorrect } from "../../config/exam-config.ts";
import { EXAM_BLUEPRINT } from "../../config/curriculum.ts";
import { coverageReport } from "../../question-engine/index.ts";
import { getActiveSession } from "../../db/repos/sessions.ts";
import { Badge, Callout, Card, PageHeader } from "../_components/ui.tsx";
import { StartExamButton } from "./start-button.tsx";
import { dateTimeTR, num } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default function ExamStartPage() {
  const database = db();
  const config = loadExamConfig(database);
  const coverage = coverageReport(database);
  const active = getActiveSession(database);

  const byCategory = new Map(coverage.categories.map((c) => [c.category, c]));
  const blueprintRows = EXAM_BLUEPRINT.map((entry) => {
    const info = byCategory.get(entry.category);
    return {
      category: entry.category,
      label: info?.label ?? entry.category,
      section: info?.section ?? "technical",
      needed: entry.count,
      available: info?.verified ?? 0,
      ok: (info?.verified ?? 0) >= entry.count,
    };
  });

  const notEnough = blueprintRows.filter((r) => !r.ok);

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Gerçek Sınav Simülasyonu"
        description="Resmî sınav yapısı birebir uygulanır: tek oturum, gerçek zamanlı sayaç, otomatik teslim ve bölüm barajları."
      />

      {active ? (
        <Callout tone="warn" title="Devam eden oturum">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {active.label} — {dateTimeTR(active.startedAt)} başladı. Yeni sınav başlatmak için önce
              bunu bitir.
            </span>
            <Link href={`/exam/${active.id}`} className="btn btn-primary">
              Devam et
            </Link>
          </div>
        </Callout>
      ) : null}

      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <Card title="Sınav Yapısı" subtitle="23.09.2026 tarihli resmî ilana göre">
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Bölüm</th>
                  <th>Soru</th>
                  <th>Baraj</th>
                  <th>Gereken doğru</th>
                </tr>
              </thead>
              <tbody>
                {config.sections.map((section) => (
                  <tr key={section.id}>
                    <td>
                      <div className="font-medium">
                        {section.ordinal}. Bölüm — {section.label}
                      </div>
                      <div className="text-[12px] text-[var(--text-muted)]">
                        {section.subsections.map((s) => `${s.label} ${s.questionCount}`).join(" · ")}
                      </div>
                    </td>
                    <td className="mono">{section.questionCount}</td>
                    <td className="mono">%{(section.passRatio * 100).toFixed(0)}</td>
                    <td className="mono">{requiredCorrect(section)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">TOPLAM</td>
                  <td className="mono font-semibold">{config.totalQuestions}</td>
                  <td colSpan={2} className="text-[12px]">
                    Süre <b className="mono">{config.durationMinutes} dakika</b> · Toplam puan barajı{" "}
                    <b className="mono">{config.thresholds.overallScore}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Callout tone="info" title="Başarı kuralı">
            Sınavdan geçmek için <b>her bölümün barajı ayrı ayrı</b> tutmalı <b>ve</b> toplam puan en
            az {config.thresholds.overallScore} olmalıdır. Bir bölüm barajı tutmazsa toplam puan
            yüksek olsa bile sonuç <b>FAIL</b>'dir.
          </Callout>

          <div className="mt-4 text-[12px] text-[var(--text-muted)] space-y-1">
            <p>
              <b>Puanlama varsayımı:</b> Resmî ilan yanlış cevabın doğruyu götürdüğünü
              belirtmiyor; bu nedenle ceza katsayısı 0 kabul edildi (puan = doğru/toplam × 100).
              Bu değer Ayarlar üzerinden değiştirilebilir.
            </p>
            <p>
              Sınav sırasında doğru cevaplar, açıklamalar ve puanın <b>gösterilmez</b>. Sayaç
              sunucuda tutulur; sayfayı yenilesen de sıfırlanmaz, süre dolduğunda sınav otomatik
              teslim edilir.
            </p>
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Başlat">
            <StartExamButton disabled={active !== null} />
          </Card>

          <Card title="Soru Bankası Hazırlığı" subtitle="Bu sınav için gereken doğrulanmış sorular">
            {notEnough.length === 0 ? (
              <Callout tone="pass" title="Banka yeterli">
                Tüm kategorilerde sınav için gereken doğrulanmış soru sayısı mevcut.
              </Callout>
            ) : (
              <Callout tone="fail" title={`${notEnough.length} kategoride soru eksik`}>
                Aşağıdaki kategorilerde yeterli doğrulanmış soru yok. Soru üretimi çalıştırabilir ya
                da eksik soruyla başlamayı seçebilirsin.
              </Callout>
            )}
            <div className="scroll-x mt-3">
              <table className="data">
                <thead>
                  <tr>
                    <th>Kategori</th>
                    <th>Ger.</th>
                    <th>Mevcut</th>
                  </tr>
                </thead>
                <tbody>
                  {blueprintRows.map((row) => (
                    <tr key={row.category}>
                      <td className="text-[12px]">{row.label}</td>
                      <td className="mono">{row.needed}</td>
                      <td className="mono">
                        {row.ok ? (
                          <span>{num(row.available)}</span>
                        ) : (
                          <Badge tone="fail">{num(row.available)}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link href="/questions" className="btn w-full mt-3">
              Soru bankasını yönet
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
