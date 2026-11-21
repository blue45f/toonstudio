// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SIMULATOR_INPUT,
  loadSimulatorInput,
  saveSimulatorInput,
  simulateCreatorRevenue,
} from "../models/revenue-simulator";
import { CreatorRevenueSimulatorPanel } from "./CreatorRevenueSimulatorPanel";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("revenue-simulator 계산 모델 & 로컬 영속", () => {
  it("세무·배분 체계별 수수료·파트너 배분·원천징수·실수령액 합이 총매출과 일치한다", () => {
    const studioResult = simulateCreatorRevenue({
      revenueMix: "ip-season-funding-royalty",
      taxRegime: "studio-split-70-30",
      paidReaders: 500,
      membershipSubscribers: 100,
      monthlyTipsKrw: 300_000,
      monthlyAssetSalesKrw: 200_000,
      monthlyGoalKrw: 2_000_000,
    });

    expect(studioResult.grossKrw).toBe(500 * 2400 + 100 * 6900 + 300_000 + 200_000);
    expect(studioResult.partnerSplitKrw).toBeGreaterThan(0);
    expect(
      studioResult.netCreatorKrw
        + studioResult.partnerSplitKrw
        + studioResult.taxWithholdingKrw
        + studioResult.platformAndPgFeeKrw,
    ).toBe(studioResult.grossKrw);

    saveSimulatorInput({ ...DEFAULT_SIMULATOR_INPUT, paidReaders: 850 });
    expect(loadSimulatorInput().paidReaders).toBe(850);
  });
});

describe("CreatorRevenueSimulatorPanel UI", () => {
  it("시나리오 프리셋 전환, 슬라이더 스텝 증감, 세무 전환 및 로컬 복원이 동작한다", () => {
    const { unmount } = render(<CreatorRevenueSimulatorPanel isKo />);

    const initialNet = screen.getByTestId("revenue-sim-net-output").textContent;
    fireEvent.click(screen.getByTestId("revenue-sim-preset-studio-team"));
    expect(screen.getByTestId("revenue-sim-preset-studio-team").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("revenue-sim-net-output").textContent).not.toBe(initialNet);
    expect(screen.getByTestId("revenue-rea-tax-studio-split-70-30").getAttribute("aria-pressed")).toBe("true");

    const beforeValue = screen.getByTestId("revenue-sim-value-paidReaders").textContent;
    fireEvent.click(screen.getByTestId("revenue-sim-inc-paidReaders"));
    expect(screen.getByTestId("revenue-sim-value-paidReaders").textContent).not.toBe(beforeValue);

    unmount();
    render(<CreatorRevenueSimulatorPanel isKo />);
    expect(screen.getByTestId("revenue-rea-tax-studio-split-70-30").getAttribute("aria-pressed")).toBe("true");
  });

  it("영어 모드(isKo=false)에서 한글 문자가 단 하나도 노출되지 않는다", () => {
    render(<CreatorRevenueSimulatorPanel isKo={false} />);
    const root = screen.getByTestId("revenue-dashboard-rea-payout-bar");
    expect(root.textContent).not.toMatch(/[가-힣]/u);
  });
});
