import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openStandaloneDb, type DB } from "../src/db/client.ts";
import { bootstrapDatabase } from "../src/db/bootstrap.ts";
import { seedQuestions } from "../src/db/seed/index.ts";

/** Her test icin izole, gecici bir veritabani acar. */
export function makeTestDb(options: { seed?: boolean } = {}): { db: DB; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zss-test-"));
  const file = path.join(dir, "test.db");
  const db = openStandaloneDb(file);
  bootstrapDatabase(db);
  if (options.seed !== false) seedQuestions(db);
  return {
    db,
    cleanup: () => {
      try {
        db.close();
      } catch {
        /* zaten kapali olabilir */
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
