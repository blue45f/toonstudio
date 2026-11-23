/**
 * 4종 WGSL 컴퓨트 셰이더와 바이트 동등한 결정론적 CPU/Canvas2D 폴백 커널.
 * - 다중 레이어 블렌드(Normal/Multiply/Screen/Overlay/Add) + 마스크
 * - 분리형 가우시안 블러 + 언샤프 마스크 + HSL 그레이딩 1패스 퓨전
 * - Bowyer-Watson 델라우니 삼각 분할 + 다중 핀 ARAP/MLS 강체 메쉬 워프·모핑
 * - 2.5D 임파스토 높이 버퍼 Sobel 3×3 법선 광원 셰이딩
 */

export type ZeroCopyBlendMode = "normal" | "multiply" | "screen" | "overlay" | "add";

export const BLEND_MODE_TO_CODE: Readonly<Record<ZeroCopyBlendMode, number>> = Object.freeze({
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  add: 4,
});

export interface MultiLayerBlendInput {
  readonly pixels: Uint8ClampedArray | Uint8Array;
  readonly blendMode: ZeroCopyBlendMode;
  readonly opacity: number;
  readonly mask?: Uint8ClampedArray | Uint8Array | null;
}

export interface SeparableFilterGraphConfig {
  readonly blurRadius: number;
  readonly sigma?: number;
  readonly unsharpAmount: number;
  readonly unsharpThreshold?: number;
  readonly hueShiftDeg: number;
  readonly saturationDelta: number;
  readonly lightnessDelta: number;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface ArapWarpPin {
  readonly restX: number;
  readonly restY: number;
  readonly targetX: number;
  readonly targetY: number;
}

export interface DelaunayTriangle {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

export interface ArapWarpResult {
  readonly pixels: Uint8ClampedArray;
  readonly restVertices: readonly Point2D[];
  readonly deformedVertices: readonly Point2D[];
  readonly triangles: readonly DelaunayTriangle[];
}

export interface ImpastoReliefConfig {
  readonly reliefScale: number;
  readonly ambient: number;
  readonly lightX: number;
  readonly lightY: number;
  readonly lightZ: number;
  readonly specularStrength: number;
  readonly shininess: number;
  readonly shadowStrength: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function toByte(v: number): number {
  return Math.round(clamp01(v) * 255);
}

function blendChannel(modeCode: number, d: number, s: number): number {
  if (modeCode === 1) return d * s;
  if (modeCode === 2) return 1 - (1 - d) * (1 - s);
  if (modeCode === 3) return d < 0.5 ? 2 * d * s : 1 - 2 * (1 - d) * (1 - s);
  if (modeCode === 4) return Math.min(d + s, 1);
  return s;
}

/** WGSL `WGSL_MULTI_LAYER_BLEND_SHADER`와 바이트 동등한 결정론적 CPU 다중 레이어 합성. */
export function compositeMultiLayerCpu(
  width: number,
  height: number,
  layers: readonly MultiLayerBlendInput[],
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const pixelCount = width * height;
  const target = out ?? new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    let ar = 0;
    let ag = 0;
    let ab = 0;
    let aa = 0;
    const p4 = i * 4;
    for (let li = 0; li < layers.length; li += 1) {
      const layer = layers[li];
      const sr = layer.pixels[p4] / 255;
      const sg = layer.pixels[p4 + 1] / 255;
      const sb = layer.pixels[p4 + 2] / 255;
      const maskV = layer.mask ? layer.mask[i] / 255 : 1;
      const sa = clamp01((layer.pixels[p4 + 3] / 255) * layer.opacity * maskV);
      if (sa <= 0) continue;
      const modeCode = BLEND_MODE_TO_CODE[layer.blendMode];
      const br = (1 - aa) * sr + aa * blendChannel(modeCode, ar, sr);
      const bg = (1 - aa) * sg + aa * blendChannel(modeCode, ag, sg);
      const bb = (1 - aa) * sb + aa * blendChannel(modeCode, ab, sb);
      const outA = sa + aa * (1 - sa);
      if (outA > 1e-6) {
        const df = aa * (1 - sa);
        ar = (sa * br + df * ar) / outA;
        ag = (sa * bg + df * ag) / outA;
        ab = (sa * bb + df * ab) / outA;
      } else {
        ar = 0;
        ag = 0;
        ab = 0;
      }
      aa = outA;
    }
    target[p4] = toByte(ar);
    target[p4 + 1] = toByte(ag);
    target[p4 + 2] = toByte(ab);
    target[p4 + 3] = toByte(aa);
  }
  return target;
}

export function buildGaussianKernel1D(radius: number, sigmaOverride?: number): Float32Array {
  const r = Math.max(0, Math.min(12, Math.floor(radius)));
  const kernel = new Float32Array(r * 2 + 1);
  if (r === 0) {
    kernel[0] = 1;
    return kernel;
  }
  const sigma = Math.max(0.4, sigmaOverride ?? r * 0.55);
  const twoSigmaSq = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -r; i <= r; i += 1) {
    const w = Math.exp(-(i * i) / twoSigmaSq);
    kernel[i + r] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return kernel;
}

function hueToRgb(p: number, q: number, tIn: number): number {
  let t = tIn;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 0.5) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function applyHslGradeRgb(
  r: number,
  g: number,
  b: number,
  hueDeg: number,
  satDelta: number,
  lightDelta: number,
): [number, number, number] {
  const cmax = Math.max(r, g, b);
  const cmin = Math.min(r, g, b);
  const delta = cmax - cmin;
  let l = 0.5 * (cmax + cmin);
  let h = 0;
  let s = 0;
  if (delta > 1e-6) {
    s = l < 0.5 ? delta / (cmax + cmin) : delta / (2 - cmax - cmin);
    if (cmax === r) h = (g - b) / delta + (g < b ? 6 : 0);
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
  }
  h = (((h + hueDeg / 360) % 1) + 1) % 1;
  s = clamp01(s + satDelta);
  l = clamp01(l + lightDelta);
  if (s <= 1e-6) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

/** WGSL `WGSL_SEPARABLE_FILTER_GRAPH_SHADER`와 바이트 동등한 분리형 블러+언샤프+HSL 퓨전 CPU 커널. */
export function applySeparableFilterGraphCpu(
  width: number,
  height: number,
  srcRgba: Uint8ClampedArray | Uint8Array,
  config: SeparableFilterGraphConfig,
  out?: Uint8ClampedArray,
  scratch?: Float32Array,
): Uint8ClampedArray {
  const r = Math.max(0, Math.min(12, Math.floor(config.blurRadius)));
  const kernel = buildGaussianKernel1D(r, config.sigma);
  const pixelCount = width * height;
  const horiz = scratch && scratch.length >= pixelCount * 4 ? scratch : new Float32Array(pixelCount * 4);
  const target = out ?? new Uint8ClampedArray(pixelCount * 4);
  const threshold = config.unsharpThreshold ?? 0;
  const useUnsharp = config.unsharpAmount > 0;

  for (let y = 0; y < height; y += 1) {
    const rowBase = y * width;
    for (let x = 0; x < width; x += 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let dx = -r; dx <= r; dx += 1) {
        const sx = Math.min(width - 1, Math.max(0, x + dx));
        const p4 = (rowBase + sx) * 4;
        const wt = kernel[dx + r];
        sr += (srcRgba[p4] / 255) * wt;
        sg += (srcRgba[p4 + 1] / 255) * wt;
        sb += (srcRgba[p4 + 2] / 255) * wt;
      }
      const d4 = (rowBase + x) * 4;
      horiz[d4] = sr;
      horiz[d4 + 1] = sg;
      horiz[d4 + 2] = sb;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let br = 0;
      let bg = 0;
      let bb = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const sy = Math.min(height - 1, Math.max(0, y + dy));
        const p4 = (sy * width + x) * 4;
        const wt = kernel[dy + r];
        br += horiz[p4] * wt;
        bg += horiz[p4 + 1] * wt;
        bb += horiz[p4 + 2] * wt;
      }
      const p4 = (y * width + x) * 4;
      let fr = br;
      let fg = bg;
      let fb = bb;
      if (useUnsharp) {
        const or = srcRgba[p4] / 255;
        const og = srcRgba[p4 + 1] / 255;
        const ob = srcRgba[p4 + 2] / 255;
        const dr = or - br;
        const dg = og - bg;
        const db = ob - bb;
        fr = clamp01(or + (Math.abs(dr) >= threshold ? dr * config.unsharpAmount : 0));
        fg = clamp01(og + (Math.abs(dg) >= threshold ? dg * config.unsharpAmount : 0));
        fb = clamp01(ob + (Math.abs(db) >= threshold ? db * config.unsharpAmount : 0));
      }
      const [gr, gg, gb] = applyHslGradeRgb(
        fr,
        fg,
        fb,
        config.hueShiftDeg,
        config.saturationDelta,
        config.lightnessDelta,
      );
      target[p4] = toByte(gr);
      target[p4 + 1] = toByte(gg);
      target[p4 + 2] = toByte(gb);
      target[p4 + 3] = srcRgba[p4 + 3];
    }
  }
  return target;
}

function inCircumcircle(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const bx = b.x - p.x;
  const by = b.y - p.y;
  const cx = c.x - p.x;
  const cy = c.y - p.y;
  const orient = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const det =
    (ax * ax + ay * ay) * (bx * cy - by * cx) -
    (bx * bx + by * by) * (ax * cy - ay * cx) +
    (cx * cx + cy * cy) * (ax * by - ay * bx);
  return orient >= 0 ? det > 1e-8 : det < -1e-8;
}

/** Bowyer-Watson 2D 델라우니 삼각 분할. */
export function computeDelaunayTriangulation(points: readonly Point2D[]): DelaunayTriangle[] {
  const n = points.length;
  if (n < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    if (points[i].x < minX) minX = points[i].x;
    if (points[i].y < minY) minY = points[i].y;
    if (points[i].x > maxX) maxX = points[i].x;
    if (points[i].y > maxY) maxY = points[i].y;
  }
  const dMax = Math.max(maxX - minX, maxY - minY, 1) * 4;
  const midX = 0.5 * (minX + maxX);
  const midY = 0.5 * (minY + maxY);
  const pts: Point2D[] = [
    ...points,
    { x: midX - dMax, y: midY - dMax },
    { x: midX + dMax, y: midY - dMax },
    { x: midX, y: midY + dMax },
  ];
  let tris: DelaunayTriangle[] = [{ a: n, b: n + 1, c: n + 2 }];

  for (let pi = 0; pi < n; pi += 1) {
    const p = pts[pi];
    const bad: DelaunayTriangle[] = [];
    const good: DelaunayTriangle[] = [];
    for (let ti = 0; ti < tris.length; ti += 1) {
      const t = tris[ti];
      if (inCircumcircle(p, pts[t.a], pts[t.b], pts[t.c])) bad.push(t);
      else good.push(t);
    }
    const edgeCount = new Map<string, [number, number, number]>();
    const addEdge = (u: number, v: number): void => {
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      const existing = edgeCount.get(key);
      if (existing) existing[2] += 1;
      else edgeCount.set(key, [u, v, 1]);
    };
    for (let bi = 0; bi < bad.length; bi += 1) {
      const t = bad[bi];
      addEdge(t.a, t.b);
      addEdge(t.b, t.c);
      addEdge(t.c, t.a);
    }
    for (const [u, v, count] of edgeCount.values()) {
      if (count === 1) good.push({ a: u, b: v, c: pi });
    }
    tris = good;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n);
}

/** 다중 핀 강체 MLS + ARAP 국소 회전 보존 변형 솔버. */
export function solveArapMlsMeshDeformation(
  restVertices: readonly Point2D[],
  pins: readonly ArapWarpPin[],
  morphT: number,
): Point2D[] {
  const t = clamp01(morphT);
  if (pins.length === 0 || t === 0) return restVertices.map((v) => ({ x: v.x, y: v.y }));
  const activePins = pins.map((pin) => ({
    rx: pin.restX,
    ry: pin.restY,
    tx: pin.restX + (pin.targetX - pin.restX) * t,
    ty: pin.restY + (pin.targetY - pin.restY) * t,
  }));
  return restVertices.map((v) => {
    let wSum = 0;
    let pStarX = 0;
    let pStarY = 0;
    let qStarX = 0;
    let qStarY = 0;
    const weights = new Float64Array(activePins.length);
    for (let i = 0; i < activePins.length; i += 1) {
      const dx = v.x - activePins[i].rx;
      const dy = v.y - activePins[i].ry;
      const distSq = dx * dx + dy * dy;
      if (distSq < 1e-6) return { x: activePins[i].tx, y: activePins[i].ty };
      const w = 1 / (distSq * distSq + 1e-6);
      weights[i] = w;
      wSum += w;
      pStarX += w * activePins[i].rx;
      pStarY += w * activePins[i].ry;
      qStarX += w * activePins[i].tx;
      qStarY += w * activePins[i].ty;
    }
    pStarX /= wSum;
    pStarY /= wSum;
    qStarX /= wSum;
    qStarY /= wSum;
    let aCos = 0;
    let aSin = 0;
    for (let i = 0; i < activePins.length; i += 1) {
      const phx = activePins[i].rx - pStarX;
      const phy = activePins[i].ry - pStarY;
      const qhx = activePins[i].tx - qStarX;
      const qhy = activePins[i].ty - qStarY;
      aCos += weights[i] * (phx * qhx + phy * qhy);
      aSin += weights[i] * (phx * qhy - phy * qhx);
    }
    const norm = Math.hypot(aCos, aSin);
    const cosR = norm > 1e-8 ? aCos / norm : 1;
    const sinR = norm > 1e-8 ? aSin / norm : 0;
    const vx = v.x - pStarX;
    const vy = v.y - pStarY;
    return { x: qStarX + vx * cosR - vy * sinR, y: qStarY + vx * sinR + vy * cosR };
  });
}

/** WGSL `WGSL_ARAP_MESH_WARP_SHADER`와 바이트 동등한 CPU 델라우니 ARAP/MLS 워프. */
export function warpImageArapMeshCpu(
  width: number,
  height: number,
  srcRgba: Uint8ClampedArray | Uint8Array,
  pins: readonly ArapWarpPin[],
  morphT: number,
  out?: Uint8ClampedArray,
): ArapWarpResult {
  const maxX = width - 1;
  const maxY = height - 1;
  const restVertices: Point2D[] = [
    { x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY },
    { x: maxX * 0.5, y: 0 }, { x: maxX, y: maxY * 0.5 }, { x: maxX * 0.5, y: maxY }, { x: 0, y: maxY * 0.5 },
    ...pins.map((pin) => ({ x: pin.restX, y: pin.restY })),
  ];
  const triangles = computeDelaunayTriangulation(restVertices);
  const deformedVertices = solveArapMlsMeshDeformation(restVertices, pins, morphT);
  const target = out ?? new Uint8ClampedArray(width * height * 4);
  target.fill(0);

  for (let ti = 0; ti < triangles.length; ti += 1) {
    const tri = triangles[ti];
    const d0 = deformedVertices[tri.a];
    const d1 = deformedVertices[tri.b];
    const d2 = deformedVertices[tri.c];
    const r0 = restVertices[tri.a];
    const r1 = restVertices[tri.b];
    const r2 = restVertices[tri.c];
    const v0x = d1.x - d0.x;
    const v0y = d1.y - d0.y;
    const v1x = d2.x - d0.x;
    const v1y = d2.y - d0.y;
    const denom = v0x * v1y - v1x * v0y;
    if (Math.abs(denom) < 1e-6) continue;
    const inv = 1 / denom;
    const minBx = Math.max(0, Math.floor(Math.min(d0.x, d1.x, d2.x)));
    const maxBx = Math.min(maxX, Math.ceil(Math.max(d0.x, d1.x, d2.x)));
    const minBy = Math.max(0, Math.floor(Math.min(d0.y, d1.y, d2.y)));
    const maxBy = Math.min(maxY, Math.ceil(Math.max(d0.y, d1.y, d2.y)));

    for (let y = minBy; y <= maxBy; y += 1) {
      for (let x = minBx; x <= maxBx; x += 1) {
        const v2x = x - d0.x;
        const v2y = y - d0.y;
        const w1 = (v2x * v1y - v1x * v2y) * inv;
        const w2 = (v0x * v2y - v2x * v0y) * inv;
        const w0 = 1 - w1 - w2;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const u = r0.x * w0 + r1.x * w1 + r2.x * w2;
        const v = r0.y * w0 + r1.y * w1 + r2.y * w2;
        if (u < 0 || v < 0 || u > maxX || v > maxY) continue;
        const x0 = Math.floor(u);
        const y0 = Math.floor(v);
        const x1 = Math.min(x0 + 1, maxX);
        const y1 = Math.min(y0 + 1, maxY);
        const fx = u - x0;
        const fy = v - y0;
        const i00 = (y0 * width + x0) * 4;
        const i10 = (y0 * width + x1) * 4;
        const i01 = (y1 * width + x0) * 4;
        const i11 = (y1 * width + x1) * 4;
        const dst4 = (y * width + x) * 4;
        for (let c = 0; c < 4; c += 1) {
          const top = srcRgba[i00 + c] * (1 - fx) + srcRgba[i10 + c] * fx;
          const bot = srcRgba[i01 + c] * (1 - fx) + srcRgba[i11 + c] * fx;
          target[dst4 + c] = Math.round(top * (1 - fy) + bot * fy);
        }
      }
    }
  }
  return { pixels: target, restVertices, deformedVertices, triangles };
}

/** WGSL `WGSL_IMPASTO_RELIEF_COMPOSITE_SHADER`와 바이트 동등한 2.5D Sobel 법선 광원 CPU 커널. */
export function applyImpastoReliefCpu(
  width: number,
  height: number,
  baseRgba: Uint8ClampedArray | Uint8Array,
  heightField: Float32Array,
  config: ImpastoReliefConfig,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const target = out ?? new Uint8ClampedArray(width * height * 4);
  const lLen = Math.hypot(config.lightX, config.lightY, config.lightZ) || 1;
  const lx = config.lightX / lLen;
  const ly = config.lightY / lLen;
  const lz = config.lightZ / lLen;
  const hLen = Math.hypot(lx, ly, lz + 1) || 1;
  const hnx = lx / hLen;
  const hny = ly / hLen;
  const hnz = (lz + 1) / hLen;
  const sampleH = (sx: number, sy: number): number => {
    const cx = sx < 0 ? 0 : sx >= width ? width - 1 : sx;
    const cy = sy < 0 ? 0 : sy >= height ? height - 1 : sy;
    return heightField[cy * width + cx];
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx =
        sampleH(x + 1, y - 1) + 2 * sampleH(x + 1, y) + sampleH(x + 1, y + 1) -
        (sampleH(x - 1, y - 1) + 2 * sampleH(x - 1, y) + sampleH(x - 1, y + 1));
      const gy =
        sampleH(x - 1, y + 1) + 2 * sampleH(x, y + 1) + sampleH(x + 1, y + 1) -
        (sampleH(x - 1, y - 1) + 2 * sampleH(x, y - 1) + sampleH(x + 1, y - 1));
      const mc = sampleH(x, y);
      const nxRaw = -gx * config.reliefScale;
      const nyRaw = -gy * config.reliefScale;
      const nLen = Math.hypot(nxRaw, nyRaw, 1);
      const nx = nxRaw / nLen;
      const ny = nyRaw / nLen;
      const nz = 1 / nLen;
      const ndotl = Math.max(nx * lx + ny * ly + nz * lz, 0);
      const ndoth = Math.max(nx * hnx + ny * hny + nz * hnz, 0);
      const spec = Math.pow(ndoth, config.shininess) * config.specularStrength * clamp01(mc);
      const troughShadow = 1 - config.shadowStrength * Math.max(0.5 - ndotl, 0);
      const diffuse = (config.ambient + (1 - config.ambient) * ndotl) * troughShadow;
      const p4 = (y * width + x) * 4;
      target[p4] = toByte((baseRgba[p4] / 255) * diffuse + spec);
      target[p4 + 1] = toByte((baseRgba[p4 + 1] / 255) * diffuse + spec);
      target[p4 + 2] = toByte((baseRgba[p4 + 2] / 255) * diffuse + spec);
      target[p4 + 3] = baseRgba[p4 + 3];
    }
  }
  return target;
}
