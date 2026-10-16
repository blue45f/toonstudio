/**
 * 카드뉴스 슬라이스 — 공개 타입·상수·기하 규칙.
 *
 * 긴 세로 원고를 4:5(1080×1350) 카드 N장으로 나눈다. 원본 폭을 카드 폭(1080)에 맞추는 한 가지 배율로 줄이거나 늘리고,
 * 카드 한 장에 들어가는 원본 높이(cardSourceHeight)를 넘지 않도록 절단 위치를 고른다. 모든 좌표 `y` 는 원본 행 번호다.
 */

export const CARD_NEWS_PRESET = Object.freeze({ width: 1080, height: 1350, ratio: "4:5" } as const);

export const CARD_SLICE_LIMITS = Object.freeze({
  /** 인스타그램 한 게시물(캐러셀)에 올릴 수 있는 카드 수. 넘으면 경고만 하고 막지는 않는다. */
  softMaxCards: 20,
  /** 한 번에 만들 수 있는 카드 수(메모리·ZIP 크기 보호). */
  hardMaxCards: 60,
  /** 카드 높이 대비 최소 채움(자동 절단이 이보다 짧은 카드를 만들지 않는다). */
  defaultMinFill: 0.35,
  /** 원본 폭 하한. 이보다 좁으면 카드로 키울 배율이 비현실적이다. */
  minSourceWidth: 64,
  /** 행이 "여백"이려면 같은 색 화소가 이 비율 이상이어야 한다(스캔 잡티 흡수). */
  cleanUniformity: 0.992,
  /** 가는 선·작은 점만 걸친 "거의 빈" 행의 하한. */
  softUniformity: 0.96,
  /** 행 색 비교 허용 오차(채널별 0~255). 컷 감지의 기본 여백색 허용 오차와 같다. */
  colorTolerance: 28,
  /** 알파가 이 값 이하인 화소는 투명으로 본다(컷 감지와 같다). */
  transparentAlpha: 16,
  /** 절단 후보가 내용 가장자리에서 떨어져 있을수록 좋다고 볼 때 세는 최대 거리(행). */
  marginCap: 12,
  /** 카드 한 장을 늘릴 때 드는 벌점(절단 품질이 이만큼 좋아질 때만 카드를 늘린다). */
  cardPenalty: 0.15,
  timeLimitMs: 15_000,
} as const);

export type CardCutKind = "clean" | "soft" | "content";
export type CardAlignment = "center" | "top";

export type CardSliceErrorCode =
  | "invalid-input"
  | "invalid-options"
  | "too-many-cards"
  | "cancelled"
  | "timeout";

const CARD_ERROR_MESSAGES: Readonly<Record<CardSliceErrorCode, string>> = Object.freeze({
  "invalid-input": "나눌 이미지가 올바르지 않아요.",
  "invalid-options": "카드 설정이 올바르지 않아요.",
  "too-many-cards": "카드가 너무 많아요. 원고를 나눠서 올려 주세요.",
  cancelled: "카드 나누기를 취소했어요.",
  timeout: "카드 나누기가 제한 시간을 넘겼어요.",
});

export class CardSliceError extends Error {
  readonly code: CardSliceErrorCode;

  constructor(code: CardSliceErrorCode, message?: string, options?: { readonly cause?: unknown }) {
    super(message ?? CARD_ERROR_MESSAGES[code], options);
    this.name = "CardSliceError";
    this.code = code;
  }
}

export interface CardSliceOptions {
  readonly cardWidth?: number;
  readonly cardHeight?: number;
  /** 자동 절단이 허용하는 최소 카드 채움(0.1~0.9). */
  readonly minFill?: number;
  /** 카드 수를 직접 정한다. null/생략이면 절단 품질이 가장 좋은 수를 고른다. */
  readonly cardCount?: number | null;
  readonly maxCards?: number;
  readonly timeLimitMs?: number;
  readonly now?: () => number;
  readonly isCancelled?: () => boolean;
}

export interface ResolvedCardSliceOptions {
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly minFill: number;
  readonly cardCount: number | null;
  readonly maxCards: number;
  readonly timeLimitMs: number;
  readonly now: () => number;
  readonly isCancelled: () => boolean;
}

/** 원본 폭과 카드 크기에서 나오는 기하 값. */
export interface CardGeometry {
  /** 원본 → 카드 배율(카드 폭 ÷ 원본 폭). 1 보다 크면 키운다. */
  readonly scale: number;
  /** 카드 한 장에 들어가는 원본 최대 높이(행). 이 값 이하의 조각은 카드 높이를 넘지 않는다. */
  readonly cardSourceHeight: number;
  /** 자동 절단의 최소 조각 높이(행). */
  readonly minLength: number;
  /** 손으로 옮길 때의 최소 조각 높이(행). */
  readonly minManualLength: number;
}

export function cardGeometry(sourceWidth: number, options: Pick<ResolvedCardSliceOptions, "cardWidth" | "cardHeight" | "minFill">): CardGeometry {
  const scale = options.cardWidth / sourceWidth;
  const cardSourceHeight = Math.max(1, Math.floor(options.cardHeight / scale));
  return {
    scale,
    cardSourceHeight,
    minLength: Math.max(1, Math.round(cardSourceHeight * options.minFill)),
    minManualLength: Math.max(16, Math.round(cardSourceHeight * 0.05)),
  };
}

/** 원본 한 행 한 행의 "비어 있음" 측정. 절단 위치 품질을 판정하는 유일한 근거다. */
export interface CardRowProfile {
  readonly width: number;
  readonly height: number;
  /** 행마다 기준 색과 같은 화소의 비율(0~1). 1 에 가까울수록 한 가지 색으로 비어 있는 행이다. */
  readonly uniformity: Float32Array;
  /** 행마다 기준 색 RGBA(4바이트씩). 알파 0 이면 투명 행. */
  readonly colors: Uint8Array;
}

export interface CardCut {
  /** 0부터. index 번째 컷은 카드 index 와 index+1 사이다. */
  readonly index: number;
  /** 이 행부터 아래 카드가 시작한다. */
  readonly y: number;
  readonly kind: CardCutKind;
  readonly uniformity: number;
  /** 사용자가 직접 옮긴 위치인가. */
  readonly manual: boolean;
}

export interface CardSlice {
  readonly index: number;
  /** 원본 행 범위 [y0, y1). */
  readonly y0: number;
  readonly y1: number;
  /** 카드 안에서 이 조각이 차지하는 높이(px). */
  readonly outputHeight: number;
  /** outputHeight ÷ 카드 높이. */
  readonly fill: number;
}

export type CardSliceWarning = "content-cuts" | "upscaled" | "downscaled" | "over-carousel-limit";

export interface CardSlicePlan {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly geometry: CardGeometry;
  readonly cards: readonly CardSlice[];
  readonly cuts: readonly CardCut[];
  /** 카드 사이 여백이 없는 곳(내용을 가로지를 수 있는 절단) 수. */
  readonly contentCutCount: number;
  readonly warnings: readonly CardSliceWarning[];
  /** 카드 바탕색(#rrggbb). 가장 많이 나온 여백색, 없으면 흰색. */
  readonly background: string;
}

export function classifyCardCut(uniformity: number): CardCutKind {
  if (uniformity >= CARD_SLICE_LIMITS.cleanUniformity) return "clean";
  if (uniformity >= CARD_SLICE_LIMITS.softUniformity) return "soft";
  return "content";
}
