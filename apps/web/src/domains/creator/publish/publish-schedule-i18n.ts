/**
 * 연재 예약 발행 스케줄러 도메인 사전.
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. UI는 `t(key, fallback)`
 * 형태로 호출하므로 키가 없어도 한국어 폴백 문구가 그대로 노출된다.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.publish.schedule.title": "예약 발행",
  "studio.publish.schedule.description":
    "회차별 예약 일시를 정하고 주간 발행 패턴을 관리합니다.",
  "studio.publish.schedule.calendarTitle": "발행 캘린더",
  "studio.publish.schedule.calendarAria": "월간 발행 예약 캘린더",
  "studio.publish.schedule.prevMonth": "이전 달",
  "studio.publish.schedule.nextMonth": "다음 달",
  "studio.publish.schedule.today": "오늘",
  "studio.publish.schedule.newReservation": "새 예약",
  "studio.publish.schedule.editReservation": "예약 수정",
  "studio.publish.schedule.cancelReservation": "예약 취소",
  "studio.publish.schedule.confirmCancel":
    "이 예약을 취소할까요? 취소한 예약은 다시 발행 대기열에 들어가지 않아요.",
  "studio.publish.schedule.retryNow": "지금 재시도",
  "studio.publish.schedule.episode": "회차",
  "studio.publish.schedule.episodePlaceholder": "회차를 선택하세요",
  "studio.publish.schedule.notFound": "예약 정보를 찾을 수 없어요",
  "studio.publish.schedule.date": "발행 날짜",
  "studio.publish.schedule.time": "발행 시각",
  "studio.publish.schedule.timeZone": "타임존",
  "studio.publish.schedule.save": "예약 저장",
  "studio.publish.schedule.close": "닫기",
  "studio.publish.schedule.conflictTitle": "같은 시간대 예약이 있어요",
  "studio.publish.schedule.scheduleAnyway": "그래도 예약",
  "studio.publish.schedule.conflictBody":
    "{title}({time})와 {gap}분 간격이에요. 그래도 예약할까요?",
  "studio.publish.schedule.checklistTitle": "발행 전 체크리스트",
  "studio.publish.schedule.checkThumbnail": "회차 썸네일",
  "studio.publish.schedule.checkMetadata": "제목·시놉시스",
  "studio.publish.schedule.checkPages": "회차 페이지",
  "studio.publish.schedule.checkEpisodeStatus": "회차 준비 상태",
  "studio.publish.schedule.statusScheduled": "예약됨",
  "studio.publish.schedule.statusPublishing": "발행 중",
  "studio.publish.schedule.statusPublished": "발행됨",
  "studio.publish.schedule.statusFailed": "실패",
  "studio.publish.schedule.statusCanceled": "취소됨",
  "studio.publish.schedule.upcomingTitle": "다가오는 예약",
  "studio.publish.schedule.emptyDay": "이 날의 예약이 없어요.",
  "studio.publish.schedule.emptyUpcoming": "예약된 발행이 없어요.",
  "studio.publish.schedule.cadenceTitle": "주간 발행 패턴",
  "studio.publish.schedule.cadenceDescription":
    "요일과 시각을 정하면 다음 발행 예정일을 자동으로 계산해요.",
  "studio.publish.schedule.cadenceTime": "발행 시각",
  "studio.publish.schedule.cadenceNext": "다음 예정일",
  "studio.publish.schedule.errorInvalidTimezone": "타임존을 확인해 주세요.",
  "studio.publish.schedule.errorInvalidDatetime":
    "날짜·시각 형식을 확인해 주세요. (YYYY-MM-DD HH:mm)",
  "studio.publish.schedule.errorPastTime": "이미 지난 시각에는 예약할 수 없어요.",
  "studio.publish.schedule.errorTooSoon":
    "발행 {minutes}분 전까지만 예약할 수 있어요.",
  "studio.publish.schedule.errorTooFar":
    "발행 {days}일 이내의 날짜만 예약할 수 있어요.",
  "studio.publish.schedule.nextRetryAt": "다음 재시도 {time}",
  "studio.publish.schedule.attemptCount": "{count}회 시도",
  "studio.publish.schedule.eventWeek": "이벤트 주간",
  "studio.publish.schedule.eventWeekEvents": "이 주 일정: {events}",
  "studio.publish.schedule.sectionLoading": "예약할 회차를 불러오는 중…",
  "studio.publish.schedule.sectionLoadError":
    "시리즈 회차를 불러오지 못했어요. 예약 발행은 회차 목록이 필요합니다.",
  "studio.publish.schedule.retryLoad": "다시 불러오기",
  "studio.publish.schedule.sectionEmptyEpisodes":
    "예약할 수 있는 회차가 없어요. 게시되지 않은 회차가 생기면 여기서 예약할 수 있습니다.",
  "studio.publish.schedule.localOnlyNotice":
    "예약과 발행 패턴은 지금은 이 브라우저에만 저장됩니다(localStorage). 서버 발행과 자동으로 이어지지 않으니, 예약 시각이 되면 게시 명령 센터에서 직접 게시해 주세요.",
});

registerI18nLocaleEntries("en", {
  "studio.publish.schedule.title": "Scheduled publishing",
  "studio.publish.schedule.description":
    "Set per-episode publish times and manage the weekly release cadence.",
  "studio.publish.schedule.calendarTitle": "Publishing calendar",
  "studio.publish.schedule.calendarAria": "Monthly scheduled-publishing calendar",
  "studio.publish.schedule.prevMonth": "Previous month",
  "studio.publish.schedule.nextMonth": "Next month",
  "studio.publish.schedule.today": "Today",
  "studio.publish.schedule.newReservation": "New reservation",
  "studio.publish.schedule.editReservation": "Edit reservation",
  "studio.publish.schedule.cancelReservation": "Cancel reservation",
  "studio.publish.schedule.confirmCancel":
    "Cancel this reservation? Canceled reservations leave the publish queue.",
  "studio.publish.schedule.retryNow": "Retry now",
  "studio.publish.schedule.episode": "Episode",
  "studio.publish.schedule.episodePlaceholder": "Select an episode",
  "studio.publish.schedule.notFound": "Reservation not found",
  "studio.publish.schedule.date": "Publish date",
  "studio.publish.schedule.time": "Publish time",
  "studio.publish.schedule.timeZone": "Time zone",
  "studio.publish.schedule.save": "Save reservation",
  "studio.publish.schedule.close": "Close",
  "studio.publish.schedule.conflictTitle": "Overlapping reservation",
  "studio.publish.schedule.scheduleAnyway": "Schedule anyway",
  "studio.publish.schedule.conflictBody":
    "{title} ({time}) is {gap} minutes apart. Schedule anyway?",
  "studio.publish.schedule.checklistTitle": "Pre-publish checklist",
  "studio.publish.schedule.checkThumbnail": "Episode thumbnail",
  "studio.publish.schedule.checkMetadata": "Title & synopsis",
  "studio.publish.schedule.checkPages": "Episode pages",
  "studio.publish.schedule.checkEpisodeStatus": "Episode readiness",
  "studio.publish.schedule.statusScheduled": "Scheduled",
  "studio.publish.schedule.statusPublishing": "Publishing",
  "studio.publish.schedule.statusPublished": "Published",
  "studio.publish.schedule.statusFailed": "Failed",
  "studio.publish.schedule.statusCanceled": "Canceled",
  "studio.publish.schedule.upcomingTitle": "Upcoming",
  "studio.publish.schedule.emptyDay": "No reservations on this day.",
  "studio.publish.schedule.emptyUpcoming": "No scheduled publications.",
  "studio.publish.schedule.cadenceTitle": "Weekly cadence",
  "studio.publish.schedule.cadenceDescription":
    "Pick weekdays and a time to auto-compute the next publish dates.",
  "studio.publish.schedule.cadenceTime": "Publish time",
  "studio.publish.schedule.cadenceNext": "Next dates",
  "studio.publish.schedule.errorInvalidTimezone": "Check the time zone.",
  "studio.publish.schedule.errorInvalidDatetime":
    "Check the date/time format. (YYYY-MM-DD HH:mm)",
  "studio.publish.schedule.errorPastTime": "Cannot schedule in the past.",
  "studio.publish.schedule.errorTooSoon":
    "Reservations close {minutes} minutes before publish time.",
  "studio.publish.schedule.errorTooFar":
    "Only dates within {days} days can be scheduled.",
  "studio.publish.schedule.nextRetryAt": "Next retry {time}",
  "studio.publish.schedule.attemptCount": "{count} attempts",
  "studio.publish.schedule.eventWeek": "Event week",
  "studio.publish.schedule.eventWeekEvents": "This week: {events}",
  "studio.publish.schedule.sectionLoading": "Loading episodes to schedule…",
  "studio.publish.schedule.sectionLoadError":
    "Could not load the series episodes. Scheduled publishing needs the episode list.",
  "studio.publish.schedule.retryLoad": "Retry",
  "studio.publish.schedule.sectionEmptyEpisodes":
    "No episodes can be scheduled yet. Unpublished episodes will appear here.",
  "studio.publish.schedule.localOnlyNotice":
    "Reservations and the weekly cadence are currently stored only in this browser (localStorage). They are not connected to server publishing yet, so publish from the command center when the reserved time arrives.",
});
