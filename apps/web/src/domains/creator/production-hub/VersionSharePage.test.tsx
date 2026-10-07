// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
});
