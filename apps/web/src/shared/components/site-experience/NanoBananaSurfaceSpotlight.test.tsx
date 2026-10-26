// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NanoBananaSurfaceSpotlight } from "./NanoBananaSurfaceSpotlight";

let mockedLang = "ko";
vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) =>
    selector({ lang: mockedLang }),
}));

afterEach(() => {
  mockedLang = "ko";
  cleanup();
});

describe("NanoBananaSurfaceSpotlight", () => {
  it("renders decorative artwork outside the assistive image tree and switches lenses interactively", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/discover"]}>
        <NanoBananaSurfaceSpotlight cardId="nb-discover-spotlight" compact />
      </MemoryRouter>,
    );

    expect(
      container.querySelector('[data-nano-banana-spotlight="nb-discover-spotlight"]'),
    ).not.toBeNull();

    // Decorative image must not pollute role="img" queries
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    const img = container.querySelector<HTMLImageElement>(".nb-site-spotlight__img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(
      "/assets/site-experience/nano-banana-site-v1/cards/nb-discover-spotlight-640.webp",
    );
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");

    // Default lens is "curation"
    const curationBtn = screen.getByRole("button", { name: "큐레이션 렌즈" });
    const recipeBtn = screen.getByRole("button", { name: "나노바나나 레시피" });
    expect(curationBtn.getAttribute("aria-pressed")).toBe("true");
    expect(recipeBtn.getAttribute("aria-pressed")).toBe("false");

    // Switch to recipe lens
    fireEvent.click(recipeBtn);
    expect(recipeBtn.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".nb-site-spotlight__seed")?.textContent).toContain(
      "Korean webtoon premiere cover composition",
    );
    expect(screen.getByRole("link", { name: /표지 시안 시작/u }).getAttribute("href")).toBe(
      "/create",
    );
  });

  it("renders English copy with zero Hangul when locale is en", () => {
    mockedLang = "en";
    const { container } = render(
      <MemoryRouter initialEntries={["/studio"]}>
        <NanoBananaSurfaceSpotlight pathname="/studio" />
      </MemoryRouter>,
    );

    expect(container.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Manuscript Canvas & Cel-Shaded Brush Desk",
    );
  });
});
