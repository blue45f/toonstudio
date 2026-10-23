/**
 * StudioCuttoonEditorHost 잔여 문구 사전 (A4 이관 3라운드 — 호스트 워크스트림).
 *
 * `studio-host-status-i18n.ts`(배치 2, studio.hostStatus.* 164키)는 배치 2
 * 계약 테스트가 키 개수를 정확히 고정하므로 확장하지 않고, 형제 모듈로
 * 신설한다 (r3c06 형제 모듈 선례와 동일 판단). `registerI18nLocaleEntries`로
 * ko/en 키를 등록하며, ko 값은 이관 전 원문 그대로, en은 충실 번역이고
 * 플레이스홀더({count}·{action}·{scope}·{cutIds})는 양쪽이 일치해야 한다
 * (studio-host-reason-i18n.test.ts가 패리티를 고정한다).
 *
 * 네임스페이스 (전용 분리):
 * - `studio.hostReason.*` — 비활성 사유 라벨 (배치 2 잔여 6군: 획 경로 정리·
 *   필터 대화상자 잠금·댓글 핀 재배치·채우기 대상/문서·필터 적용 불가 사유).
 *   사유는 렌더 시점에 계산되는 반환값·삼항 값이라 호스트의 `t()`로 해석한다.
 * - `studio.hostFillGuide.*` — 채우기 준비 안내 본문 3건 (배치 2 잔여).
 * - `studio.hostLivingInk.*` — 동사가 중첩 삼항으로 바뀌는 Living Ink
 *   템플릿 (배치 2 잔여 2건 + 같은 묶음의 actionLabel·안내 라벨). 동사·범위
 *   라벨을 키로 분리하고 본문은 {action}·{scope} 보간으로 조립해, ko 조립
 *   결과가 이관 전 템플릿과 글자 단위로 같아지게 한다.
 * - `studio.hostError.*` — throw 생산자 채널 10건 (호스트 9 + Production
 *   OperationsControlWorkspace 1). 생산자는 훅이 아니라 생산 시점에 현재
 *   로케일로 해석하는 `hostErrorText`로 문구를 만든다 (AI 이관 T1의
 *   `aiErrorText` 선례 — 설계 rem-item4-ai-throw-design §3.2 안 3).
 *   catch 소비처(`cause.message` 표시)는 무변경이다.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.hostReason.paperVectorSelectFreehand": "자유선 펜 획 하나를 선택하세요.",
  "studio.hostReason.paperVectorStrokeSaving": "획 저장이 끝난 뒤 경로를 정리할 수 있어요.",
  "studio.hostReason.paperVectorSurfaceLocked": "작업면 잠금을 해제한 뒤 경로를 정리하세요.",
  "studio.hostReason.paperVectorStrokeLocked": "선택한 획이나 상위 그룹의 잠금을 해제하세요.",
  "studio.hostReason.paperVectorFreehandOnly": "자유선 펜 획만 경로 정리를 지원해요.",
  "studio.hostReason.paperVectorEraserUnsupported": "지우개 획은 경로 정리를 지원하지 않아요.",
  "studio.hostReason.paperVectorSymmetryPending": "대칭 브러시 결과를 먼저 확정한 뒤 경로를 정리하세요.",
  "studio.hostReason.paperVectorTexturePreserved": "이 브러시는 질감·스탬프 의미를 보존하기 위해 경로 정리를 제한해요.",
  "studio.hostReason.filterTargetMissing": "필터 대상이 현재 페이지에 없습니다. 대화상자를 닫고 다시 선택해 주세요.",
  "studio.hostReason.filterReviewLocked": "검토 잠금을 해제한 뒤 필터를 적용하세요.",
  "studio.hostReason.filterTimelinePlaying": "타임라인 재생을 멈춘 뒤 필터를 적용하세요.",
  "studio.hostReason.filterTimelapseCapturing": "타임랩스 캡처가 끝난 뒤 필터를 적용하세요.",
  "studio.hostReason.filterSaving": "저장이 끝난 뒤 필터를 적용하세요.",
  "studio.hostReason.filterLayerLocked": "이미지와 상위 그룹의 잠금을 해제한 뒤 필터를 적용하세요.",
  "studio.hostReason.commentPinCheckingPermission": "팀 댓글 권한을 확인하고 있어요.",
  "studio.hostReason.commentPinOwnOnly": "자신이 작성한 핀만 옮길 수 있어요.",
  "studio.hostReason.commentPinReadOnly": "읽기 전용 원고에서는 위치를 변경할 수 없어요.",
  "studio.hostReason.fillMasterEditActive": "마스터 편집을 끝낸 뒤 페이지 래스터를 채울 수 있어요.",
  "studio.hostReason.fillReviewLocked": "검토 잠금을 해제한 뒤 채울 수 있어요.",
  "studio.hostReason.fillSelectRasterLayer": "래스터 이미지 레이어를 먼저 선택하세요.",
  "studio.hostReason.fillLayerLocked": "잠긴 레이어는 채울 수 없어요.",
  "studio.hostReason.fillLayerHidden": "숨긴 레이어를 표시한 뒤 채울 수 있어요.",
  "studio.hostReason.fillAnimatedLayer": "애니메이션 레이어는 현재 프레임을 정적 이미지로 만든 뒤 채울 수 있어요.",
  "studio.hostReason.fillTimelinePlaying": "타임라인 재생을 멈춘 뒤 채울 수 있어요.",
  "studio.hostReason.fillReferenceOtherRaster": "표시 중인 다른 래스터를 채우기 참조로 지정하거나 벡터 선화를 추가하세요.",
  "studio.hostReason.fillReferenceCurrentLayerOnly": "대상과 겹치는 다른 표시 래스터나 벡터 선화가 없어 현재 레이어 참조를 사용해야 해요.",
  "studio.hostReason.fillEligibleRastersCount": "채울 수 있는 래스터가 {count}개예요. 레이어에서 하나를 선택하세요.",
  "studio.hostReason.fillNoRasterOrLineArt": "채울 래스터 이미지나 표시 중인 벡터 선화가 없습니다.",
  "studio.hostReason.filterSharedPageCompositePending": "공동 작업 문서의 페이지 합성 필터는 준비 중입니다. 지금은 이미지 레이어를 선택해 필터를 적용하세요.",
  "studio.hostReason.filterMasterSelectImageLayer": "마스터 편집에서는 필터를 적용할 이미지 레이어를 선택하세요.",
  "studio.hostReason.filterAnimatedImage": "애니메이션 이미지는 정적 프레임으로 만든 뒤 필터를 적용하세요.",
  "studio.hostReason.filterHiddenImageLayer": "숨긴 이미지 레이어를 다시 표시한 뒤 필터를 적용하세요.",
  "studio.hostFillGuide.vectorReference": "표시 중인 벡터 선화 {count}개를 참조합니다. 닫힌 영역을 탭하세요. 적용 전까지 문서는 바뀌지 않습니다.",
  "studio.hostFillGuide.emptyPage": "빈 페이지 전체를 채울 준비가 됐어요. 캔버스를 탭하면 가장 아래에 색 레이어를 만들고, 적용 전까지 문서는 바뀌지 않습니다.",
  "studio.hostFillGuide.tapClosedArea": "캔버스의 닫힌 영역을 탭하세요. 적용 전까지는 문서가 바뀌지 않습니다.",
  "studio.hostLivingInk.actionFix": "정착",
  "studio.hostLivingInk.actionClear": "지우기",
  "studio.hostLivingInk.scopeSelection": "선택 영역",
  "studio.hostLivingInk.scopeAll": "전체",
  "studio.hostLivingInk.lockedSaveFailed": "문서가 잠겨 Living Ink {action}를 저장하지 못했습니다.",
  "studio.hostLivingInk.announce": "수채 번짐 · {scope} {action}",
  "studio.hostLivingInk.actionFailed": "수채 번짐 {action}를 완료하지 못했습니다.",
  "studio.hostError.rasterAuthorityScopeChanged": "래스터 서버 승인 범위가 변경되었습니다.",
  "studio.hostError.commentReplyDraftBlocksResolution": "작성 중인 답글을 등록하거나 내용을 비운 뒤 해결 상태를 변경해 주세요.",
  "studio.hostError.sharedDocRequiredCapture": "공동 문서를 불러온 뒤 캡처할 수 있어요.",
  "studio.hostError.sharedDocRequiredTimelapse": "공동 문서를 불러온 뒤 타임랩스를 만들 수 있어요.",
  "studio.hostError.sharedDocRequiredSvg": "공동 문서를 불러온 뒤 SVG로 내보낼 수 있어요.",
  "studio.hostError.sharedDocRequiredVectorPdf": "공동 문서를 불러온 뒤 벡터 PDF로 내보낼 수 있어요.",
  "studio.hostError.sharedDocRequiredInkMl": "공동 문서를 불러온 뒤 InkML로 내보낼 수 있어요.",
  "studio.hostError.sharedDocRequiredWill": "공동 문서를 불러온 뒤 WILL v1으로 내보낼 수 있어요.",
  "studio.hostError.sharedDocRequiredPsd": "공동 문서를 불러온 뒤 PSD로 내보낼 수 있어요.",
  "studio.hostError.duplicateProcessCuts": "이미 같은 공정이 배정된 컷이 있습니다: {cutIds}",
});

registerI18nLocaleEntries("en", {
  "studio.hostReason.paperVectorSelectFreehand": "Select a single freehand pen stroke.",
  "studio.hostReason.paperVectorStrokeSaving": "You can clean up the path after the stroke finishes saving.",
  "studio.hostReason.paperVectorSurfaceLocked": "Unlock the work surface, then clean up the path.",
  "studio.hostReason.paperVectorStrokeLocked": "Unlock the selected stroke or its parent group.",
  "studio.hostReason.paperVectorFreehandOnly": "Only freehand pen strokes support path cleanup.",
  "studio.hostReason.paperVectorEraserUnsupported": "Eraser strokes do not support path cleanup.",
  "studio.hostReason.paperVectorSymmetryPending": "Commit the symmetry brush result first, then clean up the path.",
  "studio.hostReason.paperVectorTexturePreserved": "This brush limits path cleanup to preserve its texture and stamp meaning.",
  "studio.hostReason.filterTargetMissing": "The filter target is not on the current page. Close the dialog and select it again.",
  "studio.hostReason.filterReviewLocked": "Release the review lock, then apply the filter.",
  "studio.hostReason.filterTimelinePlaying": "Stop timeline playback, then apply the filter.",
  "studio.hostReason.filterTimelapseCapturing": "Wait for the timelapse capture to finish, then apply the filter.",
  "studio.hostReason.filterSaving": "Wait for saving to finish, then apply the filter.",
  "studio.hostReason.filterLayerLocked": "Unlock the image and its parent group, then apply the filter.",
  "studio.hostReason.commentPinCheckingPermission": "Checking team comment permissions.",
  "studio.hostReason.commentPinOwnOnly": "You can only move pins you wrote yourself.",
  "studio.hostReason.commentPinReadOnly": "You cannot change positions in a read-only manuscript.",
  "studio.hostReason.fillMasterEditActive": "Finish master editing, then fill the page raster.",
  "studio.hostReason.fillReviewLocked": "Release the review lock, then fill.",
  "studio.hostReason.fillSelectRasterLayer": "Select a raster image layer first.",
  "studio.hostReason.fillLayerLocked": "A locked layer cannot be filled.",
  "studio.hostReason.fillLayerHidden": "Show the hidden layer, then fill it.",
  "studio.hostReason.fillAnimatedLayer": "Turn the current frame of the animated layer into a still image, then fill it.",
  "studio.hostReason.fillTimelinePlaying": "Stop timeline playback, then fill.",
  "studio.hostReason.fillReferenceOtherRaster": "Designate another visible raster as the fill reference or add vector line art.",
  "studio.hostReason.fillReferenceCurrentLayerOnly": "There is no other visible raster or vector line art overlapping the target, so you must use the current layer as the reference.",
  "studio.hostReason.fillEligibleRastersCount": "{count} rasters can be filled. Select one from the layers.",
  "studio.hostReason.fillNoRasterOrLineArt": "There is no raster image to fill or visible vector line art.",
  "studio.hostReason.filterSharedPageCompositePending": "Page composite filters for shared documents are coming soon. For now, select an image layer to apply a filter.",
  "studio.hostReason.filterMasterSelectImageLayer": "In master editing, select an image layer to apply the filter to.",
  "studio.hostReason.filterAnimatedImage": "Turn the animated image into a still frame, then apply the filter.",
  "studio.hostReason.filterHiddenImageLayer": "Show the hidden image layer again, then apply the filter.",
  "studio.hostFillGuide.vectorReference": "Referencing {count} visible vector line-art elements. Tap a closed area. The document does not change until you apply.",
  "studio.hostFillGuide.emptyPage": "Ready to fill the whole empty page. Tap the canvas to create a color layer at the very bottom, and the document does not change until you apply.",
  "studio.hostFillGuide.tapClosedArea": "Tap a closed area on the canvas. The document does not change until you apply it.",
  "studio.hostLivingInk.actionFix": "Fix",
  "studio.hostLivingInk.actionClear": "Clear",
  "studio.hostLivingInk.scopeSelection": "Selection",
  "studio.hostLivingInk.scopeAll": "All",
  "studio.hostLivingInk.lockedSaveFailed": "The document is locked, so the Living Ink {action} could not be saved.",
  "studio.hostLivingInk.announce": "Watercolor bleed · {scope} {action}",
  "studio.hostLivingInk.actionFailed": "The watercolor bleed {action} could not be completed.",
  "studio.hostError.rasterAuthorityScopeChanged": "The raster server approval scope has changed.",
  "studio.hostError.commentReplyDraftBlocksResolution": "Post the reply you are writing, or clear its content, before changing the resolved state.",
  "studio.hostError.sharedDocRequiredCapture": "You can capture after loading the shared document.",
  "studio.hostError.sharedDocRequiredTimelapse": "You can create a timelapse after loading the shared document.",
  "studio.hostError.sharedDocRequiredSvg": "You can export to SVG after loading the shared document.",
  "studio.hostError.sharedDocRequiredVectorPdf": "You can export to a vector PDF after loading the shared document.",
  "studio.hostError.sharedDocRequiredInkMl": "You can export to InkML after loading the shared document.",
  "studio.hostError.sharedDocRequiredWill": "You can export to WILL v1 after loading the shared document.",
  "studio.hostError.sharedDocRequiredPsd": "You can export to PSD after loading the shared document.",
  "studio.hostError.duplicateProcessCuts": "Some cuts are already assigned to the same process: {cutIds}",
});

/**
 * throw 생산 시점 로케일 해석 헬퍼 (`aiErrorText` 선례와 동일 규약).
 * 키가 사전에 없으면 koFallback을 그대로 돌려주므로, 등록 모듈이 로드되지
 * 않은 표면에서도 한국어 원문 표시가 깨지지 않는다. `{token}` 보간은
 * useT 리졸버와 같은 규약(값 안의 중괄호는 재해석하지 않음)으로 한 번만
 * 치환한다.
 */
export function hostErrorText(key: string, koFallback: string): string;
export function hostErrorText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function hostErrorText(
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
