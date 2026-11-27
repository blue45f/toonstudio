/**
 * 모듈식 키트 스켈레톤·관절 오프셋 계약(68 joint) — `character-kit.ts`에서 2026-10-23 CORE-1이 옮겼다(파일 크기 래칫 상쇄 추출, 규칙·문구 변경 없음).
 * v1·v2 키트 매니페스트가 같은 스켈레톤을 쓴다. `character-kit.ts`가 이 파일의 상수를 그대로 다시 내보내므로 기존 import 경로는 바뀌지 않는다.
 */
import { z } from "zod";

import { stableStringify } from "../shared/stable-json";

import { HUMANOID_BONE_NAMES, isHumanoidBoneName } from "./bones";
import { isMorphTargetName } from "./morph-names";

import type { HumanoidBoneName } from "./bones";

export const KIT_ROOT_JOINT = "Armature" as const;

// ---------------------------------------------------------------- 스켈레톤(68 joint)

const MIXAMO_PREFIX = "mixamorig:";
const KIT_SIDES = ["Left", "Right"] as const;
const KIT_FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const;
/** Mixamo 손가락 이름 → VRM 어휘 접미(마디 1~3). 마디 4는 끝 본이라 매핑하지 않는다. */
const FINGER_VRM_NAMES: Readonly<Record<(typeof KIT_FINGERS)[number], readonly [string, string, string]>> = {
  Thumb: ["ThumbMetacarpal", "ThumbProximal", "ThumbDistal"],
  Index: ["IndexProximal", "IndexIntermediate", "IndexDistal"],
  Middle: ["MiddleProximal", "MiddleIntermediate", "MiddleDistal"],
  Ring: ["RingProximal", "RingIntermediate", "RingDistal"],
  Pinky: ["LittleProximal", "LittleIntermediate", "LittleDistal"],
};

function buildSkeleton(): {
  readonly joints: string[];
  readonly parents: Record<string, string | null>;
  readonly boneMap: Record<string, HumanoidBoneName>;
  readonly endBones: string[];
} {
  const joints: string[] = [];
  const parents: Record<string, string | null> = {};
  const boneMap: Record<string, HumanoidBoneName> = {};
  const endBones: string[] = [];

  const add = (node: string, parent: string | null, vrm: string | null): void => {
    joints.push(node);
    parents[node] = parent;
    if (vrm === null) {
      endBones.push(node);
      return;
    }
    if (!isHumanoidBoneName(vrm)) throw new Error(`키트 본 매핑이 VRM 어휘 밖입니다: ${node} → ${vrm}`);
    boneMap[node] = vrm;
  };
  const m = (name: string): string => `${MIXAMO_PREFIX}${name}`;

  add(m("Hips"), null, "hips");
  add(m("Spine"), m("Hips"), "spine");
  add(m("Spine1"), m("Spine"), "chest");
  add(m("Spine2"), m("Spine1"), "upperChest");
  add(m("Neck"), m("Spine2"), "neck");
  add(m("Head"), m("Neck"), "head");
  add(m("HeadTop_End"), m("Head"), null);
  for (const side of KIT_SIDES) {
    const lower = side.toLowerCase();
    add(m(`${side}Shoulder`), m("Spine2"), `${lower}Shoulder`);
    add(m(`${side}Arm`), m(`${side}Shoulder`), `${lower}UpperArm`);
    add(m(`${side}ForeArm`), m(`${side}Arm`), `${lower}LowerArm`);
    add(m(`${side}Hand`), m(`${side}ForeArm`), `${lower}Hand`);
    for (const finger of KIT_FINGERS) {
      const vrm = FINGER_VRM_NAMES[finger];
      for (let segment = 1; segment <= 4; segment += 1) {
        const parent = segment === 1 ? m(`${side}Hand`) : m(`${side}Hand${finger}${segment - 1}`);
        const vrmName = segment <= 3 ? `${lower}${vrm[segment - 1] ?? ""}` : null;
        add(m(`${side}Hand${finger}${segment}`), parent, vrmName);
      }
    }
    add(m(`${side}UpLeg`), m("Hips"), `${lower}UpperLeg`);
    add(m(`${side}Leg`), m(`${side}UpLeg`), `${lower}LowerLeg`);
    add(m(`${side}Foot`), m(`${side}Leg`), `${lower}Foot`);
    add(m(`${side}ToeBase`), m(`${side}Foot`), `${lower}Toes`);
    add(m(`${side}Toe_End`), m(`${side}ToeBase`), null);
  }
  add("TS_Jaw", m("Head"), "jaw");
  add("TS_Eye.L", m("Head"), "leftEye");
  add("TS_Eye.R", m("Head"), "rightEye");
  return { joints, parents, boneMap, endBones };
}

const SKELETON = buildSkeleton();

/** 키트 joint 68개(Mixamo 65 + `TS_Jaw` + `TS_Eye.L/R`). 순서는 정본 예시이며 manifest는 같은 이름 집합이면 순서를 정할 수 있다(모든 GLB `skin.joints`와 동일해야 함). */
export const KIT_SKELETON_JOINTS: readonly string[] = Object.freeze(SKELETON.joints);
/** joint → 부모 joint(루트 `mixamorig:Hips`만 null) */
export const KIT_SKELETON_PARENTS: Readonly<Record<string, string | null>> = Object.freeze(SKELETON.parents);
/** 기대 본 매핑(55). 계약 어휘 `HUMANOID_BONE_NAMES` 전부를 1회씩 덮는다. */
export const KIT_BONE_MAP: Readonly<Record<string, HumanoidBoneName>> = Object.freeze(SKELETON.boneMap);
/** 의도된 미매핑 끝 본 13개: HeadTop_End, Toe_End×2, 손가락 끝 마디×10 */
export const KIT_END_BONES: readonly string[] = Object.freeze(SKELETON.endBones);
export const KIT_JOINT_COUNT = 68 as const;

// ---------------------------------------------------------------- 스키마·검증(v1·v2 공용)

/** 키트 매니페스트 검증 이슈(경로 + 한글 메시지) */
export interface KitIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}

/** 목록을 앞 몇 개만 보이고 나머지는 개수로 줄인다(검증 메시지용) */
export function listFew(items: readonly string[], limit = 4): string {
  return items.length <= limit ? items.join(", ") : `${items.slice(0, limit).join(", ")} 외 ${items.length - limit}개`;
}

export const kitSkeletonSchema = z
  .object({
    root: z.literal(KIT_ROOT_JOINT),
    joints: z.array(z.string()),
    parents: z.record(z.string(), z.string().nullable()),
    boneMap: z.record(z.string(), z.enum(HUMANOID_BONE_NAMES)),
    endBones: z.array(z.string()),
  })
  .strict();
export type KitSkeleton = z.infer<typeof kitSkeletonSchema>;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const jointOffsetSchema = z.record(z.string(), vec3Schema);
export const kitJointOffsetsSchema = z.record(z.string(), jointOffsetSchema);
export type KitJointOffsets = z.infer<typeof kitJointOffsetsSchema>;

/** 스켈레톤이 계약(joint 68·부모·본 매핑 55·끝 본 13)과 같은지 */
export function kitSkeletonIssues(skeleton: KitSkeleton): KitIssue[] {
  const issues: KitIssue[] = [];
  const { joints, parents, boneMap, endBones } = skeleton;
  const path = ["skeleton"];
  const expected = new Set(KIT_SKELETON_JOINTS);
  const given = new Set(joints);
  if (joints.length !== KIT_JOINT_COUNT || given.size !== joints.length) {
    issues.push({ path: [...path, "joints"], message: `joint는 중복 없이 정확히 ${KIT_JOINT_COUNT}개여야 합니다(현재 ${joints.length}개, 고유 ${given.size}개).` });
  }
  const missing = KIT_SKELETON_JOINTS.filter((name) => !given.has(name));
  const extra = joints.filter((name) => !expected.has(name));
  if (missing.length > 0 || extra.length > 0) {
    issues.push({ path: [...path, "joints"], message: `joint 이름 집합이 계약과 다릅니다. 없음: [${listFew(missing, 5)}], 여분: [${listFew(extra, 5)}]` });
  }
  if (stableStringify(parents) !== stableStringify(KIT_SKELETON_PARENTS)) {
    issues.push({ path: [...path, "parents"], message: "부모 관계가 계약(KIT_SKELETON_PARENTS)과 다릅니다." });
  }
  // 상수 KIT_BONE_MAP·KIT_SKELETON_PARENTS가 VRM 계약 부모 관계와 맞는지는 character-kit.test.ts가 고정한다.
  if (stableStringify(boneMap) !== stableStringify(KIT_BONE_MAP)) {
    issues.push({ path: [...path, "boneMap"], message: "boneMap이 계약(KIT_BONE_MAP, 55본)과 다릅니다. TS_Jaw → jaw, TS_Eye.L/R → leftEye/rightEye 포함 명시 매핑이 필요합니다." });
  }
  if (stableStringify([...endBones].sort()) !== stableStringify([...KIT_END_BONES].sort())) {
    issues.push({ path: [...path, "endBones"], message: "endBones가 계약의 끝 본 13개와 다릅니다." });
  }
  return issues;
}

/** 관절 오프셋: 키는 morph 어휘, 본은 joint, 크기 상한(`KIT_BUDGET.maxJointOffsetM`를 받는다 — 예산 상수는 character-kit.ts에 있다) */
export function kitJointOffsetIssues(jointOffsets: KitJointOffsets, maxJointOffsetM: number): KitIssue[] {
  const issues: KitIssue[] = [];
  for (const [morph, table] of Object.entries(jointOffsets)) {
    if (!isMorphTargetName(morph)) issues.push({ path: ["jointOffsets", morph], message: `관절 오프셋 키 ${morph}가 morph 어휘에 없습니다.` });
    for (const [joint, offset] of Object.entries(table)) {
      if (!KIT_SKELETON_JOINTS.includes(joint)) issues.push({ path: ["jointOffsets", morph, joint], message: `관절 오프셋의 본 ${joint}가 skeleton.joints에 없습니다.` });
      if (Math.hypot(offset[0], offset[1], offset[2]) > maxJointOffsetM) {
        issues.push({ path: ["jointOffsets", morph, joint], message: `관절 오프셋 크기가 ${maxJointOffsetM} m를 넘습니다.` });
      }
    }
  }
  return issues;
}
