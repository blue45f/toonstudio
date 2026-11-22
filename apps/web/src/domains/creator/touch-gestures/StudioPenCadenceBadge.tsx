/**
 * 태블릿 펜 주사율·지연 자동 튜너 배지 (`Calm Atelier`).
 *
 * - 기본 상태에서는 1줄 접힘 배지로 조용히 대기해 설정 화면과 캔버스 여백을 침범하지 않는다.
 * - 클릭해 펼치면 `getCoalescedEvents` 실측 중앙값 Δt·P95 지터·Catmull-Rom 예측 창(`0~6ms`),
 *   OS 프로파일 수동/자동 전환, 스파이크(200ms→24ms)·팜 거부 카운터, 라이브 펜 실측 패드를 제공한다.
 * - 순수 메모리 프로파일러만 구독하며 브라우저 저장소·네트워크를 사용하지 않는다.
 */
import { ChevronDown, PenTool, RotateCcw, ShieldAlert } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import {
  getSharedPenCadenceProfiler,
  type CoalescedPointerCadenceProfiler,
  type CoalescedPointerEventLike,
  type PenCadenceHealthTone,
  type PenCadenceRecommendation,
  type PenCadenceSnapshot,
  type PenOsSelection,
  type PenPointerSampleInput,
} from "./pen-cadence-latency-tuner";

import { cn } from "@/shared/lib/utils";

export interface StudioPenCadenceBadgeProps {
  /** 외부에서 주입하는 순수 메모리 프로파일러. 생략 시 공유 런타임 인스턴스를 사용한다. */
  readonly profiler?: CoalescedPointerCadenceProfiler;
  /** 세부 설정 탭 등 좁은 컨테이너에 배치할 때 true. */
  readonly compact?: boolean;
  /** 모션 축소 강제 여부. `motion-reduce:transition-none`과 함께 동작한다. */
  readonly reduceMotion?: boolean;
  /** 초기 펼침 상태. Calm Atelier 기본값은 `false`(1줄 접힘 배지). */
  readonly defaultExpanded?: boolean;
  /** 추천 프로파일이 갱신될 때 호출되는 선택 콜백. */
  readonly onRecommendationChange?: (recommendation: PenCadenceRecommendation) => void;
}

const OS_SELECTION_OPTIONS: readonly { readonly id: PenOsSelection; readonly label: string }[] = [
  { id: "auto", label: "자동" },
  { id: "ipados", label: "iPadOS" },
  { id: "android", label: "Android" },
  { id: "windows", label: "Windows" },
  { id: "macos", label: "macOS" },
];

function toneBadgeClass(tone: PenCadenceHealthTone): string {
  switch (tone) {
    case "good":
      return "border-good/40 bg-good-soft text-good";
    case "warn":
      return "border-warn/40 bg-warning-soft text-warn";
    case "bad":
      return "border-bad/40 bg-bad-soft text-bad";
    case "info":
      return "border-cool/40 bg-info-soft text-cool";
    default:
      return "border-line bg-card text-fg-2";
  }
}

function summarizeBadgeLabel(snapshot: PenCadenceSnapshot): string {
  if (snapshot.calibrationState === "idle") {
    return "측정 대기";
  }
  if (snapshot.calibrationState === "collecting") {
    return `수집 중 · ${snapshot.detectedTierHz}Hz`;
  }
  if (snapshot.recommendation.healthTone === "bad") {
    return `${snapshot.detectedTierHz}Hz · 예측 끔`;
  }
  if (snapshot.recommendation.healthTone === "warn") {
    return `${snapshot.detectedTierHz}Hz · 지터 주의`;
  }
  return `${snapshot.detectedTierHz}Hz · 예측 ${snapshot.recommendedPredictionWindowMs.toFixed(1)}ms`;
}

function toCoalescedEventLike(
  event: ReactPointerEvent<HTMLDivElement>,
): CoalescedPointerEventLike {
  const nativeEvent = event.nativeEvent as Partial<PointerEvent> & {
    getCoalescedEvents?: () => PointerEvent[];
  };
  const readCoalesced =
    typeof nativeEvent.getCoalescedEvents === "function"
      ? (): readonly PenPointerSampleInput[] => nativeEvent.getCoalescedEvents?.() ?? []
      : undefined;

  return {
    pointerId: typeof nativeEvent.pointerId === "number" ? nativeEvent.pointerId : event.pointerId,
    pointerType:
      typeof nativeEvent.pointerType === "string" && nativeEvent.pointerType.length > 0
        ? nativeEvent.pointerType
        : event.pointerType,
    timeStamp:
      typeof nativeEvent.timeStamp === "number" && Number.isFinite(nativeEvent.timeStamp)
        ? nativeEvent.timeStamp
        : event.timeStamp,
    clientX: typeof nativeEvent.clientX === "number" ? nativeEvent.clientX : event.clientX,
    clientY: typeof nativeEvent.clientY === "number" ? nativeEvent.clientY : event.clientY,
    width: typeof nativeEvent.width === "number" ? nativeEvent.width : event.width,
    height: typeof nativeEvent.height === "number" ? nativeEvent.height : event.height,
    pressure: typeof nativeEvent.pressure === "number" ? nativeEvent.pressure : event.pressure,
    getCoalescedEvents: readCoalesced,
  };
}

export function StudioPenCadenceBadge({
  profiler,
  compact = false,
  reduceMotion = false,
  defaultExpanded = false,
  onRecommendationChange,
}: StudioPenCadenceBadgeProps): ReactElement {
  const activeProfiler = profiler ?? getSharedPenCadenceProfiler();
  const snapshot = useSyncExternalStore(
    activeProfiler.subscribe,
    activeProfiler.getSnapshot,
    activeProfiler.getSnapshot,
  );
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const panelId = useId();

  useEffect(() => {
    onRecommendationChange?.(snapshot.recommendation);
  }, [onRecommendationChange, snapshot.recommendation]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        activeProfiler.markResumeBoundary();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeProfiler]);

  const handleProbePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    activeProfiler.markResumeBoundary();
    activeProfiler.ingestEvent(toCoalescedEventLike(event));
  };

  const handleProbePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    activeProfiler.ingestEvent(toCoalescedEventLike(event));
  };

  const handleProbePointerUp = (): void => {
    activeProfiler.markResumeBoundary();
  };

  const motionClass = reduceMotion ? "transition-none" : "transition-colors motion-reduce:transition-none";
  const badgeText = summarizeBadgeLabel(snapshot);

  return (
    <div
      data-studio-pen-cadence-badge="true"
      data-studio-pen-cadence-state={snapshot.calibrationState}
      data-studio-pen-cadence-tier={snapshot.detectedProfileId}
      data-studio-pen-cadence-expanded={expanded ? "true" : "false"}
      className="rounded-xl border border-line bg-panel text-fg [word-break:keep-all]"
    >
      {/* 기본 1줄 접힘 배지 행 */}
      <button
        type="button"
        data-studio-pen-cadence-toggle="true"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-raised/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          motionClass,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <PenTool className="size-4 shrink-0 text-accent" aria-hidden />
          <span className="shrink-0 font-semibold text-fg">펜 지연 튜너</span>
          <span
            data-studio-pen-cadence-pill="true"
            className={cn(
              "inline-flex items-center rounded-lg border px-2 py-0.5 text-[0.68rem] font-semibold tabular-nums",
              toneBadgeClass(snapshot.recommendation.healthTone),
            )}
          >
            {badgeText}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2 text-[0.68rem] text-fg-2 tabular-nums">
          {snapshot.medianDeltaMs !== null && snapshot.p95JitterMs !== null ? (
            <span data-studio-pen-cadence-inline-metrics="true" className="hidden sm:inline">
              Δt {snapshot.medianDeltaMs.toFixed(1)}ms · P95 {snapshot.p95JitterMs.toFixed(1)}ms
            </span>
          ) : (
            <span data-studio-pen-cadence-inline-os="true" className="hidden sm:inline">
              {snapshot.osPolicy.shortLabelKo}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-fg-3",
              reduceMotion ? "transition-none" : "transition-transform motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>

      {/* 펼침 시 상세 진단 · OS 프로파일 · 라이브 펜 실측 패드 */}
      {expanded ? (
        <div
          id={panelId}
          data-studio-pen-cadence-panel="true"
          className={cn(
            "space-y-3 border-t border-line bg-card/60",
            compact ? "px-3 py-2.5" : "px-3.5 py-3",
          )}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
              <div className="text-[0.65rem] text-fg-3">감지 주사율</div>
              <div
                data-studio-pen-cadence-hz="true"
                className="mt-0.5 text-xs font-semibold text-fg tabular-nums"
              >
                {snapshot.measuredHz !== null
                  ? `${snapshot.detectedTierHz}Hz (${snapshot.measuredHz.toFixed(0)})`
                  : "대기"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
              <div className="text-[0.65rem] text-fg-3">중앙값 Δt · P95 지터</div>
              <div
                data-studio-pen-cadence-jitter="true"
                className="mt-0.5 text-xs font-semibold text-fg tabular-nums"
              >
                {snapshot.medianDeltaMs !== null && snapshot.p95JitterMs !== null
                  ? `${snapshot.medianDeltaMs.toFixed(1)}ms · ±${snapshot.p95JitterMs.toFixed(1)}ms`
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
              <div className="text-[0.65rem] text-fg-3">Catmull-Rom 예측</div>
              <div
                data-studio-pen-cadence-prediction="true"
                className="mt-0.5 text-xs font-semibold text-accent tabular-nums"
              >
                {snapshot.recommendedPredictionWindowMs.toFixed(1)}ms
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel px-2.5 py-2">
              <div className="text-[0.65rem] text-fg-3">스파이크 · 팜 차단</div>
              <div
                data-studio-pen-cadence-guards="true"
                className="mt-0.5 text-xs font-semibold text-fg tabular-nums"
              >
                {snapshot.spikeClampedCount}건 · {snapshot.palmRejectedCount}건
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="태블릿 OS 프로파일 선택"
              className="flex flex-wrap items-center gap-1.5"
            >
              {OS_SELECTION_OPTIONS.map((option) => {
                const active = snapshot.osSelection === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-studio-pen-cadence-os-option={option.id}
                    aria-pressed={active}
                    onClick={() => activeProfiler.setOsSelection(option.id)}
                    className={cn(
                      "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      motionClass,
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              data-studio-pen-cadence-reset="true"
              onClick={() => activeProfiler.reset()}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-medium text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                motionClass,
              )}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              측정 초기화
            </button>
          </div>

          <div
            role="region"
            aria-label="펜 주사율 실측 패드"
            data-studio-pen-cadence-probe="true"
            onPointerDown={handleProbePointerDown}
            onPointerMove={handleProbePointerMove}
            onPointerUp={handleProbePointerUp}
            onPointerCancel={handleProbePointerUp}
            className="flex min-h-11 touch-none select-none items-center justify-between gap-2 rounded-xl border border-dashed border-line-strong bg-panel/80 px-3 py-2 text-[0.68rem] text-fg-2"
          >
            <span>이 영역에 스타일러스로 선을 그어 120Hz/240Hz 지연과 지터를 즉시 실측합니다.</span>
            <span className="shrink-0 font-semibold text-fg-3 tabular-nums">
              표본 {snapshot.sampleCount}건
            </span>
          </div>

          <p
            data-studio-pen-cadence-rationale="true"
            className="flex items-start gap-1.5 rounded-lg border border-line bg-panel/70 px-2.5 py-2 text-[0.68rem] leading-relaxed text-fg-2"
          >
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            <span>
              {snapshot.recommendation.rationaleKo} ({snapshot.osPolicy.labelKo} · 최대 스텝{" "}
              <span className="tabular-nums">{snapshot.maxClampMs}ms</span> 제한)
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
