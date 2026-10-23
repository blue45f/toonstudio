/**
 * auth 잔여 표면의 로딩·실패·확인 중 상태 문구 사전 (A4 잔여 3라운드 c14).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (대응하는 r3c14 테스트가 패리티를 고정한다). 콘텐츠 본문·폼 라벨·
 * placeholder는 대상이 아니며 로딩·실패·빈 상태 문구만 다룬다.
 *
 * 진입 그래프(앱 셸·Studio 첫 청크) 소비 파일이 쓰는 키 1개와 해석 헬퍼는 `./auth-rest-status-i18n-core` 로 옮겼다.
 * 이 모듈은 지연 표면 전용 키 15개만 등록하고 코어를 함께 불러오므로, 지연 소비 파일의 import 경로와 호출은
 * 그대로다. 진입 그래프에 닿는 파일에서는 이 모듈 대신 코어를 import 한다.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

export { authRestStatusText } from "./auth-rest-status-i18n-core";

registerI18nLocaleEntries("ko", {
  "authRest.status.google.browserOnly": "Google 로그인은 브라우저에서만 사용할 수 있어요.",
  "authRest.status.google.moduleLoadFailed": "Google 로그인 모듈을 불러오지 못했어요.",
  "authRest.status.google.moduleNotReady": "Google 로그인 모듈이 준비되지 않았어요.",
  "authRest.status.google.configChanged": "Google 로그인 설정이 변경되어 페이지를 새로고침해야 해요.",
  "authRest.status.google.emptyResponse": "Google 로그인 응답이 비어 있어요. 다시 시도해 주세요.",
  "authRest.status.google.accountCheckFailed": "Google 계정을 확인하지 못했어요. 다시 시도해 주세요.",
  "authRest.status.google.signInFailed": "Google 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
  "authRest.status.google.loadFailed": "Google 로그인을 불러오지 못했어요. 다시 시도해 주세요.",
  "authRest.status.google.preparing": "Google 로그인 준비 중…",
  "authRest.status.google.checkingAccount": "Google 계정 확인 중…",
  "authRest.status.google.retryLoadModule": "Google 로그인 모듈 다시 불러오기",
  "authRest.status.google.retry": "Google로 다시 시도",
  "authRest.status.authMenu.signOutCheckFailed": "로그아웃 확인에 실패했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
  "authRest.status.authMenu.cleaningUp": "실시간 연결 정리 중…",
  "authRest.status.authMenu.signOutRetry": "로그아웃 다시 시도",
});

registerI18nLocaleEntries("en", {
  "authRest.status.google.browserOnly": "Google sign-in is only available in a browser.",
  "authRest.status.google.moduleLoadFailed": "Could not load the Google sign-in module.",
  "authRest.status.google.moduleNotReady": "The Google sign-in module is not ready.",
  "authRest.status.google.configChanged": "Google sign-in settings changed. Refresh the page.",
  "authRest.status.google.emptyResponse": "The Google sign-in response was empty. Please try again.",
  "authRest.status.google.accountCheckFailed": "Could not verify your Google account. Please try again.",
  "authRest.status.google.signInFailed": "Could not complete Google sign-in. Please try again in a moment.",
  "authRest.status.google.loadFailed": "Could not load Google sign-in. Please try again.",
  "authRest.status.google.preparing": "Preparing Google sign-in…",
  "authRest.status.google.checkingAccount": "Verifying your Google account…",
  "authRest.status.google.retryLoadModule": "Reload the Google sign-in module",
  "authRest.status.google.retry": "Try again with Google",
  "authRest.status.authMenu.signOutCheckFailed": "Could not confirm sign-out. Check your connection and try again.",
  "authRest.status.authMenu.cleaningUp": "Closing live connections…",
  "authRest.status.authMenu.signOutRetry": "Retry sign-out",
});
