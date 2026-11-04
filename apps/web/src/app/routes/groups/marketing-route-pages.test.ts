import { describe, expect, it, vi } from "vitest";

import { lazyRetry } from "@/shared/lib/lazy-retry";

import "./marketing-route-pages";

const pages = vi.hoisted(() => ({
  loaded: vi.fn(),
  business: () => null,
  pricing: () => null,
  workspace: (_props: { readonly surface?: "home" | "team" | "hub" }) => null,
}));
vi.mock("@/domains/marketing/BusinessPlanPage", () => {
  pages.loaded();
  return { BusinessPlanPage: pages.business };
});
vi.mock("@/app/routes/pricing-page", () => {
  pages.loaded();
  return { PricingPage: pages.pricing };
});
vi.mock("@/domains/creator/workspace/StudioWorkspacePage", () => {
  pages.loaded();
  return { StudioWorkspacePage: pages.workspace };
});
vi.mock("@/shared/lib/lazy-retry", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/lib/lazy-retry")>();
  return { lazyRetry: vi.fn(original.lazyRetry) };
});

describe("마케팅 페이지 지연 로더", () => {
  it("페이지를 등록할 때 본문 모듈을 먼저 로드하지 않는다", () => {
    expect(pages.loaded).not.toHaveBeenCalled();
  });

  it.each([
    ["BusinessPlanPage", pages.business],
    ["PricingPage", pages.pricing],
    ["StudioWorkspacePage", pages.workspace],
  ] as const)("%s의 named export와 청크 복구 식별자를 보존한다", async (name, Page) => {
    const registration = vi.mocked(lazyRetry).mock.calls.find(([, chunkId]) => chunkId === name);
    expect(registration).toBeDefined();
    if (!registration) throw new Error(`등록되지 않은 페이지: ${name}`);
    expect(await registration[0]()).toEqual({ default: Page });
  });

  it("기존 페이지별 청크 복구 식별자를 중복 없이 보존한다", () => {
    const ids = vi.mocked(lazyRetry).mock.calls.map(([, chunkId]) => chunkId);
    expect(ids).toEqual([
      "WorkspaceHomeRoute", "ComicIntroHost", "ProductTourPage", "BrandFilmPage",
      "PromoVideoLibraryPage", "MembershipPolicyPage", "PricingPage", "FeaturesOverviewPage",
      "EventsHubPage", "BetaOpenEventPage", "StudioWorkspacePage", "StudioIntroductionPage",
      "IrPitchPage", "IrPresentPage", "BusinessPlanPage",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
