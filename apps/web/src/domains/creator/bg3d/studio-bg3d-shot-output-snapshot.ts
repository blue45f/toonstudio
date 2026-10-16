// 컷(샷)에 기록하는 출력 설정 스냅샷.
//
// 컷의 출력 오버라이드(StudioBg3dShotOutputOverride)는 투명 배경·출력 높이·선·톤만 소유한다.
// 문서 출력의 exportAspectRatio(캡처 프레임 비율)는 문서 전체에 하나뿐인 값이라 컷이 소유하지
// 않는다 — 조명 스냅샷에서 문서 공통 environment 를 빼는 것(withoutShotEnvironment)과 같은 이유다.
// 이 키를 그대로 컷에 넣으면 엄격 정규화의 구조 동등성 검사가 실패해, 캡처 비율을 고정한 문서에서는
// 컷 저장(captureStudioBg3dShot)이 항상 null 이 되어 "컷 이름 또는 장면 데이터가 저장 한도를 벗어나"
// 라는 엉뚱한 오류로 보였다.

import type {
  StudioBg3dOutputSettings,
  StudioBg3dShotOutputOverride,
} from "./studio-bg3d-scene-document-types";

export function snapshotStudioBg3dShotOutput(
  output: StudioBg3dOutputSettings,
): StudioBg3dShotOutputOverride {
  const { exportAspectRatio: _documentWideRatio, ...shotOwned } = output;
  return {
    ...shotOwned,
    line: { ...output.line },
    tone: { ...output.tone },
  };
}
