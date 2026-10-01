import type { DB } from "../db/client.ts";
import { getDb, nowIso } from "../db/client.ts";
import { getCategory } from "../config/curriculum.ts";
import { DIFFICULTY_MIX } from "../config/curriculum.ts";
import type { CefrLevel, Difficulty, OptionKey, QualityStatus, SectionId } from "../core/types.ts";
import { insertQuestion, type NewQuestion } from "../db/repos/questions.ts";
import { upsertSource } from "../db/repos/sources.ts";
import { callJson, callText, currentModel, generationStatus } from "./llm-client.ts";
import {
  CURRICULUM_AUDIT_SYSTEM,
  curriculumAuditUserMessage,
  generationSystem,
  generationUserMessage,
  researchUserMessage,
  RESEARCH_SYSTEM,
  VERIFICATION_SYSTEM,
  verificationUserMessage,
  type ExistingCoverage,
  type StyleExemplar,
} from "./prompts.ts";
import {
  checkQuality,
  classifySource,
  computeQualityScore,
  type QualityIssue,
} from "./quality.ts";
import { QUALITY_SCORE, STYLE_TYPE_KEYS, isStyleType, type StyleType } from "../config/exam-style.ts";
import { classifyStyle, detectNegativeStem, estimateSeconds } from "../core/style-profile.ts";
import { deriveConcept } from "../core/concepts.ts";
import { getStyleProfile } from "./style-analyzer.ts";
import { masteryKey, masteryMap } from "../db/repos/mastery.ts";

// ---------------------------------------------------------------------------
// JSON semalari
// ---------------------------------------------------------------------------

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const GENERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "subtopic",
          "difficulty",
          "questionText",
          "optionA",
          "optionB",
          "optionC",
          "optionD",
          "correctAnswer",
          "explanation",
          "timeSensitive",
          "concept",
          "styleType",
          "skillsTested",
          "estimatedSeconds",
        ],
        properties: {
          subtopic: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          /* Olculen tam beceri — ayni kavramin tekrar sorulmasini engeller. */
          concept: { type: "string" },
          styleType: { type: "string", enum: [...STYLE_TYPE_KEYS] },
          skillsTested: { type: "array", items: { type: "string" } },
          estimatedSeconds: { type: "integer" },
          cefrLevel: {
            anyOf: [{ type: "string", enum: ["A2", "B1", "B2", "C1"] }, { type: "null" }],
          },
          passage: nullableString,
          questionText: { type: "string" },
          optionA: { type: "string" },
          optionB: { type: "string" },
          optionC: { type: "string" },
          optionD: { type: "string" },
          correctAnswer: { type: "string", enum: ["A", "B", "C", "D"] },
          explanation: { type: "string" },
          /* Ingilizce bolumde aciklama Ingilizcedir; bu alan Turkce karsiligidir. */
          explanationTr: nullableString,
          sourceTitle: nullableString,
          sourceUrl: nullableString,
          timeSensitive: { type: "boolean" },
        },
      },
    },
  },
} as const;

/**
 * Ingilizce bolumde aciklama Ingilizce yazilir; Fatih'in aciklamayi Turkce de
 * okuyabilmesi icin `explanationTr` o bolumde ZORUNLU alandir. Turkce yazilan
 * bolumlerde alan gereksizdir ve istenmez.
 */
function generationSchema(section: SectionId): Record<string, unknown> {
  const schema = structuredClone(GENERATION_SCHEMA) as unknown as {
    properties: { questions: { items: { required: string[] } } };
  };
  if (section === "english") {
    schema.properties.questions.items.required = [
      ...schema.properties.questions.items.required,
      "explanationTr",
    ];
  }
  return schema as unknown as Record<string, unknown>;
}

const VERIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "index",
          "independentAnswer",
          "singleCorrect",
          "multipleCorrectPossible",
          "ambiguous",
          "possiblyOutdated",
          "factualError",
          "confidence",
          "issues",
          "recommendation",
        ],
        properties: {
          index: { type: "integer" },
          independentAnswer: { type: "string", enum: ["A", "B", "C", "D"] },
          singleCorrect: { type: "boolean" },
          multipleCorrectPossible: { type: "boolean" },
          ambiguous: { type: "boolean" },
          possiblyOutdated: { type: "boolean" },
          factualError: { type: "boolean" },
          confidence: { type: "number" },
          issues: { type: "array", items: { type: "string" } },
          recommendation: { type: "string", enum: ["verified", "review_needed", "rejected"] },
        },
      },
    },
  },
} as const;

const AUDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["audits"],
  properties: {
    audits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "index",
          "withinCurriculum",
          "distractorsPlausible",
          "difficultyReasonable",
          "explanationConsistent",
          "outdated",
          "styleFit",
          "confidence",
          "issues",
        ],
        properties: {
          index: { type: "integer" },
          withinCurriculum: { type: "boolean" },
          distractorsPlausible: { type: "boolean" },
          difficultyReasonable: { type: "boolean" },
          explanationConsistent: { type: "boolean" },
          outdated: { type: "boolean" },
          styleFit: { type: "boolean" },
          confidence: { type: "number" },
          issues: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

interface RawGenerated {
  subtopic: string;
  difficulty: Difficulty;
  concept: string;
  styleType: StyleType;
  skillsTested: string[];
  estimatedSeconds: number;
  cefrLevel?: CefrLevel | null;
  passage?: string | null;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: OptionKey;
  explanation: string;
  explanationTr?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  timeSensitive: boolean;
}

interface Verdict {
  index: number;
  independentAnswer: OptionKey;
  singleCorrect: boolean;
  multipleCorrectPossible: boolean;
  ambiguous: boolean;
  possiblyOutdated: boolean;
  factualError: boolean;
  confidence: number;
  issues: string[];
  recommendation: QualityStatus;
}

interface Audit {
  index: number;
  withinCurriculum: boolean;
  distractorsPlausible: boolean;
  difficultyReasonable: boolean;
  explanationConsistent: boolean;
  outdated: boolean;
  styleFit: boolean;
  confidence: number;
  issues: string[];
}

export interface GenerationRequest {
  section: SectionId;
  category: string;
  /** Bos birakilirsa kategorinin tum alt konulari kullanilir. */
  subtopics?: readonly string[];
  count: number;
  /** Web arastirmasi fazini atla (daha hizli/ucuz, ama kaynaksiz). */
  skipResearch?: boolean;
  /** Kavram odakli uretim (yanlis yapilan kavramdan yeni soru — sartname #8). */
  focusConcept?: { concept: string; subtopic: string } | null;
  targetDifficulty?: Difficulty | null;
}

export interface GenerationOutcome {
  requested: number;
  generated: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  reviewNeeded: number;
  insertedIds: number[];
  sourcesRecorded: number;
  usedWebSearch: boolean;
  details: {
    questionText: string;
    status: QualityStatus | "duplicate";
    reason: string;
  }[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function difficultyMixLabel(): string {
  return Object.entries(DIFFICULTY_MIX)
    .map(([k, v]) => `${k} %${Math.round(v * 100)}`)
    .join(", ");
}

function parseGeneration(value: unknown): RawGenerated[] {
  const obj = value as { questions?: unknown };
  if (!Array.isArray(obj.questions)) throw new Error("Uretim ciktisinda `questions` dizisi yok.");
  return obj.questions as RawGenerated[];
}

function parseVerification(value: unknown): Verdict[] {
  const obj = value as { verdicts?: unknown };
  if (!Array.isArray(obj.verdicts)) throw new Error("Dogrulama ciktisinda `verdicts` dizisi yok.");
  return obj.verdicts as Verdict[];
}

function parseAudit(value: unknown): Audit[] {
  const obj = value as { audits?: unknown };
  if (!Array.isArray(obj.audits)) throw new Error("Denetim ciktisinda `audits` dizisi yok.");
  return obj.audits as Audit[];
}

/**
 * Bankada zaten olculen sorular ve kavramlar.
 * Uretim prompt'una "bunlari tekrarlama" listesi olarak verilir.
 */
function existingCoverage(category: string, db: DB): ExistingCoverage[] {
  const rows = db
    .prepare(
      `SELECT question_text, concept FROM questions
       WHERE category = ? AND quality_status != 'rejected'
       ORDER BY id DESC LIMIT 60`,
    )
    .all(category) as unknown as { question_text: string; concept: string | null }[];
  return rows.map((r) => ({ questionText: r.question_text, concept: r.concept }));
}

/**
 * Stil ornekleri: bu kategoriye/bolume ait, REDDEDILMEMIS referans sorular.
 * Oncelik guveni yuksek kaynaklarda (A > B > C > D).
 */
function styleExemplarsFor(
  params: { section: SectionId; category: string },
  db: DB,
): StyleExemplar[] {
  const rows = db
    .prepare(
      `SELECT question_text, options_json, source_name, source_year, source_level, style_type
       FROM reference_questions
       WHERE review_state != 'rejected' AND section = ?
       ORDER BY (category = ?) DESC,
                CASE source_level WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 ELSE 3 END,
                COALESCE(source_year, 0) DESC
       LIMIT 6`,
    )
    .all(params.section, params.category) as unknown as {
    question_text: string;
    options_json: string;
    source_name: string;
    source_year: number | null;
    source_level: string;
    style_type: string | null;
  }[];

  return rows.map((r) => ({
    sourceLabel: `${r.source_name} · seviye ${r.source_level}`,
    year: r.source_year === null ? null : Number(r.source_year),
    questionText: r.question_text,
    options: JSON.parse(r.options_json) as string[],
    styleType: r.style_type,
  }));
}

/** Kullanicinin bu kategorideki ustalik ozeti (prompt baglamina girer). */
function masteryNoteFor(category: string, subtopics: readonly string[], db: DB): string | null {
  const mastery = masteryMap(db);
  const relevant = subtopics
    .map((subtopic) => ({ subtopic, entry: mastery.get(masteryKey(category, subtopic)) }))
    .filter((x) => x.entry !== undefined && x.entry.attempts > 0);

  if (relevant.length === 0) return null;

  const weakest = [...relevant]
    .sort((a, b) => a.entry!.masteryScore - b.entry!.masteryScore)
    .slice(0, 5);
  const average =
    relevant.reduce((acc, x) => acc + x.entry!.masteryScore, 0) / relevant.length;

  return (
    `Bu kategoride ortalama ustalik ${average.toFixed(0)}/100. ` +
    `En zayif alt konular: ${weakest
      .map((w) => `${w.subtopic} (${w.entry!.masteryScore.toFixed(0)})`)
      .join(", ")}. ` +
    "Zayif alt konulara agirlik ver ve o konularda ogretici aciklamalar yaz."
  );
}

/**
 * Bir kategori icin uctan uca uretim: ARASTIR -> URET -> BAGIMSIZ DOGRULA -> KAYDET.
 * Her asamadaki eleme sayilari raporlanir; uydurma soru eklenmez.
 */
export async function generateForCategory(
  request: GenerationRequest,
  db: DB = getDb(),
): Promise<GenerationOutcome> {
  const status = generationStatus();
  const outcome: GenerationOutcome = {
    requested: request.count,
    generated: 0,
    accepted: 0,
    duplicates: 0,
    rejected: 0,
    reviewNeeded: 0,
    insertedIds: [],
    sourcesRecorded: 0,
    usedWebSearch: false,
    details: [],
    error: null,
  };

  if (!status.available) {
    outcome.error = status.reason;
    return outcome;
  }

  const category = getCategory(request.category);
  if (!category) {
    outcome.error = `Bilinmeyen kategori: ${request.category}`;
    return outcome;
  }

  const subtopics =
    request.subtopics && request.subtopics.length > 0 ? request.subtopics : category.subtopics;

  const logId = startGenerationLog(db, {
    section: request.section,
    category: request.category,
    subtopic: subtopics.length === 1 ? subtopics[0]! : null,
    requested: request.count,
    model: currentModel(),
  });

  try {
    // --- 1) ARASTIRMA ------------------------------------------------------
    let brief = "(Arastirma fazi atlandi.)";
    let researchUrls: string[] = [];

    if (!request.skipResearch) {
      const research = await callText({
        system: RESEARCH_SYSTEM,
        userMessage: researchUserMessage({
          section: request.section,
          category: request.category,
          subtopics,
        }),
        useWebSearch: true,
        maxTokens: 16000,
        effort: "high",
      });
      brief = research.text;
      researchUrls = research.searchedUrls;
      outcome.usedWebSearch = research.usedWebSearch;
    }

    // --- 2) URETIM ---------------------------------------------------------
    // Baglam: stil profili + gecmis soru ornekleri + bankada olculenler +
    // kullanicinin ustalik durumu (sartname #5).
    const styleProfile = getStyleProfile(request.section, db);
    const exemplars = styleExemplarsFor(
      { section: request.section, category: request.category },
      db,
    );
    const existing = existingCoverage(request.category, db);

    const generated = await callJson({
      system: generationSystem(request.section),
      userMessage: generationUserMessage({
        section: request.section,
        officialTopic: category.label,
        category: request.category,
        subtopics,
        count: request.count,
        researchBrief: brief,
        styleProfile: styleProfile.description,
        styleExemplars: exemplars,
        existing,
        difficultyMix: difficultyMixLabel(),
        targetDifficulty: request.targetDifficulty ?? null,
        masteryNote: masteryNoteFor(request.category, subtopics, db),
        focusConcept: request.focusConcept ?? null,
      }),
      schema: generationSchema(request.section),
      maxTokens: 32000,
      effort: "high",
      parse: parseGeneration,
    });

    const candidates = generated.value;
    outcome.generated = candidates.length;
    if (candidates.length === 0) {
      outcome.error = "Model hic soru uretmedi.";
      finishGenerationLog(db, logId, outcome, "succeeded");
      return outcome;
    }

    // --- 3) BAGIMSIZ DOGRULAMA --------------------------------------------
    // Denetci, uretenin isaretledigi cevabi ve aciklamayi GORMEZ.
    const verification = await callJson({
      system: VERIFICATION_SYSTEM,
      userMessage: verificationUserMessage(
        candidates.map((c, index) => ({
          index,
          passage: c.passage ?? null,
          questionText: c.questionText,
          optionA: c.optionA,
          optionB: c.optionB,
          optionC: c.optionC,
          optionD: c.optionD,
        })),
      ),
      schema: VERIFICATION_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 24000,
      effort: "high",
      parse: parseVerification,
    });

    const verdictByIndex = new Map(verification.value.map((v) => [v.index, v]));

    // --- 3b) MUFREDAT + CELDIRICI DENETIMI (ikinci dogrulama asamasi) -------
    // Bu denetci, 2. asamadan farkli olarak dogru cevabi ve aciklamayi GORUR.
    // Amaci cozmek degil; sorunun 2026 mufredatina, celdirici kalitesine ve
    // gercek sinav uslubuna uygunlugunu olcmek (sartname #6).
    //
    // Denetim BASARISIZ OLURSA uretim durmaz: denetim sinyalleri olmadan kalite
    // skoru hesaplanir ve soru `review_needed` olur — yani gercek sinava
    // girmez ama kaybolmaz da.
    let auditByIndex = new Map<number, Audit>();
    let auditError: string | null = null;
    try {
      const audit = await callJson({
        system: CURRICULUM_AUDIT_SYSTEM,
        userMessage: curriculumAuditUserMessage({
          section: request.section,
          officialTopic: category.label,
          items: candidates.map((c, index) => ({
            index,
            subtopic: normalizeSubtopic(c.subtopic, subtopics),
            difficulty: c.difficulty,
            passage: c.passage ?? null,
            questionText: c.questionText,
            optionA: c.optionA,
            optionB: c.optionB,
            optionC: c.optionC,
            optionD: c.optionD,
            correctAnswer: c.correctAnswer,
            explanation: c.explanation,
          })),
        }),
        schema: AUDIT_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 16000,
        effort: "high",
        parse: parseAudit,
      });
      auditByIndex = new Map(audit.value.map((a) => [a.index, a]));
    } catch (error) {
      auditError = (error as Error).message;
    }

    // --- 4) ELEME + KAYIT --------------------------------------------------
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const verdict = verdictByIndex.get(index);

      const deterministic = checkQuality({
        questionText: candidate.questionText,
        passage: candidate.passage,
        optionA: candidate.optionA,
        optionB: candidate.optionB,
        optionC: candidate.optionC,
        optionD: candidate.optionD,
        correctAnswer: candidate.correctAnswer,
        explanation: candidate.explanation,
        sourceUrl: candidate.sourceUrl,
      });

      const reasons: string[] = deterministic.issues.map(formatIssue);
      let statusVerdict: QualityStatus = "verified";

      if (deterministic.verdict === "reject") statusVerdict = "rejected";
      else if (deterministic.verdict === "review") statusVerdict = "review_needed";

      // Ingilizce bolumde Turkce aciklama zorunlu (sema de istiyor). Yine de
      // gelmezse soru atilmaz, elle tamamlanmak uzere review_needed olur.
      if (request.section === "english" && !candidate.explanationTr?.trim()) {
        if (statusVerdict === "verified") statusVerdict = "review_needed";
        reasons.push("Turkce aciklama (explanationTr) uretilmedi.");
      }

      if (!verdict) {
        statusVerdict = "review_needed";
        reasons.push("Bagimsiz dogrulama sonucu alinamadi.");
      } else {
        if (verdict.independentAnswer !== candidate.correctAnswer) {
          statusVerdict = "rejected";
          reasons.push(
            `Bagimsiz denetci ${verdict.independentAnswer} buldu, uretici ${candidate.correctAnswer} isaretlemis — cevap uyusmazligi.`,
          );
        }
        if (verdict.multipleCorrectPossible || !verdict.singleCorrect) {
          statusVerdict = "rejected";
          reasons.push("Denetci birden fazla secenegin dogru olabilecegini bildirdi.");
        }
        if (verdict.factualError) {
          statusVerdict = "rejected";
          reasons.push("Denetci olgusal/aritmetik hata bildirdi.");
        }
        if (verdict.ambiguous && statusVerdict !== "rejected") {
          statusVerdict = "review_needed";
          reasons.push("Denetci soruyu belirsiz buldu.");
        }
        if (verdict.possiblyOutdated && statusVerdict !== "rejected") {
          statusVerdict = "review_needed";
          reasons.push("Denetci bilginin guncelligini yitirmis olabilecegini bildirdi.");
        }
        if (verdict.confidence < 0.7 && statusVerdict === "verified") {
          statusVerdict = "review_needed";
          reasons.push(`Denetci guveni dusuk (${verdict.confidence.toFixed(2)}).`);
        }
        if (verdict.recommendation === "rejected") statusVerdict = "rejected";
        else if (verdict.recommendation === "review_needed" && statusVerdict === "verified") {
          statusVerdict = "review_needed";
        }
        reasons.push(...verdict.issues);
      }

      // --- Mufredat / celdirici denetimi -----------------------------------
      const audit = auditByIndex.get(index);
      if (!audit) {
        if (statusVerdict === "verified") statusVerdict = "review_needed";
        reasons.push(
          auditError
            ? `Mufredat denetimi calistirilamadi (${auditError}).`
            : "Mufredat denetimi sonucu alinamadi.",
        );
      } else {
        if (!audit.withinCurriculum) {
          // 2026 mufredati her seyin ustunde (sartname #2): kapsam disi soru
          // bankaya "kullanilabilir" olarak girmez.
          statusVerdict = "rejected";
          reasons.push("Denetci soruyu 2026 resmi mufredatinin DISINDA buldu.");
        }
        if (audit.outdated && statusVerdict !== "rejected") {
          statusVerdict = "review_needed";
          reasons.push("Denetci bilginin 2026 icin eskimis olabilecegini bildirdi.");
        }
        if (!audit.distractorsPlausible && statusVerdict === "verified") {
          statusVerdict = "review_needed";
          reasons.push("Denetci celdiricileri zayif buldu.");
        }
        if (!audit.explanationConsistent && statusVerdict === "verified") {
          statusVerdict = "review_needed";
          reasons.push("Denetci aciklamayi isaretlenen cevapla tutarsiz buldu.");
        }
        if (!audit.styleFit && statusVerdict === "verified") {
          reasons.push("Denetci sorunun gercek sinav uslubundan uzak oldugunu bildirdi.");
        }
        reasons.push(...audit.issues);
      }

      // --- Kalite skoru (0-100) --------------------------------------------
      const styleType = isStyleType(candidate.styleType)
        ? candidate.styleType
        : classifyStyle({
            section: request.section,
            questionText: candidate.questionText,
            passage: candidate.passage,
            subtopic: candidate.subtopic,
          });
      const estimated =
        Number.isFinite(candidate.estimatedSeconds) && candidate.estimatedSeconds > 0
          ? Math.round(candidate.estimatedSeconds)
          : estimateSeconds(styleType, `${candidate.passage ?? ""}${candidate.questionText}`.length);

      const scored = computeQualityScore({
        report: deterministic,
        verifier: verdict
          ? {
              answerAgrees: verdict.independentAnswer === candidate.correctAnswer,
              ambiguous: verdict.ambiguous,
              possiblyOutdated: verdict.possiblyOutdated,
              confidence: verdict.confidence,
            }
          : null,
        audit: audit
          ? {
              withinCurriculum: audit.withinCurriculum,
              difficultyReasonable: audit.difficultyReasonable,
              distractorsPlausible: audit.distractorsPlausible,
              explanationConsistent: audit.explanationConsistent,
              confidence: audit.confidence,
            }
          : null,
        difficulty: candidate.difficulty,
        estimatedSeconds: estimated,
      });
      reasons.push(...scored.reasons);

      // Esigin altinda kalan soru GERCEK SINAVA ALINMAZ (sartname #6).
      if (statusVerdict === "verified" && scored.score < QUALITY_SCORE.minForExam) {
        statusVerdict = "review_needed";
        reasons.push(
          `Kalite skoru ${scored.score} < esik ${QUALITY_SCORE.minForExam} — gercek sinava alinmaz.`,
        );
      }

      if (statusVerdict === "rejected") {
        outcome.rejected += 1;
        outcome.details.push({
          questionText: candidate.questionText,
          status: "rejected",
          reason: reasons.join(" | ") || "Kalite kontrolunden gecemedi.",
        });
        continue;
      }

      // Kaynak kaydi.
      let sourceId: number | null = null;
      const url = candidate.sourceUrl ?? researchUrls[0] ?? null;
      if (url) {
        const classification = classifySource(url);
        sourceId = upsertSource(
          {
            title: candidate.sourceTitle ?? url,
            url,
            kind: classification.kind,
            reliability: classification.reliability,
            accessedAt: nowIso(),
            notes: `${request.category} uretimi sirasinda kullanildi.`,
          },
          db,
        );
        outcome.sourcesRecorded += 1;
      }

      const newQuestion: NewQuestion = {
        section: request.section,
        category: request.category,
        subtopic: normalizeSubtopic(candidate.subtopic, subtopics),
        difficulty: candidate.difficulty,
        cefrLevel: request.section === "english" ? (candidate.cefrLevel ?? null) : null,
        questionText: candidate.questionText.trim(),
        passage: candidate.passage?.trim() || null,
        optionA: candidate.optionA.trim(),
        optionB: candidate.optionB.trim(),
        optionC: candidate.optionC.trim(),
        optionD: candidate.optionD.trim(),
        correctAnswer: candidate.correctAnswer,
        explanation: candidate.explanation.trim(),
        // Turkce aciklama yalnizca Ingilizce bolumde anlamli; diger bolumlerde
        // aciklama zaten Turkce yazilir.
        explanationTr:
          request.section === "english" ? candidate.explanationTr?.trim() || null : null,
        source: candidate.sourceTitle ?? null,
        sourceUrl: url,
        sourceId,
        origin: "llm",
        generatorModel: currentModel(),
        qualityStatus: statusVerdict,
        qualityNotes: reasons.length > 0 ? reasons.join(" | ") : null,
        timeSensitive: candidate.timeSensitive,
        staleAfter: candidate.timeSensitive ? staleDate() : null,

        // --- Stil / kavram / kalite katmani ---
        concept:
          candidate.concept?.trim() ||
          deriveConcept({
            subtopic: normalizeSubtopic(candidate.subtopic, subtopics),
            correctOptionText: optionText(candidate),
          }),
        styleType,
        isNegative: detectNegativeStem(candidate.questionText),
        estimatedSeconds: estimated,
        skillsTested: Array.isArray(candidate.skillsTested) ? candidate.skillsTested : null,
        qualityScore: scored.score,
        // Uretilmis soru = kaynak hiyerarsisinde E seviyesi.
        sourceLevel: "E",
        sourceName: candidate.sourceTitle ?? null,
        historical: false,
        lastVerifiedAt: nowIso(),
      };

      const insert = insertQuestion(newQuestion, db);
      if (!insert.ok) {
        outcome.duplicates += 1;
        outcome.details.push({
          questionText: candidate.questionText,
          status: "duplicate",
          reason: insert.verdict.reason ?? "Tekrar eden soru.",
        });
        continue;
      }

      outcome.insertedIds.push(insert.id);
      if (statusVerdict === "verified") outcome.accepted += 1;
      else outcome.reviewNeeded += 1;

      outcome.details.push({
        questionText: candidate.questionText,
        status: statusVerdict,
        reason: reasons.join(" | ") || "Temiz gecti.",
      });
    }

    finishGenerationLog(db, logId, outcome, "succeeded");
    return outcome;
  } catch (error) {
    outcome.error = (error as Error).message;
    finishGenerationLog(db, logId, outcome, "failed");
    return outcome;
  }
}

/** Adayin isaretledigi dogru secenegin metni. */
function optionText(candidate: RawGenerated): string {
  switch (candidate.correctAnswer) {
    case "A": return candidate.optionA;
    case "B": return candidate.optionB;
    case "C": return candidate.optionC;
    default: return candidate.optionD;
  }
}

/** Zamana bagli sorular icin varsayilan bayatlama tarihi: 6 ay. */
function staleDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString();
}

function formatIssue(issue: QualityIssue): string {
  return `[${issue.severity}] ${issue.message}`;
}

/** Model serbest metin alt konu yazabilir; mufredattaki en yakina eslestir. */
function normalizeSubtopic(value: string, allowed: readonly string[]): string {
  const trimmed = value.trim();
  const exact = allowed.find((s) => s.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  const partial = allowed.find(
    (s) => s.toLowerCase().includes(trimmed.toLowerCase()) || trimmed.toLowerCase().includes(s.toLowerCase()),
  );
  return partial ?? allowed[0] ?? trimmed;
}

// ---------------------------------------------------------------------------
// Uretim kaydi
// ---------------------------------------------------------------------------

function startGenerationLog(
  db: DB,
  data: { section: SectionId; category: string; subtopic: string | null; requested: number; model: string },
): number {
  const result = db
    .prepare(
      `INSERT INTO generation_log (section, category, subtopic, requested, model, status, started_at)
       VALUES (?,?,?,?,?, 'running', ?)`,
    )
    .run(data.section, data.category, data.subtopic, data.requested, data.model, nowIso());
  return Number(result.lastInsertRowid);
}

function finishGenerationLog(
  db: DB,
  id: number,
  outcome: GenerationOutcome,
  status: "succeeded" | "failed",
): void {
  db.prepare(
    `UPDATE generation_log
     SET accepted = ?, rejected = ?, duplicates = ?, used_web = ?, status = ?, error = ?, finished_at = ?
     WHERE id = ?`,
  ).run(
    outcome.accepted + outcome.reviewNeeded,
    outcome.rejected,
    outcome.duplicates,
    outcome.usedWebSearch ? 1 : 0,
    status,
    outcome.error,
    nowIso(),
    id,
  );
}

export interface GenerationLogEntry {
  id: number;
  section: SectionId;
  category: string;
  subtopic: string | null;
  requested: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  model: string | null;
  usedWeb: boolean;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export function listGenerationLog(limit = 30, db: DB = getDb()): GenerationLogEntry[] {
  const rows = db
    .prepare("SELECT * FROM generation_log ORDER BY started_at DESC LIMIT ?")
    .all(limit) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    section: r.section as SectionId,
    category: String(r.category),
    subtopic: (r.subtopic as string | null) ?? null,
    requested: Number(r.requested),
    accepted: Number(r.accepted),
    rejected: Number(r.rejected),
    duplicates: Number(r.duplicates),
    model: (r.model as string | null) ?? null,
    usedWeb: Number(r.used_web) === 1,
    status: r.status as "running" | "succeeded" | "failed",
    error: (r.error as string | null) ?? null,
    startedAt: String(r.started_at),
    finishedAt: (r.finished_at as string | null) ?? null,
  }));
}
