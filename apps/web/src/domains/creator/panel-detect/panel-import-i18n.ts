/**
 * panel-import-i18n.ts — panelImport 네임스페이스(컷 자동 감지·카드뉴스 가져오기 화면)의 ko/en 사전을 앱 셸 번들에 넣지 않고,
 * 이 화면을 쓰는 모듈이 평가될 때 동기 등록한다. 패턴은 creator-analytics-i18n.ts 와 같다:
 *  - ko 는 registerI18nLocaleEntries 로 DICT 에 병합한다.
 *  - en 은 registerI18nEnglishSourceEntries 로 등록해 런타임 기계번역의 원문 사전에서도 빠지지 않게 한다.
 *    (번역 서비스로 나가는 원문은 이 사전의 정적 문장뿐이다. 파일 이름·행 번호 같은 값은 자리표시로 두고 번역된 문장에 끼운다.)
 *  - ko/en 외 로케일은 loadAppI18nLocale 가 public/i18n/app/panelImport/<locale>.json 을 가져온다.
 *
 * 배선 계약: panelImport.* 키를 그리는 모듈은 이 모듈이 먼저 평가되게 해야 한다. 진입 구역(PanelImportEntry)과 문구 도우미
 * (ui/panel-import-copy.ts, 모든 화면 컴포넌트가 가져온다)가 side-effect import 한다.
 */
import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "@/shared/lib/i18n";

import { panelImportI18nBuiltins } from "./panel-import-i18n-builtins";

registerI18nLocaleEntries("ko", panelImportI18nBuiltins.ko);
registerI18nEnglishSourceEntries(panelImportI18nBuiltins.en);
