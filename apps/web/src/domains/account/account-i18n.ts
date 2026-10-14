/**
 * account-i18n.ts — account·settings·userProfile 네임스페이스의 ko/en 사전을
 * 앱 셸 번들에서 분리해 계정 도메인 페이지 모듈이 평가될 때 동기 등록한다
 * (번들 3단계, wave7 bundle DESIGN §3).
 *
 * 패턴은 수익화 1단계(monetization-i18n.ts)와 동일하다:
 *  - ko 는 registerI18nLocaleEntries 로 DICT 에 병합한다.
 *  - en 은 registerI18nEnglishSourceEntries 로 등록해 런타임 기계번역의
 *    소스 사전에서도 빠지지 않게 한다 (셸 DICT.en 시드에서 제외된 보정).
 *  - ko/en 외 로케일은 종전과 같이 loadAppI18nLocale 가 public 자산에서
 *    APP_I18N_NAMESPACES 전부를 가져오므로 이 모듈과 무관하게 동작한다.
 *
 * 배선 계약: 세 네임스페이스의 소비처는 계정 도메인의 lazy 라우트 페이지뿐임을
 * 전수 확인했다 (2026-10-14, 현재 main 실측).
 *  - account.* — AccountPage.tsx (43키) + DeleteAccountSection.tsx (3키,
 *    SettingsPage 가 import).
 *  - settings.* — SettingsPage.tsx (대부분) + AccountPage.tsx 의
 *    settings.data.cancel 1키.
 *  - userProfile.* — UserProfilePage.tsx (25키 전부).
 * 그래서 AccountPage·SettingsPage·UserProfilePage 세 진입 페이지가 이 모듈을
 * side-effect import 하며, 세 페이지 모두 account.routes.tsx 의 lazyPage 라
 * 셸 정적 그래프에는 들어가지 않는다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";
import { accountI18nBuiltins } from "./account-i18n-builtins";

registerI18nLocaleEntries("ko", accountI18nBuiltins.ko);
registerI18nEnglishSourceEntries(accountI18nBuiltins.en);
