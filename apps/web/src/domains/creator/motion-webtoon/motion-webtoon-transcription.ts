/**
 * 모션 웹툰 자막용 Groq Whisper 전사 클라이언트 (BYOK).
 *
 * 서버 스튜디오 AI의 전사 계약(apps/api studio-ai-groq-media)과 같은 응답 형태를
 * 소비하지만, 호출 경로는 다르다: 서버 무료 풀(env 키)이 아니라 통합 AI 설정
 * 볼트에 사용자가 등록한 본인 Groq 키로 브라우저에서 Groq를 직접 호출한다.
 * 키가 없으면 호출 자체를 하지 않고 "not-configured" 상태로 구분한다.
 *
 * 비용 정책·런타임 예산 가드(userAiFetch)는 자동 무료 경로를 텍스트 기능으로만
 * 설계했기 때문에 이 전사 경로는 그 가드를 우회하지 않고, 볼트 스냅샷 조회와
 * 전역 요청 등록(registerUserAiRequest)·설정 개정(revision) 검사만 재사용한다.
 */

import {
  getUserAiSnapshot,
  registerUserAiRequest,
} from "@/shared/ai/user-ai-store";
import {
  userAiConnectionApiKeys,
  validateUserAiBaseUrl,
  type UserAiConfiguration,
} from "@/shared/ai/user-ai-types";

import {
  clampCutDuration,
  createMotionId,
  type DialogueLine,
  type MotionEpisode,
} from "./motion-webtoon-model";

/** 서버 전사 계약과 같은 기본 모델 (Groq Whisper). */
export const GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3";

/** Groq 무료 티어 파일 상한: 25MB (서버 전사 검증과 동일). */
export const GROQ_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

const GROQ_TRANSCRIPTION_EXTENSIONS = new Set([
  "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm",
]);

const GROQ_HOSTNAME = "api.groq.com";
const TRANSCRIPTION_PATH = "/audio/transcriptions";
const TRANSCRIPTION_TIMEOUT_MS = 180_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/** 전사 구간 하나 — 자막 큐와 1:1로 대응한다 (서버 전사 계약과 같은 형태). */
export interface GroqTranscriptionSegment {
  readonly index: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly text: string;
}

export interface GroqTranscriptionResult {
  readonly model: string;
  readonly text: string;
  readonly language: string;
  readonly durationSeconds?: number;
  readonly segments: readonly GroqTranscriptionSegment[];
}

export type GroqTranscriptionErrorCode =
  | "not-configured"
  | "empty-file"
  | "too-large"
  | "unsupported-format"
  | "authentication"
  | "quota-exhausted"
  | "http-error"
  | "network"
  | "invalid-response"
  | "connection-changed"
  | "aborted";

export class GroqTranscriptionError extends Error {
  constructor(
    readonly code: GroqTranscriptionErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GroqTranscriptionError";
  }
}

export interface GroqTranscriptionRoute {
  readonly connectionId: string;
  readonly baseUrl: string;
  readonly apiKey: string;
}

function groqHostname(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * 통합 AI 설정에서 전사에 쓸 Groq 연결을 찾는다.
 * Groq 공식 호스트(api.groq.com)를 쓰는 활성 연결 중 활성 API 키가 있는
 * 첫 번째 연결을 돌려준다. 없으면 null — 호출자가 "키 없음" 상태를 안내한다.
 */
export function resolveGroqTranscriptionRoute(
  configuration: UserAiConfiguration,
): GroqTranscriptionRoute | null {
  for (const connection of configuration.connections) {
    if (connection.enabled === false) continue;
    if (groqHostname(connection.baseUrl) !== GROQ_HOSTNAME) continue;
    const [key] = userAiConnectionApiKeys(connection);
    if (!key?.apiKey.trim()) continue;
    return {
      connectionId: connection.id,
      baseUrl: connection.baseUrl,
      apiKey: key.apiKey,
    };
  }
  return null;
}

/** 오디오 파일 사전 검증 — 제공자까지 보내지 않고 상태로 구분한다. */
export function validateTranscriptionAudioFile(file: { name: string; size: number }): void {
  if (file.size === 0) {
    throw new GroqTranscriptionError("empty-file", "오디오 파일이 비어 있어요.");
  }
  if (file.size > GROQ_TRANSCRIPTION_MAX_BYTES) {
    throw new GroqTranscriptionError(
      "too-large",
      "전사는 25MB 이하 파일만 처리할 수 있어요.",
    );
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!GROQ_TRANSCRIPTION_EXTENSIONS.has(extension)) {
    throw new GroqTranscriptionError(
      "unsupported-format",
      "지원하지 않는 오디오 형식이에요. (flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm)",
    );
  }
}

function finiteSeconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** 제공자 segments를 자막 계약 형태로 정규화한다 (서버 정규화와 같은 규칙). */
export function normalizeTranscriptionSegments(raw: unknown): GroqTranscriptionSegment[] {
  if (!Array.isArray(raw)) return [];
  const segments: GroqTranscriptionSegment[] = [];
  for (const candidate of raw as Array<{ start?: unknown; end?: unknown; text?: unknown }>) {
    if (!candidate || typeof candidate !== "object") continue;
    const start = finiteSeconds(candidate.start);
    const end = finiteSeconds(candidate.end);
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (start === undefined || end === undefined || end < start || !text) continue;
    segments.push({ index: segments.length, startSeconds: start, endSeconds: end, text });
  }
  return segments
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .map((segment, index) => ({ ...segment, index }));
}

function redactSecret(text: string, apiKey: string): string {
  return apiKey ? text.replaceAll(apiKey, "[비밀정보 제거]") : text;
}

/** Groq verbose_json 응답을 전사 결과로 해석한다. */
export function parseGroqTranscriptionPayload(
  payload: unknown,
  apiKey: string,
): GroqTranscriptionResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new GroqTranscriptionError(
      "invalid-response",
      "Groq 전사 응답 형식을 확인하지 못했어요.",
    );
  }
  const record = payload as Record<string, unknown>;
  const text = typeof record.text === "string" ? redactSecret(record.text.trim(), apiKey) : "";
  const segments = normalizeTranscriptionSegments(record.segments);
  if (segments.length === 0 && text) {
    // 본문은 왔지만 시간 구간이 없으면 자막으로 만들 수 없다 — 빈 결과로 위장하지 않는다.
    throw new GroqTranscriptionError(
      "invalid-response",
      "Groq가 전사 구간(타임스탬프)을 돌려주지 않았어요.",
    );
  }
  const durationSeconds = finiteSeconds(record.duration);
  return {
    model: GROQ_TRANSCRIPTION_MODEL,
    text,
    language: typeof record.language === "string" && record.language.trim()
      ? record.language.trim().toLowerCase()
      : "",
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    segments,
  };
}

async function providerErrorMessage(response: Response, apiKey: string): Promise<string> {
  try {
    const raw = (await response.text()).slice(0, 1_000);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
      if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) {
        return redactSecret(parsed.error.message.trim(), apiKey);
      }
    } catch {
      // JSON이 아니면 상태 코드만으로 안내한다.
    }
  } catch {
    // 본문을 읽지 못해도 상태 코드 안내는 가능하다.
  }
  return "";
}

export interface TranscribeAudioOptions {
  /** ISO-639-1 (예: "ko", "en"). 생략하면 자동 감지. */
  readonly language?: string;
  readonly signal?: AbortSignal;
  /** 테스트 주입용. 기본값은 전역 fetch. */
  readonly fetchFn?: typeof fetch;
}

/**
 * 오디오 파일을 본인 Groq 키로 전사한다.
 * 자동 재시도·유료 전환·서버 풀 경유는 하지 않는다 (userAiFetch와 같은 원칙).
 */
export async function transcribeAudioFileWithGroq(
  file: File,
  options: TranscribeAudioOptions = {},
): Promise<GroqTranscriptionResult> {
  validateTranscriptionAudioFile(file);
  const route = resolveGroqTranscriptionRoute(getUserAiSnapshot().configuration);
  if (!route) {
    throw new GroqTranscriptionError(
      "not-configured",
      "통합 AI 설정에 사용할 수 있는 Groq 키가 없어요.",
    );
  }
  const revision = getUserAiSnapshot().revision;
  if (options.signal?.aborted) {
    throw new GroqTranscriptionError("aborted", "전사가 시작 전에 취소되었어요.");
  }

  const form = new FormData();
  form.append("file", file, file.name);
  form.append("model", GROQ_TRANSCRIPTION_MODEL);
  form.append("response_format", "verbose_json");
  // 자막은 구간 타이밍만으로 충분하다 (단어 단위는 요청하지 않는다).
  form.append("timestamp_granularities[]", "segment");
  form.append("temperature", "0");
  if (options.language) form.append("language", options.language.trim().toLowerCase());

  const fetchFn = options.fetchFn ?? fetch;
  const controller = new AbortController();
  const unregister = registerUserAiRequest(controller);
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
    ...(options.signal ? [options.signal] : []),
  ]);
  try {
    let response: Response;
    try {
      response = await fetchFn(`${validateUserAiBaseUrl(route.baseUrl)}${TRANSCRIPTION_PATH}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${route.apiKey}` },
        body: form,
        signal,
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
    } catch (error) {
      if (signal.aborted) {
        throw new GroqTranscriptionError(
          "aborted",
          "전사가 취소되었거나 제한 시간을 초과했어요. 같은 파일을 자동 재전송하지 않았습니다.",
        );
      }
      if (error instanceof TypeError) {
        throw new GroqTranscriptionError(
          "network",
          "Groq에 연결하지 못했어요. 네트워크·CORS 상태를 확인하세요.",
          undefined,
        );
      }
      throw error;
    }
    if (!response.ok) {
      const detail = await providerErrorMessage(response, route.apiKey);
      const suffix = detail ? ` ${detail}` : "";
      if (response.status === 401 || response.status === 403) {
        throw new GroqTranscriptionError(
          "authentication",
          `Groq 키 인증에 실패했어요 (HTTP ${response.status}).${suffix}`,
          response.status,
        );
      }
      if (response.status === 402 || response.status === 429) {
        throw new GroqTranscriptionError(
          "quota-exhausted",
          `Groq 사용량 한도에 닿았어요 (HTTP ${response.status}).${suffix}`,
          response.status,
        );
      }
      throw new GroqTranscriptionError(
        "http-error",
        `Groq 전사 요청이 실패했어요 (HTTP ${response.status}).${suffix}`,
        response.status,
      );
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new GroqTranscriptionError(
        "invalid-response",
        "Groq 전사 응답 용량이 허용 범위를 넘었어요.",
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GroqTranscriptionError(
        "invalid-response",
        "Groq 전사 응답이 올바른 JSON 형식이 아니에요.",
      );
    }
    if (revision !== getUserAiSnapshot().revision) {
      throw new GroqTranscriptionError(
        "connection-changed",
        "AI 연결이 변경되어 전사 결과를 적용하지 않았어요.",
      );
    }
    return parseGroqTranscriptionPayload(payload, route.apiKey);
  } finally {
    unregister();
  }
}

export interface ApplyTranscriptionResult {
  readonly episode: MotionEpisode;
  readonly appliedCount: number;
  /** 회차 전체 길이를 벗어나 어느 컷에도 들어가지 못한 구간 수. */
  readonly skippedCount: number;
}

function roundOffset(seconds: number): number {
  return Math.round(seconds * 1_000) / 1_000;
}

/**
 * 전사 구간을 회차 타임라인에 대사 초안으로 넣는다.
 *
 * 타이밍 규칙은 자막 트랙(buildCaptionTrack)과 같은 컷 누적 창을 쓴다:
 * 구간 시작점이 속한 컷에, 컷 시작 기준 오프셋으로 대사를 추가한다.
 * 기존 대사는 지우지 않고(비파괴), 어느 컷에도 속하지 않는 구간은
 * 위치를 지어내지 않고 skippedCount로 센다.
 */
export function applyTranscriptionSegments(
  episode: MotionEpisode,
  segments: readonly GroqTranscriptionSegment[],
  characterId: string,
  createId: () => string = () => createMotionId("dlg"),
): ApplyTranscriptionResult {
  const windows: Array<{ cutStart: number; cutEnd: number }> = [];
  let cursor = 0;
  for (const cut of episode.cuts) {
    const duration = clampCutDuration(cut.direction.durationSeconds);
    windows.push({ cutStart: cursor, cutEnd: cursor + duration });
    cursor += duration;
  }

  const additions = new Map<number, DialogueLine[]>();
  let appliedCount = 0;
  let skippedCount = 0;
  const ordered = [...segments].sort((a, b) => a.startSeconds - b.startSeconds);
  for (const segment of ordered) {
    const cutIndex = windows.findIndex(
      (window) => segment.startSeconds >= window.cutStart && segment.startSeconds < window.cutEnd,
    );
    if (cutIndex < 0) {
      skippedCount += 1;
      continue;
    }
    const line: DialogueLine = {
      id: createId(),
      text: segment.text,
      characterId,
      startOffsetSeconds: roundOffset(segment.startSeconds - windows[cutIndex].cutStart),
    };
    const list = additions.get(cutIndex) ?? [];
    list.push(line);
    additions.set(cutIndex, list);
    appliedCount += 1;
  }

  if (appliedCount === 0) {
    return { episode, appliedCount, skippedCount };
  }
  return {
    episode: {
      ...episode,
      cuts: episode.cuts.map((cut, cutIndex) => {
        const added = additions.get(cutIndex);
        if (!added) return cut;
        return {
          ...cut,
          dialogues: [...cut.dialogues, ...added].sort(
            (a, b) => a.startOffsetSeconds - b.startOffsetSeconds,
          ),
        };
      }),
    },
    appliedCount,
    skippedCount,
  };
}
