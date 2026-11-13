// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketComparePage } from "./MarketComparePage";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

const comparison = vi.hoisted(() => ({
  items: [] as readonly CreatorMarketplaceResourceRecord[],
  removeCompare: vi.fn(),
  clearCompare: vi.fn(),
}));

vi.mock("../hooks/use-market-compare", () => ({
  MARKET_COMPARE_MAX_ITEMS: 4,
  useMarketCompare: () => ({
    compareItems: comparison.items,
    compareCount: comparison.items.length,
    removeCompare: comparison.removeCompare,
    clearCompare: comparison.clearCompare,
  }),
}));

vi.mock("../components/MarketNavHeader", () => ({
  MarketNavHeader: () => <nav aria-label="마켓 주요 내비게이션" />,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
}));

beforeEach(() => {
  comparison.items = CREATOR_MARKETPLACE_STARTER_RECORDS.slice(0, 2);
  vi.clearAllMocks();
});

afterEach(cleanup);

function renderPage() {
  return render(<MemoryRouter><MarketComparePage /></MemoryRouter>);
}

describe("MarketComparePage", () => {
  it("uses native buttons to move the named comparison viewport in both directions", () => {
    renderPage();
    const viewport = screen.getByRole("region", { name: "에셋 manifest 비교표" });
    const previous = screen.getByRole("button", { name: "이전 열 보기" });
    const next = screen.getByRole("button", { name: "다음 열 보기" });

    expect(viewport.getAttribute("tabindex")).toBeNull();
    expect(previous.tagName).toBe("BUTTON");
    expect(next.tagName).toBe("BUTTON");
    expect(previous.getAttribute("aria-controls")).toBe(viewport.id);
    expect(next.getAttribute("aria-controls")).toBe(viewport.id);
    expect(screen.getByRole("table")).toBeTruthy();

    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 600 });
    viewport.scrollLeft = 0;
    fireEvent.click(next);
    expect(viewport.scrollLeft).toBe(480);
    fireEvent.click(previous);
    expect(viewport.scrollLeft).toBe(0);

    const diffToggle = screen.getByTestId("market-compare-diff-toggle");
    expect(diffToggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(diffToggle);
    expect(diffToggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the empty state free of scroll controls for a missing table", () => {
    comparison.items = [];
    renderPage();

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "다음 열 보기" })).toBeNull();
    expect(screen.getByRole("link", { name: "에셋 탐색" }).getAttribute("href"))
      .toBe("/market/browse");
  });

  it("renders production profile fit evaluation row, Fit Lab link, and Markdown export", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPage();

    expect(screen.getByRole("rowheader", { name: /내 작업 프로필 적합성/u })).toBeTruthy();
    expect(screen.getByRole("link", { name: "적합성 프로필 설정" }).getAttribute("href"))
      .toBe("/market/fit-lab");

    fireEvent.click(screen.getByRole("button", { name: "비교표 Markdown 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String(writeText.mock.calls[0]?.[0] ?? "")).toContain("| 비교 항목 |");
    expect(String(writeText.mock.calls[0]?.[0] ?? "")).toContain("내 작업 프로필 적합성");
    expect(screen.getByRole("button", { name: "비교표 복사됨" })).toBeTruthy();
  });
});


it("실제 비교표는 전문 시뮬레이터보다 먼저 보이고 기존 시트·스펙 조작은 명시 영역에 남는다", () => {
  renderPage();
  const table = screen.getByRole("table");
  const tools = screen.getByTestId("market-compare-rea-spec-matrix-bar");
  const details = tools.closest("details");
  expect(table.closest("details")).toBeNull();
  expect(table.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(details?.open).toBe(false);
  const summary = details?.querySelector("summary");
  if (!summary) throw new Error("비교 전문 도구 누락");
  fireEvent.click(summary);
  expect(details?.open).toBe(true);
  expect(tools.querySelectorAll("button").length).toBeGreaterThan(0);
});
