// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
});
