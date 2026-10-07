// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVITY_POINT_POLICIES,
  MEMBERSHIP_ECONOMY_POLICY,
  MEMBERSHIP_PLAN_POLICIES,
} from "@toonstudio/core/membership-wallet";

import { MembershipPolicyPage } from "./MembershipPolicyPage";

vi.mock("./membership/use-membership-data", () => ({
  useMembershipData: () => ({
    catalog: null,
    catalogStatus: "ready",
    retryCatalog: () => undefined,
    overview: null,
    overviewStatus: "ready",
    retryOverview: () => undefined,
  }),
}));

afterEach(cleanup);

describe("MembershipPolicyPage", () => {
  it("첫 화면 요약에 정책 소스에서 읽은 등급·활동·유효기간 수치를 보여 준다", () => {
    render(
      <MemoryRouter>
        <MembershipPolicyPage />
      </MemoryRouter>,
    );

    const summary = screen.getByLabelText("정책 핵심 수치");
    expect(summary.textContent).toContain("멤버십 등급");
    expect(summary.textContent).toContain(String(Object.values(MEMBERSHIP_PLAN_POLICIES).length));
    expect(summary.textContent).toContain("포인트 적립 활동");
    expect(summary.textContent).toContain(String(Object.values(ACTIVITY_POINT_POLICIES).length));
    expect(summary.textContent).toContain("포인트 유효기간");
    const expiry = MEMBERSHIP_ECONOMY_POLICY.pointExpiryDays;
    expect(summary.textContent).toContain(expiry == null ? "무기한" : `${expiry}일`);
  });
});
