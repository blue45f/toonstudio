import {
  Activity,
  Cpu,
  Database,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cn } from "@/shared/lib/utils";
import { formatStudioOpfsBytes } from "../studio-opfs-filesystem";
import {
  getSharedGpuResourceLeakTracker,
  type EnduranceHealthStatus,
  type GpuCacheReclaimResult,
  type GpuDeviceRecoveryStatus,
  type GpuResourceLeakTracker,
} from "./gpu-resource-leak-tracker";
import {
  getSharedHistoryOpfsSpillStore,
  type HistoryOpfsSpillStore,
} from "./history-opfs-spill-store";

export interface StudioEnduranceGuardChipProps {
  /** 주입하지 않으면 스튜디오 공용 GPU 추적기를 구독한다. */
  readonly tracker?: GpuResourceLeakTracker;
  /** 주입하지 않으면 스튜디오 공용 히스토리 OPFS 스필 저장소를 구독한다. */
  readonly historyStore?: HistoryOpfsSpillStore;
  /** 1클릭 GPU 캐시 회수 직후 호출되는 선택 콜백. */
  readonly onReclaimGpuCache?: (result: GpuCacheReclaimResult) => void;
  /** 테스트·호스트에서 초기 펼침 상태를 제어할 때 사용한다(기본값: 접힘). */
  readonly defaultOpen?: boolean;
  /** 캔버스 전용 모드에서는 정상 상태일 때 최소 아이콘 칩으로 축소해 뷰포트를 지킨다. */
  readonly canvasOnlyMode?: boolean;
  /** 모바일 몰입 모드에서는 하단 안전 여백 위로 올려 조작 바와 겹치지 않게 한다. */
  readonly mobileImmersive?: boolean;
  readonly className?: string;
}

const STATUS_TONE_CLASS: Readonly<Record<EnduranceHealthStatus, string>> = {
  healthy: "border-line bg-panel text-fg-2",
  warning: "border-warning/40 bg-warning-soft/25 text-warning",
  critical: "border-danger/40 bg-danger-soft/25 text-danger",
};

const STATUS_BADGE_CLASS: Readonly<Record<EnduranceHealthStatus, string>> = {
  healthy: "border-accent/35 bg-accent-soft/25 text-accent",
  warning: "border-warning/40 bg-warning-soft/25 text-warning",
  critical: "border-danger/40 bg-danger-soft/25 text-danger",
};

const STATUS_LABEL_KO: Readonly<Record<EnduranceHealthStatus, string>> = {
  healthy: "안정",
  warning: "주의",
  critical: "점검 필요",
};

const DEVICE_STATUS_LABEL_KO: Readonly<Record<GpuDeviceRecoveryStatus, string>> = {
  idle: "대기",
  active: "WebGPU 정상",
  recovering: "자동 복구 중",
  recovered: "자동 복구 완료",
  "cpu-fallback": "CPU 안전 전환",
};

function worstStatus(
  first: EnduranceHealthStatus,
  second: EnduranceHealthStatus,
): EnduranceHealthStatus {
  if (first === "critical" || second === "critical") return "critical";
  if (first === "warning" || second === "warning") return "warning";
  return "healthy";
}

function formatPercent(ratio: number): string {
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(999, ratio * 100)) : 0;
  return `${Math.round(clamped)}%`;
}

function formatLeakPercent(ratio: number): string {
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(999, ratio * 100)) : 0;
  return `${clamped.toFixed(1)}%`;
}

function StatusGlyph({
  status,
  className,
}: {
  readonly status: EnduranceHealthStatus;
  readonly className?: string;
}) {
  if (status === "critical") return <ShieldAlert aria-hidden className={className} />;
  if (status === "warning") return <Activity aria-hidden className={className} />;
  return <ShieldCheck aria-hidden className={className} />;
}

/**
 * Calm Atelier 선택 토글형 10시간+ 세션 자가 진단 HUD 칩.
 *
 * - 기본 접힘 상태(단일 `min-h-11` 컴팩트 칩)로 캔버스 뷰포트 `>= 82%`를 침해하지 않는다.
 * - 열었을 때만 VRAM·히스토리 OPFS 스필·FPS 임계치와 1클릭 GPU 캐시 정리를 제공한다.
 */
export function StudioEnduranceGuardChip({
  tracker,
  historyStore,
  onReclaimGpuCache,
  defaultOpen = false,
  canvasOnlyMode = false,
  mobileImmersive = false,
  className,
}: StudioEnduranceGuardChipProps) {
  const resolvedTracker = tracker ?? getSharedGpuResourceLeakTracker();
  const resolvedHistory = historyStore ?? getSharedHistoryOpfsSpillStore();

  const gpu = useSyncExternalStore(
    resolvedTracker.subscribe,
    resolvedTracker.getSnapshot,
    resolvedTracker.getSnapshot,
  );
  const history = useSyncExternalStore(
    resolvedHistory.subscribe,
    resolvedHistory.getSnapshot,
    resolvedHistory.getSnapshot,
  );

  const [open, setOpen] = useState(defaultOpen);
  const [reclaimFeedback, setReclaimFeedback] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dialogId = useId();

  const overallStatus = worstStatus(gpu.overallStatus, history.status);
  const compactIconOnly = canvasOnlyMode && overallStatus === "healthy" && !open;
  const statusLabel = STATUS_LABEL_KO[overallStatus];

  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const handleReclaimCache = useCallback(() => {
    const result = resolvedTracker.reclaimUnusedCaches({
      minIdleMs: 0,
      includeStrokeAndCut: true,
    });
    setReclaimFeedback(result.summaryKo);
    onReclaimGpuCache?.(result);
  }, [onReclaimGpuCache, resolvedTracker]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      handleClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [handleClose, open]);

  return (
    <div
      data-studio-endurance-guard="true"
      data-endurance-status={overallStatus}
      className={cn(
        "pointer-events-auto fixed left-[max(0.75rem,env(safe-area-inset-left))] z-40 [word-break:keep-all]",
        mobileImmersive
          ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]"
          : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {open ? (
        <div
          ref={panelRef}
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${dialogId}-title`}
          aria-describedby={`${dialogId}-desc`}
          data-studio-endurance-panel="true"
          className="mb-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-panel p-4 text-fg shadow-xl [word-break:keep-all]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 id={`${dialogId}-title`} className="text-sm font-bold text-fg">
                  장시간 세션 자가 진단
                </h2>
                <span
                  data-studio-endurance-badge={overallStatus}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold",
                    STATUS_BADGE_CLASS[overallStatus],
                  )}
                >
                  {statusLabel}
                </span>
              </div>
              <p id={`${dialogId}-desc`} className="mt-1 text-xs leading-relaxed text-fg-3">
                GPU 자원 누수, OPFS 히스토리 스필, 프레임 속도를 로컬에서 실시간 점검합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="세션 자가 진단 닫기"
              className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <dl className="mt-3 space-y-2">
            <div
              data-studio-endurance-metric="vram"
              data-metric-status={gpu.vramStatus}
              className="rounded-xl border border-line bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
                  <Cpu className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
                  VRAM · GPU 자원
                </dt>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold tabular-nums",
                    STATUS_BADGE_CLASS[gpu.vramStatus],
                  )}
                >
                  {formatPercent(gpu.vramUtilizationRatio)} · {STATUS_LABEL_KO[gpu.vramStatus]}
                </span>
              </div>
              <dd className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-fg">
                <span className="font-semibold tabular-nums">
                  {formatStudioOpfsBytes(gpu.activeBytes)} / {formatStudioOpfsBytes(gpu.vramBudgetBytes)}
                </span>
                <span className="text-fg-3 tabular-nums">
                  활성 {gpu.activeCount.toLocaleString("ko-KR")}건
                </span>
              </dd>
              <p className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[0.7rem] text-fg-3 tabular-nums">
                <span>
                  누수율 {formatLeakPercent(gpu.soak.leakGrowthRatio)} (상한{" "}
                  {formatLeakPercent(gpu.soak.maxLeakGrowthRatio)})
                </span>
                <span>{DEVICE_STATUS_LABEL_KO[gpu.deviceRecovery.status]}</span>
              </p>
            </div>

            <div
              data-studio-endurance-metric="history"
              data-metric-status={history.status}
              className="rounded-xl border border-line bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
                  <Database className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
                  히스토리 · OPFS 스필
                </dt>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold tabular-nums",
                    STATUS_BADGE_CLASS[history.status],
                  )}
                >
                  {formatPercent(history.ramUtilizationRatio)} · {STATUS_LABEL_KO[history.status]}
                </span>
              </div>
              <dd className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-fg">
                <span className="font-semibold tabular-nums">
                  RAM {formatStudioOpfsBytes(history.ramBytes)} / {formatStudioOpfsBytes(history.ramBudgetBytes)}
                </span>
                <span className="text-fg-3 tabular-nums">
                  전체 {history.totalStepCount.toLocaleString("ko-KR")}단계
                </span>
              </dd>
              <p className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[0.7rem] text-fg-3 tabular-nums">
                <span>
                  메모리 {history.hotStepCount.toLocaleString("ko-KR")} · OPFS 스필{" "}
                  {history.spilledStepCount.toLocaleString("ko-KR")}
                </span>
                <span>{history.durability === "durable" ? "OPFS 영구" : "메모리 어댑터"}</span>
              </p>
            </div>

            <div
              data-studio-endurance-metric="fps"
              data-metric-status={gpu.fpsStatus}
              className="rounded-xl border border-line bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
                  <Gauge className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
                  프레임 속도 (FPS)
                </dt>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold",
                    STATUS_BADGE_CLASS[gpu.fpsStatus],
                  )}
                >
                  {STATUS_LABEL_KO[gpu.fpsStatus]}
                </span>
              </div>
              <dd className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-fg">
                <span className="font-semibold tabular-nums">{gpu.fps} fps</span>
                <span className="text-fg-3 tabular-nums">
                  P95 {gpu.p95FrameMs.toFixed(1)} ms · 획 {gpu.soak.strokeCount.toLocaleString("ko-KR")}
                </span>
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={handleReclaimCache}
            data-studio-endurance-reclaim="true"
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              {gpu.reclaimableCount > 0
                ? `미사용 GPU 캐시 정리 (${gpu.reclaimableCount.toLocaleString("ko-KR")}건 · ${formatStudioOpfsBytes(gpu.reclaimableBytes)})`
                : "미사용 GPU 캐시 정리"}
            </span>
          </button>

          {reclaimFeedback ? (
            <p
              role="status"
              aria-live="polite"
              data-studio-endurance-feedback="true"
              className="mt-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-medium text-fg-2 tabular-nums"
            >
              {reclaimFeedback}
            </p>
          ) : null}

          {gpu.deviceRecovery.lastNoticeKo ? (
            <p className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">
              {gpu.deviceRecovery.lastNoticeKo}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={`세션 자가 진단: ${statusLabel}`}
        title={`세션 자가 진단 (${statusLabel} · VRAM ${formatPercent(gpu.vramUtilizationRatio)} · ${gpu.fps} fps)`}
        onClick={() => setOpen((prev) => !prev)}
        data-studio-endurance-trigger="true"
        data-endurance-compact={compactIconOnly ? "true" : "false"}
        className={cn(
          "flex min-h-11 items-center justify-center gap-2 rounded-full border text-xs font-semibold shadow-sm transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
          compactIconOnly ? "w-11 px-0" : "px-3 py-2",
          STATUS_TONE_CLASS[overallStatus],
        )}
      >
        <StatusGlyph status={overallStatus} className="h-4 w-4 shrink-0" />
        {compactIconOnly ? (
          <span className="sr-only">세션 진단 {statusLabel}</span>
        ) : (
          <span className="flex items-center gap-1.5 tabular-nums">
            <span>세션 진단</span>
            <span className="text-fg-3">{formatPercent(gpu.vramUtilizationRatio)}</span>
            <span className="text-fg-3">{gpu.fps}fps</span>
          </span>
        )}
      </button>
    </div>
  );
}
