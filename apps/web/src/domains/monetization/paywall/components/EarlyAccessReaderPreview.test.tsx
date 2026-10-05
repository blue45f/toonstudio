// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EarlyAccessReaderPreview } from "./EarlyAccessReaderPreview";
import type { EarlyAccessPolicy } from "../models/paywall-model";

const POLICY: EarlyAccessPolicy = {
  id: "policy-1",
  creatorId: "creator-1",
  titleId: "my-series",
  titleName: "달빛 연대기",
  enabled: true,
  earlyAccessDays: 14,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const storeMock = vi.hoisted(() => ({ policy: null as EarlyAccessPolicy | null }));

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
  getLang: () => "ko",
}));

vi.mock("../models/paywall-store", () => ({
  getEarlyAccessPolicy: () => storeMock.policy,
  subscribePaywallStore: () => () => {},
}));

const NOW = new Date("2026-10-06T12:00:00.000Z");

describe("EarlyAccessReaderPreview", () => {
  it("정책 기간으로 시나리오를 만들고 실제 판정으로 잠금 상태를 보여준다", () => {
    storeMock.policy = POLICY;
    render(<EarlyAccessReaderPreview policy={POLICY} now={NOW} />);

    // 오늘 공개: 일반 독자는 14일 잠금, 서포터는 열람 가능
    expect(screen.getByText("paywall.preview.scenarioToday")).toBeTruthy();
    expect(screen.getByText('paywall.preview.locked({"days":14})')).toBeTruthy();
    // 기간 중간(7일 전 공개): 7일 남음
    expect(screen.getByText('paywall.preview.scenarioMid({"days":7})')).toBeTruthy();
    expect(screen.getByText('paywall.preview.locked({"days":7})')).toBeTruthy();
    expect(screen.getAllByText("paywall.preview.supporterOpen")).toHaveLength(2);
    // 기간 경과: 전체 공개
    expect(screen.getByText("paywall.preview.scenarioOpen")).toBeTruthy();
    expect(screen.getAllByText("paywall.preview.open").length).toBeGreaterThanOrEqual(2);
    // 작품 페이지 실제 안내 컴포넌트가 그대로 들어간다
    expect(screen.getByText("paywall.titleNotice.title")).toBeTruthy();
  });

  it("정책이 꺼져 있으면 모든 시나리오가 전체 공개이고 그 사실을 알린다", () => {
    const disabled = { ...POLICY, enabled: false };
    storeMock.policy = disabled;
    render(<EarlyAccessReaderPreview policy={disabled} now={NOW} />);

    expect(screen.getByText("paywall.preview.disabledNote")).toBeTruthy();
    expect(screen.queryByText(/paywall\.preview\.locked/)).toBeNull();
    expect(screen.queryByText("paywall.titleNotice.title")).toBeNull();
  });

  it("기간이 1일이면 중간 시나리오 없이 오늘·경과만 보여준다", () => {
    storeMock.policy = POLICY;
    render(<EarlyAccessReaderPreview policy={{ ...POLICY, earlyAccessDays: 1 }} now={NOW} />);

    expect(screen.getByText("paywall.preview.scenarioToday")).toBeTruthy();
    expect(screen.queryByText(/paywall\.preview\.scenarioMid/)).toBeNull();
    expect(screen.getByText("paywall.preview.scenarioOpen")).toBeTruthy();
  });
});
