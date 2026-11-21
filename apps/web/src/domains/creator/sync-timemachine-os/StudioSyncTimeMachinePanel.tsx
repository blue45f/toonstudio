import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  History,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wifi,
} from "lucide-react";

import {
  DELTA_CHUNK_SIZE_BYTES,
  GLOBAL_REGION_PROFILES,
  JOURNAL_INTERVAL_SECONDS,
  chunkLargeAssetDeterministically,
  compareVectorClocks,
  computeDeltaTransferPlan,
  computeExponentialBackoffMs,
  createSyncTimeMachineWorkspaceSeed,
  createTimeMachineSnapshot,
  diffTimeMachineSnapshots,
  enqueueOfflineDeltaOp,
  flushOfflineQueueOnReconnect,
  formatByteSizeLabel,
  handleCrashZeroEmergencySignal,
  hashChunkDeterministic,
  mergeLayersThreeWay,
  rollbackToTimeMachineSnapshot,
  type GlobalRegionProfile,
  type OfflineQueueEntry,
  type SyncLayerSlice,
  type ThreeWayConflictBranch,
  type TimeMachineTimelineState,
  type VectorClock,
} from "./delta-sync-offline-engine";
import {
  applyStyleLockAutoCorrection,
  computeOklchDeltaE,
  createInitialCutStyleSamples,
  createInitialStyleLockBibleEntries,
  evaluateStyleLockConsistency,
  evaluateZeroLeakSliceAccess,
  issueZeroLeakAccessToken,
  revokeZeroLeakAccessToken,
  type ExternalCollabRole,
  type ForensicAuditLogEntry,
  type SubmittedCutStyleSample,
  type ZeroLeakAccessToken,
  type ZeroLeakEvaluationResult,
} from "./style-lock-bible-security-engine";
import {
  StyleLockSecurityTabSection,
  TimeMachineSnapshotTabSection,
} from "./SyncTimeMachineTabSections";

import "./sync-timemachine-os.css";

export interface StudioSyncTimeMachinePanelProps {
  readonly projectId: string;
}

type SyncPanelTabId = "delta" | "timemachine" | "style-security";

function nextDeterministicTimestamp(step: number): string {
  return new Date(Date.parse("2026-11-21T10:00:00Z") + step * 60_000).toISOString();
}

export function StudioSyncTimeMachinePanel({ projectId }: StudioSyncTimeMachinePanelProps) {
  const seed = useMemo(() => createSyncTimeMachineWorkspaceSeed(projectId), [projectId]);

  const [activeTab, setActiveTab] = useState<SyncPanelTabId>("delta");
  const [stepCounter, setStepCounter] = useState<number>(1);
  const [noticeKo, setNoticeKo] = useState<string>(
    "256KB 청크 차분 동기화와 60초 자동 저널 타임머신이 준비되었습니다.",
  );

  // 1) 차분 동기화 & 오프라인 큐 상태
  const [selectedAssetId, setSelectedAssetId] = useState<string>(seed.assets[0].assetId);
  const [selectedRegionId, setSelectedRegionId] = useState<GlobalRegionProfile["id"]>("sea-singapore");
  const [dirtyChunksByAsset, setDirtyChunksByAsset] = useState<Readonly<Record<string, readonly number[]>>>(() => ({
    [seed.assets[0].assetId]: seed.assets[0].initialDirtyChunks,
    [seed.assets[1].assetId]: seed.assets[1].initialDirtyChunks,
  }));
  const [offlineQueue, setOfflineQueue] = useState<readonly OfflineQueueEntry[]>([]);
  const [baseLayers, setBaseLayers] = useState<readonly SyncLayerSlice[]>(seed.baseLayers);
  const [remoteLayers, setRemoteLayers] = useState<readonly SyncLayerSlice[]>(seed.remoteLayers);
  const [baseClock, setBaseClock] = useState<VectorClock>(seed.baseClock);
  const [remoteClock, setRemoteClock] = useState<VectorClock>(seed.remoteClock);
  const [conflictBranches, setConflictBranches] = useState<readonly ThreeWayConflictBranch[]>([]);

  // 2) 타임머신 스냅샷 & 크래시 복구 상태
  const [timeline, setTimeline] = useState<TimeMachineTimelineState>(seed.timeline);
  const [releaseTagInput, setReleaseTagInput] = useState<string>("ep12-color-final");
  const [compareSnapshotId, setCompareSnapshotId] = useState<string>(seed.timeline.snapshots[0].snapshotId);

  // 3) 아트 바이블 화풍 락 & Zero-Leak 권한 상태
  const bibleEntries = useMemo(() => createInitialStyleLockBibleEntries(), []);
  const [cutSamples, setCutSamples] = useState<readonly SubmittedCutStyleSample[]>(() =>
    createInitialCutStyleSamples(),
  );
  const [selectedSampleCutId, setSelectedSampleCutId] = useState<string>("ep12-cut-07");

  const [tokenRole, setTokenRole] = useState<ExternalCollabRole>("translator");
  const [recipientNameKo, setRecipientNameKo] = useState<string>("김번역(북미팀)");
  const [cutStartInput, setCutStartInput] = useState<number>(1);
  const [cutEndInput, setCutEndInput] = useState<number>(12);
  const [ttlHoursInput, setTtlHoursInput] = useState<number>(24);
  const [issuedTokens, setIssuedTokens] = useState<readonly ZeroLeakAccessToken[]>(() => [
    issueZeroLeakAccessToken({
      projectId,
      recipientNameKo: "외주 채색팀 B",
      role: "outsource-color",
      allowedCutStart: 5,
      allowedCutEnd: 14,
      ttlHours: 48,
      nowIso: "2026-11-21T09:00:00Z",
    }),
  ]);
  const [selectedTokenId, setSelectedTokenId] = useState<string>("");
  const [probeCutNumber, setProbeCutNumber] = useState<number>(8);
  const [probeResolutionPx, setProbeResolutionPx] = useState<number>(1600);
  const [probeRawExport, setProbeRawExport] = useState<boolean>(false);
  const [lastAccessResult, setLastAccessResult] = useState<ZeroLeakEvaluationResult | null>(null);
  const [auditLogs, setAuditLogs] = useState<readonly ForensicAuditLogEntry[]>([]);

  const selectedAssetPreset =
    seed.assets.find((item) => item.assetId === selectedAssetId) ?? seed.assets[0];
  const selectedRegion =
    GLOBAL_REGION_PROFILES.find((item) => item.id === selectedRegionId) ?? GLOBAL_REGION_PROFILES[1];

  const deltaPlan = useMemo(() => {
    const dirtyIndices = dirtyChunksByAsset[selectedAssetPreset.assetId] ?? [];
    const baseAsset = chunkLargeAssetDeterministically({
      assetId: selectedAssetPreset.assetId,
      labelKo: selectedAssetPreset.labelKo,
      kind: selectedAssetPreset.kind,
      totalBytes: selectedAssetPreset.totalBytes,
      baseSeed: selectedAssetPreset.baseSeed,
    });
    const nextAsset = chunkLargeAssetDeterministically({
      assetId: selectedAssetPreset.assetId,
      labelKo: selectedAssetPreset.labelKo,
      kind: selectedAssetPreset.kind,
      totalBytes: selectedAssetPreset.totalBytes,
      baseSeed: selectedAssetPreset.baseSeed,
      dirtyChunkIndices: dirtyIndices,
      dirtyRevisionTag: `rev-${dirtyIndices.length}`,
    });
    return computeDeltaTransferPlan(baseAsset, nextAsset, selectedRegion);
  }, [dirtyChunksByAsset, selectedAssetPreset, selectedRegion]);

  const pendingQueueCount = offlineQueue.filter(
    (entry) => entry.status === "queued" || entry.status === "retrying",
  ).length;

  const localPreviewClock: VectorClock = useMemo(
    () => Object.freeze({ ...baseClock, "author-lead": (baseClock["author-lead"] ?? 0) + pendingQueueCount }),
    [baseClock, pendingQueueCount],
  );
  const clockRelation = useMemo(
    () => compareVectorClocks(localPreviewClock, remoteClock),
    [localPreviewClock, remoteClock],
  );
  const threeWayForecast = useMemo(
    () =>
      mergeLayersThreeWay({
        baseLayers,
        localLayers: timeline.currentLayers,
        remoteLayers,
        baseClock,
        localClock: localPreviewClock,
        remoteClock,
        nowIso: nextDeterministicTimestamp(stepCounter),
      }),
    [baseClock, baseLayers, localPreviewClock, remoteClock, remoteLayers, stepCounter, timeline.currentLayers],
  );

  const activeSnapshot =
    timeline.snapshots.find((snap) => snap.snapshotId === timeline.activeSnapshotId) ??
    timeline.snapshots[timeline.snapshots.length - 1];
  const compareSnapshot =
    timeline.snapshots.find((snap) => snap.snapshotId === compareSnapshotId) ?? timeline.snapshots[0];
  const snapshotDiff = useMemo(
    () => diffTimeMachineSnapshots(compareSnapshot, activeSnapshot),
    [activeSnapshot, compareSnapshot],
  );

  const activeCutSample =
    cutSamples.find((sample) => sample.cutId === selectedSampleCutId) ?? cutSamples[0];
  const activeBibleEntry =
    bibleEntries.find((entry) => entry.characterId === activeCutSample.characterId) ?? bibleEntries[0];
  const styleReport = useMemo(
    () => evaluateStyleLockConsistency(activeBibleEntry, activeCutSample),
    [activeBibleEntry, activeCutSample],
  );
  const primaryPaletteDeltaE = useMemo(
    () => computeOklchDeltaE(activeBibleEntry.palette.skin, activeCutSample.sampledPalette.skin),
    [activeBibleEntry, activeCutSample],
  );
  const activeToken =
    issuedTokens.find((token) => token.tokenId === selectedTokenId) ?? issuedTokens[0] ?? null;

  function advanceTimestamp(): string {
    const iso = nextDeterministicTimestamp(stepCounter);
    setStepCounter((prev) => prev + 1);
    return iso;
  }

  function handleSimulateChunkEdit(): void {
    const current = dirtyChunksByAsset[selectedAssetPreset.assetId] ?? [];
    const maxChunkIdx = Math.max(1, Math.floor(selectedAssetPreset.totalBytes / DELTA_CHUNK_SIZE_BYTES) - 1);
    const additions = Array.from({ length: 6 }, (_, offset) =>
      Math.min(maxChunkIdx, (current.length * 17 + offset + 3) % maxChunkIdx),
    );
    const nextDirty = [...new Set([...current, ...additions])].sort((a, b) => a - b);
    setDirtyChunksByAsset((prev) => ({ ...prev, [selectedAssetPreset.assetId]: nextDirty }));
    setNoticeKo(`${selectedAssetPreset.labelKo} 변경 청크 ${nextDirty.length}개 반영 — 차분 청크만 계산했습니다.`);
  }

  function handleEnqueueOfflineChange(conflictTarget: boolean): void {
    const nowIso = advanceTimestamp();
    const seq = offlineQueue.length + 1;
    const targetCutId = conflictTarget ? "cut-02" : `cut-${String(10 + seq).padStart(2, "0")}`;
    const targetLayerId = conflictTarget ? "color-flat" : "shade-overlay";
    const targetLayerName = conflictTarget ? "기본 채색 밑색" : `오프라인 음영 보정 #${seq}`;
    const nextLeadTick = (baseClock["author-lead"] ?? 0) + seq;
    const contentSeed = hashChunkDeterministic(`${projectId}:${targetCutId}:${seq}`, seq, "offline");

    setOfflineQueue(
      enqueueOfflineDeltaOp(
        offlineQueue,
        {
          opId: `op-${seq}-${targetCutId}`,
          assetId: selectedAssetPreset.assetId,
          cutId: targetCutId,
          layerId: targetLayerId,
          layerName: targetLayerName,
          authorId: "author-lead",
          clientClock: { ...baseClock, "author-lead": nextLeadTick },
          payloadBytes: DELTA_CHUNK_SIZE_BYTES * 6,
          contentSeed,
          queuedAtIso: nowIso,
        },
        selectedRegion.rttMs,
      ),
    );
    setNoticeKo(
      conflictTarget
        ? `${targetCutId} 동시 수정 작업을 오프라인 큐에 적재했습니다. 재연결 시 안전 브랜치 분기를 검증합니다.`
        : `${targetCutId} 신규 레이어 변경을 오프라인 큐에 적재했습니다(초기 백오프 ${computeExponentialBackoffMs(1, selectedRegion.rttMs)}ms).`,
    );
  }

  function handleReconnectFlush(networkHealthy: boolean): void {
    const nowIso = advanceTimestamp();
    const outcome = flushOfflineQueueOnReconnect({
      queue: offlineQueue,
      baseLayers,
      remoteLayers,
      baseClock,
      remoteClock,
      region: selectedRegion,
      networkHealthy,
      nowIso,
    });
    setOfflineQueue(outcome.nextQueue);
    if (networkHealthy) {
      setBaseLayers(outcome.mergedLayers);
      setRemoteLayers(outcome.mergedLayers);
      setBaseClock(outcome.mergedClock);
      setRemoteClock(outcome.mergedClock);
      if (outcome.conflictBranches.length > 0) {
        setConflictBranches((prev) => [...outcome.conflictBranches, ...prev]);
      }
      setNoticeKo(
        `재연결 동기화 완료: 무손실 병합 ${outcome.syncedCount}건 · 충돌 안전 브랜치 ${outcome.conflictBranches.length}건 생성`,
      );
    } else {
      const maxBackoff = outcome.nextQueue.reduce((acc, entry) => Math.max(acc, entry.nextRetryDelayMs), 0);
      setNoticeKo(
        `해외 회선 불안정 감지: ${outcome.retriedCount}건 손실 없이 유지 · 지수 백오프 ${maxBackoff}ms 후 재시도 예약`,
      );
    }
  }

  function handleSaveManualSnapshot(): void {
    const nowIso = advanceTimestamp();
    const tag = releaseTagInput.trim() || `ep12-tag-${timeline.snapshots.length + 1}`;
    const nextLayers: readonly SyncLayerSlice[] = timeline.currentLayers.map((layer, index) =>
      index === 0
        ? Object.freeze({
            ...layer,
            revision: layer.revision + 1,
            byteLength: layer.byteLength + 524_288,
            contentSeed: `${layer.contentSeed}-${timeline.snapshots.length + 1}`,
            updatedAtIso: nowIso,
          })
        : layer,
    );
    const created = createTimeMachineSnapshot({
      snapshots: timeline.snapshots,
      layers: nextLayers,
      trigger: "manual-release-tag",
      releaseTag: tag,
      noteKo: `수동 릴리즈 태그(${tag}) 확정 저장`,
      nowIso,
    });
    setTimeline((prev) =>
      Object.freeze({
        ...prev,
        activeSnapshotId: created.snapshotId,
        currentLayers: created.layers,
        snapshots: Object.freeze([...prev.snapshots, created]),
      }),
    );
    setNoticeKo(`릴리즈 스냅샷(${tag})을 타임머신에 기록했습니다.`);
  }

  function handleAutoJournalCheckpoint(): void {
    const nowIso = advanceTimestamp();
    const created = createTimeMachineSnapshot({
      snapshots: timeline.snapshots,
      layers: timeline.currentLayers,
      trigger: "auto-60s-journal",
      releaseTag: null,
      noteKo: `${JOURNAL_INTERVAL_SECONDS}초 주기 자동 저널 체크포인트`,
      nowIso,
    });
    setTimeline((prev) =>
      Object.freeze({
        ...prev,
        activeSnapshotId: created.snapshotId,
        snapshots: Object.freeze([...prev.snapshots, created]),
      }),
    );
    setNoticeKo(`60초 자동 저널 체크포인트(${created.snapshotId})를 기록했습니다.`);
  }

  function handleRollbackSnapshot(targetSnapshotId: string): void {
    const result = rollbackToTimeMachineSnapshot(timeline, targetSnapshotId, advanceTimestamp());
    setTimeline(result.nextTimeline);
    setNoticeKo(
      `${result.restoredSnapshot.releaseTag ?? result.restoredSnapshot.snapshotId} 시점으로 복원했습니다. 직전 상태는 안전 백업(${result.safetySnapshot.snapshotId})으로 보존되었습니다.`,
    );
  }

  function handleEmergencyCrashSignal(kind: "memory-pressure" | "webgpu-context-lost"): void {
    const result = handleCrashZeroEmergencySignal(timeline, {
      kind,
      heapUsagePct: kind === "memory-pressure" ? 94 : undefined,
      gpuDeviceLabel: kind === "webgpu-context-lost" ? "Apple-M-WebGPU" : undefined,
      detectedAtIso: advanceTimestamp(),
    });
    setTimeline(result.nextTimeline);
    setNoticeKo(result.recoveryMessageKo);
  }

  function handleApplyStyleCorrection(): void {
    const corrected = applyStyleLockAutoCorrection(activeCutSample, activeBibleEntry);
    setCutSamples((prev) => Object.freeze(prev.map((item) => (item.cutId === corrected.cutId ? corrected : item))));
    setNoticeKo(
      `${activeCutSample.cutId}에 ${activeBibleEntry.characterNameKo} 아트 바이블 1클릭 자동 보정(선폭 ${activeBibleEntry.standardLineWidthPx}px)을 적용했습니다.`,
    );
  }

  function handleIssueZeroLeakToken(): void {
    const issued = issueZeroLeakAccessToken({
      projectId,
      recipientNameKo,
      role: tokenRole,
      allowedCutStart: cutStartInput,
      allowedCutEnd: cutEndInput,
      ttlHours: ttlHoursInput,
      nowIso: advanceTimestamp(),
    });
    setIssuedTokens((prev) => Object.freeze([issued, ...prev]));
    setSelectedTokenId(issued.tokenId);
    setNoticeKo(
      `${issued.recipientNameKo} 대상 Zero-Leak 토큰(${issued.allowedCutStart}~${issued.allowedCutEnd}컷 · ${issued.watermarkId})을 발급했습니다.`,
    );
  }

  function handleRevokeToken(tokenId: string): void {
    setIssuedTokens((prev) =>
      Object.freeze(prev.map((token) => (token.tokenId === tokenId ? revokeZeroLeakAccessToken(token) : token))),
    );
    setNoticeKo(`토큰(${tokenId}) 권한을 즉시 회수했습니다.`);
  }

  function handleRunAccessCheck(): void {
    if (!activeToken) return;
    const { result, auditEntry } = evaluateZeroLeakSliceAccess(activeToken, {
      requestedCutNumber: probeCutNumber,
      requestedResolutionPx: probeResolutionPx,
      requestsRawLayerExport: probeRawExport,
      evaluatedAtIso: advanceTimestamp(),
    });
    setLastAccessResult(result);
    setAuditLogs((prev) => Object.freeze([auditEntry, ...prev].slice(0, 12)));
    setNoticeKo(result.reasonKo);
  }

  return (
    <section
      className="ts-sync-tm"
      aria-label="글로벌 차분 동기화·타임머신·아트 바이블 화풍 락 작업대"
      data-testid="studio-sync-timemachine-panel"
    >
      <header className="ts-sync-tm__header">
        <div className="ts-sync-tm__title-group">
          <h3 className="ts-sync-tm__title">글로벌 차분 동기화 · 크래시 제로 타임머신 · 아트 바이블 화풍 락</h3>
          <p className="ts-sync-tm__subtitle">
            프로젝트 {projectId} · {DELTA_CHUNK_SIZE_BYTES / 1024}KB 청크 해시 차분 전송 ·{" "}
            {JOURNAL_INTERVAL_SECONDS}초 자동 저널 · 포렌식 워터마크 권한 통제
          </p>
        </div>
        <span className="ts-sync-tm__badge ts-sync-tm__badge--ok">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          크래시 복구 보호 활성 ({timeline.emergencyRecoveryCount}회 비상 기록)
        </span>
      </header>

      <div className="ts-sync-tm__tablist" role="tablist" aria-label="동기화·타임머신·보안 기능 전환">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "delta"}
          className="ts-sync-tm__tab"
          data-testid="sync-tm-tab-delta"
          onClick={() => setActiveTab("delta")}
        >
          <Wifi className="size-4 shrink-0" aria-hidden="true" />
          차분 동기화 · 오프라인 큐 ({pendingQueueCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "timemachine"}
          className="ts-sync-tm__tab"
          data-testid="sync-tm-tab-timemachine"
          onClick={() => setActiveTab("timemachine")}
        >
          <History className="size-4 shrink-0" aria-hidden="true" />
          타임머신 스냅샷 ({timeline.snapshots.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "style-security"}
          className="ts-sync-tm__tab"
          data-testid="sync-tm-tab-style-security"
          onClick={() => setActiveTab("style-security")}
        >
          <Palette className="size-4 shrink-0" aria-hidden="true" />
          아트 바이블 락 · Zero-Leak 권한
        </button>
      </div>

      <p className="ts-sync-tm__notice" role="status" aria-live="polite" data-testid="sync-tm-status-notice">
        {noticeKo}
      </p>

      {activeTab === "delta" ? (
        <div role="tabpanel" aria-label="차분 동기화 및 오프라인 큐" data-testid="sync-tm-panel-delta" className="ts-sync-tm">
          <div className="ts-sync-tm__controls-row">
            <label className="ts-sync-tm__field" htmlFor="stm-asset-select">
              <span className="ts-sync-tm__field-label">대용량 원고·3D 에셋</span>
              <select
                id="stm-asset-select"
                className="ts-sync-tm__select"
                value={selectedAssetPreset.assetId}
                onChange={(event) => setSelectedAssetId(event.target.value)}
              >
                {seed.assets.map((asset) => (
                  <option key={asset.assetId} value={asset.assetId}>
                    {asset.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="ts-sync-tm__field" htmlFor="stm-region-select">
              <span className="ts-sync-tm__field-label">글로벌 회선 환경</span>
              <select
                id="stm-region-select"
                className="ts-sync-tm__select"
                value={selectedRegion.id}
                onChange={(event) => setSelectedRegionId(event.target.value as GlobalRegionProfile["id"])}
              >
                {GLOBAL_REGION_PROFILES.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.labelKo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ts-sync-tm__grid-metrics">
            <div className="ts-sync-tm__metric">
              <span className="ts-sync-tm__metric-label">대역폭 절감률</span>
              <span className="ts-sync-tm__metric-value" data-testid="sync-tm-saving-pct">
                {deltaPlan.bandwidthSavingPct.toFixed(1)}%
              </span>
            </div>
            <div className="ts-sync-tm__metric">
              <span className="ts-sync-tm__metric-label">변경 청크 / 전체 (256KB)</span>
              <span className="ts-sync-tm__metric-value" data-testid="sync-tm-dirty-chunks">
                {deltaPlan.dirtyChunks.length} / {deltaPlan.totalChunks}
              </span>
            </div>
            <div className="ts-sync-tm__metric">
              <span className="ts-sync-tm__metric-label">실제 전송량 (절감 {formatByteSizeLabel(deltaPlan.savedBytes)})</span>
              <span className="ts-sync-tm__metric-value">{formatByteSizeLabel(deltaPlan.transferBytes)}</span>
            </div>
            <div className="ts-sync-tm__metric">
              <span className="ts-sync-tm__metric-label">예상 동기화 시간 (RTT {selectedRegion.rttMs}ms)</span>
              <span className="ts-sync-tm__metric-value">{deltaPlan.estimatedMsAtRtt} ms</span>
            </div>
          </div>

          <div className="ts-sync-tm__card">
            <div className="ts-sync-tm__controls-row">
              <button type="button" className="ts-sync-tm__btn" data-testid="sync-tm-btn-edit-chunks" onClick={handleSimulateChunkEdit}>
                <Sparkles className="size-4" aria-hidden="true" />
                컷 수정 시뮬레이션 (+6 청크)
              </button>
              <button type="button" className="ts-sync-tm__btn" data-testid="sync-tm-btn-enqueue-clean" onClick={() => handleEnqueueOfflineChange(false)}>
                <CloudOff className="size-4" aria-hidden="true" />
                오프라인 큐 적재 (신규 컷)
              </button>
              <button type="button" className="ts-sync-tm__btn" data-testid="sync-tm-btn-enqueue-conflict" onClick={() => handleEnqueueOfflineChange(true)}>
                <AlertTriangle className="size-4" aria-hidden="true" />
                동시 수정 충돌 큐 적재
              </button>
              <button type="button" className="ts-sync-tm__btn" data-testid="sync-tm-btn-retry-backoff" onClick={() => handleReconnectFlush(false)} disabled={pendingQueueCount === 0}>
                <RefreshCw className="size-4" aria-hidden="true" />
                회선 끊김 백오프 테스트
              </button>
              <button type="button" className="ts-sync-tm__btn ts-sync-tm__btn--primary" data-testid="sync-tm-btn-flush-sync" onClick={() => handleReconnectFlush(true)} disabled={pendingQueueCount === 0}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                재연결 3-Way 무손실 동기화
              </button>
            </div>
            <p className="ts-sync-tm__meta">
              벡터 클록 관계: {clockRelation} · 3-Way 사전 점검: {threeWayForecast.statusKo}
            </p>
          </div>

          <div className="ts-sync-tm__grid-two">
            <div className="ts-sync-tm__card">
              <h4 className="ts-sync-tm__section-title">오프라인 큐 ({offlineQueue.length}건)</h4>
              {offlineQueue.length === 0 ? (
                <p className="ts-sync-tm__meta">대기 중인 오프라인 변경이 없습니다. 위 버튼으로 큐 적재를 검증할 수 있습니다.</p>
              ) : (
                <ul className="ts-sync-tm__list" data-testid="sync-tm-offline-queue-list">
                  {offlineQueue.map((entry) => (
                    <li key={entry.opId} className="ts-sync-tm__list-item ts-sync-tm__list-item--row">
                      <div>
                        <strong>{entry.cutId} · {entry.layerName}</strong>
                        <div className="ts-sync-tm__meta">
                          {formatByteSizeLabel(entry.payloadBytes)} · 시도 {entry.attemptCount}회 · 다음 백오프 {entry.nextRetryDelayMs}ms
                        </div>
                      </div>
                      <span
                        className={`ts-sync-tm__badge ${
                          entry.status === "synced"
                            ? "ts-sync-tm__badge--ok"
                            : entry.status === "conflict-branched"
                              ? "ts-sync-tm__badge--warn"
                              : "ts-sync-tm__badge--info"
                        }`}
                      >
                        {entry.status === "synced"
                          ? "병합 완료"
                          : entry.status === "conflict-branched"
                            ? "안전 브랜치 보존"
                            : entry.status === "retrying"
                              ? "재시도 대기"
                              : "오프라인 대기"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="ts-sync-tm__card">
              <h4 className="ts-sync-tm__section-title">충돌 자동 안전 브랜치 로그 ({conflictBranches.length}건)</h4>
              {conflictBranches.length === 0 ? (
                <p className="ts-sync-tm__meta">동시 수정 충돌 시 원격 레이어를 덮어쓰지 않고 별도 안전 브랜치로 분리 보존합니다.</p>
              ) : (
                <ul className="ts-sync-tm__list" data-testid="sync-tm-conflict-branch-list">
                  {conflictBranches.map((branch) => (
                    <li key={branch.branchId} className="ts-sync-tm__list-item">
                      <strong>{branch.branchId}</strong>
                      <span className="ts-sync-tm__meta">{branch.summaryKo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "timemachine" ? (
        <TimeMachineSnapshotTabSection
          timeline={timeline}
          activeSnapshot={activeSnapshot}
          compareSnapshot={compareSnapshot}
          snapshotDiff={snapshotDiff}
          releaseTagInput={releaseTagInput}
          onReleaseTagChange={setReleaseTagInput}
          onSaveManualSnapshot={handleSaveManualSnapshot}
          onSaveJournalCheckpoint={handleAutoJournalCheckpoint}
          onTriggerEmergency={handleEmergencyCrashSignal}
          onSelectCompareSnapshot={setCompareSnapshotId}
          onRollbackSnapshot={handleRollbackSnapshot}
        />
      ) : null}

      {activeTab === "style-security" ? (
        <StyleLockSecurityTabSection
          cutSamples={cutSamples}
          activeCutSample={activeCutSample}
          styleReport={styleReport}
          primaryPaletteDeltaE={primaryPaletteDeltaE}
          onSelectCutSample={setSelectedSampleCutId}
          onApplyStyleCorrection={handleApplyStyleCorrection}
          tokenRole={tokenRole}
          onTokenRoleChange={setTokenRole}
          recipientNameKo={recipientNameKo}
          onRecipientNameChange={setRecipientNameKo}
          cutStartInput={cutStartInput}
          onCutStartChange={setCutStartInput}
          cutEndInput={cutEndInput}
          onCutEndChange={setCutEndInput}
          ttlHoursInput={ttlHoursInput}
          onTtlHoursChange={setTtlHoursInput}
          onIssueToken={handleIssueZeroLeakToken}
          activeToken={activeToken}
          probeCutNumber={probeCutNumber}
          onProbeCutChange={setProbeCutNumber}
          probeResolutionPx={probeResolutionPx}
          onProbeResolutionChange={setProbeResolutionPx}
          probeRawExport={probeRawExport}
          onProbeRawExportChange={setProbeRawExport}
          onRunAccessCheck={handleRunAccessCheck}
          onRevokeToken={handleRevokeToken}
          lastAccessResult={lastAccessResult}
          auditLogs={auditLogs}
        />
      ) : null}
    </section>
  );
}

export default StudioSyncTimeMachinePanel;
