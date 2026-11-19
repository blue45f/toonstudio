/**
 * Procreate급 레이어 트리오(Clipping Mask / Alpha Lock / Reference) 및
 * 터치 제스처(핀치 병합 · 2핑거 슬라이드 불투명도 · 좌/우 스와이프 잠금·선택) 컨트롤러 (AC-016 T9).
 */

export interface LayerTrioState {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly selected: boolean;
  readonly opacity: number; // 0..1
  readonly clippingMask: boolean;
  readonly alphaLock: boolean;
  readonly reference: boolean;
}

export type LayerTrioToggleKind = "clippingMask" | "alphaLock" | "reference";

export type LayerGestureResult =
  | { readonly kind: "noop"; readonly layers: readonly LayerTrioState[] }
  | { readonly kind: "merged"; readonly layers: readonly LayerTrioState[]; readonly targetLayerId: string; readonly mergedIds: readonly string[] }
  | { readonly kind: "opacity-changed"; readonly layers: readonly LayerTrioState[]; readonly targetLayerId: string; readonly opacity: number }
  | { readonly kind: "toggled-lock"; readonly layers: readonly LayerTrioState[]; readonly targetLayerId: string; readonly locked: boolean }
  | { readonly kind: "toggled-select"; readonly layers: readonly LayerTrioState[]; readonly targetLayerId: string; readonly selected: boolean };

/**
 * 레이어 트리오 토글 규칙:
 * - `reference` 레이어는 문서 내 최대 1개만 활성화(새로 켜면 기존 reference 해제).
 * - `clippingMask`는 최하단(인덱스 0) 레이어에는 적용 불가(클리핑 대상이 없으므로).
 * - `locked` 레이어는 토글을 무시해 실수로 속성 변경되는 것을 막는다.
 */
export function toggleLayerTrioFlag(
  layers: readonly LayerTrioState[],
  layerId: string,
  flag: LayerTrioToggleKind,
): readonly LayerTrioState[] {
  const index = layers.findIndex((l) => l.id === layerId);
  if (index < 0) return layers;
  const target = layers[index]!;
  if (target.locked) return layers;
  if (flag === "clippingMask" && index === 0) return layers;

  const nextValue = !target[flag];
  return layers.map((layer) => {
    if (layer.id === layerId) {
      return { ...layer, [flag]: nextValue };
    }
    if (flag === "reference" && nextValue && layer.reference) {
      return { ...layer, reference: false };
    }
    return layer;
  });
}

/**
 * 핀치 병합: 상단·하단 두 인덱스 사이의 잠기지 않은 연속 레이어를 하단 대상 레이어 하나로 병합한다.
 */
export function applyPinchMergeLayers(
  layers: readonly LayerTrioState[],
  indexA: number,
  indexB: number,
): LayerGestureResult {
  const low = Math.min(indexA, indexB);
  const high = Math.max(indexA, indexB);
  if (low < 0 || high >= layers.length || low === high) {
    return { kind: "noop", layers };
  }
  const span = layers.slice(low, high + 1);
  if (span.some((l) => l.locked)) {
    return { kind: "noop", layers };
  }
  const base = span[0]!;
  const mergedIds = span.slice(1).map((l) => l.id);
  const nextLayers = [
    ...layers.slice(0, low),
    { ...base, selected: true },
    ...layers.slice(high + 1),
  ];
  return {
    kind: "merged",
    layers: nextLayers,
    targetLayerId: base.id,
    mergedIds,
  };
}

/**
 * 2핑거 수평 슬라이드 불투명도 조절 (deltaX / fullDragPx 기준 0..1 클램프).
 */
export function applySlideLayerOpacity(
  layers: readonly LayerTrioState[],
  layerId: string,
  deltaX: number,
  fullDragPx = 200,
): LayerGestureResult {
  const target = layers.find((l) => l.id === layerId);
  if (!target || target.locked || fullDragPx <= 0) {
    return { kind: "noop", layers };
  }
  const nextOpacity = Number(
    Math.max(0, Math.min(1, target.opacity + deltaX / fullDragPx)).toFixed(2),
  );
  return {
    kind: "opacity-changed",
    targetLayerId: layerId,
    opacity: nextOpacity,
    layers: layers.map((l) => (l.id === layerId ? { ...l, opacity: nextOpacity } : l)),
  };
}

/**
 * 레이어 행 스와이프: 좌측 스와이프(잠금 토글), 우측 스와이프(다중 선택 토글).
 */
export function applySwipeLayerRow(
  layers: readonly LayerTrioState[],
  layerId: string,
  direction: "left-lock" | "right-select",
): LayerGestureResult {
  const target = layers.find((l) => l.id === layerId);
  if (!target) return { kind: "noop", layers };

  if (direction === "left-lock") {
    const locked = !target.locked;
    return {
      kind: "toggled-lock",
      targetLayerId: layerId,
      locked,
      layers: layers.map((l) => (l.id === layerId ? { ...l, locked } : l)),
    };
  }

  const selected = !target.selected;
  return {
    kind: "toggled-select",
    targetLayerId: layerId,
    selected,
    layers: layers.map((l) => (l.id === layerId ? { ...l, selected } : l)),
  };
}
