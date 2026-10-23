/**
 * AI 아트 디렉터 실행 — 요청 생성 → Claude 구조화 출력 호출 → 정규화를 한 번에 묶는다.
 *
 * 전송·사용량 기록·거절/잘림 처리는 `claudeParse`가 맡고, 이 모듈은 결과를 화면에 올릴 값으로 바꾼다.
 * 자동 재시도·모델 대체는 없다 — 실패하면 사유를 그대로 올리고 사용자가 다시 누른다.
 */
import { claudeModelInfo, estimateClaudeCostUsd, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";

import {
  ArtDirectorReviewSchema,
  buildArtDirectorRequest,
  estimateArtDirectorCostCapUsd,
  normalizeArtDirectorReview,
  type ArtDirectorContext,
  type ArtDirectorImageInput,
  type ArtDirectorReview,
} from "./claude-art-director";

import type { ClaudeRoute } from "@/shared/ai/claude/claude-route";

export interface ArtDirectorRunResult {
  readonly review: ArtDirectorReview;
  /** 실제로 응답한 모델. 요청한 모델과 날짜 접미사만 다를 수 있다. */
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  /** 공개 가격표 기준 추정 비용. 단가를 모르는 모델이면 null. */
  readonly estimatedUsd: number | null;
}

export interface ArtDirectorRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly signal?: AbortSignal;
  /** 사용자가 "이번 한 번만 예산을 넘어도 진행"을 직접 고른 요청이면 true. 전송 계층의 예산 판정을 건너뛴다. */
  readonly budgetOverride?: boolean;
}

export async function runArtDirectorReview(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  image: ArtDirectorImageInput,
  context: ArtDirectorContext,
  options: ArtDirectorRunOptions = {},
): Promise<ArtDirectorRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const { message, parsed } = await claudeParse(
    route,
    buildArtDirectorRequest(requested, image, context),
    ArtDirectorReviewSchema,
    {
      signal: options.signal,
      // 실행 전 확인에 보인 값과 같은 함수로 잰 상한이다. 전송 계층이 예산 판정과 진행 중 예약에 쓴다.
      capUsd: estimateArtDirectorCostCapUsd(requested, image, context),
      budgetOverride: options.budgetOverride,
    },
  );
  const model = message.model || requested;
  const usage = toClaudeTokenUsage(message.usage);
  return {
    review: normalizeArtDirectorReview(parsed, image),
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null,
  };
}
