// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityPage } from "./CommunityPage";

// 레이아웃 경계 테스트: 실제 API/E2E 검증이 아니다.
const i18n = vi.hoisted(() => ({locale: "ko", copies: new Map<string, {ko:string;en:string}>()}));
vi.mock("@/shared/lib/i18n-bilingual-copy", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/shared/lib/i18n-bilingual-copy")>(),
  defineBilingualText: (namespace:string, id:string, ko:string, en:string) => {
    const key = `${namespace}.${id}`; i18n.copies.set(key,{ko,en}); return key;
  },
  useBilingualI18nRevision: () => undefined,
  formatI18nTemplate: (text:string, values:Record<string,string>) => text.replace(/\{(\w+)\}/g, (_,key:string) => values[key] ?? ""),
}));
vi.mock("@/shared/lib/i18n", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/shared/lib/i18n")>(),
  useT: () => (key:string) => {
  const entry = i18n.copies.get(key); return entry ? (i18n.locale === "en" ? entry.en : entry.ko) : key;
}}));
vi.mock("./components/fan-cafe-panel", () => ({FanCafePanel: ({scope,targetLabel,compact,hideSpaceGuide}: {scope:string;targetLabel:string;compact?:boolean;hideSpaceGuide?:boolean}) =>
  <div data-testid="fan-cafe-boundary" data-scope={scope} data-compact={String(compact)} data-hide-guide={String(hideSpaceGuide)}>
    <h2>{targetLabel}</h2><div role="alert">테스트 전용 API 오류</div><button type="button">다시 시도</button>
  </div>}));
vi.mock("./components/community-activity-preview", () => ({CommunityActivityPreview: () => <div data-testid="activity-boundary">활동</div>}));
vi.mock("@/shared/components/site-contextual-subnav", () => ({SiteContextualSubNav: () => <nav aria-label="문맥 안내" />}));
vi.mock("@/shared/components/site-experience/SiteArtSurfaceSpotlight", () => ({SiteArtSurfaceSpotlight: () => <div data-testid="brand-art-boundary" />}));
vi.mock("@/shared/seo/use-document-title", () => ({useDocumentTitle: () => undefined}));
function page() { return render(<MemoryRouter><CommunityPage /></MemoryRouter>); }
function disclosure(label:string): HTMLDetailsElement {
  const summary = screen.getByText(label, {selector:"summary"});
  const details = summary.closest("details");
  if (!details) throw new Error("details 누락");
  return details;
}
function precedes(first:Element, second:Element) { return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING); }
beforeEach(() => {i18n.locale = "ko";});
afterEach(cleanup);

describe("CommunityPage 대화 우선 배치", () => {
  it("전체 보기를 유지하고 실제 피드 경계와 오류 영역을 접지 않는다", () => {
    page();
    expect(screen.getByRole("button",{name:"전체 보기"}).getAttribute("aria-pressed")).toBe("true");
    const feed = screen.getByTestId("fan-cafe-boundary");
    expect(feed.closest("details")).toBeNull();
    expect(feed.dataset).toMatchObject({scope:"all",compact:"true",hideGuide:"true"});
    expect(screen.getByRole("alert").textContent).toBe("테스트 전용 API 오류");
    expect(screen.getByRole("button",{name:"다시 시도"})).toBeTruthy();
  });
  it("범주 탐색과 피드가 안내·리그·홍보·브랜드보다 앞에 있다", () => {
    page();
    const feed = screen.getByTestId("fan-cafe-boundary");
    expect(precedes(screen.getByRole("heading",{name:"어떤 이야기부터 나눌까요?"}), feed)).toBe(true);
    for (const label of ["커뮤니티 빠른 길잡이","승격 리그 · 활동","작품 홍보 · 예고편","브랜드 콘셉트 아트 · 실제 커뮤니티 화면이 아닙니다"]) {
      const details = disclosure(label); expect(details.open).toBe(false); expect(precedes(feed,details)).toBe(true);
    }
  });
  it("네 가지 구역 전환과 명시적으로 선택한 리그·홍보 진입을 보존한다", () => {
    page();
    fireEvent.click(screen.getByRole("button",{name:"승격 리그 · 활동"}));
    expect(screen.queryByTestId("fan-cafe-boundary")).toBeNull();
    expect(disclosure("승격 리그 · 활동").open).toBe(true);
    expect(screen.getByTestId("activity-boundary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"작품 홍보 · 예고편"}));
    expect(disclosure("작품 홍보 · 예고편").open).toBe(true);
    expect(screen.queryByTestId("community-promotion-league-strip")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"대화방 · 통합 피드"}));
    expect(screen.getByTestId("fan-cafe-boundary")).toBeTruthy();
    expect(screen.queryByTestId("community-rea-interactive-workbench")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"전체 보기"}));
    expect(disclosure("승격 리그 · 활동").open).toBe(false);
    expect(disclosure("작품 홍보 · 예고편").open).toBe(false);
  });
  it("네이티브 summary 클릭과 Escape 닫기·초점 복귀를 지원한다", () => {
    page(); const details = disclosure("커뮤니티 빠른 길잡이");
    const summary = details.querySelector("summary"); if (!summary) throw new Error("summary 누락");
    fireEvent.click(summary); expect(details.open).toBe(true);
    const link = details.querySelector("a"); if (!link) throw new Error("링크 누락");
    link.focus(); fireEvent.keyDown(link,{key:"Escape"}); expect(details.open).toBe(false); expect(document.activeElement).toBe(summary);
    fireEvent.click(summary); expect(details.open).toBe(true);
    fireEvent.click(summary); expect(details.open).toBe(false);
  });
  it("모든 기존 정적 링크와 네 범주 링크를 남긴다", () => {
    const {container} = page();
    const hrefs = new Set(Array.from(container.querySelectorAll("a"), link => link.getAttribute("href")));
    for (const href of ["/showcase","/collaborate","/community/events","/studio/new","/community/title","/community/author","/community/pencafe","/community/cafes","/community/promote","/community/reviews","/community/timelapse","/community/promote/new","/showcase/promo","/cuts","/newsletter","/community/promote?stage=amateur","/community/promote?kind=trailer","/community?provenance=human-verified","/community?provenance=ai-assisted","/creator/membership","/team/recruiting"]) expect(hrefs.has(href),href).toBe(true);
  });
  it("홍보 구성 예시의 네 트랙을 모두 선택할 수 있다", () => {
    page();fireEvent.click(screen.getByRole("button",{name:"작품 홍보 · 예고편"}));
    for (const id of ["skeb-vgen-commission","tumblbug-fantia-tier","comiket-booth-cut","c2pa-nightshade-shield"]) {
      const button = screen.getByTestId(`community-rea-track-${id}`); fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId("community-rea-active-track-summary").textContent).toContain("예시");
    }
  });
  it("추가된 탐색·접기 문구가 영어 useT 경로도 지원한다", () => {
    i18n.locale = "en";page();
    expect(screen.getByRole("group",{name:"Community sections"})).toBeTruthy();
    expect(screen.getByRole("button",{name:"All sections"}).getAttribute("aria-pressed")).toBe("true");
    expect(disclosure("Community quick guide").open).toBe(false);
    expect(screen.getByRole("heading",{name:"A story drawn alone, a world widened together."})).toBeTruthy();
  });
  it("CSS에 44px 대상·초점·reduced-motion 제한이 존재한다", () => {
    const css = readFileSync(resolve("apps/web/src/domains/community/community-page-layout.css"),"utf8");
    expect(css).toContain("min-height: 44px");expect(css).toContain(":focus-visible");expect(css).toContain("prefers-reduced-motion: reduce");
  });
  it("44px 계약을 최상위 CSS 규칙으로 파싱하고 ID·클래스 우선순위와 양 논리 축을 확인한다", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync(resolve("apps/web/src/domains/community/community-page-layout.css"), "utf8");
    document.head.append(style);
    try {
      const rules = Array.from(style.sheet?.cssRules ?? []);
      const selectors = ["button", "summary", "a[href]", '[role="button"]']
        .map(target => `#main-content .community-layout ${target}`);
      const matches = rules.filter((rule): rule is CSSStyleRule => "selectorText" in rule
        && typeof rule.selectorText === "string" && rule.selectorText.includes("#main-content"));
      expect(matches).toHaveLength(1);
      const contract = matches[0];
      expect(contract.selectorText.split(",").map(selector => selector.trim())).toEqual(selectors);
      // :where() 등으로 우선순위를 낮추지 않은 ID 1개 + 클래스 1개가 모든 분기에 있어야 한다.
      for (const selector of contract.selectorText.split(",")) {
        expect(selector.match(/#[\w-]+/g)).toEqual(["#main-content"]);
        expect(selector.match(/\.[\w-]+/g)).toEqual([".community-layout"]);
        expect(selector).not.toMatch(/:where|:is/);
      }
      expect(contract.style.getPropertyValue("min-block-size")).toBe("44px");
      expect(contract.style.getPropertyValue("min-inline-size")).toBe("44px");
      expect(contract.parentRule).toBeNull();
    } finally { style.remove(); }
  });
  it("44px scoped 선택자가 버튼·링크·summary에 적용되고 체크박스와 외부에는 적용되지 않는다", () => {
    const {container} = render(<main id="main-content"><MemoryRouter><CommunityPage /></MemoryRouter><button type="button">범위 밖</button></main>);
    const targets = 'button, summary, a[href], [role="button"]';
    const controls = container.querySelectorAll(`.community-layout :is(${targets})`);
    expect(controls.length).toBeGreaterThan(20);
    const selector = targets.split(",").map(target => `#main-content .community-layout ${target.trim()}`).join(",");
    for (const control of controls) expect(control.matches(selector)).toBe(true);
    expect(screen.getByRole("button", {name:"범위 밖"}).matches(selector)).toBe(false);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    container.querySelector(".community-layout")?.append(checkbox);
    expect(checkbox.matches(selector)).toBe(false);
  });

});
