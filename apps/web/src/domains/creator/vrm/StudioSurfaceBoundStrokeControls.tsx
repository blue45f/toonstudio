import { Trash2, Undo2 } from "lucide-react";

import { StudioThreeDToggleControl } from "../StudioThreeDToggle";

import type {
  SurfaceBoundStroke,
  SurfaceBoundStrokeToolConfig,
} from "./studio-surface-bound-stroke-engine";

import { cn } from "@/shared/lib/utils";

export interface StudioSurfaceBoundStrokeControlsProps {
  readonly config: SurfaceBoundStrokeToolConfig;
  readonly strokes: readonly SurfaceBoundStroke[];
  readonly lastBuildTimeMs?: number | null;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onChangeConfig: (next: SurfaceBoundStrokeToolConfig) => void;
  readonly onUndoStroke?: () => void;
  readonly onClearStrokes?: () => void;
}

const COLOR_TOKEN_OPTIONS = Object.freeze([
  { token: "ink-primary", labelKo: "잉크 검정" },
  { token: "ink-sepia", labelKo: "세피아" },
  { token: "ink-accent", labelKo: "포인트 선" },
  { token: "ink-white", labelKo: "하이라이트" },
] as const);

/**
 * 3D 캐릭터 표면 직드로잉(Surface-Bound Stroke) 제어 패널.
 * 바리센트릭 표면 고정 선 두께, 법선 오프셋, X축 대칭 드로잉, 포즈 실시간 추종을 제어한다.
 */
export function StudioSurfaceBoundStrokeControls({
  config,
  strokes,
  lastBuildTimeMs = null,
  disabled = false,
  className,
  onChangeConfig,
  onUndoStroke,
  onClearStrokes,
}: StudioSurfaceBoundStrokeControlsProps) {
  const totalSegments = strokes.reduce(
    (sum, stroke) => sum + Math.max(0, stroke.anchors.length - 1),
    0,
  );

  return (
    <section
      aria-label="3D 표면 직드로잉 설정"
      data-testid="studio-surface-bound-stroke-controls"
      className={cn(
        "rounded-xl border border-line bg-card p-3 text-fg",
        className,
      )}
    >
      <StudioThreeDToggleControl
        checked={config.enabled}
        disabled={disabled}
        label="표면 구속 3D 직드로잉"
        description="메시 삼각형 표면에 선을 고정해 포즈를 바꿔도 선이 함께 따라갑니다."
        labelClassName="text-xs font-semibold text-fg"
        descriptionClassName="text-[0.6875rem] text-fg-3"
        onChange={(enabled) => onChangeConfig({ ...config, enabled })}
      />

      <div className="mt-1.5 space-y-1 border-t border-line/70 pt-1.5">
        <StudioThreeDToggleControl
          checked={config.mirrorX}
          disabled={disabled || !config.enabled}
          label="좌우 대칭(X) 자동 복제"
          description="한쪽 얼굴·의상에 그린 선을 반대쪽 표면에 대칭 고정합니다."
          labelClassName="text-xs font-medium text-fg-2"
          descriptionClassName="text-[0.6875rem] text-fg-3"
          onChange={(mirrorX) => onChangeConfig({ ...config, mirrorX })}
        />
        <StudioThreeDToggleControl
          checked={config.liveDeformFollow}
          disabled={disabled || !config.enabled}
          label="포즈 변형 실시간 추종"
          description="관절 회전·표정 블렌드셰이프마다 스트로크 정점을 다시 계산합니다."
          labelClassName="text-xs font-medium text-fg-2"
          descriptionClassName="text-[0.6875rem] text-fg-3"
          onChange={(liveDeformFollow) => onChangeConfig({ ...config, liveDeformFollow })}
        />
      </div>

      <div className="mt-2.5 space-y-2 border-t border-line/70 pt-2.5">
        <label className="block rounded-lg border border-line/80 bg-panel px-2.5 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-fg-2">선 굵기</span>
            <span aria-hidden="true" className="tabular-nums text-[0.6875rem] text-fg-3">
              {config.widthMm.toFixed(1)} mm
            </span>
          </div>
          <input
            type="range"
            aria-label="선 굵기"
            min={0.4}
            max={12}
            step={0.2}
            value={config.widthMm}
            disabled={disabled || !config.enabled}
            onChange={(event) => onChangeConfig({
              ...config,
              widthMm: event.currentTarget.valueAsNumber,
            })}
            className="mt-1 h-7 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
          />
        </label>

        <label className="block rounded-lg border border-line/80 bg-panel px-2.5 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-fg-2">표면 띄움 (Z-충돌 방지)</span>
            <span aria-hidden="true" className="tabular-nums text-[0.6875rem] text-fg-3">
              {config.normalOffsetMm.toFixed(1)} mm
            </span>
          </div>
          <input
            type="range"
            aria-label="표면 띄움"
            min={0.1}
            max={5}
            step={0.1}
            value={config.normalOffsetMm}
            disabled={disabled || !config.enabled}
            onChange={(event) => onChangeConfig({
              ...config,
              normalOffsetMm: event.currentTarget.valueAsNumber,
            })}
            className="mt-1 h-7 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
          />
        </label>

        <div role="group" aria-label="스트로크 선 색상 슬롯" className="grid grid-cols-2 gap-1.5">
          {COLOR_TOKEN_OPTIONS.map((option) => (
            <button
              key={option.token}
              type="button"
              disabled={disabled || !config.enabled}
              aria-pressed={config.colorToken === option.token}
              onClick={() => onChangeConfig({ ...config, colorToken: option.token })}
              className={cn(
                "min-h-11 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                config.colorToken === option.token
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
            >
              {option.labelKo}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-line/70 pt-2.5">
        <button
          type="button"
          disabled={disabled || strokes.length === 0 || !onUndoStroke}
          onClick={onUndoStroke}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Undo2 className="size-3.5" aria-hidden="true" />
          마지막 선 취소
        </button>
        <button
          type="button"
          disabled={disabled || strokes.length === 0 || !onClearStrokes}
          onClick={onClearStrokes}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          전체 지우기
        </button>
      </div>

      <p role="status" className="mt-2 text-[0.6875rem] tabular-nums text-fg-3">
        고정 선 {strokes.length}개 · {totalSegments} 세그먼트
        {typeof lastBuildTimeMs === "number" ? ` · 리본 갱신 ${lastBuildTimeMs.toFixed(2)}ms` : ""}
      </p>
    </section>
  );
}
