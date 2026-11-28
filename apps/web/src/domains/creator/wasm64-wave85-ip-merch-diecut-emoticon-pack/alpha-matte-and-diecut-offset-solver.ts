/**
 * Wave 85 — 캐릭터 알파 매트 분리, 정밀 2D Meijster EDT, 칼선(Die-Cut) 윤곽 추출 및 화이트 언더베이스 엔진.
 *
 * - `extractCharacterCutoutAlpha`: 사전 키잉 알파와 단색 배경 플러드필 키잉 지원 + 프린지 색 정화.
 * - `computeExactEuclideanDistanceField` / `computeExactSignedDistanceField`: Meijster 2-패스 정밀 2D EDT/SDF.
 * - `generateStickerDieCutContour`: 물리 여백(mm @ DPI) 확장 거리장 위 Marching Squares + Douglas-Peucker +
 *   Chaikin 라운딩으로 닫히고 자기교차 없는 플로터용 단일 칼선(`CutContour`)과 선택적 3.2mm 키링 홀 생성.
 * - `generateWhiteUnderbasePlate`: 투명 아크릴·홀로그램 스티커용 초크(inward erosion) 화이트 백킹 판 생성.
 */

export interface Point2D { readonly x: number; readonly y: number; }
export interface BoundingBox2D {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
  readonly width: number; readonly height: number;
}
export interface RgbaImageInput {
  readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray | Uint8Array;
}
export type CharacterCutoutMode = "auto" | "prekeyed-alpha" | "solid-bg-floodfill";
export interface CharacterCutoutOptions {
  readonly mode?: CharacterCutoutMode; readonly alphaThreshold?: number;
  readonly bgColorTolerance?: number; readonly minComponentPixels?: number;
}
export interface CharacterCutoutResult {
  readonly width: number; readonly height: number;
  readonly detectedMode: "prekeyed-alpha" | "solid-bg-floodfill";
  readonly backgroundColor: readonly [number, number, number] | null;
  readonly alphaMask: Uint8Array; readonly binaryMask: Uint8Array;
  readonly decontaminatedRgba: Uint8ClampedArray;
  readonly foregroundPixelCount: number; readonly fringePixelCount: number;
  readonly artworkBounds: BoundingBox2D | null;
}
export interface KeyringHoleGeometry {
  readonly cxPx: number; readonly cyPx: number; readonly radiusPx: number; readonly diameterMm: number;
  readonly outerLugRadiusPx: number; readonly wallThicknessMm: number; readonly clearanceToArtworkPx: number;
}
export interface DieCutContourOptions {
  readonly dpi?: number; readonly offsetMm?: number; readonly simplifyEpsilonPx?: number;
  readonly chaikinIterations?: number; readonly includeKeyringHole?: boolean;
  readonly keyringHoleDiameterMm?: number; readonly keyringWallThicknessMm?: number;
}
export interface DieCutContourResult {
  readonly closed: boolean; readonly selfIntersecting: boolean;
  readonly dpi: number; readonly offsetMm: number; readonly offsetPx: number;
  readonly points: readonly Point2D[]; readonly svgPathD: string; readonly boundsPx: BoundingBox2D;
  readonly areaPx2: number; readonly perimeterPx: number;
  readonly minClearanceToArtworkPx: number; readonly clearanceSafe: boolean;
  readonly keyringHole: KeyringHoleGeometry | null;
}
export interface WhiteUnderbaseOptions {
  readonly chokePx?: number; readonly chokeMm?: number;
  readonly dpi?: number; readonly whiteInkDensityPercent?: number;
}
export interface WhiteUnderbasePlateResult {
  readonly width: number; readonly height: number;
  readonly chokePx: number; readonly whiteInkDensityPercent: number;
  readonly underbaseMask: Uint8Array; readonly artworkPixelCount: number;
  readonly underbasePixelCount: number; readonly leakedOutsideArtworkPixels: number;
  readonly coverageRatio: number; readonly thinAreaWarning: boolean;
  readonly contours: readonly (readonly Point2D[])[]; readonly svgPathD: string;
}

export const MM_PER_INCH = 25.4;

export function mmToPx(mm: number, dpi: number): number {
  const safeDpi = Number.isFinite(dpi) && dpi > 0 ? dpi : 300;
  return ((Number.isFinite(mm) ? mm : 0) / MM_PER_INCH) * safeDpi;
}

export function pxToMm(px: number, dpi: number): number {
  const safeDpi = Number.isFinite(dpi) && dpi > 0 ? dpi : 300;
  return ((Number.isFinite(px) ? px : 0) / safeDpi) * MM_PER_INCH;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function validateImageInput(input: RgbaImageInput): void {
  if (!Number.isInteger(input.width) || input.width < 1 || !Number.isInteger(input.height) || input.height < 1) {
    throw new Error(`유효하지 않은 이미지 크기입니다: ${String(input.width)}x${String(input.height)}`);
  }
  if (input.rgba.length !== input.width * input.height * 4) {
    throw new Error(`RGBA 버퍼 길이(${input.rgba.length})가 크기(${input.width}x${input.height}x4)와 일치하지 않습니다.`);
  }
}

function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 255;
}

function rgbDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function collectBorderMetrics(
  w: number, h: number, rgba: Uint8ClampedArray | Uint8Array, alphaThreshold: number,
): { transparentRatio: number; medianBg: readonly [number, number, number] } {
  const rs: number[] = []; const gs: number[] = []; const bs: number[] = [];
  let total = 0; let transparent = 0;
  const sample = (x: number, y: number): void => {
    const idx = (y * w + x) * 4;
    total += 1;
    if ((rgba[idx + 3] ?? 0) < alphaThreshold) transparent += 1;
    else { rs.push(rgba[idx] ?? 255); gs.push(rgba[idx + 1] ?? 255); bs.push(rgba[idx + 2] ?? 255); }
  };
  for (let x = 0; x < w; x += 1) { sample(x, 0); if (h > 1) sample(x, h - 1); }
  for (let y = 1; y < h - 1; y += 1) { sample(0, y); if (w > 1) sample(w - 1, y); }
  return { transparentRatio: total > 0 ? transparent / total : 0, medianBg: [computeMedian(rs), computeMedian(gs), computeMedian(bs)] };
}

function removeTinyForegroundSpeckles(
  binaryMask: Uint8Array, alphaMask: Uint8Array, w: number, h: number, minPixels: number,
): void {
  if (minPixels <= 1) return;
  const total = w * h;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const components: number[][] = [];
  let largest = 0;
  for (let i = 0; i < total; i += 1) {
    if (binaryMask[i] === 0 || visited[i] === 1) continue;
    let head = 0; let tail = 0;
    queue[tail++] = i; visited[i] = 1;
    const comp: number[] = [];
    while (head < tail) {
      const curr = queue[head++] ?? 0;
      comp.push(curr);
      const cx = curr % w; const cy = (curr - cx) / w;
      const push = (nx: number, ny: number): void => {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
        const ni = ny * w + nx;
        if (binaryMask[ni] === 1 && visited[ni] === 0) { visited[ni] = 1; queue[tail++] = ni; }
      };
      push(cx - 1, cy); push(cx + 1, cy); push(cx, cy - 1); push(cx, cy + 1);
    }
    if (comp.length > largest) largest = comp.length;
    components.push(comp);
  }
  if (largest < minPixels) return;
  for (const comp of components) {
    if (comp.length < minPixels) {
      for (const idx of comp) { binaryMask[idx] = 0; alphaMask[idx] = 0; }
    }
  }
}

/**
 * 패널 컷아웃 RGBA 이미지에서 캐릭터 알파 매트를 분리하고 경계 프린지 색 번짐을 정화한다.
 */
export function extractCharacterCutoutAlpha(
  input: RgbaImageInput, options: CharacterCutoutOptions = {},
): CharacterCutoutResult {
  validateImageInput(input);
  const { width, height, rgba } = input;
  const total = width * height;
  const alphaThreshold = Math.round(clamp(options.alphaThreshold ?? 24, 1, 254));
  const bgTol = clamp(options.bgColorTolerance ?? 28, 1, 220);
  const minComp = Math.max(1, Math.round(options.minComponentPixels ?? 4));

  const border = collectBorderMetrics(width, height, rgba, alphaThreshold);
  const reqMode = options.mode ?? "auto";
  const detectedMode: "prekeyed-alpha" | "solid-bg-floodfill" =
    reqMode === "auto" ? (border.transparentRatio >= 0.15 ? "prekeyed-alpha" : "solid-bg-floodfill") : reqMode;

  const alphaMask = new Uint8Array(total);
  const binaryMask = new Uint8Array(total);
  const decontaminatedRgba = new Uint8ClampedArray(rgba);
  let fringePixelCount = 0;
  let backgroundColor: readonly [number, number, number] | null = null;

  if (detectedMode === "prekeyed-alpha") {
    for (let i = 0; i < total; i += 1) {
      const a = rgba[i * 4 + 3] ?? 0;
      alphaMask[i] = a; binaryMask[i] = a >= alphaThreshold ? 1 : 0;
      if (a > 0 && a < 250) fringePixelCount += 1;
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x; const a = alphaMask[i] ?? 0;
        if (a <= 0 || a >= 245) continue;
        let sR = 0; let sG = 0; let sB = 0; let cnt = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx; const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const ni = ny * width + nx;
            if ((alphaMask[ni] ?? 0) >= 245) {
              sR += rgba[ni * 4] ?? 0; sG += rgba[ni * 4 + 1] ?? 0; sB += rgba[ni * 4 + 2] ?? 0; cnt += 1;
            }
          }
        }
        if (cnt > 0) {
          const blend = clamp(1 - a / 255, 0, 0.75); const p = i * 4;
          decontaminatedRgba[p] = Math.round((rgba[p] ?? 0) * (1 - blend) + (sR / cnt) * blend);
          decontaminatedRgba[p + 1] = Math.round((rgba[p + 1] ?? 0) * (1 - blend) + (sG / cnt) * blend);
          decontaminatedRgba[p + 2] = Math.round((rgba[p + 2] ?? 0) * (1 - blend) + (sB / cnt) * blend);
        }
      }
    }
  } else {
    const [bgR, bgG, bgB] = border.medianBg;
    backgroundColor = [bgR, bgG, bgB];
    const isBg = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0; let tail = 0;
    const trySeed = (x: number, y: number): void => {
      const idx = y * width + x;
      if (isBg[idx] === 1) return;
      const p = idx * 4;
      const d = rgbDist(rgba[p] ?? 0, rgba[p + 1] ?? 0, rgba[p + 2] ?? 0, bgR, bgG, bgB);
      if ((rgba[p + 3] ?? 0) < alphaThreshold || d <= bgTol) { isBg[idx] = 1; queue[tail++] = idx; }
    };
    for (let x = 0; x < width; x += 1) { trySeed(x, 0); if (height > 1) trySeed(x, height - 1); }
    for (let y = 1; y < height - 1; y += 1) { trySeed(0, y); if (width > 1) trySeed(width - 1, y); }
    while (head < tail) {
      const curr = queue[head++] ?? 0;
      const cx = curr % width; const cy = (curr - cx) / width;
      if (cx > 0) trySeed(cx - 1, cy);
      if (cx + 1 < width) trySeed(cx + 1, cy);
      if (cy > 0) trySeed(cx, cy - 1);
      if (cy + 1 < height) trySeed(cx, cy + 1);
    }

    const fringeUpper = bgTol * 3.5;
    const fringeLower = bgTol * 0.65;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x; const p = i * 4;
        if (isBg[i] === 1) { alphaMask[i] = 0; binaryMask[i] = 0; decontaminatedRgba[p + 3] = 0; continue; }
        let touchesBg = false;
        for (let dy = -1; dy <= 1 && !touchesBg; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx; const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && isBg[ny * width + nx] === 1) { touchesBg = true; break; }
          }
        }
        const r = rgba[p] ?? 0; const g = rgba[p + 1] ?? 0; const b = rgba[p + 2] ?? 0; const origA = rgba[p + 3] ?? 255;
        if (touchesBg) {
          const dist = rgbDist(r, g, b, bgR, bgG, bgB);
          if (dist < fringeUpper) {
            const frac = clamp((dist - fringeLower) / Math.max(1, fringeUpper - fringeLower), 0, 1);
            const newA = Math.round(origA * frac);
            const invA = Math.max(frac, 0.18);
            decontaminatedRgba[p] = Math.round(clamp((r - (1 - frac) * bgR) / invA, 0, 255));
            decontaminatedRgba[p + 1] = Math.round(clamp((g - (1 - frac) * bgG) / invA, 0, 255));
            decontaminatedRgba[p + 2] = Math.round(clamp((b - (1 - frac) * bgB) / invA, 0, 255));
            decontaminatedRgba[p + 3] = newA;
            alphaMask[i] = newA; binaryMask[i] = newA >= alphaThreshold ? 1 : 0;
            if (newA > 0 && newA < 250) fringePixelCount += 1;
            continue;
          }
        }
        alphaMask[i] = origA; binaryMask[i] = origA >= alphaThreshold ? 1 : 0; decontaminatedRgba[p + 3] = origA;
      }
    }
  }

  removeTinyForegroundSpeckles(binaryMask, alphaMask, width, height, minComp);

  let minX = width; let minY = height; let maxX = -1; let maxY = -1; let fgCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (binaryMask[y * width + x] === 1) {
        fgCount += 1;
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
  }
  const artworkBounds: BoundingBox2D | null = fgCount > 0
    ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;

  return {
    width, height, detectedMode, backgroundColor, alphaMask, binaryMask,
    decontaminatedRgba, foregroundPixelCount: fgCount, fringePixelCount, artworkBounds,
  };
}

/**
 * Meijster 2-패스 선형 시간 알고리즘으로 정밀 2D 유클리드 거리장(Exact EDT)을 계산한다.
 */
export function computeExactEuclideanDistanceField(
  binaryMask: Uint8Array, width: number, height: number, featureValue: 0 | 1 = 1,
): Float32Array {
  const total = width * height;
  const result = new Float32Array(total);
  const inf1d = width + height + 1;
  let hasFeature = false;
  for (let i = 0; i < total; i += 1) {
    if ((binaryMask[i] === 0 ? 0 : 1) === featureValue) { hasFeature = true; break; }
  }
  if (!hasFeature) { result.fill(inf1d); return result; }

  const g = new Int32Array(total);
  for (let x = 0; x < width; x += 1) {
    g[x] = (binaryMask[x] === 0 ? 0 : 1) === featureValue ? 0 : inf1d;
    for (let y = 1; y < height; y += 1) {
      const idx = y * width + x;
      g[idx] = (binaryMask[idx] === 0 ? 0 : 1) === featureValue ? 0 : (g[idx - width] ?? inf1d) + 1;
    }
    for (let y = height - 2; y >= 0; y -= 1) {
      const idx = y * width + x;
      const below = (g[idx + width] ?? inf1d) + 1;
      if (below < (g[idx] ?? inf1d)) g[idx] = below;
    }
  }

  const s = new Int32Array(width);
  const t = new Int32Array(width);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const f = (xp: number, i: number): number => {
      const dx = xp - i; const gi = g[row + i] ?? inf1d; return dx * dx + gi * gi;
    };
    const sep = (i: number, u: number): number => {
      const gi = g[row + i] ?? inf1d; const gu = g[row + u] ?? inf1d;
      return Math.floor((u * u - i * i + gu * gu - gi * gi) / (2 * (u - i)));
    };
    let q = 0; s[0] = 0; t[0] = 0;
    for (let u = 1; u < width; u += 1) {
      while (q >= 0 && f(t[q] ?? 0, s[q] ?? 0) > f(t[q] ?? 0, u)) q -= 1;
      if (q < 0) { q = 0; s[0] = u; t[0] = 0; }
      else {
        const wSep = 1 + sep(s[q] ?? 0, u);
        if (wSep < width) { q += 1; s[q] = u; t[q] = wSep; }
      }
    }
    for (let u = width - 1; u >= 0; u -= 1) {
      result[row + u] = Math.sqrt(f(u, s[q] ?? 0));
      if (u === (t[q] ?? -1)) q -= 1;
    }
  }
  return result;
}

/**
 * 캐릭터 전경 내부(-), 외부(+) 부호를 가지는 정밀 2D 부호 거리장(SDF)을 생성한다.
 */
export function computeExactSignedDistanceField(
  binaryMask: Uint8Array, width: number, height: number,
): Float32Array {
  const outDist = computeExactEuclideanDistanceField(binaryMask, width, height, 1);
  const inDist = computeExactEuclideanDistanceField(binaryMask, width, height, 0);
  const sdf = new Float32Array(width * height);
  for (let i = 0; i < sdf.length; i += 1) {
    sdf[i] = binaryMask[i] === 1 ? -(inDist[i] ?? 0) : (outDist[i] ?? 0);
  }
  return sdf;
}

// Marching Squares 에지 방향 표(0=Top, 1=Right, 2=Bottom, 3=Left). 내부(v <= iso)가 항상 진행 방향 오른쪽에 위치한다.
const MS_SIMPLE_TABLE: Readonly<Record<number, readonly [number, number]>> = {
  1: [3, 2], 2: [2, 1], 3: [3, 1], 4: [1, 0], 6: [2, 0], 7: [3, 0],
  8: [0, 3], 9: [0, 2], 11: [0, 1], 12: [1, 3], 13: [1, 2], 14: [2, 3],
};

function interpolateIso(ax: number, ay: number, va: number, bx: number, by: number, vb: number, iso: number): Point2D {
  const denom = vb - va;
  const frac = Math.abs(denom) < 1e-9 ? 0.5 : clamp((iso - va) / denom, 0.001, 0.999);
  return { x: ax + (bx - ax) * frac, y: ay + (by - ay) * frac };
}

function traceMarchingSquaresLoops(
  field: Float32Array, width: number, height: number, iso: number, offsetX: number, offsetY: number,
): Point2D[][] {
  const edges = new Map<string, { readonly toKey: string; readonly fromPt: Point2D }>();
  for (let y = 0; y < height - 1; y += 1) {
    const r0 = y * width; const r1 = (y + 1) * width;
    for (let x = 0; x < width - 1; x += 1) {
      const v0 = field[r0 + x] ?? 0; const v1 = field[r0 + x + 1] ?? 0;
      const v2 = field[r1 + x + 1] ?? 0; const v3 = field[r1 + x] ?? 0;
      const idx = (v0 <= iso ? 8 : 0) | (v1 <= iso ? 4 : 0) | (v2 <= iso ? 2 : 0) | (v3 <= iso ? 1 : 0);
      if (idx === 0 || idx === 15) continue;

      const keys = [`H:${x},${y}`, `V:${x + 1},${y}`, `H:${x},${y + 1}`, `V:${x},${y}`] as const;
      const edgePt = (e: number): Point2D => {
        if (e === 0) return interpolateIso(x, y, v0, x + 1, y, v1, iso);
        if (e === 1) return interpolateIso(x + 1, y, v1, x + 1, y + 1, v2, iso);
        if (e === 2) return interpolateIso(x, y + 1, v3, x + 1, y + 1, v2, iso);
        return interpolateIso(x, y, v0, x, y + 1, v3, iso);
      };
      const add = (fromE: number, toE: number): void => {
        const pt = edgePt(fromE);
        edges.set(keys[fromE]!, { toKey: keys[toE]!, fromPt: { x: pt.x - offsetX, y: pt.y - offsetY } });
      };

      const simple = MS_SIMPLE_TABLE[idx];
      if (simple) {
        add(simple[0], simple[1]);
      } else {
        const centerInside = 0.25 * (v0 + v1 + v2 + v3) <= iso;
        if (idx === 5) {
          if (centerInside) { add(3, 0); add(1, 2); } else { add(1, 0); add(3, 2); }
        } else if (idx === 10) {
          if (centerInside) { add(0, 1); add(2, 3); } else { add(0, 3); add(2, 1); }
        }
      }
    }
  }

  const visited = new Set<string>();
  const loops: Point2D[][] = [];
  for (const startKey of edges.keys()) {
    if (visited.has(startKey)) continue;
    const loop: Point2D[] = [];
    let cur: string | undefined = startKey;
    let guard = edges.size + 2;
    while (cur !== undefined && !visited.has(cur) && guard-- > 0) {
      visited.add(cur);
      const seg = edges.get(cur);
      if (!seg) break;
      loop.push(seg.fromPt);
      cur = seg.toKey;
    }
    if (cur === startKey && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function polygonSignedArea(points: readonly Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!; const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

function polygonPerimeter(points: readonly Point2D[]): number {
  let len = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!; const b = points[(i + 1) % points.length]!;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

function computePolygonBounds(points: readonly Point2D[]): BoundingBox2D {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX: round2(minX), minY: round2(minY), maxX: round2(maxX), maxY: round2(maxY), width: round2(maxX - minX), height: round2(maxY - minY) };
}

function pointToSegDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function douglasPeuckerOpen(points: readonly Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return [...points];
  const first = points[0]!; const last = points[points.length - 1]!;
  let maxDist = -1; let splitIdx = 1;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = pointToSegDist(points[i]!, first, last);
    if (d > maxDist) { maxDist = d; splitIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeuckerOpen(points.slice(0, splitIdx + 1), epsilon);
    const right = douglasPeuckerOpen(points.slice(splitIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function simplifyClosedPolygon(points: readonly Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 12 || epsilon <= 0) return [...points];
  const findFarthest = (anchor: Point2D): number => {
    let best = 0; let bestSq = -1;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i]!;
      const dSq = (p.x - anchor.x) * (p.x - anchor.x) + (p.y - anchor.y) * (p.y - anchor.y);
      if (dSq > bestSq) { bestSq = dSq; best = i; }
    }
    return best;
  };
  const idxA = findFarthest(points[0]!);
  const idxB = findFarthest(points[idxA]!);
  const start = Math.min(idxA, idxB); const end = Math.max(idxA, idxB);
  if (start === end) return [...points];
  const simp1 = douglasPeuckerOpen(points.slice(start, end + 1), epsilon);
  const simp2 = douglasPeuckerOpen([...points.slice(end), ...points.slice(0, start + 1)], epsilon);
  const merged = [...simp1.slice(0, -1), ...simp2.slice(0, -1)];
  return merged.length >= 6 ? merged : [...points];
}

function chaikinSmoothClosed(points: readonly Point2D[], iterations: number): Point2D[] {
  let cur = [...points];
  const passes = Math.round(clamp(iterations, 0, 4));
  for (let iter = 0; iter < passes && cur.length >= 3; iter += 1) {
    const next: Point2D[] = [];
    for (let i = 0; i < cur.length; i += 1) {
      const a = cur[i]!; const b = cur[(i + 1) % cur.length]!;
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    cur = next;
  }
  return cur;
}

function hasPolygonSelfIntersection(points: readonly Point2D[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  const orient = (p: Point2D, q: Point2D, r: Point2D): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!; const b = points[(i + 1) % n]!;
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      const c = points[j]!; const d = points[(j + 1) % n]!;
      if (orient(a, b, c) * orient(a, b, d) < -1e-9 && orient(c, d, a) * orient(c, d, b) < -1e-9) return true;
    }
  }
  return false;
}

function extractBoundaryPixels(mask: Uint8Array, w: number, h: number): Point2D[] {
  const out: Point2D[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (mask[idx] !== 1) continue;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
        mask[idx - 1] === 0 || mask[idx + 1] === 0 || mask[idx - w] === 0 || mask[idx + w] === 0) {
        out.push({ x, y });
      }
    }
  }
  return out;
}

function nearestBoundary(pt: Point2D, boundary: readonly Point2D[]): { dist: number; nearest: Point2D } {
  let bestSq = Infinity; let nearest: Point2D = boundary[0] ?? { x: 0, y: 0 };
  for (const bp of boundary) {
    const dSq = (pt.x - bp.x) * (pt.x - bp.x) + (pt.y - bp.y) * (pt.y - bp.y);
    if (dSq < bestSq) { bestSq = dSq; nearest = bp; }
  }
  return { dist: Math.sqrt(bestSq), nearest };
}

function measureMinClearance(contour: readonly Point2D[], boundary: readonly Point2D[]): number {
  if (contour.length === 0 || boundary.length === 0) return 0;
  let minD = Infinity;
  for (let i = 0; i < contour.length; i += 1) {
    const a = contour[i]!; const b = contour[(i + 1) % contour.length]!;
    minD = Math.min(minD, nearestBoundary(a, boundary).dist, nearestBoundary({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }, boundary).dist);
  }
  return Number.isFinite(minD) ? minD : 0;
}

/**
 * 닫힌 다각형 점 배열을 플로터용 SVG `d` 경로 문자열로 직렬화한다(NaN 원천 차단).
 */
export function pointsToSvgPath(points: readonly Point2D[], closed = true): string {
  if (points.length === 0) return "";
  const parts = points.map((p, i) => `${i === 0 ? "M" : "L"} ${round2(p.x).toFixed(2)} ${round2(p.y).toFixed(2)}`);
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/**
 * 캐릭터 실루엣에서 정밀 2D EDT 확장 + Marching Squares + Douglas-Peucker/Chaikin 스무딩을 거쳐
 * 칼날 침범이 없는 닫힌 단일 칼선(Die-Cut)과 선택적 키링 타공 홀(3.2mm)을 생성한다.
 */
export function generateStickerDieCutContour(
  binaryMask: Uint8Array, width: number, height: number, options: DieCutContourOptions = {},
): DieCutContourResult {
  const dpi = clamp(Math.round(options.dpi ?? 300), 72, 1200);
  const offsetMm = clamp(options.offsetMm ?? 2.5, 0.5, 15.0);
  const offsetPx = mmToPx(offsetMm, dpi);
  const simplifyEpsilonPx = clamp(options.simplifyEpsilonPx ?? 0.65, 0.1, 4.0);
  const chaikinIterations = Math.round(clamp(options.chaikinIterations ?? 2, 0, 3));

  const boundary = extractBoundaryPixels(binaryMask, width, height);
  if (boundary.length === 0) throw new Error("칼선을 생성할 캐릭터 전경 픽셀이 존재하지 않습니다.");

  const padPx = Math.ceil(offsetPx) + 8;
  const padW = width + padPx * 2; const padH = height + padPx * 2;
  const padded = new Uint8Array(padW * padH);
  for (let y = 0; y < height; y += 1) {
    const src = y * width; const dst = (y + padPx) * padW + padPx;
    for (let x = 0; x < width; x += 1) padded[dst + x] = binaryMask[src + x] === 1 ? 1 : 0;
  }

  const distField = computeExactEuclideanDistanceField(padded, padW, padH, 1);
  const loops = traceMarchingSquaresLoops(distField, padW, padH, offsetPx + 0.45, padPx, padPx);
  if (loops.length === 0) throw new Error("Marching Squares 단계에서 닫힌 칼선 윤곽을 찾지 못했습니다.");

  let primaryLoop = loops[0]!;
  let maxArea = Math.abs(polygonSignedArea(primaryLoop));
  for (let i = 1; i < loops.length; i += 1) {
    const area = Math.abs(polygonSignedArea(loops[i]!));
    if (area > maxArea) { maxArea = area; primaryLoop = loops[i]!; }
  }

  let smoothed = chaikinSmoothClosed(simplifyClosedPolygon(primaryLoop, simplifyEpsilonPx), chaikinIterations);
  while (smoothed.length < 12) smoothed = chaikinSmoothClosed(smoothed, 1);

  // 볼록 모서리가 라운딩으로 안쪽 침범하지 않도록 아트워크 최소 이격거리 안전 보정 수행
  const targetClearance = Math.max(0.5, offsetPx - 0.4);
  const guarded = smoothed.map((pt) => {
    const { dist, nearest } = nearestBoundary(pt, boundary);
    if (dist >= targetClearance) return pt;
    const vx = pt.x - nearest.x; const vy = pt.y - nearest.y; const norm = Math.hypot(vx, vy);
    if (norm < 1e-6) return { x: pt.x, y: pt.y - targetClearance };
    const s = (targetClearance + 0.15) / norm;
    return { x: nearest.x + vx * s, y: nearest.y + vy * s };
  });

  let finalPts: Point2D[] = guarded;
  if (hasPolygonSelfIntersection(finalPts)) {
    finalPts = hasPolygonSelfIntersection(smoothed) ? primaryLoop : smoothed;
  }

  const roundedPoints: readonly Point2D[] = finalPts.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
  const boundsPx = computePolygonBounds(roundedPoints);
  const minClearanceToArtworkPx = round2(measureMinClearance(roundedPoints, boundary));
  const selfIntersecting = hasPolygonSelfIntersection(roundedPoints);

  let keyringHole: KeyringHoleGeometry | null = null;
  if (options.includeKeyringHole) {
    const diameterMm = clamp(options.keyringHoleDiameterMm ?? 3.2, 2.0, 6.0);
    const wallThicknessMm = clamp(options.keyringWallThicknessMm ?? 2.2, 1.8, 5.0);
    const radiusPx = mmToPx(diameterMm * 0.5, dpi);
    const outerLugRadiusPx = radiusPx + mmToPx(wallThicknessMm, dpi);
    const topBand = boundsPx.minY + Math.max(2, offsetPx * 0.35);
    let sumX = 0; let cnt = 0;
    for (const p of roundedPoints) { if (p.y <= topBand) { sumX += p.x; cnt += 1; } }
    const cxPx = round2(cnt > 0 ? sumX / cnt : (boundsPx.minX + boundsPx.maxX) * 0.5);
    const cyPx = round2(boundsPx.minY - radiusPx - mmToPx(0.8, dpi));
    const clearanceToArtworkPx = round2(nearestBoundary({ x: cxPx, y: cyPx }, boundary).dist - radiusPx);
    keyringHole = {
      cxPx, cyPx, radiusPx: round2(radiusPx), diameterMm: round2(diameterMm),
      outerLugRadiusPx: round2(outerLugRadiusPx), wallThicknessMm: round2(wallThicknessMm), clearanceToArtworkPx,
    };
  }

  return {
    closed: true, selfIntersecting, dpi, offsetMm: round2(offsetMm), offsetPx: round2(offsetPx),
    points: roundedPoints, svgPathD: pointsToSvgPath(roundedPoints, true), boundsPx,
    areaPx2: round2(Math.abs(polygonSignedArea(roundedPoints))),
    perimeterPx: round2(polygonPerimeter(roundedPoints)),
    minClearanceToArtworkPx, clearanceSafe: minClearanceToArtworkPx >= Math.max(0.5, offsetPx - 1.5),
    keyringHole,
  };
}

/**
 * 투명 아크릴 키링·홀로그램 스티커용 초크(Choke, 내측 침식) 화이트 잉크 언더베이스 판을 생성한다.
 * 초크된 화이트 픽셀은 원본 캐릭터 불투명 픽셀의 엄격한 부분집합(외부 누출 0px)임을 보장한다.
 */
export function generateWhiteUnderbasePlate(
  binaryMask: Uint8Array, width: number, height: number, options: WhiteUnderbaseOptions = {},
): WhiteUnderbasePlateResult {
  const dpi = clamp(Math.round(options.dpi ?? 300), 72, 1200);
  const chokePx = options.chokePx !== undefined
    ? clamp(options.chokePx, 0, 20)
    : options.chokeMm !== undefined ? clamp(mmToPx(options.chokeMm, dpi), 0, 20) : 2;
  const whiteInkDensityPercent = Math.round(clamp(options.whiteInkDensityPercent ?? 100, 10, 100));

  const padW = width + 2; const padH = height + 2;
  const padded = new Uint8Array(padW * padH);
  let artworkPixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const val = binaryMask[y * width + x] === 1 ? 1 : 0;
      padded[(y + 1) * padW + (x + 1)] = val;
      if (val === 1) artworkPixelCount += 1;
    }
  }

  const inwardDist = computeExactEuclideanDistanceField(padded, padW, padH, 0);
  const underbaseMask = new Uint8Array(width * height);
  let underbasePixelCount = 0; let leakedOutsideArtworkPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const isArt = binaryMask[idx] === 1;
      const dBg = inwardDist[(y + 1) * padW + (x + 1)] ?? 0;
      if (isArt && (chokePx <= 0 || dBg > chokePx + 1e-6)) {
        underbaseMask[idx] = 1; underbasePixelCount += 1;
        if (!isArt) leakedOutsideArtworkPixels += 1;
      }
    }
  }

  const scalar = new Float32Array(padW * padH);
  scalar.fill(1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      scalar[(y + 1) * padW + (x + 1)] = underbaseMask[y * width + x] === 1 ? 0 : 1;
    }
  }
  const contours: readonly (readonly Point2D[])[] = traceMarchingSquaresLoops(scalar, padW, padH, 0.5, 1, 1)
    .map((loop) => simplifyClosedPolygon(loop, 0.5).map((p) => ({ x: round2(p.x), y: round2(p.y) })));
  const svgPathD = contours.map((c) => pointsToSvgPath(c, true)).filter((d) => d.length > 0).join(" ");
  const coverageRatio = artworkPixelCount > 0 ? round2(underbasePixelCount / artworkPixelCount) : 0;

  return {
    width, height, chokePx: round2(chokePx), whiteInkDensityPercent, underbaseMask,
    artworkPixelCount, underbasePixelCount, leakedOutsideArtworkPixels,
    coverageRatio, thinAreaWarning: artworkPixelCount > 0 && coverageRatio < 0.35, contours, svgPathD,
  };
}
