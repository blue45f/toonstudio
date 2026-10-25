/**
 * studio-ai-byok-wizard-adapter.ts — BYOK 프리셋 → 통합 AI 설정 위저드 변환 어댑터.
 *
 * applyByokPreset()은 레거시 설정 형태({ baseUrl, imageModel })만 돌려주지만,
 * UnifiedAiSettings 위저드는 단일 모델 필드(wizardModel)와 연결 모델
 * (UserAiConnection: textModel·imageModel 분리, apiKeys·models 배열)을 쓴다.
 * 이 어댑터는 그 간극을 메운다: 프리셋 적용 결과의 baseUrl을 위저드 주소로,
 * imageModel을 위저드 모델로 그대로 옮기고, 키·연결 배열은 건드리지 않는다.
 * 실제 UserAiConnection 조립은 위저드의 기존 saveWizardConnection이 맡는다.
 */

import { applyByokPreset } from "./studio-ai-byok-preset-apply";
import {
  findByokProviderPreset,
  STUDIO_AI_BYOK_PROVIDER_PRESETS,
} from "./studio-ai-byok-providers";

export { STUDIO_AI_BYOK_PROVIDER_PRESETS };

export interface StudioAiByokWizardApplyResult {
  readonly found: boolean;
  readonly wizardBaseUrl: string;
  readonly wizardModel: string;
}

/**
 * BYOK 프리셋을 위저드 필드에 적용한다. 모르는 프리셋이면 found:false와
 * 기존 값을 그대로 돌려준다. 키는 절대 만지지 않는다.
 */
export function applyByokPresetToWizard(
  presetId: string,
  current: { readonly baseUrl: string; readonly model: string },
): StudioAiByokWizardApplyResult {
  const preset = findByokProviderPreset(presetId);
  const applied = applyByokPreset(preset, {
    baseUrl: current.baseUrl,
    imageModel: current.model,
  });
  return {
    found: applied.found,
    wizardBaseUrl: applied.settings.baseUrl,
    wizardModel: applied.settings.imageModel,
  };
}
