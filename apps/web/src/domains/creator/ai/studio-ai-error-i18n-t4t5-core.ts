/**
 * AI 진단·구조 채널 에러 문구 사전 (A4 후속 AI 이관 T4+T5) — 진입 그래프 코어.
 *
 * 진입 그래프(Studio 첫 청크)에 닿는 `studio-scenario-image-generation.ts` 가 쓰는 `.scenarioImage.*` 4개 키와
 * 해석 헬퍼 `aiErrorText` 만 등록한다. 나머지 키는 지연 AI 표면 전용이라 본문 `studio-ai-error-i18n-t4t5` 가 등록하고
 * 이 코어를 함께 불러온다. 진입 그래프 소비 파일은 본문 대신 이 코어를 import 해, 지연 표면 전용 사전 본문이 첫 청크에
 * 묶이지 않게 한다(scripts/check-studio-eager-graph.mjs 의 지연 고정 파일 규칙이 이 경계를 고정한다).
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

import { aiErrorText } from "./studio-ai-error-i18n";

export { aiErrorText };

/** 코어가 등록하는 키의 ko 원문 (본문이 전체 KO 를 조립할 때 쓴다). */
export const STUDIO_AI_ERROR_T4T5_CORE_KO = {
  // scenario-image-generation
  "studio.aiError.scenarioImage.referenceAssetsLoading": "AI 참조 에셋을 불러오는 중이에요. 잠시 뒤 다시 시도해 주세요.",
  "studio.aiError.scenarioImage.referenceLimitExceeded": "AI 이미지 참조는 최대 {count}개까지 사용할 수 있어요. 참조 팩에서 일부를 제거해 주세요.",
  "studio.aiError.scenarioImage.referenceAssetsMissing": "연결된 AI 참조 에셋 {count}개를 찾을 수 없어요. 참조 팩에서 제거하거나 에셋을 다시 추가해 주세요.",
  "studio.aiError.scenarioImage.batchLimitExceeded": "한 번에 최대 {count}개까지 생성할 수 있어요. 선택 컷 또는 후보 수를 줄여 나눠 생성해 주세요.",
} as const;

/** 코어가 등록하는 키의 en 번역 (본문이 전체 EN 을 조립할 때 쓴다). */
export const STUDIO_AI_ERROR_T4T5_CORE_EN: Readonly<Record<keyof typeof STUDIO_AI_ERROR_T4T5_CORE_KO, string>> = {
  "studio.aiError.scenarioImage.referenceAssetsLoading": "AI reference assets are still loading. Please try again in a moment.",
  "studio.aiError.scenarioImage.referenceLimitExceeded": "You can use up to {count} AI image references. Remove some from the reference pack.",
  "studio.aiError.scenarioImage.referenceAssetsMissing": "Could not find {count} connected AI reference assets. Remove them from the reference pack or add the assets again.",
  "studio.aiError.scenarioImage.batchLimitExceeded": "You can generate up to {count} at a time. Reduce the selected cuts or candidates and generate in batches.",
};

registerI18nLocaleEntries("ko", STUDIO_AI_ERROR_T4T5_CORE_KO);
registerI18nLocaleEntries("en", STUDIO_AI_ERROR_T4T5_CORE_EN);
