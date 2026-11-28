import {
  Activity,
  Brush,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Play,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/shared/lib/utils";

import {
  createStudioSupergapRuntimeHub,
  type HardwareBridgeStatus,
  type StudioSupergapHubSnapshot,
  type StudioSupergapRuntimeHub,
  type SupergapSubsystemStatus,
} from "./studio-supergap-runtime-hub";

export interface StudioSupergapStatusDrawerProps {
  readonly hub?: StudioSupergapRuntimeHub;
  readonly autoBootstrap?: boolean;
  readonly defaultExpanded?: boolean;
  readonly onClose?: () => void;
  readonly className?: string;
}

function formatTactileReliefLabelKo(mode: StudioSupergapHubSnapshot["tactileReliefMode"]): string {
  if (mode === "vivid") return "강조";
  if (mode === "sculpted") return "입체";
  return "끄기";
}

function formatSubsystemStatusLabelKo(status: SupergapSubsystemStatus): string {
  if (status === "live-connected") return "실시간 연결";
  if (status === "browser-fallback") return "브라우저 폴백";
  if (status === "error") return "점검 필요";
  return "대기";
}

function subsystemStatusBadgeClass(status: SupergapSubsystemStatus): string {
  if (status === "live-connected") return "border-good/40 bg-good/10 text-good";
  if (status === "browser-fallback") return "border-cool/40 bg-cool/10 text-cool";
  if (status === "error") return "border-bad/40 bg-bad/10 text-bad";
  return "border-line bg-raised text-fg-2";
}

function formatHardwareSummaryKo(bridge: HardwareBridgeStatus | null): string {
  if (!bridge) return "하드웨어 브릿지 상태를 확인하는 중입니다.";
  if (bridge.connected) {
    return `${bridge.deviceName} · ${bridge.graphicsBackend} · ${bridge.upscaler} · ${bridge.npuBackend}`;
  }
  return `${bridge.deviceName} · ${bridge.graphicsBackend} · ${bridge.upscaler}`;
}

/**
 * `/studio` 초격차 런타임 엔진 허브 상태 드로어.
 *
 * - Calm Atelier OKLCH 시맨틱 토큰, 44×44px(`min-h-11 min-w-11`) 터치 타깃, `[word-break:keep-all]`,
 *   `tabular-nums`, `motion-reduce:transition-none` 규율을 준수한다.
 * - 기본 가시 제어는 3~4개 핵심 동작으로 간결하게 유지하고, 전체 서브시스템 목록과 1-클릭 점검은
 *   `<details>` 점진 노출 영역 안에 정리한다.
 */
export function StudioSupergapStatusDrawer({
  hub,
  autoBootstrap = true,
  defaultExpanded = false,
  onClose,
  className,
}: StudioSupergapStatusDrawerProps) {
  const [internalHub] = useState<StudioSupergapRuntimeHub>(() =>
    hub ?? createStudioSupergapRuntimeHub(),
  );
  const activeHub = hub ?? internalHub;
  const [snapshot, setSnapshot] = useState<StudioSupergapHubSnapshot>(() =>
    activeHub.getSnapshot(),
  );

  useEffect(() => {
    setSnapshot(activeHub.getSnapshot());
    const unsubscribe = activeHub.subscribe(setSnapshot);
    if (autoBootstrap && activeHub.getSnapshot().hardwareBridge === null) {
      void activeHub.bootstrapHardwareBridge().catch(() => {
        // 오류 상태는 허브 스냅샷의 lastErrorKo에 기록된다.
      });
    }
    void activeHub.refreshTactileReliefMode().catch(() => {
      // 실물 질감 모드 조회 실패 시 기본값 유지
    });
    return unsubscribe;
  }, [activeHub, autoBootstrap]);

  const handleReprobe = useCallback(() => {
    void activeHub.bootstrapHardwareBridge().catch(() => {
      // 스냅샷 오류 상태로 반영
    });
  }, [activeHub]);

  const handleRunDiagnostic = useCallback(() => {
    void activeHub.runDiagnosticSelfCheck().catch(() => {
      // 스냅샷 오류 상태로 반영
    });
  }, [activeHub]);

  const handleCycleTactile = useCallback(() => {
    void activeHub.cycleTactileReliefMode().catch(() => {
      // 스냅샷 오류 상태로 반영
    });
  }, [activeHub]);

  const handleRunSubsystem = useCallback(
    (subsystemId: string) => {
      void activeHub.executeSubsystemAction(subsystemId).catch(() => {
        // 스냅샷 오류 상태로 반영
      });
    },
    [activeHub],
  );

  const bridge = snapshot.hardwareBridge;
  const isNativeConnected = Boolean(bridge?.connected);
  const totalCount = snapshot.registeredSubsystems.length;
  const checkedCount = Object.keys(snapshot.lastResultsById).length;
  const healthyCount = Object.values(snapshot.lastResultsById).filter(
    (item) => item.status !== "error",
  ).length;

  return (
    <div
      role="region"
      aria-label="초격차 런타임 엔진 허브"
      data-testid="studio-supergap-status-drawer"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all]",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-fg">초격차 런타임 엔진 허브</h2>
            <span
              data-testid="supergap-connection-pill"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                isNativeConnected
                  ? "border-good/40 bg-good/10 text-good"
                  : "border-cool/40 bg-cool/10 text-cool",
              )}
            >
              <Cpu className="size-3.5 shrink-0" aria-hidden="true" />
              {isNativeConnected
                ? "데스크톱 네이티브 GPU/NPU 연결됨"
                : "웹GPU 브라우저 모드 (자동 폴백)"}
            </span>
          </div>

          <p
            data-testid="supergap-hardware-summary"
            className="text-xs text-fg-2 tabular-nums"
          >
            {formatHardwareSummaryKo(bridge)}
          </p>
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="초격차 런타임 허브 닫기"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card text-fg-2 transition-[background-color,border-color,color,transform] duration-150 hover:bg-raised hover:text-fg enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="supergap-reprobe-btn"
          disabled={snapshot.isBootstrapping}
          onClick={handleReprobe}
          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-[background-color,border-color,color,transform] duration-150 hover:bg-raised enabled:active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <RefreshCw
            className={cn("size-4 shrink-0", snapshot.isBootstrapping && "animate-spin motion-reduce:animate-none")}
            aria-hidden="true"
          />
          하드웨어 브릿지 재탐색
        </button>

        <button
          type="button"
          data-testid="supergap-diagnostic-btn"
          disabled={snapshot.isRunningDiagnostic}
          onClick={handleRunDiagnostic}
          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold text-on-accent transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <Activity className="size-4 shrink-0" aria-hidden="true" />
          {snapshot.isRunningDiagnostic ? "엔진 점검 중…" : "전체 엔진 실시간 점검"}
        </button>

        <button
          type="button"
          data-testid="supergap-tactile-btn"
          aria-pressed={snapshot.tactileReliefMode !== "off"}
          onClick={handleCycleTactile}
          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-[background-color,border-color,color,transform] duration-150 hover:bg-raised enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <Brush className="size-4 shrink-0" aria-hidden="true" />
          <span>{`실물 입체 브러시 상태 · ${formatTactileReliefLabelKo(snapshot.tactileReliefMode)}`}</span>
        </button>
      </div>

      {bridge ? (
        <div
          role="status"
          data-testid="supergap-bridge-metrics"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2 tabular-nums"
        >
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
            {`PSO 예열 ${bridge.prewarmedPsoCount}종 · 지연 ${bridge.latencyMs.toFixed(1)}ms`}
          </span>
          <span>
            {snapshot.lastReport
              ? `최근 점검 ${snapshot.lastReport.liveConnectedCount + snapshot.lastReport.browserFallbackCount}/${snapshot.lastReport.subsystems.length} 정상 (${snapshot.lastReport.totalDurationMs.toFixed(1)}ms)`
              : `등록 엔진 ${totalCount}개`}
          </span>
        </div>
      ) : null}

      {snapshot.lastErrorKo ? (
        <p
          role="alert"
          data-testid="supergap-error-banner"
          className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs font-medium text-bad"
        >
          {snapshot.lastErrorKo}
        </p>
      ) : null}

      <details
        open={defaultExpanded}
        data-testid="supergap-subsystems-disclosure"
        className="group rounded-xl border border-line bg-card"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>연결된 초격차 Wave 엔진 목록</span>
            <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[0.7rem] font-semibold text-fg-2 tabular-nums">
              {checkedCount > 0 ? `${healthyCount}/${totalCount} 확인됨` : `${totalCount}개 등록`}
            </span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-fg-2 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>

        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto overscroll-contain border-t border-line p-3">
          {snapshot.registeredSubsystems.map((sub) => {
            const result = snapshot.lastResultsById[sub.id];
            const status: SupergapSubsystemStatus = result ? result.status : "idle";
            const isBusy = snapshot.activeActionSubsystemId === sub.id;

            return (
              <li
                key={sub.id}
                data-testid={`supergap-subsystem-${sub.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.68rem] font-semibold text-fg-2 tabular-nums">
                      {sub.waveLabel}
                    </span>
                    <span className="text-xs font-bold text-fg">{sub.titleKo}</span>
                    <span
                      data-testid={`supergap-status-${sub.id}`}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold",
                        subsystemStatusBadgeClass(status),
                      )}
                    >
                      {formatSubsystemStatusLabelKo(status)}
                    </span>
                  </div>
                  <p className="text-[0.72rem] text-fg-2 tabular-nums">
                    {result ? `${result.summaryKo} · ${result.latencyMs.toFixed(1)}ms` : sub.capabilitySummaryKo}
                  </p>
                </div>

                <button
                  type="button"
                  data-testid={`supergap-run-${sub.id}`}
                  disabled={isBusy || snapshot.isRunningDiagnostic}
                  onClick={() => handleRunSubsystem(sub.id)}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-[background-color,border-color,color,transform] duration-150 hover:bg-raised enabled:active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  <Play className="size-3.5 shrink-0" aria-hidden="true" />
                  {isBusy ? "실행 중" : "점검"}
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
