// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserOpfsVfsAdapter,
  InMemoryVfsAdapter,
  MOVING_TOON_PRESETS,
  MovingToonReelsEncoder,
  OpfsSnapshotVcsEngine,
  SPARSE_TILE_RGBA_BYTES,
  SPARSE_TILE_SIZE,
  SparseTiledVectorRasterizer,
  StudioWebcodecsOpfsPanel,
  buildDemoStylusSamples,
  computeContentAddressHash,
  createInfiniteCanvasSampleStrokes,
  createKalmanStylusState,
  createOpfsVfsAdapter,
  evaluateCameraShake,
  evaluateMovingToonEasing,
  findMovingToonPresetById,
  flattenCubicBezierAdaptive,
  hashBytesFnv1a64Hex,
  hashBytesSha256PureHex,
  interpolateMovingToonFrame,
  makeDeterministicLayerPayload,
  planReelsFrameSchedule,
  predictStylusLeadPoint,
  probeWebCodecsSupport,
  simulateStylusTrajectoryPrediction,
  type EncodedChunkLike,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
  type VcsProjectSnapshot,
  type WebCodecsRuntimeAdapter,
} from "./index";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const FORBIDDEN_STORAGE_REGEX = /\blocalStorage\b|\bsessionStorage\b/;
const FORBIDDEN_TRANSITION_ALL_REGEX = /\btransition-all\b/;
const FORBIDDEN_SPARKLES_REGEX = /\bSparkles\b/;
const FORBIDDEN_PRIVATE_STORE_MAP_REGEX =
  /\bprivate\s+(?:readonly\s+)?store\b|\bstore\s*=\s*new\s+Map\b/;

function readModuleSourceFiles(): readonly { readonly file: string; readonly text: string }[] {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(ts|tsx|css)$/u.test(name) && !name.includes(".test."))
    .map((file) => ({
      file,
      text: fs.readFileSync(path.join(dir, file), "utf8"),
    }));
}

/** 테스트용 모킹 OPFS 디렉터리 핸들 트리를 구성한다. */
function createMockOpfsDirectory(): OpfsDirectoryHandleLike {
  const subdirs = new Map<string, OpfsDirectoryHandleLike>();
  const files = new Map<string, Uint8Array>();

  const makeFileHandle = (name: string): OpfsFileHandleLike => ({
    async getFile() {
      const bytes = files.get(name) ?? new Uint8Array(0);
      return {
        async arrayBuffer() {
          const copy = new Uint8Array(bytes.byteLength);
          copy.set(bytes);
          return copy.buffer;
        },
      };
    },
    async createWritable() {
      let pending = new Uint8Array(0);
      return {
        async write(data: Uint8Array | ArrayBuffer | string) {
          if (typeof data === "string") {
            pending = new TextEncoder().encode(data);
          } else if (data instanceof Uint8Array) {
            pending = new Uint8Array(data);
          } else {
            pending = new Uint8Array(data);
          }
        },
        async close() {
          files.set(name, pending);
        },
      };
    },
  });

  const dirHandle: OpfsDirectoryHandleLike = {
    async getDirectoryHandle(name, options) {
      const existing = subdirs.get(name);
      if (existing) return existing;
      if (!options?.create) throw new DOMException(`Directory not found: ${name}`, "NotFoundError");
      const created = createMockOpfsDirectory();
      subdirs.set(name, created);
      return created;
    },
    async getFileHandle(name, options) {
      if (!files.has(name) && !options?.create) {
        throw new DOMException(`File not found: ${name}`, "NotFoundError");
      }
      if (!files.has(name)) files.set(name, new Uint8Array(0));
      return makeFileHandle(name);
    },
    async removeEntry(name) {
      files.delete(name);
      subdirs.delete(name);
    },
    async *keys() {
      for (const k of files.keys()) yield k;
    },
  };
  return dirHandle;
}

describe("webcodecs-opfs-engine: WebCodecs 4K 무빙툰 · 희소 타일 래스터화 · OPFS VCS 통합 검증", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. 코덱 프로파일 지원 여부를 진단하고 근거 없는 비용 절감액을 만들지 않는다", async () => {
    const mockAdapter: WebCodecsRuntimeAdapter = {
      isConfigSupported: async (cfg) => ({
        supported:
          (cfg.codec.startsWith("av01") && cfg.hardwareAcceleration === "prefer-hardware") ||
          (cfg.codec.startsWith("avc1") && cfg.hardwareAcceleration === "prefer-software"),
      }),
    };

    const report = await probeWebCodecsSupport("4k-vertical-60", mockAdapter, "av1");
    expect(report.webCodecsAvailable).toBe(true);
    expect(report.recommendedMode).toBe("webcodecs-hardware");
    expect(report.recommendedCodec?.family).toBe("av1");
    expect(report.serverCostKrwPerMinute).toBe(0);
    expect(report.entries).toHaveLength(3);
    expect(report.entries[0]?.hardwareSupported).toBe(true);
    expect(report.cloudGpuSavingsKrwPer10Min).toBeNull();
    expect(report.estimatedMegabytesFor15s).toBeGreaterThan(10);
  });

  it("2. WebCodecs 미지원 환경에서는 포즈만 보간하고 인코딩·출력 성공을 보고하지 않는다", async () => {
    const timeline = findMovingToonPresetById("rooftop-sakura-duel");
    const encoder = new MovingToonReelsEncoder();
    const result = await encoder.encodeTimeline(timeline, {
      presetId: "4k-vertical-60",
      adapter: null,
      maxFramesToEncode: 24,
    });

    expect(result.mode).toBe("fallback-frame-sequence");
    expect(result.purpose).toBe("synthetic-encoder-probe");
    expect(result.outputProduced).toBe(false);
    expect(result.status).toBe("unsupported");
    expect(result.encodedFrames).toBe(0);
    expect(result.keyFrameCount).toBe(0);
    expect(result.totalEncodedBytes).toBe(0);
    expect(result.chunkSummaryBytes).toEqual([]);
    expect(result.serverCostKrw).toBe(0);
    expect(result.fallbackReasonKo).toContain("VideoEncoder");
    expect(result.samplePoses.length).toBeGreaterThan(0);
  });

  it("3. 2.5D 무빙툰 타임라인 키프레임 보간 시 전경(depthZ)이 원경보다 큰 패럴랙스로 이동한다", () => {
    const timeline = findMovingToonPresetById("rooftop-sakura-duel");
    const startPose = interpolateMovingToonFrame(timeline, 0, { fps: 60 });
    const midPose = interpolateMovingToonFrame(timeline, 100, { fps: 60 });
    const endPose = interpolateMovingToonFrame(timeline, 240, { fps: 60 });

    expect(evaluateMovingToonEasing("ease-in-out-cubic", 0)).toBe(0);
    expect(evaluateMovingToonEasing("ease-in-out-cubic", 1)).toBe(1);
    expect(evaluateMovingToonEasing("ease-out-expo", 0.5)).toBeGreaterThan(0.9);
    expect(midPose.cameraZoom).toBeGreaterThan(startPose.cameraZoom);
    expect(endPose.timeMs).toBe(timeline.durationMs);

    const bgStart = startPose.layerTransforms.find((l) => l.layerId === "bg-skyline");
    const fgStart = startPose.layerTransforms.find((l) => l.layerId === "fg-petals");
    const bgEnd = endPose.layerTransforms.find((l) => l.layerId === "bg-skyline");
    const fgEnd = endPose.layerTransforms.find((l) => l.layerId === "fg-petals");

    const bgTravel = Math.abs((bgEnd?.translateX ?? 0) - (bgStart?.translateX ?? 0));
    const fgTravel = Math.abs((fgEnd?.translateX ?? 0) - (fgStart?.translateX ?? 0));
    expect(fgTravel).toBeGreaterThan(bgTravel * 2);
  });

  it("4. 결정적 카메라 셰이크 감쇠 및 하드웨어 VideoEncoder 백프레셔·VideoFrame.close 해제를 검증한다", async () => {
    const shakeSpec = MOVING_TOON_PRESETS[0]?.keyframes[1]?.shake;
    const earlyA = evaluateCameraShake(shakeSpec, 1650);
    const earlyB = evaluateCameraShake(shakeSpec, 1650);
    const late = evaluateCameraShake(shakeSpec, 2250);
    const afterEnd = evaluateCameraShake(shakeSpec, 2600);

    expect(earlyA).toEqual(earlyB);
    expect(Math.hypot(earlyA.offsetX, earlyA.offsetY)).toBeGreaterThan(
      Math.hypot(late.offsetX, late.offsetY),
    );
    expect(afterEnd).toEqual({ offsetX: 0, offsetY: 0, rollDeg: 0 });

    let closedFrameCount = 0;
    let outputCallback: ((chunk: EncodedChunkLike) => void) | null = null;
    let queueSize = 0;
    const configure = vi.fn();
    const inputSizes: number[][] = [];

    const hwAdapter: WebCodecsRuntimeAdapter = {
      isConfigSupported: async (cfg) => ({
        supported: cfg.codec.startsWith("avc1") && cfg.hardwareAcceleration === "prefer-hardware",
      }),
      createEncoder: ({ output }) => {
        outputCallback = output;
        return {
          get encodeQueueSize() {
            return queueSize;
          },
          state: "configured",
          configure,
          encode: (frame, opts) => {
            queueSize += 1;
            outputCallback?.({
              byteLength: opts?.keyFrame ? 90_000 : 28_000,
              type: opts?.keyFrame ? "key" : "delta",
              timestamp: frame.timestamp,
            });
            queueSize = Math.max(0, queueSize - 1);
          },
          flush: async () => {},
          close: vi.fn(),
        };
      },
      createVideoFrame: ({ timestampUs, width, height, rgbaBytes }) => {
        inputSizes.push([width, height, rgbaBytes.byteLength]);
        return { timestamp: timestampUs, close: () => { closedFrameCount += 1; } };
      },
    };

    const timeline = findMovingToonPresetById("subway-reveal-shorts");
    const plan = planReelsFrameSchedule(timeline, { id: "4k-vertical-60", labelKo: "4K", width: 2160, height: 3840, fps: 60, targetBitrateBps: 24_000_000, aspectLabel: "9:16", recommendedPlatformKo: "" }, 0.5);
    expect(plan.keyFrameInterval).toBe(30);

    const encoder = new MovingToonReelsEncoder();
    const res = await encoder.encodeTimeline(timeline, {
      presetId: "4k-vertical-60",
      gopSeconds: 0.5,
      maxFramesToEncode: 65,
      adapter: hwAdapter,
    });

    expect(res.mode).toBe("webcodecs-hardware");
    expect(res.status).toBe("completed");
    expect(res.outputProduced).toBe(false);
    expect(res.preset.width).toBe(2160);
    expect(res.sampleFrameWidth).toBe(64);
    expect(res.sampleFrameHeight).toBe(64);
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ width: 64, height: 64 }));
    expect(inputSizes).toHaveLength(65);
    expect(inputSizes.every((size) => size.join(",") === "64,64,16384")).toBe(true);
    expect(res.encodedFrames).toBe(65);
    expect(res.keyFrameCount).toBe(3); // frame 0, 30, 60
    expect(closedFrameCount).toBe(65);
    expect(res.droppedFrames).toBe(0);
  });

  it("인코더 오류·취소 시 실패 상태를 남기고 프레임·인코더를 해제한다", async () => {
    const closeFrame = vi.fn();
    const closeEncoder = vi.fn();
    const adapter: WebCodecsRuntimeAdapter = {
      isConfigSupported: async () => ({ supported: true }),
      createVideoFrame: ({ timestampUs }) => ({ timestamp: timestampUs, close: closeFrame }),
      createEncoder: ({ error }) => ({
        encodeQueueSize: 0, state: "configured", configure: () => {},
        encode: () => { error(new Error("synthetic codec failure")); },
        flush: async () => {}, close: closeEncoder,
      }),
    };
    const encoder = new MovingToonReelsEncoder();
    const timeline = findMovingToonPresetById("rooftop-sakura-duel");
    const failed = await encoder.encodeTimeline(timeline, { adapter, maxFramesToEncode: 2 });
    expect(failed.status).toBe("failed");
    expect(failed.outputProduced).toBe(false);
    expect(failed.encodedFrames).toBe(0);
    expect(failed.totalEncodedBytes).toBe(0);
    expect(failed.fallbackReasonKo).toContain("synthetic codec failure");
    expect(closeFrame).toHaveBeenCalledTimes(1);
    expect(closeEncoder).toHaveBeenCalledTimes(1);

    const emptyAdapter: WebCodecsRuntimeAdapter = {
      ...adapter,
      createEncoder: () => ({ encodeQueueSize: 0, state: "configured", configure: () => {}, encode: () => {}, flush: async () => {}, close: () => {} }),
    };
    const empty = await encoder.encodeTimeline(timeline, { adapter: emptyAdapter, maxFramesToEncode: 1 });
    expect(empty.status).toBe("failed");
    expect(empty.encodedFrames).toBe(0);
    expect(empty.outputProduced).toBe(false);

    const controller = new AbortController();
    controller.abort();
    const cancelled = await encoder.encodeTimeline(timeline, { adapter: null, signal: controller.signal });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.encodedFrames).toBe(0);
    expect(cancelled.outputProduced).toBe(false);
  });

  it("5. 무한 캔버스 희소 타일은 화면 밖 타일을 0개 할당하고 밀집 캔버스 대비 95% 이상 메모리를 절감한다", () => {
    const rasterizer = new SparseTiledVectorRasterizer({ maxCachedTiles: 64 });
    for (const stroke of createInfiniteCanvasSampleStrokes()) {
      rasterizer.addStroke(stroke);
    }

    const viewport = { centerX: 0, centerY: 0, widthPx: 1024, heightPx: 512, zoom: 1.0 };
    const report = rasterizer.rasterizeViewport(viewport);
    const stats = rasterizer.getMemoryStats(viewport);

    expect(report.offscreenAllocatedTiles).toBe(0);
    expect(stats.offscreenAllocatedTiles).toBe(0);
    expect(report.visibleTileCount).toBe(stats.allocatedTileCount);
    expect(stats.allocatedBytes).toBe(stats.allocatedTileCount * SPARSE_TILE_RGBA_BYTES);
    expect(stats.memorySavingPercent).toBeGreaterThan(95);

    // 중심 스트로크가 지나는 가시 타일에는 실제로 래스터화된 픽셀이 존재해야 한다.
    const coveredTotal = report.visibleTiles.reduce((acc, tile) => acc + tile.coveredPixelCount, 0);
    expect(coveredTotal).toBeGreaterThan(200);
  });

  it("6. 희소 타일 LRU 캐시는 재방문 시 캐시 적중을 기록하고 용량 초과 시 오래된 타일을 축출한다", () => {
    const rasterizer = new SparseTiledVectorRasterizer({ maxCachedTiles: 6 });
    for (const stroke of createInfiniteCanvasSampleStrokes()) {
      rasterizer.addStroke(stroke);
    }

    const vpA = { centerX: 0, centerY: 0, widthPx: 512, heightPx: 512, zoom: 1 };
    const pass1 = rasterizer.rasterizeViewport(vpA);
    expect(pass1.newlyRasterizedCount).toBe(4);
    expect(pass1.cacheHitCountThisPass).toBe(0);

    const pass2 = rasterizer.rasterizeViewport(vpA);
    expect(pass2.newlyRasterizedCount).toBe(0);
    expect(pass2.cacheHitCountThisPass).toBe(4);

    // 멀리 패닝하면 신규 타일이 생성되고 LRU 상한(6개)을 초과하지 않도록 축출된다.
    const vpB = { centerX: 2048, centerY: 0, widthPx: 512, heightPx: 512, zoom: 1 };
    rasterizer.rasterizeViewport(vpB);
    const stats = rasterizer.getMemoryStats(vpB);
    expect(stats.allocatedTileCount).toBeLessThanOrEqual(6);
    expect(stats.evictionCount).toBeGreaterThanOrEqual(2);
    expect(stats.cacheHits).toBe(4);
  });

  it("7. 줌 배율 적응형 베지어 평탄화는 800% 확대에서 세분화를 늘려 0.25px 이하 선명도를 유지한다", () => {
    const curvedSeg = {
      p0: { x: 0, y: 0 },
      p1: { x: 40, y: -180 },
      p2: { x: 200, y: 220 },
      p3: { x: 260, y: 20 },
    };

    const flat100 = flattenCubicBezierAdaptive(curvedSeg, 1.0, { maxScreenErrorPx: 0.25 });
    const flat800 = flattenCubicBezierAdaptive(curvedSeg, 8.0, { maxScreenErrorPx: 0.25 });

    expect(flat800.points.length).toBeGreaterThan(flat100.points.length);
    expect(flat800.subdivisionCount).toBeGreaterThan(flat100.subdivisionCount);
    expect(flat100.maxScreenErrorPx).toBeLessThanOrEqual(0.25);
    expect(flat800.maxScreenErrorPx).toBeLessThanOrEqual(0.25);

    const rasterizer = new SparseTiledVectorRasterizer({ maxCachedTiles: 48 });
    for (const s of createInfiniteCanvasSampleStrokes()) rasterizer.addStroke(s);
    const report800 = rasterizer.rasterizeViewport({
      centerX: 0,
      centerY: 0,
      widthPx: SPARSE_TILE_SIZE * 2,
      heightPx: SPARSE_TILE_SIZE * 2,
      zoom: 8.0,
    });
    expect(report800.maxScreenErrorPx).toBeLessThanOrEqual(0.25);
  });

  it("8. 스트로크 추가·삭제 시 영향받는 가시 타일만 선택 무효화하고 나머지 캐시를 유지한다", () => {
    const rasterizer = new SparseTiledVectorRasterizer({ maxCachedTiles: 32 });
    const vp = { centerX: 256, centerY: 256, widthPx: 512, heightPx: 512, zoom: 1 };
    rasterizer.rasterizeViewport(vp);

    const beforeKeys = rasterizer.getCachedTileKeys();
    expect(beforeKeys.length).toBe(4);

    // 한 타일([0..256, 0..256])에만 걸치는 스트로크 추가 -> 해당 타일만 무효화
    rasterizer.addStroke({
      id: "local-patch-stroke",
      strokeWidthWorld: 2,
      opacity: 1,
      zIndex: 10,
      segments: [{ p0: { x: 40, y: 40 }, p1: { x: 70, y: 50 }, p2: { x: 110, y: 80 }, p3: { x: 140, y: 120 } }],
    });

    const afterPass = rasterizer.rasterizeViewport(vp);
    expect(afterPass.newlyRasterizedCount).toBe(1);
    expect(afterPass.cacheHitCountThisPass).toBe(3);

    expect(rasterizer.removeStroke("local-patch-stroke")).toBe(true);
    const afterDeletePass = rasterizer.rasterizeViewport(vp);
    expect(afterDeletePass.newlyRasterizedCount).toBe(1);
  });

  it("9. 2D 칼만 스타일러스 예측기가 부드러운 곡선 및 getPredictedEvents 입력을 저오차로 선행 추종한다", () => {
    const smoothSamples = buildDemoStylusSamples("smooth-curve");
    const bench = simulateStylusTrajectoryPrediction(smoothSamples, { leadTimeMs: 10 });

    expect(bench.steps).toHaveLength(smoothSamples.length);
    expect(bench.rmsTrackingErrorPx).toBeLessThan(12);
    expect(bench.averageVelocityPxPerSec).toBeGreaterThan(500);
    // 중간 지점에서 예측 좌표는 현재 필터링 좌표보다 진행(+X) 방향으로 선행해야 한다.
    const midStep = bench.steps[8];
    expect(midStep).toBeDefined();
    expect((midStep?.predictedPoint.x ?? 0)).toBeGreaterThan(midStep?.filteredPoint.x ?? 0);
    expect(midStep?.usedPredictedEventCount).toBe(1);
  });

  it("10. 2D 칼만 예측기가 90도 급회전 코너에서 오버슈트 클램핑을 발동해 리드 거리를 억제한다", () => {
    const cornerSamples = buildDemoStylusSamples("sharp-corner");
    let state = createKalmanStylusState();
    let cornerStep = null;

    for (const sample of cornerSamples) {
      const pred = predictStylusLeadPoint(state, sample, {
        leadTimeMs: 16,
        maxOvershootPx: 10,
        sharpTurnAngleDeg: 45,
        sharpTurnDamping: 0.12,
      });
      state = pred.nextState;
      if (pred.turnAngleDeg >= 60) {
        cornerStep = pred;
      }
    }

    expect(cornerStep).not.toBeNull();
    expect(cornerStep?.turnAngleDeg).toBeGreaterThanOrEqual(75);
    expect(cornerStep?.overshootClamped).toBe(true);
    expect(cornerStep?.clampedLeadDistancePx).toBeLessThanOrEqual(10);
  });

  it("11. OPFS/VFS 콘텐츠 주소 지정(FNV-1a & SHA-256) 청크 중복제거로 동일 레이어 물리 저장을 0바이트 추가한다", async () => {
    const payload = makeDeterministicLayerPayload(2048, 777);
    const fnvA = hashBytesFnv1a64Hex(payload);
    const fnvB = hashBytesFnv1a64Hex(payload);
    expect(fnvA).toBe(fnvB);
    expect(fnvA).toHaveLength(16);

    const pureSha = hashBytesSha256PureHex(payload);
    const contentSha = await computeContentAddressHash(payload, "sha-256");
    expect(contentSha).toBe(`sha256-${pureSha}`);

    const vcs = new OpfsSnapshotVcsEngine({
      adapter: new InMemoryVfsAdapter(),
      chunkSizeBytes: 4096,
      hashAlgorithm: "fnv1a-64",
    });
    await vcs.init("main");

    const heavyBg = makeDeterministicLayerPayload(32_768, 11);
    const lineV1 = makeDeterministicLayerPayload(8_192, 22);
    const snap1: VcsProjectSnapshot = {
      projectId: "proj-dedup",
      title: "중복제거 테스트",
      canvasWidth: 1600,
      canvasHeight: 10000,
      layers: [
        { layerId: "bg", name: "배경", kind: "raster", opacity: 1, visible: true, blendMode: "normal", payload: heavyBg },
        { layerId: "line", name: "선화", kind: "vector", opacity: 1, visible: true, blendMode: "normal", payload: lineV1 },
      ],
    };

    const c1 = await vcs.commit(snap1, { message: "초기 커밋" });
    expect(c1.stats.newChunksWritten).toBe(10); // 8 + 2
    expect(c1.stats.reusedChunks).toBe(0);

    // 배경은 그대로 두고 선화만 수정 -> 배경 8청크 100% 재사용
    const snap2: VcsProjectSnapshot = {
      ...snap1,
      layers: [
        snap1.layers[0] as VcsProjectSnapshot["layers"][number],
        { layerId: "line", name: "선화", kind: "vector", opacity: 1, visible: true, blendMode: "normal", payload: makeDeterministicLayerPayload(8_192, 33) },
      ],
    };
    const c2 = await vcs.commit(snap2, { message: "선화만 수정" });
    expect(c2.stats.reusedChunks).toBe(8);
    expect(c2.stats.newChunksWritten).toBe(2);

    const stats = vcs.getStorageStats();
    expect(stats.physicalStoredBytes).toBeLessThan(stats.logicalBytes);
    expect(stats.deduplicationPercent).toBeGreaterThan(35);

    const integrity = await vcs.verifyIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.corruptedChunks).toHaveLength(0);
  });

  it("12. 브라우저 OPFS FileSystemDirectoryHandle 어댑터를 통해 재마운트 후에도 커밋·청크가 영속 복원된다", async () => {
    const mockRoot = createMockOpfsDirectory();
    const adapter1 = await createOpfsVfsAdapter({
      namespaceDir: "project-alpha",
      getDirectoryOverride: async () => mockRoot,
    });
    expect(adapter1.backendKind).toBe("opfs");
    expect(adapter1).toBeInstanceOf(BrowserOpfsVfsAdapter);

    const vcs1 = new OpfsSnapshotVcsEngine({ adapter: adapter1, chunkSizeBytes: 4096 });
    await vcs1.init("main");
    const originalBytes = makeDeterministicLayerPayload(10_000, 999);
    const c1 = await vcs1.commit(
      {
        projectId: "alpha",
        title: "OPFS 영속 테스트",
        canvasWidth: 1200,
        canvasHeight: 2400,
        layers: [{ layerId: "l1", name: "레이어1", kind: "raster", opacity: 1, visible: true, blendMode: "normal", payload: originalBytes }],
      },
      { message: "OPFS 저장 커밋" },
    );

    // 같은 디렉터리 핸들로 새 엔진을 기동해도 이력과 바이트가 그대로 복원되어야 한다.
    const adapter2 = await createOpfsVfsAdapter({
      namespaceDir: "project-alpha",
      getDirectoryOverride: async () => mockRoot,
    });
    const vcs2 = new OpfsSnapshotVcsEngine({ adapter: adapter2, chunkSizeBytes: 4096 });
    await vcs2.init("main");

    expect(vcs2.currentHeadCommitId).toBe(c1.id);
    const restored = await vcs2.restoreCommit(c1.id);
    expect(Array.from(restored.layers[0]?.payload ?? [])).toEqual(Array.from(originalBytes));
  });

  it("13. Git형 브랜치 분기·전환 및 레이어 델타 Diff(추가·수정·삭제·메타변경)를 정확히 판정한다", async () => {
    const vcs = new OpfsSnapshotVcsEngine({ chunkSizeBytes: 4096 });
    await vcs.init("main");

    const bgPayload = makeDeterministicLayerPayload(8192, 10);
    const linePayload = makeDeterministicLayerPayload(4096, 20);
    const baseSnap: VcsProjectSnapshot = {
      projectId: "branch-test",
      title: "브랜치 시안",
      canvasWidth: 1600,
      canvasHeight: 8000,
      layers: [
        { layerId: "bg", name: "배경", kind: "raster", opacity: 1, visible: true, blendMode: "normal", payload: bgPayload },
        { layerId: "line", name: "선화", kind: "vector", opacity: 1, visible: true, blendMode: "normal", payload: linePayload },
      ],
    };
    const cMain = await vcs.commit(baseSnap, { message: "main 기준" });

    await vcs.createBranch("night-mood");
    await vcs.checkoutBranch("night-mood");

    const nightSnap: VcsProjectSnapshot = {
      ...baseSnap,
      layers: [
        { layerId: "bg", name: "배경", kind: "raster", opacity: 0.7, visible: true, blendMode: "multiply", payload: bgPayload },
        { layerId: "fx-neon", name: "네온 광원", kind: "fx", opacity: 0.9, visible: true, blendMode: "screen", payload: makeDeterministicLayerPayload(4096, 30) },
      ],
    };
    const cNight = await vcs.commit(nightSnap, { message: "야간 연출 분기" });
    const diff = vcs.diffCommits(cMain.id, cNight.id);

    expect(diff.addedCount).toBe(1);
    expect(diff.removedCount).toBe(1);
    expect(diff.modifiedCount).toBe(1);
    const bgDiff = diff.entries.find((e) => e.layerId === "bg");
    expect(bgDiff?.metadataChangedFields).toContain("opacity");
    expect(bgDiff?.metadataChangedFields).toContain("blendMode");
    expect(bgDiff?.reusedChunkCount).toBe(2);

    const backToMain = await vcs.checkoutBranch("main");
    expect(backToMain?.layers.map((l) => l.layerId)).toEqual(["bg", "line"]);
  });

  it("14. 원클릭 무손실 롤백이 이전 커밋의 바이너리 레이어를 바이트 단위로 정확히 복원한다", async () => {
    const vcs = new OpfsSnapshotVcsEngine({ chunkSizeBytes: 2048 });
    await vcs.init("main");

    const v1Bytes = makeDeterministicLayerPayload(6144, 1234);
    const v2Bytes = makeDeterministicLayerPayload(6144, 5678);
    const snapV1: VcsProjectSnapshot = {
      projectId: "rollback-proj",
      title: "롤백 검증",
      canvasWidth: 1600,
      canvasHeight: 6000,
      layers: [{ layerId: "ink", name: "잉크", kind: "vector", opacity: 1, visible: true, blendMode: "normal", payload: v1Bytes }],
    };
    const c1 = await vcs.commit(snapV1, { message: "v1 원본" });
    await vcs.commit(
      { ...snapV1, layers: [{ layerId: "ink", name: "잉크", kind: "vector", opacity: 0.5, visible: true, blendMode: "normal", payload: v2Bytes }] },
      { message: "v2 실험 수정" },
    );

    const rollback = await vcs.rollbackToCommit(c1.id);
    expect(rollback.verifiedIntegrity).toBe(true);
    expect(rollback.rollbackCommit).not.toBeNull();
    expect(rollback.restoredSnapshot.layers[0]?.opacity).toBe(1);
    expect(Array.from(rollback.restoredSnapshot.layers[0]?.payload ?? [])).toEqual(Array.from(v1Bytes));
    // 이력 보존 방식이므로 총 3개 커밋이 유지된다.
    expect(vcs.getCommitHistory("main")).toHaveLength(3);
  });

  it("15. StudioWebcodecsOpfsPanel이 3개 탭과 인코딩·800% 희소 타일·OPFS 브랜치/롤백 인터랙션을 정상 렌더링한다", async () => {
    render(createElement(StudioWebcodecsOpfsPanel));

    // 탭 1: 미지원 프로브를 실제 영상 출력 완료와 구분한다.
    expect(screen.getByText("프로브 서버 호출 없음")).toBeTruthy();
    expect(screen.getByText(/영상 파일은 생성하지 않습니다/)).toBeTruthy();
    expect(screen.queryByText(/1,800원 절감/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "64×64 합성 샘플 코덱 프로브" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("프로브 미지원");
    });
    expect(screen.getByText("인코딩된 합성 샘플: 0f")).toBeTruthy();
    expect(screen.getByText("샘플 청크 크기 합계: 0 B")).toBeTruthy();
    expect(screen.queryByText(/인코딩 완료|최근 인코딩 검증 완료/)).toBeNull();

    // 탭 2: 희소 타일 & 2D 칼만 예측
    fireEvent.click(screen.getByRole("tab", { name: "희소 타일 · 2D 칼만 예측" }));
    expect(screen.getByText("화면 밖 타일 할당: 0개 (0 B)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "확대 800%" }));
    expect(screen.getByRole("button", { name: "확대 800%" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "부드러운 곡선" }));
    expect(screen.getByRole("img", { name: "스타일러스 입력 궤적과 2D 칼만 선행 예측 좌표 비교" })).toBeTruthy();

    // 탭 3: OPFS 브랜치 분기 · 커밋 · 원클릭 롤백
    fireEvent.click(screen.getByRole("tab", { name: "OPFS 브랜치 · 스냅샷 복원" }));
    await waitFor(() => {
      expect(screen.getByText(/v2 펜선화 정리/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "브랜치 분기" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("alt-lighting");
    });

    fireEvent.click(screen.getByRole("button", { name: "스냅샷 커밋" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("저장 완료");
    });

    const rollbackButtons = screen.getAllByRole("button", { name: "원클릭 롤백" });
    expect(rollbackButtons.length).toBeGreaterThan(0);
    const firstRollbackBtn = rollbackButtons[0];
    if (firstRollbackBtn) fireEvent.click(firstRollbackBtn);
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("무손실 롤백을 완료했습니다");
    });
  });

  it("프로브 실행 예외를 화면에 알리고 완료 카드와 영상 성공 표시를 남기지 않는다", async () => {
    vi.spyOn(MovingToonReelsEncoder.prototype, "encodeTimeline").mockRejectedValue(new Error("synthetic initialization failure"));
    render(createElement(StudioWebcodecsOpfsPanel));
    fireEvent.click(screen.getByRole("button", { name: "64×64 합성 샘플 코덱 프로브" }));
    await waitFor(() => { expect(screen.getByRole("alert").textContent).toContain("synthetic initialization failure"); });
    expect(screen.getByRole("status").textContent).toContain("프로브 실패");
    expect(screen.queryByText(/인코딩 완료|합성 샘플 프로브 완료/)).toBeNull();
  });

  it("16. 모듈 소스 전체가 800줄 이하이며 원시 색상·웹 스토리지·금지 패턴을 포함하지 않는다", () => {
    const files = readModuleSourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(5);

    for (const { file, text } of files) {
      const lineCount = text.split("\n").length;
      expect(lineCount, `${file} exceeds 800 lines (${lineCount})`).toBeLessThanOrEqual(800);
      expect(text, `${file} contains raw hex/rgb/hsl`).not.toMatch(RAW_COLOR_REGEX);
      expect(text, `${file} uses web storage`).not.toMatch(FORBIDDEN_STORAGE_REGEX);
      expect(text, `${file} uses transition-all`).not.toMatch(FORBIDDEN_TRANSITION_ALL_REGEX);
      expect(text, `${file} uses Sparkles`).not.toMatch(FORBIDDEN_SPARKLES_REGEX);
      expect(text, `${file} uses private store Map`).not.toMatch(FORBIDDEN_PRIVATE_STORE_MAP_REGEX);
    }
  });
});
