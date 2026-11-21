// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ProductTourPage } from "./ProductTourPage";
import { IR_DECK_PDF, IR_DECK_PPTX, IR_DECK_STATUS, IR_DECK_UPDATED_AT } from "./ir-pitch-data";

vi.mock("./ProductTourPlayer", () => ({ ProductTourPlayer: () => null }));
vi.mock("./ProductTourAdditions", () => ({ ProductTourAdditions: () => null }));
vi.mock("./ProductTourShorts", () => ({ ProductTourShorts: () => null }));
vi.mock("./ProductTourAmbientClips", () => ({
  ProductTourChapterBackdrop: () => null,
  ProductTourIntroBackdrop: () => null,
  ProductTourOutroBand: () => null,
}));
vi.mock("./ProductTourMadeNote", () => ({ ProductTourMadeNote: () => null }));
vi.mock("./ProductTourTechLinks", () => ({ ProductTourTechLinks: () => null }));
vi.mock("./RouteConditionBadges", () => ({ RouteConditionBadges: () => null }));
vi.mock("@/shared/components/site-contextual-subnav", () => ({ SiteContextualSubNav: () => null }));
vi.mock("@/shared/components/service-story-journey", () => ({ ServiceStoryJourney: () => null }));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(), useMetaDescription: vi.fn(), usePageSocialMeta: vi.fn(), useJsonLd: vi.fn(),
}));

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

describe("제품 투어의 IR 참고본 안내", () => {
  it.each([
    ["ko", "참고본", "최신 웹 발표 보기"],
    ["en", "reference", "View the current web presentation"],
  ] as const)("%s에서 파일 기준일과 최신 웹 발표 경로를 함께 보여준다", (lang, label, currentPresentation) => {
    useI18n.setState({ lang });
    const { container } = render(<MemoryRouter initialEntries={["/product-tour"]}><ProductTourPage /></MemoryRouter>);
    const notice = container.querySelector(`[data-ir-deck-status="${IR_DECK_STATUS}"]`);
    expect(notice?.textContent).toContain(IR_DECK_UPDATED_AT);
    expect(notice?.textContent).toContain(label);
    expect(screen.getByRole("link", { name: currentPresentation }).getAttribute("href")).toBe("/ir/present");
    for (const href of [IR_DECK_PDF, IR_DECK_PPTX]) {
      const download = container.querySelector(`a[href="${href}"]`);
      expect(download?.hasAttribute("download")).toBe(true);
      expect(download?.textContent).toContain(IR_DECK_UPDATED_AT);
      expect(download?.textContent).toContain(label);
    }
  });
});
