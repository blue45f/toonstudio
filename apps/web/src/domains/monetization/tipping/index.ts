/**
 * tipping/index.ts
 *
 * 에피소드 후원(팁/슈퍼라이크) 도메인 공개 API.
 */
// [wave7-stage1 draft] tipping 네임스페이스 ko/en 사전은 앱 셸 번들에서 분리됐다.
// 이 도메인 모듈이 평가될 때 동기 등록되도록 side-effect import 한다.
import "../monetization-i18n";
import { registerRevenueSourceProvider } from "../revenue/revenue-registry";
import { tipRevenueProvider } from "./models/tip-revenue-provider";

export * from "./models/tip-model";
export * from "./models/tip-store";
export * from "./tipping-api";
export * from "./hooks/use-episode-tips";
export { TipButton } from "./components/TipButton";
export { TipDialog } from "./components/TipDialog";
export { EpisodeTipRanking } from "./components/EpisodeTipRanking";
export { tipRevenueProvider } from "./models/tip-revenue-provider";

// 수익원 레지스트리에 후원 제공자를 등록한다 (수익 대시보드 집계용).
registerRevenueSourceProvider(tipRevenueProvider);
