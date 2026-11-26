/**
 * Wave-3 Audio DSP · Vector Path 순수 TypeScript/JS 레퍼런스 및 자동 폴백 구현.
 */

import type {
  ResampleInterpolationName,
  StrokeJoinStyleName,
  Wave3BezierFlattenResult,
  Wave3BiquadEqOptions,
  Wave3BiquadEqResult,
  Wave3DynamicsOptions,
  Wave3HitTestResult,
  Wave3MixMasterResult,
  Wave3MixTrackParam,
  Wave3ResampleResult,
  Wave3ReverbOptions,
  Wave3ReverbResult,
  Wave3StrokeOutlineResult,
  WindingFillRuleName,
} from "./wave3-types";

const SILENCE_FLOOR = -120;
const fr = Math.fround;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function cubicHermite(xm1: number, x0: number, x1: number, x2: number, t: number): number {
  const c1 = 0.5 * (x1 - xm1);
  const c2 = xm1 - 2.5 * x0 + 2.0 * x1 - 0.5 * x2;
  const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
  return ((c3 * t + c2) * t + c1) * t + x0;
}

export function jsBiquadEqStereo(
  leftIn: Float32Array,
  rightIn: Float32Array,
  options: Wave3BiquadEqOptions,
): Wave3BiquadEqResult {
  const sr = options.sampleRate ?? 48_000;
  const q = options.q ?? 0.70710678;
  const gainDb = options.gainDb ?? 0;
  const w0 = (2 * Math.PI * options.freqHz) / sr;
  const cosW = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (options.kind === "lowpass") {
    const om = 1 - cosW;
    b0 = om * 0.5; b1 = om; b2 = om * 0.5; a0 = 1 + alpha; a1 = -2 * cosW; a2 = 1 - alpha;
  } else if (options.kind === "highpass") {
    const op = 1 + cosW;
    b0 = op * 0.5; b1 = -op; b2 = op * 0.5; a0 = 1 + alpha; a1 = -2 * cosW; a2 = 1 - alpha;
  } else {
    const amp = 10 ** (gainDb / 40);
    b0 = 1 + alpha * amp; b1 = -2 * cosW; b2 = 1 - alpha * amp;
    a0 = 1 + alpha / amp; a1 = -2 * cosW; a2 = 1 - alpha / amp;
  }
  const cb0 = fr(b0 / a0), cb1 = fr(b1 / a0), cb2 = fr(b2 / a0), ca1 = fr(a1 / a0), ca2 = fr(a2 / a0);
  const left = new Float32Array(leftIn);
  const right = new Float32Array(rightIn);
  const st = options.state ? new Float32Array(options.state) : new Float32Array(4);
  const runCh = (buf: Float32Array, zOff: number): void => {
    let z1 = st[zOff] ?? 0, z2 = st[zOff + 1] ?? 0;
    for (let i = 0; i < buf.length; i += 1) {
      const s = Number.isFinite(buf[i]) ? (buf[i] as number) : 0;
      const y = fr(cb0 * s + z1);
      z1 = fr(cb1 * s - ca1 * y + z2);
      z2 = fr(cb2 * s - ca2 * y);
      buf[i] = y;
    }
    st[zOff] = z1; st[zOff + 1] = z2;
  };
  runCh(left, 0);
  runCh(right, 2);
  return { left, right, nextState: st, frames: left.length, backend: "js-fallback" };
}

function jsKWeightFilter(sr: number) {
  const k1 = Math.tan((Math.PI * 1681.974450955533) / sr);
  const q1 = 0.7071752369554196;
  const vh = 10 ** (3.999843853973347 / 20);
  const vb = vh ** 0.4996667741545416;
  const inv1 = 1 / (1 + k1 / q1 + k1 * k1);
  const c1 = [
    fr((vh + (vb * k1) / q1 + k1 * k1) * inv1),
    fr(2 * (k1 * k1 - vh) * inv1),
    fr((vh - (vb * k1) / q1 + k1 * k1) * inv1),
    fr(2 * (k1 * k1 - 1) * inv1),
    fr((1 - k1 / q1 + k1 * k1) * inv1),
  ] as const;

  const k2 = Math.tan((Math.PI * 38.13547087602444) / sr);
  const q2 = 0.5003270373238773;
  const inv2 = 1 / (1 + k2 / q2 + k2 * k2);
  const c2 = [
    fr(inv2),
    fr(-2 * inv2),
    fr(inv2),
    fr(2 * (k2 * k2 - 1) * inv2),
    fr((1 - k2 / q2 + k2 * k2) * inv2),
  ] as const;
  return { c1, c2 };
}

export function jsMixAndMasterStereo(
  tracksPlanar: Float32Array,
  trackCount: number,
  frames: number,
  trackParams: readonly Wave3MixTrackParam[],
  dynamics: Wave3DynamicsOptions = {},
): Wave3MixMasterResult {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  let activeTracks = 0;
  for (let t = 0; t < trackCount; t += 1) {
    const p = trackParams[t];
    if (!p || p.mute || p.gain === 0) continue;
    activeTracks += 1;
    const angle = (p.pan + 1) * (Math.PI * 0.25);
    const gl = fr(p.gain * Math.cos(angle) * Math.SQRT2);
    const gr = fr(p.gain * Math.sin(angle) * Math.SQRT2);
    const base = t * frames;
    for (let i = 0; i < frames; i += 1) {
      const s = tracksPlanar[base + i] ?? 0;
      left[i] = (left[i] ?? 0) + s * gl;
      right[i] = (right[i] ?? 0) + s * gr;
    }
  }
  const sr = dynamics.sampleRate ?? 48_000;
  const thresh = dynamics.thresholdDb ?? -18;
  const ratio = dynamics.ratio ?? 4;
  const knee = dynamics.kneeDb ?? 6;
  const attackC = Math.exp(-1 / ((dynamics.attackMs ?? 5) * 0.001 * sr));
  const releaseC = Math.exp(-1 / ((dynamics.releaseMs ?? 80) * 0.001 * sr));
  const limRelease = Math.exp(-1 / (0.04 * sr));
  const makeup = 10 ** ((dynamics.makeupDb ?? 0) / 20);
  const ceiling = 10 ** ((dynamics.limiterCeilingDb ?? -1) / 20);
  const slope = 1 / ratio - 1;
  const halfKnee = knee * 0.5;

  let env = 0, limGain = 1, maxGrDb = 0;
  for (let i = 0; i < frames; i += 1) {
    const sl = left[i] ?? 0, srV = right[i] ?? 0;
    const det = Math.max(Math.abs(sl), Math.abs(srV));
    const c = det > env ? attackC : releaseC;
    env = c * env + (1 - c) * det;
    const over = (env <= 1e-6 ? SILENCE_FLOOR : 20 * Math.log10(env)) - thresh;
    let grDb = 0;
    if (halfKnee > 1e-4 && over > -halfKnee && over < halfKnee) grDb = (slope * (over + halfKnee) ** 2) / (2 * knee);
    else if (over > 0) grDb = slope * over;
    if (-grDb > maxGrDb) maxGrDb = -grDb;
    const g = 10 ** (grDb / 20) * makeup;
    const ol = sl * g, or = srV * g;
    const peak = Math.max(Math.abs(ol), Math.abs(or));
    const targetLim = peak > ceiling ? ceiling / peak : 1;
    limGain = targetLim < limGain ? targetLim : limRelease * limGain + (1 - limRelease) * targetLim;
    left[i] = clamp(ol * limGain, -ceiling, ceiling);
    right[i] = clamp(or * limGain, -ceiling, ceiling);
  }
  const { c1, c2 } = jsKWeightFilter(sr);
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
  const integratedLufs = meanSq > 1e-12 ? Math.max(SILENCE_FLOOR, -0.691 + 10 * Math.log10(meanSq)) : SILENCE_FLOOR;
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
  const truePeakDbfs = truePeakLinear > 1e-6 ? Math.max(SILENCE_FLOOR, 20 * Math.log10(truePeakLinear)) : SILENCE_FLOOR;
  return { left, right, frames, integratedLufs, truePeakLinear, truePeakDbfs, samplePeakLinear, maxGainReductionDb: maxGrDb, activeTracks, backend: "js-fallback" };
}

export function jsSchroederReverbStereo(
  inLeft: Float32Array,
  inRight: Float32Array,
  options: Wave3ReverbOptions = {},
): Wave3ReverbResult {
  const n = inLeft.length, sr = options.sampleRate ?? 48_000, scale = sr / 44_100;
  const sc = (base: number, extra: number) => Math.max(1, Math.round((base + extra) * scale));
  const makeComb = (len: number) => ({ buf: new Float32Array(len), idx: 0, store: 0 });
  const makeAp = (len: number) => ({ buf: new Float32Array(len), idx: 0 });
  const cL = [1116, 1188, 1277, 1356].map((b) => makeComb(sc(b, 0)));
  const cR = [1116, 1188, 1277, 1356].map((b) => makeComb(sc(b, 23)));
  const aL = [225, 556].map((b) => makeAp(sc(b, 0)));
  const aR = [225, 556].map((b) => makeAp(sc(b, 23)));
  const feedback = 0.7 + (options.roomSize ?? 0.65) * 0.28;
  const damp1 = (options.damping ?? 0.35) * 0.65, damp2 = 1 - damp1;
  const wet = options.wet ?? 0.3, dry = options.dry ?? 0.85;
  const outL = new Float32Array(n), outR = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const il = inLeft[i] ?? 0, ir = inRight[i] ?? 0, feed = (il + ir) * 0.125;
    let accL = 0, accR = 0;
    for (const c of cL) { const o = c.buf[c.idx] ?? 0; c.store = o * damp2 + c.store * damp1; c.buf[c.idx] = feed + c.store * feedback; c.idx = (c.idx + 1) % c.buf.length; accL += o; }
    for (const c of cR) { const o = c.buf[c.idx] ?? 0; c.store = o * damp2 + c.store * damp1; c.buf[c.idx] = feed + c.store * feedback; c.idx = (c.idx + 1) % c.buf.length; accR += o; }
    for (const a of aL) { const bo = a.buf[a.idx] ?? 0; a.buf[a.idx] = accL + bo * 0.5; a.idx = (a.idx + 1) % a.buf.length; accL = bo - accL; }
    for (const a of aR) { const bo = a.buf[a.idx] ?? 0; a.buf[a.idx] = accR + bo * 0.5; a.idx = (a.idx + 1) % a.buf.length; accR = bo - accR; }
    outL[i] = il * dry + accL * wet; outR[i] = ir * dry + accR * wet;
  }
  return { left: outL, right: outR, frames: n, backend: "js-fallback" };
}

export function jsResampleMono(
  input: Float32Array,
  outputFrames: number,
  rateRatio: number,
  mode: ResampleInterpolationName = "cubic-hermite",
): Wave3ResampleResult {
  const out = new Float32Array(outputFrames);
  if (input.length === 0 || outputFrames === 0) return { samples: out, outputFrames, backend: "js-fallback" };
  const last = input.length - 1;
  for (let i = 0; i < outputFrames; i += 1) {
    const pos = i * rateRatio, idx = Math.min(last, Math.floor(pos)), frac = clamp(pos - idx, 0, 1);
    const x0 = input[idx] ?? 0, x1 = input[Math.min(last, idx + 1)] ?? 0;
    out[i] = mode === "linear"
      ? x0 + (x1 - x0) * frac
      : cubicHermite(input[Math.max(0, idx - 1)] ?? 0, x0, x1, input[Math.min(last, idx + 2)] ?? 0, frac);
  }
  return { samples: out, outputFrames, backend: "js-fallback" };
}

export function jsSimplifyPolylineRdp(xy: Float32Array, epsilon: number): Float32Array {
  const n = xy.length >> 1;
  if (n <= 2 || epsilon <= 0) return new Float32Array(xy);
  const epsSq = epsilon * epsilon, keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const pair = stack.pop();
    if (!pair) break;
    const [start, end] = pair;
    if (end <= start + 1) continue;
    const ax = xy[start * 2] ?? 0, ay = xy[start * 2 + 1] ?? 0;
    const bx = xy[end * 2] ?? 0, by = xy[end * 2 + 1] ?? 0;
    const abx = bx - ax, aby = by - ay, abSq = abx * abx + aby * aby;
    let maxD2 = -1, split = start;
    for (let i = start + 1; i < end; i += 1) {
      const px = xy[i * 2] ?? 0, py = xy[i * 2 + 1] ?? 0;
      const t = abSq <= 1e-12 ? 0 : clamp(((px - ax) * abx + (py - ay) * aby) / abSq, 0, 1);
      const dx = px - (ax + t * abx), dy = py - (ay + t * aby), d2 = dx * dx + dy * dy;
      if (d2 > maxD2) { maxD2 = d2; split = i; }
    }
    if (maxD2 > epsSq && split > start && split < end) { keep[split] = 1; stack.push([start, split], [split, end]); }
  }
  const res: number[] = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) res.push(xy[i * 2] ?? 0, xy[i * 2 + 1] ?? 0);
  return new Float32Array(res);
}

export function jsSmoothPolylineChaikin(xy: Float32Array, iterations: number, closed = false, ratio = 0.25): Float32Array {
  let cur = new Float32Array(xy);
  const om = 1 - ratio;
  for (let it = 0; it < iterations; it += 1) {
    const n = cur.length >> 1;
    if (n < 2 || (closed && n < 3)) break;
    const segs = closed ? n : n - 1;
    const next = new Float32Array((closed ? segs * 2 : segs * 2 + 2) * 2);
    let w = 0;
    if (!closed) { next[w++] = cur[0] ?? 0; next[w++] = cur[1] ?? 0; }
    for (let i = 0; i < segs; i += 1) {
      const j = closed && i + 1 === n ? 0 : i + 1;
      const x0 = cur[i * 2] ?? 0, y0 = cur[i * 2 + 1] ?? 0, x1 = cur[j * 2] ?? 0, y1 = cur[j * 2 + 1] ?? 0;
      next[w++] = om * x0 + ratio * x1; next[w++] = om * y0 + ratio * y1;
      next[w++] = ratio * x0 + om * x1; next[w++] = ratio * y0 + om * y1;
    }
    if (!closed) { next[w++] = cur[(n - 1) * 2] ?? 0; next[w] = cur[(n - 1) * 2 + 1] ?? 0; }
    cur = next;
  }
  return cur;
}

export function jsFlattenCubicBezier(ctrlXy: Float32Array, tolerance: number): Wave3BezierFlattenResult {
  const flatLim = 16 * tolerance * tolerance;
  const pts: number[] = [ctrlXy[0] ?? 0, ctrlXy[1] ?? 0];
  const stack: Array<[number, number, number, number, number, number, number, number, number]> = [[
    ctrlXy[0] ?? 0, ctrlXy[1] ?? 0, ctrlXy[2] ?? 0, ctrlXy[3] ?? 0,
    ctrlXy[4] ?? 0, ctrlXy[5] ?? 0, ctrlXy[6] ?? 0, ctrlXy[7] ?? 0, 0,
  ]];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) break;
    const [ax, ay, bx, by, cx, cy, dx, dy, depth] = cur;
    const ux = 3 * bx - 2 * ax - dx, uy = 3 * by - 2 * ay - dy;
    const vx = 3 * cx - ax - 2 * dx, vy = 3 * cy - ay - 2 * dy;
    if (depth >= 12 || Math.max(ux * ux + uy * uy, vx * vx + vy * vy) <= flatLim) {
      pts.push(dx, dy);
    } else {
      const abx = 0.5 * (ax + bx), aby = 0.5 * (ay + by), bcx = 0.5 * (bx + cx), bcy = 0.5 * (by + cy);
      const cdx = 0.5 * (cx + dx), cdy = 0.5 * (cy + dy), abcx = 0.5 * (abx + bcx), abcy = 0.5 * (aby + bcy);
      const bcdx = 0.5 * (bcx + cdx), bcdy = 0.5 * (bcy + cdy), mx = 0.5 * (abcx + bcdx), my = 0.5 * (abcy + bcdy);
      stack.push([mx, my, bcdx, bcdy, cdx, cdy, dx, dy, depth + 1], [ax, ay, abx, aby, abcx, abcy, mx, my, depth + 1]);
    }
  }
  const n = pts.length >> 1, pointsXy = new Float32Array(pts), arcLengths = new Float32Array(n);
  let acc = 0;
  for (let i = 1; i < n; i += 1) {
    acc += Math.hypot((pointsXy[i * 2] ?? 0) - (pointsXy[(i - 1) * 2] ?? 0), (pointsXy[i * 2 + 1] ?? 0) - (pointsXy[(i - 1) * 2 + 1] ?? 0));
    arcLengths[i] = acc;
  }
  return { pointsXy, arcLengths, pointCount: n, totalLength: acc, backend: "js-fallback" };
}

export function jsExpandVariableWidthStroke(
  spineXyw: Float32Array,
  join: StrokeJoinStyleName = "miter",
  miterLimit = 4,
): Wave3StrokeOutlineResult {
  const spine: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < spineXyw.length; i += 3) {
    const x = spineXyw[i] ?? 0, y = spineXyw[i + 1] ?? 0, hw = spineXyw[i + 2] ?? 0;
    const prev = spine[spine.length - 1];
    if (prev && Math.hypot(x - prev[0], y - prev[1]) <= 1e-6) { prev[2] = Math.max(prev[2], hw); continue; }
    spine.push([x, y, hw]);
  }
  const n = spine.length;
  if (n < 2) return { polygonXy: new Float32Array(0), vertexCount: 0, backend: "js-fallback" };
  const norm = (dx: number, dy: number): [number, number] => { const l = Math.hypot(dx, dy); return l <= 1e-9 ? [0, 0] : [dx / l, dy / l]; };
  const segN: Array<[number, number]> = [];
  for (let i = 0; i < n - 1; i += 1) { const t = norm(spine[i + 1]![0] - spine[i]![0], spine[i + 1]![1] - spine[i]![1]); segN.push([-t[1], t[0]]); }
  const left: Array<[number, number]> = [[spine[0]![0] + segN[0]![0] * spine[0]![2], spine[0]![1] + segN[0]![1] * spine[0]![2]]];
  const right: Array<[number, number]> = [[spine[0]![0] - segN[0]![0] * spine[0]![2], spine[0]![1] - segN[0]![1] * spine[0]![2]]];
  for (let i = 1; i < n - 1; i += 1) {
    const [px, py, hw] = spine[i]!;
    const na = segN[i - 1]!, nb = segN[i]!, cross = na[0] * nb[1] - na[1] * nb[0];
    const bx = na[0] + nb[0], by = na[1] + nb[1], bl = Math.hypot(bx, by);
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
  const vc = left.length + right.length, polygonXy = new Float32Array(vc * 2);
  let k = 0;
  for (const p of left) { polygonXy[k++] = p[0]; polygonXy[k++] = p[1]; }
  for (let i = right.length - 1; i >= 0; i -= 1) { polygonXy[k++] = right[i]![0]; polygonXy[k++] = right[i]![1]; }
  return { polygonXy, vertexCount: vc, backend: "js-fallback" };
}

export function jsHitTestPolygonBatch(
  polyXy: Float32Array,
  queriesXy: Float32Array,
  rule: WindingFillRuleName = "nonzero",
): Wave3HitTestResult {
  const np = polyXy.length >> 1, nq = queriesXy.length >> 1, hits = new Uint8Array(nq);
  if (np < 3 || nq === 0) return { hits, hitCount: 0, backend: "js-fallback" };
  let hitCount = 0;
  for (let q = 0; q < nq; q += 1) {
    const qx = queriesXy[q * 2] ?? 0, qy = queriesXy[q * 2 + 1] ?? 0;
    let wn = 0;
    for (let i = 0; i < np; i += 1) {
      const j = i + 1 === np ? 0 : i + 1;
      const ax = polyXy[i * 2] ?? 0, ay = polyXy[i * 2 + 1] ?? 0;
      const bx = polyXy[j * 2] ?? 0, by = polyXy[j * 2 + 1] ?? 0;
      const cross = (bx - ax) * (qy - ay) - (qx - ax) * (by - ay);
      if (ay <= qy) { if (by > qy && cross > 0) wn += 1; }
      else if (by <= qy && cross < 0) wn -= 1;
    }
    const inside = rule === "nonzero" ? wn !== 0 : (wn & 1) !== 0;
    hits[q] = inside ? 1 : 0;
    if (inside) hitCount += 1;
  }
  return { hits, hitCount, backend: "js-fallback" };
}
