/**
 * KAVRAM (CONCEPT) KATMANI
 * ========================
 * Sartname #8: Kullanici "LEFT JOIN ile INNER JOIN farkini" yanlis yaptiysa
 * ertesi gun AYNI SORU sorulmamali; ayni KAVRAM farkli bir senaryoyla
 * olculmeli. Bunun icin her sorunun bir kavram etiketi olmasi gerekir:
 *
 *   topic    = Veri Tabani ve SQL        (kategori)
 *   subtopic = JOIN turleri              (mufredat alt konusu)
 *   concept  = LEFT JOIN davranisi       (olculen tam beceri)
 *
 * Kavram etiketini once URETICI MODEL verir. Vermediyse (seed sorular, ice
 * aktarilan eski sorular) burada DETERMINISTIK olarak turetilir: alt konu +
 * dogru cevabin ayirt edici terimleri. Mukemmel olmasi gerekmez; ayni beceriyi
 * olcen sorulari ayni kovaya koymasi yeterlidir.
 *
 * Bu modul saftir (DB bilmez).
 */

import { normalizeText, tokenize } from "./dedup.ts";

/** Kavram anahtari: karsilastirmalarda kullanilan kararli, normalize edilmis biçim. */
export function conceptKey(category: string, subtopic: string, concept: string | null): string {
  const base = `${normalizeText(category)}|${normalizeText(subtopic)}`;
  const tail = concept ? `|${normalizeText(concept)}` : "";
  return `${base}${tail}`;
}

/**
 * Cok genel oldugu icin kavram adina katkisi olmayan terimler.
 * (Dogru cevabin tamamini kavram adi yapmak, "42" gibi degerleri kavram
 * sanmaya yol acardi.)
 */
const GENERIC_ANSWER_TOKENS = new Set([
  "dogru", "yanlis", "hepsi", "hicbiri", "artar", "azalir", "degismez",
  "evet", "hayir", "true", "false", "increase", "decrease", "same",
]);

const MAX_CONCEPT_TOKENS = 4;

/**
 * Kavram adini turetir.
 *
 * Kural: "<alt konu> — <dogru cevabin ayirt edici terimleri>".
 * Dogru cevap salt sayi/kisa bir degerse alt konu tek basina kullanilir; boyle
 * durumlarda kavram alt konuyla ayni granulariteye duser ki bu da dogrudur
 * (hesaplama sorularinda olculen beceri alt konunun kendisidir).
 */
export function deriveConcept(input: {
  subtopic: string;
  correctOptionText: string;
  questionText?: string;
}): string {
  const answerTokens = tokenize(input.correctOptionText).filter(
    (t) => !GENERIC_ANSWER_TOKENS.has(t) && !/^\d+$/.test(t),
  );

  if (answerTokens.length === 0) return input.subtopic;

  // Ayirt edici terimler: uzun olanlar once (kisa yardimci sozcukler sonda).
  const salient = [...new Set(answerTokens)]
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_CONCEPT_TOKENS)
    .sort();

  return `${input.subtopic} — ${salient.join(" ")}`;
}

// ---------------------------------------------------------------------------
// Kavram bosluklari (yanlislardan uretim icin)
// ---------------------------------------------------------------------------

export interface ConceptMistakeRow {
  section: string;
  category: string;
  subtopic: string;
  concept: string | null;
  questionId: number;
  createdAt: string;
  resolvedAt: string | null;
  wasBlank: boolean;
}

export interface ConceptGap {
  section: string;
  category: string;
  subtopic: string;
  /** Kavram etiketi yoksa alt konuya duser. */
  concept: string;
  key: string;
  wrongCount: number;
  blankCount: number;
  unresolvedCount: number;
  lastWrongAt: string;
  /** Daha once bu kavramdan yanlis yapilan soru id'leri — YENIDEN SORULMAZ. */
  questionIds: number[];
  /** Oncelik skoru: cokluk + tazelik + cozulmemislik. */
  priority: number;
}

const RECENCY_HALF_LIFE_DAYS = 14;

/**
 * Yanlis kayitlarini kavram bazinda toplar ve onceliklendirir.
 *
 * Oncelik = cozulmemis yanlis sayisi x tazelik. Tazelik ustel azalir; iki
 * hafta once yapilan bir yanlis, dun yapilanin yarisi kadar agirlik tasir.
 */
export function rankConceptGaps(
  rows: readonly ConceptMistakeRow[],
  now: Date = new Date(),
): ConceptGap[] {
  const byKey = new Map<string, ConceptGap>();

  for (const row of rows) {
    const concept = row.concept?.trim() || row.subtopic;
    const key = conceptKey(row.category, row.subtopic, concept);
    let gap = byKey.get(key);
    if (!gap) {
      gap = {
        section: row.section,
        category: row.category,
        subtopic: row.subtopic,
        concept,
        key,
        wrongCount: 0,
        blankCount: 0,
        unresolvedCount: 0,
        lastWrongAt: row.createdAt,
        questionIds: [],
        priority: 0,
      };
      byKey.set(key, gap);
    }

    gap.wrongCount += 1;
    if (row.wasBlank) gap.blankCount += 1;
    if (!row.resolvedAt) gap.unresolvedCount += 1;
    if (row.createdAt > gap.lastWrongAt) gap.lastWrongAt = row.createdAt;
    if (!gap.questionIds.includes(row.questionId)) gap.questionIds.push(row.questionId);
  }

  for (const gap of byKey.values()) {
    const ageDays = Math.max(
      0,
      (now.getTime() - new Date(gap.lastWrongAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    // Cozulmemis yanlislar tam, cozulmusler yarim agirlik tasir.
    const weight = gap.unresolvedCount + (gap.wrongCount - gap.unresolvedCount) * 0.5;
    gap.priority = Number((weight * recency).toFixed(4));
  }

  return [...byKey.values()].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.lastWrongAt.localeCompare(a.lastWrongAt);
  });
}
