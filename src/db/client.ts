/**
 * SQLite baglantisi.
 *
 * Node 22.5+ ile gelen yerlesik `node:sqlite` modulunu kullanir: native
 * derleme, prebuilt binary veya ek bagimlilik yoktur. Veritabani tek bir
 * dosyadir (varsayilan `./data/ziraat.db`) ve kopyalanarak yedeklenebilir.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type DB = DatabaseSync;

/**
 * `node:sqlite` bagli deger tipleri. Repo katmani dinamik WHERE kurarken
 * parametre dizilerini bu tiple tutar.
 */
export type SqlParam = null | number | bigint | string | Uint8Array;

const DEFAULT_DB_RELATIVE = path.join("data", "ziraat.db");

export function resolveDbPath(): string {
  const fromEnv = process.env.ZSS_DB_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), DEFAULT_DB_RELATIVE);
}

function openDatabase(): DB {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  // WAL: okuma/yazma esamesinde kilitlenmeleri azaltir, dosya yine tasinabilir.
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

/**
 * Next.js dev modunda modul yeniden yuklenmesi yeni baglanti acmasin diye
 * globalThis uzerinde tekil tutulur.
 */
const globalForDb = globalThis as unknown as { __zssDb?: DB };

export function getDb(): DB {
  if (!globalForDb.__zssDb) {
    globalForDb.__zssDb = openDatabase();
  }
  return globalForDb.__zssDb;
}

export function closeDb(): void {
  if (globalForDb.__zssDb) {
    globalForDb.__zssDb.close();
    globalForDb.__zssDb = undefined;
  }
}

/** Ayri bir baglanti acar (script'ler ve testler icin). */
export function openStandaloneDb(filePath?: string): DB {
  if (filePath) {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    const db = new DatabaseSync(path.resolve(filePath));
    db.exec("PRAGMA foreign_keys = ON;");
    return db;
  }
  return openDatabase();
}

/** Verilen isi tek bir transaction icinde calistirir. */
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* rollback basarisizsa orijinal hatayi kaybetme */
    }
    throw error;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** SQLite boolean donusumleri (0/1 saklanir). */
export const toSqlBool = (value: boolean): number => (value ? 1 : 0);
export const fromSqlBool = (value: unknown): boolean => value === 1 || value === true;
