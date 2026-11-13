// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import type { MembershipTier } from "../models/membership-model";
import { CreatorMembershipPage } from "./CreatorMembershipPage";

const tierBase = {
  creatorId: "creator-1",
  description: "",
  perks: ["early-access"] as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const TIERS: readonly MembershipTier[] = [
  { ...tierBase, id: "tier-1", name: "후원 티어", monthlyPriceKrw: 4900, memberCount: 3, isActive: true },
  { ...tierBase, id: "tier-2", name: "준비 중 티어", monthlyPriceKrw: 9900, memberCount: 0, isActive: false },
];

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({
    data: { user: { id: "creator-1", name: "작가" } },
    ready: true,
    status: "authenticated",
  }),
}));

vi.mock("../models/membership-store", () => ({
  listTiersByCreator: () => TIERS,
  subscribeMembershipStore: () => () => undefined,
}));

const initial = useI18n.getState();

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState(initial);
});

describe("CreatorMembershipPage", () => {
  it("첫 화면에 독자에게 공개 중인 티어 수와 미리보기 앵커를 보여 준다", () => {
    const { container } = render(<CreatorMembershipPage />);
    // 전체 티어 2개 중 활성은 1개 — 통계 카드의 전체 수와 다른 '공개 중' 상태가 첫 화면의 주인공이다.
    expect(screen.getByText(/티어 1개가 공개 중이에요/)).toBeTruthy();
    const anchor = screen.getByRole("link", { name: "독자 뷰 전체 미리보기" });
    expect(anchor.getAttribute("href")).toBe("#creator-membership-preview");
    expect(container.querySelector("#creator-membership-preview")).not.toBeNull();
  });

  it("REA 멤버십 혜택·이탈 방지 워크벤치를 렌더링하고 양방향 상태를 전환한다", () => {
    render(<CreatorMembershipPage />);

    const bar = screen.getByTestId("creator-membership-rea-churn-bar");
    expect(bar.textContent).toContain("Pixiv Fanbox · Patreon · Naver Preview · Kakao Wait-Free");

    const perkEarly = screen.getByTestId("membership-rea-perk-early-access-3ep");
    const perkVault = screen.getByTestId("membership-rea-perk-psd-layer-vault");
    const perkCommentary = screen.getByTestId("membership-rea-perk-director-cut-commentary");

    expect(perkEarly.getAttribute("aria-pressed")).toBe("true");
    expect(perkVault.getAttribute("aria-pressed")).toBe("false");
    expect(perkCommentary.getAttribute("aria-pressed")).toBe("false");

    const guardAnnual = screen.getByTestId("membership-rea-guard-annual-16pct-discount");
    const guardPause = screen.getByTestId("membership-rea-guard-pause-grace-30d");
    const guardBadge = screen.getByTestId("membership-rea-guard-anniversary-badge-drop");

    expect(guardAnnual.getAttribute("aria-pressed")).toBe("true");
    expect(guardPause.getAttribute("aria-pressed")).toBe("false");
    expect(guardBadge.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("creator-membership-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("3화 선공개 패스");
    expect(status.textContent).toContain("연간 구독 16% 할인");

    fireEvent.click(perkVault);
    expect(perkVault.getAttribute("aria-pressed")).toBe("true");
    expect(perkEarly.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("원본 PSD·클립 금고");

    fireEvent.click(guardPause);
    expect(guardPause.getAttribute("aria-pressed")).toBe("true");
    expect(guardAnnual.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("결제 유예·일시정지 30일");

    fireEvent.click(perkCommentary);
    fireEvent.click(guardBadge);
    expect(perkCommentary.getAttribute("aria-pressed")).toBe("true");
    expect(guardBadge.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("디렉터스 컷 코멘터리");
    expect(status.textContent).toContain("구독 기념 배지 드롭");
  });

  it("영어 로케일(en)에서 REA 워크벤치에 한글이 섞이지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(<CreatorMembershipPage />);

    const bar = screen.getByTestId("creator-membership-rea-churn-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("membership-rea-perk-director-cut-commentary"));
    fireEvent.click(screen.getByTestId("membership-rea-guard-anniversary-badge-drop"));
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("creator-membership-rea-status").textContent).toContain("Director's Cut Commentary");
    expect(screen.getByTestId("creator-membership-rea-status").textContent).toContain("Anniversary Badge Drop");
  });
});


it("실제 멤버십 티어를 운영 예시보다 먼저 보여 주고 예시 변경은 티어 금액을 바꾸지 않는다", () => {
  render(<CreatorMembershipPage />);
  const tier = screen.getAllByText("후원 티어")[0];
  const examples = screen.getByTestId("creator-membership-rea-churn-bar");
  const details = examples.closest("details");
  expect(tier.closest("details")).toBeNull();
  expect(tier.compareDocumentPosition(examples) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(details?.open).toBe(false);
  const summary = details?.querySelector("summary");
  if (!summary) throw new Error("멤버십 운영 예시 누락");
  fireEvent.click(summary);
  fireEvent.click(screen.getByTestId("membership-rea-perk-psd-layer-vault"));
  expect(TIERS[0].monthlyPriceKrw).toBe(4900);
  expect(screen.getAllByText("후원 티어")[0]).toBe(tier);
});
