/**
 * 멀티 디바이스 생태계 허브의 입력·필압 시필 패널.
 *
 * - 디지타이저 필압 커브(light/balanced/heavy + 감마) · 기울기 음영 · 배럴 회전 · 펜 사이드 버튼 3단
 * - 마우스 속도 자동 테이퍼 시필 패드 · 맥북 트랙패드 Force Touch/0° 스냅 · 아이패드 멀티터치 제스처
 */

import { PenTool } from "lucide-react";
import { useId, useMemo, useRef, useState, type PointerEvent, type ReactElement } from "react";

import {
  PEN_SIDE_BUTTON_PRESETS,
  STYLUS_PRESSURE_PRESETS,
  computeMouseVelocityTaper,
  evaluateBarrelTwist,
  evaluateStylusPressureCurve,
  evaluateStylusTiltShading,
  interpretTouchscreenGesture,
  interpretTrackpadGesture,
  resolvePenSideButtonAction,
  type PenSideButtonPreset,
  type PressureCurvePresetId,
} from "./peripheral-input-orchestrator";

interface TestPadPoint {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
}

export interface StudioStylusTouchTestPanelProps {
  readonly statusMessageKo: string;
  readonly onStatusChange: (messageKo: string) => void;
}

export function StudioStylusTouchTestPanel({
  statusMessageKo,
  onStatusChange,
}: StudioStylusTouchTestPanelProps): ReactElement {
  const gammaInputId = useId();
  const tiltInputId = useId();
  const twistInputId = useId();
  const trackpadAngleId = useId();

  const [pressurePreset, setPressurePreset] = useState<PressureCurvePresetId>("balanced");
  const [customGamma, setCustomGamma] = useState<number>(STYLUS_PRESSURE_PRESETS.balanced.gamma);
  const [tiltAngleDeg, setTiltAngleDeg] = useState<number>(28);
  const [twistAngleDeg, setTwistAngleDeg] = useState<number>(45);
  const [sideButtonPreset, setSideButtonPreset] = useState<PenSideButtonPreset["id"]>("webtoon-ink");
  const [trackpadAngleDeg, setTrackpadAngleDeg] = useState<number>(4);
  const [forceTouchActive, setForceTouchActive] = useState<boolean>(false);

  const [testStroke, setTestStroke] = useState<readonly TestPadPoint[]>([
    { x: 24, y: 88, widthPx: 2.5 },
    { x: 96, y: 52, widthPx: 6.4 },
    { x: 184, y: 74, widthPx: 7.2 },
    { x: 280, y: 40, widthPx: 3.1 },
  ]);
  const [lastSamplePressure, setLastSamplePressure] = useState<number>(0.62);
  const [lastSampleSpeed, setLastSampleSpeed] = useState<number>(480);

  const drawingPadRef = useRef<{ active: boolean; lastX: number; lastY: number; lastTime: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
  });

  const pressureConfig = useMemo(
    () => ({ ...STYLUS_PRESSURE_PRESETS[pressurePreset], gamma: customGamma }),
    [pressurePreset, customGamma],
  );
  const pressureMetrics = evaluateStylusPressureCurve(lastSamplePressure, pressureConfig);
  const tiltMetrics = evaluateStylusTiltShading(tiltAngleDeg, Math.round(tiltAngleDeg * 0.45));
  const twistMetrics = evaluateBarrelTwist(twistAngleDeg);
  const mouseTaper = computeMouseVelocityTaper({ speedPxPerSec: lastSampleSpeed });
  const trackpadResult = interpretTrackpadGesture({
    pinchScale: 1.15,
    rotationDeg: trackpadAngleDeg,
    forceLevel: forceTouchActive ? 1.2 : 0.2,
  });

  const handleSelectPressurePreset = (preset: PressureCurvePresetId): void => {
    setPressurePreset(preset);
    setCustomGamma(STYLUS_PRESSURE_PRESETS[preset].gamma);
  };

  const handleRunSyntheticStroke = (): void => {
    const calibrated = evaluateStylusPressureCurve(0.75, pressureConfig);
    const taper = computeMouseVelocityTaper({ speedPxPerSec: 940, strokeProgress: 0.7 });
    setLastSamplePressure(0.75);
    setLastSampleSpeed(940);
    setTestStroke([
      { x: 20, y: 100, widthPx: 2 },
      { x: 92, y: 38, widthPx: Math.max(2, calibrated.strokeWidthFactor * 6.5) },
      { x: 196, y: 82, widthPx: Math.max(2, taper.taperWidthFactor * 6) },
      { x: 300, y: 34, widthPx: 1.8 },
    ]);
    onStatusChange(
      `시필 완료 · 보정 필압 ${calibrated.calibratedPressure} · ${taper.phaseKo} · 기울기 음영 ×${tiltMetrics.shadingWidthMultiplier}`,
    );
  };

  const readPadCoords = (event: PointerEvent<SVGSVGElement>): { readonly x: number; readonly y: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 320;
    const height = rect.height > 0 ? rect.height : 140;
    return {
      x: Math.min(316, Math.max(4, ((event.clientX - rect.left) / width) * 320)),
      y: Math.min(136, Math.max(4, ((event.clientY - rect.top) / height) * 140)),
    };
  };

  const handleTestPadDown = (event: PointerEvent<SVGSVGElement>): void => {
    const { x, y } = readPadCoords(event);
    const rawPressure = event.pressure > 0 ? event.pressure : 0.65;
    const calibrated = evaluateStylusPressureCurve(rawPressure, pressureConfig);
    drawingPadRef.current = { active: true, lastX: x, lastY: y, lastTime: event.timeStamp || Date.now() };
    setLastSamplePressure(rawPressure);
    setTestStroke([{ x, y, widthPx: Math.max(1.5, calibrated.strokeWidthFactor * 6) }]);
  };

  const handleTestPadMove = (event: PointerEvent<SVGSVGElement>): void => {
    if (!drawingPadRef.current.active) return;
    const { x, y } = readPadCoords(event);
    const nowMs = event.timeStamp || Date.now();
    const dtSec = Math.max(0.008, (nowMs - drawingPadRef.current.lastTime) / 1000);
    const dist = Math.hypot(x - drawingPadRef.current.lastX, y - drawingPadRef.current.lastY);
    const speed = Math.min(3_500, dist / dtSec);
    const rawPressure =
      event.pointerType === "pen" && event.pressure > 0
        ? event.pressure
        : computeMouseVelocityTaper({ speedPxPerSec: speed }).syntheticPressure;
    const calibrated = evaluateStylusPressureCurve(rawPressure, pressureConfig);
    drawingPadRef.current = { active: true, lastX: x, lastY: y, lastTime: nowMs };
    setLastSamplePressure(rawPressure);
    setLastSampleSpeed(Math.round(speed));
    setTestStroke((prev) => [
      ...prev.slice(-48),
      { x, y, widthPx: Math.max(1.5, calibrated.strokeWidthFactor * 6 * tiltMetrics.shadingWidthMultiplier * 0.65) },
    ]);
  };

  const handleTestPadUp = (): void => {
    drawingPadRef.current.active = false;
  };

  const strokePathData = testStroke
    .map((pt, idx) => `${idx === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(" ");
  const avgStrokeWidth =
    testStroke.length > 0 ? testStroke.reduce((sum, pt) => sum + pt.widthPx, 0) / testStroke.length : 3;

  return (
    <div data-testid="mde-stylus-touch-panel" className="mde-split-grid">
      <section className="mde-panel-surface" aria-label="디지타이저 필압 커브 및 시필 패드">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-fg">
            <PenTool className="size-4 text-accent" aria-hidden="true" />
            필압 커브 · 배럴 회전 · 기울기 · 마우스 테이퍼 시필
          </h3>
          <button
            type="button"
            data-testid="mde-run-synthetic-stroke"
            className="mde-chip"
            onClick={handleRunSyntheticStroke}
          >
            시필 획 테스트
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="필압 커브 프리셋">
          {(["light", "balanced", "heavy"] as readonly PressureCurvePresetId[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className="mde-chip"
              aria-pressed={pressurePreset === preset}
              onClick={() => handleSelectPressurePreset(preset)}
            >
              {STYLUS_PRESSURE_PRESETS[preset].labelKo}
            </button>
          ))}
        </div>

        <div className="mde-test-pad">
          <svg
            data-testid="mde-pressure-test-pad"
            viewBox="0 0 320 140"
            role="img"
            aria-label="디지타이저 및 마우스 필압 시필 패드"
            className="mde-test-pad-svg"
            onPointerDown={handleTestPadDown}
            onPointerMove={handleTestPadMove}
            onPointerUp={handleTestPadUp}
            onPointerLeave={handleTestPadUp}
          >
            <path
              d={strokePathData}
              fill="none"
              strokeWidth={avgStrokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mde-stroke-accent"
            />
          </svg>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label htmlFor={gammaInputId} className="text-xs text-fg-2">
            감마: <strong className="mde-num text-fg">{customGamma.toFixed(2)}</strong>
            <input
              id={gammaInputId}
              type="range"
              min={0.4}
              max={2.2}
              step={0.05}
              value={customGamma}
              onChange={(event) => setCustomGamma(Number(event.target.value))}
              className="mde-range"
            />
          </label>
          <label htmlFor={tiltInputId} className="text-xs text-fg-2">
            기울기:{" "}
            <strong className="mde-num text-fg">
              {tiltAngleDeg}° (×{tiltMetrics.shadingWidthMultiplier})
            </strong>
            <input
              id={tiltInputId}
              type="range"
              min={0}
              max={70}
              value={tiltAngleDeg}
              onChange={(event) => setTiltAngleDeg(Number(event.target.value))}
              className="mde-range"
            />
          </label>
          <label htmlFor={twistInputId} className="text-xs text-fg-2">
            배럴 회전: <strong className="mde-num text-fg">{twistMetrics.effectiveNibAngleDeg}°</strong>
            <input
              id={twistInputId}
              type="range"
              min={0}
              max={359}
              value={twistAngleDeg}
              onChange={(event) => setTwistAngleDeg(Number(event.target.value))}
              className="mde-range"
            />
          </label>
        </div>

        <p className="mde-num text-xs text-fg-2">
          보정 필압 {pressureMetrics.calibratedPressure} · 선 굵기 배율 ×{pressureMetrics.strokeWidthFactor} ·
          마우스 자기 보정 α={mouseTaper.magneticSmoothingAlpha}
        </p>
      </section>

      <section className="mde-panel-surface" aria-label="펜 사이드 버튼 · 트랙패드 · 아이패드 제스처">
        <h3 className="text-sm font-bold text-fg">펜 사이드 버튼 3단 · 트랙패드 · 아이패드 제스처</h3>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="펜 사이드 버튼 3단 프리셋">
          {(["webtoon-ink", "color-painter", "apple-pencil-pro"] as const).map((presetId) => (
            <button
              key={presetId}
              type="button"
              className="mde-chip"
              aria-pressed={sideButtonPreset === presetId}
              onClick={() => setSideButtonPreset(presetId)}
            >
              {PEN_SIDE_BUTTON_PRESETS[presetId].labelKo}
            </button>
          ))}
        </div>

        <dl className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-3">
          {(["primary-lower", "secondary-upper", "tail-double-tap"] as const).map((slot) => {
            const resolved = resolvePenSideButtonAction(slot, sideButtonPreset);
            const slotTitle =
              slot === "primary-lower" ? "하단 버튼" : slot === "secondary-upper" ? "상단 버튼" : "더블탭·테일";
            return (
              <div key={slot} className="mde-capability-row">
                <dt className="text-fg-3">{slotTitle}</dt>
                <dd className="font-bold text-fg">{resolved.labelKo}</dd>
              </div>
            );
          })}
        </dl>

        <div className="mde-divider-block">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={trackpadAngleId} className="text-xs font-semibold text-fg-2">
              맥북 트랙패드 핀치 회전 0° 자석 스냅:{" "}
              <strong className="mde-num text-fg">{trackpadResult.rotation.detentLabelKo}</strong>
            </label>
            <button
              type="button"
              className="mde-chip"
              aria-pressed={forceTouchActive}
              onClick={() => setForceTouchActive((prev) => !prev)}
            >
              Force Touch {forceTouchActive ? "활성(스포이드)" : "테스트"}
            </button>
          </div>
          <input
            id={trackpadAngleId}
            type="range"
            min={-30}
            max={30}
            value={trackpadAngleDeg}
            onChange={(event) => setTrackpadAngleDeg(Number(event.target.value))}
            className="mde-range"
          />
        </div>

        <div className="mde-divider-block">
          <p className="text-xs font-semibold text-fg-2">아이패드 · 터치스크린 제스처 테스트</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="mde-chip"
              onClick={() =>
                onStatusChange(
                  interpretTouchscreenGesture({ fingerCount: 2, durationMs: 140, moveDistancePx: 3 }).labelKo,
                )
              }
            >
              2지 탭 (Undo)
            </button>
            <button
              type="button"
              className="mde-chip"
              onClick={() =>
                onStatusChange(
                  interpretTouchscreenGesture({ fingerCount: 3, durationMs: 150, moveDistancePx: 4 }).labelKo,
                )
              }
            >
              3지 탭 (Redo)
            </button>
            <button
              type="button"
              className="mde-chip"
              onClick={() =>
                onStatusChange(
                  interpretTouchscreenGesture({ fingerCount: 1, durationMs: 520, moveDistancePx: 2 }).labelKo,
                )
              }
            >
              롱프레스 (스포이드)
            </button>
            <button
              type="button"
              className="mde-chip"
              onClick={() =>
                onStatusChange(
                  interpretTouchscreenGesture({
                    fingerCount: 1,
                    durationMs: 120,
                    moveDistancePx: 2,
                    maxContactDiameterPx: 36,
                  }).labelKo,
                )
              }
            >
              팜 리젝션 테스트
            </button>
          </div>
        </div>

        <p role="status" aria-live="polite" className="text-xs text-fg-2">
          {statusMessageKo}
        </p>
      </section>
    </div>
  );
}
