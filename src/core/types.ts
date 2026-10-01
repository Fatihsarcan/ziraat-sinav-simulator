/** Uygulama genelinde paylasilan alan modelleri. */

import type {
  CefrLevel,
  Difficulty,
  OptionKey,
  QualityStatus,
  SectionId,
} from "../config/exam-config.ts";
import type { ReviewState, SourceLevel, StyleType } from "../config/exam-style.ts";

export type { CefrLevel, Difficulty, OptionKey, QualityStatus, SectionId };
export type { ReviewState, SourceLevel, StyleType };

export type QuestionOrigin = "seed" | "llm" | "manual" | "import";

export interface Question {
  id: number;
  section: SectionId;
  category: string;
  subtopic: string;
  difficulty: Difficulty;
  cefrLevel: CefrLevel | null;

  questionText: string;
  passage: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: OptionKey;
  explanation: string;
  /**
   * Aciklamanin Turkce karsiligi. Ingilizce bolumunde aciklama Ingilizce
   * yazilir; bu alan altina eklenen Turkce anlatimi tutar. Turkce yazilmis
   * bolumlerde (Genel / Teknik) NULL kalir.
   */
  explanationTr: string | null;

  source: string | null;
  sourceUrl: string | null;
  sourceId: number | null;

  origin: QuestionOrigin;
  generatorModel: string | null;

  qualityStatus: QualityStatus;
  qualityNotes: string | null;
  timeSensitive: boolean;
  staleAfter: string | null;

  contentHash: string;
  fingerprint: string;

  createdAt: string;
  verifiedAt: string | null;
  updatedAt: string;

  timesAsked: number;
  timesCorrect: number;
  timesWrong: number;
  lastAskedAt: string | null;
  totalAnswerMs: number;

  // --- Stil / kavram / kaynak katmani (migration 2) ---
  /** Olculen tam beceri, orn. "JOIN turleri — left outer". */
  concept: string | null;
  styleType: StyleType | null;
  /** "Asagidakilerden hangisi DEGILDIR" tipi olumsuz kok. */
  isNegative: boolean;
  estimatedSeconds: number | null;
  skillsTested: string[];
  /** 0-100. Esigin altindakiler gercek sinava alinmaz. */
  qualityScore: number | null;
  sourceLevel: SourceLevel | null;
  sourceName: string | null;
  sourceYear: number | null;
  /** Ice aktarilan sorularda dogru cevabin kesinligi (0-1). */
  answerConfidence: number | null;
  /** true = gercek/eski sinav sorusu. Gercek sinav simulasyonuna girmez. */
  historical: boolean;
  referenceId: number | null;
  lastVerifiedAt: string | null;
}

/** Sinav sirasinda istemciye gonderilen guvenli sekil: dogru cevap YOK. */
export interface ExamQuestionView {
  position: number;
  questionId: number;
  section: SectionId;
  sectionLabel: string;
  category: string;
  subtopic: string;
  difficulty: Difficulty;
  passage: string | null;
  questionText: string;
  options: Readonly<Record<OptionKey, string>>;
  selectedAnswer: OptionKey | null;
  flagged: boolean;
  timeSpentMs: number;
}

export type ExamMode =
  | "full_exam"
  | "practice"
  | "weak_topics"
  | "mistake_concepts"
  | "retry_mistakes"
  /** Cikmis/gercek sorular (Historical Questions Mode — sartname #4A). */
  | "historical"
  | "custom";

export type SessionStatus = "in_progress" | "submitted" | "abandoned";

export interface ExamSession {
  id: number;
  mode: ExamMode;
  label: string;
  status: SessionStatus;
  configJson: string;
  paramsJson: string | null;
  totalQuestions: number;
  durationSeconds: number | null;
  startedAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
  score: number | null;
  passed: boolean | null;
  resultJson: string | null;
  createdAt: string;
}

export interface AnswerRecord {
  sessionId: number;
  questionId: number;
  position: number;
  selectedAnswer: OptionKey | null;
  isCorrect: boolean | null;
  flagged: boolean;
  timeSpentMs: number;
  firstSeenAt: string | null;
  answeredAt: string | null;
  gradedAt: string | null;
}

// --- Sonuc / analiz modelleri -------------------------------------------------

export interface SectionResult {
  sectionId: SectionId;
  label: string;
  ordinal: number;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  accuracy: number; // 0-1, dogru / toplam soru
  passRatio: number;
  requiredCorrect: number;
  passed: boolean;
  /** Baraji gecemediyse insan okunur neden. */
  failReason: string | null;
  timeSpentMs: number;
  avgTimePerQuestionMs: number;
}

export interface TopicResult {
  section: SectionId;
  category: string;
  subtopic: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface QuestionTiming {
  position: number;
  questionId: number;
  section: SectionId;
  category: string;
  timeSpentMs: number;
  isCorrect: boolean | null;
  questionText: string;
}

export interface TimeManagementAnalysis {
  totalTimeMs: number;
  allottedTimeMs: number | null;
  avgPerQuestionMs: number;
  medianPerQuestionMs: number;
  bySection: { sectionId: SectionId; label: string; timeMs: number; share: number }[];
  slowest: QuestionTiming[];
  fastest: QuestionTiming[];
  verdict: "Good" | "Watch" | "At Risk";
  notes: string[];
}

export interface ExamResult {
  sessionId: number;
  mode: ExamMode;
  label: string;
  submittedAt: string;
  autoSubmitted: boolean;

  totalQuestions: number;
  correct: number;
  wrong: number;
  blank: number;
  accuracy: number;
  score: number;
  passed: boolean;
  /** Basarisizlik nedenleri (baraj / toplam puan). Bos ise gecmistir. */
  failReasons: string[];

  sections: SectionResult[];
  topics: TopicResult[];
  weakTopics: TopicResult[];
  strongTopics: TopicResult[];
  categoryBreakdown: { section: SectionId; category: string; total: number; correct: number; accuracy: number }[];
  time: TimeManagementAnalysis;
}

// --- Mastery / readiness -----------------------------------------------------

export interface TopicMastery {
  id: number;
  section: SectionId;
  category: string;
  subtopic: string;
  attempts: number;
  correct: number;
  ewma: number;
  masteryScore: number;
  confidence: number;
  lastAnswerAt: string | null;
  updatedAt: string;
}

export interface ReadinessComponent {
  key: string;
  label: string;
  weight: number;
  /** 0-100 arasi bilesen puani. */
  value: number;
  detail: string;
}

export interface ReadinessReport {
  score: number;
  components: ReadinessComponent[];
  sectionVerdicts: {
    sectionId: SectionId;
    label: string;
    verdict: "Strong" | "Moderate" | "At Risk" | "No Data";
    accuracy: number | null;
    requiredRatio: number;
  }[];
  timeManagement: "Good" | "Watch" | "At Risk" | "No Data";
  sampleSize: number;
  explanation: string[];
}

export interface MistakeEntry {
  id: number;
  questionId: number;
  sessionId: number;
  sessionLabel: string;
  section: SectionId;
  category: string;
  subtopic: string;
  difficulty: Difficulty;
  questionText: string;
  passage: string | null;
  options: Readonly<Record<OptionKey, string>>;
  selectedAnswer: OptionKey | null;
  correctAnswer: OptionKey;
  wasBlank: boolean;
  explanation: string;
  explanationTr: string | null;
  source: string | null;
  sourceUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface BankCoverage {
  section: SectionId;
  category: string;
  verified: number;
  reviewNeeded: number;
  unseen: number;
  threshold: number;
  belowThreshold: boolean;
}
