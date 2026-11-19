import { getLatestWorkflowPackRuntimeBindings } from "../assistant/use-workflow-pack-runtime-consumer";

import type { WorkflowPackRuntimeBindings } from "../assistant/studio-workflow-pack-runtime-bridge";

export interface Bg3dWorkflowLightingConfig {
  readonly presetId: string;
  readonly displayName: string;
  readonly keyLightColor: string;
  readonly keyLightIntensity: number;
  readonly rimLightIntensity: number;
  readonly ambientColor: string;
  readonly liveInkEdgeThreshold: number;
  readonly shadowSoftness: number;
  readonly lockedByTeamPolicy: boolean;
  readonly sourcePackId: string | null;
}

interface Bg3dLightingPresetSpec {
  readonly displayName: string;
  readonly keyLightColor: string;
  readonly keyLightIntensity: number;
  readonly rimLightIntensity: number;
  readonly ambientColor: string;
  readonly liveInkEdgeThreshold: number;
  readonly shadowSoftness: number;
}

const BG3D_LIGHTING_PRESETS: Readonly<Record<string, Bg3dLightingPresetSpec>> = {
  "palace-golden-hour": {
    displayName: "궁전 골든아워 라이팅",
    keyLightColor: "#ffe4b5",
    keyLightIntensity: 1.35,
    rimLightIntensity: 0.75,
    ambientColor: "#f7d9c4",
    liveInkEdgeThreshold: 0.42,
    shadowSoftness: 0.65,
  },
  "cafe-soft-daylight": {
    displayName: "카페 소프트 데이라이트",
    keyLightColor: "#fffaf0",
    keyLightIntensity: 1.05,
    rimLightIntensity: 0.35,
    ambientColor: "#eef2f6",
    liveInkEdgeThreshold: 0.48,
    shadowSoftness: 0.8,
  },
  "noir-rim-backlit": {
    displayName: "느와르 역광 림 라이팅",
    keyLightColor: "#cbd5e1",
    keyLightIntensity: 1.5,
    rimLightIntensity: 1.25,
    ambientColor: "#1e293b",
    liveInkEdgeThreshold: 0.28,
    shadowSoftness: 0.25,
  },
  "studio-cool-neutral": {
    displayName: "스튜디오 쿨 뉴트럴",
    keyLightColor: "#f1f5f9",
    keyLightIntensity: 1.1,
    rimLightIntensity: 0.45,
    ambientColor: "#e2e8f0",
    liveInkEdgeThreshold: 0.45,
    shadowSoftness: 0.6,
  },
};

const DEFAULT_PRESET_ID = "studio-cool-neutral";

export function isBg3dLightingPresetKnown(presetId: string): boolean {
  return Object.prototype.hasOwnProperty.call(BG3D_LIGHTING_PRESETS, presetId);
}

/**
 * 활성 Workflow Pack v2 런타임 바인딩을 BG3D 뷰포트 라이팅·Live-Ink 파라미터로 변환한다.
 */
export function resolveBg3dLightingConfigFromBindings(
  explicitBindings?: WorkflowPackRuntimeBindings | null,
): Bg3dWorkflowLightingConfig {
  const bindings = explicitBindings ?? getLatestWorkflowPackRuntimeBindings();
  const requestedId = bindings?.bg3dLightingPresetId ?? DEFAULT_PRESET_ID;
  const resolvedId = isBg3dLightingPresetKnown(requestedId) ? requestedId : DEFAULT_PRESET_ID;
  const spec = BG3D_LIGHTING_PRESETS[resolvedId];

  return {
    presetId: resolvedId,
    displayName: spec.displayName,
    keyLightColor: spec.keyLightColor,
    keyLightIntensity: spec.keyLightIntensity,
    rimLightIntensity: spec.rimLightIntensity,
    ambientColor: spec.ambientColor,
    liveInkEdgeThreshold: spec.liveInkEdgeThreshold,
    shadowSoftness: spec.shadowSoftness,
    lockedByTeamPolicy: bindings?.teamPolicyEnforced ?? false,
    sourcePackId: bindings?.packId ?? null,
  };
}
