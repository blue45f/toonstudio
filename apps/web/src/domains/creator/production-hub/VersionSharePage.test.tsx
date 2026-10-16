// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VersionSharePage } from "./VersionSharePage";

const resolveMock = vi.hoisted(() => vi.fn());

vi.mock("./production-manuscript-version-share-api", () => ({
  resolveVersionShare: (...args: unknown[]) => resolveMock(...args),
}));

afterEach(() => {
  cleanup();
  resolveMock.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/share/version/token-1"]}>
      <Routes>
        <Route path="/share/version/:token" element={<VersionSharePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VersionSharePage", () => {
  it("해석 전 상태에서도 버전 공유 정체성을 먼저 보여 준다", () => {
    resolveMock.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByText("ToonStudio 버전 공유")).toBeTruthy();
    expect(screen.getByText("공유 버전을 확인하는 중…")).toBeTruthy();
  });

  it("비밀번호가 필요한 링크에서도 같은 정체성을 보여 준다", async () => {
    resolveMock.mockResolvedValue({ status: "password_required" });
    renderPage();
    expect(await screen.findByRole("heading", { name: "비밀번호가 필요한 링크예요" })).toBeTruthy();
    expect(screen.getByText("ToonStudio 버전 공유")).toBeTruthy();
  });

  it("만료된 링크에서도 같은 정체성을 보여 준다", async () => {
    resolveMock.mockResolvedValue({ status: "expired" });
    renderPage();
    expect(await screen.findByRole("heading", { name: "만료된 공유 링크예요" })).toBeTruthy();
    expect(screen.getByText("ToonStudio 버전 공유")).toBeTruthy();
  });

  it("비밀번호 시도 한도로 잠기면 연결 오류가 아니라 잠금 안내와 남은 분을 보여 주고 폼은 그대로 둔다", async () => {
    resolveMock.mockResolvedValueOnce({ status: "password_required" });
    renderPage();
    const input = await screen.findByLabelText("비밀번호");
    fireEvent.change(input, { target: { value: "wrong" } });
    resolveMock.mockResolvedValueOnce({ status: "password_locked", retryAfterSeconds: 900 });
    fireEvent.click(screen.getByRole("button", { name: "버전 열기" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("비밀번호를 여러 번 틀려 잠시 잠겼어요");
    expect(alert.textContent).toContain("약 15분 뒤에");
    expect(screen.queryByText("연결에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.")).toBeNull();
    // 폼이 남아 있어 잠금이 풀린 뒤 같은 화면에서 다시 시도할 수 있다.
    expect(screen.getByLabelText("비밀번호")).toBeTruthy();
    expect((screen.getByRole("button", { name: "버전 열기" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("재시도 시간을 모르는 잠금도 시간 없이 같은 안내를 보여 준다", async () => {
    resolveMock.mockResolvedValueOnce({ status: "password_required" });
    renderPage();
    const input = await screen.findByLabelText("비밀번호");
    fireEvent.change(input, { target: { value: "wrong" } });
    resolveMock.mockResolvedValueOnce({ status: "password_locked", retryAfterSeconds: null });
    fireEvent.click(screen.getByRole("button", { name: "버전 열기" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("잠시 뒤에 다시 시도해 주세요");
    expect(alert.textContent).not.toContain("분 뒤에");
  });
});
