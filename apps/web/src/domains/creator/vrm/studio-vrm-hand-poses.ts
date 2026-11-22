import {
  STUDIO_VRM_HAND_DIP_PIP_RATIO,
  refineStudioVrmHandPose15Dof,
  resolveStudioVrmAdjacentFingerSpread,
} from "./studio-vrm-hair-hand-equip-refiner";

/**
 * Shared, normalized-VRM hand poses. Degrees are authored per joint, not copied
 * to all three phalanges. The runtime and shelf glyphs consume this same table.
 * These are pose presets, not a claim of mesh-level collision-free contact.
 */
export type StudioVrmHandSide = "left" | "right";
export type StudioVrmHandPoseType =
  | "fist" | "open" | "point" | "peace" | "thumbsUp" | "holding"
  | "phoneGrip" | "penGrip" | "fingerHeart" | "cupGrip"
  | "rockRoll" | "okSign" | "relaxed" | "claw" | "callMe" | "pinch";
export type StudioVrmHandFinger = "thumb" | "index" | "middle" | "ring" | "little";
export type StudioVrmHandRotations = Record<string, [number, number, number]>;
type Triple = readonly [number, number, number];
type FingerJoints = readonly [Triple, Triple, Triple, Triple];
interface HandPoseDefinition {
  /** Index → little; MCP / PIP / DIP flexion in degrees. */
  readonly fingers: FingerJoints;
  /** Lateral spread is applied only to the proximal joint. */
  readonly spread: readonly [number, number, number, number];
  /** Metacarpal / proximal / distal XYZ rotations for the right hand. */
  readonly thumb: readonly [Triple, Triple, Triple];
}
const NAMES = ["Index", "Middle", "Ring", "Little"] as const;
const SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;
const FOLDED: FingerJoints = [[62, 88, 59], [68, 94, 63], [72, 96, 64], [74, 92, 62]];
const FOLDED_THUMB: HandPoseDefinition["thumb"] = [[16, 32, 18], [8, 34, 34], [0, 4, 24]];
const STRAIGHT: Triple = [0, 0, 0];
const DEG = Math.PI / 180;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const DEFINITIONS: Readonly<Record<StudioVrmHandPoseType, HandPoseDefinition>> = {
  fist: { fingers: FOLDED, spread: [0, 0, 0, 0], thumb: FOLDED_THUMB },
  open: {
    fingers: [STRAIGHT, STRAIGHT, STRAIGHT, STRAIGHT], spread: [10, 3, -4, -10],
    thumb: [[10, -20, -12], [4, -10, -2], STRAIGHT],
  },
  point: {
    fingers: [[2, 4, 3], FOLDED[1], FOLDED[2], FOLDED[3]], spread: [3, 0, 0, 0],
    thumb: [[14, 26, 12], [6, 26, 24], [0, 3, 16]],
  },
  peace: {
    fingers: [[2, 4, 3], [2, 4, 3], FOLDED[2], FOLDED[3]], spread: [12, -2, -3, -4],
    thumb: FOLDED_THUMB,
  },
  thumbsUp: {
    fingers: FOLDED, spread: [0, 0, 0, 0],
    thumb: [[12, -22, -16], [4, -6, -2], STRAIGHT],
  },
  holding: {
    fingers: [[50, 74, 50], [54, 80, 54], [58, 82, 55], [60, 78, 52]], spread: [0, 0, 0, 0],
    thumb: [[16, 32, 16], [7, 32, 28], [0, 3, 20]],
  },
  phoneGrip: {
    fingers: [[18, 34, 23], [38, 60, 40], [44, 64, 43], [52, 62, 41]], spread: [3, 0, -2, -4],
    thumb: [[14, 24, 10], [5, 22, 18], [0, 2, 12]],
  },
  penGrip: {
    fingers: [[34, 60, 40], [40, 65, 44], [50, 72, 48], [56, 76, 51]], spread: [3, 0, -2, -3],
    thumb: [[18, 34, 16], [7, 32, 26], [0, 3, 18]],
  },
  fingerHeart: {
    fingers: [[30, 52, 35], FOLDED[1], FOLDED[2], FOLDED[3]], spread: [8, 0, 0, 0],
    thumb: [[16, 24, 12], [8, 16, 26], [0, 2, 20]],
  },
  cupGrip: {
    fingers: [[32, 52, 35], [36, 56, 38], [40, 58, 39], [44, 56, 38]], spread: [2, 0, -2, -3],
    thumb: [[15, 28, 13], [6, 24, 22], [0, 2, 14]],
  },
  rockRoll: {
    fingers: [[2, 4, 3], FOLDED[1], FOLDED[2], [2, 4, 3]], spread: [10, 0, 0, -12],
    thumb: FOLDED_THUMB,
  },
  okSign: {
    // 원을 만드는 검지와 달리 중지는 살짝만 굽힌다. glyph 보정 없이 실제 관절도 같은 자세다.
    fingers: [[45, 66, 44], [6, 9, 6], [10, 14, 9], [14, 18, 12]], spread: [4, 2, -4, -10],
    thumb: [[18, 36, 18], [7, 34, 27], [0, 3, 18]],
  },
  relaxed: {
    fingers: [[8, 14, 9], [12, 20, 13], [18, 26, 17], [24, 32, 21]], spread: [4, 1, -2, -5],
    thumb: [[10, 16, 7], [4, 14, 9], [0, 2, 6]],
  },
  claw: {
    fingers: [[38, 72, 48], [42, 76, 51], [44, 78, 52], [46, 74, 50]], spread: [7, 2, -3, -7],
    thumb: [[14, 22, 12], [6, 22, 20], [0, 3, 14]],
  },
  callMe: {
    fingers: [FOLDED[0], FOLDED[1], FOLDED[2], STRAIGHT], spread: [0, 0, 0, -12],
    thumb: [[12, -24, -18], [4, -6, -2], STRAIGHT],
  },
  pinch: {
    fingers: [[40, 52, 35], [30, 44, 29], [55, 78, 52], [60, 80, 54]], spread: [2, 0, -2, -3],
    thumb: [[18, 36, 18], [7, 36, 28], [0, 4, 20]],
  },
};

export const STUDIO_VRM_HAND_POSE_TYPES: readonly StudioVrmHandPoseType[] = Object.freeze(
  Object.keys(DEFINITIONS) as StudioVrmHandPoseType[],
);

function definitionFor(pose: StudioVrmHandPoseType): HandPoseDefinition {
  return Object.hasOwn(DEFINITIONS, pose) ? DEFINITIONS[pose] : DEFINITIONS.relaxed;
}

function mirroredRadians(rotation: Triple, side: StudioVrmHandSide): [number, number, number] {
  const sign = side === "left" ? -1 : 1;
  return [rotation[0] * DEG, rotation[1] * sign * DEG, rotation[2] * sign * DEG];
}

/** Complete replacement for just one hand: no stale thumb opposition or finger spread. */
export function createStudioVrmHandPose(
  side: StudioVrmHandSide,
  pose: StudioVrmHandPoseType,
): StudioVrmHandRotations {
  if (side !== "left" && side !== "right") return {};
  const definition = definitionFor(pose);
  const safeSpread = resolveStudioVrmAdjacentFingerSpread(
    definition.spread,
    [
      definition.fingers[0][0],
      definition.fingers[1][0],
      definition.fingers[2][0],
      definition.fingers[3][0],
    ],
  );
  const result: StudioVrmHandRotations = {};
  NAMES.forEach((name, finger) => {
    SEGMENTS.forEach((segment, joint) => {
      result[`${side}${name}${segment}`] = mirroredRadians(
        [0, joint === 0 ? safeSpread[finger] : 0, definition.fingers[finger][joint]], side,
      );
    });
  });
  (["Metacarpal", "Proximal", "Distal"] as const).forEach((segment, joint) => {
    result[`${side}Thumb${segment}`] = mirroredRadians(definition.thumb[joint], side);
  });
  return refineStudioVrmHandPose15Dof(side, result, {
    coupleDipToPip: true,
    enforceNonCrossingSpread: true,
    strengthenThumbCmc: false,
  });
}

/**
 * Curl control remains in MCP degrees, preserving the existing slider readback.
 * The middle joint leads the distal joint (`DIP ≈ 0.67 × PIP`); thumb opposition
 * is distributed over the thumb chain. Non-finite input is ignored.
 */
export function createStudioVrmFingerCurlPose(
  side: StudioVrmHandSide,
  degrees: number,
  finger?: StudioVrmHandFinger,
): StudioVrmHandRotations {
  if (!Number.isFinite(degrees) || (side !== "left" && side !== "right")) return {};
  const curl = clamp(degrees, 0, 90);
  const result: StudioVrmHandRotations = {};
  const cascade = [1, 1.04, 1.08, 1.12] as const;
  NAMES.forEach((name, index) => {
    if (finger && finger !== name.toLowerCase()) return;
    const gain = cascade[index];
    const mcp = Math.min(90, curl * gain);
    const pip = Math.min(100, curl * 1.15 * gain);
    const dip = Math.min(72, pip * STUDIO_VRM_HAND_DIP_PIP_RATIO);
    const joints = [mcp, pip, dip];
    SEGMENTS.forEach((segment, joint) => {
      result[`${side}${name}${segment}`] = mirroredRadians([0, 0, joints[joint]], side);
    });
  });
  if (!finger || finger === "thumb") {
    // CMC opposition is part of a curl, not an optional extra. Distributing it over all three
    // thumb bones avoids the flat "robot thumb" that only hinges at MCP/IP.
    result[`${side}ThumbMetacarpal`] = mirroredRadians(
      [curl * 0.16, curl * 0.34, curl * 0.18], side,
    );
    result[`${side}ThumbProximal`] = mirroredRadians(
      [curl * 0.08, curl * 0.6, curl * 0.38], side,
    );
    result[`${side}ThumbDistal`] = mirroredRadians([0, curl * 0.08, curl * 0.38], side);
  }
  return result;
}

/** Thumbnail curl values are computed from the actual normalized preset, not a second angle table. */
export function studioVrmHandPoseGlyphCurls(
  pose: StudioVrmHandPoseType,
): readonly [number, number, number, number, number] {
  const hand = createStudioVrmHandPose("right", pose);
  const folded = createStudioVrmHandPose("right", "fist");
  const fingerCurls = NAMES.map((name) => {
    const sum = SEGMENTS.reduce((total, segment) => total + Math.max(0, hand[`right${name}${segment}`]?.[2] ?? 0), 0);
    const max = SEGMENTS.reduce((total, segment) => total + Math.max(0, folded[`right${name}${segment}`]?.[2] ?? 0), 0);
    return clamp(max > 0 ? sum / max : 0, 0, 1);
  });
  const thumbSumDeg = (["Metacarpal", "Proximal", "Distal"] as const).reduce(
    (sum, segment) => sum + Math.max(0, (hand[`rightThumb${segment}`]?.[2] ?? 0) / DEG),
    0,
  );
  const thumbCurl = clamp(thumbSumDeg / 56, 0, 1);
  return [thumbCurl, fingerCurls[0], fingerCurls[1], fingerCurls[2], fingerCurls[3]];
}
