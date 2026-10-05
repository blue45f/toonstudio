// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RevenueSpectrumBar } from "./RevenueSpectrumBar";
import type { RevenueSourceSummary } from "../models/revenue-model";

const LABELS: Record<string, string> = {
  tips: "후원",
  membership: "멤버십",
  "early-access": "얼리 액세스",
  market: "마켓 판매",
  custom: "기타",
};

function bucket(
  sourceId: RevenueSourceSummary["sourceId"],
  amount: number,
): RevenueSourceSummary {
  return { sourceId, label: LABELS[sourceId] ?? sourceId, amount, count: 1 };
}

describe("RevenueSpectrumBar", () => {
  it("구간 너비가 실제 금액 비중과 같고 범례에 %가 표시된다", () => {
    const { container } = render(
      <RevenueSpectrumBar
        bySource={[bucket("tips", 380), bucket("membership", 400), bucket("market", 220)]}
        total={1000}
        sourceLabel={(sourceId) => LABELS[sourceId] ?? sourceId}
      />,
    );

    const bar = container.querySelector("[aria-hidden].flex");
    const segments = bar ? [...bar.children] : [];
    expect(segments).toHaveLength(3);
    expect((segments[0] as HTMLElement).style.width).toBe("38%");
    expect((segments[1] as HTMLElement).style.width).toBe("40%");
    expect((segments[2] as HTMLElement).style.width).toBe("22%");

    expect(screen.getByText("후원")).toBeTruthy();
    expect(screen.getByText("38%")).toBeTruthy();
    expect(screen.getByText("멤버십")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
  });

  it("금액이 0인 수익원은 구간과 범례에서 빠진다", () => {
    render(
      <RevenueSpectrumBar
        bySource={[bucket("tips", 100), bucket("market", 0)]}
        total={100}
        sourceLabel={(sourceId) => LABELS[sourceId] ?? sourceId}
      />,
    );
    expect(screen.queryByText("마켓 판매")).toBeNull();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("총액이 0이면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <RevenueSpectrumBar
        bySource={[bucket("tips", 0)]}
        total={0}
        sourceLabel={(sourceId) => LABELS[sourceId] ?? sourceId}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
