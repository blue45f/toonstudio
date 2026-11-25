/**
 * Wave 56B — 메모리 CRDT 메타데이터 병합과 GPU 비용 모형 제어판.
 *
 * - 4피어 메모리 메타데이터 병합 예제(실제 네트워크·OPFS·GPU 미연결)
 * - 4종 네트워크 시나리오(정상 LAN · 지연·패킷 역전 · 오프라인 분기 후 재연결 · 동일 타일 동시 충돌)
 * - 순수 시맨틱 SVG 4×4(256×256) 타일 충돌·코얼레싱 히트맵 및 4피어 HLC 시계·작업 수 도해(oklch/currentColor 전용, 바이올렛 휴 0%)
 * - 피어별 FNV-1a 최종 상태 해시 100% 일치 배지 · 전송 경로(WebRTC/WS Relay/OPFS) 구분 · JSON 스냅샷 내보내기
 */

import {
  Activity, CheckCircle2, ClipboardCopy, Eye, FileJson, GitMerge,
  Layers, Network, PenTool, Radio, RotateCcw, ShieldCheck, WifiOff, Zap,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  ALL_TILE_KEYS, CRDT_NETWORK_SCENARIOS, TILE_GRID_COLS,
  applyLocalStrokeOp, coalesceDirtyTileFrame, createClusterForScenario,
  createDeterministicReversedDuplicateStream, exportCrdtSyncSnapshotJson, formatHlc,
  getNetworkScenarioSpec, getPeerRoleSpec, makeTileKey, mergeRemoteOps,
  reconcileClusterOutOfOrder, runConcurrentBurstOnCluster, verifyCrdtConvergenceLaws,
  type CrdtConvergenceProof, type CrdtNetworkScenarioId, type CrdtPeerState,
  type CrdtSyncExportSnapshot, type DirtyTileCoalesceReport, type PeerId,
  type SyncTransportChannel, type TileKey, type TileStrokeOp,
} from "./crdt-tile-sync-engine";

export interface CrdtSyncStateChangeEvent {
  readonly scenarioId: CrdtNetworkScenarioId;
  readonly activePeerId: PeerId;
  readonly activePeerCount: number;
  readonly allPeersConverged: boolean;
  readonly canonicalStateHash: string;
  readonly coalescingReductionPct: number;
  readonly totalOfflineQueueDepth: number;
}

export interface StudioDistributedCrdtSyncPanelProps {
  readonly initialPeerCount?: 2 | 3 | 4;
  readonly initialNetworkMode?: CrdtNetworkScenarioId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onStateChange?: (event: CrdtSyncStateChangeEvent) => void | Promise<void>;
  readonly onExportJson?: (json: string, snapshot: CrdtSyncExportSnapshot) => void | Promise<void>;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(수렴/WebRTC 155°, 릴레이 215°, 오프라인/OPFS 72°, 충돌 25°, 코얼레싱 190°)
const SVG_INK_CONVERGED = "oklch(0.55 0.14 155)";
const SVG_INK_RELAY = "oklch(0.56 0.12 215)";
const SVG_INK_OFFLINE = "oklch(0.67 0.14 72)";
const SVG_INK_CONFLICT = "oklch(0.57 0.21 25)";
const SVG_INK_COALESCE = "oklch(0.55 0.11 190)";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const BTN_GOOD = `${BTN_BASE} border border-good bg-good-soft px-3 py-2 text-good hover:bg-raised`;

const FOCUS_TILES: readonly { readonly x: number; readonly y: number; readonly label: string }[] = [
  { x: 1, y: 1, label: "(1,1)" },
  { x: 2, y: 1, label: "(2,1)" },
  { x: 1, y: 2, label: "(1,2)" },
  { x: 2, y: 2, label: "(2,2)" },
];

function transportLabel(channel: SyncTransportChannel): string {
  if (channel === "webrtc-datachannel") return "WebRTC DataChannel";
  if (channel === "websocket-relay") return "WebSocket Relay";
  return "OPFS Offline Queue";
}

function transportBadgeClass(channel: SyncTransportChannel): string {
  if (channel === "webrtc-datachannel") return "border-good bg-good-soft text-good";
  if (channel === "websocket-relay") return "border-accent bg-accent-soft text-accent";
  return "border-warn bg-warning-soft text-warn";
}

function transportSvgInk(channel: SyncTransportChannel): string {
  if (channel === "webrtc-datachannel") return SVG_INK_CONVERGED;
  if (channel === "websocket-relay") return SVG_INK_RELAY;
  return SVG_INK_OFFLINE;
}

function collectUniqueClusterOps(peers: readonly CrdtPeerState[]): readonly TileStrokeOp[] {
  const map = new Map<string, TileStrokeOp>();
  for (const peer of peers) {
    for (const op of peer.opLog) map.set(op.opId, op);
    for (const op of peer.offlineOutbox) map.set(op.opId, op);
  }
  return Array.from(map.values());
}

function TileHeatmapAndHlcSvg(props: {
  readonly peers: readonly CrdtPeerState[];
  readonly activePeer: CrdtPeerState;
  readonly selectedTileKey: TileKey;
  readonly coalesceReport: DirtyTileCoalesceReport;
  readonly allConverged: boolean;
  readonly isEn: boolean;
}): ReactElement {
  const { peers, activePeer, selectedTileKey, coalesceReport, allConverged, isEn } = props;
  const dirtyMap = new Map(coalesceReport.dirtyTiles.map((d) => [d.tileKey, d]));
  const maxVectorOps = Math.max(1, ...peers.map((p) => p.opLog.length));
  const cellSize = 46;
  const cellGap = 6;
  const gridX = 22;
  const gridY = 44;

  return (
    <svg
      role="img"
      data-testid="crdt-tile-hlc-svg"
      aria-label={isEn ? "4x4 tile conflict coalescing heatmap and 4-peer HLC clock and operation count diagram" : "4×4 캔버스 타일 충돌·코얼레싱 히트맵 및 4피어 HLC 시계·작업 수 도해"}
      viewBox="0 0 760 272"
      className="h-auto w-full text-fg"
    >
      <rect x={2} y={2} width={756} height={268} rx={12} fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.14} />
      <text x={22} y={25} fontSize={11} fontWeight={700} fill="currentColor">
        {isEn ? "4×4 METADATA TILE CONFLICT & COALESCING MODEL" : "4×4 메타데이터 타일 (256×256 가정) 충돌 · 비용 모형"}
      </text>
      <text x={256} y={25} fontSize={10} fill="currentColor" fillOpacity={0.68}>
        {isEn ? `Peer: ${activePeer.roleLabelEn}` : `기준 피어: ${activePeer.roleLabelKo}`}
      </text>

      {ALL_TILE_KEYS.map((key, idx) => {
        const tx = idx % TILE_GRID_COLS;
        const ty = Math.floor(idx / TILE_GRID_COLS);
        const cell = activePeer.tiles[key];
        const dirty = dirtyMap.get(key);
        const x = gridX + tx * (cellSize + cellGap);
        const y = gridY + ty * (cellSize + cellGap);
        const opCount = cell?.appliedOpCount ?? 0;
        const conflicts = cell?.concurrentConflictCount ?? 0;
        const isSelected = key === selectedTileKey;
        const ink = conflicts > 0 ? SVG_INK_CONFLICT : dirty ? SVG_INK_COALESCE : opCount > 0 ? SVG_INK_RELAY : "currentColor";
        const opacity = opCount === 0 ? 0.05 : Math.min(0.45, 0.14 + opCount * 0.03);
        return (
          <g key={key} data-testid={`svg-tile-${tx}-${ty}`}>
            <rect
              x={x} y={y} width={cellSize} height={cellSize} rx={7}
              fill={ink} fillOpacity={opacity}
              stroke={isSelected ? SVG_INK_CONVERGED : ink}
              strokeWidth={isSelected ? 2.2 : 1.1}
              strokeOpacity={isSelected ? 1 : opCount > 0 ? 0.85 : 0.24}
            />
            <text x={x + 5} y={y + 13} fontSize={9} fontWeight={700} fill="currentColor" fillOpacity={0.78}>
              {tx},{ty}
            </text>
            <text x={x + cellSize / 2} y={y + 29} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">
              {opCount}
            </text>
            <text x={x + cellSize / 2} y={y + 41} textAnchor="middle" fontSize={8} fill={conflicts > 0 ? SVG_INK_CONFLICT : dirty ? SVG_INK_COALESCE : "currentColor"} fillOpacity={0.9}>
              {conflicts > 0 ? (isEn ? `C:${conflicts}` : `충돌${conflicts}`) : dirty ? "1pass" : "idle"}
            </text>
          </g>
        );
      })}

      {/* 좌측 하단 범례 */}
      <g transform="translate(22, 254)">
        <rect x={0} y={-8} width={10} height={10} rx={2} fill={SVG_INK_CONFLICT} fillOpacity={0.75} />
        <text x={14} y={0} fontSize={9} fill="currentColor" fillOpacity={0.78}>{isEn ? "250ms Candidates" : "250ms 충돌 후보"}</text>
        <rect x={108} y={-8} width={10} height={10} rx={2} fill={SVG_INK_COALESCE} fillOpacity={0.75} />
        <text x={122} y={0} fontSize={9} fill="currentColor" fillOpacity={0.78}>{isEn ? "Modeled 1-Pass" : "GPU 1패스 가정"}</text>
      </g>

      {/* 우측 구분선 */}
      <line x1={374} y1={16} x2={374} y2={256} stroke="currentColor" strokeOpacity={0.14} strokeDasharray="3 3" />

      {/* 우측: 4피어 HLC 시계·작업 수 & 수렴 도해 */}
      <text x={392} y={25} fontSize={11} fontWeight={700} fill="currentColor">
        {isEn ? "PEER HLC CLOCK & SAMPLE HASH COMPARISON" : "4피어 HLC 시계·작업 수 · FNV-1a 수렴 상태"}
      </text>
      <rect
        x={648} y={12} width={94} height={20} rx={10}
        fill={allConverged ? SVG_INK_CONVERGED : SVG_INK_OFFLINE} fillOpacity={0.18}
        stroke={allConverged ? SVG_INK_CONVERGED : SVG_INK_OFFLINE} strokeWidth={1}
      />
      <text x={695} y={25} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={allConverged ? SVG_INK_CONVERGED : SVG_INK_OFFLINE}>
        {allConverged ? (isEn ? "100% MATCH" : "해시 100% 일치") : (isEn ? "PARTITIONED" : "분기 대기")}
      </text>

      {peers.map((peer, idx) => {
        const rowY = 48 + idx * 50;
        const barW = Math.max(12, Math.round((peer.opLog.length / maxVectorOps) * 188));
        const ink = transportSvgInk(peer.transportChannel);
        const isActive = peer.peerId === activePeer.peerId;
        return (
          <g key={peer.peerId} data-testid={`svg-peer-clock-${peer.peerId}`}>
            <rect
              x={392} y={rowY} width={350} height={42} rx={8}
              fill={ink} fillOpacity={isActive ? 0.14 : 0.06}
              stroke={ink} strokeOpacity={isActive ? 0.95 : 0.35} strokeWidth={isActive ? 1.6 : 1}
            />
            <text x={402} y={rowY + 16} fontSize={10.5} fontWeight={700} fill="currentColor">
              {isEn ? peer.roleLabelEn : peer.roleLabelKo}
            </text>
            <text x={502} y={rowY + 16} fontSize={9} fill={ink} fontWeight={700}>
              {peer.transportChannel === "webrtc-datachannel" ? "WebRTC" : peer.transportChannel === "websocket-relay" ? "WS Relay" : "OPFS Queue"}
            </text>
            <text x={732} y={rowY + 16} textAnchor="end" fontSize={9} fontFamily="monospace" fill="currentColor" fillOpacity={0.8}>
              {peer.stateHash.slice(0, 14)}
            </text>
            <rect x={402} y={rowY + 24} width={190} height={9} rx={4.5} fill="currentColor" fillOpacity={0.1} />
            <rect x={402} y={rowY + 24} width={barW} height={9} rx={4.5} fill={ink} fillOpacity={0.85} />
            <text x={600} y={rowY + 32} fontSize={8.5} fontFamily="monospace" fill="currentColor" fillOpacity={0.78}>
              op:{peer.opLog.length} · L:{peer.clock.logical} · Q:{peer.offlineOutbox.length}
            </text>
          </g>
        );
      })}

      <text x={392} y={258} fontSize={9.5} fill="currentColor" fillOpacity={0.72}>
        {isEn
          ? `Coalescing: ${coalesceReport.naiveDrawCalls} ops → ${coalesceReport.coalescedDrawCalls} GPU tile passes (${coalesceReport.coalescingReductionPct}% modeled savings · latency unmeasured)`
          : `코얼레싱: ${coalesceReport.naiveDrawCalls} op → 추정 GPU 타일 ${coalesceReport.coalescedDrawCalls}패스 (${coalesceReport.coalescingReductionPct}% 추정 절감 · 지연 미측정)`}
      </text>
    </svg>
  );
}

export function StudioDistributedCrdtSyncPanel(props: StudioDistributedCrdtSyncPanelProps): ReactElement {
  const { initialPeerCount = 4, initialNetworkMode = "lan-normal", locale = "ko", className, onStateChange, onExportJson } = props;
  const headingId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [scenarioId, setScenarioId] = useState<CrdtNetworkScenarioId>(initialNetworkMode);
  const [peers, setPeers] = useState<readonly CrdtPeerState[]>(() => createClusterForScenario(initialNetworkMode, initialPeerCount));
  const [activePeerId, setActivePeerId] = useState<PeerId>("lead-artist");
  const [selectedTile, setSelectedTile] = useState<{ readonly x: number; readonly y: number }>({ x: 1, y: 1 });
  const [lastCoalesce, setLastCoalesce] = useState<DirtyTileCoalesceReport>(() => coalesceDirtyTileFrame(collectUniqueClusterOps(createClusterForScenario(initialNetworkMode, initialPeerCount))));
  const [proof, setProof] = useState<CrdtConvergenceProof | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string>("");
  const [exportPending, setExportPending] = useState(false);

  const scenarioSpec = useMemo(() => getNetworkScenarioSpec(scenarioId), [scenarioId]);
  const activePeer = useMemo(() => peers.find((p) => p.peerId === activePeerId) ?? peers[0], [peers, activePeerId]);
  const selectedTileKey = makeTileKey(selectedTile.x, selectedTile.y);
  const canonicalHash = peers[0]?.stateHash ?? "";
  const allPeersConverged = peers.length > 0 && peers.every((p) => p.stateHash === canonicalHash);
  const totalOfflineQueueDepth = peers.reduce((sum, p) => sum + p.offlineOutbox.length, 0);
  const totalDuplicatesIgnored = peers.reduce((sum, p) => sum + p.metrics.duplicateOpsIgnored, 0);
  const totalOutOfOrderAccepted = peers.reduce((sum, p) => sum + p.metrics.outOfOrderOpsAccepted, 0);
  const totalConflictsResolved = Math.max(0, ...peers.map((p) => p.metrics.conflictAutoResolvedCount));

  const { json: snapshotJson, snapshot } = useMemo(
    () => exportCrdtSyncSnapshotJson({ scenarioId, peers, lastCoalesceReport: lastCoalesce, proof }),
    [scenarioId, peers, lastCoalesce, proof],
  );

  const emitChange = (nextScenario: CrdtNetworkScenarioId, nextPeers: readonly CrdtPeerState[], nextPeerId: PeerId, nextReport: DirtyTileCoalesceReport): void => {
    const firstHash = nextPeers[0]?.stateHash ?? "";
    try {
      const receipt = onStateChange?.({
      scenarioId: nextScenario,
      activePeerId: nextPeerId,
      activePeerCount: nextPeers.length,
      allPeersConverged: nextPeers.every((p) => p.stateHash === firstHash),
      canonicalStateHash: firstHash,
      coalescingReductionPct: nextReport.coalescingReductionPct,
      totalOfflineQueueDepth: nextPeers.reduce((acc, p) => acc + p.offlineOutbox.length, 0),
      });
      void Promise.resolve(receipt).catch(() => setStatusNotice(pick("상태 전달 실패. 동작을 다시 실행해 재시도하세요.", "State delivery failed. Repeat the action to retry.")));
    } catch { setStatusNotice(pick("상태 전달 실패. 동작을 다시 실행해 재시도하세요.", "State delivery failed. Repeat the action to retry.")); }
  };

  const runAction = (action: () => void): void => {
    try { action(); } catch (error) {
      setStatusNotice(pick(`예제 실행 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}. 초기화 후 재시도하세요.`, "Example failed. Reset and retry."));
    }
  };

  const handleSelectScenario = (nextScenario: CrdtNetworkScenarioId): void => {
    const nextPeers = createClusterForScenario(nextScenario, initialPeerCount);
    const nextReport = coalesceDirtyTileFrame(collectUniqueClusterOps(nextPeers));
    const nextActive = nextPeers.some((p) => p.peerId === activePeerId) ? activePeerId : (nextPeers[0]?.peerId ?? "lead-artist");
    setScenarioId(nextScenario);
    setPeers(nextPeers);
    setActivePeerId(nextActive);
    setLastCoalesce(nextReport);
    setProof(null);
    const spec = getNetworkScenarioSpec(nextScenario);
    setStatusNotice(pick(`시나리오를 '${spec.labelKo}' 모드로 전환했다. (${spec.summaryKo})`, `Switched scenario to '${spec.labelEn}'. (${spec.summaryEn})`));
    emitChange(nextScenario, nextPeers, nextActive, nextReport);
  };

  const handleLocalStroke = (): void => {
    if (!activePeer) return;
    const localRes = applyLocalStrokeOp(activePeer, {
      tileX: selectedTile.x, tileY: selectedTile.y,
      layerId: scenarioId === "same-tile-conflict" ? "layer-ink" : activePeer.defaultLayerId,
      pointCount: 22, physicalNowMs: activePeer.clock.physicalMs + 5, strokeSeed: `manual-${activePeer.localSeq + 1}`,
    });
    const delivery = scenarioSpec.reorderPackets ? createDeterministicReversedDuplicateStream([localRes.op]) : [localRes.op];
    const nextPeers = peers.map((p) => {
      if (p.peerId === activePeer.peerId) return localRes.peer;
      if (activePeer.isOffline || p.isOffline) return p;
      return mergeRemoteOps(p, delivery).peer;
    });
    const nextReport = coalesceDirtyTileFrame([localRes.op, ...collectUniqueClusterOps(nextPeers)]);
    setPeers(nextPeers);
    setLastCoalesce(nextReport);
    setProof(null);
    setStatusNotice(
      activePeer.isOffline
        ? pick(`${activePeer.roleLabelKo}: 메모리 예제 추가 → 오프라인 대기열 모형 적재(${localRes.peer.offlineOutbox.length}건 대기)`, `${activePeer.roleLabelEn}: metadata model updated → in-memory offline queue (${localRes.peer.offlineOutbox.length} pending)`)
        : pick(`${activePeer.roleLabelKo}: 타일(${selectedTile.x},${selectedTile.y}) 메타데이터 병합 모형 완료 (전송 경로 가정: ${transportLabel(localRes.syncPath)})`, `${activePeer.roleLabelEn}: modeled metadata merge at tile (${selectedTile.x},${selectedTile.y}); assumed transport: ${transportLabel(localRes.syncPath)}`),
    );
    emitChange(scenarioId, nextPeers, activePeer.peerId, nextReport);
  };

  const handleBurst40 = (): void => {
    const res = runConcurrentBurstOnCluster(peers, scenarioId, 40);
    setProof(null);
    setPeers(res.peers);
    setLastCoalesce(res.coalesceReport);
    setStatusNotice(
      pick(
        `40개 예제 메타데이터 생성: 추정 GPU 타일 ${res.coalesceReport.coalescedDrawCalls}패스로 병합(${res.coalesceReport.coalescingReductionPct}% 추정 패스 절감, 실제 GPU·지연 미검증)`,
        `40-op metadata example: modeled ${res.coalesceReport.coalescedDrawCalls} GPU tile passes (${res.coalesceReport.coalescingReductionPct}% estimated pass reduction; GPU/latency unverified)`,
      ),
    );
    emitChange(scenarioId, res.peers, activePeerId, res.coalesceReport);
  };

  const handleReconcileMerge = (): void => {
    const targetTransport: SyncTransportChannel = scenarioId === "jitter-reorder" ? "websocket-relay" : "webrtc-datachannel";
    const res = reconcileClusterOutOfOrder(peers, targetTransport);
    setProof(null);
    setPeers(res.peers);
    setLastCoalesce(res.coalesceReport);
    setStatusNotice(
      pick(
        `메모리의 역순·중복 예제 병합 및 대기열 모형 비우기 완료: 중복 ${res.totalDuplicatesIgnored}건 무시 · 역순 ${res.totalOutOfOrderAccepted}건 수용 · 전 피어 FNV-1a 100% 일치`,
        `In-memory out-of-order & duplicate example merge complete: ${res.totalDuplicatesIgnored} duplicates ignored · ${res.totalOutOfOrderAccepted} out-of-order accepted · 100% FNV-1a hash match`,
      ),
    );
    emitChange(scenarioId, res.peers, activePeerId, res.coalesceReport);
  };

  const handleRunProof = (): void => {
    const allOps = collectUniqueClusterOps(peers);
    const nextProof = verifyCrdtConvergenceLaws(allOps);
    setProof(nextProof);
    setStatusNotice(
      pick(
        `현재 예제 집합의 해시 비교 완료(${nextProof.verifiedOpCount} op): 교환·결합·멱등·역순중복 4/4 통과 · 정규 해시 ${nextProof.canonicalHash}`,
        `Sample convergence checks complete (${nextProof.verifiedOpCount} ops): Commutative/Associative/Idempotent/Out-of-Order 4/4 PASS · ${nextProof.canonicalHash}`,
      ),
    );
  };

  const handleExportJson = async (): Promise<void> => {
    if (exportPending) return;
    setExportPending(true);
    setShowPreview(true);
    const notices: string[] = [];
    try {
      if (onExportJson) {
        try { await onExportJson(snapshotJson, snapshot); notices.push(pick("수신자 전달 완료", "Receiver accepted snapshot")); }
        catch { notices.push(pick("전달 실패. 다시 눌러 재시도하세요", "Delivery failed. Retry export")); }
      }
      try {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
        await navigator.clipboard.writeText(snapshotJson);
        notices.push(pick("복사 완료", "Copied"));
      } catch { notices.push(pick("복사 실패. 미리보기에서 직접 복사하거나 재시도하세요", "Copy failed. Use preview or retry")); }
      setStatusNotice(notices.join(" · "));
    } finally { setExportPending(false); }
  };

  if (!activePeer) return <section aria-labelledby={headingId} />;

  return (
    <section aria-labelledby={headingId} data-testid="studio-distributed-crdt-sync-panel" className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}>
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Network className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("HLC CRDT 타일 메타데이터 병합 예제 · GPU 비용 추정", "HLC CRDT Tile Metadata Model & GPU Cost Estimate")}
            </h2>
            <span data-testid="convergence-status-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${allPeersConverged ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
              {allPeersConverged ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
              {allPeersConverged ? pick(`${peers.length}/${peers.length} 피어 FNV-1a 100% 일치`, `${peers.length}/${peers.length} Peers FNV-1a 100% Match`) : pick("오프라인 분기 중 · 병합 대기", "Partitioned · Awaiting Merge")}
            </span>
          </div>
          <p data-testid="crdt-runtime-boundary" className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("메모리의 레이어별 최신 메타데이터만 병합하는 예제입니다. 실제 전송·OPFS 저장·GPU 실행 없음. 원고 픽셀과 필기 궤적은 다루지 않으며 지연은 측정하지 않습니다.", "In-memory latest-metadata-per-layer model. No network, OPFS persistence, GPU execution, manuscript pixels or stroke geometry. Latency is unmeasured.")}
          </p>
        </div>
        <button type="button" data-testid="reset-crdt-panel-btn" onClick={() => runAction(() => handleSelectScenario(scenarioId))} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("시나리오 초기화", "Reset")}</span>
        </button>
      </div>

      {/* 네트워크 시나리오 4종 선택 */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-fg-3">{pick("네트워크 가상 시나리오 & 경로 가정", "Modeled Network Scenario & Transport")}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CRDT_NETWORK_SCENARIOS.map((sc) => {
            const active = sc.id === scenarioId;
            return (
              <button key={sc.id} type="button" data-testid={`scenario-btn-${sc.id}`} aria-pressed={active} onClick={() => runAction(() => handleSelectScenario(sc.id))} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{isEn ? sc.labelEn : sc.labelKo}</span>
              </button>
            );
          })}
        </div>
        <p data-testid="scenario-summary-text" className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? scenarioSpec.summaryEn : scenarioSpec.summaryKo}</p>
      </div>

      {/* 4피어 역할 선택 & 활성 타일 선택 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-1.5 lg:col-span-2">
          <div className="text-[11px] font-semibold text-fg-3">{pick("로컬 예제 피어 선택 (지연 미측정)", "Active Example Peer (Latency Unmeasured)")}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {peers.map((peer) => {
              const selected = peer.peerId === activePeer.peerId;
              const role = getPeerRoleSpec(peer.peerId);
              return (
                <button key={peer.peerId} type="button" data-testid={`peer-select-${peer.peerId}`} aria-pressed={selected} onClick={() => setActivePeerId(peer.peerId)} className={selected ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span>{isEn ? role.roleLabelEn : role.roleLabelKo}</span>
                  <span className="font-mono text-[10px] opacity-80 tabular-nums">{peer.isOffline ? "OPFS" : `op:${peer.opLog.length}`}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-fg-3">{pick("로컬 필기 대상 256×256 타일", "Target 256×256 Tile")}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {FOCUS_TILES.map((t) => {
              const active = selectedTile.x === t.x && selectedTile.y === t.y;
              return (
                <button key={t.label} type="button" data-testid={`tile-select-${t.x}-${t.y}`} aria-pressed={active} onClick={() => setSelectedTile({ x: t.x, y: t.y })} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span className="font-mono tabular-nums">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 핵심 실행 액션 버튼 */}
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="draw-local-stroke-btn" onClick={() => runAction(handleLocalStroke)} className={BTN_SOLID}>
          <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("로컬 스트로크 메타데이터 추가", "Add Local Stroke Metadata")}</span>
        </button>
        <button type="button" data-testid="burst-40-ops-btn" onClick={() => runAction(handleBurst40)} className={BTN_OUTLINE}>
          <Zap className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("4피어 동시 스트로크 폭주 (40 op)", "Run 40-Op Concurrent Burst")}</span>
        </button>
        <button type="button" data-testid="reconcile-merge-btn" onClick={() => runAction(handleReconcileMerge)} className={BTN_GOOD}>
          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("원격 역순·중복 병합", "Merge Reversed & Duplicate Ops")}</span>
        </button>
        <button type="button" data-testid="verify-convergence-btn" onClick={() => runAction(handleRunProof)} className={BTN_OUTLINE}>
          <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
          <span>{pick("교환·결합·멱등 예제 검사", "Check Sample CRDT Laws")}</span>
        </button>
      </div>

      {/* 핵심 KPI 카드 4종 */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3"><Layers className="h-3.5 w-3.5" aria-hidden="true" />{pick("GPU 타일 패스 절감 추정", "Estimated GPU Pass Savings")}</div>
          <div data-testid="kpi-coalesce-pct" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">{lastCoalesce.coalescingReductionPct.toFixed(1)}%</div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">{pick(`${lastCoalesce.naiveDrawCalls} op → ${lastCoalesce.coalescedDrawCalls} 추정 패스 · 지연 미측정`, `${lastCoalesce.naiveDrawCalls} ops → ${lastCoalesce.coalescedDrawCalls} modeled passes · latency unmeasured`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3"><Activity className="h-3.5 w-3.5" aria-hidden="true" />{pick("시간창 충돌 후보 (250ms)", "Time-Window Conflict Candidates")}</div>
          <div data-testid="kpi-conflicts-count" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">{totalConflictsResolved}</div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">{pick(`역순 ${totalOutOfOrderAccepted}건 · 중복 무시 ${totalDuplicatesIgnored}건`, `Out-of-order ${totalOutOfOrderAccepted} · Dup ignored ${totalDuplicatesIgnored}`)}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3"><WifiOff className="h-3.5 w-3.5" aria-hidden="true" />{pick("메모리 대기열 (OPFS 미연결)", "Memory Queue (OPFS Unconnected)")}</div>
          <div data-testid="kpi-offline-queue" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">{totalOfflineQueueDepth}</div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">{pick(`추정 델타 ${snapshot.bandwidthBudget.compressedDeltaBytes} B (${snapshot.bandwidthBudget.jsonSavingsPct}% 절감)`, `Modeled ${snapshot.bandwidthBudget.compressedDeltaBytes} B (${snapshot.bandwidthBudget.jsonSavingsPct}% saved)`)}</div>
        </div>
        <div className={`rounded-xl border p-3 ${proof?.allLawsVerified ? "border-good bg-good-soft text-good" : "border-line bg-card text-fg"}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{pick("CRDT 예제 집합 검사", "CRDT Sample Checks")}</div>
          <div data-testid="kpi-proof-badge" className="mt-1 font-mono text-xs font-bold tabular-nums">
            {proof ? (proof.allLawsVerified ? pick("4/4 예제 검사 통과", "4/4 Sample Checks Passed") : pick("검증 실패", "Failed")) : pick("예제 검사 대기", "Ready to Check")}
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] opacity-85">{proof ? proof.canonicalHash : canonicalHash}</div>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 히트맵 & HLC 시계·작업 수 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <TileHeatmapAndHlcSvg peers={peers} activePeer={activePeer} selectedTileKey={selectedTileKey} coalesceReport={lastCoalesce} allConverged={allPeersConverged} isEn={isEn} />
        <div className="grid grid-cols-1 gap-1.5 text-[11px] text-fg-2 sm:grid-cols-2 [word-break:keep-all]">
          <div className="rounded-lg bg-raised px-2.5 py-1.5">{isEn ? snapshot.runtimeBoundary.currentEn : snapshot.runtimeBoundary.currentKo}</div>
          <div className="rounded-lg bg-raised px-2.5 py-1.5">{isEn ? snapshot.runtimeBoundary.targetEn : snapshot.runtimeBoundary.targetKo}</div>
        </div>
      </div>

      {/* 피어별 FNV-1a 최종 상태 해시 & 전송 경로 표 */}
      <div className="overflow-x-auto rounded-xl border border-line bg-card p-3.5">
        <table data-testid="peer-hash-table" className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-line text-[11px] text-fg-3">
              <th scope="col" className="px-2 py-1.5 font-semibold">{pick("피어 역할", "Peer Role")}</th>
              <th scope="col" className="px-2 py-1.5 font-semibold">{pick("전송 경로", "Transport Path")}</th>
              <th scope="col" className="px-2 py-1.5 font-semibold">{pick("HLC 시계", "HLC Clock")}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">{pick("오프라인 큐", "OPFS Queue")}</th>
              <th scope="col" className="px-2 py-1.5 font-semibold">{pick("FNV-1a 최종 해시", "FNV-1a State Hash")}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">{pick("수렴 판정", "Status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {peers.map((peer) => {
              const matched = peer.stateHash === canonicalHash;
              return (
                <tr key={peer.peerId} data-testid={`peer-hash-row-${peer.peerId}`}>
                  <td className="px-2 py-2 font-semibold text-fg [word-break:keep-all]">{isEn ? peer.roleLabelEn : peer.roleLabelKo}</td>
                  <td className="px-2 py-2">
                    <span data-testid={`peer-transport-${peer.peerId}`} className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${transportBadgeClass(peer.transportChannel)}`}>
                      {transportLabel(peer.transportChannel)}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-[10px] text-fg-3 tabular-nums">{formatHlc(peer.clock)}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{peer.offlineOutbox.length}</td>
                  <td data-testid={`peer-hash-${peer.peerId}`} className="px-2 py-2 font-mono text-[11px] text-fg-2 tabular-nums">{peer.stateHash}</td>
                  <td className="px-2 py-2 text-right font-mono text-[10px] font-bold">
                    {matched ? <span className="text-good">{pick("100% 일치", "MATCH")}</span> : <span className="text-warn">{pick("분기", "DIVERGED")}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* JSON 스냅샷 내보내기 & 미리보기 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <ClipboardCopy className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("CRDT 동기화 · 대역폭 스냅샷 내보내기 (JSON)", "Export CRDT Sync & Bandwidth Snapshot (JSON)")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="export-crdt-json-btn" onClick={() => { void handleExportJson(); }} disabled={exportPending} className={BTN_SOLID}>
              <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 복사 · 내보내기", "Copy & Export JSON")}</span>
            </button>
            <button type="button" data-testid="toggle-crdt-preview-btn" onClick={() => setShowPreview((v) => !v)} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showPreview ? pick("미리보기 닫기", "Hide Preview") : pick("JSON 미리보기", "Preview JSON")}</span>
            </button>
          </div>
        </div>
        {showPreview && (
          <pre data-testid="crdt-json-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {snapshotJson}
          </pre>
        )}
      </div>

      {statusNotice && (
        <div role="status" aria-live="polite" data-testid="crdt-panel-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {statusNotice}
        </div>
      )}
    </section>
  );
}
