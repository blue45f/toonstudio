import type {
  CharacterCanonicalManifestV2,
  CharacterCanonicalPartDescriptor,
  CharacterCanonicalPartFitDriver,
  CharacterCanonicalPartLod,
} from "./character-canonical-manifest";

export type CharacterCanonicalPartAvailability =
  | { readonly status: "supported"; readonly reason: null }
  | { readonly status: "unavailable"; readonly reason: string };

export interface CharacterCanonicalPartFitScale {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CharacterCanonicalPartPlan {
  readonly partId: string;
  readonly availability: CharacterCanonicalPartAvailability;
  readonly lod: CharacterCanonicalPartLod | null;
  readonly scale: CharacterCanonicalPartFitScale;
  readonly clearanceMeters: number;
  readonly hideTargetPart: boolean;
  readonly correctiveMorphs: Readonly<Record<string, number>>;
  /**
   * 포즈 연동 교정 모프가 실제로 기여한 규칙 영수증. `poseFlexion`을 넘긴 경우에만 존재한다.
   * 포즈를 넘기지 않은 기존 호출은 계획 객체 형태가 종전과 완전히 같다.
   */
  readonly poseCorrectiveContributions?: readonly CharacterCanonicalPoseCorrectiveContribution[];
}

/* ── 포즈 연동 교정 모프 ─────────────────────────────────────────────
 * 종전에는 파츠의 correctiveMorphs가 정적 복사만 돼서, 어깨를 올리거나 팔꿈치·고관절을
 * 굽히는 대표 포즈에서 겨드랑이·사타구니·팔꿈치 안쪽 관통이 그대로 남았다.
 * 아래 규칙은 관절 굴곡각(도)이 시작 각도를 넘으면 교정 모프를 선형 램프로 얹는다.
 * 모프 이름은 파츠 저작 규약 키를 사용한다 — 해당 모프 타깃이 없는 파츠에서는
 * 렌더러가 이름으로 조회하므로 자연히 무동작(no-op)이 된다.
 */
export type CharacterCanonicalPoseJoint =
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "spine";

/** 관절별 굴곡 크기(도, 0 이상). 없거나 유효하지 않은 값은 휴지(rest)로 본다. */
export type CharacterCanonicalPoseFlexion = Readonly<
  Partial<Record<CharacterCanonicalPoseJoint, number>>
>;

export interface CharacterCanonicalPoseCorrectiveRule {
  readonly id: string;
  readonly joint: CharacterCanonicalPoseJoint;
  /** 이 각도(도)부터 램프가 시작된다. */
  readonly startDeg: number;
  /** 이 각도(도)에서 최대 기여에 도달한다. */
  readonly fullDeg: number;
  readonly morphKey: string;
  /** fullDeg에서의 최대 가산 가중치(기본 모프와 합산 후 [-1, 1]로 클램프). */
  readonly peakWeight: number;
}

export interface CharacterCanonicalPoseCorrectiveContribution {
  readonly ruleId: string;
  readonly morphKey: string;
  readonly weight: number;
}

export const CHARACTER_CANONICAL_POSE_CORRECTIVE_RULES: readonly CharacterCanonicalPoseCorrectiveRule[] =
  Object.freeze([
    Object.freeze({ id: "shoulder-left-clearance", joint: "leftShoulder", startDeg: 30, fullDeg: 120, morphKey: "shoulder-left-clearance", peakWeight: 0.65 }),
    Object.freeze({ id: "shoulder-right-clearance", joint: "rightShoulder", startDeg: 30, fullDeg: 120, morphKey: "shoulder-right-clearance", peakWeight: 0.65 }),
    Object.freeze({ id: "elbow-left-clearance", joint: "leftElbow", startDeg: 45, fullDeg: 140, morphKey: "elbow-left-clearance", peakWeight: 0.5 }),
    Object.freeze({ id: "elbow-right-clearance", joint: "rightElbow", startDeg: 45, fullDeg: 140, morphKey: "elbow-right-clearance", peakWeight: 0.5 }),
    Object.freeze({ id: "hip-left-clearance", joint: "leftHip", startDeg: 40, fullDeg: 120, morphKey: "hip-left-clearance", peakWeight: 0.6 }),
    Object.freeze({ id: "hip-right-clearance", joint: "rightHip", startDeg: 40, fullDeg: 120, morphKey: "hip-right-clearance", peakWeight: 0.6 }),
    Object.freeze({ id: "knee-left-clearance", joint: "leftKnee", startDeg: 50, fullDeg: 140, morphKey: "knee-left-clearance", peakWeight: 0.45 }),
    Object.freeze({ id: "knee-right-clearance", joint: "rightKnee", startDeg: 50, fullDeg: 140, morphKey: "knee-right-clearance", peakWeight: 0.45 }),
    Object.freeze({ id: "spine-waist-clearance", joint: "spine", startDeg: 15, fullDeg: 45, morphKey: "waist-clearance", peakWeight: 0.4 }),
  ]);

export interface CharacterCanonicalPoseCorrectiveResult {
  readonly morphs: Readonly<Record<string, number>>;
  readonly contributions: readonly CharacterCanonicalPoseCorrectiveContribution[];
}

/**
 * 정적 교정 모프에 현재 포즈의 굴곡을 반영한다.
 * 휴지 포즈(모든 각도가 시작 각도 이하)에서는 기본 모프와 동등한 맵과 빈 기여 목록을 돌려준다.
 */
export function resolveCharacterCanonicalPoseCorrectiveMorphs(
  baseMorphs: Readonly<Record<string, number>>,
  poseFlexion: CharacterCanonicalPoseFlexion,
): CharacterCanonicalPoseCorrectiveResult {
  const morphs: Record<string, number> = { ...baseMorphs };
  const contributions: CharacterCanonicalPoseCorrectiveContribution[] = [];
  for (const rule of CHARACTER_CANONICAL_POSE_CORRECTIVE_RULES) {
    const rawDegrees = poseFlexion[rule.joint];
    const degrees = typeof rawDegrees === "number" && Number.isFinite(rawDegrees) && rawDegrees > 0
      ? rawDegrees
      : 0;
    if (degrees <= rule.startDeg) continue;
    const ramp = clamp((degrees - rule.startDeg) / (rule.fullDeg - rule.startDeg), 0, 1);
    const weight = rule.peakWeight * ramp;
    if (weight <= 0) continue;
    morphs[rule.morphKey] = clamp((morphs[rule.morphKey] ?? 0) + weight, -1, 1);
    contributions.push(Object.freeze({ ruleId: rule.id, morphKey: rule.morphKey, weight }));
  }
  return Object.freeze({
    morphs: Object.freeze(morphs),
    contributions: Object.freeze(contributions),
  });
}

const QUALITY_PARITY_FLOOR = 90;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function driverScale(
  driver: CharacterCanonicalPartFitDriver,
  measurements: Readonly<Record<string, number>>,
): number {
  const measured = measurements[driver.measurement];
  if (!Number.isFinite(measured) || measured <= 0 || driver.reference <= 0) return 1;
  const ratio = measured / driver.reference;
  return clamp(
    1 + (ratio - 1) * driver.weight,
    driver.minimumScale,
    driver.maximumScale,
  );
}

export function deriveCharacterCanonicalPartFitScale(
  part: CharacterCanonicalPartDescriptor,
  measurements: Readonly<Record<string, number>>,
): CharacterCanonicalPartFitScale {
  let x = 1;
  let y = 1;
  let z = 1;
  for (const driver of part.fitting.drivers) {
    const scale = driverScale(driver, measurements);
    if (driver.axis === "uniform") {
      x *= scale;
      y *= scale;
      z *= scale;
    } else if (driver.axis === "x") {
      x *= scale;
    } else if (driver.axis === "y") {
      y *= scale;
    } else {
      z *= scale;
    }
  }
  return Object.freeze({ x, y, z });
}

export function inspectCharacterCanonicalPartAvailability(
  manifest: CharacterCanonicalManifestV2,
  part: CharacterCanonicalPartDescriptor,
): CharacterCanonicalPartAvailability {
  if (!part.quality.accepted || part.quality.minimumScore < QUALITY_PARITY_FLOOR) {
    return Object.freeze({
      status: "unavailable",
      reason: `품질 승인 점수가 ${QUALITY_PARITY_FLOOR}점 기준을 충족하지 않습니다.`,
    });
  }
  if (!part.provenance.commercialUse || !part.provenance.redistribution || !part.provenance.derivativeUse) {
    return Object.freeze({
      status: "unavailable",
      reason: "상업 사용·재배포·파생 저작 권리가 모두 확인된 파츠만 사용할 수 있습니다.",
    });
  }
  const topology = part.binding.requiredTopologyFamilies;
  if (topology && topology.length > 0 && !topology.includes(manifest.identity.topologyFamily)) {
    return Object.freeze({
      status: "unavailable",
      reason: `현재 토폴로지 ${manifest.identity.topologyFamily}와 호환되지 않습니다.`,
    });
  }
  const rigs = part.binding.requiredRigRevisions;
  if (rigs && rigs.length > 0 && !rigs.includes(manifest.identity.rigRevision)) {
    return Object.freeze({
      status: "unavailable",
      reason: `현재 리그 ${manifest.identity.rigRevision}용으로 승인되지 않은 파츠입니다.`,
    });
  }
  if (part.binding.targetSocket) {
    const socket = manifest.fitting.sockets.find((entry) => entry.id === part.binding.targetSocket);
    if (!socket) {
      return Object.freeze({
        status: "unavailable",
        reason: `필요한 부착 소켓 ${part.binding.targetSocket}이 현재 모델에 없습니다.`,
      });
    }
  }
  return Object.freeze({ status: "supported", reason: null });
}

export function selectCharacterCanonicalPartLod(
  part: CharacterCanonicalPartDescriptor,
  projectedHeightPx: number,
): CharacterCanonicalPartLod | null {
  if (part.lods.length === 0) return null;
  const height = Number.isFinite(projectedHeightPx) && projectedHeightPx > 0
    ? projectedHeightPx
    : Number.POSITIVE_INFINITY;
  const ordered = [...part.lods].sort(
    (left, right) => left.maximumProjectedHeightPx - right.maximumProjectedHeightPx,
  );
  return ordered.find((lod) => height <= lod.maximumProjectedHeightPx) ?? ordered.at(-1) ?? null;
}

export function createCharacterCanonicalPartPlan(input: {
  readonly manifest: CharacterCanonicalManifestV2;
  readonly part: CharacterCanonicalPartDescriptor;
  readonly projectedHeightPx: number;
  /** 현재 포즈의 관절 굴곡(도). 넘기면 교정 모프가 포즈 연동으로 합성된다. */
  readonly poseFlexion?: CharacterCanonicalPoseFlexion;
}): CharacterCanonicalPartPlan {
  const availability = inspectCharacterCanonicalPartAvailability(input.manifest, input.part);
  const poseCorrectives = input.poseFlexion
    ? resolveCharacterCanonicalPoseCorrectiveMorphs(input.part.fitting.correctiveMorphs, input.poseFlexion)
    : null;
  return Object.freeze({
    partId: input.part.id,
    availability,
    lod: selectCharacterCanonicalPartLod(input.part, input.projectedHeightPx),
    scale: deriveCharacterCanonicalPartFitScale(input.part, input.manifest.fitting.bodyMeasurements),
    clearanceMeters: input.part.fitting.clearanceMeters,
    hideTargetPart: input.part.fitting.hideTargetPart,
    correctiveMorphs: poseCorrectives
      ? poseCorrectives.morphs
      : Object.freeze({ ...input.part.fitting.correctiveMorphs }),
    ...(poseCorrectives ? { poseCorrectiveContributions: poseCorrectives.contributions } : {}),
  });
}

/**
 * `NormalSolver.VertexKey` (`0x06000689`) 명세:
 * 정점 좌표를 `Math.round(coord * 100000)` ($10^{-5}$ 격자)로 양자화하고
 * 32-bit FNV-1a (`init = -2128831035`, `prime = 16777619`) 해시를 계산한다.
 */
export function computeShaperVertexKeyHashFnva(
  position: readonly [number, number, number],
  tolerance = 100_000,
): { readonly qx: number; readonly qy: number; readonly qz: number; readonly hash: number } {
  const qx = Math.round(position[0] * tolerance);
  const qy = Math.round(position[1] * tolerance);
  const qz = Math.round(position[2] * tolerance);
  let h = -2128831035 | 0;
  h = Math.imul(h ^ qx, 16777619);
  h = Math.imul(h ^ qy, 16777619);
  h = Math.imul(h ^ qz, 16777619);
  return { qx, qy, qz, hash: h >>> 0 };
}

/**
 * `NormalSolver::RecalculateNormals` (`0x06000274`) 명세:
 * 동일 위치($10^{-5}$) 코너 정점들 중 면 법선 내적 $\mathbf{n}_1 \cdot \mathbf{n}_2 \ge \cos(\theta_{\text{deg}})$을
 * 만족하는 면 법선만 합산·정규화하여 하드 엣지(Crease)와 스무딩을 동시에 보존한다.
 */
export function recalculateShaperCreaseNormalsFnva(
  vertices: readonly (readonly [number, number, number])[],
  triangles: readonly (readonly [number, number, number])[],
  creaseAngleDeg = 60,
): readonly (readonly [number, number, number])[] {
  const cosTheta = Math.cos((clamp(creaseAngleDeg, 0, 180) * Math.PI) / 180);
  const faceNormals: (readonly [number, number, number])[] = triangles.map(([i0, i1, i2]) => {
    const v0 = vertices[i0] ?? [0, 0, 0];
    const v1 = vertices[i1] ?? [0, 0, 0];
    const v2 = vertices[i2] ?? [0, 0, 0];
    const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = v1[2] - v0[2];
    const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = v2[2] - v0[2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    return len > 1e-8 ? [nx / len, ny / len, nz / len] : [0, 1, 0];
  });

  const bucketMap = new Map<string, { readonly vertexIndex: number; readonly faceIndex: number }[]>();
  triangles.forEach((tri, faceIndex) => {
    for (const vertexIndex of tri) {
      const pos = vertices[vertexIndex] ?? [0, 0, 0];
      const key = computeShaperVertexKeyHashFnva(pos);
      const bucketKey = `${key.qx}:${key.qy}:${key.qz}:${key.hash}`;
      let list = bucketMap.get(bucketKey);
      if (!list) {
        list = [];
        bucketMap.set(bucketKey, list);
      }
      list.push({ vertexIndex, faceIndex });
    }
  });

  const out: (readonly [number, number, number])[] = vertices.map(() => [0, 1, 0]);
  for (const entries of bucketMap.values()) {
    for (const lhs of entries) {
      const n1 = faceNormals[lhs.faceIndex]!;
      let sx = 0, sy = 0, sz = 0;
      for (const rhs of entries) {
        const n2 = faceNormals[rhs.faceIndex]!;
        const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
        if (lhs.vertexIndex === rhs.vertexIndex || dot >= cosTheta) {
          sx += n2[0];
          sy += n2[1];
          sz += n2[2];
        }
      }
      const len = Math.hypot(sx, sy, sz);
      if (len > 1e-8) {
        out[lhs.vertexIndex] = [
          Number((sx / len).toFixed(6)),
          Number((sy / len).toFixed(6)),
          Number((sz / len).toFixed(6)),
        ];
      }
    }
  }
  return out;
}

/**
 * `MeshData::Update` (`0x06000272`) 파츠 교체 `0.2s` 모핑 전환 명세:
 * `meshChangeAniDuration = 0.2f` (200ms) 동안 정점 위치, Catmull-Clark `SubVertex.power` 샤프니스,
 * 안구 피벗을 선형 보간한다.
 */
export function interpolateShaperPartMorphTransition(input: {
  readonly elapsedSec: number;
  readonly durationSec?: number;
  readonly startPosition: readonly [number, number, number];
  readonly endPosition: readonly [number, number, number];
  readonly startPower: number;
  readonly endPower: number;
}): {
  readonly progress01: number;
  readonly completed: boolean;
  readonly position: readonly [number, number, number];
  readonly power: number;
} {
  const duration = Math.max(1e-4, input.durationSec ?? 0.2);
  const t = clamp(input.elapsedSec / duration, 0, 1);
  return {
    progress01: Number(t.toFixed(4)),
    completed: t >= 1,
    position: [
      Number((input.startPosition[0] + (input.endPosition[0] - input.startPosition[0]) * t).toFixed(6)),
      Number((input.startPosition[1] + (input.endPosition[1] - input.startPosition[1]) * t).toFixed(6)),
      Number((input.startPosition[2] + (input.endPosition[2] - input.startPosition[2]) * t).toFixed(6)),
    ],
    power: Number((input.startPower + (input.endPower - input.startPower) * t).toFixed(6)),
  };
}

/**
 * `UIManager::LateUpdate` (`0x0600037e`) 프리셋 카드 수정자 클릭 명세:
 * - `Shift+Click`: 색상만 적용 (`color-only`)
 * - `Ctrl/Cmd+Click`: 기존 색상을 유지하고 형태만 적용 (`shape-only`)
 * - 일반 클릭: 형태+색상 전체 적용 (`full`)
 */
export function resolveShaperPresetClickModifierMode(modifiers: {
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}): {
  readonly mode: "full" | "color-only" | "shape-only";
  readonly koLabel: string;
} {
  if (modifiers.shiftKey) {
    return { mode: "color-only", koLabel: "Shift+클릭 · 색상만 적용" };
  }
  if (modifiers.ctrlKey || modifiers.metaKey) {
    return { mode: "shape-only", koLabel: "Ctrl/Cmd+클릭 · 형태만 적용" };
  }
  return { mode: "full", koLabel: "클릭 · 형태+색상 전체 적용" };
}

