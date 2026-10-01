import Link from "next/link";
import { db } from "../../lib/server.ts";
import { loadExamConfig } from "../../config/load-config.ts";
import { practiceTree } from "../../core/exam-engine.ts";
import { getActiveSession } from "../../db/repos/sessions.ts";
import { mistakeStats } from "../../db/repos/mistakes.ts";
import { listMastery } from "../../db/repos/mastery.ts";
import { listQuestions } from "../../db/repos/questions.ts";
import { Callout, PageHeader } from "../_components/ui.tsx";
import { PracticeForm } from "./practice-form.tsx";
import { dateTimeTR } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const database = db();
  // Cikmis soru modunun acik olup olmadigini belirler.
  const historicalCount = listQuestions(
    { historical: true, qualityStatus: "verified", limit: 1 },
    database,
  ).total;
  const config = loadExamConfig(database);
  const tree = practiceTree(database);
  const active = getActiveSession(database);
  const mistakes = mistakeStats(database);
  const mastery = listMastery({}, database);

  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Çalışma Modu"
        description="Gerçek sınav dışında, seçtiğin kapsamda soru çöz. Çalışmalarda da doğru cevap ve açıklama sınav bitene kadar gizlidir."
      />

      {active ? (
        <Callout tone="warn" title="Devam eden oturum">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {active.label} — {dateTimeTR(active.startedAt)} başladı. Yeni çalışma başlatmak için
              önce bunu bitir.
            </span>
            <Link href={`/exam/${active.id}`} className="btn btn-primary">
              Devam et
            </Link>
          </div>
        </Callout>
      ) : null}

      <PracticeForm
        tree={tree}
        allowedCounts={config.practice.allowedQuestionCounts}
        defaultCount={config.practice.defaultQuestionCount}
        initial={{
          mode: single("mode"),
          section: single("section"),
          category: single("category"),
          subtopic: single("subtopic"),
          count: single("count"),
        }}
        hasMistakes={mistakes.total > 0}
        hasMastery={mastery.length > 0}
        historicalCount={historicalCount}
      />

      <Callout tone="info" title="“Zayıflıklarımı Çalış” ile “Eski Yanlışları Tekrar Çöz” farkı">
        <b>Zayıflıklarımı Çalış</b>, yanlış yaptığın konulardan <b>yeni</b> sorular getirir —
        cevabı değil konuyu öğrenmen içindir. <b>Eski Yanlışları Tekrar Çöz</b> ise gerçekten
        yanlış yaptığın <b>aynı soruları</b> tekrar önüne koyar. İkisi bilerek ayrı tutulmuştur.
      </Callout>
    </div>
  );
}
