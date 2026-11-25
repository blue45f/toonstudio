#!/usr/bin/env node
/**
 * 전 브러시 카탈로그(194종) 시각 중복 · 이름↔질감 1:1 정합성 감사 CLI 및
 * 12대 매체 대표 브러시 × 저/중/고 필압 + 갈필 고갈 고해상도 PNG 검수 시트 생성기.
 *
 * 사용법:
 *   node scripts/audit-full-brush-catalog-uniqueness-and-naming.mjs --check
 *   node scripts/audit-full-brush-catalog-uniqueness-and-naming.mjs --json --no-png
 *   node scripts/audit-full-brush-catalog-uniqueness-and-naming.mjs --out-png <path>
 */

import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PNG_OUTPUT_PATH = path.join(
  REPO_ROOT, "artifacts/brush-audits/all-brushes-naming-parity-and-dedupe-sheet.png",
);

let tsHooksRegistered = false;
function ensureTsImportHooks() {
  if (tsHooksRegistered) return;
  tsHooksRegistered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !/\.(?:[cm]?js|tsx?|json)$/u.test(specifier) &&
        context.parentURL?.startsWith("file:")
      ) {
        const tsPath = path.resolve(path.dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
        if (fs.existsSync(tsPath)) return { url: pathToFileURL(tsPath).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

let cachedAuditModules = null;
export async function loadAuditModules() {
  if (cachedAuditModules) return cachedAuditModules;
  ensureTsImportHooks();
  const baseDir = path.join(REPO_ROOT, "apps/web/src/domains/creator/brush-master-audit");
  const [strategies, audit] = await Promise.all([
    import(pathToFileURL(path.join(baseDir, "brush-category-physical-strategies.ts")).href),
    import(pathToFileURL(path.join(baseDir, "brush-catalog-visual-dedupe-audit.ts")).href),
  ]);
  cachedAuditModules = { strategies, audit };
  return cachedAuditModules;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodeRgbPng(width, height, rgbData) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgbData.buffer, rgbData.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const FONT_5X7 = {
  " ": [0, 0, 0, 0, 0, 0, 0], A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 18, 18, 12], K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 6, 8, 16, 31],
  3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [14, 16, 30, 17, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12], "-": [0, 0, 0, 31, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ":": [0, 12, 12, 0, 12, 12, 0], "/": [1, 2, 2, 4, 8, 8, 16], "%": [25, 25, 2, 4, 8, 19, 19],
  "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8], "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0], ",": [0, 0, 0, 0, 4, 4, 8], "|": [4, 4, 4, 4, 4, 4, 4],
  ">": [16, 8, 4, 2, 4, 8, 16], "&": [12, 18, 20, 8, 21, 18, 13], "_": [0, 0, 0, 0, 0, 0, 31],
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hash2d = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
};

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2d(ix, iy);
  const b = hash2d(ix + 1, iy);
  const c = hash2d(ix, iy + 1);
  const d = hash2d(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function samplePaperHeight(x, y, preset) {
  if (preset === "smooth-kent") return 0.78 + 0.22 * valueNoise(x * 0.45, y * 0.45);
  if (preset === "sketchbook-tooth") {
    return clamp01(
      valueNoise(x * 0.19, y * 0.19) * 0.42 +
        valueNoise(x * 0.72 + 11.3, y * 0.58 - 4.7) * 0.38 +
        hash2d(Math.floor(x), Math.floor(y)) * 0.2,
    );
  }
  if (preset === "cold-press-rough" || preset === "rough-cotton") {
    const scale = preset === "rough-cotton" ? 0.13 : 0.16;
    return clamp01(
      valueNoise(x * scale, y * scale) * 0.52 +
        valueNoise(x * 0.38 + 5.1, y * 0.34 + 9.2) * 0.34 +
        hash2d(Math.floor(x * 0.8), Math.floor(y * 0.8)) * 0.14,
    );
  }
  if (preset === "linen-canvas") {
    return clamp01(
      (0.5 + 0.5 * Math.sin(x * 0.95)) * 0.45 +
        (0.5 + 0.5 * Math.sin(y * 0.95)) * 0.45 +
        valueNoise(x * 0.25, y * 0.25) * 0.1,
    );
  }
  return clamp01(valueNoise(x * 0.17, y * 0.17) * 0.58 + valueNoise(x * 0.52, y * 0.52) * 0.42);
}

class CanvasBuffer {
  constructor(width, height, bg) {
    this.width = width;
    this.height = height;
    this.rgb = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i += 1) {
      this.rgb[i * 3] = bg[0];
      this.rgb[i * 3 + 1] = bg[1];
      this.rgb[i * 3 + 2] = bg[2];
    }
  }
  fillRect(x0, y0, w, h, color) {
    const xEnd = Math.min(this.width, Math.max(0, Math.round(x0 + w)));
    const yEnd = Math.min(this.height, Math.max(0, Math.round(y0 + h)));
    for (let y = Math.max(0, Math.round(y0)); y < yEnd; y += 1) {
      for (let x = Math.max(0, Math.round(x0)); x < xEnd; x += 1) {
        const idx = (y * this.width + x) * 3;
        this.rgb[idx] = color[0];
        this.rgb[idx + 1] = color[1];
        this.rgb[idx + 2] = color[2];
      }
    }
  }
  strokeRect(x0, y0, w, h, color) {
    this.fillRect(x0, y0, w, 1, color);
    this.fillRect(x0, y0 + h - 1, w, 1, color);
    this.fillRect(x0, y0, 1, h, color);
    this.fillRect(x0 + w - 1, y0, 1, h, color);
  }
  blendPixel(x, y, color, alpha, mode = "normal") {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0.001) return;
    const a = clamp01(alpha);
    const idx = (y * this.width + x) * 3;
    const dr = this.rgb[idx];
    const dg = this.rgb[idx + 1];
    const db = this.rgb[idx + 2];
    const tr = mode === "multiply" ? (dr * color[0]) / 255 : color[0];
    const tg = mode === "multiply" ? (dg * color[1]) / 255 : color[1];
    const tb = mode === "multiply" ? (db * color[2]) / 255 : color[2];
    this.rgb[idx] = Math.round(dr + (tr - dr) * a);
    this.rgb[idx + 1] = Math.round(dg + (tg - dg) * a);
    this.rgb[idx + 2] = Math.round(db + (tb - db) * a);
  }
  drawText(x, y, text, color, scale = 1) {
    const upper = String(text).toUpperCase();
    let cx = Math.round(x);
    const cy = Math.round(y);
    for (let i = 0; i < upper.length; i += 1) {
      const glyph = FONT_5X7[upper[i]] ?? FONT_5X7[" "];
      for (let row = 0; row < 7; row += 1) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col += 1) {
          if ((bits & (1 << (4 - col))) !== 0) {
            this.fillRect(cx + col * scale, cy + row * scale, scale, scale, color);
          }
        }
      }
      cx += 6 * scale;
    }
  }
}

const MEDIA_VISUAL_SPEC = {
  pencil: { ink: [44, 46, 52], title: "01 PENCIL (28DEG TOOTH)", sub: "PEAK CAPTURE + TILT SHADE" },
  crayon: { ink: [198, 66, 36], title: "02 CRAYON (WAX RIDGE)", sub: "THRESHOLD PEAK + CRUMBS" },
  charcoal: { ink: [24, 24, 28], title: "03 CHARCOAL (SQUARE GRIT)", sub: "FRACTURE + ROUGH COTTON" },
  pastel: { ink: [178, 78, 112], title: "04 PASTEL (ROLLING CHALK)", sub: "POROUS VELVET + SOFT MIX" },
  "gpen-ink": { ink: [14, 16, 22], title: "05 G-PEN INK (CRISP 0% BLEED)", sub: "BINARY EDGE + TAPER" },
  watercolor: { ink: [28, 102, 174], title: "06 WATERCOLOR (WET EDGE)", sub: "CAPILLARY + BACKRUN RING" },
  "oil-impasto": { ink: [196, 130, 26], title: "07 OIL IMPASTO (48 BRISTLE)", sub: "FURROWS + 2.5D SOBEL" },
  "acrylic-gouache": { ink: [22, 126, 114], title: "08 ACRYLIC GOUACHE (OPAQUE)", sub: "98% COVER + FAST DRY EDGE" },
  marker: { ink: [52, 90, 204], title: "09 ALCOHOL MARKER (CHISEL)", sub: "42DEG NIB + MULTIPLY STACK" },
  airbrush: { ink: [142, 56, 184], title: "10 AIRBRUSH (GAUSSIAN MIST)", sub: "MICRO SPRAY + 0% BANDING" },
  "blending-stump": { ink: [52, 54, 60], title: "11 BLENDING STUMP (SMUDGE)", sub: "PICKUP + VALLEY GLIDE" },
  "kneaded-eraser": { ink: [248, 246, 241], title: "12 KNEADED ERASER (PEAK LIFT)", sub: "PEAK-FIRST GRAPHITE LIFT" },
};

const CREAM_PAPER = [248, 246, 241];

function layGraphiteSubstrate(buf, x0, y0, w, h, twoTone) {
  for (let y = y0 + 18; y < y0 + h - 18; y += 1) {
    const bandEnv = clamp01(1 - Math.abs((y - (y0 + h * 0.5)) / (h * 0.34)));
    if (bandEnv <= 0.02) continue;
    for (let x = x0 + 18; x < x0 + w - 18; x += 1) {
      const grit = clamp01((samplePaperHeight(x, y, "sketchbook-tooth") - 0.16) / 0.84);
      const col = twoTone && x > x0 + w * 0.52 ? [146, 86, 46] : [48, 50, 56];
      buf.blendPixel(x, y, col, bandEnv * (0.28 + 0.56 * grit), "normal");
    }
  }
}

function renderMediaCell(buf, cellX, cellY, cellW, cellH, category, pressure, isDryout, strategiesMod) {
  const { BRUSH_CATEGORY_PHYSICAL_STRATEGIES, createInitialBristleInertiaState, evaluateBrushPaintLoadDryout, stepBristleDirectionInertia } = strategiesMod;
  const strategy = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[category];
  const ink = MEDIA_VISUAL_SPEC[category].ink;

  buf.fillRect(cellX, cellY, cellW, cellH, CREAM_PAPER);
  if (category === "acrylic-gouache") {
    buf.fillRect(cellX + 14, Math.round(cellY + cellH * 0.5) - 2, cellW - 28, 4, [62, 66, 76]);
  } else if (category === "blending-stump") {
    layGraphiteSubstrate(buf, cellX, cellY, cellW, cellH, true);
  } else if (category === "kneaded-eraser") {
    layGraphiteSubstrate(buf, cellX, cellY, cellW, cellH, false);
  }

  const localHeight = category === "oil-impasto" || category === "acrylic-gouache" ? new Float32Array(cellW * cellH) : null;
  const localWetMask = category === "watercolor" ? new Float32Array(cellW * cellH) : null;
  const markerPassMask = category === "marker" ? new Float32Array(cellW * cellH) : null;

  const steps = isDryout ? 190 : 120;
  const spanX = cellW - 48;
  const midY = cellY + cellH * 0.5;
  const ampY = cellH * 0.23;

  let inertia = createInitialBristleInertiaState(cellX + 24, midY, 0);
  let pickupRgb = [56, 56, 62];

  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    inertia = stepBristleDirectionInertia({
      state: inertia,
      targetX: cellX + 24 + t * spanX,
      targetY: midY + Math.sin(t * Math.PI * 2.15) * ampY,
      dtMs: 12,
      pressure01: pressure,
      paperRoughness01: strategy.targetFeatures.toothContrast,
      category,
    });

    const dryState = isDryout
      ? evaluateBrushPaintLoadDryout({
          category,
          strokeLengthPx: t * 2400,
          pressure01: pressure,
          paperRoughness01: Math.max(0.42, strategy.targetFeatures.toothContrast),
        })
      : { drySplitFactor01: 0, effectiveOpacityScale: 1 };

    const endEnv = Math.sin(Math.PI * t);
    const pEff = isDryout ? 0.82 * (0.45 + 0.55 * endEnv) : pressure;
    const baseR =
      category === "gpen-ink"
        ? 1.5 + 11.5 * Math.pow(pEff, 1.3) * Math.pow(endEnv, 0.55)
        : category === "airbrush"
          ? 16 + 16 * pEff
          : category === "marker"
            ? 10 + 4 * pEff
            : 6.5 + 12.5 * pEff;

    const tiltWiden =
      category === "pencil" || category === "charcoal" || category === "pastel"
        ? 1 + (strategy.tiltWidthGain - 1) * 0.32 * pEff
        : 1;
    const rx = Math.max(1.2, baseR * tiltWiden);
    const ry = Math.max(1.1, baseR * Math.max(0.28, strategy.tipAspectRatio));
    const dabAngle = category === "marker" ? (42 * Math.PI) / 180 : category === "charcoal" ? inertia.headingRad - 0.55 : inertia.headingRad;
    const cosA = Math.cos(-dabAngle);
    const sinA = Math.sin(-dabAngle);
    const cx = inertia.filteredX;
    const cy = inertia.filteredY;
    const boundR = Math.ceil(Math.max(rx, ry) + 5);

    if (category === "blending-stump") {
      const pIdx = (Math.min(buf.height - 1, Math.max(0, Math.round(cy))) * buf.width + Math.min(buf.width - 1, Math.max(0, Math.round(cx)))) * 3;
      pickupRgb = [pickupRgb[0] * 0.8 + buf.rgb[pIdx] * 0.2, pickupRgb[1] * 0.8 + buf.rgb[pIdx + 1] * 0.2, pickupRgb[2] * 0.8 + buf.rgb[pIdx + 2] * 0.2];
    }

    for (let y = Math.max(cellY + 2, Math.floor(cy - boundR)); y <= Math.min(cellY + cellH - 3, Math.ceil(cy + boundR)); y += 1) {
      for (let x = Math.max(cellX + 2, Math.floor(cx - boundR)); x <= Math.min(cellX + cellW - 3, Math.ceil(cx + boundR)); x += 1) {
        const lx = (x - cx) * cosA - (y - cy) * sinA;
        const ly = (x - cx) * sinA + (y - cy) * cosA;
        const nx = lx / rx;
        const ny = ly / ry;
        const dist = category === "charcoal" || category === "marker" ? Math.max(Math.abs(nx), Math.abs(ny) * 0.92) : Math.hypot(nx, ny);
        if (dist > 1.25) continue;

        const paper = samplePaperHeight(x, y, strategy.paperGrainPreset);
        const rollPaper = samplePaperHeight(x + s * 2.1, y - s * 1.4, strategy.paperGrainPreset);
        const hSample = strategy.grainMode === "rolling-tip" ? paper * 0.45 + rollPaper * 0.55 : paper;
        const noise = hash2d(x + s * 0.13, y - s * 0.19);
        const drySplit = dryState.drySplitFactor01;

        if (category === "pencil") {
          const thresh = 0.66 - pEff * 0.44 + drySplit * 0.28;
          const toothHit = clamp01((paper - thresh) / Math.max(0.14, 1 - thresh));
          buf.blendPixel(x, y, ink, clamp01(1 - Math.pow(dist, 2.2)) * toothHit * (0.14 + 0.34 * pEff) * dryState.effectiveOpacityScale);
        } else if (category === "crayon") {
          const jDist = dist + (noise - 0.5) * 0.36;
          if (jDist > 1.08) continue;
          const thresh = 0.58 - pEff * 0.36 + drySplit * 0.32;
          const waxPeak = paper > thresh ? clamp01((paper - thresh) / 0.22) : 0;
          const crumb = jDist > 0.78 && noise > 0.74 && paper > 0.46 ? 0.65 : 0;
          buf.blendPixel(x, y, ink, Math.max(waxPeak * (0.35 + 0.55 * pEff), crumb) * dryState.effectiveOpacityScale * 0.52);
        } else if (category === "charcoal") {
          const edge = clamp01(1 - Math.pow(dist, ny > 0 ? 1.15 : 2.8));
          const thresh = 0.54 - pEff * 0.34 + drySplit * 0.36;
          const grit = clamp01((hSample - thresh) / Math.max(0.16, 1 - thresh));
          buf.blendPixel(x, y, ink, edge * grit * (0.22 + 0.42 * pEff) * dryState.effectiveOpacityScale);
        } else if (category === "pastel") {
          // 다공성 분필 입자 + 롤링 결: 에어브러시와 뚜렷하게 구분되는 포러스 분필 공극 표현.
          const edge = clamp01(Math.exp(-dist * dist * 1.85));
          const chalkThresh = 0.5 - pEff * 0.24 + drySplit * 0.36;
          const chalk = hSample > chalkThresh ? clamp01((hSample - chalkThresh) / 0.34) : 0;
          const dust = noise > 0.66 && dist < 1.05 ? 0.26 : 0;
          buf.blendPixel(x, y, ink, edge * Math.max(chalk, dust) * (0.18 + 0.34 * pEff) * dryState.effectiveOpacityScale);
        } else if (category === "gpen-ink") {
          const dryGap = drySplit > 0.25 && paper < drySplit * 0.62 ? 0.15 : 1;
          buf.blendPixel(x, y, ink, clamp01((1 - dist) * 7.5) * dryGap * 0.96);
        } else if (category === "watercolor" && localWetMask) {
          const dryTooth = drySplit > 0.15 ? clamp01((paper - drySplit * 0.72) / 0.28) : 1;
          const li = (y - cellY) * cellW + (x - cellX);
          const val = clamp01(1 - Math.pow(dist, 2.4)) * dryTooth * (0.28 + 0.52 * pEff) * dryState.effectiveOpacityScale;
          if (val > localWetMask[li]) localWetMask[li] = val;
        } else if (category === "oil-impasto" && localHeight) {
          const bristleWave = 0.5 + 0.5 * Math.sin(ly * 1.85 + hash2d(Math.floor(ly * 1.8), 7) * 2.2);
          const dryCut = drySplit > 0.08 && bristleWave < 0.22 + drySplit * 0.72 ? 0 : 1;
          const ridge = clamp01(1 - Math.pow(dist, 3.2)) * (0.28 + 0.72 * bristleWave) * dryCut * dryState.effectiveOpacityScale;
          if (ridge > 0.04) {
            const li = (y - cellY) * cellW + (x - cellX);
            localHeight[li] = Math.max(localHeight[li], ridge * (0.55 + 0.45 * pEff));
            buf.blendPixel(x, y, ink, ridge * (0.45 + 0.45 * pEff));
          }
        } else if (category === "acrylic-gouache" && localHeight) {
          const dryCut = drySplit > 0.18 && paper < drySplit * 0.68 ? 0.12 : 1;
          const cov = clamp01((1.02 - dist) * 5.2) * (0.72 + 0.28 * Math.sin(ly * 1.15)) * dryCut * dryState.effectiveOpacityScale;
          if (cov > 0.04) {
            const li = (y - cellY) * cellW + (x - cellX);
            localHeight[li] = Math.max(localHeight[li], cov * 0.42);
            buf.blendPixel(x, y, ink, clamp01(cov * (0.68 + 0.3 * pEff)));
          }
        } else if (category === "marker" && markerPassMask) {
          const drySkip = drySplit > 0.2 && paper < drySplit * 0.58 ? 0.25 : 1;
          const li = (y - cellY) * cellW + (x - cellX);
          const val = clamp01((1 - dist) * 6) * drySkip * (0.42 + 0.24 * pEff) * dryState.effectiveOpacityScale;
          if (val > markerPassMask[li]) markerPassMask[li] = val;
        } else if (category === "airbrush") {
          const a = Math.exp(-dist * dist * 3.4) * (0.84 + 0.32 * (noise - 0.5)) * (0.045 + 0.095 * pEff) * dryState.effectiveOpacityScale;
          buf.blendPixel(x, y, ink, a);
        } else if (category === "blending-stump") {
          buf.blendPixel(x, y, pickupRgb, Math.exp(-dist * dist * 2.5) * (0.45 + 0.55 * (1 - paper * 0.6)) * (0.16 + 0.32 * pEff) * dryState.effectiveOpacityScale);
        } else if (category === "kneaded-eraser") {
          const peakThreshold = 0.62 - pEff * 0.54;
          const liftMask = clamp01((paper - peakThreshold) / Math.max(0.2, 1 - peakThreshold));
          buf.blendPixel(x, y, CREAM_PAPER, Math.exp(-dist * dist * 2.3) * liftMask * (0.28 + 0.64 * pEff) * dryState.effectiveOpacityScale);
        }
      }
    }
  }

  if (category === "watercolor" && localWetMask) {
    for (let ly = 1; ly < cellH - 1; ly += 1) {
      for (let lx = 1; lx < cellW - 1; lx += 1) {
        const m = localWetMask[ly * cellW + lx];
        if (m <= 0.02) continue;
        const rim = clamp01(Math.hypot(localWetMask[ly * cellW + lx + 1] - localWetMask[ly * cellW + lx - 1], localWetMask[(ly + 1) * cellW + lx] - localWetMask[(ly - 1) * cellW + lx]) * 2.6);
        const gran = 1 - samplePaperHeight(cellX + lx, cellY + ly, "cold-press-medium") * 0.42;
        const col = [
          Math.round(ink[0] * (1 - rim * 0.48)),
          Math.round(ink[1] * (1 - rim * 0.42)),
          Math.round(ink[2] * (1 - rim * 0.28)),
        ];
        buf.blendPixel(cellX + lx, cellY + ly, col, clamp01(m * gran * 0.62 + rim * 0.58), "multiply");
      }
    }
  }

  // 알코올 마커: 1차 플랫 패스 + 2차 대각 교차 패스를 각각 단일 마스크로 1회씩 승산 합성(실제 코픽 2중 겹칠 농도).
  if (category === "marker" && markerPassMask) {
    const crossMask = new Float32Array(cellW * cellH);
    for (let k = -44; k <= 44; k += 1) {
      const cx = Math.round(cellW * 0.5 + k * 0.9);
      const cy = Math.round(cellH * 0.5 - k * 0.68);
      for (let oy = -7; oy <= 7; oy += 1) {
        for (let ox = -4; ox <= 4; ox += 1) {
          const lx = cx + ox;
          const ly = cy + oy;
          if (lx > 2 && lx < cellW - 2 && ly > 2 && ly < cellH - 2) {
            crossMask[ly * cellW + lx] = Math.max(crossMask[ly * cellW + lx], 0.44 + 0.22 * pressure);
          }
        }
      }
    }
    for (let ly = 0; ly < cellH; ly += 1) {
      for (let lx = 0; lx < cellW; lx += 1) {
        const a1 = markerPassMask[ly * cellW + lx];
        const a2 = crossMask[ly * cellW + lx];
        if (a1 > 0.02) buf.blendPixel(cellX + lx, cellY + ly, ink, a1, "multiply");
        if (a2 > 0.02) buf.blendPixel(cellX + lx, cellY + ly, ink, a2, "multiply");
      }
    }
  }

  if (localHeight) {
    const strength = category === "oil-impasto" ? 1 : 0.42;
    for (let ly = 1; ly < cellH - 1; ly += 1) {
      for (let lx = 1; lx < cellW - 1; lx += 1) {
        if (localHeight[ly * cellW + lx] <= 0.05) continue;
        const gx = localHeight[ly * cellW + lx + 1] - localHeight[ly * cellW + lx - 1];
        const gy = localHeight[(ly + 1) * cellW + lx] - localHeight[(ly - 1) * cellW + lx];
        const light = (-gx * 0.72 - gy * 0.72) * strength;
        const idx = ((cellY + ly) * buf.width + (cellX + lx)) * 3;
        if (light > 0.02) {
          const boost = clamp01(light * 1.45);
          buf.rgb[idx] = Math.min(255, Math.round(buf.rgb[idx] + (255 - buf.rgb[idx]) * boost * 0.72));
          buf.rgb[idx + 1] = Math.min(255, Math.round(buf.rgb[idx + 1] + (246 - buf.rgb[idx + 1]) * boost * 0.68));
          buf.rgb[idx + 2] = Math.min(255, Math.round(buf.rgb[idx + 2] + (214 - buf.rgb[idx + 2]) * boost * 0.52));
        } else if (light < -0.02) {
          const shade = clamp01(-light * 1.35) * 0.58;
          buf.rgb[idx] = Math.round(buf.rgb[idx] * (1 - shade));
          buf.rgb[idx + 1] = Math.round(buf.rgb[idx + 1] * (1 - shade));
          buf.rgb[idx + 2] = Math.round(buf.rgb[idx + 2] * (1 - shade));
        }
      }
    }
  }

  buf.strokeRect(cellX, cellY, cellW, cellH, [206, 202, 194]);
}

export function renderMasterParitySheetPng(report, strategiesMod) {
  const width = 1660;
  const height = 1546;
  const buf = new CanvasBuffer(width, height, [238, 235, 228]);

  buf.fillRect(0, 0, width, 84, [34, 38, 46]);
  buf.drawText(22, 16, "TOONSTUDIO 12-MEDIA BRUSH STRATEGY & CATALOG PARITY SHEET", [244, 241, 234], 2);
  buf.drawText(
    22,
    50,
    `CATALOG=${report.totalBrushes} BRUSHES | PARITY=${(report.namingParityRate01 * 100).toFixed(1)}% (${report.alignedCount}/${report.totalBrushes}) | PATCHES=${report.mismatchCount} | DUP CLUSTERS=${report.duplicateClusters.length} | MIN DIST=${report.strategySeparation.minDistance.toFixed(3)}`,
    [186, 206, 224],
    2,
  );

  const labelW = 330;
  const cols = [
    { x: 356, w: 312, title: "LOW PRESSURE (P=0.22)", p: 0.22, dry: false },
    { x: 676, w: 312, title: "MID PRESSURE (P=0.55)", p: 0.55, dry: false },
    { x: 996, w: 312, title: "HIGH PRESSURE (P=0.92)", p: 0.92, dry: false },
    { x: 1316, w: 326, title: "DRYOUT 0->2400PX (GALPIL)", p: 0.82, dry: true },
  ];
  buf.fillRect(16, 92, labelW, 24, [224, 220, 212]);
  buf.drawText(26, 98, "MEDIA CATEGORY & PHYSICAL STRATEGY", [46, 50, 58], 1);
  for (const col of cols) {
    buf.fillRect(col.x, 92, col.w, 24, [224, 220, 212]);
    buf.drawText(col.x + 10, 98, col.title, [46, 50, 58], 1);
  }

  const rowH = 114;
  const ids = strategiesMod.BRUSH_MEDIA_CATEGORY_IDS;
  for (let r = 0; r < ids.length; r += 1) {
    const category = ids[r];
    const y = 122 + r * (rowH + 4);
    const meta = MEDIA_VISUAL_SPEC[category];
    const strategy = strategiesMod.BRUSH_CATEGORY_PHYSICAL_STRATEGIES[category];

    buf.fillRect(16, y, labelW, rowH, [244, 242, 236]);
    buf.strokeRect(16, y, labelW, rowH, [206, 202, 194]);
    buf.fillRect(24, y + 14, 14, rowH - 28, category === "kneaded-eraser" ? [150, 146, 138] : meta.ink);
    buf.drawText(48, y + 18, meta.title, [32, 36, 44], 1);
    buf.drawText(48, y + 36, meta.sub, [88, 94, 106], 1);
    buf.drawText(48, y + 56, `PAPER: ${strategy.paperGrainPreset.toUpperCase()}`, [74, 80, 92], 1);
    buf.drawText(48, y + 72, `MODE: ${strategy.grainMode.toUpperCase()} | BRISTLES=${strategy.defaultBristleCount}`, [74, 80, 92], 1);
    buf.drawText(48, y + 90, `AUDITED IN CATALOG: ${report.categoryDistribution[category] ?? 0} BRUSHES`, [46, 86, 134], 1);

    for (const col of cols) renderMediaCell(buf, col.x, y, col.w, rowH, category, col.p, col.dry, strategiesMod);
  }
  return encodeRgbPng(width, height, buf.rgb);
}

export function parseCliArgs(argv) {
  const options = { check: false, json: false, noPng: false, outPng: DEFAULT_PNG_OUTPUT_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") options.check = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--no-png") options.noPng = true;
    else if (arg === "--out-png") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("--out-png 경로가 필요합니다.");
      options.outPng = path.resolve(next);
      i += 1;
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }
  return options;
}

export async function runFullBrushCatalogAuditCli(argv = []) {
  const options = parseCliArgs(argv);
  const mods = await loadAuditModules();
  const report = mods.audit.runFullBrushCatalogAudit();
  let pngPath = null;
  let pngBytes = 0;

  if (!options.noPng) {
    const pngBuffer = renderMasterParitySheetPng(report, mods.strategies);
    fs.mkdirSync(path.dirname(options.outPng), { recursive: true });
    fs.writeFileSync(options.outPng, pngBuffer);
    pngPath = options.outPng;
    pngBytes = pngBuffer.length;
  }

  const checkFailures = [];
  if (report.totalBrushes <= 100) checkFailures.push(`감사 대상 브러시 부족: ${report.totalBrushes}`);
  if (report.namingParityRate01 < 0.98) {
    checkFailures.push(
      `이름↔질감 정합률 기준(98.0%) 미달: ${(report.namingParityRate01 * 100).toFixed(1)}% (불일치 ${report.mismatchCount}건)`,
    );
  }
  if (!report.strategySeparation.allMutuallyDistinct) {
    checkFailures.push(`12대 매체 전략 변별 거리 부족: ${report.strategySeparation.minDistance}`);
  }
  for (const id of mods.strategies.BRUSH_MEDIA_CATEGORY_IDS) {
    if ((report.categoryDistribution[id] ?? 0) < 1) checkFailures.push(`매체 카테고리 누락: ${id}`);
  }
  if (!options.noPng && pngBytes < 10_000) checkFailures.push(`시각 검수 PNG 크기 비정상: ${pngBytes} bytes`);

  return {
    ok: checkFailures.length === 0,
    totalBrushes: report.totalBrushes,
    catalogBreakdown: report.catalogBreakdown,
    categoryDistribution: report.categoryDistribution,
    namingParityRate01: report.namingParityRate01,
    alignedCount: report.alignedCount,
    mismatchCount: report.mismatchCount,
    duplicatePairCount: report.duplicatePairCount,
    sameCatalogDuplicatePairCount: report.sameCatalogDuplicatePairCount,
    crossCatalogDuplicatePairCount: report.crossCatalogDuplicatePairCount,
    duplicateClusterCount: report.duplicateClusters.length,
    strategySeparation: report.strategySeparation,
    topMismatches: report.mismatchedBrushes.slice(0, 15).map((item) => ({
      uid: item.uid,
      nameKo: item.nameKo,
      expectedCategory: item.inferred.category,
      reasons: item.mismatches.map((m) => m.reasonKo),
      recommendedPatch: item.recommendedPhysicsPatch,
    })),
    duplicateClusters: report.duplicateClusters,
    pngPath,
    pngBytes,
    checkFailures,
    summaryKo: report.summaryKo,
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const payload = await runFullBrushCatalogAuditCli(process.argv.slice(2));
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(payload.summaryKo);
    console.log(`카탈로그 분포: ${Object.entries(payload.catalogBreakdown).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    console.log(`12대 매체 분포: ${Object.entries(payload.categoryDistribution).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (payload.pngPath) console.log(`시각 검수 PNG 생성 완료: ${payload.pngPath} (${payload.pngBytes.toLocaleString("en-US")} bytes)`);
    if (!payload.ok) for (const fail of payload.checkFailures) console.error(`실패: ${fail}`);
  }
  if (options.check && !payload.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
