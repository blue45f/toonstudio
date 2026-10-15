/**
 * 모델 배치 미리보기 ↔ 추론 — 포인터가 가리킨 표면/바닥 점을 방금 계산된 추론 점으로 바꿔 준다.
 *
 * 배치 포인터 컨트롤러는 루트 수준에서 표면 교점(`surfaceHit`)이나 바닥 X/Z(`floorPoint`)만 알려 준다.
 * 화면 배율(px)을 모르므로 직접 추론하지 않고, View 안의 추론 컨트롤러가 같은 포인터 이벤트로 계산한
 * 결과(`resolveFreshPoint`)를 빌려 와 끝점·중간점·중심·선 위에 붙인다.
 * 바닥을 가리키는 중에는 바닥(y≈0) 위의 추론 점만 받아들인다 — 공중의 점으로 끌려가면 모델이 떠 버린다.
 */

import type { StudioBg3dInferenceService } from "./studio-bg3d-inference-service";

type V3 = readonly [number, number, number];

export interface StudioBg3dInferencePlacementTargetLike {
  readonly surfaceHit?: { readonly point: V3; readonly normal: V3 } | null;
  readonly floorPoint?: readonly [number, number] | null;
}

/** 바닥 점으로 인정하는 높이 허용 오차(m). */
export const STUDIO_BG3D_INFERENCE_PLACEMENT_FLOOR_TOLERANCE = 1e-3;

export function applyStudioBg3dInferenceToPlacementTarget<T extends StudioBg3dInferencePlacementTargetLike>(
  service: Pick<StudioBg3dInferenceService, "resolveFreshPoint">,
  target: T,
): T {
  if (target.surfaceHit) {
    const fresh = service.resolveFreshPoint(target.surfaceHit.point);
    if (!fresh.snapped) return target;
    return { ...target, surfaceHit: { ...target.surfaceHit, point: fresh.point } };
  }
  if (target.floorPoint) {
    const fresh = service.resolveFreshPoint([target.floorPoint[0], 0, target.floorPoint[1]]);
    if (!fresh.snapped) return target;
    if (Math.abs(fresh.point[1]) > STUDIO_BG3D_INFERENCE_PLACEMENT_FLOOR_TOLERANCE) return target;
    return { ...target, floorPoint: [fresh.point[0], fresh.point[2]] as const };
  }
  return target;
}
