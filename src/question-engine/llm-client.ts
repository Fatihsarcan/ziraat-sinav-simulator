import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic istemcisi.
 *
 * ONEMLI (sartname #32): Web arastirmasi ve LLM uretimi GERCEKTEN calisir ya
 * da HIC calismaz — taklit edilmez. API anahtari yoksa `generationStatus()`
 * bunu acikca bildirir ve uygulama mevcut soru bankasiyla calismaya devam eder.
 *
 * Web arastirmasi Anthropic'in sunucu tarafli `web_search` aracini kullanir;
 * arama ve sayfa okuma Anthropic altyapisinda calisir, bu uygulama kendi
 * basina site kazimaz.
 */

export const DEFAULT_MODEL = "claude-opus-5";

/** Sunucu tarafli web arama araci (dinamik filtreleme destekli surum). */
export const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 8,
} as const;

export interface GenerationStatus {
  available: boolean;
  model: string;
  webSearchEnabled: boolean;
  reason: string | null;
}

export function generationStatus(): GenerationStatus {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ZSS_GENERATION_MODEL?.trim() || DEFAULT_MODEL;
  if (!apiKey) {
    return {
      available: false,
      model,
      webSearchEnabled: false,
      reason:
        "ANTHROPIC_API_KEY tanimli degil. Soru uretimi devre disi; uygulama mevcut soru bankasiyla calisiyor. " +
        "Anahtari .env.local dosyasina ekleyip sunucuyu yeniden baslat.",
    };
  }
  return { available: true, model, webSearchEnabled: true, reason: null };
}

let cachedClient: Anthropic | null = null;

export function getClient(): Anthropic {
  const status = generationStatus();
  if (!status.available) throw new Error(status.reason ?? "LLM istemcisi kullanilamiyor.");
  if (!cachedClient) {
    cachedClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      maxRetries: 3,
      timeout: 15 * 60 * 1000,
    });
  }
  return cachedClient;
}

export function currentModel(): string {
  return process.env.ZSS_GENERATION_MODEL?.trim() || DEFAULT_MODEL;
}

export interface TextCallOptions {
  system: string;
  userMessage: string;
  maxTokens?: number;
  useWebSearch?: boolean;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface TextCallResult {
  text: string;
  usedWebSearch: boolean;
  searchedUrls: string[];
  usage: { inputTokens: number; outputTokens: number };
}

/** Serbest metin uretimi (arastirma fazi). Uzun cikti icin streaming kullanir. */
export async function callText(options: TextCallOptions): Promise<TextCallResult> {
  const client = getClient();
  const stream = client.messages.stream({
    model: currentModel(),
    max_tokens: options.maxTokens ?? 16000,
    system: options.system,
    output_config: { effort: options.effort ?? "high" },
    tools: options.useWebSearch ? [WEB_SEARCH_TOOL as never] : undefined,
    messages: [{ role: "user", content: options.userMessage }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(
      `Model istegi reddetti (kategori: ${message.stop_details?.category ?? "bilinmiyor"}).`,
    );
  }

  let text = "";
  const searchedUrls: string[] = [];
  let usedWebSearch = false;

  for (const block of message.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "web_search_tool_result") {
      usedWebSearch = true;
      const content = block.content as unknown;
      if (Array.isArray(content)) {
        for (const item of content as { url?: string }[]) {
          if (item.url) searchedUrls.push(item.url);
        }
      }
    }
  }

  return {
    text,
    usedWebSearch,
    searchedUrls: [...new Set(searchedUrls)],
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

export interface JsonCallOptions<T> {
  system: string;
  userMessage: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  parse: (value: unknown) => T;
}

/**
 * Yapilandirilmis JSON uretimi (uretim ve dogrulama fazlari).
 * `output_config.format` semaya uygun cikti garantiler.
 */
export async function callJson<T>(options: JsonCallOptions<T>): Promise<{ value: T; usage: { inputTokens: number; outputTokens: number } }> {
  const client = getClient();
  const stream = client.messages.stream({
    model: currentModel(),
    max_tokens: options.maxTokens ?? 32000,
    system: options.system,
    output_config: {
      effort: options.effort ?? "high",
      format: { type: "json_schema", schema: options.schema },
    } as never,
    messages: [{ role: "user", content: options.userMessage }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(
      `Model istegi reddetti (kategori: ${message.stop_details?.category ?? "bilinmiyor"}).`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Cikti max_tokens sinirinda kesildi; daha kucuk parti ile tekrar dene.");
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Modelden metin blogu donmedi.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (error) {
    throw new Error(`Model ciktisi JSON olarak ayristirilAMADI: ${(error as Error).message}`);
  }

  return {
    value: options.parse(parsed),
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}
