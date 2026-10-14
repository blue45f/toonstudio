/**
 * creator-analytics-i18n.ts — creatorAnalytics 네임스페이스의 ko/en 사전을
 * 앱 셸 번들에서 분리해 CreatorAnalyticsPage 모듈이 평가될 때 동기 등록한다
 * (번들 2단계, wave7 bundle DESIGN §3). 패턴은 monetization-i18n.ts와 동일:
 * ko 는 registerI18nLocaleEntries, en 은 registerI18nEnglishSourceEntries 로
 * 등록하고, ko/en 외 로케일은 loadAppI18nLocale 가 public 자산에서 가져온다.
 *
 * 배선 계약: creatorAnalytics.* 키의 소비처는 이 analytics 폴더 안 8개 파일
 * 뿐이며 전부 CreatorAnalyticsPage 가 직접 import 한다 (전수 확인 완료 —
 * 폴더 밖의 StudioPublicationOperationsPanel 은 StudioPublicationAnalytics
 * 라는 별개 도메인이라 무관). 페이지가 이 모듈을 side-effect import 하므로
 * 분석 라우트 청크 로드 시점에 첫 렌더보다 먼저 등록된다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";
import { creatorAnalyticsI18nBuiltins } from "./creator-analytics-i18n-builtins";

registerI18nLocaleEntries("ko", creatorAnalyticsI18nBuiltins.ko);
registerI18nEnglishSourceEntries(creatorAnalyticsI18nBuiltins.en);
