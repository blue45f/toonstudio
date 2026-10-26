/**
 * SHAPER REA (`com.StudioHORANG.SHAPER` v1.05) × Tripo 3D V3 MCP (`tripo-cli@0.7.3`)
 * 캐릭터 랩 렌더·리깅·텍스처 Delight 브리지.
 *
 * - SHAPER의 `Toony Colors Pro 2` / MatCap 3차 스무스스텝 램프(`computeCubicMatCapRamp`) + 비등방 외곽선과
 *   Tripo 3D Texture `v3.5-20260815` (`delight=true`, 베이크 그림자 제거)를 결합하여
 *   웹툰 셀 셰이더에서 밑색과 실시간 그림자 경계가 겹치지 않도록 보장한다.
 * - SHAPER `BodyData::GetBodyHeight` (`0x06000083`) 5~8등신 비율을 Tripo V3 `v3.1-20260211`의
 *   5-Ratio T-Pose/A-Pose 제어 접미어(`, t-pose:hH:hW:lH:aL:span`)로 변환한다.
 */
import { computeCubicMatCapRamp } from "./toon-reference";

import type { ShadingProfile } from "../contracts";

export type LabShaperTripoLookId =
  | "shaper-cel"
  | "shaper-semi-real"
  | "shaper-romance-soft"
  | "shaper-noir-ink";

export interface LabShaperTripoLookPreset {
  readonly id: LabShaperTripoLookId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly rampSteps: 2 | 3 | 4;
  readonly rim: boolean;
  readonly outline: "none" | "hull" | "edge";
  readonly iblIntensity: number;
  readonly matCapSmoothWidth: number;
  readonly tripoModelVersion: "v3.1-20260211" | "P2-20260801";
  readonly tripoTextureVersion: "v3.5-20260815";
  readonly tripoDelight: boolean;
  readonly tripoAutoRigVersion: "v3.0-20260909";
}

export const LAB_SHAPER_TRIPO_LOOK_PRESETS: readonly LabShaperTripoLookPreset[] = Object.freeze([
  {
    id: "shaper-cel",
    labelKo: "SHAPER 표준 2단 셀 (v3.5 Delight)",
    summaryKo: "구워진 그림자를 제거한 Tripo v3.5 Delight 알베도와 2단 셀 음영·외곽 셸을 결합합니다.",
    rampSteps: 2,
    rim: false,
    outline: "hull",
    iblIntensity: 1.0,
    matCapSmoothWidth: 0.1,
    tripoModelVersion: "v3.1-20260211",
    tripoTextureVersion: "v3.5-20260815",
    tripoDelight: true,
    tripoAutoRigVersion: "v3.0-20260909",
  },
  {
    id: "shaper-semi-real",
    labelKo: "세미리얼 P2 소프트 툰 (4단·IBL)",
    summaryKo: "Tripo P2 쿼드 메쉬와 4단 소프트 램프·림라이트·IBL 반사로 일러스트 입체감을 높입니다.",
    rampSteps: 4,
    rim: true,
    outline: "hull",
    iblIntensity: 1.35,
    matCapSmoothWidth: 0.55,
    tripoModelVersion: "P2-20260801",
    tripoTextureVersion: "v3.5-20260815",
    tripoDelight: true,
    tripoAutoRigVersion: "v3.0-20260909",
  },
  {
    id: "shaper-romance-soft",
    labelKo: "로맨스 판타지 벨벳 (3단·림라이트)",
    summaryKo: "부드러운 3단 MatCap 전이와 따뜻한 림라이트로 로맨스·판타지 주인공 연출에 맞춥니다.",
    rampSteps: 3,
    rim: true,
    outline: "hull",
    iblIntensity: 1.2,
    matCapSmoothWidth: 0.35,
    tripoModelVersion: "v3.1-20260211",
    tripoTextureVersion: "v3.5-20260815",
    tripoDelight: true,
    tripoAutoRigVersion: "v3.0-20260909",
  },
  {
    id: "shaper-noir-ink",
    labelKo: "액션 느와르 하드잉크 (2단·역광 림)",
    summaryKo: "날카로운 2단 셀 경계와 강한 역광 림라이트·엣지 외곽선으로 액션 느와르 컷을 연출합니다.",
    rampSteps: 2,
    rim: true,
    outline: "edge",
    iblIntensity: 0.75,
    matCapSmoothWidth: 0.06,
    tripoModelVersion: "v3.1-20260211",
    tripoTextureVersion: "v3.5-20260815",
    tripoDelight: true,
    tripoAutoRigVersion: "v3.0-20260909",
  },
]);

export function getLabShaperTripoLookPreset(id: LabShaperTripoLookId): LabShaperTripoLookPreset {
  return LAB_SHAPER_TRIPO_LOOK_PRESETS.find((preset) => preset.id === id) ?? LAB_SHAPER_TRIPO_LOOK_PRESETS[0]!;
}

/**
 * 선택된 SHAPER × Tripo 비주얼 프리셋을 현재 `ShadingProfile` 패치로 변환한다.
 */
export function applyLabShaperTripoLookToShading(
  current: ShadingProfile,
  id: LabShaperTripoLookId,
): Partial<ShadingProfile> {
  const preset = getLabShaperTripoLookPreset(id);
  return {
    mode: "toon",
    ibl: {
      ...current.ibl,
      enabled: true,
      intensity: preset.iblIntensity,
    },
    toon: {
      ...current.toon,
      rampSteps: preset.rampSteps,
      rim: preset.rim,
      outline: preset.outline,
    },
  };
}

export interface LabShaperTripoPipelineSpec {
  readonly look: LabShaperTripoLookPreset;
  readonly matCapScaleU: number;
  readonly poseControlSuffix: string;
  readonly delightFlag: boolean;
  readonly pipelineSummaryKo: string;
  readonly cliPreview: string;
}

/**
 * SHAPER 등신비(5~8등신)와 Delight 설정으로부터 Tripo V3 파이프라인 명세를 계산한다.
 */
export function buildLabShaperTripoPipelineSpec(input: {
  readonly lookId: LabShaperTripoLookId;
  readonly headUnits?: number;
  readonly delight?: boolean;
}): LabShaperTripoPipelineSpec {
  const look = getLabShaperTripoLookPreset(input.lookId);
  const heads = typeof input.headUnits === "number" && Number.isFinite(input.headUnits)
    ? Math.min(8.5, Math.max(5.0, input.headUnits))
    : 7.0;
  const headRatio = (Math.round((7.0 / heads) * 10) / 10).toFixed(1);
  const legRatio = heads >= 7.5 ? "1.2" : "1.0";
  const poseControlSuffix = `, t-pose:${headRatio}:1.0:${legRatio}:1.0:9.0`;
  const delightFlag = input.delight ?? look.tripoDelight;
  const ramp = computeCubicMatCapRamp(0.5, look.matCapSmoothWidth);

  return {
    look,
    matCapScaleU: ramp.scaleU,
    poseControlSuffix,
    delightFlag,
    pipelineSummaryKo: `Tripo ${look.tripoModelVersion} → Texture ${look.tripoTextureVersion} (delight=${delightFlag ? "true" : "false"}) → Auto-Rig ${look.tripoAutoRigVersion} (VRM biped)`,
    cliPreview: `pnpm tripo3d:scenario --scenario webtoon-character --model ${look.tripoModelVersion}${delightFlag ? " --delight" : ""}`,
  };
}
