import fs from "node:fs";
import path from "node:path";
import type { DB } from "../db/client.ts";
import { getDb, nowIso, resolveDbPath, transaction } from "../db/client.ts";

/**
 * YEDEKLEME VE DISA/ICE AKTARIM
 * =============================
 * Sinav gecmisi kullanici icin degerlidir; iki bagimsiz yol sunulur:
 *
 *  1. Veritabani yedegi — `.db` dosyasinin birebir kopyasi. En guvenli yol,
 *     her seyi icerir ve geri yuklemek icin dosyayi yerine kopyalamak yeterli.
 *  2. JSON disa aktarim — insan okunabilir, tasinabilir; sema degisse bile
 *     icerik okunabilir kalir. `importJson` ayni yapiyi geri yukler.
 */

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

export interface BackupResult {
  file: string;
  sizeBytes: number;
  createdAt: string;
}

export function createBackup(): BackupResult {
  const source = resolveDbPath();
  if (!fs.existsSync(source)) throw new Error(`Veritabani dosyasi bulunamadi: ${source}`);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(BACKUP_DIR, `ziraat-${stamp}.db`);

  // WAL modunda bekleyen yazimlarin dosyaya inmesi icin once checkpoint.
  getDb().exec("PRAGMA wal_checkpoint(TRUNCATE);");
  fs.copyFileSync(source, target);

  return {
    file: target,
    sizeBytes: fs.statSync(target).size,
    createdAt: nowIso(),
  };
}

export function listBackups(): { file: string; sizeBytes: number; modifiedAt: string }[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const full = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(full);
      return { file: f, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

const EXPORT_TABLES = [
  "sources",
  "questions",
  "exam_sessions",
  "exam_session_questions",
  "exam_answers",
  "mistake_history",
  "topic_mastery",
  "settings",
  "generation_log",
] as const;

export interface ExportPayload {
  format: "zss-export";
  version: 1;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export function exportJson(db: DB = getDb()): ExportPayload {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of EXPORT_TABLES) {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all() as unknown as Record<string, unknown>[];
  }
  return { format: "zss-export", version: 1, exportedAt: nowIso(), tables };
}

export interface ImportResult {
  imported: Record<string, number>;
  skipped: Record<string, number>;
}

/**
 * JSON'u geri yukler.
 * `mode: "replace"` mevcut verinin uzerine yazar (once temizler).
 * `mode: "merge"`   yalnizca cakismayan satirlari ekler (varsayilan).
 */
export function importJson(
  payload: ExportPayload,
  options: { mode?: "merge" | "replace" } = {},
  db: DB = getDb(),
): ImportResult {
  if (payload?.format !== "zss-export") {
    throw new Error("Tanimsiz dosya bicimi — bu bir ZSS disa aktarim dosyasi degil.");
  }

  const mode = options.mode ?? "merge";
  const imported: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  transaction(db, () => {
    if (mode === "replace") {
      // Yabanci anahtar sirasina gore ters temizleme.
      for (const table of [...EXPORT_TABLES].reverse()) {
        if (table === "settings") continue; // ayarlar korunur
        db.exec(`DELETE FROM ${table}`);
      }
    }

    for (const table of EXPORT_TABLES) {
      const rows = payload.tables[table] ?? [];
      imported[table] = 0;
      skipped[table] = 0;
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]!);
      const placeholders = columns.map(() => "?").join(",");
      const statement = db.prepare(
        `INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`,
      );

      for (const row of rows) {
        const result = statement.run(...columns.map((c) => row[c] as never));
        if (Number(result.changes) > 0) imported[table] += 1;
        else skipped[table] += 1;
      }
    }
  });

  return { imported, skipped };
}
