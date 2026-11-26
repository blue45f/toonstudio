/**
 * `@toonstudio/desktop-sync` Wave-3 네이티브/WASM64 커널 브리지 보조 모듈.
 * Audio DSP 믹싱 · 무한 벡터 외곽선 · 웹툰 스마트 슬라이서/64비트 FNV-1a 타일 중복제거 ·
 * 인쇄 CMYK(TAC) · Median-Cut 팔레트의 WASM C-ABI 실행기 및 0-diff JS 폴백을 제공한다.
 */

export const EXPECTED_WAVE3_CAPABILITIES = 0x0f;

export const NATIVE_WAVE3_REQUIRED_SYMBOLS = [
  "wasm_wave3_capabilities",
  "wasm_audio_mix_master_stereo",
  "wasm_vector_expand_stroke_outline",
  "wasm_webtoon_plan_smart_slices",
  "wasm_webtoon_dedup_tiles_fnv64",
  "wasm_color_rgba_to_cmyk_tac_batch",
  "wasm_color_extract_palette_median_cut",
] as const;

export type DesktopWave3BackendTier =
  | "native-dylib"
  | "wasm-relaxed-simd"
  | "wasm-simd128"
  | "wasm-scalar"
  | "js-fallback";

export interface DesktopAudioMixTrack {
  readonly gain: number;
  readonly pan: number;
  readonly mute?: boolean;
}

export interface DesktopAudioDynamicsOptions {
  readonly sampleRate?: number;
  readonly thresholdDb?: number;
  readonly ratio?: number;
  readonly kneeDb?: number;
  readonly attackMs?: number;
  readonly releaseMs?: number;
  readonly makeupDb?: number;
  readonly limiterCeilingDb?: number;
}

export interface DesktopAudioMixResult {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly frames: number;
  readonly integratedLufs: number;
  readonly truePeakLinear: number;
  readonly samplePeakLinear: number;
  readonly activeTracks: number;
  readonly backend: DesktopWave3BackendTier;
  readonly elapsedMs: number;
}

export interface DesktopVectorStrokeResult {
  readonly polygonXy: Float32Array;
  readonly vertexCount: number;
  readonly backend: DesktopWave3BackendTier;
  readonly elapsedMs: number;
}

export interface DesktopWebtoonSliceConfig {
  readonly targetHeight?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly searchWindow?: number;
  readonly inkL1Threshold?: number;
  readonly continuityWeight?: number;
}

export interface DesktopWebtoonSliceSpan {
  readonly startY: number;
  readonly endY: number;
  readonly height: number;
  readonly cutCost: number;
  readonly isCleanGutter: boolean;
}

export interface DesktopWebtoonSliceResult {
  readonly spans: readonly DesktopWebtoonSliceSpan[];
  readonly backend: DesktopWave3BackendTier;
  readonly elapsedMs: number;
}

export interface DesktopTileDedupResult {
  readonly tilesX: number;
  readonly tilesY: number;
  readonly totalTiles: number;
  readonly uniqueTiles: number;
  readonly duplicateTiles: number;
  readonly emptyTransparentTiles: number;
  readonly solidColorTiles: number;
  readonly contentTiles: number;
  readonly hashes64: readonly bigint[];
  readonly canonicalIndices: readonly number[];
  readonly backend: DesktopWave3BackendTier;
  readonly elapsedMs: number;
}

export interface DesktopCmykTacOptions {
  readonly gcrStrength?: number;
  readonly ucrStart?: number;
  readonly maxK?: number;
  readonly tacLimitPct?: number;
}

export interface DesktopCmykTacResult {
  readonly cmyk: Uint8Array;
  readonly pixelCount: number;
  readonly clampedPixels: number;
  readonly maxTacPct: number;
  readonly backend: DesktopWave3BackendTier;
  readonly elapsedMs: number;
}

export interface DesktopPaletteSwatch {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly count: number;
}

export interface DesktopPaletteResult {
  readonly swatches: readonly DesktopPaletteSwatch[];
  readonly backend: DesktopWave3BackendTier;
  readonly elapsedMs: number;
}

export interface RawWasmWave3Exports {
  readonly memory: { readonly buffer: ArrayBuffer };
  readonly wasm_alloc: (byteLen: number) => number;
  readonly wasm_free: (ptr: number, byteLen: number) => void;
  readonly wasm_wave3_capabilities: () => number;
  readonly wasm_audio_mix_master_stereo: (
    tr: number, tc: number, frames: number, tp: number, dp: number, ol: number, or: number, met: number,
  ) => number;
  readonly wasm_vector_expand_stroke_outline: (
    spine: number, pts: number, join: number, miter: number, outXy: number, cap: number,
  ) => number;
  readonly wasm_webtoon_plan_smart_slices: (
    rgba: number, w: number, h: number, params: number, out: number, cap: number,
  ) => number;
  readonly wasm_webtoon_dedup_tiles_fnv64: (
    rgba: number, w: number, h: number, tileSize: number, sum: number, ent: number, cap: number,
  ) => number;
  readonly wasm_color_rgba_to_cmyk_tac_batch: (
    src: number, dst: number, px: number, params: number, stats: number,
  ) => number;
  readonly wasm_color_extract_palette_median_cut: (
    src: number, px: number, maxC: number, alphaThr: number, outSw: number,
  ) => number;
}

export function isRawWasmWave3Exports(
  exp: Record<string, unknown>,
  memoryCtor: new (...args: never[]) => { readonly buffer: ArrayBuffer },
): exp is Record<string, unknown> & RawWasmWave3Exports {
  return (
    exp.memory instanceof memoryCtor &&
    typeof exp.wasm_alloc === "function" &&
    typeof exp.wasm_free === "function" &&
    NATIVE_WAVE3_REQUIRED_SYMBOLS.every((sym) => typeof exp[sym] === "function")
  );
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x00000100000001b3n;
const U64_MASK = 0xffffffffffffffffn;
const fr = Math.fround;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function fnv1a64(bytes: Uint8Array): bigint {
  let h = FNV64_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) h = ((h ^ BigInt(bytes[i] ?? 0)) * FNV64_PRIME) & U64_MASK;
  return h;
}

function cubicHermite(xm1: number, x0: number, x1: number, x2: number, t: number): number {
  const c1 = 0.5 * (x1 - xm1);
  const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
  const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
  return ((c3 * t + c2) * t + c1) * t + x0;
}

export function jsWave3AudioMixMaster(
  tracks: Float32Array,
  trackCount: number,
  frames: number,
  params: readonly DesktopAudioMixTrack[],
  dyn: DesktopAudioDynamicsOptions = {},
): Omit<DesktopAudioMixResult, "backend" | "elapsedMs"> {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  let activeTracks = 0;
  for (let t = 0; t < trackCount; t += 1) {
    const p = params[t];
    if (!p || p.mute || p.gain === 0) continue;
    activeTracks += 1;
    const ang = (p.pan + 1) * (Math.PI * 0.25);
    const gl = fr(p.gain * Math.cos(ang) * Math.SQRT2);
    const gr = fr(p.gain * Math.sin(ang) * Math.SQRT2);
    const base = t * frames;
    for (let i = 0; i < frames; i += 1) {
      const s = tracks[base + i] ?? 0;
      left[i] = (left[i] ?? 0) + s * gl;
      right[i] = (right[i] ?? 0) + s * gr;
    }
  }
  const sr = dyn.sampleRate ?? 48_000;
  const thresh = dyn.thresholdDb ?? -18;
  const ratio = dyn.ratio ?? 4;
  const knee = dyn.kneeDb ?? 6;
  const att = Math.exp(-1 / ((dyn.attackMs ?? 5) * 0.001 * sr));
  const rel = Math.exp(-1 / ((dyn.releaseMs ?? 80) * 0.001 * sr));
  const limRel = Math.exp(-1 / (0.04 * sr));
  const makeup = 10 ** ((dyn.makeupDb ?? 0) / 20);
  const ceiling = 10 ** ((dyn.limiterCeilingDb ?? -1) / 20);
  const slope = 1 / ratio - 1;
  const halfK = knee * 0.5;
  let env = 0;
  let limG = 1;
  for (let i = 0; i < frames; i += 1) {
    const sl = left[i] ?? 0;
    const srV = right[i] ?? 0;
    const det = Math.max(Math.abs(sl), Math.abs(srV));
    const c = det > env ? att : rel;
    env = c * env + (1 - c) * det;
    const over = (env <= 1e-6 ? -120 : 20 * Math.log10(env)) - thresh;
    let grDb = 0;
    if (halfK > 1e-4 && over > -halfK && over < halfK) grDb = (slope * (over + halfK) ** 2) / (2 * knee);
    else if (over > 0) grDb = slope * over;
    const g = 10 ** (grDb / 20) * makeup;
    const ol = sl * g;
    const or = srV * g;
    const pk = Math.max(Math.abs(ol), Math.abs(or));
    const tl = pk > ceiling ? ceiling / pk : 1;
    limG = tl < limG ? tl : limRel * limG + (1 - limRel) * tl;
    left[i] = clamp(ol * limG, -ceiling, ceiling);
    right[i] = clamp(or * limG, -ceiling, ceiling);
  }
  const k1 = Math.tan((Math.PI * 1681.974450955533) / sr);
  const vh = 10 ** (3.999843853973347 / 20);
  const vb = vh ** 0.4996667741545416;
  const q1 = 0.7071752369554196;
  const i1 = 1 / (1 + k1 / q1 + k1 * k1);
  const c1 = [fr((vh + (vb * k1) / q1 + k1 * k1) * i1), fr(2 * (k1 * k1 - vh) * i1), fr((vh - (vb * k1) / q1 + k1 * k1) * i1), fr(2 * (k1 * k1 - 1) * i1), fr((1 - k1 / q1 + k1 * k1) * i1)] as const;
  const k2 = Math.tan((Math.PI * 38.13547087602444) / sr);
  const q2 = 0.5003270373238773;
  const i2 = 1 / (1 + k2 / q2 + k2 * k2);
  const c2 = [fr(i2), fr(-2 * i2), fr(i2), fr(2 * (k2 * k2 - 1) * i2), fr((1 - k2 / q2 + k2 * k2) * i2)] as const;
  let lz1 = 0, lz2 = 0, lz3 = 0, lz4 = 0, rz1 = 0, rz2 = 0, rz3 = 0, rz4 = 0, energy = 0;
  for (let i = 0; i < frames; i += 1) {
    const xl = left[i] ?? 0, y1l = c1[0] * xl + lz1;
    lz1 = c1[1] * xl - c1[3] * y1l + lz2; lz2 = c1[2] * xl - c1[4] * y1l;
    const y2l = c2[0] * y1l + lz3; lz3 = c2[1] * y1l - c2[3] * y2l + lz4; lz4 = c2[2] * y1l - c2[4] * y2l;
    const xr = right[i] ?? 0, y1r = c1[0] * xr + rz1;
    rz1 = c1[1] * xr - c1[3] * y1r + rz2; rz2 = c1[2] * xr - c1[4] * y1r;
    const y2r = c2[0] * y1r + rz3; rz3 = c2[1] * y1r - c2[3] * y2r + rz4; rz4 = c2[2] * y1r - c2[4] * y2r;
    energy += y2l * y2l + y2r * y2r;
  }
  const meanSq = frames > 0 ? energy / frames : 0;
  const integratedLufs = meanSq > 1e-12 ? Math.max(-120, -0.691 + 10 * Math.log10(meanSq)) : -120;
  let samplePeakLinear = 0, truePeakLinear = 0;
  for (const ch of [left, right]) {
    for (let i = 0; i < frames; i += 1) {
      const x0 = ch[i] ?? 0, a0 = Math.abs(x0);
      if (a0 > samplePeakLinear) samplePeakLinear = a0;
      if (a0 > truePeakLinear) truePeakLinear = a0;
      if (i + 1 < frames) {
        const xm1 = i > 0 ? (ch[i - 1] ?? 0) : x0, x1 = ch[i + 1] ?? 0, x2 = i + 2 < frames ? (ch[i + 2] ?? 0) : x1;
        for (const t of [0.25, 0.5, 0.75]) {
          const p = Math.abs(cubicHermite(xm1, x0, x1, x2, t));
          if (p > truePeakLinear) truePeakLinear = p;
        }
      }
    }
  }
  return { left, right, frames, integratedLufs, truePeakLinear, samplePeakLinear, activeTracks };
}

export function jsWave3VectorExpandStroke(
  spineXyw: Float32Array,
  join: "bevel" | "miter" = "miter",
  miterLimit = 4,
): Omit<DesktopVectorStrokeResult, "backend" | "elapsedMs"> {
  const spine: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < spineXyw.length; i += 3) {
    const x = spineXyw[i] ?? 0, y = spineXyw[i + 1] ?? 0, hw = spineXyw[i + 2] ?? 0;
    const prev = spine[spine.length - 1];
    if (prev && Math.hypot(x - prev[0], y - prev[1]) <= 1e-6) { prev[2] = Math.max(prev[2], hw); continue; }
    spine.push([x, y, hw]);
  }
  const n = spine.length;
  if (n < 2) return { polygonXy: new Float32Array(0), vertexCount: 0 };
  const norm = (dx: number, dy: number): [number, number] => { const l = Math.hypot(dx, dy); return l <= 1e-9 ? [0, 0] : [dx / l, dy / l]; };
  const segN: Array<[number, number]> = [];
  for (let i = 0; i < n - 1; i += 1) { const t = norm(spine[i + 1]![0] - spine[i]![0], spine[i + 1]![1] - spine[i]![1]); segN.push([-t[1], t[0]]); }
  const left: Array<[number, number]> = [[spine[0]![0] + segN[0]![0] * spine[0]![2], spine[0]![1] + segN[0]![1] * spine[0]![2]]];
  const right: Array<[number, number]> = [[spine[0]![0] - segN[0]![0] * spine[0]![2], spine[0]![1] - segN[0]![1] * spine[0]![2]]];
  for (let i = 1; i < n - 1; i += 1) {
    const [px, py, hw] = spine[i]!;
    const na = segN[i - 1]!, nb = segN[i]!;
    const cross = na[0] * nb[1] - na[1] * nb[0], bx = na[0] + nb[0], by = na[1] + nb[1], bl = Math.hypot(bx, by);
    if (join === "miter" && bl > 1e-5) {
      const mnx = bx / bl, mny = by / bl, cosH = Math.abs(mnx * na[0] + mny * na[1]);
      const ms = cosH > 1e-4 ? 1 / cosH : miterLimit + 1;
      if (ms <= miterLimit) { left.push([px + mnx * hw * ms, py + mny * hw * ms]); right.push([px - mnx * hw * ms, py - mny * hw * ms]); continue; }
    }
    const avg = norm(bx, by);
    const ax = avg[0] === 0 && avg[1] === 0 ? nb[0] : avg[0], ay = avg[0] === 0 && avg[1] === 0 ? nb[1] : avg[1];
    if (cross < 0) { left.push([px + na[0] * hw, py + na[1] * hw], [px + nb[0] * hw, py + nb[1] * hw]); right.push([px - ax * hw, py - ay * hw]); }
    else if (cross > 0) { left.push([px + ax * hw, py + ay * hw]); right.push([px - na[0] * hw, py - na[1] * hw], [px - nb[0] * hw, py - nb[1] * hw]); }
    else { left.push([px + nb[0] * hw, py + nb[1] * hw]); right.push([px - nb[0] * hw, py - nb[1] * hw]); }
  }
  const nl = segN[n - 2]!, end = spine[n - 1]!;
  left.push([end[0] + nl[0] * end[2], end[1] + nl[1] * end[2]]);
  right.push([end[0] - nl[0] * end[2], end[1] - nl[1] * end[2]]);
  const vc = left.length + right.length;
  const polygonXy = new Float32Array(vc * 2);
  let k = 0;
  for (const p of left) { polygonXy[k++] = p[0]; polygonXy[k++] = p[1]; }
  for (let i = right.length - 1; i >= 0; i -= 1) { polygonXy[k++] = right[i]![0]; polygonXy[k++] = right[i]![1]; }
  return { polygonXy, vertexCount: vc };
}

export function jsWave3WebtoonSlice(
  rgba: Uint8Array,
  width: number,
  height: number,
  cfg: DesktopWebtoonSliceConfig = {},
): readonly DesktopWebtoonSliceSpan[] {
  const targetH = cfg.targetHeight ?? 1280, minH = cfg.minHeight ?? 640, maxH = cfg.maxHeight ?? 2000;
  const win = cfg.searchWindow ?? 240, inkThr = cfg.inkL1Threshold ?? 28, contW = cfg.continuityWeight ?? 4.0;
  if (height <= maxH) return [{ startY: 0, endY: height, height, cutCost: 0, isCleanGutter: true }];
  const rb = width * 4, invW = 1 / width;
  const energy = new Float32Array(height), inkCov = new Float32Array(height);
  const sMin = new Int32Array(height), sMax = new Int32Array(height), trans = new Uint32Array(height);
  for (let y = 0; y < height; y += 1) {
    const base = y * rb, endOff = base + (width - 1) * 4;
    const bg0 = ((rgba[base] ?? 0) + (rgba[endOff] ?? 0)) >> 1, bg1 = ((rgba[base + 1] ?? 0) + (rgba[endOff + 1] ?? 0)) >> 1;
    const bg2 = ((rgba[base + 2] ?? 0) + (rgba[endOff + 2] ?? 0)) >> 1, bg3 = ((rgba[base + 3] ?? 0) + (rgba[endOff + 3] ?? 0)) >> 1;
    let hg = 0, vg = 0, bd = 0, ink = 0, tr = 0, mn = width, mx = 0, prevInk = false;
    let prevL = 0.299 * (rgba[base] ?? 0) + 0.587 * (rgba[base + 1] ?? 0) + 0.114 * (rgba[base + 2] ?? 0);
    for (let x = 0; x < width; x += 1) {
      const o = base + x * 4, r = rgba[o] ?? 0, g = rgba[o + 1] ?? 0, b = rgba[o + 2] ?? 0, a = rgba[o + 3] ?? 0;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (x > 0) hg += Math.abs(l - prevL);
      if (y > 0) vg += Math.abs(l - (0.299 * (rgba[o - rb] ?? 0) + 0.587 * (rgba[o - rb + 1] ?? 0) + 0.114 * (rgba[o - rb + 2] ?? 0)));
      prevL = l;
      const d = Math.abs(r - bg0) + Math.abs(g - bg1) + Math.abs(b - bg2) + Math.abs(a - bg3);
      bd += d;
      const isInk = d > inkThr;
      if (isInk) { ink += 1; if (x < mn) mn = x; if (x > mx) mx = x; }
      if (x > 0 && isInk !== prevInk) tr += 1;
      prevInk = isInk;
    }
    energy[y] = ((hg * invW) / 255) * 0.5 + ((vg * invW) / 255) * 0.3 + ((bd * invW) / 1020) * 0.2;
    inkCov[y] = ink * invW; sMin[y] = mn; sMax[y] = mx; trans[y] = tr;
  }
  const cost = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    let pen = inkCov[y] ?? 0;
    if ((trans[y] ?? 0) >= 2) pen += 0.35 * Math.min(2, (trans[y] ?? 0) * 0.25) + 0.4 * (sMax[y]! > sMin[y]! ? (sMax[y]! - sMin[y]!) * invW : 0);
    if (y > 0 && y + 1 < height && sMin[y - 1]! < sMax[y - 1]! && sMin[y + 1]! < sMax[y + 1]!) {
      const ovL = Math.max(sMin[y - 1]!, sMin[y + 1]!), ovR = Math.min(sMax[y - 1]!, sMax[y + 1]!);
      if (ovR > ovL) pen += 0.75 * ((ovR - ovL) * invW) + 0.5 * ((inkCov[y - 1] ?? 0) + (inkCov[y + 1] ?? 0));
    }
    cost[y] = (energy[y] ?? 0) + contW * pen;
  }
  const spans: DesktopWebtoonSliceSpan[] = [];
  let cursor = 0;
  while (cursor < height) {
    if (height - cursor <= maxH) { spans.push({ startY: cursor, endY: height, height: height - cursor, cutCost: 0, isCleanGutter: true }); break; }
    const ideal = cursor + targetH;
    const lo = Math.min(height - 1, Math.max(cursor + minH, ideal - win));
    const hi = Math.min(height - 1, Math.min(cursor + maxH, ideal + win));
    let bestY = clamp(ideal, lo, hi), bestScore = Infinity, bestCost = Infinity;
    for (let y = lo; y <= hi; y += 1) {
      const local = 0.5 * (cost[y] ?? 0) + 0.25 * ((cost[Math.max(0, y - 1)] ?? 0) + (cost[Math.min(height - 1, y + 1)] ?? 0));
      const score = local + (Math.abs(y - ideal) / Math.max(1, win)) * 0.02;
      if (score < bestScore) { bestScore = score; bestCost = local; bestY = y; }
    }
    spans.push({ startY: cursor, endY: bestY, height: bestY - cursor, cutCost: bestCost, isCleanGutter: bestCost <= 0.015 && (inkCov[bestY] ?? 0) <= 0.002 });
    cursor = bestY;
  }
  return spans;
}

export function jsWave3DedupTilesFnv64(
  rgba: Uint8Array,
  width: number,
  height: number,
  tileSize: number,
): Omit<DesktopTileDedupResult, "backend" | "elapsedMs"> {
  const tilesX = Math.ceil(width / tileSize), tilesY = Math.ceil(height / tileSize), totalTiles = tilesX * tilesY;
  const buckets = new Map<string, Array<{ idx: number; bytes: Uint8Array }>>();
  const hashes64: bigint[] = [], canonicalIndices: number[] = [];
  let uniqueTiles = 0, duplicateTiles = 0, emptyTransparentTiles = 0, solidColorTiles = 0, contentTiles = 0;
  for (let ty = 0; ty < tilesY; ty += 1) {
    const y0 = ty * tileSize, th = Math.min(tileSize, height - y0);
    for (let tx = 0; tx < tilesX; tx += 1) {
      const x0 = tx * tileSize, tw = Math.min(tileSize, width - x0), idx = ty * tilesX + tx;
      const buf = new Uint8Array(tw * th * 4);
      const fo = (y0 * width + x0) * 4;
      const f0 = rgba[fo] ?? 0, f1 = rgba[fo + 1] ?? 0, f2 = rgba[fo + 2] ?? 0, f3 = rgba[fo + 3] ?? 0;
      let allTr = true, allSame = true;
      for (let dy = 0; dy < th; dy += 1) {
        const row = rgba.subarray(((y0 + dy) * width + x0) * 4, ((y0 + dy) * width + x0 + tw) * 4);
        buf.set(row, dy * tw * 4);
        if (allTr || allSame) for (let i = 0; i < row.length; i += 4) {
          if (row[i + 3] !== 0) allTr = false;
          if (row[i] !== f0 || row[i + 1] !== f1 || row[i + 2] !== f2 || row[i + 3] !== f3) allSame = false;
        }
      }
      if (allTr) emptyTransparentTiles += 1;
      else if (allSame) solidColorTiles += 1;
      else contentTiles += 1;
      const h = fnv1a64(buf);
      const key = `${tw}x${th}:${h.toString(16)}`;
      const list = buckets.get(key) ?? [];
      const found = list.find((s) => s.bytes.length === buf.length && s.bytes.every((v, k) => v === buf[k]));
      hashes64.push(h);
      if (found) { duplicateTiles += 1; canonicalIndices.push(found.idx); }
      else { uniqueTiles += 1; list.push({ idx, bytes: buf }); buckets.set(key, list); canonicalIndices.push(idx); }
    }
  }
  return { tilesX, tilesY, totalTiles, uniqueTiles, duplicateTiles, emptyTransparentTiles, solidColorTiles, contentTiles, hashes64, canonicalIndices };
}

export function jsWave3RgbaToCmykTac(rgba: Uint8Array, options: DesktopCmykTacOptions = {}): Omit<DesktopCmykTacResult, "backend" | "elapsedMs"> {
  const gcr = options.gcrStrength ?? 0.8, ucrStart = options.ucrStart ?? 0, maxK = options.maxK ?? 0.95;
  const tacMax = (options.tacLimitPct ?? 300) / 100, maxSum = Math.floor(tacMax * 255);
  const cmyk = new Uint8Array(rgba.length);
  let clampedPixels = 0, maxTacPct = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = (rgba[i + 3] ?? 0) / 255, inv = 1 - a;
    const c0 = clamp(1 - ((rgba[i] ?? 0) / 255 * a + inv), 0, 1);
    const m0 = clamp(1 - ((rgba[i + 1] ?? 0) / 255 * a + inv), 0, 1);
    const y0 = clamp(1 - ((rgba[i + 2] ?? 0) / 255 * a + inv), 0, 1);
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
    while (cu + mu + yu + ku > maxSum) {
      if (cu >= mu && cu >= yu && cu > 0) cu -= 1;
      else if (mu >= yu && mu > 0) mu -= 1;
      else if (yu > 0) yu -= 1;
      else break;
    }
    maxTacPct = Math.max(maxTacPct, ((cu + mu + yu + ku) / 255) * 100);
    cmyk[i] = cu; cmyk[i + 1] = mu; cmyk[i + 2] = yu; cmyk[i + 3] = ku;
  }
  return { cmyk, pixelCount: rgba.length >> 2, clampedPixels, maxTacPct };
}

export function jsWave3ExtractPalette(rgba: Uint8Array, maxColors = 16, alphaThreshold = 128): readonly DesktopPaletteSwatch[] {
  const counts = new Uint32Array(32768), rs = new Float64Array(32768), gs = new Float64Array(32768), bs = new Float64Array(32768);
  let vis = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < alphaThreshold) continue;
    const r = rgba[i] ?? 0, g = rgba[i + 1] ?? 0, b = rgba[i + 2] ?? 0;
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts[k] = (counts[k] ?? 0) + 1; rs[k] = (rs[k] ?? 0) + r; gs[k] = (gs[k] ?? 0) + g; bs[k] = (bs[k] ?? 0) + b; vis += 1;
  }
  if (vis === 0) return [];
  type Bin = { rq: number; gq: number; bq: number; count: number; r: number; g: number; b: number };
  const bins: Bin[] = [];
  for (let k = 0; k < 32768; k += 1) if ((counts[k] ?? 0) > 0) bins.push({ rq: (k >> 10) & 31, gq: (k >> 5) & 31, bq: k & 31, count: counts[k]!, r: rs[k]!, g: gs[k]!, b: bs[k]! });
  const box = (s: number, e: number) => {
    let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0, pop = 0;
    for (let i = s; i < e; i += 1) { const bn = bins[i]!; r0 = Math.min(r0, bn.rq); r1 = Math.max(r1, bn.rq); g0 = Math.min(g0, bn.gq); g1 = Math.max(g1, bn.gq); b0 = Math.min(b0, bn.bq); b1 = Math.max(b1, bn.bq); pop += bn.count; }
    const dr = r1 - r0, dg = g1 - g0, db = b1 - b0, ch = dr >= dg && dr >= db ? 0 : dg >= db ? 1 : 2, mr = Math.max(dr, dg, db);
    return { s, e, pop, ch, prio: e - s <= 1 || mr === 0 ? 0 : pop * (mr + 1) };
  };
  const boxes = [box(0, bins.length)];
  while (boxes.length < maxColors) {
    let bi = -1, bp = 0;
    for (let i = 0; i < boxes.length; i += 1) if (boxes[i]!.prio > bp) { bp = boxes[i]!.prio; bi = i; }
    if (bi < 0) break;
    const t = boxes.splice(bi, 1)[0]!;
    const sl = bins.slice(t.s, t.e).sort((a, b) => t.ch === 0 ? a.rq - b.rq || a.gq - b.gq || a.bq - b.bq : t.ch === 1 ? a.gq - b.gq || a.rq - b.rq || a.bq - b.bq : a.bq - b.bq || a.rq - b.rq || a.gq - b.gq);
    for (let i = 0; i < sl.length; i += 1) bins[t.s + i] = sl[i]!;
    const half = Math.floor(t.pop / 2);
    let acc = 0, sp = t.s + 1;
    for (let i = t.s; i < t.e - 1; i += 1) { acc += bins[i]!.count; sp = i + 1; if (acc >= half) break; }
    boxes.push(box(t.s, sp), box(sp, t.e));
  }
  return boxes.map((b) => {
    let pop = 0, rSum = 0, gSum = 0, bSum = 0;
    for (let i = b.s; i < b.e; i += 1) { const bn = bins[i]!; pop += bn.count; rSum += bn.r; gSum += bn.g; bSum += bn.b; }
    return { r: Math.min(255, Math.floor((rSum + Math.floor(pop / 2)) / pop)), g: Math.min(255, Math.floor((gSum + Math.floor(pop / 2)) / pop)), b: Math.min(255, Math.floor((bSum + Math.floor(pop / 2)) / pop)), count: pop };
  }).sort((a, b) => b.count - a.count || a.r - b.r || a.g - b.g || a.b - b.b);
}

/** Wave-3 WASM 선형 메모리 스코프 실행기(0-누수 보장). */
export function runWasmWave3Scope<T>(e: RawWasmWave3Exports, fn: (a: {
  u8: (b: Uint8Array) => number; f32: (b: Float32Array) => number;
  u8Zero: (n: number) => number; u32Zero: (n: number) => number; u64Zero: (n: number) => number; f32Zero: (n: number) => number;
}) => T): T {
  const allocs: Array<readonly [number, number]> = [];
  const alloc = (bytes: number): number => {
    if (bytes <= 0) return 0;
    const p = e.wasm_alloc(bytes) >>> 0;
    if (p === 0) throw new Error(`Wave-3 wasm_alloc failed (${bytes}B)`);
    allocs.push([p, bytes]);
    return p;
  };
  try {
    return fn({
      u8: (b) => { const p = alloc(b.byteLength); if (p) new Uint8Array(e.memory.buffer, p, b.byteLength).set(b); return p; },
      f32: (b) => { const p = alloc(b.byteLength); if (p) new Float32Array(e.memory.buffer, p, b.length).set(b); return p; },
      u8Zero: (n) => { const p = alloc(n); if (p) new Uint8Array(e.memory.buffer, p, n).fill(0); return p; },
      u32Zero: (n) => { const p = alloc(n * 4); if (p) new Uint32Array(e.memory.buffer, p, n).fill(0); return p; },
      u64Zero: (n) => { const p = alloc(n * 8); if (p) new BigUint64Array(e.memory.buffer, p, n).fill(0n); return p; },
      f32Zero: (n) => { const p = alloc(n * 4); if (p) new Float32Array(e.memory.buffer, p, n).fill(0); return p; },
    });
  } finally {
    for (let i = allocs.length - 1; i >= 0; i -= 1) e.wasm_free(allocs[i]![0], allocs[i]![1]);
  }
}
