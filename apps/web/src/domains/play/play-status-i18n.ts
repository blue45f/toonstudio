/**
 * play 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c12).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (play-status-i18n-r3c12.test.ts가 패리티를 고정한다).
 * `playStatusText` 헬퍼는 engagement 선례를 따른다 — 클래스 컴포넌트
 * (PlayGameBoundary)·비컴포넌트 로더(RpsVrmStage)·throw 위치처럼 훅을
 * 쓸 수 없는 곳에서도 같은 키를 해석한다.
 * 게임 본문·홍보 문구·동사형 버튼 라벨은 상태 문구가 아니라 대상이
 * 아니다 (r3-c12.md 잔여 근거 참조).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "play.status.page.contentNotFound": "선택한 콘텐츠를 찾지 못했습니다. 아래에서 다른 창작 도구를 골라 주세요.",
  "play.status.page.searchEmpty": "검색한 콘텐츠가 없어요.",
  "play.status.page.favoritesEmpty": "좋아하는 콘텐츠를 모아 보세요.",
  "play.status.page.footerLoadingNote": "새 창작 콘텐츠는 로딩 후 서버·AI API 호출 없이 실행됩니다. 첫 방문과 아직 열지 않은 도구의 로딩에는 인터넷이 필요합니다. 브라우저 데이터 삭제 시 로컬 초안과 기록도 사라지므로 결과 파일을 보관해 주세요.",
  "play.status.gameStates.loadFailed": "데이터를 불러오지 못했어요.",
  "play.status.gameStates.loadFailedHint": "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  "play.status.gameStates.retry": "다시 불러오기",
  "play.status.fourPanel.unsupportedFile": "지원하지 않는 콘티 파일입니다. 현재 작업은 변경하지 않았습니다.",
  "play.status.fourPanel.openFailed": "파일을 열지 못했습니다. 현재 작업은 유지됩니다.",
  "play.status.lineDojo.saveFailed": "연습 결과를 저장할 수 없습니다. 파일로 보관해 주세요.",
  "play.status.motionPanel.imageLoadFailed": "이미지를 불러오지 못했어요.",
  "play.status.motionPanel.pngSaveFailed": "PNG 저장에 실패했어요. 다른 브라우저나 더 작은 이미지로 다시 시도해 주세요.",
  "play.status.motionPanel.recordSaveFailed": "완료 기록을 저장하지 못했어요. PNG로 결과를 보관해 주세요.",
  "play.status.memory.loadingCards": "웹툰 카드를 불러오는 중",
  "play.status.popularityDuel.loadingData": "웹툰 인기 데이터를 불러오는 중",
  "play.status.quiz.loadingQuestions": "웹툰 문제를 불러오는 중",
  "play.status.roulette.empty": "추천할 웹툰이 없어요.",
  "play.status.roulette.retry": "다시 불러오기",
  "play.status.rps.handNotRecognized": "손을 인식하지 못했어요 — 또렷하게 내봐요!",
  "play.status.rps.cameraLoading": "카메라 준비 중…",
  "play.status.rps.cameraDenied": "카메라 권한이 거부됨 — 버튼으로 플레이하세요",
  "play.status.rps.cameraError": "카메라를 열 수 없어요 — 버튼으로 플레이",
  "play.status.rpsVrm.dataNotFound": "VRM 데이터를 찾지 못했습니다.",
  "play.status.lab.storageUnavailable": "브라우저 저장 공간을 사용할 수 없습니다. 편집은 가능하지만 나가기 전에 파일로 저장해 주세요.",
  "play.status.lab.pngSaveFailed": "PNG 저장 실패. SVG 저장을 사용해 주세요.",
  "play.status.lab.fileSaveUnavailable": "파일 저장을 사용할 수 없습니다. 브라우저 설정을 확인해 주세요.",
  "play.status.boundary.openFailedTitle": "이 콘텐츠를 열지 못했어요.",
  "play.status.boundary.openFailedDescription": "연결이나 브라우저 상태를 확인해 주세요. 저장된 창작 초안은 삭제하지 않습니다.",
  "play.status.boundary.openFailedNote": "처음 실행하는 콘텐츠는 화면 파일을 내려받을 인터넷 연결이 필요합니다.",
});

registerI18nLocaleEntries("en", {
  "play.status.page.contentNotFound": "Could not find the selected content. Choose another creative tool below.",
  "play.status.page.searchEmpty": "No content matches your search.",
  "play.status.page.favoritesEmpty": "Collect your favorite content here.",
  "play.status.page.footerLoadingNote": "New creative content runs without server or AI API calls after loading. Your first visit and loading tools you have not opened yet need the internet. Deleting browser data also removes local drafts and records, so keep your result files safe.",
  "play.status.gameStates.loadFailed": "Could not load the data.",
  "play.status.gameStates.loadFailedHint": "Check your internet connection and try again.",
  "play.status.gameStates.retry": "Load again",
  "play.status.fourPanel.unsupportedFile": "This storyboard file is not supported. Your current work was not changed.",
  "play.status.fourPanel.openFailed": "Could not open the file. Your current work is kept.",
  "play.status.lineDojo.saveFailed": "Could not save your practice result. Keep it as a file.",
  "play.status.motionPanel.imageLoadFailed": "Could not load the image.",
  "play.status.motionPanel.pngSaveFailed": "PNG saving failed. Try again with another browser or a smaller image.",
  "play.status.motionPanel.recordSaveFailed": "Could not save your completion record. Keep the result as a PNG.",
  "play.status.memory.loadingCards": "Loading webtoon cards",
  "play.status.popularityDuel.loadingData": "Loading webtoon popularity data",
  "play.status.quiz.loadingQuestions": "Loading webtoon questions",
  "play.status.roulette.empty": "No webtoons to recommend.",
  "play.status.roulette.retry": "Load again",
  "play.status.rps.handNotRecognized": "Could not recognize your hand — show it clearly!",
  "play.status.rps.cameraLoading": "Preparing camera…",
  "play.status.rps.cameraDenied": "Camera permission denied — play with the buttons",
  "play.status.rps.cameraError": "Could not open the camera — play with the buttons",
  "play.status.rpsVrm.dataNotFound": "Could not find the VRM data.",
  "play.status.lab.storageUnavailable": "Browser storage is unavailable. You can keep editing, but save to a file before leaving.",
  "play.status.lab.pngSaveFailed": "PNG saving failed. Use SVG saving instead.",
  "play.status.lab.fileSaveUnavailable": "File saving is unavailable. Check your browser settings.",
  "play.status.boundary.openFailedTitle": "Could not open this content.",
  "play.status.boundary.openFailedDescription": "Check your connection or browser state. Your saved creative drafts are not deleted.",
  "play.status.boundary.openFailedNote": "Content run for the first time needs an internet connection to download its screen files.",
});

export function playStatusText(key: string, koFallback: string): string;
export function playStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function playStatusText(
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
