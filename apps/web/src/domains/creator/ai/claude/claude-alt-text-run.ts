/**
 * AI 대체 텍스트 실행 — 요청 생성 → Claude 구조화 출력 호출 → 검증을 한 번에 묶는다.
 *
 * 전송·사용량 기록·거절/잘림 처리는 `claudeParse`가 맡는다. 자동 재시도·모델 대체는 없다 — 실패하면 사유를 그대로 올리고
 * 사용자가 다시 누른다.
 */
import { claudeModelInfo, estimateClaudeCostUsd, type ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import { resolveClaudeRequestModel } from "@/shared/ai/claude/claude-protocol";
import { claudeParse } from "@/shared/ai/claude/claude-transport";
import { toClaudeTokenUsage } from "@/shared/ai/claude/claude-usage-meter";

import {
  AltTextSchema,
  buildAltTextRequest,
  normalizeAltText,
  type AltTextContext,
  type AltTextView,
} from "./claude-alt-text";

import type { ArtDirectorImageInput } from "./claude-art-director";
import type { ClaudeRoute } from "@/shared/ai/claude/claude-route";

export { estimateAltTextCostCapUsd } from "./claude-alt-text";

export interface AltTextRunResult {
  readonly view: AltTextView;
  /** 요청한 범위. 결과를 화면에 올릴 때 어떤 칸을 보일지 정한다. */
  readonly scope: AltTextContext["scope"];
  /** 실제로 응답한 모델. 요청한 모델과 날짜 접미사만 다를 수 있다. */
  readonly model: string;
  readonly usage: ClaudeTokenUsage;
  /** 공개 가격표 기준 추정 비용. 단가를 모르는 모델이면 null. */
  readonly estimatedUsd: number | null;
}

export interface AltTextRunOptions {
  /** 비우면 연결의 기본 모델을 쓴다. */
  readonly model?: string;
  readonly signal?: AbortSignal;
}

export async function runAltText(
  route: Pick<ClaudeRoute, "apiKey" | "revision" | "model">,
  image: ArtDirectorImageInput,
  context: AltTextContext,
  options: AltTextRunOptions = {},
): Promise<AltTextRunResult> {
  const requested = resolveClaudeRequestModel(options.model, route.model);
  const { message, parsed } = await claudeParse(
    route,
    buildAltTextRequest(requested, image, context),
    AltTextSchema,
    { signal: options.signal },
  );
  const model = message.model || requested;
  const usage = toClaudeTokenUsage(message.usage);
  return {
    view: normalizeAltText(parsed, context.scope),
    scope: context.scope,
    model: claudeModelInfo(model)?.id ?? model,
    usage,
    estimatedUsd: estimateClaudeCostUsd(model, usage)?.usd ?? null,
  };
}
