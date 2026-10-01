/**
 * Soru tekrari (duplicate) tespiti.
 *
 * Iki seviye:
 *  1. BIREBIR  — normalize edilmis metnin SHA-256 ozeti (`contentHash`).
 *                Veritabaninda UNIQUE kisit ile zorlanir.
 *  2. ANLAMSAL — ayni kategori/alt konu icinde token benzerligi (`fingerprint`).
 *                "What protocol resolves domain names to IP addresses?" ile
 *                "Which network service translates domain names into IP
 *                 addresses?" gibi ayni kavrami soran sorular yakalanir.
 */

import { createHash } from "node:crypto";

export interface DedupCandidate {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  category: string;
  subtopic: string;
}

export interface ExistingQuestionSignature {
  id: number;
  category: string;
  subtopic: string;
  /** Soru kokU + secenekler uzerinden kurulu tam imza. */
  fingerprint: string;
  /**
   * YALNIZCA soru kokU (+ parca) uzerinden kurulu imza.
   *
   * Neden ayri: parafraz edilmis bir soru genellikle AYNI kavrami sorar ama
   * CELDIRICILERI degisir. Secenekler imzaya karisinca ortusme suluyor ve
   * kavram tekrari kaciyor. Kok-imzasi bu gurultuyu disarida birakir ve
   * yalnizca "ayni alt konu + ayni dogru cevap" kosulu saglandiginda
   * kullanilir — yani tek basina karar vermez.
   */
  stemFingerprint: string;
  contentHash: string;
  correctOptionNormalized: string;
}

export interface DuplicateVerdict {
  isDuplicate: boolean;
  kind: "exact" | "near" | "concept" | null;
  matchedQuestionId: number | null;
  similarity: number;
  reason: string | null;
}

// Benzerlik esikleri — tek yerde.
export const DEDUP_THRESHOLDS = {
  /** Ayni konu icinde soru metni benzerligi bu degerin ustundeyse tekrar sayilir. */
  near: 0.6,
  /** Dogru cevap metni ayni ise bu daha dusuk esik uygulanir (kavram tekrari). */
  concept: 0.3,
} as const;

const TURKISH_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", I: "i", Ö: "o", Ş: "s", Ü: "u",
};

const STOPWORDS = new Set([
  // Ingilizce
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "of", "to", "in",
  "into", "on", "for", "with", "which", "what", "that", "this", "these", "those", "and",
  "or", "but", "as", "by", "from", "at", "it", "its", "following", "best", "most",
  "correct", "true", "false", "not", "does", "do", "did", "can", "will", "would", "how",
  "when", "where", "why", "who", "whom", "used", "use", "uses", "given", "below", "above",
  // Turkce
  "ve", "veya", "ile", "icin", "bir", "bu", "su", "o", "da", "de", "ki", "mi", "mu",
  "asagidaki", "asagidakilerden", "hangisi", "hangisidir", "degildir", "dogrudur",
  "yanlistir", "olan", "olarak", "gore", "daha", "en", "cok", "az", "ise", "ancak",
  "ifade", "ifadelerden", "secenek", "seceneklerden", "verilen", "yukaridaki",
]);

/** Kucuk harf + Turkce karakter sadelestirme + noktalama temizligi. */
export function normalizeText(input: string): string {
  return input
    .replace(/[çğıİöşüÇĞIÖŞÜ]/g, (ch) => TURKISH_MAP[ch] ?? ch)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kaba govdeleme: cogul/cekim eklerini kirpar, sonra 7 karaktere kisaltir. */
function stem(token: string): string {
  let t = token;
  const suffixes = [
    "lerinin", "larinin", "lerini", "larini", "lerde", "larda", "leri", "lari",
    "ler", "lar", "nin", "nun", "ini", "ina", "ine", "ies", "ing", "ies", "es", "ed", "s",
  ];
  for (const suffix of suffixes) {
    if (t.length > suffix.length + 3 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length);
      break;
    }
  }
  return t.slice(0, 7);
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .filter((t) => t.length > 0)
    .flatMap((t) => {
      // Sayilar kisa olsa bile korunur ve govdelenmez: "2 6 12 20 30" ile
      // "1 1 2 3 5 8" arasindaki fark oruntu sorularinda sorunun TA KENDISIDIR.
      if (/^\d+$/.test(t)) return [t];
      if (t.length <= 2 || STOPWORDS.has(t)) return [];
      return [stem(t)];
    });
}

/**
 * Anlamsal karsilastirma icin sirali, tekil token imzasi.
 *
 * Secenekler de imzaya dahil edilir. Yalnizca soru kokune bakmak, kaliplasmis
 * koklerde ("Asagidaki cumlelerin hangisinde ... yanlisi vardir?") tamamen
 * farkli iki soruyu tekrar sanmaya yol aciyordu; secenekler ayirt ediciligi
 * saglar.
 */
export function buildFingerprint(
  questionText: string,
  passage?: string | null,
  options?: readonly string[],
): string {
  const tokens = new Set(
    tokenize([passage ?? "", questionText, ...(options ?? [])].join(" ")),
  );
  return [...tokens].sort().join(" ");
}

/** Birebir kopya tespiti icin kararli ozet. */
export function buildContentHash(candidate: DedupCandidate): string {
  const normalizedQuestion = normalizeText(candidate.questionText);
  // Secenek sirasi degistirilmis ayni soruyu da yakalamak icin siralanir.
  const normalizedOptions = [
    candidate.optionA,
    candidate.optionB,
    candidate.optionC,
    candidate.optionD,
  ]
    .map(normalizeText)
    .sort()
    .join("|");
  return createHash("sha256")
    .update(`${normalizedQuestion}##${normalizedOptions}`)
    .digest("hex");
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Imzayi KABALASTIRIR: her token 5 karaktere kirpilir.
 *
 * Neden gerekli: govdeleme 7 karakterde kestigi icin Turkce cekim ekleri
 * bazen ayni kokten iki farkli token uretiyordu — "katmanda" -> "katmand",
 * "katmaniyla" -> "katmani". Bu, sartnamedeki ornegin (#7) tam olarak
 * kacmasina yol aciyor:
 *   "TCP hangi katmanda calisir?"
 *   "TCP protokolu OSI modelinin hangi katmaniyla iliskilidir?"
 * 5 karaktere kirpinca ikisi de "katma" olur ve ortusme gorunur hale gelir.
 *
 * Kabalastirma TEK BASINA karar vermez; yalnizca benzerligin UST sinirini
 * yukseltir (asagida `max` ile birlesir). Boylece gercekten farkli sorular
 * yanlislikla tekrar sayilmaz, cunku dogru cevap ve alt konu esleri ayrica
 * aranir.
 */
export function coarsenFingerprint(fingerprint: string): string {
  const tokens = new Set(
    fingerprint
      .split(" ")
      .filter(Boolean)
      .map((t) => (/^\d+$/.test(t) ? t : t.slice(0, 5))),
  );
  return [...tokens].sort().join(" ");
}

function tokenSet(fingerprint: string): Set<string> {
  return new Set(fingerprint.split(" ").filter(Boolean));
}

/**
 * Iki imza arasindaki benzerlik: normal ve kabalastirilmis token kumelerinin
 * Jaccard skorlarindan BUYUK olani.
 */
export function fingerprintSimilarity(a: string, b: string): number {
  const exact = jaccard(tokenSet(a), tokenSet(b));
  const coarse = jaccard(tokenSet(coarsenFingerprint(a)), tokenSet(coarsenFingerprint(b)));
  return Math.max(exact, coarse);
}

export function correctOptionText(candidate: DedupCandidate): string {
  const map = {
    A: candidate.optionA,
    B: candidate.optionB,
    C: candidate.optionC,
    D: candidate.optionD,
  };
  return normalizeText(map[candidate.correctAnswer]);
}

/**
 * Aday soruyu mevcut imzalarla karsilastirir.
 * `existing` yalnizca ayni kategoriye ait imzalarla sinirlandirilmali
 * (tum bankayi tasimak gereksiz).
 */
export function checkDuplicate(
  candidate: DedupCandidate,
  existing: readonly ExistingQuestionSignature[],
): DuplicateVerdict {
  const hash = buildContentHash(candidate);
  const fingerprint = buildFingerprint(candidate.questionText, null, [
    candidate.optionA,
    candidate.optionB,
    candidate.optionC,
    candidate.optionD,
  ]);
  const stemFingerprint = buildFingerprint(candidate.questionText, null, []);
  const answerText = correctOptionText(candidate);

  let best: DuplicateVerdict = {
    isDuplicate: false,
    kind: null,
    matchedQuestionId: null,
    similarity: 0,
    reason: null,
  };

  for (const other of existing) {
    if (other.contentHash === hash) {
      return {
        isDuplicate: true,
        kind: "exact",
        matchedQuestionId: other.id,
        similarity: 1,
        reason: `Birebir ayni soru zaten var (#${other.id}).`,
      };
    }

    if (other.category !== candidate.category) continue;

    const similarity = fingerprintSimilarity(fingerprint, other.fingerprint);
    if (similarity > best.similarity) {
      best = { ...best, similarity, matchedQuestionId: other.id };
    }

    if (similarity >= DEDUP_THRESHOLDS.near) {
      return {
        isDuplicate: true,
        kind: "near",
        matchedQuestionId: other.id,
        similarity,
        reason: `Cok benzer soru mevcut (#${other.id}, benzerlik ${(similarity * 100).toFixed(0)}%).`,
      };
    }

    // KAVRAM TEKRARI: ayni alt konu + ayni dogru cevap. Bu iki kosul birlikte
    // saglandiginda celdiriciler degismis olsa bile olculen beceri aynidir, bu
    // yuzden benzerlik SORU KOKU uzerinden de olculur (parafrazi yakalar).
    if (
      other.subtopic === candidate.subtopic &&
      other.correctOptionNormalized === answerText
    ) {
      const stemSimilarity = other.stemFingerprint
        ? fingerprintSimilarity(stemFingerprint, other.stemFingerprint)
        : 0;
      const conceptSimilarity = Math.max(similarity, stemSimilarity);
      if (conceptSimilarity >= DEDUP_THRESHOLDS.concept) {
        return {
          isDuplicate: true,
          kind: "concept",
          matchedQuestionId: other.id,
          similarity: conceptSimilarity,
          reason: `Ayni kavram ayni cevapla zaten soruluyor (#${other.id}, benzerlik ${(conceptSimilarity * 100).toFixed(0)}%).`,
        };
      }
    }
  }

  return best;
}
