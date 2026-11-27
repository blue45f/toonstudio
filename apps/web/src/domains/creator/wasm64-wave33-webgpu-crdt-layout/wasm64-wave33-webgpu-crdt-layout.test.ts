import { describe, expect, it } from "vitest";

import {
  CRDT_SUBTILE_SIZE_PX,
  CrdtLayerSubtileCollabEngine,
  DEFAULT_BYTES_PER_TILE,
  MIN_READABLE_BALLOON_FONT_PX,
  SHORTFORM_CANVAS_HEIGHT_PX,
  SHORTFORM_CANVAS_WIDTH_PX,
  WEBGPU_BLEND_MODES,
  WEBGPU_TILE_SIZE_PX,
  WebGpuDirtyTileMipmapCompositor,
  blendPremultipliedRgba,
  blendStraightRgba,
  coalesceDirtyTilesIntoDispatchRects,
  compareCodeUnitStrings,
  compositeTileLayerStackPremultiplied,
  computeBalloonBoxForLegibility,
  downsamplePremultipliedMip2x2,
  generateFractionalKeyBetween,
  generateSequentialFractionalKeys,
  premultipliedToStraightRgba,
  propagateDirtyTilesToMipPyramid,
  reflowCanonicalCutsToFormat,
  straightToPremultipliedRgba,
  verifyReflowReadabilityInvariants,
  type CanonicalCutSpec,
  type CrdtCollabOperation,
  type DialogueBalloonSpec,
  type RgbaColorTuple,
} from "./index";

function makeBalloon(
  balloonId: string,
  speakerOrder: number,
  textLengthChars: number,
  sourceFontSizePx: number,
  xNorm: number,
  yNorm: number,
): DialogueBalloonSpec {
  return { balloonId, speakerOrder, textLengthChars, sourceFontSizePx, sourceCutWidthPx: 800, anchorNorm: { xNorm, yNorm } };
}

function makeCut(
  cutId: string,
  orderIndex: number,
  intrinsicAspectRatio: number,
  importanceWeight: number,
  dramaticPacingBeat: CanonicalCutSpec["dramaticPacingBeat"],
  xNorm: number,
  yNorm: number,
  balloons: ReadonlyArray<DialogueBalloonSpec>,
): CanonicalCutSpec {
  return { cutId, orderIndex, intrinsicAspectRatio, importanceWeight, dramaticPacingBeat, focalAnchor: { xNorm, yNorm }, balloons };
}

function createSampleEpisodeCuts(): ReadonlyArray<CanonicalCutSpec> {
  return [
    makeCut("cut-01-intro", 0, 1.45, 0.65, "calm", 0.5, 0.42, [makeBalloon("b-01-a", 0, 18, 14, 0.25, 0.2)]),
    makeCut("cut-02-dialogue", 1, 0.95, 0.45, "dialogue", 0.48, 0.52, [
      makeBalloon("b-02-a", 0, 24, 12, 0.22, 0.18),
      makeBalloon("b-02-b", 1, 31, 11.5, 0.76, 0.58),
    ]),
    makeCut("cut-03-reaction", 2, 0.85, 0.38, "tension", 0.55, 0.46, [makeBalloon("b-03-a", 0, 12, 12, 0.68, 0.24)]),
    makeCut("cut-04-reveal", 3, 1.2, 0.75, "reveal", 0.35, 0.5, [makeBalloon("b-04-a", 0, 28, 13, 0.7, 0.22)]),
    makeCut("cut-05-climax", 4, 0.72, 1.15, "climax", 0.5, 0.38, [makeBalloon("b-05-a", 0, 16, 18, 0.2, 0.14)]),
  ];
}

function deterministicShuffle<T>(items: ReadonlyArray<T>, seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = copy[i];
    const picked = copy[j];
    if (tmp !== undefined && picked !== undefined) {
      copy[i] = picked;
      copy[j] = tmp;
    }
  }
  return copy;
}

describe("wasm64-wave33-webgpu-crdt-layout", () => {
  describe("WebGPU 더티 타일 & 밉맵 합성 스케줄러", () => {
    it("1. 6종 표준 웹툰 블렌드 모드의 직선 알파와 프리멀티플라이드 알파 합성 결과가 1e-6 이내로 일치한다", () => {
      const backdrops: ReadonlyArray<RgbaColorTuple> = [
        [0.18, 0.42, 0.77, 0.85],
        [0.82, 0.31, 0.24, 0.62],
        [0.5, 0.5, 0.5, 1],
        [0, 0.9, 0.4, 0.35],
      ];
      const sources: ReadonlyArray<RgbaColorTuple> = [
        [0.91, 0.64, 0.12, 0.74],
        [0.12, 0.25, 0.88, 0.48],
        [1, 1, 1, 0.9],
        [0.05, 0.05, 0.08, 0.8],
      ];

      for (const mode of WEBGPU_BLEND_MODES) {
        for (const dst of backdrops) {
          for (const src of sources) {
            const viaStraight = straightToPremultipliedRgba(blendStraightRgba(dst, src, mode, 0.82));
            const viaPremul = blendPremultipliedRgba(
              straightToPremultipliedRgba(dst),
              straightToPremultipliedRgba(src),
              mode,
              0.82,
            );
            for (let c = 0; c < 4; c += 1) {
              expect(Math.abs((viaStraight[c] ?? 0) - (viaPremul[c] ?? 0))).toBeLessThan(1e-6);
            }
          }
        }
      }
    });

    it("2. 투명 배경·0 불투명도·비정상(NaN/초과) 입력에서도 나눗셈 오염 없이 안전하게 동작한다", () => {
      const vivid: RgbaColorTuple = [0.8, 0.3, 0.5, 0.75];
      for (const mode of WEBGPU_BLEND_MODES) {
        const overEmpty = premultipliedToStraightRgba(
          blendPremultipliedRgba([0, 0, 0, 0], straightToPremultipliedRgba(vivid), mode, 1),
        );
        expect(overEmpty[0]).toBeCloseTo(0.8, 5);
        expect(overEmpty[3]).toBeCloseTo(0.75, 5);
        const zeroOpacity = blendPremultipliedRgba(straightToPremultipliedRgba(vivid), [0.5, 0.5, 0.5, 1], mode, 0);
        expect(zeroOpacity[3]).toBeCloseTo(0.75, 6);
      }

      const sanitized = blendStraightRgba([Number.NaN, -2, 4, 1.5], [0.5, Number.POSITIVE_INFINITY, -0.4, 0.5], "color-dodge", 1);
      for (const channel of sanitized) {
        expect(Number.isFinite(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    });

    it("3. 대각선 스타일러스 캡슐 마킹이 전체 AABB 대비 빈 모서리 타일을 정밀 컬링한다", () => {
      const compositor = new WebGpuDirtyTileMipmapCompositor({ canvasWidthPx: 640, canvasHeightPx: 640 });
      const marked = compositor.markDirtyStylusCapsule(32, 32, 600, 600, 6);
      expect(marked).toBeGreaterThanOrEqual(10);
      expect(marked).toBeLessThan(40);
      expect(compositor.isTileDirty(0, 0)).toBe(true);
      expect(compositor.isTileDirty(9, 9)).toBe(true);
      expect(compositor.isTileDirty(0, 9)).toBe(false);
      expect(compositor.isTileDirty(9, 0)).toBe(false);
    });

    it("4. 인접 더티 타일 2D 병합이 가로·세로 블록을 단일 디스패치 직사각형으로 압축하고 경계와 상한을 지킨다", () => {
      const tiles = [];
      for (let ty = 1; ty <= 3; ty += 1) {
        for (let tx = 2; tx <= 5; tx += 1) tiles.push({ tileX: tx, tileY: ty });
      }
      // 우하단 2x2 경계 타일(8..9, 8..9) -> 600x600 캔버스 경계로 클리핑되어 88x88px 직사각형으로 병합
      tiles.push({ tileX: 8, tileY: 8 }, { tileX: 9, tileY: 8 }, { tileX: 8, tileY: 9 }, { tileX: 9, tileY: 9 });

      const merged = coalesceDirtyTilesIntoDispatchRects(tiles, 600, 600, {
        maxMergedWidthTiles: 8,
        maxMergedHeightTiles: 8,
      });
      expect(merged).toHaveLength(2);
      expect(merged[0]).toMatchObject({
        tileX: 2,
        tileY: 1,
        tileWidth: 4,
        tileHeight: 3,
        pixelRect: { x: 128, y: 64, width: 256, height: 192 },
        workgroupCountX: 32,
        workgroupCountY: 24,
      });
      expect(merged[1]?.pixelRect).toEqual({ x: 512, y: 512, width: 88, height: 88 });

      const splitByCap = coalesceDirtyTilesIntoDispatchRects(tiles, 600, 600, {
        maxMergedWidthTiles: 2,
        maxMergedHeightTiles: 2,
      });
      expect(splitByCap.length).toBe(5);
    });

    it("5. 밉맵 피라미드 더티 전파가 인접 2x2 자식 타일을 상위 레벨 단일 부모 타일로 수렴시킨다", () => {
      const level0 = [
        { tileX: 2, tileY: 4 },
        { tileX: 3, tileY: 4 },
        { tileX: 2, tileY: 5 },
        { tileX: 3, tileY: 5 },
      ];
      const pyramid = propagateDirtyTilesToMipPyramid(level0, 1024, 1024);
      expect(pyramid.length).toBe(11);
      expect(pyramid[0]?.dirtyTiles).toHaveLength(4);
      expect(pyramid[1]?.dirtyTiles).toEqual([{ tileX: 1, tileY: 2 }]);
      expect(pyramid[2]?.dirtyTiles).toEqual([{ tileX: 0, tileY: 1 }]);
      const apex = pyramid[pyramid.length - 1];
      expect(apex?.widthPx).toBe(1);
      expect(apex?.dirtyTiles).toEqual([{ tileX: 0, tileY: 0 }]);
    });

    it("6. 프리멀티플라이드 2x2 박스 필터 다운샘플링이 투명 경계의 색 순도를 해치지 않는다", () => {
      const src = new Float32Array(2 * 2 * 4);
      src.set([1.0, 0.5, 0.0, 1.0], 0);
      const mip = downsamplePremultipliedMip2x2(src, 2, 2);
      const recovered = premultipliedToStraightRgba([
        mip.data[0] ?? 0,
        mip.data[1] ?? 0,
        mip.data[2] ?? 0,
        mip.data[3] ?? 0,
      ]);
      expect(recovered[0]).toBeCloseTo(1.0, 6);
      expect(recovered[1]).toBeCloseTo(0.5, 6);
      expect(recovered[2]).toBeCloseTo(0.0, 6);
      expect(recovered[3]).toBeCloseTo(0.25, 6);
    });

    it("7. 다중 레이어 64x64 타일 스택 합성이 비가시 레이어를 건너뛰고 블렌드 모드를 정확히 누적한다", () => {
      const pixelLen = 4 * 4 * 4;
      const baseBuf = new Float32Array(pixelLen);
      const mulBuf = new Float32Array(pixelLen);
      const hiddenBuf = new Float32Array(pixelLen);
      for (let i = 0; i < 16; i += 1) {
        baseBuf.set([0.8, 0.6, 0.4, 1.0], i * 4);
        mulBuf.set([0.5, 0.5, 0.5, 1.0], i * 4);
        hiddenBuf.set([1.0, 0.0, 0.0, 1.0], i * 4);
      }

      const out = compositeTileLayerStackPremultiplied(
        [
          { layerId: "base", visible: true, opacity: 1, blendMode: "normal", premultipliedRgba: baseBuf },
          { layerId: "hidden", visible: false, opacity: 1, blendMode: "normal", premultipliedRgba: hiddenBuf },
          { layerId: "shade", visible: true, opacity: 1, blendMode: "multiply", premultipliedRgba: mulBuf },
        ],
        4,
        4,
      );
      expect(out[0]).toBeCloseTo(0.4, 5);
      expect(out[1]).toBeCloseTo(0.3, 5);
      expect(out[2]).toBeCloseTo(0.2, 5);
      expect(out[3]).toBeCloseTo(1.0, 5);
    });

    it("8. 프레임당 VRAM·타일·디스패치 예산 초과 시 뷰포트 초점 타일을 우선 합성하고 잔여분을 순차 소진한다", () => {
      const compositor = new WebGpuDirtyTileMipmapCompositor({
        canvasWidthPx: 2048,
        canvasHeightPx: 2048,
        agingBoostPerFrame: 256,
      });
      compositor.markDirtyPixelRect({ x: 0, y: 0, width: 2048, height: 512 });
      expect(compositor.pendingDirtyTileCount).toBe(256);

      const viewport = { viewportRectPx: { x: 512, y: 0, width: 256, height: 256 }, focusX: 640, focusY: 128 };
      const budget = {
        maxTilesPerFrame: 16,
        maxDispatchCountPerFrame: 6,
        maxTransientVramBytesPerFrame: 12 * DEFAULT_BYTES_PER_TILE,
      };

      const frame1 = compositor.scheduleFrameComposition(viewport, budget);
      expect(frame1.scheduledTiles.length).toBeLessThanOrEqual(12);
      expect(frame1.coalescedDispatches.length).toBeLessThanOrEqual(6);
      expect(frame1.inViewportScheduledCount).toBe(frame1.scheduledTiles.length);
      expect(frame1.deferredTileCount).toBe(256 - frame1.scheduledTiles.length);

      let safetyGuard = 0;
      while (compositor.pendingDirtyTileCount > 0 && safetyGuard < 40) {
        compositor.scheduleFrameComposition(viewport, budget);
        safetyGuard += 1;
      }
      expect(compositor.pendingDirtyTileCount).toBe(0);
    });

    it("9. 4096x8192 고해상도 캔버스에서 120Hz 스타일러스 더티 타일 스케줄링이 < 1ms 안에 완료된다", () => {
      const compositor = new WebGpuDirtyTileMipmapCompositor({ canvasWidthPx: 4096, canvasHeightPx: 8192 });
      const viewport = { viewportRectPx: { x: 1024, y: 2048, width: 1280, height: 1600 }, focusX: 1600, focusY: 2800 };
      const budget = {
        maxTilesPerFrame: 32,
        maxDispatchCountPerFrame: 16,
        maxTransientVramBytesPerFrame: 32 * DEFAULT_BYTES_PER_TILE,
      };

      for (let w = 0; w < 2; w += 1) {
        compositor.markDirtyStylusCapsule(1500, 2700, 1780, 2920, 28);
        compositor.scheduleFrameComposition(viewport, budget);
      }

      const durationsMs: number[] = [];
      for (let run = 0; run < 15; run += 1) {
        const sx = 1200 + run * 24;
        const sy = 2200 + run * 32;
        const t0 = performance.now();
        compositor.markDirtyStylusCapsule(sx, sy, sx + 220, sy + 180, 24);
        const schedule = compositor.scheduleFrameComposition(viewport, budget);
        durationsMs.push(performance.now() - t0);
        expect(schedule.scheduledTiles.length).toBeGreaterThan(0);
      }
      durationsMs.sort((a, b) => a - b);
      expect(durationsMs[Math.floor(durationsMs.length / 2)] ?? 0).toBeLessThan(1.0);
    });
  });

  describe("하이브리드 레이어 트리 + 서브타일 CRDT 병합 엔진", () => {
    it("10. 사전순 분수 인덱스가 전단·후단·동일 구간 120회 연속 삽입에서도 엄격 단조성과 비영('0') 말미를 유지한다", () => {
      const first = generateFractionalKeyBetween(null, null);
      const before = generateFractionalKeyBetween(null, first);
      const after = generateFractionalKeyBetween(first, null);
      expect(compareCodeUnitStrings(before, first)).toBeLessThan(0);
      expect(compareCodeUnitStrings(first, after)).toBeLessThan(0);

      let cursor = first;
      for (let i = 0; i < 120; i += 1) {
        const mid = generateFractionalKeyBetween(before, cursor);
        expect(mid.endsWith("0")).toBe(false);
        expect(compareCodeUnitStrings(before, mid)).toBeLessThan(0);
        expect(compareCodeUnitStrings(mid, cursor)).toBeLessThan(0);
        cursor = mid;
      }
    });

    it("11. 분수 인덱스 하한 >= 상한 또는 비허용 문자가 주어지면 RangeError를 던진다", () => {
      expect(() => generateFractionalKeyBetween("W", "V")).toThrow(RangeError);
      expect(() => generateFractionalKeyBetween("V", "V")).toThrow(RangeError);
      expect(() => generateFractionalKeyBetween("bad-char!", null)).toThrow(RangeError);
      expect(() => generateFractionalKeyBetween("000", null)).toThrow(RangeError);
    });

    it("12. 균등 분수 인덱스 배치 생성기가 코드 유닛 오름차순 키 배열을 결정론적으로 반환한다", () => {
      const keysA = generateSequentialFractionalKeys(12);
      const keysB = generateSequentialFractionalKeys(12);
      expect(keysA).toEqual(keysB);
      expect(keysA).toHaveLength(12);
      for (let i = 1; i < keysA.length; i += 1) {
        expect(compareCodeUnitStrings(keysA[i - 1] ?? "", keysA[i] ?? "")).toBeLessThan(0);
      }
    });

    it("13. 두 작업자가 동일한 두 레이어 사이에 동시에 새 레이어를 삽입해도 동일한 Z-order로 수렴한다", () => {
      const peerA = new CrdtLayerSubtileCollabEngine("artist-tablet");
      const peerB = new CrdtLayerSubtileCollabEngine("assist-desktop");
      const baseOp: CrdtCollabOperation = { ...peerA.nextCausalStamp(), kind: "create-layer", layerId: "layer-bg", layerKind: "raster", parentId: null, name: "배경", zOrderKey: "B" };
      const topOp: CrdtCollabOperation = { ...peerA.nextCausalStamp(), kind: "create-layer", layerId: "layer-ink", layerKind: "raster", parentId: null, name: "선화", zOrderKey: "N" };
      peerA.applyOperations([baseOp, topOp]);
      peerB.applyOperations([baseOp, topOp]);

      const sharedMidZ = generateFractionalKeyBetween("B", "N");
      const opFromA: CrdtCollabOperation = { ...peerA.nextCausalStamp(), kind: "create-layer", layerId: "layer-tone-a", layerKind: "raster", parentId: null, name: "스크린톤", zOrderKey: sharedMidZ };
      const opFromB: CrdtCollabOperation = { ...peerB.nextCausalStamp(), kind: "create-layer", layerId: "layer-color-b", layerKind: "raster", parentId: null, name: "밑색", zOrderKey: sharedMidZ };

      peerA.applyOperations([opFromA, opFromB]);
      peerB.applyOperations([opFromB, opFromA]);
      expect(peerA.getOrderedLayers().map((l) => l.layerId)).toEqual(peerB.getOrderedLayers().map((l) => l.layerId));
      expect(peerA.computeStateDigestHex()).toBe(peerB.computeStateDigestHex());
    });

    it("14. 동일 Lamport 시각 충돌 시 작성자 ID 사전순 타이브레이커로 LWW 레이어 속성이 일치 수렴한다", () => {
      const peer1 = new CrdtLayerSubtileCollabEngine("actor-alpha");
      const peer2 = new CrdtLayerSubtileCollabEngine("actor-zeta");
      const createOp: CrdtCollabOperation = { lamport: 1, actorId: "actor-alpha", opId: "init-1", kind: "create-layer", layerId: "shade-1", layerKind: "raster", parentId: null, name: "그림자", zOrderKey: "V" };
      const propAlpha: CrdtCollabOperation = { lamport: 5, actorId: "actor-alpha", opId: "alpha-5", kind: "update-layer-props", layerId: "shade-1", patch: { opacity: 0.45, blendMode: "multiply", clippingMask: true } };
      const propZeta: CrdtCollabOperation = { lamport: 5, actorId: "actor-zeta", opId: "zeta-5", kind: "update-layer-props", layerId: "shade-1", patch: { opacity: 0.72, blendMode: "linear-burn", locked: true } };

      peer1.applyOperations([createOp, propAlpha, propZeta]);
      peer2.applyOperations([propZeta, createOp, propAlpha]);
      const snap1 = peer1.getLayerSnapshot("shade-1");
      expect(snap1).toEqual(peer2.getLayerSnapshot("shade-1"));
      expect(snap1?.opacity).toBeCloseTo(0.72, 6);
      expect(snap1?.blendMode).toBe("linear-burn");
      expect(snap1?.clippingMask).toBe(true);
      expect(snap1?.locked).toBe(true);
    });

    it("15. 동시 교차 폴더 이동(A->B 및 B->A)이 모든 수신 순서에서 사이클 없는 단일 트리로 수렴한다", () => {
      const ops: ReadonlyArray<CrdtCollabOperation> = [
        { lamport: 1, actorId: "a", opId: "c-a", kind: "create-layer", layerId: "folder-a", layerKind: "group", parentId: null, name: "인물 폴더", zOrderKey: "G" },
        { lamport: 2, actorId: "b", opId: "c-b", kind: "create-layer", layerId: "folder-b", layerKind: "group", parentId: null, name: "배경 폴더", zOrderKey: "R" },
        { lamport: 3, actorId: "a", opId: "m-ab", kind: "move-layer", layerId: "folder-a", targetParentId: "folder-b" },
        { lamport: 3, actorId: "b", opId: "m-ba", kind: "move-layer", layerId: "folder-b", targetParentId: "folder-a" },
      ];
      const forward = new CrdtLayerSubtileCollabEngine("node-1");
      const reverse = new CrdtLayerSubtileCollabEngine("node-2");
      forward.applyOperations(ops);
      reverse.applyOperations([...ops].reverse());

      expect(forward.getOrderedLayers()).toEqual(reverse.getOrderedLayers());
      expect(forward.getOrderedLayers()).toHaveLength(2);
      const aParent = forward.getLayerSnapshot("folder-a")?.parentId;
      const bParent = forward.getLayerSnapshot("folder-b")?.parentId;
      expect(aParent === "folder-b" && bParent === "folder-a").toBe(false);
    });

    it("16. 서브타일 소프트 의도 잠금이 타 레이어 작업은 즉시 허용하고 동일 타일 충돌과 TTL 만료를 정확히 판별한다", () => {
      const lineArtist = new CrdtLayerSubtileCollabEngine("tablet-line");
      const colorAssist = new CrdtLayerSubtileCollabEngine("desktop-color");
      const leaseLine = lineArtist.acquireSubtileIntentLease({
        layerId: "layer-line",
        tileX: 3,
        tileY: 5,
        role: "line-art",
        nowMs: 1_000,
        ttlMs: 2_000,
      });
      expect(leaseLine.status).toBe("granted");
      colorAssist.applyOperation(leaseLine.operation);

      const parallelColor = colorAssist.acquireSubtileIntentLease({
        layerId: "layer-color",
        tileX: 3,
        tileY: 5,
        role: "coloring",
        nowMs: 1_500,
        ttlMs: 2_000,
      });
      expect(parallelColor.status).toBe("granted");

      const sameTile = colorAssist.acquireSubtileIntentLease({
        layerId: "layer-line",
        tileX: 3,
        tileY: 5,
        role: "assistant",
        nowMs: 2_200,
        ttlMs: 1_500,
      });
      expect(sameTile.status).toBe("soft-conflict");
      expect(sameTile.conflictingLeases[0]?.actorId).toBe("tablet-line");
      expect(colorAssist.getActiveSubtileLeases("layer-line", 3, 5, 4_000)).toHaveLength(0);
    });

    it("17. 오퍼레이션 중복 전달(Idempotency) 시 픽셀 누적이 두 번 일어나지 않고 상태 해시가 보존된다", () => {
      const engine = new CrdtLayerSubtileCollabEngine("solo-peer");
      const patchOp: CrdtCollabOperation = {
        ...engine.nextCausalStamp(),
        kind: "subtile-patch",
        layerId: "ink",
        tileX: 0,
        tileY: 0,
        patchMode: "alpha-over",
        pixels: [{ localX: 10, localY: 12, r: 64, g: 32, b: 16, a: 128 }],
      };
      expect(engine.applyOperation(patchOp)).toBe(true);
      const digestOnce = engine.computeStateDigestHex();
      const pxOnce = engine.readSubtilePixels("ink", 0, 0);

      expect(engine.applyOperation(patchOp)).toBe(false);
      expect(engine.appliedOperationCount).toBe(1);
      expect(engine.computeStateDigestHex()).toBe(digestOnce);
      expect(engine.readSubtilePixels("ink", 0, 0)).toEqual(pxOnce);
    });

    it("18. 3인 동시 오프라인 편집 후 3! = 6 모든 배치 순열 및 무작위 셔플 리플레이가 100% 비트 일치 수렴한다", () => {
      const peerLine = new CrdtLayerSubtileCollabEngine("10-tablet-line");
      const peerColor = new CrdtLayerSubtileCollabEngine("20-desktop-color");
      const peerLetter = new CrdtLayerSubtileCollabEngine("30-desktop-letter");

      const bootstrapOps: CrdtCollabOperation[] = [
        { ...peerLine.nextCausalStamp(), kind: "create-layer", layerId: "grp-main", layerKind: "group", parentId: null, name: "메인 컷 그룹", zOrderKey: "M" },
        { ...peerLine.nextCausalStamp(), kind: "create-layer", layerId: "lyr-shared", layerKind: "raster", parentId: "grp-main", name: "공용 리터치", zOrderKey: "M" },
      ];
      for (const p of [peerLine, peerColor, peerLetter]) p.applyOperations(bootstrapOps);

      const lineOfflineOps: CrdtCollabOperation[] = [
        { ...peerLine.nextCausalStamp(), kind: "create-layer", layerId: "lyr-ink", layerKind: "raster", parentId: "grp-main", name: "펜선", zOrderKey: generateFractionalKeyBetween("M", null) },
        {
          ...peerLine.nextCausalStamp(),
          kind: "subtile-patch",
          layerId: "lyr-shared",
          tileX: 1,
          tileY: 2,
          patchMode: "alpha-over",
          pixels: [
            { localX: 4, localY: 4, r: 20, g: 20, b: 25, a: 210 },
            { localX: 5, localY: 4, r: 180, g: 40, b: 40, a: 200 },
          ],
        },
        { ...peerLine.nextCausalStamp(), kind: "update-layer-props", layerId: "lyr-shared", patch: { opacity: 0.88, blendMode: "multiply" } },
      ];

      const colorOfflineOps: CrdtCollabOperation[] = [
        { ...peerColor.nextCausalStamp(), kind: "create-layer", layerId: "lyr-flat", layerKind: "raster", parentId: "grp-main", name: "밑색", zOrderKey: generateFractionalKeyBetween(null, "M") },
        {
          ...peerColor.nextCausalStamp(),
          kind: "subtile-patch",
          layerId: "lyr-shared",
          tileX: 1,
          tileY: 2,
          patchMode: "alpha-over",
          pixels: [
            { localX: 4, localY: 4, r: 90, g: 140, b: 200, a: 160 },
            { localX: 12, localY: 19, r: 220, g: 180, b: 60, a: 255 },
          ],
        },
        { ...peerColor.nextCausalStamp(), kind: "subtile-patch", layerId: "lyr-shared", tileX: 1, tileY: 2, patchMode: "erase", pixels: [{ localX: 5, localY: 4, r: 0, g: 0, b: 0, a: 110 }] },
      ];

      const letterOfflineOps: CrdtCollabOperation[] = [
        { ...peerLetter.nextCausalStamp(), kind: "create-layer", layerId: "lyr-sfx", layerKind: "raster", parentId: null, name: "효과음 식자", zOrderKey: generateFractionalKeyBetween("M", null) },
        { ...peerLetter.nextCausalStamp(), kind: "update-layer-props", layerId: "lyr-shared", patch: { opacity: 0.93, clippingMask: true } },
        { ...peerLetter.nextCausalStamp(), kind: "subtile-patch", layerId: "lyr-shared", tileX: 1, tileY: 2, patchMode: "alpha-over", pixels: [{ localX: 4, localY: 4, r: 100, g: 50, b: 120, a: 128 }] },
      ];

      const batches = [lineOfflineOps, colorOfflineOps, letterOfflineOps];
      const permutations: ReadonlyArray<readonly [number, number, number]> = [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
      ];

      let referenceDigest: string | null = null;
      let referencePixels: Uint8Array | null = null;
      let referenceLayerIds: ReadonlyArray<string> | null = null;

      for (const [i0, i1, i2] of permutations) {
        const replica = new CrdtLayerSubtileCollabEngine(`perm-${i0}${i1}${i2}`);
        replica.applyOperations(bootstrapOps);
        replica.applyOperations(batches[i0] ?? []);
        replica.applyOperations(batches[i1] ?? []);
        replica.applyOperations(batches[i2] ?? []);

        const digest = replica.computeStateDigestHex();
        const pixels = replica.readSubtilePixels("lyr-shared", 1, 2);
        const layerIds = replica.getOrderedLayers().map((l) => l.layerId);
        expect(pixels.byteLength).toBe(CRDT_SUBTILE_SIZE_PX * CRDT_SUBTILE_SIZE_PX * 4);
        if (referenceDigest === null) {
          referenceDigest = digest;
          referencePixels = pixels;
          referenceLayerIds = layerIds;
        } else {
          expect(digest).toBe(referenceDigest);
          expect(pixels).toEqual(referencePixels);
          expect(layerIds).toEqual(referenceLayerIds);
        }
      }

      const allOps = [...bootstrapOps, ...lineOfflineOps, ...colorOfflineOps, ...letterOfflineOps];
      for (const seed of [17, 42, 999, 20261127]) {
        const chaosReplica = new CrdtLayerSubtileCollabEngine(`chaos-${seed}`);
        chaosReplica.applyOperations(deterministicShuffle([...allOps, ...lineOfflineOps], seed));
        expect(chaosReplica.computeStateDigestHex()).toBe(referenceDigest);
        expect(chaosReplica.readSubtilePixels("lyr-shared", 1, 2)).toEqual(referencePixels);
      }
    });
  });

  describe("스마트 컷 레이아웃 자동 리플로우 솔버", () => {
    it("19. 세로 스크롤 웹툰(720px / 800px) 리플로우가 서사 호흡별 가변 여백과 S-curve 시선 유도를 생성한다", () => {
      const cuts = createSampleEpisodeCuts();
      const web720 = reflowCanonicalCutsToFormat(cuts, { format: "webtoon-scroll", viewportWidthPx: 720 });
      const web800 = reflowCanonicalCutsToFormat(cuts, { format: "webtoon-scroll", viewportWidthPx: 800 });

      expect(web720.eyeFlowCurveKind).toBe("s-curve");
      expect(web800.totalScrollHeightPx).toBeGreaterThan(web720.totalScrollHeightPx);
      expect(verifyReflowReadabilityInvariants(web720).valid).toBe(true);
      expect(verifyReflowReadabilityInvariants(web800).valid).toBe(true);

      expect(web800.cuts[1]?.trailingGutterPx ?? 0).toBeLessThan(web800.cuts[0]?.trailingGutterPx ?? 0);
      expect(web800.cuts[0]?.trailingGutterPx ?? 0).toBeLessThan(web800.cuts[2]?.trailingGutterPx ?? 0);
      expect(web800.cuts[2]?.trailingGutterPx ?? 0).toBeLessThan(web800.cuts[3]?.trailingGutterPx ?? 0);
      expect(web800.cuts[4]?.rectPx.width).toBe(800);
    });

    it("20. 출판 만화 좌->우(LTR)와 우->좌(RTL) 단 구성에서 시선 유도 방향과 가로 순서가 정확히 반전된다", () => {
      const cuts = createSampleEpisodeCuts();
      const ltr = reflowCanonicalCutsToFormat(cuts, {
        format: "print-manga-page",
        readingDirection: "ltr",
        pageWidthPx: 1200,
        pageHeightPx: 1700,
      });
      const rtl = reflowCanonicalCutsToFormat(cuts, {
        format: "print-manga-page",
        readingDirection: "rtl",
        pageWidthPx: 1200,
        pageHeightPx: 1700,
      });

      expect(ltr.eyeFlowCurveKind).toBe("z-curve-ltr");
      expect(rtl.eyeFlowCurveKind).toBe("z-curve-rtl");
      expect(verifyReflowReadabilityInvariants(ltr).valid).toBe(true);
      expect(verifyReflowReadabilityInvariants(rtl).valid).toBe(true);

      const multiColLtr = ltr.cuts.filter(
        (c, _, arr) => arr.filter((x) => x.containerIndex === c.containerIndex && x.rowIndex === c.rowIndex).length >= 2,
      );
      const multiColRtl = rtl.cuts.filter(
        (c, _, arr) => arr.filter((x) => x.containerIndex === c.containerIndex && x.rowIndex === c.rowIndex).length >= 2,
      );
      expect((multiColLtr[0]?.rectPx.x ?? 0)).toBeLessThan(multiColLtr[1]?.rectPx.x ?? 0);
      expect((multiColRtl[0]?.rectPx.x ?? 0)).toBeGreaterThan(multiColRtl[1]?.rectPx.x ?? 0);
    });

    it("21. 숏폼 세로 영상(1080x1920) 리플로우가 UI 안전 영역 안에 프레임을 배치하고 대사량 비례 재생 시간을 부여한다", () => {
      const cuts = createSampleEpisodeCuts();
      const safeArea = { x: 48, y: 128, width: 912, height: 1500 };
      const shortform = reflowCanonicalCutsToFormat(cuts, {
        format: "shortform-vertical-video",
        canvasWidthPx: SHORTFORM_CANVAS_WIDTH_PX,
        canvasHeightPx: SHORTFORM_CANVAS_HEIGHT_PX,
        safeAreaRectPx: safeArea,
      });

      expect(shortform.containerCount).toBe(cuts.length);
      expect(shortform.totalDurationSec).toBeGreaterThan(10);
      expect(verifyReflowReadabilityInvariants(shortform).valid).toBe(true);

      for (const placed of shortform.cuts) {
        expect(placed.rectPx.x).toBeGreaterThanOrEqual(safeArea.x);
        expect(placed.rectPx.y).toBeGreaterThanOrEqual(safeArea.y);
        expect(placed.rectPx.x + placed.rectPx.width).toBeLessThanOrEqual(safeArea.x + safeArea.width);
        expect(placed.rectPx.y + placed.rectPx.height).toBeLessThanOrEqual(safeArea.y + safeArea.height);
        expect(placed.durationSec).toBeGreaterThanOrEqual(1.5);
      }
      expect(shortform.cuts[1]?.durationSec ?? 0).toBeGreaterThan(shortform.cuts[2]?.durationSec ?? 0);
    });

    it("22. 좁은 출판 다단으로 축소될 때 모든 말풍선이 최소 가독 크기(>= 11px)로 자동 보정된다", () => {
      const box = computeBalloonBoxForLegibility({
        balloon: makeBalloon("tiny-test", 0, 42, 12, 0.5, 0.2),
        targetCutWidthPx: 260,
        targetCutHeightPx: 340,
      });
      expect(box.effectiveFontSizePx).toBeGreaterThanOrEqual(MIN_READABLE_BALLOON_FONT_PX);
      expect(box.wasUpscaledForLegibility).toBe(true);

      const compactManga = reflowCanonicalCutsToFormat(createSampleEpisodeCuts(), {
        format: "print-manga-page",
        readingDirection: "rtl",
        pageWidthPx: 760,
        pageHeightPx: 1080,
      });
      expect(compactManga.minResolvedBalloonFontPx).toBeGreaterThanOrEqual(MIN_READABLE_BALLOON_FONT_PX);
      const report = verifyReflowReadabilityInvariants(compactManga);
      expect(report.valid).toBe(true);
      expect(report.minFontThresholdSatisfied).toBe(true);
    });

    it("23. 동일 컷 내부 복수 말풍선이 화자 순서를 지키며 초점 영역과 서로 겹치지 않도록 배치된다", () => {
      const denseDialogueCut: CanonicalCutSpec = {
        cutId: "dense-cut",
        orderIndex: 0,
        intrinsicAspectRatio: 1.0,
        importanceWeight: 0.8,
        dramaticPacingBeat: "dialogue",
        focalAnchor: { xNorm: 0.5, yNorm: 0.5 },
        balloons: [makeBalloon("sp-1", 0, 20, 13, 0.5, 0.5), makeBalloon("sp-2", 1, 22, 13, 0.5, 0.52)],
      };

      const solved = reflowCanonicalCutsToFormat([denseDialogueCut], { format: "webtoon-scroll", viewportWidthPx: 720 });
      const b0 = solved.cuts[0]?.balloons[0];
      const b1 = solved.cuts[0]?.balloons[1];
      expect(b0?.speakerOrder).toBe(0);
      expect(b1?.speakerOrder).toBe(1);
      if (b0 && b1) {
        const overlapX = Math.min(b0.rectPx.x + b0.rectPx.width, b1.rectPx.x + b1.rectPx.width) - Math.max(b0.rectPx.x, b1.rectPx.x);
        const overlapY = Math.min(b0.rectPx.y + b0.rectPx.height, b1.rectPx.y + b1.rectPx.height) - Math.max(b0.rectPx.y, b1.rectPx.y);
        expect(overlapX > 0 && overlapY > 0).toBe(false);
      }
    });

    it("24. 무대사 액션 컷·극단 종횡비·역순 입력에서도 3대 매체 순환 리플로우 불변식을 모두 만족한다", () => {
      const edgeCuts: ReadonlyArray<CanonicalCutSpec> = [
        {
          cutId: "silent-panoramic",
          orderIndex: 2,
          intrinsicAspectRatio: 4.8,
          importanceWeight: 0.9,
          dramaticPacingBeat: "climax",
          focalAnchor: { xNorm: 0.88, yNorm: 0.25 },
          balloons: [],
        },
        {
          cutId: "tall-fall",
          orderIndex: 0,
          intrinsicAspectRatio: 0.18,
          importanceWeight: 0.6,
          dramaticPacingBeat: "tension",
          focalAnchor: { xNorm: 0.2, yNorm: 0.82 },
          balloons: [makeBalloon("shout-1", 0, 8, 11, 0.3, 0.15)],
        },
      ];

      const targets = [
        { format: "webtoon-scroll" as const, viewportWidthPx: 720 },
        { format: "print-manga-page" as const, readingDirection: "rtl" as const, pageWidthPx: 900, pageHeightPx: 1280 },
        { format: "shortform-vertical-video" as const },
      ];
      for (const spec of targets) {
        const solved = reflowCanonicalCutsToFormat(edgeCuts, spec);
        expect(solved.cuts.map((c) => c.cutId)).toEqual(["tall-fall", "silent-panoramic"]);
        expect(solved.eyeFlowWaypoints.length).toBeGreaterThanOrEqual(2);
        expect(solved.meanFocalPreservationScore).toBeGreaterThan(0);
        expect(verifyReflowReadabilityInvariants(solved).valid).toBe(true);
      }
      expect(WEBGPU_TILE_SIZE_PX).toBe(64);
    });
  });
});
