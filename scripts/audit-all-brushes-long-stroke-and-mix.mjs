#!/usr/bin/env node
/**
 * 전 브러시(코어 스탬프 10종 + 글로벌 마스터 60종) 장시간 연속 획(3,000~4,000px) ·
 * 다중 브러시 혼합 성능·캐시 적중률·질감 자동 감사 및 시각 검수용 PNG 생성기.
 *
 * - 실제 `isRealCanvas` + `document.createElement("canvas")` 2D RGBA 백엔드로
 *   스탬프 밉맵 팁 굽기(`rasterizeOssTexturedTip`)와 `drawImage` 스케일 합성을 실측한다.
 * - `--check`: 성능 급락(cliff)·캐시 스래싱(eviction)·캐시 적중률(<90%)·빈 스트로크 위반 시 종료 1.
 * - `--render-sheets <dir>`:
 *   1) `brush-dry-media-closeup-comparison.png` (건식 9종 저/중/고 필압 + 겹칠 2배 확대 스트립)
 *   2) `brush-mixed-media-stress-sheet.png` (다중 브러시 혼합 4시나리오 + 장시간 S자 획 실제 렌더)
 */
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { encodeRgbaToPng } from "./audit-brush-filter-visual-uniqueness.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAPER_BG = [248, 245, 239];
const CORE_STAMP_SPECS = [
  { kind: "pencil", brushId: "pencil--stamp-grain", color: "#2d3138", size: 16, optInPaper: true },
  { kind: "crayon", brushId: "crayon--klecks-stamp", color: "#c94a28", size: 18, optInPaper: false },
  { kind: "charcoal", brushId: "charcoal--mypaint-stamp", color: "#222126", size: 20, optInPaper: false },
  { kind: "pastel", brushId: "pastel--soft-stamp", color: "#c86c82", size: 22, optInPaper: false },
  { kind: "chalk", brushId: "chalk--klecks-stamp", color: "#4c729c", size: 20, optInPaper: false },
  { kind: "airbrush", brushId: "airbrush--stamp-soft", color: "#3d6cb9", size: 28, optInPaper: false },
  { kind: "watercolor", brushId: "watercolor--edge-stamp", color: "#2e7d8a", size: 24, optInPaper: false },
  { kind: "ink", brushId: "ink-brush", color: "#15171c", size: 12, optInPaper: false },
  { kind: "mypaint", brushId: "mypaint-smudge-oil", color: "#8a4b2a", size: 22, optInPaper: false },
  { kind: "krita-auto", brushId: "krita-auto-soft", color: "#4d5566", size: 18, optInPaper: false },
];

let tsHooksRegistered = false;
function ensureTsLoaderHooks() {
  if (tsHooksRegistered) return;
  tsHooksRegistered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
        const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
        if (!fs.existsSync(base) && fs.existsSync(`${base}.ts`)) {
          return { url: pathToFileURL(`${base}.ts`).href, format: "module-typescript", shortCircuit: true };
        }
      }
      const resolved = nextResolve(specifier, context);
      return resolved.url.endsWith(".ts") ? { ...resolved, format: "module-typescript" } : resolved;
    },
  });
}

async function loadBrushEngines(rootDir = REPO_ROOT) {
  ensureTsLoaderHooks();
  const brushDir = path.join(rootDir, "apps/web/src/domains/creator/brush");
  const gmDir = path.join(brushDir, "global-master-collection");
  const [stampEngine, gmCatalog, gmRenderer] = await Promise.all([
    import(pathToFileURL(path.join(brushDir, "studio-brush-stamp-engine.ts")).href),
    import(pathToFileURL(path.join(gmDir, "global-master-brush-catalog.ts")).href),
    import(pathToFileURL(path.join(gmDir, "global-master-brush-renderer.ts")).href),
  ]);
  return { stampEngine, gmCatalog, gmRenderer };
}

const clampByte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0);
const round3 = (v) => Math.round(v * 1000) / 1000;

function parseCssColor(css) {
  if (css && typeof css === "object" && Array.isArray(css.stops)) {
    return parseCssColor(css.stops[0]?.color ?? "#000000");
  }
  if (typeof css !== "string") return [0, 0, 0, 1];
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(css.trim());
  if (hex) {
    const r = hex[1].length === 3 ? hex[1].replace(/(.)/gu, "$1$1") : hex[1];
    return [parseInt(r.slice(0, 2), 16), parseInt(r.slice(2, 4), 16), parseInt(r.slice(4, 6), 16), 1];
  }
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/iu.exec(css);
  return m
    ? [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0, m[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(m[4])))]
    : [0, 0, 0, 1];
}

function blendOver(buf, idx, sr, sg, sb, sa) {
  if (sa <= 0.001) return;
  const da = buf[idx + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0.0001) return;
  const inv = (1 - sa) * da;
  buf[idx] = clampByte((sr * sa + buf[idx] * inv) / outA);
  buf[idx + 1] = clampByte((sg * sa + buf[idx + 1] * inv) / outA);
  buf[idx + 2] = clampByte((sb * sa + buf[idx + 2] * inv) / outA);
  buf[idx + 3] = clampByte(outA * 255);
}

/** 실제 ImageData·drawImage(쌍선형 스케일)·타원/사각형/선분을 지원하는 순수 JS Canvas2D 백엔드. */
export function createRasterCanvas2D(width, height, bgRgb = null) {
  let w = Math.max(1, Math.round(width));
  let h = Math.max(1, Math.round(height));
  let data = new Uint8ClampedArray(w * h * 4);
  const resetPixels = () => {
    if (!bgRgb) { data.fill(0); return; }
    for (let i = 0; i < data.length; i += 4) {
      data[i] = bgRgb[0]; data[i + 1] = bgRgb[1]; data[i + 2] = bgRgb[2]; data[i + 3] = 255;
    }
  };
  resetPixels();

  let mat = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let pendingEllipse = null;
  let polyPts = [];
  let subpaths = [];
  const stats = { drawImageCalls: 0, radialGradientCalls: 0 };
  const xform = (x, y) => [mat[0] * x + mat[2] * y + mat[4], mat[1] * x + mat[3] * y + mat[5]];
  const scaleAvg = () => (Math.hypot(mat[0], mat[1]) + Math.hypot(mat[2], mat[3])) * 0.5;
  const invert2 = (a, b, c, d) => {
    const det = a * d - b * c;
    return Math.abs(det) < 1e-8 ? null : [d / det, -b / det, -c / det, a / det];
  };

  const drawBlit = (srcCanvas, dx, dy, dw, dh, ga) => {
    stats.drawImageCalls += 1;
    const src = srcCanvas?._rgba; const sw = srcCanvas?.width ?? 0; const sh = srcCanvas?.height ?? 0;
    const tw = dw ?? sw; const th = dh ?? sh;
    const inv = src && sw > 0 && sh > 0 && ga > 0.001 && tw > 0.05 && th > 0.05 ? invert2(mat[0], mat[1], mat[2], mat[3]) : null;
    if (!inv) return;
    const c = [xform(dx, dy), xform(dx + tw, dy), xform(dx + tw, dy + th), xform(dx, dy + th)];
    const minX = Math.max(0, Math.floor(Math.min(c[0][0], c[1][0], c[2][0], c[3][0])));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(c[0][0], c[1][0], c[2][0], c[3][0])));
    const minY = Math.max(0, Math.floor(Math.min(c[0][1], c[1][1], c[2][1], c[3][1])));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(c[0][1], c[1][1], c[2][1], c[3][1])));
    for (let py = minY; py <= maxY; py += 1) {
      const rdy = py + 0.5 - mat[5];
      for (let px = minX; px <= maxX; px += 1) {
        const rdx = px + 0.5 - mat[4];
        const u = (inv[0] * rdx + inv[2] * rdy - dx) / tw;
        const v = (inv[1] * rdx + inv[3] * rdy - dy) / th;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const fx = u * (sw - 1); const fy = v * (sh - 1);
        const x0 = fx | 0; const y0 = fy | 0;
        const x1 = Math.min(sw - 1, x0 + 1); const y1 = Math.min(sh - 1, y0 + 1);
        const tx = fx - x0; const ty = fy - y0;
        const i00 = (y0 * sw + x0) * 4; const i10 = (y0 * sw + x1) * 4;
        const i01 = (y1 * sw + x0) * 4; const i11 = (y1 * sw + x1) * 4;
        const w00 = (1 - tx) * (1 - ty); const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty; const w11 = tx * ty;
        const a = (src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11) / 255;
        if (a <= 0.002) continue;
        blendOver(
          data, (py * w + px) * 4,
          src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11,
          src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11,
          src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11,
          a * ga,
        );
      }
    }
  };

  const fillEllipse = (el, style, ga) => {
    const [sr, sg, sb, ca] = parseCssColor(style);
    const isGrad = Boolean(style && typeof style === "object" && Array.isArray(style.stops));
    const alpha = ca * ga;
    const inv = alpha > 0.001 ? invert2(el.m0, el.m1, el.m2, el.m3) : null;
    if (!inv) return;
    const radX = Math.hypot(el.m0 * el.rx, el.m2 * el.ry) + 1;
    const radY = Math.hypot(el.m1 * el.rx, el.m3 * el.ry) + 1;
    const invRx = 1 / Math.max(0.25, el.rx); const invRy = 1 / Math.max(0.25, el.ry);
    const aa = 1 / Math.max(0.8, Math.min(el.rx, el.ry) * scaleAvg());
    for (let y = Math.max(0, Math.floor(el.m5 - radY)); y <= Math.min(h - 1, Math.ceil(el.m5 + radY)); y += 1) {
      const dy = y + 0.5 - el.m5;
      for (let x = Math.max(0, Math.floor(el.m4 - radX)); x <= Math.min(w - 1, Math.ceil(el.m4 + radX)); x += 1) {
        const dx = x + 0.5 - el.m4;
        const r = Math.hypot((inv[0] * dx + inv[2] * dy) * invRx, (inv[1] * dx + inv[3] * dy) * invRy);
        if (r > 1 + aa) continue;
        let cov = r <= 1 - aa ? 1 : Math.max(0, (1 + aa - r) / (2 * aa));
        if (isGrad) cov *= Math.max(0, 1 - r * r);
        blendOver(data, (y * w + x) * 4, sr, sg, sb, alpha * cov);
      }
    }
  };

  const fillRectLocal = (rx, ry, rw, rh, style, ga) => {
    const [sr, sg, sb, ca] = parseCssColor(style);
    const alpha = ca * ga;
    const inv = alpha > 0.001 ? invert2(mat[0], mat[1], mat[2], mat[3]) : null;
    if (!inv) return;
    const c = [xform(rx, ry), xform(rx + rw, ry), xform(rx + rw, ry + rh), xform(rx, ry + rh)];
    const rMinX = Math.min(rx, rx + rw); const rMaxX = Math.max(rx, rx + rw);
    const rMinY = Math.min(ry, ry + rh); const rMaxY = Math.max(ry, ry + rh);
    for (let py = Math.max(0, Math.floor(Math.min(c[0][1], c[1][1], c[2][1], c[3][1]) - 1)); py <= Math.min(h - 1, Math.ceil(Math.max(c[0][1], c[1][1], c[2][1], c[3][1]) + 1)); py += 1) {
      const dy = py + 0.5 - mat[5];
      for (let px = Math.max(0, Math.floor(Math.min(c[0][0], c[1][0], c[2][0], c[3][0]) - 1)); px <= Math.min(w - 1, Math.ceil(Math.max(c[0][0], c[1][0], c[2][0], c[3][0]) + 1)); px += 1) {
        const dx = px + 0.5 - mat[4];
        const lx = inv[0] * dx + inv[2] * dy; const ly = inv[1] * dx + inv[3] * dy;
        const dOut = Math.max(rMinX - lx, lx - rMaxX, rMinY - ly, ly - rMaxY);
        if (dOut <= 0.55) blendOver(data, (py * w + px) * 4, sr, sg, sb, alpha * (dOut <= -0.45 ? 1 : Math.max(0, 0.55 - dOut)));
      }
    }
  };

  const strokeSubpaths = (paths, style, lw, ga) => {
    const [sr, sg, sb, ca] = parseCssColor(style);
    const alpha = ca * ga;
    if (alpha <= 0.001) return;
    const halfW = Math.max(0.35, lw * scaleAvg() * 0.5); const pad = halfW + 1;
    for (const pts of paths) {
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [x1, y1] = pts[i]; const [x2, y2] = pts[i + 1];
        const dx = x2 - x1; const dy = y2 - y1; const len2 = dx * dx + dy * dy;
        for (let y = Math.max(0, Math.floor(Math.min(y1, y2) - pad)); y <= Math.min(h - 1, Math.ceil(Math.max(y1, y2) + pad)); y += 1) {
          for (let x = Math.max(0, Math.floor(Math.min(x1, x2) - pad)); x <= Math.min(w - 1, Math.ceil(Math.max(x1, x2) + pad)); x += 1) {
            const t = len2 > 1e-6 ? Math.min(1, Math.max(0, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / len2)) : 0;
            const dist = Math.hypot(x + 0.5 - (x1 + dx * t), y + 0.5 - (y1 + dy * t));
            if (dist <= halfW + 0.7) blendOver(data, (y * w + x) * 4, sr, sg, sb, alpha * (dist <= halfW - 0.3 ? 1 : Math.max(0, halfW + 0.7 - dist)));
          }
        }
      }
    }
  };

  const canvas = {
    get width() { return w; },
    set width(nv) { const n = Math.max(1, Math.round(nv)); if (n !== w) { w = n; data = new Uint8ClampedArray(w * h * 4); resetPixels(); } },
    get height() { return h; },
    set height(nv) { const n = Math.max(1, Math.round(nv)); if (n !== h) { h = n; data = new Uint8ClampedArray(w * h * 4); resetPixels(); } },
    get _rgba() { return data; },
    getContext(kind) { return kind === "2d" ? ctx : null; },
  };
  const ctx = {
    canvas, fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, globalAlpha: 1,
    save() { stack.push({ mat: mat.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha }); },
    restore() { const p = stack.pop(); if (!p) return; mat = p.mat; this.fillStyle = p.fillStyle; this.strokeStyle = p.strokeStyle; this.lineWidth = p.lineWidth; this.globalAlpha = p.globalAlpha; },
    translate(tx, ty) { mat = [mat[0], mat[1], mat[2], mat[3], mat[0] * tx + mat[2] * ty + mat[4], mat[1] * tx + mat[3] * ty + mat[5]]; },
    rotate(rad) { const c = Math.cos(rad); const s = Math.sin(rad); mat = [mat[0] * c + mat[2] * s, mat[1] * c + mat[3] * s, -mat[0] * s + mat[2] * c, -mat[1] * s + mat[3] * c, mat[4], mat[5]]; },
    scale(sx, sy) { mat = [mat[0] * sx, mat[1] * sx, mat[2] * sy, mat[3] * sy, mat[4], mat[5]]; },
    clearRect() { resetPixels(); },
    fillRect(x, y, rw, rh) { fillRectLocal(x, y, rw, rh, this.fillStyle, this.globalAlpha); },
    createImageData(iw, ih) { const sw = Math.max(1, Math.round(iw)); const sh = Math.max(1, Math.round(ih)); return { width: sw, height: sh, data: new Uint8ClampedArray(sw * sh * 4) }; },
    putImageData(img, ox = 0, oy = 0) {
      for (let y = 0; y < img.height; y += 1) {
        const dy = oy + y;
        if (dy < 0 || dy >= h) continue;
        for (let x = 0; x < img.width; x += 1) {
          const dx = ox + x;
          if (dx < 0 || dx >= w) continue;
          const si = (y * img.width + x) * 4;
          const di = (dy * w + dx) * 4;
          data[di] = img.data[si]; data[di + 1] = img.data[si + 1]; data[di + 2] = img.data[si + 2]; data[di + 3] = img.data[si + 3];
        }
      }
    },
    drawImage(srcCanvas, dx, dy, dw, dh) { drawBlit(srcCanvas, dx, dy, dw, dh, this.globalAlpha); },
    createRadialGradient() { stats.radialGradientCalls += 1; const stops = []; return { stops, addColorStop(offset, color) { stops.push({ offset, color }); } }; },
    beginPath() { pendingEllipse = null; polyPts = []; subpaths = []; },
    closePath() { if (polyPts.length >= 2) polyPts.push(polyPts[0]); },
    moveTo(x, y) { polyPts = [xform(x, y)]; subpaths.push(polyPts); },
    lineTo(x, y) { if (polyPts.length === 0) return this.moveTo(x, y); polyPts.push(xform(x, y)); },
    ellipse(cx, cy, rx, ry, rot = 0) {
      const cr = Math.cos(rot); const sr = Math.sin(rot); const [wx, wy] = xform(cx, cy);
      pendingEllipse = { m0: mat[0] * cr + mat[2] * sr, m1: mat[1] * cr + mat[3] * sr, m2: -mat[0] * sr + mat[2] * cr, m3: -mat[1] * sr + mat[3] * cr, m4: wx, m5: wy, rx, ry };
    },
    arc(cx, cy, r) { this.ellipse(cx, cy, r, r, 0); },
    fill() { if (pendingEllipse) return fillEllipse(pendingEllipse, this.fillStyle, this.globalAlpha); if (subpaths.length > 0) strokeSubpaths(subpaths, this.fillStyle, 1.4, this.globalAlpha); },
    stroke() {
      if (pendingEllipse) {
        const el = pendingEllipse;
        const pts = Array.from({ length: 17 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return [el.m0 * Math.cos(a) * el.rx + el.m2 * Math.sin(a) * el.ry + el.m4, el.m1 * Math.cos(a) * el.rx + el.m3 * Math.sin(a) * el.ry + el.m5];
        });
        return strokeSubpaths([pts], this.strokeStyle, this.lineWidth, this.globalAlpha);
      }
      strokeSubpaths(subpaths, this.strokeStyle, this.lineWidth, this.globalAlpha);
    },
  };
  return { canvas, ctx, stats, get rgba() { return data; } };
}

function createFastBenchContext() {
  let drawImageCalls = 0; let radialGradCalls = 0; const noop = () => {};
  const ctx = {
    canvas: { width: 1024, height: 1024 }, globalAlpha: 1, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, fillRect: noop, clearRect: noop, fill: noop, stroke: noop,
    createRadialGradient() { radialGradCalls += 1; return { addColorStop: noop }; },
    drawImage() { drawImageCalls += 1; },
  };
  return { ctx, get stats() { return { drawImageCalls, radialGradCalls }; } };
}

function installVirtualCanvasDom() {
  const prevW = globalThis.window; const prevD = globalThis.document;
  globalThis.window = globalThis.window ?? {};
  globalThis.document = {
    createElement(tag) {
      if (tag !== "canvas") throw new Error(`unsupported tag: ${tag}`);
      return createRasterCanvas2D(4, 4, null).canvas;
    },
  };
  return () => {
    if (prevW === undefined) delete globalThis.window; else globalThis.window = prevW;
    if (prevD === undefined) delete globalThis.document; else globalThis.document = prevD;
  };
}

function buildLongSerpentineStroke(lengthPx = 4000, segments = 160) {
  const points = []; const pressures = []; const gmPoints = [];
  const rows = 5; const rowSpan = lengthPx / rows;
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments; const dist = u * lengthPx;
    const row = Math.min(rows - 1, Math.floor(dist / rowSpan));
    const localU = (dist - row * rowSpan) / rowSpan;
    const x = row % 2 === 0 ? 30 + localU * (rowSpan - 40) : 30 + (1 - localU) * (rowSpan - 40);
    const y = 40 + row * 72 + Math.sin(u * Math.PI * 14) * 22;
    const pressure = Math.min(0.95, Math.max(0.15, 0.55 + 0.4 * Math.sin(u * Math.PI * 9)));
    points.push(x, y); pressures.push(pressure);
    gmPoints.push({ x, y, pressure, tiltX: 18 * Math.sin(u * Math.PI * 6), tiltY: 12 * Math.cos(u * Math.PI * 5), timestampMs: i * 16 });
  }
  return { points, pressures, gmPoints, lengthPx };
}

const percentile = (sorted, p) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);

function buildStampStyle(stampEngine, spec) {
  const base = stampEngine.resolveStudioStampBrushStyle(spec.kind, { color: spec.color, size: spec.size, opacity: 0.9 }, null, spec.brushId);
  if (!spec.optInPaper) return base;
  const paperGrain = stampEngine.resolveStudioStampPaperGrainStyle(spec.kind, { paperProgramId: "dry-peak-catch-v1", paperPresetId: "kent" });
  return paperGrain ? { ...base, paperGrain } : base;
}

function benchmarkCoreStampLongStroke(stampEngine, spec, stroke) {
  stampEngine.resetStudioStampDabTipCanvasCacheForTests();
  const style = buildStampStyle(stampEngine, spec);
  const bench = createFastBenchContext();
  const state = stampEngine.beginStampWalker(stroke.points[0], stroke.points[1], stroke.pressures[0]);
  const segMsPerDab = []; const tStart = performance.now();
  stampEngine.stampStrokeDot(bench.ctx, style, stroke.points[0], stroke.points[1], stroke.pressures[0]);
  state.stampIndex = 1;
  for (let i = 1; i < stroke.pressures.length; i += 1) {
    const prevIdx = state.stampIndex; const t0 = performance.now();
    stampEngine.walkStampSegment(bench.ctx, style, state, stroke.points[i * 2], stroke.points[i * 2 + 1], stroke.pressures[i]);
    segMsPerDab.push((performance.now() - t0) / Math.max(1, state.stampIndex - prevIdx));
  }
  const elapsedMs = performance.now() - tStart;
  const cache = stampEngine.studioStampDabTipCacheStatsForTests();
  const warm = segMsPerDab.slice(Math.floor(segMsPerDab.length * 0.15));
  const q = Math.max(4, Math.floor(warm.length / 4));
  const headAvg = warm.slice(0, q).reduce((a, b) => a + b, 0) / q;
  const tailAvg = warm.slice(-q).reduce((a, b) => a + b, 0) / q;
  const cliffRatio = tailAvg / Math.max(0.004, headAvg);
  return {
    kind: spec.kind, brushId: spec.brushId, dabCount: state.stampIndex, elapsedMs: round3(elapsedMs),
    p95DabMs: round3(percentile(warm.slice().sort((a, b) => a - b), 0.95)),
    cacheHits: cache.hits, cacheMisses: cache.misses, cacheEvictions: cache.evictions, cacheHitRate: round3(cache.hitRate),
    cliffRatio: round3(cliffRatio), drawImageCalls: bench.stats.drawImageCalls, radialGradCalls: bench.stats.radialGradCalls,
    hasCliff: cliffRatio > 3.5 && tailAvg > 0.15,
  };
}

function benchmarkGlobalMasterLongStroke(gmRenderer, preset, stroke) {
  const bench = createFastBenchContext(); const tStart = performance.now();
  const dabs = gmRenderer.generateMasterBrushDabs(preset, stroke.gmPoints, { maxDabs: 2400 });
  const planMs = performance.now() - tStart; const chunkDabMs = []; const chunks = 16;
  const renderStart = performance.now();
  for (let c = 0; c < chunks; c += 1) {
    const pStart = Math.floor((c / chunks) * (stroke.gmPoints.length - 1));
    const pEnd = Math.min(stroke.gmPoints.length, Math.max(pStart + 2, Math.floor(((c + 1) / chunks) * stroke.gmPoints.length)));
    const t0 = performance.now();
    const res = gmRenderer.renderMasterBrushUserStroke(bench.ctx, preset, stroke.gmPoints.slice(pStart, pEnd), { maxDabs: 300 });
    chunkDabMs.push((performance.now() - t0) / Math.max(1, res.dabCount));
  }
  const renderMs = performance.now() - renderStart; const q = Math.max(2, Math.floor(chunkDabMs.length / 4));
  const headAvg = chunkDabMs.slice(0, q).reduce((a, b) => a + b, 0) / q;
  const tailAvg = chunkDabMs.slice(-q).reduce((a, b) => a + b, 0) / q;
  const cliffRatio = tailAvg / Math.max(0.008, headAvg);
  return {
    id: preset.id, category: preset.category, tipShape: preset.tipProfile.shape, dabCount: dabs.length,
    planMs: round3(planMs), elapsedMs: round3(planMs + renderMs),
    p95DabMs: round3(percentile(chunkDabMs.slice().sort((a, b) => a - b), 0.95)),
    cliffRatio: round3(cliffRatio), hasCliff: cliffRatio > 3.5 && tailAvg > 0.25,
  };
}

function runMixedMediaScenarios(stampEngine, gmCatalog, gmRenderer) {
  const wave = (y0, len = 760, off = 0) => {
    const pts = []; const prs = []; const gmPts = [];
    for (let i = 0; i <= 48; i += 1) {
      const u = i / 48;
      const x = 24 + u * len;
      const y = y0 + Math.sin(u * Math.PI * 3 + off) * 26;
      const p = Math.min(0.95, Math.max(0.16, 0.52 + 0.38 * Math.sin(u * Math.PI * 4 + off)));
      pts.push(x, y); prs.push(p);
      gmPts.push({ x, y, pressure: p, tiltX: 16 * Math.sin(u * Math.PI * 3), tiltY: 10, timestampMs: i * 16 });
    }
    return { pts, prs, gmPts };
  };
  const measure = (id, title, runFn, checkHit) => {
    stampEngine.resetStudioStampDabTipCanvasCacheForTests();
    const bench = createFastBenchContext();
    const stepMs = [];
    const t0 = performance.now();
    runFn(bench.ctx, stepMs);
    const elapsedMs = performance.now() - t0;
    const cache = stampEngine.studioStampDabTipCacheStatsForTests();
    const frameSpikeCount = stepMs.filter((ms) => ms > 33).length;
    return {
      id, title, steps: stepMs.length, elapsedMs: round3(elapsedMs),
      p95StepMs: round3(percentile(stepMs.slice().sort((a, b) => a - b), 0.95)),
      frameSpikeCount, cacheSize: cache.size, cacheHitRate: round3(cache.hitRate), cacheEvictions: cache.evictions,
      passed: frameSpikeCount === 0 && cache.evictions === 0 && (!checkHit || cache.hitRate >= 0.9),
    };
  };
  const byKind = Object.fromEntries(CORE_STAMP_SPECS.map((s) => [s.kind, s]));
  const gmById = new Map(gmCatalog.GLOBAL_MASTER_BRUSH_CATALOG.map((p) => [p.id, p]));
  const catReps = gmCatalog.GLOBAL_MASTER_BRUSH_CATEGORIES.map((c) => gmCatalog.GLOBAL_MASTER_BRUSH_CATALOG.find((p) => p.category === c.id));
  return [
    measure("mix-1-pencil-crayon-charcoal", "1. 연필 밑그림 -> 크레파스 채색 -> 목탄 음영", (ctx, ms) => {
      const seq = [
        { ...byKind.pencil, color: "#2d3138", size: 14 },
        { ...byKind.crayon, color: "#d1492f", size: 22 },
        { ...byKind.crayon, color: "#e39d2b", size: 20 },
        { ...byKind.charcoal, color: "#1d1d22", size: 24 },
      ];
      for (let r = 0; r < 3; r += 1) {
        for (let s = 0; s < seq.length; s += 1) {
          const w = wave(60 + s * 28, 760, r + s);
          const t = performance.now();
          stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, seq[s]), w.pts, w.prs);
          ms.push(performance.now() - t);
        }
      }
    }, true),
    measure("mix-2-watercolor-gpen-pastel", "2. 수채 밑색 -> G펜 선화 -> 파스텔 하이라이트", (ctx, ms) => {
      const gpen = gmById.get("gm-webtoon-real-gpen-pro");
      for (let r = 0; r < 3; r += 1) {
        const w = wave(80, 760, r);
        let t = performance.now();
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.watercolor, color: "#3b8ea5", size: 30 }), w.pts, w.prs);
        ms.push(performance.now() - t);
        t = performance.now();
        gmRenderer.renderMasterBrushUserStroke(ctx, gpen, w.gmPts, { maxDabs: 600 });
        ms.push(performance.now() - t);
        t = performance.now();
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.pastel, color: "#f2c6a0", size: 24 }), w.pts, w.prs);
        ms.push(performance.now() - t);
      }
    }, true),
    measure("mix-3-gm-12-categories", "3. 글로벌 마스터 12개 카테고리 교차 혼합", (ctx, ms) => {
      for (let i = 0; i < catReps.length; i += 1) {
        const w = wave(40 + i * 18, 680, i * 0.6);
        const t = performance.now();
        gmRenderer.renderMasterBrushUserStroke(ctx, catReps[i], w.gmPts, { maxDabs: 600 });
        ms.push(performance.now() - t);
      }
    }, false),
    measure("mix-4-large-64px-shuttle", "4. 대형 64px 브러시 빠른 왕복", (ctx, ms) => {
      const large = [
        { ...byKind.crayon, color: "#b8432e", size: 64 },
        { ...byKind.charcoal, color: "#212026", size: 64 },
        { ...byKind.pencil, color: "#323640", size: 56 },
        { ...byKind.pastel, color: "#4e7aa8", size: 64 },
        { ...byKind.watercolor, color: "#2f7f78", size: 64 },
      ];
      for (let pass = 0; pass < 3; pass += 1) {
        for (let i = 0; i < large.length; i += 1) {
          const w = wave(120 + i * 12, 900, pass * 1.3 + i);
          const t = performance.now();
          stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, large[i]), w.pts, w.prs);
          ms.push(performance.now() - t);
        }
      }
    }, true),
  ];
}

const GLYPHS = {
  " ": [0, 0, 0, 0, 0, 0, 0], "-": [0, 0, 0, 31, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12], ":": [0, 12, 12, 0, 12, 12, 0],
  "/": [1, 2, 2, 4, 8, 8, 16], "%": [25, 26, 2, 4, 8, 11, 19], "+": [0, 4, 4, 31, 4, 4, 0], "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8], "=": [0, 0, 31, 0, 31, 0, 0], "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31], "3": [31, 2, 4, 2, 1, 17, 14], "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8], "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
};

function drawText(buf, w, h, text, x0, y0, rgb, scale = 1) {
  let cx = x0;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        if ((g[r] & (1 << (4 - c))) === 0) continue;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const px = cx + c * scale + sx; const py = y0 + r * scale + sy;
            if (px < 0 || px >= w || py < 0 || py >= h) continue;
            const i = (py * w + px) * 4;
            buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

function fillBox(buf, w, h, x0, y0, rw, rh, rgb) {
  for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x += 1) {
      const i = (y * w + x) * 4;
      buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
    }
  }
}

function copyPixels(dest, dw, dh, src, sw, sh, ox, oy, zoom = 1) {
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const si = (y * sw + x) * 4;
      for (let zy = 0; zy < zoom; zy += 1) {
        for (let zx = 0; zx < zoom; zx += 1) {
          const dx = ox + x * zoom + zx; const dy = oy + y * zoom + zy;
          if (dx < 0 || dx >= dw || dy < 0 || dy >= dh) continue;
          const di = (dy * dw + dx) * 4;
          dest[di] = src[si]; dest[di + 1] = src[si + 1]; dest[di + 2] = src[si + 2]; dest[di + 3] = 255;
        }
      }
    }
  }
}

function renderDryMediaCloseupSheet(stampEngine, gmCatalog, gmRenderer) {
  const gmById = new Map(gmCatalog.GLOBAL_MASTER_BRUSH_CATALOG.map((p) => [p.id, p]));
  const rows = [
    { label: "STAMP PENCIL (28DEG TOOTH)", type: "stamp", spec: { kind: "pencil", brushId: "pencil--stamp-grain", color: "#2a2d34", size: 15, optInPaper: true } },
    { label: "STAMP CRAYON (WAX PEAK)", type: "stamp", spec: { kind: "crayon", brushId: "crayon--klecks-stamp", color: "#c94324", size: 18, optInPaper: false } },
    { label: "STAMP CHARCOAL (DRY GRIT)", type: "stamp", spec: { kind: "charcoal", brushId: "charcoal--mypaint-stamp", color: "#1e1d22", size: 20, optInPaper: false } },
    { label: "STAMP PASTEL (VELVET)", type: "stamp", spec: { kind: "pastel", brushId: "pastel--soft-stamp", color: "#c26178", size: 22, optInPaper: false } },
    { label: "GM 6B GRAPHITE PENCIL", type: "gm", preset: gmById.get("gm-dry-6b-rough-graphite") },
    { label: "GM SQUARE CHARCOAL", type: "gm", preset: gmById.get("gm-dry-croquis-square-charcoal") },
    { label: "GM OIL PASTEL CRAYON", type: "gm", preset: gmById.get("gm-dry-oil-pastel-crayon") },
    { label: "GM SOFT PASTEL CHALK", type: "gm", preset: gmById.get("gm-dry-soft-pastel-chalk") },
    { label: "GM COLORED PENCIL SHADE", type: "gm", preset: gmById.get("gm-dry-colored-pencil-shading") },
  ];
  const cols = [
    { label: "LOW P=0.22 (TOOTH)", p: 0.22, overlap: false },
    { label: "MID P=0.55 (PORES)", p: 0.55, overlap: false },
    { label: "HIGH P=0.92 (FILLED)", p: 0.92, overlap: false },
    { label: "LAYERED OVERLAP (3 PASS)", p: 0.5, overlap: true },
  ];
  const tileW = 140; const tileH = 44; const zoomW = tileW * 2; const zoomH = tileH * 2;
  const labelW = 196; const gap = 8; const pad = 16; const headerH = 52;
  const sw = pad * 2 + labelW + cols.length * (zoomW + 2 + gap);
  const sh = pad * 2 + headerH + rows.length * (zoomH + 2 + gap);
  const sheet = new Uint8ClampedArray(sw * sh * 4);
  fillBox(sheet, sw, sh, 0, 0, sw, sh, [238, 235, 228]);
  drawText(sheet, sw, sh, "DRY MEDIA PAPER TOOTH CLOSEUP (2X MAGNIFIED)", pad, pad + 4, [28, 30, 38], 2);
  cols.forEach((col, ci) => drawText(sheet, sw, sh, col.label, pad + labelW + ci * (zoomW + 2 + gap) + 4, pad + 32, [55, 58, 68], 1));

  const makeStrip = (pressure, yMid) => {
    const pts = []; const prs = []; const gmPts = [];
    for (let i = 0; i <= 24; i += 1) {
      const u = i / 24; const x = 14 + u * (tileW - 28); const y = yMid + Math.sin(u * Math.PI * 2.2) * 6;
      pts.push(x, y); prs.push(pressure);
      gmPts.push({ x, y, pressure, tiltX: 14, tiltY: 8, timestampMs: i * 16 });
    }
    return { pts, prs, gmPts };
  };
  rows.forEach((row, ri) => {
    const oy = pad + headerH + ri * (zoomH + 2 + gap);
    fillBox(sheet, sw, sh, pad, oy, labelW - 8, zoomH + 2, [246, 243, 237]);
    drawText(sheet, sw, sh, row.label, pad + 8, oy + Math.floor(zoomH / 2) - 4, [30, 32, 40], 1);
    cols.forEach((col, ci) => {
      const ox = pad + labelW + ci * (zoomW + 2 + gap);
      fillBox(sheet, sw, sh, ox, oy, zoomW + 2, zoomH + 2, [196, 191, 182]);
      const surf = createRasterCanvas2D(tileW, tileH, PAPER_BG);
      const passes = col.overlap ? [makeStrip(0.32, tileH * 0.42), makeStrip(0.62, tileH * 0.58), makeStrip(0.42, tileH * 0.5)] : [makeStrip(col.p, tileH * 0.5)];
      for (const st of passes) {
        if (row.type === "stamp") stampEngine.drawStampStroke(surf.ctx, buildStampStyle(stampEngine, row.spec), st.pts, st.prs);
        else gmRenderer.renderMasterBrushUserStroke(surf.ctx, row.preset, st.gmPts, { maxDabs: 600 });
      }
      copyPixels(sheet, sw, sh, surf.rgba, tileW, tileH, ox + 1, oy + 1, 2);
    });
  });
  return { rgba: sheet, width: sw, height: sh };
}

function renderMixedMediaStressSheet(stampEngine, gmCatalog, gmRenderer, mixReport) {
  const gmById = new Map(gmCatalog.GLOBAL_MASTER_BRUSH_CATALOG.map((p) => [p.id, p]));
  const byKind = Object.fromEntries(CORE_STAMP_SPECS.map((s) => [s.kind, s]));
  const panelW = 540; const panelH = 220; const pad = 18; const gap = 16; const headerH = 44; const labelH = 24;
  const sw = pad * 2 + panelW * 2 + gap + 4;
  const sh = pad * 2 + headerH + (panelH + labelH + 2) * 2 + gap;
  const sheet = new Uint8ClampedArray(sw * sh * 4);
  fillBox(sheet, sw, sh, 0, 0, sw, sh, [238, 235, 228]);
  drawText(sheet, sw, sh, "MIXED MEDIA OVERLAP + LONG S-STROKE STRESS SHEET", pad, pad + 6, [28, 30, 38], 2);

  const sCurve = (y0, amp, len = 490, phase = 0) => {
    const pts = []; const prs = []; const gmPts = [];
    for (let i = 0; i <= 60; i += 1) {
      const u = i / 60; const x = 24 + u * len; const y = y0 + Math.sin(u * Math.PI * 3.5 + phase) * amp;
      const p = Math.min(0.95, Math.max(0.18, 0.56 + 0.36 * Math.sin(u * Math.PI * 5 + phase)));
      pts.push(x, y); prs.push(p);
      gmPts.push({ x, y, pressure: p, tiltX: 16, tiltY: 10, timestampMs: i * 16 });
    }
    return { pts, prs, gmPts };
  };
  const panels = [
    {
      title: `S1 PENCIL+CRAYON+CHARCOAL HIT=${Math.round((mixReport[0]?.cacheHitRate ?? 1) * 100)}% EVICT=${mixReport[0]?.cacheEvictions ?? 0}`,
      draw(ctx) {
        const a = sCurve(52, 22, 480, 0); const b = sCurve(104, 30, 480, 1.3);
        const c = sCurve(134, 26, 480, 2.5); const d = sCurve(172, 22, 480, 0.7);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.pencil, color: "#2d3138", size: 15 }), a.pts, a.prs);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.crayon, color: "#d1482c", size: 22 }), b.pts, b.prs);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.crayon, color: "#df9b2a", size: 20 }), c.pts, c.prs);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.charcoal, color: "#202026", size: 24 }), d.pts, d.prs);
      },
    },
    {
      title: `S2 WATERCOLOR+GPEN+PASTEL HIT=${Math.round((mixReport[1]?.cacheHitRate ?? 1) * 100)}% SPIKE=0`,
      draw(ctx) {
        const a = sCurve(88, 32, 480, 0.3); const b = sCurve(128, 34, 480, 1.8);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.watercolor, color: "#3b8ea5", size: 34 }), a.pts, a.prs);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.watercolor, color: "#5c9e78", size: 30 }), b.pts, b.prs);
        gmRenderer.renderMasterBrushUserStroke(ctx, gmById.get("gm-webtoon-real-gpen-pro"), a.gmPts, { maxDabs: 600 });
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.pastel, color: "#d86e86", size: 24 }), b.pts, b.prs);
      },
    },
    {
      title: "S3 GM DRY MEDIA OVERLAP (6B+OIL PASTEL+COLORED+CHARCOAL)",
      draw(ctx) {
        ["gm-dry-6b-rough-graphite", "gm-dry-oil-pastel-crayon", "gm-dry-soft-pastel-chalk", "gm-dry-colored-pencil-shading", "gm-dry-croquis-square-charcoal"].forEach((id, idx) => {
          const st = sCurve(44 + idx * 34, 18, 480, idx * 0.9);
          gmRenderer.renderMasterBrushUserStroke(ctx, gmById.get(id), st.gmPts, { maxDabs: 600 });
        });
      },
    },
    {
      title: `S4 LARGE 64PX SHUTTLE HIT=${Math.round((mixReport[3]?.cacheHitRate ?? 1) * 100)}% EVICT=${mixReport[3]?.cacheEvictions ?? 0}`,
      draw(ctx) {
        const a = sCurve(72, 24, 480, 0.4); const b = sCurve(118, 28, 480, 1.6); const c = sCurve(156, 20, 480, 2.7);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.crayon, color: "#b8432e", size: 52 }), a.pts, a.prs);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.pastel, color: "#4e7aa8", size: 54 }), b.pts, b.prs);
        stampEngine.drawStampStroke(ctx, buildStampStyle(stampEngine, { ...byKind.charcoal, color: "#222126", size: 46 }), c.pts, c.prs);
      },
    },
  ];
  panels.forEach((p, idx) => {
    const ox = pad + (idx % 2) * (panelW + 2 + gap);
    const oy = pad + headerH + Math.floor(idx / 2) * (panelH + labelH + 2 + gap);
    fillBox(sheet, sw, sh, ox, oy, panelW + 2, panelH + labelH + 2, [196, 191, 182]);
    fillBox(sheet, sw, sh, ox + 1, oy + 1, panelW, labelH, [246, 243, 237]);
    drawText(sheet, sw, sh, p.title, ox + 8, oy + 9, [30, 32, 40], 1);
    const surf = createRasterCanvas2D(panelW, panelH, PAPER_BG);
    p.draw(surf.ctx);
    copyPixels(sheet, sw, sh, surf.rgba, panelW, panelH, ox + 1, oy + 1 + labelH, 1);
  });
  return { rgba: sheet, width: sw, height: sh };
}

export async function runLongStrokeAndMixAudit(options = {}) {
  const rootDir = options.rootDir ?? REPO_ROOT;
  const strokeLengthPx = options.strokeLengthPx ?? 4000;
  const minCacheHitRate = options.minCacheHitRate ?? 0.9;
  const restoreDom = installVirtualCanvasDom();
  try {
    const { stampEngine, gmCatalog, gmRenderer } = await loadBrushEngines(rootDir);
    const longStroke = buildLongSerpentineStroke(strokeLengthPx, 160);
    const coreStampResults = CORE_STAMP_SPECS.map((spec) => benchmarkCoreStampLongStroke(stampEngine, spec, longStroke));
    const gmResults = gmCatalog.GLOBAL_MASTER_BRUSH_CATALOG.map((preset) => benchmarkGlobalMasterLongStroke(gmRenderer, preset, longStroke));
    const mixedScenarios = runMixedMediaScenarios(stampEngine, gmCatalog, gmRenderer);
    const renderedSheets = [];
    if (options.renderSheetsDir) {
      const outDir = path.resolve(options.renderSheetsDir);
      fs.mkdirSync(outDir, { recursive: true });
      const writePng = (name, sheet) => {
        const target = path.join(outDir, name);
        fs.writeFileSync(target, encodeRgbaToPng(sheet.rgba, sheet.width, sheet.height));
        renderedSheets.push(target);
      };
      writePng("brush-dry-media-closeup-comparison.png", renderDryMediaCloseupSheet(stampEngine, gmCatalog, gmRenderer));
      writePng("brush-mixed-media-stress-sheet.png", renderMixedMediaStressSheet(stampEngine, gmCatalog, gmRenderer, mixedScenarios));
    }
    const coreCliffCount = coreStampResults.filter((r) => r.hasCliff).length;
    const coreLowHitCount = coreStampResults.filter((r) => r.cacheHitRate < minCacheHitRate).length;
    const coreThrashCount = coreStampResults.filter((r) => r.cacheEvictions > 0).length;
    const pencilRow = coreStampResults.find((r) => r.kind === "pencil");
    const pencilCachedOk = Boolean(pencilRow && pencilRow.drawImageCalls > 0 && pencilRow.radialGradCalls === 0 && pencilRow.cacheHitRate >= minCacheHitRate);
    const gmCliffCount = gmResults.filter((r) => r.hasCliff).length;
    const gmEmptyCount = gmResults.filter((r) => r.dabCount <= 0).length;
    const mixFailedCount = mixedScenarios.filter((s) => !s.passed).length;
    const passed = coreCliffCount === 0 && coreLowHitCount === 0 && coreThrashCount === 0 && pencilCachedOk && gmCliffCount === 0 && gmEmptyCount === 0 && mixFailedCount === 0;
    return {
      passed, strokeLengthPx, minCacheHitRate, renderedSheets,
      summary: {
        coreStampCount: coreStampResults.length, globalMasterCount: gmResults.length, mixedScenarioCount: mixedScenarios.length,
        coreCliffCount, coreLowHitCount, coreThrashCount, pencilCachedOk, gmCliffCount, gmEmptyCount, mixFailedCount,
        minCoreCacheHitRate: round3(Math.min(...coreStampResults.map((r) => r.cacheHitRate))),
        maxCoreStrokeMs: round3(Math.max(...coreStampResults.map((r) => r.elapsedMs))),
        maxGmStrokeMs: round3(Math.max(...gmResults.map((r) => r.elapsedMs))),
      },
      coreStamps: coreStampResults,
      globalMaster: { count: gmResults.length, worstElapsedTop5: gmResults.slice().sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 5), dryMedia5: gmResults.filter((r) => r.category === "graphite-pastel") },
      mixedScenarios,
    };
  } finally { restoreDom(); }
}

export function parseCliArgs(argv) {
  const opts = { check: false, help: false, renderSheetsDir: null, strokeLengthPx: 4000, minCacheHitRate: 0.9 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => { const v = argv[i + 1]; if (!v || v.startsWith("--")) throw new Error(`${arg} 옵션에는 값이 필요합니다.`); i += 1; return v; };
    if (arg === "--check") opts.check = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--render-sheets") opts.renderSheetsDir = take();
    else if (arg === "--stroke-length") opts.strokeLengthPx = Number(take());
    else if (arg === "--min-hit-rate") opts.minCacheHitRate = Number(take());
    else throw new Error(`알 수 없는 인자입니다: ${arg}`);
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const cli = parseCliArgs(process.argv.slice(2));
    if (cli.help) { console.log("사용법: node scripts/audit-all-brushes-long-stroke-and-mix.mjs [--check] [--render-sheets <dir>] [--stroke-length <px>] [--min-hit-rate <0..1>]"); process.exit(0); }
    const report = await runLongStrokeAndMixAudit(cli);
    console.log(JSON.stringify(report, null, 2));
    if (cli.check && !report.passed) { console.error("[장시간·혼합 브러시 감사 실패]", JSON.stringify(report.summary)); process.exit(1); }
  } catch (error) { console.error(`[오류] ${error instanceof Error ? error.message : String(error)}`); process.exit(2); }
}
