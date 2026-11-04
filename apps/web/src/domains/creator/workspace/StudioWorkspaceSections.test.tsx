// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceExploreContent, WorkspaceTeamContent } from "./StudioWorkspaceSections";
import { workspaceProjectLinks } from "./studio-workspace-model";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function team(tab: string) {
  return render(<MemoryRouter initialEntries={[`/team?tab=${tab}&project=private-project`]}><WorkspaceTeamContent project={null} links={workspaceProjectLinks(null, null)} /></MemoryRouter>);
}
describe("workspace exposes one purpose-led collaboration journey without granting project access", () => {
  it("페이지 소유의 협업 영역 메뉴를 중복하지 않고 팀 업무 선택을 유지한다", () => {
    team("members");
    expect(screen.queryByRole("navigation", { name: "협업 영역" })).toBeNull();
    expect(screen.getByRole("group", { name: "팀 업무 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "멤버·권한" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "모집·의뢰" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "대화·면접 준비" })).toBeTruthy();
  });

  it("separates team membership from project access", () => {
    team("people");
    expect(screen.getByRole("link", { name: /팀을 관리할 작품 선택/u }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("link", { name: /진행·담당·일정 확인/u }).getAttribute("href")).toBe("/production");
    expect(screen.getByText(/팀 소속과 접근 권한/u)).toBeTruthy();
  });
  it("connects public recruiting with the private hiring pipeline", () => {
    team("recruit");
    expect(screen.getByRole("link", { name: /어시스트 모집·의뢰 작성/u }).getAttribute("href")).toBe("/collaborate/new");
    expect(screen.getByRole("link", { name: /구인·의뢰 게시판/u }).getAttribute("href")).toBe("/collaborate");
    expect(screen.getByRole("link", { name: /역할·도구·보수로 인력 찾기/u }).getAttribute("href")).toBe("/collaborate/positions");
  });
  it("opens only the invitation-based meeting surface without copying private project IDs", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    team("sessions");
    expect(screen.getByRole("link", { name: /면접 대기실·회의 관리/u }).getAttribute("href")).toBe("/collaborate/workspace?panel=rooms");
    expect(screen.getByText(/프로젝트 공간에서 참여자를 확인하고 대화를 요청합니다/u)).toBeTruthy();
    expect(document.body.innerHTML).not.toContain("private-project");
    expect(errors).not.toHaveBeenCalled();
  });
  it("keeps published career discovery separate from the work library", () => {
    render(<MemoryRouter><WorkspaceExploreContent /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "사람" }));
    expect(screen.getByRole("link", { name: /경력·포트폴리오/u }).getAttribute("href")).toBe("/collaborate/gallery");
  });
});
