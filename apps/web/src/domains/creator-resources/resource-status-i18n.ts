/**
 * creator-resources 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c05).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (resource-status-i18n-r3c05.test.ts가 패리티를 고정한다).
 *
 * 이 도메인의 상태 문구는 모듈 함수·throw·effect 같은 비컴포넌트 생산자에도
 * 있어 훅을 쓸 수 없으므로, 생산 시점에 현재 로케일로 해석하는
 * `resourceStatusText` 헬퍼를 함께 둔다 (creator/ai의 aiErrorText 선례).
 * 이미 `tx()`(translateCurrentStaticSourceText 정적 원문 등록)로 감싸진
 * 문구는 기존 도메인 패턴이 정본이라 이 사전에 중복 등록하지 않는다.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "resources.status.notebook.storageAccessFailed": "브라우저 저장 공간에 접근할 수 없습니다.",
  "resources.status.notebook.saveFailed": "저장하지 못했습니다. 내보내기로 보관하세요.",
  "resources.status.notebook.importReadFailed": "노트 파일을 읽지 못했습니다.",
  "resources.status.notebook.exportFailed": "파일을 내보내지 못했습니다. 일반 브라우저에서 다시 시도하세요.",
  "resources.status.notebook.saving": "저장 중…",
  "resources.status.notebook.savedNoteEmpty": "아직 이 브라우저에 저장된 기획 노트가 없습니다.",
  "resources.status.notebook.concurrentSaveUnsupported": "이 환경은 안전한 동시 저장을 지원하지 않습니다. Markdown·JSON 내보내기를 이용하세요.",
  "resources.status.atlas.previewFailed": "미리보기를 불러오지 못했습니다",
  "resources.status.atlas.sentToStudio": "\"{title}\" 소재를 스튜디오로 보냈습니다. 새 작업 화면에서 불러오세요.",
  "resources.status.atlas.dropSaveFailed": "소재 전달 정보를 저장하지 못했습니다. 브라우저 저장소를 확인하세요.",
  "resources.status.atlas.exportStartFailed": "파일 내보내기를 시작하지 못했습니다. 브라우저의 다운로드 권한을 확인하세요.",
  "resources.status.atlas.boardLoadFailed": "보드를 불러오지 못했습니다.",
  "resources.status.atlas.linkCopied": "소재 링크를 복사했습니다. 제작 메모는 링크에 포함되지 않습니다.",
  "resources.status.atlas.linkCreatedFallback": "소재 링크를 만들었습니다. 아래 링크 입력란에서 직접 복사하세요. 제작 메모는 포함되지 않습니다.",
  "resources.status.atlas.catalogCheckFailed": "소재 카탈로그를 확인하지 못했습니다.",
  "resources.status.atlas.catalogInvalidStopped": "잘못된 자료를 표시하지 않도록 검색을 중단했습니다. 자료 출처 페이지에서 제공처 원문을 확인하세요.",
  "resources.status.atlas.searchEmpty": "조건에 맞는 소재가 없습니다",
  "resources.status.now.archiveEmpty": "오늘의 영감 아카이브가 비어 있습니다.",
  "resources.status.now.storageWriteFailed": "브라우저 저장 공간에 기록하지 못했습니다. 비공개 모드 또는 저장 용량을 확인하세요.",
  "resources.status.provider.statusCheckFailed": "설정 상태를 확인하지 못했습니다. 검색을 다시 시도하거나 공식 사이트를 확인하세요.",
  "resources.status.provider.statusChecking": "설정 상태 확인 중…",
  "resources.status.referenceDialogs.previewFailed": "이미지 미리보기를 불러오지 못했습니다.",
  "resources.status.referenceAssets.tooManyRequests": "검색 요청이 많습니다. 잠시 후 다시 시도하세요.",
  "resources.status.referenceAssets.serverConnectFailed": "Met 검색 서버에 연결하지 못했습니다.",
  "resources.status.referenceAssets.responseFormatFailed": "검색 응답 형식을 확인하지 못했습니다.",
  "resources.status.referenceAssets.searchTimeout": "검색 시간이 초과되었습니다. 조건을 줄이거나 다시 시도하세요.",
  "resources.status.referenceAssets.searchFailed": "검색하지 못했습니다.",
  "resources.status.referenceAssets.boardLimitReached": "연구 보드는 최대 200개까지 저장할 수 있습니다. 기존 자료를 정리한 뒤 다시 시도하세요.",
  "resources.status.referenceAssets.savedEmpty": "아직 저장한 레퍼런스가 없습니다",
  "resources.status.referenceAssets.filteredEmpty": "현재 결과 필터와 일치하는 자료가 없습니다",
  "resources.status.referenceAssets.verifiedEmpty": "검증해 표시할 자료를 찾지 못했습니다",
  "resources.status.referenceAssets.retry": "다시 시도",
  "resources.status.researchBoard.sourceLimitReached": "노트 하나에 자료를 최대 {limit}개까지 연결할 수 있습니다.",
  "resources.status.researchBoard.backupApplyFailed": "판단 노트 백업을 적용하지 못했습니다.",
  "resources.status.researchBoard.backupReadFailed": "판단 노트 백업을 읽지 못했습니다.",
  "resources.status.researchBoard.notesLoading": "판단 노트를 불러오는 중입니다.",
  "resources.status.researchBoard.sourceSearchEmpty": "검색과 일치하는 저장 자료가 없습니다.",
  "resources.status.researchBoard.sourceEmptyGuide": "먼저 시각 레퍼런스나 판본 자료를 저장하면 판단 노트에 출처를 연결할 수 있습니다.",
  "resources.status.resourceSearch.serverConnectFailed": "검색 서버에 연결하지 못했습니다. 공식 사이트를 이용하거나 다시 시도하세요.",
  "resources.status.resourceSearch.responseFormatFailed": "검색 응답의 형식을 확인하지 못했습니다.",
  "resources.status.resourceSearch.searchTimeout": "검색 시간이 초과되었습니다. 다시 시도하세요.",
  "resources.status.resourceSearch.searchFailed": "검색하지 못했습니다.",
  "resources.status.resourceSearch.temporarilyUnavailable": "일시적으로 이용 불가 · ",
  "resources.status.resourceSearch.savedEmpty": "이 제공처에서 저장한 자료가 없습니다.",
  "resources.status.resourceSearch.resultsEmpty": "현재 검색 범위에 표시할 자료가 없습니다. 다른 검색어 또는 다음 페이지를 확인하세요.",
  "resources.status.resourceSearch.retry": "다시 시도",
  "resources.status.translatedNotice.searchingSuffix": "(으)로 검색 중입니다.",
  "resources.status.wikimedia.previousPeriodEmpty": "비교할 이전 기간 기록이 없습니다",
  "resources.status.nowArchive.inspirationEmpty": "이 조건에 맞는 영감이 아직 없습니다.",
  "resources.status.nowHero.copyFailed": "클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.",
  "resources.status.nowVariation.saveFailed": "변주 선택과 메모를 브라우저에 저장하지 못했습니다. 저장 공간 또는 비공개 모드를 확인하세요.",
  "resources.status.nowVariation.copyFailed": "선택안을 클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.",
  "resources.status.referenceUi.copyFailed": "클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.",
  "resources.status.referenceUi.previewFailed": "미리보기를 불러오지 못했습니다.",
});

registerI18nLocaleEntries("en", {
  "resources.status.notebook.storageAccessFailed": "Could not access the browser storage space.",
  "resources.status.notebook.saveFailed": "Could not save. Export the note to keep it.",
  "resources.status.notebook.importReadFailed": "Could not read the note file.",
  "resources.status.notebook.exportFailed": "Could not export the file. Try again in a regular browser.",
  "resources.status.notebook.saving": "Saving…",
  "resources.status.notebook.savedNoteEmpty": "No planning note has been saved in this browser yet.",
  "resources.status.notebook.concurrentSaveUnsupported": "This environment does not support safe concurrent saving. Use Markdown/JSON export instead.",
  "resources.status.atlas.previewFailed": "Could not load the preview",
  "resources.status.atlas.sentToStudio": "Sent the material \"{title}\" to the studio. Load it from the new work screen.",
  "resources.status.atlas.dropSaveFailed": "Could not save the material handoff information. Check the browser storage.",
  "resources.status.atlas.exportStartFailed": "Could not start the file export. Check the browser's download permission.",
  "resources.status.atlas.boardLoadFailed": "Could not load the board.",
  "resources.status.atlas.linkCopied": "Copied the material link. Production notes are not included in the link.",
  "resources.status.atlas.linkCreatedFallback": "Created the material link. Copy it directly from the link field below. Production notes are not included.",
  "resources.status.atlas.catalogCheckFailed": "Could not verify the material catalog.",
  "resources.status.atlas.catalogInvalidStopped": "Search was stopped so that invalid material is not shown. Check the provider's original text on the source page.",
  "resources.status.atlas.searchEmpty": "No materials match the conditions",
  "resources.status.now.archiveEmpty": "Today's inspiration archive is empty.",
  "resources.status.now.storageWriteFailed": "Could not write to the browser storage space. Check private mode or the storage capacity.",
  "resources.status.provider.statusCheckFailed": "Could not check the configuration status. Try the search again or check the official site.",
  "resources.status.provider.statusChecking": "Checking configuration status…",
  "resources.status.referenceDialogs.previewFailed": "Could not load the image preview.",
  "resources.status.referenceAssets.tooManyRequests": "There are too many search requests. Try again in a moment.",
  "resources.status.referenceAssets.serverConnectFailed": "Could not connect to the Met search server.",
  "resources.status.referenceAssets.responseFormatFailed": "Could not verify the search response format.",
  "resources.status.referenceAssets.searchTimeout": "The search timed out. Narrow the conditions or try again.",
  "resources.status.referenceAssets.searchFailed": "Could not search.",
  "resources.status.referenceAssets.boardLimitReached": "The research board can hold up to 200 items. Remove existing items and try again.",
  "resources.status.referenceAssets.savedEmpty": "No saved references yet",
  "resources.status.referenceAssets.filteredEmpty": "No material matches the current result filters",
  "resources.status.referenceAssets.verifiedEmpty": "No verified material to show was found",
  "resources.status.referenceAssets.retry": "Try again",
  "resources.status.researchBoard.sourceLimitReached": "You can link up to {limit} sources to a single note.",
  "resources.status.researchBoard.backupApplyFailed": "Could not apply the judgment note backup.",
  "resources.status.researchBoard.backupReadFailed": "Could not read the judgment note backup.",
  "resources.status.researchBoard.notesLoading": "Loading judgment notes.",
  "resources.status.researchBoard.sourceSearchEmpty": "No saved sources match the search.",
  "resources.status.researchBoard.sourceEmptyGuide": "Save a visual reference or edition source first, then you can link it as a source in a judgment note.",
  "resources.status.resourceSearch.serverConnectFailed": "Could not connect to the search server. Use the official site or try again.",
  "resources.status.resourceSearch.responseFormatFailed": "Could not verify the format of the search response.",
  "resources.status.resourceSearch.searchTimeout": "The search timed out. Try again.",
  "resources.status.resourceSearch.searchFailed": "Could not search.",
  "resources.status.resourceSearch.temporarilyUnavailable": "Temporarily unavailable · ",
  "resources.status.resourceSearch.savedEmpty": "No material saved from this provider.",
  "resources.status.resourceSearch.resultsEmpty": "No material to show in the current search scope. Try another search term or the next page.",
  "resources.status.resourceSearch.retry": "Try again",
  "resources.status.translatedNotice.searchingSuffix": " is being searched for.",
  "resources.status.wikimedia.previousPeriodEmpty": "No records from a previous period to compare",
  "resources.status.nowArchive.inspirationEmpty": "No inspiration matches these conditions yet.",
  "resources.status.nowHero.copyFailed": "Could not copy to the clipboard. Check the browser permissions.",
  "resources.status.nowVariation.saveFailed": "Could not save the variation selection and memo in the browser. Check the storage space or private mode.",
  "resources.status.nowVariation.copyFailed": "Could not copy the selected option to the clipboard. Check the browser permissions.",
  "resources.status.referenceUi.copyFailed": "Could not copy to the clipboard. Check the browser permissions.",
  "resources.status.referenceUi.previewFailed": "Could not load the preview.",
});

/** 비훅 생산자(모듈 함수·throw·effect)용 상태 문구 리졸버 — aiErrorText 선례와 같은 계약. */
export function resourceStatusText(key: string, koFallback: string): string;
export function resourceStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function resourceStatusText(
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
