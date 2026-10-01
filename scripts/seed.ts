/** Baslangic soru bankasini yukler (idempotent). */
import { openStandaloneDb, resolveDbPath } from "../src/db/client.ts";
import { bootstrapDatabase } from "../src/db/bootstrap.ts";
import { seedQuestions } from "../src/db/seed/index.ts";
import { countQuestions } from "../src/db/repos/questions.ts";

const db = openStandaloneDb();
bootstrapDatabase(db);
const result = seedQuestions(db);
const counts = countQuestions(db);

console.log(`Veritabani: ${resolveDbPath()}`);
console.log(`Denenen: ${result.attempted}`);
console.log(`Eklenen: ${result.inserted}`);
console.log(`Tekrar (atlanan): ${result.duplicates}`);
for (const d of result.duplicateDetails) {
  console.log(`  - ${d.question.slice(0, 60)}...`);
  console.log(`      ${d.reason}`);
}
if (result.qualityFailures.length > 0) {
  console.log(`\nKalite kontrolunden gecemeyen ${result.qualityFailures.length} soru:`);
  for (const f of result.qualityFailures) {
    console.log(`  - ${f.question.slice(0, 70)}...`);
    for (const issue of f.issues) console.log(`      ${issue}`);
  }
}
console.log(`\nBankadaki toplam soru: ${counts.total} (dogrulanmis: ${counts.verified})`);
db.close();
