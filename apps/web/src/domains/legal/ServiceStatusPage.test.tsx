// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceStatusPage } from "./ServiceStatusPage";

import { AppApiError } from "@/platform/api-error";
import type { ServiceCapabilitySnapshot } from "@/platform/service-capability-state";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  state: {} as ServiceCapabilitySnapshot,
}));

vi.mock("@/platform/service-capability-state", () => ({
  requestServiceCapabilityRefresh: mocks.refresh,
  useServiceCapabilityState: () => mocks.state,
}));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
}));

function show() {
  return render(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
}

function degradedReport(): NonNullable<ServiceCapabilitySnapshot["report"]> {
  return {
    status: "degraded",
    incidentId: "inc_status",
    retryAfterSeconds: 30,
    checkedAt: "2026-09-25T20:00:00.000Z",
    capabilities: {
      publicCatalog: "available",
      authSession: "degraded",
      communityRead: "unavailable",
      communityWrite: "unavailable",
      marketplaceRead: "unavailable",
      studioLocalEditing: "available",
      studioProjectRead: "unavailable",
      studioCloudSave: "unavailable",
      realtimeCollaboration: "unavailable",
      publishing: "unavailable",
      serverAi: "degraded",
    },
  };
}

beforeEach(() => {
  mocks.state = {
    status: "unknown",
    checking: false,
    report: null,
    lastError: null,
    nextProbeAt: null,
    recoveredAt: null,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ServiceStatusPage", () => {
  it("첫 확인 전에는 정상을 주장하지 않고 재확인과 제보 경로를 제공한다", () => {
    show();
    expect(screen.getByRole("heading", { level: 1 }).textContent)
      .toContain("아직 확인하지 못했습니다");
    expect(screen.queryByText("현재 주요 기능이 정상입니다.")).toBeNull();
    expect(screen.getByText("기능 상태를 아직 확인하지 못했습니다.")).toBeTruthy();
    expect(screen.getByText("확인 전")).toBeTruthy();
    expect(screen.getByRole("link", { name: "문제 제보하기" }).getAttribute("href")).toBe("/feedback");
    fireEvent.click(screen.getByRole("button", { name: "지금 다시 확인" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("기능 11개의 상태를 아이콘과 글자로 보존하고 마지막 성공 시각을 표시한다", () => {
    mocks.state = { ...mocks.state, status: "degraded", report: degradedReport() };
    show();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("일부 온라인 기능이 제한");
    expect(screen.getByText("inc_status")).toBeTruthy();
    expect(screen.getByText("최근 성공한 확인")).toBeTruthy();
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-25T20:00:00.000Z");
    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(cards).toHaveLength(11);
    expect(screen.getByText("Studio 로컬 편집")).toBeTruthy();
    for (const card of cards) {
      expect(card.querySelector("svg[aria-hidden='true']")).toBeTruthy();
      expect(card.textContent).toMatch(/정상|일부 제한|일시 중지/);
    }
  });

  it("재확인 중에는 기존 결과를 유지하고 중복 요청을 막는다", () => {
    mocks.state = { ...mocks.state, status: "degraded", report: degradedReport(), checking: true };
    show();
    expect(screen.getByRole("list").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("새 상태를 확인하고 있습니다. 마지막 확인 결과는 그대로 표시됩니다.")).toBeTruthy();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(11);
    fireEvent.click(screen.getByRole("button", { name: "상태 확인 중" }));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("초기 로딩을 빈 결과와 구분한다", () => {
    mocks.state = { ...mocks.state, checking: true };
    show();
    expect(screen.getByText("기능 상태를 확인하고 있습니다.")).toBeTruthy();
    expect(screen.queryByText("기능 상태를 아직 확인하지 못했습니다.")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("실패 안내를 이전 결과보다 앞에 두고 요청 ID와 재시도·도움말을 보존한다", () => {
    mocks.state = {
      ...mocks.state, status: "degraded", report: degradedReport(),
      lastError: new AppApiError("연결 실패", { kind: "server", requestId: "req_" + "long".repeat(50) }),
    };
    show();
    const alert = screen.getByRole("alert");
    const list = screen.getByRole("list");
    expect(alert.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.textContent).toContain("req_" + "long".repeat(50));
    expect(screen.getByText(/아래 기능별 상태는 마지막으로 확인된 결과입니다/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "도움말 보기" }).getAttribute("href")).toBe("/help");
    fireEvent.click(screen.getByRole("button", { name: "상태 확인 다시 시도" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("실패 뒤 성공하면 사라진 재시도 버튼의 초점을 주 행동으로 복구한다", () => {
    mocks.state = { ...mocks.state, lastError: new AppApiError("연결 실패", { kind: "server" }) };
    const view = show();
    const retry = screen.getByRole("button", { name: "상태 확인 다시 시도" });
    retry.focus();
    fireEvent.click(retry);
    mocks.state = { ...mocks.state, checking: true };
    view.rerender(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
    expect(screen.getAllByRole("button", { name: "상태 확인 중" }).every(button => button.hasAttribute("disabled"))).toBe(true);
    mocks.state = { ...mocks.state, checking: false, lastError: null, report: degradedReport(), status: "degraded" };
    view.rerender(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "지금 다시 확인" }));
  });

  it("재시도가 다시 실패해도 비활성화로 잃은 초점을 복구한다", () => {
    mocks.state = { ...mocks.state, lastError: new AppApiError("첫 실패", { kind: "server" }) };
    const view = show();
    const retry = screen.getByRole("button", { name: "상태 확인 다시 시도" });
    retry.focus();
    fireEvent.click(retry);
    mocks.state = { ...mocks.state, checking: true };
    view.rerender(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
    retry.blur();
    mocks.state = { ...mocks.state, checking: false, lastError: new AppApiError("다시 실패", { kind: "server" }) };
    view.rerender(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "상태 확인 다시 시도" }));
  });

  it("헤더의 재확인도 요청 완료 후 같은 버튼으로 초점을 복구한다", () => {
    const view = show();
    const refresh = screen.getByRole("button", { name: "지금 다시 확인" });
    refresh.focus();
    fireEvent.click(refresh);
    mocks.state = { ...mocks.state, checking: true };
    view.rerender(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
    refresh.blur();
    mocks.state = { ...mocks.state, checking: false };
    view.rerender(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "지금 다시 확인" }));
  });

  it("재확인 동안 다른 행동으로 이동한 초점은 빼앗지 않는다", () => {
    mocks.state = { ...mocks.state, lastError: new AppApiError("연결 실패", { kind: "server" }) };
    const view = show();
    fireEvent.click(screen.getByRole("button", { name: "상태 확인 다시 시도" }));
    mocks.state = { ...mocks.state, checking: true };
    view.rerender(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
    const report = screen.getByRole("link", { name: "문제 제보하기" });
    report.focus();
    mocks.state = { ...mocks.state, checking: false, lastError: null };
    view.rerender(<MemoryRouter><ServiceStatusPage /></MemoryRouter>);
    expect(document.activeElement).toBe(report);
  });
});
