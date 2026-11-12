/**
 * SHAPER 다중 표면 드로잉 서브레이어 스택(Layer 0 ~ Layer 5).
 *
 * 부위(PartRole)마다 최대 6개의 독립 RGBA8 서브레이어(선화·볼터치·문양·음영·하이라이트·보조)를 유지하고,
 * 가시성(visible)과 불투명도(opacity 0..1)를 반영해 선형 색공간 source-over로 마스터 `PaintLayer`에 합성한다.
 * 엔진 업로드(`updatePaintTexture`)·PSD 내보내기·레시피 직렬화는 합성된 마스터 `PaintLayer`를 그대로 소비하므로
 * 상위 계약을 깨지 않고 다중 레이어 분리 작업과 개별 레이어 숨김/비우기를 지원한다.
 */
import { PAINT_LAYER_DEFAULT_SIZE } from "../contracts";
import { linearToSrgb, srgbToLinear } from "../shared/color";

import { clonePaintLayer, compositePixelLinear, createPaintLayer, isPaintLayerEmpty } from "./paint-layer";

import type { MutablePaintLayer } from "./paint-layer";
import type { PaintLayer, PartRole } from "../contracts";

export const PAINT_SUBLAYER_INDICES = [0, 1, 2, 3, 4, 5] as const;
export type PaintSublayerIndex = (typeof PAINT_SUBLAYER_INDICES)[number];

export interface PaintSublayerSpec {
  readonly index: PaintSublayerIndex;
  readonly shortLabelKo: string;
  readonly labelKo: string;
}

export const PAINT_SUBLAYER_SPECS: readonly PaintSublayerSpec[] = Object.freeze([
  { index: 0, shortLabelKo: "L0 선화", labelKo: "Layer 0 · 선화/속눈썹" },
  { index: 1, shortLabelKo: "L1 볼터치", labelKo: "Layer 1 · 볼터치/홍조" },
  { index: 2, shortLabelKo: "L2 문양·점", labelKo: "Layer 2 · 문양/점/흉터" },
  { index: 3, shortLabelKo: "L3 음영", labelKo: "Layer 3 · 셀 음영" },
  { index: 4, shortLabelKo: "L4 하이라이트", labelKo: "Layer 4 · 하이라이트" },
  { index: 5, shortLabelKo: "L5 보조", labelKo: "Layer 5 · 보조 메모" },
]);

export interface PaintSublayerMeta {
  readonly index: PaintSublayerIndex;
  readonly visible: boolean;
  /** 0..1 */
  readonly opacity: number;
  readonly hasPixels: boolean;
  readonly revision: number;
}

export interface MutableSublayerSlot {
  readonly index: PaintSublayerIndex;
  layer: MutablePaintLayer;
  visible: boolean;
  opacity: number;
}

export interface PartSublayerStack {
  readonly part: PartRole;
  readonly width: number;
  readonly height: number;
  readonly slots: readonly [
    MutableSublayerSlot,
    MutableSublayerSlot,
    MutableSublayerSlot,
    MutableSublayerSlot,
    MutableSublayerSlot,
    MutableSublayerSlot,
  ];
}

const SRGB_LUT: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) lut[i] = srgbToLinear(i / 255);
  return lut;
})();

export function isPaintSublayerIndex(value: unknown): value is PaintSublayerIndex {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5;
}

export function clampSublayerOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function createPartSublayerStack(
  part: PartRole,
  width = PAINT_LAYER_DEFAULT_SIZE,
  height = width,
): PartSublayerStack {
  const make = (index: PaintSublayerIndex): MutableSublayerSlot => ({
    index,
    layer: createPaintLayer(part, width, height),
    visible: true,
    opacity: 1,
  });
  return {
    part,
    width,
    height,
    slots: [make(0), make(1), make(2), make(3), make(4), make(5)],
  };
}

export function readSublayerMetas(stack: PartSublayerStack): readonly PaintSublayerMeta[] {
  return stack.slots.map((slot) => ({
    index: slot.index,
    visible: slot.visible,
    opacity: slot.opacity,
    hasPixels: !isPaintLayerEmpty(slot.layer),
    revision: slot.layer.revision,
  }));
}

/**
 * 서브레이어 스택(0 → 5 순서, 아래에서 위로)을 선형 색공간 source-over로 합성해 `target` 마스터 레이어에 기록한다.
 */
export function recompositePartSublayers(stack: PartSublayerStack, target: MutablePaintLayer): void {
  if (target.width !== stack.width || target.height !== stack.height || target.part !== stack.part) {
    throw new Error(
      `recompositePartSublayers: 대상 레이어(${target.part} ${target.width}×${target.height})가 스택(${stack.part} ${stack.width}×${stack.height})과 일치하지 않습니다.`,
    );
  }
  const out = target.rgba;
  out.fill(0);

  const activeSlots = stack.slots.filter((slot) => slot.visible && slot.opacity > 0 && !isPaintLayerEmpty(slot.layer));
  if (activeSlots.length === 0) {
    target.revision += 1;
    return;
  }

  // 활성 슬롯이 1개이고 불투명도가 1이면 바이트 복사로 즉시 완료한다.
  const single = activeSlots.length === 1 ? activeSlots[0] : undefined;
  if (single && Math.abs(single.opacity - 1) < 1e-6) {
    out.set(single.layer.rgba);
    target.revision += 1;
    return;
  }

  // 단일 슬롯 부분 불투명도 고속 경로
  if (single) {
    const src = single.layer.rgba;
    const op = single.opacity;
    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3] ?? 0;
      if (a === 0) continue;
      const nextA = Math.round(a * op);
      if (nextA === 0) continue;
      out[i] = src[i] ?? 0;
      out[i + 1] = src[i + 1] ?? 0;
      out[i + 2] = src[i + 2] ?? 0;
      out[i + 3] = nextA;
    }
    target.revision += 1;
    return;
  }

  // 다중 슬롯 선형 공간 source-over 합성
  const pixelCount = stack.width * stack.height;
  for (const slot of activeSlots) {
    const src = slot.layer.rgba;
    const op = slot.opacity;
    for (let p = 0; p < pixelCount; p += 1) {
      const idx = p * 4;
      const rawA = src[idx + 3] ?? 0;
      if (rawA === 0) continue;
      const sa = (rawA / 255) * op;
      if (sa <= 0) continue;
      const linRgb: readonly [number, number, number] = [
        SRGB_LUT[src[idx] ?? 0] ?? 0,
        SRGB_LUT[src[idx + 1] ?? 0] ?? 0,
        SRGB_LUT[src[idx + 2] ?? 0] ?? 0,
      ];
      compositePixelLinear(out, idx, linRgb, sa);
    }
  }
  // 선형 변환 미세 반올림 정규화 검증용: linearToSrgb는 compositePixelLinear 내부에서 사용됨
  void linearToSrgb;
  target.revision += 1;
}

/** 외부에서 교체된 단일 `PaintLayer`를 스택의 Layer 0으로 적재하고 Layer 1~5를 초기화한다. */
export function resetStackFromSingleLayer(stack: PartSublayerStack, incoming: PaintLayer): void {
  for (const slot of stack.slots) {
    slot.visible = true;
    slot.opacity = 1;
    if (slot.index === 0) {
      slot.layer = clonePaintLayer(incoming);
    } else {
      slot.layer.rgba.fill(0);
      slot.layer.revision = 0;
    }
  }
}
