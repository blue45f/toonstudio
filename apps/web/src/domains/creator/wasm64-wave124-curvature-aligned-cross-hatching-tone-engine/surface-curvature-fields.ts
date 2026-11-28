/**
 * Wave 124 — 3D 해석적 곡면 법선·주곡률 방향장 및 커스텀 2D 마스크/법선장 평가기.
 *
 * - 4종 내장 3D 해석적 표면 프리셋(`cylinder-limb`, `sphere-head`, `folded-drapery`, `planar-wall`)
 * - 커스텀 2D 마스크 및 법선·접선장 입력 지원
 * - 램버트 조도 L ∈ [0, 1]과 제1/제2 주곡률 접선 방향장 u_1(x, y), u_2(x, y) 산출
 */

export type SurfacePresetId =
  | "cylinder-limb"
  | "sphere-head"
  | "folded-drapery"
  | "planar-wall";

export type HatchStyleId =
  | "g-pen-classic-cross"
  | "murim-brush-hatch"
  | "noir-parallel-engraving"
  | "stipple-fine-liner";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CustomNormalFieldInput {
  readonly width: number;
  readonly height: number;
  /** 0 이하는 실루엣 외부, 0 초과는 실루엣 내부 마스크. 길이 >= width * height */
  readonly mask: ReadonlyArray<number> | Uint8Array | Float32Array;
  /** 픽셀당 [nx, ny, nz] 평탄 배열(선택). 생략 시 마스크 기하에서 볼록 법선장을 유도한다. */
  readonly normals?: ReadonlyArray<number> | Float32Array;
  /** 픽셀당 [tx, ty] 주곡률 접선 방향장(선택). 생략 시 법선의 직교 등고선 접선에서 유도한다. */
  readonly principalTangents?: ReadonlyArray<number> | Float32Array;
}

export interface SurfaceSample {
  readonly insideMask: boolean;
  readonly normal: Vec3;
  /** 제1 주곡률 접선 방향장 u_1(x, y) (단위 벡터) */
  readonly principalTangent1: Vec2;
  /** 제2 주곡률 직교 접선 방향장 u_2(x, y) (단위 벡터) */
  readonly principalTangent2: Vec2;
  /** 추정 주곡률 크기 (>= 0) */
  readonly curvatureMagnitude: number;
  /** 램버트 조도 L ∈ [0, 1] */
  readonly luminance: number;
}

export interface CurvatureDirectionArrow {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly luminance: number;
  readonly curvatureMagnitude: number;
}

export interface SurfaceFieldEvaluator {
  readonly preset: SurfacePresetId | "custom";
  readonly width: number;
  readonly height: number;
  readonly lightDirection: Vec3;
  readonly isPointInsideMask: (x: number, y: number) => boolean;
  readonly sample: (x: number, y: number) => SurfaceSample;
}

export const ALL_SURFACE_PRESETS: readonly SurfacePresetId[] = [
  "cylinder-limb",
  "sphere-head",
  "folded-drapery",
  "planar-wall",
];

export const ALL_HATCH_STYLES: readonly HatchStyleId[] = [
  "g-pen-classic-cross",
  "murim-brush-hatch",
  "noir-parallel-engraving",
  "stipple-fine-liner",
];

export const DEFAULT_LIGHT_DIRECTION: Vec3 = { x: -0.82, y: -0.28, z: 0.5 };

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 결정론적 32비트 Mulberry32 난수 생성기.
 */
export function createSeededRng(seed: number): () => number {
  let state = (Math.trunc(Number.isFinite(seed) ? seed : 12401) >>> 0) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeVec2(x: number, y: number, fallbackX = 1, fallbackY = 0): Vec2 {
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  const len = Math.hypot(sx, sy);
  if (len < 1e-8) {
    const flen = Math.hypot(fallbackX, fallbackY) || 1;
    return { x: fallbackX / flen, y: fallbackY / flen };
  }
  return { x: sx / len, y: sy / len };
}

export function normalizeVec3(v: Vec3, fallback: Vec3 = DEFAULT_LIGHT_DIRECTION): Vec3 {
  const sx = Number.isFinite(v.x) ? v.x : 0;
  const sy = Number.isFinite(v.y) ? v.y : 0;
  const sz = Number.isFinite(v.z) ? v.z : 0;
  const len = Math.hypot(sx, sy, sz);
  if (len < 1e-8) {
    const flen = Math.hypot(fallback.x, fallback.y, fallback.z) || 1;
    return { x: fallback.x / flen, y: fallback.y / flen, z: fallback.z / flen };
  }
  return { x: sx / len, y: sy / len, z: sz / len };
}

export function rotateVec2(v: Vec2, angleRad: number): Vec2 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
  };
}

function computeLambertLuminance(normal: Vec3, lightDir: Vec3): number {
  const ndotl = normal.x * lightDir.x + normal.y * lightDir.y + normal.z * lightDir.z;
  return clampFinite(ndotl, 0, 1, 0);
}

const OUTSIDE_SAMPLE: SurfaceSample = {
  insideMask: false,
  normal: { x: 0, y: 0, z: 1 },
  principalTangent1: { x: 1, y: 0 },
  principalTangent2: { x: 0, y: 1 },
  curvatureMagnitude: 0,
  luminance: 1,
};

function evaluateCylinderLimb(
  x: number,
  y: number,
  width: number,
  height: number,
  lightDir: Vec3,
): SurfaceSample {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = Math.max(8, Math.min(width, height) * 0.28);
  const ry = Math.max(8, height * 0.42);
  const u = (x - cx) / rx;
  const v = (y - cy) / ry;

  if (Math.abs(u) > 1 || Math.abs(v) > 1) return OUTSIDE_SAMPLE;
  // 상단·하단 원기둥 캡의 둥근 실루엣 마감
  const capRegion = Math.max(0, Math.abs(v) - 0.84) / 0.16;
  if (capRegion > 0 && u * u + capRegion * capRegion > 1) return OUTSIDE_SAMPLE;

  const nx = clampFinite(u, -0.995, 0.995, 0);
  const ny = clampFinite(capRegion * Math.sign(v) * 0.25, -0.35, 0.35, 0);
  const nz = Math.sqrt(Math.max(0.0025, 1 - nx * nx - ny * ny));
  const normal = normalizeVec3({ x: nx, y: ny, z: nz }, { x: 0, y: 0, z: 1 });

  // 원기둥 둘레 방향(최대 주곡률)에 약간의 입체 시야 기울기를 부여해 팔·다리 감싸는 곡선 형성
  const principalTangent1 = normalizeVec2(nz + 0.22, 0.26 * u, 1, 0);
  const principalTangent2: Vec2 = { x: -principalTangent1.y, y: principalTangent1.x };

  return {
    insideMask: true,
    normal,
    principalTangent1,
    principalTangent2,
    curvatureMagnitude: 1.0 / Math.max(0.25, nz),
    luminance: computeLambertLuminance(normal, lightDir),
  };
}

function evaluateSphereHead(
  x: number,
  y: number,
  width: number,
  height: number,
  lightDir: Vec3,
): SurfaceSample {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = Math.max(8, Math.min(width, height) * 0.38);
  const ry = Math.max(8, Math.min(width, height) * 0.41);
  const u = (x - cx) / rx;
  const v = (y - cy) / ry;
  const r2 = u * u + v * v;
  if (r2 > 1) return OUTSIDE_SAMPLE;

  const nz = Math.sqrt(Math.max(0.0025, 1 - r2));
  const normal = normalizeVec3({ x: u, y: v, z: nz }, { x: 0, y: 0, z: 1 });

  // 구형 두상의 볼·턱·이마 양감을 따라 흐르는 무특이점 위도 곡률 접선장
  const principalTangent1 = normalizeVec2(0.74 * nz + 0.26, -0.56 * u * v, 1, 0);
  const principalTangent2: Vec2 = { x: -principalTangent1.y, y: principalTangent1.x };

  return {
    insideMask: true,
    normal,
    principalTangent1,
    principalTangent2,
    curvatureMagnitude: 1.0 + 0.35 * Math.sqrt(r2),
    luminance: computeLambertLuminance(normal, lightDir),
  };
}

function evaluateFoldedDrapery(
  x: number,
  y: number,
  width: number,
  height: number,
  lightDir: Vec3,
): SurfaceSample {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = Math.max(8, width * 0.4);
  const ry = Math.max(8, height * 0.42);
  const u = (x - cx) / rx;
  const v = (y - cy) / ry;

  if (Math.abs(u) > 1 || v < -1) return OUTSIDE_SAMPLE;
  // 하단 천 자락의 좌우 대칭 물결 실루엣
  const hemLimit = 0.94 + 0.06 * Math.cos(2.0 * Math.PI * u);
  if (v > hemLimit) return OUTSIDE_SAMPLE;

  // 좌우 대칭(짝함수) 거시 볼록 주름 + 미세 주름 높이장 z(u, v)
  const alpha = 2.0 * Math.PI + 0.55 * v;
  const phi = u * alpha;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  const zu = -1.12 * u - 0.1 * alpha * sinPhi;
  const zv = -0.1 * 0.55 * u * sinPhi - 0.08 * v;

  const zuu = -1.12 - 0.1 * alpha * alpha * cosPhi;
  const zuv = -0.1 * 0.55 * (sinPhi + phi * cosPhi);
  const zvv = -0.1 * (0.55 * u) * (0.55 * u) * cosPhi - 0.08;

  const normal = normalizeVec3({ x: -zu, y: -zv, z: 1 }, { x: 0, y: 0, z: 1 });

  // 2x2 헤시안 대칭 행렬의 고유벡터로 해석적 주곡률 방향장 추출
  const trace = zuu + zvv;
  const diff = zuu - zvv;
  const disc = Math.hypot(diff, 2 * zuv);
  const lambda1 = 0.5 * (trace + disc);
  const lambda2 = 0.5 * (trace - disc);
  const curvatureMagnitude = Math.max(Math.abs(lambda1), Math.abs(lambda2));

  let tx = 1;
  let ty = 0;
  if (disc > 1e-5) {
    const theta = 0.5 * Math.atan2(2 * zuv, diff);
    if (Math.abs(lambda1) >= Math.abs(lambda2)) {
      tx = Math.cos(theta);
      ty = Math.sin(theta);
    } else {
      tx = -Math.sin(theta);
      ty = Math.cos(theta);
    }
  }
  const principalTangent1 = normalizeVec2(tx, ty, 1, 0);
  const principalTangent2: Vec2 = { x: -principalTangent1.y, y: principalTangent1.x };

  return {
    insideMask: true,
    normal,
    principalTangent1,
    principalTangent2,
    curvatureMagnitude,
    luminance: computeLambertLuminance(normal, lightDir),
  };
}

function evaluatePlanarWall(
  x: number,
  y: number,
  width: number,
  height: number,
  lightDir: Vec3,
): SurfaceSample {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = Math.max(8, width * 0.42);
  const ry = Math.max(8, height * 0.42);
  const u = (x - cx) / rx;
  const v = (y - cy) / ry;

  if (Math.abs(u) > 1 || Math.abs(v) > 1) return OUTSIDE_SAMPLE;

  // 건축 벽면의 미세한 광원 감쇠 기울기를 반영한 좌우 대칭 법선장
  const nx = clampFinite(0.68 * u, -0.78, 0.78, 0);
  const ny = clampFinite(0.42 * v, -0.52, 0.52, 0);
  const nz = Math.sqrt(Math.max(0.08, 1 - nx * nx - ny * ny));
  const normal = normalizeVec3({ x: nx, y: ny, z: nz }, { x: 0, y: 0, z: 1 });

  // 건축 직선 빗금(-22도 기조 + 미약한 투시 수렴)
  const principalTangent1 = normalizeVec2(0.927, -0.375 + 0.04 * v, 0.927, -0.375);
  const principalTangent2: Vec2 = { x: -principalTangent1.y, y: principalTangent1.x };

  return {
    insideMask: true,
    normal,
    principalTangent1,
    principalTangent2,
    curvatureMagnitude: 0.12,
    luminance: computeLambertLuminance(normal, lightDir),
  };
}

function createCustomFieldEvaluator(
  input: CustomNormalFieldInput,
  lightDir: Vec3,
): SurfaceFieldEvaluator {
  const width = Math.max(0, Math.floor(clampFinite(input.width, 0, 4096, 0)));
  const height = Math.max(0, Math.floor(clampFinite(input.height, 0, 4096, 0)));
  const totalPixels = width * height;

  // 마스크 바운딩 박스 계산 (법선 생략 시 볼록 법선 유도에 사용)
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  if (totalPixels > 0 && input.mask.length >= totalPixels) {
    for (let py = 0; py < height; py += 1) {
      const rowOffset = py * width;
      for (let px = 0; px < width; px += 1) {
        const m = input.mask[rowOffset + px];
        if (Number.isFinite(m) && m > 0.5) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }
  }
  const hasActiveMask = maxX >= minX && maxY >= minY;
  const boxCx = hasActiveMask ? (minX + maxX + 1) * 0.5 : width * 0.5;
  const boxCy = hasActiveMask ? (minY + maxY + 1) * 0.5 : height * 0.5;
  const boxRx = Math.max(1, (maxX - minX + 1) * 0.5);
  const boxRy = Math.max(1, (maxY - minY + 1) * 0.5);

  const isPointInsideMask = (x: number, y: number): boolean => {
    if (!hasActiveMask || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return false;
    const idx = iy * width + ix;
    if (idx >= input.mask.length) return false;
    const val = input.mask[idx];
    return Number.isFinite(val) && val > 0.5;
  };

  const sample = (x: number, y: number): SurfaceSample => {
    if (!isPointInsideMask(x, y)) return OUTSIDE_SAMPLE;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const idx = iy * width + ix;

    let normal: Vec3;
    if (input.normals && idx * 3 + 2 < input.normals.length) {
      normal = normalizeVec3(
        {
          x: input.normals[idx * 3],
          y: input.normals[idx * 3 + 1],
          z: input.normals[idx * 3 + 2],
        },
        { x: 0, y: 0, z: 1 },
      );
    } else {
      const u = clampFinite((x - boxCx) / boxRx, -0.96, 0.96, 0);
      const v = clampFinite((y - boxCy) / boxRy, -0.96, 0.96, 0);
      const nz = Math.sqrt(Math.max(0.04, 1 - Math.min(0.96, u * u + v * v)));
      normal = normalizeVec3({ x: u, y: v, z: nz }, { x: 0, y: 0, z: 1 });
    }

    let principalTangent1: Vec2;
    if (input.principalTangents && idx * 2 + 1 < input.principalTangents.length) {
      principalTangent1 = normalizeVec2(
        input.principalTangents[idx * 2],
        input.principalTangents[idx * 2 + 1],
        1,
        0,
      );
    } else {
      principalTangent1 = normalizeVec2(
        normal.z * 0.72 + 0.28,
        -normal.x * normal.y * 0.65 + normal.x * 0.18,
        1,
        0,
      );
    }

    const principalTangent2: Vec2 = { x: -principalTangent1.y, y: principalTangent1.x };
    const curvatureMagnitude = Math.hypot(normal.x, normal.y) + 0.25;

    return {
      insideMask: true,
      normal,
      principalTangent1,
      principalTangent2,
      curvatureMagnitude,
      luminance: computeLambertLuminance(normal, lightDir),
    };
  };

  return {
    preset: "custom",
    width,
    height,
    lightDirection: lightDir,
    isPointInsideMask,
    sample,
  };
}

/**
 * 3D 해석적 표면 프리셋 또는 커스텀 2D 마스크/법선장으로부터 평가기를 생성한다.
 */
export function createSurfaceFieldEvaluator(options: {
  readonly surfacePreset?: SurfacePresetId;
  readonly customField?: CustomNormalFieldInput;
  readonly width?: number;
  readonly height?: number;
  readonly lightDirection?: Vec3;
}): SurfaceFieldEvaluator {
  const lightDir = normalizeVec3(
    options.lightDirection ?? DEFAULT_LIGHT_DIRECTION,
    DEFAULT_LIGHT_DIRECTION,
  );

  if (options.customField) {
    return createCustomFieldEvaluator(options.customField, lightDir);
  }

  const preset: SurfacePresetId = options.surfacePreset ?? "sphere-head";
  const width = Math.round(clampFinite(options.width ?? 320, 32, 2048, 320));
  const height = Math.round(clampFinite(options.height ?? 320, 32, 2048, 320));

  const sample = (x: number, y: number): SurfaceSample => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) {
      return OUTSIDE_SAMPLE;
    }
    switch (preset) {
      case "cylinder-limb":
        return evaluateCylinderLimb(x, y, width, height, lightDir);
      case "sphere-head":
        return evaluateSphereHead(x, y, width, height, lightDir);
      case "folded-drapery":
        return evaluateFoldedDrapery(x, y, width, height, lightDir);
      case "planar-wall":
        return evaluatePlanarWall(x, y, width, height, lightDir);
    }
  };

  return {
    preset,
    width,
    height,
    lightDirection: lightDir,
    isPointInsideMask: (x: number, y: number) => sample(x, y).insideMask,
    sample,
  };
}

/**
 * 검수 SVG 시각화를 위해 마스크 내부의 주곡률 방향장 미니 화살표를 균일 격자로 샘플링한다.
 */
export function sampleCurvatureDirectionArrows(
  evaluator: SurfaceFieldEvaluator,
  gridCols = 11,
  gridRows = 11,
): readonly CurvatureDirectionArrow[] {
  if (evaluator.width <= 0 || evaluator.height <= 0) return [];
  const cols = Math.max(2, Math.min(24, Math.round(gridCols)));
  const rows = Math.max(2, Math.min(24, Math.round(gridRows)));
  const arrows: CurvatureDirectionArrow[] = [];

  for (let r = 0; r < rows; r += 1) {
    const y = ((r + 0.5) / rows) * evaluator.height;
    for (let c = 0; c < cols; c += 1) {
      const x = ((c + 0.5) / cols) * evaluator.width;
      const s = evaluator.sample(x, y);
      if (!s.insideMask) continue;
      arrows.push({
        x,
        y,
        dx: s.principalTangent1.x,
        dy: s.principalTangent1.y,
        luminance: s.luminance,
        curvatureMagnitude: s.curvatureMagnitude,
      });
    }
  }
  return arrows;
}

/**
 * 마스크 중심 기준 방사형 이분 탐색으로 실루엣 외곽선 대표 다각형을 추출한다.
 */
export function extractSilhouetteOutline(
  evaluator: SurfaceFieldEvaluator,
  center: Vec2,
  sampleCount = 64,
): readonly Vec2[] {
  if (evaluator.width <= 0 || evaluator.height <= 0) return [];
  if (!evaluator.isPointInsideMask(center.x, center.y)) return [];
  const count = Math.max(12, Math.min(128, Math.round(sampleCount)));
  const maxRadius = Math.hypot(evaluator.width, evaluator.height) * 0.6;
  const outline: Vec2[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // 방사선 위에서 마스크 내부의 최외곽 지점을 찾는다.
    let lastInside = 0;
    const coarseSteps = 48;
    for (let s = 1; s <= coarseSteps; s += 1) {
      const r = (s / coarseSteps) * maxRadius;
      if (evaluator.isPointInsideMask(center.x + dx * r, center.y + dy * r)) {
        lastInside = r;
      }
    }
    let lo = lastInside;
    let hi = Math.min(maxRadius, lastInside + maxRadius / coarseSteps);
    for (let iter = 0; iter < 6; iter += 1) {
      const mid = (lo + hi) * 0.5;
      if (evaluator.isPointInsideMask(center.x + dx * mid, center.y + dy * mid)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    outline.push({
      x: center.x + dx * lo,
      y: center.y + dy * lo,
    });
  }
  return outline;
}
