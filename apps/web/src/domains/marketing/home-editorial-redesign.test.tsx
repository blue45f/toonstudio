// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ReferenceCreatorDashboard } from "./ReferenceCreatorDashboard";

const initialLanguage = useI18n.getState().lang;

const DASHBOARD_TSX = "apps/web/src/domains/marketing/ReferenceCreatorDashboard.tsx";
const VIVID_HERO_TSX = "apps/web/src/domains/marketing/HomeVividHero.tsx";
const VIVID_CSS = "apps/web/src/domains/marketing/home-vivid.css";
const DASHBOARD_CSS = "apps/web/src/domains/marketing/reference-creator-dashboard.css";
const HERO_CSS = "apps/web/src/domains/marketing/reference-creator-dashboard-hero.css";
const WOW_TSX = "apps/web/src/domains/marketing/wow-showcase/HomeInteractiveWowShowcase.tsx";
const WOW_CSS = "apps/web/src/domains/marketing/wow-showcase/home-wow-showcase.css";

function extractOklchHues(source: string): number[] {
  const hues: number[] = [];
  for (const match of source.matchAll(/oklch\(\s*[0-9.]+\s+[0-9.]+\s+([0-9.]+)/gu)) {
    const hue = Number.parseFloat(match[1] ?? "");
    if (Number.isFinite(hue)) hues.push(hue);
  }
  return hues;
}

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

async function renderHome(language: "ko" | "en" = "ko") {
  useI18n.setState({ lang: language });
  await act(async () => {
    render(
      <MemoryRouter>
        <ReferenceCreatorDashboard />
      </MemoryRouter>,
    );
  });
}

describe("모바일 우선 컬러풀 홈 재구성 회귀 계약", () => {
  it("데스크톱·모바일에서 아이디어·Luna·상세 소개를 먼저 접고 필요한 도움만 펼친다", async () => {
    await renderHome("ko");

    const root = document.querySelector<HTMLElement>('[data-reference-dashboard="true"]');
    expect(root?.getAttribute("data-home-editorial")).toBe("vivid-mobile-first");

    const ideaHelp = document.querySelector<HTMLDetailsElement>("details.rd-idea-help");
    const lunaHelp = document.querySelector<HTMLDetailsElement>("details.rd-luna-help");
    const moreBand = document.querySelector<HTMLDetailsElement>("details.rd-more");
    const helpers = document.querySelector<HTMLElement>(".rd-clarity-helpers");

    expect(ideaHelp?.open).toBe(false);
    expect(lunaHelp?.open).toBe(false);
    expect(moreBand?.open).toBe(false);
    expect(helpers?.getAttribute("data-luna-open")).toBe("false");

    // Luna와 더 알아보기는 클릭 시 즉시 펼쳐진다.
    const lunaSummary = lunaHelp?.querySelector<HTMLElement>("summary");
    const moreSummary = moreBand?.querySelector<HTMLElement>("summary");
    if (!lunaSummary || !moreSummary) throw new Error("summary 요소가 필요합니다.");

    fireEvent.click(lunaSummary);
    expect(lunaHelp?.open).toBe(true);
    if (lunaHelp) fireEvent(lunaHelp, new Event("toggle"));
    expect(helpers?.getAttribute("data-luna-open")).toBe("true");

    fireEvent.keyDown(lunaSummary, { key: "Escape" });
    expect(lunaHelp?.open).toBe(false);
    expect(helpers?.getAttribute("data-luna-open")).toBe("false");

    fireEvent.click(moreSummary);
    expect(moreBand?.open).toBe(true);
  });

  it("만화 콜라주와 세 단계 흐름을 실제 저장 원고로 오인하지 않게 제공한다", async () => {
    await renderHome("ko");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("상상한 장면을,나의 작품으로.");
    const artwork = screen.getByRole("figure", { name: "선화에서 완성작으로 이어지는 브랜드 예시 원고" });
    expect(within(artwork).getAllByRole("img")).toHaveLength(1);
    expect(artwork.querySelector("figcaption")?.textContent).toBe("ToonStudio 브랜드 아트");
    expect(artwork.querySelectorAll(".vivid-comic-panel")).toHaveLength(2);
    expect(artwork.querySelector(".vivid-comic-panel--back")?.getAttribute("aria-hidden")).toBe("true");

    const journeySteps = [...document.querySelectorAll(".vivid-journey li")];
    expect(journeySteps.map((item) => item.getAttribute("data-spectrum-domain"))).toEqual([
      "character",
      "draw",
      "market",
    ]);
  });

  it("그리기·이야기·협업 세 목적에 고유 색과 44px 터치 규격을 연결한다", async () => {
    await renderHome("ko");

    const launchpad = screen.getByTestId("home-v2-spectrum-launchpad");

    const cards = within(launchpad).getAllByRole("link");
    expect(cards.map((card) => card.getAttribute("data-spectrum-domain"))).toEqual([
      "draw",
      "character",
      "collab",
    ]);
    expect(cards.map((card) => card.getAttribute("href"))).toEqual([
      "/studio/new?lane=blank",
      "/create?intent=my-story",
      "/production",
    ]);
    for (const card of cards) {
      expect(card.className).toContain("min-h-11");
    }
  });

  it("영어 모드에서 홈 전체 텍스트와 접근성 이름에 한글이 0건이다", async () => {
    await renderHome("en");
    const root = document.querySelector<HTMLElement>('[data-reference-dashboard="true"]');
    expect(root).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Imagine a scene.Make it your story.");
    expect(root?.textContent).not.toMatch(/[가-힣]/u);
    for (const el of root?.querySelectorAll("[aria-label], [alt]") ?? []) {
      expect(`${el.getAttribute("aria-label") ?? ""}${el.getAttribute("alt") ?? ""}`).not.toMatch(/[가-힣]/u);
    }
  });

  it("홈·히어로·쇼케이스 TSX/CSS는 원시 색·transition-all·Sparkles·= {} 기본 props·바이올렛 휴(270~320°) 0건 계약을 지킨다", () => {
    const tsxFiles = [DASHBOARD_TSX, VIVID_HERO_TSX, WOW_TSX];
    for (const file of tsxFiles) {
      const source = readFileSync(file, "utf8");
      expect(source.split("\n").length, `${file} <= 800 lines`).toBeLessThanOrEqual(800);
      expect(source, `${file} no raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(source, `${file} no rgb/hsl`).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/u);
      expect(source, `${file} no transition-all`).not.toContain("transition-all");
      expect(source, `${file} no Sparkles`).not.toMatch(/\bSparkles\b/u);
      expect(source, `${file} no = {} default props`).not.toMatch(/\)\s*:\s*[^=]*=\s*\{\s*\}/u);
    }

    const zeroVioletCssFiles = [HERO_CSS, VIVID_CSS, WOW_CSS];
    for (const file of zeroVioletCssFiles) {
      const css = readFileSync(file, "utf8");
      expect(css.split("\n").length, `${file} <= 800 lines`).toBeLessThanOrEqual(800);
      expect(css, `${file} no raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(css, `${file} no rgb/hsl`).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/u);
      expect(css, `${file} no transition: all`).not.toMatch(/transition\s*:\s*all\b|transition-all/u);
      expect(css, `${file} reduced motion`).toContain("@media (prefers-reduced-motion: reduce)");

      const violetHues = extractOklchHues(css).filter((hue) => hue >= 270 && hue <= 320);
      expect(violetHues, `${file} zero violet hues (270~320)`).toEqual([]);
    }

    // backdrop-filter 사용 시 -webkit-backdrop-filter 병기 검증
    const heroCss = readFileSync(HERO_CSS, "utf8");
    const backdropCount = (heroCss.match(/(?<![-\w])backdrop-filter:/gu) ?? []).length;
    const webkitBackdropCount = (heroCss.match(/-webkit-backdrop-filter:/gu) ?? []).length;
    expect(backdropCount).toBeGreaterThan(0);
    expect(webkitBackdropCount).toBe(backdropCount);

    // 대시보드 CSS: 5대 스펙트럼 안료 리본과 대비·감속 가드, 계약 고정(--rd-on-art 폴백 1줄 제외) 외 바이올렛 0건
    const dashboardCss = readFileSync(DASHBOARD_CSS, "utf8");
    expect(dashboardCss).toContain("--spectrum-pigment-draw");
    expect(dashboardCss).toContain("--spectrum-pigment-character");
    expect(dashboardCss).toContain("--spectrum-pigment-market");
    expect(dashboardCss).toContain("--spectrum-pigment-collab");
    expect(dashboardCss).toContain("--spectrum-pigment-3d");
    expect(dashboardCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(dashboardCss).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/u);
    expect(dashboardCss).not.toMatch(/transition\s*:\s*all\b|transition-all/u);

    const dashboardWithoutFrozenArtOn = dashboardCss.replace(
      "--rd-on-art: var(--art-on, oklch(0.97 0.012 285));",
      "",
    );
    const dashboardVioletHues = extractOklchHues(dashboardWithoutFrozenArtOn).filter(
      (hue) => hue >= 270 && hue <= 320,
    );
    expect(dashboardVioletHues).toEqual([]);
  });
});
