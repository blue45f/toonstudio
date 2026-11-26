import { describe, expect, it } from "vitest";
import {
  AsyncShaderPipelineCompiler,
  bucketIndex64,
  buildShotProjectionMatrix,
  buildShotViewMatrix,
  compareDistance64,
  computeShaderPipelineHash,
  cosineSimilarity256,
  detectPreferredSigningAlgorithm,
  DodSoaSceneGraph,
  embedStyleText256,
  extractLtLayersCpu,
  fnv1a64Hex,
  fnv1a64StringHex,
  generateProvenanceKeyPair,
  KademliaP2pPeerRouter,
  LocalStyleKeywordAssistant,
  MAX_EPISODE_SHOTS,
  MultiViewportZeroCopyCoordinator,
  OpfsCasBranchTimeline,
  OpfsDirectoryCasBlobStore,
  sealRightsBomProvenance,
  shortestAngleDeltaDeg,
  ShotRailSequencer,
  STYLE_EMBEDDING_DIM,
  STYLUS_DEFAULT_STEP_MS,
  Stylus240HzPredictor,
  validateLtV2WgslSource,
  verifyRightsBomProvenance,
  WGSL_LT_CONVERSION_V2,
  xorDistance64,
  type ChromeBuiltinAiAdapter,
  type EpisodeCameraShot,
  type OpfsDirectoryHandleLike,
  type ShaderPipelineDescriptor,
  type StylusSample,
} from "./index";

function makeShot(index: number, xOffset: number): Omit<EpisodeCameraShot, "cutNumber"> {
  return {
    id: `cut-${String(index + 1).padStart(2, "0")}`,
    label: `컷 ${index + 1}`,
    camera: {
      position: [xOffset, 1.6, 5.0],
      target: [xOffset * 0.5, 1.2, 0],
      up: [0, 1, 0],
      fovDeg: 35 + (index % 15),
      near: 0.1,
      far: 200,
    },
    lighting: {
      keyDirection: [0.4, 0.8, 0.5],
      ambientFloor: 0.18,
      shadowThreshold: 0.45,
      celBands: 3,
    },
    ltProfile: {
      depthThreshold: 0.035,
      normalThreshold: 0.35,
      lineWidthPx: 1.5,
      halftonePitchPx: 4,
      halftoneAngleDeg: 45,
    },
    durationMs: 1200,
    easing: index % 2 === 0 ? "ease-in-out" : "linear",
  };
}

describe("Pro Studio Apex Subsystem (₩0)", () => {
  describe("1. DOD SoA Scene Graph (10,000+ 노드 캐시 선형 갱신 및 더티 프루닝)", () => {
    it("10,000노드 계층을 위상 순회로 정확히 갱신하고 스파스 더티 프루닝으로 99.8% 이상 스킵한다", () => {
      const scene = new DodSoaSceneGraph({ initialCapacity: 1024 });
      const totalNodes = 10_000;
      const rootCount = 100;
      const childrenPerRoot = 99; // 100 * (1 + 99) = 10,000

      const roots: number[] = [];
      for (let r = 0; r < rootCount; r += 1) {
        const rootIdx = scene.createNode(-1);
        scene.setLocalTrs(rootIdx, r * 10, 0, 0, 0, 0, 0, 1, 2, 2, 2);
        scene.setLocalBounds(rootIdx, 0, 0, 0, 1.5);
        roots.push(rootIdx);
        for (let c = 0; c < childrenPerRoot; c += 1) {
          const childIdx = scene.createNode(rootIdx);
          scene.setLocalTranslation(childIdx, 1, c * 0.5, 0);
          scene.setLocalBounds(childIdx, 0, 0, 0, 0.5);
        }
      }

      expect(scene.nodeCount).toBe(totalNodes);
      const initialReport = scene.updateWorldTransforms();
      expect(initialReport.updatedNodes).toBe(totalNodes);
      expect(initialReport.skippedNodes).toBe(0);
      expect(initialReport.sceneVersion).toBe(1);

      // root[3]은 x=30, scale=2 -> 첫 자식(local tx=1, ty=0)의 월드 좌표는 (32, 0, 0), 반경 1.0
      const root3FirstChild = roots[3] + 1;
      const worldMat = new Float32Array(16);
      const worldBounds = new Float32Array(4);
      scene.readWorldMatrix(root3FirstChild, worldMat);
      scene.readWorldBounds(root3FirstChild, worldBounds);
      expect(worldMat[12]).toBeCloseTo(32, 4);
      expect(worldBounds[0]).toBeCloseTo(32, 4);
      expect(worldBounds[3]).toBeCloseTo(1.0, 4);

      // 변경 없는 아이들 프레임은 O(1) 조기 종료(0 노드 갱신)
      const idleReport = scene.updateWorldTransforms();
      expect(idleReport.updatedNodes).toBe(0);
      expect(idleReport.skippedNodes).toBe(totalNodes);
      expect(idleReport.sceneVersion).toBe(1);

      // 단일 루트 서브트리(1 루트 + 99 자식 = 100 노드)만 변경 -> 9,900 노드 프루닝
      scene.setLocalTranslation(roots[3], 50, 4, 0);
      const sparseReport = scene.updateWorldTransforms();
      expect(sparseReport.updatedNodes).toBe(100);
      expect(sparseReport.skippedNodes).toBe(9_900);
      expect(sparseReport.sceneVersion).toBe(2);

      scene.readWorldMatrix(root3FirstChild, worldMat);
      expect(worldMat[12]).toBeCloseTo(52, 4);
      expect(worldMat[13]).toBeCloseTo(4, 4);
    });

    it("역순 부모 재배치 시 위상 정렬을 재구축하고 순환 참조를 차단한다", () => {
      const scene = new DodSoaSceneGraph({ initialCapacity: 64 });
      const n0 = scene.createNode(-1);
      const n1 = scene.createNode(-1);
      scene.setLocalTranslation(n1, 10, 0, 0);
      scene.setLocalTranslation(n0, 3, 2, 0);
      scene.setParent(n0, n1); // 부모 인덱스(1) > 자식 인덱스(0)

      const report = scene.updateWorldTransforms();
      expect(report.topoRebuilt).toBe(true);
      const out = new Float32Array(16);
      scene.readWorldMatrix(n0, out);
      expect(out[12]).toBeCloseTo(13, 4);
      expect(out[13]).toBeCloseTo(2, 4);

      expect(() => scene.setParent(n1, n0)).toThrow(/순환 참조/);
    });
  });

  describe("2. Async Non-Blocking Shader Pipeline Compiler (우선순위 · 예산 슬라이싱 · 웜 캐시)", () => {
    it("우선순위 정렬·유휴 예산 양보·인플라이트 중복제거·결정론적 웜 히트(0ms)를 보장한다", async () => {
      let virtualNow = 0;
      const compiledOrder: string[] = [];
      let yields = 0;

      const compiler = new AsyncShaderPipelineCompiler<{ readonly tag: string }>({
        maxBudgetMs: 2.0,
        now: () => virtualNow,
        yieldToIdle: async () => {
          yields += 1;
          await Promise.resolve();
        },
        compilePipeline: async (desc) => {
          compiledOrder.push(desc.id);
          virtualNow += 1.5; // 2개 실행 시 3.0ms > 2.0ms 예산 초과 -> 다음 슬라이스로 양보
          return { tag: `${desc.backend}:${desc.id}` };
        },
      });

      const makeDesc = (
        id: string,
        priority: ShaderPipelineDescriptor["priority"],
        body: string,
      ): ShaderPipelineDescriptor => ({
        id,
        backend: "wgsl",
        source: body,
        defines: { PASS: 1, ALPHA: true },
        priority,
      });

      const pBg = compiler.compile(makeDesc("bg-bloom", "background", "@compute fn main(){/*bg*/}"));
      const pNormal = compiler.compile(makeDesc("norm-blur", "normal", "@compute fn main(){/*norm*/}"));
      const pCrit = compiler.compile(makeDesc("crit-brush", "critical", "@compute fn main(){/*crit*/}"));
      const pHigh = compiler.compile(makeDesc("high-lt", "high", "@compute fn main(){/*high*/}"));
      // bg-bloom과 동일 소스를 critical로 재요청 -> 중복 제거 및 우선순위 승격
      const pPromoted = compiler.compile(makeDesc("bg-bloom-alias", "critical", "@compute fn main(){/*bg*/}"));

      const results = await Promise.all([pBg, pNormal, pCrit, pHigh, pPromoted]);
      expect(results[0].hash).toBe(results[4].hash);
      expect(compiledOrder).toHaveLength(4);
      expect(compiledOrder.slice(0, 2)).toEqual(["bg-bloom", "crit-brush"]);
      expect(compiledOrder[2]).toBe("high-lt");
      expect(compiledOrder[3]).toBe("norm-blur");
      expect(yields).toBeGreaterThan(0);

      // 동일 정의 순서가 달라도 동일 결정론적 해시로 웜 캐시 즉시 히트(compileMs=0)
      const warmDesc: ShaderPipelineDescriptor = {
        id: "warm-lookup",
        backend: "wgsl",
        source: "@compute fn main(){/*crit*/}",
        defines: { ALPHA: true, PASS: 1 },
      };
      expect(computeShaderPipelineHash(warmDesc)).toBe(results[2].hash);
      const syncHit = compiler.getCached(warmDesc);
      expect(syncHit).not.toBeNull();
      expect(syncHit?.fromCache).toBe(true);
      expect(syncHit?.compileMs).toBe(0);

      const asyncHit = await compiler.compile(warmDesc);
      expect(asyncHit.fromCache).toBe(true);
      expect(asyncHit.compileMs).toBe(0);

      const stats = compiler.getStats();
      expect(stats.coldCompiles).toBe(4);
      expect(stats.warmHits).toBe(2);
      expect(stats.deduplicatedInFlight).toBe(1);
      expect(stats.warmHitRatePct).toBeCloseTo((2 / 6) * 100, 2);
    });
  });

  describe("3. Zero-Copy Multi-Viewport Coordinator (단일 공유 버퍼 · 더티 뷰포트/프러스텀 컬링)", () => {
    it("4개 동시 뷰포트가 단일 버퍼를 참조 공유하고 변경된 뷰포트만 선택 렌더한다", () => {
      const scene = new DodSoaSceneGraph({ initialCapacity: 64 });
      const frontNode = scene.createNode(-1);
      scene.setLocalTranslation(frontNode, 0, 0, -5);
      scene.setLocalBounds(frontNode, 0, 0, 0, 1);

      const farOffNode = scene.createNode(-1);
      scene.setLocalTranslation(farOffNode, 500, 0, 200);
      scene.setLocalBounds(farOffNode, 0, 0, 0, 1);

      scene.updateWorldTransforms();

      const coordinator = new MultiViewportZeroCopyCoordinator();
      coordinator.attachSceneGraph(scene);
      const sharedRef = scene.getWorldMatricesView().buffer;

      const proj = buildShotProjectionMatrix(60, 16 / 9, 0.1, 100);
      const mainView = buildShotViewMatrix({
        position: [0, 0, 0], target: [0, 0, -10], up: [0, 1, 0], fovDeg: 60, near: 0.1, far: 100,
      });
      const popoutView = buildShotViewMatrix({
        position: [500, 0, 210], target: [500, 0, 200], up: [0, 1, 0], fovDeg: 60, near: 0.1, far: 100,
      });

      coordinator.registerViewport({ id: "main", role: "main-canvas", width: 1920, height: 1080, dpr: 2, viewMatrix: mainView, projectionMatrix: proj });
      coordinator.registerViewport({ id: "minimap", role: "minimap", width: 320, height: 180, viewMatrix: mainView, projectionMatrix: proj });
      coordinator.registerViewport({ id: "ref3d", role: "reference-3d", width: 640, height: 640, viewMatrix: mainView, projectionMatrix: proj });
      coordinator.registerViewport({ id: "popout", role: "popout-monitor", width: 1280, height: 720, viewMatrix: popoutView, projectionMatrix: proj });

      const frame1 = coordinator.prepareFrame(scene.version, scene.getWorldBoundsView(), scene.nodeCount);
      expect(frame1.zeroCopyVerified).toBe(true);
      expect(frame1.activeViewportIds).toHaveLength(4);
      expect(frame1.culledViewportIds).toHaveLength(0);
      for (const pass of frame1.passes) {
        expect(pass.sharedBuffer).toBe(sharedRef); // 엄격 참조 동일성(제로카피)
      }

      const mainPass = frame1.passes.find((p) => p.viewportId === "main");
      const popoutPass = frame1.passes.find((p) => p.viewportId === "popout");
      expect(Array.from(mainPass?.visibleNodeIndices ?? [])).toEqual([frontNode]);
      expect(Array.from(popoutPass?.visibleNodeIndices ?? [])).toEqual([farOffNode]);

      // main 카메라만 이동 -> 나머지 3개 뷰포트는 완전 컬링
      coordinator.updateViewportCamera(
        "main",
        buildShotViewMatrix({
          position: [0.5, 0, 0], target: [0, 0, -10], up: [0, 1, 0], fovDeg: 60, near: 0.1, far: 100,
        }),
      );
      const frame2 = coordinator.prepareFrame(scene.version, scene.getWorldBoundsView(), scene.nodeCount);
      expect(frame2.activeViewportIds).toEqual(["main"]);
      expect([...frame2.culledViewportIds].sort()).toEqual(["minimap", "popout", "ref3d"]);
    });
  });

  describe("4. 3D 멀티컷 샷 시퀀서(60컷) & WebGPU LT 변환 v2", () => {
    it("단일 3D 스테이지에서 최대 60컷 레일 보간과 61컷 초과 차단을 처리한다", () => {
      const seq = new ShotRailSequencer("stage-palace-hall");
      for (let i = 0; i < MAX_EPISODE_SHOTS; i += 1) {
        seq.addShot(makeShot(i, i * 0.5));
      }
      expect(seq.shotCount).toBe(60);
      expect(() => seq.addShot(makeShot(60, 30))).toThrow(/최대 컷 수/);

      const midPose = seq.evaluateRailAt(0, 1, 0.5);
      expect(midPose.easedT).toBeCloseTo(0.5, 5);
      expect(midPose.camera.position[0]).toBeCloseTo(0.25, 4);
      expect(midPose.viewMatrix).toHaveLength(16);

      const reordered = seq.reorderShot("cut-60", 0);
      expect(reordered[0].id).toBe("cut-60");
      expect(reordered[0].cutNumber).toBe(1);
    });

    it("WGSL LT v2 셰이더 구조를 검증하고 G-버퍼에서 실루엣·크리즈·셀 섀도우·스크린톤을 추출한다", () => {
      const wgslCheck = validateLtV2WgslSource(WGSL_LT_CONVERSION_V2);
      expect(wgslCheck.valid).toBe(true);
      expect(wgslCheck.hasComputeEntry).toBe(true);
      expect(wgslCheck.hasWorkgroup16x16).toBe(true);
      expect(wgslCheck.bindingCount).toBe(6);

      const width = 48;
      const height = 48;
      const depth = new Float32Array(width * height).fill(1.0);
      const normals = new Float32Array(width * height * 3);
      const objectIds = new Uint32Array(width * height);

      // 중앙 오브젝트(id=1): x=8..39, y=8..39. x=24 기준으로 좌측은 광원 정면, 우측은 90° 꺾인 음영면(크리즈)
      for (let y = 8; y < 40; y += 1) {
        for (let x = 8; x < 40; x += 1) {
          const idx = y * width + x;
          objectIds[idx] = 1;
          depth[idx] = 0.35;
          const n3 = idx * 3;
          if (x < 24) {
            normals[n3] = 0.2; normals[n3 + 1] = 0.3; normals[n3 + 2] = 0.93;
          } else {
            normals[n3] = -0.95; normals[n3 + 1] = -0.2; normals[n3 + 2] = 0.24;
          }
        }
      }

      const lt = extractLtLayersCpu(
        { width, height, depth, normals, objectIds },
        { lightDirection: [0.3, 0.3, 0.9], celBands: 3, halftonePitchPx: 4, halftoneAngleDeg: 45 },
      );

      expect(lt.metrics.silhouettePixels).toBeGreaterThan(80);
      expect(lt.metrics.creasePixels).toBeGreaterThan(20);
      expect(lt.metrics.screentoneDotPixels).toBeGreaterThan(40);

      // 외곽 경계 (8, 20)은 실루엣 감지, 중앙 능선 (24, 20)은 크리즈 감지
      expect(lt.silhouetteMask[20 * width + 8]).toBe(255);
      expect(lt.creaseMask[20 * width + 24]).toBeGreaterThan(180);

      // 밝은 면(x=10..20)에는 스크린톤 도트 0, 어두운 면(x=28..38)에는 스크린톤 도트 다수
      let litToneDots = 0;
      let darkToneDots = 0;
      for (let y = 12; y < 36; y += 1) {
        for (let x = 10; x < 21; x += 1) if (lt.screentoneLayer[y * width + x] > 0) litToneDots += 1;
        for (let x = 27; x < 38; x += 1) if (lt.screentoneLayer[y * width + x] > 0) darkToneDots += 1;
      }
      expect(litToneDots).toBe(0);
      expect(darkToneDots).toBeGreaterThan(30);
    });
  });

  describe("5. 240Hz Coalesced/Predicted Stylus & Barrel-Roll Engine", () => {
    it("240Hz 병합 샘플과 350°→10° 배럴-롤 래핑을 예측하고 잔상(ghost) 0건으로 교체한다", () => {
      const predictor = new Stylus240HzPredictor({ predictionSteps: 2 });
      const dt = STYLUS_DEFAULT_STEP_MS;
      const makeSample = (i: number): StylusSample => ({
        x: 100 + i * 2.5,
        y: 200 + Math.sin(i * 0.08) * 6,
        timestampMs: i * dt,
        pressure: Math.min(1, 0.35 + i * 0.02),
        tiltX: 18,
        tiltY: -12,
        twist: (346 + i * 3) % 360, // 350° -> 359° -> 2° -> 10° 경계 통과
      });

      predictor.beginStroke(makeSample(0));
      let previousPredictedIds: number[] = [];

      for (let batch = 0; batch < 6; batch += 1) {
        const base = 1 + batch * 2;
        const coalesced = [makeSample(base), makeSample(base + 1)];
        const osPred = [makeSample(base + 2), makeSample(base + 3)];
        const update = predictor.ingestPointerBatch(coalesced, osPred);

        // 이전 프레임 예측 오버레이 ID가 100% 폐기되어 잔상 0건
        expect(update.clearedPredictedIds).toEqual(previousPredictedIds);
        expect(update.activeGhostCount).toBe(0);
        expect(update.predictedOverlay).toHaveLength(2);
        expect(update.predictedOverlay.every((s) => s.provisional)).toBe(true);

        // 배럴-롤 각도 변화는 최단 호(약 +3°)를 따르며 180° 이상 점프하지 않음
        for (const seg of update.predictedOverlay) {
          expect(Math.abs(shortestAngleDeltaDeg(seg.twistStartDeg, seg.twistEndDeg))).toBeLessThan(20);
          expect(Math.hypot(seg.nibAxisX, seg.nibAxisY)).toBeCloseTo(1, 5);
        }
        previousPredictedIds = update.predictedOverlay.map((s) => s.id);
      }

      const endUpdate = predictor.endStroke(makeSample(13));
      expect(endUpdate.strokeActive).toBe(false);
      expect(endUpdate.clearedPredictedIds).toEqual(previousPredictedIds);
      expect(endUpdate.predictedOverlay).toHaveLength(0);
      expect(endUpdate.activeGhostCount).toBe(0);

      const metrics = predictor.getMetrics();
      expect(metrics.totalCommittedSegments).toBe(13);
      expect(metrics.totalPredictedCleared).toBe(metrics.totalPredictedGenerated);
      expect(metrics.activeGhostCount).toBe(0);
      expect(metrics.measuredHz).toBeCloseTo(240, 0);
      expect(metrics.meanPredictionErrorPx).toBeLessThan(2.0);
    });
  });

  describe("6. OPFS CAS 버전화 쿼드트리 & Git 스타일 A/B 브랜치 타임라인", () => {
    it("표준 64비트 FNV-1a 해시 벡터와 일치하며 타일 복제 없이 A/B 분기·diff·즉시 복원을 수행한다", async () => {
      expect(fnv1a64StringHex("")).toBe("cbf29ce484222325");
      expect(fnv1a64StringHex("a")).toBe("af63dc4c8601ec8c");
      expect(fnv1a64StringHex("foobar")).toBe("85944171f73967e8");
      expect(fnv1a64Hex(new Uint8Array([1, 2, 3]))).toHaveLength(16);

      const timeline = new OpfsCasBranchTimeline({ gridSize: 16 });
      const initialTiles = Array.from({ length: 32 }, (_, idx) => {
        const bytes = new Uint8Array(64).fill((idx * 7 + 11) & 0xff);
        bytes[0] = idx;
        return { x: idx % 16, y: Math.floor(idx / 16), bytes };
      });
      const baseCommit = await timeline.commitTiles(initialTiles, "1화 원고 기본 레이아웃");
      expect(baseCommit.writtenNewBlobs).toBe(32);

      // A/B 스토리보드 분기: 각각 2개 타일만 수정 -> 30개 미변경 타일 0바이트 복제
      timeline.createBranch("storyboard-a");
      timeline.createBranch("storyboard-b");

      timeline.checkoutBranch("storyboard-a");
      const tileA0 = new Uint8Array(64).fill(0xaa);
      const tileA1 = new Uint8Array(64).fill(0xab);
      const commitA = await timeline.commitTiles(
        [{ x: 1, y: 0, bytes: tileA0 }, { x: 14, y: 1, bytes: tileA1 }],
        "A안 클로즈업 연출",
      );
      expect(commitA.writtenNewBlobs).toBe(2);

      timeline.checkoutBranch("storyboard-b");
      const tileB0 = new Uint8Array(64).fill(0xbb);
      const commitB = await timeline.commitTiles(
        [{ x: 1, y: 0, bytes: tileB0 }, { x: 2, y: 0, bytes: null }],
        "B안 와이드 연출 + 타일 제거",
      );
      expect(commitB.writtenNewBlobs).toBe(1);

      const stats = timeline.getStorageStats();
      expect(stats.uniqueBlobs).toBe(35); // 32 + 2 + 1 (미변경 타일 복제 0건)
      expect(stats.deduplicationRatio).toBeGreaterThan(2.5);

      const diffAB = timeline.diffBranches("storyboard-a", "storyboard-b");
      expect(diffAB.unchangedSubtreesPruned).toBeGreaterThan(0);
      expect(diffAB.entries.map((e) => `${e.x},${e.y}:${e.change}`).sort()).toEqual([
        "1,0:modified",
        "14,1:modified",
        "2,0:removed",
      ]);

      // 스냅샷 즉시 복원: 신규 블롭 쓰기 0건으로 원본 바이트 완벽 복구
      const restored = timeline.restoreToCommit(baseCommit.commitId, "기본안 복원");
      expect(restored.writtenNewBlobs).toBe(0);
      const restoredTile10 = await timeline.readTile(1, 0);
      expect(restoredTile10?.[0]).toBe(1);
      expect(restoredTile10?.[1]).toBe((1 * 7 + 11) & 0xff);
      expect(await timeline.readTile(2, 0)).not.toBeNull();

      // OPFS 디렉터리 어댑터 라운드트립 검증
      const fakeFiles = new Map<string, Uint8Array>();
      const mockDir: OpfsDirectoryHandleLike = {
        getFileHandle: async (name, opts) => {
          if (!fakeFiles.has(name) && !opts?.create) throw new Error("NotFound");
          return {
            getFile: async () => ({
              arrayBuffer: async () => (fakeFiles.get(name) ?? new Uint8Array()).slice().buffer,
            }),
            createWritable: async () => ({
              write: async (data) => { fakeFiles.set(name, new Uint8Array(data)); },
              close: async () => {},
            }),
          };
        },
      };
      const opfsStore = new OpfsDirectoryCasBlobStore(mockDir);
      const sampleBytes = new Uint8Array([9, 8, 7, 6]);
      const sampleHash = fnv1a64Hex(sampleBytes);
      expect(await opfsStore.put(sampleHash, sampleBytes)).toBe(true);
      expect(await opfsStore.put(sampleHash, sampleBytes)).toBe(false); // 중복 쓰기 스킵
      expect(Array.from((await opfsStore.get(sampleHash)) ?? [])).toEqual([9, 8, 7, 6]);
    });
  });

  describe("7. Kademlia XOR DHT 피어 탐색 및 P2P 델타 복구 라우터 (₩0 중앙 릴레이)", () => {
    it("64비트 XOR 거리 순위·버킷 교체·다중 피어 델타 복구 부하 분산을 검증한다", () => {
      const localId = "0000000000000001";
      expect(xorDistance64(localId, localId)).toEqual([0, 0]);
      expect(bucketIndex64(localId, "0000000000000000")).toBe(0);
      expect(bucketIndex64(localId, "8000000000000001")).toBe(63);

      const router = new KademliaP2pPeerRouter({ localPeerId: localId, kBucketSize: 12, now: () => 10_000 });
      const tileHashes = Array.from({ length: 12 }, (_, i) => fnv1a64StringHex(`missing-tile-${i}`));

      // 36개 피어 등록 (상위 12개 건강한 피어에 tileHashes[0..7] 분산 배치)
      for (let i = 0; i < 36; i += 1) {
        const peerId = fnv1a64StringHex(`peer-node-${i}`);
        const held = i < 12 ? [tileHashes[i % 8], tileHashes[(i + 1) % 8]] : [];
        router.upsertPeer({
          peerId,
          rttMs: i < 12 ? 12 + (i % 4) * 4 : 30 + (i % 7) * 9,
          reliability: i < 12 ? 0.98 : 0.85,
          lastSeenMs: 9_950,
          availableTileHashes: held,
        });
      }

      const target = tileHashes[0];
      const closest = router.findClosestPeers(target, 6);
      expect(closest).toHaveLength(6);
      for (let i = 1; i < closest.length; i += 1) {
        expect(compareDistance64(closest[i - 1].distance, closest[i].distance)).toBeLessThanOrEqual(0);
      }

      // 동일 버킷(bucket 63)이 가득 찼을 때 건강도가 낮은 피어를 건강한 신규 피어로 교체
      const bucket63Router = new KademliaP2pPeerRouter({ localPeerId: "0000000000000000", kBucketSize: 2, now: () => 10_000 });
      bucket63Router.upsertPeer({ peerId: "8000000000000001", rttMs: 400, reliability: 0.25, lastSeenMs: 1_000 });
      bucket63Router.upsertPeer({ peerId: "8000000000000002", rttMs: 25, reliability: 0.98, lastSeenMs: 9_950 });
      const eviction = bucket63Router.upsertPeer({ peerId: "8000000000000003", rttMs: 18, reliability: 0.99, lastSeenMs: 9_990 });
      expect(eviction.inserted).toBe(true);
      expect(eviction.evictedPeerId).toBe("8000000000000001");

      // 12개 누락 타일(8개는 보유 피어 존재, 4개는 DHT 최근접 조회 폴백) 복구 계획
      const plan = router.planDeltaRecovery(tileHashes, { maxPeersPerTile: 2, maxConcurrentPerPeer: 3 });
      expect(plan.requestedCount).toBe(12);
      expect(plan.directlyRecoverableCount).toBe(8);
      expect(plan.dhtLookupFallbackCount).toBe(4);
      expect(plan.unrecoverableCount).toBe(0);
      expect(plan.centralRelayBytes).toBe(0);
      expect(Object.keys(plan.peerLoadCounts).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("8. WebCrypto Rights BOM · C2PA 출처 봉인 및 오프라인 한국어 스타일 어시스턴트", () => {
    it("WebCrypto 서명·해시체인을 검증하고 단 1바이트 위변조 시 모든 벡터를 즉시 거부한다", async () => {
      const detected = await detectPreferredSigningAlgorithm();
      expect(["Ed25519", "ECDSA-P256"]).toContain(detected);

      // ECDSA P-256 및 자동 감지 알고리즘 모두 검증
      const keyPair = await generateProvenanceKeyPair({ preferAlgorithm: "ECDSA-P256" });
      const tile0 = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const tile1 = new Uint8Array([70, 80, 90, 100, 110, 120]);

      const manifest = await sealRightsBomProvenance({
        workId: "work-rofan-01",
        episodeId: "ep-01",
        creatorId: "creator-hj",
        tiles: [
          { tileId: "tile-0-0", bytes: tile0 },
          { tileId: "tile-0-1", bytes: tile1 },
        ],
        licenses: [
          {
            assetId: "bg3d-palace",
            assetKind: "3d-model",
            title: "황궁 발코니 3D 배경",
            licenseCode: "CC0-1.0",
            commercialAllowed: true,
            attribution: "ToonStudio CC0 Pack",
            sourceHash: fnv1a64StringHex("bg3d-palace.glb"),
          },
          {
            assetId: "font-pretendard",
            assetKind: "font",
            title: "Pretendard Variable",
            licenseCode: "OFL-1.1",
            commercialAllowed: true,
            attribution: "Kil Hyung-jin",
            sourceHash: fnv1a64StringHex("Pretendard.woff2"),
          },
        ],
        aiAssistRecords: [
          {
            stepId: "assist-01",
            tool: "LocalStyleKeywordAssistant",
            scope: "style-keyword",
            modelId: "offline-bm25-vec256",
            humanEditedRatio: 1.0,
            recordedAtIso: "2026-11-26T07:30:00.000Z",
          },
        ],
        keyPair,
        createdAtIso: "2026-11-26T07:35:00.000Z",
      });

      const ok = await verifyRightsBomProvenance(manifest, {
        rawTiles: { "tile-0-0": tile0, "tile-0-1": tile1 },
      });
      expect(ok.valid).toBe(true);
      expect(ok.signatureValid).toBe(true);
      expect(ok.hashChainValid).toBe(true);
      expect(ok.tileDigestsValid).toBe(true);
      expect(ok.commercialExportClear).toBe(true);

      // 위변조 벡터 1: 원고 타일 1바이트(1비트) 변조
      const tamperedTile0 = new Uint8Array(tile0);
      tamperedTile0[3] ^= 0x01;
      const tileTamper = await verifyRightsBomProvenance(manifest, {
        rawTiles: { "tile-0-0": tamperedTile0, "tile-0-1": tile1 },
      });
      expect(tileTamper.valid).toBe(false);
      expect(tileTamper.tileDigestsValid).toBe(false);

      // 위변조 벡터 2: 라이선스 commercialAllowed 1필드 변조
      const tamperedLicense = {
        ...manifest,
        licenses: manifest.licenses.map((l, i) => (i === 0 ? { ...l, attribution: "Forged Author" } : l)),
      };
      const licTamper = await verifyRightsBomProvenance(tamperedLicense);
      expect(licTamper.valid).toBe(false);
      expect(licTamper.hashChainValid).toBe(false);
      expect(licTamper.signatureValid).toBe(false);

      // 위변조 벡터 3: AI 보조 이력 변조
      const tamperedAi = {
        ...manifest,
        aiAssistRecords: [{ ...manifest.aiAssistRecords[0], humanEditedRatio: 0.99 }],
      };
      const aiTamper = await verifyRightsBomProvenance(tamperedAi);
      expect(aiTamper.valid).toBe(false);
      expect(aiTamper.hashChainValid).toBe(false);

      // 위변조 벡터 4: 서명 1문자 변조
      const flippedChar = manifest.signatureBase64Url[0] === "A" ? "B" : "A";
      const sigTamper = await verifyRightsBomProvenance({
        ...manifest,
        signatureBase64Url: flippedChar + manifest.signatureBase64Url.slice(1),
      });
      expect(sigTamper.valid).toBe(false);
      expect(sigTamper.signatureValid).toBe(false);

      // 자동 감지 알고리즘(Ed25519 우선 / ECDSA P-256 폴백) + 비상업 라이선스 출고 게이트 검증
      const autoKeyPair = await generateProvenanceKeyPair({ preferAlgorithm: "auto" });
      expect(autoKeyPair.algorithm).toBe(detected);
      const nonCommercialManifest = await sealRightsBomProvenance({
        workId: "work-rofan-01",
        episodeId: "ep-02",
        creatorId: "creator-hj",
        tiles: [{ tileId: "tile-0-0", bytes: tile0 }],
        licenses: [
          {
            assetId: "font-personal-only",
            assetKind: "font",
            title: "개인 비상업 전용 서체",
            licenseCode: "CC-BY-NC-4.0",
            commercialAllowed: false,
            attribution: "Demo Foundry",
            sourceHash: fnv1a64StringHex("personal-font.woff2"),
          },
        ],
        aiAssistRecords: [],
        keyPair: autoKeyPair,
        parentManifestHash: manifest.manifestDigestHex,
      });
      const ncCheck = await verifyRightsBomProvenance(nonCommercialManifest, {
        rawTiles: { "tile-0-0": tile0 },
        expectedParentManifestHash: manifest.manifestDigestHex,
      });
      expect(ncCheck.valid).toBe(true);
      expect(ncCheck.signatureValid).toBe(true);
      expect(ncCheck.commercialExportClear).toBe(false);
    });

    it("오프라인 한국어·영어 스타일 키워드를 BM25+256차원 코사인으로 추천하고 Chrome AI 폴백을 지원한다", async () => {
      const assistant = new LocalStyleKeywordAssistant({ chromeAiAdapter: null });

      const v1 = embedStyleText256("로판 황궁 석양 무도회");
      const v2 = embedStyleText256("로판 황궁 석양 드레스");
      const v3 = embedStyleText256("사이버펑크 빗속 네온 골목");
      expect(v1).toHaveLength(STYLE_EMBEDDING_DIM);
      expect(cosineSimilarity256(v1, v2)).toBeGreaterThan(cosineSimilarity256(v1, v3));

      const rofan = assistant.recommendOffline("로판 황궁 석양 로맨틱 무도회 느낌");
      expect(rofan.cloudTokensUsed).toBe(0);
      expect(rofan.engine).toBe("offline-bm25-vec256");
      expect(rofan.recommendations[0].archetype.id).toBe("rofan-palace-sunset");
      expect(rofan.recommendations[0].bm25Score).toBeGreaterThan(0);
      expect(rofan.recommendations[0].vectorCosineScore).toBeGreaterThan(0);

      const cyber = assistant.recommendOffline("사이버펑크 빗속 네온 누아르 골목");
      expect(cyber.recommendations[0].archetype.id).toBe("cyberpunk-rain-noir");

      const wuxia = assistant.recommendOffline("무협 수묵화 먹선 검극 비무");
      expect(wuxia.recommendations[0].archetype.id).toBe("wuxia-ink-duel");

      const horrorEn = assistant.recommendOffline("haunted dark horror corridor suspense");
      expect(horrorEn.recommendations[0].archetype.id).toBe("occult-horror-mansion");

      // Chrome 내장 AI 어댑터 보강 모드(토큰 0)
      const mockChromeAi: ChromeBuiltinAiAdapter = {
        availability: async () => "available",
        create: async () => ({
          prompt: async () => "황금 역광을 28°로 낮추고 발코니 아치로 시선을 중앙에 모아 주세요.",
          destroy: () => {},
        }),
      };
      const aiAssistant = new LocalStyleKeywordAssistant({ chromeAiAdapter: mockChromeAi });
      const augmented = await aiAssistant.recommend("로판 황궁 석양");
      expect(augmented.engine).toBe("chrome-builtin-ai-augmented");
      expect(augmented.cloudTokensUsed).toBe(0);
      expect(augmented.directorNoteKo).toContain("발코니 아치");

      // Chrome AI 오류 시 결정론적 오프라인 폴백
      const failingChromeAi: ChromeBuiltinAiAdapter = {
        create: async () => { throw new Error("On-device model busy"); },
      };
      const fallbackAssistant = new LocalStyleKeywordAssistant({ chromeAiAdapter: failingChromeAi });
      const fallbackRes = await fallbackAssistant.recommend("무협 수묵 검극");
      expect(fallbackRes.engine).toBe("offline-bm25-vec256");
      expect(fallbackRes.recommendations[0].archetype.id).toBe("wuxia-ink-duel");
    });
  });
});
