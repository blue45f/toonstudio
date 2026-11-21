/**
 * 요금제 3초 작업 스타일 맞춤 등급 진단기 — 순수 정책 모델 및 컴포넌트 단위 테스트.
 */

// @vitest-environment jsdom

import { useMemo, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MEMBERSHIP_ECONOMY_POLICY, MEMBERSHIP_PLAN_POLICIES } from "@toonstudio/core/membership-wallet";

import { useI18n } from "@/shared/lib/i18n";

import { PricingWorkstyleMatcher } from "./PricingWorkstyleMatcher";
import {
  clampCollaborators,
  getDefaultInputForWorkstyle,
  matchMembershipPlanByWorkstyle,
  PRICING_WORKSTYLE_PRESETS,
  type PricingWorkstyleInput,
} from "./pricing-workstyle-matcher";

function MatcherHarness({
  initialWorkstyle = "solo-starter",
}: {
  readonly initialWorkstyle?: PricingWorkstyleInput["workstyle"];
}) {
  const [input, setInput] = useState<PricingWorkstyleInput>(() =>
    getDefaultInputForWorkstyle(initialWorkstyle),
  );
  const match = useMemo(() => matchMembershipPlanByWorkstyle(input), [input]);
  return (
    <MemoryRouter initialEntries={["/pricing"]}>
      <PricingWorkstyleMatcher input={input} match={match} onChangeInput={setInput} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

describe("pricing-workstyle-matcher 순수 모델", () => {
  it("4개 작업 형태 프리셋의 모든 수치를 실제 MEMBERSHIP_PLAN_POLICIES에서 그대로 도출한다", () => {
    for (const preset of PRICING_WORKSTYLE_PRESETS) {
      const match = matchMembershipPlanByWorkstyle(getDefaultInputForWorkstyle(preset.id));
      const policy = MEMBERSHIP_PLAN_POLICIES[preset.basePlanId];

      expect(match.planId).toBe(policy.id);
      expect(match.planLabel).toBe(policy.label);
      expect(match.metrics.storageBytes).toBe(Number(policy.entitlements["storage.bytes"]));
      expect(match.metrics.aiMonthlyTokens).toBe(Number(policy.entitlements["ai.monthlyTokens"]));
      expect(match.metrics.creditMonthlyIncluded).toBe(Number(policy.entitlements["credit.monthlyIncluded"]));
      expect(match.metrics.collaborationMembers).toBe(Number(policy.entitlements["collaboration.members"]));
      expect(match.metrics.marketSell).toBe(Boolean(policy.entitlements["market.sell"]));
      expect(match.metrics.highResolutionExport).toBe(Boolean(policy.entitlements["export.highResolution"]));
      expect(match.paymentsEnabled).toBe(MEMBERSHIP_ECONOMY_POLICY.paymentsEnabled);
    }
  });

  it("혼자 입문에서 마켓 판매·고해상도를 켜면 실제 정책 기준으로 Creator로 승격한다", () => {
    const match = matchMembershipPlanByWorkstyle({
      workstyle: "solo-starter",
      collaborators: 1,
      needsMarketOrHiRes: true,
    });
    expect(match.planId).toBe("creator");
    expect(match.upgradedBy).toBe("market-hires");
    expect(match.metrics.marketSell).toBe(true);
    expect(match.metrics.highResolutionExport).toBe(true);
    expect(match.ctaHref).toBe("/membership");
  });

  it("협업 인원이 Free 한도(3명)나 Creator 한도(8명)를 넘으면 다음 적정 등급으로 승격한다", () => {
    const fourMembers = matchMembershipPlanByWorkstyle({
      workstyle: "solo-starter",
      collaborators: 4,
      needsMarketOrHiRes: false,
    });
    expect(fourMembers.planId).toBe("creator");
    expect(fourMembers.upgradedBy).toBe("collaborators");

    const nineMembers = matchMembershipPlanByWorkstyle({
      workstyle: "steady-serial",
      collaborators: 9,
      needsMarketOrHiRes: true,
    });
    expect(nineMembers.planId).toBe("pro");
    expect(nineMembers.upgradedBy).toBe("collaborators");

    const bothUpgraded = matchMembershipPlanByWorkstyle({
      workstyle: "solo-starter",
      collaborators: 9,
      needsMarketOrHiRes: true,
    });
    expect(bothUpgraded.planId).toBe("pro");
    expect(bothUpgraded.upgradedBy).toBe("both");
  });

  it("협업 인원 경계를 1~10명으로 안전하게 정규화한다", () => {
    expect(clampCollaborators(0)).toBe(1);
    expect(clampCollaborators(-5)).toBe(1);
    expect(clampCollaborators(15)).toBe(10);
    expect(clampCollaborators(Number.NaN)).toBe(1);
    expect(clampCollaborators(4.6)).toBe(5);
  });

  it("Free는 무료 시작 경로, 상위 등급은 멤버십 정책 경로만 반환한다(결제 경로 없음)", () => {
    const freeMatch = matchMembershipPlanByWorkstyle(getDefaultInputForWorkstyle("solo-starter"));
    expect(freeMatch.ctaHref).toBe("/studio/new");

    for (const id of ["steady-serial", "pro-market", "studio-team"] as const) {
      const match = matchMembershipPlanByWorkstyle(getDefaultInputForWorkstyle(id));
      expect(match.ctaHref).toBe("/membership");
      expect(match.ctaLabelKo).not.toContain("결제");
      expect(match.ctaLabelEn.toLowerCase()).not.toContain("pay");
    }
  });
});

describe("PricingWorkstyleMatcher 컴포넌트", () => {
  it("4개 프리셋 버튼이 44px 규격을 지키고 실제 정책 수치와 CTA를 전환한다", () => {
    render(<MatcherHarness />);

    const presetExpectations = [
      { presetId: "steady-serial", expectedPlan: "creator", expectedHref: "/membership", expectedStorage: "100GB" },
      { presetId: "pro-market", expectedPlan: "pro", expectedHref: "/membership", expectedStorage: "500GB" },
      { presetId: "studio-team", expectedPlan: "team", expectedHref: "/membership", expectedStorage: "1,000GB" },
      { presetId: "solo-starter", expectedPlan: "free", expectedHref: "/studio/new", expectedStorage: "10GB" },
    ] as const;

    for (const item of presetExpectations) {
      const btn = screen.getByTestId(`workstyle-preset-${item.presetId}`);
      expect(btn.className).toContain("min-h-11");
      fireEvent.click(btn);

      expect(btn.getAttribute("aria-pressed")).toBe("true");
      const result = screen.getByTestId("pricing-matcher-result");
      expect(result.getAttribute("data-matched-plan-id")).toBe(item.expectedPlan);
      expect(result.textContent).toContain(item.expectedStorage);

      const cta = screen.getByTestId("pricing-matcher-cta");
      expect(cta.getAttribute("href")).toBe(item.expectedHref);
      expect(cta.className).toContain("min-h-11");
    }
  });

  it("협업 인원 증가와 마켓 판매·고해상도 토글로 실시간 추천 등급이 승격한다", () => {
    render(<MatcherHarness />);

    const inc = screen.getByTestId("workstyle-collab-increase");
    const dec = screen.getByTestId("workstyle-collab-decrease");
    const toggle = screen.getByTestId("workstyle-market-hires-toggle");
    expect(inc.className).toContain("min-h-11");
    expect(dec.className).toContain("min-h-11");
    expect(toggle.className).toContain("min-h-11");

    // 1명에서 마켓 판매·고해상도 토글 -> Creator
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("pricing-matcher-result").getAttribute("data-matched-plan-id")).toBe("creator");

    // 토글 해제 -> 다시 Free
    fireEvent.click(toggle);
    expect(screen.getByTestId("pricing-matcher-result").getAttribute("data-matched-plan-id")).toBe("free");

    // 1명 -> 4명 증가 (Free 한도 3명 초과 -> Creator)
    fireEvent.click(inc);
    fireEvent.click(inc);
    fireEvent.click(inc);
    expect(screen.getByTestId("workstyle-collab-value").textContent).toBe("4명");
    expect(screen.getByTestId("pricing-matcher-result").getAttribute("data-matched-plan-id")).toBe("creator");

    // 4명 -> 9명 증가 (Creator 한도 8명 초과 -> Pro)
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(inc);
    }
    expect(screen.getByTestId("workstyle-collab-value").textContent).toBe("9명");
    expect(screen.getByTestId("pricing-matcher-result").getAttribute("data-matched-plan-id")).toBe("pro");
  });

  it("영어 로케일(en)에서는 진단기에 한글이 섞이지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(<MatcherHarness />);

    const matcher = screen.getByTestId("pricing-workstyle-matcher");
    expect(matcher.textContent).not.toMatch(/[가-힣]/u);
    expect(matcher.textContent).toContain("Find your fit in 3 seconds");
    expect(matcher.textContent).toContain("Best fit: Free");

    fireEvent.click(screen.getByTestId("workstyle-preset-studio-team"));
    expect(matcher.textContent).not.toMatch(/[가-힣]/u);
    expect(matcher.textContent).toContain("Best fit: Team");
  });
});
