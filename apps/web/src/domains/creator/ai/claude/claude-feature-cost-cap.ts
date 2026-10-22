/**
 * 구조화 출력을 쓰는 Claude 보조 기능들의 비용 상한(USD) 계산 — 요청 틀은 `claude-cost-cap`에, 이 기능들만의 보탬(스키마·이미지 크기)은 여기에 둔다.
 *
 * 실행 전 확인(preflight)과 실제 실행이 **같은 함수**로 같은 요청을 재므로 화면에 보인 "최대 비용"과 예산 판정에 쓰인 값이 어긋나지 않는다.
 * 이미지 본문(base64)은 글자 수로 세지 않고 크기로 센다 — 그래서 본문을 비운 요청으로 미리 계산해도 실행 때와 값이 같다.
 */
import { z } from "zod";

import { claudeImageTokenBound, estimateClaudeRequestCostCapUsd, utf8Length } from "@/shared/ai/claude/claude-cost-cap";

import type Anthropic from "@anthropic-ai/sdk";

const schemaTokenCache = new WeakMap<object, number>();
const FALLBACK_SCHEMA_TOKENS = 2_500;

/**
 * 구조화 출력 스키마가 프롬프트에 덧붙는 입력 토큰의 상한. 스키마를 JSON으로 바꾼 글의 UTF-8 바이트 수를 쓴다
 * (토큰은 바이트보다 많을 수 없다). 바꾸지 못하는 스키마는 넉넉한 고정값을 쓴다.
 */
export function claudeSchemaTokenBound(schema: z.ZodType): number {
  const cached = schemaTokenCache.get(schema);
  if (cached !== undefined) return cached;
  let tokens = FALLBACK_SCHEMA_TOKENS;
  try {
    tokens = utf8Length(JSON.stringify(z.toJSONSchema(schema)));
  } catch {
    // 바꿀 수 없는 스키마는 고정값을 쓴다.
  }
  schemaTokenCache.set(schema, tokens);
  return tokens;
}

export interface FeatureCostCapInput {
  readonly model: string;
  readonly request: Pick<Anthropic.MessageCreateParamsNonStreaming, "system" | "messages" | "output_config" | "max_tokens">;
  readonly schema: z.ZodType;
  /** 요청에 이미지가 하나 들어 있으면 그 크기. 크기가 이상하면 null을 돌려준다. */
  readonly image?: { readonly width: number; readonly height: number };
}

/** 구조화 출력 요청 한 번이 낼 수 있는 비용의 상한(USD). 단가를 모르는 모델이거나 이미지 크기가 이상하면 null. */
export function estimateStructuredCostCapUsd({ model, request, schema, image }: FeatureCostCapInput): number | null {
  if (image && !(image.width > 0 && image.height > 0)) return null;
  return estimateClaudeRequestCostCapUsd(model, request, {
    extraInputTokens: claudeSchemaTokenBound(schema),
    ...(image ? { imageTokens: [claudeImageTokenBound(image.width, image.height)] } : {}),
  });
}
