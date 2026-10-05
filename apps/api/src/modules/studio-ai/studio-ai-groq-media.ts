import type { StudioAiCapabilityConfig } from "./studio-ai-capabilities";
import {
  ensureCapabilityConfigured,
  providerNetworkError,
  runStudioAiCapability,
  throwForProviderErrorResponse,
  StudioAiCapabilityInputError,
  type StudioAiCapabilityRun,
  type StudioAiMediaFetch,
} from "./studio-ai-media";

/**
 * Groq 무료 구간 어댑터 — 전사(Whisper)와 비전.
 * 기존 풀의 Groq 서버 키를 그대로 재사용한다 (신규 키 0).
 * 실제 외부 호출은 이 파일의 함수들이 유일한 경계이며, 테스트는 fetch를 목으로 주입한다.
 */

// ---------------------------------------------------------------------------
// 전사 계약 — 자막 도메인이 소비하는 형태
// ---------------------------------------------------------------------------

/**
 * 자막 도메인용 전사 계약.
 * segments가 SRT/VTT 큐와 1:1로 대응한다: startSeconds/endSeconds는 오디오 시작 기준 초,
 * text는 해당 구간 대사다. words는 단어 단위 타이밍이 필요할 때(카라오케 등)만 쓴다.
 * language는 ISO-639-1 코드(제공자가 돌려준 감지 결과 또는 요청 언어)다.
 */
export interface StudioAiTranscriptionSegment {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface StudioAiTranscriptionWord {
  word: string;
  startSeconds: number;
  endSeconds: number;
}

export interface StudioAiTranscriptionResult {
  provider: "groq";
  model: string;
  text: string;
  language: string;
  durationSeconds?: number;
  segments: StudioAiTranscriptionSegment[];
  words: StudioAiTranscriptionWord[];
}

export interface StudioAiTranscriptionInput {
  /** 직접 업로드할 오디오 바이트. audioUrl과 하나만 지정한다. */
  audio?: {
    bytes: Uint8Array;
    filename: string;
    contentType: string;
  };
  /** 제공자가 가져올 공개 오디오 URL. audio와 하나만 지정한다. */
  audioUrl?: string;
  /** ISO-639-1 (예: "ko", "en"). 생략하면 자동 감지. */
  language?: string;
  /** 표기·맥락을 안내하는 짧은 프롬프트 (제공자 상한 224토큰 수준). */
  prompt?: string;
}

/** Groq 무료 티어 파일 상한: 25MB (공식 STT 문서, 2026-10-06 확인). */
export const STUDIO_AI_GROQ_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

const GROQ_TRANSCRIPTION_EXTENSIONS = new Set([
  "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm",
]);

function validateTranscriptionInput(input: StudioAiTranscriptionInput): void {
  const hasAudio = Boolean(input.audio);
  const hasUrl = Boolean(input.audioUrl?.trim());
  if (hasAudio === hasUrl) {
    throw new StudioAiCapabilityInputError(
      "transcription",
      "전사할 오디오는 파일 또는 URL 중 하나만 지정해야 해요.",
    );
  }
  if (input.audio) {
    if (input.audio.bytes.byteLength === 0) {
      throw new StudioAiCapabilityInputError("transcription", "오디오 파일이 비어 있어요.");
    }
    if (input.audio.bytes.byteLength > STUDIO_AI_GROQ_TRANSCRIPTION_MAX_BYTES) {
      throw new StudioAiCapabilityInputError(
        "transcription",
        "무료 전사는 25MB 이하 파일만 처리할 수 있어요.",
      );
    }
    const extension = input.audio.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!GROQ_TRANSCRIPTION_EXTENSIONS.has(extension)) {
      throw new StudioAiCapabilityInputError(
        "transcription",
        "지원하지 않는 오디오 형식이에요. (flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm)",
      );
    }
  }
  if (input.language !== undefined && !/^[a-z]{2}(?:-[a-z]{2})?$/iu.test(input.language.trim())) {
    throw new StudioAiCapabilityInputError(
      "transcription",
      "언어는 ISO-639-1 코드(예: ko, en)로 지정해야 해요.",
    );
  }
  if (input.prompt !== undefined && input.prompt.length > 1_000) {
    throw new StudioAiCapabilityInputError("transcription", "전사 프롬프트가 너무 길어요.");
  }
}

interface RawSegment {
  start?: unknown;
  end?: unknown;
  text?: unknown;
}

function finiteSeconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function normalizeSegments(raw: unknown): StudioAiTranscriptionSegment[] {
  if (!Array.isArray(raw)) return [];
  const segments: StudioAiTranscriptionSegment[] = [];
  for (const candidate of raw as RawSegment[]) {
    if (!candidate || typeof candidate !== "object") continue;
    const start = finiteSeconds(candidate.start);
    const end = finiteSeconds(candidate.end);
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (start === undefined || end === undefined || end < start || !text) continue;
    segments.push({ index: segments.length, startSeconds: start, endSeconds: end, text });
  }
  return segments.sort((a, b) => a.startSeconds - b.startSeconds)
    .map((segment, index) => ({ ...segment, index }));
}

function normalizeWords(raw: unknown): StudioAiTranscriptionWord[] {
  if (!Array.isArray(raw)) return [];
  const words: StudioAiTranscriptionWord[] = [];
  for (const candidate of raw as Array<{ word?: unknown; start?: unknown; end?: unknown }>) {
    if (!candidate || typeof candidate !== "object") continue;
    const start = finiteSeconds(candidate.start);
    const end = finiteSeconds(candidate.end);
    const word = typeof candidate.word === "string" ? candidate.word.trim() : "";
    if (start === undefined || end === undefined || end < start || !word) continue;
    words.push({ word, startSeconds: start, endSeconds: end });
  }
  return words.sort((a, b) => a.startSeconds - b.startSeconds);
}

export async function transcribeWithGroq(
  config: StudioAiCapabilityConfig,
  input: StudioAiTranscriptionInput,
  fetchFn: StudioAiMediaFetch = fetch,
  signal?: AbortSignal,
): Promise<StudioAiTranscriptionResult> {
  ensureCapabilityConfigured(config);
  validateTranscriptionInput(input);

  const form = new FormData();
  if (input.audio) {
    form.append(
      "file",
      new Blob([new Uint8Array(input.audio.bytes)], { type: input.audio.contentType }),
      input.audio.filename,
    );
  } else if (input.audioUrl) {
    form.append("url", input.audioUrl.trim());
  }
  form.append("model", config.model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");
  form.append("temperature", "0");
  if (input.language) form.append("language", input.language.trim().toLowerCase());
  if (input.prompt) form.append("prompt", input.prompt);

  let response: Response;
  try {
    response = await fetchFn(config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw providerNetworkError(config);
  }
  if (!response.ok) await throwForProviderErrorResponse(config, response);

  const payload = (await response.json()) as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const durationSeconds = finiteSeconds(payload.duration);
  return {
    provider: "groq",
    model: config.model,
    text,
    language: typeof payload.language === "string" && payload.language.trim()
      ? payload.language.trim().toLowerCase()
      : (input.language?.trim().toLowerCase() ?? ""),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    segments: normalizeSegments(payload.segments),
    words: normalizeWords(payload.words),
  };
}

export function transcribeWithFreePool(
  input: StudioAiTranscriptionInput,
  env: Partial<Record<string, string | undefined>> = process.env,
  fetchFn: StudioAiMediaFetch = fetch,
  signal?: AbortSignal,
): Promise<StudioAiCapabilityRun<StudioAiTranscriptionResult>> {
  return runStudioAiCapability("transcription", env, (config) =>
    transcribeWithGroq(config, input, fetchFn, signal));
}

// ---------------------------------------------------------------------------
// 비전 — 컷 이미지 분석 (자동 설명·태깅 초안)
// ---------------------------------------------------------------------------

export interface StudioAiVisionInput {
  /** 이미지에 대한 질문·지시 (예: 컷 설명 초안 작성). */
  prompt: string;
  /** 공개 HTTPS 이미지 URL. imageDataUrl과 하나만 지정한다. */
  imageUrl?: string;
  /** data:image/...;base64,... 형식. imageUrl과 하나만 지정한다. */
  imageDataUrl?: string;
  maxCompletionTokens?: number;
}

export interface StudioAiVisionResult {
  provider: "groq";
  model: string;
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** Groq 비전 base64 요청 상한 4MB에 대응하는 data URL 길이 상한(여유 포함). */
const GROQ_VISION_MAX_DATA_URL_LENGTH = 5_700_000;

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (/^127\./u.test(host) || /^10\./u.test(host) || /^192\.168\./u.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./u.test(host)) return true;
  return host === "::1" || host === "0.0.0.0";
}

function validateVisionInput(input: StudioAiVisionInput): string {
  if (!input.prompt.trim() || input.prompt.length > 4_000) {
    throw new StudioAiCapabilityInputError("vision", "비전 분석 지시는 1~4,000자로 입력해야 해요.");
  }
  const imageUrl = input.imageUrl?.trim() ?? "";
  const dataUrl = input.imageDataUrl?.trim() ?? "";
  if (Boolean(imageUrl) === Boolean(dataUrl)) {
    throw new StudioAiCapabilityInputError(
      "vision",
      "분석할 이미지는 URL 또는 데이터 중 하나만 지정해야 해요.",
    );
  }
  if (imageUrl) {
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw new StudioAiCapabilityInputError("vision", "이미지 URL 형식이 올바르지 않아요.");
    }
    if (parsed.protocol !== "https:" || isPrivateOrLocalHost(parsed.hostname)) {
      throw new StudioAiCapabilityInputError(
        "vision",
        "이미지 URL은 공개 HTTPS 주소만 사용할 수 있어요.",
      );
    }
    return imageUrl;
  }
  if (!/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/iu.test(dataUrl)) {
    throw new StudioAiCapabilityInputError("vision", "이미지 데이터 형식이 올바르지 않아요.");
  }
  if (dataUrl.length > GROQ_VISION_MAX_DATA_URL_LENGTH) {
    throw new StudioAiCapabilityInputError("vision", "이미지가 너무 커요. (base64 4MB 이하)");
  }
  return dataUrl;
}

export async function analyzeImageWithGroq(
  config: StudioAiCapabilityConfig,
  input: StudioAiVisionInput,
  fetchFn: StudioAiMediaFetch = fetch,
  signal?: AbortSignal,
): Promise<StudioAiVisionResult> {
  ensureCapabilityConfigured(config);
  const imageUrl = validateVisionInput(input);
  const maxCompletionTokens = Math.min(
    4_096,
    Math.max(256, Math.round(input.maxCompletionTokens ?? 1_024)),
  );

  let response: Response;
  try {
    response = await fetchFn(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.2,
        max_completion_tokens: maxCompletionTokens,
        stream: false,
      }),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw providerNetworkError(config);
  }
  if (!response.ok) await throwForProviderErrorResponse(config, response);

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  };
  const content = payload.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content
          .map((part) => {
            if (!part || typeof part !== "object") return "";
            const textPart = (part as { text?: unknown }).text;
            return typeof textPart === "string" ? textPart : "";
          })
          .join("")
          .trim()
      : "";
  const usage = payload.usage;
  const usageNumbers = usage
    && typeof usage.prompt_tokens === "number"
    && typeof usage.completion_tokens === "number"
    && typeof usage.total_tokens === "number"
    ? {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      }
    : undefined;
  return {
    provider: "groq",
    model: config.model,
    text,
    ...(usageNumbers ? { usage: usageNumbers } : {}),
  };
}

export function analyzeImageWithFreePool(
  input: StudioAiVisionInput,
  env: Partial<Record<string, string | undefined>> = process.env,
  fetchFn: StudioAiMediaFetch = fetch,
  signal?: AbortSignal,
): Promise<StudioAiCapabilityRun<StudioAiVisionResult>> {
  return runStudioAiCapability("vision", env, (config) =>
    analyzeImageWithGroq(config, input, fetchFn, signal));
}
