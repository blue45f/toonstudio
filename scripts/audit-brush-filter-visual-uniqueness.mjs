#!/usr/bin/env node
/**
 * 글로벌 마스터 브러시 60종 + 마스터 RGBA 필터 36종 전수 픽셀 변별력 감사 및 컨택트시트 생성기.
 *
 * - 브러시 C(60,2)=1,770쌍: 순수 JS 2D Canvas 래스터라이저로 기본잉크/동일잉크 RGBA 렌더링
 * - 필터 C(36,2)=630쌍: 실제 applyMasterFilterToRgba 픽셀 엔진으로 RGBA 버퍼 렌더링
 * - 전수 쌍별 픽셀 RMSE / 색상 히스토그램 거리 / 구조적(Sobel+공간) 변별 거리 산출
 * - `--render-sheets <dir>` 시 순수 Node PNG 인코더로 60종 브러시(12×5) + 36종 필터(6×6) PNG 출력
 */
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIGHT_PAPER_RGB = [248, 246, 241];
const DARK_PAPER_RGB = [18, 22, 34];
const UNIFIED_LIGHT_INK = [26, 28, 36];
const UNIFIED_DARK_INK = [182, 214, 255];

let tsHooksRegistered = false;
function ensureTsLoaderHooks() {
  if (tsHooksRegistered) return;
  tsHooksRegistered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
        const candidate = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
        if (!fs.existsSync(candidate) && fs.existsSync(`${candidate}.ts`)) {
          return { url: pathToFileURL(`${candidate}.ts`).href, format: "module-typescript", shortCircuit: true };
        }
      }
      const resolved = nextResolve(specifier, context);
      return resolved.url.endsWith(".ts") ? { ...resolved, format: "module-typescript" } : resolved;
    },
  });
}

async function loadDomainModules(rootDir = REPO_ROOT) {
  ensureTsLoaderHooks();
  const bDir = path.join(rootDir, "apps/web/src/domains/creator/brush/global-master-collection");
  const fDir = path.join(rootDir, "apps/web/src/domains/creator/filter/master-lut-fx");
  const [brushCatalog, brushRenderer, filterCatalog, filterEngine] = await Promise.all([
    import(pathToFileURL(path.join(bDir, "global-master-brush-catalog.ts")).href),
    import(pathToFileURL(path.join(bDir, "global-master-brush-renderer.ts")).href),
    import(pathToFileURL(path.join(fDir, "master-filter-lut-catalog.ts")).href),
    import(pathToFileURL(path.join(fDir, "master-filter-pixel-engine.ts")).href),
  ]);
  return { brushCatalog, brushRenderer, filterCatalog, filterEngine };
}

const clampByte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
const round4 = (v) => Math.round(v * 10000) / 10000;

function parseCssRgba(css) {
  if (typeof css !== "string") return [0, 0, 0, 1];
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i.exec(css);
  if (m) return [Number(m[1]) || 0, Number(m[2]) || 0, Number(m[3]) || 0, m[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(m[4])))];
  return [0, 0, 0, 1];
}

function blendPixel(buf, idx, sr, sg, sb, sa) {
  if (sa <= 0.001) return;
  const inv = 1 - sa;
  buf[idx] = clampByte(sr * sa + buf[idx] * inv);
  buf[idx + 1] = clampByte(sg * sa + buf[idx + 1] * inv);
  buf[idx + 2] = clampByte(sb * sa + buf[idx + 2] * inv);
  buf[idx + 3] = 255;
}

function invert2x2(m0, m1, m2, m3) {
  const det = m0 * m3 - m1 * m2;
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  return [m3 * inv, -m1 * inv, -m2 * inv, m0 * inv];
}

/**
 * 순수 JS 고속 소프트웨어 2D Canvas 래스터라이저(해석적 타원·회전 사각형 AA + 폴리곤·캡슐 선).
 */
export function createSoftwareCanvas2D(width, height, bgRgb = LIGHT_PAPER_RGB) {
  const data = new Uint8ClampedArray(width * height * 4);
  const fillBg = () => {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = bgRgb[0];
      data[i + 1] = bgRgb[1];
      data[i + 2] = bgRgb[2];
      data[i + 3] = 255;
    }
  };
  fillBg();

  let mat = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let subpaths = [];
  let cur = null;
  let pendingEllipse = null;

  const xform = (x, y) => [mat[0] * x + mat[2] * y + mat[4], mat[1] * x + mat[3] * y + mat[5]];
  const scaleAvg = () => (Math.hypot(mat[0], mat[1]) + Math.hypot(mat[2], mat[3])) * 0.5;

  const materializeEllipse = (el) => {
    const segs = Math.max(12, Math.min(24, Math.round(Math.max(el.rx, el.ry) * 2)));
    const pts = [];
    for (let i = 0; i <= segs; i += 1) {
      const a = el.start + (el.end - el.start) * (i / segs);
      const lx = Math.cos(a) * el.rx;
      const ly = Math.sin(a) * el.ry;
      pts.push([el.m0 * lx + el.m2 * ly + el.m4, el.m1 * lx + el.m3 * ly + el.m5]);
    }
    return { pts, closed: el.full };
  };

  const fillAnalyticEllipse = (el, css, ga) => {
    const [sr, sg, sb, ca] = parseCssRgba(css);
    const alpha = ca * ga;
    if (alpha <= 0.001) return;
    const inv = invert2x2(el.m0, el.m1, el.m2, el.m3);
    if (!inv) return;
    const radX = Math.hypot(el.m0 * el.rx, el.m2 * el.ry) + 1;
    const radY = Math.hypot(el.m1 * el.rx, el.m3 * el.ry) + 1;
    const invRx = 1 / el.rx;
    const invRy = 1 / el.ry;
    const aa = 1 / Math.max(0.8, Math.min(el.rx, el.ry) * scaleAvg());
    for (let y = Math.max(0, Math.floor(el.m5 - radY)); y <= Math.min(height - 1, Math.ceil(el.m5 + radY)); y += 1) {
      const dy = y + 0.5 - el.m5;
      for (let x = Math.max(0, Math.floor(el.m4 - radX)); x <= Math.min(width - 1, Math.ceil(el.m4 + radX)); x += 1) {
        const dx = x + 0.5 - el.m4;
        const r = Math.hypot((inv[0] * dx + inv[2] * dy) * invRx, (inv[1] * dx + inv[3] * dy) * invRy);
        if (r <= 1 + aa) {
          blendPixel(data, (y * width + x) * 4, sr, sg, sb, alpha * (r <= 1 - aa ? 1 : Math.max(0, (1 + aa - r) / (2 * aa))));
        }
      }
    }
  };

  const fillAnalyticRect = (x, y, w, h, css, ga) => {
    const [sr, sg, sb, ca] = parseCssRgba(css);
    const alpha = ca * ga;
    const inv = alpha > 0.001 ? invert2x2(mat[0], mat[1], mat[2], mat[3]) : null;
    if (!inv) return;
    const c = [xform(x, y), xform(x + w, y), xform(x + w, y + h), xform(x, y + h)];
    const rMinX = Math.min(x, x + w);
    const rMaxX = Math.max(x, x + w);
    const rMinY = Math.min(y, y + h);
    const rMaxY = Math.max(y, y + h);
    for (let py = Math.max(0, Math.floor(Math.min(...c.map((p) => p[1])) - 1)); py <= Math.min(height - 1, Math.ceil(Math.max(...c.map((p) => p[1])) + 1)); py += 1) {
      const dy = py + 0.5 - mat[5];
      for (let px = Math.max(0, Math.floor(Math.min(...c.map((p) => p[0])) - 1)); px <= Math.min(width - 1, Math.ceil(Math.max(...c.map((p) => p[0])) + 1)); px += 1) {
        const dx = px + 0.5 - mat[4];
        const dOut = Math.max(rMinX - (inv[0] * dx + inv[2] * dy), inv[0] * dx + inv[2] * dy - rMaxX, rMinY - (inv[1] * dx + inv[3] * dy), inv[1] * dx + inv[3] * dy - rMaxY);
        if (dOut <= 0.55) blendPixel(data, (py * width + px) * 4, sr, sg, sb, alpha * (dOut <= -0.45 ? 1 : Math.max(0, 0.55 - dOut)));
      }
    }
  };

  const hitPoly = (px, py, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  const fillPolys = (polys, css, ga) => {
    const [sr, sg, sb, ca] = parseCssRgba(css);
    const alpha = ca * ga;
    if (alpha <= 0.001 || polys.length === 0) return;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    for (const pts of polys) {
      for (const [px, py] of pts) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(height - 1, Math.ceil(maxY)); y += 1) {
      for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(width - 1, Math.ceil(maxX)); x += 1) {
        let hits = 0;
        for (const pts of polys) {
          if (hitPoly(x + 0.25, y + 0.25, pts)) hits += 1;
          if (hitPoly(x + 0.75, y + 0.25, pts)) hits += 1;
          if (hitPoly(x + 0.25, y + 0.75, pts)) hits += 1;
          if (hitPoly(x + 0.75, y + 0.75, pts)) hits += 1;
        }
        if (hits > 0) blendPixel(data, (y * width + x) * 4, sr, sg, sb, alpha * Math.min(1, hits * 0.25));
      }
    }
  };

  const strokePaths = (paths, css, lw, ga) => {
    const [sr, sg, sb, ca] = parseCssRgba(css);
    const alpha = ca * ga;
    if (alpha <= 0.001) return;
    const halfW = Math.max(0.35, lw * scaleAvg() * 0.5);
    const pad = halfW + 1;
    for (const sp of paths) {
      const pts = sp.pts;
      if (pts.length < 2) continue;
      const segs = sp.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segs; i += 1) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        for (let y = Math.max(0, Math.floor(Math.min(y1, y2) - pad)); y <= Math.min(height - 1, Math.ceil(Math.max(y1, y2) + pad)); y += 1) {
          for (let x = Math.max(0, Math.floor(Math.min(x1, x2) - pad)); x <= Math.min(width - 1, Math.ceil(Math.max(x1, x2) + pad)); x += 1) {
            const px = x + 0.5;
            const py = y + 0.5;
            const t = len2 > 1e-6 ? Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
            const dist = Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
            if (dist <= halfW + 0.7) {
              blendPixel(data, (y * width + x) * 4, sr, sg, sb, alpha * (dist <= halfW - 0.3 ? 1 : Math.max(0, halfW + 0.7 - dist)));
            }
          }
        }
      }
    }
  };

  const flushEllipseToSubpaths = () => {
    if (!pendingEllipse) return;
    cur = materializeEllipse(pendingEllipse);
    subpaths.push(cur);
    pendingEllipse = null;
  };

  const ctx = {
    fillStyle: "rgba(0,0,0,1)",
    strokeStyle: "rgba(0,0,0,1)",
    lineWidth: 1,
    globalAlpha: 1,
    save() {
      stack.push({ mat: mat.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha });
    },
    restore() {
      const prev = stack.pop();
      if (!prev) return;
      mat = prev.mat;
      this.fillStyle = prev.fillStyle;
      this.strokeStyle = prev.strokeStyle;
      this.lineWidth = prev.lineWidth;
      this.globalAlpha = prev.globalAlpha;
    },
    translate(tx, ty) {
      mat = [mat[0], mat[1], mat[2], mat[3], mat[0] * tx + mat[2] * ty + mat[4], mat[1] * tx + mat[3] * ty + mat[5]];
    },
    rotate(rad) {
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      mat = [mat[0] * c + mat[2] * s, mat[1] * c + mat[3] * s, -mat[0] * s + mat[2] * c, -mat[1] * s + mat[3] * c, mat[4], mat[5]];
    },
    clearRect(x, y, w, h) {
      if (x <= 0 && y <= 0 && w >= width && h >= height) return fillBg();
      for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, Math.ceil(y + h)); py += 1) {
        for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + w)); px += 1) {
          const i = (py * width + px) * 4;
          data[i] = bgRgb[0];
          data[i + 1] = bgRgb[1];
          data[i + 2] = bgRgb[2];
          data[i + 3] = 255;
        }
      }
    },
    fillRect(x, y, w, h) {
      fillAnalyticRect(x, y, w, h, this.fillStyle, this.globalAlpha);
    },
    beginPath() {
      subpaths = [];
      cur = null;
      pendingEllipse = null;
    },
    closePath() {
      if (cur) cur.closed = true;
    },
    moveTo(x, y) {
      flushEllipseToSubpaths();
      cur = { pts: [xform(x, y)], closed: false };
      subpaths.push(cur);
    },
    lineTo(x, y) {
      flushEllipseToSubpaths();
      if (!cur) return this.moveTo(x, y);
      cur.pts.push(xform(x, y));
    },
    ellipse(cx, cy, rx, ry, rot = 0, start = 0, end = Math.PI * 2) {
      flushEllipseToSubpaths();
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const [wx, wy] = xform(cx, cy);
      const el = {
        m0: mat[0] * cr + mat[2] * sr,
        m1: mat[1] * cr + mat[3] * sr,
        m2: -mat[0] * sr + mat[2] * cr,
        m3: -mat[1] * sr + mat[3] * cr,
        m4: wx,
        m5: wy,
        rx,
        ry,
        start,
        end,
        full: Math.abs(end - start) >= Math.PI * 1.99,
      };
      if (el.full && subpaths.length === 0) {
        pendingEllipse = el;
      } else {
        cur = materializeEllipse(el);
        subpaths.push(cur);
      }
    },
    arc(cx, cy, r, start = 0, end = Math.PI * 2) {
      this.ellipse(cx, cy, r, r, 0, start, end);
    },
    fill() {
      if (pendingEllipse && subpaths.length === 0) return fillAnalyticEllipse(pendingEllipse, this.fillStyle, this.globalAlpha);
      flushEllipseToSubpaths();
      fillPolys(subpaths.map((s) => s.pts).filter((pts) => pts.length >= 3), this.fillStyle, this.globalAlpha);
    },
    stroke() {
      flushEllipseToSubpaths();
      strokePaths(subpaths, this.strokeStyle, this.lineWidth, this.globalAlpha);
    },
  };
  return { ctx, data, width, height };
}

function buildFeatureVector(rgba, width, height, includeAlpha) {
  const n = width * height;
  const hist = new Float64Array(80);
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    hist[((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)] += 1;
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    luma[i] = includeAlpha ? y * (rgba[idx + 3] / 255) : y;
    hist[64 + Math.min(15, Math.floor(luma[i] * 16))] += 1;
  }
  for (let i = 0; i < 80; i += 1) hist[i] /= Math.max(1, n);

  const gx = 8;
  const gy = 4;
  const spatial = new Float64Array(gx * gy * 2);
  const counts = new Float64Array(gx * gy);
  for (let y = 0; y < height; y += 1) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(height - 1, y + 1);
    const cy = Math.min(gy - 1, Math.floor((y * gy) / height));
    for (let x = 0; x < width; x += 1) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(width - 1, x + 1);
      const cx = Math.min(gx - 1, Math.floor((x * gx) / width));
      const sx = -luma[ym * width + xm] + luma[ym * width + xp] - 2 * luma[y * width + xm] + 2 * luma[y * width + xp] - luma[yp * width + xm] + luma[yp * width + xp];
      const sy = -luma[ym * width + xm] - 2 * luma[ym * width + x] - luma[ym * width + xp] + luma[yp * width + xm] + 2 * luma[yp * width + x] + luma[yp * width + xp];
      const cell = cy * gx + cx;
      spatial[cell * 2] += luma[y * width + x];
      spatial[cell * 2 + 1] += Math.min(1, Math.hypot(sx, sy) * 0.5);
      counts[cell] += 1;
    }
  }
  for (let c = 0; c < gx * gy; c += 1) {
    const inv = counts[c] > 0 ? 1 / counts[c] : 0;
    spatial[c * 2] *= inv;
    spatial[c * 2 + 1] *= inv;
  }
  return { hist, spatial };
}

export function computeNormalizedRgbaRmse(bufA, bufB, includeAlpha = false) {
  const pixels = Math.floor(Math.min(bufA.length, bufB.length) / 4);
  if (pixels <= 0) return 0;
  let sumSq = 0;
  for (let p = 0; p < pixels; p += 1) {
    const i = p * 4;
    const dr = bufA[i] - bufB[i];
    const dg = bufA[i + 1] - bufB[i + 1];
    const db = bufA[i + 2] - bufB[i + 2];
    sumSq += dr * dr + dg * dg + db * db + (includeAlpha ? (bufA[i + 3] - bufB[i + 3]) ** 2 : 0);
  }
  return Math.sqrt(sumSq / (pixels * (includeAlpha ? 4 : 3))) / 255;
}

function computeHistogramDist(hA, hB) {
  let rgb = 0;
  let lum = 0;
  for (let i = 0; i < 64; i += 1) rgb += Math.abs(hA[i] - hB[i]);
  for (let i = 64; i < 80; i += 1) lum += Math.abs(hA[i] - hB[i]);
  return rgb * 0.325 + lum * 0.175;
}

function computeStructuralDist(sA, sB) {
  let sq = 0;
  for (let i = 0; i < sA.length; i += 1) sq += (sA[i] - sB[i]) ** 2;
  return Math.min(1, Math.sqrt(sq / sA.length) * 1.8);
}

function summarizePairs(items, threshold, { includeAlpha, pairExtra }) {
  const pairs = [];
  const rmses = [];
  let minR = Infinity;
  let minH = Infinity;
  let minS = Infinity;
  let minC = Infinity;
  let sumR = 0;
  let sumH = 0;
  let sumS = 0;
  let sumC = 0;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const rmse = computeNormalizedRgbaRmse(a.rgba, b.rgba, includeAlpha);
      const histDist = computeHistogramDist(a.feat.hist, b.feat.hist);
      const structDist = computeStructuralDist(a.feat.spatial, b.feat.spatial);
      const comp = rmse * 0.55 + histDist * 0.25 + structDist * 0.2;
      rmses.push(rmse);
      minR = Math.min(minR, rmse);
      minH = Math.min(minH, histDist);
      minS = Math.min(minS, structDist);
      minC = Math.min(minC, comp);
      sumR += rmse;
      sumH += histDist;
      sumS += structDist;
      sumC += comp;
      pairs.push({
        a: a.id,
        b: b.id,
        categoryA: a.category,
        categoryB: b.category,
        rgbaRmse: round4(rmse),
        histogramDist: round4(histDist),
        structuralDist: round4(structDist),
        compositeDist: round4(comp),
        ...(pairExtra ? pairExtra(a, b) : {}),
      });
    }
  }
  rmses.sort((x, y) => x - y);
  const n = Math.max(1, pairs.length);
  const sorted = pairs.slice().sort((x, y) => x.rgbaRmse - y.rgbaRmse);
  const violations = sorted.filter((p) => p.rgbaRmse < threshold);
  return {
    pairCount: pairs.length,
    threshold,
    violationCount: violations.length,
    minRmse: round4(minR),
    p05Rmse: round4(rmses[Math.floor(pairs.length * 0.05)] ?? 0),
    meanRmse: round4(sumR / n),
    minHistogramDist: round4(minH),
    meanHistogramDist: round4(sumH / n),
    minStructuralDist: round4(minS),
    meanStructuralDist: round4(sumS / n),
    minCompositeDist: round4(minC),
    meanCompositeDist: round4(sumC / n),
    closestPairs: sorted.slice(0, 15),
    violations,
    allPairs: pairs,
  };
}

// ── 5×7 비트맵 폰트 + 순수 Node PNG 인코더 ───────────────────────────────────
const FONT_5X7 = {
  " ": [0, 0, 0, 0, 0, 0, 0], "-": [0, 0, 0, 31, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 4, 4, 8], "/": [1, 2, 2, 4, 8, 8, 16], ":": [0, 12, 12, 0, 12, 12, 0],
  "&": [12, 18, 20, 8, 21, 18, 13], "+": [0, 4, 4, 31, 4, 4, 0], "%": [25, 26, 2, 4, 8, 11, 19],
  "#": [10, 10, 31, 10, 31, 10, 10], "_": [0, 0, 0, 0, 0, 0, 31], "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8], "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31], "3": [31, 2, 4, 2, 1, 17, 14], "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14], "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12], A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
};

function drawBitmapText(buf, w, h, text, x0, y0, rgb, scale = 1) {
  let cx = x0;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT_5X7[ch] ?? FONT_5X7[" "];
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        if ((glyph[r] & (1 << (4 - c))) === 0) continue;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const px = cx + c * scale + sx;
            const py = y0 + r * scale + sy;
            if (px < 0 || px >= w || py < 0 || py >= h) continue;
            const i = (py * w + px) * 4;
            buf[i] = rgb[0];
            buf[i + 1] = rgb[1];
            buf[i + 2] = rgb[2];
            buf[i + 3] = 255;
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

function fillSheetRect(buf, w, h, x0, y0, rw, rh, rgb) {
  for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x += 1) {
      const i = (y * w + x) * 4;
      buf[i] = rgb[0];
      buf[i + 1] = rgb[1];
      buf[i + 2] = rgb[2];
      buf[i + 3] = 255;
    }
  }
}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function pngChunk(type, payload) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(payload.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), payload]);
  let crc = 0xffffffff;
  for (let i = 0; i < body.length; i += 1) crc = CRC32_TABLE[(crc ^ body[i]) & 0xff] ^ (crc >>> 8);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([lenBuf, body, crcBuf]);
}

export function encodeRgbaToPng(rgba, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (rowBytes + 1)] = 0;
    raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function buildContactSheet(tiles, { cols, rows, tileW, tileH, title }) {
  const headerH = 30;
  const labelH = 18;
  const gap = 8;
  const pad = 12;
  const cellW = tileW + 2;
  const cellH = tileH + labelH + 2;
  const sw = pad * 2 + cols * cellW + (cols - 1) * gap;
  const sh = pad * 2 + headerH + rows * cellH + (rows - 1) * gap;
  const buf = new Uint8ClampedArray(sw * sh * 4);
  fillSheetRect(buf, sw, sh, 0, 0, sw, sh, [242, 239, 234]);
  drawBitmapText(buf, sw, sh, title, pad, pad + 6, [32, 34, 42], 2);

  for (let idx = 0; idx < tiles.length; idx += 1) {
    const ox = pad + (idx % cols) * (cellW + gap);
    const oy = pad + headerH + Math.floor(idx / cols) * (cellH + gap);
    fillSheetRect(buf, sw, sh, ox, oy, cellW, cellH, [202, 198, 190]);
    fillSheetRect(buf, sw, sh, ox + 1, oy + 1, tileW, tileH + labelH, [252, 250, 246]);
    const tile = tiles[idx].rgba;
    for (let y = 0; y < tileH; y += 1) {
      for (let x = 0; x < tileW; x += 1) {
        const si = (y * tileW + x) * 4;
        const di = ((oy + 1 + y) * sw + ox + 1 + x) * 4;
        const a = tile[si + 3] / 255;
        const bg = (((x >> 2) + (y >> 2)) & 1) === 0 ? 236 : 196;
        buf[di] = a >= 0.999 ? tile[si] : clampByte(tile[si] * a + bg * (1 - a));
        buf[di + 1] = a >= 0.999 ? tile[si + 1] : clampByte(tile[si + 1] * a + bg * (1 - a));
        buf[di + 2] = a >= 0.999 ? tile[si + 2] : clampByte(tile[si + 2] * a + bg * (1 - a));
        buf[di + 3] = 255;
      }
    }
    drawBitmapText(buf, sw, sh, tiles[idx].label.slice(0, Math.floor((tileW - 4) / 6)), ox + 4, oy + tileH + 6, [36, 38, 46], 1);
  }
  return { rgba: buf, width: sw, height: sh };
}

export async function runBrushFilterVisualAudit(options = {}) {
  const rootDir = options.rootDir ?? REPO_ROOT;
  const brushWidth = options.brushWidth ?? 180;
  const brushHeight = options.brushHeight ?? 54;
  const filterWidth = options.filterWidth ?? 120;
  const filterHeight = options.filterHeight ?? 80;
  const brushRmseThreshold = options.brushRmseThreshold ?? 0.035;
  const filterRmseThreshold = options.filterRmseThreshold ?? 0.035;
  const sameInkRmseThreshold = options.sameInkRmseThreshold ?? 0.035;
  const filterSeed = options.filterSeed ?? 1337;

  const { brushCatalog, brushRenderer, filterCatalog, filterEngine } = await loadDomainModules(rootDir);
  const lightBlank = createSoftwareCanvas2D(brushWidth, brushHeight, LIGHT_PAPER_RGB).data;
  const darkBlank = createSoftwareCanvas2D(brushWidth, brushHeight, DARK_PAPER_RGB).data;

  const brushItems = brushCatalog.GLOBAL_MASTER_BRUSH_CATALOG.map((preset, i) => {
    const isDark = preset.category === "light-fx-glitter";
    const bgRgb = isDark ? DARK_PAPER_RGB : LIGHT_PAPER_RGB;
    const s1 = createSoftwareCanvas2D(brushWidth, brushHeight, bgRgb);
    const info = brushRenderer.renderMasterBrushStrokeSample(s1.ctx, preset, brushWidth, brushHeight, { darkPaper: isDark, clearCanvas: true });
    const s2 = createSoftwareCanvas2D(brushWidth, brushHeight, bgRgb);
    brushRenderer.renderMasterBrushStrokeSample(s2.ctx, preset, brushWidth, brushHeight, {
      darkPaper: isDark,
      clearCanvas: true,
      inkRgb: isDark ? UNIFIED_DARK_INK : UNIFIED_LIGHT_INK,
    });
    return {
      index: i + 1,
      id: preset.id,
      nameEn: preset.nameEn,
      category: preset.category,
      tipShape: preset.tipProfile.shape,
      dabCount: info.dabCount,
      energy: round4(computeNormalizedRgbaRmse(s1.data, isDark ? darkBlank : lightBlank, false)),
      rgba: s1.data,
      sameInkRgba: s2.data,
      feat: buildFeatureVector(s1.data, brushWidth, brushHeight, false),
      sameInkFeat: buildFeatureVector(s2.data, brushWidth, brushHeight, false),
    };
  });

  const brushSum = summarizePairs(brushItems, brushRmseThreshold, {
    includeAlpha: false,
    pairExtra: (a, b) => ({
      sameInkRmse: round4(computeNormalizedRgbaRmse(a.sameInkRgba, b.sameInkRgba, false)),
      sameInkStructDist: round4(computeStructuralDist(a.sameInkFeat.spatial, b.sameInkFeat.spatial)),
    }),
  });
  const closestSameInk = brushSum.allPairs.slice().sort((x, y) => x.sameInkRmse - y.sameInkRmse);
  const sameInkViolations = closestSameInk.filter((p) => p.sameInkRmse < sameInkRmseThreshold);
  const weakBrushes = brushItems.filter((b) => b.energy < brushRmseThreshold).map((b) => ({ id: b.id, category: b.category, energy: b.energy }));

  const sourceArtwork = filterEngine.createMasterFilterPreviewArtwork(filterWidth, filterHeight);
  const filterItems = filterCatalog.MASTER_FILTER_LUT_CATALOG.map((spec, i) => {
    const rgba = filterEngine.applyMasterFilterToRgba(sourceArtwork, filterWidth, filterHeight, spec.id, { intensity: 1, seed: filterSeed });
    const diff = filterEngine.measureRgbaFilterDiff(sourceArtwork, rgba);
    return {
      index: i + 1,
      id: spec.id,
      nameEn: spec.nameEn,
      category: spec.category,
      modifiesAlpha: spec.modifiesAlpha,
      rmseVsOriginal: round4(computeNormalizedRgbaRmse(sourceArtwork, rgba, true)),
      meanChannelDelta: round4(diff.meanChannelDelta),
      changedPixelRatio: round4(diff.changedPixelRatio),
      rgba,
      feat: buildFeatureVector(rgba, filterWidth, filterHeight, true),
    };
  });

  const filterSum = summarizePairs(filterItems, filterRmseThreshold, { includeAlpha: true });
  const weakFilters = filterItems.filter((f) => f.rmseVsOriginal < filterRmseThreshold).map((f) => ({ id: f.id, category: f.category, rmseVsOriginal: f.rmseVsOriginal }));

  const renderedSheets = [];
  if (options.renderSheetsDir) {
    const outDir = path.resolve(options.renderSheetsDir);
    fs.mkdirSync(outDir, { recursive: true });
    const writeSheet = (name, sheet) => {
      const target = path.join(outDir, name);
      fs.writeFileSync(target, encodeRgbaToPng(sheet.rgba, sheet.width, sheet.height));
      renderedSheets.push(target);
    };
    writeSheet("global-master-brushes-60-sheet.png", buildContactSheet(brushItems.map((b) => ({ rgba: b.rgba, label: `${String(b.index).padStart(2, "0")} ${b.nameEn}` })), { cols: 5, rows: 12, tileW: brushWidth, tileH: brushHeight, title: "GLOBAL MASTER BRUSHES 60 (12X5) - DEFAULT INK" }));
    writeSheet("global-master-brushes-60-same-ink-sheet.png", buildContactSheet(brushItems.map((b) => ({ rgba: b.sameInkRgba, label: `${String(b.index).padStart(2, "0")} ${b.tipShape}` })), { cols: 5, rows: 12, tileW: brushWidth, tileH: brushHeight, title: "GLOBAL MASTER BRUSHES 60 - UNIFIED INK GEOMETRY" }));
    writeSheet("master-filters-36-sheet.png", buildContactSheet(filterItems.map((f) => ({ rgba: f.rgba, label: `${String(f.index).padStart(2, "0")} ${f.nameEn}` })), { cols: 6, rows: 6, tileW: filterWidth, tileH: filterHeight, title: "MASTER RGBA FILTERS 36 (6X6, INTENSITY 100%)" }));
  }

  const brushReport = { ...brushSum };
  delete brushReport.allPairs;
  const filterReport = { ...filterSum };
  delete filterReport.allPairs;
  const passed = brushSum.violationCount === 0 && sameInkViolations.length === 0 && weakBrushes.length === 0 && filterSum.violationCount === 0 && weakFilters.length === 0;

  return {
    passed,
    renderedSheets,
    brushes: {
      count: brushItems.length,
      canvasSize: { width: brushWidth, height: brushHeight },
      ...brushReport,
      sameInkThreshold: sameInkRmseThreshold,
      sameInkViolationCount: sameInkViolations.length,
      weakItemCount: weakBrushes.length,
      minSameInkRmse: closestSameInk[0]?.sameInkRmse ?? 0,
      meanSameInkRmse: round4(closestSameInk.reduce((s, p) => s + p.sameInkRmse, 0) / Math.max(1, closestSameInk.length)),
      closestSameInkPairs: closestSameInk.slice(0, 15),
      weakItems: weakBrushes,
      sameInkViolations,
    },
    filters: {
      count: filterItems.length,
      canvasSize: { width: filterWidth, height: filterHeight },
      ...filterReport,
      weakItemCount: weakFilters.length,
      minVsOriginalRmse: round4(Math.min(...filterItems.map((f) => f.rmseVsOriginal))),
      meanVsOriginalRmse: round4(filterItems.reduce((s, f) => s + f.rmseVsOriginal, 0) / Math.max(1, filterItems.length)),
      weakItems: weakFilters,
    },
  };
}

export function parseCliArgs(argv) {
  const opts = { check: false, help: false, renderSheetsDir: null, brushRmseThreshold: 0.035, filterRmseThreshold: 0.035, sameInkRmseThreshold: 0.035 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error(`${arg} 옵션에는 값이 필요합니다.`);
      i += 1;
      return val;
    };
    if (arg === "--check") opts.check = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--render-sheets") opts.renderSheetsDir = take();
    else if (arg === "--brush-rmse-threshold") opts.brushRmseThreshold = Number(take());
    else if (arg === "--filter-rmse-threshold") opts.filterRmseThreshold = Number(take());
    else if (arg === "--same-ink-rmse-threshold") opts.sameInkRmseThreshold = Number(take());
    else throw new Error(`알 수 없는 인자입니다: ${arg}`);
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const cli = parseCliArgs(process.argv.slice(2));
    if (cli.help) {
      console.log("사용법: node scripts/audit-brush-filter-visual-uniqueness.mjs [--render-sheets <dir>] [--check] [--brush-rmse-threshold <num>] [--same-ink-rmse-threshold <num>] [--filter-rmse-threshold <num>]");
      process.exit(0);
    }
    const report = await runBrushFilterVisualAudit(cli);
    console.log(JSON.stringify(report, null, 2));
    if (cli.check && !report.passed) {
      console.error(`[변별력 감사 실패] 브러시 위반 ${report.brushes.violationCount}건(동일잉크 ${report.brushes.sameInkViolationCount}건, 약한 브러시 ${report.brushes.weakItemCount}건), 필터 위반 ${report.filters.violationCount}건(약한 필터 ${report.filters.weakItemCount}건). 파라미터 보강 후 --check 재실행 필요.`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`[오류] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
