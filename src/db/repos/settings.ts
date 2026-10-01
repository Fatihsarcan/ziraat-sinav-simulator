import type { DB } from "../client.ts";
import { getDb, nowIso } from "../client.ts";

export const SETTING_KEYS = {
  examDate: "exam.date",
  examConfigOverride: "exam.config_override",
  theme: "ui.theme",
  generationModel: "generation.model",
  generationWebSearch: "generation.web_search",
  lastGenerationAt: "generation.last_run_at",
} as const;

export function getSetting(key: string, db: DB = getDb()): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string, db: DB = getDb()): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, nowIso());
}

export function deleteSetting(key: string, db: DB = getDb()): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function getAllSettings(db: DB = getDb()): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as unknown as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getJsonSetting<T>(key: string, db: DB = getDb()): T | null {
  const raw = getSetting(key, db);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJsonSetting(key: string, value: unknown, db: DB = getDb()): void {
  setSetting(key, JSON.stringify(value), db);
}
