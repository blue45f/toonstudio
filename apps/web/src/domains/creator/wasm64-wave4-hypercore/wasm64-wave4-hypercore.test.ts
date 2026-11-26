import { describe, expect, it } from "vitest";

import {
  ChunkAuthenticatedAssetStreamVerifier,
  MANDATORY_RELEASE_GATES,
  OnDeviceShaderPrewarmer,
  P2pBftStateValidator,
  PowerOfTwoSlabArena,
  SLAB_SIZE_CLASSES,
  SctpDeltaReassembler,
  SplitCsmDirtyTileCache,
  TOKENS_PER_KV_PAGE,
  WGSL_MESHLET_DISPLACEMENT_COMPUTE,
  WasmRendererWorkerPool,
  WebGpuVramKvPager,
  WebGpuWebAudioSabSyncBridge,
  ZeroCopyIpcRingChannel,
  ZeroFeeTimestampAuditLog,
  buildSmartCiSchedulePlan,
  buildStaticEdgeTileManifest,
  chunkDeltaForSctpChannel,
  compareVectorClocks,
  coordinateEdgeVectorClockConflict,
  createInMemoryKvBackingPool,
  createZkManuscriptCommitment,
  decodeBinaryXorRleDelta,
  dequantizeWeightBlock32,
  encodeBinaryXorRleDelta,
  encryptAssetIntoAuthenticatedChunks,
  executeQuantizedMatMulReference,
  extractWgslComplexityFeatures,
  generateCreatorAuditIdentity,
  optimizeMorphologicalSplineAsset,
  planStaticEdgeTilePrefetch,
  proveZkManuscriptOwnership,
  quantizeWeightBlock32,
  renderSubpixelRgssLineArtPreview,
  scheduleHeterogeneousComputeDag,
  sha256Hex,
  stepCapillaryInkBleed,
  stepSpatialHashParticles,
  subdivideAndDisplaceMeshlets,
  tickVectorClock,
  tuneWebGpuLlmMatMulPipeline,
  verifyAuditReceiptOffline,
  verifyZkManuscriptOwnership,
  type CiTestSuiteTiming,
  type SpatialParticle3D,
  type SplineSamplePoint,
} from "./index";

const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;
const ENCODER = new TextEncoder();

describe("Wave-4 HyperCore · 1. WebGPU LLM INT4/NF4 MatMul & PagedAttention VRAM 페이저", () => {
  it("NF4·INT4 블록 양자화 오차를 억제하고 서브그룹/폴백 WGSL 파이프라인을 튜닝한다", () => {
    const weights = new Float32Array(32);
    for (let i = 0; i < 32; i += 1) {
      weights[i] = Math.sin(i * 0.45) * 0.85;
    }

    const nf4 = quantizeWeightBlock32(weights, "nf4");
    const restoredNf4 = dequantizeWeightBlock32(nf4);
    let maxErrNf4 = 0;
    for (let i = 0; i < 32; i += 1) {
      maxErrNf4 = Math.max(maxErrNf4, Math.abs((weights[i] ?? 0) - (restoredNf4[i] ?? 0)));
    }
    expect(nf4.packedNibbles.byteLength).toBe(16);
    expect(maxErrNf4).toBeLessThan(0.12);

    const int4 = quantizeWeightBlock32(weights, "int4");
    const matOut = executeQuantizedMatMulReference(
      weights,
      1,
      1,
      32,
      int4.packedNibbles,
      new Float32Array([int4.absmaxScale]),
      "int4",
    );
    let exactDot = 0;
    for (let i = 0; i < 32; i += 1) exactDot += (weights[i] ?? 0) * (weights[i] ?? 0);
    expect(Math.abs((matOut[0] ?? 0) - exactDot)).toBeLessThan(0.45);

    const highEnd = tuneWebGpuLlmMatMulPipeline({
      subgroupsSupported: true,
      shaderF16Supported: true,
      maxComputeWorkgroupStorageSize: 32768,
      maxComputeInvocationsPerWorkgroup: 512,
      maxStorageBufferBindingSize: 256 * MiB,
    });
    expect(highEnd.useSubgroups).toBe(true);
    expect(highEnd.tileM).toBe(64);
    expect(highEnd.wgslSource).toContain("enable subgroups;");
    expect(highEnd.wgslSource).toContain("@compute @workgroup_size(16, 16, 1)");

    const mobileFallback = tuneWebGpuLlmMatMulPipeline(
      {
        subgroupsSupported: false,
        shaderF16Supported: false,
        maxComputeWorkgroupStorageSize: 8192,
        maxComputeInvocationsPerWorkgroup: 128,
        maxStorageBufferBindingSize: 128 * MiB,
      },
      "int4",
    );
    expect(mobileFallback.useSubgroups).toBe(false);
    expect(mobileFallback.wgslSource).not.toContain("enable subgroups;");
    expect(mobileFallback.bindGroupEntries.length).toBe(5);
  });

  it("1.6 GiB 엄격한 VRAM 상한 안에서 8,704토큰(8K+) 문맥을 OOM 0건·싱크 페이지 고정으로 페이징한다", () => {
    const backingPool = createInMemoryKvBackingPool();
    const capBytes = Math.round(1.6 * GiB);
    const pager = new WebGpuVramKvPager({
      vramCapBytes: capBytes,
      modelWeightsBytes: 1460 * MiB,
      activationScratchBytes: 96 * MiB,
      numLayers: 8,
      numKvHeads: 8,
      headDim: 128,
      bytesPerKvElement: 2, // 페이지당 1 MiB, 남은 KV 예산 ~82 MiB → 82 물리 페이지 (< 34*8 = 272 논리 페이지)
      pinnedSinkPages: 1,
      recentWindowPages: 3,
      backingPool,
    });

    let seqLen = 0;
    for (let step = 0; step < 17; step += 1) {
      const res = pager.appendTokens("ep-lore-8k", seqLen, 512);
      seqLen = res.newTokenLength;
    }
    expect(seqLen).toBe(8704);
    expect(Math.ceil(seqLen / TOKENS_PER_KV_PAGE)).toBe(34);

    // 중간 회상 페이지(논리 페이지 5, 12)를 다시 불러와도 싱크 페이지 0과 상한 예산이 유지된다.
    const residentWindow = pager.ensureAttentionStepResident("ep-lore-8k", seqLen, [5, 12]);
    expect(residentWindow).toContain(0);
    expect(residentWindow).toContain(5);
    expect(residentWindow).toContain(33);

    for (let layer = 0; layer < 8; layer += 1) {
      const sinkEntry = pager.getPageEntry("ep-lore-8k", layer, 0);
      expect(sinkEntry?.pinnedSink).toBe(true);
      expect(sinkEntry?.residency).toBe("vram");
    }

    const telemetry = pager.getTelemetry();
    expect(telemetry.oomEvents).toBe(0);
    expect(telemetry.peakTotalVramBytes).toBeLessThanOrEqual(capBytes);
    expect(telemetry.swapOutCount).toBeGreaterThan(0);
    expect(telemetry.swapInCount).toBeGreaterThan(0);
    expect(telemetry.serverCostKrw).toBe(0);

    pager.releaseSequence("ep-lore-8k");
    expect(pager.getTelemetry().residentPhysicalPages).toBe(0);
    expect(backingPool.countStagedPages?.()).toBe(0);
  });
});

describe("Wave-4 HyperCore · 2. P2P BFT(3f+1) 상태 검증기 & ₩0 WebCrypto 머클 타임스탬프 원장", () => {
  it("비잔틴 이중 투표(Equivocation) 및 손상된 델타를 격리하고 정직 피어 2f+1 정족수로만 확정한다", async () => {
    const validator = new P2pBftStateValidator({
      peerIds: ["peer-a", "peer-b", "peer-c", "peer-byzantine"],
      maxFaultyPeers: 1,
    });
    expect(validator.requiredQuorum).toBe(3);

    const genesis = validator.getMetrics().headDigestHex;
    const validDelta = ENCODER.encode("cut-12-stroke-op-batch");
    const validDigest = await sha256Hex(validDelta);
    const fakeDigest = await sha256Hex("malicious-fork-delta");

    // 비잔틴 피어가 동일 (epoch=1, seq=1)에 서로 다른 두 다이제스트를 투표 -> 즉시 Equivocation 적발·격리
    const vote1 = await validator.submitAttestation({
      epoch: 1,
      sequence: 1,
      peerId: "peer-byzantine",
      parentDigestHex: genesis,
      stateDeltaDigestHex: validDigest,
      timestampMs: 1000,
    });
    expect(vote1.status).toBe("vote-recorded");

    const equivVote = await validator.submitAttestation({
      epoch: 1,
      sequence: 1,
      peerId: "peer-byzantine",
      parentDigestHex: genesis,
      stateDeltaDigestHex: fakeDigest,
      timestampMs: 1005,
    });
    expect(equivVote.status).toBe("rejected-equivocation");
    expect(equivVote.equivocation?.peerId).toBe("peer-byzantine");

    // 정직 피어 3명(2f + 1 = 3)이 정당한 페이로드와 함께 서명 투표 -> 커밋 완료
    await validator.submitAttestation({
      epoch: 1,
      sequence: 1,
      peerId: "peer-a",
      parentDigestHex: genesis,
      stateDeltaDigestHex: validDigest,
      deltaPayload: validDelta,
      timestampMs: 1010,
    });
    await validator.submitAttestation({
      epoch: 1,
      sequence: 1,
      peerId: "peer-b",
      parentDigestHex: genesis,
      stateDeltaDigestHex: validDigest,
      deltaPayload: validDelta,
      timestampMs: 1012,
    });
    const commitDecision = await validator.submitAttestation({
      epoch: 1,
      sequence: 1,
      peerId: "peer-c",
      parentDigestHex: genesis,
      stateDeltaDigestHex: validDigest,
      deltaPayload: validDelta,
      timestampMs: 1015,
    });

    expect(commitDecision.status).toBe("quorum-committed");
    expect(validator.getMetrics().committedSequence).toBe(1);
    expect(validator.getMetrics().quarantinedPeers).toEqual(["peer-byzantine"]);
  });

  it("가스비 ₩0 WebCrypto 서명 + SHA-256 해시체인 + 머클 에포크 오프라인 영수증을 검증하고 1비트 변조를 거부한다", async () => {
    const creator = await generateCreatorAuditIdentity("creator-hana");
    const log = new ZeroFeeTimestampAuditLog();

    for (let i = 0; i < 5; i += 1) {
      await log.appendRevision({
        identity: creator,
        manuscriptId: "ep-42",
        contentBytes: ENCODER.encode(`manuscript-revision-${i}`),
        metadataSummary: `컷 ${i + 1} 펜선 확정`,
        timestampIso: `2026-11-26T18:0${i}:00.000Z`,
      });
    }

    expect(await log.verifyHashChainIntegrity()).toBe(true);
    const epoch = await log.sealMerkleEpoch({
      epochId: "epoch-20261126-01",
      identity: creator,
    });
    expect(epoch.gasFeeKrw).toBe(0);
    expect(epoch.entryCount).toBe(5);

    const receipt = await log.exportOfflineReceipt(3, epoch, creator.publicKeyJwk);
    const verified = await verifyAuditReceiptOffline(receipt);
    expect(verified).toEqual({ valid: true, reason: "ok" });

    // 메타데이터 변조 시 즉시 실패
    const tamperedReceipt = {
      ...receipt,
      entry: { ...receipt.entry, metadataSummary: "위조된 시각" },
    };
    const tamperedCheck = await verifyAuditReceiptOffline(tamperedReceipt);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.reason).toBe("entry-hash-mismatch");
  });
});

describe("Wave-4 HyperCore · 3. 비동기 WASM 워커 풀 · 2^k 슬랩 아레나 · 제로카피 IPC 링", () => {
  it("64B..64KiB 슬랩 O(1) 대여/반납 무누수, 제로카피 링 전송, Work-Stealing·배압·장애 워커 재생성을 수행한다", async () => {
    const arena = new PowerOfTwoSlabArena({ slotsPerClass: 8 });
    expect(SLAB_SIZE_CLASSES[0]).toBe(64);
    expect(SLAB_SIZE_CLASSES[SLAB_SIZE_CLASSES.length - 1]).toBe(65536);

    const h1 = arena.alloc(100);
    const h2 = arena.alloc(30_000);
    expect(h1?.blockBytes).toBe(128);
    expect(h2?.blockBytes).toBe(32768);
    expect(arena.getTelemetry().internalFragmentationRatio).toBeGreaterThan(0);
    expect(arena.free(h1!)).toBe(true);
    expect(arena.free(h1!)).toBe(false); // 이중 해제 차단
    expect(arena.free(h2!)).toBe(true);
    expect(arena.getTelemetry().activeAllocations).toBe(0);

    const ring = new ZeroCopyIpcRingChannel(8);
    expect(
      ring.tryEnqueue({
        taskId: 7,
        byteOffset: 128,
        byteLength: 96,
        classIndex: 1,
        priorityCode: 0,
        flags: 1,
        checksum: 12345,
      }),
    ).toBe(true);
    expect(ring.tryDequeue()?.taskId).toBe(7);

    // 워커 0번이 첫 실행(generation 1)에서 두 번 연속 실패하도록 주입해 자동 교체(recycle) 및 재시도를 검증한다.
    let worker0FlakyCalls = 0;
    const pool = new WasmRendererWorkerPool({
      workerCount: 3,
      maxQueuedTasks: 6,
      maxConsecutiveFailures: 1,
      createWorker: (workerId, generation) => ({
        workerId,
        generation,
        executeDescriptor: async (desc, slabView) => {
          if (workerId === 0 && generation === 1 && worker0FlakyCalls < 1) {
            worker0FlakyCalls += 1;
            throw new Error("simulated wasm trap");
          }
          // 워커 1번을 약간 지연시켜 유휴 워커가 작업을 훔쳐 가도록 유도한다.
          if (workerId === 1) {
            await new Promise((r) => setTimeout(r, 12));
          }
          let sum = 0;
          for (let i = 0; i < desc.byteLength; i += 1) {
            sum = (sum + (slabView[desc.byteOffset + i] ?? 0)) >>> 0;
          }
          return { outputChecksum: sum, healthy: true };
        },
      }),
    });

    const tasks = Array.from({ length: 6 }, (_, idx) =>
      pool.submitTileTask({
        taskId: idx + 1,
        priority: idx % 2 === 0 ? "critical" : "interactive",
        payload: new Uint8Array(256).fill(idx + 3),
      }),
    );

    // maxQueuedTasks(6) 초과 7번째 즉시 제출 -> 배압 거절 확인
    await expect(
      pool.submitTileTask({
        taskId: 99,
        priority: "background",
        payload: new Uint8Array(128).fill(1),
      }),
    ).rejects.toThrow(/배압/);

    const results = await Promise.all(tasks);
    expect(results.length).toBe(6);
    const poolStats = pool.getTelemetry();
    expect(poolStats.completedTasks).toBe(6);
    expect(poolStats.recycledWorkers).toBeGreaterThanOrEqual(1);
    expect(poolStats.backpressureRejections).toBe(1);
    expect(poolStats.slab.activeAllocations).toBe(0);
  });
});

describe("Wave-4 HyperCore · 4. SAB WebGPU↔WebAudio PLL 브리지 & 온디바이스 Ridge 셰이더 프리워머", () => {
  it("48kHz 오디오 샘플과 120Hz WebGPU 프레임 위상을 동기화하고 프레임 예산 내에서 WGSL을 선행 컴파일한다", async () => {
    const sync = new WebGpuWebAudioSabSyncBridge({ sampleRateHz: 48_000, targetFps: 120 });
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    for (let i = 0; i < 128; i += 1) {
      const s = Math.sin((i / 128) * Math.PI * 2) * 0.5;
      left[i] = s;
      right[i] = s;
    }

    const rms = sync.publishAudioQuantum(left, right, 48_000 - 128); // 정확히 1.0초 지점 도달
    expect(rms).toBeGreaterThan(0.3);

    const phase = sync.latchGpuFramePhase(0.998); // 2ms 지연 시뮬레이션
    expect(phase.audioSamplePosition).toBe(48_000);
    expect(phase.phaseErrorMs).toBeCloseTo(2.0, 2);
    expect(phase.gpuFrameIndex).toBe(119);
    expect(phase.beatEnvelopeRms).toBeGreaterThan(0.3);

    const simpleWgsl = "@compute @workgroup_size(64) fn main() { let a = 1.0 + 2.0; }";
    const heavyWgsl = [
      "enable f16;",
      "@group(0) @binding(0) var<storage, read_write> buf: array<f32>;",
      "@compute @workgroup_size(16, 16, 1)",
      "fn main() {",
      "  for (var i = 0; i < 64; i++) {",
      "    if (i > 4) { let v = sin(1.0) * cos(2.0) + sqrt(3.0) + textureLoad(t, 0); }",
      "  }",
      "}",
    ].join("\n");

    expect(extractWgslComplexityFeatures(heavyWgsl).workgroupThreads).toBe(256);
    const prewarmer = new OnDeviceShaderPrewarmer({
      compilePipeline: async (spec) => (spec.shaderId === "heavy" ? 3.2 : 0.9),
    });
    expect(prewarmer.predictCompileMs(heavyWgsl)).toBeGreaterThan(
      prewarmer.predictCompileMs(simpleWgsl),
    );

    const slice = await prewarmer.schedulePrewarmSlice(
      [
        { shaderId: "brush-fast", wgslSource: simpleWgsl, kind: "compute", usageProbability: 0.95, deadlineFrames: 2 },
        { shaderId: "heavy", wgslSource: heavyWgsl, kind: "compute", usageProbability: 0.4, deadlineFrames: 12 },
      ],
      3.0, // 3.0ms 예산 -> 가벼운 브러시 셰이더만 컴파일되고 무거운 셰이더는 다음 유휴 슬라이스로 이월
    );
    expect(slice.compiledShaderIds).toContain("brush-fast");
    expect(slice.spentMs).toBeLessThanOrEqual(3.0);
    expect(prewarmer.getCompiled("brush-fast")).not.toBeNull();
  });
});

describe("Wave-4 HyperCore · 5. 스플라인 최적화 · 정적 타일 프리페치 · RGSS 선화 · WebRTC 델타 & ZK 소유권", () => {
  it("모폴로지 스플라인 압축, ₩0 정적 타일 속도 원뿔 프리페치, 4× RGSS·LCD RGB 선화 렌더링을 수행한다", () => {
    const rawPts: SplineSamplePoint[] = [];
    for (let i = 0; i < 80; i += 1) {
      const t = i / 79;
      const spike = i === 25 ? 9.5 : i === 50 ? 0.4 : 0; // 고립된 스타일러스 압력 노이즈 스파이크
      rawPts.push({
        x: t * 300,
        y: Math.sin(t * Math.PI) * 40,
        widthPx: spike > 0 ? spike : 3.2,
      });
    }
    const opt = optimizeMorphologicalSplineAsset(rawPts, 0.5);
    expect(opt.compressionRatioPct).toBeGreaterThan(60);
    expect(opt.widthJitterReductionPct).toBeGreaterThan(50);
    expect(opt.maxPositionErrorPx).toBeLessThan(1.2);

    const manifest = buildStaticEdgeTileManifest({
      documentId: "ep10",
      tileSizePx: 256,
      tiles: [
        { mipLevel: 0, tileX: 0, tileY: 0, payload: new Uint8Array(1024).fill(1) },
        { mipLevel: 0, tileX: 1, tileY: 0, payload: new Uint8Array(1024).fill(2) },
        { mipLevel: 0, tileX: 3, tileY: 0, payload: new Uint8Array(1024).fill(3) },
        { mipLevel: 1, tileX: 0, tileY: 0, payload: new Uint8Array(512).fill(4) },
      ],
    });
    expect(manifest.originComputeCostKrw).toBe(0);

    const plan = planStaticEdgeTilePrefetch(manifest, {
      centerX: 128,
      centerY: 128,
      viewportWidth: 256,
      viewportHeight: 256,
      velocityXPerSec: 1800, // 우측 고속 팬 -> tileX=3 속도 원뿔 프리페치 포착
      velocityYPerSec: 0,
      desiredMipLevel: 0,
      lookaheadSec: 0.45,
    });
    expect(plan[0]?.tier).toBe("viewport-visible");
    expect(plan.some((p) => p.tier === "velocity-cone")).toBe(true);

    const preview = renderSubpixelRgssLineArtPreview({
      width: 48,
      height: 48,
      strokes: [{ x0: 6, y0: 8, x1: 42, y1: 40, halfWidthPx: 1.1 }],
      subpixelMode: "lcd-rgb",
    });
    expect(preview.inkPixelCount).toBeGreaterThan(40);
    expect(preview.colorFringeMaxDelta).toBeLessThan(95); // 5탭 에너지 균형 필터로 무지개 번짐 억제
  });

  it("WebRTC SCTP XOR-RLE 델타 재조립·벡터 클록 병합과 무서버 Fiat-Shamir Schnorr 영지식 소유권 증명을 검증한다", async () => {
    const baseState = new Uint8Array(40_000).fill(42);
    const nextState = new Uint8Array(baseState);
    nextState.set([99, 100, 101, 102], 12_345);

    const delta = encodeBinaryXorRleDelta(baseState, nextState);
    expect(delta.byteLength).toBeLessThan(baseState.byteLength / 50);

    const frames = chunkDeltaForSctpChannel(101, delta, 64);
    const reassembler = new SctpDeltaReassembler();
    let reassembled: Uint8Array | null = null;
    // 역순 도착 시뮬레이션
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      reassembled = reassembler.pushFrame(frames[i]!.frameBytes);
    }
    expect(reassembled).not.toBeNull();
    expect(decodeBinaryXorRleDelta(baseState, reassembled!)).toEqual(nextState);

    let clockA = tickVectorClock({}, "artist-a");
    const clockB = tickVectorClock({}, "artist-b");
    expect(compareVectorClocks(clockA, clockB)).toBe("concurrent");
    const resolved = coordinateEdgeVectorClockConflict(
      { peerId: "artist-a", clock: clockA, wallTimeMs: 1000, stateDigestHex: "aa", state: "draft-a" },
      { peerId: "artist-b", clock: clockB, wallTimeMs: 1020, stateDigestHex: "bb", state: "draft-b" },
    );
    expect(resolved.hadConcurrentConflict).toBe(true);
    expect(resolved.winningState).toBe("draft-b");
    clockA = tickVectorClock(resolved.mergedClock, "artist-a");
    expect(compareVectorClocks(resolved.mergedClock, clockA)).toBe("before");

    // Fiat-Shamir Schnorr 비대화형 영지식 증명(NIZKPoK): 비밀 시드 노출 없이 소유권 증명
    const manuscriptBytes = ENCODER.encode("미공개 오리지널 1화 콘티 원고 본문");
    const secretSeed = "author-private-master-seed-2026-keep-local";
    const commitment = await createZkManuscriptCommitment({
      manuscriptId: "work-777-ep1",
      manuscriptBytes,
      secretAuthorSeed: secretSeed,
    });
    const challengeNonce = "verifier-random-challenge-987654";
    const proof = await proveZkManuscriptOwnership({
      manuscriptId: "work-777-ep1",
      manuscriptBytes,
      secretAuthorSeed: secretSeed,
      verifierChallengeNonce: challengeNonce,
    });

    expect(JSON.stringify(proof)).not.toContain(secretSeed);
    const okVerify = await verifyZkManuscriptOwnership(commitment, proof, challengeNonce);
    expect(okVerify).toEqual({ valid: true, reason: "ok" });

    // 다른 공격자 시드로 생성한 증명은 공개 커밋먼트 검증에서 100% 거절된다.
    const attackerProof = await proveZkManuscriptOwnership({
      manuscriptId: "work-777-ep1",
      manuscriptBytes,
      secretAuthorSeed: "impostor-wrong-seed",
      verifierChallengeNonce: challengeNonce,
    });
    const badVerify = await verifyZkManuscriptOwnership(
      commitment,
      { ...attackerProof, publicCommitmentYHex: commitment.publicCommitmentYHex },
      challengeNonce,
    );
    expect(badVerify.valid).toBe(false);

    // 이전 증명을 다른 챌린지 논스에 재사용(Replay)하면 즉시 거절된다.
    const replayVerify = await verifyZkManuscriptOwnership(commitment, proof, "different-nonce");
    expect(replayVerify.valid).toBe(false);
  });
});

describe("Wave-4 HyperCore · 6. 스마트 CI 경로 필터·LPT 샤드 & 7. 하이브리드 DAG·AEAD·CSM·잉크·컴퓨트 메시렛", () => {
  it("문서·단일 도메인 PR에서도 필수 게이트(core+verify)를 100% 유지하면서 LPT 샤드 균형과 러너 절감을 계산한다", () => {
    const suites: readonly CiTestSuiteTiming[] = [
      { suiteId: "s1", domainPackage: "apps/web", estimatedDurationMs: 9000, testCount: 40 },
      { suiteId: "s2", domainPackage: "apps/web", estimatedDurationMs: 8000, testCount: 35 },
      { suiteId: "s3", domainPackage: "apps/web", estimatedDurationMs: 6000, testCount: 28 },
      { suiteId: "s4", domainPackage: "apps/web", estimatedDurationMs: 5000, testCount: 22 },
      { suiteId: "s5", domainPackage: "apps/web", estimatedDurationMs: 4000, testCount: 18 },
      { suiteId: "s6", domainPackage: "apps/api", estimatedDurationMs: 11000, testCount: 50 },
    ];

    const docsOnlyPlan = buildSmartCiSchedulePlan({
      changedFiles: ["docs/technology/engineering-atlas.md"],
      suites,
      shardCount: 3,
    });
    for (const mandatory of MANDATORY_RELEASE_GATES) {
      expect(docsOnlyPlan.selectedWorkflows).toContain(mandatory);
    }
    expect(docsOnlyPlan.mandatoryGatesPreserved).toBe(true);
    expect(docsOnlyPlan.skippedWorkflows).toContain("market-playwright-e2e");
    expect(docsOnlyPlan.savedRunnerMinutes).toBeGreaterThan(40);

    const webPlan = buildSmartCiSchedulePlan({
      changedFiles: ["apps/web/src/domains/creator/StudioCanvasViewport.tsx"],
      suites,
      shardCount: 3,
    });
    expect(webPlan.selectedWorkflows).toContain("core");
    expect(webPlan.selectedWorkflows).toContain("verify");
    expect(webPlan.selectedWorkflows).toContain("web-studio-unit");
    expect(webPlan.skippedWorkflows).toContain("api-postgres-integration");
    expect(webPlan.shardImbalanceRatio).toBeLessThanOrEqual(1.25);
  });

  it("이기종 DAG 스케줄러, AEAD 스트림 오염 차단, Split CSM 캐시, 모세관 잉크·공간해시 입자, 수밀 메시렛 세분화를 검증한다", async () => {
    // 1) 하이브리드 WebGPU + WASM64 컴퓨트 DAG 스케줄러
    const dag = scheduleHeterogeneousComputeDag([
      { nodeId: "parse-bezier", dependsOn: [], outputBytes: 64 * 1024, wasmSimdExecMs: 0.4, webgpuExecMs: 1.2 },
      { nodeId: "sdf-raster-4k", dependsOn: ["parse-bezier"], outputBytes: 4 * MiB, wasmSimdExecMs: 14.0, webgpuExecMs: 1.5 },
      { nodeId: "cel-lighting", dependsOn: ["sdf-raster-4k"], outputBytes: 4 * MiB, wasmSimdExecMs: 11.0, webgpuExecMs: 1.1 },
    ]);
    expect(dag.orderedTasks[0]?.assignedTarget).toBe("wasm64-simd");
    expect(dag.orderedTasks[1]?.assignedTarget).toBe("webgpu-compute");
    expect(dag.orderedTasks[2]?.assignedTarget).toBe("webgpu-compute");
    expect(dag.speedupOverPureWasm).toBeGreaterThan(5);

    // 2) 청크 인증 AEAD(AES-256-GCM + 머클 스트림) P2P 검증기: 중간 오염 청크를 쓰기 전에 거절
    const aesKey = await globalThis.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const largeAsset = new Uint8Array(6000);
    for (let i = 0; i < largeAsset.length; i += 1) largeAsset[i] = i & 0xff;
    const sealed = await encryptAssetIntoAuthenticatedChunks({
      assetId: "stage-cathedral-glb",
      assetBytes: largeAsset,
      aesKey,
      chunkSizeBytes: 2048,
    });
    expect(sealed.chunks.length).toBe(3);

    const writtenChunks: Uint8Array[] = [];
    const verifier = new ChunkAuthenticatedAssetStreamVerifier(sealed.manifest, aesKey, {
      writeVerifiedChunk: (_idx, plain) => {
        writtenChunks.push(plain);
      },
    });
    expect((await verifier.ingestChunk(sealed.chunks[0]!)).accepted).toBe(true);

    // 2번째 청크 암호문 1바이트 오염 공격 -> OPFS 기록 전 즉시 거절
    const poisonedBytes = new Uint8Array(sealed.chunks[1]!.ciphertextWithTag);
    poisonedBytes[5] = (poisonedBytes[5] ?? 0) ^ 0xff;
    const poisonedRes = await verifier.ingestChunk({
      ...sealed.chunks[1]!,
      ciphertextWithTag: poisonedBytes,
    });
    expect(poisonedRes.accepted).toBe(false);
    expect(poisonedRes.reason).toBe("aead-tag-rejected");
    expect(writtenChunks.length).toBe(1); // 오염 청크는 단 1바이트도 기록되지 않음!

    // 정당한 청크 1, 2 재전송 시 스트림 정상 완료
    expect((await verifier.ingestChunk(sealed.chunks[1]!)).accepted).toBe(true);
    const finalRes = await verifier.ingestChunk(sealed.chunks[2]!);
    expect(finalRes).toEqual({ accepted: true, streamCompleted: true, reason: "ok" });
    expect(writtenChunks.length).toBe(3);

    // 3) 정적/동적 분리 캐스케이드 그림자 맵(Split CSM) 더티 타일 캐시
    const csm = new SplitCsmDirtyTileCache([
      { cascadeIndex: 0, worldMinX: -5, worldMinZ: -5, worldMaxX: 5, worldMaxZ: 5, tilesPerAxis: 4 },
      { cascadeIndex: 1, worldMinX: -20, worldMinZ: -20, worldMaxX: 20, worldMaxZ: 20, tilesPerAxis: 4 },
      { cascadeIndex: 2, worldMinX: -80, worldMinZ: -80, worldMaxX: 80, worldMaxZ: 80, tilesPerAxis: 4 },
      { cascadeIndex: 3, worldMinX: -300, worldMinZ: -300, worldMaxX: 300, worldMaxZ: 300, tilesPerAxis: 4 },
    ]);
    // 첫 프레임: 광원 초기화 전체 빌드
    expect(csm.planShadowFrame([0.3, -0.9, 0.2], []).lightMoved).toBe(true);
    // 두 번째 프레임: 근거리 캐릭터 팔 본만 이동(원거리 배경 전용 영역 밖 혹은 국소 타일만 갱신)
    const csmFrame2 = csm.planShadowFrame(
      [0.3, -0.9, 0.2],
      [
        {
          boneId: "right-hand",
          prevMinX: 0.2,
          prevMinZ: 0.2,
          prevMaxX: 0.6,
          prevMaxZ: 0.6,
          nextMinX: 0.4,
          nextMinZ: 0.3,
          nextMaxX: 0.8,
          nextMaxZ: 0.7,
        },
      ],
    );
    expect(csmFrame2.lightMoved).toBe(false);
    expect(csmFrame2.tileSavingsPct).toBeGreaterThan(85);

    // 원거리 정적 캐스케이드(cascade 2, 3) 밖에서만 움직이는 근접 전용 소형 캐스케이드 테스트
    const disjointCsm = new SplitCsmDirtyTileCache([
      { cascadeIndex: 0, worldMinX: 0, worldMinZ: 0, worldMaxX: 10, worldMaxZ: 10, tilesPerAxis: 4 },
      { cascadeIndex: 1, worldMinX: 20, worldMinZ: 20, worldMaxX: 100, worldMaxZ: 100, tilesPerAxis: 4 },
    ]);
    disjointCsm.planShadowFrame([0, -1, 0], []);
    const partialPlan = disjointCsm.planShadowFrame(
      [0, -1, 0],
      [
        {
          boneId: "hero-spine",
          prevMinX: 1,
          prevMinZ: 1,
          prevMaxX: 2,
          prevMaxZ: 2,
          nextMinX: 1.5,
          nextMinZ: 1.5,
          nextMaxX: 2.5,
          nextMaxZ: 2.5,
        },
      ],
    );
    expect(partialPlan.skippedCascadeIndices).toEqual([1]);

    // 4) 모세관 잉크 번짐 질량 보존 + 3D 공간 해시 입자 충돌 솔버
    const pigment = new Float32Array(25);
    const water = new Float32Array(25);
    pigment[12] = 10.0;
    water[12] = 0.95;
    const inkStep = stepCapillaryInkBleed({ width: 5, height: 5, pigmentMass: pigment, waterSaturation: water });
    expect(inkStep.totalMassAfter).toBeCloseTo(inkStep.totalMassBefore, 5);
    expect(pigment[13]).toBeGreaterThan(pigment[17] ?? 0); // 가로 섬유 이방성으로 좌우 번짐이 상하보다 큼

    const particles: SpatialParticle3D[] = [
      { x: -0.4, y: 0, z: 0, vx: 5, vy: 0, vz: 0, radius: 0.5, mass: 1 },
      { x: 0.4, y: 0, z: 0, vx: -5, vy: 0, vz: 0, radius: 0.5, mass: 1 },
    ];
    const col = stepSpatialHashParticles(particles, 0.02, 1.0, 0.9);
    expect(col.resolvedCollisions).toBe(1);
    expect(particles[0]!.vx).toBeLessThan(0);
    expect(particles[1]!.vx).toBeGreaterThan(0);

    // 5) WebGPU 컴퓨트 메시렛 수밀(Watertight) 동적 변위 세분화기 (정팔면체 닫힌 매니폴드 입력)
    expect(WGSL_MESHLET_DISPLACEMENT_COMPUTE).toContain("@compute @workgroup_size(64, 1, 1)");
    const octaPositions = new Float32Array([
      1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1,
    ]);
    const octaIndices = new Uint32Array([
      0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5,
    ]);
    const meshletOut = subdivideAndDisplaceMeshlets({
      basePositions: octaPositions,
      baseIndices: octaIndices,
      subdivisionLevels: 2,
      maxMeshletVertices: 32,
      maxMeshletTriangles: 32,
    });
    expect(meshletOut.triangleCount).toBe(8 * 16); // 2단계 1->4 세분화 = 128 삼각형
    expect(meshletOut.openBoundaryEdges).toBe(0); // 균열 0개 완전 수밀 매니폴드!
    expect(meshletOut.meshlets.length).toBeGreaterThanOrEqual(4);
  });
});
