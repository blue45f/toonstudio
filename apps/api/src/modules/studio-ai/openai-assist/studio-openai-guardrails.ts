import { createHash } from "node:crypto";

import { HttpException, HttpStatus } from "@nestjs/common";
import {
  redactCreatorSensitiveText,
  type RedactedCreatorText,
} from "@toonstudio/contracts/studio-pii-redactor";

export { redactCreatorSensitiveText, type RedactedCreatorText };

export type EnvLike = Partial<Record<string, string | undefined>>;

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_FREE_SAFETY_CUTOFF_RATIO = 0.9;

export const OPENAI_FREE_DATA_SHARE_MODELS = new Set([
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4o",
]);
export const OPENAI_FLAGSHIP_ALLOWED_MODELS = new Set([
  "gpt-4.1",
  "gpt-5.4-mini",
  "gpt-5.5",
  "gpt-6.2-astra",
  "gpt-6.2-sol",
]);
export const GEMINI_FREE_TIER_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
]);
const ALLOWED_OPENAI_MODELS = new Set([
  ...OPENAI_FREE_DATA_SHARE_MODELS,
  ...OPENAI_FLAGSHIP_ALLOWED_MODELS,
]);
const RETIRED_OPENAI_MODELS = new Set(["gpt-4.1-nano", "gpt-4.1-nano-2025-04-14"]);
const OPENAI_REASONING_MODEL_PATTERN = /^(?:gpt-5|gpt-6|o3|o4)/iu;

export function isOpenAiFreeShareModel(model: string): boolean {
  return OPENAI_FREE_DATA_SHARE_MODELS.has(model.trim().toLowerCase());
}

export function isOpenAiReasoningModel(model: string): boolean {
  return OPENAI_REASONING_MODEL_PATTERN.test(model.trim());
}

export function isOpenAiRetiredModel(model: string): boolean {
  return RETIRED_OPENAI_MODELS.has(model.trim().toLowerCase());
}

export function isGeminiFreeTierModel(model: string): boolean {
  return GEMINI_FREE_TIER_MODELS.has(model.trim().toLowerCase());
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_REASONING_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 90_000;
const DEFAULT_BURST_LIMIT_PER_MINUTE = 5;
const DEFAULT_HOURLY_REQUEST_LIMIT = 20;
const DEFAULT_DAILY_REQUEST_LIMIT = 60;
const DEFAULT_GLOBAL_DAILY_REQUEST_LIMIT = 300;
const MAX_TRACKED_ACTOR_BUCKETS = 1_024;

const ORG_ID_PATTERN = /^org-[A-Za-z0-9_-]{4,80}$/u;
const PROJECT_ID_PATTERN = /^proj_[A-Za-z0-9_-]{4,80}$/u;

export interface StudioOpenAiCreativeConfig {
  readonly configured: boolean;
  readonly apiKey: string;
  readonly model: string;
  readonly modelConfigurationError: "retired" | null;
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly timeoutMs: number;
  readonly limits: {
    readonly burstPerMinute: number;
    readonly hourlyRequests: number;
    readonly dailyRequests: number;
    readonly globalDailyRequests: number;
  };
}

function parsePositiveLimit(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

/**
 * 서버 로컬 환경변수에서만 OpenAI 설정을 읽는다.
 * API 키·조직 ID·프로젝트 ID는 브라우저 응답이나 로그로 절대 내보내지 않는다.
 */
export function resolveStudioOpenAiCreativeConfig(
  env: EnvLike = process.env,
): StudioOpenAiCreativeConfig {
  const apiKey = env.OPENAI_API_KEY?.trim() ?? "";
  const rawModel = env.OPENAI_MODEL?.trim().toLowerCase() ?? "";
  const modelConfigurationError = RETIRED_OPENAI_MODELS.has(rawModel) ? "retired" : null;
  // 종료된 모델을 다른 유료 모델로 조용히 바꾸지 않고 서비스에서 호출 전에 차단한다.
  const model = modelConfigurationError === "retired" || ALLOWED_OPENAI_MODELS.has(rawModel)
    ? rawModel
    : DEFAULT_OPENAI_MODEL;
  const rawOrg = env.OPENAI_ORG_ID?.trim() ?? "";
  const rawProject = env.OPENAI_PROJECT_ID?.trim() ?? "";

  return {
    configured: apiKey.length > 0,
    apiKey,
    model,
    modelConfigurationError,
    organizationId: ORG_ID_PATTERN.test(rawOrg) ? rawOrg : null,
    projectId: PROJECT_ID_PATTERN.test(rawProject) ? rawProject : null,
    timeoutMs: parsePositiveLimit(
      env.STUDIO_OPENAI_TIMEOUT_MS,
      isOpenAiReasoningModel(model) ? DEFAULT_REASONING_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
      5_000,
      MAX_TIMEOUT_MS,
    ),
    limits: {
      burstPerMinute: parsePositiveLimit(
        env.STUDIO_OPENAI_BURST_LIMIT_PER_MINUTE,
        DEFAULT_BURST_LIMIT_PER_MINUTE,
        1,
        60,
      ),
      hourlyRequests: parsePositiveLimit(
        env.STUDIO_OPENAI_HOURLY_REQUEST_LIMIT,
        DEFAULT_HOURLY_REQUEST_LIMIT,
        1,
        500,
      ),
      dailyRequests: parsePositiveLimit(
        env.STUDIO_OPENAI_DAILY_REQUEST_LIMIT,
        DEFAULT_DAILY_REQUEST_LIMIT,
        1,
        2_000,
      ),
      globalDailyRequests: parsePositiveLimit(
        env.STUDIO_OPENAI_GLOBAL_DAILY_REQUEST_LIMIT,
        DEFAULT_GLOBAL_DAILY_REQUEST_LIMIT,
        1,
        20_000,
      ),
    },
  };
}

function hashActorKey(rawActor: string): string {
  return createHash("sha256")
    .update(`toonstudio-openai-assist:${rawActor}`)
    .digest("hex")
    .slice(0, 32);
}

interface ActorWindowState {
  minuteTimestamps: number[];
  hourTimestamps: number[];
  utcDay: string;
  dayCount: number;
}

export interface RateLimitReservation {
  readonly remainingDaily: number;
  readonly release: () => void;
}

function removeSingleTimestamp(list: number[], target: number): void {
  const index = list.lastIndexOf(target);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

/**
 * 메모리 상한(MAX_TRACKED_ACTOR_BUCKETS)과 날짜 전환 시 만료 버킷 자동 정리를 보장하는
 * 서버 전용 슬라이딩 윈도우 호출 제한기.
 *
 * 일시적 네트워크 오류·타임아웃·클라이언트 취소·업스트림 5xx/스키마 불일치 시에는
 * `release()`로 예약 슬롯을 되돌려 재시도 한도가 부당하게 소진되지 않게 한다.
 * 슬롯 반환은 앱의 호출 횟수만 복원하며, 제공자 사용료의 취소·환불을 의미하지 않는다.
 */
export class StudioOpenAiRateLimiter {
  private readonly actorWindows = new Map<string, ActorWindowState>();
  private globalUtcDay = "";
  private globalDayCount = 0;

  constructor(private readonly maxActorBuckets = MAX_TRACKED_ACTOR_BUCKETS) {}

  get trackedActorCount(): number {
    return this.actorWindows.size;
  }

  private sweepExpiredBuckets(utcDay: string, nowMs: number): void {
    for (const [key, state] of this.actorWindows) {
      const hasRecentHour = state.hourTimestamps.some((ts) => nowMs - ts < 3_600_000);
      if (state.utcDay !== utcDay && !hasRecentHour) {
        this.actorWindows.delete(key);
      }
    }
  }

  consume(
    actorIdentifier: string,
    limits: StudioOpenAiCreativeConfig["limits"],
    nowMs = Date.now(),
  ): RateLimitReservation {
    const utcDay = new Date(nowMs).toISOString().slice(0, 10);
    if (this.globalUtcDay !== utcDay) {
      this.globalUtcDay = utcDay;
      this.globalDayCount = 0;
      this.sweepExpiredBuckets(utcDay, nowMs);
    }

    if (this.globalDayCount >= limits.globalDailyRequests) {
      throw new HttpException(
        {
          code: "OPENAI_ASSIST_DAILY_LIMIT_REACHED",
          message:
            "오늘 사용할 수 있는 OpenAI 보조 요청 횟수에 도달했어요. 설정된 호출 한도를 넘지 않도록 중단했으며, 다음 일일 집계 구간에 다시 사용할 수 있어요.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const actorHash = hashActorKey(actorIdentifier);
    const existing = this.actorWindows.get(actorHash) ?? {
      minuteTimestamps: [],
      hourTimestamps: [],
      utcDay,
      dayCount: 0,
    };

    if (existing.utcDay !== utcDay) {
      existing.utcDay = utcDay;
      existing.dayCount = 0;
    }
    existing.minuteTimestamps = existing.minuteTimestamps.filter((ts) => nowMs - ts < 60_000);
    existing.hourTimestamps = existing.hourTimestamps.filter((ts) => nowMs - ts < 3_600_000);

    if (existing.minuteTimestamps.length >= limits.burstPerMinute) {
      throw new HttpException(
        {
          code: "OPENAI_ASSIST_RATE_LIMITED",
          message: "요청이 짧은 시간에 몰렸어요. 1분 정도 기다린 뒤 다시 눌러 주세요.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (existing.hourTimestamps.length >= limits.hourlyRequests) {
      throw new HttpException(
        {
          code: "OPENAI_ASSIST_HOURLY_LIMIT_REACHED",
          message: `한 시간 동안 최대 ${limits.hourlyRequests}번까지 요청할 수 있어요. 잠시 뒤 다시 시도해 주세요.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (existing.dayCount >= limits.dailyRequests) {
      throw new HttpException(
        {
          code: "OPENAI_ASSIST_USER_DAILY_LIMIT_REACHED",
          message: `하루 요청 한도(${limits.dailyRequests}회)를 모두 사용했어요. 내일 다시 이용해 주세요.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.minuteTimestamps.push(nowMs);
    existing.hourTimestamps.push(nowMs);
    existing.dayCount += 1;

    // LRU 순서 갱신 후 상한 초과 시 가장 오래된 버킷부터 제거
    this.actorWindows.delete(actorHash);
    this.actorWindows.set(actorHash, existing);
    while (this.actorWindows.size > this.maxActorBuckets) {
      const oldestKey = this.actorWindows.keys().next().value;
      if (!oldestKey) break;
      this.actorWindows.delete(oldestKey);
    }

    this.globalDayCount += 1;
    let released = false;

    return {
      remainingDaily: Math.max(0, limits.dailyRequests - existing.dayCount),
      release: () => {
        if (released) return;
        released = true;
        removeSingleTimestamp(existing.minuteTimestamps, nowMs);
        removeSingleTimestamp(existing.hourTimestamps, nowMs);
        if (existing.utcDay === utcDay && existing.dayCount > 0) {
          existing.dayCount -= 1;
        }
        if (this.globalUtcDay === utcDay && this.globalDayCount > 0) {
          this.globalDayCount -= 1;
        }
      },
    };
  }
}
