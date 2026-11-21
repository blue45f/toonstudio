import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import {
  normalizeStudioPressureCurvePoints,
  studioPressureCurveToProfile,
  type StudioPressureCurvePoint,
} from "./brush/studio-pressure-curve-editor";
import { fitStudioStylusPressureProfile } from "./brush/studio-stylus-pressure-profile";
import { setStudioStylusPressureProfile } from "./brush/studio-stylus-pressure-profile-store";
import {
  ColorDropThresholdController,
  type ColorDropSessionState,
} from "./drawing/studio-pressure-curve-and-colordrop";
import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import {
  recommendStudioPressureCurveExponent,
  studioPressureCalibrationStats,
  studioPressureCurveMap,
  studioPressurePreviewDiameter,
} from "./studio-pressure-curve-graph";

import { cn } from "@/shared/lib/utils";

const TEST_W = 320;
const TEST_H = 78;
const TEST_POINT_LIMIT = 180;
const COLORDROP_STORAGE_KEY = "toonstudio:colordrop-settings:v1";

interface StudioPressureTestPoint {
  readonly x: number;
  readonly y: number;
  readonly rawPressure: number;
}

interface StoredColorDropConfig {
  readonly thresholdPercent: number;
  readonly holdDelayMs: number;
}

type CoalescedPointerEvent = PointerEvent & {
  getCoalescedEvents?: () => readonly PointerEvent[];
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pressurePercent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function safeCoalescedPointerEvents(event: PointerEvent): readonly PointerEvent[] {
  const method = (event as CoalescedPointerEvent).getCoalescedEvents;
  if (typeof method !== "function") return [event];
  try {
    const samples = method.call(event);
    return samples.length > 0 ? samples : [event];
  } catch {
    return [event];
  }
}

function normalizedReportedPressure(event: PointerEvent): number {
  const reportedPressure = Number.isFinite(event.pressure) ? event.pressure : 0;
  if (reportedPressure > 0) return clamp(reportedPressure, 0, 1);
  if (event.pointerType === "mouse" || event.pointerType === "touch") return 0.5;
  return 0;
}

function normalizedTestPoint(
  event: PointerEvent,
  rect: DOMRect,
): StudioPressureTestPoint | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const x = clamp(((event.clientX - rect.left) / rect.width) * TEST_W, 0, TEST_W);
  const y = clamp(((event.clientY - rect.top) / rect.height) * TEST_H, 0, TEST_H);
  return { x, y, rawPressure: normalizedReportedPressure(event) };
}

function loadStoredColorDropConfig(): StoredColorDropConfig {
  if (typeof window === "undefined") return { thresholdPercent: 35, holdDelayMs: 450 };
  try {
    const raw = window.localStorage.getItem(COLORDROP_STORAGE_KEY);
    if (!raw) return { thresholdPercent: 35, holdDelayMs: 450 };
    const parsed = JSON.parse(raw) as Partial<StoredColorDropConfig>;
    return {
      thresholdPercent: Math.round(clamp(typeof parsed.thresholdPercent === "number" && Number.isFinite(parsed.thresholdPercent) ? parsed.thresholdPercent : 35, 0, 100)),
      holdDelayMs: Math.round(clamp(typeof parsed.holdDelayMs === "number" && Number.isFinite(parsed.holdDelayMs) ? parsed.holdDelayMs : 450, 200, 800)),
    };
  } catch {
    return { thresholdPercent: 35, holdDelayMs: 450 };
  }
}

function persistColorDropConfig(config: StoredColorDropConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLORDROP_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Private mode / quota fallback
  }
}

export interface StudioPressureCalibrationPanelProps {
  readonly pressureCurve: number;
  readonly onPressureCurveChange: (value: number) => void;
  readonly pressureMinSize: number;
  readonly density: "compact" | "touch";
  readonly onSplineFitApply?: (points: readonly StudioPressureCurvePoint[]) => void;
}

export function StudioPressureCalibrationPanel({
  pressureCurve,
  onPressureCurveChange,
  pressureMinSize,
  density,
  onSplineFitApply,
}: StudioPressureCalibrationPanelProps): ReactElement {
  const touch = density === "touch";
  const testPointerIdRef = useRef<number | null>(null);
  const [testPoints, setTestPoints] = useState<readonly StudioPressureTestPoint[]>([]);
  const [splineAppliedNotice, setSplineAppliedNotice] = useState(false);

  const [colorDropConfig, setColorDropConfig] = useState<StoredColorDropConfig>(() =>
    loadStoredColorDropConfig(),
  );
  const colorDropControllerRef = useRef<ColorDropThresholdController>(
    new ColorDropThresholdController({
      initialThresholdPercent: colorDropConfig.thresholdPercent,
      holdDelayMs: colorDropConfig.holdDelayMs,
      scrubPixelsForFullRange: 200,
    }),
  );
  const [colorDropSession, setColorDropSession] = useState<ColorDropSessionState>({
    phase: "idle",
    thresholdPercent: colorDropConfig.thresholdPercent,
    anchorX: 0,
    anchorY: 0,
  });
  const scrubPointerIdRef = useRef<number | null>(null);
  const scrubLastXRef = useRef<number>(0);
  const scrubHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScrubHoldTimer = (): void => {
    if (scrubHoldTimerRef.current !== null) {
      clearTimeout(scrubHoldTimerRef.current);
      scrubHoldTimerRef.current = null;
    }
  };

  useEffect(() => clearScrubHoldTimer, []);

  const rawSamples = useMemo(
    () => testPoints.map((point) => point.rawPressure),
    [testPoints],
  );
  const stats = useMemo(() => studioPressureCalibrationStats(rawSamples), [rawSamples]);
  const recommendation = useMemo(
    () => recommendStudioPressureCurveExponent(rawSamples),
    [rawSamples],
  );
  const fittedSplineProfile = useMemo(
    () => fitStudioStylusPressureProfile(rawSamples),
    [rawSamples],
  );
  const latestPoint = testPoints.at(-1) ?? null;
  const latestRaw = latestPoint?.rawPressure ?? 0;
  const latestMapped = studioPressureCurveMap(latestRaw, pressureCurve);

  const appendTestPoints = (
    event: ReactPointerEvent<SVGSVGElement>,
    replace: boolean,
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const samples = safeCoalescedPointerEvents(event.nativeEvent)
      .map((sample) => normalizedTestPoint(sample, rect))
      .filter((sample): sample is StudioPressureTestPoint => sample !== null);
    if (samples.length === 0) return;
    setSplineAppliedNotice(false);
    setTestPoints((current) => {
      const next = replace ? samples : [...current, ...samples];
      return next.length > TEST_POINT_LIMIT
        ? next.slice(next.length - TEST_POINT_LIMIT)
        : next;
    });
  };

  const onTestPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    testPointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The global pointer stream remains a safe fallback.
    }
    appendTestPoints(event, true);
  };

  const onTestPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (testPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    appendTestPoints(event, false);
  };

  const finishTestPointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (testPointerIdRef.current !== event.pointerId) return;
    testPointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const cancelTestPointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (testPointerIdRef.current !== event.pointerId) return;
    testPointerIdRef.current = null;
  };

  const handleApplyFittedSpline = (): void => {
    if (!fittedSplineProfile) return;
    const normalizedPoints = normalizeStudioPressureCurvePoints(fittedSplineProfile.points);
    const nextProfile = studioPressureCurveToProfile(normalizedPoints, {
      deadZone: fittedSplineProfile.deadZone,
      saturation: fittedSplineProfile.saturation,
    });
    setStudioStylusPressureProfile(nextProfile);
    if (recommendation !== null) onPressureCurveChange(recommendation);
    onSplineFitApply?.(normalizedPoints);
    setSplineAppliedNotice(true);
  };

  const updateColorDropConfig = (patch: Partial<StoredColorDropConfig>): void => {
    clearScrubHoldTimer();
    const next: StoredColorDropConfig = {
      thresholdPercent: Math.round(clamp(patch.thresholdPercent ?? colorDropConfig.thresholdPercent, 0, 100)),
      holdDelayMs: Math.round(clamp(patch.holdDelayMs ?? colorDropConfig.holdDelayMs, 200, 800)),
    };
    setColorDropConfig(next);
    persistColorDropConfig(next);
    colorDropControllerRef.current = new ColorDropThresholdController({
      initialThresholdPercent: next.thresholdPercent,
      holdDelayMs: next.holdDelayMs,
      scrubPixelsForFullRange: 200,
    });
    setColorDropSession((prev) => ({
      ...prev,
      phase: "idle",
      thresholdPercent: next.thresholdPercent,
    }));
  };

  const onScrubPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    clearScrubHoldTimer();
    scrubPointerIdRef.current = event.pointerId;
    scrubLastXRef.current = event.clientX;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    const nowMs = Date.now();
    const snap = colorDropControllerRef.current.beginDrop(event.clientX, event.clientY, nowMs);
    setColorDropSession(snap);
    scrubHoldTimerRef.current = setTimeout(() => {
      scrubHoldTimerRef.current = null;
      if (scrubPointerIdRef.current !== event.pointerId) return;
      const promoted = colorDropControllerRef.current.moveDuringDrop(
        scrubLastXRef.current,
        Date.now(),
      );
      setColorDropSession(promoted);
    }, colorDropConfig.holdDelayMs);
  };

  const onScrubPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (scrubPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    scrubLastXRef.current = event.clientX;
    const snap = colorDropControllerRef.current.moveDuringDrop(event.clientX, Date.now());
    if (snap.phase === "scrubbing") clearScrubHoldTimer();
    setColorDropSession(snap);
  };

  const finishScrubPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (scrubPointerIdRef.current !== event.pointerId) return;
    clearScrubHoldTimer();
    scrubPointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    const committed = colorDropControllerRef.current.commitDrop();
    const nextConfig: StoredColorDropConfig = {
      ...colorDropConfig,
      thresholdPercent: committed.thresholdPercent,
    };
    setColorDropConfig(nextConfig);
    persistColorDropConfig(nextConfig);
    setColorDropSession(committed);
  };

  const cancelScrubPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (scrubPointerIdRef.current !== event.pointerId) return;
    clearScrubHoldTimer();
    scrubPointerIdRef.current = null;
    const cancelled = colorDropControllerRef.current.cancelDrop();
    setColorDropSession(cancelled);
  };

  return (
    <details
      data-studio-pressure-calibration="true"
      className="group mt-2.5 rounded-lg border border-line/60 bg-canvas/45 p-2.5"
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-xs font-bold text-fg-2 outline-none [&::-webkit-details-marker]:hidden",
          STUDIO_FOCUS_RING,
        )}
      >
        <span>필압 테스트 · 스플라인 자동 보정 · ColorDrop</span>
        <span className="text-xs font-semibold text-fg-3 group-open:hidden">
          열기
        </span>
        <span className="hidden text-xs font-semibold text-fg-3 group-open:inline">
          접기
        </span>
      </summary>

      <div className="mt-2 border-t border-line/50 pt-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-fg-2">실시간 필압 테스트</span>
          <span className="tabular-nums text-xs font-semibold text-fg-3">
            입력 {pressurePercent(latestRaw)} → 출력 {pressurePercent(latestMapped)}
          </span>
        </div>

        <svg
          role="group"
          aria-label="필압 시험선 입력 영역"
          viewBox={`0 0 ${TEST_W} ${TEST_H}`}
          data-studio-pressure-test-pad="true"
          className={cn(
            "block w-full touch-none select-none rounded-md border border-line/50 bg-card/65",
            touch ? "h-24" : "h-20",
          )}
          onPointerDown={onTestPointerDown}
          onPointerMove={onTestPointerMove}
          onPointerUp={finishTestPointer}
          onPointerCancel={cancelTestPointer}
        >
          <path
            d={`M0 ${TEST_H / 2} H${TEST_W}`}
            stroke="var(--color-line-strong)"
            strokeOpacity={0.35}
            strokeDasharray="4 4"
            aria-hidden="true"
          />
          {testPoints.length === 0 ? (
            <text
              x={TEST_W / 2}
              y={TEST_H / 2 + 4}
              textAnchor="middle"
              fill="var(--color-fg-3)"
              className="text-xs"
              aria-hidden="true"
            >
              펜을 약하게→강하게 눌러 시험선을 그리세요
            </text>
          ) : null}
          <g className="text-accent" aria-hidden="true">
            {testPoints.slice(1).map((point, index) => {
              const previous = testPoints[index] ?? point;
              const averagePressure = (previous.rawPressure + point.rawPressure) / 2;
              return (
                <line
                  key={`${index}-${point.x.toFixed(2)}-${point.y.toFixed(2)}`}
                  x1={previous.x}
                  y1={previous.y}
                  x2={point.x}
                  y2={point.y}
                  stroke="currentColor"
                  strokeWidth={studioPressurePreviewDiameter(
                    averagePressure,
                    pressureCurve,
                    pressureMinSize,
                    18,
                  )}
                  strokeOpacity={
                    0.45 + studioPressureCurveMap(point.rawPressure, pressureCurve) * 0.55
                  }
                  strokeLinecap="round"
                />
              );
            })}
            {testPoints.length === 1 ? (
              <circle
                cx={testPoints[0]?.x}
                cy={testPoints[0]?.y}
                r={
                  studioPressurePreviewDiameter(
                    testPoints[0]?.rawPressure ?? 0.5,
                    pressureCurve,
                    pressureMinSize,
                    18,
                  ) / 2
                }
                fill="currentColor"
              />
            ) : null}
          </g>
        </svg>

        <div className="mt-2 grid grid-cols-2 gap-2" aria-label="현재 필압 입출력">
          <div>
            <div className="mb-1 flex justify-between text-xs tabular-nums text-fg-3">
              <span>원시 입력</span>
              <span>{pressurePercent(latestRaw)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className="h-full rounded-full bg-fg-3/55"
                style={{ width: pressurePercent(latestRaw) }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs tabular-nums text-fg-3">
              <span>적용 출력</span>
              <span>{pressurePercent(latestMapped)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: pressurePercent(latestMapped) }}
              />
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-fg-3" aria-live="polite">
            {stats
              ? `샘플 ${stats.sampleCount}개 · 범위 ${pressurePercent(stats.minimum)}–${pressurePercent(stats.maximum)} · 중앙 ${pressurePercent(stats.median)} · P90 ${pressurePercent(stats.p90)}`
              : "입력 샘플 없음 · 약한 압력부터 강한 압력까지 한 번에 그어 자동 보정하세요."}
          </p>
          <div className="flex flex-wrap shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTestPoints([]);
                setSplineAppliedNotice(false);
              }}
              disabled={testPoints.length === 0}
              className={cn(
                "min-h-11 rounded-lg border border-line/70 px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
                STUDIO_FOCUS_RING,
              )}
            >
              지우기
            </button>
            <button
              type="button"
              onClick={() => {
                if (recommendation !== null) onPressureCurveChange(recommendation);
              }}
              disabled={recommendation === null}
              title={
                recommendation === null
                  ? r3c07StatusText(
                      "studio.panelStatus.r3c07.pressureCalibration.samplesRequired",
                      "서로 다른 압력의 유효 샘플이 8개 이상 필요합니다",
                    )
                  : `권장 감마 ${recommendation.toFixed(2)} 적용`
              }
              className={cn(
                "min-h-11 rounded-lg border border-accent/45 bg-accent-soft px-2.5 text-xs font-bold text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40",
                STUDIO_FOCUS_RING,
              )}
            >
              자동 보정
              {recommendation === null ? "" : ` γ${recommendation.toFixed(2)}`}
            </button>
            <button
              type="button"
              data-testid="studio-pressure-spline-fit-btn"
              onClick={handleApplyFittedSpline}
              disabled={fittedSplineProfile === null}
              className={cn(
                "min-h-11 rounded-lg border border-accent bg-accent px-2.5 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-40",
                STUDIO_FOCUS_RING,
              )}
            >
              스플라인 자동 피팅
            </button>
          </div>
        </div>

        {fittedSplineProfile ? (
          <p className="mt-1.5 text-xs text-fg-2 tabular-nums" aria-live="polite">
            {splineAppliedNotice
              ? `추천 5점 단조 스플라인 적용됨 · 데드존 ${pressurePercent(fittedSplineProfile.deadZone)} · 포화점 ${pressurePercent(fittedSplineProfile.saturation)}`
              : `추천 스플라인 준비됨 · 데드존 ${pressurePercent(fittedSplineProfile.deadZone)} · 포화점 ${pressurePercent(fittedSplineProfile.saturation)}`}
          </p>
        ) : null}

        {/* ColorDrop 450ms 홀드 & 허용 오차 임계값 스크럽 설정 */}
        <div
          data-studio-colordrop-settings="true"
          className="mt-3 space-y-2 border-t border-line/50 pt-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-fg-2">ColorDrop 채우기 임계값</span>
            <span className="tabular-nums text-xs font-semibold text-accent">
              {colorDropConfig.holdDelayMs}ms 홀드 · 허용 오차 {colorDropSession.thresholdPercent}%
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-fg-2">
              <span className="flex justify-between">
                <span>홀드 대기 시간</span>
                <span className="tabular-nums font-semibold text-fg">{colorDropConfig.holdDelayMs}ms</span>
              </span>
              <input
                type="range"
                aria-label="ColorDrop 홀드 대기 시간"
                min={200}
                max={800}
                step={25}
                value={colorDropConfig.holdDelayMs}
                onChange={(event) =>
                  updateColorDropConfig({ holdDelayMs: Number(event.target.value) })
                }
                className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
              />
            </label>
            <label className="block text-xs text-fg-2">
              <span className="flex justify-between">
                <span>기본 허용 오차</span>
                <span className="tabular-nums font-semibold text-fg">
                  {colorDropConfig.thresholdPercent}%
                </span>
              </span>
              <input
                type="range"
                aria-label="ColorDrop 허용 오차 임계값"
                min={0}
                max={100}
                step={1}
                value={colorDropConfig.thresholdPercent}
                onChange={(event) =>
                  updateColorDropConfig({ thresholdPercent: Number(event.target.value) })
                }
                className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
              />
            </label>
          </div>
          <div
            role="group"
            aria-label="ColorDrop 450ms 스크럽 테스트 바"
            data-testid="studio-colordrop-scrub-pad"
            data-colordrop-phase={colorDropSession.phase}
            onPointerDown={onScrubPointerDown}
            onPointerMove={onScrubPointerMove}
            onPointerUp={finishScrubPointer}
            onPointerCancel={cancelScrubPointer}
            className="flex min-h-11 cursor-ew-resize touch-none select-none items-center justify-between gap-2 rounded-lg border border-line bg-card/70 px-3 text-xs text-fg-2"
          >
            <span>
              {colorDropSession.phase === "scrubbing"
                ? "좌우로 끌어 허용 오차 조절 중"
                : colorDropSession.phase === "holding"
                  ? `${colorDropConfig.holdDelayMs}ms 유지 후 좌우로 끄세요`
                  : `누른 채 ${colorDropConfig.holdDelayMs}ms 유지 후 좌우 스크럽 테스트`}
            </span>
            <span className="tabular-nums font-bold text-accent">
              {colorDropSession.thresholdPercent}%
            </span>
          </div>
        </div>
      </div>
    </details>
  );
}
