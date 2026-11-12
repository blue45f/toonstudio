/**
 * Studio 3D 데생 인형 — VRM 4-View 카메라 프레이밍·4분할 사면도·만화 원근 화각(FOV)·3점 조명 안내.
 *
 * `StudioMannequinCameraSection.tsx`의 동결 줄 수 기준선(<= 262줄, r4frz 계약)을 엄격히 지키면서
 * 4분할 사면도(All-Sides Quad View)와 만화 원근 화각(15°~85°) 및 모바일 44px 터치 타깃을 제공한다.
 */

import { Grid2x2 } from "lucide-react";
import type { ReactElement } from "react";

import { StudioSliderRow, StudioToggleChip } from "../studio-panel-ui";
import { BLEND_AI_SCALE_GUIDES, VRM_FRAMING_PRESETS } from "./studio-gen3d-ecosystem-engine";
import {
  STUDIO_MANNEQUIN_FOV_DEFAULT_DEG,
  STUDIO_MANNEQUIN_FOV_MAX_DEG,
  STUDIO_MANNEQUIN_FOV_MIN_DEG,
  STUDIO_MANNEQUIN_LENS_PRESETS,
} from "./studio-mannequin-quad-view";
import type { StudioMannequinProjection } from "./studio-mannequin-scene";

export interface StudioMannequinFramingHudProps {
  /** 프레이밍 프리셋이 가리키는 데생 인형 앵글로 카메라를 옮긴다. */
  readonly onCameraPreset: (preset: (typeof VRM_FRAMING_PRESETS)[number]["mannequinAngle"]) => void;
  readonly projection?: StudioMannequinProjection;
  readonly quadView?: boolean;
  readonly onToggleQuadView?: (next: boolean) => void;
  readonly cameraFovDeg?: number;
  readonly onCameraFovChange?: (fovDeg: number) => void;
}

export function StudioMannequinFramingHud({
  onCameraPreset,
  projection = "perspective",
  quadView = false,
  onToggleQuadView,
  cameraFovDeg = STUDIO_MANNEQUIN_FOV_DEFAULT_DEG,
  onCameraFovChange,
}: StudioMannequinFramingHudProps): ReactElement {
  return (
    <div className="space-y-2.5">
      <div
        data-testid="mannequin-vrm-blendai-camera-hud"
        className="space-y-1.5 rounded-lg border border-line/70 bg-card/80 p-2 text-[0.72rem]"
      >
        <div className="font-semibold text-fg">
          VRM 4-View 카메라 프레이밍 & Blend-AI 실측 스케일 · 3점 조명(3:1:1.5)
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="VRM 4-View 프레이밍">
          {VRM_FRAMING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`mannequin-vrm-cam-${preset.id}`}
              onClick={() => onCameraPreset(preset.mannequinAngle)}
              title={preset.descriptionKo}
              className="min-h-6 rounded-md border border-line bg-panel px-2 py-0.5 text-[0.7rem] text-fg-2 transition-colors hover:border-accent hover:bg-accent-soft hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11 pointer-coarse:px-2.5"
            >
              {preset.labelKo} ({preset.fovDeg}°)
            </button>
          ))}
        </div>
        <div className="text-[0.7rem] text-fg-3">
          배경 스케일 기준:{" "}
          {BLEND_AI_SCALE_GUIDES.map((g) => `${g.labelKo} ${g.meters}m`).join(" · ")} · 조명 비율{" "}
          <strong>Key:Fill:Rim = 3:1:1.5</strong>
        </div>
      </div>

      {onToggleQuadView ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 bg-card/50 px-2.5 py-2">
          <StudioToggleChip
            active={quadView}
            onClick={() => onToggleQuadView(!quadView)}
            title="투시·정면·측면·탑뷰 4개 각도를 한 화면에서 동시에 조작·검증합니다"
          >
            <Grid2x2 size={12} aria-hidden /> 4분할 사면도 {quadView ? "ON" : "OFF"}
          </StudioToggleChip>
          <span role="status" aria-live="polite" className="text-[0.7rem] text-fg-3">
            {quadView ? "각 사분면에서 직접 관절·IK 조작 가능" : "단일 뷰포트 모드"}
          </span>
        </div>
      ) : null}

      {onCameraFovChange && projection === "perspective" ? (
        <div className="space-y-1.5 rounded-xl border border-line/70 bg-card/50 p-2.5">
          <StudioSliderRow
            label="만화 원근 화각(FOV)"
            min={STUDIO_MANNEQUIN_FOV_MIN_DEG}
            max={STUDIO_MANNEQUIN_FOV_MAX_DEG}
            step={1}
            value={Math.round(cameraFovDeg)}
            onChange={onCameraFovChange}
            readout={`${Math.round(cameraFovDeg)}°`}
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="렌즈 화각 프리셋">
            {STUDIO_MANNEQUIN_LENS_PRESETS.map((lens) => (
              <StudioToggleChip
                key={lens.id}
                active={Math.abs(cameraFovDeg - lens.fovDeg) <= 1}
                onClick={() => onCameraFovChange(lens.fovDeg)}
                title={lens.desc}
              >
                {lens.label}
              </StudioToggleChip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
