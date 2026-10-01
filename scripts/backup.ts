/** Veritabaninin birebir kopyasini `backups/` altina alir. */
import { openStandaloneDb, resolveDbPath } from "../src/db/client.ts";
import { bootstrapDatabase } from "../src/db/bootstrap.ts";
import { createBackup, listBackups } from "../src/lib/backup.ts";

const db = openStandaloneDb();
bootstrapDatabase(db);

try {
  const result = createBackup();
  console.log(`Kaynak : ${resolveDbPath()}`);
  console.log(`Yedek  : ${result.file}`);
  console.log(`Boyut  : ${(result.sizeBytes / 1024).toFixed(1)} KB`);
  console.log(`\nMevcut yedek sayisi: ${listBackups().length}`);
} catch (error) {
  console.error(`Yedek alinamadi: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
