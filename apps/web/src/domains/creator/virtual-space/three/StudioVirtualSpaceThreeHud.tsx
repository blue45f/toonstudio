import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { ProjectedOverlayItem, StudioThreeLightingPreset } from "./studio-virtual-space-three-dioramas";
import type { StudioThreeCameraMode } from "./studio-virtual-space-three-stage-props";
import "./studio-virtual-space-three-hud.css";

export interface StudioVirtualSpaceThreeHudProps {
  readonly overlays: readonly ProjectedOverlayItem[];
  readonly assetFailureCount: number;
  readonly lightingPreset: StudioThreeLightingPreset;
  readonly onLightingPresetChange: (preset: StudioThreeLightingPreset) => void;
  readonly onResetCamera: () => void;
  readonly onTriggerTarget: (kind: "workstation" | "npc", targetId: string) => void;
  readonly cameraMode?: StudioThreeCameraMode;
  readonly onCameraModeChange?: (mode: StudioThreeCameraMode) => void;
  readonly cutawayHiddenCount?: number;
  readonly ghostMode?: boolean;
  readonly onToggleGhostMode?: () => void;
  readonly onCapturePhotoToCut?: () => void;
}

const CAMERA_MODE_OPTIONS = [
  { id: "quarter", ko: "쿼터뷰 [1]", en: "Quarter [1]" },
  { id: "third-person", ko: "3인칭 [2]", en: "3rd Person [2]" },
  { id: "first-person", ko: "1인칭 [3]", en: "1st Person [3]" },
] as const;

const LIGHTING_PRESET_OPTIONS = [
  { id: "day", ko: "자연광 HDRI", en: "Day HDRI" },
  { id: "studio", ko: "스튜디오", en: "Studio" },
  { id: "night", ko: "나이트", en: "Night" },
] as const;

/** 3D 조명·카메라 모드·컷어웨이·포토부스·투영 배지 HUD (Starlight OKLCH 토큰 전용, 44px 터치 타깃). */
export function StudioVirtualSpaceThreeHud({
  overlays,
  assetFailureCount,
  lightingPreset,
  onLightingPresetChange,
  onResetCamera,
  onTriggerTarget,
  cameraMode = "quarter",
  onCameraModeChange,
  cutawayHiddenCount = 0,
  ghostMode = false,
  onToggleGhostMode,
  onCapturePhotoToCut,
}: StudioVirtualSpaceThreeHudProps) {
  const bt = useBilingual("StudioVirtualSpaceThreeCanvas");
  return (
    <>
      {assetFailureCount > 0 ? (
        <p role="status" className="studio-vspace-three-asset-status">
          {bt(
            "일부 3D 장비를 불러오지 못했어요. 다른 장비와 공간은 계속 이용할 수 있어요.",
            "Some 3D equipment could not load. Other equipment and rooms are still available.",
          )}
        </p>
      ) : null}

      <div
        className="studio-vspace-three-lighting-hud"
        role="group"
        aria-label={bt("조명과 시점", "Lighting and view")}
      >
        <div className="studio-vspace-three-lighting-hud__segment" role="group" aria-label={bt("카메라 시점", "Camera view")}>
          {CAMERA_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              data-testid={`three-camera-mode-${option.id}`}
              aria-pressed={cameraMode === option.id}
              onClick={() => onCameraModeChange?.(option.id)}
            >
              {bt(option.ko, option.en)}
            </button>
          ))}
        </div>

        <span
          className="studio-vspace-three-cutaway-badge"
          data-testid="three-hud-cutaway-state"
          data-cutaway-hidden-count={String(cutawayHiddenCount)}
          role="status"
          aria-live="polite"
        >
          {cutawayHiddenCount > 0
            ? bt(`자동 투과 ${cutawayHiddenCount}`, `Cutaway ${cutawayHiddenCount}`)
            : bt("전체 벽 표시", "Full walls")}
        </span>

        <div className="studio-vspace-three-lighting-hud__segment" role="group" aria-label={bt("조명 프리셋", "Lighting preset")}>
          {LIGHTING_PRESET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={lightingPreset === option.id}
              onClick={() => onLightingPresetChange(option.id)}
            >
              {bt(option.ko, option.en)}
            </button>
          ))}
        </div>

        {onToggleGhostMode ? (
          <button
            type="button"
            data-testid="three-ghost-mode-btn"
            aria-pressed={ghostMode}
            onClick={onToggleGhostMode}
          >
            {bt("고스트 [G]", "Ghost [G]")}
          </button>
        ) : null}

        <button
          type="button"
          className="studio-vspace-three-lighting-hud__photo"
          data-testid="three-photo-capture-cut-btn"
          onClick={() => onCapturePhotoToCut?.()}
        >
          {bt("2D 컷 촬영", "Capture to Cut")}
        </button>

        <button
          type="button"
          className="studio-vspace-three-lighting-hud__reset"
          onClick={onResetCamera}
        >
          {bt("시점 리셋 [C]", "Reset View [C]")}
        </button>
      </div>

      <div className="studio-vspace-three-overlays">
        {overlays.map((item) => {
          const target = (item.kind === "workstation" || item.kind === "npc") && item.targetId
            ? { kind: item.kind, id: item.targetId }
            : null;
          const badgeClass = [
            "studio-vspace-three-overlay-badge",
            `studio-vspace-three-overlay-badge--${item.kind}`,
            item.active ? "studio-vspace-three-overlay-badge--active" : "",
            target ? "studio-vspace-three-overlay-badge--interactive" : "",
          ].filter(Boolean).join(" ");

          return (
            <div
              key={item.id}
              className={badgeClass}
              data-overlay-kind={item.kind}
              role={target ? "button" : undefined}
              tabIndex={target ? 0 : undefined}
              onClick={target ? (event) => { event.stopPropagation(); onTriggerTarget(target.kind, target.id); } : undefined}
              onKeyDown={target ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onTriggerTarget(target.kind, target.id);
                }
              } : undefined}
              style={{ left: `${item.x}px`, top: `${item.y}px` }}
            >
              {item.kind === "self" || item.kind === "peer" || item.kind === "npc" || item.kind === "workstation" ? (
                <span className={`studio-vspace-three-overlay-dot studio-vspace-three-overlay-dot--${item.kind}`} />
              ) : null}
              <span>{item.label}</span>
              {item.sublabel ? (
                <span className="studio-vspace-three-overlay-sublabel">{item.sublabel}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
