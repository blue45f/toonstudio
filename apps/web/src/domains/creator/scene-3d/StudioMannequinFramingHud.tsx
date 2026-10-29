/**
 * Studio 3D 데생 인형 — VRM 4-View 카메라 프레이밍 버튼과 실측 스케일·3점 조명 안내.
 *
 * `StudioMannequinCameraSection.tsx`에서 분리한 표시 블록이다. 카메라 섹션은 동결 패널 상태 문구
 * 이관 계약(status-i18n/studio-frozen2-status-i18n-r4frz.test.ts)의 소비 파일이라 줄 수 기준선을
 * 넘을 수 없어, 섹션에 더해진 이 블록을 따로 둔다. 프레이밍 버튼은 섹션의 앵글 프리셋 콜백을 그대로 부른다.
 */

import type { ReactElement } from "react";

import { BLEND_AI_SCALE_GUIDES, VRM_FRAMING_PRESETS } from "./studio-gen3d-ecosystem-engine";

export interface StudioMannequinFramingHudProps {
  /** 프레이밍 프리셋이 가리키는 데생 인형 앵글로 카메라를 옮긴다. */
  readonly onCameraPreset: (preset: (typeof VRM_FRAMING_PRESETS)[number]["mannequinAngle"]) => void;
}

export function StudioMannequinFramingHud({ onCameraPreset }: StudioMannequinFramingHudProps): ReactElement {
  return (
    <div
      data-testid="mannequin-vrm-blendai-camera-hud"
      className="space-y-1.5 rounded-lg border border-line/70 bg-card/80 p-2 text-[0.68rem]"
    >
      <div className="font-semibold text-fg">
        VRM 4-View 카메라 프레이밍 & Blend-AI 실측 스케일 · 3점 조명(3:1:1.5)
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="VRM 4-View 프레이밍">
        {VRM_FRAMING_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-testid={`mannequin-vrm-cam-${preset.id}`}
            onClick={() => onCameraPreset(preset.mannequinAngle)}
            title={preset.descriptionKo}
            className="rounded border border-line bg-panel px-2 py-0.5 text-[0.64rem] text-fg-2 transition-colors hover:border-accent hover:bg-accent-soft hover:text-fg"
          >
            {preset.labelKo} ({preset.fovDeg}°)
          </button>
        ))}
      </div>
      <div className="text-[0.62rem] text-fg-3">
        배경 스케일 기준:{" "}
        {BLEND_AI_SCALE_GUIDES.map((g) => `${g.labelKo} ${g.meters}m`).join(" · ")} · 조명 비율{" "}
        <strong>Key:Fill:Rim = 3:1:1.5</strong>
      </div>
    </div>
  );
}
