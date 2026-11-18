import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

/**
 * 썸네일 임시 리그 전용 레이어 마스크. 메인 카메라(기본 0x0fffffff)가 그리지 않으므로 캡처 중 비동기 구간에도
 * 뷰포트에 임시 리그가 보이지 않는다. 캡처 RTT는 `renderList`를 쓰므로 레이어 마스크를 검사하지 않는다.
 */
export const THUMBNAIL_LAYER_MASK = 0x10000000;

/** 얼굴 SDF 임계 맵 해상도 */
export const FACE_SDF_SIZE = 128;
/** 엣지 외곽선 각도 임계(cos) */
export const TOON_EDGE_EPSILON = 0.95;

/** 지금 influence > 0인 morph 타깃 수. `numInfluencers`는 attribute 모드에서 8개로 잘려 있어 초과분(무시되는 타깃)을 셀 수 없다. */
export function activeMorphTargets(manager: MorphTargetManager): number {
  let active = 0;
  for (let index = 0; index < manager.numTargets; index += 1) if (manager.getTarget(index).influence > 0) active += 1;
  return active;
}
