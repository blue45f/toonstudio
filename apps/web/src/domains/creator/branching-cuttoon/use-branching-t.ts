/**
 * 분기형 컷툰 화면의 번역 훅 — useT() 에 branchingCuttoon 사전 등록을 묶어 둔다.
 *
 * 화면 컴포넌트는 모두 이 훅으로 해소 함수 t 를 얻는다. 그러면 어느 컴포넌트를 따로 그리든(페이지, 플레이어, 편집기, 시험)
 * 첫 그리기보다 먼저 ko/en 사전이 등록되어 키 이름이 그대로 보이는 일이 없다.
 *
 * 이 폴더의 컴포넌트 파일(.tsx)은 "use no memo" 로 React Compiler 메모이제이션을 끈다. 컴파일러는 `상수 키 t 호출` 을 `t` 의
 * 정체성으로 캐시하는데, useT() 가 돌려주는 `t` 는 언어가 같으면 항상 같은 함수라서(번역 번들이 나중에 도착해 문구가 바뀌어도 그대로)
 * 첫 그리기의 영어 폴백이 번역 도착 뒤에도 남는다. useBranchingT() 를 쓰는 .tsx 가 이 지시문으로 시작하는지는
 * branching-cuttoon-i18n-contract.test.ts 가 본다.
 */
import { useT } from "@/shared/lib/i18n";

import "./branching-cuttoon-i18n";

/** useT() 가 돌려주는 해소 함수 — 키와 값 자리표시(`{name}` → values.name)를 받는다. */
export type BranchingT = ReturnType<typeof useT>;

export function useBranchingT(): BranchingT {
  return useT();
}
