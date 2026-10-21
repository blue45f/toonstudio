/**
 * 게시 도구 로딩·실패 상태 문구 사전 (A4 트랜치 2).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. UI는 `t(key, fallback)`
 * 형태로 호출하므로 키가 없어도 한국어 폴백 문구가 그대로 노출된다.
 * 정본 패턴은 publish/publish-schedule-i18n.ts와 동일하다.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.publish.status.autoOptimizeFailed": "자동 최적화에 실패했어요. 다시 시도해주세요.",
  "studio.publish.status.noCapturedPages": "캡처된 페이지가 없어요. 범위를 확인해주세요.",
  "studio.publish.status.sliceCreateFailed": "최적화할 슬라이스를 만들지 못했어요.",
});

registerI18nLocaleEntries("en", {
  "studio.publish.status.autoOptimizeFailed": "Auto-optimization failed. Please try again.",
  "studio.publish.status.noCapturedPages": "No captured pages. Check the range.",
  "studio.publish.status.sliceCreateFailed": "Could not create slices to optimize.",
});
