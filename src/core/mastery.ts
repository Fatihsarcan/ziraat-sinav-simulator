/**
 * USTALIK (MASTERY) ALGORITMASI
 * =============================
 * Her (kategori, alt konu) cifti icin 0-100 arasi bir `mastery_score` tutulur.
 *
 * Iki bilesen vardir:
 *
 * 1) EWMA (ustel hareketli ortalama) — "son cevaplarin agirligi daha fazla"
 *      ewma' = ewma + alpha * (outcome - ewma),  outcome = dogru ? 1 : 0
 *
 *    alpha asimetriktir ve zorluga gore olceklenir:
 *      - Yanlis cevap dogru cevaptan daha hizli hareket ettirir
 *        (ALPHA_WRONG > ALPHA_CORRECT): bilmedigin bir konu, sansla
 *        bildigin bir konudan daha kuvvetli bir sinyaldir.
 *      - Zor soruyu DOGRU yapmak ve kolay soruyu YANLIS yapmak daha
 *        bilgilendiricidir; bu durumlarda alpha DIFFICULTY_BOOST ile carpilir.
 *
 * 2) GUVEN (confidence) — ornek buyuklugu
 *      confidence = n / (n + CONFIDENCE_K)
 *
 *    Az denemede skor 50'ye (bilgisizlik onculu) dogru cekilir. Bu sayede
 *    TEK bir dogru cevap mastery'yi aniden 100 yapamaz:
 *
 *      mastery = 100 * (confidence * ewma + (1 - confidence) * PRIOR)
 *
 * Ornek: hic denenmemis bir konuda ilk (orta zorluk) dogru cevap
 *   ewma: 0.50 -> 0.61,  confidence: 1/6 = 0.167
 *   mastery = 100 * (0.167*0.61 + 0.833*0.50) = 51.8   (100 degil)
 *
 * Algoritma deterministiktir ve tamamen aciklanabilir: `explainMastery()`
 * kullanici arayuzunde gosterilecek metni uretir.
 */

import type { Difficulty } from "./types.ts";

export const MASTERY_PARAMS = {
  /** Dogru cevabin EWMA'yi hareket ettirme hizi. */
  ALPHA_CORRECT: 0.22,
  /** Yanlis cevabin EWMA'yi hareket ettirme hizi (daha hizli). */
  ALPHA_WRONG: 0.35,
  /** Bilgilendirici sonuclarda alpha carpani (zor+dogru / kolay+yanlis). */
  DIFFICULTY_BOOST: 1.3,
  /** Az bilgilendirici sonuclarda alpha carpani (kolay+dogru / zor+yanlis). */
  DIFFICULTY_DAMPEN: 0.8,
  /** Guven egrisinin yarilanma noktasi: n=K iken confidence = 0.5. */
  CONFIDENCE_K: 5,
  /** Veri yokken varsayilan bilgi seviyesi. */
  PRIOR: 0.5,
  /** Bos birakilan sorular yanlis sayilir ama daha yumusak etki eder. */
  BLANK_ALPHA_SCALE: 0.7,
} as const;

export interface MasteryState {
  attempts: number;
  correct: number;
  ewma: number;
}

export interface MasteryUpdateInput {
  isCorrect: boolean;
  wasBlank: boolean;
  difficulty: Difficulty;
}

export function initialMastery(): MasteryState {
  return { attempts: 0, correct: 0, ewma: MASTERY_PARAMS.PRIOR };
}

function alphaFor({ isCorrect, wasBlank, difficulty }: MasteryUpdateInput): number {
  const base = isCorrect ? MASTERY_PARAMS.ALPHA_CORRECT : MASTERY_PARAMS.ALPHA_WRONG;

  // Bilgilendiricilik carpani.
  let modifier = 1;
  if (isCorrect && difficulty === "hard") modifier = MASTERY_PARAMS.DIFFICULTY_BOOST;
  else if (isCorrect && difficulty === "easy") modifier = MASTERY_PARAMS.DIFFICULTY_DAMPEN;
  else if (!isCorrect && difficulty === "easy") modifier = MASTERY_PARAMS.DIFFICULTY_BOOST;
  else if (!isCorrect && difficulty === "hard") modifier = MASTERY_PARAMS.DIFFICULTY_DAMPEN;

  const blankScale = wasBlank ? MASTERY_PARAMS.BLANK_ALPHA_SCALE : 1;
  return Math.min(0.95, base * modifier * blankScale);
}

export function confidenceFor(attempts: number): number {
  return attempts / (attempts + MASTERY_PARAMS.CONFIDENCE_K);
}

export function masteryScore(state: MasteryState): number {
  const confidence = confidenceFor(state.attempts);
  const blended = confidence * state.ewma + (1 - confidence) * MASTERY_PARAMS.PRIOR;
  return Math.round(Math.min(100, Math.max(0, blended * 100)) * 10) / 10;
}

export function applyAnswer(state: MasteryState, input: MasteryUpdateInput): MasteryState {
  const alpha = alphaFor(input);
  const outcome = input.isCorrect ? 1 : 0;
  const ewma = state.ewma + alpha * (outcome - state.ewma);
  return {
    attempts: state.attempts + 1,
    correct: state.correct + (input.isCorrect ? 1 : 0),
    ewma: Math.min(1, Math.max(0, ewma)),
  };
}

export function explainMastery(state: MasteryState): string {
  const confidence = confidenceFor(state.attempts);
  const score = masteryScore(state);
  if (state.attempts === 0) {
    return "Henuz veri yok — baslangic degeri 50 kabul edildi.";
  }
  return (
    `${state.attempts} denemede ${state.correct} dogru. ` +
    `Son cevaplara agirlikli basari (EWMA) %${(state.ewma * 100).toFixed(0)}, ` +
    `ornek guveni %${(confidence * 100).toFixed(0)}. ` +
    `Skor = 100 x (guven x EWMA + (1-guven) x 0.5) = ${score.toFixed(1)}.`
  );
}

/** Zayif/guclu konu siniflandirmasi icin esikler. */
export const MASTERY_BANDS = {
  weak: 55,
  moderate: 70,
  strong: 85,
} as const;

export function masteryBand(score: number): "weak" | "moderate" | "good" | "strong" {
  if (score < MASTERY_BANDS.weak) return "weak";
  if (score < MASTERY_BANDS.moderate) return "moderate";
  if (score < MASTERY_BANDS.strong) return "good";
  return "strong";
}
