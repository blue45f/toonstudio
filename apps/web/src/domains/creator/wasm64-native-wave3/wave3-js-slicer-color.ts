/**
 * Wave-3 웹툰 스마트 슬라이서·64비트 FNV-1a 타일 중복제거·Display-P3/CMYK-TAC/Median-Cut JS 레퍼런스.
 */

import type {
  TileClassName,
  Wave3CmykTacOptions,
  Wave3CmykTacResult,
  Wave3PaletteResult,
  Wave3PaletteSwatch,
  Wave3SliceConfig,
  Wave3SliceSpan,
  Wave3SmartSliceResult,
  Wave3TileDedupEntry,
  Wave3TileDedupResult,
} from "./wave3-types";

const FNV64_OFFSET = BigInt("0xcbf29ce484222325");
const FNV64_PRIME = BigInt("0x00000100000001b3");
const U64_MASK = BigInt("0xffffffffffffffff");
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function jsFnv1a64(bytes: Uint8Array): bigint {
  let h = FNV64_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) h = ((h ^ BigInt(bytes[i] ?? 0)) * FNV64_PRIME) & U64_MASK;
  return h;
}

export function jsPlanWebtoonSmartSlices(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  cfg: Wave3SliceConfig = {},
): Wave3SmartSliceResult {
  const targetH = cfg.targetHeight ?? 1280, minH = cfg.minHeight ?? 640, maxH = cfg.maxHeight ?? 2000;
  const win = cfg.searchWindow ?? 240, inkThr = cfg.inkL1Threshold ?? 28, contW = cfg.continuityWeight ?? 4.0;
  if (height <= maxH) return { spans: [{ startY: 0, endY: height, height, cutCost: 0, isCleanGutter: true }], backend: "js-fallback" };
  const rowBytes = width * 4, invW = 1 / width;
  const rowEnergy = new Float32Array(height), inkCov = new Float32Array(height);
  const sMin = new Int32Array(height), sMax = new Int32Array(height), trans = new Uint32Array(height);
  for (let y = 0; y < height; y += 1) {
    const rb = y * rowBytes, endO = rb + (width - 1) * 4;
    const bg0 = ((rgba[rb] ?? 0) + (rgba[endO] ?? 0)) >> 1, bg1 = ((rgba[rb + 1] ?? 0) + (rgba[endO + 1] ?? 0)) >> 1;
    const bg2 = ((rgba[rb + 2] ?? 0) + (rgba[endO + 2] ?? 0)) >> 1, bg3 = ((rgba[rb + 3] ?? 0) + (rgba[endO + 3] ?? 0)) >> 1;
    let hg = 0, vg = 0, bd = 0, ink = 0, tr = 0, minX = width, maxX = 0, prevInk = false;
    let prevL = 0.299 * (rgba[rb] ?? 0) + 0.587 * (rgba[rb + 1] ?? 0) + 0.114 * (rgba[rb + 2] ?? 0);
    for (let x = 0; x < width; x += 1) {
      const o = rb + x * 4, r = rgba[o] ?? 0, g = rgba[o + 1] ?? 0, b = rgba[o + 2] ?? 0, a = rgba[o + 3] ?? 0;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (x > 0) hg += Math.abs(luma - prevL);
      if (y > 0) vg += Math.abs(luma - (0.299 * (rgba[o - rowBytes] ?? 0) + 0.587 * (rgba[o - rowBytes + 1] ?? 0) + 0.114 * (rgba[o - rowBytes + 2] ?? 0)));
      prevL = luma;
      const dist = Math.abs(r - bg0) + Math.abs(g - bg1) + Math.abs(b - bg2) + Math.abs(a - bg3);
      bd += dist;
      const isInk = dist > inkThr;
      if (isInk) { ink += 1; if (x < minX) minX = x; if (x > maxX) maxX = x; }
      if (x > 0 && isInk !== prevInk) tr += 1;
      prevInk = isInk;
    }
    rowEnergy[y] = ((hg * invW) / 255) * 0.5 + ((vg * invW) / 255) * 0.3 + ((bd * invW) / 1020) * 0.2;
    inkCov[y] = ink * invW; sMin[y] = minX; sMax[y] = maxX; trans[y] = tr;
  }
  const combined = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    let pen = inkCov[y] ?? 0;
    if ((trans[y] ?? 0) >= 2) pen += 0.35 * Math.min(2, (trans[y] ?? 0) * 0.25) + 0.4 * (sMax[y]! > sMin[y]! ? (sMax[y]! - sMin[y]!) * invW : 0);
    if (y > 0 && y + 1 < height && sMin[y - 1]! < sMax[y - 1]! && sMin[y + 1]! < sMax[y + 1]!) {
      const ovL = Math.max(sMin[y - 1]!, sMin[y + 1]!), ovR = Math.min(sMax[y - 1]!, sMax[y + 1]!);
      if (ovR > ovL) pen += 0.75 * ((ovR - ovL) * invW) + 0.5 * ((inkCov[y - 1] ?? 0) + (inkCov[y + 1] ?? 0));
    }
    combined[y] = (rowEnergy[y] ?? 0) + contW * pen;
  }
  const spans: Wave3SliceSpan[] = [];
  let cursor = 0;
  while (cursor < height) {
    if (height - cursor <= maxH) { spans.push({ startY: cursor, endY: height, height: height - cursor, cutCost: 0, isCleanGutter: true }); break; }
    const ideal = cursor + targetH;
    const lo = Math.min(height - 1, Math.max(cursor + minH, ideal - win));
    const hi = Math.min(height - 1, Math.min(cursor + maxH, ideal + win));
    let bestY = clamp(ideal, lo, hi), bestScore = Infinity, bestCost = Infinity;
    for (let y = lo; y <= hi; y += 1) {
      const local = 0.5 * (combined[y] ?? 0) + 0.25 * ((combined[Math.max(0, y - 1)] ?? 0) + (combined[Math.min(height - 1, y + 1)] ?? 0));
      const score = local + (Math.abs(y - ideal) / Math.max(1, win)) * 0.02;
      if (score < bestScore) { bestScore = score; bestCost = local; bestY = y; }
    }
    spans.push({ startY: cursor, endY: bestY, height: bestY - cursor, cutCost: bestCost, isCleanGutter: bestCost <= 0.015 && (inkCov[bestY] ?? 0) <= 0.002 });
    cursor = bestY;
  }
  return { spans, backend: "js-fallback" };
}

export function jsDedupTilesFnv64(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  tileSize: number,
): Wave3TileDedupResult {
  const tilesX = Math.ceil(width / tileSize), tilesY = Math.ceil(height / tileSize), totalTiles = tilesX * tilesY;
  const buckets = new Map<string, Array<{ idx: number; bytes: Uint8Array }>>();
  const entries: Wave3TileDedupEntry[] = [];
  let uniqueTiles = 0, duplicateTiles = 0, emptyTransparentTiles = 0, solidColorTiles = 0, contentTiles = 0;
  for (let ty = 0; ty < tilesY; ty += 1) {
    const y0 = ty * tileSize, th = Math.min(tileSize, height - y0);
    for (let tx = 0; tx < tilesX; tx += 1) {
      const x0 = tx * tileSize, tw = Math.min(tileSize, width - x0), tileIndex = ty * tilesX + tx;
      const buf = new Uint8Array(tw * th * 4);
      const fOff = (y0 * width + x0) * 4;
      const f0 = rgba[fOff] ?? 0, f1 = rgba[fOff + 1] ?? 0, f2 = rgba[fOff + 2] ?? 0, f3 = rgba[fOff + 3] ?? 0;
      let allTrans = true, allSame = true;
      for (let dy = 0; dy < th; dy += 1) {
        const srcOff = ((y0 + dy) * width + x0) * 4;
        const row = rgba.subarray(srcOff, srcOff + tw * 4);
        buf.set(row, dy * tw * 4);
        if (allTrans || allSame) for (let i = 0; i < row.length; i += 4) {
          if (row[i + 3] !== 0) allTrans = false;
          if (row[i] !== f0 || row[i + 1] !== f1 || row[i + 2] !== f2 || row[i + 3] !== f3) allSame = false;
        }
      }
      let tileClass: TileClassName;
      if (allTrans) { tileClass = "empty-transparent"; emptyTransparentTiles += 1; }
      else if (allSame) { tileClass = "solid-color"; solidColorTiles += 1; }
      else { tileClass = "content"; contentTiles += 1; }
      const h64 = jsFnv1a64(buf), key = `${tw}x${th}:${h64.toString(16)}`;
      const list = buckets.get(key) ?? [];
      const found = list.find((s) => s.bytes.length === buf.length && s.bytes.every((v, idx) => v === buf[idx]));
      let canonicalTileIndex = tileIndex;
      if (found) { duplicateTiles += 1; canonicalTileIndex = found.idx; }
      else { uniqueTiles += 1; list.push({ idx: tileIndex, bytes: buf }); buckets.set(key, list); }
      entries.push({ tileIndex, fnv1a64: h64, canonicalTileIndex, tileClass, tileWidth: tw, tileHeight: th });
    }
  }
  return {
    tilesX, tilesY, totalTiles, uniqueTiles, duplicateTiles, emptyTransparentTiles, solidColorTiles,
    contentTiles, dedupRatio: totalTiles > 0 ? duplicateTiles / totalTiles : 0, entries, backend: "js-fallback",
  };
}

const srgbToLin = (c: number): number => { const v = clamp(c, 0, 1); return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const linToSrgb = (lin: number): number => { const c = clamp(lin, 0, 1); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };

export function jsSrgbToDisplayP3(rgba: Uint8Array | Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = srgbToLin((rgba[i] ?? 0) / 255), g = srgbToLin((rgba[i + 1] ?? 0) / 255), b = srgbToLin((rgba[i + 2] ?? 0) / 255);
    out[i] = linToSrgb(0.8224619687 * r + 0.1775380313 * g);
    out[i + 1] = linToSrgb(0.0331941989 * r + 0.9668058011 * g);
    out[i + 2] = linToSrgb(0.0170826307 * r + 0.0723974407 * g + 0.9105199286 * b);
    out[i + 3] = (rgba[i + 3] ?? 0) / 255;
  }
  return out;
}

export function jsDisplayP3ToSrgb(p3: Float32Array): Uint8Array {
  const out = new Uint8Array(p3.length);
  for (let i = 0; i < p3.length; i += 4) {
    const rp = srgbToLin(p3[i] ?? 0), gp = srgbToLin(p3[i + 1] ?? 0), bp = srgbToLin(p3[i + 2] ?? 0);
    out[i] = Math.round(clamp(linToSrgb(1.2249401763 * rp - 0.2249401763 * gp), 0, 1) * 255);
    out[i + 1] = Math.round(clamp(linToSrgb(-0.0420569547 * rp + 1.0420569547 * gp), 0, 1) * 255);
    out[i + 2] = Math.round(clamp(linToSrgb(-0.0196375546 * rp - 0.0786360456 * gp + 1.0982736002 * bp), 0, 1) * 255);
    out[i + 3] = Math.round(clamp(p3[i + 3] ?? 0, 0, 1) * 255);
  }
  return out;
}

export function jsRgbaToCmykTac(rgba: Uint8Array | Uint8ClampedArray, options: Wave3CmykTacOptions = {}): Wave3CmykTacResult {
  const gcr = options.gcrStrength ?? 0.8, ucrStart = options.ucrStart ?? 0, maxK = options.maxK ?? 0.95;
  const tacMax = (options.tacLimitPct ?? 300) / 100, maxU8Sum = Math.floor(tacMax * 255);
  const cmyk = new Uint8Array(rgba.length);
  let clampedPixels = 0, maxTacPct = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = (rgba[i + 3] ?? 0) / 255, invA = 1 - a;
    const c0 = clamp(1 - ((rgba[i] ?? 0) / 255 * a + invA), 0, 1);
    const m0 = clamp(1 - ((rgba[i + 1] ?? 0) / 255 * a + invA), 0, 1);
    const y0 = clamp(1 - ((rgba[i + 2] ?? 0) / 255 * a + invA), 0, 1);
    const kn = Math.min(c0, m0, y0);
    let k = clamp(kn <= ucrStart ? 0 : ((kn - ucrStart) / (1 - ucrStart)) * kn * gcr, 0, maxK);
    const den = 1 - k;
    let c = den > 1e-6 ? clamp((c0 - k) / den, 0, 1) : 0;
    let m = den > 1e-6 ? clamp((m0 - k) / den, 0, 1) : 0;
    let y = den > 1e-6 ? clamp((y0 - k) / den, 0, 1) : 0;
    if (c + m + y + k > tacMax) {
      clampedPixels += 1;
      if (k >= tacMax) { k = Math.min(1, tacMax); c = 0; m = 0; y = 0; }
      else { const cs = c + m + y; if (cs > 1e-9) { const sc = Math.min(1, Math.max(0, tacMax - k) / cs); c *= sc; m *= sc; y *= sc; } }
    }
    let cu = Math.round(clamp(c * 255, 0, 255)), mu = Math.round(clamp(m * 255, 0, 255));
    let yu = Math.round(clamp(y * 255, 0, 255));
    const ku = Math.round(clamp(k * 255, 0, 255));
    while (cu + mu + yu + ku > maxU8Sum) {
      if (cu >= mu && cu >= yu && cu > 0) cu -= 1;
      else if (mu >= yu && mu > 0) mu -= 1;
      else if (yu > 0) yu -= 1;
      else break;
    }
    maxTacPct = Math.max(maxTacPct, ((cu + mu + yu + ku) / 255) * 100);
    cmyk[i] = cu; cmyk[i + 1] = mu; cmyk[i + 2] = yu; cmyk[i + 3] = ku;
  }
  return { cmyk, pixelCount: rgba.length >> 2, clampedPixels, maxTacPct, backend: "js-fallback" };
}

export function jsExtractPaletteMedianCut(
  rgba: Uint8Array | Uint8ClampedArray,
  maxColors = 16,
  alphaThreshold = 128,
): Wave3PaletteResult {
  const counts = new Uint32Array(32768), rSums = new Float64Array(32768), gSums = new Float64Array(32768), bSums = new Float64Array(32768);
  let totalVisible = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < alphaThreshold) continue;
    const r = rgba[i] ?? 0, g = rgba[i + 1] ?? 0, b = rgba[i + 2] ?? 0;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts[key] = (counts[key] ?? 0) + 1; rSums[key] = (rSums[key] ?? 0) + r; gSums[key] = (gSums[key] ?? 0) + g; bSums[key] = (bSums[key] ?? 0) + b;
    totalVisible += 1;
  }
  if (totalVisible === 0) return { swatches: [], backend: "js-fallback" };
  type Bin = { rq: number; gq: number; bq: number; count: number; rs: number; gs: number; bs: number };
  const bins: Bin[] = [];
  for (let k = 0; k < 32768; k += 1) {
    const c = counts[k] ?? 0;
    if (c > 0) bins.push({ rq: (k >> 10) & 31, gq: (k >> 5) & 31, bq: k & 31, count: c, rs: rSums[k] ?? 0, gs: gSums[k] ?? 0, bs: bSums[k] ?? 0 });
  }
  const makeBox = (start: number, end: number) => {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0, pop = 0;
    for (let i = start; i < end; i += 1) {
      const b = bins[i]!;
      rMin = Math.min(rMin, b.rq); rMax = Math.max(rMax, b.rq); gMin = Math.min(gMin, b.gq); gMax = Math.max(gMax, b.gq);
      bMin = Math.min(bMin, b.bq); bMax = Math.max(bMax, b.bq); pop += b.count;
    }
    const dr = rMax - rMin, dg = gMax - gMin, db = bMax - bMin, ch = dr >= dg && dr >= db ? 0 : dg >= db ? 1 : 2, maxR = Math.max(dr, dg, db);
    return { start, end, pop, ch, prio: end - start <= 1 || maxR === 0 ? 0 : pop * (maxR + 1) };
  };
  const boxes = [makeBox(0, bins.length)];
  while (boxes.length < maxColors) {
    let bestIdx = -1, bestPrio = 0;
    for (let i = 0; i < boxes.length; i += 1) if (boxes[i]!.prio > bestPrio) { bestPrio = boxes[i]!.prio; bestIdx = i; }
    if (bestIdx < 0) break;
    const target = boxes.splice(bestIdx, 1)[0]!;
    const slice = bins.slice(target.start, target.end).sort((a, b) =>
      target.ch === 0 ? a.rq - b.rq || a.gq - b.gq || a.bq - b.bq
        : target.ch === 1 ? a.gq - b.gq || a.rq - b.rq || a.bq - b.bq
          : a.bq - b.bq || a.rq - b.rq || a.gq - b.gq);
    for (let i = 0; i < slice.length; i += 1) bins[target.start + i] = slice[i]!;
    const half = Math.floor(target.pop / 2);
    let acc = 0, split = target.start + 1;
    for (let i = target.start; i < target.end - 1; i += 1) { acc += bins[i]!.count; split = i + 1; if (acc >= half) break; }
    boxes.push(makeBox(target.start, split), makeBox(split, target.end));
  }
  const swatches: Wave3PaletteSwatch[] = boxes.map((b) => {
    let pop = 0, rs = 0, gs = 0, bs = 0;
    for (let i = b.start; i < b.end; i += 1) { const bn = bins[i]!; pop += bn.count; rs += bn.rs; gs += bn.gs; bs += bn.bs; }
    return {
      r: Math.min(255, Math.floor((rs + Math.floor(pop / 2)) / pop)),
      g: Math.min(255, Math.floor((gs + Math.floor(pop / 2)) / pop)),
      b: Math.min(255, Math.floor((bs + Math.floor(pop / 2)) / pop)),
      count: pop, coverage: pop / totalVisible,
    };
  }).sort((a, b) => b.count - a.count || a.r - b.r || a.g - b.g || a.b - b.b);
  return { swatches, backend: "js-fallback" };
}
