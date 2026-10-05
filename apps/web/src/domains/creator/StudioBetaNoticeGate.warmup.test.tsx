// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioBetaNoticeGate } from "./StudioBetaNoticeGate";

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));

vi.mock("@/platform/service-capability-state", () => ({
  useServiceCapabilityState: () => mocks.state,
}));

const baseState = {
  checking: false,
  report: null,
  lastError: null,
  nextProbeAt: null,
  recoveredAt: null,
};

const initialLanguage = useI18n.getState().lang;

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
  mocks.state = { ...baseState, status: "degraded", warmingUp: true };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useI18n.setState({ lang: initialLanguage });
});

describe("StudioBetaNoticeGate 서비스 웜업 순차 표시", () => {
  it("연결 준비(웜업) 칩이 떠 있는 동안에는 베타 안내를 열지 않는다", () => {
    render(<StudioBetaNoticeGate pathname="/studio" />);

    expect(screen.queryByRole("region")).toBeNull();
    expect(document.querySelector("[data-studio-beta-notice-host]")).toBeNull();
  });

  it("웜업이 끝나면 같은 방문에서도 베타 안내가 이어서 열린다", () => {
    const { rerender } = render(<StudioBetaNoticeGate pathname="/studio" />);
    expect(screen.queryByRole("region")).toBeNull();

    mocks.state = { ...baseState, status: "available", warmingUp: false };
    rerender(<StudioBetaNoticeGate pathname="/studio" />);

    expect(
      screen.getByRole("region", {
        name: "툰스튜디오는 현재 베타 테스트 중입니다",
      }),
    ).toBeTruthy();
  });

  it("웜업이 아닌 연결 저하에서는 안내를 미루지 않는다", () => {
    mocks.state = { ...baseState, status: "degraded", warmingUp: false };
    render(<StudioBetaNoticeGate pathname="/" />);

    expect(screen.getByRole("region")).toBeTruthy();
  });

  it("서비스 상태를 아직 모르는 동안에도 안내를 미루지 않는다", () => {
    mocks.state = { ...baseState, status: "unknown", warmingUp: true };
    render(<StudioBetaNoticeGate pathname="/" />);

    expect(screen.getByRole("region")).toBeTruthy();
  });
});
