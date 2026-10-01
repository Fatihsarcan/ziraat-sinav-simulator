/** Veritabani semasini olusturur/gunceller. */
import { openStandaloneDb } from "../src/db/client.ts";
import { bootstrapDatabase } from "../src/db/bootstrap.ts";
import { resolveDbPath } from "../src/db/client.ts";

const db = openStandaloneDb();
const result = bootstrapDatabase(db);
console.log(`Veritabani: ${resolveDbPath()}`);
console.log(
  result.migrationsApplied.length === 0
    ? "Sema guncel — uygulanacak migration yok."
    : `Uygulanan migration'lar: ${result.migrationsApplied.join(", ")}`,
);
db.close();
