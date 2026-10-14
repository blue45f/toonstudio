/**
 * share-i18n.ts — share 네임스페이스의 ko/en 사전을 앱 셸 번들에서 분리해
 * 공유 다이얼로그 모듈이 평가될 때 동기 등록한다 (번들 3단계,
 * wave7 bundle DESIGN §3).
 *
 * 패턴은 수익화 1단계(monetization-i18n.ts)와 동일하다:
 *  - ko 는 registerI18nLocaleEntries 로 DICT 에 병합한다.
 *  - en 은 registerI18nEnglishSourceEntries 로 등록해 런타임 기계번역의
 *    소스 사전에서도 빠지지 않게 한다 (셸 DICT.en 시드에서 제외된 보정).
 *  - ko/en 외 로케일은 종전과 같이 loadAppI18nLocale 가 public 자산에서
 *    APP_I18N_NAMESPACES 전부를 가져오므로 이 모듈과 무관하게 동작한다.
 *
 * 배선 계약: share.* 키의 소비처는 share-dialog.tsx (대부분)와 이를 감싸는
 * share-button.tsx·share-page-button.tsx 뿐이다 (2026-10-14 실측). 버튼들의
 * 실사용처는 전부 lazy 라우트다 — TitleDetailPage(ShareButton 정적 import),
 * RankingPage(SharePageButton 정적 import), UserProfilePage(share-page-button
 * 동적 import). share-dialog.tsx 가 이 모듈을 side-effect import 하므로
 * 다이얼로그가 어떤 표면에서 열려도 모듈 평가 시점에 등록이 보장된다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";
import { shareI18nBuiltins } from "./share-i18n-builtins";

registerI18nLocaleEntries("ko", shareI18nBuiltins.ko);
registerI18nEnglishSourceEntries(shareI18nBuiltins.en);
