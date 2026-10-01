/**
 * Komut satirindan soru uretimi.
 *
 * Kullanim:
 *   npm run generate                                  # otomatik plan (ilk 3 adim)
 *   npm run generate -- --steps 5                     # plan, ilk 5 adim
 *   npm run generate -- --category "Veri Tabani ve SQL" --count 10
 *   npm run generate -- --category "..." --subtopic "JOIN turleri" --count 5
 *   npm run generate -- --plan-only                   # yalnizca plani goster
 */

import { openStandaloneDb, resolveDbPath } from "../src/db/client.ts";
import { bootstrapDatabase } from "../src/db/bootstrap.ts";
import {
  coverageReport,
  generateForCategory,
  generateForSubtopic,
  generationPlan,
  generationStatus,
  runGenerationPlan,
} from "../src/question-engine/index.ts";
import { getCategory } from "../src/config/curriculum.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

if (flag("help")) {
  console.log(
    [
      "Soru uretimi",
      "",
      "  --category <ad>     Belirli bir kategoriden uret",
      "  --subtopic <ad>     Kategori icinde belirli alt konu (--category ile)",
      "  --count <n>         Uretilecek soru sayisi (varsayilan 8, en fazla 20)",
      "  --steps <n>         Otomatik planda kac adim calistirilacak (varsayilan 3)",
      "  --plan-only         Yalnizca plani ve doluluk durumunu goster",
      "  --help              Bu yardim",
    ].join("\n"),
  );
  process.exit(0);
}

const db = openStandaloneDb();
bootstrapDatabase(db);

const status = generationStatus();
console.log(`Veritabani: ${resolveDbPath()}`);
console.log(`Model: ${status.model}`);

// --plan-only yalnizca rapor uretir; API anahtari gerektirmez.
if (!status.available && !flag("plan-only")) {
  console.error(`\nUretim KAPALI.\n${status.reason}`);
  db.close();
  process.exit(1);
}

const report = coverageReport(db);
console.log(
  `\nSoru bankasi: ${report.categories.reduce((a, c) => a + c.verified, 0)} dogrulanmis soru, ` +
    `${report.belowThreshold} kategori esik altinda (toplam eksik ${report.totalDeficit}).`,
);

const plan = generationPlan({ maxSteps: Number(arg("steps")) || 3 }, db);

if (flag("plan-only")) {
  if (!status.available) {
    console.log(`\nNOT: Uretim su anda kapali — ${status.reason}`);
  }
  console.log("\nPlan:");
  if (plan.length === 0) console.log("  (tum kategoriler esigin uzerinde)");
  for (const step of plan) {
    console.log(`  ${step.label}: +${step.count} soru (eksik ${step.deficit})`);
  }
  db.close();
  process.exit(0);
}

const category = arg("category");
const count = Math.min(20, Math.max(1, Number(arg("count")) || 8));

function printOutcome(label: string, outcome: Awaited<ReturnType<typeof generateForCategory>>) {
  console.log(
    `\n[${label}] uretilen ${outcome.generated} · dogrulandi ${outcome.accepted} · ` +
      `inceleme ${outcome.reviewNeeded} · reddedildi ${outcome.rejected} · tekrar ${outcome.duplicates}` +
      `${outcome.usedWebSearch ? " · web aramasi kullanildi" : ""}`,
  );
  if (outcome.error) console.error(`  HATA: ${outcome.error}`);
  for (const detail of outcome.details) {
    if (detail.status === "verified") continue;
    console.log(`  - [${detail.status}] ${detail.questionText.slice(0, 80)}`);
    console.log(`      ${detail.reason}`);
  }
}

if (category) {
  const config = getCategory(category);
  if (!config) {
    console.error(`Bilinmeyen kategori: ${category}`);
    db.close();
    process.exit(1);
  }
  const subtopic = arg("subtopic");
  console.log(`\n${category}${subtopic ? ` > ${subtopic}` : ""} icin ${count} soru uretiliyor...`);
  const outcome = subtopic
    ? await generateForSubtopic(category, subtopic, count, db)
    : await generateForCategory({ section: config.section, category, count }, db);
  printOutcome(config.label, outcome);
} else {
  if (plan.length === 0) {
    console.log("\nTum kategoriler esigin uzerinde — uretilecek bir sey yok.");
    db.close();
    process.exit(0);
  }
  console.log(`\n${plan.length} adimlik plan calistiriliyor (her adim web arastirmasi icerir)...`);
  const result = await runGenerationPlan(plan, db);
  for (const { step, outcome } of result.steps) printOutcome(step.label, outcome);
  console.log(
    `\nTOPLAM: dogrulandi ${result.totalAccepted} · inceleme ${result.totalReviewNeeded} · ` +
      `reddedildi ${result.totalRejected} · tekrar ${result.totalDuplicates}`,
  );
  if (result.error) console.error(`Durdu: ${result.error}`);
}

db.close();
