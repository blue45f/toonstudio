// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionClientCommand } from "./production-api";
import { createProductionDemoProject } from "./production-demo";
import type { ProductionProjectAccess } from "./production-dashboard-api";
import { ProductionTeamSurface } from "./ProductionTeamSurface";

const preview = vi.hoisted(() => ({ loaded: vi.fn() }));
vi.mock("./ProductionTeamFeaturePreview", () => {
  preview.loaded();
  return { ProductionTeamFeaturePreview: () => <section aria-label="격리된 팀 운영 체험">예시 공유 차단 체험</section> };
});
vi.mock("./ProductionRoleWorkspace", () => ({ ProductionCrewCoverage: () => <section aria-label="실제 직군 배치" /> }));
vi.mock("./ProductionIntegrationsPanel", () => ({ ProductionIntegrationsPanel: () => <section aria-label="실제 연동 설정" /> }));

type ExecuteCommand = (command: ProductionClientCommand, message: string) => Promise<void>;
const owner: ProductionProjectAccess = { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" };
const viewer: ProductionProjectAccess = { view: true, comment: false, edit: false, manage: false, owner: false, role: "viewer" };

afterEach(() => cleanup());

describe("팀 설정의 실제 권한과 기능 체험 경계", () => {
  it("실제 프로젝트는 예시 거버넌스를 불러오지 않고 표지 저장 명령을 유지한다", async () => {
    const execute = vi.fn<ExecuteCommand>(async () => {});
    const aggregate = { ...createProductionDemoProject(), projectId: "live-project", coverImageUrl: null };
    render(<MemoryRouter><ProductionTeamSurface aggregate={aggregate} access={owner} execute={execute} /></MemoryRouter>);

    expect(screen.queryByText("팀 운영 기능 체험 열기")).toBeNull();
    expect(screen.queryByLabelText("격리된 팀 운영 체험")).toBeNull();
    expect(screen.queryByTestId("production-workspace-governance-suite")).toBeNull();
    expect(preview.loaded).not.toHaveBeenCalled();
    expect(screen.getByLabelText("실제 직군 배치")).toBeTruthy();
    expect(screen.getByLabelText("실제 연동 설정")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("표지 이미지 주소"), { target: { value: "https://example.test/real-cover.png" } });
    fireEvent.click(screen.getByRole("button", { name: "표지 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toEqual({ type: "set-project-cover", coverImageUrl: "https://example.test/real-cover.png" });
  });

  it("샘플 식별자만으로 체험을 열지 않고 읽기 전용 사용자의 실제 편집을 제한한다", () => {
    render(<MemoryRouter><ProductionTeamSurface aggregate={createProductionDemoProject()} access={viewer} /></MemoryRouter>);
    expect(screen.queryByText("팀 운영 기능 체험 열기")).toBeNull();
    expect(screen.queryByRole("button", { name: "표지 저장" })).toBeNull();
    expect(screen.queryByRole("button", { name: "표지 지우기" })).toBeNull();
    expect(preview.loaded).not.toHaveBeenCalled();
  });

  it("isDemo가 잘못 전달돼도 실제 프로젝트에 체험을 노출하지 않는다", () => {
    const aggregate = { ...createProductionDemoProject(), projectId: "live-project" };
    render(<MemoryRouter><ProductionTeamSurface aggregate={aggregate} access={owner} isDemo /></MemoryRouter>);
    expect(screen.queryByText("팀 운영 기능 체험 열기")).toBeNull();
    expect(preview.loaded).not.toHaveBeenCalled();
  });

  it("명시적인 샘플 체험을 연 뒤에만 예시 화면을 가져오고 서버 명령을 보내지 않는다", async () => {
    const execute = vi.fn<ExecuteCommand>(async () => {});
    render(<MemoryRouter><ProductionTeamSurface aggregate={createProductionDemoProject()} access={owner} execute={execute} isDemo /></MemoryRouter>);
    const disclosure = screen.getByText("팀 운영 기능 체험 열기").closest("details");
    if (!disclosure) throw new Error("샘플 기능 체험을 여는 항목이 없습니다.");
    expect(disclosure.open).toBe(false);
    expect(screen.queryByLabelText("격리된 팀 운영 체험")).toBeNull();
    expect(preview.loaded).not.toHaveBeenCalled();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));
    expect(await screen.findByLabelText("격리된 팀 운영 체험")).toBeTruthy();
    expect(screen.getByText("기능 체험 · 서버에 적용되지 않음")).toBeTruthy();
    expect(preview.loaded).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();

    disclosure.open = false;
    fireEvent(disclosure, new Event("toggle"));
    await waitFor(() => expect(screen.queryByLabelText("격리된 팀 운영 체험")).toBeNull());
    expect(execute).not.toHaveBeenCalled();
  });
});
