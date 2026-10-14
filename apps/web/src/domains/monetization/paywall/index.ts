/**
 * paywall/index.ts
 *
 * 롤링 페이월 / 얼리 액세스 도메인 공개 API.
 */
// [wave7-stage1 draft] paywall 네임스페이스 ko/en 사전은 앱 셸 번들에서 분리됐다.
// 이 도메인 모듈이 평가될 때 동기 등록되도록 side-effect import 한다.
import "../monetization-i18n";

export * from "./models/paywall-model";
export * from "./models/paywall-store";
export * from "./hooks/use-episode-access";
export { PaywallGate } from "./components/PaywallGate";
export { EarlyAccessBadge } from "./components/EarlyAccessBadge";
export { TitleEarlyAccessNotice } from "./components/TitleEarlyAccessNotice";
export { CreatorEarlyAccessPage } from "./pages/CreatorEarlyAccessPage";
