/**
 * 단계 제목 포커스 — 단계가 나타날 때(그 단계 컴포넌트가 마운트될 때) 제목으로 포커스를 옮긴다.
 *
 * 단계가 바뀌면 이전 단계의 단추(시작 단추, 파일 선택, 취소, 다음 등)가 사라져 포커스가 body 로 떨어진다. 키보드 사용자는 화면 맨
 * 위부터 다시 탭해야 하고 화면 낭독기는 새 단계를 알리지 못한다. 제목(tabIndex=-1)으로 옮기면 새 내용의 처음에서 이어 갈 수 있다.
 * 제목은 단계마다 새로 만들어지는 컴포넌트에 있으므로, 별도의 "단계 이름" 상태 없이 마운트 시점이 곧 단계 전환 시점이다(DOM 포커스 동기화).
 */

import { useEffect, useRef, type RefObject } from "react";

export function useStepHeadingFocus<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
