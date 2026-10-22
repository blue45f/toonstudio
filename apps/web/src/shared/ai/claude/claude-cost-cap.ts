/**
 * 요청 한 번이 낼 수 있는 비용의 상한(USD)을 보내기 전에 가늠한다. 순수 함수이고 SDK는 타입만 참조한다.
 *
 * 출력은 `max_tokens`가 하드 상한이라(사고 토큰 포함) 그만큼 썼다고 본다. 입력은 모자라게 어림하지 않도록 증명 가능한 쪽으로 센다.
 * - 글: 토큰 수 ≤ UTF-8 바이트 수. 토크나이저가 바이트 단위로 되돌아갈 수 있어서다. 2026-10-22에 `count_tokens`로 잰 실측은 바이트당
 *   0.33~0.62토큰(영어 0.35, 한글이 섞인 글 0.45~0.49, 일본어 0.33, 이모지 0.62)이라 상한으로 충분하다. 네 모델의 계수가 같았다.
 *   "글자당 1토큰 이하"는 한글에서 틀렸다(한글 음절은 약 1.4~1.6토큰).
 * - 이미지: 한 장당 `가로×세로÷750`이 공식식이고 실측도 그 이하였다(1568×1568 → 3,139토큰). 크기를 모르면 최대 크기로 본다.
 * - 캐시: `cache_control`이 붙은 블록까지의 앞부분은 첫 호출에서 캐시 쓰기(입력 단가의 1.25배)로 청구된다고 본다.
 * - 구조화 출력 스키마는 API가 프롬프트에 덧붙이므로 입력에 더한다.
 * 이 값은 "예상 최대"다. 실제 비용은 보통 이보다 훨씬 작고, 청구 기준은 Anthropic 콘솔이다.
 */
import { estimateClaudeCostUsd } from "./claude-models";

import type Anthropic from "@anthropic-ai/sdk";

/** 이미지 한 장이 쓸 수 있는 최대 토큰: 긴 변 1568px 제한이면 1568² ÷ 750 ≈ 3,279에 여유를 더했다. */
export const CLAUDE_IMAGE_TOKEN_BOUND = 3_500;
/** 역할 표시·메시지 틀 등 글이 아닌 부분의 여유 토큰. */
const FRAMING_TOKENS = 100;

export function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** 크기를 아는 이미지 한 장의 토큰 상한(공식식 + 5% 여유). 크기가 이상하면 최대값. */
export function claudeImageTokenBound(width: number, height: number): number {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width * height)) return CLAUDE_IMAGE_TOKEN_BOUND;
  return Math.min(CLAUDE_IMAGE_TOKEN_BOUND, Math.ceil((width * height) / 750 * 1.05) + 5);
}

export interface ClaudeCostCapExtras {
  /** 요청 밖에서 더해지는 입력 토큰. 예: Zod 스키마를 `output_config.format`으로 바꿀 때 프롬프트에 덧붙는 분량. */
  readonly extraInputTokens?: number;
  /** 요청의 이미지 블록 순서대로 준 토큰 상한. 모자라는 장은 `CLAUDE_IMAGE_TOKEN_BOUND`로 본다. */
  readonly imageTokens?: readonly number[];
}

interface Segment {
  readonly tokens: number;
  /** 이 블록에 `cache_control`이 붙었는가. 붙었으면 여기까지의 앞부분이 캐시 대상이다. */
  readonly marker: boolean;
}

function hasCacheControl(block: object): boolean {
  return (block as { cache_control?: unknown }).cache_control != null;
}

function blockSegment(block: unknown, nextImageTokens: () => number): Segment {
  if (typeof block === "string") return { tokens: utf8Length(block), marker: false };
  if (!block || typeof block !== "object") return { tokens: 0, marker: false };
  const record = block as { type?: unknown; text?: unknown };
  const marker = hasCacheControl(block);
  if (record.type === "text" && typeof record.text === "string") return { tokens: utf8Length(record.text), marker };
  if (record.type === "image") return { tokens: nextImageTokens(), marker };
  // 문서·도구 블록 등 이 앱이 보내지 않는 형태는 JSON 길이로 넉넉히 센다.
  return { tokens: utf8Length(JSON.stringify(block)), marker };
}

/** 입력 토큰의 상한을 (캐시 대상, 일반) 둘로 나눠 센다. */
export function estimateClaudeInputTokenBound(
  params: Pick<Anthropic.MessageCreateParamsNonStreaming, "system" | "messages" | "output_config">,
  extras: ClaudeCostCapExtras = {},
): { readonly plainTokens: number; readonly cachedTokens: number } {
  let imageIndex = 0;
  const nextImageTokens = () => extras.imageTokens?.[imageIndex++] ?? CLAUDE_IMAGE_TOKEN_BOUND;
  const segments: Segment[] = [];
  const { system, messages } = params;
  if (typeof system === "string") segments.push({ tokens: utf8Length(system), marker: false });
  else for (const block of system ?? []) segments.push(blockSegment(block, nextImageTokens));
  for (const message of messages) {
    if (typeof message.content === "string") segments.push({ tokens: utf8Length(message.content), marker: false });
    else for (const block of message.content) segments.push(blockSegment(block, nextImageTokens));
  }
  const lastMarker = segments.reduce((last, segment, index) => (segment.marker ? index : last), -1);
  const sum = (items: readonly Segment[]) => items.reduce((total, segment) => total + segment.tokens, 0);
  const schema = (params.output_config?.format as { schema?: unknown } | undefined)?.schema;
  const schemaTokens = schema === undefined ? 0 : utf8Length(JSON.stringify(schema));
  return {
    cachedTokens: sum(segments.slice(0, lastMarker + 1)),
    plainTokens: sum(segments.slice(lastMarker + 1)) + FRAMING_TOKENS + schemaTokens + Math.max(0, extras.extraInputTokens ?? 0),
  };
}

/** 이 요청이 낼 수 있는 비용의 상한(USD). 단가를 모르는 모델이거나 `max_tokens`가 비정상이면 null. */
export function estimateClaudeRequestCostCapUsd(
  model: string,
  params: Pick<Anthropic.MessageCreateParamsNonStreaming, "system" | "messages" | "output_config" | "max_tokens">,
  extras: ClaudeCostCapExtras = {},
): number | null {
  if (!Number.isFinite(params.max_tokens) || params.max_tokens <= 0) return null;
  const { plainTokens, cachedTokens } = estimateClaudeInputTokenBound(params, extras);
  const estimate = estimateClaudeCostUsd(model, {
    inputTokens: plainTokens,
    outputTokens: params.max_tokens,
    cacheReadTokens: 0,
    cacheWriteTokens: cachedTokens,
  });
  return estimate ? estimate.usd : null;
}
