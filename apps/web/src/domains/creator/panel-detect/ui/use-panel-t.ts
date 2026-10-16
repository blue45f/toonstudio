/**
 * 컷 가져오기 화면의 번역 훅 — useT() 에 panelImport 사전 등록을 묶어 둔다.
 *
 * 화면 컴포넌트는 모두 이 훅으로 해소 함수 t 를 얻는다. 그러면 어느 컴포넌트를 따로 그리든(작업대 안, 진입 구역, 시험) 첫 그리기보다
 * 먼저 ko/en 사전이 등록되어, 키 이름이 그대로 보이는 일이 없다. 진입 구역이 가져오기 화면과 함께 불러와지므로 이 파일은 가볍게 둔다:
 * 사전 등록 모듈(../panel-import-i18n)과 번역 훅만 가져오고, 문구 도우미(panel-import-copy.ts, 무거운 모듈을 끌어온다)는 가져오지 않는다.
 *
 * 이 폴더의 컴포넌트 파일(ui/*.tsx)은 "use no memo" 로 React Compiler 메모이제이션을 끈다. 컴파일러는 `t("상수 키")` 호출을 `t` 의
 * 정체성으로 캐시하는데, useT() 가 돌려주는 `t` 는 언어가 같으면 항상 같은 함수다(번역 번들이 나중에 도착해 문구가 바뀌어도 그대로).
 * 그래서 메모이제이션을 켜 두면 첫 그리기의 영어 폴백이 번역이 도착한 뒤에도 남는다. 언어를 바꾸면 `t` 가 바뀌어 다시 그려지지만
 * 번들 도착만으로는 그렇지 않다. usePanelT() 를 쓰는 .tsx 가 이 지시문으로 시작하는지는 ui/panel-import-i18n-contract.test.ts 가 본다.
 */

import { useT } from "@/shared/lib/i18n";

import "../panel-import-i18n";

/** useT() 가 돌려주는 해소 함수 — 키와 값 자리표시(`{name}` → values.name)를 받는다. */
export type PanelT = ReturnType<typeof useT>;

export function usePanelT(): PanelT {
  return useT();
}
