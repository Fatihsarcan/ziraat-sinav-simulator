/**
 * PDF METIN CIKARMA (bagimliliksiz)
 * =================================
 * Ice aktarim icin PDF'lerden GOMULU METNI cikarir. Node'un yerlesik `zlib`
 * modulu disinda bagimlilik kullanmaz — projenin "native derleme yok" ilkesine
 * uyar.
 *
 * NE YAPAR:  FlateDecode ile sikistirilmis icerik akislarini acar, metin
 *            gosterme operatorlerini (Tj, TJ, ', ") toplar, PDF dizgi
 *            kaclarini cozer.
 *
 * NE YAPMAZ: Taranmis (goruntu) PDF'lerden metin cikaramaz — OCR yoktur.
 *            Ozel/alt-kumelenmis fontlarda karakter eslemesi (ToUnicode CMap)
 *            uygulanmaz; bu tur PDF'lerde Turkce karakterler bozulabilir.
 *            Bu durum SESSIZCE GECISTIRILMEZ: `quality` alani "poor" doner ve
 *            arayuz kullaniciyi metni elle duzeltmeye yonlendirir.
 */

import zlib from "node:zlib";

export interface PdfExtraction {
  text: string;
  /** Metin bulunan akis sayisi. */
  streams: number;
  /**
   * good = bol miktarda okunabilir metin cikti.
   * poor = cok az metin cikti ya da karakterlerin cogu bozuk.
   * none = hic metin yok (buyuk olasilikla taranmis PDF).
   */
  quality: "good" | "poor" | "none";
  warning: string | null;
}

/** PDF dizgi kacislari: \n \r \t \( \) \\ ve sekizlik \ddd. */
function decodePdfString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      let octal = "";
      let j = i + 1;
      while (j < raw.length && octal.length < 3 && raw[j]! >= "0" && raw[j]! <= "7") {
        octal += raw[j]!;
        j += 1;
      }
      out += String.fromCharCode(parseInt(octal, 8));
      i = j - 1;
      continue;
    }
    switch (next) {
      case "n": out += "\n"; break;
      case "r": out += "\r"; break;
      case "t": out += "\t"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "\n": break; // satir devami
      default: out += next;
    }
    i += 1;
  }
  return out;
}

const STRING_LITERAL = /\((?:\\.|[^\\()])*\)/g;

/** Bir icerik akisindan metin operatorlerinin argumanlarini toplar. */
function extractFromContentStream(content: string): string[] {
  const lines: string[] = [];
  for (const rawLine of content.split(/[\r\n]+/)) {
    if (!/T[jJ]|'|"/.test(rawLine)) continue;
    STRING_LITERAL.lastIndex = 0;
    let acc = "";
    let match: RegExpExecArray | null;
    while ((match = STRING_LITERAL.exec(rawLine)) !== null) {
      acc += decodePdfString(match[0]!.slice(1, -1));
    }
    if (acc.trim().length > 0) lines.push(acc);
  }
  return lines;
}

/** Latin-1 -> muhtemel Turkce onarimi yapmaz; yalnizca okunabilirligi olcer. */
function readableRatio(text: string): number {
  if (text.length === 0) return 0;
  const readable = text.match(/[\p{L}\p{N}\s.,;:()?!'"%/+-]/gu)?.length ?? 0;
  return readable / text.length;
}

export function extractPdfText(buffer: Buffer): PdfExtraction {
  const parts: string[] = [];
  let streams = 0;
  let cursor = 0;

  for (;;) {
    const start = buffer.indexOf("stream", cursor);
    if (start === -1) break;
    let dataStart = start + "stream".length;
    if (buffer[dataStart] === 0x0d) dataStart += 1;
    if (buffer[dataStart] === 0x0a) dataStart += 1;

    const end = buffer.indexOf("endstream", dataStart);
    if (end === -1) break;
    cursor = end + "endstream".length;

    const raw = buffer.subarray(dataStart, end);
    let inflated: Buffer;
    try {
      inflated = zlib.inflateSync(raw);
    } catch {
      // Sikistirilmamis ya da desteklenmeyen filtre (DCTDecode = gomulu resim).
      continue;
    }

    const content = inflated.toString("latin1");
    const lines = extractFromContentStream(content);
    if (lines.length > 0) {
      streams += 1;
      parts.push(lines.join("\n"));
    }
  }

  const text = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (text.length === 0) {
    return {
      text: "",
      streams,
      quality: "none",
      warning:
        "PDF'ten hiç metin çıkarılamadı. Dosya büyük olasılıkla taranmış (görüntü) bir PDF. " +
        "Metni kopyalayıp .txt olarak içe aktarmayı deneyin.",
    };
  }

  const ratio = readableRatio(text);
  if (ratio < 0.85 || text.length < 200) {
    return {
      text,
      streams,
      quality: "poor",
      warning:
        `PDF'ten çıkan metnin okunabilirliği düşük (%${Math.round(ratio * 100)}). ` +
        "Gömülü font özel kodlama kullanıyor olabilir; Türkçe karakterler bozulmuş olabilir. " +
        "Çıkan soruları onaylamadan önce mutlaka gözden geçirin.",
    };
  }

  return { text, streams, quality: "good", warning: null };
}
