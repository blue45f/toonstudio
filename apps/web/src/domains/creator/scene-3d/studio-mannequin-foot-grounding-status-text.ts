/**
 * Studio 3D 데생 인형 — 자동 접지 판정의 상태 문구.
 *
 * 접지 토글(StudioMannequinFootGroundingToggle)이 마지막 접지 판정을 한 줄
 * 상태 문구로 보여 줄 때 쓰는 순수 함수다. 컴포넌트 파일이 함수를 함께 내보내면
 * Fast Refresh 가 모듈 전체를 새로고침해 상태를 잃으므로(react-refresh 규칙)
 * 토글 컴포넌트에서 이 모듈로 분리했다. 접지 어댑터의 결과 타입만 타입 전용으로
 * 참조해 런타임 import 가 없다.
 */

import type { StudioMannequinFootGroundingResult } from "./studio-mannequin-foot-grounding";

export function describeStudioMannequinFootGroundingResult(
  result: StudioMannequinFootGroundingResult,
): string {
  if (result.applied) {
    return `자동 접지: 발바닥 밀착을 위해 골반을 ${(result.pelvisLiftMeters * 100).toFixed(1)}cm 올렸어요`;
  }
  if (result.supportGuardBlocked) {
    return "자동 접지: 앉은 자세로 보고 발 관통을 그대로 뒀어요";
  }
  const { leftToeAngleDeg, rightToeAngleDeg } = result.groundingState;
  const toeRoll = Math.max(leftToeAngleDeg, rightToeAngleDeg);
  if (toeRoll > 0) return `자동 접지: toe roll ${toeRoll}° (걸음 자세)`;
  if (result.groundingState.isLeftGrounded && result.groundingState.isRightGrounded) {
    return "자동 접지: 양발 접지 중";
  }
  return "자동 접지: 접지 보정 없음";
}
