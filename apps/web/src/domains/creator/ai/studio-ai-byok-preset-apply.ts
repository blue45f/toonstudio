/**
 * studio-ai-byok-preset-apply.ts — BYOK 프리셋 적용 (순수 모듈, fetch 없음).
 *
 * 제공자 프리셋(studio-ai-byok-providers.ts)은 데이터만 있고 설정 적용은
 * 호출부의 몫이었다. 이 모듈은 프리셋 선택을 실제 설정(baseUrl +
 * imageModel)으로 바꾼다. "OpenAI 호환"은 프리셋 주소를 쓰고 모델명은
 * 유지하고, "직접 입력"은 기존 주소를 유지하고 모델명만 유지한다.
 * 모르는 프리셋은 설정을 바꾸지 않고 found:false를 돌려준다. 키는
 * 만지지 않는다.
 */

import type { StudioAiByokProviderPreset } from "./studio-ai-byok-providers";

export interface StudioAiByokSettings {
  readonly baseUrl: string;
  readonly imageModel: string;
}

export type StudioAiByokPresetApplyResult =
  | { readonly found: true; readonly settings: StudioAiByokSettings }
  | { readonly found: false; readonly settings: StudioAiByokSettings };

/** 프리셋을 설정에 적용한다. 키·모델명 입력 경로는 기존 배선을 쓴다. */
export function applyByokPreset(
  preset: StudioAiByokProviderPreset | null,
  current: StudioAiByokSettings,
): StudioAiByokPresetApplyResult {
  if (!preset) return { found: false, settings: current };
  if (preset.id === "custom") return { found: true, settings: current };
  return {
    found: true,
    settings: { baseUrl: preset.baseUrl, imageModel: current.imageModel },
  };
}
