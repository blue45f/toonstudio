/**
 * 캔버스 첫 화면·GPU 실패·원고 복구 안내와 ICC 도구 로딩에 필요한 상태 문구 31키.
 *
 * ko/en을 동기로 등록하므로 복구 오류 중에도 네트워크를 기다리지 않는다.
 * 나머지 79키는 studio-brush-canvas-status-i18n.ts를 패널과 함께 불러올 때 등록한다.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.brushCanvasStatus.canvas.legacyPigmentConfirm": "이전 혼색 획 · 확인 필요",
  "studio.brushCanvasStatus.canvas.adjustCacheRestoreFailed": "보정 레이어 화면 캐시를 복원하지 못했어요.",
  "studio.brushCanvasStatus.canvas.adjustComputeAtScaleFailed": "요청한 출력 배율에서 보정 레이어를 계산하지 못했어요. 출력 배율을 낮춰 주세요.",
  "studio.brushCanvasStatus.canvas.adjustComputeFailed": "보정 레이어를 계산하지 못했어요.",
  "studio.brushCanvasStatus.canvas.adjustMaskCanvasFailed": "보정 마스크 캔버스를 만들지 못했어요.",
  "studio.brushCanvasStatus.canvas.adjustMaskLoadFailed": "보정 레이어 마스크를 불러오지 못했어요.",
  "studio.brushCanvasStatus.canvas.gpuKeptFrame": "화면을 업데이트하지 못해 마지막으로 표시한 그림을 유지하고 있어요. 아래 버튼으로 다시 시도해 주세요.",
  "studio.brushCanvasStatus.canvas.gpuNotSwitched": "이 브라우저에서 작업 화면을 열지 못했어요. 아래 버튼으로 다시 시도해 주세요.",
  "studio.brushCanvasStatus.canvas.gpuPrepareFailed": "작업 화면을 표시하지 못했어요",
  "studio.brushCanvasStatus.canvas.gpuRetry": "작업 화면 다시 열기",
  "studio.brushCanvasStatus.canvas.noSelectionFit": "선택한 개체가 없어 맞춤 확대를 사용할 수 없습니다.",
  "studio.brushCanvasStatus.canvas.recoveryAutoRestoreFailed": "자동으로 이어 열지 못했어요. 현재 그림은 그대로 유지했어요.",
  "studio.brushCanvasStatus.canvas.recoveryAutoRestoreFailedTitle": "자동으로 이어 열지 못했어요",
  "studio.brushCanvasStatus.canvas.recoveryBlockedUnverified": "안전하게 열 수 있는지 확인하지 못했어요. 먼저 백업 파일을 받아 주세요.",
  "studio.brushCanvasStatus.canvas.recoveryDeletingCheck": "삭제 확인 중…",
  "studio.brushCanvasStatus.canvas.recoveryLoadingHeading": "마지막 작업을 이어 여는 중이에요",
  "studio.brushCanvasStatus.canvas.recoveryOpening": "그림 여는 중…",
  "studio.brushCanvasStatus.canvas.recoveryRequestFailed": "요청을 마치지 못했어요. 다시 시도하거나 백업 파일을 받아 주세요.",
  "studio.brushCanvasStatus.canvas.stickyGoOriginalWork": "원본 작품으로 이동",
  "studio.brushCanvasStatus.canvas.stickyGoUploadEditor": "업로드 편집기로 이동",
  "studio.brushCanvasStatus.canvas.stickyLockedKeptDesc": "빈 캔버스로 덮어쓰지 않도록 잠금을 유지합니다. 다시 불러와 주세요.",
  "studio.brushCanvasStatus.canvas.stickyLockedLoadingDesc": "불러오기가 끝날 때까지 편집·저장·가져오기·내보내기를 잠급니다.",
  "studio.brushCanvasStatus.canvas.stickyLockedUploadDesc": "원본을 보호하기 위해 컷툰 편집을 잠갔습니다. 업로드 편집 화면으로 이동해 주세요.",
  "studio.brushCanvasStatus.canvas.stickyOtherAccountDesc": "이전 계정이나 다른 작품의 캔버스는 표시·내보내지 않습니다.",
  "studio.brushCanvasStatus.canvas.stickyReload": "다시 불러오기",
  "studio.brushCanvasStatus.canvas.stickyRemixLoading": "리믹스 원본을 안전하게 불러오는 중",
  "studio.brushCanvasStatus.canvas.stickyRemixOpenFailed": "리믹스 원본을 열지 못했어요",
  "studio.brushCanvasStatus.canvas.stickySharedOpenFailed": "공동 문서를 열지 못했어요",
  "studio.brushCanvasStatus.canvas.stickyUploadEditorNeeded": "업로드형 작품은 별도 편집기가 필요해요",
  "studio.brushCanvasStatus.canvas.stickyWorkLoading": "원고를 안전하게 불러오는 중",
  "studio.brushCanvasStatus.canvas.stickyWorkOpenFailed": "원고를 열지 못했어요",
  "studio.brushCanvasStatus.color.proofToolOpening": "ICC 도구를 여는 중…",
});

registerI18nLocaleEntries("en", {
  "studio.brushCanvasStatus.canvas.legacyPigmentConfirm": "Earlier pigment stroke · review required",
  "studio.brushCanvasStatus.canvas.adjustCacheRestoreFailed": "Could not restore the adjustment layer display cache.",
  "studio.brushCanvasStatus.canvas.adjustComputeAtScaleFailed": "Could not compute the adjustment layer at the requested output scale. Lower the output scale.",
  "studio.brushCanvasStatus.canvas.adjustComputeFailed": "Could not compute the adjustment layer.",
  "studio.brushCanvasStatus.canvas.adjustMaskCanvasFailed": "Could not create the adjustment mask canvas.",
  "studio.brushCanvasStatus.canvas.adjustMaskLoadFailed": "Could not load the adjustment layer mask.",
  "studio.brushCanvasStatus.canvas.gpuKeptFrame": "The canvas could not update, so the last displayed image is still visible. Use the button below to try again.",
  "studio.brushCanvasStatus.canvas.gpuNotSwitched": "The canvas could not open in this browser. Use the button below to try again.",
  "studio.brushCanvasStatus.canvas.gpuPrepareFailed": "Could not display the canvas",
  "studio.brushCanvasStatus.canvas.gpuRetry": "Reopen canvas",
  "studio.brushCanvasStatus.canvas.noSelectionFit": "No object is selected, so fit zoom is unavailable.",
  "studio.brushCanvasStatus.canvas.recoveryAutoRestoreFailed": "Could not reopen it automatically. Your current drawing was kept as is.",
  "studio.brushCanvasStatus.canvas.recoveryAutoRestoreFailedTitle": "Could not reopen it automatically",
  "studio.brushCanvasStatus.canvas.recoveryBlockedUnverified": "Could not verify that it is safe to open. Download a backup file first.",
  "studio.brushCanvasStatus.canvas.recoveryDeletingCheck": "Checking deletion…",
  "studio.brushCanvasStatus.canvas.recoveryLoadingHeading": "Reopening your last work",
  "studio.brushCanvasStatus.canvas.recoveryOpening": "Opening the drawing…",
  "studio.brushCanvasStatus.canvas.recoveryRequestFailed": "Could not finish the request. Try again or download a backup file.",
  "studio.brushCanvasStatus.canvas.stickyGoOriginalWork": "Go to the original work",
  "studio.brushCanvasStatus.canvas.stickyGoUploadEditor": "Go to the upload editor",
  "studio.brushCanvasStatus.canvas.stickyLockedKeptDesc": "The lock stays on so an empty canvas does not overwrite it. Please load it again.",
  "studio.brushCanvasStatus.canvas.stickyLockedLoadingDesc": "Editing, saving, importing, and exporting stay locked until loading finishes.",
  "studio.brushCanvasStatus.canvas.stickyLockedUploadDesc": "Cuttoon editing is locked to protect the original. Go to the upload editing screen.",
  "studio.brushCanvasStatus.canvas.stickyOtherAccountDesc": "Canvases from a previous account or another work are not shown or exported.",
  "studio.brushCanvasStatus.canvas.stickyReload": "Load again",
  "studio.brushCanvasStatus.canvas.stickyRemixLoading": "Safely loading the remix source",
  "studio.brushCanvasStatus.canvas.stickyRemixOpenFailed": "Could not open the remix source",
  "studio.brushCanvasStatus.canvas.stickySharedOpenFailed": "Could not open the shared document",
  "studio.brushCanvasStatus.canvas.stickyUploadEditorNeeded": "Uploaded works need a separate editor",
  "studio.brushCanvasStatus.canvas.stickyWorkLoading": "Safely loading the manuscript",
  "studio.brushCanvasStatus.canvas.stickyWorkOpenFailed": "Could not open the manuscript",
  "studio.brushCanvasStatus.color.proofToolOpening": "Opening the ICC tool…",
});

/**
 * 비컴포넌트 생산자용 생산 시점 로케일 해석 헬퍼 (studio-ai-error-i18n의
 * `aiErrorText`·studio-vrm-panel-status-i18n의 `vrmPanelStatusText` 선례).
 * 키가 사전에 없으면 koFallback을 그대로 돌려준다. `{token}` 보간은
 * useT 리졸버와 같은 규약으로 한 번만 치환한다.
 */
export function brushCanvasStatusText(key: string, koFallback: string): string;
export function brushCanvasStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function brushCanvasStatusText(
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
