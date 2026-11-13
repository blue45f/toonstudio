// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminApp } from "./AdminApp";

vi.mock("../../domains/operations/operation-policy/OperationPolicyPanel", () => ({ OperationPolicyPanel: () => <h1>운영 모드와 라이선스</h1> }));
vi.mock("./CiQualityAccess", () => ({ CiQualityAccess: () => <p role="status">관리자 권한 확인 중</p> }));
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

it("identifies the actual policy surface and links back to existing web management", () => {
  render(<AdminApp />);
  expect(screen.getByRole("heading", { name: "운영 모드와 라이선스" })).toBeTruthy();
  expect(screen.getByText(/다른 업무는 웹 관리자에서/)).toBeTruthy();
  const otherWork = screen.getByText("다른 관리 업무로 이동").closest("details");
  expect(otherWork?.open).toBe(false);
  if (!otherWork) throw new Error("다른 관리 업무 입구가 없습니다.");
  expect(screen.getByRole("heading", { name: "운영 모드와 라이선스" }).compareDocumentPosition(otherWork)
    & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByText("다른 관리 업무로 이동"));
  expect(otherWork.open).toBe(true);
  expect(screen.getByRole("link", { name: "웹 관리자 · 운영 정책으로 돌아가기" }).getAttribute("href")).toBe("https://www.toonstudio.cloud/admin/platform/operations?view=policy");
  expect(screen.queryByText("Edge Gate 보호")).toBeNull();
  expect(screen.getByRole("link", { name: "운영 모드·라이선스" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "운영 모드·라이선스" }).getAttribute("href")).toBe("/admin/platform/operations?view=policy");
});

it.each(["/admin/platform/quality", "/admin/platform/quality/"])("검증 화면 %s 진입에서 권한 확인과 현재 메뉴를 유지한다", (pathname) => {
  window.history.replaceState(null, "", pathname);
  render(<AdminApp />);
  expect(screen.getByRole("status").textContent).toBe("관리자 권한 확인 중");
  expect(screen.getByRole("link", { name: "CI·QA 검증" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "운영 모드·라이선스" }).getAttribute("aria-current")).toBeNull();
  expect(screen.queryByRole("heading", { name: "운영 모드와 라이선스" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "관리 화면 이동" })).toBeNull();
  expect(screen.queryByText("Edge Gate 보호")).toBeNull();
});
