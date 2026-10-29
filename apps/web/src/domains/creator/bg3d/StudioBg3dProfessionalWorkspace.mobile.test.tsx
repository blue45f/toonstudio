// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
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
const queries = new Set<MobileQuery>();
class MobileQuery extends EventTarget implements MediaQueryList {
  readonly media: string;
  onchange: MediaQueryList["onchange"] = null;
  constructor(query: string) { super(); this.media = query; }
  get matches(): boolean { return this.media === "(max-width: 1023px)" && width <= 1023; }
  addListener(): void { /* 실제 hook은 표준 addEventListener만 사용한다. */ }
  removeListener(): void { /* 실제 hook은 표준 removeEventListener만 사용한다. */ }
  changed(): void { this.dispatchEvent(new Event("change")); }
}
beforeEach(() => {
  width = 390; queries.clear(); observed.preferences.length = 0; window.localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string): MediaQueryList => { const value = new MobileQuery(query); queries.add(value); return value; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });
function Viewport({ h }: { readonly h: unknown }) { return <main data-host-present={Boolean(h)}>장면</main>; }
function Workspace() {
  return <StudioBg3dProfessionalWorkspace scopeKey="mobile-cut-layout" outliner={<span>계층</span>}
    viewport={<Viewport h={{}} />} inspector={<aside>속성</aside>} />;
}
function resize(next: number): void { act(() => { width = next; queries.forEach((query) => query.changed()); }); }

describe("BG3D mobile 컷 패널 권장 상태", () => {
  it("처음부터 390px인 context의 첫 render부터 접힘을 요청한다", () => {
    render(<Workspace />);
    expect(observed.preferences[0]).toBe(false); expect(screen.getByTestId("cut-preference").textContent).toBe("false");
    expect(document.querySelector("[data-bg3d-professional-workspace]")).not.toBeNull();
    expect(document.querySelector("[data-bg3d-professional-viewport]")).not.toBeNull();
    expect(document.querySelector("[data-bg3d-professional-inspector]")).not.toBeNull();
  });
  it("처음 desktop이면 기존 펼침을 요청한다", () => {
    width = 1600; render(<Workspace />);
    expect(observed.preferences[0]).toBe(true); expect(screen.getByTestId("cut-preference").textContent).toBe("true");
  });
  it("desktop→mobile→desktop resize를 preference로 전달하며 panel key나 세션을 바꾸지 않는다", () => {
    width = 1600; const rendered = render(<Workspace />), original = screen.getByTestId("cut-preference");
    resize(390); expect(screen.getByTestId("cut-preference").textContent).toBe("false");
    resize(1600); expect(screen.getByTestId("cut-preference").textContent).toBe("true");
    rendered.rerender(<Workspace />); expect(screen.getByTestId("cut-preference")).toBe(original);
  });
});
