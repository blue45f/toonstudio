/**
 * guide-i18n.ts — guide 네임스페이스의 ko/en 사전을 앱 셸 번들에서 분리해
 * GuidePage 모듈이 평가될 때 동기 등록한다 (번들 2단계, wave7 bundle DESIGN §3).
 *
 * 패턴은 수익화 1단계(monetization-i18n.ts)와 동일하다:
 *  - ko 는 registerI18nLocaleEntries 로 DICT 에 병합한다.
 *  - en 은 registerI18nEnglishSourceEntries 로 등록해 런타임 기계번역의
 *    소스 사전에서도 빠지지 않게 한다 (셸 DICT.en 시드에서 제외된 보정).
 *  - ko/en 외 로케일은 종전과 같이 loadAppI18nLocale 가 public 자산에서
 *    APP_I18N_NAMESPACES 전부를 가져오므로 이 모듈과 무관하게 동작한다.
 *
 * 배선 계약: guide.* 키의 소비처는 GuidePage.tsx 단 하나뿐임을 전수 확인했다
 * (리터럴 80키 + 동적 `guide.axis.${...}` 24키 전부 이 파일에서만 사용).
 * GuidePage.tsx 가 이 모듈을 side-effect import 하므로, 가이드 라우트 청크가
 * 로드되는 시점에 첫 렌더보다 먼저 등록이 끝난다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";
import { guideI18nBuiltins } from "./guide-i18n-builtins";

registerI18nLocaleEntries("ko", guideI18nBuiltins.ko);
registerI18nEnglishSourceEntries(guideI18nBuiltins.en);
