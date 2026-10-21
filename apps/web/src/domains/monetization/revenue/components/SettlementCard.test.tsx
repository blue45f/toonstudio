// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "../../monetization-i18n";
import { SettlementCard } from "./SettlementCard";
import { PAYOUT_SUBMISSION_ENABLED } from "../models/payout-availability";

describe("SettlementCard", () => {
  it("정산 숫자와 분리해 출금 연결 전 상태를 카드 안에 고지한다", () => {
    // 출금 제출이 꺼져 있는 동안만 이 고지가 나간다. 켜지면 이 테스트가
    // 실패해 고지 문구와 실제 상태를 다시 맞추게 한다.
    expect(PAYOUT_SUBMISSION_ENABLED).toBe(false);
    render(<SettlementCard grossKrw={100_000} />);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("준비 중");
  });
});
