/**
 * SHAPER 다중 표면 드로잉 서브레이어 스택(Layer 0 ~ Layer 5).
 *
 * 부위(PartRole)마다 최대 6개의 독립 RGBA8 서브레이어(선화·볼터치·문양·음영·하이라이트·보조)를 유지하고,
 * 사용자 지정 합성 순서(`order`, 아래 → 위), 가시성(`visible`), 불투명도(`opacity` 0..1)를 반영해
 * 선형 색공간 source-over로 마스터 `PaintLayer`에 합성한다.
 */
import {
  DEFAULT_SUBLAYER_ORDER,
  PAINT_LAYER_DEFAULT_SIZE,
  PAINT_SUBLAYER_INDICES,
  isPaintSublayerIndex,
  isValidSublayerOrder,
} from "../contracts";
import { linearToSrgb, srgbToLinear } from "../shared/color";

import { clonePaintLayer, compositePixelLinear, createPaintLayer, isPaintLayerEmpty } from "./paint-layer";

import type { MutablePaintLayer } from "./paint-layer";
import type {
  PaintLayer,
  PaintPartSublayerState,
  PaintSublayerIndex,
  PaintSublayerOrder,
  PaintSublayerSlotState,
  PartRole,
} from "../contracts";

export {
  DEFAULT_SUBLAYER_ORDER,
  PAINT_SUBLAYER_INDICES,
  isPaintSublayerIndex,
  isValidSublayerOrder,
};
export type {
  PaintPartSublayerState,
  PaintSublayerIndex,
  PaintSublayerOrder,
  PaintSublayerSlotState,
};

export type SublayerMoveDirection = "down" | "up";

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
  /** 합성 스택 내 위치(0 = 가장 아래/뒤, 5 = 가장 위/앞) */
  readonly orderPosition: number;
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
  order: PaintSublayerOrder;
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

export function clampSublayerOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function isDefaultSublayerOrder(order: PaintSublayerOrder): boolean {
  return order.every((idx, pos) => idx === DEFAULT_SUBLAYER_ORDER[pos]);
}

/**
 * 서브레이어를 한 단계 아래(`"down"`, 배경 쪽) 또는 위(`"up"`, 앞쪽)로 이동한 새 순서를 반환한다.
 * 이미 맨 아래/위 경계에 있으면 `null`을 반환한다.
 */
export function moveSublayerInOrder(
  order: PaintSublayerOrder,
  index: PaintSublayerIndex,
  direction: SublayerMoveDirection,
): PaintSublayerOrder | null {
  const pos = order.indexOf(index);
  if (pos < 0) return null;
  const targetPos = direction === "down" ? pos - 1 : pos + 1;
  if (targetPos < 0 || targetPos >= order.length) return null;
  const next = [...order] as [
    PaintSublayerIndex,
    PaintSublayerIndex,
    PaintSublayerIndex,
    PaintSublayerIndex,
    PaintSublayerIndex,
    PaintSublayerIndex,
  ];
  const neighbor = next[targetPos];
  if (neighbor === undefined) return null;
  next[targetPos] = index;
  next[pos] = neighbor;
  return next;
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
    order: [...DEFAULT_SUBLAYER_ORDER],
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
    orderPosition: stack.order.indexOf(slot.index),
  }));
}

/**
 * 서브레이어 스택을 `stack.order` 순서(아래 → 위)대로 선형 색공간 source-over 합성해 `target` 마스터 레이어에 기록한다.
 */
export function recompositePartSublayers(stack: PartSublayerStack, target: MutablePaintLayer): void {
  if (target.width !== stack.width || target.height !== stack.height || target.part !== stack.part) {
    throw new Error(
      `recompositePartSublayers: 대상 레이어(${target.part} ${target.width}×${target.height})가 스택(${stack.part} ${stack.width}×${stack.height})과 일치하지 않습니다.`,
    );
  }
  const out = target.rgba;
  out.fill(0);

  const activeSlots = stack.order
    .map((idx) => stack.slots[idx])
    .filter((slot) => slot.visible && slot.opacity > 0 && !isPaintLayerEmpty(slot.layer));
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

  // 다중 슬롯 선형 공간 source-over 합성(order 아래 → 위)
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
  void linearToSrgb;
  target.revision += 1;
}

/** 외부에서 교체된 단일 `PaintLayer`를 스택의 Layer 0으로 적재하고 Layer 1~5 및 순서를 초기화한다. */
export function resetStackFromSingleLayer(stack: PartSublayerStack, incoming: PaintLayer): void {
  stack.order = [...DEFAULT_SUBLAYER_ORDER];
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

/** 부위 서브레이어 스택을 직렬화/복원 가능한 불변 스냅샷으로 내보낸다. */
export function exportStackState(stack: PartSublayerStack): PaintPartSublayerState {
  const makeSlot = (index: PaintSublayerIndex): PaintSublayerSlotState => {
    const slot = stack.slots[index];
    const empty = isPaintLayerEmpty(slot.layer);
    return {
      index,
      visible: slot.visible,
      opacity: slot.opacity,
      rgba: empty ? null : new Uint8ClampedArray(slot.layer.rgba),
    };
  };
  return {
    part: stack.part,
    width: stack.width,
    height: stack.height,
    order: [...stack.order],
    slots: [makeSlot(0), makeSlot(1), makeSlot(2), makeSlot(3), makeSlot(4), makeSlot(5)],
  };
}

/**
 * 레시피 `paint.sublayers`에 기록해야 할 비기본 서브레이어 상태가 있는지 판별한다.
 * - L1~L5에 픽셀이 있거나
 * - 어느 슬롯이든 숨김(`visible === false`) 또는 부분 불투명도(`opacity !== 1`)이거나
 * - 순서(`order`)가 기본 `[0,1,2,3,4,5]`가 아니면 true.
 */
export function hasNonDefaultSublayerState(state: PaintPartSublayerState): boolean {
  if (!isDefaultSublayerOrder(state.order)) return true;
  for (const slot of state.slots) {
    if (!slot.visible || Math.abs(slot.opacity - 1) > 1e-6) return true;
    if (slot.index !== 0 && slot.rgba !== null) return true;
  }
  return false;
}

/** 직렬화된 서브레이어 상태를 스택에 복원한다(크기·부위가 일치해야 한다). */
export function restoreStackState(stack: PartSublayerStack, state: PaintPartSublayerState): void {
  if (state.part !== stack.part || state.width !== stack.width || state.height !== stack.height) {
    throw new Error(
      `restoreStackState: 상태(${state.part} ${state.width}×${state.height})가 스택(${stack.part} ${stack.width}×${stack.height})과 다릅니다.`,
    );
  }
  stack.order = isValidSublayerOrder(state.order) ? [...state.order] : [...DEFAULT_SUBLAYER_ORDER];
  for (const slotState of state.slots) {
    const slot = stack.slots[slotState.index];
    slot.visible = slotState.visible;
    slot.opacity = clampSublayerOpacity(slotState.opacity);
    if (slotState.rgba) {
      if (slotState.rgba.length !== stack.width * stack.height * 4) {
        throw new Error(
          `restoreStackState: 슬롯 L${slotState.index} 바이트 길이(${slotState.rgba.length})가 ${stack.width * stack.height * 4}와 다릅니다.`,
        );
      }
      slot.layer.rgba.set(slotState.rgba);
    } else {
      slot.layer.rgba.fill(0);
    }
    slot.layer.revision += 1;
  }
}
