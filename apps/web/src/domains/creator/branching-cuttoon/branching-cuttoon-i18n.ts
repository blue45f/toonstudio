/**
 * branching-cuttoon-i18n.ts — branchingCuttoon 네임스페이스(분기형 컷툰 실험 화면)의 ko/en 사전을 앱 셸 번들에 넣지 않고,
 * 이 화면을 쓰는 모듈이 평가될 때 동기 등록한다. 패턴은 panel-detect/panel-import-i18n.ts 와 같다:
 *  - ko 는 registerI18nLocaleEntries 로 DICT 에 병합한다.
 *  - en 은 registerI18nEnglishSourceEntries 로 등록해 런타임 기계번역의 원문 사전에서도 빠지지 않게 한다.
 *  - ko/en 외 로케일은 loadAppI18nLocale 가 public/i18n/app/branchingCuttoon/<locale>.json 을 가져온다.
 *
 * 배선 계약: branchingCuttoon.* 키를 그리는 모듈은 이 모듈이 먼저 평가되게 해야 한다. 모든 화면 컴포넌트가 가져오는
 * 번역 훅(use-branching-t.ts)과 문구 도우미(branching-cuttoon-copy.ts)가 side-effect import 한다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";

import { branchingCuttoonI18nBuiltins } from "./branching-cuttoon-i18n-builtins";

registerI18nLocaleEntries("ko", branchingCuttoonI18nBuiltins.ko);
registerI18nEnglishSourceEntries(branchingCuttoonI18nBuiltins.en);
