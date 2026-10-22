import { useEffect, useRef } from "react";

/** 떠 있는 창을 여는 단추가 있는 영역: 문서 메뉴바, 도구 옵션 줄, 그리기 도구 줄. */
const WINDOW_OPENER_REGIONS = "#studio-menubar, #studio-tool-belt, #studio-tool-rail";

function studioRoot(): HTMLElement | null {
  return document.getElementById("studio-app-shell")
    ?? document.querySelector<HTMLElement>('[data-studio-editor="true"]');
}

/** 마지막 입력이 키보드였는가. `StudioWorkspaceNavigator` 가 keydown·pointerdown 마다 루트에 적어 둔다. */
function lastInputWasKeyboard(): boolean {
  return studioRoot()?.dataset.studioInputModality === "keyboard";
}

function locate(selector: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

/**
 * 메뉴바·도구 줄의 단추를 키보드로 눌러 연 떠 있는 창(소재·말풍선·프로젝트 센터 등)은 포커스를 받는다.
 * 창이 `document.body` 포털이라 포커스를 옮기지 않으면 키보드·화면 낭독기 사용자는 Tab 으로 창 안에 닿을 길이 없다
 * (여는 단추 다음 Tab 은 옆 메뉴로 간다. WCAG 2.1.1·2.4.3).
 *
 * - `windowSelector` 는 창 루트를 찾는 선택자다. 루트에 `tabindex="-1"` 이 있어야 포커스를 받는다.
 * - 마우스로 연 창, 단축키로 연 창, 처음부터 열려 있던 창은 포커스를 건드리지 않는다.
 * - 닫히면서 포커스가 문서 본문으로 떨어졌을 때만 여는 단추로 돌려준다. 이미 다른 곳으로 옮겼다면 그 선택을 존중한다.
 * - 개발 모드(StrictMode)가 효과를 두 번 돌려도 처음 읽은 여는 단추를 ref 에 남겨 쓴다.
 */
export function useStudioWindowKeyboardFocus(windowSelector: string, open: boolean): void {
  const openerRef = useRef<Element | null | undefined>(undefined);
  useEffect(() => {
    if (!open) {
      openerRef.current = undefined;
      return undefined;
    }
    if (openerRef.current === undefined) {
      const opener = document.activeElement;
      openerRef.current = opener;
      const surface = locate(windowSelector);
      const openedByToolbarButton = opener instanceof HTMLElement
        && opener !== document.body
        && opener.closest(WINDOW_OPENER_REGIONS) !== null;
      if (surface && openedByToolbarButton && lastInputWasKeyboard()) {
        surface.focus({ preventScroll: true });
      }
    }
    return () => {
      const opener = openerRef.current;
      const active = document.activeElement;
      if (opener instanceof HTMLElement && opener.isConnected && (active === null || active === document.body)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, windowSelector]);
}
