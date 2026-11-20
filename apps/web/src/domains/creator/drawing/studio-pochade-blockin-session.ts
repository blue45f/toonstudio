/**
 * studio-pochade-blockin-session.ts
 *
 * HeavyPaint 익스프레시브 포샤드(Pochade) 블록인 세션 엔진.
 *
 * 1. 실시간 닫힌 폴리곤 **Lasso Fill** · 앵커-커서 부채꼴 **Fan Fill** 인터랙티브 세션
 * 2. 스트로크 단위 결정적 **HSB · 한난 색온도(OKLab) 지터** (`computeDeterministicPochadeColor`)
 * 3. 2점 직선 경계 양쪽(4~24px) 샘플을 **OKLab 색공간으로 보간**해 붓자국 없이 경계를 문지르는
 *    **Line Blend** 스미어 (`applyPochadeLineBlendToRgba`)
 * 4. 1-탭 명도 덩어리 점검용 **Notan 포스터라이즈** (`evaluateNotanPosterizeRgba`)
 *
 * 순수·결정적·입력 무변이 모듈로, DOM/Konva에 직접 의존하지 않는다.
 */
import type { StudioImageDataLike } from "../studio-filters";

export type PochadeToolMode = "lasso-fill" | "fan-fill" | "line-blend";

export interface PochadePoint2D {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
}

export interface PochadeRgbByte {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PochadeColorJitterConfig {
  /** 색조 지터 최대 편차(도, 0..60). */
  readonly hueJitterDeg: number;
  /** 채도 지터 최대 편차(0..0.5). */
  readonly saturationJitter01: number;
  /** 명도 지터 최대 편차(0..0.5). */
  readonly brightnessJitter01: number;
  /** 한난 색온도 지터 강도(0..1; 양=따뜻한 황금빛, 음=차가운 하늘빛). */
  readonly tempWarmCoolJitter01: number;
  /** 결정적 시드. */
  readonly seed: number;
}

export interface PochadeJitteredColorResult {
  readonly rgb: PochadeRgbByte;
  readonly hueDeltaDeg: number;
  readonly saturationDelta01: number;
  readonly brightnessDelta01: number;
  readonly temperatureShift01: number;
}

export interface PochadeTriangle2D {
  readonly a: PochadePoint2D;
  readonly b: PochadePoint2D;
  readonly c: PochadePoint2D;
}

export interface PochadeBlockInBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type PochadeSessionPhase = "idle" | "active" | "committed" | "cancelled";

export interface PochadeBlockInSession {
  readonly mode: PochadeToolMode;
  readonly phase: PochadeSessionPhase;
  readonly strokeIndex: number;
  readonly anchor: PochadePoint2D;
  readonly rawPoints: readonly PochadePoint2D[];
  /** 실시간 프리뷰 및 커밋에 쓰이는 닫힌 폴리곤 정점 배열. */
  readonly closedPolygon: readonly PochadePoint2D[];
  /** Fan Fill 모드일 때 앵커에서 부채꼴로 펼쳐진 삼각형 목록. */
  readonly fanTriangles: readonly PochadeTriangle2D[];
  readonly bounds: PochadeBlockInBounds;
  readonly signedAreaPx2: number;
  readonly resolvedColor: PochadeJitteredColorResult;
  readonly opacity01: number;
  readonly minSampleDistancePx: number;
}

export interface PochadeLineBlendOptions {
  readonly start: PochadePoint2D;
  readonly end: PochadePoint2D;
  /** 직선 중심에서 양쪽으로 블렌딩할 반폭(px, 기본 10). */
  readonly halfWidthPx?: number;
  /** 경계 양쪽 색을 채취할 수직 오프셋(px, 4..24 클램프). */
  readonly sampleOffsetPx?: number;
  /** 스미어 반영 강도(0..1, 기본 0.85). */
  readonly strength01?: number;
}

export const DEFAULT_POCHADE_COLOR_JITTER: PochadeColorJitterConfig = Object.freeze({
  hueJitterDeg: 10,
  saturationJitter01: 0.12,
  brightnessJitter01: 0.1,
  tempWarmCoolJitter01: 0.35,
  seed: 20261120,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge0 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 결정적 Mulberry32 의사난수 생성기 (0..1). */
function createDeterministicRng(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// sRGB ↔ HSB / OKLab 변환
// ---------------------------------------------------------------------------

function srgbByteToLinear(byte: number): number {
  const u = clamp(byte, 0, 255) / 255;
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(linear: number): number {
  const c = clamp01(linear);
  const u = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return clampByte(u * 255);
}

export function pochadeRgbToOklab(rgb: PochadeRgbByte): readonly [number, number, number] {
  const r = srgbByteToLinear(rgb.r);
  const g = srgbByteToLinear(rgb.g);
  const b = srgbByteToLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function pochadeOklabToRgb(L: number, a: number, b: number): PochadeRgbByte {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return {
    r: linearToSrgbByte(rLin),
    g: linearToSrgbByte(gLin),
    b: linearToSrgbByte(bLin),
  };
}

function rgbToHsb(rgb: PochadeRgbByte): { readonly h: number; readonly s: number; readonly b: number } {
  const r = clamp(rgb.r, 0, 255) / 255;
  const g = clamp(rgb.g, 0, 255) / 255;
  const b = clamp(rgb.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  const s = max <= 1e-6 ? 0 : d / max;
  return { h, s, b: max };
}

function hsbToRgb(h: number, s: number, v: number): PochadeRgbByte {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) {
    r1 = c; g1 = x;
  } else if (hue < 120) {
    r1 = x; g1 = c;
  } else if (hue < 180) {
    g1 = c; b1 = x;
  } else if (hue < 240) {
    g1 = x; b1 = c;
  } else if (hue < 300) {
    r1 = x; b1 = c;
  } else {
    r1 = c; b1 = x;
  }
  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  };
}

/**
 * 스트로크 번호와 시드에서 결정적으로 HSB + OKLab 색온도(Warm/Cool) 지터 색을 산출한다.
 * 동일한 `(baseRgb, strokeIndex, config)`는 항상 비트 단위로 동일한 결과를 반환한다.
 */
export function computeDeterministicPochadeColor(
  baseRgb: PochadeRgbByte,
  strokeIndex: number,
  config: PochadeColorJitterConfig = DEFAULT_POCHADE_COLOR_JITTER,
): PochadeJitteredColorResult {
  const mixedSeed = (Math.floor(config.seed) ^ Math.imul(Math.floor(strokeIndex) + 1, 2654435761)) >>> 0;
  const rng = createDeterministicRng(mixedSeed);
  const signedRand = (): number => rng() * 2 - 1;

  const hueCap = clamp(config.hueJitterDeg, 0, 60);
  const satCap = clamp(config.saturationJitter01, 0, 0.5);
  const valCap = clamp(config.brightnessJitter01, 0, 0.5);
  const tempCap = clamp(config.tempWarmCoolJitter01, 0, 1);

  const hueDeltaDeg = signedRand() * hueCap;
  const saturationDelta01 = signedRand() * satCap;
  const brightnessDelta01 = signedRand() * valCap;
  const temperatureShift01 = signedRand() * tempCap;

  const hsb = rgbToHsb(baseRgb);
  const hsbShifted = hsbToRgb(
    hsb.h + hueDeltaDeg,
    clamp01(hsb.s + saturationDelta01),
    clamp01(hsb.b + brightnessDelta01),
  );

  // OKLab 색온도 축 이동: warm(+b, +a 미세) ↔ cool(-b, -a 미세)
  const [L, a, b] = pochadeRgbToOklab(hsbShifted);
  const warmA = a + temperatureShift01 * 0.032;
  const warmB = b + temperatureShift01 * 0.068;
  const rgb = pochadeOklabToRgb(L, warmA, warmB);

  return {
    rgb,
    hueDeltaDeg,
    saturationDelta01,
    brightnessDelta01,
    temperatureShift01,
  };
}

// ---------------------------------------------------------------------------
// Live Lasso Fill & Fan Fill 인터랙티브 세션
// ---------------------------------------------------------------------------

function computePolygonBounds(points: readonly PochadePoint2D[]): PochadeBlockInBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function computeSignedArea(points: readonly PochadePoint2D[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

function buildFanTriangles(
  anchor: PochadePoint2D,
  points: readonly PochadePoint2D[],
): readonly PochadeTriangle2D[] {
  if (points.length < 3) return [];
  const triangles: PochadeTriangle2D[] = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    triangles.push({ a: anchor, b: points[i]!, c: points[i + 1]! });
  }
  return triangles;
}

export function beginPochadeBlockInSession(input: {
  readonly mode: PochadeToolMode;
  readonly start: PochadePoint2D;
  readonly baseColor: PochadeRgbByte;
  readonly strokeIndex: number;
  readonly jitter?: PochadeColorJitterConfig;
  readonly opacity01?: number;
  readonly minSampleDistancePx?: number;
}): PochadeBlockInSession {
  const resolvedColor = computeDeterministicPochadeColor(
    input.baseColor,
    input.strokeIndex,
    input.jitter ?? DEFAULT_POCHADE_COLOR_JITTER,
  );
  const start = { x: input.start.x, y: input.start.y, pressure01: input.start.pressure01 };
  const pts = [start];
  return {
    mode: input.mode,
    phase: "active",
    strokeIndex: input.strokeIndex,
    anchor: start,
    rawPoints: pts,
    closedPolygon: pts,
    fanTriangles: [],
    bounds: computePolygonBounds(pts),
    signedAreaPx2: 0,
    resolvedColor,
    opacity01: clamp01(input.opacity01 ?? 1),
    minSampleDistancePx: Math.max(0.5, input.minSampleDistancePx ?? 2),
  };
}

export function updatePochadeBlockInSession(
  session: PochadeBlockInSession,
  nextPoint: PochadePoint2D,
): PochadeBlockInSession {
  if (session.phase !== "active") return session;
  const last = session.rawPoints[session.rawPoints.length - 1];
  if (last && Math.hypot(nextPoint.x - last.x, nextPoint.y - last.y) < session.minSampleDistancePx) {
    return session;
  }
  const rawPoints = [...session.rawPoints, nextPoint];
  // Lasso Fill과 Fan Fill 모두 앵커부터 현재 커서 궤적을 즉시 닫힌 폴리곤으로 구성한다.
  // Fan Fill은 추가로 앵커 중심 삼각 팬 목록을 제공해 부채꼴 스트로크 렌더와 직결된다.
  const closedPolygon = rawPoints;
  const fanTriangles = session.mode === "fan-fill" ? buildFanTriangles(session.anchor, rawPoints) : [];
  return {
    ...session,
    rawPoints,
    closedPolygon,
    fanTriangles,
    bounds: computePolygonBounds(closedPolygon),
    signedAreaPx2: computeSignedArea(closedPolygon),
  };
}

export function commitPochadeBlockInSession(
  session: PochadeBlockInSession,
): PochadeBlockInSession {
  if (session.phase !== "active") return session;
  return { ...session, phase: "committed" };
}

export function cancelPochadeBlockInSession(
  session: PochadeBlockInSession,
): PochadeBlockInSession {
  return { ...session, phase: "cancelled" };
}

function pointInPolygonEvenOdd(
  x: number,
  y: number,
  polygon: readonly PochadePoint2D[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const hit =
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (hit) inside = !inside;
  }
  return inside;
}

/**
 * 현재 Lasso Fill / Fan Fill 세션의 닫힌 폴리곤을 RGBA 버퍼 위에 비파괴 합성해 새 버퍼를 반환한다.
 */
export function rasterizePochadeSessionToRgba(
  canvas: StudioImageDataLike,
  session: PochadeBlockInSession,
): StudioImageDataLike {
  const out = new Uint8ClampedArray(canvas.data);
  if (session.closedPolygon.length < 3 || session.phase === "cancelled") {
    return { width: canvas.width, height: canvas.height, data: out };
  }

  const minX = Math.max(0, Math.floor(session.bounds.minX));
  const maxX = Math.min(canvas.width - 1, Math.ceil(session.bounds.maxX));
  const minY = Math.max(0, Math.floor(session.bounds.minY));
  const maxY = Math.min(canvas.height - 1, Math.ceil(session.bounds.maxY));

  const { r: sr, g: sg, b: sb } = session.resolvedColor.rgb;
  const sa = session.opacity01;

  for (let y = minY; y <= maxY; y += 1) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInPolygonEvenOdd(x + 0.5, py, session.closedPolygon)) continue;
      const idx = (y * canvas.width + x) * 4;
      const da = (out[idx + 3] ?? 0) / 255;
      const outA = sa + da * (1 - sa);
      if (outA <= 1e-6) continue;
      const inv = 1 / outA;
      const keep = da * (1 - sa);
      out[idx] = Math.round((sr * sa + (out[idx] ?? 0) * keep) * inv);
      out[idx + 1] = Math.round((sg * sa + (out[idx + 1] ?? 0) * keep) * inv);
      out[idx + 2] = Math.round((sb * sa + (out[idx + 2] ?? 0) * keep) * inv);
      out[idx + 3] = Math.round(outA * 255);
    }
  }

  return { width: canvas.width, height: canvas.height, data: out };
}

// ---------------------------------------------------------------------------
// 2점 직선 경계 OKLab 스미어 (HeavyPaint Line Blend)
// ---------------------------------------------------------------------------

function sampleBilinearRgb(
  img: StudioImageDataLike,
  x: number,
  y: number,
): PochadeRgbByte {
  const cx = clamp(x, 0, img.width - 1);
  const cy = clamp(y, 0, img.height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;

  const idx00 = (y0 * img.width + x0) * 4;
  const idx10 = (y0 * img.width + x1) * 4;
  const idx01 = (y1 * img.width + x0) * 4;
  const idx11 = (y1 * img.width + x1) * 4;
  const d = img.data;

  const mixChannel = (ch: number): number => {
    const top = (d[idx00 + ch] ?? 0) * (1 - fx) + (d[idx10 + ch] ?? 0) * fx;
    const bot = (d[idx01 + ch] ?? 0) * (1 - fx) + (d[idx11 + ch] ?? 0) * fx;
    return top * (1 - fy) + bot * fy;
  };
  return { r: mixChannel(0), g: mixChannel(1), b: mixChannel(2) };
}

/**
 * HeavyPaint Line Blend: 시작점→끝점 직선 양쪽 4~24px에서 색을 채취해 OKLab 색공간에서
 * 부드럽게 보간함으로써 붓자국 없이 회화적 경계 스미어를 생성한다. 입력 버퍼는 변형하지 않는다.
 */
export function applyPochadeLineBlendToRgba(
  source: StudioImageDataLike,
  options: PochadeLineBlendOptions,
): StudioImageDataLike {
  const out = new Uint8ClampedArray(source.data);
  const dx = options.end.x - options.start.x;
  const dy = options.end.y - options.start.y;
  const segLen = Math.hypot(dx, dy);
  if (segLen < 1) {
    return { width: source.width, height: source.height, data: out };
  }

  const halfW = clamp(options.halfWidthPx ?? 10, 1, 64);
  const sampleOffset = clamp(options.sampleOffsetPx ?? Math.max(4, halfW + 2), 4, 24);
  const strength = clamp01(options.strength01 ?? 0.9);

  const tx = dx / segLen;
  const ty = dy / segLen;
  const nx = -ty;
  const ny = tx;

  const pad = Math.ceil(halfW + 1);
  const minX = Math.max(0, Math.floor(Math.min(options.start.x, options.end.x) - pad));
  const maxX = Math.min(source.width - 1, Math.ceil(Math.max(options.start.x, options.end.x) + pad));
  const minY = Math.max(0, Math.floor(Math.min(options.start.y, options.end.y) - pad));
  const maxY = Math.min(source.height - 1, Math.ceil(Math.max(options.start.y, options.end.y) + pad));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const rx = x + 0.5 - options.start.x;
      const ry = y + 0.5 - options.start.y;
      const along = rx * tx + ry * ty;
      if (along < 0 || along > segLen) continue;

      const lateral = rx * nx + ry * ny;
      const absLat = Math.abs(lateral);
      if (absLat > halfW) continue;

      const projX = options.start.x + tx * along;
      const projY = options.start.y + ty * along;

      // 직선 양쪽(±sampleOffset) 색을 채취해 OKLab 보간
      const sideNeg = sampleBilinearRgb(source, projX - nx * sampleOffset, projY - ny * sampleOffset);
      const sidePos = sampleBilinearRgb(source, projX + nx * sampleOffset, projY + ny * sampleOffset);
      const labNeg = pochadeRgbToOklab(sideNeg);
      const labPos = pochadeRgbToOklab(sidePos);

      const acrossT = smoothstep(-halfW, halfW, lateral);
      const blended = pochadeOklabToRgb(
        labNeg[0] + (labPos[0] - labNeg[0]) * acrossT,
        labNeg[1] + (labPos[1] - labNeg[1]) * acrossT,
        labNeg[2] + (labPos[2] - labNeg[2]) * acrossT,
      );

      // 중심선에서 최대 강도, 바깥 가장자리에서 부드럽게 원색과 합류
      const edgeWeight = (1 - smoothstep(halfW * 0.55, halfW, absLat)) * strength;
      const idx = (y * source.width + x) * 4;
      out[idx] = Math.round((source.data[idx] ?? 0) * (1 - edgeWeight) + blended.r * edgeWeight);
      out[idx + 1] = Math.round((source.data[idx + 1] ?? 0) * (1 - edgeWeight) + blended.g * edgeWeight);
      out[idx + 2] = Math.round((source.data[idx + 2] ?? 0) * (1 - edgeWeight) + blended.b * edgeWeight);
    }
  }

  return { width: source.width, height: source.height, data: out };
}

/** Kreska / HeavyPaint식 1-탭 흑백 명도(Notan) 덩어리 진단 포스터라이즈. */
export function evaluateNotanPosterizeRgba(
  source: StudioImageDataLike,
  bands = 3,
): StudioImageDataLike {
  const safeBands = Math.max(2, Math.min(8, Math.round(bands)));
  const out = new Uint8ClampedArray(source.data.length);
  const step = 255 / (safeBands - 1);
  for (let i = 0; i < source.data.length; i += 4) {
    const luma =
      0.299 * (source.data[i] ?? 0) +
      0.587 * (source.data[i + 1] ?? 0) +
      0.114 * (source.data[i + 2] ?? 0);
    const bucket = Math.min(safeBands - 1, Math.floor((luma / 256) * safeBands));
    const gray = Math.round(bucket * step);
    out[i] = gray;
    out[i + 1] = gray;
    out[i + 2] = gray;
    out[i + 3] = source.data[i + 3] ?? 255;
  }
  return { width: source.width, height: source.height, data: out };
}
