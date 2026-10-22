/**
 * claude-assist-i18n.ts — claudeAssist 네임스페이스(Claude 연결 카드·AI 아트 디렉터·AI 명령 도우미)의 ko/en 사전을
 * 앱 셸 번들에 넣지 않고, 이 화면을 쓰는 모듈이 평가될 때 동기 등록한다. 패턴은 anchor-lab-i18n.ts 와 같다:
 *  - ko 는 registerI18nLocaleEntries 로 DICT 에 병합한다.
 *  - en 은 registerI18nEnglishSourceEntries 로 등록해 런타임 기계번역의 원문 사전에서도 빠지지 않게 한다.
 *    (번역 서비스로 나가는 원문은 이 사전의 정적 문장뿐이다. 모델 이름·금액·개수·사용자 입력은 자리표시로 두고
 *    번역된 문장에 끼운다.)
 *  - ko/en 외 로케일은 loadAppI18nLocale 가 public/i18n/app/claudeAssist/<locale>.json 을 가져온다.
 *
 * 배선 계약: claudeAssist.* 키를 그리는 모듈은 이 모듈이 먼저 평가되게 해야 한다. 키를 그리는 컴포넌트와 훅이
 * 각자 side-effect import 한다(가장 먼저 평가되는 모듈이 한 번만 등록한다).
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";

import { claudeAssistI18nBuiltins } from "./claude-assist-i18n-builtins";

registerI18nLocaleEntries("ko", claudeAssistI18nBuiltins.ko);
registerI18nEnglishSourceEntries(claudeAssistI18nBuiltins.en);
