// VRM 포즈·표정 프리셋 확장 팩 — 코미Po!(ComiPo!)식 "원클릭 포즈/표정 갈아끼우기".
// StudioVrmPoser의 PoseBoneMap/applyPoseToVrm·applyExpressionWeightsToVrm 규약과 구조적으로 호환:
//  - rotation: 정규화 본의 오일러 회전(라디안). 코어(hips/spine/chest/neck/head)·어깨·말단(hand/foot/finger)에 사용.
//  - direction: 사지(팔다리) 월드 방향 타깃. sideX는 좌우 대칭 자동 처리(양수 = 몸 바깥쪽).
// 외부 에셋 없음 — 순수 데이터 모듈.

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

export type PoseVec3 = readonly [number, number, number];
export type PoseSideAwareDirection = { sideX: number; y: number; z?: number };
export type PoseDirectionTarget = PoseVec3 | PoseSideAwareDirection;
export type PoseBoneSpec = { direction?: PoseDirectionTarget; rotation?: PoseVec3 };
export type PoseBoneMapSpec = Partial<Record<VRMHumanBoneName, PoseBoneSpec>>;

export interface PoseGazeIntent {
  readonly target: "camera" | "hands" | "down" | "forward" | "side";
  readonly pitchDeg: number; readonly yawDeg: number; readonly convergence: number;
}
export interface StudioPosePreset {
  id: string; label: string; tone: string; yOffset?: number;
  gazeIntent?: PoseGazeIntent; bones: PoseBoneMapSpec;
}
export interface StudioExpressionPreset {
  id: string; label: string; emoji: string; tone: string;
  // VRM 표준 표정(blendshape) 이름 → 가중치(0~1) 조합
  weights: Record<string, number>;
}

// 포저(applyPoseToVrm)가 손가락 회전(오일러)으로 적용하는 본 — 모델에 없으면 안전하게 무시된다.
export const POSER_FINGER_BONES: readonly VRMHumanBoneName[] = [
  "leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal",
  "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
  "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
  "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
  "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal",
  "rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal",
  "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
  "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
  "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
  "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal",
];

// 포저(applyPoseToVrm)가 실제로 적용하는 본 집합 — 테스트에서 본 이름 검증에 사용.
export const POSER_KNOWN_BONES: readonly VRMHumanBoneName[] = [
  "hips", "spine", "chest", "neck", "head",
  "leftShoulder", "rightShoulder",
  "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm",
  "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg",
  "leftHand", "rightHand", "leftFoot", "rightFoot",
  ...POSER_FINGER_BONES,
];

// VRM 1.0 표준 프리셋 표정 이름(+표준 시선) — 표정 프리셋 가중치 키 검증용.
export const VRM_STANDARD_EXPRESSIONS: readonly string[] = [
  "neutral", "happy", "angry", "sad", "relaxed", "surprised",
  "aa", "ih", "ou", "ee", "oh",
  "blink", "blinkLeft", "blinkRight",
  "lookUp", "lookDown", "lookLeft", "lookRight",
];

type Deg3 = readonly [number, number, number];
type HandStyle = "relaxed" | "open" | "fist" | "peace" | "point" | "thumbsUp" | "heart" | "cradle";

const d = (deg: number) => (deg * Math.PI) / 180;
const aim = (sideX: number, y: number, z = 0): PoseBoneSpec => ({ direction: { sideX, y, z } });
const rotate = (rotation: PoseVec3): PoseBoneSpec => ({ rotation });
const r = (x: number, y = 0, z = 0): PoseBoneSpec => ({ rotation: [d(x), d(y), d(z)] });
const gaze = (
  target: PoseGazeIntent["target"],
  pitchDeg: number,
  yawDeg: number,
  convergence: number,
): PoseGazeIntent => ({ target, pitchDeg, yawDeg, convergence });

function spineChain(hips: Deg3, spine: Deg3, chest: Deg3, neck: Deg3, head: Deg3): PoseBoneMapSpec {
  return { hips: r(...hips), spine: r(...spine), chest: r(...chest), neck: r(...neck), head: r(...head) };
}

/**
 * Comfortable-attention wrists: almost collinear with the hanging forearm.
 * Only a tiny mirrored roll (1–2°) so palms stay soft without a kinked left wrist.
 * Avoid large Y/Z eulers — they read as spun or broken wrists on VRoid hands.
 */
function idleHands(rollDeg = 1.5): PoseBoneMapSpec {
  return { leftHand: r(0, 0, rollDeg), rightHand: r(0, 0, -rollDeg) };
}

function clampDeg(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// ── 손가락 릴랙스·제스처 커브 (VRM 정규화 본: 좌우 모두 local +Z = 손바닥 쪽 굽힘) ──
// sample.vrm(루미)처럼 축이 뒤집힌 모델은 applyFingerRotations의 극성 정렬이 자동 보정한다.
export const RELAXED_FINGER_CURL_MIN_DEG = 14;
export const RELAXED_FINGER_CURL_MAX_DEG = 24;

const FINGER_SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;
const FINGER_NAMES = ["Index", "Middle", "Ring", "Little"] as const;
const FINGER_CURL_PROFILE: Record<(typeof FINGER_NAMES)[number], number> = {
  Index: 1, Middle: 1.04, Ring: 1.06, Little: 1.08,
};
const SEGMENT_CURL_PROFILE: Record<(typeof FINGER_SEGMENTS)[number], number> = {
  Proximal: 1.05, Intermediate: 1.16, Distal: 0.92,
};
// 손 가운데로 모으는 미세 내전(°). 오른손 검지 -Y·새끼 +Y / 왼손 반전(부호 검증됨).
const FINGER_ADDUCT_DEG: Record<(typeof FINGER_NAMES)[number], number> = {
  Index: -4.5, Middle: -1, Ring: 1.5, Little: 4,
};

function buildRelaxedSide(side: "left" | "right", baseDeg: number, out: PoseBoneMapSpec): void {
  const sideSign = side === "left" ? -1 : 1;
  FINGER_NAMES.forEach((finger) => {
    FINGER_SEGMENTS.forEach((segment) => {
      const curlDeg = clampDeg(
        baseDeg * FINGER_CURL_PROFILE[finger] * SEGMENT_CURL_PROFILE[segment],
        RELAXED_FINGER_CURL_MIN_DEG,
        RELAXED_FINGER_CURL_MAX_DEG,
      );
      const adductDeg = segment === "Proximal" ? FINGER_ADDUCT_DEG[finger] : FINGER_ADDUCT_DEG[finger] * 0.35;
      out[`${side}${finger}${segment}` as VRMHumanBoneName] = rotate([0, d(sideSign * adductDeg), d(curlDeg)]);
    });
  });
  out[`${side}ThumbMetacarpal` as VRMHumanBoneName] = rotate([d(baseDeg * 0.35), d(sideSign * baseDeg * 0.42), d(baseDeg * 0.22)]);
  out[`${side}ThumbProximal` as VRMHumanBoneName] = rotate([d(baseDeg * 0.2), d(sideSign * baseDeg * 0.32), d(baseDeg * 0.24)]);
  out[`${side}ThumbDistal` as VRMHumanBoneName] = rotate([0, d(sideSign * baseDeg * 0.2), d(baseDeg * 0.08)]);
}

export function relaxedFingers(leftCurlDeg: number, rightCurlDeg: number): PoseBoneMapSpec {
  const bones: PoseBoneMapSpec = {};
  buildRelaxedSide("left", leftCurlDeg, bones);
  buildRelaxedSide("right", rightCurlDeg, bones);
  return bones;
}

interface HandStyleSpec {
  readonly curls: readonly [Deg3, Deg3, Deg3, Deg3];
  readonly spread: readonly [number, number, number, number];
  readonly thumb: readonly [Deg3, Deg3, Deg3];
}

const FOLDED_FOUR: readonly [Deg3, Deg3, Deg3, Deg3] = [[62, 86, 58], [66, 90, 60], [70, 92, 62], [72, 90, 60]];
const TUCKED_THUMB: readonly [Deg3, Deg3, Deg3] = [[16, 30, 22], [10, 30, 30], [0, 6, 20]];

const HAND_STYLE_SPECS: Readonly<Record<Exclude<HandStyle, "relaxed">, HandStyleSpec>> = {
  open: {
    curls: [[6, 8, 5], [8, 10, 7], [10, 13, 9], [12, 16, 11]],
    spread: [6, 1.5, -2, -6], thumb: [[6, -8, 4], [4, -4, 3], [0, -2, 2]],
  },
  fist: { curls: FOLDED_FOUR, spread: [0, 0, 0, 0], thumb: TUCKED_THUMB },
  peace: {
    curls: [[4, 6, 4], [4, 6, 4], FOLDED_FOUR[2], FOLDED_FOUR[3]],
    spread: [10, -5, 0, 0], thumb: TUCKED_THUMB,
  },
  point: {
    curls: [[3, 5, 3], FOLDED_FOUR[1], FOLDED_FOUR[2], FOLDED_FOUR[3]],
    spread: [2, 0, 0, 0], thumb: [[14, 26, 18], [6, 24, 24], [0, 4, 14]],
  },
  thumbsUp: {
    curls: FOLDED_FOUR, spread: [0, 0, 0, 0],
    thumb: [[8, -16, 4], [4, -8, 2], [0, -4, 2]],
  },
  heart: {
    curls: [[28, 46, 30], FOLDED_FOUR[1], FOLDED_FOUR[2], FOLDED_FOUR[3]],
    spread: [4, 0, 0, 0], thumb: [[18, 26, 16], [10, 20, 22], [0, 4, 16]],
  },
  cradle: {
    curls: [[26, 42, 28], [34, 52, 35], [40, 58, 39], [46, 62, 42]],
    spread: [2, 0, -1.5, -3], thumb: [[14, 24, 14], [6, 20, 18], [0, 4, 12]],
  },
};

function handPosture(left: HandStyle, right: HandStyle): PoseBoneMapSpec {
  const bones: PoseBoneMapSpec = {};
  ([["left", left], ["right", right]] as const).forEach(([side, style]) => {
    if (style === "relaxed") {
      buildRelaxedSide(side, side === "left" ? 16 : 17, bones);
      return;
    }
    const spec = HAND_STYLE_SPECS[style];
    const sideSign = side === "left" ? -1 : 1;
    FINGER_NAMES.forEach((finger, fi) => {
      const triple = spec.curls[fi]!;
      const spread = spec.spread[fi]!;
      FINGER_SEGMENTS.forEach((segment, si) => {
        bones[`${side}${finger}${segment}` as VRMHumanBoneName] = rotate([
          0, si === 0 ? d(sideSign * spread) : 0, d(triple[si]!),
        ]);
      });
    });
    const [tm, tp, td] = spec.thumb;
    bones[`${side}ThumbMetacarpal` as VRMHumanBoneName] = rotate([d(tm[0]), d(sideSign * tm[1]), d(tm[2])]);
    bones[`${side}ThumbProximal` as VRMHumanBoneName] = rotate([d(tp[0]), d(sideSign * tp[1]), d(tp[2])]);
    bones[`${side}ThumbDistal` as VRMHumanBoneName] = rotate([d(td[0]), d(sideSign * td[1]), d(td[2])]);
  });
  return bones;
}

// ── 쇄골-상완 연동(Clavicle-Humerus Coupling, 견갑상완 리듬) ──────────────
// 상완이 자연 하수(0,-1,0)에서 40° 초과 거상되면 쇄골 상승(좌 +Z / 우 -Z, 8~18°)과
// 전방 도달에 비례한 전인(좌 -Y / 우 +Y)을 연동해 어깨 끼임·함몰을 방지한다.
const CLAVICLE_LIFT_THRESHOLD_DEG = 40;
const CLAVICLE_LIFT_MIN_DEG = 8;
const CLAVICLE_LIFT_MAX_DEG = 18;

function upperArmElevationDeg(spec: PoseBoneSpec | undefined): number {
  const dir = spec?.direction;
  if (!dir) return 0;
  const [x, y, z] = "sideX" in dir ? [dir.sideX, dir.y, dir.z ?? 0] : dir;
  const len = Math.hypot(x, y, z);
  return len <= 1e-6 ? 0 : (Math.acos(Math.min(1, Math.max(-1, -y / len))) * 180) / Math.PI;
}

function coupledShoulder(
  side: "left" | "right",
  upperArm: PoseBoneSpec | undefined,
  explicit: PoseBoneSpec | undefined,
): PoseBoneSpec | undefined {
  const elev = upperArmElevationDeg(upperArm);
  if (elev <= CLAVICLE_LIFT_THRESHOLD_DEG) return explicit;
  const sideSign = side === "left" ? 1 : -1;
  const existing = explicit?.rotation;
  const existingLiftDeg = existing ? sideSign * ((existing[2] * 180) / Math.PI) : 0;
  if (existing && existingLiftDeg >= CLAVICLE_LIFT_MIN_DEG && existingLiftDeg <= CLAVICLE_LIFT_MAX_DEG) return explicit;
  const liftDeg = Number(
    clampDeg(
      CLAVICLE_LIFT_MIN_DEG + ((elev - CLAVICLE_LIFT_THRESHOLD_DEG) / 130) * (CLAVICLE_LIFT_MAX_DEG - CLAVICLE_LIFT_MIN_DEG),
      CLAVICLE_LIFT_MIN_DEG,
      CLAVICLE_LIFT_MAX_DEG,
    ).toFixed(1),
  );
  const dir = upperArm?.direction;
  const forwardZ = dir ? ("sideX" in dir ? (dir.z ?? 0) : dir[2]) : 0;
  const protractDeg = Number(clampDeg(forwardZ * 6, -4, 6).toFixed(1));
  return rotate([
    existing?.[0] ?? 0,
    existing && existing[1] !== 0 ? existing[1] : d(-sideSign * protractDeg),
    d(sideSign * liftDeg),
  ]);
}

// 편안한 차렷 기본 사지 — 팔·다리는 자연 하수, 어깨는 살짝 이완, 손목은 직선에 가깝게.
const BASE_LIMBS: PoseBoneMapSpec = {
  hips: r(0), spine: r(0), chest: r(0), neck: r(0), head: r(0),
  leftShoulder: r(0, 0, -2.5), rightShoulder: r(0, 0, 2.5),
  leftUpperArm: aim(0.28, -0.96, 0.02), rightUpperArm: aim(0.3, -0.95, 0.03),
  leftLowerArm: aim(0.14, -0.98, 0.14), rightLowerArm: aim(0.16, -0.97, 0.16),
  ...idleHands(1.5),
  leftUpperLeg: aim(0.06, -1), rightUpperLeg: aim(0.08, -1),
  leftLowerLeg: aim(0.02, -1), rightLowerLeg: aim(0.03, -1),
  leftFoot: r(0), rightFoot: r(0),
};

function basePose(
  core: PoseBoneMapSpec = {},
  leftHand: HandStyle = "relaxed",
  rightHand: HandStyle = "relaxed",
): PoseBoneMapSpec {
  const merged: PoseBoneMapSpec = { ...BASE_LIMBS, ...handPosture(leftHand, rightHand), ...core };
  const leftShoulder = coupledShoulder("left", merged.leftUpperArm, core.leftShoulder);
  const rightShoulder = coupledShoulder("right", merged.rightUpperArm, core.rightShoulder);
  if (leftShoulder) merged.leftShoulder = leftShoulder;
  if (rightShoulder) merged.rightShoulder = rightShoulder;
  return merged;
}

function idlePose(core: PoseBoneMapSpec, leftCurlDeg: number, rightCurlDeg: number): PoseBoneMapSpec {
  return { ...BASE_LIMBS, ...relaxedFingers(leftCurlDeg, rightCurlDeg), ...core };
}

function xp(
  id: string,
  label: string,
  tone: string,
  gazeIntent: PoseGazeIntent,
  core: PoseBoneMapSpec,
  hands: readonly [HandStyle, HandStyle] = ["relaxed", "relaxed"],
  yOffset?: number,
): StudioPosePreset {
  const preset: StudioPosePreset = { id, label, tone, gazeIntent, bones: basePose(core, hands[0], hands[1]) };
  if (yOffset !== undefined) preset.yOffset = yOffset;
  return preset;
}

// ── 자연 아이들(스폰 기본) 포즈 4종 ───────────────────────────────────────
// 캐릭터 id 해시로 결정적 선택(Math.random 금지). 편안한 차렷 + 콘트라포스토 + 릴랙스 손가락.
export const NATURAL_IDLE_POSES: StudioPosePreset[] = [
  {
    id: "ni_weight_left", label: "자연 대기 A", tone: "편안한 차렷 · 왼발 살짝",
    gazeIntent: gaze("camera", 0, 2, 0.22),
    bones: idlePose({
      ...spineChain([0, 1, 2], [0.5, -0.5, -1.2], [-0.5, -1, -0.5], [0, 1, -0.5], [0.5, -2, 2]),
      leftShoulder: r(0, 0, -3.5), rightShoulder: r(0, 0, 3),
      leftUpperArm: aim(0.26, -0.96, 0), rightUpperArm: aim(0.3, -0.95, 0.03),
      leftLowerArm: aim(0.1, -0.99, 0.1), rightLowerArm: aim(0.16, -0.97, 0.16),
      ...idleHands(1.5),
      leftUpperLeg: aim(0.04, -1, 0), rightUpperLeg: aim(0.1, -0.99, 0.04),
      leftLowerLeg: aim(0.02, -1, 0), rightLowerLeg: aim(0.04, -0.99, -0.06),
      leftFoot: r(0, -1, 0), rightFoot: r(1, 4, 0),
    }, 17, 18),
  },
  {
    id: "ni_weight_right", label: "자연 대기 B", tone: "편안한 차렷 · 오른발 살짝",
    gazeIntent: gaze("camera", 0, -2, 0.22),
    bones: idlePose({
      ...spineChain([0.5, -1.5, -2], [0, 1, 1.2], [-1, 0.5, 0.5], [0.5, -1, 0.5], [-0.5, 2, -2]),
      leftShoulder: r(0, 0, -3), rightShoulder: r(0, 0, 3.5),
      leftUpperArm: aim(0.3, -0.95, 0.03), rightUpperArm: aim(0.26, -0.96, 0),
      leftLowerArm: aim(0.16, -0.97, 0.16), rightLowerArm: aim(0.1, -0.99, 0.1),
      ...idleHands(1.5),
      leftUpperLeg: aim(0.1, -0.99, 0.04), rightUpperLeg: aim(0.04, -1, 0),
      leftLowerLeg: aim(0.04, -0.99, -0.06), rightLowerLeg: aim(0.02, -1, 0),
      leftFoot: r(1, 4, 0), rightFoot: r(0, -1, 0),
    }, 18, 17),
  },
  {
    id: "ni_calm_front", label: "자연 대기 C", tone: "편안한 차렷 · 정면 차분",
    gazeIntent: gaze("camera", -1, -1, 0.22),
    bones: idlePose({
      ...spineChain([0.5, 0.5, 2], [1, 0, -1], [0.5, -0.5, -0.5], [1, 0.5, 0], [1, 1.5, 2]),
      leftShoulder: r(0, 1, -3.2), rightShoulder: r(0, -1, 3.2),
      leftUpperArm: aim(0.28, -0.96, 0.02), rightUpperArm: aim(0.29, -0.95, 0.04),
      leftLowerArm: aim(0.12, -0.97, 0.2), rightLowerArm: aim(0.13, -0.96, 0.22),
      ...idleHands(1.5),
      leftUpperLeg: aim(0.06, -1, 0), rightUpperLeg: aim(0.08, -0.995, 0.02),
      leftLowerLeg: aim(0.02, -1, -0.02), rightLowerLeg: aim(0.03, -0.995, -0.04),
      leftFoot: r(0, 2, 0), rightFoot: r(0, -3, 0),
    }, 18, 18),
  },
  {
    id: "ni_open_easy", label: "자연 대기 D", tone: "편안한 차렷 · 어깨 여유",
    gazeIntent: gaze("camera", 1, -2, 0.22),
    bones: idlePose({
      ...spineChain([-0.5, 2, -2.5], [-1, -1, 1.5], [-1, -0.5, 0.8], [0, 1, -0.5], [-1, 2, -2]),
      leftShoulder: r(0, 0, -3), rightShoulder: r(0, -0.5, 3.5),
      leftUpperArm: aim(0.32, -0.94, 0.05), rightUpperArm: aim(0.28, -0.95, 0.02),
      leftLowerArm: aim(0.18, -0.96, 0.18), rightLowerArm: aim(0.14, -0.97, 0.14),
      ...idleHands(1.5),
      leftUpperLeg: aim(0.09, -0.995, -0.02), rightUpperLeg: aim(0.05, -1, 0.01),
      leftLowerLeg: aim(0.03, -0.995, -0.03), rightLowerLeg: aim(0.02, -1, 0),
      leftFoot: r(0, 3, 0), rightFoot: r(0, -1, 0),
    }, 16, 17),
  },
];

// djb2 해시 — 캐릭터 id로 아이들 포즈를 결정적으로 고른다.
export function naturalIdleSeed(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
}

export function pickNaturalIdlePose(characterId: string): StudioPosePreset {
  return NATURAL_IDLE_POSES[naturalIdleSeed(characterId) % NATURAL_IDLE_POSES.length];
}

// ── 확장 포즈 프리셋 68종 (기본 제공 포즈와 id가 겹치지 않도록 xp_ 접두) ────
// 척추 S커브·콘트라포스토 + 40° 초과 상완 쇄골 연동 + 자연 손가락 커브 + 시선 의도 포함.
export const EXTRA_POSE_PRESETS: StudioPosePreset[] = [
  xp("xp_wave_greeting", "손들어 인사", "반갑게 오른손을 들어 인사", gaze("camera", 2, 4, 0.25), {
    ...spineChain([0, -2, 2.5], [-1, 2, -2], [-2, 2, -1.5], [-1, -2, 1], [-2, -5, 3.5]),
    leftShoulder: r(0, 0, -3), rightShoulder: r(0, 4, -12),
    rightUpperArm: aim(0.54, 0.46, 0.36), rightLowerArm: aim(0.14, 0.88, 0.32), rightHand: r(-68, -6, 4),
    leftUpperLeg: aim(0.05, -1, 0.02), rightUpperLeg: aim(0.11, -0.99, 0.04),
  }, ["relaxed", "open"]),
  xp("xp_idle_relax", "서있기(휴식)", "힘 뺀 기본 대기", gaze("camera", -1, 2, 0.22), {
    ...spineChain([0.8, -1.5, 2.5], [-1.5, 1, -1.8], [0.8, 1, -0.8], [-0.5, -0.5, 0.8], [1, -1.5, 2]),
    leftShoulder: r(0, 0, -3), rightShoulder: r(0, 0, 3.2),
    leftUpperLeg: aim(0.14, -0.99, 0.03), rightUpperLeg: aim(0.05, -1, 0),
    leftLowerLeg: aim(0.04, -0.99, -0.05), leftFoot: r(1, 3, 0),
  }),
  xp("xp_hands_on_hips", "양손 허리", "자신만만 스탠딩", gaze("camera", 1, -2, 0.24), {
    ...spineChain([1, 2.5, 2], [-3, -1.5, -1.5], [-3.5, -1, -0.8], [1.5, 1, 0.8], [-2, 2, 1.5]),
    leftUpperArm: aim(0.76, -0.57, 0.08), leftLowerArm: aim(-0.74, -0.58, 0.2), leftHand: r(0, 14, 11),
    rightUpperArm: aim(0.8, -0.53, 0.12), rightLowerArm: aim(-0.7, -0.62, 0.16), rightHand: r(0, -17, -9),
    leftUpperLeg: aim(0.12, -0.99, 0.02), rightUpperLeg: aim(0.06, -1, -0.02),
  }),
  xp("xp_one_hand_hip", "한손 허리", "여유로운 포즈", gaze("camera", 0, -3, 0.24), {
    ...spineChain([1, -2, 3], [-2, 1.5, -2.2], [-1.5, 1, -1], [1, -1.5, 1], [-1, 4, 2.5]),
    leftShoulder: r(0, 0, -3.2),
    rightUpperArm: aim(0.75, -0.58, 0.1), rightLowerArm: aim(-0.7, -0.62, 0.18), rightHand: r(0, -15, -10),
    leftUpperLeg: aim(0.05, -1, 0), rightUpperLeg: aim(0.13, -0.99, 0.04), rightLowerLeg: aim(0.05, -0.99, -0.05),
  }),
  xp("xp_sprint", "전력 질주", "역동적인 대시", gaze("forward", 3, 4, 0.18), {
    ...spineChain([-14, -6, 1], [16, 5, -1], [4, 3, -0.5], [-3, -2, 0.5], [-8, -5, 0]),
    leftUpperArm: aim(0.28, -0.42, -0.86), leftLowerArm: aim(0.15, 0.2, -0.95),
    rightUpperArm: aim(0.28, -0.3, 0.92), rightLowerArm: aim(0.15, 0.35, 0.9),
    leftUpperLeg: aim(0.08, -0.2, 0.97), leftLowerLeg: aim(0.03, -0.75, 0.65),
    rightUpperLeg: aim(0.08, -0.45, -0.88), rightLowerLeg: aim(0.03, -0.6, -0.78),
  }, ["fist", "fist"], -0.04),
  xp("xp_chair_sit", "의자 앉기", "바른 자세 착석", gaze("camera", -1, -2, 0.28), {
    ...spineChain([-6, 2, 1.5], [5.5, -1, -1], [1.5, -1, -0.5], [1, -1, 0.5], [-1, 3, 1.5]),
    leftShoulder: r(0, -1.5, -3), rightShoulder: r(0, 1.5, 3.5),
    leftUpperLeg: aim(0.17, -0.19, 0.96), rightUpperLeg: aim(0.12, -0.22, 0.97),
    leftLowerLeg: aim(0.07, -0.9, -0.4), rightLowerLeg: aim(0.04, -0.93, -0.33),
    leftUpperArm: aim(0.28, -0.82, 0.38), rightUpperArm: aim(0.33, -0.78, 0.42),
    leftLowerArm: aim(0.06, -0.74, 0.66), rightLowerArm: aim(0.1, -0.7, 0.7),
    leftFoot: r(-6, -3, 0), rightFoot: r(-5, 4, 0),
  }, ["relaxed", "relaxed"], -0.12),
  xp("xp_kneel", "무릎 꿇기", "정중한 자세", gaze("down", -12, 2, 0.42), {
    ...spineChain([4, -2, 1.2], [2, 1, -0.8], [-1, 1, -0.4], [2, -1, 0.5], [3, -2, 1.5]),
    leftShoulder: r(0, 0, -3), rightShoulder: r(0, 0, 2.5),
    leftUpperLeg: aim(0.14, -0.84, -0.51), rightUpperLeg: aim(0.11, -0.86, -0.49),
    leftLowerLeg: aim(0.06, -0.24, -0.96), rightLowerLeg: aim(0.04, -0.26, -0.95),
    leftUpperArm: aim(0.28, -0.93, 0.18), rightUpperArm: aim(0.32, -0.91, 0.23),
    leftLowerArm: aim(0.08, -0.96, 0.26), rightLowerArm: aim(0.12, -0.94, 0.3),
    leftFoot: r(35, 2, 0), rightFoot: r(33, -2, 0),
  }, ["relaxed", "relaxed"], -0.42),
  xp("xp_finger_heart", "손하트", "팬서비스 컷", gaze("camera", 1, 4, 0.26), {
    ...spineChain([0.5, 2, 2.5], [-1.5, -1.5, -2], [-1.5, -1, -1], [1, 1.5, 2], [2, -5, -7]),
    leftShoulder: r(0, 0, -3),
    rightUpperArm: aim(0.42, 0.12, 0.5), rightLowerArm: aim(-0.4, 0.72, 0.5), rightHand: r(10, -20, -12),
  }, ["relaxed", "heart"]),
  xp("xp_double_v", "양손 브이", "신난 셀카 포즈", gaze("camera", 2, 0, 0.25), {
    ...spineChain([1.5, 0, 0], [-2.5, 0, 0], [-2.5, 0, 0], [1.5, 0, -1.5], [-2, 0, 6]),
    leftUpperArm: aim(0.6, 0.12, 0.4), leftLowerArm: aim(0.2, 0.85, 0.42), leftHand: r(-10, 0, 12),
    rightUpperArm: aim(0.6, 0.12, 0.4), rightLowerArm: aim(0.2, 0.85, 0.42), rightHand: r(-10, 0, -12),
  }, ["peace", "peace"]),
  xp("xp_point_you", "지목(삿대질)", "\"바로 너!\" 컷", gaze("camera", 2, 4, 0.28), {
    ...spineChain([-3, -6, 1.5], [5, 4, -1.5], [3, 3, -0.5], [-1, -2, 1], [-3, -4, 1]),
    leftShoulder: r(0, 0, -3), leftUpperArm: aim(0.4, -0.9, -0.1),
    rightUpperArm: aim(0.22, 0.05, 0.97), rightLowerArm: aim(0.12, 0.02, 0.99), rightHand: r(0, 0, -5),
  }, ["relaxed", "point"]),
  xp("xp_shock_hands", "놀람 양손", "\"헉!\" 리액션", gaze("camera", 3, 2, 0.22), {
    ...spineChain([3, -2, 1.5], [-6, 1.5, -1.5], [-5, 1, -0.5], [2, -1, 0.5], [-7, -2, 1]),
    leftUpperArm: aim(0.74, 0.2, 0.3), leftLowerArm: aim(0.3, 0.8, 0.4), leftHand: r(-18, 2, 12),
    rightUpperArm: aim(0.7, 0.15, 0.35), rightLowerArm: aim(0.26, 0.84, 0.36), rightHand: r(-23, -2, -9),
    leftUpperLeg: aim(0.12, -0.96, -0.22),
  }, ["open", "open"]),
  xp("xp_teary", "울먹임", "눈물 그렁그렁", gaze("down", -14, -4, 0.48), {
    ...spineChain([1, 1.5, -2], [7, -1, 1.5], [5, -1, 0.5], [6, 1, -1], [7, 2, 3]),
    leftUpperArm: aim(0.18, -0.4, 0.6), leftLowerArm: aim(-0.28, 0.78, 0.48), leftHand: r(13, 2, 9),
    rightUpperArm: aim(0.14, -0.44, 0.64), rightLowerArm: aim(-0.32, 0.74, 0.52), rightHand: r(17, -2, -7),
  }, ["cradle", "cradle"]),
  xp("xp_banzai", "만세", "두 팔 번쩍", gaze("forward", 10, 0, 0.16), {
    ...spineChain([2.5, 0, 0], [-5, 0, 0], [-4, 0, 0], [-2, 0, 0], [-6, 0, 0]),
    leftUpperArm: aim(0.3, 0.92, 0.14), leftLowerArm: aim(0.14, 0.98, 0.06), leftHand: r(0, 0, 8),
    rightUpperArm: aim(0.3, 0.92, 0.14), rightLowerArm: aim(0.14, 0.98, 0.06), rightHand: r(0, 0, -8),
  }, ["open", "open"]),
  xp("xp_guard_up", "싸움 자세(가드)", "주먹 들고 대비", gaze("forward", 3, 8, 0.28), {
    ...spineChain([-5, -10, 1.5], [6, 8, -1.5], [2, 5, -0.5], [1, -3, 1], [-3, -9, 0]),
    leftUpperArm: aim(0.42, -0.08, 0.66), leftLowerArm: aim(-0.2, 0.7, 0.6), leftHand: r(-23, 3, 12),
    rightUpperArm: aim(0.38, -0.16, 0.58), rightLowerArm: aim(-0.24, 0.66, 0.64), rightHand: r(-27, -3, -9),
    leftUpperLeg: aim(0.14, -0.72, 0.66), rightUpperLeg: aim(0.14, -0.86, -0.48),
    leftLowerLeg: aim(0.04, -0.95, 0.3), rightLowerLeg: aim(0.04, -0.92, -0.36),
  }, ["fist", "fist"], -0.05),
  xp("xp_shrug", "어깨 으쓱", "\"몰라~\" 제스처", gaze("camera", 1, 3, 0.24), {
    ...spineChain([1, -2, 2], [-2.5, 1.5, -1.5], [-1.5, 1, -0.8], [1, -1, -2], [2, -2, 8]),
    leftShoulder: r(0, -2, 13), rightShoulder: r(0, 2, -12),
    leftUpperArm: aim(0.84, -0.4, 0.16), leftLowerArm: aim(0.74, 0.43, 0.32), leftHand: r(-58, 2, 16),
    rightUpperArm: aim(0.8, -0.44, 0.2), rightLowerArm: aim(0.7, 0.47, 0.28), rightHand: r(-62, -2, -14),
  }, ["open", "open"]),
  xp("xp_phone_look", "스마트폰 보기", "폰 보며 딴청", gaze("hands", -22, 0, 0.72), {
    ...relaxedFingers(22, 24),
    ...spineChain([1, -1.5, 1.5], [6, 1, -1], [5, 1, -0.5], [9, 0, 1], [10, -1, 2]),
    leftShoulder: r(0, -3, -2), rightShoulder: r(0, 3, 2),
    rightUpperArm: aim(0.26, -0.58, 0.62), rightLowerArm: aim(-0.42, 0.32, 0.82), rightHand: r(-84, -4, 2),
    leftUpperArm: aim(0.28, -0.64, 0.54), leftLowerArm: aim(-0.38, 0.24, 0.84), leftHand: r(-80, 4, -2),
  }),
  xp("xp_chin_rest", "턱 괴기", "골똘한 생각", gaze("side", 5, 14, 0.22), {
    ...spineChain([1, -2, -2.5], [6, 1.5, 2], [4, 1, 0.8], [3, -1, -1.5], [3, 6, 8]),
    leftShoulder: r(0, 0, -3),
    rightUpperArm: aim(0.2, -0.45, 0.74), rightLowerArm: aim(-0.32, 0.86, 0.36), rightHand: r(-15, -20, -10),
    leftUpperArm: aim(0.32, -0.88, 0.3), leftLowerArm: aim(-0.5, -0.55, 0.62),
  }, ["relaxed", "cradle"]),
  xp("xp_polite_bow", "인사 꾸벅", "공손한 목례", gaze("down", -20, 0, 0.45), {
    ...spineChain([8, 0, 0], [22, 0, 0], [14, 0, 0], [8, 0, 0], [6, 0, 0]),
    leftShoulder: r(0, -1, -2.5), rightShoulder: r(0, 1, 2.5),
    leftUpperArm: aim(0.2, -0.94, 0.26), rightUpperArm: aim(0.2, -0.94, 0.26),
    leftLowerArm: aim(0.08, -0.96, 0.22), rightLowerArm: aim(0.08, -0.96, 0.22),
  }, ["relaxed", "relaxed"], -0.02),
  xp("xp_jump_joy", "신나는 점프", "공중에서 환호", gaze("camera", 4, 0, 0.2), {
    ...spineChain([-6, -1.5, -1.5], [-4, 1.5, 3], [3, 1, -1.5], [1, 0, 1.5], [-7, 0, -4]),
    leftUpperArm: aim(0.65, 0.74, 0.12), leftLowerArm: aim(0.32, 0.93, 0.1),
    rightUpperArm: aim(0.58, 0.78, 0.08), rightLowerArm: aim(0.27, 0.95, 0.06),
    leftUpperLeg: aim(0.1, -0.5, 0.86), leftLowerLeg: aim(0.05, -0.8, -0.58),
    rightUpperLeg: aim(0.12, -0.92, 0.12), rightLowerLeg: aim(0.05, -0.55, -0.82),
    leftFoot: r(-20, 0, 0), rightFoot: r(-18, 0, 0),
  }, ["open", "open"], 0.16),
  xp("xp_look_back", "뒤돌아보기", "어깨 너머 시선", gaze("side", 0, -22, 0.24), {
    ...spineChain([1, -8, 2], [1, -20, -1.5], [1, -18, -0.8], [-1, -11, 1], [-1, -11, -3]),
    leftShoulder: r(0, 2, -2.5), rightShoulder: r(0, -2, 3),
    rightUpperArm: aim(0.4, -0.9, -0.15), leftUpperArm: aim(0.35, -0.92, 0.1),
  }),
  xp("xp_lying_down", "누워있기", "바닥에 벌렁", gaze("forward", 8, -4, 0.2), {
    ...spineChain([-85, 0, 0], [2, -1, 0], [1, 1, 0], [6, -1, 0], [6, 3, 2]),
    leftUpperArm: aim(0.55, -0.15, -0.5), rightUpperArm: aim(0.45, -0.22, -0.6),
    leftLowerArm: aim(0.34, -0.08, -0.66), rightLowerArm: aim(0.26, -0.12, -0.74),
    leftUpperLeg: aim(0.15, -0.1, 0.94), rightUpperLeg: aim(0.1, -0.14, 0.96),
    leftLowerLeg: aim(0.07, -0.16, 0.93), rightLowerLeg: aim(0.04, -0.2, 0.91),
  }, ["relaxed", "relaxed"], -0.55),
  xp("xp_hands_behind", "뒷짐", "느긋한 산책", gaze("camera", 1, -2, 0.22), {
    ...spineChain([1, -2, 2.5], [-3, 1, -1.8], [-3.5, 1, -0.8], [1.5, -1, 1], [-2, 2, 1.5]),
    leftShoulder: r(0, 3, -2.5), rightShoulder: r(0, -3, 2),
    leftUpperArm: aim(0.26, -0.8, -0.44), leftLowerArm: aim(-0.53, -0.52, -0.53),
    rightUpperArm: aim(0.22, -0.84, -0.4), rightLowerArm: aim(-0.57, -0.48, -0.57),
    leftUpperLeg: aim(0.05, -1, 0), rightUpperLeg: aim(0.11, -0.99, 0.03),
  }),
  xp("xp_propose_kneel", "한쪽 무릎(프로포즈)", "극적인 고백 컷", gaze("camera", 5, 2, 0.3), {
    ...spineChain([2, -2, 1], [4, 2, -1], [-2, 2, -0.5], [-2, -1, 0.5], [-5, -2, 1.5]),
    leftShoulder: r(0, 0, -3), leftUpperArm: aim(0.35, -0.9, 0.1), rightFoot: r(30, 0, 0),
    rightUpperLeg: aim(0.12, -0.8, -0.55), rightLowerLeg: aim(0.05, -0.3, -0.93),
    leftUpperLeg: aim(0.12, -0.45, 0.87), leftLowerLeg: aim(0.05, -0.95, -0.2),
    rightUpperArm: aim(0.25, -0.2, 0.9), rightLowerArm: aim(0.1, 0.05, 0.97), rightHand: r(-30, 0, 0),
  }, ["relaxed", "cradle"], -0.3),
  // 추가 45종 — 액션·표정·일상·장르 전 프리셋에 S커브·쇄골 연동·손가락·시선 의도 적용
  xp("xp_kick", "킥", "발차기", gaze("forward", 0, 4, 0.25), {
    ...spineChain([-8, -6, 2], [6, 5, -2], [2, 4, -1], [-2, -3, 1], [-2, -5, 0]),
    leftUpperArm: aim(0.45, -0.25, 0.55), leftLowerArm: aim(-0.2, 0.55, 0.7),
    rightUpperArm: aim(0.5, -0.45, -0.35), rightLowerArm: aim(0.2, -0.1, -0.85),
    rightUpperLeg: aim(0.2, -0.1, -0.95), rightLowerLeg: aim(0.1, -0.6, -0.8), leftUpperLeg: aim(0.15, -0.95, 0.1),
  }, ["fist", "fist"], -0.05),
  xp("xp_punch", "펀치", "주먹질", gaze("forward", 0, 2, 0.28), {
    ...spineChain([-3, -8, 1.5], [4, 10, -1.5], [2, 12, -1], [-1, -8, 1], [-2, -10, 0]),
    leftUpperArm: aim(0.45, -0.55, -0.45), leftLowerArm: aim(-0.1, -0.2, 0.85),
    rightUpperArm: aim(0.25, 0.1, 0.92), rightLowerArm: aim(0.1, 0.18, 0.96), rightHand: r(5, 0, -10),
  }, ["fist", "fist"]),
  xp("xp_sit_floor", "바닥 앉기", "편안한 좌식", gaze("camera", 2, -2, 0.26), {
    ...spineChain([-65, 2, 1.5], [10, -1, -1], [4, -1, -0.5], [2, 0, 0.5], [2, 3, 2]),
    leftUpperArm: aim(0.32, -0.78, 0.35), rightUpperArm: aim(0.28, -0.82, 0.3),
    leftLowerArm: aim(-0.15, -0.62, 0.72), rightLowerArm: aim(-0.1, -0.66, 0.68),
    leftUpperLeg: aim(0.6, -0.3, 0.7), rightUpperLeg: aim(0.5, -0.4, 0.65),
  }, ["relaxed", "relaxed"], -0.35),
  xp("xp_dance", "댄스", "가벼운 춤", gaze("camera", 1, -5, 0.24), {
    ...spineChain([2, 8, 3.5], [-2, -6, -2.5], [-3, -4, -1.5], [1, 4, 1.5], [-2, 6, -4]),
    leftUpperArm: aim(0.78, 0.52, 0.28), leftLowerArm: aim(0.35, 0.88, 0.22),
    rightUpperArm: aim(0.68, -0.36, 0.42), rightLowerArm: aim(-0.25, 0.45, 0.75),
  }, ["open", "open"]),
  xp("xp_run", "달리기", "전력", gaze("forward", 2, 0, 0.18), {
    ...spineChain([-6, 5, 1], [8, -4, -1], [3, -3, -0.5], [-2, 2, 0.5], [-3, 3, 0]),
    leftUpperArm: aim(0.26, -0.65, 0.65), leftLowerArm: aim(0.1, 0.15, 0.92),
    rightUpperArm: aim(0.3, -0.72, -0.55), rightLowerArm: aim(0.12, -0.3, -0.86),
    leftUpperLeg: aim(0.18, -0.32, 0.9), rightUpperLeg: aim(0.1, -0.88, -0.4), leftLowerLeg: aim(0.12, -0.62, 0.7),
  }, ["fist", "fist"], -0.03),
  xp("xp_crouch", "웅크리기", "숨기", gaze("forward", 6, 0, 0.28), {
    ...spineChain([-25, -2, 1.5], [14, 1, -1], [8, 1, -0.5], [-4, 0, 0.5], [-6, 2, 1]),
    leftUpperArm: aim(0.36, -0.64, 0.52), rightUpperArm: aim(0.33, -0.66, 0.48),
    leftLowerArm: aim(-0.3, -0.5, 0.75), rightLowerArm: aim(-0.28, -0.52, 0.74),
    leftUpperLeg: aim(0.4, -0.6, 0.6), rightUpperLeg: aim(0.35, -0.65, 0.55),
  }, ["cradle", "cradle"], -0.25),
  xp("xp_fist_up", "주먹 들기", "결의", gaze("camera", 3, 2, 0.24), {
    ...spineChain([1, -3, 2.5], [-3, 2, -2], [-4, 2, -1], [-1, -1, 1], [-4, -3, 2]),
    rightUpperArm: aim(0.24, 0.88, 0.14), rightLowerArm: aim(-0.08, 0.96, 0.08), rightHand: r(10, 0, -15),
  }, ["relaxed", "fist"]),
  xp("xp_bow_deep", "깊은 인사", "정중", gaze("down", -22, 0, 0.45), {
    ...spineChain([12, 0, 0], [24, 0, 0], [14, 0, 0], [8, 0, 0], [7, 0, 0]),
    leftUpperArm: aim(0.2, -0.93, 0.28), rightUpperArm: aim(0.2, -0.93, 0.28),
    leftLowerArm: aim(0.08, -0.95, 0.25), rightLowerArm: aim(0.08, -0.95, 0.25),
  }, ["relaxed", "relaxed"], -0.05),
  xp("xp_lean_wall", "벽 기대기", "캐주얼", gaze("side", -2, 16, 0.22), {
    ...spineChain([2, -10, 3], [2, -16, -2], [-1, -8, -1], [0, 8, 1.5], [-1, 10, 3]),
    rightUpperArm: aim(0.18, -0.72, -0.48), leftUpperLeg: aim(0.12, -0.98, 0.1),
  }),
  xp("xp_hold_heart", "가슴에 손", "진심", gaze("down", -12, 4, 0.52), {
    ...spineChain([1, 1.5, -2], [3, -1, 1.5], [3, -1, 0.5], [3, 0, -1], [4, 3, 3]),
    leftUpperArm: aim(0.4, -0.32, 0.58), leftLowerArm: aim(-0.45, 0.35, 0.72), leftHand: r(-10, 12, 14),
  }, ["open", "relaxed"]),
  xp("xp_spin", "회전", "스핀", gaze("side", 0, -18, 0.2), {
    ...spineChain([0, 42, 2], [-2, 28, -1.5], [-2, 16, -1], [0, -10, 1], [-2, -12, 3]),
    leftUpperArm: aim(0.75, -0.25, 0.45), rightUpperArm: aim(0.75, -0.28, -0.42),
  }, ["open", "open"]),
  xp("xp_kneel_pray", "무릎 기도", "경건", gaze("forward", 14, 0, 0.22), {
    ...spineChain([5, 0, 1], [4, 0, -0.8], [2, 0, -0.4], [-2, 0, 0.4], [-7, 0, 1]),
    leftUpperArm: aim(0.28, -0.55, 0.62), rightUpperArm: aim(0.26, -0.57, 0.6),
    leftLowerArm: aim(-0.48, 0.42, 0.68), rightLowerArm: aim(-0.46, 0.44, 0.66),
    rightUpperLeg: aim(0.15, -0.75, -0.5), rightLowerLeg: aim(0.08, -0.25, -0.9),
  }, ["open", "open"], -0.35),
  xp("xp_jump_pose", "점프 포즈", "공중", gaze("camera", 2, -2, 0.22), {
    ...spineChain([-4, 3, -2], [-3, -2, 2], [2, -1, 1], [1, 0, -1], [-4, 2, 3]),
    leftUpperArm: aim(0.72, 0.45, 0.2), rightUpperArm: aim(0.68, 0.4, 0.22),
    leftUpperLeg: aim(0.25, -0.4, 0.8), rightUpperLeg: aim(0.15, -0.5, -0.7), leftLowerLeg: aim(0.1, -0.7, -0.5),
  }, ["open", "open"], 0.12),
  xp("xp_side_lean", "옆 기대", "여유", gaze("side", -1, -14, 0.22), {
    ...spineChain([1, 10, 3.5], [-1, -6, -2.5], [-1, -4, -1.2], [0, 4, 1.2], [0, -5, 3]),
    rightUpperArm: aim(0.14, -0.8, -0.3),
  }),
  xp("xp_sword_ready", "검 자세", "전투", gaze("forward", 2, 6, 0.28), {
    ...spineChain([-4, -6, 1.5], [5, 6, -1.5], [3, 5, -0.8], [-1, -4, 0.8], [-2, -6, 0]),
    leftUpperArm: aim(0.5, -0.5, -0.35),
    rightUpperArm: aim(0.25, 0.05, 0.9), rightLowerArm: aim(0.05, 0.1, 0.98),
  }, ["fist", "cradle"]),
  xp("xp_blush_cover", "부끄러움 가리기", "수줍", gaze("side", -10, 16, 0.45), {
    ...spineChain([1, -2, 2], [4, 2, -1.5], [4, 1, -0.8], [4, -1, 1.5], [5, 6, 5]),
    rightUpperArm: aim(0.45, -0.25, 0.58), rightLowerArm: aim(-0.35, 0.62, 0.64),
  }, ["relaxed", "open"]),
  xp("xp_think_chin", "턱 고개", "고민", gaze("side", 6, -16, 0.24), {
    ...spineChain([1, 2, -2], [3, -1.5, 1.5], [3, -1, 0.8], [3, 2, -1], [6, -8, -3]),
    rightUpperArm: aim(0.3, -0.25, 0.55), rightLowerArm: aim(-0.38, 0.68, 0.55),
  }, ["relaxed", "cradle"]),
  xp("xp_superhero", "히어로 포즈", "영웅", gaze("forward", 8, -4, 0.2), {
    ...spineChain([-3, 4, -2], [-3, -3, 1.5], [-4, -2, 0.8], [1, 2, -0.8], [-4, 4, -2]),
    leftUpperArm: aim(0.2, 0.95, 0.15), leftLowerArm: aim(0.1, 0.98, 0.1), rightUpperArm: aim(0.32, -0.82, -0.25),
  }, ["fist", "fist"]),
  xp("xp_sad_sit", "슬픔 앉기", "우울", gaze("down", -20, -4, 0.5), {
    ...spineChain([-35, 1, 1.5], [14, -1, -2], [10, 0, -1], [8, 1, 1], [9, 3, 4]),
    leftUpperArm: aim(0.35, -0.75, 0.32), rightUpperArm: aim(0.32, -0.78, 0.28),
    leftUpperLeg: aim(0.25, -0.35, 0.85), rightUpperLeg: aim(0.22, -0.38, 0.84),
  }, ["relaxed", "relaxed"], -0.25),
  xp("xp_laugh", "웃음", "박장대소", gaze("camera", 4, -5, 0.22), {
    ...spineChain([2, -2, 2], [-6, 3, -1.5], [-5, 2, -0.8], [-3, -2, 1], [-10, 8, 6]),
    leftUpperArm: aim(0.68, 0.38, 0.4), leftLowerArm: aim(0.1, 0.72, 0.55),
    rightUpperArm: aim(0.64, 0.3, 0.42), rightLowerArm: aim(0.08, 0.68, 0.58),
  }, ["open", "open"]),
  xp("xp_meditate", "명상", "차분", gaze("down", -14, 0, 0.55), {
    ...spineChain([2, 0, 0], [3, 0, 0], [2, 0, 0], [1, 0, 0], [2, 0, 0]),
    leftUpperArm: aim(0.34, -0.78, 0.42), rightUpperArm: aim(0.34, -0.78, 0.42),
    leftLowerArm: aim(-0.18, -0.45, 0.82), rightLowerArm: aim(-0.18, -0.45, 0.82),
  }, ["open", "open"]),
  xp("xp_point_forward", "앞 가리키기", "지시", gaze("forward", 2, 4, 0.24), {
    ...spineChain([-2, -4, 1.5], [3, 4, -1.2], [2, 3, -0.6], [-1, -2, 0.8], [-1, -3, 1]),
    rightUpperArm: aim(0.14, 0.18, 0.95), rightLowerArm: aim(0.06, 0.12, 0.98),
  }, ["relaxed", "point"]),
  xp("xp_angel_wing", "날개 포즈", "천사", gaze("forward", 10, -4, 0.18), {
    ...spineChain([2, 2, 2], [-4, -2, -1.5], [-4, -1, -0.8], [-1, 1, 1], [-3, 2, 3]),
    leftUpperArm: aim(0.82, 0.55, 0.18), leftLowerArm: aim(0.88, 0.35, 0.15),
    rightUpperArm: aim(0.78, 0.48, 0.16), rightLowerArm: aim(0.84, 0.3, 0.14),
  }, ["open", "open"]),
  xp("xp_cry", "울기", "눈물", gaze("down", -18, 2, 0.52), {
    ...spineChain([2, -1.5, -1.5], [8, 1, 2], [6, 1, 1], [7, -1, -1], [9, 2, 3]),
    leftUpperArm: aim(0.24, -0.38, 0.62), leftLowerArm: aim(-0.32, 0.72, 0.52),
    rightUpperArm: aim(0.2, -0.42, 0.6), rightLowerArm: aim(-0.3, 0.68, 0.56),
  }, ["cradle", "cradle"]),
  xp("xp_fly_pose", "비행 포즈", "하늘", gaze("forward", 12, 0, 0.16), {
    ...spineChain([-8, 2, -1.5], [-6, -2, 1.5], [-5, -1, 0.8], [-3, 1, -0.5], [-6, 2, -2]),
    leftUpperArm: aim(0.12, 0.9, 0.22), leftLowerArm: aim(0.06, 0.95, 0.18), rightUpperArm: aim(0.2, -0.82, -0.25),
    leftUpperLeg: aim(0.2, -0.3, 0.8), rightUpperLeg: aim(0.15, -0.4, -0.75),
  }, ["fist", "open"], 0.05),
  xp("xp_thumbs_up", "엄지척", "좋아", gaze("camera", 1, 3, 0.26), {
    ...spineChain([1, -2, 2.5], [-2, 2, -1.8], [-2, 1, -0.8], [0, -1, 1], [-2, -3, 3]),
    rightUpperArm: aim(0.48, -0.1, 0.8), rightLowerArm: aim(-0.1, 0.35, 0.85), rightHand: r(5, 0, 25),
  }, ["relaxed", "thumbsUp"]),
  xp("xp_shock", "깜짝 놀람", "헉", gaze("camera", 4, 5, 0.22), {
    ...spineChain([3, -3, 1.5], [-8, 4, -1.5], [-5, 3, -0.8], [2, -2, 1], [-11, -6, 4]),
    leftUpperArm: aim(0.7, 0.24, 0.42), leftLowerArm: aim(0.3, 0.78, 0.44),
    rightUpperArm: aim(0.66, 0.18, 0.44), rightLowerArm: aim(0.26, 0.74, 0.48),
  }, ["open", "open"]),
  xp("xp_sleep_stand", "졸음 서기", "꾸벅", gaze("down", -22, 2, 0.55), {
    ...spineChain([1, 1, 2], [5, -1, -1.5], [4, 0, -0.8], [8, 1, 1], [11, 3, -2]),
    leftUpperArm: aim(0.22, -0.88, 0.12), rightUpperArm: aim(0.26, -0.86, 0.14),
  }),
  xp("xp_victory", "승리 V", "승리", gaze("camera", 2, 3, 0.24), {
    ...spineChain([1, -2.5, 2.5], [-2, 2, -2], [-3, 1.5, -1], [0, -1, 1], [-2, -3, 4]),
    leftUpperArm: aim(0.55, 0.32, 0.48), leftLowerArm: aim(0.14, 0.9, 0.32),
    rightUpperArm: aim(0.5, 0.22, 0.44), rightLowerArm: aim(0.1, 0.86, 0.36),
  }, ["peace", "peace"]),
  xp("xp_cool_lean", "쿨 기대기", "멋", gaze("camera", -2, 6, 0.24), {
    ...spineChain([2, 8, -3], [-1, -14, 2], [-2, -8, 1], [0, 6, -1], [-1, -8, 3]),
    rightUpperArm: aim(0.15, -0.75, -0.4), leftUpperLeg: aim(0.12, -0.99, 0.05),
  }),
  xp("xp_phone_selfie", "셀카", "스마트폰 각도", gaze("camera", 4, -6, 0.3), {
    ...spineChain([1, 2.5, -2.5], [-2, -2, 2], [-2, -1.5, 1], [1, 2, -1], [-4, 8, 4]),
    leftUpperArm: aim(0.42, -0.5, 0.45), leftLowerArm: aim(-0.15, 0.65, 0.55),
    rightUpperArm: aim(0.35, 0.35, 0.7), rightLowerArm: aim(0.1, 0.55, 0.75),
  }, ["peace", "cradle"]),
  xp("xp_typing", "타이핑", "노트북 작업", gaze("hands", -18, 0, 0.68), {
    ...spineChain([-8, 1, 1], [8, -1, -0.8], [5, 0, -0.4], [6, 0, 0.4], [7, 0, 1]),
    leftUpperArm: aim(0.34, -0.46, 0.56), rightUpperArm: aim(0.32, -0.48, 0.54),
    leftLowerArm: aim(-0.16, -0.2, 0.9), rightLowerArm: aim(-0.14, -0.22, 0.88),
  }, ["cradle", "cradle"]),
  xp("xp_cooking", "요리", "팬 젓기", gaze("hands", -16, -4, 0.65), {
    ...spineChain([1, -3, 2], [4, 3, -1.5], [3, 2, -0.8], [4, -1, 0.8], [6, -2, 2]),
    leftUpperArm: aim(0.3, -0.52, 0.5), leftLowerArm: aim(-0.18, -0.1, 0.88),
    rightUpperArm: aim(0.4, -0.2, 0.75), rightLowerArm: aim(0.1, 0.15, 0.9),
  }, ["cradle", "cradle"]),
  xp("xp_reading", "독서", "책 펼침", gaze("hands", -20, 0, 0.72), {
    ...spineChain([1, -1.5, 1.5], [5, 1, -1], [4, 1, -0.5], [7, 0, 0.5], [9, -1, 1.5]),
    leftUpperArm: aim(0.42, -0.38, 0.56), rightUpperArm: aim(0.38, -0.36, 0.54),
    leftLowerArm: aim(-0.28, 0.22, 0.84), rightLowerArm: aim(-0.26, 0.24, 0.82),
  }, ["cradle", "cradle"]),
  xp("xp_guard", "가드", "방어 자세", gaze("forward", 3, 4, 0.3), {
    ...spineChain([-3, -6, 1.5], [5, 5, -1.2], [4, 4, -0.6], [2, -3, 0.6], [2, -5, 1]),
    leftUpperArm: aim(0.48, -0.1, 0.72), leftLowerArm: aim(-0.32, 0.68, 0.56),
    rightUpperArm: aim(0.44, -0.14, 0.68), rightLowerArm: aim(-0.3, 0.64, 0.6),
  }, ["fist", "fist"]),
  xp("xp_archer", "궁수", "활 시위", gaze("side", 0, -22, 0.32), {
    ...spineChain([0, 18, 1.5], [0, 14, -1.2], [-1, 10, -0.6], [0, -10, 0.6], [-2, -12, 0]),
    leftUpperArm: aim(0.15, 0.05, 0.95), leftLowerArm: aim(0.08, 0.04, 0.98),
    rightUpperArm: aim(0.55, 0.08, -0.62), rightLowerArm: aim(-0.22, 0.12, 0.85),
  }, ["cradle", "cradle"]),
  xp("xp_salutation", "경례", "군대·교칙", gaze("forward", 0, 0, 0.2), {
    ...spineChain([1, 0, 0], [-2, 0, 0], [-2, 0, 0], [1, 0, 0], [-1, 0, 0]),
    rightUpperArm: aim(0.48, 0.58, 0.3), rightLowerArm: aim(-0.42, 0.68, 0.52), rightHand: r(-15, -12, -10),
  }, ["relaxed", "open"]),
  xp("xp_present", "소개 포즈", "안내·쇼", gaze("camera", 1, -5, 0.25), {
    ...spineChain([1, 3, -2], [-2, -2, 1.5], [-2, -2, 0.8], [0, 2, -0.8], [-2, 6, -2]),
    leftUpperArm: aim(0.55, -0.15, 0.65), leftLowerArm: aim(0.1, 0.2, 0.9),
  }, ["open", "relaxed"]),
  xp("xp_wait_line", "줄 서기", "대기", gaze("side", -3, -12, 0.2), {
    ...spineChain([1, -2, 2.5], [1, 1.5, -1.8], [0.5, 1, -0.8], [1, -1, 0.8], [2, -3, 2]),
    leftUpperArm: aim(0.25, -0.88, 0.08), rightUpperArm: aim(0.28, -0.86, 0.1),
    leftUpperLeg: aim(0.05, -1, 0), rightUpperLeg: aim(0.11, -0.99, 0.04),
  }),
  xp("xp_stretch", "기지개", "기상", gaze("forward", 14, 0, 0.16), {
    ...spineChain([3, 1, -1.5], [-7, -1, 1.2], [-6, 0, 0.6], [-3, 0, -0.6], [-7, 2, -2]),
    leftUpperArm: aim(0.18, 0.94, 0.14), leftLowerArm: aim(0.1, 0.98, 0.08),
    rightUpperArm: aim(0.2, 0.92, 0.12), rightLowerArm: aim(0.12, 0.97, 0.06),
  }, ["open", "open"]),
  xp("xp_fall_back", "뒤로 넘어짐", "충격", gaze("forward", 12, 0, 0.22), {
    ...spineChain([-8, 2, -2], [-18, -2, 1.5], [-10, -1, 0.8], [-4, 1, -0.8], [-10, 2, -2]),
    leftUpperArm: aim(0.7, 0.3, 0.4), leftLowerArm: aim(0.35, 0.65, 0.52),
    rightUpperArm: aim(0.65, 0.22, 0.42), rightLowerArm: aim(0.3, 0.6, 0.55),
  }, ["open", "open"], -0.15),
  xp("xp_hug_self", "자기 안기", "추위·불안", gaze("down", -16, -6, 0.48), {
    ...spineChain([1, -1.5, 1.5], [6, 1, -1], [5, 1, -0.5], [5, -1, 0.8], [6, 3, 3]),
    leftUpperArm: aim(0.38, -0.42, 0.64), rightUpperArm: aim(0.34, -0.46, 0.62),
    leftLowerArm: aim(-0.68, 0.15, 0.55), rightLowerArm: aim(-0.65, 0.1, 0.58),
  }, ["cradle", "cradle"]),
  xp("xp_cheer_both", "양손 환호", "응원", gaze("camera", 4, 2, 0.22), {
    ...spineChain([2, -1.5, 1.5], [-4, 1.5, -1.2], [-4, 1, -0.6], [-1, -1, 0.6], [-6, -2, 2]),
    leftUpperArm: aim(0.28, 0.93, 0.18), leftLowerArm: aim(0.12, 0.96, 0.14),
    rightUpperArm: aim(0.26, 0.91, 0.16), rightLowerArm: aim(0.1, 0.95, 0.12),
  }, ["fist", "fist"]),
  xp("xp_sneak", "살금", "잠입", gaze("side", -4, 18, 0.25), {
    ...spineChain([-12, -6, 1.5], [11, 8, -1.2], [6, 6, -0.6], [-3, -4, 0.6], [3, 10, 2]),
    leftUpperArm: aim(0.42, -0.64, 0.48), rightUpperArm: aim(0.38, -0.66, 0.44),
    leftLowerArm: aim(0.12, -0.32, 0.88), rightLowerArm: aim(0.1, -0.36, 0.85),
    leftUpperLeg: aim(0.25, -0.7, 0.55), rightUpperLeg: aim(0.2, -0.85, -0.25),
  }, ["open", "open"], -0.12),
  xp("xp_balance", "균형", "한 발", gaze("forward", -4, 2, 0.24), {
    ...spineChain([2, -3, -3.5], [-2, 2, 2.5], [-1, 1, 1.2], [0, -1, -1.2], [-2, 2, -3]),
    leftUpperArm: aim(0.86, 0.18, 0.16), leftLowerArm: aim(0.9, 0.08, 0.2),
    rightUpperArm: aim(0.82, 0.12, 0.14), rightLowerArm: aim(0.86, 0.05, 0.18),
    leftUpperLeg: aim(0.15, -0.95, 0.05), rightUpperLeg: aim(0.4, -0.5, 0.7),
  }, ["open", "open"], -0.02),
];

// ── 표정 프리셋 28종 — VRM 표준 표정 가중치 "조합"을 원클릭 적용 ─────────
export const EXPRESSION_PRESETS: StudioExpressionPreset[] = [
  { id: "xf_joy", label: "기쁨", emoji: "😊", tone: "밝은 미소", weights: { happy: 1 } },
  { id: "xf_grin", label: "활짝웃음", emoji: "😆", tone: "눈웃음 + 함박", weights: { happy: 1, blink: 1, aa: 0.3 } },
  { id: "xf_sad", label: "슬픔", emoji: "😢", tone: "축 처진 표정", weights: { sad: 1 } },
  { id: "xf_tears", label: "눈물", emoji: "😭", tone: "울음 직전", weights: { sad: 1, blink: 0.55, ou: 0.3 } },
  { id: "xf_angry", label: "분노", emoji: "😠", tone: "정색 화남", weights: { angry: 1 } },
  { id: "xf_grudge", label: "킹받음", emoji: "😤", tone: "웃는데 화남", weights: { angry: 0.7, happy: 0.4, ih: 0.35 } },
  { id: "xf_surprised", label: "놀람", emoji: "😲", tone: "동공 지진", weights: { surprised: 1, oh: 0.55 } },
  { id: "xf_blank", label: "멍", emoji: "😶", tone: "넋 나간 얼굴", weights: { relaxed: 0.4, aa: 0.15, lookUp: 0.3 } },
  { id: "xf_shy", label: "부끄러움", emoji: "😳", tone: "시선 회피", weights: { happy: 0.4, sad: 0.25, lookDown: 0.6 } },
  { id: "xf_wink", label: "윙크", emoji: "😉", tone: "한쪽 눈 찡긋", weights: { happy: 0.7, blinkRight: 1, ih: 0.25 } },
  { id: "xf_sleepy", label: "졸림", emoji: "😪", tone: "반쯤 감긴 눈", weights: { relaxed: 0.8, blink: 0.8, aa: 0.2 } },
  { id: "xf_neutral", label: "무표정", emoji: "😐", tone: "표정 초기화", weights: {} },
  { id: "xf_determined", label: "결의", emoji: "😼", tone: "불타는 의지", weights: { angry: 0.45, happy: 0.3, ee: 0.4 } },
  { id: "xf_pout", label: "새침(삐짐)", emoji: "😗", tone: "입 삐죽", weights: { angry: 0.3, ou: 0.7, lookLeft: 0.3 } },
  { id: "xf_smirk", label: "능글", emoji: "😏", tone: "자신만만", weights: { happy: 0.6, angry: 0.2, lookRight: 0.4 } },
  { id: "xf_awe", label: "경외", emoji: "😮", tone: "입 벌린 감탄", weights: { surprised: 0.8, oh: 0.7, lookUp: 0.3 } },
  { id: "xf_evil", label: "사악", emoji: "😈", tone: "음흉", weights: { angry: 0.5, happy: 0.6, ih: 0.4 } },
  { id: "xf_cry_laugh", label: "눈물 웃음", emoji: "😂", tone: "배꼽", weights: { happy: 1, sad: 0.3, blink: 0.6, aa: 0.4 } },
  { id: "xf_confused", label: "혼란", emoji: "😕", tone: "어리둥절", weights: { sad: 0.3, relaxed: 0.5, lookLeft: 0.5, lookRight: 0.2 } },
  { id: "xf_love", label: "사랑", emoji: "🥰", tone: "하트 눈", weights: { happy: 0.9, relaxed: 0.4 } },
  { id: "xf_scream", label: "비명", emoji: "😱", tone: "공포", weights: { surprised: 1, oh: 0.9, aa: 0.6 } },
  { id: "xf_cool", label: "쿨", emoji: "😎", tone: "선글라스 감성", weights: { relaxed: 0.6, happy: 0.3, lookDown: 0.2 } },
  { id: "xf_focus", label: "집중", emoji: "🧐", tone: "일에 몰입", weights: { angry: 0.25, ee: 0.35, lookDown: 0.4 } },
  { id: "xf_yawn", label: "하품", emoji: "🥱", tone: "피곤", weights: { relaxed: 0.7, aa: 0.75, blink: 0.5 } },
  { id: "xf_sassy", label: "도도", emoji: "💅", tone: "자존심", weights: { happy: 0.35, angry: 0.25, lookRight: 0.45, ou: 0.25 } },
  { id: "xf_innocent", label: "순수", emoji: "🥺", tone: "순진", weights: { sad: 0.2, happy: 0.45, lookUp: 0.35 } },
  { id: "xf_serious", label: "진지", emoji: "😐", tone: "무거움", weights: { angry: 0.35, relaxed: 0.2, ee: 0.2 } },
  { id: "xf_excited", label: "흥분", emoji: "🤩", tone: "설렘", weights: { happy: 1, surprised: 0.45, aa: 0.35 } },
];
