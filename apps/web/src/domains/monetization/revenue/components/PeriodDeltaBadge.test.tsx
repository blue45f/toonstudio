// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PeriodDeltaBadge } from "./PeriodDeltaBadge";

const PROPS = { label: "전월 대비", noPreviousLabel: "이전 기간 기록 없음" };

describe("PeriodDeltaBadge", () => {
  it("증가하면 +기호와 함께 비율을 보여준다", () => {
    render(<PeriodDeltaBadge current={1124} previous={1000} {...PROPS} />);
    expect(screen.getByText(/전월 대비 \+12\.4%/)).toBeTruthy();
  });

  it("감소하면 −비율을 보여준다", () => {
    render(<PeriodDeltaBadge current={900} previous={1000} {...PROPS} />);
    expect(screen.getByText(/전월 대비 -10\.0%/)).toBeTruthy();
  });

  it("이전 기간 기록이 없으면 비율 대신 그 사실을 표기한다", () => {
    render(<PeriodDeltaBadge current={5000} previous={0} {...PROPS} />);
    expect(screen.getByText("이전 기간 기록 없음")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("두 기간 모두 0이면 배지를 그리지 않는다", () => {
    const { container } = render(<PeriodDeltaBadge current={0} previous={0} {...PROPS} />);
    expect(container.firstChild).toBeNull();
  });
});
