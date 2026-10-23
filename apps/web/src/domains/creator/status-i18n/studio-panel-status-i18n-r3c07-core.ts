/**
 * creator 루트 패널 후반부 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c07) — 진입 그래프 코어.
 *
 * 앱 셸·Studio 첫 청크 그래프에 정적으로 들어오는 소비 파일(useStudioSmartShapeEditing.tsx, StudioOnDemandModuleStatus.tsx, studio-mobile-dock-presets.tsx 등 11개)이 쓰는 키 21개와
 * 해석 헬퍼(`r3c07StatusText`)만 등록한다. 나머지 키는 지연 표면 전용이라 원본 모듈
 * (`studio-panel-status-i18n-r3c07`)이 등록하고, 원본이 이 코어를 함께 불러오므로 지연 소비 파일은 원본만 import 해도
 * 전체 키를 얻는다. 진입 그래프 소비 파일은 원본 대신 이 코어를 직접 import 해, 지연 표면 전용 사전 본문이 첫 청크에
 * 묶이지 않게 한다(scripts/check-studio-eager-graph.mjs 금지 목록이 이 경계를 고정한다).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.panelStatus.r3c07.drawingPractice.originalNotFound": "따라 그리기 원본을 찾지 못했어요",
  "studio.panelStatus.r3c07.drawingPractice.originalNotFoundDescription": "내 그림은 그대로 유지됩니다. 같은 원본을 다시 가져오세요.",
  "studio.panelStatus.r3c07.onDemandModule.loadFailed": "창을 불러오지 못했습니다. 캔버스는 유지됩니다.",
  "studio.panelStatus.r3c07.onDemandModule.loading": "요청한 창을 불러오는 중…",
  "studio.panelStatus.r3c07.reliabilityRail.unhandledFailure": "처리하지 못한 실패 있음",
  "studio.panelStatus.r3c07.reliabilityRail.recovered": "실패에서 회복됨",
  "studio.panelStatus.r3c07.reliabilityRail.recoveryUnavailable": "지금은 복구할 수 없습니다. 편집기가 준비된 뒤 다시 시도하세요.",
  "studio.panelStatus.r3c07.toolBeltGroups.documentLocked": "이 문서는 지금 편집할 수 없어요.",
  "studio.panelStatus.r3c07.toolBeltUtility.timelapseBlocked": "마스터 편집 중에는 타임랩스를 녹화할 수 없습니다.",
  "studio.panelStatus.r3c07.toolBeltUtility.timelineBlocked": "마스터 편집 중에는 타임라인을 열 수 없습니다.",
  "studio.panelStatus.r3c07.toolBeltQuickActions.undoEmpty": "되돌릴 이전 작업이 없습니다.",
  "studio.panelStatus.r3c07.toolBeltQuickActions.redoEmpty": "다시 적용할 작업이 없습니다.",
  "studio.panelStatus.r3c07.workflowAccess.openFailed": "도구를 열지 못했어요. 작품 상태를 확인하고 다시 시도해 주세요.",
  "studio.panelStatus.r3c07.workspaceArrangementToolbar.opening": "배치 도구 여는 중…",
  "studio.panelStatus.r3c07.workspaceArrangementToolbar.loadFailed": "배치 도구를 불러오지 못했어요. 다시 눌러 주세요. 현재 원고와 배치는 유지됩니다.",
  "studio.panelStatus.r3c07.workspaceRegion.panelOpening": "패널 도구 여는 중…",
  "studio.panelStatus.r3c07.workspaceRegion.menuLoadFailed": "설정을 불러오지 못했어요.",
  "studio.panelStatus.r3c07.workspaceRegion.menuOpening": "배치 설정 여는 중…",
  "studio.panelStatus.r3c07.mobileDock.panelLoading": "작업 패널 불러오는 중",
  "studio.panelStatus.r3c07.smartShapeEditing.noStroke": "교정할 스트로크가 없어요.",
  "studio.panelStatus.r3c07.smartShapeEditing.locked": "잠긴 원고나 레이어에서는 도형을 교정할 수 없어요.",
});

registerI18nLocaleEntries("en", {
  "studio.panelStatus.r3c07.drawingPractice.originalNotFound": "Could not find the tracing original",
  "studio.panelStatus.r3c07.drawingPractice.originalNotFoundDescription": "Your drawing is kept as is. Import the same original again.",
  "studio.panelStatus.r3c07.onDemandModule.loadFailed": "Could not load the window. The canvas is kept.",
  "studio.panelStatus.r3c07.onDemandModule.loading": "Loading the requested window…",
  "studio.panelStatus.r3c07.reliabilityRail.unhandledFailure": "There is an unhandled failure",
  "studio.panelStatus.r3c07.reliabilityRail.recovered": "Recovered from failure",
  "studio.panelStatus.r3c07.reliabilityRail.recoveryUnavailable": "Recovery is not possible right now. Try again after the editor is ready.",
  "studio.panelStatus.r3c07.toolBeltGroups.documentLocked": "This document cannot be edited right now.",
  "studio.panelStatus.r3c07.toolBeltUtility.timelapseBlocked": "Timelapse cannot be recorded during master editing.",
  "studio.panelStatus.r3c07.toolBeltUtility.timelineBlocked": "The timeline cannot be opened during master editing.",
  "studio.panelStatus.r3c07.toolBeltQuickActions.undoEmpty": "No previous work to undo.",
  "studio.panelStatus.r3c07.toolBeltQuickActions.redoEmpty": "No work to reapply.",
  "studio.panelStatus.r3c07.workflowAccess.openFailed": "Could not open the tool. Check the work status and try again.",
  "studio.panelStatus.r3c07.workspaceArrangementToolbar.opening": "Opening the arrangement tools…",
  "studio.panelStatus.r3c07.workspaceArrangementToolbar.loadFailed": "Could not load the arrangement tools. Press again. Your current manuscript and arrangement are kept.",
  "studio.panelStatus.r3c07.workspaceRegion.panelOpening": "Opening the panel tools…",
  "studio.panelStatus.r3c07.workspaceRegion.menuLoadFailed": "Could not load the settings.",
  "studio.panelStatus.r3c07.workspaceRegion.menuOpening": "Opening the arrangement settings…",
  "studio.panelStatus.r3c07.mobileDock.panelLoading": "Loading the work panel",
  "studio.panelStatus.r3c07.smartShapeEditing.noStroke": "No stroke to correct.",
  "studio.panelStatus.r3c07.smartShapeEditing.locked": "Shapes cannot be corrected on a locked manuscript or layer.",
});

/**
 * 비컴포넌트 생산자용 생산 시점 로케일 해석 헬퍼 (studio-panel-status-i18n-r3c06의
 * `panelStatusText` 선례). 키가 사전에 없으면 koFallback을 그대로 돌려준다.
 * `{token}` 보간은 useT 리졸버와 같은 규약으로 한 번만 치환한다.
 */
export function r3c07StatusText(key: string, koFallback: string): string;
export function r3c07StatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function r3c07StatusText(
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
