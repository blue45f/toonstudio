// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioBg3dProfessionalWorkspace } from "./StudioBg3dProfessionalWorkspace";

const observed = vi.hoisted(() => { const preferences: Array<boolean | undefined> = []; return { preferences }; });
vi.mock("../scene3d/StudioScene3dBg3dCutPanel", () => ({
  StudioScene3dBg3dCutPanel: ({ preferredExpanded }: { readonly preferredExpanded?: boolean }) => {
    observed.preferences.push(preferredExpanded);
    return <span data-testid="cut-preference">{String(preferredExpanded)}</span>;
  },
}));
let width = 390;
let height = 900;
const queries = new Set<MobileQuery>();
class MobileQuery extends EventTarget implements MediaQueryList {
  readonly media: string;
  onchange: MediaQueryList["onchange"] = null;
  constructor(query: string) { super(); this.media = query; }
  get matches(): boolean {
    return this.media === "(max-width: 1279px), (max-height: 800px)" && (width <= 1279 || height <= 800);
  }
  addListener(): void { /* 실제 hook은 표준 addEventListener만 사용한다. */ }
  removeListener(): void { /* 실제 hook은 표준 removeEventListener만 사용한다. */ }
  changed(): void { this.dispatchEvent(new Event("change")); }
}
beforeEach(() => {
  width = 390;
  height = 900;
  queries.clear();
  observed.preferences.length = 0;
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string): MediaQueryList => { const value = new MobileQuery(query); queries.add(value); return value; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });
function Workspace() {
  return <MemoryRouter><StudioBg3dProfessionalWorkspace scopeKey="mobile-cut-layout" outliner={<span>계층</span>}
    cutHost={{}} viewport={<main>장면</main>} inspector={<aside>속성</aside>} /></MemoryRouter>;
}
function resize(next: number): void { act(() => { width = next; queries.forEach((query) => query.changed()); }); }

describe("3D 배경 작업 화면 크기별 컷 패널 권장 상태", () => {
  it("처음부터 390px인 context의 첫 render부터 접힘을 요청한다", () => {
    render(<Workspace />);
    expect(observed.preferences[0]).toBe(false); expect(screen.getByTestId("cut-preference").textContent).toBe("false");
    expect(document.querySelector("[data-bg3d-professional-workspace]")).not.toBeNull();
    expect(document.querySelector("[data-bg3d-professional-viewport]")).not.toBeNull();
    expect(document.querySelector("[data-bg3d-professional-inspector]")).not.toBeNull();
  });
  it("작업 화면이 넓고 높으면 기존 펼침을 요청한다", () => {
    width = 1600; render(<Workspace />);
    expect(observed.preferences[0]).toBe(true); expect(screen.getByTestId("cut-preference").textContent).toBe("true");
  });
  it.each([[1200, 900], [1600, 800]])("작업 화면이 %i×%i이면 첫 렌더부터 컷 패널을 접는다", (viewportWidth, viewportHeight) => {
    width = viewportWidth;
    height = viewportHeight;
    render(<Workspace />);
    expect(observed.preferences[0]).toBe(false);
  });
  it("desktop→mobile→desktop resize를 preference로 전달하며 panel key나 세션을 바꾸지 않는다", () => {
    width = 1600; const rendered = render(<Workspace />), original = screen.getByTestId("cut-preference");
    resize(390); expect(screen.getByTestId("cut-preference").textContent).toBe("false");
    resize(1600); expect(screen.getByTestId("cut-preference").textContent).toBe("true");
    rendered.rerender(<Workspace />); expect(screen.getByTestId("cut-preference")).toBe(original);
  });
});
