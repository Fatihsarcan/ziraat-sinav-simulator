/**
 * EXAM READINESS SCORE (0-100)
 * ============================
 * Rastgele degildir; asagidaki 6 bilesenin AGIRLIKLI ORTALAMASIDIR.
 * Her bilesen 0-100 arasina normalize edilir ve arayuzde gerekcesiyle gosterilir.
 *
 *  1. Baraj Guvenligi        %35  Her bolumun baraja gore konumu (en zayif bolum belirleyici).
 *  2. Guncel Puan Seviyesi   %25  Son sinavlarin puani, 60 barajina gore.
 *  3. Konu Ustaligi          %20  Kategori bazli ortalama mastery (deneme sayisiyla agirlikli).
 *  4. Trend                  %10  Son sinavlarin puan egimi (iyilesme / kotuyese gidis).
 *  5. Istikrar               % 5  Son puanlarin standart sapmasi (dusuk sapma = yuksek puan).
 *  6. Zaman Yonetimi         % 5  Son sinavin sure kullanimi degerlendirmesi.
 *
 * VERI YETERSIZLIGI: Hic tamamlanmis gercek sinav yoksa 1,2,4,5,6 bilesenleri
 * hesaplanamaz. Bu durumda skor yalnizca Konu Ustaligi'ndan turetilir ve
 * `sampleSize` = 0 olarak raporlanir; arayuz "yeterli veri yok" uyarisi gosterir.
 *
 * Baraj Guvenligi hesabi (bolum basina):
 *    margin = accuracy - requiredRatio           (orn. 0.68 - 0.60 = +0.08)
 *    value  = clamp(50 + margin * 250, 0, 100)   (+0.20 fark -> 100, -0.20 -> 0)
 * Bolum degerleri MINIMUM ile birlestirilir (en zayif halka belirler) ve
 * ortalamayla harmanlanir: 0.7*min + 0.3*avg.
 */

import type { ExamConfig, SectionId } from "../config/exam-config.ts";
import type { ReadinessComponent, ReadinessReport, TopicMastery } from "./types.ts";

export const READINESS_WEIGHTS = {
  thresholdSafety: 0.35,
  recentScore: 0.25,
  topicMastery: 0.2,
  trend: 0.1,
  consistency: 0.05,
  timeManagement: 0.05,
} as const;

/** Baraj marjini puana ceviren duyarlilik katsayisi. */
const MARGIN_SENSITIVITY = 250;
/** Trend hesabinda kullanilacak sinav sayisi. */
const TREND_WINDOW = 5;
/** Puan / baraj bilesenlerinde kullanilacak son sinav sayisi. */
const RECENT_WINDOW = 3;

export interface ExamSnapshot {
  sessionId: number;
  submittedAt: string;
  score: number;
  passed: boolean;
  sectionAccuracy: Partial<Record<SectionId, number>>;
  timeVerdict: "Good" | "Watch" | "At Risk" | null;
}

export interface ReadinessInput {
  config: ExamConfig;
  /** Tamamlanmis GERCEK sinavlar, eskiden yeniye sirali. */
  fullExams: readonly ExamSnapshot[];
  mastery: readonly TopicMastery[];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** En kucuk kareler egimi (puan / sinav). */
function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i]! - mx) * (values[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function thresholdSafety(input: ReadinessInput): { value: number; detail: string } | null {
  const recent = input.fullExams.slice(-RECENT_WINDOW);
  if (recent.length === 0) return null;

  const perSection: { id: SectionId; value: number; accuracy: number; required: number }[] = [];
  for (const section of input.config.sections) {
    const accuracies = recent
      .map((e) => e.sectionAccuracy[section.id])
      .filter((a): a is number => typeof a === "number");
    if (accuracies.length === 0) continue;
    const accuracy = mean(accuracies);
    const margin = accuracy - section.passRatio;
    perSection.push({
      id: section.id,
      value: clamp(50 + margin * MARGIN_SENSITIVITY),
      accuracy,
      required: section.passRatio,
    });
  }
  if (perSection.length === 0) return null;

  const values = perSection.map((p) => p.value);
  const weakest = Math.min(...values);
  const value = 0.7 * weakest + 0.3 * mean(values);
  const weakestSection = perSection.find((p) => p.value === weakest)!;
  const label =
    input.config.sections.find((s) => s.id === weakestSection.id)?.shortLabel ?? weakestSection.id;

  return {
    value,
    detail:
      `Son ${recent.length} sinavin ortalamasi ile en riskli bolum: ${label} ` +
      `(%${round1(weakestSection.accuracy * 100)} / gereken %${round1(weakestSection.required * 100)}).`,
  };
}

function recentScoreComponent(input: ReadinessInput): { value: number; detail: string } | null {
  const recent = input.fullExams.slice(-RECENT_WINDOW);
  if (recent.length === 0) return null;
  const avg = mean(recent.map((e) => e.score));
  const threshold = input.config.thresholds.overallScore;
  // Baraj = 50 puan; barajin 25 puan ustu = 100, 25 puan alti = 0.
  const value = clamp(50 + ((avg - threshold) / 25) * 50);
  return {
    value,
    detail: `Son ${recent.length} sinav ortalamasi ${round1(avg)} puan (baraj ${threshold}).`,
  };
}

function masteryComponent(input: ReadinessInput): { value: number; detail: string } | null {
  if (input.mastery.length === 0) return null;
  // Deneme sayisiyla agirlikli ortalama: cok denenen konular daha belirleyici.
  let weightSum = 0;
  let acc = 0;
  for (const m of input.mastery) {
    const weight = m.attempts + 1;
    acc += m.masteryScore * weight;
    weightSum += weight;
  }
  const value = weightSum === 0 ? 50 : acc / weightSum;
  const weak = input.mastery.filter((m) => m.masteryScore < 55).length;
  return {
    value: clamp(value),
    detail: `${input.mastery.length} alt konuda ortalama ustalik ${round1(value)}; ${weak} konu zayif bandinda.`,
  };
}

function trendComponent(input: ReadinessInput): { value: number; detail: string } | null {
  const window = input.fullExams.slice(-TREND_WINDOW);
  if (window.length < 2) return null;
  const s = slope(window.map((e) => e.score));
  // +4 puan/sinav = 100, -4 puan/sinav = 0.
  const value = clamp(50 + (s / 4) * 50);
  const direction = s > 0.5 ? "yukselis" : s < -0.5 ? "dusus" : "yatay";
  return {
    value,
    detail: `Son ${window.length} sinavda trend ${direction} (${s >= 0 ? "+" : ""}${round1(s)} puan/sinav).`,
  };
}

function consistencyComponent(input: ReadinessInput): { value: number; detail: string } | null {
  const window = input.fullExams.slice(-TREND_WINDOW);
  if (window.length < 3) return null;
  const sd = stdDev(window.map((e) => e.score));
  // sd 0 -> 100, sd 12 ve uzeri -> 0.
  const value = clamp(100 - (sd / 12) * 100);
  return {
    value,
    detail: `Son ${window.length} sinavda puan standart sapmasi ${round1(sd)}.`,
  };
}

function timeComponent(input: ReadinessInput): { value: number; detail: string } | null {
  const last = [...input.fullExams].reverse().find((e) => e.timeVerdict !== null);
  if (!last || !last.timeVerdict) return null;
  const map = { Good: 100, Watch: 60, "At Risk": 25 } as const;
  return {
    value: map[last.timeVerdict],
    detail: `Son sinavdaki zaman yonetimi degerlendirmesi: ${last.timeVerdict}.`,
  };
}

export function computeReadiness(input: ReadinessInput): ReadinessReport {
  const definitions: {
    key: keyof typeof READINESS_WEIGHTS;
    label: string;
    result: { value: number; detail: string } | null;
  }[] = [
    { key: "thresholdSafety", label: "Baraj Guvenligi", result: thresholdSafety(input) },
    { key: "recentScore", label: "Guncel Puan Seviyesi", result: recentScoreComponent(input) },
    { key: "topicMastery", label: "Konu Ustaligi", result: masteryComponent(input) },
    { key: "trend", label: "Trend", result: trendComponent(input) },
    { key: "consistency", label: "Istikrar", result: consistencyComponent(input) },
    { key: "timeManagement", label: "Zaman Yonetimi", result: timeComponent(input) },
  ];

  const components: ReadinessComponent[] = [];
  let weightedSum = 0;
  let availableWeight = 0;

  for (const def of definitions) {
    const weight = READINESS_WEIGHTS[def.key];
    if (def.result === null) {
      components.push({
        key: def.key,
        label: def.label,
        weight,
        value: 0,
        detail: "Yeterli veri yok — hesaplamaya dahil edilmedi.",
      });
      continue;
    }
    components.push({
      key: def.key,
      label: def.label,
      weight,
      value: round1(def.result.value),
      detail: def.result.detail,
    });
    weightedSum += def.result.value * weight;
    availableWeight += weight;
  }

  const score = availableWeight === 0 ? 0 : round1(weightedSum / availableWeight);

  const sectionVerdicts = input.config.sections.map((section) => {
    const accuracies = input.fullExams
      .slice(-RECENT_WINDOW)
      .map((e) => e.sectionAccuracy[section.id])
      .filter((a): a is number => typeof a === "number");
    if (accuracies.length === 0) {
      return {
        sectionId: section.id,
        label: section.shortLabel,
        verdict: "No Data" as const,
        accuracy: null,
        requiredRatio: section.passRatio,
      };
    }
    const accuracy = mean(accuracies);
    const margin = accuracy - section.passRatio;
    const verdict: "Strong" | "Moderate" | "At Risk" =
      margin >= 0.08 ? "Strong" : margin >= 0 ? "Moderate" : "At Risk";
    return {
      sectionId: section.id,
      label: section.shortLabel,
      verdict,
      accuracy,
      requiredRatio: section.passRatio,
    };
  });

  const explanation: string[] = [];
  if (input.fullExams.length === 0) {
    explanation.push(
      "Henuz tamamlanmis gercek sinav yok. Skor yalnizca konu ustaligindan turetildi; " +
        "guvenilir bir hazirlik olcumu icin en az 1 tam sinav coz.",
    );
  } else if (input.fullExams.length < RECENT_WINDOW) {
    explanation.push(
      `Yalnizca ${input.fullExams.length} tam sinav verisi var. ${RECENT_WINDOW} sinav sonrasi skor cok daha istikrarli olur.`,
    );
  }
  const atRisk = sectionVerdicts.filter((v) => v.verdict === "At Risk");
  if (atRisk.length > 0) {
    explanation.push(
      `Baraj riski: ${atRisk.map((v) => v.label).join(", ")}. Baraj tutmazsa toplam puan yuksek olsa bile sinav basarisiz sayilir.`,
    );
  }

  return {
    score,
    components,
    sectionVerdicts,
    timeManagement:
      input.fullExams.length === 0
        ? "No Data"
        : ([...input.fullExams].reverse().find((e) => e.timeVerdict)?.timeVerdict ?? "No Data"),
    sampleSize: input.fullExams.length,
    explanation,
  };
}
