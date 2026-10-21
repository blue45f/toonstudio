/**
 * Studio 3D 데생 인형 — 자동 접지 토글 + 마지막 접지 판정 표시.
 *
 * 포즈 변경·IK 드래그가 끝날 때 발이 지면을 관통하면 골반을 자동으로 들어
 * 발바닥을 밀착시키는 접지 솔버(studio-mannequin-foot-grounding)를 켜고
 * 끄는 스위치다. 끄면 솔버 판정은 표시만 되고 포즈는 바뀌지 않는다.
 * 마지막 판정(들어 올린 양·toe roll)은 status 문구로 보여 줘, 포즈가 왜
 * 살짝 움직였는지 사용자가 알 수 있게 한다.
 */

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

import type { StudioMannequinFootGroundingResult } from "./studio-mannequin-foot-grounding";

export interface StudioMannequinFootGroundingToggleProps {
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
  /** 마지막 접지 판정. 아직 포즈 변경이 없으면 null. */
  readonly lastResult: StudioMannequinFootGroundingResult | null;
}

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

export function StudioMannequinFootGroundingToggle({
  enabled,
  onToggle,
  lastResult,
}: StudioMannequinFootGroundingToggleProps): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        aria-pressed={enabled}
        title={
          enabled
            ? "포즈 변경·IK 드래그 종료 시 발이 바닥을 뚫으면 골반을 자동으로 들어 발바닥을 지면에 맞춥니다."
            : "자동 접지가 꺼져 있습니다. 포즈가 바뀌어도 발 관통을 자동으로 보정하지 않습니다."
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.7rem] font-semibold transition-colors",
          enabled
            ? "border-accent/60 bg-accent-soft/40 text-fg"
            : "border-line text-fg-3 hover:border-accent/40 hover:text-fg-2",
        )}
      >
        자동 접지 {enabled ? "ON" : "OFF"}
      </button>
      {enabled && lastResult ? (
        <span className="text-[0.66rem] text-fg-3" role="status">
          {describeStudioMannequinFootGroundingResult(lastResult)}
        </span>
      ) : null}
    </span>
  );
}
