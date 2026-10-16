import { useLayoutEffect } from "react";

/**
 * 편집기가 떠 있는 동안 브라우저 자동 번역(Chrome·Edge·Safari 번역)을 끈다.
 *
 * 편집기는 패널·대화상자·대사 입력처럼 글자가 곧 작업 도구다. 자동 번역이 켜진 채 열리면 버튼 이름과
 * 사용자가 쓴 대사가 바뀌거나 DOM 이 번역기의 `<font>` 래퍼로 감싸져 React 가 노드를 못 찾는 화면이 생긴다.
 * 그래서 `translate="no"` 를 **편집기가 마운트된 동안만** `<body>` 에 건다. 대화상자는 `body` 아래 포털로 열리므로
 * 편집기 루트 요소가 아니라 `body` 여야 포털 안까지 덮인다. 속성은 상속된다.
 *
 * 일부러 `index.html` 의 메타(`notranslate`)로 전체 SPA 에 걸지 않는다: 공개 사이트(작품 상세·소개 글)는
 * 해외 독자가 번역해 읽는 화면이라 번역이 살아 있어야 한다. 캔버스(Konva)에 그린 글자는 DOM 이 아니라 해당 없다.
 *
 * 마운트마다 `useLayoutEffect` 로 거는 이유: 번역기의 변경 감시자는 DOM 변경 뒤 마이크로태스크에서 돈다. 레이아웃 효과는
 * 같은 커밋 안에서 먼저 실행되므로, 편집기 노드가 처음 그려지기 전에 속성이 이미 붙어 있다.
 */

const ATTRIBUTE = "translate";

interface HolderState {
  holders: number;
  /** 편집기가 오기 전에 이 요소가 갖고 있던 값(없으면 null). 마지막 해제 때 되돌린다. */
  saved: string | null;
}

const states = new WeakMap<HTMLElement, HolderState>();

/** 번역 끄기를 한 번 잡는다. 반환 함수는 한 번만 효과가 있고, 모든 보유자가 놓으면 원래 값으로 되돌린다. */
export function acquireStudioNoAutoTranslate(
  target: HTMLElement = document.body,
): () => void {
  let state = states.get(target);
  if (!state) {
    state = { holders: 0, saved: target.getAttribute(ATTRIBUTE) };
    states.set(target, state);
  }
  if (state.holders === 0) target.setAttribute(ATTRIBUTE, "no");
  state.holders += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = states.get(target);
    if (!current) return;
    current.holders -= 1;
    if (current.holders > 0) return;
    if (current.saved === null) target.removeAttribute(ATTRIBUTE);
    else target.setAttribute(ATTRIBUTE, current.saved);
    states.delete(target);
  };
}

export function useStudioNoAutoTranslate(): void {
  useLayoutEffect(() => acquireStudioNoAutoTranslate(), []);
}
