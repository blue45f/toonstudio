import { useEffect } from "react";

/**
 * 인쇄(또는 PDF 저장) 직전에 `rootId` 요소 안의 접힌 상세(`details[data-eng-disclosure]`)를 모두 펼쳤다가
 * 인쇄가 끝나면 원래대로 되돌린다. 접힌 `<details>` 의 내용은 인쇄물에 나오지 않기 때문이다.
 * 아키텍처 해설·라이브러리 해설이 공용 블록(`EngineeringGuideBlocks`)의 `GuideDetails` 와 함께 쓴다.
 * (컴포넌트 파일에서 훅을 내보내면 Fast Refresh 규칙에 걸리므로 별도 파일에 둔다.)
 */
export function useOpenGuideDetailsForPrint(rootId: string): void {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = (): void => {
      const root = document.getElementById(rootId) ?? document;
      opened = [...root.querySelectorAll<HTMLDetailsElement>("details[data-eng-disclosure]")].filter((element) => !element.open);
      for (const element of opened) element.open = true;
    };
    const after = (): void => {
      for (const element of opened) element.open = false;
      opened = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [rootId]);
}
