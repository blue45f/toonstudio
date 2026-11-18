// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminApp } from "./AdminApp";

vi.mock("../../domains/operations/operation-policy/OperationPolicyPanel", () => ({ OperationPolicyPanel: () => <h1>운영 모드와 라이선스</h1> }));
vi.mock("./CiQualityAccess", () => ({ CiQualityAccess: ({ view }: { view?: string }) => <p role="status" data-view={view}>관리자 권한 확인 중</p> }));
vi.mock("./BusinessPlanAccess", () => ({ BusinessPlanAccess: () => <p role="status">사업계획서 권한 확인 중</p> }));
vi.mock("./AiOperationsAccess", () => ({ AiOperationsAccess: () => <p role="status">AI·인프라 관리자 권한 확인 중</p> }));
vi.mock("./WorkspaceAccess", () => ({ WorkspaceAccess: () => <p role="status">통합 작업실 권한 확인 중</p> }));
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

it.each(["/admin/growth/business-plan", "/admin/growth/business-plan/", "/admin/growth/business-plan/?view=nestjs"])("사업계획서 %s 경로에서 전용 권한 확인과 메뉴를 연다", (pathname) => {
  window.history.replaceState(null, "", pathname);
  render(<AdminApp />);
  expect(screen.getByRole("status").textContent).toBe("사업계획서 권한 확인 중");
  expect(screen.getByRole("link", { name: "사업계획서·제출 준비" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "운영 모드·라이선스" }).getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("link", { name: "NestJS 호환성" }).getAttribute("aria-current")).toBeNull();
  expect(screen.queryByRole("heading", { name: "운영 모드와 라이선스" })).toBeNull();
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

it("NestJS query 진입을 기존 품질 경로에서 구분하고 관리자 확인을 유지한다", () => {
  window.history.replaceState(null, "", "/admin/platform/quality/?view=nestjs");
  render(<AdminApp />);
  expect(screen.getByRole("status").textContent).toBe("관리자 권한 확인 중");
  expect(screen.getByRole("link", { name: "NestJS 호환성" }).getAttribute("href")).toBe("/admin/platform/quality/?view=nestjs");
  expect(screen.getByRole("link", { name: "NestJS 호환성" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "CI·QA 검증" }).getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("link", { name: "통합 작업실" }).getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("link", { name: "사업계획서·제출 준비" }).getAttribute("aria-current")).toBeNull();
});

it.each(["/admin/workspace", "/admin/workspace/", "/admin/workspace/?view=nestjs"])("통합 작업실 %s 진입에서 독립 권한 확인과 현재 메뉴를 유지한다", (pathname) => {
  window.history.replaceState(null, "", pathname);
  render(<AdminApp />);
  expect(screen.getByRole("status").textContent).toBe("통합 작업실 권한 확인 중");
  expect(screen.getByRole("link", { name: "통합 작업실" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "운영 모드·라이선스" }).getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("link", { name: "CI·QA 검증" }).getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("link", { name: "NestJS 호환성" }).getAttribute("aria-current")).toBeNull();
  expect(screen.queryByRole("heading", { name: "운영 모드와 라이선스" })).toBeNull();
});

it("클라우드 작업 query가 기존 품질 경로 안에서 전용 관리자 화면을 선택한다", () => {
  window.history.replaceState(null, "", "/admin/platform/quality/?view=cloud-work");
  render(<AdminApp />);
  expect(screen.getByRole("status").getAttribute("data-view")).toBe("cloud-work");
  expect(screen.getByRole("link", { name: "클라우드 작업" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "CI·QA 검증" }).getAttribute("aria-current")).toBeNull();
  expect(screen.queryByRole("heading", { name: "운영 모드와 라이선스" })).toBeNull();
});

it.each(["/admin/growth/business-plan", "/admin/growth/business-plan/"])("사업계획서 %s 진입에서 비공개 보드 권한 확인을 유지한다", (pathname) => {
  window.history.replaceState(null, "", pathname);
  render(<AdminApp />);
  expect(screen.getByRole("status").textContent).toBe("사업계획서 권한 확인 중");
  expect(screen.getByRole("link", { name: "사업계획서·제출 준비" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "CI·QA 검증" }).getAttribute("aria-current")).toBeNull();
});

it.each(["/admin/platform/ai-operations", "/admin/platform/ai-operations/"])("AI 운영 화면 %s 진입은 전용 권한 확인과 메뉴를 사용한다", (pathname) => {
  window.history.replaceState(null, "", pathname);
  render(<AdminApp />);
  expect(screen.getByRole("status").textContent).toBe("AI·인프라 관리자 권한 확인 중");
  expect(screen.getByRole("link", { name: "AI·인프라 운영" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "CI·QA 검증" }).getAttribute("aria-current")).toBeNull();
  expect(screen.getByRole("link", { name: "운영 모드·라이선스" }).getAttribute("aria-current")).toBeNull();
  expect(screen.queryByRole("heading", { name: "운영 모드와 라이선스" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "관리 화면 이동" })).toBeNull();
});
