#!/usr/bin/env node
/**
 * Wave 15C Track 2 — 장시간 다중 브러시 안정성 스트레스 오라클 및 시각 비교 시트 생성기.
 * 8종 실물 브러시 × 1,200회 연속 혼합 스트로크(장거리 4,000px 획 30회 포함)를 실제
 * 실행해 ① 후반/초반 200획 비율 <= 1.35×, ② 메모리 상한 <= 64 MiB & 누수 0 bytes,
 * ③ 라이브 === 커밋 픽셀 오차 0.0000, ④ 8종 팁·Kubelka-Munk 비교 PNG를 검증·생성한다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

import {
  REAL_MEDIA_TIP_IDS,
  RealMediaTipAtlasCache,
  computeTipPairwiseDistance,
  generateRealMediaTipMask,
  mixPigmentsKubelkaMunk,
  mixPigmentsKubelkaMunkDetailed,
} from "../apps/web/src/domains/creator/brush-baked-cache/real-media-tip-atlas.ts";
import {
  DEFAULT_BAKER_MAX_MEMORY_BYTES,
  LayerStrokeBitmapBaker,
} from "../apps/web/src/domains/creator/brush-baked-cache/layer-stroke-bitmap-baker.ts";
import {
  IncrementalDeltaStrokeBuffer,
  computeRgbaRegionDiff,
} from "../apps/web/src/domains/creator/brush-baked-cache/incremental-delta-stroke-buffer.ts";

const DEFAULT_PNG_PATH =
  "/Users/hjunkim/.gemini/antigravity/brain/d47cdf47-6af8-42db-b2c5-9194377c60fa/scratch/real-media-8tips-and-km-mix-sheet.png";

const TOTAL_STROKES = 1200;
const CYCLE_LENGTH = 40;
const MAX_LATE_EARLY_RATIO = 1.35;
const MAX_AVG_COMMIT_MS = 2.0;

const PALETTE = [
  { r: 30, g: 34, b: 42 }, { r: 205, g: 52, b: 42 }, { r: 24, g: 26, b: 30 }, { r: 218, g: 108, b: 46 },
  { r: 16, g: 69, b: 216 }, { r: 156, g: 58, b: 32 }, { r: 18, g: 22, b: 32 }, { r: 22, g: 128, b: 174 },
];

const TIP_LABELS = {
  "graphite-pencil-6b": "GRAPHITE PENCIL 6B", "wax-crayon-block": "WAX CRAYON BLOCK",
  "square-charcoal": "SQUARE CHARCOAL", "soft-pastel-chalk": "SOFT PASTEL CHALK",
  "sable-watercolor": "SABLE WATERCOLOR", "hog-bristle-oil": "HOG BRISTLE OIL 48",
  "gpen-nib-elastic": "G-PEN NIB ELASTIC", "marker-chisel-felt": "MARKER CHISEL FELT",
};

const FONT_5X7 = {
  " ": [0, 0, 0, 0, 0, 0, 0], "-": [0, 0, 0, 31, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  "/": [1, 2, 4, 8, 16, 0, 0], ":": [0, 12, 12, 0, 12, 12, 0], "+": [0, 4, 4, 31, 4, 4, 0],
  "|": [4, 4, 4, 4, 4, 4, 4], "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8], "=": [0, 0, 31, 0, 31, 0, 0],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [30, 1, 1, 14, 1, 1, 30], "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [14, 16, 30, 17, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8], "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12], A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 14], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 18, 18, 12], K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  Buffer.from(type, "ascii").copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodeRgbaPng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function fillRect(img, w, h, x, y, rw, rh, r, g, b, a = 255) {
  const x0 = Math.max(0, Math.floor(x)); const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w, Math.floor(x + rw)); const y1 = Math.min(h, Math.floor(y + rh));
  for (let py = y0; py < y1; py += 1) {
    let off = (py * w + x0) * 4;
    for (let px = x0; px < x1; px += 1) {
      img[off] = r; img[off + 1] = g; img[off + 2] = b; img[off + 3] = a;
      off += 4;
    }
  }
}

function strokeRect(img, w, h, x, y, rw, rh, r, g, b) {
  fillRect(img, w, h, x, y, rw, 1, r, g, b);
  fillRect(img, w, h, x, y + rh - 1, rw, 1, r, g, b);
  fillRect(img, w, h, x, y, 1, rh, r, g, b);
  fillRect(img, w, h, x + rw - 1, y, 1, rh, r, g, b);
}

function drawText(img, w, h, text, x, y, r, g, b, scale = 1) {
  const upper = String(text).toUpperCase();
  let cursorX = Math.floor(x);
  for (let i = 0; i < upper.length; i += 1) {
    const glyph = FONT_5X7[upper[i]] ?? FONT_5X7[" "];
    for (let gy = 0; gy < 7; gy += 1) {
      const rowBits = glyph[gy] ?? 0;
      for (let gx = 0; gx < 5; gx += 1) {
        if ((rowBits & (1 << (4 - gx))) !== 0) fillRect(img, w, h, cursorX + gx * scale, y + gy * scale, scale, scale, r, g, b);
      }
    }
    cursorX += 6 * scale;
  }
}

function blitMaskOnPaper(img, imgW, imgH, mask, size, dstX, dstY, ink) {
  for (let y = 0; y < size; y += 1) {
    const py = dstY + y;
    if (py < 0 || py >= imgH) continue;
    for (let x = 0; x < size; x += 1) {
      const px = dstX + x;
      if (px < 0 || px >= imgW) continue;
      const m = mask[y * size + x] ?? 0;
      const off = (py * imgW + px) * 4;
      img[off] = Math.round((img[off] ?? 248) + (ink.r - (img[off] ?? 248)) * m);
      img[off + 1] = Math.round((img[off + 1] ?? 245) + (ink.g - (img[off + 1] ?? 245)) * m);
      img[off + 2] = Math.round((img[off + 2] ?? 238) + (ink.b - (img[off + 2] ?? 238)) * m);
      img[off + 3] = 255;
    }
  }
}

function blitRgbaOver(img, imgW, imgH, src, srcW, srcH, dstX, dstY) {
  for (let y = 0; y < srcH; y += 1) {
    const py = dstY + y;
    if (py < 0 || py >= imgH) continue;
    for (let x = 0; x < srcW; x += 1) {
      const px = dstX + x;
      if (px < 0 || px >= imgW) continue;
      const sOff = (y * srcW + x) * 4;
      const a = (src[sOff + 3] ?? 0) / 255;
      if (a <= 0) continue;
      const dOff = (py * imgW + px) * 4;
      img[dOff] = Math.round((img[dOff] ?? 248) * (1 - a) + (src[sOff] ?? 0) * a);
      img[dOff + 1] = Math.round((img[dOff + 1] ?? 245) * (1 - a) + (src[sOff + 1] ?? 0) * a);
      img[dOff + 2] = Math.round((img[dOff + 2] ?? 238) * (1 - a) + (src[sOff + 2] ?? 0) * a);
      img[dOff + 3] = 255;
    }
  }
}

function buildStrokePath(strokeIndex, isMarathon) {
  // 5120×4096 캔버스(320타일=80MiB 비압축)에 고르게 분산시켜 64MiB 상한 LRU 압축·회수를 실측 스트레스한다.
  const cellX = ((strokeIndex * 7) % 18) * 260 + 60;
  const cellY = ((strokeIndex * 5) % 14) * 260 + 60;
  if (isMarathon) {
    const samples = [];
    const segments = 125;
    const startY = 180 + ((strokeIndex * 97) % 3400);
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      samples.push({ x: 64 + t * 4000, y: startY + Math.sin(t * Math.PI * 6 + strokeIndex) * 72, pressure: 0.35 + 0.55 * Math.sin(t * Math.PI), timestampMs: i * 8 });
    }
    return samples;
  }
  const samples = [];
  const length = 180 + (strokeIndex % 5) * 42;
  const angle = ((strokeIndex * 37) % 360) * (Math.PI / 180);
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const bend = Math.sin(t * Math.PI) * 26 * (strokeIndex % 2 === 0 ? 1 : -1);
    samples.push({
      x: Math.max(24, Math.min(5080, cellX + Math.cos(angle) * length * t - Math.sin(angle) * bend)),
      y: Math.max(24, Math.min(4060, cellY + Math.sin(angle) * length * t + Math.cos(angle) * bend)),
      pressure: 0.25 + 0.7 * Math.sin(t * Math.PI),
      timestampMs: i * 8,
    });
  }
  return samples;
}

function runLongSessionStressOracle() {
  const atlas = new RealMediaTipAtlasCache({ maxEntries: 64, maxBytes: 8 * 1024 * 1024 });
  atlas.prewarmAll();

  const warmBaker = new LayerStrokeBitmapBaker({ maxMemoryBytes: DEFAULT_BAKER_MAX_MEMORY_BYTES });
  const warmLive = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });
  for (let w = 0; w < 24; w += 1) {
    const tipId = REAL_MEDIA_TIP_IDS[w % REAL_MEDIA_TIP_IDS.length];
    warmLive.beginStroke({ strokeId: `warm-${w}`, tipId, color: PALETTE[w % PALETTE.length], radiusPx: 9, compositeMode: w % 2 === 0 ? "kubelka-munk" : "source-over" });
    warmLive.appendPoints(buildStrokePath(w, false));
    warmLive.commitToBaker(warmBaker, "warm");
  }
  warmLive.dispose();
  warmBaker.dispose();

  const baker = new LayerStrokeBitmapBaker({ maxMemoryBytes: DEFAULT_BAKER_MAX_MEMORY_BYTES });
  const live = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });
  const strokeDurationsMs = [];
  const commitDurationsMs = [];
  let marathonCount = 0;
  let parityChecks = 0;
  let parityMaxAbsDiff = 0;
  let parityMaxRmse = 0;
  let maxObservedBytes = 0;
  let totalReRasterizedDabs = 0;

  for (let i = 0; i < TOTAL_STROKES; i += 1) {
    const inCycle = i % CYCLE_LENGTH;
    const isMarathon = inCycle === CYCLE_LENGTH - 1;
    if (isMarathon) marathonCount += 1;
    const tipId = REAL_MEDIA_TIP_IDS[i % REAL_MEDIA_TIP_IDS.length];
    const color = PALETTE[i % PALETTE.length];
    const radiusPx = isMarathon ? 8 : 7 + (inCycle % 5) * 2;
    const useWetKm = tipId === "sable-watercolor" || tipId === "hog-bristle-oil";
    const samples = buildStrokePath(i, isMarathon);
    const shouldCheckParity = i % 25 === 0 || isMarathon;

    const t0 = performance.now();
    live.beginStroke({
      strokeId: `stroke-${i}`, tipId, color, radiusPx,
      opacity: useWetKm ? 0.78 : 0.92,
      compositeMode: useWetKm ? "kubelka-munk" : "source-over",
      wetMixStrength: 0.85, seed: 20261123,
    });
    const chunkSize = isMarathon ? 5 : 4;
    for (let s = 0; s < samples.length; s += chunkSize) live.appendPoints(samples.slice(s, s + chunkSize));
    const appendElapsed = performance.now() - t0;

    let previewRegion = null;
    let checkBox = null;
    if (shouldCheckParity) {
      const b = live.getActiveBounds();
      if (b) {
        const w = Math.min(512, Math.max(1, Math.ceil(b.maxX - b.minX)));
        const h = Math.min(256, Math.max(1, Math.ceil(b.maxY - b.minY)));
        checkBox = { x: Math.floor(b.minX), y: Math.floor(b.minY), w, h };
        previewRegion = live.composePreviewRegion(baker, "main", checkBox.x, checkBox.y, checkBox.w, checkBox.h);
      }
    }

    const commitRes = live.commitToBaker(baker, "main");
    totalReRasterizedDabs += commitRes.reRasterizedDabs;
    strokeDurationsMs.push(appendElapsed + commitRes.commitElapsedMs);
    commitDurationsMs.push(commitRes.commitElapsedMs);

    if (shouldCheckParity && previewRegion && checkBox) {
      const diff = computeRgbaRegionDiff(previewRegion, baker.readRegion("main", checkBox.x, checkBox.y, checkBox.w, checkBox.h));
      parityChecks += 1;
      if (diff.maxAbsDiff > parityMaxAbsDiff) parityMaxAbsDiff = diff.maxAbsDiff;
      if (diff.rmse > parityMaxRmse) parityMaxRmse = diff.rmse;
    }

    const memNow = baker.getMemoryStats().totalTrackedBytes;
    if (memNow > maxObservedBytes) maxObservedBytes = memNow;
  }

  const memStats = baker.getMemoryStats();
  const atlasStats = atlas.getStats();
  const liveStats = live.getBufferStats();
  live.dispose();
  baker.dispose();
  const postDisposeTrackedBytes = baker.getMemoryStats().totalTrackedBytes + live.getBufferStats().activeBytes + live.getBufferStats().poolBytes;

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const early200AvgMs = avg(strokeDurationsMs.slice(0, 200));
  const late200AvgMs = avg(strokeDurationsMs.slice(TOTAL_STROKES - 200));
  const sortedCommits = [...commitDurationsMs].sort((a, b) => a - b);

  return {
    totalStrokes: TOTAL_STROKES, marathon4000pxCount: marathonCount,
    early200AvgMs, late200AvgMs, lateToEarlyRatio: late200AvgMs / Math.max(1e-6, early200AvgMs),
    avgCommitMs: avg(commitDurationsMs), p95CommitMs: sortedCommits[Math.floor(sortedCommits.length * 0.95)] ?? 0,
    peakMemoryBytes: memStats.peakMemoryBytes, peakMemoryMiB: memStats.peakMemoryBytes / (1024 * 1024),
    maxObservedBytes, maxMemoryBytes: memStats.maxMemoryBytes,
    compressionCount: memStats.compressionCount, decompressionCount: memStats.decompressionCount,
    evictedTileCount: memStats.evictedTileCount, bakerPoolHits: memStats.poolHits, livePoolHits: liveStats.poolHits,
    atlasCacheHitRate: atlasStats.hits / Math.max(1, atlasStats.hits + atlasStats.misses),
    parityChecks, parityMaxAbsDiff, parityMaxRmse, totalReRasterizedDabs, postDisposeTrackedBytes,
    budgetComplianceOk: memStats.budgetComplianceOk,
  };
}

function renderComparisonSheetPng(outPath, oracle) {
  const W = 1280; const H = 940;
  const img = new Uint8ClampedArray(W * H * 4);
  fillRect(img, W, H, 0, 0, W, H, 244, 241, 234);

  fillRect(img, W, H, 0, 0, W, 52, 28, 34, 44);
  drawText(img, W, H, "REAL MEDIA 8-TIP 128X128 ATLAS + LIVE STROKES + KUBELKA-MUNK MIX", 24, 14, 246, 243, 236, 2);
  drawText(
    img, W, H,
    `1200 STROKES (30X 4000PX) | LATE/EARLY ${oracle.lateToEarlyRatio.toFixed(2)}X | PEAK ${oracle.peakMemoryMiB.toFixed(1)} MIB | PARITY ${oracle.parityMaxRmse.toFixed(4)}`,
    24, 36, 178, 214, 196, 1,
  );

  const atlas = new RealMediaTipAtlasCache();
  const cardW = 304; const cardH = 248;
  const tipMasks = REAL_MEDIA_TIP_IDS.map((id) => generateRealMediaTipMask(id));

  for (let idx = 0; idx < REAL_MEDIA_TIP_IDS.length; idx += 1) {
    const tipId = REAL_MEDIA_TIP_IDS[idx];
    const mask = tipMasks[idx];
    const cx = 16 + (idx % 4) * (cardW + 10);
    const cy = 64 + Math.floor(idx / 4) * (cardH + 10);
    const ink = PALETTE[idx % PALETTE.length];

    fillRect(img, W, H, cx, cy, cardW, cardH, 252, 250, 245);
    strokeRect(img, W, H, cx, cy, cardW, cardH, 206, 200, 188);
    fillRect(img, W, H, cx, cy, cardW, 24, 44, 52, 64);
    drawText(img, W, H, TIP_LABELS[tipId], cx + 8, cy + 9, 244, 241, 234, 1);

    const tipX = cx + 8; const tipY = cy + 32;
    fillRect(img, W, H, tipX, tipY, 128, 128, 247, 244, 237);
    blitMaskOnPaper(img, W, H, mask.data, 128, tipX, tipY, ink);
    strokeRect(img, W, H, tipX, tipY, 128, 128, 216, 210, 198);

    const mipY = tipY + 136;
    for (const [dx, sz, level] of [[0, 64, mask.mipmaps.level64], [68, 32, mask.mipmaps.level32], [104, 16, mask.mipmaps.level16]]) {
      fillRect(img, W, H, tipX + dx, mipY, sz, sz, 247, 244, 237);
      blitMaskOnPaper(img, W, H, level, sz, tipX + dx, mipY, ink);
      strokeRect(img, W, H, tipX + dx, mipY, sz, sz, 216, 210, 198);
    }
    drawText(img, W, H, "64 32 16", tipX + 68, mipY + 46, 110, 114, 122, 1);

    const ribX = cx + 144; const ribY = cy + 32; const ribW = 152; const ribH = 200;
    fillRect(img, W, H, ribX, ribY, ribW, ribH, 248, 245, 238);
    const demoBaker = new LayerStrokeBitmapBaker({ maxMemoryBytes: 4 * 1024 * 1024 });
    const demoLive = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });
    demoLive.beginStroke({ strokeId: `demo-${tipId}`, tipId, color: ink, radiusPx: 18, opacity: 0.94, spacingRatio: 0.08 });
    const ribSamples = [];
    for (let s = 0; s <= 56; s += 1) {
      const t = s / 56;
      ribSamples.push({ x: 76 + Math.sin(t * Math.PI * 2) * 34, y: 22 + t * 156, pressure: 0.14 + 0.86 * Math.sin(t * Math.PI) });
    }
    demoLive.appendPoints(ribSamples);
    demoLive.commitToBaker(demoBaker, "demo");
    blitRgbaOver(img, W, H, demoBaker.readRegion("demo", 0, 0, ribW, ribH), ribW, ribH, ribX, ribY);
    strokeRect(img, W, H, ribX, ribY, ribW, ribH, 216, 210, 198);
    demoLive.dispose();
    demoBaker.dispose();
  }

  const botY = 582;
  fillRect(img, W, H, 16, botY, W - 32, H - botY - 16, 252, 250, 245);
  strokeRect(img, W, H, 16, botY, W - 32, H - botY - 16, 206, 200, 188);
  fillRect(img, W, H, 16, botY, W - 32, 26, 44, 52, 64);
  drawText(img, W, H, "KUBELKA-MUNK 16-BAND SPECTRAL MIX (TOP) VS SRGB LINEAR LERP (BOTTOM) + WET GLAZE OVERLAP", 26, botY + 10, 244, 241, 234, 1);

  const kmPairs = [
    ["ULTRAMARINE BLUE + CADMIUM YELLOW", { r: 16, g: 69, b: 216 }, { r: 248, g: 214, b: 18 }],
    ["COBALT BLUE + LEMON YELLOW", { r: 20, g: 82, b: 205 }, { r: 250, g: 240, b: 45 }],
    ["CRIMSON RED + CADMIUM YELLOW", { r: 215, g: 30, b: 45 }, { r: 248, g: 214, b: 18 }],
    ["ULTRAMARINE BLUE + CRIMSON RED", { r: 16, g: 69, b: 216 }, { r: 215, g: 30, b: 45 }],
  ];
  for (let pIdx = 0; pIdx < kmPairs.length; pIdx += 1) {
    const [label, colA, colB] = kmPairs[pIdx];
    const rowY = botY + 40 + pIdx * 72;
    drawText(img, W, H, label, 30, rowY, 42, 48, 58, 1);
    drawText(img, W, H, "KM", 30, rowY + 16, 24, 108, 62, 1);
    drawText(img, W, H, "RGB", 26, rowY + 40, 128, 122, 114, 1);
    for (let s = 0; s < 17; s += 1) {
      const t = s / 16;
      const km = mixPigmentsKubelkaMunk(colA, colB, t);
      const sx = 54 + s * 46;
      fillRect(img, W, H, sx, rowY + 12, 44, 22, km.r, km.g, km.b);
      fillRect(img, W, H, sx, rowY + 36, 44, 20, Math.round(colA.r + (colB.r - colA.r) * t), Math.round(colA.g + (colB.g - colA.g) * t), Math.round(colA.b + (colB.b - colA.b) * t));
    }
  }

  const glazeX = 860; const glazeW = 384; const glazeH = 128;
  const renderGlazeBox = (boxY, mode, title) => {
    drawText(img, W, H, title, glazeX, boxY - 12, 42, 48, 58, 1);
    fillRect(img, W, H, glazeX, boxY, glazeW, glazeH, 249, 246, 239);
    const gBaker = new LayerStrokeBitmapBaker({ maxMemoryBytes: 4 * 1024 * 1024 });
    const gLive = new IncrementalDeltaStrokeBuffer({ atlasCache: atlas });
    for (let k = 0; k < 2; k += 1) {
      gLive.beginStroke({ strokeId: `y-${k}`, tipId: k === 0 ? "sable-watercolor" : "hog-bristle-oil", color: { r: 248, g: 214, b: 18 }, radiusPx: 22, opacity: 0.92, spacingRatio: 0.08, compositeMode: mode, wetMixStrength: 0.95 });
      gLive.appendPoints([{ x: 32, y: 38 + k * 52, pressure: 0.8 }, { x: 192, y: 44 + k * 48, pressure: 0.92 }, { x: 352, y: 38 + k * 52, pressure: 0.8 }]);
      gLive.commitToBaker(gBaker, "g");
    }
    for (let k = 0; k < 2; k += 1) {
      gLive.beginStroke({ strokeId: `b-${k}`, tipId: k === 0 ? "sable-watercolor" : "hog-bristle-oil", color: { r: 16, g: 69, b: 216 }, radiusPx: 21, opacity: 0.72, spacingRatio: 0.08, compositeMode: mode, wetMixStrength: 0.95 });
      gLive.appendPoints([{ x: 118 + k * 140, y: 14, pressure: 0.78 }, { x: 132 + k * 130, y: 114, pressure: 0.9 }]);
      gLive.commitToBaker(gBaker, "g");
    }
    blitRgbaOver(img, W, H, gBaker.readRegion("g", 0, 0, glazeW, glazeH), glazeW, glazeH, glazeX, boxY);
    strokeRect(img, W, H, glazeX, boxY, glazeW, glazeH, 196, 190, 178);
    gLive.dispose();
    gBaker.dispose();
  };
  renderGlazeBox(botY + 52, "kubelka-munk", "LIVE WET GLAZE: KUBELKA-MUNK (BLUE + YELLOW = GREEN)");
  renderGlazeBox(botY + 204, "source-over", "LIVE GLAZE: SRGB SOURCE-OVER (MUDDY OVERLAP)");

  mkdirSync(path.dirname(outPath), { recursive: true });
  const pngBuffer = encodeRgbaPng(W, H, img);
  writeFileSync(outPath, pngBuffer);
  return { outPath, width: W, height: H, byteLength: pngBuffer.byteLength, tipMasks };
}

function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes("--check");
  const jsonMode = args.includes("--json");
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : DEFAULT_PNG_PATH;

  const oracle = runLongSessionStressOracle();
  const sheet = renderComparisonSheetPng(outPath, oracle);

  let minPairDistance = 1;
  for (let i = 0; i < sheet.tipMasks.length; i += 1) {
    for (let j = i + 1; j < sheet.tipMasks.length; j += 1) {
      const dist = computeTipPairwiseDistance(sheet.tipMasks[i].data, sheet.tipMasks[j].data);
      if (dist < minPairDistance) minPairDistance = dist;
    }
  }
  const kmBlueYellow = mixPigmentsKubelkaMunkDetailed({ r: 16, g: 69, b: 216 }, { r: 248, g: 214, b: 18 }, 0.5);

  const checks = [
    { name: "late200/early200 <= 1.35x", pass: oracle.lateToEarlyRatio <= MAX_LATE_EARLY_RATIO, actual: `${oracle.lateToEarlyRatio.toFixed(3)}x` },
    { name: "peakMemory <= 64 MiB", pass: oracle.peakMemoryBytes <= DEFAULT_BAKER_MAX_MEMORY_BYTES && oracle.budgetComplianceOk, actual: `${oracle.peakMemoryMiB.toFixed(2)} MiB` },
    { name: "dispose leak == 0 bytes", pass: oracle.postDisposeTrackedBytes === 0, actual: `${oracle.postDisposeTrackedBytes} B` },
    { name: "avgCommitLatency < 2.0 ms", pass: oracle.avgCommitMs < MAX_AVG_COMMIT_MS, actual: `${oracle.avgCommitMs.toFixed(3)} ms (p95 ${oracle.p95CommitMs.toFixed(3)} ms)` },
    { name: "live===committed diff == 0.0000", pass: oracle.parityMaxAbsDiff === 0 && oracle.parityMaxRmse === 0 && oracle.totalReRasterizedDabs === 0, actual: `maxDiff=${oracle.parityMaxAbsDiff}, rmse=${oracle.parityMaxRmse.toFixed(4)} (${oracle.parityChecks} checks)` },
    { name: "8-tip min pairwise distance > 0.18", pass: minPairDistance > 0.18, actual: minPairDistance.toFixed(3) },
    { name: "Kubelka-Munk B+Y green superiority", pass: kmBlueYellow.kmGreenDominance >= kmBlueYellow.lerpGreenDominance + 15 && kmBlueYellow.kmSaturation > kmBlueYellow.lerpSaturation * 1.8, actual: `KM rgb(${kmBlueYellow.color.r},${kmBlueYellow.color.g},${kmBlueYellow.color.b}) vs lerp rgb(${kmBlueYellow.srgbLerp.r},${kmBlueYellow.srgbLerp.g},${kmBlueYellow.srgbLerp.b})` },
    { name: "comparison PNG generated", pass: sheet.byteLength > 10000, actual: `${sheet.outPath} (${sheet.byteLength} B)` },
  ];

  const allPassed = checks.every((c) => c.pass);
  if (jsonMode) {
    console.log(JSON.stringify({ ok: allPassed, oracle, minPairDistance: Number(minPairDistance.toFixed(4)), kmBlueYellow, png: { path: sheet.outPath, width: sheet.width, height: sheet.height, byteLength: sheet.byteLength }, checks }, null, 2));
  } else {
    console.log(`=== 장시간 다중 브러시 안정성 스트레스 오라클 (${oracle.totalStrokes}획 · 4,000px ${oracle.marathon4000pxCount}회) ===`);
    console.log(`  초반 200획 평균: ${oracle.early200AvgMs.toFixed(3)} ms | 후반 200획 평균: ${oracle.late200AvgMs.toFixed(3)} ms | 비율: ${oracle.lateToEarlyRatio.toFixed(3)}x`);
    console.log(`  커밋 지연 평균: ${oracle.avgCommitMs.toFixed(3)} ms (p95 ${oracle.p95CommitMs.toFixed(3)} ms) | 재래스터화: ${oracle.totalReRasterizedDabs}`);
    console.log(`  피크 메모리: ${oracle.peakMemoryMiB.toFixed(2)} MiB / 64.00 MiB | LRU 압축 ${oracle.compressionCount}회 · 복원 ${oracle.decompressionCount}회 · 회수 ${oracle.evictedTileCount}회`);
    console.log(`  버퍼 풀 적중: 베이커 ${oracle.bakerPoolHits}회 · 라이브 ${oracle.livePoolHits}회 | 아틀라스 적중률 ${(oracle.atlasCacheHitRate * 100).toFixed(2)}%`);
    console.log(`  시각 비교 PNG: ${sheet.outPath} (${sheet.width}x${sheet.height}, ${sheet.byteLength} bytes)`);
    for (const c of checks) console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.name} -> ${c.actual}`);
  }
  if (checkMode && !allPassed) process.exitCode = 1;
}

main();
