// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebVitalsDashboardPage } from "./WebVitalsDashboardPage";
import type { WebVitalsReport } from "./web-vitals-types";

const api = vi.hoisted(() => ({
  state: {
    data: null as WebVitalsReport | null,
    loading: false,
    error: null as string | null,
    notFound: false,
    appError: null,
    stale: false,
  },
  reload: vi.fn(),
}));

vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({ ...api.state, reload: api.reload }),
}));

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));

vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/components/ui/button-utils", () => ({
  buttonClass: () => "",
}));

afterEach(() => {
  cleanup();
  api.state.data = null;
  api.state.error = null;
});

const REGRESSED_REPORT: WebVitalsReport = {
  generatedAt: "2026-10-14T00:00:00.000Z",
  windowDays: 30,
  status: "regressed",
  paths: [
    {
      path: "/",
      status: "fail",
      metrics: [
        { metric: "LCP", samples: 120, p75: 4_500, rating: "poor", status: "fail" },
        { metric: "CLS", samples: 120, p75: 0.05, rating: "good", status: "pass" },
        { metric: "INP", samples: 4, p75: null, rating: null, status: "insufficient-data" },
      ],
    },
  ],
  alerts: [
    {
      kind: "rating-regression",
      severity: "critical",
      path: "/",
      metric: "LCP",
      currentP75: 4_500,
      previousP75: 2_000,
      currentRating: "poor",
      previousRating: "good",
      message: "/ LCP p75가 2000ms에서 4500ms로 나빠졌어요.",
    },
  ],
};

describe("WebVitalsDashboardPage (G6)", () => {
  it("shows regression alerts first, then per-path p75 with ratings", () => {
    api.state.data = REGRESSED_REPORT;
    render(<WebVitalsDashboardPage />);

    expect(screen.getByText("회귀 경보 1건")).toBeTruthy();
    expect(screen.getByText(/LCP p75가 2000ms에서 4500ms로 나빠졌어요/)).toBeTruthy();
    expect(screen.getByText("4.50초")).toBeTruthy();
    expect(screen.getByText("나쁨")).toBeTruthy();
    expect(screen.getByText("기준 미달")).toBeTruthy();
  });

  it("renders insufficient-data metrics without inventing numbers", () => {
    api.state.data = REGRESSED_REPORT;
    render(<WebVitalsDashboardPage />);

    expect(screen.getByText("표본 부족")).toBeTruthy();
    expect(screen.getByText("표본 4건")).toBeTruthy();
  });

  it("shows an honest empty state before any field data exists", () => {
    api.state.data = {
      generatedAt: "2026-10-14T00:00:00.000Z",
      windowDays: 30,
      status: "insufficient-data",
      paths: [],
      alerts: [],
    };
    render(<WebVitalsDashboardPage />);

    expect(
      screen.getByText(/아직 수집된 실측 데이터가 없어요/),
    ).toBeTruthy();
    expect(screen.queryByText(/회귀 경보/)).toBeNull();
  });

  it("offers a retry when the report fails to load", () => {
    api.state.error = "network";
    render(<WebVitalsDashboardPage />);

    expect(screen.getByText(/성능 실측을 불러오지 못했어요/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeTruthy();
  });
});
