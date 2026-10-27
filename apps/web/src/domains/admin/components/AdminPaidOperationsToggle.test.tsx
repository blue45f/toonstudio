// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPaidOperationsToggle } from "./AdminMembershipPolicy";
import "../admin-i18n-loader";

const api = vi.hoisted(
  () =>
    vi.fn<
      (path: string, uid: string, options?: RequestInit) => Promise<unknown>
    >(),
);
vi.mock("./admin-client", async (original) => ({
  ...(await original<typeof import("./admin-client")>()),
  adminFetch: api,
}));

beforeEach(() => {
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 서버 상태를 흉내 내는 adminFetch. 실제 결제·PG 호출은 없다. */
function mockPaidOperationsServer(initialEnabled: boolean) {
  let enabled = initialEnabled;
  const posts: boolean[] = [];
  api.mockImplementation((path, _uid, options) => {
    if (path !== "/membership/paid-operations") {
      return Promise.reject(new Error("unexpected path: " + path));
    }
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body)) as { enabled: boolean };
      enabled = body.enabled;
      posts.push(body.enabled);
    }
    return Promise.resolve({ paidOperationsEnabled: enabled });
  });
  return { posts, getEnabled: () => enabled };
}

describe("AdminPaidOperationsToggle", () => {
  it("기본값 OFF를 표시하고 스위치는 꺼진 상태다", async () => {
    mockPaidOperationsServer(false);
    render(<AdminPaidOperationsToggle uid="admin" />);
    expect(await screen.findByText("유료 운영 중단")).toBeTruthy();
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.textContent ?? "").toContain("유료 운영 켜기");
  });

  it("토글 ON→OFF→ON이 즉시 POST되고 표시가 매번 따라간다", async () => {
    const server = mockPaidOperationsServer(false);
    render(<AdminPaidOperationsToggle uid="admin" />);
    const toggle = await screen.findByRole("switch");

    fireEvent.click(toggle);
    expect(await screen.findByText("유료 운영 중")).toBeTruthy();
    fireEvent.click(await screen.findByRole("switch"));
    expect(await screen.findByText("유료 운영 중단")).toBeTruthy();
    fireEvent.click(await screen.findByRole("switch"));
    expect(await screen.findByText("유료 운영 중")).toBeTruthy();

    expect(server.posts).toEqual([true, false, true]);
    expect(server.getEnabled()).toBe(true);
  });

  it("로드 실패를 숨기지 않고 재시도를 제공한다", async () => {
    api.mockRejectedValueOnce(new Error("network down"));
    api.mockImplementation((path) =>
      path === "/membership/paid-operations"
        ? Promise.resolve({ paidOperationsEnabled: false })
        : Promise.reject(new Error("unexpected path")),
    );
    render(<AdminPaidOperationsToggle uid="admin" />);
    expect(
      await screen.findByText("유료 운영 상태를 불러오지 못했습니다. 잠시 후 다시 시도하세요."),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("다시 불러오기"));
    expect(await screen.findByText("유료 운영 중단")).toBeTruthy();
  });
});
