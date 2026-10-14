/**
 * 사용량 쿼터 표시 모델 — 챗·AI 생성 표면 공통.
 *
 * 문제(투닝 흡수 대조, 2026-10-14): 상한은 코드 곳곳에 있는데 사용자가
 * 행동하기 전에 볼 수 있는 곳이 없었다.
 * - 캐릭터 챗: 프로필당 월 300회 상한 상수(`CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP`)가
 *   엔진 파일 주석에만 있고, 스토어 사용량 계측(`usageByProfile`)은 작가 요약 전용이었다.
 * - 무료 AI 경로: 일 25회·예약 토큰 64,000 안전 한도(`free-ai-runtime-budget`)가
 *   요청을 던진 뒤에야 에러 문구로만 드러났다. 스냅샷 함수
 *   (`getFreeAiRuntimeBudgetSnapshot`)는 이미 있으나 표면에 연결되지 않았다.
 *
 * 이 모듈은 "숫자를 아는 곳"과 "보여주는 곳"을 잇는 순수 표시 모델이다.
 * - 상한을 새로 만들지 않는다. 기존 상수·스냅샷을 입력으로 받아
 *   잔여·비율·상태·문구를 계산만 한다 (강제는 기존 가드/서버가 담당).
 * - 상한이 없는 경로(BYOK 자기 키)는 숫자를 지어내지 않고 `unlimited`로
 *   정직하게 표시한다. 모르는 값은 `unknown`이다.
 * - 문구는 전부 여기서 만든다 — 표면은 상태만 보고 그리면 되고,
 *   상한 도달 안내(초기화 시점 + 대안 행동)가 표면마다 갈라지지 않는다.
 */

import type { FreeAiRuntimeBudgetSnapshot } from "./free-ai-runtime-budget";

/** 쿼터가 다시 차는 주기. */
export type UsageQuotaPeriod = "day" | "month";

/** 이 쿼터가 어느 표면·경로의 것인지 — 문구와 대안 행동을 가른다. */
export type UsageQuotaScope =
  /** 캐릭터 챗, 프로필당 월 상한 (플랫폼 경로 기준값). */
  | "character-chat-monthly"
  /** 앱이 관리하는 무료 AI 경로의 일일 안전 한도. */
  | "managed-free-daily"
  /** AI 이미지·텍스트 생성 등 범용 일일 상한. */
  | "ai-generation-daily";

/** 쿼터 원본 값 — 상한을 아는 곳(엔진·가드·서버 상태)이 채운다. */
export interface UsageQuotaInput {
  readonly scope: UsageQuotaScope;
  /** 지금까지 쓴 횟수. 음수·비유한수는 0으로 정규화한다. */
  readonly used: number;
  /** 상한. null이면 상한 없음(예: BYOK 자기 키) — 숫자를 만들지 않는다. */
  readonly limit: number | null;
  readonly period: UsageQuotaPeriod;
  /** 다시 차는 시각(epoch ms). 모르면 null — 문구에서 시점을 생략한다. */
  readonly resetsAt: number | null;
  /** 제공자·가드가 이미 막은 상태인지 (rate-limit 등). */
  readonly blocked?: boolean;
}

/**
 * 표시 상태.
 * - plenty: 여유 — 숫자만 조용히 보여준다.
 * - low: 절반 이하로 남음 — 눈에 띄게.
 * - critical: 90% 이상 사용 또는 3회 이하 — 행동 전에 경고.
 * - exhausted: 상한 도달 — 전송을 막고 안내를 띄운다.
 * - unlimited: 상한 없는 경로 — "내 키 사용"처럼 정직하게만 알린다.
 * - unknown: 값을 모름 — 표시하지 않는 것이 기본이다.
 */
export type UsageQuotaState =
  | "plenty"
  | "low"
  | "critical"
  | "exhausted"
  | "unlimited"
  | "unknown";

export interface UsageQuotaCopy {
  /** 한 줄 요약 — 예: "이번 달 대화 12/300회 · 288회 남음". */
  readonly headline: string;
  /** 상태별 보조 문구. plenty·unlimited에서는 짧고, exhausted에서는 대안 행동까지. */
  readonly detail: string;
  /** 스크린리더용 전체 설명. */
  readonly ariaLabel: string;
}

export interface UsageQuotaView {
  readonly scope: UsageQuotaScope;
  readonly state: UsageQuotaState;
  readonly used: number;
  readonly limit: number | null;
  /** 남은 횟수. 상한이 없거나 모르면 null. */
  readonly remaining: number | null;
  /** 사용 비율 0..1. 상한이 없거나 모르면 null. */
  readonly usedRatio: number | null;
  readonly period: UsageQuotaPeriod;
  readonly resetsAt: number | null;
  /** 지금 행동(전송·생성)을 해도 되는지 — exhausted·unknown이면 false. */
  readonly canProceed: boolean;
  readonly copy: { readonly ko: UsageQuotaCopy; readonly en: UsageQuotaCopy };
}

/** 잔여 비율이 이 값 이하로 떨어지면 low. */
export const USAGE_QUOTA_LOW_REMAINING_RATIO = 0.5;
/** 사용 비율이 이 값 이상이면 critical. 잔여 절대값 기준과 함께 본다. */
export const USAGE_QUOTA_CRITICAL_USED_RATIO = 0.9;
/** 남은 횟수가 이 값 이하면 비율과 무관하게 critical. */
export const USAGE_QUOTA_CRITICAL_REMAINING_COUNT = 3;

function cleanCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function cleanLimit(value: number | null): number | null {
  if (value === null) return null;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

const SCOPE_NOUN: Record<UsageQuotaScope, { readonly ko: string; readonly en: string }> = {
  "character-chat-monthly": { ko: "대화", en: "messages" },
  "managed-free-daily": { ko: "무료 AI 요청", en: "free AI requests" },
  "ai-generation-daily": { ko: "AI 생성", en: "AI generations" },
};

function periodLabel(period: UsageQuotaPeriod, locale: "ko" | "en"): string {
  if (locale === "ko") return period === "day" ? "오늘" : "이번 달";
  return period === "day" ? "Today" : "This month";
}

function resetLabel(resetsAt: number | null, locale: "ko" | "en"): string | null {
  if (resetsAt === null || !Number.isFinite(resetsAt)) return null;
  const when = new Date(resetsAt).toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return locale === "ko" ? `${when}에 다시 열려요` : `Resets ${when}`;
}

/**
 * 상한 도달 시 대안 행동 — 막힌 이유만 말하고 끝내지 않는다.
 * 수익화 유도 문구는 넣지 않는다(사용성 항목). 대안은 전부 무료 동선이다.
 */
function exhaustedDetail(
  input: UsageQuotaInput,
  locale: "ko" | "en",
): string {
  const reset = resetLabel(input.resetsAt, locale);
  if (input.scope === "character-chat-monthly") {
    return locale === "ko"
      ? `이 캐릭터와의 이번 달 대화 상한에 도달했어요.${reset ? ` ${reset}.` : " 다음 달에 다시 열려요."} 다른 캐릭터와는 계속 대화할 수 있고, 내 AI 키를 등록하면(BYOK) 이 상한 없이 쓸 수 있어요.`
      : `You've reached this character's monthly message limit.${reset ? ` ${reset}.` : " It reopens next month."} You can still chat with other characters, and registering your own AI key (BYOK) removes this cap.`;
  }
  if (input.scope === "managed-free-daily") {
    return locale === "ko"
      ? `오늘의 무료 사용 안전 한도에 도달했어요.${reset ? ` ${reset}.` : " 한국 시간 오전 9시(UTC 자정)에 초기화돼요."} 기다리기 어렵다면 내 AI 키를 등록해 계속 쓸 수 있어요. 유료 모델로 자동 전환되지는 않아요.`
      : `You've reached today's free-usage safety limit.${reset ? ` ${reset}.` : " It resets at UTC midnight."} You can keep going by registering your own AI key. Nothing switches to a paid model automatically.`;
  }
  return locale === "ko"
    ? `오늘의 AI 생성 상한에 도달했어요.${reset ? ` ${reset}.` : " 내일 다시 열려요."} 만든 결과물은 그대로 남아 있으니, 그동안 편집·정리 작업을 이어갈 수 있어요.`
    : `You've reached today's AI generation limit.${reset ? ` ${reset}.` : " It reopens tomorrow."} Your existing results are untouched, so you can keep editing in the meantime.`;
}

function buildCopy(
  input: UsageQuotaInput,
  state: UsageQuotaState,
  remaining: number | null,
  locale: "ko" | "en",
): UsageQuotaCopy {
  const noun = SCOPE_NOUN[input.scope][locale];
  const period = periodLabel(input.period, locale);
  const reset = resetLabel(input.resetsAt, locale);

  if (state === "unlimited") {
    return locale === "ko"
      ? {
          headline: "내 AI 키 사용 중 — 플랫폼 상한 없음",
          detail: "사용량은 등록한 키의 제공자 정책을 따라요.",
          ariaLabel: "사용량 상한 없음. 내 AI 키로 동작합니다.",
        }
      : {
          headline: "Using your own AI key — no platform cap",
          detail: "Usage follows your key provider's policy.",
          ariaLabel: "No usage cap. Running on your own AI key.",
        };
  }
  if (state === "unknown") {
    return locale === "ko"
      ? { headline: "", detail: "", ariaLabel: "" }
      : { headline: "", detail: "", ariaLabel: "" };
  }

  const limit = input.limit ?? 0;
  const headline =
    locale === "ko"
      ? `${period} ${noun} ${input.used}/${limit}회 · ${remaining ?? 0}회 남음`
      : `${period}: ${input.used}/${limit} ${noun} · ${remaining ?? 0} left`;

  if (state === "exhausted") {
    return { headline, detail: exhaustedDetail(input, locale), ariaLabel: `${headline}. ${exhaustedDetail(input, locale)}` };
  }
  if (state === "critical") {
    const detail =
      locale === "ko"
        ? `거의 다 썼어요.${reset ? ` ${reset}.` : ""} 긴 작업은 나눠서 진행해 주세요.`
        : `Almost out.${reset ? ` ${reset}.` : ""} Consider splitting longer work.`;
    return { headline, detail, ariaLabel: `${headline}. ${detail}` };
  }
  if (state === "low") {
    const detail =
      locale === "ko"
        ? `절반 넘게 썼어요.${reset ? ` ${reset}.` : ""}`
        : `More than half used.${reset ? ` ${reset}.` : ""}`;
    return { headline, detail, ariaLabel: `${headline}. ${detail}` };
  }
  return { headline, detail: reset ?? "", ariaLabel: headline };
}

/** 원본 값 → 표시 모델. 순수 함수 — 같은 입력이면 같은 결과. */
export function buildUsageQuotaView(rawInput: UsageQuotaInput): UsageQuotaView {
  const used = cleanCount(rawInput.used);
  const limit = cleanLimit(rawInput.limit);
  const input: UsageQuotaInput = { ...rawInput, used, limit };

  if (limit === null) {
    // limit이 원래 null이면 상한 없음, 0 이하·비유한수로 들어오면 모름.
    const state: UsageQuotaState = rawInput.limit === null ? "unlimited" : "unknown";
    return {
      scope: rawInput.scope,
      state,
      used,
      limit: null,
      remaining: null,
      usedRatio: null,
      period: rawInput.period,
      resetsAt: rawInput.resetsAt,
      canProceed: state === "unlimited",
      copy: {
        ko: buildCopy(input, state, null, "ko"),
        en: buildCopy(input, state, null, "en"),
      },
    };
  }

  const remaining = Math.max(0, limit - used);
  const usedRatio = Math.min(1, used / limit);
  let state: UsageQuotaState;
  if (rawInput.blocked || remaining <= 0) state = "exhausted";
  else if (usedRatio >= USAGE_QUOTA_CRITICAL_USED_RATIO || remaining <= USAGE_QUOTA_CRITICAL_REMAINING_COUNT) state = "critical";
  else if (remaining / limit <= USAGE_QUOTA_LOW_REMAINING_RATIO) state = "low";
  else state = "plenty";

  return {
    scope: rawInput.scope,
    state,
    used,
    limit,
    remaining,
    usedRatio,
    period: rawInput.period,
    resetsAt: rawInput.resetsAt,
    canProceed: state !== "exhausted",
    copy: {
      ko: buildCopy(input, state, remaining, "ko"),
      en: buildCopy(input, state, remaining, "en"),
    },
  };
}

/**
 * 무료 AI 런타임 예산 스냅샷(`getFreeAiRuntimeBudgetSnapshot` 결과) → 표시 모델.
 * guarded가 아닌 연결(BYOK 등)은 상한 없음으로, 막힌 연결은 exhausted로 잇는다.
 */
export function usageQuotaFromFreeAiSnapshot(
  snapshot: FreeAiRuntimeBudgetSnapshot,
): UsageQuotaView {
  if (!snapshot.guarded || snapshot.requestLimit === null) {
    return buildUsageQuotaView({
      scope: "managed-free-daily",
      used: 0,
      limit: null,
      period: "day",
      resetsAt: null,
    });
  }
  return buildUsageQuotaView({
    scope: "managed-free-daily",
    used: snapshot.requests,
    limit: snapshot.requestLimit,
    period: "day",
    resetsAt: snapshot.resetsAt,
    blocked: snapshot.blockedReason !== null,
  });
}

/** 다음 주기 시작 시각 — 일일(UTC 자정)·월간(UTC 다음 달 1일) 경계. 서버의 UTC 사용일과 같은 기준이다. */
export function nextQuotaResetAt(period: UsageQuotaPeriod, now: number): number {
  const date = new Date(now);
  if (period === "day") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
