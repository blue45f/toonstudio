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
  type SupergapSubsystemMetadata,
  type SupergapSubsystemStatus,
} from "./studio-supergap-runtime-hub";

export interface StudioSupergapStatusDrawerProps {
  readonly hub?: StudioSupergapRuntimeHub;
  readonly autoBootstrap?: boolean;
  readonly defaultExpanded?: boolean;
  readonly onClose?: () => void;
  readonly className?: string;
}

const DIAGNOSTIC_GROUPS = [
  { label: "입력과 화면", ids: ["fastWasm64Kernels", "multiVendorGpuNpuHal", "desktopNativeGpuNpuBridge", "vectorSelfHealLanMeshErgo", "wave78CompanionTabletLan", "wave83CvdMobileReadability", "wave91KinematicPenTwinCleanup"] },
  { label: "그리기와 색", ids: ["tactilePhysicalRelief", "neuralBrushAndProvenance", "slangSeeThroughMangaNinja", "wave68ShallowWaterFluid", "wave73TemporalInkDrying", "wave74RelightingOpticalBrush", "wave77MultilingualSfxCleanplate", "wave87CausalTimeTravelCanvas", "wave90CurvilinearPerspectiveBrush"] },
  { label: "장면과 출력", ids: ["cadShaperPro3d", "wave69MotionToon60fps", "wave75PoseToFoldMultiview", "wave76PrintRecompositionCmyk", "wave81SketchToParametric3d", "wave82AudioDrivenPacing", "wave85IpMerchDiecutPack", "wave88ReactiveTstudioLive", "wave89MultiverseCanonCompiler"] },
  { label: "검수와 인계", ids: ["wave70NeuralDistillVault", "wave79AssistantCheckoutSettlement", "wave80OnDeviceContinuityGuardrail", "wave84DeltaTileOfflineSync", "wave86SaliencyPacingTwin", "wave92GeoVariantComplianceShield"] },
];

function groupDiagnostics(subsystems: readonly SupergapSubsystemMetadata[]) {
  const remaining = new Map(subsystems.map((item) => [item.id, item]));
  const groups = DIAGNOSTIC_GROUPS.map(({ label, ids }) => ({
    label,
    items: ids.flatMap((id) => {
      const item = remaining.get(id);
      if (!item) return [];
      remaining.delete(id);
      return [item];
    }),
  }));
  return [...groups, { label: "기타 점검", items: [...remaining.values()] }].filter((group) => group.items.length > 0);
}

function formatTactileReliefLabelKo(mode: StudioSupergapHubSnapshot["tactileReliefMode"]): string {
  if (mode === "vivid") return "강조";
  if (mode === "sculpted") return "입체";
  return "끄기";
}

function formatSubsystemStatusLabelKo(status: SupergapSubsystemStatus): string {
  if (status === "live-connected") return "점검 통과";
  if (status === "browser-fallback") return "추가 확인";
  if (status === "error") return "점검 실패";
  return "점검 전";
}

function subsystemStatusBadgeClass(status: SupergapSubsystemStatus): string {
  if (status === "live-connected") return "border-good/40 bg-good/10 text-good";
  if (status === "browser-fallback") return "border-cool/40 bg-cool/10 text-cool";
  if (status === "error") return "border-bad/40 bg-bad/10 text-bad";
  return "border-line bg-raised text-fg-2";
}

function describeHardwareConnectionKo(bridge: HardwareBridgeStatus | null, checking: boolean) {
  if (checking) {
    return { title: "네이티브 연결 확인 중", detail: "이 기기의 데스크톱 앱 연결을 확인합니다." };
  }
  if (!bridge) {
    return { title: "네이티브 연결 확인 전", detail: "연결 확인을 눌러 장치 응답을 확인할 수 있어요." };
  }
  if (bridge.connected) {
    return {
      title: "데스크톱 앱 연결됨",
      detail: `${bridge.deviceName} · ${bridge.graphicsBackend} · ${bridge.upscaler} · ${bridge.npuBackend}`,
    };
  }
  return {
    title: "네이티브 연결 없음",
    detail: "브라우저에서 예제 진단을 실행할 수 있어요. 실제 그래픽 성능은 원고를 열고 확인합니다.",
  };
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
  const hardware = describeHardwareConnectionKo(bridge, snapshot.isBootstrapping);
  const isNativeConnected = !snapshot.isBootstrapping && Boolean(bridge?.connected);
  const totalCount = snapshot.registeredSubsystems.length;
  const checkedCount = Object.keys(snapshot.lastResultsById).length;
  const report = snapshot.lastReport;
  const groups = groupDiagnostics(snapshot.registeredSubsystems);

  const renderSubsystem = (sub: SupergapSubsystemMetadata) => {
    const result = snapshot.lastResultsById[sub.id];
    const isBusy = snapshot.activeActionSubsystemId === sub.id;
    const status: SupergapSubsystemStatus = isBusy ? "idle" : result?.status ?? "idle";

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
              {isBusy ? "점검 중" : formatSubsystemStatusLabelKo(status)}
            </span>
          </div>
          {result && !isBusy ? (
            <p className="text-[0.72rem] text-fg-2 tabular-nums">
              예시 점검 결과 · {result.summaryKo} · 점검 시간 {result.latencyMs.toFixed(1)}ms
            </p>
          ) : null}
        </div>

        <button
          type="button"
          data-testid={`supergap-run-${sub.id}`}
          aria-label={`${sub.titleKo} 예시 점검`}
          disabled={isBusy || snapshot.isRunningDiagnostic}
          onClick={() => handleRunSubsystem(sub.id)}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-[background-color,border-color,color,transform] duration-150 hover:bg-raised enabled:active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <Play className="size-3.5 shrink-0" aria-hidden="true" />
          {isBusy ? "실행 중" : "점검"}
        </button>
      </li>
    );
  };

  return (
    <div
      role="region"
      aria-label="엔진 상태"
      data-testid="studio-supergap-status-drawer"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all]",
        className,
      )}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-line bg-panel pb-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-fg">엔진 상태</h2>
            <span
              data-testid="supergap-connection-pill"
              role="status"
              aria-atomic="true"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                isNativeConnected
                  ? "border-good/40 bg-good/10 text-good"
                  : "border-cool/40 bg-cool/10 text-cool",
              )}
            >
              <Cpu className="size-3.5 shrink-0" aria-hidden="true" />
              {hardware.title}
            </span>
          </div>

          <p
            data-testid="supergap-hardware-summary"
            className="text-xs text-fg-2 tabular-nums"
          >
            {hardware.detail}
          </p>
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="엔진 상태 닫기"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-fg-2 transition-[background-color,border-color,color,transform] duration-150 hover:bg-raised hover:text-fg enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
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
          네이티브 연결 확인
        </button>

        <button
          type="button"
          data-testid="supergap-diagnostic-btn"
          disabled={snapshot.isRunningDiagnostic}
          onClick={handleRunDiagnostic}
          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold text-on-accent transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <Activity className="size-4 shrink-0" aria-hidden="true" />
          {snapshot.isRunningDiagnostic ? "예제 진단 중…" : "예제 진단 실행"}
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
            {isNativeConnected
              ? `장치 연결 확인 ${bridge.latencyMs.toFixed(1)}ms`
              : "예제 장치 사용 · 실제 GPU 성능 미측정"}
          </span>
          <span>
            {report
              ? `최근 전체 점검 ${report.subsystems.length}개 · 통과 ${report.liveConnectedCount} · 추가 확인 ${report.browserFallbackCount} · 실패 ${report.errorCount}`
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
            <span>진단 항목</span>
            <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[0.7rem] font-semibold text-fg-2 tabular-nums">
              {checkedCount > 0 ? `${totalCount}개 중 ${checkedCount}개 점검` : `${totalCount}개 등록`}
            </span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-fg-2 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>

        <div className="border-t border-line px-2 pb-2">
          <p className="px-1 pt-2 text-xs text-fg-2">준비된 예시 데이터로 항목을 점검합니다.</p>
          {groups.map(({ label, items }) => (
            <details key={label} name="studio-runtime-diagnostic-group" className="group/diagnostic" data-runtime-diagnostic-group={label}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 border-b border-line px-1 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <span>{label}</span>
                <span className="inline-flex items-center gap-2 tabular-nums text-fg-2">
                  {items.length}개
                  <ChevronDown className="size-3.5 transition-transform group-open/diagnostic:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </span>
              </summary>
              <ul className="flex flex-col gap-2 py-2">
                {items.map(renderSubsystem)}
              </ul>
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}
