// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionPlanningGuide } from "../production-hub/ProductionPlanningGuide";
import {
  DELTA_CHUNK_SIZE_BYTES,
  GLOBAL_REGION_PROFILES,
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
  type SyncLayerSlice,
} from "./delta-sync-offline-engine";
import { StudioSyncTimeMachinePanel } from "./StudioSyncTimeMachinePanel";
import {
  applyStyleLockAutoCorrection,
  computeOklchDeltaE,
  createInitialCutStyleSamples,
  createInitialStyleLockBibleEntries,
  evaluateStyleLockConsistency,
  evaluateZeroLeakSliceAccess,
  formatOklchCss,
  issueZeroLeakAccessToken,
  revokeZeroLeakAccessToken,
} from "./style-lock-bible-security-engine";

afterEach(cleanup);

describe("Content-Addressed 256KB Delta Sync 엔진", () => {
  it("200MB 원고를 정확히 256KB 결정론 청크 800개로 분할하고 동일 해시를 유지한다", () => {
    const bytes = 200 * 1_048_576;
    const first = chunkLargeAssetDeterministically({
      assetId: "ep12-psd",
      labelKo: "12화 원고",
      kind: "manuscript-psd",
      totalBytes: bytes,
      baseSeed: "ep12-seed",
    });
    const second = chunkLargeAssetDeterministically({
      assetId: "ep12-psd",
      labelKo: "12화 원고",
      kind: "manuscript-psd",
      totalBytes: bytes,
      baseSeed: "ep12-seed",
    });

    expect(first.chunks).toHaveLength(bytes / DELTA_CHUNK_SIZE_BYTES);
    expect(first.chunks[0].byteLength).toBe(DELTA_CHUNK_SIZE_BYTES);
    expect(first.chunks[123].hash).toBe(second.chunks[123].hash);
    expect(hashChunkDeterministic("ep12-seed", 0, "base")).toBe(first.chunks[0].hash);
  });

  it("500MB+ 잔여 바이트가 있는 3D 에셋의 마지막 청크 길이를 정확히 계산한다", () => {
    const totalBytes = 500 * 1_048_576 + 10_000;
    const manifest = chunkLargeAssetDeterministically({
      assetId: "bg3d-500m",
      labelKo: "대형 3D 성당",
      kind: "scene-3d-glb",
      totalBytes,
      baseSeed: "cathedral-v1",
    });

    expect(manifest.chunks).toHaveLength(2001);
    expect(manifest.chunks[2000].byteLength).toBe(10_000);
    expect(manifest.chunks[2000].offsetBytes).toBe(500 * 1_048_576);
  });

  it("180MB 원고에서 8개 청크만 수정 시 변경 청크만 전송하고 대역폭 절감률 98% 이상을 증명한다", () => {
    const totalBytes = 180 * 1_048_576;
    const base = chunkLargeAssetDeterministically({
      assetId: "ep12-psd",
      labelKo: "12화 원고",
      kind: "manuscript-psd",
      totalBytes,
      baseSeed: "ep12-v1",
    });
    const edited = chunkLargeAssetDeterministically({
      assetId: "ep12-psd",
      labelKo: "12화 원고",
      kind: "manuscript-psd",
      totalBytes,
      baseSeed: "ep12-v1",
      dirtyChunkIndices: [10, 11, 12, 40, 41, 200, 201, 500],
      dirtyRevisionTag: "edit-r2",
    });
    const seaRegion = GLOBAL_REGION_PROFILES[1];
    const plan = computeDeltaTransferPlan(base, edited, seaRegion);

    expect(plan.dirtyChunks).toHaveLength(8);
    expect(plan.transferBytes).toBe(8 * DELTA_CHUNK_SIZE_BYTES);
    expect(plan.savedBytes).toBe(totalBytes - 8 * DELTA_CHUNK_SIZE_BYTES);
    expect(plan.bandwidthSavingPct).toBeGreaterThanOrEqual(98.5);
  });

  it("변경 청크가 없는 에셋 재동기화 시 전송량 0바이트·대역폭 절감률 100%를 반환한다", () => {
    const base = chunkLargeAssetDeterministically({
      assetId: "ep12-same",
      labelKo: "무변경 원고",
      kind: "manuscript-psd",
      totalBytes: 100 * 1_048_576,
      baseSeed: "same-seed",
    });
    const plan = computeDeltaTransferPlan(base, base, GLOBAL_REGION_PROFILES[0]);

    expect(plan.dirtyChunks).toHaveLength(0);
    expect(plan.transferBytes).toBe(0);
    expect(plan.bandwidthSavingPct).toBe(100);
  });

  it("해외 고지연(285~430ms) 프로파일이 서울 허브(22ms)보다 높은 예상 동기화 시간을 산출한다", () => {
    const base = chunkLargeAssetDeterministically({
      assetId: "ep12-rtt",
      labelKo: "12화 원고",
      kind: "manuscript-psd",
      totalBytes: 120 * 1_048_576,
      baseSeed: "rtt-seed",
    });
    const next = chunkLargeAssetDeterministically({
      assetId: "ep12-rtt",
      labelKo: "12화 원고",
      kind: "manuscript-psd",
      totalBytes: 120 * 1_048_576,
      baseSeed: "rtt-seed",
      dirtyChunkIndices: [1, 2, 3, 4],
      dirtyRevisionTag: "rtt-r2",
    });

    const krPlan = computeDeltaTransferPlan(base, next, GLOBAL_REGION_PROFILES[0]);
    const remotePlan = computeDeltaTransferPlan(base, next, GLOBAL_REGION_PROFILES[4]);
    expect(remotePlan.estimatedMsAtRtt).toBeGreaterThan(krPlan.estimatedMsAtRtt);
  });

  it("바이트 크기 라벨을 MB·KB·음수 델타 단위로 일관되게 표시한다", () => {
    expect(formatByteSizeLabel(2 * 1_048_576)).toBe("2.0 MB");
    expect(formatByteSizeLabel(-512 * 1024)).toBe("-512.0 KB");
    expect(formatByteSizeLabel(512)).toBe("512 B");
  });
});

describe("오프라인 큐 · 지수 백오프 · 3-Way 벡터 클록 충돌 해소", () => {
  it("벡터 클록 인과 관계 4종(equal/before/after/concurrent)을 정확히 판정한다", () => {
    expect(compareVectorClocks({ a: 2, b: 1 }, { a: 2, b: 1 })).toBe("equal");
    expect(compareVectorClocks({ a: 1, b: 1 }, { a: 2, b: 1 })).toBe("before");
    expect(compareVectorClocks({ a: 3, b: 2 }, { a: 2, b: 2 })).toBe("after");
    expect(compareVectorClocks({ a: 3, b: 1 }, { a: 2, b: 4 })).toBe("concurrent");
  });

  it("고지연 해외 회선에서 지수 백오프 대기 시간이 단계별로 증가하고 상한에서 캡핑된다", () => {
    const rttMs = 350;
    const d1 = computeExponentialBackoffMs(1, rttMs);
    const d2 = computeExponentialBackoffMs(2, rttMs);
    const d3 = computeExponentialBackoffMs(3, rttMs);
    const capped = computeExponentialBackoffMs(12, rttMs, 30_000);

    expect(d1).toBe(700);
    expect(d2).toBe(1400);
    expect(d3).toBe(2800);
    expect(capped).toBe(30_000);
  });

  it("오프라인 큐 적재 시 기존 배열을 변경하지 않고 동일 opId는 최신 항목으로 갱신한다", () => {
    const q1 = enqueueOfflineDeltaOp(
      [],
      {
        opId: "op-1",
        assetId: "ep12",
        cutId: "cut-09",
        layerId: "line",
        layerName: "선화",
        authorId: "author-lead",
        clientClock: { "author-lead": 5 },
        payloadBytes: 524_288,
        contentSeed: "seed-a",
        queuedAtIso: "2026-11-21T10:00:00Z",
      },
      285,
    );
    const q2 = enqueueOfflineDeltaOp(
      q1,
      {
        opId: "op-1",
        assetId: "ep12",
        cutId: "cut-09",
        layerId: "line",
        layerName: "선화 수정",
        authorId: "author-lead",
        clientClock: { "author-lead": 6 },
        payloadBytes: 786_432,
        contentSeed: "seed-b",
        queuedAtIso: "2026-11-21T10:01:00Z",
      },
      285,
    );

    expect(q1).toHaveLength(1);
    expect(q1[0].contentSeed).toBe("seed-a");
    expect(q2).toHaveLength(1);
    expect(q2[0].contentSeed).toBe("seed-b");
  });

  it("재연결 시 회선 불안정 상태이면 큐 항목을 유실하지 않고 retrying + 지수 백오프로 보존한다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-sea");
    const queued = enqueueOfflineDeltaOp(
      [],
      {
        opId: "op-retry-1",
        assetId: seed.assets[0].assetId,
        cutId: "cut-12",
        layerId: "fx",
        layerName: "효과 레이어",
        authorId: "author-lead",
        clientClock: { "author-lead": 5, "assist-color": 3 },
        payloadBytes: 1_048_576,
        contentSeed: "fx-v1",
        queuedAtIso: "2026-11-21T10:00:00Z",
      },
      430,
    );

    const retry1 = flushOfflineQueueOnReconnect({
      queue: queued,
      baseLayers: seed.baseLayers,
      remoteLayers: seed.remoteLayers,
      baseClock: seed.baseClock,
      remoteClock: seed.remoteClock,
      region: GLOBAL_REGION_PROFILES[4],
      networkHealthy: false,
      nowIso: "2026-11-21T10:01:00Z",
    });
    const retry2 = flushOfflineQueueOnReconnect({
      queue: retry1.nextQueue,
      baseLayers: seed.baseLayers,
      remoteLayers: seed.remoteLayers,
      baseClock: seed.baseClock,
      remoteClock: seed.remoteClock,
      region: GLOBAL_REGION_PROFILES[4],
      networkHealthy: false,
      nowIso: "2026-11-21T10:02:00Z",
    });

    expect(retry1.retriedCount).toBe(1);
    expect(retry1.nextQueue[0].status).toBe("retrying");
    expect(retry2.nextQueue[0].attemptCount).toBe(2);
    expect(retry2.nextQueue[0].nextRetryDelayMs).toBeGreaterThan(retry1.nextQueue[0].nextRetryDelayMs);
  });

  it("서로 다른 컷·레이어 동시 편집은 3-way 벡터 클록으로 충돌 없이 무손실 자동 병합된다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-clean");
    const localNewLayer: SyncLayerSlice = {
      cutId: "cut-15",
      layerId: "light-rim",
      layerName: "역광 림라이트",
      revision: 1,
      byteLength: 4_194_304,
      contentSeed: "rim-v1",
      updatedAtIso: "2026-11-21T10:00:00Z",
      authorId: "author-lead",
    };

    const result = mergeLayersThreeWay({
      baseLayers: seed.baseLayers,
      localLayers: [...seed.baseLayers, localNewLayer],
      remoteLayers: seed.remoteLayers,
      baseClock: seed.baseClock,
      localClock: { "author-lead": 5, "assist-color": 3 },
      remoteClock: seed.remoteClock,
      nowIso: "2026-11-21T10:05:00Z",
    });

    expect(result.conflictBranches).toHaveLength(0);
    expect(result.mergedLayers.some((layer) => layer.cutId === "cut-15")).toBe(true);
    expect(
      result.mergedLayers.find((layer) => layer.cutId === "cut-02")?.contentSeed,
    ).toBe("ep12-c02-flat-remote-v4");
    expect(result.mergedClock).toEqual({ "author-lead": 5, "assist-color": 4 });
  });

  it("동일 컷·레이어 동시 충돌 시 원격 레이어를 유지하면서 로컬 변경을 안전 브랜치로 무손실 분기한다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-conflict");
    const localConflictLayers = seed.baseLayers.map((layer) =>
      layer.cutId === "cut-02"
        ? { ...layer, revision: 4, contentSeed: "ep12-c02-flat-local-offline-v4", authorId: "author-lead" }
        : layer,
    );

    const outcome = mergeLayersThreeWay({
      baseLayers: seed.baseLayers,
      localLayers: localConflictLayers,
      remoteLayers: seed.remoteLayers,
      baseClock: seed.baseClock,
      localClock: { "author-lead": 5, "assist-color": 3 },
      remoteClock: seed.remoteClock,
      nowIso: "2026-11-21T10:10:00Z",
    });

    expect(outcome.conflictBranches).toHaveLength(1);
    expect(outcome.conflictBranches[0].branchId).toMatch(/^safe-branch\/cut-02-color-flat-author-lead-/u);
    expect(outcome.conflictBranches[0].localSeed).toBe("ep12-c02-flat-local-offline-v4");
    expect(outcome.mergedLayers.find((layer) => layer.cutId === "cut-02")?.contentSeed).toBe(
      "ep12-c02-flat-remote-v4",
    );
  });

  it("정상 재연결 시 오프라인 큐의 무충돌 항목은 synced, 충돌 항목은 conflict-branched로 분류한다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-flush");
    let queue = enqueueOfflineDeltaOp(
      [],
      {
        opId: "op-clean",
        assetId: seed.assets[0].assetId,
        cutId: "cut-19",
        layerId: "tone",
        layerName: "스크린톤",
        authorId: "author-lead",
        clientClock: { "author-lead": 5, "assist-color": 3 },
        payloadBytes: 2_097_152,
        contentSeed: "tone-v1",
        queuedAtIso: "2026-11-21T10:00:00Z",
      },
      285,
    );
    queue = enqueueOfflineDeltaOp(
      queue,
      {
        opId: "op-conflict",
        assetId: seed.assets[0].assetId,
        cutId: "cut-02",
        layerId: "color-flat",
        layerName: "기본 채색 밑색",
        authorId: "author-lead",
        clientClock: { "author-lead": 6, "assist-color": 3 },
        payloadBytes: 26_738_688,
        contentSeed: "local-flat-conflict",
        queuedAtIso: "2026-11-21T10:01:00Z",
      },
      285,
    );

    const flushed = flushOfflineQueueOnReconnect({
      queue,
      baseLayers: seed.baseLayers,
      remoteLayers: seed.remoteLayers,
      baseClock: seed.baseClock,
      remoteClock: seed.remoteClock,
      region: GLOBAL_REGION_PROFILES[1],
      networkHealthy: true,
      nowIso: "2026-11-21T10:02:00Z",
    });

    expect(flushed.syncedCount).toBe(1);
    expect(flushed.conflictBranches).toHaveLength(1);
    expect(flushed.nextQueue.find((item) => item.opId === "op-clean")?.status).toBe("synced");
    expect(flushed.nextQueue.find((item) => item.opId === "op-conflict")?.status).toBe("conflict-branched");
    expect(flushed.nextQueue.find((item) => item.opId === "op-conflict")?.resolvedBranchName).toContain(
      "safe-branch/",
    );
  });
});

describe("크래시 제로 타임머신 스냅샷 & 비상 복구", () => {
  it("60초 자동 저널 체크포인트와 수동 릴리즈 태그 스냅샷을 불변으로 생성한다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-tm");
    const snap = createTimeMachineSnapshot({
      snapshots: seed.timeline.snapshots,
      layers: seed.timeline.currentLayers,
      trigger: "manual-release-tag",
      releaseTag: "ep12-final-master",
      noteKo: "최종 마스터 저장",
      nowIso: "2026-11-21T10:30:00Z",
    });

    expect(snap.releaseTag).toBe("ep12-final-master");
    expect(snap.layerCount).toBe(seed.timeline.currentLayers.length);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.layers)).toBe(true);
  });

  it("두 스냅샷 간 추가·삭제·수정 레이어, 영향 컷, 바이트 델타를 정확히 비교한다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-diff");
    const [snapLineDone, , snapAdOk] = seed.timeline.snapshots;
    const diff = diffTimeMachineSnapshots(snapLineDone, snapAdOk);

    expect(diff.addedLayers).toHaveLength(1);
    expect(diff.addedLayers[0].cutId).toBe("cut-08");
    expect(diff.modifiedLayers).toHaveLength(1);
    expect(diff.modifiedLayers[0].cutId).toBe("cut-02");
    expect(diff.changedCutIds).toEqual(["cut-02", "cut-08"]);
    expect(diff.byteDelta).toBeGreaterThan(0);
  });

  it("원클릭 롤백 시 직전 작업 상태를 pre-rollback-safety 스냅샷으로 먼저 보존하고 과거 스냅샷을 훼손하지 않는다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-rollback");
    const targetSnap = seed.timeline.snapshots[0];
    const beforeCount = seed.timeline.snapshots.length;

    const { nextTimeline, safetySnapshot, restoredSnapshot } = rollbackToTimeMachineSnapshot(
      seed.timeline,
      targetSnap.snapshotId,
      "2026-11-21T10:40:00Z",
    );

    expect(restoredSnapshot.snapshotId).toBe(targetSnap.snapshotId);
    expect(safetySnapshot.trigger).toBe("pre-rollback-safety");
    expect(nextTimeline.snapshots).toHaveLength(beforeCount + 1);
    expect(nextTimeline.activeSnapshotId).toBe(targetSnap.snapshotId);
    expect(nextTimeline.currentLayers).toHaveLength(targetSnap.layers.length);
    expect(seed.timeline.snapshots).toHaveLength(beforeCount);
  });

  it("존재하지 않는 스냅샷 ID로 롤백하면 오류를 발생시켜 잘못된 상태 전환을 차단한다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-missing");
    expect(() =>
      rollbackToTimeMachineSnapshot(seed.timeline, "snap-not-found", "2026-11-21T10:45:00Z"),
    ).toThrow(/찾을 수 없습니다/u);
  });

  it("메모리 압박(memory-pressure) 감지 시 즉시 비상 스냅샷을 저장하고 복구 횟수를 증가시킨다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-mem");
    const { nextTimeline, emergencySnapshot } = handleCrashZeroEmergencySignal(seed.timeline, {
      kind: "memory-pressure",
      heapUsagePct: 95,
      detectedAtIso: "2026-11-21T10:50:00Z",
    });

    expect(emergencySnapshot.trigger).toBe("emergency-memory-pressure");
    expect(emergencySnapshot.layerCount).toBe(seed.timeline.currentLayers.length);
    expect(nextTimeline.emergencyRecoveryCount).toBe(1);
    expect(nextTimeline.activeSnapshotId).toBe(emergencySnapshot.snapshotId);
  });

  it("WebGPU 컨텍스트 손실 감지 시 즉시 비상 스냅샷을 영구 기록하고 레이어를 무손실 보존한다", () => {
    const seed = createSyncTimeMachineWorkspaceSeed("proj-gpu");
    const { nextTimeline, emergencySnapshot, recoveryMessageKo } = handleCrashZeroEmergencySignal(
      seed.timeline,
      {
        kind: "webgpu-context-lost",
        gpuDeviceLabel: "M4-WebGPU",
        detectedAtIso: "2026-11-21T10:51:00Z",
      },
    );

    expect(emergencySnapshot.trigger).toBe("emergency-webgpu-lost");
    expect(emergencySnapshot.contentRootHash).toBe(
      seed.timeline.snapshots[seed.timeline.snapshots.length - 1].contentRootHash,
    );
    expect(nextTimeline.emergencyRecoveryCount).toBe(1);
    expect(recoveryMessageKo).toContain("M4-WebGPU");
  });
});

describe("작가 아트 바이블 화풍 락 일관성 검수 엔진", () => {
  it("OKLCH ΔE 계산이 동일 색상은 0이며 색상환 355°↔5° 경계를 연속적으로 처리한다", () => {
    expect(computeOklchDeltaE({ l: 0.7, c: 0.1, h: 45 }, { l: 0.7, c: 0.1, h: 45 })).toBe(0);
    const wrapDelta = computeOklchDeltaE({ l: 0.65, c: 0.12, h: 355 }, { l: 0.65, c: 0.12, h: 5 });
    const oppositeDelta = computeOklchDeltaE({ l: 0.65, c: 0.12, h: 0 }, { l: 0.65, c: 0.12, h: 180 });
    expect(wrapDelta).toBeLessThan(3);
    expect(oppositeDelta).toBeGreaterThan(20);
  });

  it("formatOklchCss가 원시 HEX 없이 표준 oklch(...) 표기를 생성한다", () => {
    const css = formatOklchCss({ l: 0.87, c: 0.042, h: 52 });
    expect(css).toBe("oklch(0.870 0.042 52.0)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("기준 팔레트·선폭·명암 범위 내 정상 제출 컷은 통과(pass) 판정을 받는다", () => {
    const [, doyunBible] = createInitialStyleLockBibleEntries();
    const [, doyunCut] = createInitialCutStyleSamples();
    const report = evaluateStyleLockConsistency(doyunBible, doyunCut);

    expect(report.passed).toBe(true);
    expect(report.severity).toBe("pass");
    expect(report.lineWidthWithinLimit).toBe(true);
    expect(report.contrastWithinLimit).toBe(true);
  });

  it("팔레트 ΔE·선폭·명암이 기준을 이탈한 외주 컷은 차단(block) 리포트와 보정 배율을 산출한다", () => {
    const [seoyeonBible] = createInitialStyleLockBibleEntries();
    const [seoyeonCut] = createInitialCutStyleSamples();
    const report = evaluateStyleLockConsistency(seoyeonBible, seoyeonCut);

    expect(report.passed).toBe(false);
    expect(report.severity).toBe("block");
    expect(report.maxObservedDeltaE).toBeGreaterThan(seoyeonBible.maxDeltaE);
    expect(report.lineWidthDeviationPx).toBeCloseTo(0.9, 2);
    expect(report.autoCorrection.lineWidthScaleFactor).toBeLessThan(1);
    expect(report.autoCorrection.paletteRemaps).toHaveLength(4);
  });

  it("1클릭 자동 보정 적용 후 재검수 시 ΔE 0·선폭 편차 0으로 화풍 락을 통과한다", () => {
    const [seoyeonBible] = createInitialStyleLockBibleEntries();
    const [seoyeonCut] = createInitialCutStyleSamples();
    const corrected = applyStyleLockAutoCorrection(seoyeonCut, seoyeonBible);
    const reAudit = evaluateStyleLockConsistency(seoyeonBible, corrected);

    expect(reAudit.passed).toBe(true);
    expect(reAudit.severity).toBe("pass");
    expect(reAudit.maxObservedDeltaE).toBe(0);
    expect(reAudit.lineWidthDeviationPx).toBe(0);
    expect(reAudit.contrastWithinLimit).toBe(true);
  });
});

describe("Zero-Leak 부분 열람 & 비가시 포렌식 워터마크 정책 엔진", () => {
  it("역할 정책 상한에 맞춰 컷 범위·해상도를 제한하고 결정론적 워터마크 ID와 서명을 발급한다", () => {
    const token = issueZeroLeakAccessToken({
      projectId: "proj-zl",
      recipientNameKo: "번역팀 A",
      role: "translator",
      allowedCutStart: 1,
      allowedCutEnd: 99, // translator 최대 30컷 제한 적용
      maxResolutionPx: 4000, // translator 최대 1280px 제한 적용
      nowIso: "2026-11-21T09:00:00Z",
    });

    expect(token.allowedCutEnd).toBe(30);
    expect(token.maxResolutionPx).toBe(1280);
    expect(token.allowRawLayerExport).toBe(false);
    expect(token.watermarkId).toMatch(/^WM-TRA-/u);
    expect(token.signature).toMatch(/^ZL-/u);
  });

  it("허용 범위 내 열람 요청은 ALLOW 판정과 비가시 워터마크 ID, 감사 로그를 함께 반환한다", () => {
    const token = issueZeroLeakAccessToken({
      projectId: "proj-zl",
      recipientNameKo: "외주 채색 B",
      role: "outsource-color",
      allowedCutStart: 5,
      allowedCutEnd: 15,
      ttlHours: 24,
      nowIso: "2026-11-21T09:00:00Z",
    });

    const { result, auditEntry } = evaluateZeroLeakSliceAccess(token, {
      requestedCutNumber: 10,
      requestedResolutionPx: 2000,
      requestsRawLayerExport: true,
      evaluatedAtIso: "2026-11-21T12:00:00Z",
    });

    expect(result.allowed).toBe(true);
    expect(result.code).toBe("ALLOW");
    expect(result.enforcedWatermarkId).toBe(token.watermarkId);
    expect(auditEntry.allowed).toBe(true);
    expect(auditEntry.watermarkId).toBe(token.watermarkId);
  });

  it("허용 컷 범위를 벗어난 열람 요청은 DENY_CUT_OUT_OF_RANGE로 차단한다", () => {
    const token = issueZeroLeakAccessToken({
      projectId: "proj-zl",
      recipientNameKo: "외주 선화 C",
      role: "outsource-line",
      allowedCutStart: 1,
      allowedCutEnd: 10,
      nowIso: "2026-11-21T09:00:00Z",
    });

    const { result, auditEntry } = evaluateZeroLeakSliceAccess(token, {
      requestedCutNumber: 11,
      requestedResolutionPx: 1600,
      requestsRawLayerExport: false,
      evaluatedAtIso: "2026-11-21T10:00:00Z",
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe("DENY_CUT_OUT_OF_RANGE");
    expect(result.enforcedWatermarkId).toBeNull();
    expect(auditEntry.decision).toBe("DENY_CUT_OUT_OF_RANGE");
  });

  it("만료·회수·서명 변조 토큰은 모두 fail-closed로 차단한다", () => {
    const token = issueZeroLeakAccessToken({
      projectId: "proj-zl",
      recipientNameKo: "검수 PD",
      role: "editor-review",
      allowedCutStart: 1,
      allowedCutEnd: 20,
      ttlHours: 4,
      nowIso: "2026-11-21T09:00:00Z",
    });

    const expired = evaluateZeroLeakSliceAccess(token, {
      requestedCutNumber: 5,
      requestedResolutionPx: 1200,
      requestsRawLayerExport: false,
      evaluatedAtIso: "2026-11-21T14:00:00Z",
    });
    expect(expired.result.code).toBe("DENY_EXPIRED");

    const revokedToken = revokeZeroLeakAccessToken(token);
    const revoked = evaluateZeroLeakSliceAccess(revokedToken, {
      requestedCutNumber: 5,
      requestedResolutionPx: 1200,
      requestsRawLayerExport: false,
      evaluatedAtIso: "2026-11-21T10:00:00Z",
    });
    expect(revoked.result.code).toBe("DENY_REVOKED");

    const tampered = evaluateZeroLeakSliceAccess(
      { ...token, allowedCutEnd: 50 },
      {
        requestedCutNumber: 25,
        requestedResolutionPx: 1200,
        requestsRawLayerExport: false,
        evaluatedAtIso: "2026-11-21T10:00:00Z",
      },
    );
    expect(tampered.result.code).toBe("DENY_SIGNATURE_INVALID");
  });

  it("해상도 상한 초과와 번역가 원본 레이어 내보내기 요청을 차단한다", () => {
    const translatorToken = issueZeroLeakAccessToken({
      projectId: "proj-zl",
      recipientNameKo: "일본어 번역",
      role: "translator",
      allowedCutStart: 1,
      allowedCutEnd: 15,
      nowIso: "2026-11-21T09:00:00Z",
    });

    const overRes = evaluateZeroLeakSliceAccess(translatorToken, {
      requestedCutNumber: 3,
      requestedResolutionPx: 2400,
      requestsRawLayerExport: false,
      evaluatedAtIso: "2026-11-21T10:00:00Z",
    });
    expect(overRes.result.code).toBe("DENY_RESOLUTION_EXCEEDED");

    const rawDenied = evaluateZeroLeakSliceAccess(translatorToken, {
      requestedCutNumber: 3,
      requestedResolutionPx: 1280,
      requestsRawLayerExport: true,
      evaluatedAtIso: "2026-11-21T10:00:00Z",
    });
    expect(rawDenied.result.code).toBe("DENY_RAW_EXPORT_FORBIDDEN");
  });
});

describe("StudioSyncTimeMachinePanel UI 및 지연 연결 계약", () => {
  it("차분 동기화 탭에서 청크 편집·오프라인 큐 적재·백오프·3-Way 충돌 안전 브랜치 생성이 동작한다", () => {
    render(<StudioSyncTimeMachinePanel projectId="demo-ep12" />);

    expect(screen.getByTestId("sync-tm-saving-pct").textContent).toMatch(/99\.\d%/u);

    fireEvent.click(screen.getByTestId("sync-tm-btn-edit-chunks"));
    expect(screen.getByTestId("sync-tm-dirty-chunks").textContent).toContain("12 /");

    fireEvent.click(screen.getByTestId("sync-tm-btn-enqueue-clean"));
    fireEvent.click(screen.getByTestId("sync-tm-btn-enqueue-conflict"));
    expect(screen.getByTestId("sync-tm-offline-queue-list").children).toHaveLength(2);

    fireEvent.click(screen.getByTestId("sync-tm-btn-retry-backoff"));
    expect(screen.getByTestId("sync-tm-status-notice").textContent).toContain("지수 백오프");

    fireEvent.click(screen.getByTestId("sync-tm-btn-flush-sync"));
    expect(screen.getByTestId("sync-tm-conflict-branch-list").textContent).toContain("safe-branch/");
  });

  it("타임머신 탭에서 릴리즈 저장·비상 복구(메모리/WebGPU)·원클릭 복원이 정상 작동한다", () => {
    render(<StudioSyncTimeMachinePanel projectId="demo-ep12" />);
    fireEvent.click(screen.getByTestId("sync-tm-tab-timemachine"));

    const initialCount = screen.getByTestId("sync-tm-snapshot-list").children.length;
    fireEvent.click(screen.getByTestId("sync-tm-btn-save-release"));
    fireEvent.click(screen.getByTestId("sync-tm-btn-crash-memory"));
    fireEvent.click(screen.getByTestId("sync-tm-btn-crash-webgpu"));

    expect(screen.getByTestId("sync-tm-snapshot-list").children.length).toBe(initialCount + 3);

    const rollbackButtons = screen.getAllByRole("button", { name: "원클릭 복원" });
    fireEvent.click(rollbackButtons[rollbackButtons.length - 1]);
    expect(screen.getByTestId("sync-tm-status-notice").textContent).toContain("안전 백업");
  });

  it("아트 바이블 화풍 락 1클릭 보정과 Zero-Leak 토큰 발급·검증·회수 UI가 동작한다", () => {
    render(<StudioSyncTimeMachinePanel projectId="demo-ep12" />);
    fireEvent.click(screen.getByTestId("sync-tm-tab-style-security"));

    expect(screen.getByTestId("sync-tm-style-severity").textContent).toBe("보정 필수 차단");
    fireEvent.click(screen.getByTestId("sync-tm-btn-autocorrect-style"));
    expect(screen.getByTestId("sync-tm-style-severity").textContent).toBe("화풍 락 통과");

    fireEvent.click(screen.getByTestId("sync-tm-btn-issue-token"));
    expect(screen.getByTestId("sync-tm-active-token-box").textContent).toContain("WM-TRA-");

    fireEvent.click(screen.getByTestId("sync-tm-btn-verify-access"));
    expect(screen.getByTestId("sync-tm-access-decision").textContent).toContain("차단");
    expect(screen.getByTestId("sync-tm-audit-log-list").children.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByTestId("sync-tm-btn-revoke-token"));
    expect(screen.getByTestId("sync-tm-active-token-box").textContent).toContain("회수됨");
  });

  it("ProductionPlanningGuide 하단 접이식 disclosure가 기본 접힘이며 열 때 lazyRetry로 패널을 마운트한다", async () => {
    render(
      <MemoryRouter>
        <ProductionPlanningGuide projectId="team/ep12" />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("studio-sync-timemachine-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-sync-timemachine-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-sync-timemachine-panel")).toBeTruthy();
    });
  });

  it("sync-timemachine-os.css가 원시 HEX·transition:all 금지, reduced-motion, 44px 터치 타겟 규칙을 지킨다", () => {
    const cssText = readFileSync(
      resolve(process.cwd(), "apps/web/src/domains/creator/sync-timemachine-os/sync-timemachine-os.css"),
      "utf8",
    );
    expect(cssText).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(cssText).not.toMatch(/transition\s*:\s*all\b/u);
    expect(cssText).toContain("prefers-reduced-motion: reduce");
    expect(cssText).toContain("min-height: 44px");
    expect(cssText).toContain("min-width: 44px");
    expect(cssText).toContain("oklch(");
  });
});
