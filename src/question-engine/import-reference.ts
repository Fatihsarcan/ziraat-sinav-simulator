/**
 * GECMIS SORU ICE AKTARIM BORU HATTI (sartname #12)
 * =================================================
 *
 *   ham kaynak -> ayristir -> soru tespit -> bolum siniflandir -> konu siniflandir
 *   -> cevap tespit (varsa) -> dogrula -> tekrar kontrolu -> INSAN ONAY KUYRUGU
 *
 * TEMEL KURAL: Emin olunmayan dogru cevap UYDURULMAZ. Cevap anahtari yoksa
 * `correctIndex = null` ve `answerConfidence = 0` olarak saklanir; boyle bir
 * soru onaylansa bile ana soru bankasina TERFI EDEMEZ (cevabi olmayan soru
 * sorulamaz).
 *
 * Siniflandirma deterministiktir (anahtar sozcuk eslemesi). LLM kullanmaz:
 * ice aktarim API anahtari olmadan da calismalidir.
 */

import type { DB } from "../db/client.ts";
import { getDb, transaction } from "../db/client.ts";
import { ALL_CATEGORIES, getCategory } from "../config/curriculum.ts";
import type { SourceLevel } from "../config/exam-style.ts";
import type { Difficulty, SectionId } from "../core/types.ts";
import { normalizeText, tokenize } from "../core/dedup.ts";
import { classifyStyle, detectNegativeStem, estimateSeconds } from "../core/style-profile.ts";
import { deriveConcept } from "../core/concepts.ts";
import {
  createImportBatch,
  insertReferenceQuestion,
  updateImportBatchCounts,
  type NewReferenceQuestion,
} from "../db/repos/reference.ts";
import { extractPdfText } from "../lib/pdf-text.ts";

// ---------------------------------------------------------------------------
// 1) AYRISTIRMA — ham metinden soru bloklari
// ---------------------------------------------------------------------------

export interface ParsedQuestion {
  number: number | null;
  questionText: string;
  passage: string | null;
  options: string[];
  /** Cevap anahtarindan geldiyse dolu; aksi halde null. */
  correctIndex: number | null;
  /** Ayristirmada fark edilen sorunlar. */
  issues: string[];
}

/** "1." / "1)" / "Soru 1" ile baslayan satir. */
const QUESTION_START = /^\s*(?:soru\s*)?(\d{1,3})\s*[.)\-–]\s*(.*)$/i;
/** "A)" "B." "a)" "A -" ile baslayan secenek satiri (5 secenege kadar). */
const OPTION_START = /^\s*([A-Ea-e])\s*[.)\-–]\s+(.*)$/;

/**
 * Cevap anahtari satirlari: "1-A 2-C 3-D", "1) A", "1.A", "1 A" tablolari.
 * En az iki eslesme olmadan bir satir cevap anahtari sayilmaz (yanlis pozitif
 * onlemi: "1. A sikki dogrudur" gibi cumleler yakalanmasin).
 */
const ANSWER_PAIR = /(\d{1,3})\s*[-–.):]?\s*([A-Ea-e])\b/g;

const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

function parseAnswerKey(text: string): Map<number, number> {
  const key = new Map<number, number>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // Satirin cogunlugu "sayi-harf" ciftlerinden olusmali.
    ANSWER_PAIR.lastIndex = 0;
    const pairs = [...trimmed.matchAll(ANSWER_PAIR)];
    if (pairs.length < 2) continue;
    const consumed = pairs.reduce((acc, m) => acc + m[0]!.length, 0);
    if (consumed / trimmed.length < 0.5) continue;

    for (const match of pairs) {
      const index = OPTION_LETTERS.indexOf(
        match[2]!.toUpperCase() as (typeof OPTION_LETTERS)[number],
      );
      if (index >= 0) key.set(Number(match[1]), index);
    }
  }
  return key;
}

/**
 * Duz metinden soru bloklarini cikarir.
 *
 * Yaklasim bilerek muhafazakardir: numarali kok + en az 3 harf isaretli
 * secenek gormeden bir blok soru sayilmaz. Boylece onsoz, aciklama ve
 * yonergeler soru olarak ice aktarilmaz.
 */
export function parseQuestionsFromText(raw: string): {
  questions: ParsedQuestion[];
  answerKeyCount: number;
} {
  const text = raw.replace(/\r\n/g, "\n").replace(/ /g, " ");
  const answerKey = parseAnswerKey(text);

  const lines = text.split("\n");
  const questions: ParsedQuestion[] = [];

  let current: { number: number | null; stem: string[]; options: string[] } | null = null;
  let collectingOptions = false;

  const flush = () => {
    if (!current) return;
    const questionText = current.stem.join(" ").replace(/\s+/g, " ").trim();
    const options = current.options.map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean);
    current = null;
    collectingOptions = false;

    if (options.length < 3) return; // secenek yoksa soru degildir
    if (questionText.length < 15) return;

    const issues: string[] = [];
    if (options.length !== 4 && options.length !== 5) {
      issues.push(`Beklenmeyen seçenek sayısı: ${options.length}`);
    }

    questions.push({
      number: null, // asagida atanir
      questionText,
      passage: null,
      options,
      correctIndex: null,
      issues,
    });
    // numarayi geri yaz
    const last = questions[questions.length - 1]!;
    last.number = lastNumber;
  };

  let lastNumber: number | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const questionMatch = QUESTION_START.exec(line);
    const optionMatch = OPTION_START.exec(line);

    // Secenek satiri, soru satirindan ONCE denenir: "5) A) ..." gibi cakismalar
    // nadir; ama "A) 1. secenek" gibi durumlarda secenek onceligi dogrudur.
    if (optionMatch && current) {
      const letterIndex = OPTION_LETTERS.indexOf(
        optionMatch[1]!.toUpperCase() as (typeof OPTION_LETTERS)[number],
      );
      // Siradaki secenek harfi bekleniyor; atlanan harf varsa yine de ekle.
      if (letterIndex >= 0) {
        collectingOptions = true;
        current.options[letterIndex] = optionMatch[2]!;
        continue;
      }
    }

    if (questionMatch) {
      flush();
      lastNumber = Number(questionMatch[1]);
      current = { number: lastNumber, stem: [questionMatch[2] ?? ""], options: [] };
      collectingOptions = false;
      continue;
    }

    if (current) {
      if (collectingOptions) {
        // Secenek devami (satir kaymasi).
        const lastIndex = current.options.length - 1;
        if (lastIndex >= 0 && current.options[lastIndex] !== undefined) {
          current.options[lastIndex] += ` ${line}`;
        }
      } else {
        current.stem.push(line);
      }
    }
  }
  flush();

  // Cevap anahtarini uygula.
  for (const question of questions) {
    if (question.number !== null && answerKey.has(question.number)) {
      const index = answerKey.get(question.number)!;
      if (index < question.options.length) {
        question.correctIndex = index;
      } else {
        question.issues.push(
          `Cevap anahtarı ${OPTION_LETTERS[index]} diyor ama soruda o seçenek yok.`,
        );
      }
    }
  }

  // Cevap anahtari bloklarinin kendisi soru olarak yakalandiysa ele.
  const filtered = questions.filter((q) => q.options.filter(Boolean).length >= 3);

  return { questions: filtered, answerKeyCount: answerKey.size };
}

// ---------------------------------------------------------------------------
// 2) SINIFLANDIRMA — bolum ve konu
// ---------------------------------------------------------------------------

const ENGLISH_MARKERS = new Set([
  "the", "which", "following", "sentence", "word", "meaning", "passage",
  "according", "author", "complete", "best", "answer", "text", "paragraph",
]);

/** Metin agirlikli olarak Ingilizce mi? (Ingilizce bolumu tespiti) */
export function looksEnglish(text: string): boolean {
  const tokens = normalizeText(text).split(" ").filter(Boolean);
  if (tokens.length < 4) return false;
  const turkishChars = /[çğıöşü]/i.test(text);
  const englishHits = tokens.filter((t) => ENGLISH_MARKERS.has(t)).length;
  return !turkishChars && englishHits >= 2;
}

export interface Classification {
  section: SectionId | null;
  category: string | null;
  subtopic: string | null;
  /** 0-1; dusukse arayuzde "sınıflandırılamadı" uyarisi cikar. */
  confidence: number;
}

/**
 * Mufredat sozlugunde her token'in kac alt konuda gectigi (document frequency).
 *
 * Neden gerekli: duz "kac token tuttu" sayimi, "sistem" / "islem" / "veri" gibi
 * mufredatin her yerinde gecen sozcukleri ayirt edici sanip soruyu yanlis
 * konuya bagliyordu. Ornegin ACID sorusu "sistem" ve "islemler" sozcukleri
 * yuzunden "Sayi sistemleri ve bit islemleri" konusuna dusuyordu.
 * Nadir terimlere (acid, transaction, deadlock) daha fazla agirlik verilir.
 */
const TOKEN_DOCUMENT_FREQUENCY: ReadonlyMap<string, number> = (() => {
  const frequency = new Map<string, number>();
  for (const category of ALL_CATEGORIES) {
    for (const text of [category.label, ...category.subtopics]) {
      for (const token of new Set(tokenize(text))) {
        frequency.set(token, (frequency.get(token) ?? 0) + 1);
      }
    }
  }
  return frequency;
})();

function tokenWeight(token: string): number {
  const df = TOKEN_DOCUMENT_FREQUENCY.get(token) ?? 1;
  return 1 / Math.log2(df + 1);
}

/** Bir etiketin (alt konu/kategori adi) soruyla agirlikli ortusme orani. */
function weightedOverlap(label: string, haystack: ReadonlySet<string>): number {
  const tokens = [...new Set(tokenize(label))];
  if (tokens.length === 0) return 0;
  let total = 0;
  let matched = 0;
  for (const token of tokens) {
    const weight = tokenWeight(token);
    total += weight;
    if (haystack.has(token)) matched += weight;
  }
  return total === 0 ? 0 : matched / total;
}

/**
 * Soruyu mufredat agacina yerlestirir.
 *
 * Yontem: her kategorinin alt konu adlari token'lara ayrilir ve soru metniyle
 * ortusme sayilir. En yuksek skorlu kategori secilir; skor esigin altindaysa
 * siniflandirilmamis birakilir (tahmin uydurulmaz).
 */
export function classifyReferenceQuestion(input: {
  questionText: string;
  passage?: string | null;
  options?: readonly string[];
}): Classification {
  const haystack = new Set(
    tokenize(`${input.passage ?? ""} ${input.questionText} ${(input.options ?? []).join(" ")}`),
  );

  if (looksEnglish(`${input.questionText} ${(input.options ?? []).join(" ")}`)) {
    return { section: "english", category: "Ingilizce", subtopic: null, confidence: 0.6 };
  }

  let best: { category: string; subtopic: string | null; score: number } | null = null;

  for (const category of ALL_CATEGORIES) {
    for (const subtopic of category.subtopics) {
      const score = weightedOverlap(subtopic, haystack);
      if (score > 0 && (!best || score > best.score)) {
        best = { category: category.key, subtopic, score };
      }
    }
    // Kategori adinin kendisi de sinyaldir ama alt konudan zayiftir.
    const categoryScore = weightedOverlap(category.label, haystack) * 0.8;
    if (categoryScore > 0 && (!best || categoryScore > best.score)) {
      best = { category: category.key, subtopic: null, score: categoryScore };
    }
  }

  if (!best || best.score < 0.34) {
    return { section: null, category: null, subtopic: null, confidence: best?.score ?? 0 };
  }

  const config = getCategory(best.category);
  return {
    section: config?.section ?? null,
    category: best.category,
    subtopic: best.subtopic,
    confidence: Math.min(1, best.score),
  };
}

// ---------------------------------------------------------------------------
// 3) DOGRULAMA
// ---------------------------------------------------------------------------

export interface ReferenceValidation {
  ok: boolean;
  reasons: string[];
}

export function validateReferenceQuestion(question: ParsedQuestion): ReferenceValidation {
  const reasons: string[] = [];

  if (question.questionText.trim().length < 15) reasons.push("Soru kökü çok kısa.");
  const filled = question.options.filter((o) => o && o.trim().length > 0);
  if (filled.length < 3) reasons.push("En az 3 dolu seçenek gerekli.");
  if (filled.length > 5) reasons.push("5'ten fazla seçenek — ayrıştırma hatalı olabilir.");

  const normalized = filled.map((o) => normalizeText(o));
  if (new Set(normalized).size !== normalized.length) {
    reasons.push("Aynı metinli seçenekler var — ayrıştırma hatalı olabilir.");
  }
  if (question.correctIndex !== null && !question.options[question.correctIndex]) {
    reasons.push("Cevap anahtarı var olmayan bir seçeneği gösteriyor.");
  }

  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// 4) ICE AKTARIM
// ---------------------------------------------------------------------------

export interface ImportSourceMeta {
  filename: string;
  kind: "pdf" | "json" | "txt";
  sourceLevel: SourceLevel;
  sourceName: string;
  sourceYear: number | null;
  sourceUrl: string | null;
}

export interface ImportResultSummary {
  batchId: number;
  detected: number;
  imported: number;
  duplicates: number;
  rejected: number;
  withAnswer: number;
  unclassified: number;
  warnings: string[];
  rejectedSamples: { questionText: string; reasons: string[] }[];
}

/** JSON ice aktarim bicimi — esnek alan adlari kabul edilir. */
interface JsonQuestionInput {
  question?: string;
  questionText?: string;
  soru?: string;
  passage?: string | null;
  parca?: string | null;
  options?: string[];
  secenekler?: string[];
  choices?: string[];
  answer?: string | number;
  correctAnswer?: string | number;
  cevap?: string | number;
  explanation?: string;
  aciklama?: string;
  section?: string;
  category?: string;
  subtopic?: string;
  difficulty?: string;
  year?: number;
}

function normalizeJsonQuestion(item: JsonQuestionInput, index: number): ParsedQuestion | null {
  const questionText = (item.question ?? item.questionText ?? item.soru ?? "").trim();
  const options = (item.options ?? item.secenekler ?? item.choices ?? []).map((o) => String(o).trim());
  if (questionText.length === 0 || options.length < 3) return null;

  const rawAnswer = item.answer ?? item.correctAnswer ?? item.cevap;
  let correctIndex: number | null = null;
  if (typeof rawAnswer === "number" && rawAnswer >= 0 && rawAnswer < options.length) {
    correctIndex = rawAnswer;
  } else if (typeof rawAnswer === "string" && rawAnswer.trim().length > 0) {
    const letter = rawAnswer.trim().toUpperCase();
    const letterIndex = OPTION_LETTERS.indexOf(letter as (typeof OPTION_LETTERS)[number]);
    if (letterIndex >= 0 && letterIndex < options.length) {
      correctIndex = letterIndex;
    } else {
      // Cevap metin olarak verilmis olabilir.
      const match = options.findIndex((o) => normalizeText(o) === normalizeText(rawAnswer));
      if (match >= 0) correctIndex = match;
    }
  }

  return {
    number: index + 1,
    questionText,
    passage: (item.passage ?? item.parca ?? null)?.toString().trim() || null,
    options,
    correctIndex,
    issues: [],
  };
}

/**
 * Ham kaynagi ice aktarir.
 *
 * `content` PDF icin Buffer, JSON/TXT icin string olmalidir.
 * Her adimin sayimi `import_batches` tablosuna yazilir; kullanici ne kadarinin
 * tespit edildigini, kacinin tekrar oldugunu ve kacinin cevapsiz geldigini
 * gorur.
 */
export function importReferenceSource(
  meta: ImportSourceMeta,
  content: Buffer | string,
  db: DB = getDb(),
): ImportResultSummary {
  const warnings: string[] = [];
  let parsed: ParsedQuestion[] = [];
  let rawChars = 0;
  let answerKeyCount = 0;

  if (meta.kind === "pdf") {
    const buffer = typeof content === "string" ? Buffer.from(content, "binary") : content;
    const extraction = extractPdfText(buffer);
    rawChars = extraction.text.length;
    if (extraction.warning) warnings.push(extraction.warning);
    if (extraction.quality === "none") {
      const batchId = createImportBatch(
        { ...meta, rawChars, status: "failed", message: extraction.warning },
        db,
      );
      return {
        batchId,
        detected: 0,
        imported: 0,
        duplicates: 0,
        rejected: 0,
        withAnswer: 0,
        unclassified: 0,
        warnings,
        rejectedSamples: [],
      };
    }
    const result = parseQuestionsFromText(extraction.text);
    parsed = result.questions;
    answerKeyCount = result.answerKeyCount;
  } else if (meta.kind === "json") {
    const text = typeof content === "string" ? content : content.toString("utf8");
    rawChars = text.length;
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      const message = `JSON ayrıştırılamadı: ${(error as Error).message}`;
      const batchId = createImportBatch({ ...meta, rawChars, status: "failed", message }, db);
      return {
        batchId, detected: 0, imported: 0, duplicates: 0, rejected: 0,
        withAnswer: 0, unclassified: 0, warnings: [message], rejectedSamples: [],
      };
    }
    const items = Array.isArray(payload)
      ? (payload as JsonQuestionInput[])
      : ((payload as { questions?: JsonQuestionInput[] })?.questions ?? []);
    parsed = items
      .map((item, index) => normalizeJsonQuestion(item, index))
      .filter((q): q is ParsedQuestion => q !== null);
    answerKeyCount = parsed.filter((q) => q.correctIndex !== null).length;
  } else {
    const text = typeof content === "string" ? content : content.toString("utf8");
    rawChars = text.length;
    const result = parseQuestionsFromText(text);
    parsed = result.questions;
    answerKeyCount = result.answerKeyCount;
  }

  if (answerKeyCount === 0 && parsed.length > 0) {
    warnings.push(
      "Cevap anahtarı bulunamadı. Doğru cevaplar UYDURULMADI; sorular cevapsız olarak " +
        "kaydedildi ve ana soru bankasına terfi edemezler. Cevap anahtarını ayrıca " +
        "içe aktarabilir ya da her soruyu elle işaretleyebilirsin.",
    );
  }

  const batchId = createImportBatch(
    { ...meta, rawChars, status: "parsed", message: warnings.join(" | ") || null },
    db,
  );

  let imported = 0;
  let duplicates = 0;
  let rejected = 0;
  let withAnswer = 0;
  let unclassified = 0;
  const rejectedSamples: { questionText: string; reasons: string[] }[] = [];

  transaction(db, () => {
    for (const question of parsed) {
      const validation = validateReferenceQuestion(question);
      if (!validation.ok) {
        rejected += 1;
        if (rejectedSamples.length < 10) {
          rejectedSamples.push({
            questionText: question.questionText.slice(0, 160),
            reasons: [...validation.reasons, ...question.issues],
          });
        }
        continue;
      }

      const classification = classifyReferenceQuestion(question);
      if (!classification.category) unclassified += 1;

      const section = classification.section;
      const styleType = section
        ? classifyStyle({
            section,
            questionText: question.questionText,
            passage: question.passage,
            subtopic: classification.subtopic,
          })
        : null;

      const concept =
        classification.subtopic && question.correctIndex !== null
          ? deriveConcept({
              subtopic: classification.subtopic,
              correctOptionText: question.options[question.correctIndex] ?? "",
            })
          : classification.subtopic;

      const record: NewReferenceQuestion = {
        batchId,
        section,
        category: classification.category,
        subtopic: classification.subtopic,
        concept,
        sourceLevel: meta.sourceLevel,
        sourceName: meta.sourceName,
        sourceYear: meta.sourceYear,
        sourceUrl: meta.sourceUrl,
        originalOrGenerated: "original",
        questionText: question.questionText,
        passage: question.passage,
        options: question.options,
        correctIndex: question.correctIndex,
        // Cevap anahtarindan geldi: yuksek ama tam olmayan guven.
        // Cevap yoksa 0 — uydurma yok.
        answerConfidence: question.correctIndex === null ? 0 : 0.8,
        explanation: null,
        styleType,
        isNegative: detectNegativeStem(question.questionText),
        difficulty: null as Difficulty | null,
        estimatedSeconds: styleType
          ? estimateSeconds(styleType, question.questionText.length)
          : null,
        timeSensitive: false,
      };

      const outcome = insertReferenceQuestion(record, db);
      if (outcome.ok) {
        imported += 1;
        if (question.correctIndex !== null) withAnswer += 1;
      } else {
        duplicates += 1;
      }
    }

    updateImportBatchCounts(
      batchId,
      { detected: parsed.length, imported, duplicates, rejected, withAnswer },
      db,
    );
  });

  return {
    batchId,
    detected: parsed.length,
    imported,
    duplicates,
    rejected,
    withAnswer,
    unclassified,
    warnings,
    rejectedSamples,
  };
}
