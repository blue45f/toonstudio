// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringAtlasPage } from "./EngineeringAtlasPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
// 팩토리는 import 보다 먼저 실행되므로 픽스처를 안에서 불러온다.
vi.mock("./engineering-atlas-content", async () => {
  const fixtures = await import("./engineering-atlas.fixtures");
  return {
    ENGINEERING_ATLAS_ENTRIES: [fixtures.FIXTURE_ATLAS_OPFS, fixtures.FIXTURE_ATLAS_BUDGET],
    findAtlasEntry: () => undefined,
    atlasEntriesForCategory: () => [],
    atlasEntriesForChapter: () => [],
  };
});

vi.mock("./engineering-map-content", async () => {
  const fixtures = await import("./engineering-map.fixtures");
  return {
    ENGINEERING_MAPS: [fixtures.FIXTURE_MAP_FREE_TIER],
    findEngineeringMap: () => undefined,
  };
});

afterEach(cleanup);

/** 카드 본문은 처음 열릴 때 그려진다(접힌 동안은 머리만). 열림 이벤트를 흉내 내 모든 카드를 연다. */
function openAllCards(container: HTMLElement): void {
  act(() => {
    for (const details of container.querySelectorAll<HTMLDetailsElement>("details[data-eng-disclosure]")) {
      details.open = true;
      fireEvent(details, new Event("toggle"));
    }
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/about/technology/atlas"]}>
      <EngineeringAtlasPage />
    </MemoryRouter>,
  );
}

describe("EngineeringAtlasPage", () => {
  it("카드 본문은 열기 전에는 그리지 않고, 열면 배경·쓰인 곳·샘플·링크·발표 보조 섹션을 보여준다", () => {
    const { container } = renderPage();
    expect(container.querySelector("#fixture-opfs h4")).toBeNull();
    expect(container.querySelector("#fixture-opfs figure.eng-dia")).toBeTruthy();
    openAllCards(container);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/기술을 한 장씩|One card for every technology/u);
    const card = container.querySelector("#fixture-opfs") as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.querySelector("figure.eng-dia")).toBeTruthy();
    for (const heading of [/배경 지식|Background/u, /서비스에서 쓰인 곳|Where it is used/u, /샘플 코드|Sample code/u, /참고 링크|References/u, /발표 보조|Talk aids/u]) {
      expect(within(card).getAllByRole("heading", { level: 4 }).some((item) => heading.test(item.textContent ?? ""))).toBe(true);
    }
    expect(within(card).getByText("apps/web/src/domains/creator/studio-opfs-filesystem.ts")).toBeTruthy();
    expect(within(card).getByRole("region", { name: /바이트 쓰기 코드|bytes to OPFS code/u }).getAttribute("tabindex")).toBe("0");
  });

  it("외부 링크는 새 탭에서 안전하게 열리고 사용 경로는 제품 라우트로 이어진다", () => {
    const { container } = renderPage();
    openAllCards(container);
    const link = container.querySelector('a[href^="https://developer.mozilla.org/"]') as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.rel).toContain("noreferrer");
    expect(container.querySelector('a[href="/studio"]')).toBeTruthy();
    expect(container.querySelector('a[href="/about/technology/story#storage"]')).toBeTruthy();
  });

  it("분야 필터와 검색, 상태 필터가 카드를 걸러 내고 결과 수를 알려준다", () => {
    const { container } = renderPage();
    expect(container.querySelector("[data-atlas-result-count]")?.textContent).toMatch(/2/u);

    fireEvent.click(screen.getByRole("button", { name: /^(AI·추론|AI · inference)/u }));
    expect(container.querySelector("#fixture-opfs")).toBeNull();
    expect(container.querySelector("#fixture-free-budget")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^(전체|All)/u }));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "opfs" } });
    expect(container.querySelector("#fixture-free-budget")).toBeNull();
    expect(container.querySelector("#fixture-opfs")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "configured" } });
    expect(container.querySelector("#fixture-opfs")).toBeNull();
    expect(container.querySelector("#fixture-free-budget")).toBeTruthy();
  });

  it("조건에 맞는 카드가 없으면 되돌리는 방법을 안내한다", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "존재하지않는기술" } });
    expect(screen.getByText(/조건에 맞는 카드가 없습니다|No cards match/u)).toBeTruthy();
  });

  it("영어 검색어도 한국어 화면에서 찾는다(두 언어 모두 색인)", () => {
    const { container } = renderPage();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "quota ledger" } });
    expect(container.querySelector("#fixture-free-budget")).toBeTruthy();
    expect(container.querySelector("#fixture-opfs")).toBeNull();
  });

  it("지도는 표와 카드 목록을 함께 그리고, 이름은 공식 사이트로, 도감 카드 칩은 보이는 카드로 잇는다", () => {
    const { container } = renderPage();
    const section = container.querySelector("#map-free-tier") as HTMLElement;
    expect(section).toBeTruthy();
    expect(within(section).getByRole("heading", { level: 3 }).textContent).toMatch(/무료로 세운 서비스|Services built on free tiers/u);
    expect(section.querySelector("figure.eng-dia")).toBeTruthy();
    // 넓은 화면용 표: 열 머리글과 행 머리글이 있고 모든 칸이 채워진다.
    expect(section.querySelectorAll("table thead th").length).toBe(4);
    expect(section.querySelectorAll("table tbody th[scope='row']").length).toBe(2);
    const official = section.querySelector('a[href="https://developers.cloudflare.com/workers/platform/pricing/"]') as HTMLAnchorElement;
    expect(official.target).toBe("_blank");
    expect(official.rel).toContain("noopener");
    expect(section.querySelector('a[href="#fixture-opfs"]')).toBeTruthy();
    // 표만 그린다(좁은 화면용 카드 목록은 화면이 좁을 때만 그려 DOM 이 두 배가 되지 않는다).
    expect(section.querySelector("[data-map-cards]")).toBeNull();
  });

  it("좁은 화면에서는 같은 행을 카드 목록으로 그린다", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      const { container } = renderPage();
      const section = container.querySelector("#map-free-tier") as HTMLElement;
      expect(section.querySelector("[data-map-table]")).toBeNull();
      expect(section.querySelectorAll("[data-map-cards] > li").length).toBeGreaterThanOrEqual(2);
    } finally {
      window.matchMedia = original;
    }
  });

  it("분야 필터를 특정 분야로 좁히면 지도는 숨고, 검색어는 지도 행에도 적용된다", () => {
    const { container } = renderPage();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "quota ledger" } });
    const section = container.querySelector("#map-free-tier") as HTMLElement;
    expect(section.querySelectorAll("table tbody tr").length).toBe(1);
    expect(section.querySelector("table tbody")?.textContent).toContain("Quota ledger");
    // 지도 행에 걸리는 카드가 없는 검색어에서도 지도는 남는다(카드 0장이어도 빈 화면이 되지 않는다).
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "cloudflare workers" } });
    expect(container.querySelector("#fixture-opfs")).toBeNull();
    expect(container.querySelector("#map-free-tier")).toBeTruthy();
    expect(screen.queryByText(/조건에 맞는 카드가 없습니다|No cards match/u)).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^(AI·추론|AI · inference)/u }));
    expect(container.querySelector("#map-free-tier")).toBeNull();
  });
});

