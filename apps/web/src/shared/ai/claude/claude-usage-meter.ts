/**
 * 이번 브라우저 세션의 Claude 사용량·추정 비용 미터.
 *
 * 사용자 결제 BYOK 경로는 비용이 사용자 Anthropic 계정에 청구되므로, 호출마다 토큰과 추정
 * 비용을 보여 줄 수 있어야 한다(비용·모델 표시 원칙). 프롬프트·응답·키는 저장하지 않으며
 * 메모리에만 두고 새로고침하면 사라진다. 추정은 공개 가격표 기준이고 실제 청구는 콘솔이 기준이다.
 *
 * 응답을 받은 요청은 실제 사용량으로 센다. 받지 못한 요청은 두 가지로 나눠 예산 판정에 보수적으로 반영한다.
 * - 진행 중(pending): 보낸 요청의 비용 상한을 예약해, 동시에 나가는 요청들이 한도를 함께 넘지 않게 한다.
 * - 확인되지 않음(unconfirmed): 본문을 보낸 뒤 중단·시간 초과·응답 처리 실패로 사용량을 받지 못한 요청. 서버가 이미 처리해 청구됐을
 *   수도, 아닐 수도 있어 표시용 추정 비용에는 넣지 않고 건수와 최대 비용을 따로 보여 주며 예산 판정에만 더한다.
 */
import { useSyncExternalStore } from "react";

import {
  addClaudeTokenUsage,
  EMPTY_CLAUDE_TOKEN_USAGE,
  estimateClaudeCostUsd,
  type ClaudeTokenUsage,
} from "./claude-models";

/** Anthropic `usage` 객체에서 이 미터가 읽는 필드만 구조적으로 받는다(SDK 타입 의존 없음). */
export interface ClaudeUsageLike {
  readonly input_tokens?: number | null;
  readonly output_tokens?: number | null;
  readonly cache_read_input_tokens?: number | null;
  readonly cache_creation_input_tokens?: number | null;
}

export interface ClaudeModelUsage {
  readonly requests: number;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number;
}

export interface ClaudeUsageSnapshot {
  readonly requests: number;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedUsd: number;
  /** 단가를 모르는 모델로 보낸 요청 수 — 이 요청들의 비용은 합계에 없다. */
  readonly unpricedRequests: number;
  readonly byModel: Readonly<Record<string, ClaudeModelUsage>>;
  /** 진행 중인 요청 수와, 그 요청들이 낼 수 있는 최대 비용 합계(예약). */
  readonly pendingRequests: number;
  readonly pendingUsd: number;
  /** 응답(사용량)을 받지 못하고 끝난 요청 수와, 그 요청들이 낼 수 있었던 최대 비용 합계. */
  readonly unconfirmedRequests: number;
  readonly unconfirmedUsd: number;
}

const EMPTY: ClaudeUsageSnapshot = Object.freeze({
  requests: 0,
  usage: EMPTY_CLAUDE_TOKEN_USAGE,
  estimatedUsd: 0,
  unpricedRequests: 0,
  byModel: Object.freeze({}),
  pendingRequests: 0,
  pendingUsd: 0,
  unconfirmedRequests: 0,
  unconfirmedUsd: 0,
});

let snapshot: ClaudeUsageSnapshot = EMPTY;
/** 미터를 비울 때마다 올라, 비우기 전에 시작한 요청의 정산이 새 집계를 건드리지 않게 한다. */
let epoch = 0;
const listeners = new Set<() => void>();

function tokens(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Anthropic `usage` 객체를 미터가 쓰는 토큰 집계로 바꾼다(없거나 음수·비정상 값은 0). */
export function toClaudeTokenUsage(usage: ClaudeUsageLike): ClaudeTokenUsage {
  return {
    inputTokens: tokens(usage.input_tokens),
    outputTokens: tokens(usage.output_tokens),
    cacheReadTokens: tokens(usage.cache_read_input_tokens),
    cacheWriteTokens: tokens(usage.cache_creation_input_tokens),
  };
}

export function recordClaudeUsage(model: string, usage: ClaudeUsageLike): void {
  const used = toClaudeTokenUsage(usage);
  const cost = estimateClaudeCostUsd(model, used);
  const key = model.trim().slice(0, 80) || "unknown";
  const previous = snapshot.byModel[key];
  snapshot = {
    ...snapshot,
    requests: snapshot.requests + 1,
    usage: addClaudeTokenUsage(snapshot.usage, used),
    estimatedUsd: snapshot.estimatedUsd + (cost?.usd ?? 0),
    unpricedRequests: snapshot.unpricedRequests + (cost ? 0 : 1),
    byModel: {
      ...snapshot.byModel,
      [key]: {
        requests: (previous?.requests ?? 0) + 1,
        usage: addClaudeTokenUsage(previous?.usage ?? EMPTY_CLAUDE_TOKEN_USAGE, used),
        estimatedUsd: (previous?.estimatedUsd ?? 0) + (cost?.usd ?? 0),
      },
    },
  };
  for (const listener of listeners) listener();
}

function finiteUsd(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export interface ClaudeRequestTicket {
  /** 응답을 받아 사용량이 기록됐거나, 보내지 못했거나, 서버가 오류로 거절해 청구되지 않았을 때 예약을 거둔다. */
  release(): void;
  /** 처리됐을 수 있는데 사용량을 받지 못했을 때 예약을 거두고 "확인되지 않은 요청"으로 센다. */
  markUnconfirmed(): void;
}

/** 요청을 보내기 전에 비용 상한(`capUsd`, 단가를 모르면 null)을 예약한다. 반드시 `release`나 `markUnconfirmed`로 정산한다. */
export function beginClaudeRequest(capUsd: number | null): ClaudeRequestTicket {
  const reserved = finiteUsd(capUsd);
  const startedEpoch = epoch;
  let settled = false;
  snapshot = { ...snapshot, pendingRequests: snapshot.pendingRequests + 1, pendingUsd: snapshot.pendingUsd + reserved };
  for (const listener of listeners) listener();

  const settle = (unconfirmed: boolean) => {
    if (settled) return;
    settled = true;
    if (startedEpoch !== epoch) return;
    const pendingRequests = Math.max(0, snapshot.pendingRequests - 1);
    snapshot = {
      ...snapshot,
      pendingRequests,
      // 부동소수 누적 오차가 남지 않도록 진행 중인 요청이 없으면 예약 금액을 정확히 0으로 되돌린다.
      pendingUsd: pendingRequests === 0 ? 0 : Math.max(0, snapshot.pendingUsd - reserved),
      unconfirmedRequests: snapshot.unconfirmedRequests + (unconfirmed ? 1 : 0),
      unconfirmedUsd: snapshot.unconfirmedUsd + (unconfirmed ? reserved : 0),
    };
    for (const listener of listeners) listener();
  };
  return { release: () => settle(false), markUnconfirmed: () => settle(true) };
}

/** 예산 판정에 쓰는 "이미 쓴 것으로 보는 비용": 받은 사용량 + 진행 중 예약 + 확인되지 않은 요청의 최대 비용. */
export function claudeBudgetSpentUsd(
  usage: Pick<ClaudeUsageSnapshot, "estimatedUsd" | "pendingUsd" | "unconfirmedUsd">,
): number {
  return usage.estimatedUsd + usage.pendingUsd + usage.unconfirmedUsd;
}

export const getClaudeUsageSnapshot = (): ClaudeUsageSnapshot => snapshot;

export function subscribeClaudeUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetClaudeUsage(): void {
  epoch += 1;
  snapshot = EMPTY;
  for (const listener of listeners) listener();
}

export function useClaudeUsage(): ClaudeUsageSnapshot {
  return useSyncExternalStore(subscribeClaudeUsage, getClaudeUsageSnapshot, getClaudeUsageSnapshot);
}

/** 화면 표기용. 센트 미만 비용도 0으로 보이지 않게 자릿수를 늘린다. */
export function formatClaudeUsd(usd: number): string {
  if (usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
