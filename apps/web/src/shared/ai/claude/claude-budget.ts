/**
 * 세션 예산 가드 — 사용자 결제 키로 나가는 Claude 요청의 누적 추정 비용에 상한을 거는 순수 로직과 작은 저장소.
 *
 * 원칙
 * - 한도는 **사용자가 정한 값 하나**(USD)다. 앱이 한도를 대신 정하거나 모델을 몰래 낮추지 않는다.
 * - 판정은 "이번 세션에 이미 쓴 추정 비용 + 이번 요청의 비용 상한"과 한도의 비교다. 요청 비용 상한은 `max_tokens`가 하드
 *   상한이라 실제 비용은 그보다 클 수 없다(입력 토큰 추정 오차만 있다).
 * - 넘을 수 있어도 막지 않고 알린다. 사용자가 "이번 한 번만" 진행을 직접 고를 수 있다(차단이 아니라 확인).
 * - 한도 값만 이 브라우저에 저장한다(키·프롬프트·응답은 저장하지 않는다). 저장소를 쓸 수 없으면 메모리에만 둔다.
 * - 다른 탭이 한도를 바꾸면 `storage` 이벤트로 따라간다. 읽을 수 없는 값이 오면 이전 한도를 그대로 둔다(한도가 사라진 것으로 보지 않는다).
 * - 모듈을 불러올 때는 아무것도 읽지 않는다. 처음 쓰일 때 저장값을 읽고 `storage` 수신을 시작한다.
 */
import { useSyncExternalStore } from "react";

export const CLAUDE_BUDGET_STORAGE_KEY = "toonstudio:claude-budget:v1";
export const CLAUDE_BUDGET_MAX_USD = 1_000;

export type ClaudeBudgetVerdict =
  /** 한도를 정하지 않았다. */
  | { readonly kind: "no-limit" }
  /** 이번 요청을 더해도 한도 안이다. */
  | { readonly kind: "within"; readonly remainingUsd: number }
  /** 이번 요청의 비용 상한까지 쓰면 한도를 넘을 수 있다. */
  | { readonly kind: "exceeds"; readonly remainingUsd: number; readonly capUsd: number }
  /** 한도가 있는데 이번 모델의 단가를 몰라 비용을 가늠할 수 없다. */
  | { readonly kind: "unknown-cost"; readonly remainingUsd: number };

/** 센트 단위로 반올림한 안전한 한도 값. 0 이하·비정상·상한 초과는 null(한도 없음)이 아니라 "거절"을 뜻하도록 호출자가 검사한다. */
export function normalizeClaudeBudgetLimit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  if (cents <= 0 || cents > CLAUDE_BUDGET_MAX_USD * 100) return null;
  return cents / 100;
}

/** 부동소수 누적 오차가 판정에 끼지 않도록 센트 단위 정수로 비교한다. */
export function evaluateClaudeBudget(
  limitUsd: number | null,
  spentUsd: number,
  capUsd: number | null,
): ClaudeBudgetVerdict {
  if (limitUsd === null) return { kind: "no-limit" };
  // 비정상 값(NaN·무한대·0 이하 한도)은 통과시키지 않고 확인을 요구한다. 호출자가 정상 값만 넘기면 닿지 않는 방어선이다.
  if (!Number.isFinite(limitUsd) || limitUsd <= 0 || !Number.isFinite(spentUsd)) {
    return { kind: "unknown-cost", remainingUsd: 0 };
  }
  const limitCents = Math.round(limitUsd * 100);
  const spentCents = Math.max(0, Math.ceil(spentUsd * 100 - 1e-9));
  const remainingUsd = Math.max(0, limitCents - spentCents) / 100;
  if (capUsd === null || !Number.isFinite(capUsd) || capUsd < 0) return { kind: "unknown-cost", remainingUsd };
  const capCents = Math.max(0, Math.ceil(capUsd * 100 - 1e-9));
  return spentCents + capCents > limitCents
    ? { kind: "exceeds", remainingUsd, capUsd }
    : { kind: "within", remainingUsd };
}

/** 예산 진행률(0~100, 정수). 한도가 없거나 비정상이면 null. */
export function claudeBudgetPercent(limitUsd: number | null, spentUsd: number): number | null {
  if (limitUsd === null || !(limitUsd > 0)) return null;
  return Math.min(100, Math.max(0, Math.round((spentUsd / limitUsd) * 100)));
}

interface BudgetState {
  readonly limitUsd: number | null;
}

/** 저장값을 한도로 읽는다. 값이 없으면 null(한도 없음), 읽을 수 없거나 범위 밖이면 undefined(판단 보류). */
function parseStoredLimit(raw: string | null): number | null | undefined {
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const limit = typeof parsed === "object" && parsed !== null ? (parsed as { limitUsd?: unknown }).limitUsd : undefined;
    return normalizeClaudeBudgetLimit(limit) ?? undefined;
  } catch {
    return undefined;
  }
}

function readStoredLimit(): number | null {
  try {
    return parseStoredLimit(globalThis.localStorage?.getItem(CLAUDE_BUDGET_STORAGE_KEY) ?? null) ?? null;
  } catch {
    return null;
  }
}

let state: BudgetState = { limitUsd: null };
let initialized = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** 다른 탭에서 한도가 바뀌면 따라간다. 키가 null이면 저장소 전체가 비워진 것이다. */
function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== null && event.key !== CLAUDE_BUDGET_STORAGE_KEY) return;
  let local: Storage | undefined;
  try {
    local = globalThis.localStorage;
  } catch {
    local = undefined;
  }
  if (event.storageArea && local && event.storageArea !== local) return;
  const next = parseStoredLimit(event.key === null ? null : event.newValue);
  if (next === undefined || next === state.limitUsd) return;
  state = { limitUsd: next };
  notify();
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  state = { limitUsd: readStoredLimit() };
  if (typeof window !== "undefined") window.addEventListener("storage", handleStorageEvent);
}

export function getClaudeBudget(): BudgetState {
  ensureInitialized();
  return state;
}

export function subscribeClaudeBudget(listener: () => void): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 한도를 바꾼다. null이면 한도를 지운다. 정상 범위 밖의 값은 거절하고 false를 돌려준다. */
export function setClaudeBudgetLimit(limitUsd: number | null): boolean {
  ensureInitialized();
  const next = limitUsd === null ? null : normalizeClaudeBudgetLimit(limitUsd);
  if (limitUsd !== null && next === null) return false;
  state = { limitUsd: next };
  try {
    if (next === null) globalThis.localStorage?.removeItem(CLAUDE_BUDGET_STORAGE_KEY);
    else globalThis.localStorage?.setItem(CLAUDE_BUDGET_STORAGE_KEY, JSON.stringify({ limitUsd: next }));
  } catch {
    // 저장소를 쓸 수 없어도 이번 세션의 한도는 메모리에서 유효하다.
  }
  notify();
  return true;
}

export function useClaudeBudget(): BudgetState {
  return useSyncExternalStore(subscribeClaudeBudget, getClaudeBudget, getClaudeBudget);
}

/** 시험에서 저장소와 메모리를 함께 비운다. */
export function resetClaudeBudgetForTests(): void {
  ensureInitialized();
  try {
    globalThis.localStorage?.removeItem(CLAUDE_BUDGET_STORAGE_KEY);
  } catch {
    // 무시한다.
  }
  state = { limitUsd: null };
  notify();
}
