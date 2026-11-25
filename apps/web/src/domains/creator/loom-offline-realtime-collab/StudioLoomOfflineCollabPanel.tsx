/**
 * Wave 66A — LoomSync 완전 오프라인 비행기 모드 시뮬레이터 & 실시간 팀 협업 제어판.
 *
 * - 원클릭 "인터넷 강제 차단(비행기 모드)" 토글 + 오프라인 스트로크 추가 + 크래시 WAL 복구 + 온라인 RLE-Delta 자동 병합
 * - 4인 동시 분업 레인(선화·밑색·3D 배경·식자) & 순수 시맨틱 OKLCH SVG 보드(공간 핀·빨간펜·120Hz 라이브 커서·따라보기)
 * - A/B안 비주얼 디프 브랜치 & 타임머신 롤백 + 검수 메타데이터 모형(암호화·키·공유 URL 미생성) + JSON 내보내기
 * - Calm Atelier 토큰 엄수(원시 색·바이올렛 265~325°·광범위 트랜지션·장식 아이콘·Web Storage·기본 빈 객체 props 0건)
 */

import {
  AlertTriangle, Check, Code2, Copy, Eye, EyeOff, GitBranch, KeyRound,
  Layers, Lock, MapPin, Mic, Plus, Radio, RefreshCw, RotateCcw,
  ShieldCheck, Wifi, WifiOff, Zap,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  ATELIER_STAGE_BRAND, CURSOR_TARGET_HZ, DEFAULT_SIMULATION_EPOCH_MS, KILN_EXPORT_BRAND,
  LOOM_SYNC_BRAND, STROKE_DELTA_FRAME_BYTES, TOON_CORE_BRAND,
  addSpatialPin, adoptEpisodeBranch, evaluateRealtimeTeamCollabSession, exportLoomOfflineCollabJson,
  formatOklch, getDefaultCollabRoleLanes, getDefaultSpatialPins, getDefaultTimeMachineSnapshots,
  getOfflineCapabilityBoundary, requestLayerLockHandoff, rollbackToTimeMachineSnapshot,
  runOfflineOutageSimulation, toggleSpatialPinStatus,
  type CollabRoleId, type CollabRoleLane, type EpisodeBranchId, type LoomOfflineCollabExportPayload,
  type OfflineOutageSimulationReport, type RealtimeTeamCollabReport, type SpatialReviewPin,
  type TimeMachineSnapshot, type WatermarkDensity,
} from "./loom-offline-collab-engine";

export interface StudioLoomOfflineCollabPanelProps {
  readonly initialOfflineMode?: boolean;
  readonly initialFollowRoleId?: CollabRoleId | null;
  readonly initialBranchId?: EpisodeBranchId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onOfflineStateChange?: (offline: boolean, report: OfflineOutageSimulationReport) => void;
  readonly onExportJson?: (json: string, payload: LoomOfflineCollabExportPayload) => void | Promise<void>;
}

type MergePhase = "idle" | "queued-offline" | "wal-recovered" | "merged";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const BTN_WARN = `${BTN_BASE} border border-warn bg-warning-soft px-3 py-2 text-warn`;

// 비바이올렛 OKLCH 시맨틱 SVG 팔레트 (휴 265~325° 완전 배제)
const SVG_GRID_LINE = formatOklch({ l: 0.58, c: 0.015, h: 220 }, 0.25);
const SVG_INK_TEXT = formatOklch({ l: 0.24, c: 0.014, h: 232 });
const SVG_DIRTY_OFFLINE = formatOklch({ l: 0.62, c: 0.145, h: 52 }, 0.34);
const SVG_DIRTY_MERGED = formatOklch({ l: 0.56, c: 0.14, h: 158 }, 0.28);
const SVG_REDLINE = formatOklch({ l: 0.55, c: 0.19, h: 24 });
const SVG_RESOLVED_PIN = formatOklch({ l: 0.54, c: 0.14, h: 158 });
const SVG_SPOTLIGHT = formatOklch({ l: 0.52, c: 0.14, h: 212 });
const SVG_WM_TINT = formatOklch({ l: 0.32, c: 0.02, h: 224 }, 0.16);
const SVG_ON_INK = formatOklch({ l: 0.99, c: 0.002, h: 90 });

const EXPIRY_PRESETS: readonly number[] = [12, 24, 72];
const DENSITY_OPTIONS: readonly { readonly id: WatermarkDensity; readonly ko: string; readonly en: string }[] = [
  { id: "subtle", ko: "은은함", en: "Subtle" },
  { id: "standard", ko: "표준", en: "Standard" },
  { id: "strict", ko: "강력 포렌식", en: "Strict" },
];

function round1(value: number): number { return Math.round(value * 10) / 10; }

function resolveInitialBranchId(candidate: EpisodeBranchId | undefined): EpisodeBranchId {
  if (candidate === "main-cut-baseline" || candidate === "branch-a-sunset-rim" || candidate === "branch-b-moonlit-noir") return candidate;
  return "branch-a-sunset-rim";
}

function LoomCollabBoardSvg(props: {
  readonly offlineMode: boolean;
  readonly mergePhase: MergePhase;
  readonly offlineReport: OfflineOutageSimulationReport;
  readonly collabReport: RealtimeTeamCollabReport;
  readonly isEn: boolean;
}): ReactElement {
  const { offlineMode, mergePhase, offlineReport, collabReport, isEn } = props;
  const boardX = 16; const boardY = 38; const boardW = 728; const boardH = 258;
  const tileFill = offlineMode ? SVG_DIRTY_OFFLINE : SVG_DIRTY_MERGED;
  const bgTint = formatOklch(collabReport.activeBranch.previewTintOklch);
  const rimAccent = formatOklch(collabReport.activeBranch.rimAccentOklch);
  const visiblePins = collabReport.pins.filter((pin) => !collabReport.hideResolvedRedlines || pin.status === "open");
  const focusX = round1(boardX + collabReport.cursorTelemetry.viewportFocusXNorm * boardW);
  const focusY = round1(boardY + collabReport.cursorTelemetry.viewportFocusYNorm * boardH);

  return (
    <svg
      data-testid="loom-collab-canvas-svg" data-violet-free="true"
      data-offline-mode={offlineMode ? "true" : "false"} data-merge-phase={mergePhase}
      data-follow-role={collabReport.cursorTelemetry.followTargetRoleId ?? "none"}
      data-branch-id={collabReport.activeBranch.id}
      viewBox="0 0 760 314" role="img"
      aria-label={isEn ? "LoomSync collaborative webtoon canvas with dirty tiles, 4 cursors, spatial pins, and redlines" : "LoomSync 실시간 협업 캔버스 보드 — 변경 타일, 4인 라이브 커서, 공간 핀 및 빨간펜"}
      className="h-auto w-full rounded-xl border border-line bg-card text-fg"
    >
      <text x="16" y="24" fontSize="11.5" fontWeight="700" fill="currentColor">
        {isEn ? `${LOOM_SYNC_BRAND} Live Stage · ${collabReport.activeBranch.labelEn} · 256×256 Tile Grid` : `${LOOM_SYNC_BRAND} 라이브 협업 보드 · ${collabReport.activeBranch.labelKo} · 256×256 타일 그리드`}
      </text>
      <text x="744" y="24" textAnchor="end" fontSize="10" fontWeight="700" fill={offlineMode ? SVG_REDLINE : SVG_RESOLVED_PIN}>
        {offlineMode
          ? (isEn ? `AIRPLANE MODE · ${offlineReport.dirtyTileCount} DIRTY TILES IN OPFS WAL` : `비행기 모드 · OPFS WAL ${offlineReport.dirtyTileCount}타일 대기`)
          : (isEn ? `ONLINE HLC SYNC · ${CURSOR_TARGET_HZ}Hz · ${STROKE_DELTA_FRAME_BYTES}B DELTA` : `온라인 HLC 동기화 · ${CURSOR_TARGET_HZ}Hz · ${STROKE_DELTA_FRAME_BYTES}B 델타`)}
      </text>

      <rect x={boardX} y={boardY} width={boardW} height={boardH} rx="10" fill={bgTint} stroke={rimAccent} strokeWidth="1.5" />
      {[0, 1, 2, 3].map((cutIdx) => {
        const cx = boardX + 12 + cutIdx * 179;
        return (
          <g key={cutIdx}>
            <rect x={cx} y={boardY + 12} width="167" height={boardH - 24} rx="6" fill="none" stroke={SVG_GRID_LINE} strokeWidth="1.2" />
            <text x={cx + 8} y={boardY + 26} fontSize="9.5" fontWeight="700" fill={SVG_INK_TEXT} fillOpacity="0.65">{`C-0${cutIdx + 1}`}</text>
          </g>
        );
      })}

      <g data-testid="svg-dirty-tiles">
        {offlineReport.dirtyTilesSample.map((tile) => {
          const cellW = boardW / 8; const cellH = boardH / 6;
          return (
            <rect
              key={`${tile.tx}-${tile.ty}`}
              x={round1(boardX + (tile.tx % 8) * cellW + 4)} y={round1(boardY + (tile.ty % 6) * cellH + 4)}
              width={round1(cellW - 8)} height={round1(cellH - 8)} rx="4"
              fill={tileFill} stroke={offlineMode ? SVG_REDLINE : SVG_RESOLVED_PIN} strokeOpacity="0.45" strokeWidth="1"
            />
          );
        })}
      </g>

      <text x="380" y="175" textAnchor="middle" fontSize="12" fontWeight="700" fill={SVG_WM_TINT} transform="rotate(-11 380 175)">
        {collabReport.e2eeLink.watermarkText}
      </text>

      {collabReport.cursorTelemetry.spotlightActive ? (
        <g data-testid="svg-spotlight-frame">
          <rect x={round1(Math.max(boardX + 6, focusX - 92))} y={round1(Math.max(boardY + 6, focusY - 58))} width="184" height="116" rx="8" fill="none" stroke={SVG_SPOTLIGHT} strokeWidth="2" strokeDasharray="6 4" />
          <text x={round1(Math.max(boardX + 12, focusX - 86))} y={round1(Math.max(boardY + 20, focusY - 44))} fontSize="9" fontWeight="700" fill={SVG_SPOTLIGHT}>
            {isEn ? `FOLLOW SPOTLIGHT · ${collabReport.cursorTelemetry.viewportZoomPercent}%` : `따라보기 스포트라이트 · ${collabReport.cursorTelemetry.viewportZoomPercent}%`}
          </text>
        </g>
      ) : null}

      <g data-testid="svg-redline-layer">
        {visiblePins.map((pin) => {
          const pts = pin.redlinePoints.map(([px, py]) => `${round1(boardX + px * boardW)},${round1(boardY + py * boardH)}`).join(" ");
          return (
            <polyline
              key={`redline-${pin.id}`} data-testid={`svg-redline-${pin.id}`} points={pts} fill="none"
              stroke={pin.status === "open" ? SVG_REDLINE : SVG_RESOLVED_PIN} strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round" strokeDasharray={pin.status === "open" ? undefined : "4 3"}
            />
          );
        })}
      </g>

      <g data-testid="svg-spatial-pins">
        {collabReport.pins.map((pin, idx) => {
          const cx = round1(boardX + pin.xNorm * boardW); const cy = round1(boardY + pin.yNorm * boardH);
          const pinColor = pin.status === "open" ? SVG_REDLINE : SVG_RESOLVED_PIN;
          return (
            <g key={pin.id} data-testid={`svg-pin-${pin.id}`} data-pin-status={pin.status}>
              <circle cx={cx} cy={cy} r="10" fill={pinColor} fillOpacity={pin.status === "open" ? 0.92 : 0.45} />
              <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={SVG_ON_INK}>{String(idx + 1)}</text>
            </g>
          );
        })}
      </g>

      <g data-testid="svg-live-cursors">
        {collabReport.lanes.map((lane) => {
          const lx = round1(boardX + lane.cursorXNorm * boardW); const ly = round1(boardY + lane.cursorYNorm * boardH);
          const color = formatOklch(lane.accentOklch);
          return (
            <g key={lane.roleId} data-testid={`svg-cursor-${lane.roleId}`}>
              <path d={`M ${lx} ${ly} L ${lx + 11} ${ly + 7} L ${lx + 5} ${ly + 9} L ${lx + 3} ${ly + 15} Z`} fill={color} />
              <rect x={lx + 12} y={ly + 1} width="86" height="17" rx="4" fill={color} />
              <text x={lx + 17} y={ly + 12.5} fontSize="8.8" fontWeight="700" fill={SVG_ON_INK}>{isEn ? lane.labelEn.slice(0, 13) : lane.labelKo}</text>
            </g>
          );
        })}
      </g>

      <text x="16" y="308" fontSize="9.5" fill="currentColor" fillOpacity="0.72">
        {isEn
          ? `Visible redlines ${collabReport.visibleRedlinePinCount}/${collabReport.pins.length} · Team 120Hz ${collabReport.cursorTelemetry.teamTotalKbps} kbps · Latency ${collabReport.cursorTelemetry.latencyBudgetMs.totalMs}ms`
          : `표시 빨간펜 ${collabReport.visibleRedlinePinCount}/${collabReport.pins.length}건 · 4인 120Hz ${collabReport.cursorTelemetry.teamTotalKbps} kbps · 지연 ${collabReport.cursorTelemetry.latencyBudgetMs.totalMs}ms`}
      </text>
    </svg>
  );
}

/** LoomSync 완전 오프라인 비행기 모드 시뮬레이터 & 실시간 팀 협업 제어판(모든 props 선택적, 기본 빈 객체 props 금지). */
export function StudioLoomOfflineCollabPanel(props: StudioLoomOfflineCollabPanelProps): ReactElement {
  const uid = useId();
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [offlineMode, setOfflineMode] = useState<boolean>(props.initialOfflineMode ?? false);
  const [mergePhase, setMergePhase] = useState<MergePhase>(() => (props.initialOfflineMode ? "queued-offline" : "idle"));
  const [offlineStrokes, setOfflineStrokes] = useState<number>(100);
  const [crashCount, setCrashCount] = useState<number>(0);
  const [swInstalled, setSwInstalled] = useState<boolean>(true);

  const [lanes, setLanes] = useState<CollabRoleLane[]>(() => getDefaultCollabRoleLanes());
  const [overwritePreventedCount, setOverwritePreventedCount] = useState<number>(0);
  const [handoffNotice, setHandoffNotice] = useState<string>("");
  const [pins, setPins] = useState<SpatialReviewPin[]>(() => getDefaultSpatialPins());
  const [hideResolvedRedlines, setHideResolvedRedlines] = useState<boolean>(true);
  const [followRoleId, setFollowRoleId] = useState<CollabRoleId | null>(props.initialFollowRoleId ?? null);

  const [activeBranchId, setActiveBranchId] = useState<EpisodeBranchId>(() => resolveInitialBranchId(props.initialBranchId));
  const [adoptedBranchId, setAdoptedBranchId] = useState<EpisodeBranchId>("main-cut-baseline");
  const [snapshots, setSnapshots] = useState<TimeMachineSnapshot[]>(() => getDefaultTimeMachineSnapshots());

  const [viewerHandle, setViewerHandle] = useState<string>("pd-kim@studio-review.local");
  const [expiresInHours, setExpiresInHours] = useState<number>(24);
  const [watermarkDensity, setWatermarkDensity] = useState<WatermarkDensity>("standard");
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "pending" | "copied" | "error">("idle");

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const onExportRef = useRef(props.onExportJson);
  useEffect(() => { onExportRef.current = props.onExportJson; }, [props.onExportJson]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const offlineInput = useMemo(() => ({
    offlineStrokeCount: offlineStrokes, layerEditCount: 18, stage3dPlacementCount: 6,
    simulateTabCrash: true, simulateRemoteConcurrentOps: 14, swInstalledBeforeOutage: swInstalled,
    coopCoepEnabled: true, peerTabCount: 2,
  }), [offlineStrokes, swInstalled]);

  const offlineReport = useMemo(() => runOfflineOutageSimulation(offlineInput), [offlineInput]);
  const boundaryItems = useMemo(() => getOfflineCapabilityBoundary(), []);

  const collabInput = useMemo(() => ({
    lanes, pins, hideResolvedRedlines, followTargetRoleId: followRoleId, activeBranchId, adoptedBranchId,
    snapshots, overwritePreventedCount,
    e2eeInput: {
      episodeId: "EP-012-ROOFTOP", viewerHandle, viewerRoleLabel: isEn ? "Lead PD Review" : "담당 PD 검수",
      expiresInHours, watermarkDensity, allowDownload: false, nowEpochMs: DEFAULT_SIMULATION_EPOCH_MS,
    },
  }), [lanes, pins, hideResolvedRedlines, followRoleId, activeBranchId, adoptedBranchId, snapshots, overwritePreventedCount, viewerHandle, isEn, expiresInHours, watermarkDensity]);

  const collabReport = useMemo(() => evaluateRealtimeTeamCollabSession(collabInput), [collabInput]);
  const exportBundle = useMemo(() => exportLoomOfflineCollabJson({ offlineInput, collabInput }), [offlineInput, collabInput]);

  function handleToggleAirplaneMode(): void {
    const nextOffline = !offlineMode;
    setOfflineMode(nextOffline); setMergePhase(nextOffline ? "queued-offline" : "merged"); setCopyStatus("idle");
    props.onOfflineStateChange?.(nextOffline, offlineReport);
  }
  function handleAddOfflineStrokes(): void {
    setOfflineStrokes((prev) => Math.min(1000, prev + 25)); setOfflineMode(true); setMergePhase("queued-offline"); setCopyStatus("idle");
  }
  function handleCrashRecovery(): void { setCrashCount((prev) => prev + 1); setMergePhase("wal-recovered"); }
  function handleReconnectMerge(): void {
    setOfflineMode(false); setMergePhase("merged");
    props.onOfflineStateChange?.(false, offlineReport);
  }
  function handleLockAction(layerId: string, requesterRoleId: CollabRoleId, mode: "request" | "approve"): void {
    const result = requestLayerLockHandoff(lanes, layerId, requesterRoleId, mode);
    setLanes([...result.lanes]);
    if (result.overwritePrevented) setOverwritePreventedCount((prev) => prev + 1);
    setHandoffNotice(isEn ? result.eventEn : result.eventKo);
  }
  function handleAddPin(): void {
    setPins((prev) => addSpatialPin(prev, {
      cutId: "C-03", xNorm: 0.44 + ((prev.length * 9) % 35) / 100, yNorm: 0.46 + ((prev.length * 7) % 28) / 100,
      authorRoleId: "lineart", assigneeRoleId: "flat-color",
      noteKo: `신규 빨간펜 피드백 #${prev.length + 1}: 캐릭터 그림자 경계 부드럽게 보정`,
      noteEn: `New redline pin #${prev.length + 1}: soften cast shadow edge`,
      voiceMemoDurationSec: 8.5,
    }));
  }
  function handleAdoptBranch(): void {
    const result = adoptEpisodeBranch(snapshots, activeBranchId);
    setAdoptedBranchId(result.adoptedBranch.id); setSnapshots([...result.snapshots]);
  }
  function handleRollback(snapshotId: string): void {
    const result = rollbackToTimeMachineSnapshot(snapshots, snapshotId);
    setActiveBranchId(result.restoredBranch.id); setAdoptedBranchId(result.restoredBranch.id);
  }

  function handleResetAll(): void {
    setOfflineMode(false); setMergePhase("idle"); setOfflineStrokes(100); setCrashCount(0); setSwInstalled(true);
    setLanes(getDefaultCollabRoleLanes()); setOverwritePreventedCount(0); setHandoffNotice("");
    setPins(getDefaultSpatialPins()); setHideResolvedRedlines(true); setFollowRoleId(null);
    setActiveBranchId("branch-a-sunset-rim"); setAdoptedBranchId("main-cut-baseline");
    setSnapshots(getDefaultTimeMachineSnapshots()); setViewerHandle("pd-kim@studio-review.local");
    setExpiresInHours(24); setWatermarkDensity("standard"); setCopyStatus("idle");
  }

  async function handleCopyJson(): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setCopyStatus("pending");
    try {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (!clipboard?.writeText) throw new Error("clipboard unavailable");
      await clipboard.writeText(exportBundle.json);
      if (!mountedRef.current) return;
      setCopyStatus("copied");
      await onExportRef.current?.(exportBundle.json, exportBundle.payload);
    } catch {
      if (mountedRef.current) setCopyStatus("error");
    } finally {
      inFlightRef.current = false;
    }
  }

  const offlineAvailableItems = boundaryItems.filter((item) => item.tier === "offline-100-percent");
  const networkRequiredItems = boundaryItems.filter((item) => item.tier === "network-required");
  const viewerInputId = `${uid}-viewer-handle`;

  return (
    <section
      data-testid="studio-loom-offline-collab-panel"
      aria-label={pick("LoomSync 오프라인·팀 협업 메모리 참조 예제", "LoomSync Offline Outage Simulator & Realtime Team Collaboration")}
      className={`space-y-5 rounded-2xl border border-line bg-canvas p-5 text-fg ${props.className ?? ""}`.trim()}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
              <Radio className="h-3 w-3 shrink-0" aria-hidden="true" />
              {`${LOOM_SYNC_BRAND} · ${TOON_CORE_BRAND} · ${ATELIER_STAGE_BRAND} · ${KILN_EXPORT_BRAND}`}
            </span>
            <span data-testid="network-state-pill" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${offlineMode ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"}`}>
              {offlineMode ? <WifiOff className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Wifi className="h-3 w-3 shrink-0" aria-hidden="true" />}
              {offlineMode ? pick("비행기 모드 · 완전 오프라인", "Airplane Mode · Offline") : pick("온라인 HLC 실시간 동기화", "Online HLC Live Sync")}
            </span>
          </div>
          <h2 className="text-base font-bold text-fg [word-break:keep-all]">
            {pick("비행기 모드 무손실 오프라인 검증 & 4인 실시간 협업 스튜디오", "Airplane-Mode Zero-Loss Verifier & 4-Role Live Collab Studio")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("CPU 메모리 모형으로 오프라인 복구·타일 병합·4역할 협업·검수 메타데이터를 비교합니다. 실제 저장·팀 연결·암호화·공유 링크는 연결되지 않았습니다.", "Compare outage recovery, tile merge, team collaboration, and review metadata in a CPU memory model. Live persistence, team networking, encryption, and shared links are not connected.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="toggle-airplane-mode-btn" aria-pressed={offlineMode} onClick={handleToggleAirplaneMode} className={offlineMode ? BTN_WARN : BTN_SOLID}>
            {offlineMode ? <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {offlineMode ? pick("온라인 복귀하기", "Restore Network") : pick("인터넷 강제 차단(비행기 모드)", "Cut Network (Airplane Mode)")}
          </button>
          <button type="button" data-testid="export-loom-collab-json-btn" disabled={copyStatus === "pending"} onClick={() => { void handleCopyJson(); }} className={copyStatus === "copied" ? BTN_ACTIVE : BTN_OUTLINE}>
            {copyStatus === "copied" ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {copyStatus === "copied" ? pick("JSON 복사됨", "JSON Copied") : pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="reset-loom-collab-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {copyStatus === "error" ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-bad bg-bad-soft px-3 py-2 text-xs text-bad [word-break:keep-all]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {pick("클립보드 복사에 실패했습니다. 하단 JSON 미리보기에서 직접 복사해 주세요.", "Clipboard copy failed. Use the JSON preview below to copy manually.")}
        </div>
      ) : null}

      {/* 1부: 비행기 모드 6단계 무결성 & WAL 크래시 복구 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <ShieldCheck className="h-4 w-4 text-good" aria-hidden="true" />
            {pick("비행기 모드(네트워크 완전 단절) 6단계 무결성 & WAL 크래시 복구 시뮬레이터", "Airplane Mode 6-Stage Integrity & WAL Crash Recovery Simulator")}
          </h3>
          <span data-testid="merge-phase-badge" className="rounded-md border border-line bg-card px-2 py-0.5 font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
            {mergePhase === "queued-offline"
              ? pick(`오프라인 큐 ${offlineReport.totalLocalOperations}건 대기`, `Queued ${offlineReport.totalLocalOperations} ops offline`)
              : mergePhase === "wal-recovered"
                ? pick(`크래시 #${crashCount} WAL 복구 완료 (손실 0B)`, `Crash #${crashCount} WAL recovered (0B lost)`)
                : mergePhase === "merged"
                  ? pick(`재연결 RLE-Delta 병합 완료 (${offlineReport.bandwidthSavedPercent}% 절감)`, `Reconnected RLE-Delta merged (${offlineReport.bandwidthSavedPercent}% saved)`)
                  : pick(`검증 준비 · 손실 ${offlineReport.lostBytes}B · 수렴 ${offlineReport.convergenceRatePercent}%`, `Ready · ${offlineReport.lostBytes}B lost · ${offlineReport.convergenceRatePercent}% converged`)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="add-offline-strokes-btn" onClick={handleAddOfflineStrokes} className={BTN_OUTLINE}>
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick(`+25 오프라인 스트로크 추가 (현재 ${offlineStrokes}회)`, `Add +25 Offline Strokes (${offlineStrokes})`)}
          </button>
          <button type="button" data-testid="trigger-crash-recovery-btn" onClick={handleCrashRecovery} className={BTN_OUTLINE}>
            <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("강제 탭 크래시 → WAL 복구", "Simulate Tab Crash → WAL Recover")}
          </button>
          <button type="button" data-testid="reconnect-delta-merge-btn" onClick={handleReconnectMerge} className={BTN_SOLID}>
            <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("온라인 복귀 · 256×256 타일 델타 병합", "Reconnect & Merge 256×256 Deltas")}
          </button>
          <button type="button" data-testid="toggle-sw-installed-btn" aria-pressed={swInstalled} onClick={() => setSwInstalled((prev) => !prev)} className={swInstalled ? BTN_ACTIVE : BTN_WARN}>
            {swInstalled ? pick("SW 선설치됨 (정상)", "SW Precached") : pick("SW 미설치 초회방문 시뮬", "Simulate Cold Uninstalled Visit")}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-line bg-card p-2.5">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("크래시 바이트 손실", "Post-Crash Lost Bytes")}</div>
            <div data-testid="kpi-lost-bytes" className="font-mono text-sm font-bold text-good tabular-nums">{`${offlineReport.lostBytes} B`}</div>
          </div>
          <div className="rounded-lg border border-line bg-card p-2.5">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("HLC CRDT 수렴률", "HLC CRDT Convergence")}</div>
            <div data-testid="kpi-convergence" className="font-mono text-sm font-bold text-good tabular-nums">{`${offlineReport.convergenceRatePercent}%`}</div>
          </div>
          <div className="rounded-lg border border-line bg-card p-2.5">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("RLE-Delta 변경 타일", "Dirty 256px Tiles")}</div>
            <div data-testid="kpi-dirty-tiles" className="font-mono text-sm font-bold text-accent tabular-nums">{`${offlineReport.dirtyTileCount}/${offlineReport.totalCanvasTiles}`}</div>
          </div>
          <div className="rounded-lg border border-line bg-card p-2.5">
            <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("재연결 전송 절감", "Delta Bandwidth Saved")}</div>
            <div data-testid="kpi-bandwidth-saved" className="font-mono text-sm font-bold text-cool tabular-nums">{`${offlineReport.bandwidthSavedPercent}%`}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {offlineReport.stages.map((stage) => (
            <div key={stage.id} data-testid={`offline-stage-${stage.step}`} data-stage-status={stage.status} className="space-y-1 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-fg [word-break:keep-all]">{`${stage.step}. ${isEn ? stage.titleEn : stage.titleKo}`}</span>
                <span className={`font-mono text-[10px] font-bold ${stage.status === "pass" ? "text-good" : "text-warn"}`}>{stage.status === "pass" ? "PASS" : "WARN"}</span>
              </div>
              <div className="font-mono text-[11px] text-accent tabular-nums">{stage.metricLabel}</div>
              <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? stage.summaryEn : stage.summaryKo}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1 lg:grid-cols-2">
          <div data-testid="offline-boundary-available" className="space-y-1.5 rounded-lg border border-good bg-good-soft p-3">
            <h4 className="text-xs font-bold text-good [word-break:keep-all]">{pick("오프라인 100% 가능 (네트워크 0바이트)", "100% Offline Capable (Zero Network)")}</h4>
            <ul className="space-y-1 text-[11px] text-fg [word-break:keep-all]">
              {offlineAvailableItems.map((item) => <li key={item.id}><strong>{isEn ? item.titleEn : item.titleKo}</strong>{` — ${isEn ? item.reasonEn : item.reasonKo}`}</li>)}
            </ul>
          </div>
          <div data-testid="offline-boundary-network-required" className="space-y-1.5 rounded-lg border border-warn bg-warning-soft p-3">
            <h4 className="text-xs font-bold text-warn [word-break:keep-all]">{pick("네트워크 필요 (정직한 오프라인 경계)", "Network Required (Honest Boundary)")}</h4>
            <ul className="space-y-1 text-[11px] text-fg [word-break:keep-all]">
              {networkRequiredItems.map((item) => <li key={item.id}><strong>{isEn ? item.titleEn : item.titleKo}</strong>{` — ${isEn ? item.reasonEn : item.reasonKo}`}</li>)}
            </ul>
          </div>
        </div>
      </div>

      {/* 2부: 순수 시맨틱 SVG 보드 & 4역할 소프트 락 분업 레인 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("4인 동시 분업 소프트 락 · 120Hz 라이브 커서 · 공간 핀 & 빨간펜 보드", "4-Role Soft-Lock Division · 120Hz Live Cursors · Spatial Pins & Redlines")}
          </h3>
          <span data-testid="overwrite-guard-badge" className="font-mono text-[11px] font-bold text-good tabular-nums">
            {pick(`덮어쓰기 0건 보장 · 차단 누적 ${collabReport.overwritePreventedCount}회`, `0 Overwrites Guaranteed · ${collabReport.overwritePreventedCount} Guarded`)}
          </span>
        </div>

        <LoomCollabBoardSvg offlineMode={offlineMode} mergePhase={mergePhase} offlineReport={offlineReport} collabReport={collabReport} isEn={isEn} />

        {handoffNotice ? (
          <div role="status" data-testid="handoff-status-notice" className="rounded-lg border border-cool bg-info-soft px-3 py-2 text-xs text-cool [word-break:keep-all]">{handoffNotice}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-4">
          {collabReport.lanes.map((lane) => {
            const isFollowing = followRoleId === lane.roleId;
            const altRequester: CollabRoleId = lane.ownerRoleId === "lineart" ? "flat-color" : "lineart";
            return (
              <div key={lane.roleId} data-testid={`role-lane-${lane.roleId}`} className="space-y-2 rounded-lg border border-line bg-card p-3">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? lane.labelEn : lane.labelKo}</span>
                  <span data-testid={`lock-status-${lane.layerId}`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${lane.lockStatus === "handoff-requested" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"}`}>
                    <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                    {lane.lockStatus === "handoff-requested" ? pick("핸드오프 대기", "Handoff Pending") : pick("소프트 락", "Soft Locked")}
                  </span>
                </div>
                <div className="space-y-0.5 text-[11px] text-fg-2 [word-break:keep-all]">
                  <div>{isEn ? lane.memberNameEn : lane.memberNameKo}</div>
                  <div className="font-medium text-fg">{`${isEn ? lane.layerNameEn : lane.layerNameKo} (${lane.cutRange})`}</div>
                  <div className="font-mono text-[10px] text-fg-3 tabular-nums">{`Owner: ${lane.ownerRoleId} · ${lane.dirtyTilesPending} tiles`}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" data-testid={`follow-role-${lane.roleId}`} aria-pressed={isFollowing} onClick={() => setFollowRoleId((prev) => (prev === lane.roleId ? null : lane.roleId))} className={isFollowing ? BTN_ACTIVE : BTN_OUTLINE}>
                    <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {isFollowing ? pick("따라보기 중", "Following") : pick("따라보기", "Follow")}
                  </button>
                  {lane.lockStatus === "handoff-requested" ? (
                    <button type="button" data-testid={`handoff-approve-${lane.layerId}`} onClick={() => handleLockAction(lane.layerId, lane.pendingRequesterRoleId ?? altRequester, "approve")} className={BTN_SOLID}>
                      {pick("락 넘기기 승인", "Approve Handoff")}
                    </button>
                  ) : (
                    <button type="button" data-testid={`handoff-request-${lane.layerId}`} onClick={() => handleLockAction(lane.layerId, altRequester, "request")} className={BTN_OUTLINE}>
                      {pick("핸드오프 요청", "Request Lock")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3부: 공간 핀·10초 음성·빨간펜 + A/B안 비주얼 디프 브랜치 & 타임머신 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <MapPin className="h-4 w-4 text-bad" aria-hidden="true" />
              {pick(`캔버스 공간 핀 · 10초 음성 메모 · 빨간펜 (${collabReport.openPinCount} 미해결)`, `Spatial Pins · 10s Voice · Redline (${collabReport.openPinCount} open)`)}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="toggle-hide-resolved-redlines" aria-pressed={hideResolvedRedlines} onClick={() => setHideResolvedRedlines((prev) => !prev)} className={hideResolvedRedlines ? BTN_ACTIVE : BTN_OUTLINE}>
                {hideResolvedRedlines ? <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {hideResolvedRedlines ? pick("완료 빨간펜 숨김", "Hiding Resolved") : pick("모든 빨간펜 표시", "Show All Redlines")}
              </button>
              <button type="button" data-testid="add-spatial-pin-btn" onClick={handleAddPin} className={BTN_OUTLINE}>
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pick("공간 핀 추가", "Add Pin")}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {collabReport.pins.map((pin) => (
              <div key={pin.id} data-testid={`pin-card-${pin.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-accent tabular-nums">{`${pin.cutId} (${Math.round(pin.xNorm * 100)}%, ${Math.round(pin.yNorm * 100)}%)`}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-fg-2 tabular-nums">
                      <Mic className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {`${pin.voiceMemoDurationSec.toFixed(1)}s`}
                    </span>
                    <span className={`font-mono text-[10px] font-bold ${pin.status === "open" ? "text-bad" : "text-good"}`}>{pin.status === "open" ? pick("진행 중", "OPEN") : pick("수정 완료", "RESOLVED")}</span>
                  </div>
                  <p className="text-xs text-fg [word-break:keep-all]">{isEn ? pin.noteEn : pin.noteKo}</p>
                </div>
                <button type="button" data-testid={`toggle-pin-${pin.id}`} onClick={() => setPins((prev) => toggleSpatialPinStatus(prev, pin.id))} className={pin.status === "resolved" ? BTN_ACTIVE : BTN_OUTLINE}>
                  {pin.status === "open" ? pick("해결 완료", "Resolve") : pick("다시 열기", "Reopen")}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <GitBranch className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("에피소드 A/B안 비주얼 디프 & 타임머신 롤백", "Episode A/B Visual Diff Branches & Time Machine")}
            </h3>
            <span data-testid="adopted-branch-badge" className="font-mono text-[11px] font-bold text-good [word-break:keep-all]">
              {pick(`채택: ${collabReport.adoptedBranch.labelKo}`, `Adopted: ${collabReport.adoptedBranch.labelEn}`)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {collabReport.branches.map((branch) => (
              <button key={branch.id} type="button" data-testid={`branch-btn-${branch.id}`} aria-pressed={activeBranchId === branch.id} onClick={() => setActiveBranchId(branch.id)} className={activeBranchId === branch.id ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? branch.labelEn : branch.labelKo}
              </button>
            ))}
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <strong className="text-fg [word-break:keep-all]">{isEn ? collabReport.activeBranch.lightingPresetEn : collabReport.activeBranch.lightingPresetKo}</strong>
              <span className="font-mono text-[11px] text-fg-2 tabular-nums">{`${collabReport.activeBranch.changedTileCount} tiles · ${collabReport.activeBranch.contrastRatio}:1 · ${KILN_EXPORT_BRAND}`}</span>
            </div>
            <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? collabReport.activeBranch.summaryEn : collabReport.activeBranch.summaryKo}</p>
            <button type="button" data-testid="adopt-branch-btn" onClick={handleAdoptBranch} className={BTN_SOLID}>
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("현재 A/B 시안 1-클릭 채택", "Adopt Selected Variant (1-Click)")}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("타임머신 스냅샷 롤백", "Time Machine Rollback Checkpoints")}</div>
            {collabReport.snapshots.map((snap) => (
              <div key={snap.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs">
                <span className="text-fg [word-break:keep-all]">
                  <span className="mr-2 font-mono text-[11px] text-fg-3 tabular-nums">{snap.timestampLabel}</span>
                  {isEn ? snap.labelEn : snap.labelKo}
                </span>
                <button type="button" data-testid={`rollback-${snap.id}`} onClick={() => handleRollback(snap.id)} className={BTN_OUTLINE}>
                  <RotateCcw className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {pick("롤백", "Rollback")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4부: 미공개 원고 E2EE(AES-GCM-256) 포렌식 워터마크 만료 링크 + JSON 미리보기 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <KeyRound className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("검수 메타데이터 모형 · 암호화/공유 미연결", "Review Metadata Model · No Encryption or Sharing")}
          </h3>
          <span data-testid="e2ee-verification-badge" className="rounded-full border border-line bg-card px-2.5 py-0.5 font-mono text-[11px] font-bold text-fg-2">
            {pick("암호화 미실행 · 공유 불가", "Encryption Not Executed · Not Shareable")}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={viewerInputId} className="block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("검수자 식별자 예시", "Example Reviewer Identifier")}</label>
            <input id={viewerInputId} data-testid="e2ee-viewer-input" type="text" value={viewerHandle} onChange={(event) => setViewerHandle(event.target.value)} className={`min-h-11 w-full rounded-lg border border-line bg-card px-3 text-xs text-fg ${FOCUS_RING}`} />
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("모형 만료 시간 (접근 제어 없음)", "Model Expiry Window (No Access Control)")}</span>
            <div className="flex gap-1.5">
              {EXPIRY_PRESETS.map((hours) => (
                <button key={hours} type="button" data-testid={`expiry-hours-${hours}`} aria-pressed={expiresInHours === hours} onClick={() => setExpiresInHours(hours)} className={expiresInHours === hours ? BTN_ACTIVE : BTN_OUTLINE}>{`${hours}h`}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("원고 미적용 표식 밀도 예시", "Example Watermark Density (Not Applied)")}</span>
            <div className="flex gap-1.5">
              {DENSITY_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" data-testid={`wm-density-${opt.id}`} aria-pressed={watermarkDensity === opt.id} onClick={() => setWatermarkDensity(opt.id)} className={watermarkDensity === opt.id ? BTN_ACTIVE : BTN_OUTLINE}>{isEn ? opt.en : opt.ko}</button>
              ))}
            </div>
          </div>
        </div>

        <div data-testid="forensic-watermark-preview" className="space-y-1 rounded-lg border border-line-strong bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-fg-2 [word-break:keep-all]">{isEn ? collabReport.e2eeVerification.verdictEn : collabReport.e2eeVerification.verdictKo}</span>
            <span className="font-mono text-fg-3 tabular-nums">{`Model checksum ${collabReport.e2eeLink.watermarkDigest} · Download Off`}</span>
          </div>
          <div className="font-mono text-xs font-semibold text-fg">{collabReport.e2eeLink.watermarkText}</div>
          <div data-testid="e2ee-review-url" className="truncate font-mono text-[11px] text-fg-2">{collabReport.e2eeLink.reviewUrl || pick("실제 검수 URL과 암호키를 생성하지 않습니다.", "No live review URL or cryptographic key is generated.")}</div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
          <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? exportBundle.payload.honestyNoteEn : exportBundle.payload.honestyNoteKo}</p>
          <button type="button" data-testid="toggle-json-preview-btn" onClick={() => setShowJsonPreview((prev) => !prev)} className={showJsonPreview ? BTN_ACTIVE : BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJsonPreview ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}
          </button>
        </div>

        {showJsonPreview ? (
          <pre data-testid="loom-collab-json-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">{exportBundle.json}</pre>
        ) : null}
      </div>
    </section>
  );
}
