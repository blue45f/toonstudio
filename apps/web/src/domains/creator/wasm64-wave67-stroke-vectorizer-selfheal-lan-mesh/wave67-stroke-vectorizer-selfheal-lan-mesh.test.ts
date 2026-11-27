import { describe, expect, it } from "vitest";

import {
  auditAndSelfHealCanvasSnapshot,
  computeEuclideanDistanceTransform,
  computeLayerMetadataDigest,
  computeSyncSha256Hex,
  createSignedStrokeJournal,
  createTileIntegrityManifest,
  evaluateCreativeErgonomicPacing,
  evaluateCubicBezier,
  fitCubicBezierSchneider,
  handlePeerDisconnectFailover,
  planLanP2pMeshOffload,
  rasterizeJournalEntriesToTile,
  selectBestLanPeerForWorkload,
  vectorizeRasterLineartInStrokeOrder,
  verifyTileIntegrityManifest,
  zhangSuenThinning,
  type CanvasLayerMetadata,
  type CanvasTileRecord,
  type LanPeerNode,
  type LocalDeviceTelemetry,
  type MeshWorkloadRequest,
  type UnsignedOpfsJournalEntry,
} from "./index";

function createRasterCanvas(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

function drawDisk(buf: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): void {
  const rSq = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(w - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= rSq) buf[y * w + x] = 255;
    }
  }
}

function drawVariableStroke(
  buf: Uint8Array,
  w: number,
  h: number,
  points: ReadonlyArray<{ readonly x: number; readonly y: number; readonly r: number }>,
): void {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      drawDisk(buf, w, h, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.r + (b.r - a.r) * t);
    }
  }
}

function makeSolidTile(
  layerId: string,
  tileX: number,
  tileY: number,
  tileSize: number,
  rgba: readonly [number, number, number, number],
): CanvasTileRecord {
  const pixels = new Uint8Array(tileSize * tileSize * 4);
  for (let i = 0; i < tileSize * tileSize; i += 1) {
    pixels[i * 4] = rgba[0];
    pixels[i * 4 + 1] = rgba[1];
    pixels[i * 4 + 2] = rgba[2];
    pixels[i * 4 + 3] = rgba[3];
  }
  return { tileId: `${layerId}:${tileX}:${tileY}`, layerId, tileX, tileY, tileSize, pixels };
}

function makeTabletTelemetry(overrides: Partial<LocalDeviceTelemetry> = {}): LocalDeviceTelemetry {
  return {
    deviceId: "ipad-pro-m4",
    formFactor: "tablet-ipad",
    accelerator: "apple-metal-ane",
    availableVramMb: 4096,
    computeTflops: 4.5,
    npuTops: 38,
    batteryPercent: 72,
    isPluggedIn: false,
    thermalState: "nominal",
    targetFrameBudgetMs: 8.33,
    ...overrides,
  };
}

function makeDesktopPeer(overrides: Partial<LanPeerNode> = {}): LanPeerNode {
  return {
    peerId: "desk-rtx-5090",
    displayName: "Desk RTX 5090 PC",
    formFactor: "desktop-rtx-pc",
    accelerator: "nvidia-cuda-tensor",
    sameSubnetLan: true,
    connected: true,
    rttMs: 1.8,
    jitterMs: 0.2,
    bandwidthMbps: 2500,
    availableVramMb: 28000,
    computeTflops: 96,
    npuTops: 0,
    activeQueueDepth: 0,
    thermalState: "nominal",
    batteryPercent: 100,
    isPluggedIn: true,
    lastHeartbeatAgeMs: 120,
    ...overrides,
  };
}

function makeHeavyWorkload(overrides: Partial<MeshWorkloadRequest> = {}): MeshWorkloadRequest {
  return {
    workloadId: "job-npr-001",
    kind: "bg3d-npr-render",
    payloadBytes: 512 * 1024,
    resultBytes: 512 * 1024,
    estimatedGflops: 180,
    requiredVramMb: 2048,
    latencySensitive: false,
    ...overrides,
  };
}

describe("wasm64-wave67-stroke-vectorizer-selfheal-lan-mesh", () => {
  // ── 1. 획 순서 복원 벡터화기 테스트 (1~9) ──────────────────────────────────

  it("1. 직선 래스터 선화를 1개의 매끈한 베지에 획과 정확한 필압 반경으로 복원한다", () => {
    const mask = createRasterCanvas(96, 48);
    drawVariableStroke(mask, 96, 48, [{ x: 10, y: 24, r: 3.0 }, { x: 84, y: 24, r: 3.0 }]);
    const res = vectorizeRasterLineartInStrokeOrder({ width: 96, height: 48, data: mask });
    expect(res.strokes).toHaveLength(1);
    const stroke = res.strokes[0];
    expect(stroke.strokeOrder).toBe(0);
    expect(stroke.totalLengthPx).toBeGreaterThan(64);
    expect(stroke.meanRadiusPx).toBeGreaterThan(2.2);
    expect(stroke.meanRadiusPx).toBeLessThan(3.8);
    expect(stroke.maxFitErrorPx).toBeLessThanOrEqual(1.2);
    expect(stroke.startPoint.x).toBeLessThan(stroke.endPoint.x);
  });

  it("2. S자 곡선 선화를 Schneider 3차 베지에 커브로 1.2px 오차 이내로 피팅한다", () => {
    const mask = createRasterCanvas(128, 96);
    const pts = Array.from({ length: 41 }, (_, i) => {
      const t = i / 40;
      return { x: 14 + t * 100, y: 48 + Math.sin(t * Math.PI * 2) * 26, r: 2.4 };
    });
    drawVariableStroke(mask, 128, 96, pts);
    const res = vectorizeRasterLineartInStrokeOrder({ width: 128, height: 96, data: mask }, { maxBezierErrorPx: 1.2 });
    expect(res.strokes).toHaveLength(1);
    expect(res.strokes[0].segments.length).toBeGreaterThanOrEqual(2);
    expect(res.strokes[0].maxFitErrorPx).toBeLessThanOrEqual(1.25);
  });

  it("3. X자 교차 선화를 4조각이 아닌 접선 연속성 기반의 2개 독립 획으로 정확히 분해한다", () => {
    const mask = createRasterCanvas(112, 112);
    drawVariableStroke(mask, 112, 112, [{ x: 14, y: 14, r: 2.5 }, { x: 98, y: 98, r: 2.5 }]);
    drawVariableStroke(mask, 112, 112, [{ x: 98, y: 14, r: 2.5 }, { x: 14, y: 98, r: 2.5 }]);
    const res = vectorizeRasterLineartInStrokeOrder({ width: 112, height: 112, data: mask });
    expect(res.junctionCount).toBeGreaterThanOrEqual(1);
    expect(res.strokes).toHaveLength(2);
    for (const stroke of res.strokes) {
      expect(stroke.totalLengthPx).toBeGreaterThan(95);
      expect(stroke.passedThroughJunctions).toBeGreaterThanOrEqual(1);
      expect(Math.abs(stroke.endPoint.x - stroke.startPoint.x)).toBeGreaterThan(68);
      expect(Math.abs(stroke.endPoint.y - stroke.startPoint.y)).toBeGreaterThan(68);
    }
  });

  it("4. 십자(+) 직교 교차 선화를 수평 획과 수직 획 2개로 분리하고 교차점 반경 팽창을 보정한다", () => {
    const mask = createRasterCanvas(100, 100);
    drawVariableStroke(mask, 100, 100, [{ x: 12, y: 50, r: 3.0 }, { x: 88, y: 50, r: 3.0 }]);
    drawVariableStroke(mask, 100, 100, [{ x: 50, y: 12, r: 3.0 }, { x: 50, y: 88, r: 3.0 }]);
    const res = vectorizeRasterLineartInStrokeOrder({ width: 100, height: 100, data: mask });
    expect(res.strokes).toHaveLength(2);
    const spans = res.strokes.map((s) => ({
      dx: Math.abs(s.endPoint.x - s.startPoint.x),
      dy: Math.abs(s.endPoint.y - s.startPoint.y),
    }));
    expect(spans.some((s) => s.dx > 60 && s.dy < 8)).toBe(true);
    expect(spans.some((s) => s.dy > 60 && s.dx < 8)).toBe(true);
    for (const s of res.strokes) expect(s.maxRadiusPx).toBeLessThan(4.1);
  });

  it("5. 시작(가늘게)->중간(굵게)->끝(가늘게) 가변 필압 획의 반경·압력 프로파일을 정확히 복원한다", () => {
    const mask = createRasterCanvas(140, 64);
    drawVariableStroke(mask, 140, 64, [
      { x: 12, y: 32, r: 1.4 },
      { x: 70, y: 32, r: 5.5 },
      { x: 128, y: 32, r: 1.4 },
    ]);
    const res = vectorizeRasterLineartInStrokeOrder({ width: 140, height: 64, data: mask });
    expect(res.strokes).toHaveLength(1);
    const samples = res.strokes[0].samples;
    const mid = samples[Math.floor(samples.length / 2)];
    expect(mid.radiusPx).toBeGreaterThan(samples[2].radiusPx * 1.8);
    expect(mid.radiusPx).toBeGreaterThan(samples[samples.length - 3].radiusPx * 1.8);
    expect(mid.pressure).toBeGreaterThan(0.8);
  });

  it("6. T자 분기 선화를 직진 가로획 1개와 수직 지선 1개로 분리한다", () => {
    const mask = createRasterCanvas(100, 100);
    drawVariableStroke(mask, 100, 100, [{ x: 14, y: 26, r: 2.2 }, { x: 86, y: 26, r: 2.2 }]);
    drawVariableStroke(mask, 100, 100, [{ x: 50, y: 26, r: 2.2 }, { x: 50, y: 88, r: 2.2 }]);
    const res = vectorizeRasterLineartInStrokeOrder({ width: 100, height: 100, data: mask });
    expect(res.strokes).toHaveLength(2);
    const lengths = res.strokes.map((s) => s.totalLengthPx).sort((a, b) => b - a);
    expect(lengths[0]).toBeGreaterThan(60);
    expect(lengths[1]).toBeGreaterThan(50);
  });

  it("7. 여러 독립 획을 인간 필기 순서(상단-좌측 -> 하단-우측)대로 결정론적으로 정렬한다", () => {
    const mask = createRasterCanvas(120, 120);
    drawVariableStroke(mask, 120, 120, [{ x: 20, y: 95, r: 2.0 }, { x: 95, y: 95, r: 2.0 }]);
    drawVariableStroke(mask, 120, 120, [{ x: 20, y: 58, r: 2.0 }, { x: 95, y: 58, r: 2.0 }]);
    drawVariableStroke(mask, 120, 120, [{ x: 20, y: 20, r: 2.0 }, { x: 95, y: 20, r: 2.0 }]);
    const res = vectorizeRasterLineartInStrokeOrder({ width: 120, height: 120, data: mask });
    expect(res.strokes).toHaveLength(3);
    expect(res.strokes.map((s) => s.strokeOrder)).toEqual([0, 1, 2]);
    expect(res.strokes[0].startPoint.y).toBeLessThan(res.strokes[1].startPoint.y);
    expect(res.strokes[1].startPoint.y).toBeLessThan(res.strokes[2].startPoint.y);
  });

  it("8. 폐곡선 원형 고리 선화를 끊김 없는 닫힌 베지에 스트로크로 복원한다", () => {
    const mask = createRasterCanvas(96, 96);
    const ringPts = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return { x: 48 + Math.cos(a) * 26, y: 48 + Math.sin(a) * 26, r: 2.2 };
    });
    drawVariableStroke(mask, 96, 96, ringPts);
    const res = vectorizeRasterLineartInStrokeOrder({ width: 96, height: 96, data: mask });
    expect(res.strokes).toHaveLength(1);
    expect(res.strokes[0].isClosed).toBe(true);
    expect(res.strokes[0].segments.length).toBeGreaterThanOrEqual(2);
    expect(res.strokes[0].maxFitErrorPx).toBeLessThanOrEqual(1.3);
  });

  it("9. 빈 마스크·EDT 중심 거리·Zhang-Suen 세선화·Schneider 베지에 평가 유틸 경계값을 검증한다", () => {
    const emptyRes = vectorizeRasterLineartInStrokeOrder({ width: 32, height: 32, data: new Float32Array(1024) });
    expect(emptyRes.strokes).toHaveLength(0);
    expect(emptyRes.foregroundPixelCount).toBe(0);

    const box = new Uint8Array(625);
    for (let y = 5; y <= 19; y += 1) for (let x = 5; x <= 19; x += 1) box[y * 25 + x] = 1;
    expect(computeEuclideanDistanceTransform(box, 25, 25)[12 * 25 + 12]).toBeCloseTo(8, 2);

    const skel = zhangSuenThinning(box, 25, 25);
    let skelCount = 0;
    for (let i = 0; i < skel.length; i += 1) skelCount += skel[i];
    expect(skelCount).toBeGreaterThan(0);
    expect(skelCount).toBeLessThan(40);

    const fitted = fitCubicBezierSchneider([{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 10 }, { x: 30, y: 4 }], 0.5);
    expect(fitted.length).toBeGreaterThanOrEqual(1);
    const midPt = evaluateCubicBezier(fitted[0].p0, fitted[0].p1, fitted[0].p2, fitted[0].p3, 0.5);
    expect(Number.isFinite(midPt.x) && Number.isFinite(midPt.y)).toBe(true);
  });

  // ── 2. 자가 치유 OPFS/CRDT 캔버스 복원 파이프라인 테스트 (10~18) ─────────────

  it("10. 순수 동기 FIPS 180-4 SHA-256 해시가 NIST 표준 테스트 벡터와 비트 단위로 일치한다", () => {
    expect(computeSyncSha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(computeSyncSha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(computeSyncSha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("11. 정상 캔버스 스냅샷은 무결성 감사를 통과하며 격리·복원 작업이 발생하지 않는다", () => {
    const layers: CanvasLayerMetadata[] = [
      { layerId: "ink", name: "선화", opacity: 1, blendMode: "normal", visible: true, zIndex: 1 },
    ];
    const tiles = [makeSolidTile("ink", 0, 0, 16, [20, 20, 20, 255]), makeSolidTile("ink", 1, 0, 16, [20, 20, 20, 255])];
    const manifest = createTileIntegrityManifest({ canvasWidth: 32, canvasHeight: 16, tileSize: 16, headJournalSeq: 0, layers, tiles });
    const report = auditAndSelfHealCanvasSnapshot({ manifest, layers, tiles });
    expect(report.audit.isHealthy).toBe(true);
    expect(report.quarantinedTiles).toHaveLength(0);
    expect(report.actions).toHaveLength(0);
  });

  it("12. 타일 픽셀 1바이트 오염을 즉시 감지·격리하고 OPFS 획 저널 재실행으로 100% 무손실 복구한다", () => {
    const tileSize = 16;
    const layers: CanvasLayerMetadata[] = [
      { layerId: "ink", name: "먹선", opacity: 1, blendMode: "normal", visible: true, zIndex: 0 },
    ];
    const unsignedJournal: UnsignedOpfsJournalEntry[] = [
      { seq: 1, entryId: "op-1", layerId: "ink", op: "fill-rect", colorRgba: [248, 245, 238, 255], rect: { x: 0, y: 0, width: 32, height: 16 } },
      { seq: 2, entryId: "op-2", layerId: "ink", op: "stroke", colorRgba: [25, 28, 35, 255], points: [{ x: 4, y: 8, radiusPx: 2.2 }, { x: 26, y: 8, radiusPx: 2.5 }] },
    ];
    const journal = createSignedStrokeJournal(unsignedJournal);
    const tile0Pixels = rasterizeJournalEntriesToTile(journal, "ink", 0, 0, tileSize, 2).pixels;
    const tile1Pixels = rasterizeJournalEntriesToTile(journal, "ink", 1, 0, tileSize, 2).pixels;
    const cleanTiles: CanvasTileRecord[] = [
      { tileId: "ink:0:0", layerId: "ink", tileX: 0, tileY: 0, tileSize, pixels: tile0Pixels },
      { tileId: "ink:1:0", layerId: "ink", tileX: 1, tileY: 0, tileSize, pixels: tile1Pixels },
    ];
    const manifest = createTileIntegrityManifest({ canvasWidth: 32, canvasHeight: 16, tileSize, headJournalSeq: 2, layers, tiles: cleanTiles });

    const corruptedPixels = new Uint8Array(tile0Pixels);
    corruptedPixels[137] = corruptedPixels[137] ^ 0x01;
    const res = auditAndSelfHealCanvasSnapshot({
      manifest,
      layers,
      tiles: [{ ...cleanTiles[0], pixels: corruptedPixels }, cleanTiles[1]],
      strokeJournal: journal,
    });
    expect(res.audit.isHealthy).toBe(false);
    expect(res.audit.corruptedTileIds).toEqual(["ink:0:0"]);
    expect(res.quarantinedTiles[0].reason).toBe("corrupted-hash");
    expect(res.losslessRecoveredCount).toBe(1);
    expect(res.actions[0].recoveryMethod).toBe("journal-replay-lossless");
    expect(res.actions[0].verifiedLossless).toBe(true);
    expect(res.actions[0].healedSha256).toBe(manifest.tiles[0].expectedSha256);
    expect(res.healedTiles.find((t) => t.tileId === "ink:0:0")?.pixels).toEqual(tile0Pixels);
  });

  it("13. 완전히 누락(Missing)되거나 절단(Truncated)된 타일도 저널 재실행으로 완벽 복원한다", () => {
    const tileSize = 16;
    const layers: CanvasLayerMetadata[] = [
      { layerId: "color", name: "채색", opacity: 1, blendMode: "normal", visible: true, zIndex: 0 },
    ];
    const journal = createSignedStrokeJournal([
      { seq: 1, entryId: "fill-sky", layerId: "color", op: "fill-rect", colorRgba: [110, 165, 220, 255], rect: { x: 0, y: 0, width: 32, height: 16 } },
    ]);
    const t0: CanvasTileRecord = {
      tileId: "color:0:0", layerId: "color", tileX: 0, tileY: 0, tileSize,
      pixels: rasterizeJournalEntriesToTile(journal, "color", 0, 0, tileSize, 1).pixels,
    };
    const t1: CanvasTileRecord = {
      tileId: "color:1:0", layerId: "color", tileX: 1, tileY: 0, tileSize,
      pixels: rasterizeJournalEntriesToTile(journal, "color", 1, 0, tileSize, 1).pixels,
    };
    const manifest = createTileIntegrityManifest({ canvasWidth: 32, canvasHeight: 16, tileSize, headJournalSeq: 1, layers, tiles: [t0, t1] });
    const res = auditAndSelfHealCanvasSnapshot({ manifest, layers, tiles: [{ ...t0, pixels: t0.pixels.slice(0, 100) }], strokeJournal: journal });
    expect(res.audit.corruptedTileIds).toEqual(["color:0:0"]);
    expect(res.audit.missingTileIds).toEqual(["color:1:0"]);
    expect(res.losslessRecoveredCount).toBe(2);
    expect(verifyTileIntegrityManifest(manifest, layers, res.healedTiles).isHealthy).toBe(true);
  });

  it("14. OPFS 저널이 유실된 경우 정상 인접 4방향 타일 경계 보간으로 이음새 없이 자가 치유한다", () => {
    const layers: CanvasLayerMetadata[] = [
      { layerId: "bg", name: "배경", opacity: 1, blendMode: "normal", visible: true, zIndex: 0 },
    ];
    const center = makeSolidTile("bg", 1, 1, 16, [180, 140, 95, 255]);
    const left = makeSolidTile("bg", 0, 1, 16, [180, 140, 95, 255]);
    const right = makeSolidTile("bg", 2, 1, 16, [180, 140, 95, 255]);
    const top = makeSolidTile("bg", 1, 0, 16, [180, 140, 95, 255]);
    const bottom = makeSolidTile("bg", 1, 2, 16, [180, 140, 95, 255]);
    const manifest = createTileIntegrityManifest({
      canvasWidth: 48, canvasHeight: 48, tileSize: 16, headJournalSeq: 5, layers, tiles: [left, right, top, bottom, center],
    });
    const brokenCenter: CanvasTileRecord = { ...center, pixels: new Uint8Array(1024).fill(0) };
    const res = auditAndSelfHealCanvasSnapshot({ manifest, layers, tiles: [left, right, top, bottom, brokenCenter] });
    expect(res.interpolatedRecoveredCount).toBe(1);
    expect(res.actions[0].recoveryMethod).toBe("neighbor-boundary-interpolation");
    expect(res.actions[0].usedNeighborDirections).toEqual(["left", "right", "top", "bottom"]);
    expect(res.actions[0].boundarySeamDelta).toBe(0);
    const healedCenter = res.healedTiles.find((t) => t.tileId === "bg:1:1");
    expect([healedCenter?.pixels[0], healedCenter?.pixels[1], healedCenter?.pixels[2], healedCenter?.pixels[3]]).toEqual([180, 140, 95, 255]);
  });

  it("15. 좌우 색상이 다른 인접 타일 사이에서 경계 보간 치유가 단조 부드러운 그라데이션을 만든다", () => {
    const layers: CanvasLayerMetadata[] = [
      { layerId: "sky", name: "하늘", opacity: 1, blendMode: "normal", visible: true, zIndex: 0 },
    ];
    const left = makeSolidTile("sky", 0, 0, 16, [40, 80, 200, 255]);
    const mid = makeSolidTile("sky", 1, 0, 16, [120, 120, 120, 255]);
    const right = makeSolidTile("sky", 2, 0, 16, [220, 180, 60, 255]);
    const manifest = createTileIntegrityManifest({ canvasWidth: 48, canvasHeight: 16, tileSize: 16, headJournalSeq: 2, layers, tiles: [left, mid, right] });
    const res = auditAndSelfHealCanvasSnapshot({ manifest, layers, tiles: [left, right] });
    const healedMid = res.healedTiles.find((t) => t.tileId === "sky:1:0");
    expect(healedMid).toBeDefined();
    if (!healedMid) return;
    expect(healedMid.pixels[0]).toBeLessThan(65);
    expect(healedMid.pixels[8 * 4]).toBeGreaterThan(healedMid.pixels[0]);
    expect(healedMid.pixels[15 * 4]).toBeGreaterThan(195);
  });

  it("16. 해시 체인이 변조된 저널은 신뢰하지 않고 보간 치유로 안전 폴백한다", () => {
    const layers: CanvasLayerMetadata[] = [
      { layerId: "ink", name: "선화", opacity: 1, blendMode: "normal", visible: true, zIndex: 0 },
    ];
    const journal = createSignedStrokeJournal([
      { seq: 1, entryId: "op-1", layerId: "ink", op: "fill-rect", colorRgba: [200, 200, 200, 255], rect: { x: 0, y: 0, width: 32, height: 16 } },
    ]);
    const t0 = makeSolidTile("ink", 0, 0, 16, [200, 200, 200, 255]);
    const t1 = makeSolidTile("ink", 1, 0, 16, [200, 200, 200, 255]);
    const manifest = createTileIntegrityManifest({ canvasWidth: 32, canvasHeight: 16, tileSize: 16, headJournalSeq: 1, layers, tiles: [t0, t1] });
    const res = auditAndSelfHealCanvasSnapshot({
      manifest, layers, tiles: [t0], strokeJournal: [{ ...journal[0], colorRgba: [10, 10, 10, 255] as const }],
    });
    expect(res.journalChainValid).toBe(false);
    expect(res.losslessRecoveredCount).toBe(0);
    expect(res.interpolatedRecoveredCount).toBe(1);
    expect(res.actions[0].recoveryMethod).toBe("neighbor-boundary-interpolation");
  });

  it("17. 레이어 메타데이터 변조와 매니페스트 자체 변조를 정확히 적발하고 백업 메타데이터로 복구한다", () => {
    const cleanLayer: CanvasLayerMetadata = { layerId: "line", name: "메인 선화", opacity: 0.9, blendMode: "multiply", visible: true, zIndex: 2 };
    const tile = makeSolidTile("line", 0, 0, 16, [0, 0, 0, 255]);
    const manifest = createTileIntegrityManifest({ canvasWidth: 16, canvasHeight: 16, tileSize: 16, headJournalSeq: 0, layers: [cleanLayer], tiles: [tile] });
    const tamperedLayer: CanvasLayerMetadata = { ...cleanLayer, opacity: 0.1 };
    expect(computeLayerMetadataDigest(tamperedLayer)).not.toBe(manifest.layers[0].expectedMetadataSha256);

    const res = auditAndSelfHealCanvasSnapshot({ manifest, layers: [tamperedLayer], tiles: [tile], fallbackLayerMetadata: [cleanLayer] });
    expect(res.audit.corruptedLayerIds).toEqual(["line"]);
    expect(res.recoveredLayerMetadataCount).toBe(1);
    expect(res.healedLayers[0].opacity).toBe(0.9);

    const manifestAudit = verifyTileIntegrityManifest({ ...manifest, manifestSha256: "deadbeef".repeat(8) }, [cleanLayer], [tile]);
    expect(manifestAudit.manifestTampered).toBe(true);
    expect(manifestAudit.isHealthy).toBe(false);
  });

  it("18. 저널도 없고 인접 정상 타일도 없는 고립 손상 타일은 빈 타일 폴백으로 안전 격리한다", () => {
    const layer: CanvasLayerMetadata = { layerId: "solo", name: "단독", opacity: 1, blendMode: "normal", visible: true, zIndex: 0 };
    const manifest = createTileIntegrityManifest({
      canvasWidth: 16, canvasHeight: 16, tileSize: 16, headJournalSeq: 0, layers: [layer], tiles: [makeSolidTile("solo", 0, 0, 16, [55, 66, 77, 255])],
    });
    const res = auditAndSelfHealCanvasSnapshot({ manifest, layers: [layer], tiles: [] });
    expect(res.blankFallbackCount).toBe(1);
    expect(res.actions[0].recoveryMethod).toBe("blank-fallback");
    expect(res.healedTiles).toHaveLength(1);
  });

  // ── 3. 스튜디오 LAN P2P 이종 GPU/NPU 메쉬 오프로더 테스트 (19~24) ───────────

  it("19. 2ms 이내 LAN의 RTX PC / Mac Studio M4 피어가 있으면 무거운 3D/AI 작업을 자동 오프로드한다", () => {
    const ipad = makeTabletTelemetry();
    const rtxPeer = makeDesktopPeer({ peerId: "rtx-desk", rttMs: 1.9, computeTflops: 96 });
    const m4Peer = makeDesktopPeer({
      peerId: "mac-studio-m4", displayName: "Mac Studio M4 Ultra", formFactor: "desktop-mac-studio",
      accelerator: "apple-metal-ane", rttMs: 1.4, computeTflops: 54, npuTops: 76,
    });
    const plan = planLanP2pMeshOffload(ipad, [m4Peer, rtxPeer], makeHeavyWorkload());
    expect(plan.decision).toBe("offload-lan-peer");
    expect(plan.targetPeerId).toBe("rtx-desk");
    expect(plan.estimatedSpeedupRatio).toBeGreaterThan(2);
    expect(plan.fallbackContract.guaranteedWithinOneFrame).toBe(true);

    const aiSelection = selectBestLanPeerForWorkload(
      ipad,
      [m4Peer, makeDesktopPeer({ peerId: "mid-gpu", computeTflops: 30, npuTops: 0, rttMs: 2.1 })],
      makeHeavyWorkload({ kind: "ai-inpaint-tile", estimatedGflops: 90 }),
    );
    expect(aiSelection.selectedPeer?.peerId).toBe("mac-studio-m4");
  });

  it("20. LAN 피어 RTT가 4ms 임계를 초과하거나 외부 서브넷(WAN)이면 자동 거부하고 로컬 폴백한다", () => {
    const plan = planLanP2pMeshOffload(
      makeTabletTelemetry(),
      [makeDesktopPeer({ peerId: "wifi-laggy", rttMs: 6.4 }), makeDesktopPeer({ peerId: "remote-cloud", sameSubnetLan: false, rttMs: 2.5 })],
      makeHeavyWorkload(),
    );
    expect(plan.decision).toBe("execute-local");
    expect(plan.reason).toBe("no-eligible-lan-peer");
    expect(plan.peerSelection.candidates.find((c) => c.peerId === "wifi-laggy")?.rejectionReasons).toContain("rtt-exceeded");
    expect(plan.peerSelection.candidates.find((c) => c.peerId === "remote-cloud")?.rejectionReasons).toContain("outside-local-lan");
  });

  it("21. 미충전 피어가 배터리 부족 상태이거나 로컬 태블릿이 초저배터리(<=10%)이면 안전하게 로컬 폴백한다", () => {
    const lowBatteryLaptop = makeDesktopPeer({
      peerId: "macbook-low-bat", formFactor: "laptop-workstation", isPluggedIn: false, batteryPercent: 18, rttMs: 1.5,
    });
    const planPeerLow = planLanP2pMeshOffload(makeTabletTelemetry(), [lowBatteryLaptop], makeHeavyWorkload());
    expect(planPeerLow.decision).toBe("execute-local");
    expect(planPeerLow.peerSelection.candidates[0].rejectionReasons).toContain("peer-low-battery");

    const planLocalCritical = planLanP2pMeshOffload(
      makeTabletTelemetry({ batteryPercent: 8, isPluggedIn: false }),
      [makeDesktopPeer()],
      makeHeavyWorkload({ requiredVramMb: 1024 }),
    );
    expect(planLocalCritical.decision).toBe("execute-local");
    expect(planLocalCritical.reason).toBe("local-critical-battery-radio-guard");
  });

  it("22. 로컬 태블릿의 VRAM 부족 또는 심각한 발열(serious) 시 정상 LAN 데스크톱으로 즉시 분산한다", () => {
    const planVram = planLanP2pMeshOffload(
      makeTabletTelemetry({ availableVramMb: 1024 }),
      [makeDesktopPeer({ availableVramMb: 16384 })],
      makeHeavyWorkload({ requiredVramMb: 3072 }),
    );
    expect(planVram.decision).toBe("offload-lan-peer");
    expect(planVram.reason).toBe("local-vram-insufficient");
    expect(planVram.fallbackContract.actionOnDisconnect).toBe("local-proxy-resume");
    expect(planVram.fallbackContract.degradedLocalTileScale).toBeLessThan(1);

    const planThermal = planLanP2pMeshOffload(
      makeTabletTelemetry({ thermalState: "serious", computeTflops: 20 }),
      [makeDesktopPeer({ computeTflops: 22, rttMs: 1.5 })],
      makeHeavyWorkload({ estimatedGflops: 40 }),
    );
    expect(planThermal.decision).toBe("offload-lan-peer");
    expect(planThermal.reason).toBe("local-thermal-relief");
  });

  it("23. 초경량 실시간 브러시 획은 네트워크 왕복 없이 로컬 패스트패스로 직행한다", () => {
    const plan = planLanP2pMeshOffload(
      makeTabletTelemetry({ computeTflops: 8 }),
      [makeDesktopPeer({ rttMs: 2.2 })],
      { workloadId: "dab-001", kind: "brush-stroke-realtime", payloadBytes: 4096, resultBytes: 4096, estimatedGflops: 2.5, requiredVramMb: 64, latencySensitive: true },
    );
    expect(plan.decision).toBe("execute-local");
    expect(plan.reason).toBe("tiny-interactive-local-fastpath");
  });

  it("24. 오프로딩 중 LAN 피어 연결이 끊어져도 1프레임 예산(8.33ms) 안에서 프레임 드롭 0으로 로컬 폴백한다", () => {
    const ipad = makeTabletTelemetry({ targetFrameBudgetMs: 8.33 });
    const activePlan = planLanP2pMeshOffload(ipad, [makeDesktopPeer({ rttMs: 1.8 })], makeHeavyWorkload());
    expect(activePlan.decision).toBe("offload-lan-peer");

    const failover = handlePeerDisconnectFailover(activePlan, 2.5, 0.7);
    expect(failover.switchedToLocal).toBe(true);
    expect(failover.withinSingleFrameBudget).toBe(true);
    expect(failover.frameDropCount).toBe(0);
    expect(failover.totalFailoverMs).toBeLessThan(ipad.targetFrameBudgetMs);
  });

  // ── 4. 비의료 창작 리듬 인체공학 페이서 테스트 (25~28) ───────────────────────

  it("25. 안정적인 작업 리듬에서는 flow 상태를 유지하고 불필요한 휴식 알림이나 보정 강제를 띄우지 않는다", () => {
    const pacing = evaluateCreativeErgonomicPacing({
      continuousDrawingMinutes: 22, baselineStrokeVelocityPxPerSec: 420, recentStrokeVelocityPxPerSec: 405,
      baselineUndoPerMinute: 2.0, recentUndoPerMinute: 2.1, strokeJitterRatio: 0.12, currentStabilizerStrength: 0.25, minutesSinceLastBreak: 22,
    });
    expect(pacing.pacingLevel).toBe("flow");
    expect(pacing.isMedicalAdvice).toBe(false);
    expect(pacing.suggestedBreakMinutes).toBe(0);
    expect(pacing.detectedSignals).toHaveLength(0);
    expect(pacing.shouldAutoBoostStabilizer).toBe(false);
  });

  it("26. 연속 장시간 작업(80분)과 획 속도 급저하·Undo 급증이 겹치면 휴식 권고와 손떨림 보정 강화를 제안한다", () => {
    const pacing = evaluateCreativeErgonomicPacing({
      continuousDrawingMinutes: 82, baselineStrokeVelocityPxPerSec: 500, recentStrokeVelocityPxPerSec: 270,
      baselineUndoPerMinute: 1.8, recentUndoPerMinute: 6.5, strokeJitterRatio: 0.58, currentStabilizerStrength: 0.2, minutesSinceLastBreak: 82,
    });
    expect(["rest-recommended", "pause-suggested"]).toContain(pacing.pacingLevel);
    expect(pacing.detectedSignals).toEqual(expect.arrayContaining(["long-continuous-session", "velocity-drop", "undo-spike", "elevated-jitter"]));
    expect(pacing.suggestedBreakMinutes).toBeGreaterThanOrEqual(5);
    expect(pacing.shouldAutoBoostStabilizer).toBe(true);
    expect(pacing.recommendedStabilizerStrength).toBeGreaterThan(0.45);
    expect(pacing.suggestedStretchActivityKo).not.toBeNull();
  });

  it("27. 짧은 작업 시간이라도 Undo 급증과 미세 떨림이 튀면 가벼운 휴식 안내와 손떨림 보정 강화를 추천한다", () => {
    const pacing = evaluateCreativeErgonomicPacing({
      continuousDrawingMinutes: 28, baselineStrokeVelocityPxPerSec: 440, recentStrokeVelocityPxPerSec: 420,
      baselineUndoPerMinute: 1.5, recentUndoPerMinute: 5.5, strokeJitterRatio: 0.52, currentStabilizerStrength: 0.15, minutesSinceLastBreak: 28,
    });
    expect(["gentle-nudge", "rest-recommended"]).toContain(pacing.pacingLevel);
    expect(pacing.detectedSignals).toEqual(expect.arrayContaining(["undo-spike", "elevated-jitter"]));
    expect(pacing.shouldAutoBoostStabilizer).toBe(true);
    expect(pacing.recommendedStabilizerStrength).toBeGreaterThan(0.3);
  });

  it("28. 모든 인체공학 페이서 한국어 문구는 의료·진단·질환·처방 표현을 절대 포함하지 않는다", () => {
    const bannedMedicalPattern = /진단|치료|질환|질병|염증|증후군|건초염|터널|처방|병원|의사|환자|통증/u;
    const scenarios = [
      { continuousDrawingMinutes: 15, baselineStrokeVelocityPxPerSec: 400, recentStrokeVelocityPxPerSec: 390, baselineUndoPerMinute: 1.5, recentUndoPerMinute: 1.5, strokeJitterRatio: 0.1, currentStabilizerStrength: 0.2, minutesSinceLastBreak: 15 },
      { continuousDrawingMinutes: 50, baselineStrokeVelocityPxPerSec: 400, recentStrokeVelocityPxPerSec: 360, baselineUndoPerMinute: 1.5, recentUndoPerMinute: 2.0, strokeJitterRatio: 0.25, currentStabilizerStrength: 0.2, minutesSinceLastBreak: 50 },
      { continuousDrawingMinutes: 80, baselineStrokeVelocityPxPerSec: 400, recentStrokeVelocityPxPerSec: 260, baselineUndoPerMinute: 1.5, recentUndoPerMinute: 5.5, strokeJitterRatio: 0.5, currentStabilizerStrength: 0.2, minutesSinceLastBreak: 80 },
      { continuousDrawingMinutes: 120, baselineStrokeVelocityPxPerSec: 450, recentStrokeVelocityPxPerSec: 180, baselineUndoPerMinute: 1.5, recentUndoPerMinute: 9.0, strokeJitterRatio: 0.8, currentStabilizerStrength: 0.2, minutesSinceLastBreak: 120 },
    ];
    for (const sc of scenarios) {
      const res = evaluateCreativeErgonomicPacing(sc);
      expect(res.isMedicalAdvice).toBe(false);
      const text = [res.headlineKo, res.guidanceKo, res.nonMedicalNoticeKo, res.suggestedStretchActivityKo ?? ""].join(" ");
      expect(bannedMedicalPattern.test(text)).toBe(false);
    }
  });
});
