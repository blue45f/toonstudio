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
