/**
 * AI 패널 로딩·실패 상태 문구 사전 (A4 트랜치 2).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. UI는 `t(key, fallback)`
 * 형태로 호출하므로 키가 없어도 한국어 폴백 문구가 그대로 노출된다.
 * 정본 패턴은 publish/publish-schedule-i18n.ts와 동일하다.
 * 3라운드 c11 확장: gen3d 상태 맵·assistHub·복사 상태·episodeProduction 빈 상태·
 * referencePack 빈/한도 상태·provenance 상태 맵·strokeProposal·toonBoard·canon 키와
 * 비컴포넌트 생산자용 `aiStatusText` 헬퍼를 같은 네임스페이스에 이어 붙였다.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

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
  "studio.aiStatus.gen3d.queued": "대기 중",
  "studio.aiStatus.gen3d.uploading": "입력 전송 중",
  "studio.aiStatus.gen3d.generatingGeometry": "형상 생성 중",
  "studio.aiStatus.gen3d.generatingTexture": "재질 생성 중",
  "studio.aiStatus.gen3d.downloading": "결과 수집 중",
  "studio.aiStatus.gen3d.validating": "안전성 검증 중",
  "studio.aiStatus.gen3d.importing": "내부 자산 등록 중",
  "studio.aiStatus.gen3d.ready": "사용 준비 완료",
  "studio.aiStatus.gen3d.failed": "생성 실패",
  "studio.aiStatus.gen3d.cancelled": "취소됨",
  "studio.aiStatus.gen3d.expired": "기한 만료",
  "studio.aiStatus.assistHub.unavailable": "실행 불가",
  "studio.aiStatus.assistHub.failurePolicyLabel": "실패 정책",
  "studio.aiStatus.copy.copied": "복사됨",
  "studio.aiStatus.copy.failed": "복사 실패",
  "studio.aiStatus.episodeProduction.noBlockingIssues": "차단·주의 항목이 없습니다. 첫 생성 묶음을 기존 구도 도구로 넘겨 후속 작업을 이어갈 수 있어요.",
  "studio.aiStatus.referencePack.emptyCharacter": "캐릭터 정체성 참조가 없습니다.",
  "studio.aiStatus.referencePack.emptyMethod": "구도와 연출 참조가 없습니다.",
  "studio.aiStatus.referencePack.emptyStyle": "화풍 참조가 없습니다.",
  "studio.aiStatus.referencePack.providerLimitReached": "AI 제공자 안전 한도 {max}개에 도달했습니다. 기존 참조를 제거한 뒤 추가하세요.",
  "studio.aiStatus.referencePack.roleLimitReached": "{role} 역할은 최대 {max}개까지 연결할 수 있습니다.",
  "studio.aiStatus.referencePack.sameImageOtherRoles": "같은 이미지를 다른 역할에도 의도적으로 연결할 수 있습니다.",
  "studio.aiStatus.referencePack.readOnlyNotice": "읽기 전용 상태입니다. 현재 참조와 지침은 확인할 수 있지만 변경할 수 없습니다.",
  "studio.aiStatus.provenance.statusPending": "진행 중",
  "studio.aiStatus.provenance.statusSucceeded": "완료",
  "studio.aiStatus.provenance.statusFailed": "실패",
  "studio.aiStatus.provenance.statusCancelled": "취소됨",
  "studio.aiStatus.provenance.retriableSuffix": " · 다시 시도 가능",
  "studio.aiStatus.provenance.notRetriableSuffix": " · 자동 재시도 안 함",
  "studio.aiStatus.strokeProposal.documentChanged": "문서가 변경되어 이 보정안은 적용할 수 없습니다. 다시 생성해 주세요.",
  "studio.aiStatus.toonBoard.reviewApproved": "승인됨",
  "studio.aiStatus.toonBoard.reviewFailed": "오류",
  "studio.aiStatus.toonBoard.reviewStale": "재검토",
  "studio.aiStatus.toonBoard.reviewUnapproved": "검토 필요",
  "studio.aiStatus.toonBoard.reviewNotGenerated": "미생성",
  "studio.aiStatus.canon.imageReadFailed": "이미지를 읽지 못했습니다. 다른 파일로 올려 주세요.",
  "studio.aiStatus.canon.imageProcessFailed": "이미지를 처리할 수 없습니다.",
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
  "studio.aiStatus.gen3d.queued": "Queued",
  "studio.aiStatus.gen3d.uploading": "Sending input",
  "studio.aiStatus.gen3d.generatingGeometry": "Generating geometry",
  "studio.aiStatus.gen3d.generatingTexture": "Generating texture",
  "studio.aiStatus.gen3d.downloading": "Collecting results",
  "studio.aiStatus.gen3d.validating": "Verifying safety",
  "studio.aiStatus.gen3d.importing": "Registering internal asset",
  "studio.aiStatus.gen3d.ready": "Ready to use",
  "studio.aiStatus.gen3d.failed": "Generation failed",
  "studio.aiStatus.gen3d.cancelled": "Cancelled",
  "studio.aiStatus.gen3d.expired": "Expired",
  "studio.aiStatus.assistHub.unavailable": "Unavailable",
  "studio.aiStatus.assistHub.failurePolicyLabel": "Failure policy",
  "studio.aiStatus.copy.copied": "Copied",
  "studio.aiStatus.copy.failed": "Copy failed",
  "studio.aiStatus.episodeProduction.noBlockingIssues": "No blocking or caution items. You can hand the first generation batch to the existing composition tools and continue.",
  "studio.aiStatus.referencePack.emptyCharacter": "No character identity references.",
  "studio.aiStatus.referencePack.emptyMethod": "No composition or staging references.",
  "studio.aiStatus.referencePack.emptyStyle": "No art style references.",
  "studio.aiStatus.referencePack.providerLimitReached": "You've reached the AI provider safety limit of {max}. Remove an existing reference before adding another.",
  "studio.aiStatus.referencePack.roleLimitReached": "The {role} role can link up to {max} references.",
  "studio.aiStatus.referencePack.sameImageOtherRoles": "You can intentionally link the same image to other roles too.",
  "studio.aiStatus.referencePack.readOnlyNotice": "This is a read-only state. You can review the current references and guidance, but you can't change them.",
  "studio.aiStatus.provenance.statusPending": "In progress",
  "studio.aiStatus.provenance.statusSucceeded": "Completed",
  "studio.aiStatus.provenance.statusFailed": "Failed",
  "studio.aiStatus.provenance.statusCancelled": "Cancelled",
  "studio.aiStatus.provenance.retriableSuffix": " · Can retry",
  "studio.aiStatus.provenance.notRetriableSuffix": " · No automatic retry",
  "studio.aiStatus.strokeProposal.documentChanged": "The document changed, so this correction can't be applied. Please generate it again.",
  "studio.aiStatus.toonBoard.reviewApproved": "Approved",
  "studio.aiStatus.toonBoard.reviewFailed": "Error",
  "studio.aiStatus.toonBoard.reviewStale": "Re-review",
  "studio.aiStatus.toonBoard.reviewUnapproved": "Review needed",
  "studio.aiStatus.toonBoard.reviewNotGenerated": "Not generated",
  "studio.aiStatus.canon.imageReadFailed": "Could not read the image. Please upload a different file.",
  "studio.aiStatus.canon.imageProcessFailed": "Could not process the image.",
});

/**
 * 비컴포넌트 생산자용 생산 시점 로케일 해석 헬퍼 (studio-panel-status-i18n-r3c06의
 * `panelStatusText` 선례). 키가 사전에 없으면 koFallback을 그대로 돌려준다.
 * `{token}` 보간은 useT 리졸버와 같은 규약으로 한 번만 치환한다.
 */
export function aiStatusText(key: string, koFallback: string): string;
export function aiStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function aiStatusText(
  key: string,
  paramsOrFallback: Readonly<Record<string, string | number>> | string,
  koFallback?: string,
): string {
  const params = typeof paramsOrFallback === "string" ? undefined : paramsOrFallback;
  const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : koFallback ?? "";
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}
