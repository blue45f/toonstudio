/**
 * 이번 브라우저 세션의 Claude 사용량·추정 비용 미터.
 *
 * 사용자 결제 BYOK 경로는 비용이 사용자 Anthropic 계정에 청구되므로, 호출마다 토큰과 추정
 * 비용을 보여 줄 수 있어야 한다(비용·모델 표시 원칙). 프롬프트·응답·키는 저장하지 않으며
 * 메모리에만 두고 새로고침하면 사라진다. 추정은 공개 가격표 기준이고 실제 청구는 콘솔이 기준이다.
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
}

const EMPTY: ClaudeUsageSnapshot = Object.freeze({
  requests: 0,
  usage: EMPTY_CLAUDE_TOKEN_USAGE,
  estimatedUsd: 0,
  unpricedRequests: 0,
  byModel: Object.freeze({}),
});

let snapshot: ClaudeUsageSnapshot = EMPTY;
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

export const getClaudeUsageSnapshot = (): ClaudeUsageSnapshot => snapshot;

export function subscribeClaudeUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetClaudeUsage(): void {
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
