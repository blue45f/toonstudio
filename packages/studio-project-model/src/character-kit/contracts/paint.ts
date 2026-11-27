/**
 * 모델 위 드로잉(페인트) 계약. 레이어는 부위(PartRole)별 RGBA8 straight 텍스처다.
 * 1 스트로크 = 1 undo 토큰(타일 64px 단위 before 이미지, 다중 서브레이어 단계 연결 포함).
 */
import type { PartRole } from "./mesh-data";

export const PAINT_TILE_SIZE = 64 as const;
export const PAINT_LAYER_DEFAULT_SIZE = 1024;

/** 페인트를 허용하는 부위 */
export const PAINTABLE_PART_ROLES: readonly PartRole[] = ["skin", "head", "hair", "top", "bottom", "shoes", "accessory"];

/** SHAPER 다중 표면 드로잉 서브레이어 슬롯 번호(0..5) */
export const PAINT_SUBLAYER_INDICES = [0, 1, 2, 3, 4, 5] as const;
export type PaintSublayerIndex = (typeof PAINT_SUBLAYER_INDICES)[number];

export type PaintSublayerOrder = readonly [
  PaintSublayerIndex,
  PaintSublayerIndex,
  PaintSublayerIndex,
  PaintSublayerIndex,
  PaintSublayerIndex,
  PaintSublayerIndex,
];

/** 기본 서브레이어 합성 순서(아래 0 → 위 5) */
export const DEFAULT_SUBLAYER_ORDER: PaintSublayerOrder = Object.freeze([0, 1, 2, 3, 4, 5]);

export function isPaintSublayerIndex(value: unknown): value is PaintSublayerIndex {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5;
}

export function isValidSublayerOrder(value: readonly number[]): value is PaintSublayerOrder {
  if (value.length !== 6) return false;
  const seen = new Set<number>();
  for (const item of value) {
    if (!isPaintSublayerIndex(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return seen.size === 6;
}

export interface PaintLayer {
  readonly part: PartRole;
  readonly width: number;
  readonly height: number;
  /** width*height*4, straight alpha, top-down */
  readonly rgba: Uint8ClampedArray;
  /** 변경마다 증가(엔진 텍스처 업로드 트리거) */
  readonly revision: number;
}

export interface PaintSublayerSlotState {
  readonly index: PaintSublayerIndex;
  readonly visible: boolean;
  /** 0..1 */
  readonly opacity: number;
  /** 비어 있으면 null, 픽셀이 있으면 width*height*4 straight RGBA8 */
  readonly rgba: Uint8ClampedArray | null;
}

export interface PaintPartSublayerState {
  readonly part: PartRole;
  readonly width: number;
  readonly height: number;
  /** 아래(먼저 합성) → 위(나중 합성) 순서 */
  readonly order: PaintSublayerOrder;
  readonly slots: readonly [
    PaintSublayerSlotState,
    PaintSublayerSlotState,
    PaintSublayerSlotState,
    PaintSublayerSlotState,
    PaintSublayerSlotState,
    PaintSublayerSlotState,
  ];
}

export interface BrushSettings {
  readonly radiusPx: number;
  /** 소문자 #rrggbb */
  readonly color: string;
  /** 0..1 */
  readonly opacity: number;
  /** 0 = 가우시안 소프트, 1 = 하드 엣지 */
  readonly hardness: number;
  /** dab 간격(반지름 비율) */
  readonly spacing: number;
}

export const DEFAULT_BRUSH: BrushSettings = Object.freeze({
  radiusPx: 12,
  color: "#d94b5a",
  opacity: 0.8,
  hardness: 0.6,
  spacing: 0.25,
});

export interface BrushDab {
  /** UV 0..1 */
  readonly u: number;
  readonly v: number;
  /** 0..1 */
  readonly pressure: number;
}

export interface PaintUndoTile {
  /** 타일 좌상단 픽셀 좌표 */
  readonly x: number;
  readonly y: number;
  /** 변경 전 타일 RGBA(가장자리 타일은 잘린 크기) */
  readonly data: Uint8ClampedArray;
}

export interface PaintUndoToken {
  readonly part: PartRole;
  readonly tiles: ReadonlyArray<PaintUndoTile>;
  readonly tileSize: typeof PAINT_TILE_SIZE;
  /** 다중 서브레이어 세션의 원자적 Undo/Redo 단계 ID 목록(mergeUndoTokens 병합 시 순서 보존) */
  readonly sublayerSteps?: readonly number[];
}
