import type { CefrLevel, Difficulty, OptionKey, SectionId } from "../../core/types.ts";

/** Elle yazilmis baslangic sorulari icin kompakt sekil. */
export interface SeedQuestion {
  section: SectionId;
  category: string;
  subtopic: string;
  difficulty: Difficulty;
  cefr?: CefrLevel;
  passage?: string;
  q: string;
  a: string;
  b: string;
  c: string;
  d: string;
  correct: OptionKey;
  explanation: string;
  /**
   * Ingilizce bolum sorularinda aciklamanin Turkce karsiligi. Arayuzde
   * Ingilizce aciklamanin ALTINDA gosterilir. Zaten Turkce yazilmis
   * aciklamalarda (ceviri sorulari, Genel/Teknik bolum) bos birakilir.
   */
  explanationTr?: string;
  source?: string;
  sourceUrl?: string;
  timeSensitive?: boolean;
}
