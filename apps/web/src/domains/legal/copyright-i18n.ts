/**
 * copyright-i18n.ts — copyright 네임스페이스의 ko/en 사전을 앱 셸 번들에서
 * 분리해 CopyrightPage 모듈이 평가될 때 동기 등록한다
 * (번들 2단계, wave7 bundle DESIGN §3). 패턴은 monetization-i18n.ts와 동일:
 * ko 는 registerI18nLocaleEntries, en 은 registerI18nEnglishSourceEntries 로
 * 등록하고, ko/en 외 로케일은 loadAppI18nLocale 가 public 자산에서 가져온다.
 *
 * 배선 계약: copyright.* i18n 키의 소비처는 CopyrightPage.tsx 단 하나뿐임을
 * 전수 확인했다 (코드 검색의 다른 매치는 영문 산문의 "copyright." 와
 * URL "gongu.copyright.or.kr" 오탐). 페이지가 이 모듈을 side-effect import
 * 하므로 저작권 라우트 청크 로드 시점에 첫 렌더보다 먼저 등록된다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";
import { copyrightI18nBuiltins } from "./copyright-i18n-builtins";

registerI18nLocaleEntries("ko", copyrightI18nBuiltins.ko);
registerI18nEnglishSourceEntries(copyrightI18nBuiltins.en);
