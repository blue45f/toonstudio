/**
 * AI 패널 로딩·실패 상태 문구 사전 (A4 트랜치 2).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. UI는 `t(key, fallback)`
 * 형태로 호출하므로 키가 없어도 한국어 폴백 문구가 그대로 노출된다.
 * 정본 패턴은 publish/publish-schedule-i18n.ts와 동일하다.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.aiStatus.clipboardCopyFailed": "클립보드에 복사하지 못했어요. 텍스트를 직접 선택해 복사해 주세요.",
  "studio.aiStatus.errorCategory": "오류 범주",
  "studio.aiStatus.exporting": "내보내는 중…",
  "studio.aiStatus.generatingProposal": "보정 생성 중…",
  "studio.aiStatus.loadingAssets": "에셋 불러오는 중…",
  "studio.aiStatus.loadingProjectAssets": "프로젝트 에셋을 불러오는 중입니다.",
  "studio.aiStatus.loadingProjectImageAssets": "프로젝트 이미지 에셋을 불러오는 중…",
  "studio.aiStatus.noGeneratedImages": "아직 생성된 이미지가 없습니다",
  "studio.aiStatus.noMoreAssetsForRole": "이 역할에 새로 연결할 에셋이 없습니다.",
  "studio.aiStatus.noMoreScenesToAdd": "추가할 수 있는 장면이 없습니다.",
  "studio.aiStatus.noProvenanceMatches": "조건에 맞는 작업이 없습니다",
  "studio.aiStatus.noProvenanceRecords": "아직 기록된 AI 작업이 없습니다",
  "studio.aiStatus.openingRecipeTools": "AI 웹툰 레시피 도구를 여는 중…",
  "studio.aiStatus.provenanceClearFailed": "AI 작업 이력을 비우지 못했어요. 문서 저장 상태를 확인해 주세요.",
  "studio.aiStatus.provenanceExportFailed": "공개용 요약을 내보내지 못했어요. 잠시 후 다시 시도해 주세요.",
  "studio.aiStatus.referenceReadOnly": "읽기 전용 상태에서는 참조를 변경할 수 없습니다.",
  "studio.aiStatus.retryAfterSessionSync": "세션 저장 또는 동기화가 끝난 뒤 다시 시도하세요.",
  "studio.aiStatus.unavailableInCurrentEditState": "현재 편집 상태에서는 사용할 수 없어요.",
});

registerI18nLocaleEntries("en", {
  "studio.aiStatus.clipboardCopyFailed": "Could not copy to the clipboard. Select the text and copy it manually.",
  "studio.aiStatus.errorCategory": "Error category",
  "studio.aiStatus.exporting": "Exporting…",
  "studio.aiStatus.generatingProposal": "Generating correction…",
  "studio.aiStatus.loadingAssets": "Loading assets…",
  "studio.aiStatus.loadingProjectAssets": "Loading project assets.",
  "studio.aiStatus.loadingProjectImageAssets": "Loading project image assets…",
  "studio.aiStatus.noGeneratedImages": "No images generated yet",
  "studio.aiStatus.noMoreAssetsForRole": "No more assets to link to this role.",
  "studio.aiStatus.noMoreScenesToAdd": "No more scenes to add.",
  "studio.aiStatus.noProvenanceMatches": "No work matches these filters",
  "studio.aiStatus.noProvenanceRecords": "No AI work recorded yet",
  "studio.aiStatus.openingRecipeTools": "Opening the AI webtoon recipe tools…",
  "studio.aiStatus.provenanceClearFailed": "Could not clear the AI work history. Check the document save state.",
  "studio.aiStatus.provenanceExportFailed": "Could not export the public summary. Please try again shortly.",
  "studio.aiStatus.referenceReadOnly": "References cannot be changed in read-only state.",
  "studio.aiStatus.retryAfterSessionSync": "Try again after the session save or sync finishes.",
  "studio.aiStatus.unavailableInCurrentEditState": "Not available in the current editing state.",
});
