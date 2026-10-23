/**
 * studio-cuttoon-editor·studio-shell 로딩·실패 상태 문구 사전 (A4 잔여 3라운드 c11).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. 소비 파일은 세션 백을 받는
 * 호스트형 컴포넌트라 훅을 새로 얹지 않고, 비컴포넌트 생산자용 생산 시점 해석
 * 헬퍼 `editorShellStatusText(key, fallback)`(studio-panel-status-i18n-r3c06의
 * `panelStatusText` 선례)로 호출한다. 키가 사전에 없으면 koFallback을 그대로
 * 돌려준다. studio-host-status-i18n.ts를 확장하지 않고 형제 모듈로 나눈 근거:
 * batch2 계약이 그 모듈의 등록 키를 정확히 단언한다.
 * 대상 표면: StudioCuttoonEditorDialogs·StudioCuttoonEditorHosts·
 * StudioCuttoonEditorSessionDialogs·StudioCuttoonEditorWorkspace·
 * StudioImportHandoffHost·StudioShellFloatingLayoutManager.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.editorShellStatus.dialogs.quickAccessOpening": "빠른 액세스를 여는 중…",
  "studio.editorShellStatus.dialogs.quickAssemblyOpening": "빠른 웹툰 조립 화면을 여는 중…",
  "studio.editorShellStatus.dialogs.snapshotLibraryOpening": "장면 스냅샷 라이브러리를 여는 중…",
  "studio.editorShellStatus.dialogs.animaticTimelineOpening": "애니매틱 타임라인을 여는 중…",
  "studio.editorShellStatus.dialogs.productionBibleOpening": "제작 바이블을 여는 중…",
  "studio.editorShellStatus.dialogs.dccGateCheckingLabel": "3D 작업 권한을 확인하는 중입니다.",
  "studio.editorShellStatus.dialogs.dccGateCheckFailedLabel": "3D 편집 권한을 확인하지 못했습니다.",
  "studio.editorShellStatus.dialogs.dccGateCheckingDetail": "권한·원고·협업 경계를 확인한 뒤 같은 작품의 3D 작업을 엽니다. 기다리는 동안 캔버스와 로컬 3D 원본은 변경되지 않습니다.",
  "studio.editorShellStatus.dialogs.dccGateDeniedDetail": "이 작품의 3D 원본을 편집할 수 없어 안전하게 캔버스로 돌아갑니다.",
  "studio.editorShellStatus.dialogs.dccModuleLoadingDetail": "편집 권한과 로컬 복구 범위는 확인됐습니다. 무거운 3D 편집 모듈만 불러오는 중입니다.",
  "studio.editorShellStatus.dialogs.dccModuleLoadingLabel": "전문 3D 제작 도구를 여는 중입니다.",
  "studio.editorShellStatus.hosts.recoverySaveFailed": "이 기기에 복구 기록을 저장하지 못했습니다. 편집은 계속할 수 있지만, 탭을 닫기 전에 프로젝트를 저장하거나 완전한 사본을 받아 주세요.",
  "studio.editorShellStatus.session.filterTargetMissing": "필터 대상 이미지가 현재 페이지에 없습니다. 다시 선택해 주세요.",
  "studio.editorShellStatus.session.filterSelectAreaFirst": "필터를 적용할 픽셀 영역을 먼저 선택하세요.",
  "studio.editorShellStatus.session.filterMaskCreateFailed": "선택 영역 필터 마스크를 만들지 못했습니다.",
  "studio.editorShellStatus.session.filterLayerApplyFailed": "페이지 필터 레이어를 적용하지 못했습니다.",
  "studio.editorShellStatus.workspace.brushLibraryOpening": "브러시 라이브러리를 여는 중…",
  "studio.editorShellStatus.importHandoff.handoffExpired": "가져올 파일 전달이 만료되었거나 새로고침으로 사라졌습니다. 파일을 다시 선택해 주세요.",
  "studio.editorShellStatus.importHandoff.importStartFailed": "파일 가져오기를 시작하지 못했습니다.",
  "studio.editorShellStatus.floatingLayout.storageChecking": "설정 저장소 확인 중",
});

registerI18nLocaleEntries("en", {
  "studio.editorShellStatus.dialogs.quickAccessOpening": "Opening quick access…",
  "studio.editorShellStatus.dialogs.quickAssemblyOpening": "Opening the quick webtoon assembly screen…",
  "studio.editorShellStatus.dialogs.snapshotLibraryOpening": "Opening the scene snapshot library…",
  "studio.editorShellStatus.dialogs.animaticTimelineOpening": "Opening the animatic timeline…",
  "studio.editorShellStatus.dialogs.productionBibleOpening": "Opening the production bible…",
  "studio.editorShellStatus.dialogs.dccGateCheckingLabel": "Checking 3D work permissions.",
  "studio.editorShellStatus.dialogs.dccGateCheckFailedLabel": "Could not verify 3D editing permissions.",
  "studio.editorShellStatus.dialogs.dccGateCheckingDetail": "After checking permissions, the manuscript, and collaboration boundaries, the 3D work for this title opens. The canvas and local 3D originals stay unchanged while you wait.",
  "studio.editorShellStatus.dialogs.dccGateDeniedDetail": "You can't edit this title's 3D originals, so you'll return safely to the canvas.",
  "studio.editorShellStatus.dialogs.dccModuleLoadingDetail": "Editing permissions and the local recovery scope are confirmed. Only the heavy 3D editing module is still loading.",
  "studio.editorShellStatus.dialogs.dccModuleLoadingLabel": "Opening the professional 3D creation tools.",
  "studio.editorShellStatus.hosts.recoverySaveFailed": "Could not save a recovery record on this device. You can keep editing, but save the project or download a complete copy before closing the tab.",
  "studio.editorShellStatus.session.filterTargetMissing": "The filter target image isn't on the current page. Please select it again.",
  "studio.editorShellStatus.session.filterSelectAreaFirst": "Select the pixel area to filter first.",
  "studio.editorShellStatus.session.filterMaskCreateFailed": "Could not create the selection filter mask.",
  "studio.editorShellStatus.session.filterLayerApplyFailed": "Could not apply the page filter layer.",
  "studio.editorShellStatus.workspace.brushLibraryOpening": "Opening the brush library…",
  "studio.editorShellStatus.importHandoff.handoffExpired": "The import file handoff expired or was lost on refresh. Please choose the file again.",
  "studio.editorShellStatus.importHandoff.importStartFailed": "Could not start the file import.",
  "studio.editorShellStatus.floatingLayout.storageChecking": "Checking the settings storage",
});

/**
 * 비컴포넌트 생산자용 생산 시점 로케일 해석 헬퍼 (studio-panel-status-i18n-r3c06의
 * `panelStatusText` 선례). 키가 사전에 없으면 koFallback을 그대로 돌려준다.
 * `{token}` 보간은 useT 리졸버와 같은 규약으로 한 번만 치환한다.
 */
export function editorShellStatusText(key: string, koFallback: string): string;
export function editorShellStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function editorShellStatusText(
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
