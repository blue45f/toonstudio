/**
 * SHAPER 0.5.563 `BuiltInData/Presets/{head,eyes,nose,mouth,ears,hair,body,pose,defaultStyle}/*.preset`
 * 역공학 추출 데이터에 기반한 풀세트 아키타입·포즈·부위별 프리셋 라이브러리.
 */
import { qNormalize, type Quat, type Vec3 } from "../../../shared/math";

import type {
  BodyParamKey,
  FaceParamKey,
  LabCommand,
  ParamValues,
  Pose,
  PresetId,
  RecipeColorKey,
  SlotKind,
} from "../../../contracts";

function eulerDegToQuat(deg: Vec3): Quat {
  const rx = (deg[0] * Math.PI) / 360;
  const ry = (deg[1] * Math.PI) / 360;
  const rz = (deg[2] * Math.PI) / 360;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return qNormalize([
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]);
}

/**
 * SHAPER `BuiltInData/Presets/pose/{포즈1,포즈2,포즈3}.preset`에서 추출한 정본 포즈 프리셋
 */
export const SHAPER_BUILTIN_POSE_PRESETS: Readonly<
  Record<
    "shaper-pose-1" | "shaper-pose-2" | "shaper-pose-3",
    { readonly id: string; readonly labelKo: string; readonly pose: Pose }
  >
> = {
  "shaper-pose-1": {
    id: "shaper-pose-1",
    labelKo: "SHAPER 포즈 1 (자연스러운 웹툰 스탠딩)",
    pose: {
      hips: eulerDegToQuat([0, -6, 2]),
      spine: eulerDegToQuat([2, 4, -2]),
      chest: eulerDegToQuat([-3, 3, 0]),
      neck: eulerDegToQuat([4, -3, 2]),
      head: eulerDegToQuat([-3, -5, -2]),
      leftUpperArm: eulerDegToQuat([8, 0, -34]),
      leftLowerArm: eulerDegToQuat([18, 12, 0]),
      rightUpperArm: eulerDegToQuat([-6, -8, 32]),
      rightLowerArm: eulerDegToQuat([24, -10, 0]),
      leftUpperLeg: eulerDegToQuat([-4, 6, -3]),
      leftLowerLeg: eulerDegToQuat([8, 0, 0]),
      rightUpperLeg: eulerDegToQuat([6, -8, 4]),
      rightLowerLeg: eulerDegToQuat([12, 0, 0]),
    },
  },
  "shaper-pose-2": {
    id: "shaper-pose-2",
    labelKo: "SHAPER 포즈 2 (자신감 있는 컨트라포스토)",
    pose: {
      hips: eulerDegToQuat([0, 10, -4]),
      spine: eulerDegToQuat([-2, -6, 3]),
      chest: eulerDegToQuat([-4, -4, 2]),
      neck: eulerDegToQuat([3, 6, -2]),
      head: eulerDegToQuat([-2, 8, -3]),
      leftUpperArm: eulerDegToQuat([-12, 14, -28]),
      leftLowerArm: eulerDegToQuat([32, 16, 0]),
      rightUpperArm: eulerDegToQuat([10, -6, 35]),
      rightLowerArm: eulerDegToQuat([15, -8, 0]),
      leftUpperLeg: eulerDegToQuat([8, -4, 5]),
      leftLowerLeg: eulerDegToQuat([14, 0, 0]),
      rightUpperLeg: eulerDegToQuat([-5, 8, -3]),
      rightLowerLeg: eulerDegToQuat([6, 0, 0]),
    },
  },
  "shaper-pose-3": {
    id: "shaper-pose-3",
    labelKo: "SHAPER 포즈 3 (로맨스/드라마틱 시선)",
    pose: {
      hips: eulerDegToQuat([2, -8, 3]),
      spine: eulerDegToQuat([-3, 5, -2]),
      chest: eulerDegToQuat([-4, 6, -2]),
      neck: eulerDegToQuat([6, -8, 4]),
      head: eulerDegToQuat([-5, -10, 3]),
      leftUpperArm: eulerDegToQuat([14, 10, -30]),
      leftLowerArm: eulerDegToQuat([28, 18, 0]),
      rightUpperArm: eulerDegToQuat([16, -12, 28]),
      rightLowerArm: eulerDegToQuat([36, -20, 0]),
      leftUpperLeg: eulerDegToQuat([-3, 5, -2]),
      leftLowerLeg: eulerDegToQuat([6, 0, 0]),
      rightUpperLeg: eulerDegToQuat([5, -6, 3]),
      rightLowerLeg: eulerDegToQuat([10, 0, 0]),
    },
  },
};

/**
 * SHAPER `BuiltInData/Presets/{eyes,nose,mouth,ears}/*.preset`에서 추출한 부위별 성형 프리셋
 */
export const SHAPER_BUILTIN_PART_PRESETS: Readonly<
  Record<
    string,
    {
      readonly id: string;
      readonly labelKo: string;
      readonly faceParams: ParamValues<FaceParamKey>;
      readonly slots?: Partial<Record<SlotKind, PresetId>>;
    }
  >
> = {
  "shaper-part-eyes-female1": {
    id: "shaper-part-eyes-female1",
    labelKo: "여성눈 1 (크고 또렷한 웹툰 눈매)",
    faceParams: { eyeSize: 0.36, eyeSpacing: 0.06, eyeTilt: 0.14 },
    slots: { eyes: "eyes/round", irises: "irises/star-highlight" },
  },
  "shaper-part-eyes-survivor-m": {
    id: "shaper-part-eyes-survivor-m",
    labelKo: "생존남눈 (날카로운 매서운 눈매)",
    faceParams: { eyeSize: -0.14, eyeSpacing: 0.04, eyeTilt: 0.28 },
    slots: { eyes: "eyes/narrow", irises: "irises/round-small" },
  },
  "shaper-part-eyes-survivor-f": {
    id: "shaper-part-eyes-survivor-f",
    labelKo: "생존녀눈 (시크한 고양이상 눈매)",
    faceParams: { eyeSize: 0.18, eyeSpacing: 0.05, eyeTilt: 0.32 },
    slots: { eyes: "eyes/upturned", irises: "irises/cat" },
  },
  "shaper-part-nose-toon1": {
    id: "shaper-part-nose-toon1",
    labelKo: "만화코 1 (슬림하고 오똑한 웹툰 코)",
    faceParams: { noseHeight: 0.24, noseWidth: -0.28, noseDepth: 0.22 },
    slots: { nose: "nose/straight" },
  },
  "shaper-part-ears-elf": {
    id: "shaper-part-ears-elf",
    labelKo: "엘프귀 (판타지 뾰족귀)",
    faceParams: { earSize: 0.54, earAngle: 0.38 },
    slots: { ears: "ears/pointed" },
  },
};

export interface ShaperArchetypePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly bodyParams: ParamValues<BodyParamKey>;
  readonly faceParams: ParamValues<FaceParamKey>;
  readonly slots: Partial<Record<SlotKind, PresetId>>;
  readonly colors: Partial<Record<RecipeColorKey, string>>;
  readonly pose: Pose;
}

/**
 * SHAPER `BuiltInData`의 대표 캐릭터 조합(헤어+얼굴형+이목구비+체형+의상+포즈+웹툰 기본 피부색 `#ffecce`)을
 * 원클릭으로 한 번에 적용해 대머리 마네킹 상태 없이 즉시 완성된 SHAPER 스타일 캐릭터를 구성한다.
 */
export const SHAPER_BUILTIN_ARCHETYPE_PRESETS: Readonly<Record<string, ShaperArchetypePreset>> = {
  "shaper-archetype-survivor-male": {
    id: "shaper-archetype-survivor-male",
    labelKo: "SHAPER 생존남 풀세트 (생존남머리+눈+체형+의상)",
    bodyParams: { height: 0.34, headSize: -0.14, shoulderWidth: 0.44, chestDepth: 0.3, waist: 0.04, hip: -0.14, armLength: 0.18, legLength: 0.26, neckLength: 0.08 },
    faceParams: {
      faceShape: -0.24, jawWidth: -0.18, chinLength: 0.12, cheekVolume: -0.1, forehead: 0.08,
      eyeSize: -0.12, eyeSpacing: 0.04, eyeTilt: 0.26, noseHeight: 0.22, noseWidth: -0.14, noseDepth: 0.24,
      mouthWidth: 0.08, lipFullness: -0.08, earSize: 0.02, earAngle: 0.04,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/narrow", irises: "irises/round-small", nose: "nose/high-bridge",
      mouth: "mouth/thin", ears: "ears/standard", hair: "hair/wolf-layered", body: "body/athletic",
      top: "top/hoodie", bottom: "bottom/jeans", shoes: "shoes/boots",
    },
    colors: { skin: "#ffecce", hair: "#2f292b", brow: "#2f292b", iris: "#4a382b", top: "#2d343e", bottom: "#1e242b", shoes: "#17191c" },
    pose: SHAPER_BUILTIN_POSE_PRESETS["shaper-pose-1"].pose,
  },
  "shaper-archetype-survivor-female": {
    id: "shaper-archetype-survivor-female",
    labelKo: "SHAPER 생존녀 풀세트 (생존녀머리+눈+체형+의상)",
    bodyParams: { height: 0.04, headSize: 0.08, shoulderWidth: -0.16, chestDepth: 0.14, waist: -0.3, hip: 0.18, armLength: -0.04, legLength: 0.2, neckLength: 0.08 },
    faceParams: {
      faceShape: -0.32, jawWidth: -0.36, chinLength: 0.04, cheekVolume: -0.06, forehead: 0.06,
      eyeSize: 0.2, eyeSpacing: 0.04, eyeTilt: 0.3, noseHeight: 0.18, noseWidth: -0.24, noseDepth: 0.18,
      mouthWidth: -0.06, lipFullness: 0.14, earSize: -0.04, earAngle: 0.02,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/upturned", irises: "irises/cat", nose: "nose/straight",
      mouth: "mouth/small", ears: "ears/small", hair: "hair/action-pony", body: "body/slim",
      top: "top/shirt", bottom: "bottom/shorts", shoes: "shoes/boots",
    },
    colors: { skin: "#ffecce", hair: "#3d2e2e", brow: "#3d2e2e", iris: "#6b4438", top: "#f2f4f8", bottom: "#2b303a", shoes: "#1f2229" },
    pose: SHAPER_BUILTIN_POSE_PRESETS["shaper-pose-2"].pose,
  },
  "shaper-archetype-romance-heroine": {
    id: "shaper-archetype-romance-heroine",
    labelKo: "SHAPER 로판 여주인공 풀세트 (여성헤어1+여성눈1+포즈3)",
    bodyParams: { height: -0.04, headSize: 0.12, shoulderWidth: -0.2, chestDepth: 0.12, waist: -0.32, hip: 0.16, armLength: -0.06, legLength: 0.18, neckLength: 0.08 },
    faceParams: {
      faceShape: -0.28, jawWidth: -0.34, chinLength: -0.06, cheekVolume: 0.12, forehead: 0.1,
      eyeSize: 0.34, eyeSpacing: 0.06, eyeTilt: 0.12, noseHeight: 0.2, noseWidth: -0.28, noseDepth: 0.18,
      mouthWidth: -0.1, lipFullness: 0.18, earSize: -0.04, earAngle: 0,
    },
    slots: {
      "face-shape": "face-shape/heart", eyes: "eyes/round", irises: "irises/star-highlight", nose: "nose/small",
      mouth: "mouth/smile-corner", ears: "ears/small", hair: "hair/romance-long", body: "body/slim",
      top: "top/blazer", bottom: "bottom/long-skirt", shoes: "shoes/loafers", accessory: "accessory/ribbon",
    },
    colors: { skin: "#ffecce", hair: "#786868", brow: "#685858", iris: "#6b4c8b", top: "#f8eff4", bottom: "#3c2f4f", shoes: "#4a353b", accessory: "#d6456b" },
    pose: SHAPER_BUILTIN_POSE_PRESETS["shaper-pose-3"].pose,
  },
  "shaper-archetype-dandy-male": {
    id: "shaper-archetype-dandy-male",
    labelKo: "SHAPER 댄디 남주인공 풀세트 (남성헤어2+눈4+포즈1)",
    bodyParams: { height: 0.36, headSize: -0.14, shoulderWidth: 0.4, chestDepth: 0.24, waist: -0.04, hip: -0.14, armLength: 0.16, legLength: 0.28, neckLength: 0.1 },
    faceParams: {
      faceShape: -0.3, jawWidth: -0.28, chinLength: 0.1, cheekVolume: -0.08, forehead: 0.06,
      eyeSize: 0.04, eyeSpacing: 0.02, eyeTilt: 0.14, noseHeight: 0.26, noseWidth: -0.18, noseDepth: 0.24,
      mouthWidth: 0.04, lipFullness: 0.02, earSize: 0, earAngle: 0.02,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/almond", irises: "irises/soft-gradient", nose: "nose/straight",
      mouth: "mouth/small", ears: "ears/standard", hair: "hair/short-layered", body: "body/tall",
      top: "top/blazer", bottom: "bottom/slacks", shoes: "shoes/loafers",
    },
    colors: { skin: "#ffecce", hair: "#242730", brow: "#242730", iris: "#3b526b", top: "#222a3a", bottom: "#1b2230", shoes: "#18181c" },
    pose: SHAPER_BUILTIN_POSE_PRESETS["shaper-pose-1"].pose,
  },
  "shaper-archetype-elf-fantasy": {
    id: "shaper-archetype-elf-fantasy",
    labelKo: "SHAPER 엘프 판타지 풀세트 (엘프귀+히메컷+포즈2)",
    bodyParams: { height: 0.08, headSize: 0.06, shoulderWidth: -0.18, chestDepth: 0.1, waist: -0.32, hip: 0.14, armLength: 0.04, legLength: 0.22, neckLength: 0.1 },
    faceParams: {
      faceShape: -0.32, jawWidth: -0.36, chinLength: 0.02, cheekVolume: 0.04, forehead: 0.08,
      eyeSize: 0.28, eyeSpacing: 0.06, eyeTilt: 0.18, noseHeight: 0.22, noseWidth: -0.26, noseDepth: 0.2,
      mouthWidth: -0.08, lipFullness: 0.12, earSize: 0.56, earAngle: 0.4,
    },
    slots: {
      "face-shape": "face-shape/v-line", eyes: "eyes/wide", irises: "irises/soft-gradient", nose: "nose/straight",
      mouth: "mouth/small", ears: "ears/pointed", hair: "hair/hime-cut", body: "body/slim",
      top: "top/sailor", bottom: "bottom/pleated-skirt", shoes: "shoes/loafers",
    },
    colors: { skin: "#fff1dc", hair: "#dfd3c3", brow: "#b8a898", iris: "#3ba38b", top: "#eef4f8", bottom: "#2d4a53", shoes: "#4a3b32" },
    pose: SHAPER_BUILTIN_POSE_PRESETS["shaper-pose-2"].pose,
  },
};

/**
 * 선택한 SHAPER 아키타입/포즈/부위 프리셋 ID를 실행할 `LabCommand[]` 시퀀스로 변환한다.
 */
export function buildShaperPresetCommands(presetKey: string): {
  readonly commands: readonly LabCommand[];
  readonly noticeKo: string;
} | null {
  if (presetKey in SHAPER_BUILTIN_ARCHETYPE_PRESETS) {
    const preset = SHAPER_BUILTIN_ARCHETYPE_PRESETS[presetKey];
    if (!preset) return null;
    const commands: LabCommand[] = [];
    for (const [slot, presetId] of Object.entries(preset.slots)) {
      if (presetId) commands.push({ type: "slot/apply", slot: slot as SlotKind, presetId });
    }
    for (const [key, value] of Object.entries(preset.bodyParams)) {
      if (typeof value === "number") {
        commands.push({ type: "param/set", group: "body", key: key as BodyParamKey, value, coalesceKey: `shaper-archetype:${preset.id}` });
      }
    }
    for (const [key, value] of Object.entries(preset.faceParams)) {
      if (typeof value === "number") {
        commands.push({ type: "param/set", group: "face", key: key as FaceParamKey, value, coalesceKey: `shaper-archetype:${preset.id}` });
      }
    }
    for (const [colorKey, hex] of Object.entries(preset.colors)) {
      if (typeof hex === "string") commands.push({ type: "color/set", key: colorKey as RecipeColorKey, value: hex });
    }
    commands.push({ type: "pose/set", pose: preset.pose, scope: "full", labelKo: preset.labelKo });
    return {
      commands,
      noticeKo: `${preset.labelKo} (헤어·의상·두상·체형·포즈·웹툰 피부톤)을 일괄 적용했습니다.`,
    };
  }

  if (presetKey in SHAPER_BUILTIN_POSE_PRESETS) {
    const preset = SHAPER_BUILTIN_POSE_PRESETS[presetKey as keyof typeof SHAPER_BUILTIN_POSE_PRESETS];
    return {
      commands: [{ type: "pose/set", pose: preset.pose, scope: "full", labelKo: preset.labelKo }],
      noticeKo: `${preset.labelKo}을 적용했습니다.`,
    };
  }

  if (presetKey in SHAPER_BUILTIN_PART_PRESETS) {
    const preset = SHAPER_BUILTIN_PART_PRESETS[presetKey];
    if (!preset) return null;
    const commands: LabCommand[] = [];
    if (preset.slots) {
      for (const [slot, presetId] of Object.entries(preset.slots)) {
        if (presetId) commands.push({ type: "slot/apply", slot: slot as SlotKind, presetId });
      }
    }
    for (const [key, value] of Object.entries(preset.faceParams)) {
      if (typeof value === "number") {
        commands.push({ type: "param/set", group: "face", key: key as FaceParamKey, value, coalesceKey: `shaper-part:${preset.id}` });
      }
    }
    return {
      commands,
      noticeKo: `${preset.labelKo} 부위 프리셋을 적용했습니다.`,
    };
  }

  return null;
}
