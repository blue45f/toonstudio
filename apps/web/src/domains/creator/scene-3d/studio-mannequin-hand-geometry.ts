import type { StudioMannequinLoftTubeSpec } from "./studio-mannequin-ecorche-anatomy";
import type {
  StudioMannequinFingerName,
  StudioMannequinHandFingerPose,
  StudioMannequinJointId,
  StudioMannequinPrimitiveSpec,
  StudioMannequinVec3,
} from "./studio-mannequin-model";

const RAD = Math.PI / 180;
const ZERO: StudioMannequinVec3 = [0, 0, 0];

/** 다섯 손가락의 중수지·근위지·원위지 관절별 최대 굽힘(도). */
export const STUDIO_MANNEQUIN_FINGER_SEGMENT_MAX_DEG: Readonly<Record<StudioMannequinFingerName, StudioMannequinVec3>> = {
  thumb: [28, 32, 46], index: [70, 93, 60], middle: [73, 96, 63],
  ring: [75, 97, 64], little: [78, 94, 62],
};

interface Digit {
  readonly name: StudioMannequinFingerName;
  readonly root: StudioMannequinVec3;
  readonly direction: StudioMannequinVec3;
  readonly segments: StudioMannequinVec3;
  readonly radius: number;
}

// 손목에서 중지 끝까지 1.17 단위. 검지부터 새끼까지 손허리뼈의 아치를 따라 뿌리가 내려간다.
const DIGITS: readonly Digit[] = [
  { name: "little", root: [-0.162, -0.53, 0.033], direction: [-0.043, -1, 0.041], segments: [0.19, 0.139, 0.117], radius: 0.045 },
  { name: "ring", root: [-0.056, -0.583, 0.014], direction: [-0.025, -1, 0.025], segments: [0.234, 0.168, 0.137], radius: 0.049 },
  { name: "middle", root: [0.054, -0.602, 0.007], direction: [0.014, -1, 0.018], segments: [0.254, 0.179, 0.135], radius: 0.051 },
  { name: "index", root: [0.16, -0.573, 0.019], direction: [0.047, -1, 0.037], segments: [0.228, 0.164, 0.134], radius: 0.048 },
  { name: "thumb", root: [0.147, -0.292, 0.048], direction: [0.51, -0.84, 0.18], segments: [0.192, 0.144, 0.119], radius: 0.065 },
];

/** 벌림 유무에 관계없이 동일한 관절점과 길이를 사용한다. 엄지는 기저관절에서 손바닥을 가로질러 대립한다. */
export function buildSplayedHandDigitPrimitives(
  jointId: "leftHand" | "rightHand",
  handLen: number,
  sideSign: 1 | -1,
  handPose: StudioMannequinHandFingerPose,
  splayDeg: Partial<Record<StudioMannequinFingerName, number>> = {},
): readonly StudioMannequinPrimitiveSpec[] {
  const result: StudioMannequinPrimitiveSpec[] = [];
  for (const digit of DIGITS) {
    const { name, root, direction, segments, radius } = digit;
    const curls = handPose[name] ?? ZERO;
    const spread = (splayDeg[name] ?? 0) * RAD;
    const opposition = name === "thumb" ? -96 * RAD * curls[0] / 100 : 0;
    const taper = [1, 0.86, 0.76, 0.65] as const;
    let point: StudioMannequinVec3 = [sideSign * root[0] * handLen, root[1] * handLen, root[2] * handLen];
    let flex = 0;
    for (let segment = 0; segment < 3; segment++) {
      flex -= curls[segment] / 100 * STUDIO_MANNEQUIN_FINGER_SEGMENT_MAX_DEG[name][segment] * RAD;
      const bentY = direction[1] * Math.cos(flex) - direction[2] * Math.sin(flex);
      const bentZ = direction[1] * Math.sin(flex) + direction[2] * Math.cos(flex);
      const opposedX = direction[0] * Math.cos(opposition) + bentZ * Math.sin(opposition);
      const opposedZ = -direction[0] * Math.sin(opposition) + bentZ * Math.cos(opposition);
      const length = segments[segment] * handLen;
      const end: StudioMannequinVec3 = [
        point[0] + sideSign * length * (opposedX * Math.cos(spread) - bentY * Math.sin(spread)),
        point[1] + length * (opposedX * Math.sin(spread) + bentY * Math.cos(spread)),
        point[2] + length * opposedZ,
      ];
      const endRadius = radius * taper[segment + 1] * handLen;
      result.push({ kind: "capsule", jointId, from: point, to: end, radius: radius * taper[segment] * handLen,
        endRadius, handPart: segment === 2 ? "fingertip" : "digit", materialRole: "body" });
      if (segment < 2) result.push({
        kind: "sphere", handPart: "digit", jointId, center: end, radius: endRadius * 1.04,
        scale: [1, 0.94, 0.96], materialRole: "joint",
      });
      point = end;
    }
  }
  return result;
}

/** 손목, 손꿈치와 손허리, 손가락 뿌리를 잇는 편평한 단면. */
export function buildStudioMannequinPalmLoft(jointId: StudioMannequinJointId, handLen: number): StudioMannequinLoftTubeSpec {
  const rings = [
    [-0.012, 0.079, 0.065], [-0.092, 0.126, 0.083], [-0.255, 0.204, 0.106],
    [-0.396, 0.226, 0.098], [-0.502, 0.225, 0.084], [-0.565, 0.204, 0.064],
    [-0.603, 0.148, 0.048], [-0.626, 0.071, 0.029],
  ] as const;
  return {
    id: "palm", jointId, materialRole: "body", radialSegments: 24, flatShaded: false, superellipsePower: 2.6,
    sections: rings.map(([y, width, depth]) => ({
      center: [0, y * handLen, 0], radiusX: width * handLen, radiusZ: depth * handLen, twistRad: 0,
    })),
  };
}
