import { describe, expect, it } from "vitest";
import {
  DRAW_PRIMITIVE_STRIDE_BYTES,
  DrawBlendMode,
  DrawPrimitiveFlag,
  DrawPrimitiveKind,
  Wasm64DrawCallCoalescer,
  Wasm64ShaderPrewarmer,
  Wasm64TextureAtlasPacker,
  aabbOverlaps,
  computeDirtyRectUnion,
  type AtlasAllocation,
  type DrawBlendModeCode,
  type DrawPrimitiveKindCode,
  type PrewarmYieldContext,
} from "./index";

/** 결정론적 시드 난수 생성기(Mulberry32) — 벤치마크 재현성 보장. */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rectGapChebyshev(a: AtlasAllocation, b: AtlasAllocation): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.max(dx, dy);
}

function assertAtlasGeometryInvariants(
  packer: Wasm64TextureAtlasPacker,
  allocs: readonly AtlasAllocation[],
): void {
  const { atlasWidth, atlasHeight, padding } = packer;
  for (const r of allocs) {
    expect(r.x).toBeGreaterThanOrEqual(padding);
    expect(r.y).toBeGreaterThanOrEqual(padding);
    expect(r.x + r.width).toBeLessThanOrEqual(atlasWidth - padding);
    expect(r.y + r.height).toBeLessThanOrEqual(atlasHeight - padding);
    expect(r.u0).toBeCloseTo(r.x / atlasWidth, 10);
    expect(r.v0).toBeCloseTo(r.y / atlasHeight, 10);
    expect(r.u1).toBeCloseTo((r.x + r.width) / atlasWidth, 10);
    expect(r.v1).toBeCloseTo((r.y + r.height) / atlasHeight, 10);
    expect(r.u0).toBeGreaterThan(0);
    expect(r.u1).toBeLessThan(1);
    expect(r.v0).toBeGreaterThan(0);
    expect(r.v1).toBeLessThan(1);
  }
  for (let i = 0; i < allocs.length; i++) {
    for (let j = i + 1; j < allocs.length; j++) {
      const a = allocs[i];
      const b = allocs[j];
      const overlaps = aabbOverlaps(
        a.x, a.y, a.x + a.width, a.y + a.height,
        b.x, b.y, b.x + b.width, b.y + b.height,
      );
      expect(overlaps).toBe(false);
      expect(rectGapChebyshev(a, b)).toBeGreaterThanOrEqual(padding);
    }
  }
}

describe("Wasm64DrawCallCoalescer", () => {
  it("64바이트 고정 스트라이드 바이너리 버퍼에 프리미티브를 정확히 기록·복원하고 재할당 없이 리셋한다", () => {
    const coalescer = new Wasm64DrawCallCoalescer({ initialCapacity: 8, fixedCapacity: true });
    expect(DRAW_PRIMITIVE_STRIDE_BYTES).toBe(64);
    expect(coalescer.backingBuffer.byteLength).toBe(8 * 64);

    const slot = coalescer.pushPrimitiveInput({
      kind: "screentone-quad",
      layerOrder: -3,
      pipelineId: 42,
      blendMode: DrawBlendMode.Multiply,
      textureAtlasId: 7,
      minX: 180.5,
      minY: 90.25,
      maxX: 40.5, // 역전 입력 정규화 검증
      maxY: 12.25,
      vertexCount: 12,
      firstVertex: 96,
      colorRgba8: 0x1f4435cc,
      flags: DrawPrimitiveFlag.Instanced,
      primitiveId: 9001,
      uvMinX: 0.125,
      uvMinY: 0.25,
      uvMaxX: 0.5,
      uvMaxY: 0.75,
    });

    expect(slot).toBe(0);
    expect(coalescer.byteLength).toBe(64);

    const decoded = coalescer.readPrimitive(0);
    expect(decoded).toEqual({
      primitiveId: 9001,
      kind: DrawPrimitiveKind.ScreentoneQuad,
      blendMode: DrawBlendMode.Multiply,
      flags: DrawPrimitiveFlag.Instanced,
      layerOrder: -3,
      pipelineId: 42,
      textureAtlasId: 7,
      vertexCount: 12,
      firstVertex: 96,
      colorRgba8: 0x1f4435cc,
      minX: 40.5,
      minY: 12.25,
      maxX: 180.5,
      maxY: 90.25,
      uvMinX: 0.125,
      uvMinY: 0.25,
      uvMaxX: 0.5,
      uvMaxY: 0.75,
    });

    // 리틀엔디언 Raw DataView 오프셋 일치 검증
    const dv = new DataView(coalescer.backingBuffer);
    expect(dv.getUint32(0, true)).toBe(9001);
    expect(dv.getInt32(8, true)).toBe(-3);
    expect(dv.getFloat32(32, true)).toBe(40.5);

    const backingRef = coalescer.backingBuffer;
    coalescer.reset();
    expect(coalescer.primitiveCount).toBe(0);
    expect(coalescer.backingBuffer).toBe(backingRef);

    for (let i = 0; i < 8; i++) {
      coalescer.pushPrimitive(DrawPrimitiveKind.TileBlit, 0, 1, DrawBlendMode.Normal, 1, i * 10, 0, i * 10 + 8, 8);
    }
    expect(() =>
      coalescer.pushPrimitive(DrawPrimitiveKind.TileBlit, 0, 1, DrawBlendMode.Normal, 1, 90, 0, 98, 8),
    ).toThrow(RangeError);
  });

  it("500개 웹툰 페이지 프리미티브에서 85% 이상 드로우콜 절감과 겹침 알파 레이어 페인터 순서를 동시에 보장한다", () => {
    const coalescer = new Wasm64DrawCallCoalescer({ initialCapacity: 512 });
    const rng = createSeededRng(20261126);

    interface SubmittedPrim {
      readonly slot: number;
      readonly layerOrder: number;
      readonly minX: number;
      readonly minY: number;
      readonly maxX: number;
      readonly maxY: number;
    }
    const submitted: SubmittedPrim[] = [];

    // 5개 세로 웹툰 패널(각 800×640px, 세로 간격 60px)에 5종 프리미티브 총 500개 구성
    // 패널 내부에는 의도적으로 겹치는 비교환 알파 레이어(선화/스크린톤/말풍선/글리프)를 배치한다.
    const kinds: readonly DrawPrimitiveKindCode[] = [
      DrawPrimitiveKind.TileBlit,
      DrawPrimitiveKind.ScreentoneQuad,
      DrawPrimitiveKind.StrokeRibbon,
      DrawPrimitiveKind.BalloonPoly,
      DrawPrimitiveKind.GlyphRun,
    ];

    for (let p = 0; p < 5; p++) {
      const panelTop = p * 700;
      // 레이어 0: 배경 타일(30) + 스크린톤(20) — 패널별 비겹침 영역에 교차 제출
      for (let i = 0; i < 50; i++) {
        const isTone = i % 5 === 4;
        const col = i % 10;
        const row = Math.floor(i / 10);
        const minX = col * 78 + 4;
        const minY = panelTop + row * 120 + 4;
        const maxX = minX + 70;
        const maxY = minY + 110;
        const slot = coalescer.pushPrimitive(
          isTone ? kinds[1] : kinds[0],
          0,
          isTone ? 2 : 1,
          isTone ? DrawBlendMode.Multiply : DrawBlendMode.Normal,
          isTone ? 2 : 1,
          minX, minY, maxX, maxY,
          6,
        );
        submitted.push({ slot, layerOrder: 0, minX, minY, maxX, maxY });
      }

      // 레이어 1: 캐릭터 선화 스트로크(25) + 겹치는 반투명 곱하기 음영(10) + 하이라이트(5)
      for (let i = 0; i < 40; i++) {
        const isShadow = i >= 25 && i < 35;
        const isGlow = i >= 35;
        const minX = 80 + Math.floor(rng() * 520);
        const minY = panelTop + 60 + Math.floor(rng() * 440);
        const maxX = minX + 90 + Math.floor(rng() * 80);
        const maxY = minY + 60 + Math.floor(rng() * 70);
        const blend: DrawBlendModeCode = isShadow
          ? DrawBlendMode.Multiply
          : isGlow
            ? DrawBlendMode.Screen
            : DrawBlendMode.Normal;
        const slot = coalescer.pushPrimitive(
          isShadow ? DrawPrimitiveKind.ScreentoneQuad : DrawPrimitiveKind.StrokeRibbon,
          1,
          isShadow ? 2 : 3,
          blend,
          isShadow ? 2 : 3,
          minX, minY, maxX, maxY,
          24,
        );
        submitted.push({ slot, layerOrder: 1, minX, minY, maxX, maxY });
      }

      // 레이어 2: 말풍선 폴리곤(3) 위에 겹치는 한글 대사 글리프 런(7)
      for (let b = 0; b < 3; b++) {
        const minX = 60 + b * 240;
        const minY = panelTop + 40;
        const maxX = minX + 200;
        const maxY = minY + 140;
        const slot = coalescer.pushPrimitive(
          DrawPrimitiveKind.BalloonPoly,
          2,
          4,
          DrawBlendMode.Normal,
          0,
          minX, minY, maxX, maxY,
          36,
        );
        submitted.push({ slot, layerOrder: 2, minX, minY, maxX, maxY });
      }
      for (let g = 0; g < 7; g++) {
        const balloonIdx = g % 3;
        const minX = 80 + balloonIdx * 240 + (g % 2) * 40;
        const minY = panelTop + 70 + Math.floor(g / 3) * 28;
        const maxX = minX + 120;
        const maxY = minY + 24;
        const slot = coalescer.pushPrimitive(
          DrawPrimitiveKind.GlyphRun,
          2,
          5,
          DrawBlendMode.Normal,
          4,
          minX, minY, maxX, maxY,
          18,
        );
        submitted.push({ slot, layerOrder: 2, minX, minY, maxX, maxY });
      }
    }

    expect(submitted).toHaveLength(500);
    const result = coalescer.coalesce();

    // 1) 85% 이상 드로우콜 절감 & 제로 버퍼 재할당 검증
    expect(result.metrics.inputPrimitives).toBe(500);
    expect(result.metrics.reductionPct).toBeGreaterThanOrEqual(85);
    expect(result.metrics.outputDrawCalls).toBeLessThanOrEqual(75);
    expect(result.metrics.stateChangesSaved).toBe(500 - result.metrics.outputDrawCalls);
    expect(result.metrics.reorderedMerges).toBeGreaterThan(0);
    expect(result.metrics.bufferBytesUsed).toBe(500 * 64);
    expect(result.metrics.bufferReallocations).toBe(0);
    expect(result.packedPrimitiveIndices).toHaveLength(500);

    // 2) 배치 단조 레이어 순서 검증
    for (let i = 1; i < result.batches.length; i++) {
      expect(result.batches[i].layerOrder).toBeGreaterThanOrEqual(result.batches[i - 1].layerOrder);
    }

    // 3) 전수 페인터 순서 불변식(124,750쌍): 겹치는 모든 프리미티브 쌍은 절대 역전되지 않는다.
    const execOrder = new Int32Array(500);
    for (let i = 0; i < result.packedPrimitiveIndices.length; i++) {
      execOrder[result.packedPrimitiveIndices[i]] = i;
    }
    let overlappingPairsChecked = 0;
    for (let i = 0; i < submitted.length; i++) {
      const a = submitted[i];
      for (let j = i + 1; j < submitted.length; j++) {
        const b = submitted[j];
        if (!aabbOverlaps(a.minX, a.minY, a.maxX, a.maxY, b.minX, b.minY, b.maxX, b.maxY)) {
          continue;
        }
        overlappingPairsChecked++;
        const aMustPrecedeB = a.layerOrder < b.layerOrder || (a.layerOrder === b.layerOrder && a.slot < b.slot);
        if (aMustPrecedeB) {
          expect(execOrder[a.slot]).toBeLessThan(execOrder[b.slot]);
        } else {
          expect(execOrder[b.slot]).toBeLessThan(execOrder[a.slot]);
        }
      }
    }
    expect(overlappingPairsChecked).toBeGreaterThan(100);
  });

  it("겹치는 비교환 블렌드 장벽은 병합을 차단하고, 비겹침 프리미티브만 안전하게 승격 병합한다", () => {
    const coalescer = new Wasm64DrawCallCoalescer({ initialCapacity: 16 });
    // P0(K1) -> P1(K2, P0와 겹침) -> P2(K1, P1과 겹침: 장벽 차단!) -> P3(K1, 비겹침: P2에 인접 병합)
    coalescer.pushPrimitive(DrawPrimitiveKind.StrokeRibbon, 0, 1, DrawBlendMode.Normal, 1, 0, 0, 100, 100);
    coalescer.pushPrimitive(DrawPrimitiveKind.ScreentoneQuad, 0, 2, DrawBlendMode.Multiply, 2, 50, 50, 150, 150);
    coalescer.pushPrimitive(DrawPrimitiveKind.StrokeRibbon, 0, 1, DrawBlendMode.Normal, 1, 60, 60, 160, 160);
    coalescer.pushPrimitive(DrawPrimitiveKind.StrokeRibbon, 0, 1, DrawBlendMode.Normal, 1, 400, 400, 480, 480);

    const blocked = coalescer.coalesce();
    expect(blocked.metrics.outputDrawCalls).toBe(3);
    expect(Array.from(blocked.batches[0].primitiveIndices)).toEqual([0]);
    expect(Array.from(blocked.batches[1].primitiveIndices)).toEqual([1]);
    expect(Array.from(blocked.batches[2].primitiveIndices)).toEqual([2, 3]);

    // 비겹침 시나리오: P0(K1, [0..100]) -> P1(K2, [500..600]) -> P2(K1, [120..220]) => 2개 배치로 안전 병합
    coalescer.reset();
    coalescer.pushPrimitive(DrawPrimitiveKind.StrokeRibbon, 0, 1, DrawBlendMode.Normal, 1, 0, 0, 100, 100);
    coalescer.pushPrimitive(DrawPrimitiveKind.ScreentoneQuad, 0, 2, DrawBlendMode.Multiply, 2, 500, 500, 600, 600);
    coalescer.pushPrimitive(DrawPrimitiveKind.StrokeRibbon, 0, 1, DrawBlendMode.Normal, 1, 120, 0, 220, 100);

    const merged = coalescer.coalesce();
    expect(merged.metrics.outputDrawCalls).toBe(2);
    expect(merged.metrics.reorderedMerges).toBe(1);
    expect(Array.from(merged.batches[0].primitiveIndices)).toEqual([0, 2]);
    expect(Array.from(merged.batches[1].primitiveIndices)).toEqual([1]);
  });

  it("역순 레이어 제출을 안정 정렬(stable sort)하고, 동적 버퍼 확장 및 빈 프레임 병합을 처리한다", () => {
    const coalescer = new Wasm64DrawCallCoalescer({ initialCapacity: 4 });
    expect(coalescer.coalesce().metrics.outputDrawCalls).toBe(0);
    expect(coalescer.coalesce().metrics.reductionPct).toBe(0);

    // 레이어 2 -> 0 -> 1 -> 0 -> 2 순으로 비정렬 제출 (capacity 4 -> 8 자동 확장 유발)
    coalescer.pushPrimitive(DrawPrimitiveKind.BalloonPoly, 2, 4, DrawBlendMode.Normal, 0, 0, 0, 100, 100, 12, 0, 0xffffffff, 0, 200);
    coalescer.pushPrimitive(DrawPrimitiveKind.TileBlit, 0, 1, DrawBlendMode.Normal, 1, 0, 0, 100, 100, 6, 0, 0xffffffff, 0, 100);
    coalescer.pushPrimitive(DrawPrimitiveKind.StrokeRibbon, 1, 3, DrawBlendMode.Normal, 3, 0, 0, 100, 100, 18, 0, 0xffffffff, 0, 150);
    coalescer.pushPrimitive(DrawPrimitiveKind.TileBlit, 0, 1, DrawBlendMode.Normal, 1, 20, 20, 120, 120, 6, 0, 0xffffffff, 0, 101);
    coalescer.pushPrimitive(DrawPrimitiveKind.BalloonPoly, 2, 4, DrawBlendMode.Normal, 0, 20, 20, 120, 120, 12, 0, 0xffffffff, 0, 201);

    const res = coalescer.coalesce();
    expect(res.metrics.bufferReallocations).toBe(1);
    expect(res.metrics.outputDrawCalls).toBe(3);
    expect(res.batches.map((b) => b.layerOrder)).toEqual([0, 1, 2]);
    // 동일 레이어 내부에서는 제출 순서(100 -> 101, 200 -> 201)가 안정적으로 유지되어야 한다.
    expect(Array.from(res.batches[0].primitiveIndices).map((s) => coalescer.readPrimitive(s).primitiveId)).toEqual([100, 101]);
    expect(Array.from(res.batches[2].primitiveIndices).map((s) => coalescer.readPrimitive(s).primitiveId)).toEqual([200, 201]);
  });
});

describe("Wasm64TextureAtlasPacker", () => {
  it("2048×2048 아틀라스에 120개 브러시/글리프/SFX 텍스처를 80% 이상 점유율·0 겹침·1px 이상 거터로 패킹한다", () => {
    const packer = new Wasm64TextureAtlasPacker({
      atlasWidth: 2048,
      atlasHeight: 2048,
      padding: 1,
      autoEvict: false,
    });

    // 다양한 크기의 실제 고해상도 브러시 스탬프(40) + 한글 글리프 런(50) + SFX 텍스처(30) = 총 120개
    const specs: { key: string; w: number; h: number }[] = [];
    const brushSizes: readonly [number, number][] = [
      [256, 256], [192, 192], [160, 160], [128, 128], [224, 192],
    ];
    for (let i = 0; i < 40; i++) {
      const [w, h] = brushSizes[i % brushSizes.length];
      specs.push({ key: `brush:stamp:${i}`, w, h });
    }
    const glyphSizes: readonly [number, number][] = [
      [256, 96], [224, 88], [192, 80], [160, 72], [128, 64],
    ];
    for (let i = 0; i < 50; i++) {
      const [w, h] = glyphSizes[i % glyphSizes.length];
      specs.push({ key: `glyph:ko-run:${i}`, w, h });
    }
    const sfxSizes: readonly [number, number][] = [
      [320, 192], [288, 160], [256, 160], [240, 144], [208, 128],
    ];
    for (let i = 0; i < 30; i++) {
      const [w, h] = sfxSizes[i % sfxSizes.length];
      specs.push({ key: `sfx:impact:${i}`, w, h });
    }

    expect(specs).toHaveLength(120);
    // 실제 온라인 삽입 순서를 다양화(브러시/글리프/SFX 교차)
    const interleaved = specs.map((_, i) => specs[(i * 37) % specs.length]);
    for (const item of interleaved) {
      const alloc = packer.allocate(item.key, item.w, item.h);
      expect(alloc).not.toBeNull();
    }

    const telemetry = packer.getTelemetry();
    const allAllocs = packer.listAllocations();
    expect(telemetry.entryCount).toBe(120);
    expect(telemetry.evictionCount).toBe(0);
    expect(telemetry.occupancyPct).toBeGreaterThanOrEqual(80);
    assertAtlasGeometryInvariants(packer, allAllocs);

    // 더티 영역 및 Union 바운딩 박스 정확성 검증
    const dirty = packer.consumeDirtyRects();
    expect(dirty.rects).toHaveLength(120);
    expect(dirty.union).not.toBeNull();
    expect(dirty.union).toEqual(computeDirtyRectUnion(dirty.rects));
    expect(dirty.totalDirtyPixels).toBe(telemetry.usedContentPixels);

    // 소비 후 두 번째 호출은 비어 있어야 한다.
    const emptyDirty = packer.consumeDirtyRects();
    expect(emptyDirty.rects).toHaveLength(0);
    expect(emptyDirty.union).toBeNull();
    expect(emptyDirty.totalDirtyPixels).toBe(0);
  });

  it("LRU 추적(touch)·자동/수동 퇴거(evictLru)·재패킹 후에도 겹침과 데이터 손상이 없다", () => {
    const packer = new Wasm64TextureAtlasPacker({ atlasWidth: 256, atlasHeight: 256, padding: 1 });
    expect(() => new Wasm64TextureAtlasPacker({ padding: 0 })).toThrow(RangeError);
    expect(packer.allocate("too-big", 255, 16)).toBeNull();

    // 16개의 60×60 타일을 채운다(거터 포함 61×61 × 4×4 = 244×244 -> 256×256 내 딱 맞게 수용).
    for (let i = 0; i < 16; i++) {
      const a = packer.allocate(`tile:${i}`, 60, 60);
      expect(a).not.toBeNull();
    }
    expect(packer.size).toBe(16);
    packer.consumeDirtyRects();

    // tile:0과 tile:1을 최근 사용(MRU)으로 갱신하고, 동일 키 재할당 캐시 히트를 확인한다.
    expect(packer.touch("tile:0")?.reused).toBe(true);
    const cacheHit = packer.allocate("tile:1", 60, 60);
    expect(cacheHit?.reused).toBe(true);
    expect(packer.getTelemetry().hitCount).toBe(1);

    // 수동 LRU 퇴거: 가장 오래된 tile:2, tile:3이 먼저 퇴거되고 tile:0, tile:1은 생존해야 한다.
    const evicted = packer.evictLru(60 * 60 * 2);
    expect(evicted.evictedKeys).toEqual(["tile:2", "tile:3"]);
    expect(evicted.reclaimedArea).toBe(7200);
    expect(packer.has("tile:0")).toBe(true);
    expect(packer.has("tile:1")).toBe(true);
    expect(packer.has("tile:2")).toBe(false);
    expect(packer.has("tile:3")).toBe(false);

    // 가득 찬 상태에서 큰 SFX 텍스처를 할당하면 자동 LRU 퇴거 + 재패킹으로 무손실 수용된다.
    const bigSfx = packer.allocate("sfx:boom", 120, 120);
    expect(bigSfx).not.toBeNull();
    expect(packer.has("sfx:boom")).toBe(true);
    expect(packer.has("tile:0")).toBe(true);
    expect(packer.has("tile:1")).toBe(true);

    const finalAllocs = packer.listAllocations();
    assertAtlasGeometryInvariants(packer, finalAllocs);
    const expectedPixels = finalAllocs.reduce((sum, a) => sum + a.width * a.height, 0);
    expect(packer.getTelemetry().usedContentPixels).toBe(expectedPixels);

    // 재패킹으로 이동한 생존 항목과 신규 항목의 더티 영역 Union이 정확히 계산되어야 한다.
    const dirtyAfterEvict = packer.consumeDirtyRects();
    expect(dirtyAfterEvict.rects.length).toBeGreaterThanOrEqual(1);
    expect(dirtyAfterEvict.union).toEqual(computeDirtyRectUnion(dirtyAfterEvict.rects));
  });

  it("동일 키 리사이즈 및 padding=2px 확장 거터 불변식을 유지한다", () => {
    const packer = new Wasm64TextureAtlasPacker({ atlasWidth: 256, atlasHeight: 256, padding: 2 });
    const first = packer.allocate("glyph:dynamic", 32, 24);
    const second = packer.allocate("glyph:static", 48, 32);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    packer.consumeDirtyRects();

    const resized = packer.allocate("glyph:dynamic", 96, 48);
    expect(resized).not.toBeNull();
    expect(resized?.width).toBe(96);
    expect(resized?.height).toBe(48);
    expect(packer.size).toBe(2);
    expect(packer.getTelemetry().usedContentPixels).toBe(96 * 48 + 48 * 32);
    assertAtlasGeometryInvariants(packer, packer.listAllocations());

    const dirty = packer.consumeDirtyRects();
    expect(dirty.rects.some((r) => r.width === 96 && r.height === 48)).toBe(true);
  });
});

describe("Wasm64ShaderPrewarmer", () => {
  it("maxSliceMs(2.0ms) 프레임 예산을 엄격히 지켜 슬라이스 간 양보하며 제로-히치 100%를 달성한다", async () => {
    let virtualClockMs = 0;
    const yieldLog: PrewarmYieldContext[] = [];

    const prewarmer = new Wasm64ShaderPrewarmer({
      maxSliceMs: 2.0,
      autoStart: false,
      now: () => virtualClockMs,
      yieldToHost: async (ctx) => {
        yieldLog.push(ctx);
        virtualClockMs += 6.33; // 120Hz 프레임(8.33ms) 나머지 구간 시뮬레이션
        await Promise.resolve();
      },
    });

    for (let i = 0; i < 10; i++) {
      void prewarmer.enqueue({
        id: `wgsl-pipeline-${i}`,
        kind: i % 3 === 0 ? "wasm-module" : "wgsl-compute",
        priority: "high",
        estimatedMs: 0.7,
        compile: () => {
          virtualClockMs += 0.7;
          return `compiled-${i}`;
        },
      });
    }

    const telemetry = await prewarmer.drain();
    expect(telemetry.completedCount).toBe(10);
    expect(telemetry.coldStartEliminatedCount).toBe(10);
    expect(telemetry.yieldCount).toBeGreaterThanOrEqual(4);
    expect(telemetry.sliceCount).toBe(5); // 슬라이스당 2태스크(1.4ms <= 2.0ms) × 5슬라이스
    expect(telemetry.peakSliceDurationMs).toBeLessThanOrEqual(2.0);
    expect(telemetry.overBudgetSlices).toBe(0);
    expect(telemetry.zeroHitchRatePct).toBe(100);
    for (const ctx of yieldLog) {
      expect(ctx.sliceDurationMs).toBeLessThanOrEqual(2.0);
    }
  });

  it("critical > high > background 우선순위 순서, ID 중복 제거 및 우선순위 승격을 보장한다", async () => {
    const order: string[] = [];
    let compileCallsForPromoted = 0;

    const prewarmer = new Wasm64ShaderPrewarmer({
      maxSliceMs: 2.0,
      autoStart: true,
      yieldToHost: async () => Promise.resolve(),
    });

    const pBg1 = prewarmer.enqueue({
      id: "bg-blur", kind: "wgsl-compute", priority: "background",
      compile: () => { order.push("bg-blur"); return "blur"; },
    });
    const pBgPromoted = prewarmer.enqueue({
      id: "brush-ink", kind: "wgsl-render", priority: "background",
      compile: () => { compileCallsForPromoted++; order.push("brush-ink"); return "ink"; },
    });
    const pHigh = prewarmer.enqueue({
      id: "tone-halftone", kind: "wgsl-compute", priority: "high",
      compile: () => { order.push("tone-halftone"); return "tone"; },
    });
    const pCrit = prewarmer.enqueue({
      id: "wasm-kernel", kind: "wasm-module", priority: "critical",
      compile: () => { order.push("wasm-kernel"); return "wasm"; },
    });
    // 동일 ID를 critical로 재등록 -> 중복 제거 + 우선순위 승격
    const pDedup = prewarmer.enqueue({
      id: "brush-ink", kind: "wgsl-render", priority: "critical",
      compile: () => { compileCallsForPromoted++; return "never-called"; },
    });

    const [rBg1, rPromoted, rHigh, rCrit, rDedup] = await Promise.all([
      pBg1, pBgPromoted, pHigh, pCrit, pDedup,
    ]);
    const telemetry = await prewarmer.drain();

    expect(order.slice(0, 2)).toEqual(["brush-ink", "wasm-kernel"]);
    expect(order[2]).toBe("tone-halftone");
    expect(order[3]).toBe("bg-blur");
    expect(compileCallsForPromoted).toBe(1);
    expect(rBg1.status).toBe("completed");
    expect(rPromoted.value).toBe("ink");
    expect(rDedup.value).toBe("ink");
    expect(rDedup.deduplicated).toBe(true);
    expect(rHigh.status).toBe("completed");
    expect(rCrit.status).toBe("completed");
    expect(telemetry.deduplicatedCount).toBe(1);
    expect(telemetry.priorityPromotions).toBe(1);
  });

  it("AbortSignal 취소와 실패 태스크 격리(재시도·폴백 포함)가 나머지 프리웜 작업을 차단하지 않는다", async () => {
    let clock = 0;
    const prewarmer = new Wasm64ShaderPrewarmer({
      maxSliceMs: 2.0,
      autoStart: false,
      now: () => clock,
      yieldToHost: async () => { await Promise.resolve(); },
    });

    const preAborted = new AbortController();
    preAborted.abort("이미 취소됨");

    const midCancel = new AbortController();
    let cancelledCompileCalled = false;
    let flakyAttempts = 0;

    const pPreAborted = prewarmer.enqueue({
      id: "aborted-early",
      kind: "wgsl-compute",
      priority: "critical",
      signal: preAborted.signal,
      compile: () => { cancelledCompileCalled = true; return "nope"; },
    });

    const pFlaky = prewarmer.enqueue({
      id: "flaky-retry",
      kind: "wgsl-compute",
      priority: "critical",
      maxRetries: 2,
      compile: () => {
        clock += 2.1; // 첫 슬라이스 예산 소진 -> 다음 슬라이스 전 midCancel 트리거 가능
        flakyAttempts++;
        if (flakyAttempts === 1) throw new Error("transient device hiccup");
        midCancel.abort("사용자 페이지 이동");
        return "recovered";
      },
    });

    const pMidCancelled = prewarmer.enqueue({
      id: "cancel-in-queue",
      kind: "wgsl-render",
      priority: "high",
      signal: midCancel.signal,
      compile: () => { cancelledCompileCalled = true; return "nope"; },
    });

    const pFallback = prewarmer.enqueue({
      id: "shader-with-fallback",
      kind: "wgsl-compute",
      priority: "high",
      compile: () => { throw new Error("f16 미지원"); },
      fallback: () => "f32-fallback-pipeline",
    });

    const pHardFail = prewarmer.enqueue({
      id: "broken-shader",
      kind: "wgsl-compute",
      priority: "high",
      compile: () => { throw new Error("WGSL syntax error"); },
    });

    const pSurvivor = prewarmer.enqueue({
      id: "survivor-wasm",
      kind: "wasm-module",
      priority: "background",
      compile: () => { clock += 0.5; return "wasm-ready"; },
    });

    const [rEarly, rFlaky, rMid, rFallback, rFail, rSurvivor] = await Promise.all([
      pPreAborted, pFlaky, pMidCancelled, pFallback, pHardFail, pSurvivor,
      prewarmer.drain().then(() => undefined),
    ]);
    const telemetry = prewarmer.getTelemetry();

    expect(cancelledCompileCalled).toBe(false);
    expect(rEarly.status).toBe("cancelled");
    expect(rMid.status).toBe("cancelled");
    expect(rFlaky.status).toBe("completed");
    expect(rFlaky.attempts).toBe(2);
    expect(rFlaky.value).toBe("recovered");
    expect(rFallback.status).toBe("fallback");
    expect(rFallback.value).toBe("f32-fallback-pipeline");
    expect(rFail.status).toBe("failed");
    expect(rFail.error).toBeInstanceOf(Error);
    expect(rSurvivor.status).toBe("completed");
    expect(rSurvivor.value).toBe("wasm-ready");

    expect(telemetry.cancelledCount).toBe(2);
    expect(telemetry.retryCount).toBe(1);
    expect(telemetry.fallbackCount).toBe(1);
    expect(telemetry.failedCount).toBe(1);
    expect(telemetry.completedCount).toBe(2);
    expect(telemetry.coldStartEliminatedCount).toBe(3);

    // 이전에 실패한 태스크 ID는 재등록 후 정상 컴파일할 수 있어야 한다.
    const retriedPromise = prewarmer.enqueue({
      id: "broken-shader",
      kind: "wgsl-compute",
      priority: "critical",
      compile: () => "fixed-shader-pipeline",
    });
    await prewarmer.drain();
    const retriedAfterFail = await retriedPromise;
    expect(retriedAfterFail.status).toBe("completed");
    expect(retriedAfterFail.value).toBe("fixed-shader-pipeline");
  });

  it("전역 AbortSignal 취소·개별 cancel(id) 및 기본 호스트 비동기 양보 경로를 안전하게 처리한다", async () => {
    const globalAbort = new AbortController();
    const prewarmer = new Wasm64ShaderPrewarmer({
      maxSliceMs: 2.0,
      autoStart: false,
      signal: globalAbort.signal,
    });

    const p1 = prewarmer.enqueue({
      id: "task-a", kind: "wgsl-compute", priority: "high", compile: () => "ok-a",
    });
    const p2 = prewarmer.enqueue({
      id: "task-b", kind: "wgsl-compute", priority: "background", compile: () => "ok-b",
    });
    const p3 = prewarmer.enqueue({
      id: "task-c", kind: "wasm-module", priority: "background", compile: () => "ok-c",
    });

    expect(prewarmer.cancel("task-b", "개별 취소")).toBe(true);
    globalAbort.abort("전역 종료");

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.status).toBe("cancelled");
    expect(r2.status).toBe("cancelled");
    expect(r3.status).toBe("cancelled");
    expect(prewarmer.pendingCount).toBe(0);

    // 실제 비동기 기본 양보 경로로 다중 태스크 완료 검증
    const live = new Wasm64ShaderPrewarmer({ maxSliceMs: 0.001, autoStart: true });
    const liveResults = await live.enqueueMany([
      { id: "live-1", kind: "wgsl-compute", priority: "critical", compile: () => 1 },
      { id: "live-2", kind: "wasm-module", priority: "high", compile: () => 2 },
    ]);
    expect(liveResults.map((r) => r.value)).toEqual([1, 2]);
  });
});
