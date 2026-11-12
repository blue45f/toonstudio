/**
 * Studio 3D 데생 인형 — 자동 접지 토글 + 마지막 접지 판정 표시.
 *
 * 포즈 변경·IK 드래그가 끝날 때 발이 지면을 관통하면 골반을 자동으로 들어
 * 발바닥을 밀착시키는 접지 솔버(studio-mannequin-foot-grounding)를 켜고
 * 끄는 스위치다. 모바일·터치 기기(`pointer-coarse`)에서도 44px 조작 타깃과
 * 키보드 `focus-visible` 외곽선을 보장한다.
 */

import type { ReactElement } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { cn } from "@/shared/lib/utils";

import type { StudioMannequinFootGroundingResult } from "./studio-mannequin-foot-grounding";
import { describeStudioMannequinFootGroundingResult } from "./studio-mannequin-foot-grounding-status-text";

export interface StudioMannequinFootGroundingToggleProps {
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
  /** 마지막 접지 판정. 아직 포즈 변경이 없으면 null. */
  readonly lastResult: StudioMannequinFootGroundingResult | null;
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
          "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.72rem] font-semibold transition-colors pointer-coarse:min-h-11 pointer-coarse:px-3",
          STUDIO_FOCUS_RING,
          enabled
            ? "border-accent/60 bg-accent-soft/40 text-fg"
            : "border-line text-fg-3 hover:border-accent/40 hover:text-fg-2",
        )}
      >
        자동 접지 {enabled ? "ON" : "OFF"}
      </button>
      {enabled && lastResult ? (
        <span className="text-[0.7rem] text-fg-3" role="status" aria-live="polite">
          {describeStudioMannequinFootGroundingResult(lastResult)}
        </span>
      ) : null}
    </span>
  );
}
