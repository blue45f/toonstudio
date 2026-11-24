// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  AdaptiveLodGovernor,
  CANARY_TELEMETRY_PRESETS,
  FRAME_BUDGET_MS_BY_HZ,
  GPU_TIER_PROFILES,
  P2pCrdtDeltaMesh,
  StudioWebGpuNextgenRuntimePanel,
  ZeroCopyTileRingBus,
  compactCrdtOperations,
  computeCrc32,
  computeFnv1a32,
  computeProjectedScreenSpaceErrorPx,
  createDefaultWebtoonSceneAssets,
  decodeCrdtDeltaPacket,
  encodeCrdtDeltaPacket,
  evaluateAssetFrustumVisibility,
  evaluateCanaryReleaseHealth,
  runP2pMeshConvergenceScenario,
  runZeroCopyTileRingBenchmark,
  type CrdtSyncOperation,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  useI18n.setState({ lang: "ko" });
});

describe("1. Zero-Copy Linear Memory & SharedArrayBuffer Ring-Buffer Tile Bus", () => {
  it("IEEE 802.3 CRC32 및 FNV-1a 32-bit 표준 테스트 벡터('123456789')가 결정론적으로 일치한다", () => {
    const vector = new TextEncoder().encode("123456789");
    expect(computeCrc32(vector)).toBe(0xcbf43926);
    expect(computeFnv1a32(vector)).toBe(0xbb86b11c);
  });

  it("SharedArrayBuffer 및 ArrayBuffer 양쪽 백킹에서 subarray 제로카피 뷰와 래핑(wrap-around) FIFO를 보장한다", () => {
    for (const backingMode of ["shared", "arraybuffer"] as const) {
      const bus = new ZeroCopyTileRingBus({
        slotCount: 4,
        tileWidth: 16,
        tileHeight: 16,
        backingMode,
      });

      if (typeof SharedArrayBuffer === "function" && backingMode === "shared") {
        expect(bus.backingMode).toBe("shared-array-buffer");
        expect(bus.atomicsEnabled).toBe(true);
      } else {
        expect(bus.backingMode).toBe("array-buffer");
      }

      const payloadBytes = 16 * 16 * 4;
      // 4슬롯 링을 3회전(12프레임) 시켜 래핑 인덱스·제로카피·무결성 일괄 검증
      for (let frame = 1; frame <= 12; frame += 1) {
        const writeRes = bus.writeTileInPlace(
          { frameId: frame, tileX: frame & 3, tileY: frame >>> 2, layerId: 2 },
          payloadBytes,
          (slotView) => {
            expect(bus.isZeroCopyView(slotView)).toBe(true);
            slotView.fill((frame * 17) & 0xff);
          },
        );
        expect(writeRes.ok).toBe(true);
        expect(writeRes.zeroCopyBufferReuse).toBe(true);

        const readRes = bus.consumeTileZeroCopy();
        expect(readRes.ok).toBe(true);
        expect(readRes.status).toBe("ok");
        expect(readRes.frameId).toBe(frame);
        expect(readRes.zeroCopyBufferReuse).toBe(true);
        expect(bus.isZeroCopyView(readRes.payloadView)).toBe(true);
        expect(readRes.payloadView?.[0]).toBe((frame * 17) & 0xff);
      }

      const telemetry = bus.getTelemetrySnapshot();
      expect(telemetry.pendingSlots).toBe(0);
      expect(telemetry.checksumMismatchCount).toBe(0);
      expect(telemetry.droppedOverflowCount).toBe(0);
    }
  });

  it("링버퍼 포화 오버플로우·1비트 변조 탐지·메모리 압박 풀 회수가 결정론적으로 동작한다", () => {
    const bus = new ZeroCopyTileRingBus({
      slotCount: 8,
      tileWidth: 16,
      tileHeight: 16,
      backingMode: "arraybuffer",
      highWaterRatio: 0.75,
      targetWaterRatio: 0.5,
    });
    const payloadBytes = 16 * 16 * 4;

    // 8슬롯 가득 채우기 + 9번째 오버플로우 확인
    for (let i = 1; i <= 8; i += 1) {
      const res = bus.writeTileInPlace(
        { frameId: i, tileX: i, tileY: 0, layerId: 1 },
        payloadBytes,
        (view) => view.fill(i * 11),
      );
      expect(res.ok).toBe(true);
    }
    const overflow = bus.writeTileInPlace(
      { frameId: 9, tileX: 9, tileY: 0, layerId: 1 },
      payloadBytes,
      (view) => view.fill(99),
    );
    expect(overflow.ok).toBe(false);
    expect(overflow.status).toBe("ring-full");
    expect(bus.getTelemetrySnapshot().pressureLevel).toBe("critical");

    // 메모리 압박 풀 회수 -> 8슬롯(100%)에서 목표 4슬롯(50%)으로 4슬롯 회수
    const reclaim = bus.reclaimUnderMemoryPressure({ zeroReclaimedPayload: true });
    expect(reclaim.triggered).toBe(true);
    expect(reclaim.reclaimedSlots).toBe(4);
    expect(reclaim.remainingPendingSlots).toBe(4);
    expect(reclaim.pressureLevelAfter).toBe("normal");
    expect(reclaim.epochGeneration).toBe(2);

    // 남은 첫 슬롯(frameId=5, slotIndex=4)에 1비트 변조 주입 -> CRC32/FNV-1a가 즉시 차단
    expect(bus.injectSingleBitFlip(4, 12)).toBe(true);
    const corrupted = bus.consumeTileZeroCopy();
    expect(corrupted.ok).toBe(false);
    expect(corrupted.status).toBe("checksum-mismatch");
    expect(corrupted.expectedChecksums?.crc32).not.toBe(corrupted.actualChecksums?.crc32);
    expect(bus.getTelemetrySnapshot().checksumMismatchCount).toBe(1);
  });

  it("제로카피 vs 복사 할당 벤치마크가 핫패스 힙 할당 0건·100% 절감·변조 탐지를 리포트한다", () => {
    const clean = runZeroCopyTileRingBenchmark({
      tileSize: 64,
      frameCount: 32,
      slotCount: 16,
      backingMode: "arraybuffer",
    });
    expect(clean.zeroCopyHeapAllocations).toBe(0);
    expect(clean.copyAllocHeapAllocations).toBe(64);
    expect(clean.allocationReductionPct).toBe(100);
    expect(clean.verifiedFrames).toBe(32);
    expect(clean.checksumMismatchCount).toBe(0);
    expect(clean.allViewsZeroCopyVerified).toBe(true);

    const faulty = runZeroCopyTileRingBenchmark({
      tileSize: 64,
      frameCount: 16,
      injectCorruptionAtFrame: 7,
    });
    expect(faulty.checksumMismatchCount).toBe(1);
    expect(faulty.verifiedFrames).toBe(15);

    const edgeBus = new ZeroCopyTileRingBus({ slotCount: 4, tileWidth: 8, tileHeight: 8 });
    expect(edgeBus.consumeTileZeroCopy().status).toBe("empty");
    const oversize = edgeBus.enqueueTileBytes(
      { frameId: 1, tileX: 0, tileY: 0, layerId: 0 },
      new Uint8Array(8 * 8 * 4 + 4),
    );
    expect(oversize.ok).toBe(false);
    expect(oversize.status).toBe("payload-too-large");
    const exactOk = edgeBus.enqueueTileBytes(
      { frameId: 2, tileX: 1, tileY: 1, layerId: 0 },
      new Uint8Array(8 * 8 * 4).fill(42),
    );
    expect(exactOk.ok).toBe(true);
    const consumed = edgeBus.consumeTileZeroCopy();
    expect(consumed.ok).toBe(true);
    expect(consumed.payloadView?.[0]).toBe(42);
  });
});

describe("2. Adaptive Screen-Space 3D LOD & Frustum Budget Governor", () => {
  it("투영 스크린-스페이스 픽셀 오차 공식이 거리·FOV·해상도에 대해 정확히 단조 반응한다", () => {
    const nearErr = computeProjectedScreenSpaceErrorPx({
      geometricErrorM: 0.01,
      distanceM: 5,
      boundingRadiusM: 1,
      fovDeg: 60,
      viewportHeightPx: 1080,
    });
    const farErr = computeProjectedScreenSpaceErrorPx({
      geometricErrorM: 0.01,
      distanceM: 21,
      boundingRadiusM: 1,
      fovDeg: 60,
      viewportHeightPx: 1080,
    });
    // effectiveDistance 4m vs 20m -> 정확히 5배 차이
    expect(nearErr / farErr).toBeCloseTo(5, 5);

    const highResErr = computeProjectedScreenSpaceErrorPx({
      geometricErrorM: 0.01,
      distanceM: 5,
      boundingRadiusM: 1,
      fovDeg: 60,
      viewportHeightPx: 2160,
    });
    expect(highResErr / nearErr).toBeCloseTo(2, 5);
  });

  it("절두체 후방 에셋을 컬링하고 mobile-low 120Hz(<=8.33ms) 및 60Hz(<=16.67ms) 예산을 엄격히 클램핑한다", () => {
    const assets = createDefaultWebtoonSceneAssets();
    const camera = {
      position: [0, 0.2, 0] as const,
      forward: [0, 0, -1] as const,
      fovDeg: 50,
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
      nearPlaneM: 0.1,
      farPlaneM: 120,
    };

    const rearAsset = assets.find((a) => a.id === "rear-corridor-prop");
    expect(rearAsset).toBeDefined();
    if (rearAsset) {
      expect(evaluateAssetFrustumVisibility(rearAsset, camera).inFrustum).toBe(false);
    }

    const mobileGov60 = new AdaptiveLodGovernor();
    const mobile60 = mobileGov60.evaluateFrame({
      assets,
      camera,
      gpuTier: "mobile-low",
      targetFps: 60,
    });
    expect(mobile60.frameBudgetMs).toBe(FRAME_BUDGET_MS_BY_HZ[60]);
    expect(mobile60.withinFrameBudget).toBe(true);
    expect(mobile60.withinTriangleBudget).toBe(true);
    expect(mobile60.withinVramBudget).toBe(true);
    expect(mobile60.totalTriangles).toBeLessThanOrEqual(GPU_TIER_PROFILES["mobile-low"].maxTriangles60Hz);

    const mobileGov120 = new AdaptiveLodGovernor();
    const mobile120 = mobileGov120.evaluateFrame({
      assets,
      camera,
      gpuTier: "mobile-low",
      targetFps: 120,
    });
    expect(mobile120.frameBudgetMs).toBe(FRAME_BUDGET_MS_BY_HZ[120]);
    expect(mobile120.withinFrameBudget).toBe(true);
    expect(mobile120.estimatedFrameMs).toBeLessThanOrEqual(8.33);
    expect(mobile120.clampedAssetIds.length).toBeGreaterThan(0);

    const desktopGov60 = new AdaptiveLodGovernor();
    const desktop60 = desktopGov60.evaluateFrame({
      assets,
      camera,
      gpuTier: "desktop-pro",
      targetFps: 60,
    });
    expect(desktop60.withinFrameBudget).toBe(true);
    expect(desktop60.totalTriangles).toBeGreaterThan(mobile120.totalTriangles);
  });

  it("히스테리시스 데드밴드가 LOD 경계 거리 왕복 떨림에서 팝핑 전환을 0회로 억제한다", () => {
    const heroAsset = createDefaultWebtoonSceneAssets()[0];
    expect(heroAsset).toBeDefined();
    if (!heroAsset) return;

    const governor = new AdaptiveLodGovernor({ hysteresisBandRatio: 0.2, minDwellFrames: 2 });
    const baseCamera = {
      forward: [0, 0, -1] as const,
      fovDeg: 50,
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
      nearPlaneM: 0.1,
      farPlaneM: 120,
    };

    // LOD1/LOD2 경계 부근 거리에서 초기 프레임 고정
    const init = governor.evaluateFrame({
      assets: [heroAsset],
      camera: { ...baseCamera, position: [0, 0, 10.0] },
      gpuTier: "tablet-mid",
      targetFps: 60,
    });
    const baselineLod = init.decisions[0]?.selectedLod;
    expect(baselineLod).toBeDefined();

    // 경계에서 ±0.35m 왕복 진동 10프레임 주입 -> 팝핑(LOD 전환) 0건이어야 함
    let switchCount = 0;
    let prevLod = baselineLod;
    for (let i = 0; i < 10; i += 1) {
      const z = i % 2 === 0 ? 10.35 : 9.65;
      const frame = governor.evaluateFrame({
        assets: [heroAsset],
        camera: { ...baseCamera, position: [0, 0, z] },
        gpuTier: "tablet-mid",
        targetFps: 60,
      });
      const currentLod = frame.decisions[0]?.selectedLod;
      if (currentLod !== prevLod) {
        switchCount += 1;
        prevLod = currentLod;
      }
    }
    expect(switchCount).toBe(0);
    expect(governor.getTrackedAssetCount()).toBe(1);
  });
});

describe("3. P2P CRDT Delta Mesh & Canary Runtime Auto-Rollback Oracle", () => {
  it("바이너리 델타 패킷화기가 중복 트랜스폼을 자동 압축하고 변조 프레임은 체크섬으로 거부한다", () => {
    const ops: CrdtSyncOperation[] = [
      {
        kind: "scene-transform",
        opId: "t1",
        entityId: "hero-rig",
        position: [0, 0, -4],
        rotationDeg: [0, 10, 0],
        scale: 1,
      },
      {
        kind: "scene-transform",
        opId: "t2",
        entityId: "hero-rig",
        position: [0.2, 0, -4],
        rotationDeg: [0, 20, 0],
        scale: 1,
      },
      {
        kind: "scene-transform",
        opId: "t3",
        entityId: "hero-rig",
        position: [0.4, 0, -4],
        rotationDeg: [0, 30, 0],
        scale: 1.05,
      },
    ];

    const compacted = compactCrdtOperations(ops);
    expect(compacted.compactedOps).toHaveLength(1);
    expect(compacted.droppedRedundantCount).toBe(2);

    const mesh = new P2pCrdtDeltaMesh("peer-a", "webrtc-datachannel");
    const packet = mesh.commitLocalBatch(ops);
    const encoded = encodeCrdtDeltaPacket(packet, { enableCompaction: true });
    expect(encoded.wireBytes).toBeLessThan(encoded.rawUncompactedBytes);

    const decoded = decodeCrdtDeltaPacket(encoded.bytes);
    expect(decoded.ok).toBe(true);
    expect(decoded.packet?.packetId).toBe(packet.packetId);
    expect(decoded.packet?.transport).toBe("webrtc-datachannel");

    // 와이어 프레임 1바이트 변조 -> 체크섬 불일치 거부
    const tampered = encoded.bytes.slice();
    tampered[20] = ((tampered[20] ?? 0) ^ 0xff) & 0xff;
    const failed = decodeCrdtDeltaPacket(tampered);
    expect(failed.ok).toBe(false);
    expect(failed.errorReason).toBe("checksum-mismatch");
  });

  it("비순차 인과 패킷을 버퍼링했다가 선행 패킷 도착 시 배출하며 3피어가 충돌 0건·동일 다이제스트로 수렴한다", () => {
    const peerA = new P2pCrdtDeltaMesh("peer-a", "webtransport-stream");
    const peerB = new P2pCrdtDeltaMesh("peer-b", "webtransport-stream");

    const p1 = peerA.commitLocalBatch([
      {
        kind: "stroke-append",
        opId: "a1",
        entityId: "s-1",
        layerId: "L1",
        brushId: "gpen",
        pointCount: 20,
        pressureAvg: 0.7,
      },
    ]);
    const p2 = peerA.commitLocalBatch([
      {
        kind: "stroke-erase",
        opId: "a2",
        entityId: "s-1",
        layerId: "L1",
      },
    ]);

    // p2를 먼저 수신 -> 인과 버퍼에 보류
    const first = peerB.receivePacket(p2);
    expect(first.status).toBe("buffered-out-of-order");
    expect(first.pendingBufferSize).toBe(1);

    // p1 도착 -> p1 적용 직후 p2 자동 배출, 상태 다이제스트 일치
    const second = peerB.receivePacket(p1);
    expect(second.status).toBe("applied");
    expect(second.drainedBufferedCount).toBe(1);
    expect(second.pendingBufferSize).toBe(0);
    expect(peerB.computeStateDigest()).toBe(peerA.computeStateDigest());

    // 3피어 통합 시나리오 검증
    const scenario = runP2pMeshConvergenceScenario("webtransport-stream");
    expect(scenario.allPeersConverged).toBe(true);
    expect(scenario.unresolvedConflictCount).toBe(0);
    expect(scenario.outOfOrderDeliveriesSimulated).toBeGreaterThanOrEqual(2);
    expect(scenario.duplicatePacketsInjected).toBeGreaterThanOrEqual(2);
    expect(scenario.compactionSavingsPct).toBeGreaterThan(20);
  });

  it("카나리 자동 롤백 오라클이 promote · hold · rollback 3단계와 정확한 트리거 코드를 결정론적으로 산출한다", () => {
    const getPreset = (id: string) => {
      const found = CANARY_TELEMETRY_PRESETS.find((p) => p.id === id);
      if (!found) throw new Error(`Missing canary preset: ${id}`);
      return found.telemetry;
    };

    const promote = evaluateCanaryReleaseHealth(getPreset("healthy-promote"));
    expect(promote.decision).toBe("promote");
    expect(promote.triggers).toHaveLength(0);
    expect(promote.healthScore).toBe(100);

    const hold = evaluateCanaryReleaseHealth(getPreset("quorum-hold"));
    expect(hold.decision).toBe("hold");
    expect(hold.triggers.some((t) => t.code === "CANARY_OBSERVATION_QUORUM_PENDING")).toBe(true);

    const shaderRollback = evaluateCanaryReleaseHealth(getPreset("shader-compile-rollback"));
    expect(shaderRollback.decision).toBe("rollback");
    expect(shaderRollback.triggers.some((t) => t.code === "WEBGL_SHADER_COMPILE_FAILURE_SPIKE")).toBe(true);

    const wasmRollback = evaluateCanaryReleaseHealth(getPreset("wasm-fault-rollback"));
    expect(wasmRollback.decision).toBe("rollback");
    expect(wasmRollback.triggers.some((t) => t.code === "WASM_LINEAR_MEMORY_FAULT")).toBe(true);
    expect(wasmRollback.triggers.some((t) => t.code === "FRAME_DROP_SLO_BREACH")).toBe(true);

    const httpRollback = evaluateCanaryReleaseHealth(getPreset("http-budget-rollback"));
    expect(httpRollback.decision).toBe("rollback");
    expect(httpRollback.triggers.some((t) => t.code === "HTTP_ERROR_BUDGET_BURN_BREACH")).toBe(true);
  });
});

describe("4. StudioWebGpuNextgenRuntimePanel UI & Calm Atelier 정적 위생 검증", () => {
  it("필수 props 0개로 단독 렌더되고 3개 탭 전환과 인터랙션이 정상 동작한다", () => {
    render(<StudioWebGpuNextgenRuntimePanel />);

    expect(screen.getByText("차세대 WebGPU · P2P · LOD 런타임 콘솔")).toBeTruthy();

    // 탭 1 (기본 활성): Zero-Copy 링버퍼 벤치마크
    const tabRing = screen.getByRole("tab", { name: /Zero-Copy 링버퍼 벤치마크/ });
    const tabLod = screen.getByRole("tab", { name: /적응형 3D LOD 거버너 시뮬레이터/ });
    const tabP2p = screen.getByRole("tab", { name: /P2P CRDT·카나리 롤백 오라클/ });

    expect(tabRing.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("핫패스 힙 할당 수")).toBeTruthy();

    // 1비트 변조 주입 체크박스 토글 시 변조 탐지 메시지 확인
    const corruptCheckbox = screen.getByRole("checkbox");
    fireEvent.click(corruptCheckbox);
    expect(screen.getByText(/변조 탐지 차단 1건/)).toBeTruthy();

    // 탭 2 전환: 적응형 3D LOD 거버너
    fireEvent.click(tabLod);
    expect(tabLod.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("주인공 VRM 캐릭터")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /모바일 저전력/ }));
    fireEvent.click(screen.getByRole("button", { name: /120fps/ }));
    fireEvent.click(screen.getByRole("button", { name: /경계 떨림 히스테리시스 시험/ }));
    expect(screen.getByText(/8프레임 진동:/)).toBeTruthy();

    // 탭 3 전환: P2P CRDT · 카나리 롤백 오라클
    fireEvent.click(tabP2p);
    expect(tabP2p.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/100% 일치 \(충돌 0건\)/)).toBeTruthy();
    expect(screen.getByText(/승격 가능 \(PROMOTE\)/)).toBeTruthy();

    // WebGL 셰이더 실패 프리셋 클릭 -> 즉시 롤백 전환 확인
    fireEvent.click(screen.getByRole("button", { name: /WebGL 셰이더 컴파일 실패 급증/ }));
    expect(screen.getByText(/즉시 롤백 \(ROLLBACK\)/)).toBeTruthy();
    expect(screen.getByText("WEBGL_SHADER_COMPILE_FAILURE_SPIKE")).toBeTruthy();

    // 키보드 ArrowLeft 로 탭 2 복귀 검증
    fireEvent.keyDown(tabP2p, { key: "ArrowLeft" });
    expect(tabLod.getAttribute("aria-selected")).toBe("true");
  });

  it("영어 locale prop 및 카나리 기준선 배율 롤백 회귀 케이스도 정확히 동작한다", () => {
    render(<StudioWebGpuNextgenRuntimePanel locale="en" initialTab="p2p-canary" />);
    expect(screen.getByText("Next-Gen WebGPU · P2P · LOD Runtime Console")).toBeTruthy();
    expect(screen.getByText(/PROMOTE/)).toBeTruthy();

    // 대조군(0.5%) 대비 4배(2.0%) 급증 시 절대 임계(4%) 미만이어도 회귀 롤백 트리거
    const baselineRegression = evaluateCanaryReleaseHealth({
      releaseVersion: "v36.4.0-rc6",
      canaryTrafficPct: 10,
      observationWindowSec: 600,
      sampleCount: 2000,
      frameDropRate: 0.02,
      baselineFrameDropRate: 0.005,
      p95FrameTimeMs: 14.5,
      webglShaderCompileAttempts: 500,
      webglShaderCompileFailures: 0,
      wasmMemoryFaultCount: 0,
      httpRequestCount: 5000,
      http5xxCount: 1,
    });
    expect(baselineRegression.decision).toBe("rollback");
    expect(baselineRegression.triggers.some((t) => t.code === "FRAME_DROP_SLO_BREACH")).toBe(true);
  });

  it("모듈 내 모든 소스 파일이 800줄 이하이며 원시 색상·transition-all·Sparkles·WebStorage·store Map 필드가 0건이다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/webgpu-nextgen-runtime");
    const files = readdirSync(dir).filter(
      (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.tsx"),
    );

    expect(files.length).toBeGreaterThanOrEqual(7);

    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgb\s*\(|\bhsl\s*\(/;
    const rawTailwindPaletteRegex =
      /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;

    for (const file of files) {
      const content = readFileSync(resolve(dir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} must be <= 800 lines`).toBeLessThanOrEqual(800);
      expect(content.includes("transition-all"), `${file} must not use transition-all`).toBe(false);
      expect(content.includes("Sparkles"), `${file} must not use Sparkles`).toBe(false);
      expect(content.includes("localStorage"), `${file} must not use localStorage`).toBe(false);
      expect(content.includes("sessionStorage"), `${file} must not use sessionStorage`).toBe(false);
      expect(
        /\bprivate\s+(?:readonly\s+)?store\b/.test(content),
        `${file} must not declare private store field`,
      ).toBe(false);

      if (file.endsWith(".tsx")) {
        expect(rawColorRegex.test(content), `${file} must not contain raw hex/rgb/hsl`).toBe(false);
        expect(
          rawTailwindPaletteRegex.test(content),
          `${file} must use Calm Atelier semantic tokens only`,
        ).toBe(false);
      }
    }
  });
});
