/**
 * ADAPTIF SORU SECIMI
 * ===================
 * Amac (sartname #18/#19/#21):
 *   - Daha once DOGRU cevaplanmis sorular tekrar tekrar sorulmaz (en dusuk oncelik).
 *   - Oncelik sirasi: (1) hic gorulmemis, (2) zayif konulardan, (3) gecmiste
 *     yanlis yapilan KAVRAMDAN yeni sorular, (4) uzun suredir gorulmemis eski sorular.
 *   - Adaptif agirlik BOLUM YAPISINI BOZMAZ; yalnizca bolum icindeki konu
 *     dagilimini etkiler. Gercek sinav simulasyonunda kategori kotalari
 *     resmi blueprint'ten gelir ve degismez.
 *
 * Skor formulu (her aday soru icin):
 *
 *   score = BASE
 *         + W_UNSEEN          * (hic sorulmadiysa 1)
 *         + W_WEAK_TOPIC      * weakness        (weakness = (100 - mastery)/100)
 *         + W_MISTAKE_CONCEPT * mistakeDensity  (o alt konudaki son yanlislar)
 *         + W_STALE           * staleness       (son goruldugunden beri gecen sure)
 *         - W_ALREADY_KNOWN   * knownFactor     (dogru bilinme orani x guven)
 *
 * Secim, skorlarin uzerine kucuk bir rastgelelik carpani uygulanarak yapilir;
 * boylece ust sirali sorular korunur ama her sinav birebir ayni olmaz.
 */

import type { PoolQuestion } from "../db/repos/questions.ts";
import { masteryKey } from "../db/repos/mastery.ts";

export const SELECTION_WEIGHTS = {
  BASE: 1.0,
  W_UNSEEN: 3.0,
  W_WEAK_TOPIC: 2.2,
  W_MISTAKE_CONCEPT: 1.8,
  W_STALE: 1.0,
  W_ALREADY_KNOWN: 2.6,
  /** Skorun kac gunde "bayatlik" tavanina ulastigi. */
  STALE_SATURATION_DAYS: 30,
  /** Rastgelelik bandi: effective = score * (1 - J + 2J*rand). */
  JITTER: 0.15,
  /** Yanlis yogunlugu hesabinda dikkate alinan son yanlis sayisi tavani. */
  MISTAKE_SATURATION: 4,
} as const;

export interface SelectionContext {
  /** "kategori altkonu" -> mastery skoru (0-100). Yoksa 50 varsayilir. */
  masteryByKey: ReadonlyMap<string, number>;
  /** "kategori altkonu" -> son donemdeki yanlis sayisi. */
  mistakeCountByKey: ReadonlyMap<string, number>;
  /** En az bir kez dogru cevaplanmis soru id'leri. */
  correctlyAnsweredIds: ReadonlySet<number>;
  now: Date;
  /** 0 = adaptif kapali, 1 = tam adaptif. */
  weakTopicWeight: number;
  /** Deterministik test icin enjekte edilebilir. */
  random: () => number;
}

export function defaultContext(partial: Partial<SelectionContext> = {}): SelectionContext {
  const base: SelectionContext = {
    masteryByKey: new Map(),
    mistakeCountByKey: new Map(),
    correctlyAnsweredIds: new Set(),
    now: new Date(),
    weakTopicWeight: 1,
    random: Math.random,
  };
  // DIKKAT: Duz spread (`...partial`) `undefined` degerlerin varsayilani
  // EZMESINE yol acar (`{ correctlyAnsweredIds: undefined }` gibi). Bu yuzden
  // yalnizca tanimli alanlar uygulanir.
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      (base as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return base;
}

export interface ScoredQuestion {
  question: PoolQuestion;
  score: number;
  reasons: string[];
}

function daysSince(iso: string | null, now: Date): number {
  if (!iso) return SELECTION_WEIGHTS.STALE_SATURATION_DAYS;
  const diff = now.getTime() - new Date(iso).getTime();
  return Math.max(0, diff / (1000 * 60 * 60 * 24));
}

export function scoreQuestion(q: PoolQuestion, ctx: SelectionContext): ScoredQuestion {
  const reasons: string[] = [];
  let score = SELECTION_WEIGHTS.BASE;

  const unseen = q.timesAsked === 0;
  if (unseen) {
    score += SELECTION_WEIGHTS.W_UNSEEN;
    reasons.push("Hic sorulmamis");
  }

  const key = masteryKey(q.category, q.subtopic);
  const mastery = ctx.masteryByKey.get(key) ?? 50;
  const weakness = Math.max(0, (100 - mastery) / 100);
  if (weakness > 0) {
    const contribution = SELECTION_WEIGHTS.W_WEAK_TOPIC * weakness * ctx.weakTopicWeight;
    score += contribution;
    if (mastery < 55) reasons.push(`Zayif konu (ustalik ${mastery.toFixed(0)})`);
  }

  const mistakes = ctx.mistakeCountByKey.get(key) ?? 0;
  if (mistakes > 0) {
    const density = Math.min(1, mistakes / SELECTION_WEIGHTS.MISTAKE_SATURATION);
    score += SELECTION_WEIGHTS.W_MISTAKE_CONCEPT * density * ctx.weakTopicWeight;
    reasons.push(`Bu konuda ${mistakes} yanlis gecmisi`);
  }

  if (!unseen) {
    const staleness = Math.min(
      1,
      daysSince(q.lastAskedAt, ctx.now) / SELECTION_WEIGHTS.STALE_SATURATION_DAYS,
    );
    score += SELECTION_WEIGHTS.W_STALE * staleness;
    if (staleness >= 1) reasons.push("Uzun suredir sorulmadi");
  }

  if (ctx.correctlyAnsweredIds.has(q.id)) {
    // Dogru bilinen soru: ne kadar cok ve istikrarli dogru yapildiysa o kadar dusuk oncelik.
    const successRate = q.timesAsked > 0 ? q.timesCorrect / q.timesAsked : 0;
    const confidence = q.timesAsked / (q.timesAsked + 2);
    score -= SELECTION_WEIGHTS.W_ALREADY_KNOWN * successRate * confidence;
    reasons.push("Daha once dogru cevaplandi (dusuk oncelik)");
  }

  return { question: q, score, reasons };
}

function pickTop(
  candidates: ScoredQuestion[],
  count: number,
  ctx: SelectionContext,
): ScoredQuestion[] {
  const jittered = candidates.map((c) => {
    const j = SELECTION_WEIGHTS.JITTER;
    const factor = 1 - j + 2 * j * ctx.random();
    // Negatif skorlarin jitter ile sira atlamasini engelle.
    const base = Math.max(0.01, c.score);
    return { c, effective: base * factor };
  });
  jittered.sort((a, b) => b.effective - a.effective);
  return jittered.slice(0, count).map((x) => x.c);
}

export interface BlueprintEntry {
  category: string;
  count: number;
}

export interface SelectionShortfall {
  category: string;
  requested: number;
  available: number;
}

export interface SelectionResult {
  selected: ScoredQuestion[];
  shortfalls: SelectionShortfall[];
}

/**
 * Blueprint'e gore secim yapar. Kategori kotalari kesinlikle asilmaz;
 * yetersiz soru varsa `shortfalls` doldurulur (uydurma soru YOK).
 */
export function selectByBlueprint(
  blueprint: readonly BlueprintEntry[],
  pool: readonly PoolQuestion[],
  ctx: SelectionContext,
  excludeIds: ReadonlySet<number> = new Set(),
): SelectionResult {
  const byCategory = new Map<string, PoolQuestion[]>();
  for (const q of pool) {
    if (excludeIds.has(q.id)) continue;
    const list = byCategory.get(q.category);
    if (list) list.push(q);
    else byCategory.set(q.category, [q]);
  }

  const selected: ScoredQuestion[] = [];
  const shortfalls: SelectionShortfall[] = [];

  for (const entry of blueprint) {
    const available = byCategory.get(entry.category) ?? [];
    const scored = available.map((q) => scoreQuestion(q, ctx));

    // Alt konu cesitliligi: ayni alt konudan yiginlmayi onlemek icin tur tur sec.
    const chosen = pickDiverse(scored, entry.count, ctx);
    selected.push(...chosen);

    if (chosen.length < entry.count) {
      shortfalls.push({
        category: entry.category,
        requested: entry.count,
        available: chosen.length,
      });
    }
  }

  return { selected, shortfalls };
}

/**
 * Alt konu cesitliligini koruyarak secer: once her alt konudan en iyi soru
 * alinir, kota dolmadiysa ikinci tur baslar.
 */
function pickDiverse(
  scored: ScoredQuestion[],
  count: number,
  ctx: SelectionContext,
): ScoredQuestion[] {
  if (count <= 0 || scored.length === 0) return [];

  const bySubtopic = new Map<string, ScoredQuestion[]>();
  for (const s of scored) {
    const list = bySubtopic.get(s.question.subtopic);
    if (list) list.push(s);
    else bySubtopic.set(s.question.subtopic, [s]);
  }

  // Alt konu sirasi: en zayif konu once (adaptif agirlik bolum icinde calisir).
  const subtopicOrder = [...bySubtopic.keys()].sort((a, b) => {
    const qa = bySubtopic.get(a)![0]!.question;
    const qb = bySubtopic.get(b)![0]!.question;
    const ma = ctx.masteryByKey.get(masteryKey(qa.category, a)) ?? 50;
    const mb = ctx.masteryByKey.get(masteryKey(qb.category, b)) ?? 50;
    if (ma !== mb) return ma - mb;
    return a.localeCompare(b);
  });

  const picked: ScoredQuestion[] = [];
  const used = new Set<number>();

  while (picked.length < count) {
    let addedThisRound = 0;
    for (const subtopic of subtopicOrder) {
      if (picked.length >= count) break;
      const remaining = bySubtopic.get(subtopic)!.filter((s) => !used.has(s.question.id));
      if (remaining.length === 0) continue;
      const [best] = pickTop(remaining, 1, ctx);
      if (!best) continue;
      picked.push(best);
      used.add(best.question.id);
      addedThisRound += 1;
    }
    if (addedThisRound === 0) break; // havuz tukendi
  }

  return picked;
}

/**
 * Serbest secim (practice modlari): kategori kotasi olmadan, sadece skorla.
 */
export function selectTopN(
  pool: readonly PoolQuestion[],
  count: number,
  ctx: SelectionContext,
  excludeIds: ReadonlySet<number> = new Set(),
): SelectionResult {
  const scored = pool
    .filter((q) => !excludeIds.has(q.id))
    .map((q) => scoreQuestion(q, ctx));
  const selected = pickDiverse(scored, count, ctx);
  return {
    selected,
    shortfalls:
      selected.length < count
        ? [{ category: "*", requested: count, available: selected.length }]
        : [],
  };
}
