import {
  applySwipeLayerRow,
  toggleLayerTrioFlag,
  type LayerGestureResult,
  type LayerTrioState,
  type LayerTrioToggleKind,
} from "../drawing/studio-layer-trio-gestures";
import type { El } from "../studio-element-model";

/**
 * 요소 패치가 레이어 메타데이터(이름·표시·잠금·역할·색상·트리오 플래그 등)만 건드리는지 판정한다.
 * 잠긴 요소라도 메타데이터 패치는 허용되므로, 호스트의 수정 가드가 이 판정을 공유한다.
 * (2026-10-03 파일 크기 래칫 해소로 StudioCuttoonEditorHost에서 추출 — 동작 변경 없음.)
 */
export function isLayerMetadataPatch(patch: Partial<El>): boolean {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((key) =>
    key === "name" ||
    key === "hidden" ||
    key === "locked" ||
    key === "layerRole" ||
    key === "layerColor" ||
    key === "fillReference" ||
    key === "alphaLocked" ||
    key === "clippingMask"
  );
}

/** 레이어 트리오(Clipping Mask · Alpha Lock · 단일 소유 Reference) 상태를 전환한다 (AC-016 T9). */
export function resolveStudioLayerTrioToggle(
  layers: readonly LayerTrioState[],
  layerId: string,
  flag: LayerTrioToggleKind,
): readonly LayerTrioState[] {
  return toggleLayerTrioFlag(layers, layerId, flag);
}

/** 레이어 행 좌/우 스와이프(잠금 토글 · 다중 선택 토글)를 적용한다 (AC-016 T9). */
export function resolveStudioLayerRowSwipe(
  layers: readonly LayerTrioState[],
  layerId: string,
  direction: "left-lock" | "right-select",
): LayerGestureResult {
  return applySwipeLayerRow(layers, layerId, direction);
}
