/**
 * 캐릭터 키트 계약 상수를 JSON으로 덤프한다 (Blender 빌더가 상수를 복제하지 않게 하는 단일 기준).
 *
 * 실행: pnpm exec tsx scripts/blender/dump-kit-contract.mts --out <contract.json>
 *
 * 출력은 `apps/character-lab/src/contracts/*`의 값 그대로이며, 빌더(`tools/blender/character_kit`)가 읽는다.
 * 계약이 바뀌면 이 파일을 다시 실행하면 빌더도 같은 값을 쓴다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { FACS_UNITS } from "../../apps/character-lab/src/contracts/expression.ts";
import {
  BODY_PARAM_KEYS,
  DEFAULT_RECIPE_COLORS,
  FACE_PARAM_KEYS,
  KIT_ALLOWED_EXTENSIONS,
  KIT_BASE_MESH_SPECS,
  KIT_BONE_MAP,
  KIT_BUDGET,
  KIT_CURRENT_VERSION,
  KIT_DEFAULT_BASE_ID,
  KIT_DEFAULT_ID,
  KIT_DEFAULT_SLOTS,
  KIT_END_BONES,
  KIT_HIDEABLE_REGION_IDS,
  KIT_MORPH_COVERAGE,
  KIT_MORPH_NAMES,
  KIT_PART_SLOT_REQUIRED_ROLES,
  KIT_PART_SLOT_ROLES,
  KIT_PART_SLOTS,
  KIT_REGION_IDS,
  KIT_REQUIRED_JOINT_OFFSET_MORPHS,
  KIT_REQUIRED_PRESETS,
  KIT_ROLE_TINT_RULES,
  KIT_SCHEMA_ID,
  KIT_SKELETON_JOINTS,
  KIT_SKELETON_PARENTS,
  SLOT_PRESET_IDS,
} from "../../apps/character-lab/src/contracts/index.ts";

function parseOut(argv: readonly string[]): string {
  const index = argv.indexOf("--out");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (value === undefined || value.length === 0) {
    console.error("사용법: pnpm exec tsx scripts/blender/dump-kit-contract.mts --out <contract.json>");
    process.exit(2);
  }
  return value;
}

const contract = {
  schema: KIT_SCHEMA_ID,
  kitId: KIT_DEFAULT_ID,
  kitVersion: KIT_CURRENT_VERSION,
  defaultBase: KIT_DEFAULT_BASE_ID,
  skeleton: {
    joints: [...KIT_SKELETON_JOINTS],
    parents: { ...KIT_SKELETON_PARENTS },
    boneMap: { ...KIT_BONE_MAP },
    endBones: [...KIT_END_BONES],
  },
  regions: { all: [...KIT_REGION_IDS], hideable: [...KIT_HIDEABLE_REGION_IDS] },
  morph: {
    names: [...KIT_MORPH_NAMES],
    bodyKeys: [...BODY_PARAM_KEYS],
    faceKeys: [...FACE_PARAM_KEYS],
    facsUnits: [...FACS_UNITS],
    coverageByRole: Object.fromEntries(Object.entries(KIT_MORPH_COVERAGE).map(([role, names]) => [role, [...names]])),
    requiredJointOffsetMorphs: [...KIT_REQUIRED_JOINT_OFFSET_MORPHS],
  },
  budget: JSON.parse(JSON.stringify(KIT_BUDGET)) as unknown,
  allowedExtensions: [...KIT_ALLOWED_EXTENSIONS],
  baseMeshSpecs: KIT_BASE_MESH_SPECS.map((spec) => ({ ...spec })),
  roleTintRules: JSON.parse(JSON.stringify(KIT_ROLE_TINT_RULES)) as unknown,
  partSlots: [...KIT_PART_SLOTS],
  partSlotRoles: Object.fromEntries(Object.entries(KIT_PART_SLOT_ROLES).map(([slot, roles]) => [slot, [...roles]])),
  partSlotRequiredRoles: Object.fromEntries(Object.entries(KIT_PART_SLOT_REQUIRED_ROLES).map(([slot, roles]) => [slot, [...roles]])),
  presetVocabulary: Object.fromEntries(Object.entries(SLOT_PRESET_IDS).map(([slot, names]) => [slot, [...(names as readonly string[])]])),
  requiredPresets: [...KIT_REQUIRED_PRESETS],
  defaultSlots: { ...KIT_DEFAULT_SLOTS },
  defaultColors: { ...DEFAULT_RECIPE_COLORS },
};

const out = path.resolve(parseOut(process.argv.slice(2)));
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
console.log(`키트 계약을 ${out}에 썼습니다 (joint ${contract.skeleton.joints.length}, morph ${contract.morph.names.length}, 파츠 슬롯 ${contract.partSlots.length}).`);
