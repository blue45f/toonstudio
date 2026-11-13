// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CreatorRevenueDashboardPage } from "./CreatorRevenueDashboardPage";

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({
    data: { user: { id: "creator-1", name: "작가" } },
    ready: true,
    status: "authenticated",
  }),
}));

const initialI18n = useI18n.getState();

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState(initialI18n);
});

describe("CreatorRevenueDashboardPage", () => {
  it("REA 수익원 믹스·세무 정산 벤치마크 워크벤치를 렌더링하고 양방향 상태를 전환한다", () => {
    render(
      <MemoryRouter>
        <CreatorRevenueDashboardPage />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("revenue-dashboard-rea-payout-bar");
    expect(bar.textContent).toContain("Patreon · Pixiv Fanbox · Gumroad · Naver PPS · Postype");

    const mixFastpass = screen.getByTestId("revenue-rea-mix-fastpass-cookie-pps");
    const mixFanbox = screen.getByTestId("revenue-rea-mix-fanbox-patreon-membership");
    const mixRoyalty = screen.getByTestId("revenue-rea-mix-3d-brush-asset-royalty");

    expect(mixFastpass.getAttribute("aria-pressed")).toBe("true");
    expect(mixFanbox.getAttribute("aria-pressed")).toBe("false");
    expect(mixRoyalty.getAttribute("aria-pressed")).toBe("false");

    const taxKr = screen.getByTestId("revenue-rea-tax-kr-withholding-33pct");
    const taxUs = screen.getByTestId("revenue-rea-tax-us-w8ben-treaty");
    const taxSplit = screen.getByTestId("revenue-rea-tax-studio-split-70-30");

    expect(taxKr.getAttribute("aria-pressed")).toBe("true");
    expect(taxUs.getAttribute("aria-pressed")).toBe("false");
    expect(taxSplit.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("revenue-dashboard-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("미리보기 쿠키·PPS 정산");
    expect(status.textContent).toContain("국내 원천징수 3.3%");

    fireEvent.click(mixFanbox);
    expect(mixFanbox.getAttribute("aria-pressed")).toBe("true");
    expect(mixFastpass.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("팬박스·패트리온 구독");

    fireEvent.click(taxUs);
    expect(taxUs.getAttribute("aria-pressed")).toBe("true");
    expect(taxKr.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("미국 W-8BEN 조세조약");

    fireEvent.click(mixRoyalty);
    fireEvent.click(taxSplit);
    expect(mixRoyalty.getAttribute("aria-pressed")).toBe("true");
    expect(taxSplit.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("3D 배경·브러시 로열티");
    expect(status.textContent).toContain("스튜디오 7:3 배분");
  });

  it("영어 로케일(en)에서 REA 워크벤치에 한글이 섞이지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <CreatorRevenueDashboardPage />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("revenue-dashboard-rea-payout-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("revenue-rea-mix-3d-brush-asset-royalty"));
    fireEvent.click(screen.getByTestId("revenue-rea-tax-studio-split-70-30"));
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("revenue-dashboard-rea-status").textContent).toContain("3D Asset & Brush Royalty");
    expect(screen.getByTestId("revenue-dashboard-rea-status").textContent).toContain("Studio 70:30 Split");
  });
});


it("실제 수익 요약을 정산 시뮬레이터보다 먼저 보여 주고 예시를 명시적으로 연다", () => {
  render(<MemoryRouter><CreatorRevenueDashboardPage /></MemoryRouter>);
  const actual = screen.getByRole("region", { name: "수익 요약" });
  const examples = screen.getByTestId("revenue-dashboard-rea-payout-bar");
  const details = examples.closest("details");
  expect(actual.closest("details")).toBeNull();
  expect(actual.compareDocumentPosition(examples) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(details?.open).toBe(false);
  const summary = details?.querySelector("summary");
  if (!summary) throw new Error("정산 시뮬레이터 누락");
  fireEvent.click(summary);
  fireEvent.click(screen.getByTestId("revenue-rea-tax-us-w8ben-treaty"));
  expect(screen.getByRole("region", { name: "수익 요약" })).toBe(actual);
  expect(examples.closest("details")?.open).toBe(true);
});
