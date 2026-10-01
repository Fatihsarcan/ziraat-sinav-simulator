import { db } from "../../lib/server.ts";
import {
  listImportBatches,
  listReferenceQuestions,
  referenceSummary,
} from "../../db/repos/reference.ts";
import { allStyleProfiles } from "../../question-engine/style-analyzer.ts";
import { SOURCE_LEVELS, STYLE_CONFIDENCE_LABEL, styleTypeLabel } from "../../config/exam-style.ts";
import { ALL_CATEGORIES } from "../../config/curriculum.ts";
import { Badge, Callout, Card, EmptyState, PageHeader, Stat } from "../_components/ui.tsx";
import { dateTimeTR } from "../../lib/format.ts";
import { ImportPanel } from "./import-panel.tsx";
import { ReviewQueue } from "./review-queue.tsx";

export const dynamic = "force-dynamic";

const SECTION_LABEL: Record<string, string> = {
  general: "Genel Kültür / Genel Yetenek",
  english: "İngilizce",
  technical: "Bilgisayar, Bilişim ve Yapay Zekâ",
};

export default function ReferencePage() {
  const database = db();
  const summary = referenceSummary(database);
  const batches = listImportBatches(15, database);
  const profiles = allStyleProfiles(database);
  const pending = listReferenceQuestions({ reviewState: "pending", limit: 25 }, database);
  const counts = listReferenceQuestions({ limit: 1 }, database);
  const approved = listReferenceQuestions({ reviewState: "approved", limit: 1 }, database);
  const rejected = listReferenceQuestions({ reviewState: "rejected", limit: 1 }, database);

  const categoryOptions = ALL_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    section: c.section,
    subtopics: [...c.subtopics],
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Çıkmış Sorular ve Stil Referansı"
        description="Geçmiş sınav sorularını içe aktar, incele ve onayla. Onaylananlar 'Çıkmış Sorular' modunda çözülür; hepsi birlikte üretimi yönlendiren stil profilini besler."
      />

      <Callout tone="info" title="Bu sorular gerçek sınav simülasyonuna karışmaz">
        İçe aktarılan sorular ana soru bankasından <b>ayrı</b> tutulur. Onayladığında soru
        bankasına <b>&ldquo;çıkmış soru&rdquo;</b> etiketiyle eklenir ve yalnızca{" "}
        <b>Çalışma → Çıkmış Sorular</b> modunda sorulur. Gerçek Sınav Simülasyonu her zaman
        2026 müfredatına göre üretilmiş özgün sorularla kurulur.
      </Callout>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Toplam referans" value={counts.total} />
        <Stat label="Onay bekleyen" value={pending.total} />
        <Stat label="Onaylanmış" value={approved.total} />
        <Stat label="Reddedilmiş" value={rejected.total} />
      </div>

      <ImportPanel />

      {/* ------------------------------------------------------------------ */}
      <Card
        title="Exam Style Profile"
        subtitle="Geçmiş sorulardan ölçülen stil hedefleri. Üretim promptuna bu değerler gömülür."
        padded={false}
      >
        {profiles.length === 0 ? (
          <p className="p-4 text-[13px] text-[var(--text-muted)]">
            Henüz profil hesaplanmadı. Bir kaynak içe aktardığında otomatik oluşur.
          </p>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Kapsam</th>
                  <th className="text-right">Örneklem</th>
                  <th>Güven</th>
                  <th className="text-right">Kök uz.</th>
                  <th className="text-right">Şık uz.</th>
                  <th className="text-right">Süre</th>
                  <th className="text-right">Olumsuz</th>
                  <th>Baskın soru tipleri</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(({ profile }) => {
                  const top = Object.entries(profile.styleMix)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);
                  return (
                    <tr key={profile.scope}>
                      <td className="font-medium">
                        {profile.section ? SECTION_LABEL[profile.section] : "Tüm sınav"}
                      </td>
                      <td className="mono text-right">{profile.sampleSize}</td>
                      <td>
                        <Badge
                          tone={
                            profile.confidence === "high"
                              ? "pass"
                              : profile.confidence === "none"
                                ? "warn"
                                : "info"
                          }
                        >
                          {STYLE_CONFIDENCE_LABEL[profile.confidence]}
                        </Badge>
                      </td>
                      <td className="mono text-right">{profile.avgStemChars}</td>
                      <td className="mono text-right">{profile.avgOptionChars}</td>
                      <td className="mono text-right">{profile.avgSeconds} sn</td>
                      <td className="mono text-right">%{Math.round(profile.negativeRatio * 100)}</td>
                      <td className="text-[12px]">
                        {top
                          .map(([key, value]) => `${styleTypeLabel(key)} %${Math.round(value * 100)}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {profiles.some((p) => p.profile.notes.length > 0) ? (
          <div className="p-4 pt-0 space-y-1">
            {profiles
              .flatMap((p) => p.profile.notes.map((n) => ({ scope: p.profile.scope, note: n })))
              .map((item, i) => (
                <p key={i} className="text-[12px] text-[var(--warn)]">
                  ⚠ {item.note}
                </p>
              ))}
          </div>
        ) : null}
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card
        title="Kaynak Dökümü"
        subtitle="Her kaynaktan kaç referans çıktı, kaçının cevabı biliniyor"
        padded={false}
      >
        {summary.length === 0 ? (
          <EmptyState
            title="Henüz içe aktarılmış kaynak yok"
            description="Elindeki çıkmış soru PDF'lerini, JSON veya TXT dosyalarını yukarıdan yükleyebilirsin."
          />
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Seviye</th>
                  <th>Kaynak</th>
                  <th className="text-right">Yıl</th>
                  <th>Bölümler</th>
                  <th className="text-right">Toplam</th>
                  <th className="text-right">Cevaplı</th>
                  <th className="text-right">Bekleyen</th>
                  <th className="text-right">Onaylı</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <Badge tone={row.sourceLevel === "A" ? "pass" : row.sourceLevel === "B" ? "info" : "warn"}>
                        {row.sourceLevel}
                      </Badge>
                    </td>
                    <td>
                      {row.sourceUrl ? (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                          style={{ color: "var(--accent)" }}
                        >
                          {row.sourceName}
                        </a>
                      ) : (
                        row.sourceName
                      )}
                    </td>
                    <td className="mono text-right">{row.sourceYear ?? "—"}</td>
                    <td className="text-[12px]">
                      {row.sections.map((s) => SECTION_LABEL[s] ?? s).join(", ") || "—"}
                    </td>
                    <td className="mono text-right">{row.total}</td>
                    <td className="mono text-right">{row.withAnswer}</td>
                    <td className="mono text-right">{row.pending}</td>
                    <td className="mono text-right">{row.approved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      <ReviewQueue items={pending.items} total={pending.total} categories={categoryOptions} />

      {/* ------------------------------------------------------------------ */}
      <Card title="İçe Aktarma Geçmişi" padded={false}>
        {batches.length === 0 ? (
          <p className="p-4 text-[13px] text-[var(--text-muted)]">Henüz içe aktarma yapılmadı.</p>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Dosya</th>
                  <th>Tür</th>
                  <th>Seviye</th>
                  <th className="text-right">Tespit</th>
                  <th className="text-right">Eklenen</th>
                  <th className="text-right">Tekrar</th>
                  <th className="text-right">Elenen</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="font-medium">{batch.filename}</td>
                    <td className="mono">{batch.kind}</td>
                    <td className="mono">{batch.sourceLevel}</td>
                    <td className="mono text-right">{batch.detected}</td>
                    <td className="mono text-right">{batch.imported}</td>
                    <td className="mono text-right">{batch.duplicates}</td>
                    <td className="mono text-right">{batch.rejected}</td>
                    <td>
                      <Badge tone={batch.status === "parsed" ? "pass" : "fail"}>
                        {batch.status === "parsed" ? "Ayrıştırıldı" : "Başarısız"}
                      </Badge>
                      {batch.message ? (
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 max-w-[420px]">
                          {batch.message}
                        </div>
                      ) : null}
                    </td>
                    <td className="mono whitespace-nowrap">{dateTimeTR(batch.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Card title="Kaynak güven hiyerarşisi" subtitle="Her referans bu seviyelerden biriyle etiketlenir">
        <ul className="space-y-2 text-[13px]">
          {SOURCE_LEVELS.map((level) => (
            <li key={level.level} className="flex gap-3">
              <span className="shrink-0">
                <Badge
                  tone={level.level === "A" ? "pass" : level.level === "B" ? "info" : level.level === "E" ? "muted" : "warn"}
                >
                  {level.label}
                </Badge>
              </span>
              <span className="text-[var(--text-muted)]">
                {level.description}
                {level.claimableAsPastQuestion ? null : (
                  <b className="text-[var(--warn)]">
                    {" "}
                    Bu seviye &ldquo;doğrulanmış çıkmış soru&rdquo; olarak sunulmaz.
                  </b>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
