/**
 * 헤어 빌더(스펙 §5.4 buildHair): HAIR_STYLE_SPECS를 두피 표면 위 카드(쿼드 스트립)·스트랜드 번들(원통 스윕)로
 * 결정적으로 생성하고, 체인 구역에는 보조 본 `hair_<style>_<i>_<j>`와 ChainAnchor를 만든다.
 *
 * 규약(index.ts 참조):
 * - jointIndices ≥ OUTFIT_AUX_BONE_INDEX_BASE(=55)는 이 결과의 `bones[index - 55]`를 가리킨다.
 * - 보조 루트 본의 parent는 "head"이며 restTranslation은 `assumedHeadPivot(scalp)` 기준이다(조립기는
 *   `rebaseAuxiliaryRoots`로 실제 head rest 위치에 맞춘다).
 * - 두피 앵커는 scalp.radius를 따르고, 머리 크기 morph(`param:headSize:±`)는 머리 중심 기준 ±10% 스케일 델타로 전파한다.
 */
import { CHAIN_HIT_RADIUS_DEFAULTS, CHAIN_PARAM_DEFAULTS, HUMANOID_BONE_NAMES, paramMorphName } from "../../contracts";
import { fnv1a32 } from "../../shared/hash";
import { degToRad, qFromAxisAngle, qRotateVec3, v3Add, v3Cross, v3Dot, v3Length, v3Normalize, v3Scale, v3Sub } from "../../shared/math";
import { createPrng } from "../../shared/prng";

import { MeshAccumulator, appendCardStrip, appendSphereShell, appendTube, singleJoint, sphericalDirection } from "./geometry";
import { HAIR_STYLE_SPECS } from "./hair-styles";

import type { MeshBuffers, SkinWeight4 } from "./geometry";
import type { HairSpec, HairZoneSpec } from "./hair-styles";
import type { BoneData, ChainAnchor, HairStyleId, MeshPartData, MorphDelta, OutfitBuildContext, OutfitBuildResult, ScalpSurface, Vec3 } from "../../contracts";

/** 보조 본 인덱스 기준(VRM 55본 뒤) */
export const OUTFIT_AUX_BONE_INDEX_BASE = HUMANOID_BONE_NAMES.length;
export const HEAD_BONE_INDEX = HUMANOID_BONE_NAMES.indexOf("head");
/** head 본 rest 위치 추정: 머리 중심에서 up 반대 방향으로 반경 × 비율 */
export const HEAD_PIVOT_RATIO = 1.0;
/** headSize morph ±1당 머리 중심 기준 스케일 변화 */
export const HEAD_SIZE_MORPH_SCALE = 0.1;
/** 두피 위 카드 시작 높이(반경 배수) */
const SCALP_LIFT = 1.012;
const CAP_LIFT = 1.016;
const CAP_RINGS = 6;
const CAP_SEGMENTS = 24;
const BUNDLE_SIDES = 6;

export function assumedHeadPivot(scalp: ScalpSurface): Vec3 {
  return v3Sub(scalp.center, v3Scale(v3Normalize(scalp.up), scalp.radius * HEAD_PIVOT_RATIO));
}

export interface HairStrand {
  readonly zone: string;
  readonly kind: HairZoneSpec["kind"];
  readonly points: readonly Vec3[];
  readonly outward: readonly Vec3[];
  readonly chain: boolean;
}

interface StrandSeed {
  readonly azimuth: number;
  readonly elevation: number;
  readonly lengthScale: number;
  readonly side: 1 | -1;
}

function horizontal(v: Vec3, up: Vec3): Vec3 {
  const h = v3Sub(v, v3Scale(up, v3Dot(v, up)));
  return v3Length(h) > 1e-9 ? v3Normalize(h) : [0, 0, 1];
}

/** 한 스트랜드의 곡선: 두피 법선에서 출발해 droop만큼 중력 방향으로 휘고 flare·curl을 더한다. 두피 안쪽은 밀어낸다. */
export function strandCurve(scalp: ScalpSurface, zone: HairZoneSpec, seed: StrandSeed, startOverride?: { readonly root: Vec3; readonly dir: Vec3 }): HairStrand {
  const up = v3Normalize(scalp.up);
  const forward = v3Normalize(scalp.forward);
  const down = v3Scale(up, -1);
  const rootDir = startOverride ? startOverride.dir : sphericalDirection(up, forward, seed.azimuth, seed.elevation);
  const root = startOverride ? startOverride.root : v3Add(scalp.center, v3Scale(rootDir, scalp.radius * SCALP_LIFT));
  const segments = Math.max(1, Math.floor(zone.segments));
  const totalLength = zone.length * scalp.radius * seed.lengthScale;
  const segLen = totalLength / segments;
  const radial = horizontal(rootDir, up);
  const curlRad = degToRad(zone.curl) * seed.side;
  const points: Vec3[] = [root];
  const outward: Vec3[] = [rootDir];
  let prev = root;
  for (let k = 1; k <= segments; k += 1) {
    const s = k / segments;
    const d = Math.min(1, zone.droop * (0.3 + 0.7 * s));
    let dir = v3Normalize(v3Add(v3Add(v3Scale(rootDir, 1 - d), v3Scale(down, d)), v3Scale(radial, zone.flare * s)));
    if (curlRad !== 0) dir = qRotateVec3(qFromAxisAngle(up, curlRad * s), dir);
    let p = v3Add(prev, v3Scale(dir, segLen));
    const fromCenter = v3Sub(p, scalp.center);
    const dist = v3Length(fromCenter);
    const minDist = scalp.radius * SCALP_LIFT;
    if (dist < minDist) p = v3Add(scalp.center, v3Scale(dist > 1e-9 ? v3Normalize(fromCenter) : rootDir, minDist));
    points.push(p);
    outward.push(v3Normalize(v3Sub(p, scalp.center)));
    prev = p;
  }
  return { zone: zone.id, kind: zone.kind, points, outward, chain: zone.chain };
}

/** 구역의 스트랜드 시드(균등 방위각 + 결정적 jitter) */
function zoneSeeds(zone: HairZoneSpec, random: () => number): StrandSeed[] {
  const seeds: StrandSeed[] = [];
  const span = degToRad(zone.azimuthEnd - zone.azimuthStart);
  const full = Math.abs(zone.azimuthEnd - zone.azimuthStart) >= 360;
  for (let i = 0; i < zone.count; i += 1) {
    const t = full ? i / zone.count : (i + 0.5) / zone.count;
    const jitterAz = (random() - 0.5) * zone.jitter * (span / Math.max(1, zone.count));
    const jitterEl = (random() - 0.5) * zone.jitter * degToRad(6);
    const lengthScale = 1 + (random() - 0.5) * zone.jitter;
    seeds.push({ azimuth: degToRad(zone.azimuthStart) + span * t + jitterAz, elevation: degToRad(zone.elevation) + jitterEl, lengthScale, side: i % 2 === 0 ? 1 : -1 });
  }
  return seeds;
}

/** 구역의 스트랜드 곡선 전부(번들은 묶음점에서 시작). buildHair·hairStrands가 같은 결과를 쓴다. */
export function zoneStrands(scalp: ScalpSurface, zone: HairZoneSpec, random: () => number): HairStrand[] {
  const up = v3Normalize(scalp.up);
  const forward = v3Normalize(scalp.forward);
  const gatherDir = zone.gather ? sphericalDirection(up, forward, degToRad(zone.gather.azimuth), degToRad(zone.gather.elevation)) : null;
  const gatherPoint = gatherDir ? v3Add(scalp.center, v3Scale(gatherDir, scalp.radius * 1.03)) : null;
  return zoneSeeds(zone, random).map((seed, i) => {
    if (zone.kind === "bundle" && gatherDir && gatherPoint) {
      const sideA = v3Normalize(v3Cross(gatherDir, up));
      const sideB = v3Normalize(v3Cross(sideA, gatherDir));
      const angle = (i / Math.max(1, zone.count)) * Math.PI * 2;
      const offset = v3Add(v3Scale(sideA, Math.cos(angle)), v3Scale(sideB, Math.sin(angle)));
      const root = v3Add(gatherPoint, v3Scale(offset, zone.width * scalp.radius * 0.5));
      return strandCurve(scalp, zone, seed, { root, dir: gatherDir });
    }
    return strandCurve(scalp, zone, seed);
  });
}

/** 번들 묶음점(헤어 타이 위치). 번들이 아니면 null */
export function gatherPointOf(scalp: ScalpSurface, zone: HairZoneSpec): Vec3 | null {
  if (!zone.gather) return null;
  const dir = sphericalDirection(v3Normalize(scalp.up), v3Normalize(scalp.forward), degToRad(zone.gather.azimuth), degToRad(zone.gather.elevation));
  return v3Add(scalp.center, v3Scale(dir, scalp.radius * 1.03));
}

/** 머리 중심 기준 스케일 morph 델타(headSize ±) */
export function headSizeMorphs(positions: Float32Array, center: Vec3): MorphDelta[] {
  const plus = new Float32Array(positions.length);
  const minus = new Float32Array(positions.length);
  for (let v = 0; v < positions.length; v += 3) {
    for (let k = 0; k < 3; k += 1) {
      const d = (positions[v + k] - center[k]) * HEAD_SIZE_MORPH_SCALE;
      plus[v + k] = d;
      minus[v + k] = -d;
    }
  }
  return [
    { name: paramMorphName("headSize", "+"), deltaPositions: plus },
    { name: paramMorphName("headSize", "-"), deltaPositions: minus },
  ];
}

/** 두피 캡: 앞 헤어라인은 낮고(짧고) 뒤는 길게 내려오는 부분 구면 격자 */
function appendScalpCap(acc: MeshAccumulator, scalp: ScalpSurface, spec: HairSpec, skin: SkinWeight4): void {
  const up = v3Normalize(scalp.up);
  const forward = v3Normalize(scalp.forward);
  const grid: number[][] = [];
  for (let r = 0; r <= CAP_RINGS; r += 1) {
    const row: number[] = [];
    for (let s = 0; s <= CAP_SEGMENTS; s += 1) {
      const az = (s / CAP_SEGMENTS) * Math.PI * 2;
      const back = (1 - Math.cos(az)) * 0.5;
      const elEnd = degToRad(spec.cap.frontHairline + (spec.cap.backHairline - spec.cap.frontHairline) * back);
      const el = (elEnd * r) / CAP_RINGS;
      const dir = sphericalDirection(up, forward, az, el);
      row.push(acc.pushVertex(v3Add(scalp.center, v3Scale(dir, scalp.radius * CAP_LIFT)), dir, [s / CAP_SEGMENTS, r / CAP_RINGS], skin));
    }
    grid.push(row);
  }
  for (let r = 0; r < CAP_RINGS; r += 1) {
    for (let s = 0; s < CAP_SEGMENTS; s += 1) {
      acc.pushQuad(grid[r][s], grid[r][s + 1], grid[r + 1][s + 1], grid[r + 1][s]);
    }
  }
}

function hairPart(id: string, buffers: MeshBuffers, center: Vec3): MeshPartData {
  return {
    id,
    role: "hair",
    partId: 0,
    materialId: 0,
    materialPreset: "hair-aniso",
    colorKey: "hair",
    positions: buffers.positions,
    normals: buffers.normals,
    uvs: buffers.uvs,
    indices: buffers.indices,
    jointIndices: buffers.jointIndices,
    jointWeights: buffers.jointWeights,
    morphs: headSizeMorphs(buffers.positions, center),
  };
}

/** 헤어 스타일 하나를 두피 위에 생성한다(결정적). */
export function buildHair(style: HairStyleId, scalp: ScalpSurface, context: OutfitBuildContext): OutfitBuildResult {
  const spec = HAIR_STYLE_SPECS[style];
  const random = createPrng((context.seed ^ fnv1a32(`hair:${style}`)) >>> 0).next;
  const up = v3Normalize(scalp.up);
  const forward = v3Normalize(scalp.forward);
  const headSkin = singleJoint(HEAD_BONE_INDEX);
  const cap = new MeshAccumulator();
  appendScalpCap(cap, scalp, spec, headSkin);
  const strands = new MeshAccumulator();
  const bones: BoneData[] = [];
  const chains: ChainAnchor[] = [];
  const headPivot = assumedHeadPivot(scalp);
  const hairDefaults = CHAIN_PARAM_DEFAULTS.hair;
  let strandIndex = 0;

  const registerChain = (strand: HairStrand, zone: HairZoneSpec): SkinWeight4[] => {
    const skins: SkinWeight4[] = [];
    const names: string[] = [];
    strand.points.forEach((point, j) => {
      const name = `hair_${style}_${strandIndex}_${j}`;
      const boneIndex = OUTFIT_AUX_BONE_INDEX_BASE + bones.length;
      bones.push({
        name,
        parent: j === 0 ? "head" : names[j - 1],
        restTranslation: j === 0 ? v3Sub(point, headPivot) : v3Sub(point, strand.points[j - 1]),
        restRotation: [0, 0, 0, 1],
        auxiliary: true,
      });
      names.push(name);
      skins.push(singleJoint(boneIndex));
    });
    chains.push({
      id: `hair_${style}_${strandIndex}`,
      role: "hair",
      boneNames: names,
      restPoints: strand.points,
      radius: CHAIN_HIT_RADIUS_DEFAULTS.hair,
      stiffness: zone.spring?.stiffness ?? hairDefaults.stiffness,
      damping: zone.spring?.damping ?? hairDefaults.dragForce,
      gravityScale: zone.spring?.gravityScale ?? hairDefaults.gravityPower,
    });
    return skins;
  };

  for (const zone of spec.zones) {
    const gatherPoint = gatherPointOf(scalp, zone);
    if (zone.kind === "bundle" && gatherPoint) {
      // 묶음 매듭(헤어 타이)
      appendSphereShell(strands, {
        center: gatherPoint,
        radius: zone.width * scalp.radius * 1.15,
        up,
        forward,
        elevationStart: 0,
        elevationEnd: Math.PI,
        azimuthStart: 0,
        azimuthEnd: Math.PI * 2,
        rings: 4,
        segments: 8,
        skin: headSkin,
      });
    }
    zoneStrands(scalp, zone, random).forEach((strand) => {
      const skins = zone.chain ? registerChain(strand, zone) : strand.points.map(() => headSkin);
      const n = strand.points.length;
      if (zone.kind === "bundle") {
        const r0 = zone.width * scalp.radius * 0.6;
        const radii = strand.points.map((_, k) => r0 * (1 - 0.75 * (k / Math.max(1, n - 1))));
        appendTube(strands, { points: strand.points, radii, sides: BUNDLE_SIDES, skins, capEnd: true, sideHint: forward });
      } else {
        const w0 = zone.width * scalp.radius;
        const widths = strand.points.map((_, k) => w0 * (1 - 0.45 * (k / Math.max(1, n - 1))));
        appendCardStrip(strands, { points: strand.points, widths, outward: strand.outward, skins });
      }
      strandIndex += 1;
    });
  }

  const parts: MeshPartData[] = [hairPart(`hair-cap-${style}`, cap.build(), scalp.center), hairPart(`hair-strands-${style}`, strands.build(), scalp.center)];
  return { parts, bones, chains };
}

/** 스타일별 스트랜드 곡선만(테스트·미리보기용) */
export function hairStrands(style: HairStyleId, scalp: ScalpSurface, seed: number): HairStrand[] {
  const spec = HAIR_STYLE_SPECS[style];
  const random = createPrng((seed ^ fnv1a32(`hair:${style}`)) >>> 0).next;
  const out: HairStrand[] = [];
  for (const zone of spec.zones) out.push(...zoneStrands(scalp, zone, random));
  return out;
}

/** SHAPER CreateHairBaseMesh(0x060001cf): 다이아몬드 단면 양옆 능선(k=0, 2)의 준-샤프 Catmull-Clark 강도 */
export const SHAPER_HAIR_RIDGE_SHARPNESS = 0.8;
/** SHAPER PhysicsStart(0x060001b1): 스텝당 중력 타깃 위치 보간 계수 */
export const SHAPER_HAIR_PHYSICS_LERP = 0.2;

export interface ShaperHairControlPoint {
  readonly position: Vec3;
  /** 단면 가로·세로 스케일 (widthX, depthZ) */
  readonly scale?: readonly [number, number];
  /** 단면 회전각(라디안, 진행 방향 축 기준 twist) */
  readonly twistRad?: number;
}

/**
 * SHAPER HairData::SetVerticesPosFromControlPoints(0x060001c2) 선형-외삽 하이브리드 스플라인 보간:
 * - L(t) = (1 - t) * P_{j+1} + t * P_{j+2}
 * - T_start = 0.5 * (P_{j+2} - P_j), T_end = 0.5 * (P_{j+3} - P_{j+1})
 * - E(t) = (1 - t) * (P_{j+1} + t * T_start) + t * (P_{j+2} - (1 - t) * T_end)
 * - C(t) = 0.5 * L(t) + 0.5 * E(t)
 */
export function evaluateShaperHairSplinePoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const ct = Math.min(1, Math.max(0, t));
  const oneMinusT = 1 - ct;
  const lx = oneMinusT * p1[0] + ct * p2[0];
  const ly = oneMinusT * p1[1] + ct * p2[1];
  const lz = oneMinusT * p1[2] + ct * p2[2];

  const tsx = 0.5 * (p2[0] - p0[0]);
  const tsy = 0.5 * (p2[1] - p0[1]);
  const tsz = 0.5 * (p2[2] - p0[2]);

  const tex = 0.5 * (p3[0] - p1[0]);
  const tey = 0.5 * (p3[1] - p1[1]);
  const tez = 0.5 * (p3[2] - p1[2]);

  const ex = oneMinusT * (p1[0] + ct * tsx) + ct * (p2[0] - oneMinusT * tex);
  const ey = oneMinusT * (p1[1] + ct * tsy) + ct * (p2[1] - oneMinusT * tey);
  const ez = oneMinusT * (p1[2] + ct * tsz) + ct * (p2[2] - oneMinusT * tez);

  return [0.5 * lx + 0.5 * ex, 0.5 * ly + 0.5 * ey, 0.5 * lz + 0.5 * ez];
}

export interface SampledHairRing {
  readonly center: Vec3;
  readonly scale: readonly [number, number];
  readonly twistRad: number;
}

/**
 * 제어점 체인(M >= 2)의 양 끝을 복제해 구간당 stepsPerSegment 분할로 하이브리드 카디널 스플라인 단면 링들을 샘플링한다.
 */
export function sampleShaperHairSpline(
  controlPoints: readonly ShaperHairControlPoint[],
  stepsPerSegment = 4,
): readonly SampledHairRing[] {
  if (controlPoints.length === 0) return [];
  if (controlPoints.length === 1) {
    const cp = controlPoints[0];
    return [
      {
        center: cp.position,
        scale: cp.scale ?? [1, 1],
        twistRad: cp.twistRad ?? 0,
      },
    ];
  }
  const steps = Math.max(1, Math.floor(stepsPerSegment));
  const m = controlPoints.length;
  const rings: SampledHairRing[] = [];
  for (let j = 0; j < m - 1; j += 1) {
    const cp0 = controlPoints[Math.max(0, j - 1)];
    const cp1 = controlPoints[j];
    const cp2 = controlPoints[j + 1];
    const cp3 = controlPoints[Math.min(m - 1, j + 2)];
    const s1 = cp1.scale ?? [1, 1];
    const s2 = cp2.scale ?? [1, 1];
    const tw1 = cp1.twistRad ?? 0;
    const tw2 = cp2.twistRad ?? 0;

    for (let k = 0; k < steps; k += 1) {
      const t = k / steps;
      rings.push({
        center: evaluateShaperHairSplinePoint(cp0.position, cp1.position, cp2.position, cp3.position, t),
        scale: [s1[0] + (s2[0] - s1[0]) * t, s1[1] + (s2[1] - s1[1]) * t],
        twistRad: tw1 + (tw2 - tw1) * t,
      });
    }
  }
  const last = controlPoints[m - 1];
  rings.push({
    center: last.position,
    scale: last.scale ?? [1, 1],
    twistRad: last.twistRad ?? 0,
  });
  return rings;
}

export interface ShaperHairStrandTubeMesh {
  /** 정점 위치(ringCount * 4 * 3 floats) */
  readonly positions: Float32Array;
  /** 쿼드 면 인덱스((ringCount - 1) * 4 * 4 uint32s) */
  readonly quadFaces: Uint32Array;
  /** 정점별 Catmull-Clark 샤프니스(ringCount * 4 floats: 양옆 능선 k=0,2는 0.8, 양 끝은 1.0) */
  readonly vertexSharpness: Float32Array;
  /** 각 링에 적용된 sin((ring / totalRings) * π) 테이퍼 배율 */
  readonly ringTaperFactors: Float32Array;
}

/**
 * SHAPER CreateHairBaseMesh(0x060001cf) 방식의 다이아몬드 4각 단면 헤어 튜브 및 능선 샤프니스 생성:
 * - 길이 방향 단면 폭을 sin((ring / (totalRings - 1)) * π)로 테이퍼링
 * - sharp == true일 때 다이아몬드 양옆 능선 정점(k=0, k=2)에 power=0.8, 모근/모발 끝에 power=1.0 부여
 */
export function buildShaperHairStrandTube(options: {
  readonly controlPoints: readonly ShaperHairControlPoint[];
  readonly stepsPerSegment?: number;
  readonly baseWidth?: number;
  readonly baseDepth?: number;
  readonly sharp?: boolean;
}): ShaperHairStrandTubeMesh {
  const {
    controlPoints,
    stepsPerSegment = 4,
    baseWidth = 0.04,
    baseDepth = 0.02,
    sharp = true,
  } = options;
  const rings = sampleShaperHairSpline(controlPoints, stepsPerSegment);
  const ringCount = rings.length;
  if (ringCount < 2) {
    return {
      positions: new Float32Array(0),
      quadFaces: new Uint32Array(0),
      vertexSharpness: new Float32Array(0),
      ringTaperFactors: new Float32Array(0),
    };
  }

  const positions = new Float32Array(ringCount * 4 * 3);
  const vertexSharpness = new Float32Array(ringCount * 4);
  const ringTaperFactors = new Float32Array(ringCount);
  const quadFaces = new Uint32Array((ringCount - 1) * 4 * 4);

  // 다이아몬드 4개 꼭짓점 로컬 오프셋: k=0(-X 능선), k=1(+Z 앞), k=2(+X 능선), k=3(-Z 뒤)
  const diamondLocal: readonly (readonly [number, number])[] = [
    [-1, 0],
    [0, 1],
    [1, 0],
    [0, -1],
  ];

  for (let r = 0; r < ringCount; r += 1) {
    const ring = rings[r];
    const taper = Math.sin((r / (ringCount - 1)) * Math.PI);
    ringTaperFactors[r] = taper;

    const prevCenter = rings[Math.max(0, r - 1)].center;
    const nextCenter = rings[Math.min(ringCount - 1, r + 1)].center;
    const tangent = v3Normalize(v3Sub(nextCenter, prevCenter));
    const upHint: Vec3 = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const sideBase = v3Normalize(v3Cross(upHint, tangent));
    const depthBase = v3Normalize(v3Cross(tangent, sideBase));

    const cosTw = Math.cos(ring.twistRad);
    const sinTw = Math.sin(ring.twistRad);
    const axisX = v3Add(v3Scale(sideBase, cosTw), v3Scale(depthBase, sinTw));
    const axisZ = v3Sub(v3Scale(depthBase, cosTw), v3Scale(sideBase, sinTw));

    const rx = 0.5 * baseWidth * ring.scale[0] * taper;
    const rz = 0.5 * baseDepth * ring.scale[1] * taper;
    const isEndpoint = r === 0 || r === ringCount - 1;

    for (let k = 0; k < 4; k += 1) {
      const [lx, lz] = diamondLocal[k];
      const offset = v3Add(v3Scale(axisX, lx * rx), v3Scale(axisZ, lz * rz));
      const vPos = v3Add(ring.center, offset);
      const vIdx = r * 4 + k;
      positions[vIdx * 3] = vPos[0];
      positions[vIdx * 3 + 1] = vPos[1];
      positions[vIdx * 3 + 2] = vPos[2];

      if (sharp) {
        if (isEndpoint) {
          vertexSharpness[vIdx] = 1.0;
        } else if (k === 0 || k === 2) {
          vertexSharpness[vIdx] = SHAPER_HAIR_RIDGE_SHARPNESS;
        } else {
          vertexSharpness[vIdx] = 0.0;
        }
      } else {
        vertexSharpness[vIdx] = 0.0;
      }
    }
  }

  for (let r = 0; r < ringCount - 1; r += 1) {
    const r0 = r * 4;
    const r1 = (r + 1) * 4;
    for (let k = 0; k < 4; k += 1) {
      const nextK = (k + 1) % 4;
      const base = (r * 4 + k) * 4;
      quadFaces[base] = r0 + k;
      quadFaces[base + 1] = r0 + nextK;
      quadFaces[base + 2] = r1 + nextK;
      quadFaces[base + 3] = r1 + k;
    }
  }

  return { positions, quadFaces, vertexSharpness, ringTaperFactors };
}

/**
 * SHAPER HairData::PhysicsStart(0x060001b1) 준-정적(Quasi-Static) 제어점 중력·두상 구체 충돌 스텝:
 * - 모근(index 0)은 고정하고, 나머지 제어점을 중력 방향으로 0.2 비율씩 보간 이동한 뒤,
 * - 두상 구체 콜라이더 반경(0.5 * diameter = radius) 안으로 침투한 제어점을 표면 밖으로 밀어내고 세그먼트 길이를 유지한다.
 */
export function simulateShaperHairPhysicsStep(options: {
  readonly points: readonly Vec3[];
  readonly gravityStep: Vec3;
  readonly headCollider: { readonly center: Vec3; readonly radius: number };
  readonly lerpFactor?: number;
}): readonly Vec3[] {
  const { points, gravityStep, headCollider, lerpFactor = SHAPER_HAIR_PHYSICS_LERP } = options;
  if (points.length <= 1) return [...points];
  const alpha = Math.min(1, Math.max(0, lerpFactor));
  const out: Vec3[] = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const prevRest = points[i - 1];
    const curRest = points[i];
    const segLen = Math.max(1e-6, v3Length(v3Sub(curRest, prevRest)));

    const target = v3Add(curRest, gravityStep);
    let moved: Vec3 = [
      curRest[0] + (target[0] - curRest[0]) * alpha,
      curRest[1] + (target[1] - curRest[1]) * alpha,
      curRest[2] + (target[2] - curRest[2]) * alpha,
    ];

    // 세그먼트 길이 구속
    const fromPrev = v3Sub(moved, out[i - 1]);
    const dirFromPrev: Vec3 = v3Length(fromPrev) > 1e-8 ? v3Normalize(fromPrev) : [0, -1, 0];
    moved = v3Add(out[i - 1], v3Scale(dirFromPrev, segLen));

    // 두상 구체 콜라이더(dist < radius) 밀어내기
    const fromHead = v3Sub(moved, headCollider.center);
    const distHead = v3Length(fromHead);
    if (distHead < headCollider.radius) {
      const pushDir: Vec3 = distHead > 1e-8 ? v3Normalize(fromHead) : [0, 1, 0];
      moved = v3Add(headCollider.center, v3Scale(pushDir, headCollider.radius));
    }

    out.push(moved);
  }
  return out;
}

export {
  SHAPER_HAIR_BASE_ZONE_CALIBRATIONS,
  SHAPER_HAIR_JOINT_SPEC,
  alignShaperHairControlRotations,
  applyShaperHairAddShortcutAdjustment,
  buildPlantedHairControlChain,
  collideShaperDynamicBoneCapsule,
  collideShaperDynamicBoneSphere,
  computeShaperHairBaseUvTransform,
  computeShaperSymmetricRay,
  mirrorShaperHairRootAngles,
  reanchorPlantedHairRoot,
  stepShaperDynamicBoneParticle,
} from "./shaper-hair";
export type {
  BuildPlantedHairControlChainOptions,
  PlantedHairControlChainResult,
  PlantedHairControlNode,
  ShaperConfigurableJointSpec,
  ShaperDynamicBoneBoundMode,
  ShaperDynamicBoneParticleInput,
  ShaperDynamicBoneParticleStepResult,
  ShaperHairAddParams,
  ShaperHairAddShortcutInput,
  ShaperHairBaseZoneCalibration,
  ShaperHairBaseZoneIndex,
  ShaperHairBaseZoneUiInput,
  ShaperHairBaseZoneUvTransform,
  ShaperSymmetricRay,
} from "./shaper-hair";
