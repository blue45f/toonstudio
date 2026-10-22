/**
 * 공유 표면·앱 오류·데스크클라우드·기타 도메인의 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c14).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (대응하는 r3c14 테스트가 패리티를 고정한다). 콘텐츠 본문·폼 라벨·
 * placeholder는 대상이 아니며 로딩·실패·빈 상태 문구만 다룬다.
 *
 * 진입 그래프(앱 셸·Studio 첫 청크) 소비 파일이 쓰는 키 4개와 해석 헬퍼는 `./rest-status-i18n-core` 로 옮겼다.
 * 이 모듈은 지연 표면 전용 키 43개만 등록하고 코어를 함께 불러오므로, 지연 소비 파일의 import 경로와 호출은
 * 그대로다. 진입 그래프에 닿는 파일에서는 이 모듈 대신 코어를 import 한다.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

export { restStatusText } from "./rest-status-i18n-core";

registerI18nLocaleEntries("ko", {
  "rest.status.comments.saving": "저장 중...",
  "rest.status.comments.empty": "아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.",
  "rest.status.comments.createFailed": "댓글을 등록하지 못했습니다.",
  "rest.status.comments.updateFailed": "댓글을 수정하지 못했습니다.",
  "rest.status.comments.deleteFailed": "댓글을 삭제하지 못했습니다.",
  "rest.status.comments.likeFailed": "댓글 공감을 처리하지 못했습니다.",
  "rest.status.comments.copyLinkFailed": "댓글 링크를 복사하지 못했습니다. 주소창의 링크를 복사해 주세요.",
  "rest.status.comments.disabled": "현재 이 게시물에는 댓글을 작성할 수 없습니다.",
  "rest.status.comments.closeError": "오류 닫기",
  "rest.status.ranking.apiFailed": "랭킹 API 응답을 받지 못했습니다.",
  "rest.status.ranking.loadFailed": "랭킹을 불러오지 못했습니다.",
  "rest.status.ranking.loadFailedMessage": "연결 상태를 확인한 뒤 다시 시도해 주세요.",
  "rest.status.ranking.emptyFiltered": "해당 조건의 작품이 없습니다.",
  "rest.status.rankingSignal.waiting": "대기 중",
  "rest.status.compare.loading": "작품 비교 불러오는 중",
  "rest.status.compare.loadFailed": "작품 목록을 불러오지 못했어요.",
  "rest.status.compare.loadFailedMessage": "네트워크 상태를 확인한 뒤 다시 시도해 주세요. 작품을 아직 고르지 않은 상태와는 다른, 불러오기 실패 상태입니다.",
  "rest.status.comparePicker.searching": "검색 중",
  "rest.status.comparePicker.noResults": "결과 없음",
  "rest.status.comparePicker.searchPrompt": "비교할 작품을 검색하세요",
  "rest.status.library.emptyShelf": "아직 담은 작품이 없어요",
  "rest.status.library.emptyRated": "평가한 작품이 없어요",
  "rest.status.library.emptySubscriptions": "구독한 연재가 없어요",
  "rest.status.libraryCollections.tooLarge": "공개 링크를 만들기에는 컬렉션이 너무 큽니다. 작품 수를 줄인 뒤 다시 시도해 주세요.",
  "rest.status.libraryCollections.empty": "컬렉션이 없어요",
  "rest.status.recommend.loadFailed": "추천을 불러오지 못했어요. 장르 선택은 그대로 두고 다시 시도할 수 있습니다.",
  "rest.status.recommend.emptyCombo": "이 조합으로는 아직 추천이 없어요",
  "rest.status.availability.linkPreparing": "링크 준비 중",
  "rest.status.hero.platformChecking": "플랫폼 확인 중",
  "rest.status.fanWorks.empty": "아직 팬 창작물이 없어요.",
  "rest.status.browserCompat.title": "최신 브라우저 업데이트가 필요합니다",
  "rest.status.browserCompat.copyFailed": "복사할 수 없어요 — 주소창에서 직접 복사해 주세요",
  "rest.status.feedback.requiredMissing": "필수 항목을 입력해 주세요.",
  "rest.status.feedback.submitFailed": "제출에 실패했어요. 잠시 후 다시 시도해 주세요.",
  "rest.status.feedback.loading": "설문을 불러오는 중…",
  "rest.status.feedback.loadFailed": "설문을 불러오지 못했어요",
  "rest.status.feedback.loadFailedMessage": "네트워크 상태를 확인하고 다시 시도해 주세요.",
  "rest.status.changelog.loadFailed": "소식을 불러오지 못했어요.",
  "rest.status.changelog.empty": "아직 게시된 소식이 없어요.",
  "rest.status.characterInterview.empty": "아직 캐릭터가 없어요. 스토리 바이블에 캐릭터를 먼저 만들면 그 캐릭터와 인터뷰할 수 있어요.",
  "rest.status.characterInterview.groundingMissing": "성격과 말투가 시트에 있어야 인터뷰를 시작할 수 있어요. 비어 있는 항목을 먼저 채워 주세요 — 근거 없는 답은 설정 검증이 되지 않아요.",
  "rest.status.collaboration.creatorsLoadFailed": "협업 가능한 작가를 불러오지 못했어요.",
  "rest.status.collaboration.settingsLoadFailed": "협업 설정을 불러오지 못했어요.",
});

registerI18nLocaleEntries("en", {
  "rest.status.comments.saving": "Saving...",
  "rest.status.comments.empty": "No comments yet. Be the first to leave one.",
  "rest.status.comments.createFailed": "Could not post the comment.",
  "rest.status.comments.updateFailed": "Could not edit the comment.",
  "rest.status.comments.deleteFailed": "Could not delete the comment.",
  "rest.status.comments.likeFailed": "Could not update the comment reaction.",
  "rest.status.comments.copyLinkFailed": "Could not copy the comment link. Copy the link from the address bar.",
  "rest.status.comments.disabled": "Comments are closed on this post.",
  "rest.status.comments.closeError": "Dismiss error",
  "rest.status.ranking.apiFailed": "No response from the ranking API.",
  "rest.status.ranking.loadFailed": "Could not load the ranking.",
  "rest.status.ranking.loadFailedMessage": "Check your connection and try again.",
  "rest.status.ranking.emptyFiltered": "No titles match these filters.",
  "rest.status.rankingSignal.waiting": "Waiting",
  "rest.status.compare.loading": "Loading title comparison",
  "rest.status.compare.loadFailed": "Could not load the title list.",
  "rest.status.compare.loadFailedMessage": "Check your network and try again. This is a loading failure, not an unselected state.",
  "rest.status.comparePicker.searching": "Searching",
  "rest.status.comparePicker.noResults": "No results",
  "rest.status.comparePicker.searchPrompt": "Search for a title to compare",
  "rest.status.library.emptyShelf": "No saved titles yet",
  "rest.status.library.emptyRated": "No rated titles yet",
  "rest.status.library.emptySubscriptions": "No subscribed series yet",
  "rest.status.libraryCollections.tooLarge": "This collection is too large for a public link. Reduce the number of titles and try again.",
  "rest.status.libraryCollections.empty": "No collections yet",
  "rest.status.recommend.loadFailed": "Could not load recommendations. Your genre picks are kept, and you can try again.",
  "rest.status.recommend.emptyCombo": "No recommendations for this combination yet",
  "rest.status.availability.linkPreparing": "Preparing link",
  "rest.status.hero.platformChecking": "Checking platforms",
  "rest.status.fanWorks.empty": "No fan works yet.",
  "rest.status.browserCompat.title": "A newer browser is required",
  "rest.status.browserCompat.copyFailed": "Could not copy — copy it directly from the address bar",
  "rest.status.feedback.requiredMissing": "Please fill in the required fields.",
  "rest.status.feedback.submitFailed": "Submission failed. Please try again in a moment.",
  "rest.status.feedback.loading": "Loading the survey…",
  "rest.status.feedback.loadFailed": "Could not load the survey",
  "rest.status.feedback.loadFailedMessage": "Check your network and try again.",
  "rest.status.changelog.loadFailed": "Could not load the news.",
  "rest.status.changelog.empty": "No news posted yet.",
  "rest.status.characterInterview.empty": "No characters yet. Create a character in the story bible first to interview them.",
  "rest.status.characterInterview.groundingMissing": "Personality and speech style must be on the sheet to start an interview. Fill in the empty fields first — answers without grounding do not validate the setting.",
  "rest.status.collaboration.creatorsLoadFailed": "Could not load creators open to collaboration.",
  "rest.status.collaboration.settingsLoadFailed": "Could not load collaboration settings.",
});
