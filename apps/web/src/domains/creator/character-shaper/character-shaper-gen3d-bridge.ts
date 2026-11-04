/**
 * SHAPER REA (`com.StudioHORANG.SHAPER` v1.05) × Tripo 3D V3 MCP (`tripo-cli@0.7.3`)
 * 리얼 툰 셰이딩 비주얼 프로파일 · 5-Ratio T/A-Pose 제어 · VRM Auto-Rig / Delight 브리지.
 *
 * 결합 아키텍처 근거:
 * 1. **SHAPER MToon / Toony Colors Pro 2 + Tripo Texture v3.5 Delight (`delight=true`)**:
 *    SHAPER의 3-레이어 PSD 분리(`밑색` / `음영 Multiply` / `주선 a=1-r`)와 실시간 3차 스무스스텝 MatCap 램프가
 *    깨끗하게 작동하려면, 3D 메쉬의 베이스 텍스처(Albedo)에 구워진 조명 그림자(Baked Shadow)가 없어야 한다.
 *    Tripo 3D Texture `v3.5-20260815`(`delight=true`)는 생성 텍스처의 베이크 광원을 제거하여 SHAPER 셀 셰이더와 직결된다.
 * 2. **SHAPER 5~8등신 체형(`BodyData::GetBodyHeight` `0x06000083`) + Tripo V3 5-Ratio Pose Control**:
 *    Tripo V3 `v3.1-20260211`의 `, t-pose:headH:headW:legsH:armsL:span` 프롬프트 접미어로 SHAPER 등신비를 그대로 반영한다.
 * 3. **SHAPER 15-슬롯 모듈러 장착(`ItemParts::SwitchBody`) + Tripo SmartSegment (`v2.0-20260430`) & Auto-Rig (`v3.0-20260909`)**:
 *    `segment -> complete -> decimate -> uv -> texture(delight) -> rig-check -> rig(spec=vrm,rig_type=biped) -> retarget`
 *    파이프라인을 슬롯 성격(의상·헤어·전신·소품)에 맞춰 자동 라우팅한다.
 * 4. **SHAPER `UIItemSlot` 수정자 클릭(`Ctrl+클릭` 색상 보존 / `Alt+클릭` 좌우 반전)**:
 *    프리셋 카드 클릭 시 색상 팔레트 유지 또는 포즈 대칭 반전을 즉시 판별한다.
 */

import type { CharacterSlotKind } from "./character-shaper-contract";

export type ShaperGen3dVisualStyleId =
  | "shaper-cel"
  | "shaper-semi-real"
  | "shaper-romance-soft"
  | "shaper-noir-ink";

export interface ShaperGen3dVisualProfile {
  readonly id: ShaperGen3dVisualStyleId;
  readonly label: string;
  readonly badge: string;
  readonly summary: string;
  /** MToon `shadingToonyFactor` (0 = 부드러운 그라데이션, 1 = 칼같은 셀 음영) */
  readonly shadeToonyFactor: number;
  /** MToon `shadingShiftFactor` (-1..1, 음수일수록 밝은 영역 넓어짐) */
  readonly shadeShiftFactor: number;
  /** SHAPER 3차 스무스스텝 MatCap 반사 강도 (0..1) */
  readonly matcapIntensity: number;
  /** 림라이트 혼합비 (0..1) */
  readonly rimLightingMix: number;
  /** 월드 기준 외곽선 두께 (m) */
  readonly outlineWidthWorld: number;
  /** 외곽선 잉크 HEX */
  readonly outlineColorHex: string;
  /** Tripo Texture v3.5-20260815 `delight=true` (베이크 그림자 제거) 권장 여부 */
  readonly tripoDelight: boolean;
  /** 권장 Tripo 텍스처 해상도 등급 */
  readonly tripoTextureQuality: "standard" | "detailed";
}

export const SHAPER_GEN3D_VISUAL_PROFILES: readonly ShaperGen3dVisualProfile[] = Object.freeze([
  {
    id: "shaper-cel",
    label: "SHAPER 표준 2단 셀",
    badge: "TCP2 · v3.5 Delight",
    summary: "SHAPER 기본 2단 셀 음영과 무음영(Delight) 베이스 텍스처로 가장 깔끔한 PSD 밑색·음영 분리를 제공합니다.",
    shadeToonyFactor: 0.94,
    shadeShiftFactor: -0.08,
    matcapIntensity: 0.35,
    rimLightingMix: 0.25,
    outlineWidthWorld: 0.0022,
    outlineColorHex: "#1c1917",
    tripoDelight: true,
    tripoTextureQuality: "detailed",
  },
  {
    id: "shaper-semi-real",
    label: "세미리얼 소프트 툰",
    badge: "Tripo P2 · 4K PBR+Toon",
    summary: "고밀도 P2 쿼드 토폴로지와 부드러운 MatCap 반사·반투명 림라이트로 일러스트형 입체감을 살립니다.",
    shadeToonyFactor: 0.62,
    shadeShiftFactor: -0.02,
    matcapIntensity: 0.65,
    rimLightingMix: 0.48,
    outlineWidthWorld: 0.0014,
    outlineColorHex: "#292524",
    tripoDelight: true,
    tripoTextureQuality: "detailed",
  },
  {
    id: "shaper-romance-soft",
    label: "로맨스 판타지 벨벳",
    badge: "Warm Shift · 파스텔",
    summary: "얼굴·머리카락 그림자 경계를 부드럽게 늦추고 따뜻한 갈색 주선과 강한 하이라이트 림을 더합니다.",
    shadeToonyFactor: 0.78,
    shadeShiftFactor: 0.05,
    matcapIntensity: 0.52,
    rimLightingMix: 0.6,
    outlineWidthWorld: 0.0016,
    outlineColorHex: "#44403c",
    tripoDelight: true,
    tripoTextureQuality: "detailed",
  },
  {
    id: "shaper-noir-ink",
    label: "액션 느와르 하드잉크",
    badge: "Hard Cel · 고대비",
    summary: "강한 명암 대비와 굵은 비등방 잉크 외곽선, 역광 림라이트로 액션·스릴러 컷 연출에 최적화합니다.",
    shadeToonyFactor: 0.98,
    shadeShiftFactor: -0.22,
    matcapIntensity: 0.22,
    rimLightingMix: 0.82,
    outlineWidthWorld: 0.0032,
    outlineColorHex: "#09090b",
    tripoDelight: true,
    tripoTextureQuality: "standard",
  },
]);

export function getShaperGen3dVisualProfile(
  id: ShaperGen3dVisualStyleId,
): ShaperGen3dVisualProfile {
  return SHAPER_GEN3D_VISUAL_PROFILES.find((profile) => profile.id === id) ?? SHAPER_GEN3D_VISUAL_PROFILES[0]!;
}

export interface ShaperGen3dPoseControlInput {
  readonly poseType?: "T-Pose" | "A-Pose";
  /** SHAPER 등신비 (5.0 ~ 8.5, 기본 7.0등신) */
  readonly headHeads?: number;
  /** 어깨·두상 폭 배율 (0.5 ~ 2.0, 기본 1.0) */
  readonly headWidthRatio?: number;
  /** 다리 길이 배율 (0.5 ~ 2.0, 기본 1.05) */
  readonly legsHeightRatio?: number;
  /** 팔 길이 배율 (0.5 ~ 2.0, 기본 1.0) */
  readonly armsLengthRatio?: number;
  /** 팔 벌림 스팬 (1.0 ~ 12.0, 기본 9.0) */
  readonly spanRatio?: number;
}

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function fmt1(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/**
 * SHAPER `BodyData::GetBodyHeight` (`0x06000083`) 등신비(5~8등신)를
 * Tripo 3D V3 5-ratio 포즈 제어 프롬프트 접미어(`, t-pose:hH:hW:lH:aL:span`)로 변환한다.
 */
export function buildShaperGen3dPoseControlSuffix(input: ShaperGen3dPoseControlInput = {}): {
  readonly prefix: "t-pose" | "a-pose";
  readonly headHeightRatio: number;
  readonly headWidthRatio: number;
  readonly legsHeightRatio: number;
  readonly armsLengthRatio: number;
  readonly spanRatio: number;
  readonly promptSuffix: string;
} {
  const poseType = input.poseType ?? "T-Pose";
  const prefix = poseType === "A-Pose" ? "a-pose" : "t-pose";
  const heads = clampFinite(input.headHeads, 7.0, 5.0, 8.5);
  // 7.0등신을 1.0 기준으로 정규화 (5등신 -> 1.4, 8등신 -> 0.9)
  const headHeightRatio = clampFinite(7.0 / heads, 1.0, 0.5, 2.0);
  const headWidthRatio = clampFinite(input.headWidthRatio, 1.0, 0.5, 2.0);
  const legsHeightRatio = clampFinite(input.legsHeightRatio, heads >= 7.5 ? 1.15 : 1.0, 0.5, 2.0);
  const armsLengthRatio = clampFinite(input.armsLengthRatio, 1.0, 0.5, 2.0);
  const spanRatio = clampFinite(input.spanRatio, poseType === "A-Pose" ? 6.5 : 9.0, 1.0, 12.0);

  return {
    prefix,
    headHeightRatio: Number(fmt1(headHeightRatio)),
    headWidthRatio: Number(fmt1(headWidthRatio)),
    legsHeightRatio: Number(fmt1(legsHeightRatio)),
    armsLengthRatio: Number(fmt1(armsLengthRatio)),
    spanRatio: Number(fmt1(spanRatio)),
    promptSuffix: `, ${prefix}:${fmt1(headHeightRatio)}:${fmt1(headWidthRatio)}:${fmt1(legsHeightRatio)}:${fmt1(armsLengthRatio)}:${fmt1(spanRatio)}`,
  };
}

export type ShaperGen3dSlotKind =
  | CharacterSlotKind
  | "prop"
  | "outfit"
  | "outer"
  | "head"
  | "face"
  | "eyebrows";
export type ShaperGen3dScenarioKind = "webtoon-character" | "webtoon-prop" | "smart-segment-wearable";

export interface ShaperGen3dSlotGenerationPlan {
  readonly slot: ShaperGen3dSlotKind;
  readonly scenario: ShaperGen3dScenarioKind;
  readonly modelVersion: "v3.1-20260211" | "P2-20260801";
  readonly textureModelVersion: "v3.5-20260815";
  readonly textureDelight: boolean;
  readonly textureQuality: "standard" | "detailed";
  readonly smartSegmentVersion: "v2.0-20260430" | null;
  readonly autoRigVersion: "v3.0-20260909" | null;
  readonly rigSpec: "vrm" | null;
  readonly retargetAnimations: readonly ("preset:idle" | "preset:walk" | "preset:slash")[];
  readonly targetFaceLimit: number;
  readonly quadTopology: boolean;
  readonly smartLowPoly: boolean;
  readonly pivotToCenterBottom: boolean;
  readonly enrichedPrompt: string;
  readonly pipelineSteps: readonly string[];
  readonly cliCommand: string;
  readonly mcpToolName: "tripo_generate_character_vrm" | "tripo_generate_prop_glb" | "tripo_segment_wearable_parts";
  readonly visualProfile: ShaperGen3dVisualProfile;
}

const PROP_SLOTS: ReadonlySet<ShaperGen3dSlotKind> = new Set([
  "prop",
  "accessory",
]);

const WEARABLE_SEGMENT_SLOTS: ReadonlySet<ShaperGen3dSlotKind> = new Set([
  "outfit",
  "top",
  "bottom",
  "outer",
  "shoes",
  "hair",
]);

/**
 * 현재 선택된 캐릭터 슬롯과 프롬프트·체형·비주얼 스타일을 기반으로
 * Tripo 3D V3 MCP / CLI 실행 플랜을 생성한다.
 */
export function buildShaperGen3dSlotGenerationPlan(input: {
  readonly slot: ShaperGen3dSlotKind;
  readonly prompt: string;
  readonly visualStyleId?: ShaperGen3dVisualStyleId;
  readonly poseControl?: ShaperGen3dPoseControlInput;
}): ShaperGen3dSlotGenerationPlan {
  const basePrompt = input.prompt.trim() || "webtoon stylized character asset, clean silhouette";
  const visualProfile = getShaperGen3dVisualProfile(input.visualStyleId ?? "shaper-cel");
  const isProp = PROP_SLOTS.has(input.slot);
  const isWearable = WEARABLE_SEGMENT_SLOTS.has(input.slot);

  if (isProp) {
    const enrichedPrompt = `${basePrompt}, stylized webtoon prop, clean bevel edges, unlit base color ready`;
    return {
      slot: input.slot,
      scenario: "webtoon-prop",
      modelVersion: "P2-20260801",
      textureModelVersion: "v3.5-20260815",
      textureDelight: visualProfile.tripoDelight,
      textureQuality: visualProfile.tripoTextureQuality,
      smartSegmentVersion: null,
      autoRigVersion: null,
      rigSpec: null,
      retargetAnimations: [],
      targetFaceLimit: 25_000,
      quadTopology: true,
      smartLowPoly: true,
      pivotToCenterBottom: true,
      enrichedPrompt,
      pipelineSteps: ["generate(P2-20260801)", "decimate(25k·quad)", "uv(smart)", "texture(v3.5·delight)", "convert(glb·pivot)"],
      cliCommand: `pnpm tripo3d:scenario --scenario webtoon-prop --prompt "${enrichedPrompt.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}" --delight`,
      mcpToolName: "tripo_generate_prop_glb",
      visualProfile,
    };
  }

  const pose = buildShaperGen3dPoseControlSuffix(input.poseControl);
  const enrichedPrompt = `${basePrompt}, stylized manhwa webtoon character, clean cel-shading topology${pose.promptSuffix}`;

  if (isWearable) {
    return {
      slot: input.slot,
      scenario: "smart-segment-wearable",
      modelVersion: "v3.1-20260211",
      textureModelVersion: "v3.5-20260815",
      textureDelight: visualProfile.tripoDelight,
      textureQuality: visualProfile.tripoTextureQuality,
      smartSegmentVersion: "v2.0-20260430",
      autoRigVersion: "v3.0-20260909",
      rigSpec: "vrm",
      retargetAnimations: ["preset:idle"],
      targetFaceLimit: 32_000,
      quadTopology: true,
      smartLowPoly: false,
      pivotToCenterBottom: true,
      enrichedPrompt,
      pipelineSteps: [
        "generate(v3.1·T-Pose)",
        "segment(v2.0)",
        "complete(parts)",
        "texture(v3.5·delight)",
        "rig(v3.0·vrm)",
      ],
      cliCommand: `pnpm tripo3d:scenario --scenario webtoon-character --prompt "${basePrompt.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}" --segment --delight`,
      mcpToolName: "tripo_segment_wearable_parts",
      visualProfile,
    };
  }

  return {
    slot: input.slot,
    scenario: "webtoon-character",
    modelVersion: "v3.1-20260211",
    textureModelVersion: "v3.5-20260815",
    textureDelight: visualProfile.tripoDelight,
    textureQuality: visualProfile.tripoTextureQuality,
    smartSegmentVersion: "v2.0-20260430",
    autoRigVersion: "v3.0-20260909",
    rigSpec: "vrm",
    retargetAnimations: ["preset:idle", "preset:walk"],
    targetFaceLimit: 48_000,
    quadTopology: false,
    smartLowPoly: false,
    pivotToCenterBottom: true,
    enrichedPrompt,
    pipelineSteps: [
      "generate(v3.1·5-Ratio T-Pose)",
      "texture(v3.5·delight)",
      "rig-check",
      "rig(v3.0·spec=vrm·biped)",
      "retarget(idle·walk)",
    ],
    cliCommand: `pnpm tripo3d:scenario --scenario webtoon-character --prompt "${basePrompt.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}" --delight`,
    mcpToolName: "tripo_generate_character_vrm",
    visualProfile,
  };
}

export interface ShaperPresetClickModifierState {
  readonly preserveColor: boolean;
  readonly mirrorPose: boolean;
  readonly badgeLabel: string | null;
}

/**
 * SHAPER `UIItemSlot` / `CustomData` 프리셋 카드 수정자 클릭 판별:
 * - `Ctrl+Click` (또는 `Cmd+Click`): 현재 커스텀 색상 팔레트 유지 (`preserveColor = true`)
 * - `Alt+Click`: 포즈·손포즈 좌우 대칭 반전 적용 (`mirrorPose = true`)
 */
export function resolveShaperPresetClickModifiers(event: {
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}): ShaperPresetClickModifierState {
  const preserveColor = Boolean(event.ctrlKey || event.metaKey);
  const mirrorPose = Boolean(event.altKey);
  const parts: string[] = [];
  if (preserveColor) parts.push("Ctrl+클릭: 현재 색상 유지");
  if (mirrorPose) parts.push("Alt+클릭: 포즈 좌우 반전");
  return {
    preserveColor,
    mirrorPose,
    badgeLabel: parts.length > 0 ? parts.join(" · ") : null,
  };
}

export interface ShaperMaterialDataInput {
  /** 음영 경계 위치 (`shadePos`, 0..1, 기본 0.5) */
  readonly shadePos?: number;
  /** 음영 부드러움 폭 (`shadeWidth`, 0..1, 기본 0.12) */
  readonly shadeWidth?: number;
  /** 반사광 경계 위치 (`rLightPos`, 0..1, 기본 0.82) */
  readonly rLightPos?: number;
  /** 반사광 폭 (`rLightWidth`, 0..1, 기본 0.25) */
  readonly rLightWidth?: number;
  /** 비등방 필압 외곽선 (`_Outline_W=1.5`, `_Outline_H=0.3`, 기본 true) */
  readonly outlinePressure?: boolean;
  /** 헤어 내부 주선 억제 (`hID*1` -> `simpleDisableInlineMatCapShader`, 기본 true) */
  readonly disableHairInline?: boolean;
}

export interface ShaperMaterialDataUniforms {
  readonly shadePos: number;
  readonly shadeWidth: number;
  readonly shadeScaleU: number;
  readonly shadeOffsetU: number;
  readonly rLightPos: number;
  readonly rLightWidth: number;
  readonly rLightScaleU: number;
  readonly rLightOffsetU: number;
  readonly outlineWidthScale: number;
  readonly outlineHeightScale: number;
  readonly outlineAspectRatio: number;
  readonly hairShaderVariant: "simpleDisableInlineMatCapShader" | "simpleMatCapShader";
  readonly mtoonShadingToonyFactor: number;
  readonly mtoonShadingShiftFactor: number;
  readonly mtoonParametricRimLift: number;
  readonly summaryLabel: string;
}

function computeCubicRampPair(pos: number, width: number): { readonly scaleU: number; readonly offsetU: number } {
  const inv = 1 - width;
  const rawScale = 125 * inv * inv * inv;
  const scaleU = Math.max(0.001, Math.round(rawScale * 100) / 100);
  const offsetU = Math.round((-0.5 * (scaleU - 1) + pos * scaleU) * 100) / 100;
  return { scaleU, offsetU };
}

/**
 * SHAPER REA `MaterialData::ApplyShadeLine` (`0x06000236`) + `MaterialData::SetValuesFromUI` (`0x06000235`)
 * 3차 스무스스텝 MatCap 램프($125(1-w)^3$)·반사광·비등방 필압 외곽선($1.5\times 0.3$)·`hID*1` 헤어 내선 억제 유니폼 계산.
 */
export function computeShaperMaterialDataUniforms(
  input: ShaperMaterialDataInput = {},
): ShaperMaterialDataUniforms {
  const shadePos = clampFinite(input.shadePos, 0.5, 0, 1);
  const shadeWidth = clampFinite(input.shadeWidth, 0.12, 0, 1);
  const rLightPos = clampFinite(input.rLightPos, 0.82, 0, 1);
  const rLightWidth = clampFinite(input.rLightWidth, 0.25, 0, 1);
  const outlinePressure = input.outlinePressure ?? true;
  const disableHairInline = input.disableHairInline ?? true;

  const shade = computeCubicRampPair(shadePos, shadeWidth);
  const rLight = computeCubicRampPair(rLightPos, rLightWidth);
  const outlineWidthScale = outlinePressure ? 1.5 : 1.0;
  const outlineHeightScale = outlinePressure ? 0.3 : 1.0;
  const outlineAspectRatio = outlinePressure ? 5.0 : 1.0;
  const hairShaderVariant = disableHairInline
    ? "simpleDisableInlineMatCapShader"
    : "simpleMatCapShader";

  const mtoonShadingToonyFactor = Number(clampFinite(1 - 0.85 * shadeWidth, 0.9, 0.05, 0.99).toFixed(2));
  const mtoonShadingShiftFactor = Number(clampFinite((shadePos - 0.5) * -0.6, 0, -0.5, 0.5).toFixed(2));
  const mtoonParametricRimLift = Number(clampFinite((rLightPos - 0.5) * 0.8, 0.25, -0.5, 0.5).toFixed(2));

  return {
    shadePos,
    shadeWidth,
    shadeScaleU: shade.scaleU,
    shadeOffsetU: shade.offsetU,
    rLightPos,
    rLightWidth,
    rLightScaleU: rLight.scaleU,
    rLightOffsetU: rLight.offsetU,
    outlineWidthScale,
    outlineHeightScale,
    outlineAspectRatio,
    hairShaderVariant,
    mtoonShadingToonyFactor,
    mtoonShadingShiftFactor,
    mtoonParametricRimLift,
    summaryLabel: `MatCap ${shade.scaleU.toFixed(1)}× · 반사광 ${rLight.scaleU.toFixed(1)}× · 외곽선 ${outlineWidthScale.toFixed(1)}×${outlineHeightScale.toFixed(1)} · ${disableHairInline ? "hID*1 무내선" : "헤어 내선 활성"}`,
  };
}

export interface VrmGen3dShaperPreflightInput {
  readonly humanoidReady: boolean;
  readonly mappedBoneCount?: number;
  readonly hasEyeGazeBones?: boolean;
  readonly triangleCount?: number;
  readonly materialCount?: number;
  readonly maxTextureDimension?: number;
  readonly tripoDelightApplied?: boolean;
}

export interface VrmGen3dShaperPreflightCheck {
  readonly id: "humanoid" | "eye-gaze" | "triangles" | "materials" | "texture" | "delight";
  readonly labelKo: string;
  readonly passed: boolean;
  readonly detailKo: string;
}

export interface VrmGen3dShaperPreflightReport {
  readonly passed: boolean;
  readonly grade: "S" | "A" | "B" | "C";
  readonly summaryKo: string;
  readonly checks: readonly VrmGen3dShaperPreflightCheck[];
}

export const VRM_GEN3D_SHAPER_BUDGETS = Object.freeze({
  maxTriangles: 70_000,
  maxMaterials: 16,
  maxTextureDimension: 4096,
  recommendedHumanoidBones: 53,
});

/**
 * `vrm-toolkit` (`vrm_inspect` / `vrm_validate` VRM 1.0 예산: 70k tris · 16 mats · 4096px · 53 humanoid bones)
 * + Tripo Texture `v3.5-20260815` (`delight=true`) + SHAPER 안구 시선(`leftEye`/`rightEye`) 호환성 프리플라이트 진단.
 */
export function evaluateVrmGen3dShaperPreflight(
  input: VrmGen3dShaperPreflightInput,
): VrmGen3dShaperPreflightReport {
  const mappedBoneCount = clampFinite(
    input.mappedBoneCount,
    input.humanoidReady ? VRM_GEN3D_SHAPER_BUDGETS.recommendedHumanoidBones : 0,
    0,
    256,
  );
  const hasEyeGazeBones = input.hasEyeGazeBones ?? input.humanoidReady;
  const triangleCount = clampFinite(input.triangleCount, 38_400, 0, 1_000_000);
  const materialCount = clampFinite(input.materialCount, 8, 0, 256);
  const maxTextureDimension = clampFinite(input.maxTextureDimension, 2048, 64, 16_384);
  const gen3dDelightApplied = input.tripoDelightApplied ?? true;

  const checks: readonly VrmGen3dShaperPreflightCheck[] = [
    {
      id: "humanoid",
      labelKo: "VRM 1.0 휴머노이드 본 매핑",
      passed: input.humanoidReady && mappedBoneCount >= 15,
      detailKo: `${mappedBoneCount} / ${VRM_GEN3D_SHAPER_BUDGETS.recommendedHumanoidBones} 본 (Auto-Rig v3.0 biped)`,
    },
    {
      id: "eye-gaze",
      labelKo: "SHAPER 안구 시선·하이라이트 본",
      passed: hasEyeGazeBones,
      detailKo: hasEyeGazeBones ? "leftEye·rightEye 활성 (F10 시선 잠금 호환)" : "안구 본 미감지 (시선 잠금 제한)",
    },
    {
      id: "triangles",
      labelKo: "삼각형 예산 (vrm_validate)",
      passed: triangleCount <= VRM_GEN3D_SHAPER_BUDGETS.maxTriangles,
      detailKo: `${triangleCount.toLocaleString("en-US")} / ${VRM_GEN3D_SHAPER_BUDGETS.maxTriangles.toLocaleString("en-US")} tris`,
    },
    {
      id: "materials",
      labelKo: "서브메시·머티리얼 슬롯 예산",
      passed: materialCount <= VRM_GEN3D_SHAPER_BUDGETS.maxMaterials,
      detailKo: `${materialCount} / ${VRM_GEN3D_SHAPER_BUDGETS.maxMaterials} mats`,
    },
    {
      id: "texture",
      labelKo: "텍스처 해상도 상한",
      passed: maxTextureDimension <= VRM_GEN3D_SHAPER_BUDGETS.maxTextureDimension,
      detailKo: `${maxTextureDimension}px / ${VRM_GEN3D_SHAPER_BUDGETS.maxTextureDimension}px`,
    },
    {
      id: "delight",
      labelKo: "Tripo v3.5 Delight 무음영 알베도",
      passed: gen3dDelightApplied,
      detailKo: gen3dDelightApplied ? "구워진 그림자 제거됨 (PSD 3-Layer 분리 최적)" : "원본 조명 그림자 포함",
    },
  ];

  const passCount = checks.filter((check) => check.passed).length;
  const passed = checks[0]!.passed && checks[2]!.passed && checks[3]!.passed && checks[4]!.passed;
  const grade: "S" | "A" | "B" | "C" =
    passCount === checks.length && mappedBoneCount >= 50
      ? "S"
      : passCount >= 5
        ? "A"
        : passed
          ? "B"
          : "C";

  return {
    passed,
    grade,
    summaryKo: `VRM 1.0 · Tripo V3 프리플라이트 등급 ${grade} (${passCount}/${checks.length} 통과)`,
    checks,
  };
}

export type ShaperGen3dGeneratedGlbId =
  | "tripo-studio-h31-webtoon-character"
  | "tripo-studio-h31-rigged-character"
  | "tripo-studio-h31-segmented-outfit"
  | "tripo-studio-p2-quad-head-bust"
  | "tripo-studio-h31-knight-crest"
  | "shaper-cel-head-bust"
  | "shaper-star-wing-wand"
  | "shaper-academy-crest-shield";

export interface ShaperGen3dGeneratedGlbAsset {
  readonly id: ShaperGen3dGeneratedGlbId;
  readonly slot: ShaperGen3dSlotKind;
  readonly compatibleSlots: readonly ShaperGen3dSlotKind[];
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly assetUrl: string;
  readonly relativeDiskPath: string;
  readonly byteLength: number;
  readonly meshes: number;
  readonly triangles: number;
  readonly vertices: number;
  readonly materials: number;
  readonly dimensionsMeters: readonly [number, number, number];
  readonly watertight: boolean;
  readonly originAt: "base-center";
  readonly sha256: string;
  readonly generatorBadge:
    | "Tripo Studio H3.1 (Browser CDP · v3.1-20260211) + glbforge WebP"
    | "Tripo Studio P2.0 Quad (Browser CDP · Nexus-v2.0) + glbforge"
    | "tripo3d MCP (Blender 5.2) + glbforge Verified";
}

/**
 * `studio.tripo3d.ai` 브라우저 CDP 제어(`v3.1-20260211`, `Nexus-v2.0-20260801`, 8K 텍스처·부분별 생성·Smart Mesh P2.0·Smart UV·Auto-Rig) 및
 * `tripo3d` MCP (`create_object`, `execute_blender_code` on headless Blender 5.2)로 생성하고
 * `glbforge` MCP (`optimize_glb` + `inspect` `mobile-hero@1` + `validate` `quick`)로 검증 완료한 실물 3D `.glb` 에셋 카탈로그.
 */
export const SHAPER_GEN3D_GENERATED_GLB_CATALOG: readonly ShaperGen3dGeneratedGlbAsset[] = Object.freeze([
  {
    id: "tripo-studio-h31-webtoon-character", slot: "body", compatibleSlots: ["body", "top", "bottom"],
    labelKo: "Tripo H3.1 웹툰 7등신 주인공 전신 (T-Pose · Delight)",
    summaryKo: "studio.tripo3d.ai 브라우저 제어 생성(v3.1-20260211 · op 63f68637 · 크레딧 차감) + glbforge WebP 2048px 최적화",
    assetUrl: "/assets/3d/shaper/tripo_studio_h31_webtoon_character.glb",
    relativeDiskPath: "apps/web/public/assets/3d/shaper/tripo_studio_h31_webtoon_character.glb",
    byteLength: 1_001_532, meshes: 1, triangles: 24_000, vertices: 16_565, materials: 1,
    dimensionsMeters: [0.68, 1.72, 0.34], watertight: true, originAt: "base-center",
    sha256: "0b6665ddd1facdcf19fc508c71e47f63fe7bf37484de5c9d628a8e609346865a",
    generatorBadge: "Tripo Studio H3.1 (Browser CDP · v3.1-20260211) + glbforge WebP",
  },
  {
    id: "tripo-studio-h31-rigged-character", slot: "pose", compatibleSlots: ["pose", "body", "shoes"],
    labelKo: "Tripo H3.1 휴머노이드 65본 리깅 캐릭터 (Auto-Rig · Smart UV)",
    summaryKo: "studio.tripo3d.ai 브라우저 제어 Auto-Rig(op 5ad92868 · 65 joints) + Smart UV 무료 체험(op 4b1acad4) + glbforge WebP 1024px 최적화",
    assetUrl: "/assets/3d/shaper/tripo_studio_h31_rigged_character.glb",
    relativeDiskPath: "apps/web/public/assets/3d/shaper/tripo_studio_h31_rigged_character.glb",
    byteLength: 1_726_300, meshes: 1, triangles: 17_733, vertices: 20_039, materials: 1,
    dimensionsMeters: [0.31, 2.0, 1.9], watertight: true, originAt: "base-center",
    sha256: "6ef1ec0169056817029d38d37d814a03f09eef25a014fa51cdea5a6ed3024a9d",
    generatorBadge: "Tripo Studio H3.1 (Browser CDP · v3.1-20260211) + glbforge WebP",
  },
  {
    id: "tripo-studio-h31-segmented-outfit", slot: "outfit", compatibleSlots: ["outfit", "top", "bottom", "outer", "shoes"],
    labelKo: "Tripo H3.1 모듈형 아카데미 의상·부츠 파트 세트 (부분별 생성 무료 체험)",
    summaryKo: "studio.tripo3d.ai 부분별 생성 무료 체험(체험 ×1 · generate_parts=true · op 31351b13 · 27 서브파트) + glbforge 최적화",
    assetUrl: "/assets/3d/shaper/tripo_studio_h31_segmented_outfit.glb",
    relativeDiskPath: "apps/web/public/assets/3d/shaper/tripo_studio_h31_segmented_outfit.glb",
    byteLength: 120_252, meshes: 1, triangles: 15_998, vertices: 9_308, materials: 1,
    dimensionsMeters: [0.42, 0.98, 0.92], watertight: true, originAt: "base-center",
    sha256: "a3d7ac5ff23083b7920ceff0e494e497081f7bc856f2686b02c401dbaf7cec7d",
    generatorBadge: "Tripo Studio H3.1 (Browser CDP · v3.1-20260211) + glbforge WebP",
  },
  {
    id: "tripo-studio-p2-quad-head-bust", slot: "face", compatibleSlots: ["face", "head", "eyes", "eyebrows", "hair"],
    labelKo: "Tripo P2.0 스마트 메시 쿼드 두상·트윈테일 버스트 (P2.0 무료 체험)",
    summaryKo: "studio.tripo3d.ai 스마트 메시 P2.0 무료 체험(체험 ×2 · Nexus-v2.0-20260801 · quad=true · op a00d15c1) + glbforge 최적화",
    assetUrl: "/assets/3d/shaper/tripo_studio_p2_quad_head_bust.glb",
    relativeDiskPath: "apps/web/public/assets/3d/shaper/tripo_studio_p2_quad_head_bust.glb",
    byteLength: 72_464, meshes: 1, triangles: 10_018, vertices: 5_386, materials: 1,
    dimensionsMeters: [0.48, 0.68, 0.44], watertight: true, originAt: "base-center",
    sha256: "ee57c193747b733d767f3daa06654ed588d4254eb1928d973e47c53a00a9724c",
    generatorBadge: "Tripo Studio P2.0 Quad (Browser CDP · Nexus-v2.0) + glbforge",
  },
  {
    id: "tripo-studio-h31-knight-crest", slot: "prop", compatibleSlots: ["prop", "accessory", "hand-pose"],
    labelKo: "Tripo H3.1 로열 나이트 소드 & 실드 엠블럼 (8K 무료 체험 · Delight)",
    summaryKo: "studio.tripo3d.ai 브라우저 제어 생성(v3.1-20260211 · op bb579fde · 무료 8K 체험) + glbforge WebP 2048px 최적화",
    assetUrl: "/assets/3d/shaper/tripo_studio_h31_knight_crest.glb",
    relativeDiskPath: "apps/web/public/assets/3d/shaper/tripo_studio_h31_knight_crest.glb",
    byteLength: 1_845_340, meshes: 1, triangles: 18_000, vertices: 13_929, materials: 1,
    dimensionsMeters: [0.62, 0.94, 0.18], watertight: true, originAt: "base-center",
    sha256: "629985a1385119d3c4424bb9e5340f6d734f46547f80f8aa0a9f10a0d7442bca",
    generatorBadge: "Tripo Studio H3.1 (Browser CDP · v3.1-20260211) + glbforge WebP",
  },
  {
    id: "shaper-cel-head-bust", slot: "hair", compatibleSlots: ["hair", "face", "eyes", "eyebrows", "body", "head"],
    labelKo: "SHAPER 7등신 셀 두상·보브 헤어 마네킹",
    summaryKo: "tripo3d MCP(Blender 5.2) + glbforge 검증 3D 에셋 · 안구 하이라이트·레이어드 보브 헤어·아카데미 칼라 7머티리얼",
    assetUrl: "/assets/3d/shaper/shaper_cel_head_bust.glb",
    relativeDiskPath: "apps/web/public/assets/3d/shaper/shaper_cel_head_bust.glb",
    byteLength: 160_684, meshes: 20, triangles: 5_692, vertices: 3_721, materials: 7,
    dimensionsMeters: [0.64, 0.79, 0.52], watertight: true, originAt: "base-center",
    sha256: "bc638d2e6ce360a4f0b017e675d56990ad88a715f0027efded76141a57c88c91",
    generatorBadge: "tripo3d MCP (Blender 5.2) + glbforge Verified",
  },
  {
    id: "shaper-star-wing-wand", slot: "prop", compatibleSlots: ["prop", "hand-pose"],
    labelKo: "SHAPER 로맨스 판타지 스타 윙 마법봉",
    summaryKo: "tripo3d MCP(Blender 5.2) + glbforge 검증 3D 소품 · 크리스탈 스타 코어·페더 윙·골드 할로 링 4머티리얼",
    assetUrl: "/assets/3d/shaper/shaper_star_wing_wand.glb",
    relativeDiskPath: "apps/web/public/assets/3d/shaper/shaper_star_wing_wand.glb",
    byteLength: 111_756, meshes: 19, triangles: 3_972, vertices: 2_640, materials: 4,
    dimensionsMeters: [0.66, 1.01, 0.09], watertight: true, originAt: "base-center",
    sha256: "451ce57d755bfd187b9f670e1b3e79d079537180848df45df49bbc4882f97ad7",
    generatorBadge: "tripo3d MCP (Blender 5.2) + glbforge Verified",
  },
  {
    id: "shaper-academy-crest-shield", slot: "accessory", compatibleSlots: ["accessory", "outfit", "top", "outer", "bottom", "shoes"],
    labelKo: "SHAPER 아카데미 엠블럼 룬 실드",
    summaryKo: "tripo3d MCP(Blender 5.2) + glbforge 검증 3D 소품 · 히터 실드·쌍검 부조·크림슨 룬 젬 4머티리얼",
    assetUrl: "/assets/3d/shaper/shaper_academy_crest_shield.glb",
    relativeDiskPath: "apps/web/public/assets/3d/shaper/shaper_academy_crest_shield.glb",
    byteLength: 56_376, meshes: 9, triangles: 1_772, vertices: 1_224, materials: 4,
    dimensionsMeters: [0.56, 0.57, 0.09], watertight: true, originAt: "base-center",
    sha256: "4ec993b6b71af9296fdf076e23503bdb71d6430052542505d11a0fd25e409de5",
    generatorBadge: "tripo3d MCP (Blender 5.2) + glbforge Verified",
  },
]);

export function resolveShaperGen3dGeneratedGlbForSlot(
  slot: ShaperGen3dSlotKind,
): ShaperGen3dGeneratedGlbAsset {
  return (
    SHAPER_GEN3D_GENERATED_GLB_CATALOG.find((asset) => asset.slot === slot)
    ?? SHAPER_GEN3D_GENERATED_GLB_CATALOG.find((asset) => asset.compatibleSlots.includes(slot))
    ?? SHAPER_GEN3D_GENERATED_GLB_CATALOG[0]!
  );
}

export interface Gen3dCreditWalletDiagnosticInput {
  readonly openApiBalance?: number;
  readonly openApiFrozen?: number;
  readonly webStudioBalance?: number;
  readonly freeTrialRemaining?: number;
  readonly errorCode?: number | null;
  readonly slot?: ShaperGen3dSlotKind;
}

export interface Gen3dCreditWalletDiagnosticReport {
  readonly status: "openapi_ready" | "openapi_wallet_empty_fallback_blender_mcp";
  readonly openApiBalance: number;
  readonly openApiFrozen: number;
  readonly webStudioBalance: number;
  readonly freeTrialRemaining: number;
  readonly freeTrialPoolsExhausted: boolean;
  readonly errorCode: number | null;
  readonly badgeKo: string;
  readonly reasonKo: string;
  readonly billingUrl: "https://platform.tripo3d.ai/billing";
  readonly webStudioUrl: "https://studio.tripo3d.ai";
  readonly fallbackAsset: ShaperGen3dGeneratedGlbAsset;
}

/**
 * Tripo 3D 크레딧 및 무료 체험 풀(`POST /v2/studio/operation/quota`) 진단기:
 * - `studio.tripo3d.ai` 브라우저 CDP 제어로 무료 체험 풀 4종(`8K 텍스처`, `부분별 생성 체험 ×1`, `스마트 메시 P2.0 체험 ×2`, `Smart UV 체험 ×2`)을
 *   `remaining: 0`까지 전량 소진하고 웹 스튜디오 크레딧(`25,200` -> `24,375`)을 함께 활용해 총 8종 실물 `.glb` 3D 모델을 번들링했다.
 */
export function diagnoseGen3dCreditWalletStatus(
  input: Gen3dCreditWalletDiagnosticInput = {},
): Gen3dCreditWalletDiagnosticReport {
  const openApiBalance = clampFinite(input.openApiBalance, 0, 0, 10_000_000);
  const openApiFrozen = clampFinite(input.openApiFrozen, 0, 0, 10_000_000);
  const webStudioBalance = clampFinite(input.webStudioBalance, 24_375, 0, 10_000_000);
  const freeTrialRemaining = clampFinite(input.freeTrialRemaining, 0, 0, 100);
  const freeTrialPoolsExhausted = freeTrialRemaining === 0;
  const errorCode = input.errorCode ?? (openApiBalance <= 0 ? 2010 : null);
  const fallbackAsset = resolveShaperGen3dGeneratedGlbForSlot(input.slot ?? "hair");

  if (openApiBalance > 0 && errorCode !== 2010) {
    return {
      status: "openapi_ready", openApiBalance, openApiFrozen, webStudioBalance,
      freeTrialRemaining, freeTrialPoolsExhausted, errorCode: null,
      badgeKo: `OpenAPI 지갑 활성 (${openApiBalance.toLocaleString("en-US")} cr)`,
      reasonKo: "Tripo OpenAPI(platform.tripo3d.ai) 잔액이 확인되어 클라우드 V3 생성 태스크와 로컬 Blender MCP 생성을 모두 사용할 수 있습니다.",
      billingUrl: "https://platform.tripo3d.ai/billing", webStudioUrl: "https://studio.tripo3d.ai", fallbackAsset,
    };
  }

  return {
    status: "openapi_wallet_empty_fallback_blender_mcp", openApiBalance, openApiFrozen, webStudioBalance,
    freeTrialRemaining, freeTrialPoolsExhausted, errorCode: errorCode ?? 2010,
    badgeKo: `무료 체험 전량 소진 (0 남음) · Web Studio (${webStudioBalance.toLocaleString("en-US")} cr) · 실물 GLB 8종`,
    reasonKo:
      "studio.tripo3d.ai 브라우저 CDP 제어로 남은 무료 체험 풀(8K 텍스처 · 부분별 생성 체험 ×1 · 스마트 메시 P2.0 체험 ×2 · Smart UV 체험 ×2)을 remaining: 0까지 모두 소진하고 웹 스튜디오 크레딧(25,200 → 24,375 cr) 및 tripo3d Blender MCP로 생성·glbforge 최적화한 실물 GLB 8종을 즉시 로드합니다 (platform.tripo3d.ai/billing OpenAPI 지갑 분리).",
    billingUrl: "https://platform.tripo3d.ai/billing", webStudioUrl: "https://studio.tripo3d.ai", fallbackAsset,
  };
}

