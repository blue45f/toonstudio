// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteArtSurfaceSpotlight } from "./SiteArtSurfaceSpotlight";

let mockedLang = "ko";
vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) =>
    selector({ lang: mockedLang }),
}));

afterEach(() => {
  mockedLang = "ko";
  cleanup();
});

describe("SiteArtSurfaceSpotlight", () => {
  it("renders decorative artwork outside the assistive image tree and switches lenses interactively", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/discover"]}>
        <SiteArtSurfaceSpotlight cardId="nb-discover-spotlight" compact />
      </MemoryRouter>,
    );

    expect(
      container.querySelector('[data-smart-ai-spotlight="nb-discover-spotlight"]'),
    ).not.toBeNull();

    // Decorative image must not pollute role="img" queries
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    const img = container.querySelector<HTMLImageElement>(".nb-site-spotlight__img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(
      "/assets/site-experience/site-art-v1/cards/nb-discover-spotlight-640.webp",
    );
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");

    // Default lens is "curation"
    const curationBtn = screen.getByRole("button", { name: "큐레이션 렌즈" });
    const recipeBtn = screen.getByRole("button", { name: "맞춤 추천·서재" });
    expect(curationBtn.getAttribute("aria-pressed")).toBe("true");
    expect(recipeBtn.getAttribute("aria-pressed")).toBe("false");

    // Ensure technical model badges like "Illustrated Pro · ..." are not rendered
    expect(container.querySelector(".nb-site-spotlight__visual-badge")).toBeNull();
    expect(container.textContent).not.toMatch(/NanoBanana|나노바나나|Cel-Brush Engine/iu);

    // 3 visual step cards are rendered with distinct generated artwork backgrounds
    const stepCards = container.querySelectorAll(".nb-site-spotlight__step-card");
    expect(stepCards).toHaveLength(3);

    // In-Service Smart AI Assist bar is rendered and updates with the active lens
    const aiAssist = container.querySelector(".nb-site-spotlight__ai-assist");
    expect(aiAssist?.textContent).toContain("✦ 스마트 AI 보조");
    expect(aiAssist?.textContent).toContain("AI 보조:");

    // Switch to 3rd lens and verify both the hero illustration and CTA update
    fireEvent.click(recipeBtn);
    expect(recipeBtn.getAttribute("aria-pressed")).toBe("true");
    expect(img?.getAttribute("src")).toBe(
      "/assets/site-experience/site-art-v1/cards/nb-library-archive-640.webp",
    );
    expect(screen.getByRole("link", { name: /맞춤 추천 보기/u }).getAttribute("href")).toBe(
      "/recommend",
    );
  });

  it("renders English copy with zero Hangul when locale is en", () => {
    mockedLang = "en";
    const { container } = render(
      <MemoryRouter initialEntries={["/studio"]}>
        <SiteArtSurfaceSpotlight pathname="/studio" />
      </MemoryRouter>,
    );

    expect(container.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Manuscript Canvas & Cel-Shaded Brush Desk",
    );
  });
});
