// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PRODUCT_TOUR } from "./product-tour-content";
import { ProductTourMadeNote } from "./ProductTourMadeNote";
import { ProductTourTechLinks } from "./ProductTourTechLinks";
import { PRODUCT_TOUR_MEDIA_ATLAS_LINKS, PRODUCT_TOUR_TECH_LINKS } from "./public/product-tour-tech-links";
import { RouteConditionBadges } from "./RouteConditionBadges";
import { routeConditionsFor } from "./route-conditions";

afterEach(() => {
  cleanup();
});

describe("ProductTourTechLinks", () => {
  it("links each chapter's technology cards to the tech atlas and its story chapter with the chapter's status", () => {
    for (const chapter of PRODUCT_TOUR.chapters) {
      const { container, unmount } = render(
        <MemoryRouter>
          <ProductTourTechLinks chapterId={chapter.id} />
        </MemoryRouter>,
      );
      const tech = PRODUCT_TOUR_TECH_LINKS[chapter.id];
      const group = container.querySelector<HTMLElement>(`[data-tech-chapter="${chapter.id}"]`);
      expect(group, chapter.id).not.toBeNull();
      expect(group?.getAttribute("role")).toBe("group");
      expect(group?.getAttribute("aria-labelledby")).toBeTruthy();

      const atlasLinks = Array.from(group?.querySelectorAll<HTMLAnchorElement>('a[href^="/about/technology/atlas#"]') ?? []);
      expect(atlasLinks.map((link) => link.getAttribute("href")), chapter.id).toEqual(
        tech.atlas.map((link) => `/about/technology/atlas#${link.atlasId}`),
      );
      const story = group?.querySelector<HTMLAnchorElement>('a[href^="/about/technology/story#"]');
      expect(story?.getAttribute("href"), chapter.id).toBe(`/about/technology/story#${tech.story.chapterId}`);
      expect(story?.querySelector("[data-status]")?.getAttribute("data-status"), chapter.id).toBe(tech.story.status);
      unmount();
    }
  });

  it("shows the story chapter's maturity as text, not only as a color", () => {
    render(
      <MemoryRouter>
        <ProductTourTechLinks chapterId="draw" />
        <ProductTourTechLinks chapterId="assist" />
        <ProductTourTechLinks chapterId="finish" />
      </MemoryRouter>,
    );
    expect(screen.getByText("실험 기능")).toBeTruthy();
    expect(screen.getByText("설정 필요")).toBeTruthy();
    expect(screen.getByText("운영 경로")).toBeTruthy();
  });
});

describe("RouteConditionBadges", () => {
  it("reads usage conditions from the route metadata (beta 3D, experimental AI lab, project-bound publish)", () => {
    expect(routeConditionsFor("/studio/bg3d")).toEqual(["beta", "desktop"]);
    expect(routeConditionsFor("/studio/ai-lab")).toEqual(["experimental"]);
    expect(routeConditionsFor("/studio/publish")).toEqual(["project"]);
    for (const chapter of PRODUCT_TOUR.chapters.filter((item) => !["three-d", "assist", "finish"].includes(item.id))) {
      expect(routeConditionsFor(chapter.feature.href), chapter.id).toEqual([]);
    }
  });

  it("renders nothing for a stable public route and named text badges otherwise", () => {
    const stable = render(
      <MemoryRouter>
        <RouteConditionBadges href="/studio/canvas" />
      </MemoryRouter>,
    );
    expect(stable.container.querySelector("[data-route-conditions]")).toBeNull();
    stable.unmount();

    const { container } = render(
      <MemoryRouter>
        <RouteConditionBadges href="/studio/bg3d" />
      </MemoryRouter>,
    );
    const list = container.querySelector<HTMLElement>("[data-route-conditions]");
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getByText("베타")).toBeTruthy();
    expect(within(list as HTMLElement).getByText("데스크톱 권장")).toBeTruthy();
    expect(within(list as HTMLElement).getByText("사용 조건:", { exact: false }).className).toContain("sr-only");
  });
});

describe("ProductTourMadeNote", () => {
  it("is folded by default and lists the media cards plus the engineering film page", () => {
    const { container } = render(
      <MemoryRouter>
        <ProductTourMadeNote />
      </MemoryRouter>,
    );
    const details = container.querySelector<HTMLDetailsElement>("details[data-product-tour-made]");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.querySelectorAll("ul.product-tour__made-list > li")).toHaveLength(4);
    const atlasHrefs = Array.from(details?.querySelectorAll<HTMLAnchorElement>('a[href^="/about/technology/atlas#"]') ?? []).map((link) => link.getAttribute("href"));
    expect(atlasHrefs).toEqual(PRODUCT_TOUR_MEDIA_ATLAS_LINKS.map((link) => `/about/technology/atlas#${link.atlasId}`));
    expect(details?.querySelector('a[href="/about/technology/videos"]')).not.toBeNull();
  });
});
