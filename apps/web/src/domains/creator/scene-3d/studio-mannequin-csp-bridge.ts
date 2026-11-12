/**
 * Studio 3D 데생 인형 v3 — Clip Studio Paint `.pep`(포즈) & `.3dp`(체형 비율) 양방향 호환 브리지.
 *
 * `@toonstudio/studio-format-gateway`의 `.pep`/`.3dp` XML 파서·직렬화기를 통해
 * 기존 클립스튜디오 3D 데생 인형 Ver.2(56본 체계) 자산과 ToonStudio 에코르셰 데생 인형(19 주 관절 +
 * 양손 30 손가락 마디 + 23종 해부학 체형 파라미터) 사이의 무손실에 가까운 이주 경로를 제공한다.
 */

import {
  parseCsp3dpBodyProportionXml,
  parseCspPepPoseXml,
  serializeCsp3dpBodyProportionXml,
  serializeCspPepPoseXml,
  type CspPepBoneNode,
  type QuatWxyzTuple,
} from "@toonstudio/studio-format-gateway";

import { studioMannequinEulerXyzFromMatrix } from "./studio-mannequin-ik";
import {
  clampStudioMannequinBodyParams,
  clampStudioMannequinFingerPose,
  clampStudioMannequinJointRotation,
  type StudioMannequinBodyParams,
  type StudioMannequinFingerName,
  type StudioMannequinFingerPose,
  type StudioMannequinFingerSegmentCurls,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import { normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const CSP_TO_MANNEQUIN_BONE_MAP: Readonly<Record<string, StudioMannequinJointId>> = Object.freeze({
  hips_bb_: "pelvis",
  spine_bb_: "spine",
  spine2_bb_: "chest",
  neck_bb_: "neck",
  head_bb_: "head",
  leftshoulder_bb_: "leftShoulder",
  leftarm_bb_: "leftUpperArm",
  leftforearm_bb_: "leftLowerArm",
  lefthand_bb_: "leftHand",
  rightshoulder_bb_: "rightShoulder",
  rightarm_bb_: "rightUpperArm",
  rightforearm_bb_: "rightLowerArm",
  righthand_bb_: "rightHand",
  leftupleg_bb_: "leftUpperLeg",
  leftleg_bb_: "leftLowerLeg",
  leftfoot_bb_: "leftFoot",
  rightupleg_bb_: "rightUpperLeg",
  rightleg_bb_: "rightLowerLeg",
  rightfoot_bb_: "rightFoot",
});

function quatWxyzToEulerXyz(q: QuatWxyzTuple): StudioMannequinVec3 {
  const [w, x, y, z] = q;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  const m = [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
  ];
  return studioMannequinEulerXyzFromMatrix(m);
}

function eulerXyzToQuatWxyz(euler: StudioMannequinVec3): QuatWxyzTuple {
  const cx = Math.cos(euler[0] * 0.5);
  const sx = Math.sin(euler[0] * 0.5);
  const cy = Math.cos(euler[1] * 0.5);
  const sy = Math.sin(euler[1] * 0.5);
  const cz = Math.cos(euler[2] * 0.5);
  const sz = Math.sin(euler[2] * 0.5);
  const w = cx * cy * cz - sx * sy * sz;
  const x = sx * cy * cz + cx * sy * sz;
  const y = cx * sy * cz - sx * cy * sz;
  const z = cx * cy * sz + sx * sy * cz;
  const len = Math.hypot(w, x, y, z) || 1;
  return [w / len, x / len, y / len, z / len];
}

export interface CspPepImportResult {
  readonly aliasName: string;
  readonly pose: StudioMannequinPose;
  readonly fingerPose: StudioMannequinFingerPose;
  readonly mappedBoneCount: number;
}

/**
 * 클립스튜디오 `.pep` XML 문서에서 19개 주 관절 회전과 양손 30개 손가락 마디 컬을 추출한다.
 */
export function importCspPepPoseToMannequin(xml: string): CspPepImportResult {
  const doc = parseCspPepPoseXml(xml);
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
  let mappedBoneCount = 0;

  for (const [cspName, jointId] of Object.entries(CSP_TO_MANNEQUIN_BONE_MAP)) {
    const node = doc.flatBoneMap[cspName];
    if (!node) continue;
    joints[jointId] = clampStudioMannequinJointRotation(
      jointId,
      quatWxyzToEulerXyz(node.rotquat),
    );
    mappedBoneCount += 1;
  }

  const spine1 = doc.flatBoneMap.spine1_bb_;
  if (spine1) {
    const s1Euler = quatWxyzToEulerXyz(spine1.rotquat);
    const chestBase = joints.chest ?? [0, 0, 0];
    joints.chest = clampStudioMannequinJointRotation("chest", [
      chestBase[0] + s1Euler[0],
      chestBase[1] + s1Euler[1],
      chestBase[2] + s1Euler[2],
    ]);
  }

  const parseHandFingers = (prefix: "lefthand" | "righthand") => {
    const fingerMap: Array<[string, StudioMannequinFingerName, number]> = [
      ["thumb", "thumb", 45],
      ["index", "index", 65],
      ["middle", "middle", 65],
      ["ring", "ring", 65],
      ["pinky", "little", 68],
    ];
    const handOut: Partial<Record<StudioMannequinFingerName, StudioMannequinFingerSegmentCurls>> = {};
    for (const [cspStem, targetFinger, maxDeg] of fingerMap) {
      const segs: [number, number, number] = [0, 0, 0];
      let found = false;
      for (let i = 1; i <= 3; i += 1) {
        const node = doc.flatBoneMap[`${prefix}${cspStem}${i}_bb_`];
        if (!node) continue;
        found = true;
        mappedBoneCount += 1;
        const angleMag = 2 * Math.acos(clamp(Math.abs(node.rotquat[0]), 0, 1));
        segs[i - 1] = clamp(Math.round((angleMag / rad(maxDeg)) * 100), 0, 100);
      }
      if (found) handOut[targetFinger] = segs;
    }
    return handOut;
  };

  const hipsTrans = doc.flatBoneMap.hips_bb_?.trans ?? [0, 0, 0];
  const scaleFactor =
    Math.max(Math.abs(hipsTrans[0]), Math.abs(hipsTrans[1]), Math.abs(hipsTrans[2])) > 4
      ? 0.01
      : 1;
  const pelvisOffset: StudioMannequinVec3 = [
    clamp(hipsTrans[0] * scaleFactor, -1.5, 1.5),
    clamp(hipsTrans[1] * scaleFactor, -1.5, 1.5),
    clamp(hipsTrans[2] * scaleFactor, -1.5, 1.5),
  ];

  return {
    aliasName: doc.aliasName,
    pose: normalizeStudioMannequinPose({ joints, pelvisOffset }),
    fingerPose: clampStudioMannequinFingerPose({
      left: parseHandFingers("lefthand"),
      right: parseHandFingers("righthand"),
    }),
    mappedBoneCount,
  };
}

/**
 * ToonStudio 마네킹 포즈(및 선택적 손가락 컬)를 클립스튜디오 호환 `.pep` XML로 직렬화한다.
 */
export function exportMannequinPoseToCspPep(
  pose: StudioMannequinPose,
  aliasName = "ToonStudio_Ecorche_Pose",
  fingerPose?: StudioMannequinFingerPose,
): string {
  let nextId = 1;
  const resolvedFingers = clampStudioMannequinFingerPose(fingerPose);
  const rotOf = (id: StudioMannequinJointId): QuatWxyzTuple =>
    eulerXyzToQuatWxyz(pose.joints[id] ?? [0, 0, 0]);

  const makeNode = (
    name: string,
    rotquat: QuatWxyzTuple,
    children: readonly CspPepBoneNode[] = [],
    trans: StudioMannequinVec3 = [0, 0, 0],
  ): CspPepBoneNode => ({
    id: nextId++,
    name,
    rotquat,
    trans,
    scale: [1, 1, 1],
    children,
  });

  const buildFingerChain = (
    prefix: "lefthand" | "righthand",
    cspStem: string,
    curls: StudioMannequinFingerSegmentCurls,
    maxDeg: number,
  ): CspPepBoneNode => {
    const q1 = eulerXyzToQuatWxyz([0, 0, -rad((curls[0] / 100) * maxDeg)]);
    const q2 = eulerXyzToQuatWxyz([0, 0, -rad((curls[1] / 100) * maxDeg)]);
    const q3 = eulerXyzToQuatWxyz([0, 0, -rad((curls[2] / 100) * maxDeg)]);
    return makeNode(`${prefix}${cspStem}1_bb_`, q1, [
      makeNode(`${prefix}${cspStem}2_bb_`, q2, [
        makeNode(`${prefix}${cspStem}3_bb_`, q3, [
          makeNode(`${prefix}${cspStem}4_bb_`, [1, 0, 0, 0]),
        ]),
      ]),
    ]);
  };

  const buildHandChildren = (side: "left" | "right"): readonly CspPepBoneNode[] => {
    const prefix = side === "left" ? "lefthand" : "righthand";
    const f = resolvedFingers[side];
    return [
      buildFingerChain(prefix, "thumb", f.thumb, 45),
      buildFingerChain(prefix, "index", f.index, 65),
      buildFingerChain(prefix, "middle", f.middle, 65),
      buildFingerChain(prefix, "ring", f.ring, 65),
      buildFingerChain(prefix, "pinky", f.little, 68),
    ];
  };

  const root = makeNode(
    "hips_bb_",
    rotOf("pelvis"),
    [
      makeNode("spine_bb_", rotOf("spine"), [
        makeNode("spine1_bb_", [1, 0, 0, 0], [
          makeNode("spine2_bb_", rotOf("chest"), [
            makeNode("neck_bb_", rotOf("neck"), [
              makeNode("head_bb_", rotOf("head")),
            ]),
            makeNode("leftshoulder_bb_", rotOf("leftShoulder"), [
              makeNode("leftarm_bb_", rotOf("leftUpperArm"), [
                makeNode("leftforearm_bb_", rotOf("leftLowerArm"), [
                  makeNode("lefthand_bb_", rotOf("leftHand"), buildHandChildren("left")),
                ]),
              ]),
            ]),
            makeNode("rightshoulder_bb_", rotOf("rightShoulder"), [
              makeNode("rightarm_bb_", rotOf("rightUpperArm"), [
                makeNode("rightforearm_bb_", rotOf("rightLowerArm"), [
                  makeNode("righthand_bb_", rotOf("rightHand"), buildHandChildren("right")),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]),
      makeNode("leftupleg_bb_", rotOf("leftUpperLeg"), [
        makeNode("leftleg_bb_", rotOf("leftLowerLeg"), [
          makeNode("leftfoot_bb_", rotOf("leftFoot"), [
            makeNode("lefttoebase_bb_", [1, 0, 0, 0]),
          ]),
        ]),
      ]),
      makeNode("rightupleg_bb_", rotOf("rightUpperLeg"), [
        makeNode("rightleg_bb_", rotOf("rightLowerLeg"), [
          makeNode("rightfoot_bb_", rotOf("rightFoot"), [
            makeNode("righttoebase_bb_", [1, 0, 0, 0]),
          ]),
        ]),
      ]),
    ],
    pose.pelvisOffset,
  );

  return serializeCspPepPoseXml({
    aliasName,
    searchTags: "toonstudio,ecorche,v3",
    rootNodes: [root],
  });
}

/**
 * 클립스튜디오 `.3dp` 체형 비율 XML을 ToonStudio 23종 해부학 체형 파라미터로 변환한다.
 */
export function importCsp3dpToMannequinParams(
  xml: string,
  base: StudioMannequinBodyParams,
): StudioMannequinBodyParams {
  const doc = parseCsp3dpBodyProportionXml(xml);
  const headScaleAvg = (doc.boneHead[0] + doc.boneHead[1] + doc.boneHead[2]) / 3;
  const headCount = clamp(7.2 / Math.max(0.55, headScaleAvg) - doc.shapeChild * 2.1, 3, 9);
  const heightCm = clamp(
    Math.round(172 - doc.shapeChild * 42 + (doc.boneLeg[1] - 1) * 65),
    120,
    200,
  );
  const build = clamp(
    1 + doc.shapeMuscle * 1.15 + doc.shapeFat * 1.65 - doc.shapeThin * 0.85,
    0,
    3,
  );

  return clampStudioMannequinBodyParams({
    ...base,
    heightCm,
    headCount: Math.round(headCount * 10) / 10,
    build,
    shoulderWidth: doc.boneBody[0],
    pelvisWidth: doc.boneBody[0] * (1 + doc.shapeFat * 0.08),
    armLength: doc.boneArm[1],
    legLength: doc.boneLeg[1],
    torsoDepth: doc.boneBody[2],
    limbThickness: (doc.boneArm[0] + doc.boneLeg[0]) * 0.5,
    handScale: doc.boneHand[0],
    footScale: doc.boneFoot[2],
    neckThickness: doc.boneNeck[0],
  });
}

/**
 * ToonStudio 해부학 체형 파라미터를 클립스튜디오 호환 `.3dp` XML로 직렬화한다.
 */
export function exportMannequinParamsToCsp3dp(
  params: StudioMannequinBodyParams,
): string {
  const p = clampStudioMannequinBodyParams(params);
  const shapeThin = p.build < 1 ? clamp(1 - p.build, 0, 1) : 0;
  const shapeMuscle =
    p.build > 1 && p.build <= 2.3 ? clamp((p.build - 1) / 1.2, 0, 1) : p.build > 2.3 ? 0.6 : 0;
  const shapeFat = p.build > 2 ? clamp(p.build - 2, 0, 1) : 0;
  const shapeChild = p.headCount < 6 ? clamp((6 - p.headCount) / 3, 0, 1) : 0;
  const headScale = clamp(7.2 / p.headCount, 0.72, 1.45);
  const limbT = p.limbThickness ?? 1;

  return serializeCsp3dpBodyProportionXml({
    version: "1.0.0",
    dessindollKindIndex: 0,
    shapeMuscle,
    shapeThin,
    shapeFat,
    shapeChild,
    boneHead: [headScale * (p.faceWidth ?? 1), headScale, headScale],
    boneNeck: [p.neckThickness ?? 1, 1, p.neckThickness ?? 1],
    boneBody: [p.shoulderWidth, 1, p.torsoDepth ?? 1],
    boneArm: [limbT * (p.upperArmThickness ?? 1), p.armLength, limbT * (p.forearmThickness ?? 1)],
    boneHand: [p.handScale ?? 1, p.handScale ?? 1, p.handScale ?? 1],
    boneLeg: [limbT * (p.thighThickness ?? 1), p.legLength, limbT * (p.calfThickness ?? 1)],
    boneFoot: [p.footScale ?? 1, 1, p.footScale ?? 1],
  });
}
