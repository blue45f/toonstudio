import type { KeyboardEvent, PointerEvent, RefObject } from "react";

import { HologramPlaneStack } from "./HologramPlaneStack";
import type { HologramDemoScenePreset } from "./hologram-demo-scenes";
import type {
  HologramLayerSpec,
  HologramProjectionResult,
  HologramViewMode,
  HologramViewerPose,
  QuiltCameraArray,
  QuiltViewCamera,
  StereoEyePosesResult,
} from "./hologram-spatial-projection";

export interface HologramStageTheaterProps {
  readonly instanceId: string;
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly viewMode: HologramViewMode;
  readonly activeScene: HologramDemoScenePreset;
  readonly activeLayers: readonly HologramLayerSpec[];
  readonly resolvedLocale: "ko" | "en";
  readonly text: (ko: string, en: string) => string;
  readonly effectivePose: HologramViewerPose;
  readonly effectiveReducedMotion: boolean;
  readonly holofoilIntensity: number;
  readonly ipdMm: number;
  readonly mainProjection: HologramProjectionResult;
  readonly stereoPoses: StereoEyePosesResult;
  readonly leftEyeProjection: HologramProjectionResult;
  readonly rightEyeProjection: HologramProjectionResult;
  readonly quiltArray: QuiltCameraArray;
  readonly selectedQuiltView: QuiltViewCamera;
  readonly quiltSelectedProjection: HologramProjectionResult;
  readonly onSelectQuiltIndex: (index: number) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

function formatSignedMm(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}mm` : `${rounded}mm`;
}

export function HologramStageTheater({
  instanceId,
  stageRef,
  viewMode,
  activeScene,
  activeLayers,
  resolvedLocale,
  text,
  effectivePose,
  effectiveReducedMotion,
  holofoilIntensity,
  ipdMm,
  mainProjection,
  stereoPoses,
  leftEyeProjection,
  rightEyeProjection,
  quiltArray,
  selectedQuiltView,
  quiltSelectedProjection,
  onSelectQuiltIndex,
  onPointerMove,
  onPointerDown,
  onKeyDown,
}: HologramStageTheaterProps): React.JSX.Element {
  const eyeValueText = text(
    `시점 X ${formatSignedMm(effectivePose.eyeXMm)}, Y ${formatSignedMm(effectivePose.eyeYMm)}`,
    `Eye X ${formatSignedMm(effectivePose.eyeXMm)}, Y ${formatSignedMm(effectivePose.eyeYMm)}`,
  );

  return (
    <div
      id={`${instanceId}-tabpanel`}
      role="tabpanel"
      aria-labelledby={`${instanceId}-tab-${viewMode}`}
      className="holo-stage-tabpanel"
    >
      {viewMode === "quilt-32" ? (
        <div
          ref={stageRef}
          className="holo-stage-frame"
          data-testid="holo-stage-viewport"
          data-reduced-motion={effectiveReducedMotion ? "true" : "false"}
        >
          <div className="holo-quilt-shell" data-testid="holo-quilt-view">
            <div
              className="holo-quilt-grid"
              role="group"
              aria-label={text(
                "Looking Glass 4×8 라이트필드 시점 배열",
                "Looking Glass 4x8 lightfield camera grid",
              )}
            >
              {quiltArray.views.map((view) => {
                const isSelected = view.viewIndex === selectedQuiltView.viewIndex;
                return (
                  <button
                    key={view.viewIndex}
                    type="button"
                    className="holo-quilt-cell"
                    aria-pressed={isSelected}
                    data-testid={`holo-quilt-cell-${view.viewIndex}`}
                    onClick={() => onSelectQuiltIndex(view.viewIndex)}
                  >
                    <span>#{view.viewIndex + 1}</span>
                    <span>{view.azimuthDeg.toFixed(1)}°</span>
                  </button>
                );
              })}
            </div>

            <div className="holo-quilt-inspector">
              <div className="holo-quilt-preview-box">
                <HologramPlaneStack
                  scene={activeScene}
                  layers={activeLayers}
                  transforms={quiltSelectedProjection.transforms}
                  locale={resolvedLocale}
                  idPrefix={`${instanceId}-quilt-selected`}
                  showPrismaticSheen
                  holofoilIntensity={holofoilIntensity}
                  eyeXMm={selectedQuiltView.cameraPositionMm.x}
                  reducedMotion={effectiveReducedMotion}
                />
              </div>
              <dl className="holo-quilt-meta">
                <div>
                  <dt>{text("선택 뷰", "Selected View")}</dt>
                  <dd>
                    #{selectedQuiltView.viewIndex + 1} / {quiltArray.totalViews} ({quiltArray.cols}×{quiltArray.rows})
                  </dd>
                </div>
                <div>
                  <dt>{text("방위각", "Azimuth")}</dt>
                  <dd>{selectedQuiltView.azimuthDeg.toFixed(2)}°</dd>
                </div>
                <div>
                  <dt>{text("카메라 X", "Camera X")}</dt>
                  <dd>{formatSignedMm(selectedQuiltView.cameraPositionMm.x)}</dd>
                </div>
                <div>
                  <dt>{text("프러스텀 시프트", "Frustum Shift")}</dt>
                  <dd>{selectedQuiltView.frustumShift.toFixed(4)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={stageRef}
          role="slider"
          aria-valuemin={-160}
          aria-valuemax={160}
          aria-valuenow={Math.round(effectivePose.eyeXMm)}
          aria-valuetext={eyeValueText}
          className="holo-stage-frame"
          data-testid="holo-stage-viewport"
          data-reduced-motion={effectiveReducedMotion ? "true" : "false"}
          tabIndex={0}
          aria-label={text(
            "5-평면 홀로그램 컷 극장 — 포인터 이동이나 방향키로 시점을 기울이고 Home 키로 중앙 정렬하세요",
            "5-plane holographic cut theater — move pointer or press arrow keys to tilt view, press Home to recenter",
          )}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
        >
          {viewMode === "off-axis" ? (
            <HologramPlaneStack
              scene={activeScene}
              layers={activeLayers}
              transforms={mainProjection.transforms}
              locale={resolvedLocale}
              idPrefix={`${instanceId}-main`}
              showPrismaticSheen
              holofoilIntensity={holofoilIntensity}
              eyeXMm={effectivePose.eyeXMm}
              eyeYMm={effectivePose.eyeYMm}
              reducedMotion={effectiveReducedMotion}
            />
          ) : null}

          {viewMode === "stereo-sbs" ? (
            <div className="holo-stereo-sbs-grid" data-testid="holo-stereo-sbs-view">
              <div className="holo-stereo-eye-pane" data-eye="left">
                <span className="holo-eye-tag">
                  {text("좌안 L", "Left L")} · {formatSignedMm(stereoPoses.leftEye.eyeXMm)}
                </span>
                <HologramPlaneStack
                  scene={activeScene}
                  layers={activeLayers}
                  transforms={leftEyeProjection.transforms}
                  locale={resolvedLocale}
                  idPrefix={`${instanceId}-sbs-left`}
                  reducedMotion={effectiveReducedMotion}
                />
              </div>
              <div className="holo-stereo-eye-pane" data-eye="right">
                <span className="holo-eye-tag">
                  {text("우안 R", "Right R")} · {formatSignedMm(stereoPoses.rightEye.eyeXMm)}
                </span>
                <HologramPlaneStack
                  scene={activeScene}
                  layers={activeLayers}
                  transforms={rightEyeProjection.transforms}
                  locale={resolvedLocale}
                  idPrefix={`${instanceId}-sbs-right`}
                  reducedMotion={effectiveReducedMotion}
                />
              </div>
            </div>
          ) : null}

          {viewMode === "anaglyph" ? (
            <div className="holo-anaglyph-stack" data-testid="holo-anaglyph-view">
              <div className="holo-anaglyph-eye" data-channel="left">
                <HologramPlaneStack
                  scene={activeScene}
                  layers={activeLayers}
                  transforms={leftEyeProjection.transforms}
                  locale={resolvedLocale}
                  idPrefix={`${instanceId}-ana-left`}
                  reducedMotion={effectiveReducedMotion}
                />
                <div className="holo-anaglyph-tint" data-channel="left" aria-hidden="true" />
              </div>
              <div className="holo-anaglyph-eye" data-channel="right">
                <HologramPlaneStack
                  scene={activeScene}
                  layers={activeLayers}
                  transforms={rightEyeProjection.transforms}
                  locale={resolvedLocale}
                  idPrefix={`${instanceId}-ana-right`}
                  reducedMotion={effectiveReducedMotion}
                />
                <div className="holo-anaglyph-tint" data-channel="right" aria-hidden="true" />
              </div>
            </div>
          ) : null}

          <div className="holo-stage-hud">
            <span className="holo-hud-chip" data-testid="holo-eye-readout">
              {text("시점", "Eye")} ({formatSignedMm(effectivePose.eyeXMm)}, {formatSignedMm(effectivePose.eyeYMm)},{" "}
              {Math.round(effectivePose.eyeZMm)}mm)
            </span>
            <span className="holo-hud-chip">
              IPD {ipdMm}mm · {resolvedLocale === "ko" ? activeScene.genreTagKo : activeScene.genreTagEn}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
