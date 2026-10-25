import type { CharacterGroomVector2, CharacterGroomVector3 } from "./character-groom-document";

/**
 * StudioHORANG SHAPER (v1.05, Assembly-CSharp.dll) 역공학 명세 기반
 * 인터랙티브 헤어 심기(HairData 0x02000034 / HairBaseData 0x0200002c),
 * 제스처 모디파이어(PivotMode.hairAdd), 대칭 미러링(SymmetryHairHelper 0x0200007a),
 * 스프링·충돌 구 물리 시뮬레이션 순수 엔진.
 */

export const SHAPER_HAIR_PLANTING_VERSION = 1 as const;

export type ShaperPivotMode = "default" | "hairAdd" | "hairEdit" | "symmetry";

export type HairBaseUvRegion = "front" | "sideLeft" | "sideRight" | "back" | "crown" | "nape";

export type ShaperHairGestureKind =
  | "moveRootOnSurface"
  | "rotateRootZ"
  | "adjustBendCurvature"
  | "adjustStrandLength";

export const SHAPER_HAIR_GESTURE_LABELS: Readonly<Record<ShaperHairGestureKind, string>> = {
  moveRootOnSurface: "표면 위치 이동 [Drag]",
  rotateRootZ: "Z축 뿌리 회전 [Ctrl]+[Drag]",
  adjustBendCurvature: "휘어짐 조절 [Alt]+[Drag]",
  adjustStrandLength: "길이 조절 [Shift]+[Drag]",
};

export interface ShaperHairBaseRegionBounds {
  readonly region: HairBaseUvRegion;
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
  readonly defaultLength: number;
}

export interface ShaperHairBaseData {
  readonly baseMeshId: string;
  readonly headBoneName: string;
  readonly pivotMode: ShaperPivotMode;
  readonly symmetryEnabled: boolean;
  readonly uvRegions: readonly ShaperHairBaseRegionBounds[];
}

export interface ShaperHairTriangleFace {
  readonly baseMeshId: string;
  readonly triangleIndex: number;
  readonly vertexIndices: readonly [number, number, number];
  readonly v0: CharacterGroomVector3;
  readonly v1: CharacterGroomVector3;
  readonly v2: CharacterGroomVector3;
  readonly uv0?: CharacterGroomVector2;
  readonly uv1?: CharacterGroomVector2;
  readonly uv2?: CharacterGroomVector2;
}

export interface ShaperHairStrandData {
  readonly strandId: string;
  readonly baseMeshId: string;
  readonly triangleIndex: number;
  readonly vertexIndices: readonly [number, number, number];
  readonly v0d: number;
  readonly v1d: number;
  readonly rootPosition: CharacterGroomVector3;
  readonly normal: CharacterGroomVector3;
  readonly rootAngles: CharacterGroomVector3;
  readonly controlPointPos: readonly CharacterGroomVector3[];
  readonly controlPointRestPos: readonly CharacterGroomVector3[];
  readonly controlPointVelocities: readonly CharacterGroomVector3[];
  readonly controlPointAngles: readonly CharacterGroomVector3[];
  readonly controlPointScale: readonly CharacterGroomVector3[];
  readonly strandLength: number;
  readonly bendCurvature: number;
  readonly uvRegion: HairBaseUvRegion;
  readonly symmetricPartnerId: string | null;
}

export interface PlantHairStrandInput {
  readonly strandId: string;
  readonly face: ShaperHairTriangleFace;
  readonly v0d: number;
  readonly v1d: number;
  readonly controlPointCount?: number;
  readonly strandLength?: number;
  readonly initialRollZDeg?: number;
  readonly bendCurvature?: number;
  readonly symmetricPartnerId?: string | null;
}

export interface ShaperHairGestureModifiers {
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
}

export interface ShaperHairPlantingGestureInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly modifiers?: ShaperHairGestureModifiers;
  readonly face?: ShaperHairTriangleFace;
}

export interface ShaperHairPlantingGestureResult {
  readonly kind: ShaperHairGestureKind;
  readonly label: string;
  readonly strand: ShaperHairStrandData;
}

export interface ShaperHairCollisionSphere {
  readonly sphereId: string;
  readonly kind: "head" | "neck" | "shoulderLeft" | "shoulderRight";
  readonly center: CharacterGroomVector3;
  readonly radius: number;
}

export interface StepHairStrandPhysicsInput {
  readonly dtSeconds: number;
  readonly gravity?: CharacterGroomVector3;
  readonly headAcceleration?: CharacterGroomVector3;
  readonly stiffness?: number;
  readonly damping?: number;
  readonly collisionSpheres?: readonly ShaperHairCollisionSphere[];
}

export class ShaperHairPlantingError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ShaperHairPlantingError";
  }
}

const EPSILON = 1e-7;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MIN_STRAND_LENGTH = 0.02;
const MAX_STRAND_LENGTH = 2.5;
const MIN_BEND_CURVATURE = -1.5;
const MAX_BEND_CURVATURE = 1.5;
const MIN_SCALE = 0.15;
const MAX_SCALE = 4.0;

export const DEFAULT_SHAPER_HAIR_BASE_UV_REGIONS: readonly ShaperHairBaseRegionBounds[] = [
  { region: "front", uMin: 0.25, uMax: 0.75, vMin: 0.65, vMax: 1.0, defaultLength: 0.22 },
  { region: "crown", uMin: 0.25, uMax: 0.75, vMin: 0.4, vMax: 0.65, defaultLength: 0.28 },
  { region: "sideLeft", uMin: 0.0, uMax: 0.25, vMin: 0.3, vMax: 0.85, defaultLength: 0.32 },
  { region: "sideRight", uMin: 0.75, uMax: 1.0, vMin: 0.3, vMax: 0.85, defaultLength: 0.32 },
  { region: "back", uMin: 0.25, uMax: 0.75, vMin: 0.15, vMax: 0.4, defaultLength: 0.38 },
  { region: "nape", uMin: 0.0, uMax: 1.0, vMin: 0.0, vMax: 0.15, defaultLength: 0.24 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertFiniteVector3(value: CharacterGroomVector3, label: string): void {
  if (value.length !== 3 || !value.every(Number.isFinite)) {
    throw new ShaperHairPlantingError("INVALID_VECTOR3", `${label} must be a finite 3D vector.`);
  }
}

function add3(a: CharacterGroomVector3, b: CharacterGroomVector3): CharacterGroomVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub3(a: CharacterGroomVector3, b: CharacterGroomVector3): CharacterGroomVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(v: CharacterGroomVector3, s: number): CharacterGroomVector3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function dot3(a: CharacterGroomVector3, b: CharacterGroomVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: CharacterGroomVector3, b: CharacterGroomVector3): CharacterGroomVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length3(v: CharacterGroomVector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(
  v: CharacterGroomVector3,
  fallback: CharacterGroomVector3 = [0, 1, 0],
): CharacterGroomVector3 {
  const len = length3(v);
  return len > EPSILON ? [v[0] / len, v[1] / len, v[2] / len] : fallback;
}

function wrapAngleDegrees(deg: number): number {
  const normalized = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function rotateAroundAxis(
  vector: CharacterGroomVector3,
  axisInput: CharacterGroomVector3,
  angleRadians: number,
): CharacterGroomVector3 {
  const axis = normalize3(axisInput);
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const crossProd = cross3(axis, vector);
  const dotProd = dot3(axis, vector);
  return [
    vector[0] * cos + crossProd[0] * sin + axis[0] * dotProd * (1 - cos),
    vector[1] * cos + crossProd[1] * sin + axis[1] * dotProd * (1 - cos),
    vector[2] * cos + crossProd[2] * sin + axis[2] * dotProd * (1 - cos),
  ];
}

/**
 * 삼각형 내부 무게중심 계수 `(v0d, v1d)`를 유효 영역(`v0d >= 0, v1d >= 0, v0d + v1d <= 1`)으로 투영한다.
 */
export function clampBarycentricWeights(
  v0dInput: number,
  v1dInput: number,
): readonly [number, number] {
  if (!Number.isFinite(v0dInput) || !Number.isFinite(v1dInput)) {
    throw new ShaperHairPlantingError(
      "INVALID_BARYCENTRIC",
      "Barycentric coordinates v0d and v1d must be finite numbers.",
    );
  }
  let v0d = clamp(v0dInput, 0, 1);
  let v1d = clamp(v1dInput, 0, 1);
  const sum = v0d + v1d;
  if (sum > 1) {
    v0d /= sum;
    v1d /= sum;
  }
  return [v0d, v1d];
}

/**
 * 삼각형 정점과 `(v0d, v1d)` 무게중심 계수로 3D 표면 위치와 단위 법선을 계산한다.
 */
export function evaluateFaceBarycentricFrame(
  face: ShaperHairTriangleFace,
  v0dInput: number,
  v1dInput: number,
): {
  readonly v0d: number;
  readonly v1d: number;
  readonly w0: number;
  readonly position: CharacterGroomVector3;
  readonly normal: CharacterGroomVector3;
  readonly tangent: CharacterGroomVector3;
  readonly bitangent: CharacterGroomVector3;
  readonly uv: CharacterGroomVector2;
} {
  assertFiniteVector3(face.v0, "face.v0");
  assertFiniteVector3(face.v1, "face.v1");
  assertFiniteVector3(face.v2, "face.v2");

  const [v0d, v1d] = clampBarycentricWeights(v0dInput, v1dInput);
  const w0 = Math.max(0, 1 - v0d - v1d);
  const edge1 = sub3(face.v1, face.v0);
  const edge2 = sub3(face.v2, face.v0);
  const rawNormal = cross3(edge1, edge2);
  if (length3(rawNormal) <= EPSILON) {
    throw new ShaperHairPlantingError(
      "DEGENERATE_TRIANGLE",
      `Triangle ${face.triangleIndex} on mesh ${face.baseMeshId} is degenerate.`,
    );
  }

  const normal = normalize3(rawNormal, [0, 1, 0]);
  const tangent = normalize3(edge1, [1, 0, 0]);
  const bitangent = normalize3(cross3(normal, tangent), [0, 0, 1]);
  const position: CharacterGroomVector3 = [
    face.v0[0] * w0 + face.v1[0] * v0d + face.v2[0] * v1d,
    face.v0[1] * w0 + face.v1[1] * v0d + face.v2[1] * v1d,
    face.v0[2] * w0 + face.v1[2] * v0d + face.v2[2] * v1d,
  ];

  const uv0 = face.uv0 ?? [0.5, 0.75];
  const uv1 = face.uv1 ?? [0.5, 0.75];
  const uv2 = face.uv2 ?? [0.5, 0.75];
  const uv: CharacterGroomVector2 = [
    clamp(uv0[0] * w0 + uv1[0] * v0d + uv2[0] * v1d, 0, 1),
    clamp(uv0[1] * w0 + uv1[1] * v0d + uv2[1] * v1d, 0, 1),
  ];

  return { v0d, v1d, w0, position, normal, tangent, bitangent, uv };
}

/**
 * 헤어 캡 UV 좌표를 Shaper `HairBaseData` 영역(`front`, `sideLeft`, `sideRight`, `back`, `crown`, `nape`)으로 분류한다.
 */
export function classifyHairBaseUvRegion(
  uv: CharacterGroomVector2,
  regions: readonly ShaperHairBaseRegionBounds[] = DEFAULT_SHAPER_HAIR_BASE_UV_REGIONS,
): HairBaseUvRegion {
  const u = clamp(uv[0], 0, 1);
  const v = clamp(uv[1], 0, 1);
  for (const bound of regions) {
    if (u >= bound.uMin && u <= bound.uMax && v >= bound.vMin && v <= bound.vMax) {
      return bound.region;
    }
  }
  if (v >= 0.65) return "front";
  if (u < 0.25) return "sideLeft";
  if (u > 0.75) return "sideRight";
  return "back";
}

/**
 * 표면 법선으로부터 Shaper `HairData.rootAngles` (`[pitchDeg, yawDeg, rollZDeg]`)를 계산한다.
 */
export function computeRootAnglesFromNormal(
  normalInput: CharacterGroomVector3,
  rollZDeg = 0,
): CharacterGroomVector3 {
  const normal = normalize3(normalInput);
  const pitchDeg = wrapAngleDegrees(Math.asin(clamp(-normal[1], -1, 1)) * RAD_TO_DEG);
  const yawDeg = wrapAngleDegrees(Math.atan2(normal[0], normal[2]) * RAD_TO_DEG);
  return [pitchDeg, yawDeg, wrapAngleDegrees(rollZDeg)];
}

function buildStrandControlPoints(params: {
  readonly rootPosition: CharacterGroomVector3;
  readonly normal: CharacterGroomVector3;
  readonly tangent: CharacterGroomVector3;
  readonly bitangent: CharacterGroomVector3;
  readonly rollZDeg: number;
  readonly bendCurvature: number;
  readonly strandLength: number;
  readonly controlPointScale: readonly CharacterGroomVector3[];
}): {
  readonly controlPointPos: readonly CharacterGroomVector3[];
  readonly controlPointAngles: readonly CharacterGroomVector3[];
} {
  const {
    rootPosition,
    normal,
    tangent,
    bitangent,
    rollZDeg,
    bendCurvature,
    strandLength,
    controlPointScale,
  } = params;
  const count = controlPointScale.length;
  const rollRad = rollZDeg * DEG_TO_RAD;
  const rolledBendDir = rotateAroundAxis(bitangent, normal, rollRad);
  const baseOutward = normalize3(add3(normal, [0, -0.35, 0]), normal);
  const positions: CharacterGroomVector3[] = [];
  const angles: CharacterGroomVector3[] = [];

  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0 : i / (count - 1);
    const scaleFactor = controlPointScale[i]?.[1] ?? 1;
    const distanceAlongStrand = strandLength * t * scaleFactor;
    const bendOffset = bendCurvature * t * t * strandLength * 0.5;
    positions.push(
      add3(
        add3(rootPosition, scale3(baseOutward, distanceAlongStrand)),
        add3(scale3(rolledBendDir, bendOffset), scale3(tangent, bendOffset * 0.15)),
      ),
    );
    angles.push([
      wrapAngleDegrees(bendCurvature * t * 45),
      wrapAngleDegrees(Math.sin(rollRad) * bendCurvature * t * 25),
      wrapAngleDegrees(rollZDeg),
    ]);
  }

  return { controlPointPos: positions, controlPointAngles: angles };
}

/**
 * 헤드 베이스 메쉬의 삼각형(`baseMeshId`, `v0d`, `v1d`) 위에 헤어 스트랜드를 심는다 (`PivotMode.hairAdd`).
 */
export function plantHairStrandOnFace(input: PlantHairStrandInput): ShaperHairStrandData {
  if (!input.strandId.trim()) {
    throw new ShaperHairPlantingError("INVALID_STRAND_ID", "strandId must be non-empty.");
  }
  const controlPointCount = input.controlPointCount ?? 5;
  if (!Number.isInteger(controlPointCount) || controlPointCount < 2 || controlPointCount > 32) {
    throw new ShaperHairPlantingError(
      "INVALID_CONTROL_POINT_COUNT",
      "controlPointCount must be an integer between 2 and 32.",
    );
  }

  const frame = evaluateFaceBarycentricFrame(input.face, input.v0d, input.v1d);
  const uvRegion = classifyHairBaseUvRegion(frame.uv);
  const regionDefault =
    DEFAULT_SHAPER_HAIR_BASE_UV_REGIONS.find((r) => r.region === uvRegion)?.defaultLength ?? 0.28;
  const strandLength = clamp(
    input.strandLength ?? regionDefault,
    MIN_STRAND_LENGTH,
    MAX_STRAND_LENGTH,
  );
  const bendCurvature = clamp(
    input.bendCurvature ?? 0.15,
    MIN_BEND_CURVATURE,
    MAX_BEND_CURVATURE,
  );
  const rollZDeg = wrapAngleDegrees(input.initialRollZDeg ?? 0);
  const rootAngles = computeRootAnglesFromNormal(frame.normal, rollZDeg);

  const controlPointScale: CharacterGroomVector3[] = Array.from(
    { length: controlPointCount },
    (_, index) => {
      const taperWidth = Number((1 - (index / (controlPointCount - 1)) * 0.65).toFixed(4));
      return [taperWidth, 1, taperWidth] as const;
    },
  );

  const { controlPointPos, controlPointAngles } = buildStrandControlPoints({
    rootPosition: frame.position,
    normal: frame.normal,
    tangent: frame.tangent,
    bitangent: frame.bitangent,
    rollZDeg,
    bendCurvature,
    strandLength,
    controlPointScale,
  });

  return {
    strandId: input.strandId,
    baseMeshId: input.face.baseMeshId,
    triangleIndex: input.face.triangleIndex,
    vertexIndices: input.face.vertexIndices,
    v0d: frame.v0d,
    v1d: frame.v1d,
    rootPosition: frame.position,
    normal: frame.normal,
    rootAngles,
    controlPointPos,
    controlPointRestPos: controlPointPos,
    controlPointVelocities: Array.from({ length: controlPointCount }, () => [0, 0, 0] as const),
    controlPointAngles,
    controlPointScale,
    strandLength,
    bendCurvature,
    uvRegion,
    symmetricPartnerId: input.symmetricPartnerId ?? null,
  };
}

/**
 * 입력 모디파이어 키 조합으로부터 Shaper 헤어 제스처 모드와 한글 안내 문구를 결정한다.
 */
export function resolveHairPlantingGestureMode(
  modifiers: ShaperHairGestureModifiers = {},
): {
  readonly kind: ShaperHairGestureKind;
  readonly label: string;
} {
  if (modifiers.ctrlKey) {
    return { kind: "rotateRootZ", label: SHAPER_HAIR_GESTURE_LABELS.rotateRootZ };
  }
  if (modifiers.altKey) {
    return { kind: "adjustBendCurvature", label: SHAPER_HAIR_GESTURE_LABELS.adjustBendCurvature };
  }
  if (modifiers.shiftKey) {
    return { kind: "adjustStrandLength", label: SHAPER_HAIR_GESTURE_LABELS.adjustStrandLength };
  }
  return { kind: "moveRootOnSurface", label: SHAPER_HAIR_GESTURE_LABELS.moveRootOnSurface };
}

function syntheticFaceFromStrand(strand: ShaperHairStrandData): ShaperHairTriangleFace {
  const normal = normalize3(strand.normal);
  const ref: CharacterGroomVector3 = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize3(cross3(ref, normal), [1, 0, 0]);
  const bitangent = normalize3(cross3(normal, tangent), [0, 0, 1]);
  const v0 = sub3(
    strand.rootPosition,
    add3(scale3(tangent, strand.v0d), scale3(bitangent, strand.v1d)),
  );
  return {
    baseMeshId: strand.baseMeshId,
    triangleIndex: strand.triangleIndex,
    vertexIndices: strand.vertexIndices,
    v0,
    v1: add3(v0, tangent),
    v2: add3(v0, bitangent),
  };
}

/**
 * Shaper 헤어 심기 제스처 모디파이어(기본 드래그 / `[Ctrl]+드래그` / `[Alt]+드래그` / `[Shift]+드래그`)를 적용한다.
 */
export function applyHairPlantingGesture(
  strand: ShaperHairStrandData,
  gesture: ShaperHairPlantingGestureInput,
): ShaperHairPlantingGestureResult {
  if (!Number.isFinite(gesture.deltaX) || !Number.isFinite(gesture.deltaY)) {
    throw new ShaperHairPlantingError(
      "INVALID_GESTURE_DELTA",
      "Gesture deltaX and deltaY must be finite numbers.",
    );
  }

  const { kind, label } = resolveHairPlantingGestureMode(gesture.modifiers);
  const face = gesture.face ?? syntheticFaceFromStrand(strand);

  if (kind === "moveRootOnSurface") {
    const [nextV0d, nextV1d] = clampBarycentricWeights(
      strand.v0d + gesture.deltaX * 0.005,
      strand.v1d + gesture.deltaY * 0.005,
    );
    const frame = evaluateFaceBarycentricFrame(face, nextV0d, nextV1d);
    const rootAngles = computeRootAnglesFromNormal(frame.normal, strand.rootAngles[2]);
    const rebuilt = buildStrandControlPoints({
      rootPosition: frame.position,
      normal: frame.normal,
      tangent: frame.tangent,
      bitangent: frame.bitangent,
      rollZDeg: rootAngles[2],
      bendCurvature: strand.bendCurvature,
      strandLength: strand.strandLength,
      controlPointScale: strand.controlPointScale,
    });
    return {
      kind,
      label,
      strand: {
        ...strand,
        v0d: frame.v0d,
        v1d: frame.v1d,
        rootPosition: frame.position,
        normal: frame.normal,
        rootAngles,
        uvRegion: gesture.face ? classifyHairBaseUvRegion(frame.uv) : strand.uvRegion,
        controlPointPos: rebuilt.controlPointPos,
        controlPointRestPos: rebuilt.controlPointPos,
        controlPointAngles: rebuilt.controlPointAngles,
      },
    };
  }

  const frame = evaluateFaceBarycentricFrame(face, strand.v0d, strand.v1d);
  let nextRollZ = strand.rootAngles[2];
  let nextBend = strand.bendCurvature;
  let nextLength = strand.strandLength;
  let nextControlPointScale = strand.controlPointScale;

  if (kind === "rotateRootZ") {
    nextRollZ = wrapAngleDegrees(strand.rootAngles[2] + gesture.deltaX * 0.6);
  } else if (kind === "adjustBendCurvature") {
    nextBend = clamp(
      strand.bendCurvature + (gesture.deltaX - gesture.deltaY) * 0.008,
      MIN_BEND_CURVATURE,
      MAX_BEND_CURVATURE,
    );
  } else {
    const widthFactor = clamp(1 + gesture.deltaX * 0.003, 0.5, 2.0);
    nextLength = clamp(
      strand.strandLength - gesture.deltaY * 0.003,
      MIN_STRAND_LENGTH,
      MAX_STRAND_LENGTH,
    );
    const lengthRatio = nextLength / Math.max(EPSILON, strand.strandLength);
    nextControlPointScale = strand.controlPointScale.map(([sx, sy, sz], index) => [
      clamp(sx * widthFactor, MIN_SCALE, MAX_SCALE),
      index === 0 ? 1 : clamp(sy * lengthRatio, MIN_SCALE, MAX_SCALE),
      clamp(sz * widthFactor, MIN_SCALE, MAX_SCALE),
    ]);
  }

  const rebuilt = buildStrandControlPoints({
    rootPosition: strand.rootPosition,
    normal: strand.normal,
    tangent: frame.tangent,
    bitangent: frame.bitangent,
    rollZDeg: nextRollZ,
    bendCurvature: nextBend,
    strandLength: nextLength,
    controlPointScale: nextControlPointScale,
  });

  return {
    kind,
    label,
    strand: {
      ...strand,
      rootAngles: [strand.rootAngles[0], strand.rootAngles[1], nextRollZ],
      bendCurvature: nextBend,
      strandLength: nextLength,
      controlPointScale: nextControlPointScale,
      controlPointPos: rebuilt.controlPointPos,
      controlPointRestPos: rebuilt.controlPointPos,
      controlPointAngles: rebuilt.controlPointAngles,
    },
  };
}

function mirrorVectorX(v: CharacterGroomVector3): CharacterGroomVector3 {
  return [v[0] === 0 ? 0 : -v[0], v[1], v[2]];
}

function mirrorAnglesX(angles: CharacterGroomVector3): CharacterGroomVector3 {
  return [
    angles[0],
    angles[1] === 0 ? 0 : wrapAngleDegrees(-angles[1]),
    angles[2] === 0 ? 0 : wrapAngleDegrees(-angles[2]),
  ];
}

function mirrorUvRegion(region: HairBaseUvRegion): HairBaseUvRegion {
  if (region === "sideLeft") return "sideRight";
  if (region === "sideRight") return "sideLeft";
  return region;
}

/**
 * `SymmetryHairHelper` (`0x0200007a`) 명세:
 * 좌우 대칭 평면(X=0)을 기준으로 미러링된 대칭 헤어 스트랜드를 생성한다.
 */
export function createSymmetricHairStrand(
  source: ShaperHairStrandData,
  options: {
    readonly partnerStrandId: string;
    readonly mirroredTriangleIndex?: number;
    readonly mirroredVertexIndices?: readonly [number, number, number];
  },
): ShaperHairStrandData {
  if (!options.partnerStrandId.trim()) {
    throw new ShaperHairPlantingError(
      "INVALID_PARTNER_ID",
      "partnerStrandId must be a non-empty string.",
    );
  }

  const [mirroredV0d, mirroredV1d] = clampBarycentricWeights(source.v1d, source.v0d);

  return {
    strandId: options.partnerStrandId,
    baseMeshId: source.baseMeshId,
    triangleIndex: options.mirroredTriangleIndex ?? source.triangleIndex,
    vertexIndices: options.mirroredVertexIndices ?? [
      source.vertexIndices[0],
      source.vertexIndices[2],
      source.vertexIndices[1],
    ],
    v0d: mirroredV0d,
    v1d: mirroredV1d,
    rootPosition: mirrorVectorX(source.rootPosition),
    normal: normalize3(mirrorVectorX(source.normal)),
    rootAngles: mirrorAnglesX(source.rootAngles),
    controlPointPos: source.controlPointPos.map(mirrorVectorX),
    controlPointRestPos: source.controlPointRestPos.map(mirrorVectorX),
    controlPointVelocities: source.controlPointVelocities.map(mirrorVectorX),
    controlPointAngles: source.controlPointAngles.map(mirrorAnglesX),
    controlPointScale: source.controlPointScale.map(([sx, sy, sz]) => [sx, sy, sz]),
    strandLength: source.strandLength,
    bendCurvature: -source.bendCurvature,
    uvRegion: mirrorUvRegion(source.uvRegion),
    symmetricPartnerId: source.strandId,
  };
}

/**
 * 원본 스트랜드의 편집 상태를 기존 대칭 파트너 스트랜드에 동기화한다 (`SymmetryHairHelper.Sync`).
 */
export function syncSymmetricHairStrand(
  source: ShaperHairStrandData,
  target: ShaperHairStrandData,
): ShaperHairStrandData {
  const mirrored = createSymmetricHairStrand(source, {
    partnerStrandId: target.strandId,
    mirroredTriangleIndex: target.triangleIndex,
    mirroredVertexIndices: target.vertexIndices,
  });
  return {
    ...mirrored,
    baseMeshId: target.baseMeshId,
    symmetricPartnerId: source.strandId,
  };
}

/**
 * 스프링·감쇠·중력·관성 및 머리/어깨 충돌 구(Collision Sphere)를 적용해 헤어 스트랜드 물리를 1스텝 진행한다.
 */
export function stepHairStrandPhysics(
  strand: ShaperHairStrandData,
  input: StepHairStrandPhysicsInput,
): ShaperHairStrandData {
  const dt = input.dtSeconds;
  if (!Number.isFinite(dt) || dt < 0) {
    throw new ShaperHairPlantingError("INVALID_DT", "dtSeconds must be a non-negative finite number.");
  }
  if (dt === 0) return strand;

  const clampedDt = Math.min(dt, 0.05);
  const gravity = input.gravity ?? [0, -9.81, 0];
  const headAccel = input.headAcceleration ?? [0, 0, 0];
  const stiffness = clamp(input.stiffness ?? 42, 1, 250);
  const damping = clamp(input.damping ?? 0.86, 0.1, 0.999);
  const spheres = input.collisionSpheres ?? [];

  const count = strand.controlPointPos.length;
  const nextPositions: CharacterGroomVector3[] = [strand.rootPosition];
  const nextVelocities: CharacterGroomVector3[] = [[0, 0, 0]];

  for (let i = 1; i < count; i += 1) {
    const currentPos = strand.controlPointPos[i]!;
    const restPos = strand.controlPointRestPos[i]!;
    const currentVel = strand.controlPointVelocities[i] ?? [0, 0, 0];

    const springForce = scale3(sub3(restPos, currentPos), stiffness);
    const inertialForce = scale3(headAccel, -1);
    const totalAccel = add3(add3(gravity, springForce), inertialForce);

    const integratedVel = scale3(add3(currentVel, scale3(totalAccel, clampedDt)), damping);
    let candidatePos = add3(currentPos, scale3(integratedVel, clampedDt));

    const prevRest = strand.controlPointRestPos[i - 1]!;
    const targetSegLength = Math.max(EPSILON, length3(sub3(restPos, prevRest)));
    const prevNewPos = nextPositions[i - 1]!;
    const segDir = normalize3(sub3(candidatePos, prevNewPos), [0, -1, 0]);
    candidatePos = add3(prevNewPos, scale3(segDir, targetSegLength));

    for (const sphere of spheres) {
      if (sphere.radius <= 0) continue;
      const offset = sub3(candidatePos, sphere.center);
      if (length3(offset) < sphere.radius) {
        candidatePos = add3(sphere.center, scale3(normalize3(offset, strand.normal), sphere.radius));
      }
    }

    nextPositions.push(candidatePos);
    nextVelocities.push(scale3(sub3(candidatePos, currentPos), 1 / clampedDt));
  }

  return {
    ...strand,
    controlPointPos: nextPositions,
    controlPointVelocities: nextVelocities,
  };
}

/**
 * 물리 시뮬레이션 상태를 초기 정지 상태(`ResetPhysics`)로 복원한다.
 */
export function resetHairStrandPhysics(strand: ShaperHairStrandData): ShaperHairStrandData {
  return {
    ...strand,
    controlPointPos: [...strand.controlPointRestPos],
    controlPointVelocities: strand.controlPointRestPos.map(() => [0, 0, 0] as const),
  };
}
