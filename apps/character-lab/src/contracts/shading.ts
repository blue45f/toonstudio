/**
 * 셰이딩 프로파일(zod 4). PBR/툰 모드, 그림자, 후처리, IBL, 툰 옵션.
 * taa·ssao는 베타(기본 false).
 *
 * v3(레시피 v3, 2026-10-23 CORE-1): 화풍 값 `look`(art-style.ts `lookSchema`)이 **필수**다. 기본값은 v2 엔진 상수와 같은
 * `LOOK_V2_IDENTITY`라 v2 프로파일을 올려도(`upgradeShadingV2`) 그림이 같다. v1·v2 레시피는 look 없는 `shadingProfileSchemaV2`로 읽는다.
 * 베타 토글(NodeMaterial 툰 등)은 여전히 엔진 세션 상태이고 프로파일에 넣지 않는다(AGENTS.md 4절) — 화풍은 사용자 산출물이라 저장한다.
 */
import { z } from "zod";

import { LOOK_V2_IDENTITY, cloneLook, lookSchema, mergeLook } from "./art-style";
import { isChannelKey } from "./color-channels";

import type { Look, LookPatch } from "./art-style";

export const SHADING_MODES = ["pbr", "toon"] as const;
export type ShadingMode = (typeof SHADING_MODES)[number];

export const TONE_MAPPINGS = ["khr-pbr-neutral", "aces", "none"] as const;
export type ToneMapping = (typeof TONE_MAPPINGS)[number];

const shadingShapeV2 = {
  mode: z.enum(SHADING_MODES),
  toneMapping: z.enum(TONE_MAPPINGS),
  shadows: z
    .object({
      enabled: z.boolean(),
      cascades: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      pcf: z.boolean(),
      contactHardening: z.boolean(),
    })
    .strict(),
  postfx: z
    .object({
      fxaa: z.boolean(),
      /** 베타 */
      taa: z.boolean(),
      bloom: z.boolean(),
      /** 베타 */
      ssao: z.boolean(),
      sharpen: z.boolean(),
    })
    .strict(),
  ibl: z
    .object({
      enabled: z.boolean(),
      intensity: z.number().min(0).max(4),
    })
    .strict(),
  toon: z
    .object({
      rampSteps: z.union([z.literal(2), z.literal(3), z.literal(4)]),
      faceSdfShadow: z.boolean(),
      outline: z.enum(["none", "hull", "edge"]),
      rim: z.boolean(),
    })
    .strict(),
};

/** v1·v2 레시피의 셰이딩(look 없음). 읽기 전용 호환이며 메모리의 프로파일은 항상 v3다. */
export const shadingProfileSchemaV2 = z.object(shadingShapeV2).strict();
export type ShadingProfileV2 = z.infer<typeof shadingProfileSchemaV2>;

/** look + 채널 어휘 대조(`grade.accentChannels` — art-style.ts는 zod만 import하므로 여기서 대조한다) */
export const recipeLookSchema = lookSchema.superRefine((look, ctx) => {
  look.grade.accentChannels.forEach((key, index) => {
    if (!isChannelKey(key)) ctx.addIssue({ code: "custom", message: `강조 채널 ${key}이(가) 색 채널 어휘에 없습니다.`, path: ["grade", "accentChannels", index] });
  });
});

/** v3 셰이딩 프로파일(look 필수) */
export const shadingProfileSchema = z.object({ ...shadingShapeV2, look: recipeLookSchema }).strict();

export type ShadingProfile = z.infer<typeof shadingProfileSchema>;

/** `shading/set`의 부분 변경: 하위 객체도 부분 지정, look은 그룹별 부분 병합 */
export type ShadingProfilePatch = {
  readonly mode?: ShadingMode;
  readonly toneMapping?: ToneMapping;
  readonly shadows?: Partial<ShadingProfile["shadows"]>;
  readonly postfx?: Partial<ShadingProfile["postfx"]>;
  readonly ibl?: Partial<ShadingProfile["ibl"]>;
  readonly toon?: Partial<ShadingProfile["toon"]>;
  readonly look?: LookPatch;
};

export const DEFAULT_SHADING: ShadingProfile = Object.freeze({
  mode: "pbr",
  toneMapping: "khr-pbr-neutral",
  shadows: { enabled: true, cascades: 2, pcf: true, contactHardening: false },
  postfx: { fxaa: true, taa: false, bloom: false, ssao: false, sharpen: false },
  ibl: { enabled: true, intensity: 1 },
  toon: { rampSteps: 3, faceSdfShadow: true, outline: "hull", rim: true },
  look: LOOK_V2_IDENTITY,
}) as ShadingProfile;

/** v2 프로파일(look 없음) → v3. look은 v2 항등값의 사본이다(명시 마이그레이션의 일부). */
export function upgradeShadingV2(profile: ShadingProfileV2): ShadingProfile {
  return {
    mode: profile.mode,
    toneMapping: profile.toneMapping,
    shadows: { ...profile.shadows },
    postfx: { ...profile.postfx },
    ibl: { ...profile.ibl },
    toon: { ...profile.toon },
    look: cloneLook(LOOK_V2_IDENTITY),
  };
}

export type QualityPresetId = "preview" | "standard" | "hero";

export const QUALITY_PRESET_LABELS_KO: Readonly<Record<QualityPresetId, string>> = {
  preview: "미리보기",
  standard: "표준",
  hero: "히어로",
};

/** 품질 프리셋. mode·toon·look 옵션은 유지하고 그림자·후처리·IBL만 바꾸는 용도로 `applyQualityPreset`을 쓴다. */
export const QUALITY_PRESETS: Readonly<Record<QualityPresetId, ShadingProfile>> = {
  preview: {
    ...DEFAULT_SHADING,
    shadows: { enabled: true, cascades: 1, pcf: false, contactHardening: false },
    postfx: { fxaa: false, taa: false, bloom: false, ssao: false, sharpen: false },
    ibl: { enabled: true, intensity: 1 },
  },
  standard: DEFAULT_SHADING,
  hero: {
    ...DEFAULT_SHADING,
    shadows: { enabled: true, cascades: 4, pcf: true, contactHardening: true },
    postfx: { fxaa: true, taa: false, bloom: true, ssao: false, sharpen: true },
    ibl: { enabled: true, intensity: 1.2 },
  },
};

/** 프로파일의 mode·toon·toneMapping·look은 유지하고 품질 프리셋의 shadows·postfx·ibl만 덮어쓴다. */
export function applyQualityPreset(profile: ShadingProfile, preset: QualityPresetId): ShadingProfile {
  const source = QUALITY_PRESETS[preset];
  return { ...profile, shadows: source.shadows, postfx: source.postfx, ibl: source.ibl };
}

/** 부분 프로파일을 병합한다(shading/set 명령용). 하위 객체는 한 단계, look은 그룹별(`mergeLook`)로 병합한다. */
export function mergeShadingProfile(base: ShadingProfile, patch: ShadingProfilePatch): ShadingProfile {
  const look: Look = patch.look === undefined ? base.look : mergeLook(base.look, patch.look);
  return {
    mode: patch.mode ?? base.mode,
    toneMapping: patch.toneMapping ?? base.toneMapping,
    shadows: { ...base.shadows, ...patch.shadows },
    postfx: { ...base.postfx, ...patch.postfx },
    ibl: { ...base.ibl, ...patch.ibl },
    toon: { ...base.toon, ...patch.toon },
    look,
  };
}
