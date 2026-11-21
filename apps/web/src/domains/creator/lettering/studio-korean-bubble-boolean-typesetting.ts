import { hasBatchim, josa } from "es-hangul";

import {
  createLiveBooleanGroup,
  createLiveBooleanLeaf,
  evaluateLiveBooleanGroup,
  type LiveBooleanEvaluationResult,
} from "../vector/studio-live-boolean-group";

export type KoreanJosaOption = Parameters<typeof josa>[1];

export interface KoreanOpticalBubbleLayout {
  readonly lines: readonly string[];
  readonly cssWordBreak: "keep-all";
  readonly opticalCenterOffsetRatio: number;
  readonly innerPaddingRatio: number;
  readonly maxLineLength: number;
  readonly balancedRatio: number;
}

/**
 * `es-hangul` 받침 판정으로 자연스러운 한국어 조사를 결합한다(`이(가)` 기계 출력 금지).
 */
export function attachKoreanParticle(word: string, option: KoreanJosaOption): string {
  const trimmed = word.trim();
  if (!trimmed) return "";
  return josa(trimmed, option);
}

/**
 * 어절 단위(`keep-all`)를 깨지 않고 말풍선 내부 폭에 맞춰 다이아몬드/균형 줄바꿈을 계산한다.
 * 한글 글자 무게중심 보정(`-3%`)과 말풍선 내곽 패딩(`20%`)을 함께 반환한다.
 */
export function formatKoreanBubbleLines(
  text: string,
  maxCharsPerLine = 9,
): KoreanOpticalBubbleLayout {
  const safeLimit = Math.max(4, Math.floor(maxCharsPerLine));
  const paragraphs = text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/u).filter(Boolean);
    let current = "";
    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      const candidate = `${current} ${word}`;
      if (candidate.length <= safeLimit) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  // 마지막 줄이 외톨이 어절(1~2자)이 되지 않도록 직전 줄과 재균형
  if (lines.length >= 2) {
    const last = lines[lines.length - 1]!;
    const prev = lines[lines.length - 2]!;
    const prevWords = prev.split(" ");
    if (last.length <= 2 && prevWords.length >= 2) {
      const moved = prevWords.pop()!;
      const nextPrev = prevWords.join(" ");
      const nextLast = `${moved} ${last}`;
      if (nextLast.length <= safeLimit + 2 && nextPrev.length > 0) {
        lines[lines.length - 2] = nextPrev;
        lines[lines.length - 1] = nextLast;
      }
    }
  }

  const lengths = lines.map((line) => line.length);
  const maxLen = lengths.length > 0 ? Math.max(...lengths) : 0;
  const minLen = lengths.length > 0 ? Math.min(...lengths) : 0;
  const balancedRatio = maxLen > 0 ? Number((minLen / maxLen).toFixed(3)) : 1;

  return Object.freeze({
    lines: Object.freeze(lines),
    cssWordBreak: "keep-all",
    opticalCenterOffsetRatio: -0.03,
    innerPaddingRatio: 0.2,
    maxLineLength: maxLen,
    balancedRatio,
  });
}

export function koreanTailSyllableHasBatchim(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return hasBatchim(trimmed);
}

export interface SpeechBubbleTailBooleanInput {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly tailSide: "left" | "right" | "none";
  readonly tailXRatio: number;
  readonly tailHeight: number;
  readonly tailBase: number;
  readonly tailBend?: number;
}

/**
 * 말풍선 본체(타원)와 화자 꼬리(삼각형 폴리곤)를 `studio-live-boolean-group.ts` 비파괴 불리언 합집합으로
 * 결합해 겹치는 내부 외곽선 없는 단일 외곽 패스를 생성한다 (AC-003).
 */
export async function buildSpeechBubbleTailBooleanUnion(
  input: SpeechBubbleTailBooleanInput,
): Promise<LiveBooleanEvaluationResult> {
  const bodyLeaf = createLiveBooleanLeaf({
    id: "bubble-body",
    name: "말풍선 본체",
    shape: {
      kind: "ellipse",
      points: [input.x, input.y, input.x + input.width, input.y + input.height],
    },
  });

  if (input.tailSide === "none" || input.tailHeight <= 0 || input.tailBase <= 0) {
    const soloGroup = createLiveBooleanGroup({
      id: "bubble-union-root",
      name: "말풍선",
      op: "union",
      children: [bodyLeaf],
    });
    return evaluateLiveBooleanGroup(soloGroup, { curveSegments: 64 });
  }

  const clampedRatio = Math.max(0.15, Math.min(0.85, input.tailXRatio));
  const baseCenterX = input.x + input.width * clampedRatio;
  const halfBase = Math.max(8, input.tailBase * 0.5);
  // 본체 하단 안쪽으로 16% 겹치게 넣어 불리언 합집합이 매끄럽게 연결되도록 한다
  const overlapY = input.y + input.height * 0.84;
  const bendOffset = (input.tailBend ?? 0) * (input.tailSide === "left" ? -1 : 1);
  const tipX =
    baseCenterX +
    (input.tailSide === "left" ? -Math.max(12, input.tailBase * 0.45) : Math.max(12, input.tailBase * 0.45)) +
    bendOffset;
  const tipY = input.y + input.height + input.tailHeight;

  const tailLeaf = createLiveBooleanLeaf({
    id: "bubble-tail",
    name: "말풍선 꼬리",
    shape: {
      kind: "freehand",
      points: [
        baseCenterX - halfBase,
        overlapY,
        baseCenterX + halfBase,
        overlapY,
        tipX,
        tipY,
      ],
    },
  });

  const unionGroup = createLiveBooleanGroup({
    id: "bubble-tail-union",
    name: "말풍선 본체+꼬리 불리언 합집합",
    op: "union",
    children: [bodyLeaf, tailLeaf],
  });

  return evaluateLiveBooleanGroup(unionGroup, { curveSegments: 64 });
}
