/**
 * monetization-i18n.ts — 수익화 네임스페이스(membership·paywall·revenue·tipping)의
 * ko/en 사전을 앱 셸 번들에서 분리해 이 도메인 모듈이 평가될 때 동기 등록한다.
 *
 * 배경: 이 네임스페이스는 원래 i18n-app-builtins.json(앱 진입 청크)에 컴파일돼
 * 모든 페이지가 내려받았다. Admin 스코프가 이미 쓰는 패턴(admin-i18n-loader.ts)을
 * 그대로 따른다:
 *  - ko 는 registerI18nLocaleEntries 로 DICT 에 병합한다.
 *  - en 은 registerI18nEnglishSourceEntries 로 등록해 런타임 기계번역의
 *    소스 사전에서도 빠지지 않게 한다 (셸 DICT.en 시드에서 제외된 보정).
 *  - ko/en 외 로케일은 종전과 같이 loadAppI18nLocale 가 public 자산에서
 *    APP_I18N_NAMESPACES 전부를 가져오므로 이 모듈과 무관하게 동작한다.
 *
 * 배선 계약: 이 네임스페이스의 키를 렌더하는 모든 진입 모듈은 이 모듈을
 * side-effect import 해야 한다. 현재 배선 지점은 DESIGN.md §4 표 참조.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";
import { monetizationI18nBuiltins } from "./monetization-i18n-builtins";

registerI18nLocaleEntries("ko", monetizationI18nBuiltins.ko);
registerI18nEnglishSourceEntries(monetizationI18nBuiltins.en);
