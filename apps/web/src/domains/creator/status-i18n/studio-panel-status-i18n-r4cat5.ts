/**
 * creator 루트 패널 상태 문구 사전 후속분 (A4 4라운드 cat5 재판정 이관).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (studio-status-i18n-r4cat5.test.ts가 패리티를 고정한다).
 * studio-panel-status-i18n.ts(배치 1)를 확장하지 않고 형제 모듈로 나눈
 * 근거: 배치 1 테스트가 그 모듈의 등록 키 개수를 정확히 단언한다.
 * 파일명을 r4cat5로 구분한 근거: studio-panel-status-i18n-r4.ts는 같은
 * 라운드의 다른 워크스트림(GUARDED 제외 5파일) 소유다.
 * 네임스페이스는 studio.panelStatusCat5.*로 분리한다: 소비 파일이 배치 1
 * 테스트의 dangling 검사 대상이라, 같은 studio.panelStatus.* 접두를 쓰면
 * 형제 모듈 키가 미등록 참조로 잡힌다 (실측으로 확인한 제약).
 *
 * 대상은 4라운드 cat5 재판정에서 상태 문구로 확정된 3건이다:
 * - StudioCommunityMarketplaceLifecycle의 관리자 숨김 상태 배너 2건
 *   (릴리스 상태에 따라 조건부로 렌더되는 bad 톤 안내 — 정적 본문과 달리
 *   현재 상태를 설명하는 상태 문구로 재판정).
 * - StudioSelectionWorkbenchPanel의 저장된 선택 빈 상태 안내 1건
 *   (목록이 비었을 때만 렌더되는 빈 상태 문구 — 분기 쌍 전체를 함께 이관).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.panelStatusCat5.marketplaceLifecycle.hiddenDelistedNotice": "이 head는 관리자 숨김과 목록 내림 상태입니다. 관리자 숨김이 해제되기 전에는 다시 공개하거나 새 릴리스를 게시할 수 없습니다.",
  "studio.panelStatusCat5.marketplaceLifecycle.hiddenDelistableNotice": "관리자 숨김 중에도 이 head를 목록에서 내릴 수 있습니다. 숨김이 해제되기 전에는 다시 공개하거나 새 릴리스를 게시할 수 없습니다.",
  "studio.panelStatusCat5.selectionWorkbench.savedSelectionsEmptyWithArchive": "자주 다시 쓰는 선택을 이름으로 저장하세요. 작품 자동저장과 프로젝트 아카이브에 함께 보존됩니다.",
  "studio.panelStatusCat5.selectionWorkbench.savedSelectionsEmptyLocalOnly": "자주 다시 쓰는 선택 경계를 이름으로 저장해 두세요. 프로젝트 데이터에는 포함되지 않습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.panelStatusCat5.marketplaceLifecycle.hiddenDelistedNotice": "This head is hidden by an admin and delisted. It cannot be made public again or published as a new release until the admin hide is lifted.",
  "studio.panelStatusCat5.marketplaceLifecycle.hiddenDelistableNotice": "Even while hidden by an admin, this head can be delisted. It cannot be made public again or published as a new release until the hide is lifted.",
  "studio.panelStatusCat5.selectionWorkbench.savedSelectionsEmptyWithArchive": "Save selections you reuse often under a name. They are kept with your work autosave and project archives.",
  "studio.panelStatusCat5.selectionWorkbench.savedSelectionsEmptyLocalOnly": "Save selection boundaries you reuse often under a name. They are not included in project data.",
});

export function panelStatusCat5Text(key: string, koFallback: string): string;
export function panelStatusCat5Text(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function panelStatusCat5Text(
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
