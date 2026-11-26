/**
 * 코시(Cauchy) 파장 분산 보석·마법 프리즘 굴절 커널 및
 * 2-삼각형 의사 3D 실내 매핑(Interior Mapping) 빌딩 외벽 셰이더 커널.
 *
 * - 외부 서버 호출 0회(₩0), 로컬 메모리 상에서 즉시 완결 동작한다.
 * - 적색(650nm)·녹색(550nm)·청색(450nm) 3파장을 코시 분산식(`n(λ) = A + B/λ²`), 스넬 굴절 법칙,
 *   다중 전반사(TIR)로 추적해 보석·크리스탈·마법 결계의 무지개 색수차와 집광 커스틱을 산출한다.
 * - 단 2개의 외벽 삼각형(실내 폴리곤 0개) 안에서 시선-직육면체 교차만으로 천장·바닥·측벽·뒷벽과
 *   야간 호실별 확률 점등을 렌더링해 대규모 도심 야경 배경 비용을 극적으로 줄인다.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const SPECTRAL_WAVELENGTHS_NM = Object.freeze({
  red: 650,
  green: 550,
  blue: 450,
} as const);

export type PrismMaterialPresetId =
  | "diamond"
  | "flint-crystal"
  | "sapphire-gem"
  | "arcane-barrier";

export interface CauchyMaterialSpec {
  readonly presetId?: PrismMaterialPresetId;
  readonly labelKo: string;
  readonly cauchyA: number;
  readonly cauchyB: number;
  readonly absorptionPerUnit?: readonly [number, number, number];
}

export const PRISM_MATERIAL_PRESETS: Readonly<
  Record<PrismMaterialPresetId, CauchyMaterialSpec>
> = Object.freeze({
  diamond: {
    presetId: "diamond",
    labelKo: "브릴리언트 다이아몬드",
    cauchyA: 2.378,
    cauchyB: 0.0134,
    absorptionPerUnit: [0.01, 0.01, 0.012],
  },
  "flint-crystal": {
    presetId: "flint-crystal",
    labelKo: "마법 수정 플린트 유리",
    cauchyA: 1.62,
    cauchyB: 0.0102,
    absorptionPerUnit: [0.02, 0.015, 0.01],
  },
  "sapphire-gem": {
    presetId: "sapphire-gem",
    labelKo: "창공 사파이어 보석",
    cauchyA: 1.755,
    cauchyB: 0.0065,
    absorptionPerUnit: [0.18, 0.06, 0.01],
  },
  "arcane-barrier": {
    presetId: "arcane-barrier",
    labelKo: "고밀도 마력 결계석",
    cauchyA: 1.88,
    cauchyB: 0.0168,
    absorptionPerUnit: [0.03, 0.01, 0.04],
  },
});

export interface CrystalFacetPlane {
  readonly normal: Vec3;
  readonly distance: number;
}

export interface ConvexCrystalPolyhedron {
  readonly planes: readonly CrystalFacetPlane[];
}

export interface SpectralBandRayResult {
  readonly wavelengthNm: number;
  readonly refractiveIndex: number;
  readonly hitCrystal: boolean;
  readonly emergentOrigin: Vec3;
  readonly emergentDirection: Vec3;
  readonly receiverHitPoint: Vec3 | null;
  readonly transmittance: number;
  readonly internalBounceCount: number;
}

export interface SpectralPrismTraceInput {
  readonly rayOrigin: Vec3;
  readonly rayDirection: Vec3;
  readonly crystal: ConvexCrystalPolyhedron;
  readonly material: CauchyMaterialSpec | PrismMaterialPresetId;
  readonly receiverPlaneZ?: number;
  readonly maxInternalBounces?: number;
}

export interface SpectralPrismTraceResult {
  readonly materialLabelKo: string;
  readonly red: SpectralBandRayResult;
  readonly green: SpectralBandRayResult;
  readonly blue: SpectralBandRayResult;
  readonly angularDispersionDeg: number;
  readonly receiverChromaticSpread: number;
  readonly causticConcentration: number;
  readonly serverCostKrw: 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hashUint32(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function unitRandomFromHash(seed: number): number {
  return hashUint32(seed) / 4294967296;
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-12) return { x: 0, y: 0, z: -1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3AddScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

function vec3Reflect(incident: Vec3, normal: Vec3): Vec3 {
  const d = vec3Dot(incident, normal);
  return vec3Normalize({
    x: incident.x - 2 * d * normal.x,
    y: incident.y - 2 * d * normal.y,
    z: incident.z - 2 * d * normal.z,
  });
}

function schlickFresnel(cosThetaI: number, n1: number, n2: number): number {
  const r0Root = (n1 - n2) / (n1 + n2);
  const r0 = r0Root * r0Root;
  const m = clamp01(1 - cosThetaI);
  const m2 = m * m;
  return r0 + (1 - r0) * m2 * m2 * m;
}

/**
 * 코시 분산 방정식 `n(λ) = A + B / λ²` (`λ`는 μm 단위)으로 파장별 굴절률을 계산한다.
 */
export function evaluateCauchyRefractiveIndex(
  wavelengthNm: number,
  cauchyA: number,
  cauchyB: number,
): number {
  const lambdaUm = Math.max(0.25, wavelengthNm * 1e-3);
  return cauchyA + cauchyB / (lambdaUm * lambdaUm);
}

/**
 * 표준 정삼각 기둥 분광 프리즘 볼록 다면체(중심 원점 기준)를 생성한다.
 */
export function createEquilateralPrismPolyhedron(
  apexAngleDeg = 60,
  inradius = 0.6,
  halfLengthZ = 1.5,
): ConvexCrystalPolyhedron {
  const halfApexRad = (clamp(apexAngleDeg, 25, 80) * 0.5 * Math.PI) / 180;
  const nx = Math.cos(halfApexRad);
  const ny = Math.sin(halfApexRad);
  return {
    planes: [
      { normal: { x: -nx, y: ny, z: 0 }, distance: inradius },
      { normal: { x: nx, y: ny, z: 0 }, distance: inradius },
      { normal: { x: 0, y: -1, z: 0 }, distance: inradius },
      { normal: { x: 0, y: 0, z: 1 }, distance: halfLengthZ },
      { normal: { x: 0, y: 0, z: -1 }, distance: halfLengthZ },
    ],
  };
}

/**
 * 다중 전반사와 파빌리온 화염 분산이 일어나는 브릴리언트 컷 보석 볼록 다면체를 생성한다.
 */
export function createBrilliantGemPolyhedron(
  radius = 0.85,
  depthScale = 0.9,
): ConvexCrystalPolyhedron {
  const planes: CrystalFacetPlane[] = [
    { normal: { x: 0, y: 0, z: 1 }, distance: 0.35 * depthScale },
    { normal: { x: 0, y: 0, z: -1 }, distance: 0.72 * depthScale },
  ];
  const crownTilt = 0.58;
  const pavilionTilt = 0.66;
  const crownZ = Math.sqrt(1 - crownTilt * crownTilt);
  const pavZ = Math.sqrt(1 - pavilionTilt * pavilionTilt);
  for (let i = 0; i < 8; i += 1) {
    const phi = (i * Math.PI) / 4;
    const cx = Math.cos(phi);
    const cy = Math.sin(phi);
    planes.push(
      { normal: { x: cx * crownTilt, y: cy * crownTilt, z: crownZ }, distance: radius * 0.76 },
      { normal: { x: cx * pavilionTilt, y: cy * pavilionTilt, z: -pavZ }, distance: radius * 0.74 },
    );
  }
  return { planes };
}

function intersectConvexPolyhedron(
  origin: Vec3,
  dir: Vec3,
  crystal: ConvexCrystalPolyhedron,
): {
  readonly hit: boolean;
  readonly tEnter: number;
  readonly tExit: number;
  readonly enterNormal: Vec3;
  readonly exitNormal: Vec3;
} {
  let tNear = -Infinity;
  let tFar = Infinity;
  let enterNormal: Vec3 = { x: 0, y: 0, z: 1 };
  let exitNormal: Vec3 = { x: 0, y: 0, z: -1 };

  for (const plane of crystal.planes) {
    const numer = plane.distance - vec3Dot(plane.normal, origin);
    const denom = vec3Dot(plane.normal, dir);
    if (Math.abs(denom) < 1e-10) {
      if (numer < 0) return { hit: false, tEnter: 0, tExit: 0, enterNormal, exitNormal };
      continue;
    }
    const t = numer / denom;
    if (denom < 0) {
      if (t > tNear) {
        tNear = t;
        enterNormal = plane.normal;
      }
    } else if (t < tFar) {
      tFar = t;
      exitNormal = plane.normal;
    }
    if (tNear > tFar) return { hit: false, tEnter: 0, tExit: 0, enterNormal, exitNormal };
  }

  if (tFar < 1e-6 || tNear > tFar) {
    return { hit: false, tEnter: 0, tExit: 0, enterNormal, exitNormal };
  }
  return { hit: true, tEnter: Math.max(0, tNear), tExit: tFar, enterNormal, exitNormal };
}

function refractSnell(incident: Vec3, normalAgainstRay: Vec3, eta: number): Vec3 | null {
  const cosI = clamp(-vec3Dot(normalAgainstRay, incident), -1, 1);
  const sin2T = eta * eta * Math.max(0, 1 - cosI * cosI);
  if (sin2T > 1.0) return null;
  const cosT = Math.sqrt(Math.max(0, 1 - sin2T));
  return vec3Normalize({
    x: eta * incident.x + (eta * cosI - cosT) * normalAgainstRay.x,
    y: eta * incident.y + (eta * cosI - cosT) * normalAgainstRay.y,
    z: eta * incident.z + (eta * cosI - cosT) * normalAgainstRay.z,
  });
}

function traceMonochromaticCrystalBand(
  origin: Vec3,
  dirUnit: Vec3,
  crystal: ConvexCrystalPolyhedron,
  wavelengthNm: number,
  nCrystal: number,
  absorptionCoef: number,
  receiverPlaneZ: number,
  maxInternalBounces: number,
): SpectralBandRayResult {
  const nAir = 1.00029;
  const firstHit = intersectConvexPolyhedron(origin, dirUnit, crystal);
  const projectToReceiver = (ro: Vec3, rd: Vec3): Vec3 | null => {
    if (Math.abs(rd.z) < 1e-7) return null;
    const t = (receiverPlaneZ - ro.z) / rd.z;
    return t >= 0 ? vec3AddScaled(ro, rd, t) : null;
  };

  if (!firstHit.hit) {
    return {
      wavelengthNm,
      refractiveIndex: nCrystal,
      hitCrystal: false,
      emergentOrigin: origin,
      emergentDirection: dirUnit,
      receiverHitPoint: projectToReceiver(origin, dirUnit),
      transmittance: 1,
      internalBounceCount: 0,
    };
  }

  const entryPoint = vec3AddScaled(origin, dirUnit, firstHit.tEnter);
  const cosEntry = clamp01(-vec3Dot(firstHit.enterNormal, dirUnit));
  const fEnter = schlickFresnel(cosEntry, nAir, nCrystal);
  const refractedIn = refractSnell(dirUnit, firstHit.enterNormal, nAir / nCrystal);

  if (!refractedIn) {
    const reflected = vec3Reflect(dirUnit, firstHit.enterNormal);
    return {
      wavelengthNm,
      refractiveIndex: nCrystal,
      hitCrystal: true,
      emergentOrigin: entryPoint,
      emergentDirection: reflected,
      receiverHitPoint: projectToReceiver(entryPoint, reflected),
      transmittance: 1,
      internalBounceCount: 0,
    };
  }

  let curPos = vec3AddScaled(entryPoint, refractedIn, 1e-5);
  let curDir = refractedIn;
  let transmittance = Math.max(0.02, 1 - fEnter);
  let bounces = 0;

  for (let step = 0; step <= maxInternalBounces; step += 1) {
    const insideSeg = intersectConvexPolyhedron(curPos, curDir, crystal);
    if (!insideSeg.hit || insideSeg.tExit <= 1e-7) break;

    const exitPoint = vec3AddScaled(curPos, curDir, insideSeg.tExit);
    transmittance *= Math.exp(-Math.max(0, absorptionCoef) * insideSeg.tExit);

    const inwardNormal: Vec3 = {
      x: -insideSeg.exitNormal.x,
      y: -insideSeg.exitNormal.y,
      z: -insideSeg.exitNormal.z,
    };
    const refractedOut = refractSnell(curDir, inwardNormal, nCrystal / nAir);
    if (refractedOut) {
      const fExit = schlickFresnel(clamp01(-vec3Dot(inwardNormal, curDir)), nCrystal, nAir);
      const outOrigin = vec3AddScaled(exitPoint, refractedOut, 1e-5);
      return {
        wavelengthNm,
        refractiveIndex: nCrystal,
        hitCrystal: true,
        emergentOrigin: outOrigin,
        emergentDirection: refractedOut,
        receiverHitPoint: projectToReceiver(outOrigin, refractedOut),
        transmittance: Math.max(0.02, transmittance * (1 - fExit)),
        internalBounceCount: bounces,
      };
    }

    bounces += 1;
    curDir = vec3Reflect(curDir, inwardNormal);
    curPos = vec3AddScaled(exitPoint, curDir, 1e-5);
  }

  return {
    wavelengthNm,
    refractiveIndex: nCrystal,
    hitCrystal: true,
    emergentOrigin: curPos,
    emergentDirection: curDir,
    receiverHitPoint: projectToReceiver(curPos, curDir),
    transmittance,
    internalBounceCount: bounces,
  };
}

/**
 * 650nm(R)·550nm(G)·450nm(B) 3개 분광 대역을 스넬의 법칙 + 코시 굴절률 + 전반사로 추적하고,
 * 투영 평면 위 무지개 색분산 폭과 미소 광선 다발 야코비안 기반 집광(커스틱) 밀도를 산출한다.
 */
export function traceSpectralPrismRay(input: SpectralPrismTraceInput): SpectralPrismTraceResult {
  const mat =
    typeof input.material === "string" ? PRISM_MATERIAL_PRESETS[input.material] : input.material;
  const receiverPlaneZ = input.receiverPlaneZ ?? -2.5;
  const maxBounces = clamp(Math.floor(input.maxInternalBounces ?? 6), 1, 16);
  const dirUnit = vec3Normalize(input.rayDirection);
  const abs = mat.absorptionPerUnit ?? [0.015, 0.015, 0.015];

  const nRed = evaluateCauchyRefractiveIndex(SPECTRAL_WAVELENGTHS_NM.red, mat.cauchyA, mat.cauchyB);
  const nGreen = evaluateCauchyRefractiveIndex(SPECTRAL_WAVELENGTHS_NM.green, mat.cauchyA, mat.cauchyB);
  const nBlue = evaluateCauchyRefractiveIndex(SPECTRAL_WAVELENGTHS_NM.blue, mat.cauchyA, mat.cauchyB);

  const red = traceMonochromaticCrystalBand(
    input.rayOrigin, dirUnit, input.crystal, SPECTRAL_WAVELENGTHS_NM.red, nRed, abs[0], receiverPlaneZ, maxBounces,
  );
  const green = traceMonochromaticCrystalBand(
    input.rayOrigin, dirUnit, input.crystal, SPECTRAL_WAVELENGTHS_NM.green, nGreen, abs[1], receiverPlaneZ, maxBounces,
  );
  const blue = traceMonochromaticCrystalBand(
    input.rayOrigin, dirUnit, input.crystal, SPECTRAL_WAVELENGTHS_NM.blue, nBlue, abs[2], receiverPlaneZ, maxBounces,
  );

  const cosRB = clamp(vec3Dot(red.emergentDirection, blue.emergentDirection), -1, 1);
  const angularDispersionDeg = (Math.acos(cosRB) * 180) / Math.PI;
  const receiverChromaticSpread =
    red.receiverHitPoint && blue.receiverHitPoint
      ? Math.hypot(
          red.receiverHitPoint.x - blue.receiverHitPoint.x,
          red.receiverHitPoint.y - blue.receiverHitPoint.y,
        )
      : 0;

  let causticConcentration = 1.0;
  if (green.hitCrystal && green.receiverHitPoint) {
    const eps = 1e-3;
    const dxRay = traceMonochromaticCrystalBand(
      { x: input.rayOrigin.x + eps, y: input.rayOrigin.y, z: input.rayOrigin.z },
      dirUnit, input.crystal, SPECTRAL_WAVELENGTHS_NM.green, nGreen, abs[1], receiverPlaneZ, maxBounces,
    );
    const dyRay = traceMonochromaticCrystalBand(
      { x: input.rayOrigin.x, y: input.rayOrigin.y + eps, z: input.rayOrigin.z },
      dirUnit, input.crystal, SPECTRAL_WAVELENGTHS_NM.green, nGreen, abs[1], receiverPlaneZ, maxBounces,
    );
    if (dxRay.receiverHitPoint && dyRay.receiverHitPoint) {
      const ux = dxRay.receiverHitPoint.x - green.receiverHitPoint.x;
      const uy = dxRay.receiverHitPoint.y - green.receiverHitPoint.y;
      const vx = dyRay.receiverHitPoint.x - green.receiverHitPoint.x;
      const vy = dyRay.receiverHitPoint.y - green.receiverHitPoint.y;
      const emergentArea = Math.abs(ux * vy - uy * vx);
      causticConcentration = clamp(
        ((eps * eps) / Math.max(1e-8, emergentArea)) * green.transmittance,
        0.05,
        64.0,
      );
    }
  }

  return {
    materialLabelKo: mat.labelKo,
    red,
    green,
    blue,
    angularDispersionDeg,
    receiverChromaticSpread,
    causticConcentration,
    serverCostKrw: 0,
  };
}

export type InteriorSurfaceHitKind =
  | "mullion-frame"
  | "curtain-blind"
  | "ceiling"
  | "floor"
  | "back-wall"
  | "left-wall"
  | "right-wall";

export interface InteriorFacadeConfig {
  readonly columns: number;
  readonly rows: number;
  readonly roomDepthRatio?: number;
  readonly mullionThicknessU?: number;
  readonly mullionThicknessV?: number;
  readonly litWindowProbability?: number;
  readonly buildingSeed?: number;
  readonly exteriorSkyLinearRgb?: readonly [number, number, number];
}

export interface InteriorFacadeSample {
  readonly column: number;
  readonly row: number;
  readonly isRoomLit: boolean;
  readonly hitSurface: InteriorSurfaceHitKind;
  readonly interiorHitPoint: Vec3;
  readonly linearRgb: readonly [number, number, number];
}

export interface InteriorFacadeRenderOptions extends InteriorFacadeConfig {
  readonly width: number;
  readonly height: number;
  readonly facadeWorldWidth?: number;
  readonly facadeWorldHeight?: number;
  readonly cameraPosition: Vec3;
}

export interface InteriorFacadeRenderReport {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly facadeTriangleCount: 2;
  readonly interiorGeometryPolygonCount: 0;
  readonly totalRoomCount: number;
  readonly litRoomCount: number;
  readonly surfaceHitCounts: Readonly<Record<InteriorSurfaceHitKind, number>>;
  readonly serverCostKrw: 0;
}

function hashRoomState(seed: number, col: number, row: number): {
  readonly litRoll: number;
  readonly tempRoll: number;
  readonly blindRoll: number;
} {
  const base = Math.imul(col + 11, 374761393) ^ Math.imul(row + 23, 668265263) ^ (seed >>> 0);
  return {
    litRoll: unitRandomFromHash(base),
    tempRoll: unitRandomFromHash(base ^ 0x9e3779b9),
    blindRoll: unitRandomFromHash(base ^ 0x517cc1b7),
  };
}

/**
 * 2-삼각형 외벽 쿼드 위의 정규화 UV `(u, v)`와 실내 진입 시선 벡터(`dz > 0`이 실내 안쪽 방향)로
 * 직육면체 호실 5면(천장·바닥·좌우 측벽·안쪽 뒷벽)과의 광선 교차를 0 폴리곤 오버헤드로 계산한다.
 */
export function sampleInteriorMappedFacadePoint(
  u: number,
  v: number,
  viewDirIntoRoom: Vec3,
  config: InteriorFacadeConfig,
): InteriorFacadeSample {
  const cols = Math.max(1, Math.floor(config.columns));
  const rows = Math.max(1, Math.floor(config.rows));
  const depth = clamp(config.roomDepthRatio ?? 0.85, 0.15, 4.0);
  const mulU = clamp(config.mullionThicknessU ?? 0.08, 0.01, 0.35);
  const mulV = clamp(config.mullionThicknessV ?? 0.1, 0.01, 0.35);
  const litProb = clamp01(config.litWindowProbability ?? 0.42);
  const seed = config.buildingSeed ?? 202619;
  const sky = config.exteriorSkyLinearRgb ?? [0.05, 0.08, 0.15];

  const su = clamp(u, 0, 0.999999) * cols;
  const sv = clamp(v, 0, 0.999999) * rows;
  const column = Math.min(cols - 1, Math.floor(su));
  const row = Math.min(rows - 1, Math.floor(sv));
  const fu = su - column;
  const fv = sv - row;

  const roomRng = hashRoomState(seed, column, row);
  const isRoomLit = roomRng.litRoll < litProb;

  if (fu < mulU || fu > 1 - mulU || fv < mulV || fv > 1 - mulV) {
    return {
      column,
      row,
      isRoomLit,
      hitSurface: "mullion-frame",
      interiorHitPoint: { x: fu, y: fv, z: 0 },
      linearRgb: [0.055, 0.062, 0.078],
    };
  }

  const blindDrop = 0.06 + 0.34 * roomRng.blindRoll;
  if (roomRng.blindRoll > 0.58 && fv > 1 - mulV - blindDrop) {
    const blindLum = isRoomLit ? 0.44 : 0.09;
    return {
      column,
      row,
      isRoomLit,
      hitSurface: "curtain-blind",
      interiorHitPoint: { x: fu, y: fv, z: 0.02 },
      linearRgb: [blindLum * 1.04, blindLum * 0.96, blindLum * 0.86],
    };
  }

  const dir = vec3Normalize({
    x: viewDirIntoRoom.x,
    y: viewDirIntoRoom.y,
    z: Math.max(1e-4, viewDirIntoRoom.z),
  });

  let bestT = depth / dir.z;
  let hitSurface: InteriorSurfaceHitKind = "back-wall";

  if (dir.y > 1e-6) {
    const tCeil = (1 - fv) / dir.y;
    if (tCeil < bestT) {
      bestT = tCeil;
      hitSurface = "ceiling";
    }
  } else if (dir.y < -1e-6) {
    const tFloor = -fv / dir.y;
    if (tFloor < bestT) {
      bestT = tFloor;
      hitSurface = "floor";
    }
  }

  if (dir.x > 1e-6) {
    const tRight = (1 - fu) / dir.x;
    if (tRight < bestT) {
      bestT = tRight;
      hitSurface = "right-wall";
    }
  } else if (dir.x < -1e-6) {
    const tLeft = -fu / dir.x;
    if (tLeft < bestT) {
      bestT = tLeft;
      hitSurface = "left-wall";
    }
  }

  const hitPt: Vec3 = {
    x: clamp01(fu + bestT * dir.x),
    y: clamp01(fv + bestT * dir.y),
    z: clamp(bestT * dir.z, 0, depth),
  };

  const lampRgb: readonly [number, number, number] =
    roomRng.tempRoll < 0.45
      ? [1.0, 0.78, 0.48]
      : roomRng.tempRoll < 0.8
        ? [0.94, 0.95, 0.92]
        : [0.74, 0.88, 1.0];

  const depthAo = 1 - 0.38 * (hitPt.z / depth);
  const surfaceAlbedo =
    hitSurface === "ceiling"
      ? 0.95
      : hitSurface === "floor"
        ? 0.42
        : hitSurface === "back-wall"
          ? 0.72
          : 0.6;
  const ceilLampGlow =
    hitSurface === "ceiling" &&
    Math.abs(hitPt.x - 0.5) < 0.24 &&
    Math.abs(hitPt.z - depth * 0.5) < depth * 0.26
      ? 1.45
      : 1.0;

  const roomEmission = isRoomLit ? 0.88 * surfaceAlbedo * depthAo * ceilLampGlow : 0.035 * depthAo;
  const fresnelGlass = schlickFresnel(clamp01(dir.z), 1.0, 1.52);

  return {
    column,
    row,
    isRoomLit,
    hitSurface,
    interiorHitPoint: hitPt,
    linearRgb: [
      clamp01(roomEmission * lampRgb[0] * (1 - fresnelGlass) + sky[0] * fresnelGlass * 1.4),
      clamp01(roomEmission * lampRgb[1] * (1 - fresnelGlass) + sky[1] * fresnelGlass * 1.4),
      clamp01(roomEmission * lampRgb[2] * (1 - fresnelGlass) + sky[2] * fresnelGlass * 1.4),
    ],
  };
}

function linearToSrgbByte(v: number): number {
  const c = clamp01(v);
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(clamp01(encoded) * 255);
}

/**
 * 단 2개의 외벽 삼각형(`z = 0` 평면) 위에 수백 개의 3D 입체 호실 창문을 래스터라이즈하고,
 * 야간 점등 호실 수와 실내 표면별 히트 통계를 집계한다.
 */
export function renderInteriorMappedFacadeBuffer(
  options: InteriorFacadeRenderOptions,
): InteriorFacadeRenderReport {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const cols = Math.max(1, Math.floor(options.columns));
  const rows = Math.max(1, Math.floor(options.rows));
  const worldW = Math.max(0.5, options.facadeWorldWidth ?? 16);
  const worldH = Math.max(0.5, options.facadeWorldHeight ?? 24);
  const cam = options.cameraPosition;
  const seed = options.buildingSeed ?? 202619;
  const litProb = clamp01(options.litWindowProbability ?? 0.42);

  let litRoomCount = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (hashRoomState(seed, c, r).litRoll < litProb) litRoomCount += 1;
    }
  }

  const counts: Record<InteriorSurfaceHitKind, number> = {
    "mullion-frame": 0,
    "curtain-blind": 0,
    ceiling: 0,
    floor: 0,
    "back-wall": 0,
    "left-wall": 0,
    "right-wall": 0,
  };
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let py = 0; py < height; py += 1) {
    const v = 1 - (py + 0.5) / height;
    const worldY = (v - 0.5) * worldH;
    for (let px = 0; px < width; px += 1) {
      const u = (px + 0.5) / width;
      const worldX = (u - 0.5) * worldW;
      const sample = sampleInteriorMappedFacadePoint(
        u,
        v,
        { x: worldX - cam.x, y: worldY - cam.y, z: Math.max(0.05, cam.z) },
        options,
      );
      counts[sample.hitSurface] += 1;
      const idx = (py * width + px) * 4;
      rgba[idx] = linearToSrgbByte(sample.linearRgb[0]);
      rgba[idx + 1] = linearToSrgbByte(sample.linearRgb[1]);
      rgba[idx + 2] = linearToSrgbByte(sample.linearRgb[2]);
      rgba[idx + 3] = 255;
    }
  }

  return {
    width,
    height,
    rgba,
    facadeTriangleCount: 2,
    interiorGeometryPolygonCount: 0,
    totalRoomCount: cols * rows,
    litRoomCount,
    surfaceHitCounts: counts,
    serverCostKrw: 0,
  };
}
