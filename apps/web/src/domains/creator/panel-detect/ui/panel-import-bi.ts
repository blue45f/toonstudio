/**
 * 컷 가져오기 화면의 이중언어 문구 도우미 — 한글(기본)·영문 쌍 중 지금 언어의 것을 돌려준다.
 *
 * 진입 구역(PanelImportEntry)은 가져오기 화면과 함께 불러오고 작업대는 시작을 누른 뒤에 불러오므로,
 * 진입 구역이 무거운 모듈(ZIP·문서 만들기 등)을 끌고 오지 않도록 이 파일은 번역 도우미만 가져온다.
 *
 * bi() 는 그리는 순간의 전역 언어를 읽는다. React Compiler 는 상수 인자의 호출을 순수한 값으로 보고 캐시하므로,
 * 이 화면의 컴포넌트 파일(ui/*.tsx)은 "use no memo" 로 메모이제이션을 끄고, 가장 위의 두 컴포넌트(Entry·Workbench)가
 * useBilingualI18nRevision() 으로 언어 변경을 구독해 아래 화면 전체를 다시 그린다.
 */

import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

/** 이 화면 전체가 같은 번역 범위("PanelImport")를 쓴다. */
export const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale("PanelImport", ko, en);
