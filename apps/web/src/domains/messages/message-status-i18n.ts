/**
 * messages 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c05).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. 소비 파일은 이 모듈을
 * 직접 import하고 `useT()`의 `t(key, fallback)` 형태로 호출한다
 * (creator/studio-panel-status-i18n 선례와 동일). ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (message-status-i18n-r3c05.test.ts가 패리티를 고정한다).
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "messages.status.request.sendFailed": "메시지 요청을 보내지 못했어요.",
  "messages.status.request.sessionChecking": "로그인 상태 확인 중",
  "messages.status.request.sessionCheckFailed": "로그인 상태를 확인하지 못했어요. 받는 회원과 작성 중인 주소는 유지됩니다.",
  "messages.status.request.recipientNotFound": "받는 회원을 확인할 수 없어요.",
  "messages.status.page.listLoadFailed": "메시지 목록을 불러오지 못했어요.",
  "messages.status.page.detailLoadFailed": "대화를 불러오지 못했어요.",
  "messages.status.page.olderLoadFailed": "이전 메시지를 불러오지 못했어요.",
  "messages.status.page.sendFailed": "메시지를 보내지 못했어요.",
  "messages.status.page.acceptFailed": "메시지 요청을 수락하지 못했어요.",
  "messages.status.page.declineFailed": "메시지 요청을 거절하지 못했어요.",
  "messages.status.page.archiveFailed": "대화를 보관하지 못했어요.",
  "messages.status.page.muteFailed": "알림 설정을 변경하지 못했어요.",
  "messages.status.page.blockFailed": "회원을 차단하지 못했어요.",
  "messages.status.page.reportFailed": "메시지를 신고하지 못했어요.",
  "messages.status.page.pendingSummary": "수락 대기 중인 요청 {pending}개 · 전체 {total}개",
  "messages.status.page.sessionChecking": "로그인 상태 확인 중",
  "messages.status.page.sessionCheckFailed": "로그인 상태를 확인하지 못했어요. 현재 주소는 유지되며 연결이 돌아오면 다시 확인할 수 있습니다.",
  "messages.status.page.noThreadSelectedDescription": "왼쪽 목록에서 대화를 고르면 여기서 이어서 이야기할 수 있어요. 메시지 요청은 수락하기 전까지 추가 메시지가 오지 않습니다.",
  "messages.status.page.blockedPlaceholder": "차단 관계에서는 메시지를 보낼 수 없어요.",
  "messages.status.page.retry": "다시 시도",
  "messages.status.page.retryNetworkGuide": "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
  "messages.status.page.blockedBanner": "차단 관계에서는 새 메시지를 보낼 수 없습니다.",
  "messages.status.settings.loadFailed": "메시지 설정을 불러오지 못했어요.",
  "messages.status.settings.saveFailed": "메시지 설정을 저장하지 못했어요.",
  "messages.status.settings.unblockFailed": "차단을 해제하지 못했어요.",
  "messages.status.settings.loading": "메시지 설정을 불러오는 중",
  "messages.status.settings.blockedEmpty": "차단한 회원이 없습니다.",
  "messages.status.skeletons.threadListLoading": "대화 목록을 불러오는 중",
  "messages.status.skeletons.conversationLoading": "대화를 불러오는 중",
});

registerI18nLocaleEntries("en", {
  "messages.status.request.sendFailed": "Could not send the message request.",
  "messages.status.request.sessionChecking": "Checking sign-in status",
  "messages.status.request.sessionCheckFailed": "Could not check the sign-in status. The recipient and the address you are writing are kept.",
  "messages.status.request.recipientNotFound": "Could not identify the recipient.",
  "messages.status.page.listLoadFailed": "Could not load the message list.",
  "messages.status.page.detailLoadFailed": "Could not load the conversation.",
  "messages.status.page.olderLoadFailed": "Could not load earlier messages.",
  "messages.status.page.sendFailed": "Could not send the message.",
  "messages.status.page.acceptFailed": "Could not accept the message request.",
  "messages.status.page.declineFailed": "Could not decline the message request.",
  "messages.status.page.archiveFailed": "Could not archive the conversation.",
  "messages.status.page.muteFailed": "Could not change the notification setting.",
  "messages.status.page.blockFailed": "Could not block the member.",
  "messages.status.page.reportFailed": "Could not report the message.",
  "messages.status.page.pendingSummary": "{pending} requests awaiting acceptance · {total} in total",
  "messages.status.page.sessionChecking": "Checking sign-in status",
  "messages.status.page.sessionCheckFailed": "Could not check the sign-in status. The current address is kept, and you can check again when the connection returns.",
  "messages.status.page.noThreadSelectedDescription": "Pick a conversation from the list on the left to continue talking here. Message requests do not receive additional messages until they are accepted.",
  "messages.status.page.blockedPlaceholder": "You cannot send messages while blocked.",
  "messages.status.page.retry": "Try again",
  "messages.status.page.retryNetworkGuide": "Check the network status and try again.",
  "messages.status.page.blockedBanner": "You cannot send new messages while blocked.",
  "messages.status.settings.loadFailed": "Could not load the message settings.",
  "messages.status.settings.saveFailed": "Could not save the message settings.",
  "messages.status.settings.unblockFailed": "Could not unblock.",
  "messages.status.settings.loading": "Loading message settings",
  "messages.status.settings.blockedEmpty": "No blocked members.",
  "messages.status.skeletons.threadListLoading": "Loading conversation list",
  "messages.status.skeletons.conversationLoading": "Loading conversation",
});
