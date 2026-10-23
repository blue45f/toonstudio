/**
 * 생성 헤어를 씌울 두상 맞춤(head fit) — three.js 없는 순수 수치 코어.
 *
 * 왜 따로 있나(A-01, 2026-10-23 감사 P0). 예전 런타임은 두상 반경을 "눈 본 간격 × 2.15" 로
 * 추정했다. 번들 VRM 108개를 GLB 에서 직접 재 보니 이 추정은 실제 두상 반폭의 0.6~0.9배였다
 * (루미 0.0745 m 대 0.1088 m, 시드상 0.0695 대 0.1095). 캡 반경이 곧 이 값이라 캡과 대부분의
 * 가닥이 두피 **안쪽**에 생겨 원본 헤어만 사라진 민머리가 됐다. 눈 간격과 두상 폭의 비는
 * 모델마다 2.4~3.1 로 흩어져 있어 계수만 고쳐서는 맞출 수 없다.
 *
 * 그래서 두상을 **직접 잰다**. 런타임(`studio-vrm-head-measure.ts`)이 머리 본이 지배하는 스킨
 * 정점을 정규화 머리 본 좌표로 모으면, 여기서는 그 점들을 높이 띠(slab)로 요약한 프로필로
 * 두개골(이마 위) 타원체를 맞춘다. 같은 함수가 단위 테스트에서는 실측 VRM 프로필 fixture 를,
 * 헤어 카드 썸네일에서는 마지막으로 잰 맞춤 결과를 쓴다.
 *
 * 좌표 규약: 정규화 머리 본 로컬(m). x 는 좌우, y 는 위, z 는 VRM 파일 좌표 그대로라 얼굴
 * 방향이 VRM0 은 −z, VRM1 은 +z 다. 프로필은 얼굴 쪽이 + 가 되는 깊이 d = frontSign·z 로 저장한다.
 */

export type StudioVrmHeadVec3 = readonly [number, number, number];
export type StudioVrmHeadRimPoint = readonly [number, number];

/** x-d 평면 8방위 섹터 수. 0=+x, 2=+d(얼굴), 4=−x, 6=−d(뒤통수). */
export const STUDIO_VRM_HEAD_RIM_SECTORS = 8;

/** 높이 띠 하나의 범위 요약. 빈 띠는 count 0 이고 범위 값은 0, rim 은 전부 null 이다. */
export interface StudioVrmHeadSlab {
  readonly y0: number;
  readonly y1: number;
  readonly count: number;
  readonly minX: number;
  readonly maxX: number;
  /** 얼굴 쪽이 + 인 깊이(d = frontSign·z). */
  readonly minD: number;
  readonly maxD: number;
  /** 섹터마다 머리 본 축(x=0, d=0)에서 가장 먼 점 [x, d]. 모서리(정수리 앞·뒤 대각)를 놓치지 않는다. */
  readonly rim: readonly (StudioVrmHeadRimPoint | null)[];
}

export interface StudioVrmHeadProfile {
  readonly version: 1;
  readonly frontSign: 1 | -1;
  readonly sampleCount: number;
  readonly slabs: readonly StudioVrmHeadSlab[];
}

export interface StudioVrmHeadFitInput {
  readonly profile: StudioVrmHeadProfile | null;
  /** 정규화 머리 본 로컬 눈 중심. 눈 본이 없는 모델은 null. */
  readonly eyeCenter: StudioVrmHeadVec3 | null;
  readonly eyeDistance: number;
  readonly frontSign: 1 | -1;
  /** 모델 전체 높이(머리 본 로컬 단위). 측정이 실패했을 때의 대체 크기와 이상치 판정에 쓴다. */
  readonly modelHeight: number;
}

export interface StudioVrmHeadFit {
  /** mesh = 스킨 정점 실측, eyes = 눈 간격 대체, height = 모델 키 대체. */
  readonly source: "mesh" | "eyes" | "height";
  /** 캡 타원체 중심(머리 본 로컬). */
  readonly center: StudioVrmHeadVec3;
  readonly eyeCenter: StudioVrmHeadVec3;
  /**
   * 두개골(이마 위)을 감싸는 타원체 반경. 헤어 단위 공간의 캡 반경(0.56×0.46×0.54)이 여기에
   * 사상되고, 캡 껍질 두께는 헤어 쪽 규칙(`studio-vrm-avatar-forge-hair-object.ts`)이 바깥으로 더한다.
   */
  readonly radiusX: number;
  readonly radiusY: number;
  readonly radiusZ: number;
  /**
   * 이마·눈썹 높이의 얼굴 앞면 깊이(d = frontSign·z). 앞머리는 이 면 바로 앞에 놓인다 — 두개골을
   * 감싸는 타원체는 이마보다 2cm 가까이 앞이라 그 위에 두면 앞머리가 떠 보이고, 안쪽에 두면 이마에 묻힌다.
   */
  readonly faceFront: number;
  readonly frontSign: 1 | -1;
}

/** 프로필 높이 띠 수. 머리 높이 약 0.24 m 기준 띠 하나가 1.5 cm 다. */
export const STUDIO_VRM_HEAD_PROFILE_SLABS = 16;
/** 이보다 적은 정점이면 실측을 믿지 않고 대체 경로로 간다. */
export const STUDIO_VRM_HEAD_PROFILE_MIN_SAMPLES = 48;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function rimSector(x: number, d: number): number {
  const angle = Math.atan2(d, x);
  const step = (Math.PI * 2) / STUDIO_VRM_HEAD_RIM_SECTORS;
  return ((Math.round(angle / step) % STUDIO_VRM_HEAD_RIM_SECTORS) + STUDIO_VRM_HEAD_RIM_SECTORS)
    % STUDIO_VRM_HEAD_RIM_SECTORS;
}

/**
 * 머리 본 로컬 점 묶음(xyz 연속 배열)을 높이 띠 프로필로 요약한다.
 * 점이 너무 적거나 높이가 없으면 null — 호출자는 대체 경로를 탄다.
 */
export function buildStudioVrmHeadProfile(
  points: ArrayLike<number>,
  frontSign: 1 | -1,
  slabCount = STUDIO_VRM_HEAD_PROFILE_SLABS,
): StudioVrmHeadProfile | null {
  const count = Math.floor(points.length / 3);
  if (count < STUDIO_VRM_HEAD_PROFILE_MIN_SAMPLES) return null;
  const slabsWanted = Math.max(4, Math.min(64, Math.round(finite(slabCount, STUDIO_VRM_HEAD_PROFILE_SLABS))));
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let valid = 0;
  for (let index = 0; index < count; index += 1) {
    const x = points[index * 3];
    const y = points[index * 3 + 1];
    const z = points[index * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    valid += 1;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (valid < STUDIO_VRM_HEAD_PROFILE_MIN_SAMPLES || !(maxY - minY > 1e-4)) return null;

  const height = maxY - minY;
  const acc = Array.from({ length: slabsWanted }, () => ({
    count: 0,
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minD: Number.POSITIVE_INFINITY,
    maxD: Number.NEGATIVE_INFINITY,
    rim: new Array<StudioVrmHeadRimPoint | null>(STUDIO_VRM_HEAD_RIM_SECTORS).fill(null),
    rimDistance: new Array<number>(STUDIO_VRM_HEAD_RIM_SECTORS).fill(-1),
  }));
  for (let index = 0; index < count; index += 1) {
    const x = points[index * 3];
    const y = points[index * 3 + 1];
    const z = points[index * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const slab = Math.min(slabsWanted - 1, Math.max(0, Math.floor(((y - minY) / height) * slabsWanted)));
    const target = acc[slab];
    const d = frontSign * z;
    target.count += 1;
    if (x < target.minX) target.minX = x;
    if (x > target.maxX) target.maxX = x;
    if (d < target.minD) target.minD = d;
    if (d > target.maxD) target.maxD = d;
    const sector = rimSector(x, d);
    const distance = x * x + d * d;
    if (distance > target.rimDistance[sector]) {
      target.rimDistance[sector] = distance;
      target.rim[sector] = [x, d];
    }
  }
  const slabs = acc.map((slab, index): StudioVrmHeadSlab => Object.freeze({
    y0: minY + (height * index) / slabsWanted,
    y1: minY + (height * (index + 1)) / slabsWanted,
    count: slab.count,
    minX: slab.count > 0 ? slab.minX : 0,
    maxX: slab.count > 0 ? slab.maxX : 0,
    minD: slab.count > 0 ? slab.minD : 0,
    maxD: slab.count > 0 ? slab.maxD : 0,
    rim: Object.freeze([...slab.rim]),
  }));
  return Object.freeze({ version: 1, frontSign, sampleCount: valid, slabs: Object.freeze(slabs) });
}

type SolidSlab = StudioVrmHeadSlab & { readonly mid: number; readonly width: number; readonly depth: number };

function maxOf(values: readonly number[]): number {
  return values.reduce((best, value) => (value > best ? value : best), Number.NEGATIVE_INFINITY);
}

function minOf(values: readonly number[]): number {
  return values.reduce((best, value) => (value < best ? value : best), Number.POSITIVE_INFINITY);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function headFit(
  source: StudioVrmHeadFit["source"],
  center: StudioVrmHeadVec3,
  eyeCenter: StudioVrmHeadVec3,
  skull: { readonly x: number; readonly y: number; readonly z: number },
  faceFront: number,
  frontSign: 1 | -1,
): StudioVrmHeadFit {
  return Object.freeze({
    source,
    center,
    eyeCenter,
    radiusX: skull.x,
    radiusY: skull.y,
    radiusZ: skull.z,
    faceFront,
    frontSign,
  });
}

interface EnclosureShape {
  readonly centerX: number;
  readonly centerY: number;
  readonly centerD: number;
  readonly skullX: number;
  readonly skullY: number;
  readonly skullZ: number;
  readonly craniumFloor: number;
  readonly occiputFloor: number;
  readonly foreheadFloor: number;
}

/** 좌우 거울 섹터 짝. 한쪽에만 달린 장식이 머리 전체를 키우지 않게 짝 중 안쪽 점만 쓴다. */
const MIRROR_PAIRS: readonly (readonly [number, number])[] = [[0, 4], [1, 3], [7, 5]];

/**
 * 캡이 덮어야 하는 두개골 끝점(띠 높이 중앙 기준)을 모두 담는 데 필요한 타원체 배율(≥1).
 * 옆(0·4)은 이마 위, 뒤(5·6·7)는 눈 높이 조금 아래까지, 앞(1·2·3)은 이마 윗부분만 본다 —
 * 귀와 얼굴은 캡이 덮는 곳이 아니다.
 */
function enclosureScale(body: readonly SolidSlab[], shape: EnclosureShape): number {
  let worst = 1;
  const normalized = (point: StudioVrmHeadRimPoint, y: number) => {
    const nx = (point[0] - shape.centerX) / shape.skullX;
    const ny = (y - shape.centerY) / shape.skullY;
    const nz = (point[1] - shape.centerD) / shape.skullZ;
    return Math.sqrt(nx * nx + ny * ny + nz * nz);
  };
  const consider = (value: number) => {
    if (Number.isFinite(value) && value > worst) worst = value;
  };
  for (const slab of body) {
    const y = slab.mid;
    for (const [left, right] of MIRROR_PAIRS) {
      const floor = left === 0 ? shape.craniumFloor : left === 1 ? shape.foreheadFloor : shape.occiputFloor;
      if (y < floor) continue;
      const a = slab.rim[left];
      const b = slab.rim[right];
      if (a && b) consider(Math.min(normalized(a, y), normalized(b, y)));
    }
    const front = slab.rim[2];
    if (front && y >= shape.foreheadFloor) consider(normalized(front, y));
    const back = slab.rim[6];
    if (back && y >= shape.occiputFloor) consider(normalized(back, y));
  }
  // 이상치 하나가 머리 전체를 풍선처럼 키우지 않게 상한을 둔다.
  return Math.min(1.35, worst);
}

/**
 * 프로필에서 두개골 타원체를 맞춘다.
 *
 * 1. 띠마다 **좌우 중 짧은 쪽** 반폭(머리 본은 정중선 위)을 쓴다 — 한쪽에만 달린 리본·꽃 장식 무시.
 * 2. 폭이 최대의 40% 미만이거나 깊이가 30% 미만인 띠(뿔·귀·더듬이처럼 가는 돌출)는 버린다.
 *    단 얼굴 쪽 점만 남은 넓은 띠(정수리를 원본 헤어가 대신한 얼굴 가면형 메시)는 받는다.
 * 3. 이마 위 두개골 띠(눈 높이 + 남은 높이의 30% 위)의 최대 반폭이 두개골 반폭이다 — 귀가 빠진다.
 *    눈 본이 없으면 눈 높이를 두상 높이의 45% 로 둔다(실측: VRoid 0.40, 쿼터니어스 눈 재질 0.50).
 * 4. 앞은 이마, 뒤는 눈 높이 조금 아래까지의 뒤통수. 뒤통수가 빈 모델은 깊이 반경을 반폭
 *    이상으로 보정하고 이마에서 뒤로 잡는다. 정수리가 빈 모델은 눈 위 높이를 반폭의 1.25배 이상으로 둔다.
 * 5. 축 끝만 맞춘 타원체는 각진 두개골의 모서리를 놓치므로 8방위 끝점이 모두 들어오게 키운다.
 */
function fitFromProfile(input: StudioVrmHeadFitInput): StudioVrmHeadFit | null {
  const profile = input.profile;
  if (!profile || profile.sampleCount < STUDIO_VRM_HEAD_PROFILE_MIN_SAMPLES) return null;
  const solid: SolidSlab[] = profile.slabs
    .filter((slab) => slab.count >= 3)
    .map((slab) => ({
      ...slab,
      mid: (slab.y0 + slab.y1) / 2,
      width: Math.min(-slab.minX, slab.maxX),
      depth: slab.maxD - slab.minD,
    }))
    .filter((slab) => slab.width > 0 && slab.depth >= 0);
  if (solid.length < 3) return null;
  const widest = maxOf(solid.map((slab) => slab.width));
  const deepest = maxOf(solid.map((slab) => slab.depth));
  const thick = solid.filter((slab) => slab.width >= widest * 0.4 && slab.depth >= deepest * 0.3);
  if (thick.length < 3) return null;
  const thickCenterD = (maxOf(thick.map((slab) => slab.maxD)) + minOf(thick.map((slab) => slab.minD))) / 2;
  const body = solid.filter((slab) => slab.width >= widest * 0.4
    && (slab.depth >= deepest * 0.3 || slab.minD > thickCenterD));

  const top = maxOf(body.map((slab) => slab.y1));
  const bottom = minOf(body.map((slab) => slab.y0));
  const span = top - bottom;
  if (!(span > 1e-3)) return null;
  const eyeY = input.eyeCenter
    && input.eyeCenter[1] > bottom + span * 0.15
    && input.eyeCenter[1] < top - span * 0.2
    ? input.eyeCenter[1]
    : bottom + span * 0.45;

  const craniumFloor = eyeY + (top - eyeY) * 0.3;
  let cranium = body.filter((slab) => slab.mid >= craniumFloor);
  if (cranium.length === 0) cranium = body.filter((slab) => slab.mid >= eyeY);
  if (cranium.length === 0) return null;
  const skullX = maxOf(cranium.map((slab) => slab.width));
  const centerX = median(cranium.map((slab) => (slab.minX + slab.maxX) / 2));

  const occiputFloor = eyeY - (top - eyeY) * 0.25;
  const upper = body.filter((slab) => slab.mid >= eyeY);
  const occiput = body.filter((slab) => slab.mid >= occiputFloor);
  const front = maxOf((upper.length > 0 ? upper : cranium).map((slab) => slab.maxD));
  const back = minOf((occiput.length > 0 ? occiput : cranium).map((slab) => slab.minD));
  const skullZ = Math.max((front - back) / 2, skullX);
  const centerD = front - skullZ;

  const crown = Math.max(top, eyeY + skullX * 1.25);
  const centerY = eyeY + (crown - eyeY) * 0.16;
  const skullY = crown - centerY;

  const height = finite(input.modelHeight, 0);
  // 머리 본 아래에 몸 전체가 묶인 모델(마스코트 통짜 메시) 같은 이상치는 측정 실패로 본다.
  if (height > 0 && (skullX < height * 0.015 || skullX > height * 0.45)) return null;
  if (!(skullX > 0 && skullY > 0 && skullZ > 0)) return null;

  const enclose = enclosureScale(body, {
    centerX, centerY, centerD, skullX, skullY, skullZ, craniumFloor, occiputFloor,
    foreheadFloor: eyeY + (top - eyeY) * 0.45,
  });
  const frontSign = input.frontSign;
  const eyeCenter: StudioVrmHeadVec3 = input.eyeCenter
    ? input.eyeCenter
    : [centerX, eyeY, frontSign * (centerD + skullZ * 0.9)];
  // 이마·눈썹 띠(눈 높이 조금 아래 ~ 두개골 띠 조금 위)의 얼굴 앞면. 코끝은 눈 아래라 빠진다.
  const brow = body.filter((slab) => slab.mid >= eyeY - (top - eyeY) * 0.05 && slab.mid <= craniumFloor + (top - eyeY) * 0.15);
  const faceFront = brow.length > 0 ? maxOf(brow.map((slab) => slab.maxD)) : front;
  return headFit(
    "mesh",
    [centerX, centerY, frontSign * centerD],
    eyeCenter,
    { x: skullX * enclose, y: skullY * enclose, z: skullZ * enclose },
    faceFront,
    frontSign,
  );
}

/**
 * 실측이 없을 때의 대체. 눈 간격 대비 두상 반폭은 실측 2.37~3.14(중앙값 2.6),
 * 키 대비는 0.050~0.069 다. 예전 계수(×2.15, 키의 0.044)는 둘 다 작은 쪽으로 치우쳐 있었다.
 * 눈 본은 안구 회전 중심이라 얼굴 표면보다 두개골 중심에 가깝다(실측 깊이 반경의 0.12~0.23 앞).
 */
function fitFromLandmarks(input: StudioVrmHeadFitInput): StudioVrmHeadFit {
  const height = Math.min(3.5, Math.max(0.75, finite(input.modelHeight, 1.6)));
  const frontSign = input.frontSign;
  const hasEyes = Boolean(input.eyeCenter) && input.eyeDistance > 1e-4;
  const skullX = hasEyes
    ? Math.min(height * 0.075, Math.max(height * 0.05, input.eyeDistance * 2.6))
    : height * 0.06;
  const skullY = skullX * 1.3;
  const skullZ = skullX * 1.15;
  const eyeCenter: StudioVrmHeadVec3 = hasEyes && input.eyeCenter
    ? input.eyeCenter
    : [0, height * 0.038, frontSign * height * 0.011];
  const center: StudioVrmHeadVec3 = [
    eyeCenter[0],
    eyeCenter[1] + skullY * 0.18,
    eyeCenter[2] - frontSign * skullZ * 0.25,
  ];
  return headFit(
    hasEyes ? "eyes" : "height",
    center,
    eyeCenter,
    { x: skullX, y: skullY, z: skullZ },
    frontSign * center[2] + skullZ * 0.85,
    frontSign,
  );
}

/** 실측 프로필이 쓸 만하면 실측으로, 아니면 눈 간격·키 대체로 두상을 맞춘다. */
export function resolveStudioVrmHeadFit(input: StudioVrmHeadFitInput): StudioVrmHeadFit {
  return fitFromProfile(input) ?? fitFromLandmarks(input);
}

/**
 * 머리 본 로컬 점들이 캡 타원체 안쪽에 드는 비율. 캡이 두피를 실제로 덮는지 단위 테스트와
 * 진단에서 확인한다. `capScale` 은 볼륨 등으로 캡이 기준 반경에서 커지거나 작아진 배율이다.
 */
export function measureStudioVrmHeadCapCoverage(
  fit: StudioVrmHeadFit,
  points: readonly StudioVrmHeadVec3[],
  capScale = 1,
): { readonly covered: number; readonly total: number; readonly ratio: number } {
  const rx = fit.radiusX * capScale;
  const ry = fit.radiusY * capScale;
  const rz = fit.radiusZ * capScale;
  let covered = 0;
  for (const [x, y, z] of points) {
    const nx = (x - fit.center[0]) / rx;
    const ny = (y - fit.center[1]) / ry;
    const nz = (z - fit.center[2]) / rz;
    if (nx * nx + ny * ny + nz * nz <= 1) covered += 1;
  }
  return { covered, total: points.length, ratio: points.length > 0 ? covered / points.length : 0 };
}

/**
 * 2026-10-23 이전 런타임의 눈 간격 추정(회귀 기록용). 새 코드 경로는 쓰지 않는다 — 테스트가
 * "옛 추정은 실측 두상을 덮지 못했다" 를 같은 fixture 로 고정하는 데만 쓴다.
 */
export function legacyStudioVrmEyeSpacingHeadFit(input: StudioVrmHeadFitInput): StudioVrmHeadFit {
  const height = Math.min(3.5, Math.max(0.75, finite(input.modelHeight, 1.6)));
  const hasEyes = Boolean(input.eyeCenter) && input.eyeDistance > 1e-4;
  const radiusX = hasEyes
    ? Math.min(height * 0.07, Math.max(height * 0.035, input.eyeDistance * 2.15))
    : height * 0.044;
  const radiusY = radiusX * 1.18;
  const radiusZ = radiusX * 0.95;
  const eyeCenter: StudioVrmHeadVec3 = hasEyes && input.eyeCenter ? input.eyeCenter : [0, 0.061, 0.018];
  const center: StudioVrmHeadVec3 = [
    eyeCenter[0],
    eyeCenter[1] + radiusY * 0.18,
    eyeCenter[2] - input.frontSign * radiusZ * 0.56,
  ];
  return Object.freeze({
    source: hasEyes ? "eyes" : "height",
    center,
    eyeCenter,
    radiusX,
    radiusY,
    radiusZ,
    faceFront: input.frontSign * center[2] + radiusZ * 0.9,
    frontSign: input.frontSign,
  });
}
