// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MembershipTierCard } from "./MembershipTierCard";
import type { MembershipTier } from "../models/membership-model";

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
}));

const TIER: MembershipTier = {
  id: "tier-1",
  creatorId: "creator-1",
  name: "후원자",
  monthlyPriceKrw: 3000,
  description: "가볍게 응원하는 티어예요.",
  perks: ["members-posts", "early-access"],
  memberCount: 12,
  isActive: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

describe("MembershipTierCard", () => {
  it("독자 문법으로 이름·가격 numeral·혜택(이름+설명)을 보여준다", () => {
    render(<MembershipTierCard tier={TIER} index={0} />);

    expect(screen.getByText('membership.tierCard.tierLabel({"index":1})')).toBeTruthy();
    expect(screen.getByText("후원자")).toBeTruthy();
    expect(screen.getByText("3,000원")).toBeTruthy();
    expect(screen.getByText("membership.tierCard.perMonth")).toBeTruthy();
    expect(screen.getByText("membership.perk.early-access")).toBeTruthy();
    expect(screen.getByText(/membership\.perk\.early-accessDescription/)).toBeTruthy();
  });

  it("혜택은 입력 순서가 아니라 정해진 표시 순서로 정렬한다", () => {
    const { container } = render(<MembershipTierCard tier={TIER} index={0} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("membership.perk.early-access")).toBeLessThan(
      text.indexOf("membership.perk.members-posts"),
    );
  });

  it("footer가 있으면 카드 하단에 렌더하고, 편집 중이면 강조 테두리를 쓴다", () => {
    const { container } = render(
      <MembershipTierCard tier={TIER} index={1} highlighted footer={<span>하단 조작</span>} />,
    );
    expect(screen.getByText("하단 조작")).toBeTruthy();
    expect(container.querySelector("article")?.className).toContain("border-accent/60");
  });

  it("footer가 없으면(독자 미리보기) 조작 영역을 만들지 않는다", () => {
    render(<MembershipTierCard tier={TIER} index={0} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
