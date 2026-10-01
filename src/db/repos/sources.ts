import type { DB } from "../client.ts";
import { getDb, nowIso } from "../client.ts";
import type { SourceLevel } from "../../config/exam-style.ts";

export type SourceKind = "official" | "third_party" | "documentation" | "academic" | "standard";
export type Reliability = "high" | "medium" | "low";

export interface SourceRecord {
  id: number;
  title: string;
  url: string;
  publisher: string | null;
  kind: SourceKind;
  reliability: Reliability;
  accessedAt: string;
  notes: string | null;
  createdAt: string;
  /** Kaynak guven hiyerarsisi A-E (bkz. config/exam-style.ts). */
  level: SourceLevel | null;
  sourceYear: number | null;
  /** JSON dizisinden cozulmus bolum listesi. */
  sections: string[];
}

export interface NewSource {
  title: string;
  url: string;
  publisher?: string | null;
  kind: SourceKind;
  reliability: Reliability;
  accessedAt: string;
  notes?: string | null;
  level?: SourceLevel | null;
  sourceYear?: number | null;
  sections?: readonly string[] | null;
}

function mapSource(row: Record<string, unknown>): SourceRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    url: String(row.url),
    publisher: (row.publisher as string | null) ?? null,
    kind: row.kind as SourceKind,
    reliability: row.reliability as Reliability,
    accessedAt: String(row.accessed_at),
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
    level: (row.level as SourceLevel | null) ?? null,
    sourceYear: row.source_year === null || row.source_year === undefined ? null : Number(row.source_year),
    sections: parseSections(row.sections),
  };
}

function parseSections(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Kaynak turunden A-E seviyesine varsayilan esleme.
 * Acikca seviye verilmediginde kullanilir; resmi kaynaklar A, digerleri D.
 */
function defaultLevel(kind: SourceKind): SourceLevel {
  return kind === "official" ? "A" : "D";
}

/** URL benzersizdir; varsa erisim tarihi ve notu tazelenir. */
export function upsertSource(input: NewSource, db: DB = getDb()): number {
  const existing = db.prepare("SELECT id FROM sources WHERE url = ?").get(input.url) as
    | { id: number }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE sources
       SET accessed_at = ?, title = ?, reliability = ?,
           level = COALESCE(?, level),
           source_year = COALESCE(?, source_year),
           sections = COALESCE(?, sections)
       WHERE id = ?`,
    ).run(
      input.accessedAt,
      input.title,
      input.reliability,
      input.level ?? null,
      input.sourceYear ?? null,
      input.sections ? JSON.stringify(input.sections) : null,
      existing.id,
    );
    return Number(existing.id);
  }

  const result = db
    .prepare(
      `INSERT INTO sources
         (title, url, publisher, kind, reliability, accessed_at, notes, created_at,
          level, source_year, sections)
       VALUES (?,?,?,?,?,?,?,?, ?,?,?)`,
    )
    .run(
      input.title,
      input.url,
      input.publisher ?? null,
      input.kind,
      input.reliability,
      input.accessedAt,
      input.notes ?? null,
      nowIso(),
      input.level ?? defaultLevel(input.kind),
      input.sourceYear ?? null,
      input.sections ? JSON.stringify(input.sections) : null,
    );
  return Number(result.lastInsertRowid);
}

export function listSources(db: DB = getDb()): SourceRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM sources
       ORDER BY CASE kind
                  WHEN 'official' THEN 0 WHEN 'standard' THEN 1
                  WHEN 'academic' THEN 2 WHEN 'documentation' THEN 3 ELSE 4 END,
                accessed_at DESC`,
    )
    .all() as unknown as Record<string, unknown>[];
  return rows.map(mapSource);
}

export function sourceUsage(db: DB = getDb()): { sourceId: number; questionCount: number }[] {
  const rows = db
    .prepare(
      "SELECT source_id, COUNT(*) AS n FROM questions WHERE source_id IS NOT NULL GROUP BY source_id",
    )
    .all() as unknown as { source_id: number; n: number }[];
  return rows.map((r) => ({ sourceId: Number(r.source_id), questionCount: Number(r.n) }));
}
