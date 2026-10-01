/**
 * EXAM STYLE PROFILE SERVISI
 * ==========================
 * `reference_questions` (cikmis / hatirlanan / benzer banka sorulari) uzerinden
 * bolum bazli stil profilleri hesaplar, `style_profiles` tablosuna yazar ve
 * uretim prompt'unun kullanacagi metni uretir.
 *
 * Profil HER ZAMAN doner — referans veri yoksa bile. O durumda profil
 * "varsayim" olarak isaretlenir (`confidence: "none"`) ve bu, hem prompt'ta hem
 * arayuzde ACIKCA yazilir. Sessizce "olculmus gibi" davranmaz.
 */

import type { DB } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import type { SectionId } from "../core/types.ts";
import type { SourceLevel, StyleType } from "../config/exam-style.ts";
import type { Difficulty } from "../config/exam-config.ts";
import {
  buildStyleProfile,
  describeStyleProfile,
  type StyleObservation,
  type StyleProfile,
} from "../core/style-profile.ts";
import {
  listStyleProfiles,
  loadStyleProfile,
  saveStyleProfile,
  styleObservationRows,
} from "../db/repos/reference.ts";

export const ALL_SCOPE = "all";

export function scopeFor(section: SectionId | null): string {
  return section ? `section:${section}` : ALL_SCOPE;
}

function rowToObservation(row: Record<string, unknown>): StyleObservation {
  const optionCount = Number(row.option_count) || 0;
  const avgOptionChars = Number(row.avg_option_chars) || 0;
  return {
    section: (row.section as SectionId) ?? "technical",
    category: (row.category as string | null) ?? null,
    subtopic: (row.subtopic as string | null) ?? null,
    sourceLevel: (row.source_level as SourceLevel | null) ?? null,
    styleType: (row.style_type as StyleType | null) ?? null,
    isNegative: Number(row.is_negative) === 1,
    difficulty: (row.difficulty as Difficulty | null) ?? null,
    estimatedSeconds: row.estimated_seconds === null ? null : Number(row.estimated_seconds),
    stemChars: Number(row.stem_chars) || 0,
    // Gozlem, secenek uzunluklarini tek tek degil ortalama olarak tasir;
    // ortalamanin ortalamasi ile birebir ayni sonucu verir cunku her sorunun
    // secenek sayisi ayni agirliktadir.
    optionChars: avgOptionChars > 0 ? [avgOptionChars] : [],
    optionCount,
  };
}

export interface StyleProfileView {
  profile: StyleProfile;
  computedAt: string | null;
  /** Prompt'a gomulecek hali. */
  description: string;
}

/** Bir bolum (ya da tum sinav) icin profili hesaplar ve kaydeder. */
export function recomputeStyleProfile(
  section: SectionId | null,
  db: DB = getDb(),
): StyleProfile {
  const rows = styleObservationRows(section ? { section } : {}, db);
  const observations = rows.map(rowToObservation);
  const profile = buildStyleProfile(observations, {
    scope: scopeFor(section),
    section,
  });
  saveStyleProfile(profile, db);
  return profile;
}

/** Tum bolumler + genel profil. Ice aktarim sonrasi cagrilir. */
export function recomputeAllStyleProfiles(db: DB = getDb()): StyleProfile[] {
  const sections: (SectionId | null)[] = [null, "general", "english", "technical"];
  return sections.map((section) => recomputeStyleProfile(section, db));
}

/**
 * Profili getirir. Kayitli profil yoksa ANINDA hesaplar (ve kaydeder) —
 * boylece uretim, once "profil olustur" dugmesine basilmasini beklemez.
 */
export function getStyleProfile(section: SectionId | null, db: DB = getDb()): StyleProfileView {
  const scope = scopeFor(section);
  const stored = loadStyleProfile(scope, db);
  if (stored) {
    return {
      profile: stored.profile,
      computedAt: stored.computedAt,
      description: describeStyleProfile(stored.profile),
    };
  }
  const profile = recomputeStyleProfile(section, db);
  return {
    profile,
    computedAt: new Date().toISOString(),
    description: describeStyleProfile(profile),
  };
}

export function allStyleProfiles(db: DB = getDb()): { profile: StyleProfile; computedAt: string }[] {
  return listStyleProfiles(db);
}
