/**
 * 지연 로드되는 저장 모듈용 AI 표기 판정 사본.
 *
 * studio-bg3d-import-ai-use 는 편집기 활성화 그래프(가져오기 동작)에 있다. 지연 로드되는 저장 모듈이 그 모듈을 값으로 가져오면
 * 번들러가 그 모듈을 활성화 본체 청크에서 떼어 별도 공유 청크로 만들어 활성화 청크 수 상한을 넘긴다. 판정이 몇 줄이라 여기
 * 따로 적고, 원본과 같은 결과라는 것은 표 시험(studio-bg3d-import-ai-use.lazy-copy.test.ts)이 지킨다. 원본을 고치면 여기도
 * 함께 고쳐야 하며, 어긋나면 그 시험이 실패한다.
 *
 * 이 모듈은 의존하는 모듈이 없다(타입만 가져온다).
 */

import type { StudioBg3dImportAiUse, StudioBg3dImportAiUseStatus } from "./studio-bg3d-import-ai-use";

/** studio-bg3d-import-ai-use 의 hasStudioBg3dImportAiUse 와 같은 결과를 낸다. */
export function hasImportAiUseLazy(aiUse: StudioBg3dImportAiUse | undefined): aiUse is StudioBg3dImportAiUse {
  return aiUse?.aiGenerated !== undefined || aiUse?.aiTraining !== undefined;
}

/** studio-bg3d-import-ai-use 의 combineStudioBg3dImportAiUseStatus 와 같은 결과를 낸다. */
export function combineImportAiUseStatusLazy(
  left: StudioBg3dImportAiUseStatus,
  right: StudioBg3dImportAiUseStatus,
): StudioBg3dImportAiUseStatus {
  if (left === "skipped") return right;
  if (right === "skipped") return left;
  if (left === "failed" || right === "failed") return "failed";
  if (left === "cancelled" || right === "cancelled") return "cancelled";
  return left === right ? left : "partial";
}
