/**
 * Clip Studio Paint 4.0~5.0 스타일 2D 퍼펫 변형(Puppet Warp) 로컬 MLS 강체 엔진.
 * Schaefer et al. (SIGGRAPH 2006) "Image Deformation Using Moving Least Squares"
 * Section 2.3 (Rigid Deformations) 수식을 브라우저 로컬 클린룸 구현으로 내재화한다.
 */

export interface PuppetWarpPin {
  readonly id: string;
  readonly restX: number;
  readonly restY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly rotationDeg: number;
  readonly locked: boolean;
  readonly label: string;
}

export interface MeshVertex2D {
  readonly x: number;
  readonly y: number;
}

export interface MeshTriangle {
  readonly i0: number;
  readonly i1: number;
  readonly i2: number;
}

export interface DeformableGridMesh {
  readonly width: number;
  readonly height: number;
  readonly cols: number;
  readonly rows: number;
  readonly vertices: readonly MeshVertex2D[];
  readonly triangles: readonly MeshTriangle[];
  readonly edges: readonly (readonly [number, number])[];
}

export type PuppetWarpPresetId =
  | "head-nod"
  | "raise-right-arm"
  | "dynamic-waist-bend"
  | "wind-blown-hair";

export interface PuppetWarpPresetMeta {
  readonly id: PuppetWarpPresetId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

export interface PuppetWarpMetrics {
  readonly pinCount: number;
  readonly lockedPinCount: number;
  readonly activePinCount: number;
  readonly triangleCount: number;
  readonly maxVertexDisplacementPx: number;
  readonly meanVertexDisplacementPx: number;
  readonly maxPinResidualPx: number;
}

export interface CharacterSilhouettePart {
  readonly id: string;
  readonly closed: boolean;
  readonly points: readonly MeshVertex2D[];
}

interface EffectivePin {
  readonly restX: number;
  readonly restY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly rotationRad: number;
  readonly locked: boolean;
}

const DEG_TO_RAD = Math.PI / 180;
const SINGULAR_DIST_SQ = 1e-10;
const DETERMINANT_EPS = 1e-8;
const BARYCENTRIC_EDGE_EPS = -1e-6;

export const DEFAULT_PUPPET_STAGE_WIDTH = 240;
export const DEFAULT_PUPPET_STAGE_HEIGHT = 300;
export const DEFAULT_MLS_ALPHA = 2.0;

/** 클립스튜디오 웹툰 포즈 원클릭 4종 프리셋 메타데이터. */
export const PUPPET_WARP_PRESETS: readonly PuppetWarpPresetMeta[] = [
  {
    id: "head-nod",
    nameKo: "고개 끄덕임",
    nameEn: "Head Nod",
    descriptionKo: "상체와 어깨를 고정한 채 머리와 앞머리만 자연스럽게 숙입니다.",
    descriptionEn: "Anchors shoulders and torso while tilting the head naturally forward.",
  },
  {
    id: "raise-right-arm",
    nameKo: "오른팔 들어 올리기",
    nameEn: "Raise Right Arm",
    descriptionKo: "목·허리·반대팔을 고정해 오른팔 관절만 강체 왜곡 없이 들어 올립니다.",
    descriptionEn: "Locks torso and opposite arm to lift the right arm without shear distortion.",
  },
  {
    id: "dynamic-waist-bend",
    nameKo: "허리 역동적 굽힘",
    nameEn: "Dynamic Waist Bend",
    descriptionKo: "골반을 축으로 상체·머리·팔을 호 형태로 역동적으로 휘게 합니다.",
    descriptionEn: "Pivots from a locked pelvis to bend torso, head, and arms in a dynamic arc.",
  },
  {
    id: "wind-blown-hair",
    nameKo: "머리카락 바람 날림",
    nameEn: "Wind-Blown Hair",
    descriptionKo: "얼굴과 몸체를 고정한 채 머리카락 끝단만 바람 방향으로 날립니다.",
    descriptionEn: "Keeps face and body anchored while sweeping the hair tip in the wind.",
  },
];

function sanitizeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function normalizePins(pins: readonly PuppetWarpPin[]): EffectivePin[] {
  return pins.map((pin) => {
    const restX = sanitizeFinite(pin.restX, 0);
    const restY = sanitizeFinite(pin.restY, 0);
    const locked = Boolean(pin.locked);
    return {
      restX,
      restY,
      targetX: locked ? restX : sanitizeFinite(pin.targetX, restX),
      targetY: locked ? restY : sanitizeFinite(pin.targetY, restY),
      rotationRad: (locked ? 0 : clamp(sanitizeFinite(pin.rotationDeg, 0), -180, 180)) * DEG_TO_RAD,
      locked,
    };
  });
}

/** 2D 변형용 삼각형 분할 격자 메쉬(셀당 삼각형 2개, 체커보드 대칭 분할)를 생성한다. */
export function buildDeformableGridMesh(
  width: number,
  height: number,
  cols: number,
  rows: number,
): DeformableGridMesh {
  const safeWidth = Math.max(1, sanitizeFinite(width, DEFAULT_PUPPET_STAGE_WIDTH));
  const safeHeight = Math.max(1, sanitizeFinite(height, DEFAULT_PUPPET_STAGE_HEIGHT));
  const safeCols = clamp(Math.floor(sanitizeFinite(cols, 6)), 1, 64);
  const safeRows = clamp(Math.floor(sanitizeFinite(rows, 8)), 1, 64);
  const stride = safeCols + 1;

  const vertices: MeshVertex2D[] = [];
  for (let row = 0; row <= safeRows; row += 1) {
    const y = (row / safeRows) * safeHeight;
    for (let col = 0; col <= safeCols; col += 1) {
      vertices.push({ x: (col / safeCols) * safeWidth, y });
    }
  }

  const triangles: MeshTriangle[] = [];
  const edges: [number, number][] = [];
  for (let row = 0; row <= safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) edges.push([row * stride + col, row * stride + col + 1]);
  }
  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col <= safeCols; col += 1) edges.push([row * stride + col, (row + 1) * stride + col]);
  }

  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      const tl = row * stride + col;
      const tr = tl + 1;
      const bl = tl + stride;
      const br = bl + 1;
      if ((col + row) % 2 === 0) {
        triangles.push({ i0: tl, i1: tr, i2: br }, { i0: tl, i1: br, i2: bl });
        edges.push([tl, br]);
      } else {
        triangles.push({ i0: tl, i1: tr, i2: bl }, { i0: tr, i1: br, i2: bl });
        edges.push([tr, bl]);
      }
    }
  }

  return { width: safeWidth, height: safeHeight, cols: safeCols, rows: safeRows, vertices, triangles, edges };
}

function evaluateEffectiveMlsPoint(
  vx: number,
  vy: number,
  effectivePins: readonly EffectivePin[],
  safeAlpha: number,
): MeshVertex2D {
  const count = effectivePins.length;
  if (count === 0) return { x: vx, y: vy };

  if (count === 1) {
    const pin = effectivePins[0];
    if (!pin) return { x: vx, y: vy };
    const dx = vx - pin.restX;
    const dy = vy - pin.restY;
    if (pin.rotationRad === 0) return { x: pin.targetX + dx, y: pin.targetY + dy };
    const cos = Math.cos(pin.rotationRad);
    const sin = Math.sin(pin.rotationRad);
    return { x: pin.targetX + (cos * dx - sin * dy), y: pin.targetY + (sin * dx + cos * dy) };
  }

  let minDistSq = Number.POSITIVE_INFINITY;
  const distSqList = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const pin = effectivePins[i];
    if (!pin) continue;
    const dx = vx - pin.restX;
    const dy = vy - pin.restY;
    const d2 = dx * dx + dy * dy;
    distSqList[i] = d2;
    if (d2 < minDistSq) minDistSq = d2;
  }

  if (minDistSq <= SINGULAR_DIST_SQ) {
    let lockedCount = 0;
    let lockedSumX = 0;
    let lockedSumY = 0;
    let hitCount = 0;
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < count; i += 1) {
      const pin = effectivePins[i];
      if (!pin || (distSqList[i] ?? Number.POSITIVE_INFINITY) > SINGULAR_DIST_SQ) continue;
      hitCount += 1;
      sumX += pin.targetX;
      sumY += pin.targetY;
      if (pin.locked) {
        lockedCount += 1;
        lockedSumX += pin.targetX;
        lockedSumY += pin.targetY;
      }
    }
    if (lockedCount > 0) return { x: lockedSumX / lockedCount, y: lockedSumY / lockedCount };
    if (hitCount > 0) return { x: sumX / hitCount, y: sumY / hitCount };
  }

  // 수치 안정 스케일 가중치: w_i = (d_min^2 / d_i^2)^alpha ∈ (0, 1]
  // SIGGRAPH 2006 Eq. (1) w_i = |p_i - v|^(-2*alpha) 와 정확히 비례하며 오버/언더플로 0건
  const weights = new Float64Array(count);
  let sumW = 0;
  let pStarX = 0;
  let pStarY = 0;
  let qStarX = 0;
  let qStarY = 0;
  let weightedRotRad = 0;

  for (let i = 0; i < count; i += 1) {
    const pin = effectivePins[i];
    const d2 = distSqList[i] ?? 1;
    if (!pin) continue;
    const ratio = minDistSq / d2;
    const w = safeAlpha === 2 ? ratio * ratio : Math.pow(ratio, safeAlpha);
    weights[i] = w;
    sumW += w;
    pStarX += w * pin.restX;
    pStarY += w * pin.restY;
    qStarX += w * pin.targetX;
    qStarY += w * pin.targetY;
    weightedRotRad += w * pin.rotationRad;
  }

  if (sumW <= 0 || !Number.isFinite(sumW)) return { x: vx, y: vy };

  pStarX /= sumW;
  pStarY /= sumW;
  qStarX /= sumW;
  qStarY /= sumW;
  const pinRotOffsetRad = weightedRotRad / sumW;

  // SIGGRAPH 2006 Rigid MLS: A = Σ w_i (p̂_i · q̂_i), B = Σ w_i (p̂_i^⊥ · q̂_i), R = [[A,-B],[B,A]] / μ_r
  let a = 0;
  let b = 0;
  for (let i = 0; i < count; i += 1) {
    const pin = effectivePins[i];
    const w = weights[i] ?? 0;
    if (!pin || w <= 0) continue;
    const pHatX = pin.restX - pStarX;
    const pHatY = pin.restY - pStarY;
    const qHatX = pin.targetX - qStarX;
    const qHatY = pin.targetY - qStarY;
    a += w * (pHatX * qHatX + pHatY * qHatY);
    b += w * (-pHatY * qHatX + pHatX * qHatY);
  }

  const muR = Math.hypot(a, b);
  const totalAngleRad = (muR > DETERMINANT_EPS ? Math.atan2(b, a) : 0) + pinRotOffsetRad;
  const cos = Math.cos(totalAngleRad);
  const sin = Math.sin(totalAngleRad);
  const relX = vx - pStarX;
  const relY = vy - pStarY;
  return { x: qStarX + (cos * relX - sin * relY), y: qStarY + (sin * relX + cos * relY) };
}

/** 단일 점 (x, y)에 대해 SIGGRAPH 2006 MLS Rigid 변형 좌표를 계산한다. */
export function evaluateMlsRigidPoint(
  x: number,
  y: number,
  pins: readonly PuppetWarpPin[],
  alpha: number = DEFAULT_MLS_ALPHA,
): MeshVertex2D {
  const safeAlpha = clamp(sanitizeFinite(alpha, DEFAULT_MLS_ALPHA), 0.5, 4.0);
  return evaluateEffectiveMlsPoint(sanitizeFinite(x, 0), sanitizeFinite(y, 0), normalizePins(pins), safeAlpha);
}

/**
 * SIGGRAPH 2006 Moving Least Squares Rigid 변형으로 메쉬 전체 정점의 변형 좌표 (x', y')를 계산한다.
 * - 핀 0개: 항등 변환 / 핀 1개: 강체 평행이동+회전 / 핀 2+개: 관절 강체 굽힘 / locked: true 핀 고정
 */
export function computeMlsRigidDeformation(
  mesh: DeformableGridMesh,
  pins: readonly PuppetWarpPin[],
  alpha: number = DEFAULT_MLS_ALPHA,
): readonly MeshVertex2D[] {
  const safeAlpha = clamp(sanitizeFinite(alpha, DEFAULT_MLS_ALPHA), 0.5, 4.0);
  const effectivePins = normalizePins(pins);
  return mesh.vertices.map((vertex) => evaluateEffectiveMlsPoint(vertex.x, vertex.y, effectivePins, safeAlpha));
}

/** 변형된 삼각형 메쉬 상에서 기준점 (rx, ry)의 무게중심 보간 좌표를 조회한다. */
export function interpolatePointOnDeformedMesh(
  rx: number,
  ry: number,
  mesh: DeformableGridMesh,
  deformedVertices: readonly MeshVertex2D[],
): MeshVertex2D | null {
  if (deformedVertices.length !== mesh.vertices.length) return null;
  for (const tri of mesh.triangles) {
    const s0 = mesh.vertices[tri.i0];
    const s1 = mesh.vertices[tri.i1];
    const s2 = mesh.vertices[tri.i2];
    const d0 = deformedVertices[tri.i0];
    const d1 = deformedVertices[tri.i1];
    const d2 = deformedVertices[tri.i2];
    if (!s0 || !s1 || !s2 || !d0 || !d1 || !d2) continue;

    const denom = (s1.y - s2.y) * (s0.x - s2.x) + (s2.x - s1.x) * (s0.y - s2.y);
    if (Math.abs(denom) < DETERMINANT_EPS) continue;
    const b0 = ((s1.y - s2.y) * (rx - s2.x) + (s2.x - s1.x) * (ry - s2.y)) / denom;
    const b1 = ((s2.y - s0.y) * (rx - s2.x) + (s0.x - s2.x) * (ry - s2.y)) / denom;
    const b2 = 1 - b0 - b1;
    if (b0 >= BARYCENTRIC_EDGE_EPS && b1 >= BARYCENTRIC_EDGE_EPS && b2 >= BARYCENTRIC_EDGE_EPS) {
      return { x: b0 * d0.x + b1 * d1.x + b2 * d2.x, y: b0 * d0.y + b1 * d1.y + b2 * d2.y };
    }
  }
  return null;
}

/**
 * 역매핑 무게중심(Barycentric) + 알파 가중 쌍선형(Bilinear) 보간으로
 * 실제 RGBA 픽셀 버퍼를 변형 메쉬에 맞춰 워프한다.
 */
export function warpRgbaImageWithPuppetMesh(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  mesh: DeformableGridMesh,
  deformedVertices: readonly MeshVertex2D[],
): Uint8ClampedArray {
  const safeW = Math.floor(sanitizeFinite(width, 0));
  const safeH = Math.floor(sanitizeFinite(height, 0));
  if (safeW <= 0 || safeH <= 0) return new Uint8ClampedArray(0);

  const expectedLength = safeW * safeH * 4;
  const dstRgba = new Uint8ClampedArray(expectedLength);
  if (srcRgba.length < expectedLength || deformedVertices.length !== mesh.vertices.length) return dstRgba;

  const maxSrcX = safeW - 1;
  const maxSrcY = safeH - 1;

  for (const tri of mesh.triangles) {
    const s0 = mesh.vertices[tri.i0];
    const s1 = mesh.vertices[tri.i1];
    const s2 = mesh.vertices[tri.i2];
    const d0 = deformedVertices[tri.i0];
    const d1 = deformedVertices[tri.i1];
    const d2 = deformedVertices[tri.i2];
    if (!s0 || !s1 || !s2 || !d0 || !d1 || !d2) continue;
    if (![d0.x, d0.y, d1.x, d1.y, d2.x, d2.y].every(Number.isFinite)) continue;

    const denom = (d1.y - d2.y) * (d0.x - d2.x) + (d2.x - d1.x) * (d0.y - d2.y);
    if (!Number.isFinite(denom) || Math.abs(denom) < DETERMINANT_EPS) continue;
    const invDenom = 1 / denom;

    const minX = Math.max(0, Math.floor(Math.min(d0.x, d1.x, d2.x)));
    const maxX = Math.min(maxSrcX, Math.ceil(Math.max(d0.x, d1.x, d2.x)));
    const minY = Math.max(0, Math.floor(Math.min(d0.y, d1.y, d2.y)));
    const maxY = Math.min(maxSrcY, Math.ceil(Math.max(d0.y, d1.y, d2.y)));
    if (minX > maxX || minY > maxY) continue;

    const e12y = d1.y - d2.y;
    const e21x = d2.x - d1.x;
    const e20y = d2.y - d0.y;
    const e02x = d0.x - d2.x;

    for (let py = minY; py <= maxY; py += 1) {
      const dy2 = py + 0.5 - d2.y;
      const rowOffset = py * safeW;
      for (let px = minX; px <= maxX; px += 1) {
        const dx2 = px + 0.5 - d2.x;
        const b0 = (e12y * dx2 + e21x * dy2) * invDenom;
        if (b0 < BARYCENTRIC_EDGE_EPS) continue;
        const b1 = (e20y * dx2 + e02x * dy2) * invDenom;
        if (b1 < BARYCENTRIC_EDGE_EPS) continue;
        const b2 = 1 - b0 - b1;
        if (b2 < BARYCENTRIC_EDGE_EPS) continue;

        const srcX = b0 * s0.x + b1 * s1.x + b2 * s2.x - 0.5;
        const srcY = b0 * s0.y + b1 * s1.y + b2 * s2.y - 0.5;
        if (srcX < -0.5 || srcX > safeW - 0.5 || srcY < -0.5 || srcY > safeH - 0.5) continue;

        const cu = clamp(srcX, 0, maxSrcX);
        const cv = clamp(srcY, 0, maxSrcY);
        const x0 = Math.floor(cu);
        const y0 = Math.floor(cv);
        const x1 = x0 < maxSrcX ? x0 + 1 : maxSrcX;
        const y1 = y0 < maxSrcY ? y0 + 1 : maxSrcY;
        const tx = cu - x0;
        const ty = cv - y0;

        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;
        const idx00 = (y0 * safeW + x0) * 4;
        const idx10 = (y0 * safeW + x1) * 4;
        const idx01 = (y1 * safeW + x0) * 4;
        const idx11 = (y1 * safeW + x1) * 4;

        const a00 = srcRgba[idx00 + 3] ?? 0;
        const a10 = srcRgba[idx10 + 3] ?? 0;
        const a01 = srcRgba[idx01 + 3] ?? 0;
        const a11 = srcRgba[idx11 + 3] ?? 0;
        const alphaOut = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
        if (alphaOut <= 0.5) continue;

        const wa00 = a00 * w00;
        const wa10 = a10 * w10;
        const wa01 = a01 * w01;
        const wa11 = a11 * w11;
        const invAlpha = 1 / alphaOut;
        const dstIdx = (rowOffset + px) * 4;

        dstRgba[dstIdx] = Math.round(((srcRgba[idx00] ?? 0) * wa00 + (srcRgba[idx10] ?? 0) * wa10 + (srcRgba[idx01] ?? 0) * wa01 + (srcRgba[idx11] ?? 0) * wa11) * invAlpha);
        dstRgba[dstIdx + 1] = Math.round(((srcRgba[idx00 + 1] ?? 0) * wa00 + (srcRgba[idx10 + 1] ?? 0) * wa10 + (srcRgba[idx01 + 1] ?? 0) * wa01 + (srcRgba[idx11 + 1] ?? 0) * wa11) * invAlpha);
        dstRgba[dstIdx + 2] = Math.round(((srcRgba[idx00 + 2] ?? 0) * wa00 + (srcRgba[idx10 + 2] ?? 0) * wa10 + (srcRgba[idx01 + 2] ?? 0) * wa01 + (srcRgba[idx11 + 2] ?? 0) * wa11) * invAlpha);
        dstRgba[dstIdx + 3] = Math.round(alphaOut);
      }
    }
  }
  return dstRgba;
}

/** 기본 웹툰 캐릭터 7-핀 관절 리깅(기준 휴식 자세)을 생성한다. */
export function createDefaultWebtoonPuppetPins(
  width: number = DEFAULT_PUPPET_STAGE_WIDTH,
  height: number = DEFAULT_PUPPET_STAGE_HEIGHT,
  locale: "ko" | "en" = "ko",
): readonly PuppetWarpPin[] {
  const safeW = Math.max(1, sanitizeFinite(width, DEFAULT_PUPPET_STAGE_WIDTH));
  const safeH = Math.max(1, sanitizeFinite(height, DEFAULT_PUPPET_STAGE_HEIGHT));
  const specs: readonly { readonly id: string; readonly ko: string; readonly en: string; readonly rx: number; readonly ry: number; readonly locked: boolean }[] = [
    { id: "hair-tip", ko: "머리카락 끝", en: "Hair Tip", rx: 0.64, ry: 0.14, locked: false },
    { id: "head", ko: "머리", en: "Head", rx: 0.5, ry: 0.2, locked: false },
    { id: "neck", ko: "목·어깨", en: "Neck / Shoulders", rx: 0.5, ry: 0.34, locked: true },
    { id: "right-hand", ko: "오른손", en: "Right Hand", rx: 0.24, ry: 0.55, locked: false },
    { id: "left-hand", ko: "왼손", en: "Left Hand", rx: 0.76, ry: 0.55, locked: false },
    { id: "waist", ko: "허리", en: "Waist", rx: 0.5, ry: 0.56, locked: false },
    { id: "pelvis", ko: "골반·하체", en: "Pelvis / Base", rx: 0.5, ry: 0.82, locked: true },
  ];
  return specs.map((spec) => {
    const restX = Math.round(spec.rx * safeW * 10) / 10;
    const restY = Math.round(spec.ry * safeH * 10) / 10;
    return { id: spec.id, restX, restY, targetX: restX, targetY: restY, rotationDeg: 0, locked: spec.locked, label: locale === "en" ? spec.en : spec.ko };
  });
}

/** 4종 웹툰 포즈 원클릭 프리셋 핀 배열을 생성한다. */
export function createPuppetWarpPresetPins(
  presetId: PuppetWarpPresetId,
  width: number = DEFAULT_PUPPET_STAGE_WIDTH,
  height: number = DEFAULT_PUPPET_STAGE_HEIGHT,
  locale: "ko" | "en" = "ko",
): readonly PuppetWarpPin[] {
  const base = createDefaultWebtoonPuppetPins(width, height, locale);
  const safeW = Math.max(1, sanitizeFinite(width, DEFAULT_PUPPET_STAGE_WIDTH));
  const safeH = Math.max(1, sanitizeFinite(height, DEFAULT_PUPPET_STAGE_HEIGHT));

  type OffsetSpec = { readonly dx: number; readonly dy: number; readonly rotationDeg: number; readonly locked: boolean };
  const presets: Record<PuppetWarpPresetId, Readonly<Record<string, OffsetSpec>>> = {
    "head-nod": {
      "hair-tip": { dx: 0.05, dy: 0.06, rotationDeg: 14, locked: false },
      head: { dx: 0.04, dy: 0.06, rotationDeg: 18, locked: false },
      neck: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      "right-hand": { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      "left-hand": { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      waist: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      pelvis: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
    },
    "raise-right-arm": {
      "hair-tip": { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      head: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      neck: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      "right-hand": { dx: -0.05, dy: -0.26, rotationDeg: -34, locked: false },
      "left-hand": { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      waist: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      pelvis: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
    },
    "dynamic-waist-bend": {
      "hair-tip": { dx: 0.15, dy: 0.06, rotationDeg: 22, locked: false },
      head: { dx: 0.16, dy: 0.08, rotationDeg: 24, locked: false },
      neck: { dx: 0.12, dy: 0.05, rotationDeg: 18, locked: false },
      "right-hand": { dx: 0.09, dy: -0.08, rotationDeg: 16, locked: false },
      "left-hand": { dx: 0.1, dy: 0.1, rotationDeg: 14, locked: false },
      waist: { dx: 0.06, dy: 0.02, rotationDeg: 12, locked: false },
      pelvis: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
    },
    "wind-blown-hair": {
      "hair-tip": { dx: 0.18, dy: -0.08, rotationDeg: -28, locked: false },
      head: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      neck: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      "right-hand": { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      "left-hand": { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      waist: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
      pelvis: { dx: 0, dy: 0, rotationDeg: 0, locked: true },
    },
  };

  const map = presets[presetId];
  return base.map((pin) => {
    const spec = map[pin.id];
    if (!spec) return pin;
    return {
      ...pin,
      targetX: spec.locked ? pin.restX : Math.round((pin.restX + spec.dx * safeW) * 10) / 10,
      targetY: spec.locked ? pin.restY : Math.round((pin.restY + spec.dy * safeH) * 10) / 10,
      rotationDeg: spec.locked ? 0 : spec.rotationDeg,
      locked: spec.locked,
    };
  });
}

/** 프리뷰 SVG 및 MLS 왜곡 비교용 경량 웹툰 캐릭터 실루엣 기준 폴리곤을 생성한다. */
export function buildDemoCharacterSilhouette(
  width: number = DEFAULT_PUPPET_STAGE_WIDTH,
  height: number = DEFAULT_PUPPET_STAGE_HEIGHT,
): readonly CharacterSilhouettePart[] {
  const safeW = Math.max(1, sanitizeFinite(width, DEFAULT_PUPPET_STAGE_WIDTH));
  const safeH = Math.max(1, sanitizeFinite(height, DEFAULT_PUPPET_STAGE_HEIGHT));
  const pt = (nx: number, ny: number): MeshVertex2D => ({ x: nx * safeW, y: ny * safeH });
  const headPoints: MeshVertex2D[] = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    return pt(0.5 + Math.cos(angle) * 0.11, 0.2 + Math.sin(angle) * 0.088);
  });

  return [
    {
      id: "hair",
      closed: true,
      points: [pt(0.41, 0.15), pt(0.5, 0.09), pt(0.61, 0.11), pt(0.71, 0.15), pt(0.66, 0.22), pt(0.6, 0.19), pt(0.55, 0.26), pt(0.44, 0.22)],
    },
    { id: "head", closed: true, points: headPoints },
    {
      id: "torso",
      closed: true,
      points: [pt(0.45, 0.29), pt(0.55, 0.29), pt(0.61, 0.35), pt(0.58, 0.58), pt(0.61, 0.86), pt(0.52, 0.86), pt(0.5, 0.68), pt(0.48, 0.86), pt(0.39, 0.86), pt(0.42, 0.58), pt(0.39, 0.35)],
    },
    {
      id: "right-arm",
      closed: true,
      points: [pt(0.39, 0.35), pt(0.31, 0.44), pt(0.21, 0.55), pt(0.26, 0.59), pt(0.37, 0.48), pt(0.42, 0.42)],
    },
    {
      id: "left-arm",
      closed: true,
      points: [pt(0.61, 0.35), pt(0.69, 0.44), pt(0.79, 0.55), pt(0.74, 0.59), pt(0.63, 0.48), pt(0.58, 0.42)],
    },
  ];
}

/** 데모 웹툰 캐릭터 RGBA 픽셀 버퍼(DOM Canvas 비의존)를 수학적으로 생성한다. */
export function createDemoCharacterRgba(width: number, height: number): Uint8ClampedArray {
  const safeW = Math.max(1, Math.floor(sanitizeFinite(width, 64)));
  const safeH = Math.max(1, Math.floor(sanitizeFinite(height, 80)));
  const rgba = new Uint8ClampedArray(safeW * safeH * 4);

  const paintCapsule = (ax: number, ay: number, bx: number, by: number, r: number, color: readonly [number, number, number, number]): void => {
    const r2 = r * r;
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = Math.max(1e-6, abx * abx + aby * aby);
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - r));
    const maxX = Math.min(safeW - 1, Math.ceil(Math.max(ax, bx) + r));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - r));
    const maxY = Math.min(safeH - 1, Math.ceil(Math.max(ay, by) + r));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const t = clamp((px * abx + py * aby) / abLenSq, 0, 1);
        const dx = px - abx * t;
        const dy = py - aby * t;
        if (dx * dx + dy * dy <= r2) {
          const idx = (y * safeW + x) * 4;
          rgba[idx] = color[0];
          rgba[idx + 1] = color[1];
          rgba[idx + 2] = color[2];
          rgba[idx + 3] = color[3];
        }
      }
    }
  };

  const unit = Math.min(safeW, safeH);
  paintCapsule(0.45 * safeW, 0.58 * safeH, 0.43 * safeW, 0.86 * safeH, 0.055 * unit, [68, 86, 122, 255]);
  paintCapsule(0.55 * safeW, 0.58 * safeH, 0.57 * safeW, 0.86 * safeH, 0.055 * unit, [68, 86, 122, 255]);
  paintCapsule(0.5 * safeW, 0.34 * safeH, 0.5 * safeW, 0.58 * safeH, 0.1 * unit, [212, 118, 72, 255]);
  paintCapsule(0.41 * safeW, 0.36 * safeH, 0.24 * safeW, 0.56 * safeH, 0.048 * unit, [236, 198, 168, 255]);
  paintCapsule(0.59 * safeW, 0.36 * safeH, 0.76 * safeW, 0.56 * safeH, 0.048 * unit, [236, 198, 168, 255]);
  paintCapsule(0.5 * safeW, 0.2 * safeH, 0.5 * safeW, 0.2 * safeH, 0.11 * unit, [242, 210, 184, 255]);
  paintCapsule(0.52 * safeW, 0.14 * safeH, 0.66 * safeW, 0.16 * safeH, 0.052 * unit, [54, 48, 66, 255]);
  return rgba;
}

/** 현재 퍼펫 메쉬 변형량 및 핀 고정점 잔차 지표를 계산한다. */
export function computePuppetWarpMetrics(
  mesh: DeformableGridMesh,
  deformedVertices: readonly MeshVertex2D[],
  pins: readonly PuppetWarpPin[],
): PuppetWarpMetrics {
  let maxDisp = 0;
  let sumDisp = 0;
  const count = Math.min(mesh.vertices.length, deformedVertices.length);
  for (let i = 0; i < count; i += 1) {
    const rest = mesh.vertices[i];
    const def = deformedVertices[i];
    if (!rest || !def) continue;
    const disp = Math.hypot(def.x - rest.x, def.y - rest.y);
    if (disp > maxDisp) maxDisp = disp;
    sumDisp += disp;
  }

  let lockedPinCount = 0;
  let maxPinResidualPx = 0;
  for (const pin of pins) {
    if (pin.locked) lockedPinCount += 1;
    const expectedX = pin.locked ? pin.restX : pin.targetX;
    const expectedY = pin.locked ? pin.restY : pin.targetY;
    const mapped = interpolatePointOnDeformedMesh(pin.restX, pin.restY, mesh, deformedVertices);
    if (mapped) {
      const err = Math.hypot(mapped.x - expectedX, mapped.y - expectedY);
      if (err > maxPinResidualPx) maxPinResidualPx = err;
    }
  }

  return {
    pinCount: pins.length,
    lockedPinCount,
    activePinCount: pins.length - lockedPinCount,
    triangleCount: mesh.triangles.length,
    maxVertexDisplacementPx: maxDisp,
    meanVertexDisplacementPx: count > 0 ? sumDisp / count : 0,
    maxPinResidualPx,
  };
}
