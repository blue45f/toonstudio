import { describe, expect, it } from "vitest";

import {
  INDIRECT_DISPATCH_U32_LENGTH,
  WEBGPU_BUFFER_ALIGNMENT_BYTES,
  WEBGPU_DIRTY_TILE_SIZE_PX,
  alignToWebGpu256,
  allocateStagingRingSlice,
  arbitrateSpatialIntentClaim,
  buildDirtyTileIndirectCompositePlan,
  buildEpisodeStageNodeId,
  completeEpisodeStageExecution,
  computeIndirectDispatchArgs,
  createEpisodeDagCheckpoint,
  createEpisodeDagOrchestratorState,
  createSpatialIntentArbiterState,
  createStagingRingBufferState,
  decodeMorton2D,
  encodeMorton2D,
  expireStaleSpatialLeases,
  failEpisodeStageExecution,
  inspectPreStrokeIntentConflict,
  reclaimCompletedStagingSlices,
  resolveSimultaneousSpatialClaims,
  restoreEpisodeDagFromCheckpoint,
  scheduleReadyEpisodeTasks,
  submitHumanArtistApproval,
  type SpatialIntentClaimInput,
} from "./index";

describe("wasm64-wave33-webgpu-crdt-agent-orchestrator", () => {
  describe("webgpu-dirty-tile-indirect-compositor", () => {
    it("32-bit Morton Z-order 인코딩·디코딩이 16-bit 전 범위에서 왕복 일치하고 Z-사분면 순서를 유지한다", () => {
      const coords: readonly [number, number][] = [
        [0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [17, 29], [255, 512], [4095, 8191], [65535, 65535],
      ];
      for (const [tx, ty] of coords) {
        const code = encodeMorton2D(tx, ty);
        expect(code).toBeGreaterThanOrEqual(0);
        expect(decodeMorton2D(code)).toEqual({ tileX: tx, tileY: ty });
      }
      expect(encodeMorton2D(0, 0)).toBeLessThan(encodeMorton2D(1, 0));
      expect(encodeMorton2D(1, 0)).toBeLessThan(encodeMorton2D(0, 1));
      expect(encodeMorton2D(0, 1)).toBeLessThan(encodeMorton2D(1, 1));
      expect(encodeMorton2D(1, 1)).toBeLessThan(encodeMorton2D(2, 0));
    });

    it("겹치거나 중복된 스트로크 더티 사각형을 256x256 타일로 분할·중복 제거하고 Morton 오름차순으로 정렬한다", () => {
      const plan = buildDirtyTileIndirectCompositePlan({
        canvasWidthPx: 1024,
        canvasHeightPx: 1024,
        dirtyRects: [
          { layerId: "layer-ink", x: 10, y: 20, width: 300, height: 100 },
          { layerId: "layer-ink", x: 120, y: 40, width: 220, height: 260 },
          { layerId: "layer-ink", x: 30, y: 30, width: 80, height: 80 },
        ],
      });
      expect(plan.ok).toBe(true);
      expect(plan.tileSizePx).toBe(WEBGPU_DIRTY_TILE_SIZE_PX);
      const inkPlan = plan.layerPlans[0];
      expect(inkPlan?.uniqueTileCount).toBe(4);
      expect(inkPlan?.rawTileHitCount).toBe(7);
      expect(inkPlan?.deduplicatedTileCount).toBe(3);
      const codes = inkPlan?.tiles.map((t) => t.mortonCode) ?? [];
      expect(codes).toEqual([...codes].sort((a, b) => a - b));
      expect(inkPlan?.tiles[0]).toMatchObject({ tileX: 0, tileY: 0, sourceRectHitCount: 3 });
    });

    it("동일 행의 가로 인접 더티 타일을 연속 스팬으로 병합하고 캔버스 경계 크기를 정확히 클리핑한다", () => {
      const plan = buildDirtyTileIndirectCompositePlan({
        canvasWidthPx: 900,
        canvasHeightPx: 600,
        dirtyRects: [
          { layerId: "layer-tone", x: 0, y: 10, width: 600, height: 40 },
          { layerId: "layer-tone", x: 800, y: 520, width: 200, height: 200 },
        ],
      });
      const tonePlan = plan.layerPlans[0];
      expect(tonePlan?.uniqueTileCount).toBe(4);
      expect(tonePlan?.coalescedSpans).toHaveLength(2);
      expect(tonePlan?.coalescedSpans[0]).toMatchObject({
        tileY: 0, startTileX: 0, endTileX: 2, tileCount: 3,
        pixelBounds: { x: 0, y: 0, width: 768, height: 256 },
      });
      expect(tonePlan?.coalescedSpans[1]).toMatchObject({
        tileY: 2, startTileX: 3, endTileX: 3, tileCount: 1,
        pixelBounds: { x: 768, y: 512, width: 132, height: 88 },
      });
    });

    it("WebGPU dispatchWorkgroupsIndirect 버퍼(Uint32Array(3))를 활성 타일 수에 맞춰 정확히 산출한다", () => {
      const emptyArgs = computeIndirectDispatchArgs(0, 256, 8, 8);
      expect(emptyArgs).toBeInstanceOf(Uint32Array);
      expect(emptyArgs.length).toBe(INDIRECT_DISPATCH_U32_LENGTH);
      expect([...emptyArgs]).toEqual([0, 0, 0]);
      expect([...computeIndirectDispatchArgs(5, 256, 8, 8)]).toEqual([32, 32, 5]);

      const zeroRectPlan = buildDirtyTileIndirectCompositePlan({
        canvasWidthPx: 512,
        canvasHeightPx: 512,
        dirtyRects: [{ layerId: "layer-empty", x: 100, y: 100, width: 0, height: 50 }],
      });
      expect([...zeroRectPlan.combinedIndirectDispatchArgs]).toEqual([0, 0, 0]);
    });

    it("임의 크기 페이로드에 대해 WebGPU 256-byte 오프셋·길이 정렬 불변식을 보장한다", () => {
      expect(alignToWebGpu256(0)).toBe(0);
      expect(alignToWebGpu256(1)).toBe(256);
      expect(alignToWebGpu256(255)).toBe(256);
      expect(alignToWebGpu256(256)).toBe(256);
      expect(alignToWebGpu256(257)).toBe(512);

      let ring = createStagingRingBufferState(2048);
      for (const reqSize of [17, 256, 300, 513]) {
        const res = allocateStagingRingSlice(ring, reqSize);
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.slice.offsetBytes % WEBGPU_BUFFER_ALIGNMENT_BYTES).toBe(0);
          expect(res.slice.alignedByteLength % WEBGPU_BUFFER_ALIGNMENT_BYTES).toBe(0);
          expect(res.slice.alignedByteLength).toBeGreaterThanOrEqual(reqSize);
          ring = res.nextState;
        }
      }
    });

    it("스테이징 링 끝단 공간이 부족할 때 선행 펜스 회수 후 오프셋 0으로 안전하게 래핑(wrap-around)한다", () => {
      let ring = createStagingRingBufferState(1024, 1024);
      const first = allocateStagingRingSlice(ring, 500);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const second = allocateStagingRingSlice(first.nextState, 256);
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.nextState.headOffsetBytes).toBe(768);

      ring = reclaimCompletedStagingSlices(second.nextState, first.slice.fenceSeq);
      expect(ring.tailOffsetBytes).toBe(512);
      expect(ring.inFlightBytes).toBe(256);

      const wrapped = allocateStagingRingSlice(ring, 512);
      expect(wrapped.ok).toBe(true);
      if (!wrapped.ok) return;
      expect(wrapped.slice).toMatchObject({ offsetBytes: 0, wrappedAround: true, paddingBeforeBytes: 256 });
      expect(wrapped.nextState.wrapAroundCount).toBe(1);
      expect(wrapped.nextState.reservedSpanBytes).toBe(1024);

      const reclaimedAll = reclaimCompletedStagingSlices(wrapped.nextState, second.slice.fenceSeq);
      expect(reclaimedAll).toMatchObject({ inFlightBytes: 512, reservedSpanBytes: 512, tailOffsetBytes: 0 });
    });

    it("VRAM 예산 초과(VRAM_BUDGET_EXCEEDED)와 링 용량 초과(RING_CAPACITY_EXCEEDED)를 구분해 방어한다", () => {
      const okSlice = allocateStagingRingSlice(createStagingRingBufferState(2048, 512), 256);
      expect(okSlice.ok).toBe(true);
      if (!okSlice.ok) return;

      const budgetOverflow = allocateStagingRingSlice(okSlice.nextState, 300);
      expect(budgetOverflow.ok).toBe(false);
      if (!budgetOverflow.ok) {
        expect(budgetOverflow.reason).toBe("VRAM_BUDGET_EXCEEDED");
        expect(budgetOverflow.nextState).toBe(okSlice.nextState);
      }

      const fullSlice = allocateStagingRingSlice(createStagingRingBufferState(512, 512), 512);
      expect(fullSlice.ok).toBe(true);
      if (!fullSlice.ok) return;
      const ringOverflow = allocateStagingRingSlice(reclaimCompletedStagingSlices(fullSlice.nextState, 0), 256);
      expect(ringOverflow.ok).toBe(false);
    });

    it("다중 레이어 합성 계획에서 레이어별 타일을 분리하고 VRAM 예산 초과 시 실패 사유를 기록한다", () => {
      const overflowPlan = buildDirtyTileIndirectCompositePlan({
        canvasWidthPx: 512,
        canvasHeightPx: 512,
        ringCapacityBytes: 1024 * 1024,
        vramBudgetBytes: 512,
        dirtyRects: [
          { layerId: "layer-bg", x: 10, y: 10, width: 40, height: 40, blendMode: "normal" },
          { layerId: "layer-shadow", x: 10, y: 10, width: 40, height: 40, blendMode: "multiply" },
        ],
      });
      expect(overflowPlan.ok).toBe(false);
      expect(overflowPlan.overflowReason).toBe("VRAM_BUDGET_EXCEEDED");
      expect(overflowPlan.layerPlans).toHaveLength(2);
    });
  });

  describe("crdt-spatial-region-intent-arbiter", () => {
    it("동일 컷·동일 레이어에서 패딩 AABB가 겹치는 후발 쓰기 의도를 스트로크 커밋 전에 차단한다", () => {
      const first = arbitrateSpatialIntentClaim(
        createSpatialIntentArbiterState(10),
        {
          authorId: "artist-kim", cutId: "cut-01", layerId: "layer-lineart",
          strokeRect: { x: 100, y: 100, width: 80, height: 80 }, paddingPx: 16,
          toolKind: "pen-ink", ttlMs: 2000, lamportClock: 11,
        },
        1000,
      );
      expect(first.granted).toBe(true);

      const candidateConflict: SpatialIntentClaimInput = {
        authorId: "artist-park", cutId: "cut-01", layerId: "layer-lineart",
        strokeRect: { x: 190, y: 120, width: 50, height: 50 }, paddingPx: 16,
        toolKind: "eraser", ttlMs: 2000, lamportClock: 14,
      };
      const preCheck = inspectPreStrokeIntentConflict(first.nextState, candidateConflict, 1200);
      expect(preCheck.hasConflict).toBe(true);
      expect(preCheck.blockingLeases).toHaveLength(1);

      const rejected = arbitrateSpatialIntentClaim(first.nextState, candidateConflict, 1200);
      expect(rejected.granted).toBe(false);
      expect(rejected.blockingLeases[0]?.authorId).toBe("artist-kim");
    });

    it("같은 좌표라도 서로 다른 레이어나 다른 컷을 편집하면 무충돌로 동시 임대를 승인한다", () => {
      const lineClaim = arbitrateSpatialIntentClaim(
        createSpatialIntentArbiterState(1),
        {
          authorId: "artist-a", cutId: "cut-01", layerId: "layer-lineart",
          strokeRect: { x: 50, y: 50, width: 120, height: 120 }, toolKind: "pen-ink", lamportClock: 2,
        },
        500,
      );
      const colorSameCut = arbitrateSpatialIntentClaim(
        lineClaim.nextState,
        {
          authorId: "artist-b", cutId: "cut-01", layerId: "layer-color",
          strokeRect: { x: 50, y: 50, width: 120, height: 120 }, toolKind: "bucket-fill", lamportClock: 3,
        },
        520,
      );
      expect(colorSameCut.granted).toBe(true);

      const sameLayerOtherCut = arbitrateSpatialIntentClaim(
        colorSameCut.nextState,
        {
          authorId: "artist-c", cutId: "cut-02", layerId: "layer-lineart",
          strokeRect: { x: 50, y: 50, width: 120, height: 120 }, toolKind: "pen-ink", lamportClock: 4,
        },
        540,
      );
      expect(sameLayerOtherCut.granted).toBe(true);
      expect(sameLayerOtherCut.nextState.activeLeases).toHaveLength(3);
    });

    it("열람·스포이드·자 측정 등 비변경(read) 도구는 동일 레이어 쓰기 임대와 겹쳐도 충돌하지 않는다", () => {
      const base = arbitrateSpatialIntentClaim(
        createSpatialIntentArbiterState(5),
        {
          authorId: "artist-writer", cutId: "cut-03", layerId: "layer-ink",
          strokeRect: { x: 200, y: 200, width: 100, height: 100 }, toolKind: "pen-ink", lamportClock: 6,
        },
        1000,
      );
      const eyedropper = arbitrateSpatialIntentClaim(
        base.nextState,
        {
          authorId: "artist-reader", cutId: "cut-03", layerId: "layer-ink",
          strokeRect: { x: 210, y: 210, width: 20, height: 20 }, toolKind: "eyedropper-pick", lamportClock: 7,
        },
        1100,
      );
      expect(eyedropper.granted).toBe(true);

      const writerOtherLayer = arbitrateSpatialIntentClaim(
        eyedropper.nextState,
        {
          authorId: "artist-second-writer", cutId: "cut-03", layerId: "layer-shade",
          strokeRect: { x: 210, y: 210, width: 20, height: 20 }, toolKind: "airbrush", lamportClock: 8,
        },
        1150,
      );
      expect(writerOtherLayer.granted).toBe(true);
    });

    it("동일 작가가 같은 레이어에서 연속 획을 그을 때는 자기 임대와 충돌하지 않고 임대를 갱신한다", () => {
      const first = arbitrateSpatialIntentClaim(
        createSpatialIntentArbiterState(1),
        {
          authorId: "artist-solo", cutId: "cut-01", layerId: "layer-ink",
          strokeRect: { x: 40, y: 40, width: 60, height: 60 },
          toolKind: "pen-ink", ttlMs: 1000, lamportClock: 2,
        },
        1000,
      );
      const renewed = arbitrateSpatialIntentClaim(
        first.nextState,
        {
          authorId: "artist-solo", cutId: "cut-01", layerId: "layer-ink",
          strokeRect: { x: 60, y: 60, width: 80, height: 80 },
          toolKind: "pen-ink", ttlMs: 1000, lamportClock: 5,
        },
        1500,
      );
      expect(renewed.granted).toBe(true);
      expect(renewed.nextState.activeLeases).toHaveLength(1);
      expect(renewed.nextState.activeLeases[0]?.expiresAtMs).toBe(2500);
    });

    it("TTL이 지난 정체 임대를 결정론적으로 만료 처리하고 후속 쓰기 청구를 즉시 허용한다", () => {
      const first = arbitrateSpatialIntentClaim(
        createSpatialIntentArbiterState(1),
        {
          authorId: "artist-stale", cutId: "cut-01", layerId: "layer-ink",
          strokeRect: { x: 0, y: 0, width: 100, height: 100 },
          toolKind: "pen-ink", ttlMs: 1500, lamportClock: 2,
        },
        1000,
      );
      const expiredStep = expireStaleSpatialLeases(first.nextState, 2500);
      expect(expiredStep.expiredLeases).toHaveLength(1);
      expect(expiredStep.nextState.activeLeases).toHaveLength(0);

      const takeover = arbitrateSpatialIntentClaim(
        first.nextState,
        {
          authorId: "artist-fresh", cutId: "cut-01", layerId: "layer-ink",
          strokeRect: { x: 10, y: 10, width: 50, height: 50 },
          toolKind: "pen-ink", ttlMs: 1500, lamportClock: 3,
        },
        2501,
      );
      expect(takeover.granted).toBe(true);
      expect(takeover.expiredLeases).toHaveLength(1);
    });

    it("동일 Lamport 시각의 동시 경합 청구를 (lamportClock, authorId) 전순서로 모든 피어에서 동일하게 판정한다", () => {
      const claimAlpha: SpatialIntentClaimInput = {
        authorId: "artist-alpha", cutId: "cut-07", layerId: "layer-ink",
        strokeRect: { x: 100, y: 100, width: 100, height: 100 }, toolKind: "pen-ink", lamportClock: 42,
      };
      const claimBeta: SpatialIntentClaimInput = {
        authorId: "artist-beta", cutId: "cut-07", layerId: "layer-ink",
        strokeRect: { x: 140, y: 140, width: 100, height: 100 }, toolKind: "lasso-transform", lamportClock: 42,
      };

      const peer1 = resolveSimultaneousSpatialClaims(createSpatialIntentArbiterState(40), [claimAlpha, claimBeta], 3000);
      const peer2 = resolveSimultaneousSpatialClaims(createSpatialIntentArbiterState(40), [claimBeta, claimAlpha], 3000);

      expect(peer1.acceptedLeases.map((l) => l.authorId)).toEqual(["artist-alpha"]);
      expect(peer2.acceptedLeases.map((l) => l.authorId)).toEqual(["artist-alpha"]);
      expect(peer1.rejectedClaims.map((r) => r.claim.authorId)).toEqual(["artist-beta"]);
      expect(peer2.rejectedClaims.map((r) => r.claim.authorId)).toEqual(["artist-beta"]);
      expect(peer1.nextState).toEqual(peer2.nextState);
    });

    it("네트워크 지연으로 더 앞선 (lamportClock, authorId) 청구가 늦게 도착하면 투기적 후순위 임대를 선점한다", () => {
      const speculative = arbitrateSpatialIntentClaim(
        createSpatialIntentArbiterState(20),
        {
          authorId: "artist-z", cutId: "cut-05", layerId: "layer-ink",
          strokeRect: { x: 0, y: 0, width: 120, height: 120 }, toolKind: "pen-ink", lamportClock: 25,
        },
        1000,
      );
      const earlierCausalArrival = arbitrateSpatialIntentClaim(
        speculative.nextState,
        {
          authorId: "artist-a", cutId: "cut-05", layerId: "layer-ink",
          strokeRect: { x: 20, y: 20, width: 80, height: 80 }, toolKind: "pen-ink", lamportClock: 21,
        },
        1050,
      );
      expect(earlierCausalArrival.granted).toBe(true);
      expect(earlierCausalArrival.preemptedLeases.map((l) => l.authorId)).toEqual(["artist-z"]);
      expect(earlierCausalArrival.nextState.activeLeases.map((l) => l.authorId)).toEqual(["artist-a"]);
    });
  });

  describe("episode-multi-agent-dag-orchestrator", () => {
    it("다중 컷 에피소드에서 storyboard -> lineart-cleanup -> flat-color 위상 순서와 동시 실행 한도를 지킨다", () => {
      let state = createEpisodeDagOrchestratorState({
        episodeId: "ep-33",
        cuts: [
          { cutId: "cut-01", maxTokens: 10000, maxComputeMs: 5000 },
          { cutId: "cut-02", maxTokens: 10000, maxComputeMs: 5000 },
        ],
      });
      const tick1 = scheduleReadyEpisodeTasks(state, 1);
      expect(tick1.dispatches).toHaveLength(1);
      expect(tick1.dispatches[0]).toMatchObject({ cutId: "cut-01", stage: "storyboard" });

      const tick2 = scheduleReadyEpisodeTasks(tick1.nextState, 2);
      expect(tick2.dispatches).toHaveLength(1);
      expect(tick2.dispatches[0]).toMatchObject({ cutId: "cut-02", stage: "storyboard" });

      state = completeEpisodeStageExecution(tick2.nextState, {
        nodeId: buildEpisodeStageNodeId("cut-01", "storyboard"),
        actualTokensUsed: 500,
        actualComputeMsUsed: 200,
      });
      const tick3 = scheduleReadyEpisodeTasks(state, 4);
      expect(tick3.dispatches.map((d) => d.nodeId)).toEqual([buildEpisodeStageNodeId("cut-01", "lineart-cleanup")]);
    });

    it("교차 컷 순환 의존성이 포함된 잘못된 DAG 입력을 초기화 시점에 즉시 거부한다", () => {
      expect(() =>
        createEpisodeDagOrchestratorState({
          episodeId: "ep-cycle",
          cuts: [
            {
              cutId: "cut-a", maxTokens: 5000, maxComputeMs: 5000,
              extraDependencies: { storyboard: [buildEpisodeStageNodeId("cut-b", "storyboard")] },
            },
            {
              cutId: "cut-b", maxTokens: 5000, maxComputeMs: 5000,
              extraDependencies: { storyboard: [buildEpisodeStageNodeId("cut-a", "storyboard")] },
            },
          ],
        }),
      ).toThrow(/Cycle detected/u);
    });

    it("파괴적 단계(shading-screentone)와 최종 단계(lettering-qa) 진입 전 인간 작가 승인 게이트를 강제한다", () => {
      let state = createEpisodeDagOrchestratorState({
        episodeId: "ep-gate",
        cuts: [{ cutId: "cut-01", maxTokens: 20000, maxComputeMs: 20000 }],
      });
      for (const autoStage of ["storyboard", "lineart-cleanup", "flat-color"] as const) {
        const tick = scheduleReadyEpisodeTasks(state, 2);
        expect(tick.dispatches.map((d) => d.stage)).toEqual([autoStage]);
        state = completeEpisodeStageExecution(tick.nextState, {
          nodeId: buildEpisodeStageNodeId("cut-01", autoStage),
          actualTokensUsed: 400,
          actualComputeMsUsed: 150,
        });
      }

      const shadeNodeId = buildEpisodeStageNodeId("cut-01", "shading-screentone");
      expect(state.nodes[shadeNodeId]?.status).toBe("awaiting-human-approval");
      expect(scheduleReadyEpisodeTasks(state, 2).dispatches).toHaveLength(0);

      state = submitHumanArtistApproval(state, {
        nodeId: shadeNodeId, artistId: "chief-artist-hj", approved: true,
        noteKo: "역광 톤 농도 확인 완료", decidedAtMs: 5000,
      });
      const shadeTick = scheduleReadyEpisodeTasks(state, 2);
      expect(shadeTick.dispatches.map((d) => d.stage)).toEqual(["shading-screentone"]);

      state = completeEpisodeStageExecution(shadeTick.nextState, {
        nodeId: shadeNodeId, actualTokensUsed: 900, actualComputeMsUsed: 400,
      });

      const qaNodeId = buildEpisodeStageNodeId("cut-01", "lettering-qa");
      expect(state.nodes[qaNodeId]?.status).toBe("awaiting-human-approval");
      expect(scheduleReadyEpisodeTasks(state, 2).dispatches).toHaveLength(0);

      state = submitHumanArtistApproval(state, {
        nodeId: qaNodeId, artistId: "chief-artist-hj", approved: true,
        noteKo: "말풍선 여백 및 오탈자 최종 승인", decidedAtMs: 6000,
      });
      expect(scheduleReadyEpisodeTasks(state, 2).dispatches.map((d) => d.stage)).toEqual(["lettering-qa"]);
    });

    it("인간 작가가 게이트를 반려(approved: false)하면 해당 컷의 하위 단계만 차단한다", () => {
      let state = createEpisodeDagOrchestratorState({
        episodeId: "ep-reject",
        cuts: [
          { cutId: "cut-01", maxTokens: 10000, maxComputeMs: 10000, extraApprovalStages: ["storyboard"] },
          { cutId: "cut-02", maxTokens: 10000, maxComputeMs: 10000 },
        ],
      });
      state = submitHumanArtistApproval(state, {
        nodeId: buildEpisodeStageNodeId("cut-01", "storyboard"),
        artistId: "lead-artist", approved: false, noteKo: "시선 유도 구도 재작업 필요", decidedAtMs: 1000,
      });

      expect(state.nodes[buildEpisodeStageNodeId("cut-01", "storyboard")]?.status).toBe("rejected-by-artist");
      expect(state.nodes[buildEpisodeStageNodeId("cut-01", "lineart-cleanup")]?.status).toBe("blocked-upstream");
      expect(scheduleReadyEpisodeTasks(state, 4).dispatches.map((d) => d.cutId)).toEqual(["cut-02"]);
    });

    it("컷별 토큰 및 연산 시간 예산(maxTokens / maxComputeMs)을 초과하는 후속 단계를 즉시 정지시킨다", () => {
      let state = createEpisodeDagOrchestratorState({
        episodeId: "ep-budget",
        cuts: [{ cutId: "cut-tight", maxTokens: 1200, maxComputeMs: 600 }],
      });
      const tick1 = scheduleReadyEpisodeTasks(state, 2);
      state = completeEpisodeStageExecution(tick1.nextState, {
        nodeId: buildEpisodeStageNodeId("cut-tight", "storyboard"),
        actualTokensUsed: 700,
        actualComputeMsUsed: 200,
      });

      expect(state.nodes[buildEpisodeStageNodeId("cut-tight", "lineart-cleanup")]?.status).toBe("halted-budget-exceeded");
      expect(state.nodes[buildEpisodeStageNodeId("cut-tight", "flat-color")]?.status).toBe("blocked-upstream");
      expect(scheduleReadyEpisodeTasks(state, 2).dispatches).toHaveLength(0);
    });

    it("단계 실패 시 재시도 한도 내에서 폴백 에이전트로 전환하고 한도 초과 시 해당 컷만 격리한다", () => {
      let state = createEpisodeDagOrchestratorState({
        episodeId: "ep-isolation",
        cuts: [
          { cutId: "cut-fragile", maxTokens: 15000, maxComputeMs: 15000, maxRetriesPerStage: 1 },
          { cutId: "cut-healthy", maxTokens: 15000, maxComputeMs: 15000, maxRetriesPerStage: 1 },
        ],
      });
      const tick1 = scheduleReadyEpisodeTasks(state, 4);
      const fragileNodeId = buildEpisodeStageNodeId("cut-fragile", "storyboard");

      state = failEpisodeStageExecution(tick1.nextState, {
        nodeId: fragileNodeId, errorReason: "Primary storyboard model timeout",
        tokensConsumed: 120, computeMsConsumed: 80,
      });
      expect(state.nodes[fragileNodeId]).toMatchObject({
        status: "ready", usingFallbackAgent: true, assignedAgentId: "agent-storyboard-lite",
      });

      const retryTick = scheduleReadyEpisodeTasks(state, 4);
      expect(retryTick.dispatches.map((d) => d.nodeId)).toEqual([fragileNodeId]);
      state = failEpisodeStageExecution(retryTick.nextState, {
        nodeId: fragileNodeId, errorReason: "Corrupted rough sketch buffer",
        tokensConsumed: 50, computeMsConsumed: 30,
      });
      expect(state.nodes[fragileNodeId]?.status).toBe("failed-isolated");
      expect(state.nodes[buildEpisodeStageNodeId("cut-fragile", "lineart-cleanup")]?.status).toBe("blocked-upstream");

      state = completeEpisodeStageExecution(state, {
        nodeId: buildEpisodeStageNodeId("cut-healthy", "storyboard"),
        actualTokensUsed: 550, actualComputeMsUsed: 210,
      });
      expect(scheduleReadyEpisodeTasks(state, 4).dispatches).toEqual([
        expect.objectContaining({ cutId: "cut-healthy", stage: "lineart-cleanup" }),
      ]);
    });

    it("결정론적 FNV-1a 체크포인트 스냅샷을 동일 다이제스트로 왕복 복원하고 변조된 스냅샷을 거부한다", () => {
      let state = createEpisodeDagOrchestratorState({
        episodeId: "ep-checkpoint",
        cuts: [{ cutId: "cut-01", maxTokens: 10000, maxComputeMs: 10000 }],
      });
      const tick = scheduleReadyEpisodeTasks(state, 1);
      state = completeEpisodeStageExecution(tick.nextState, {
        nodeId: buildEpisodeStageNodeId("cut-01", "storyboard"),
        actualTokensUsed: 580,
        actualComputeMsUsed: 230,
      });

      const snapA = createEpisodeDagCheckpoint(state, 9000);
      const snapB = createEpisodeDagCheckpoint(state, 9000);
      expect(snapA.digestHex).toBe(snapB.digestHex);
      expect(snapA).toEqual(snapB);
      expect(restoreEpisodeDagFromCheckpoint(snapA)).toEqual(state);
      expect(() => restoreEpisodeDagFromCheckpoint({ ...snapA, episodeId: "ep-tampered" })).toThrow(
        /digest mismatch/u,
      );
    });
  });
});
