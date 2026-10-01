/** Arayuz bicimlendirme yardimcilari (sunucu ve istemci tarafinda kullanilabilir). */

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `%${(value * 100).toFixed(digits)}`;
}

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** ms -> "1s 23dk" / "4dk 12sn" / "48sn" */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}s ${minutes}dk`;
  if (minutes > 0) return `${minutes}dk ${seconds}sn`;
  return `${seconds}sn`;
}

/** Saniye -> "02:39:41" (sinav sayaci). */
export function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function dateTR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTimeTR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function signed(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export const DIFFICULTY_LABEL = {
  easy: "Kolay",
  medium: "Orta",
  hard: "Zor",
} as const;

/**
 * Soru inceleme durumu (sartname #13: Pending / Approved / Rejected).
 * Veritabani degerleri degismedi; yalnizca arayuz adlandirmasi netlestirildi:
 * yalnizca "Onaylı" sorular gercek sinava ve calismaya girer.
 */
export const STATUS_LABEL = {
  verified: "Onaylı",
  review_needed: "Beklemede",
  rejected: "Reddedildi",
} as const;

export const MODE_LABEL = {
  full_exam: "Gerçek Sınav",
  practice: "Çalışma",
  weak_topics: "Zayıf Konular",
  mistake_concepts: "Zayıflıklarımı Çalış",
  retry_mistakes: "Eski Yanlışları Tekrar Çöz",
  historical: "Çıkmış Sorular",
  custom: "Özel Çalışma",
} as const;
