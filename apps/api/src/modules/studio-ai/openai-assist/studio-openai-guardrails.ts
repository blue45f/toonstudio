import { createHash } from "node:crypto";

import { HttpException, HttpStatus } from "@nestjs/common";

export type EnvLike = Partial<Record<string, string | undefined>>;

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const ALLOWED_OPENAI_MODELS = new Set([
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
]);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BURST_LIMIT_PER_MINUTE = 5;
const DEFAULT_HOURLY_REQUEST_LIMIT = 20;
const DEFAULT_DAILY_REQUEST_LIMIT = 60;
const DEFAULT_GLOBAL_DAILY_REQUEST_LIMIT = 300;
const MAX_TRACKED_ACTOR_BUCKETS = 1_024;

const ORG_ID_PATTERN = /^org-[A-Za-z0-9_-]{4,80}$/u;
const PROJECT_ID_PATTERN = /^proj_[A-Za-z0-9_-]{4,80}$/u;

// 모듈 로드 시 1회 컴파일해 요청당 정규식 재생성 비용을 없앤다.
const SECRET_KEY_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{20,})\b/gu;
const RESIDENT_ID_PATTERN = /\b\d{6}-?[1-4]\d{6}\b/gu;
const CARD_NUMBER_PATTERN = /\b(?:\d{4}[-\s]){3}\d{4}\b/gu;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu;
const PHONE_PATTERN = /\b01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/gu;

export interface StudioOpenAiCreativeConfig {
  readonly configured: boolean;
  readonly apiKey: string;
  readonly model: string;
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
  const model = ALLOWED_OPENAI_MODELS.has(rawModel) ? rawModel : DEFAULT_OPENAI_MODEL;
  const rawOrg = env.OPENAI_ORG_ID?.trim() ?? "";
  const rawProject = env.OPENAI_PROJECT_ID?.trim() ?? "";

  return {
    configured: apiKey.length > 0,
    apiKey,
    model,
    organizationId: ORG_ID_PATTERN.test(rawOrg) ? rawOrg : null,
    projectId: PROJECT_ID_PATTERN.test(rawProject) ? rawProject : null,
    timeoutMs: parsePositiveLimit(env.STUDIO_OPENAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 5_000, 60_000),
    limits: {
      burstPerMinute: DEFAULT_BURST_LIMIT_PER_MINUTE,
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

export interface RedactedCreatorText {
  readonly sanitizedText: string;
  readonly redactedCount: number;
}

/**
 * 외부 AI 전송 전 원고·메모에 섞여 들어간 개인정보(이메일, 전화번호, 주민등록번호, 카드번호)와
 * 실수로 붙여 넣은 API 키 문자열을 마스킹한다.
 */
export function redactCreatorSensitiveText(raw: string): RedactedCreatorText {
  let redactedCount = 0;
  const replaceCounted = (input: string, pattern: RegExp, token: string): string =>
    input.replace(pattern, () => {
      redactedCount += 1;
      return token;
    });

  let current = raw;
  current = replaceCounted(current, SECRET_KEY_PATTERN, "[비밀키 마스킹됨]");
  current = replaceCounted(current, RESIDENT_ID_PATTERN, "[주민번호 비공개]");
  current = replaceCounted(current, CARD_NUMBER_PATTERN, "[카드번호 비공개]");
  current = replaceCounted(current, EMAIL_PATTERN, "[이메일 비공개]");
  current = replaceCounted(current, PHONE_PATTERN, "[연락처 비공개]");

  return {
    sanitizedText: current,
    redactedCount,
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

/**
 * 메모리 상한(MAX_TRACKED_ACTOR_BUCKETS)과 날짜 전환 시 만료 버킷 자동 정리를 보장하는
 * 서버 전용 슬라이딩 윈도우 호출 제한기.
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
  ): { readonly remainingDaily: number } {
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
            "오늘 사용할 수 있는 OpenAI 보조 요청 한도에 도달했어요. 추가 과금을 막기 위해 자동으로 멈췄으며, 내일 다시 사용할 수 있어요.",
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
    return {
      remainingDaily: Math.max(0, limits.dailyRequests - existing.dayCount),
    };
  }
}
