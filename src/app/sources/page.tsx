import Link from "next/link";
import { db } from "../../lib/server.ts";
import { listSources, sourceUsage } from "../../db/repos/sources.ts";
import { referenceSummary } from "../../db/repos/reference.ts";
import { SOURCE_LEVELS, type SourceLevel } from "../../config/exam-style.ts";
import { Badge, Callout, Card, PageHeader } from "../_components/ui.tsx";
import { dateTR } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

const SECTION_LABEL: Record<string, string> = {
  general: "Genel",
  english: "İngilizce",
  technical: "Teknik",
};

const LEVEL_TONE: Record<SourceLevel, "pass" | "info" | "warn" | "muted"> = {
  A: "pass",
  B: "info",
  C: "warn",
  D: "warn",
  E: "muted",
};

export default function SourcesPage() {
  const database = db();
  const sources = listSources(database);
  const usage = new Map(sourceUsage(database).map((u) => [u.sourceId, u.questionCount]));
  const references = referenceSummary(database);

  // Uretilmis sorularin kaynaklari (E seviyesi): uretim sirasinda kullanilan
  // dokumantasyon/standart adresleri. Bunlar "cikmis soru" kaynagi DEGILDIR.
  const byLevel = new Map<SourceLevel, typeof sources>();
  for (const source of sources) {
    const level = (source.level ?? "D") as SourceLevel;
    const list = byLevel.get(level);
    if (list) list.push(source);
    else byLevel.set(level, [source]);
  }

  const referenceByLevel = new Map<SourceLevel, typeof references>();
  for (const row of references) {
    const list = referenceByLevel.get(row.sourceLevel);
    if (list) list.push(row);
    else referenceByLevel.set(row.sourceLevel, [row]);
  }

  const generatedQuestionCount = [...usage.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kaynaklar"
        description="Her iddianın ve her sorunun dayandığı kaynak, güven seviyesiyle birlikte. Kaynağı bilinmeyen hiçbir şey “resmî” ya da “çıkmış soru” olarak sunulmaz."
      />

      <Callout tone="pass" title="Birincil kaynak (Seviye A)">
        Uygulamadaki sınav yapısı (140 soru / 160 dakika, 1. Bölüm 60 = Genel Kültür 20 + Genel
        Yetenek 40, 2. Bölüm İngilizce 40, 3. Bölüm Bilgisayar-Bilişim-Yapay Zekâ 40), barajlar
        (%60 / %60 / %50 ve toplam ≥ 60 puan), 8 teknik konu başlığı ve 24 Ekim 2026 sınav
        tarihi <b>23.09.2026 tarihli resmî Ziraat Bankası ilanından</b> alınmıştır. 2026 resmî
        müfredatı, soru üretiminde <b>diğer tüm kaynakların üstündedir</b>: eski sınavlarda
        sorulmuş olsa bile müfredat dışı konudan soru üretilmez.
      </Callout>

      {references.length === 0 ? (
        <Callout tone="warn" title="Çıkmış soru veri seti henüz boş">
          Şu anda içe aktarılmış <b>hiç</b> çıkmış Ziraat sorusu yok. Bu yüzden Exam Style
          Profile ölçüme değil <b>varsayıma</b> dayanıyor ve bu, üretim promptunda da açıkça
          böyle belirtiliyor. Elindeki çıkmış soru PDF/arşivlerini{" "}
          <Link href="/reference" className="underline" style={{ color: "var(--accent)" }}>
            Çıkmış Sorular
          </Link>{" "}
          ekranından yükleyince profil gerçek ölçüme döner.
        </Callout>
      ) : null}

      {SOURCE_LEVELS.map((level) => {
        const levelSources = byLevel.get(level.level) ?? [];
        const levelReferences = referenceByLevel.get(level.level) ?? [];
        const referenceTotal = levelReferences.reduce((a, r) => a + r.total, 0);

        return (
          <Card
            key={level.level}
            title={level.label}
            subtitle={level.description}
            padded={false}
          >
            <div className="px-4 pt-3 flex flex-wrap gap-2 text-[12px]">
              <Badge tone={LEVEL_TONE[level.level]}>
                {levelSources.length} kaynak
              </Badge>
              {referenceTotal > 0 ? (
                <Badge tone="info">{referenceTotal} referans soru</Badge>
              ) : null}
              {level.level === "E" && generatedQuestionCount > 0 ? (
                <Badge tone="muted">{generatedQuestionCount} üretilmiş soru bu kaynaklara bağlı</Badge>
              ) : null}
              {!level.claimableAsPastQuestion && level.level !== "E" ? (
                <span style={{ color: "var(--warn)" }}>
                  Bu seviye &ldquo;doğrulanmış çıkmış soru&rdquo; olarak sunulmaz.
                </span>
              ) : null}
            </div>

            {levelSources.length === 0 && levelReferences.length === 0 ? (
              <p className="p-4 text-[13px] text-[var(--text-muted)]">
                Bu seviyede kayıtlı kaynak yok.
              </p>
            ) : (
              <div className="scroll-x mt-3">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Kaynak</th>
                      <th className="text-right">Yıl</th>
                      <th>Bölümler</th>
                      <th>Güvenilirlik</th>
                      <th>Erişim</th>
                      <th className="text-right">Soru / referans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {levelSources.map((source) => (
                      <tr key={`s-${source.id}`}>
                        <td>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline font-medium"
                            style={{ color: "var(--accent)" }}
                          >
                            {source.title}
                          </a>
                          {source.notes ? (
                            <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                              {source.notes}
                            </div>
                          ) : null}
                        </td>
                        <td className="mono text-right">{source.sourceYear ?? "—"}</td>
                        <td className="text-[12px]">
                          {source.sections.length > 0
                            ? source.sections.map((s) => SECTION_LABEL[s] ?? s).join(", ")
                            : "—"}
                        </td>
                        <td className="text-[12px]">{source.reliability}</td>
                        <td className="mono whitespace-nowrap">{dateTR(source.accessedAt)}</td>
                        <td className="mono text-right">{usage.get(source.id) ?? 0}</td>
                      </tr>
                    ))}
                    {levelReferences.map((row, i) => (
                      <tr key={`r-${i}`}>
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
                          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                            İçe aktarılan çıkmış soru kaynağı · {row.withAnswer} tanesinin cevabı
                            biliniyor · {row.approved} onaylı, {row.pending} beklemede
                          </div>
                        </td>
                        <td className="mono text-right">{row.sourceYear ?? "—"}</td>
                        <td className="text-[12px]">
                          {row.sections.map((s) => SECTION_LABEL[s] ?? s).join(", ") || "—"}
                        </td>
                        <td className="text-[12px]">—</td>
                        <td className="mono whitespace-nowrap">—</td>
                        <td className="mono text-right">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

      <Callout tone="warn" title="Açıkça belirtilen varsayımlar">
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <b>İngilizce CEFR seviyesi:</b> Resmî ilan bu bölüm için CEFR seviyesi{" "}
            <b>belirtmemektedir</b>. Sorulardaki A2/B1/B2/C1 etiketleri uygulamanın kendi
            kalibrasyonudur, resmî bir iddia değildir.
          </li>
          <li>
            <b>İngilizce soru türleri</b> (cloze test, paragraf tamamlama, okuduğunu anlama vb.)
            resmî ilanda yer almaz; benzer banka sınavlarına hazırlık kaynaklarından türetilmiştir.
          </li>
          <li>
            <b>Genel Kültür / Genel Yetenek alt konuları</b> resmî değildir; geçmiş banka
            sınavlarının yapısından türetilmiştir. Resmî olan yalnızca bölüm adları ve soru
            sayılarıdır.
          </li>
          <li>
            <b>Teknik alt konular</b> resmî değildir; resmî olan yalnızca Ek-1&apos;deki 8 ana konu
            başlığıdır.
          </li>
          <li>
            <b>Puanlama:</b> Yanlışın doğruyu götürdüğü ilanda belirtilmediği için ceza katsayısı 0
            kabul edilmiştir.
          </li>
          <li>
            <b>Exam Style Profile:</b> Referans (çıkmış soru) örneklemi küçükken oranlar ölçümle
            varsayımın karışımıdır; her profil kendi güven seviyesini taşır ve bu bilgi üretim
            promptuna da yazılır.
          </li>
        </ul>
      </Callout>

      <Callout tone="info" title="Telif">
        Ücretli soru bankaları ve korumalı kaynaklar <b>toplu kopyalanmaz</b>. İçe aktarılan
        çıkmış sorular kişisel çalışma içindir; üretim aşamasında eski sorular yalnızca{" "}
        <b>stil referansı</b> olarak kullanılır — model&apos;e açıkça &ldquo;kopyalama, aynı
        beceriyi ölçen farklı soru yaz&rdquo; talimatı verilir.
      </Callout>
    </div>
  );
}
