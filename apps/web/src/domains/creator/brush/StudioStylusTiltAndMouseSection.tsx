import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import { cn } from "@/shared/lib/utils";
import { DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE } from "./studio-stylus-pressure-profile";
import {
  getStudioStylusPressureProfileSnapshot,
  resetStudioStylusPressureProfile,
  subscribeStudioStylusPressureProfile,
} from "./studio-stylus-pressure-profile-store";
import {
  applyStudioStylusTiltPreset,
  evaluateStudioLiveStylusOrMouseSample,
  evaluateStudioStylusTiltCurve,
  getStudioStylusTiltMousePolicyServerSnapshot,
  getStudioStylusTiltMousePolicySnapshot,
  isStudioStylusTiltMousePolicyDefault,
  resetStudioStylusTiltMousePolicy,
  setStudioStylusTiltMousePolicy,
  subscribeStudioStylusTiltMousePolicy,
  type StudioMousePressureFallbackMode,
  type StudioStylusTiltPresetId,
} from "./studio-stylus-tilt-mouse-policy";

const TILT_GRAPH_W = 220;
const TILT_GRAPH_H = 84;
const TILT_PAD = 8;
const SAMPLE_W = 280;
const SAMPLE_H = 64;

interface LiveSamplePoint {
  readonly x: number;
  readonly y: number;
  readonly mappedPressure: number;
  readonly broadeningFactor: number;
  readonly tiltDeg: number;
  readonly velocityPxPerMs: number;
  readonly pointerSource: "hardware-stylus" | "mouse-fallback";
  readonly timeMs: number;
}

const TILT_PRESET_OPTIONS: readonly Readonly<{
  id: StudioStylusTiltPresetId;
  label: string;
}>[] = Object.freeze([
  { id: "linear", label: "선형 기울기" },
  { id: "pencil-shade", label: "연필 눕혀 칠하기" },
  { id: "calligraphy", label: "캘리그라피 각도" },
]);

const MOUSE_FALLBACK_OPTIONS: readonly Readonly<{
  id: StudioMousePressureFallbackMode;
  label: string;
  hint: string;
}>[] = Object.freeze([
  { id: "velocity", label: "속도 감응 필압", hint: "느리면 굵고 진하게 · 빠르면 날렵하게" },
  { id: "taper-ends", label: "양끝 테이퍼", hint: "마우스 첫입·끝입을 펜촉처럼 가늘게 마감" },
  { id: "fixed", label: "일정 두께 고정", hint: "필압 변화 없이 설정 두께 100% 유지" },
]);

export function StudioStylusTiltAndMouseSection({
  density = "compact",
}: {
  readonly density?: "compact" | "touch";
}): ReactElement {
  const touch = density === "touch";
  const policy = useSyncExternalStore(
    subscribeStudioStylusTiltMousePolicy,
    getStudioStylusTiltMousePolicySnapshot,
    getStudioStylusTiltMousePolicyServerSnapshot,
  );
  const pressureProfile = useSyncExternalStore(
    subscribeStudioStylusPressureProfile,
    getStudioStylusPressureProfileSnapshot,
    () => DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
  );

  const [samples, setSamples] = useState<readonly LiveSamplePoint[]>([]);
  const activePointerIdRef = useRef<number | null>(null);

  const tiltCurvePath = useMemo(() => {
    return Array.from({ length: 45 }, (_, index) => {
      const deg = (index / 44) * 85;
      const evaluated = evaluateStudioStylusTiltCurve(deg, policy);
      const x = TILT_PAD + (deg / 85) * (TILT_GRAPH_W - TILT_PAD * 2);
      const normBroaden = Math.min(1, Math.max(0, (evaluated.broadeningFactor - 1) / 2));
      const y = TILT_GRAPH_H - TILT_PAD - normBroaden * (TILT_GRAPH_H - TILT_PAD * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  }, [policy]);

  const latest = samples.at(-1) ?? null;
  const isDefault =
    isStudioStylusTiltMousePolicyDefault(policy) &&
    pressureProfile === DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE;

  const appendPointerSample = (
    event: ReactPointerEvent<SVGSVGElement>,
    resetStroke: boolean,
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : SAMPLE_W;
    const height = rect.height > 0 ? rect.height : SAMPLE_H;
    const x = Math.min(SAMPLE_W, Math.max(0, ((event.clientX - rect.left) / width) * SAMPLE_W));
    const y = Math.min(SAMPLE_H, Math.max(0, ((event.clientY - rect.top) / height) * SAMPLE_H));
    const nowMs = Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : Date.now();

    setSamples((previous) => {
      const base = resetStroke ? [] : previous;
      const prev = base.at(-1);
      const dt = prev ? Math.max(1, nowMs - prev.timeMs) : 16;
      const dist = prev ? Math.hypot(x - prev.x, y - prev.y) : 0;
      const velocityPxPerMs = prev ? dist / dt : 0;
      const progress01 = Math.min(1, (base.length + 1) / 24);
      const evaluated = evaluateStudioLiveStylusOrMouseSample({
        rawEvent: event.nativeEvent,
        velocityPxPerMs,
        strokeProgress01: progress01,
        pressureProfile,
        tiltMousePolicy: policy,
      });
      const next: LiveSamplePoint = {
        x,
        y,
        mappedPressure: evaluated.mappedPressure,
        broadeningFactor: evaluated.broadeningFactor,
        tiltDeg: evaluated.tiltDeg,
        velocityPxPerMs: evaluated.velocityPxPerMs,
        pointerSource: evaluated.pointerSource,
        timeMs: nowMs,
      };
      return [...base.slice(-140), next];
    });
  };

  return (
    <section
      data-studio-stylus-tilt-mouse-section="true"
      aria-label="기울기 곡선 및 마우스 대체 동작"
      className="mt-2.5 rounded-lg border border-line/55 bg-canvas/45 p-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div>
          <p className="text-[0.62rem] font-bold text-fg-2">기울기 곡선 · 마우스 대체 동작</p>
          <p className="text-[0.52rem] text-fg-3">
            펜 기울기 번짐 곡선과 마우스 속도/테이퍼 대체 필압을 실시간 샘플로 확인합니다.
          </p>
        </div>
        <button
          type="button"
          data-studio-tilt-mouse-reset="true"
          disabled={isDefault}
          onClick={() => {
            resetStudioStylusTiltMousePolicy();
            resetStudioStylusPressureProfile();
          }}
          className={cn(
            "rounded-md border border-line/70 bg-card px-2 text-[0.56rem] font-semibold text-fg-2 hover:border-accent/45 disabled:cursor-not-allowed disabled:opacity-45",
            touch ? "min-h-11" : "min-h-8",
          )}
        >
          필압·기울기 기본값 복원
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1" role="group" aria-label="기울기 곡선 프리셋">
        {TILT_PRESET_OPTIONS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={policy.tiltPresetId === preset.id}
            onClick={() =>
              setStudioStylusTiltMousePolicy(applyStudioStylusTiltPreset(policy, preset.id))
            }
            className={cn(
              "rounded-md border px-1.5 text-[0.54rem] font-semibold transition-colors",
              touch ? "min-h-10" : "min-h-7",
              policy.tiltPresetId === preset.id
                ? "border-accent/55 bg-accent-soft text-accent"
                : "border-line/65 bg-card/55 text-fg-3 hover:text-fg-2",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[7.5rem_1fr] sm:items-center">
        <svg
          viewBox={`0 0 ${TILT_GRAPH_W} ${TILT_GRAPH_H}`}
          aria-label="기울기 반응 곡선 미리보기"
          className="h-16 w-full rounded-md border border-line/45 bg-card/65 text-accent"
        >
          <path
            d={`M${TILT_PAD} ${TILT_GRAPH_H - TILT_PAD} L${TILT_GRAPH_W - TILT_PAD} ${TILT_PAD}`}
            stroke="currentColor"
            strokeOpacity={0.16}
            strokeDasharray="3 3"
            fill="none"
          />
          <path
            d={tiltCurvePath}
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            fill="none"
          />
        </svg>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[0.54rem] font-semibold text-fg-3">
            <span className="mb-0.5 flex justify-between">
              <span>기울기 곡선 감마</span>
              <span className="tabular-nums">{policy.tiltExponent.toFixed(2)}</span>
            </span>
            <input
              type="range"
              aria-label="기울기 곡선 감마"
              min={0.35}
              max={2.6}
              step={0.05}
              value={policy.tiltExponent}
              onChange={(event) =>
                setStudioStylusTiltMousePolicy({
                  ...policy,
                  tiltExponent: Number(event.currentTarget.value),
                })
              }
              className="w-full accent-accent"
            />
          </label>
          <label className="text-[0.54rem] font-semibold text-fg-3">
            <span className="mb-0.5 flex justify-between">
              <span>최대 번짐 배율</span>
              <span className="tabular-nums">{policy.maxTiltBroadening.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              aria-label="기울기 최대 번짐 배율"
              min={1}
              max={3}
              step={0.05}
              value={policy.maxTiltBroadening}
              onChange={(event) =>
                setStudioStylusTiltMousePolicy({
                  ...policy,
                  maxTiltBroadening: Number(event.currentTarget.value),
                })
              }
              className="w-full accent-accent"
            />
          </label>
        </div>
      </div>

      <div className="mt-2 border-t border-line/45 pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.58rem] font-bold text-fg-2">마우스 대체 동작</span>
          <span className="text-[0.52rem] text-fg-3">
            {MOUSE_FALLBACK_OPTIONS.find((item) => item.id === policy.mouseFallbackMode)?.hint}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1" role="group" aria-label="마우스 대체 동작 모드">
          {MOUSE_FALLBACK_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              data-studio-mouse-fallback-mode={option.id}
              aria-pressed={policy.mouseFallbackMode === option.id}
              onClick={() =>
                setStudioStylusTiltMousePolicy({
                  ...policy,
                  mouseFallbackMode: option.id,
                })
              }
              className={cn(
                "rounded-md border px-1.5 text-[0.54rem] font-semibold transition-colors",
                touch ? "min-h-10" : "min-h-7",
                policy.mouseFallbackMode === option.id
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line/65 bg-card/55 text-fg-3 hover:text-fg-2",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {policy.mouseFallbackMode !== "fixed" ? (
          <label className="mt-1.5 block text-[0.54rem] font-semibold text-fg-3">
            <span className="mb-0.5 flex justify-between">
              <span>마우스 대체 감도</span>
              <span className="tabular-nums">{Math.round(policy.mouseSensitivity * 100)}%</span>
            </span>
            <input
              type="range"
              aria-label="마우스 대체 감도"
              min={0}
              max={100}
              step={5}
              value={Math.round(policy.mouseSensitivity * 100)}
              onChange={(event) =>
                setStudioStylusTiltMousePolicy({
                  ...policy,
                  mouseSensitivity: Number(event.currentTarget.value) / 100,
                })
              }
              className="w-full accent-accent"
            />
          </label>
        ) : null}
      </div>

      <div className="mt-2 border-t border-line/45 pt-2">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[0.53rem] text-fg-3">
          <span className="font-bold text-fg-2">실시간 필압·기울기·마우스 샘플</span>
          <span data-studio-tilt-mouse-readout="true" className="tabular-nums">
            {latest
              ? `${latest.pointerSource === "hardware-stylus" ? "스타일러스" : "마우스 대체"} · 필압 ${Math.round(latest.mappedPressure * 100)}% · 기울기 ${Math.round(latest.tiltDeg)}° (${latest.broadeningFactor.toFixed(2)}×)`
              : "샘플 패드에 펜 또는 마우스로 그어 보세요"}
          </span>
        </div>
        <svg
          role="group"
          aria-label="실시간 필압·기울기·마우스 샘플 패드"
          data-studio-tilt-mouse-live-pad="true"
          viewBox={`0 0 ${SAMPLE_W} ${SAMPLE_H}`}
          className="block h-14 w-full touch-none select-none rounded-md border border-line/45 bg-card/60 text-accent"
          onPointerDown={(event) => {
            activePointerIdRef.current = event.pointerId;
            appendPointerSample(event, true);
          }}
          onPointerMove={(event) => {
            if (activePointerIdRef.current !== event.pointerId) return;
            appendPointerSample(event, false);
          }}
          onPointerUp={(event) => {
            if (activePointerIdRef.current === event.pointerId) activePointerIdRef.current = null;
          }}
          onPointerCancel={() => {
            activePointerIdRef.current = null;
          }}
        >
          {samples.slice(1).map((point, index) => {
            const prev = samples[index] ?? point;
            const width = Math.max(
              1.2,
              (1.2 + ((prev.mappedPressure + point.mappedPressure) / 2) * 9.5) *
                ((prev.broadeningFactor + point.broadeningFactor) / 2),
            );
            return (
              <line
                key={`${index}-${point.x.toFixed(1)}-${point.y.toFixed(1)}`}
                x1={prev.x}
                y1={prev.y}
                x2={point.x}
                y2={point.y}
                stroke="currentColor"
                strokeOpacity={0.55 + point.mappedPressure * 0.45}
                strokeWidth={width}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
    </section>
  );
}
