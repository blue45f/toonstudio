/**
 * 마케팅 이벤트의 공개 경계 — 다른 도메인이 이벤트 카탈로그·카운트다운·아트워크를
 * 쓸 때는 이 진입점으로만 가져온다(도메인 간 깊은 import 금지 규칙).
 */
export {
  EVENT_STATUS_I18N_KEY,
  MARKETING_EVENTS,
  resolveMarketingEventStatus,
} from "../events/event-catalog";
export type { EventStatus, MarketingEvent } from "../events/event-catalog";
export { formatEventDate, getEventCountdown } from "../events/event-countdown";
export type { EventCountdown } from "../events/event-countdown";
export { EventArtwork } from "../events/EventArtwork";
export { useMarketingEventText } from "../events/marketing-event-copy";
