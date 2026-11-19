// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { findStudioBrushMenuLauncher } from "./studio-brush-menu-launcher";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("브러시 메뉴 열기와 키보드 포커스 복귀 대상", () => {
  function button(root: HTMLElement, attribute: string, value: string, width = 44) {
    const item = document.createElement("button");
    item.setAttribute(attribute, value);
    root.append(item);
    vi.spyOn(item, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, 44));
    return item;
  }

  it("보이는 인스펙터 카탈로그를 우선하고 CSS로 숨겨지면 현재 브러시로 복귀한다", () => {
    const current = button(document.body, "data-studio-core-draw-control", "brush");
    const inspector = button(document.body, "data-studio-brush-catalog-launcher", "true");
    expect(findStudioBrushMenuLauncher(document.body)).toBe(inspector);
    inspector.style.visibility = "hidden";
    expect(findStudioBrushMenuLauncher(document.body)).toBe(current);
    current.disabled = true;
    const menu = button(document.body, "data-studio-main-menu-trigger", "brush");
    expect(findStudioBrushMenuLauncher(document.body)).toBe(menu);
  });

  it("숨은 레일이나 다른 원고의 버튼 대신 현재 모바일 도크를 사용한다", () => {
    button(document.body, "data-studio-brush-catalog-launcher", "true");
    const draft = document.createElement("section");
    document.body.append(draft);
    button(draft, "data-studio-core-draw-control", "brush", 0);
    const background = button(draft, "data-studio-main-menu-trigger", "brush");
    background.setAttribute("inert", "");
    const dock = button(draft, "data-studio-mobile-tool", "brush");
    expect(findStudioBrushMenuLauncher(draft)).toBe(dock);
    dock.hidden = true;
    expect(findStudioBrushMenuLauncher(draft)).toBeNull();
    expect(findStudioBrushMenuLauncher(null)).toBeNull();
  });
});
