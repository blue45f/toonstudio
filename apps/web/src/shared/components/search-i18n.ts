/**
 * search-i18n.ts — search 네임스페이스의 ko/en 사전을 앱 셸 번들에서 분리해
 * 검색 표면 모듈이 평가될 때 동기 등록한다 (번들 3단계, wave7 bundle DESIGN §3).
 *
 * 패턴은 수익화 1단계(monetization-i18n.ts)와 동일하다:
 *  - ko 는 registerI18nLocaleEntries 로 DICT 에 병합한다.
 *  - en 은 registerI18nEnglishSourceEntries 로 등록해 런타임 기계번역의
 *    소스 사전에서도 빠지지 않게 한다 (셸 DICT.en 시드에서 제외된 보정).
 *  - ko/en 외 로케일은 종전과 같이 loadAppI18nLocale 가 public 자산에서
 *    APP_I18N_NAMESPACES 전부를 가져오므로 이 모듈과 무관하게 동작한다.
 *
 * 배선 계약: search.* 키의 소비처는 SearchPage.tsx (상위 8키)와 이 폴더의
 * search-explorer 패밀리(search-explorer.tsx·-facets.tsx·-utils.ts·
 * -constants.ts, explorer.* 71키)뿐임을 전수 확인했다 (2026-10-14 실측).
 * DESIGN 이 우려한 셸 키 분할은 불필요하다: 셸 헤더의 검색 진입은 nav.* 키를,
 * 커맨드 팔레트는 command.* 키를 쓰며 search.* 는 셸 정적 그래프 어디에서도
 * 쓰이지 않는다. SearchPage 와 search-explorer 가 이 모듈을 side-effect
 * import 하므로, 어느 경로로 검색 청크가 로드돼도 첫 렌더보다 먼저 등록된다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";
import { searchI18nBuiltins } from "./search-i18n-builtins";

registerI18nLocaleEntries("ko", searchI18nBuiltins.ko);
registerI18nEnglishSourceEntries(searchI18nBuiltins.en);
