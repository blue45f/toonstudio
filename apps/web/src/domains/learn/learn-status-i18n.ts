/**
 * learn 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c12).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (learn-status-i18n-r3c12.test.ts가 패리티를 고정한다).
 * `learnStatusText` 헬퍼는 engagement 선례를 따른다 — 모듈 상수·이벤트
 * 핸들러처럼 훅을 쓸 수 없는 위치에서도 같은 키를 해석한다.
 * 학습 콘텐츠 본문(레슨·용어 설명)과 안내 문구는 상태 문구가 아니라
 * 대상이 아니다 (r3-c12.md 잔여 근거 참조).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "learn.status.content.saveFailed": "이 화면에서 완료했습니다. 저장에 실패했으므로 새로고침 전에 기록을 백업하세요.",
  "learn.status.content.termNotFound": "해당 용어를 찾을 수 없습니다.",
  "learn.status.content.termEmpty": "조건에 맞는 용어가 없습니다.",
  "learn.status.content.lessonsEmpty": "일치하는 강좌가 없습니다.",
  "learn.status.content.pageNotFound": "학습 페이지를 찾을 수 없습니다.",
  "learn.status.classes.saveWarning": "수강 등록 기록을 이 기기에 저장하지 못했습니다. 새로고침하면 등록 내역이 사라질 수 있습니다.",
  "learn.status.classes.walletLoadFailed": "포인트 지갑을 불러오지 못했습니다. 잠시 뒤 다시 시도하세요.",
  "learn.status.classes.enrollFailed": "수강 등록을 완료하지 못했습니다. 잠시 뒤 다시 시도하세요.",
  "learn.status.classroom.planSaveFailed": "이 기기에 수업 계획을 저장하지 못했습니다. 내보내기로 사본을 보관하세요.",
  "learn.status.classroom.planImportFailed": "수업 계획을 가져오지 못했습니다. ToonStudio Classroom JSON 형식을 확인하세요.",
  "learn.status.classroom.assignmentsEmpty": "아직 만든 과제가 없습니다.",
  "learn.status.home.profileSaveFailed": "학습 목표를 기기에 저장하지 못했습니다. 현재 화면에서는 계속 사용할 수 있습니다.",
  "learn.status.home.coursesEmpty": "조건에 맞는 강좌가 없습니다.",
  "learn.status.home.pathNotFound": "학습 경로를 찾을 수 없습니다.",
  "learn.status.linkButton.copyUnavailable": "자동 복사를 사용할 수 없습니다. 아래 링크를 선택해 직접 복사하세요.",
  "learn.status.linkButton.linkCreateFailed": "공유 링크를 만들지 못했습니다. 강좌 주소를 확인하세요.",
  "learn.status.recordTools.backupCreateFailed": "백업 파일을 만들지 못했습니다. 실습 메모를 직접 복사해 보관하세요. 기존 기록은 변경하지 않았습니다.",
  "learn.status.recordTools.backupReadFailed": "백업 파일을 읽지 못했습니다.",
  "learn.status.recordTools.restoreSaveFailed": "복원 내용을 이 화면에 반영했지만 기기에 저장하지 못했습니다. 화면의 저장 경고를 확인하고 백업을 보관하세요.",
  "learn.status.recordTools.saveFailed": "저장하지 못했습니다. 경고를 확인하고 백업 파일을 보관하세요.",
  "learn.status.recordTools.confirmSaveFailed": "그동안 기록이 바뀌었거나 저장하지 못했습니다. 내용을 다시 확인하세요.",
  "learn.status.records.empty": "아직 기록된 학습이 없어요",
  "learn.status.records.multiTabNotice": "여러 탭에서 같은 메모를 동시에 편집하는 공동 작업 기능은 아닙니다. 저장 실패 중 다른 탭의 변경이 감지되면 덮어쓰지 않고 확인을 요청합니다.",
  "learn.status.resources.searching": "검색 중…",
  "learn.status.resources.empty": "조건에 맞는 자료가 없습니다.",
  "learn.status.resources.apiUnavailable": "현재 API 검색을 사용할 수 없습니다. 잠시 후 다시 시도하거나 YouTube 검색으로 이동하세요.",
  "learn.status.resources.youtubeLoadFailed": "검색 결과를 가져오지 못했습니다. 검색어를 바꾸거나 직접 YouTube 검색을 열어보세요.",
});

registerI18nLocaleEntries("en", {
  "learn.status.content.saveFailed": "You completed it on this screen. Saving failed, so back up your record before refreshing.",
  "learn.status.content.termNotFound": "Could not find that term.",
  "learn.status.content.termEmpty": "No terms match your conditions.",
  "learn.status.content.lessonsEmpty": "No lessons match.",
  "learn.status.content.pageNotFound": "Could not find the learning page.",
  "learn.status.classes.saveWarning": "Could not save your enrollment record on this device. Refreshing may lose your enrollment history.",
  "learn.status.classes.walletLoadFailed": "Could not load your point wallet. Please try again shortly.",
  "learn.status.classes.enrollFailed": "Could not complete enrollment. Please try again shortly.",
  "learn.status.classroom.planSaveFailed": "Could not save the class plan on this device. Export a copy to keep it safe.",
  "learn.status.classroom.planImportFailed": "Could not import the class plan. Check that it is in ToonStudio Classroom JSON format.",
  "learn.status.classroom.assignmentsEmpty": "No assignments created yet.",
  "learn.status.home.profileSaveFailed": "Could not save your learning goal on this device. You can keep using it on this screen.",
  "learn.status.home.coursesEmpty": "No lessons match your conditions.",
  "learn.status.home.pathNotFound": "Could not find the learning path.",
  "learn.status.linkButton.copyUnavailable": "Automatic copying is unavailable. Select the link below and copy it directly.",
  "learn.status.linkButton.linkCreateFailed": "Could not create the share link. Check the lesson address.",
  "learn.status.recordTools.backupCreateFailed": "Could not create the backup file. Copy your practice notes directly to keep them. Your existing records were not changed.",
  "learn.status.recordTools.backupReadFailed": "Could not read the backup file.",
  "learn.status.recordTools.restoreSaveFailed": "The restored content is reflected on this screen but could not be saved on this device. Check the save warning on screen and keep your backup.",
  "learn.status.recordTools.saveFailed": "Could not save. Check the warning and keep your backup file.",
  "learn.status.recordTools.confirmSaveFailed": "Your records changed in the meantime or could not be saved. Check the content again.",
  "learn.status.records.empty": "No learning recorded yet",
  "learn.status.records.multiTabNotice": "This is not a co-editing feature for editing the same note in multiple tabs at once. If another tab's change is detected during a save failure, it asks for confirmation instead of overwriting.",
  "learn.status.resources.searching": "Searching…",
  "learn.status.resources.empty": "No resources match your conditions.",
  "learn.status.resources.apiUnavailable": "API search is currently unavailable. Try again shortly or go to YouTube search.",
  "learn.status.resources.youtubeLoadFailed": "Could not load search results. Change your search term or open YouTube search directly.",
});

export function learnStatusText(key: string, koFallback: string): string;
export function learnStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function learnStatusText(
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
