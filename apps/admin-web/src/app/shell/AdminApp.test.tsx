// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminApp } from "./AdminApp";

vi.mock("../../domains/operations/operation-policy/OperationPolicyPanel", () => ({ OperationPolicyPanel: () => <h1>운영 모드와 라이선스</h1> }));
afterEach(cleanup);

it("identifies the actual policy surface and links back to existing web management", () => {
  render(<AdminApp />);
  expect(screen.getByRole("heading", { name: "운영 모드와 라이선스" })).toBeTruthy();
  expect(screen.getByText(/다른 업무는 웹 관리자에서/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "웹 관리자 · 운영 정책으로 돌아가기" }).getAttribute("href")).toBe("https://www.toonstudio.cloud/admin/platform/operations?view=policy");
  expect(screen.queryByText("Edge Gate 보호")).toBeNull();
});
