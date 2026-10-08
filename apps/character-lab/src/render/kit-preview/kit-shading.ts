/**
 * 뷰어 셰이딩 결정(순수). 소스 종류별 기본값에 CLI 덮어쓰기(`--ramp-steps`·`--rim`·`--outline`)와 품질 프리셋을 얹어 엔진에 줄 `ShadingProfile`을 만든다.
 *
 * - 키트 소스: 앱의 키트 부팅 기본값(`createKitDefaultRecipe().shading`, 리드 결정 A-10: 툰 램프 2단·림 끔)을 그대로 쓴다.
 *   뷰어가 따로 상수를 두지 않으므로 앱 기본값이 바뀌면 뷰어도 같이 바뀐다.
 * - 패키지(병합) 소스: 기존 동작 그대로 `DEFAULT_SHADING`(램프 3단·림 켬).
 * 덮어쓰기는 두 경로 모두에 같은 의미로 적용된다.
 */
import { DEFAULT_SHADING, applyQualityPreset, createKitDefaultRecipe } from "../../contracts";

import type { KitPreviewQuality, KitPreviewShading, KitPreviewToonOverrides } from "./cli-args";
import type { PreviewSourceKind } from "./kit-plan-adapter";
import type { ShadingProfile } from "../../contracts";

export interface ViewerShadingInput {
  readonly sourceKind: PreviewSourceKind;
  readonly mode: KitPreviewShading;
  readonly quality: KitPreviewQuality;
  readonly toon: KitPreviewToonOverrides;
}

/** 소스 종류별 기본 셰이딩(품질 프리셋 적용 전) */
export function defaultShadingFor(sourceKind: PreviewSourceKind): ShadingProfile {
  return sourceKind === "kit" ? createKitDefaultRecipe().shading : DEFAULT_SHADING;
}

export function resolveViewerShading(input: ViewerShadingInput): ShadingProfile {
  const base = defaultShadingFor(input.sourceKind);
  const toon: ShadingProfile["toon"] = {
    ...base.toon,
    ...(input.toon.rampSteps !== undefined ? { rampSteps: input.toon.rampSteps } : {}),
    ...(input.toon.rim !== undefined ? { rim: input.toon.rim } : {}),
    ...(input.toon.outline !== undefined ? { outline: input.toon.outline } : {}),
  };
  return applyQualityPreset({ ...base, mode: input.mode, toon }, input.quality);
}
