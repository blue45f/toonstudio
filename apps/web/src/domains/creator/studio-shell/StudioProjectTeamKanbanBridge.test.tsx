// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioProjectTeamKanbanBridge } from "./StudioProjectTeamKanbanBridge";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectTeamKanbanBridge", () => {
  it("renders the 5-stage production Kanban cards with project-scoped canonical links and 44px touch targets", () => {
    render(
      <MemoryRouter>
        <StudioProjectTeamKanbanBridge projectId="proj-alpha" />
      </MemoryRouter>,
    );

    const section = screen.getByTestId("studio-project-team-kanban-bridge");
    expect(within(section).getByText("1. 콘티")).toBeTruthy();
    expect(within(section).getByText("2. 3D 배경")).toBeTruthy();
    expect(within(section).getByText("3. 선화")).toBeTruthy();
    expect(within(section).getByText("4. 채색")).toBeTruthy();
    expect(within(section).getByText("5. 글자·최종 확인")).toBeTruthy();

    const storyboardCard = within(section).getByTestId("studio-kanban-stage-card-storyboard");
    expect(within(storyboardCard).getByRole("link").className).toContain("min-h-11");
    expect(within(storyboardCard).getByRole("link").getAttribute("href")).toBe("/studio/p/proj-alpha/story");

    const bg3dCard = within(section).getByTestId("studio-kanban-stage-card-bg3d");
    expect(within(bg3dCard).getByRole("link").getAttribute("href")).toBe("/studio/bg3d?project=proj-alpha");

    const exportCard = within(section).getByTestId("studio-kanban-stage-card-lettering");
    expect(within(exportCard).getByRole("link").getAttribute("href")).toBe("/studio/p/proj-alpha/export");

    expect(within(section).getByRole("link", { name: /회차 진행 보기/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/production");
    expect(within(section).getByRole("link", { name: /작업 전달 기록/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/handoff");
    expect(within(section).getByRole("link", { name: /소재 이용 조건/u }).getAttribute("href"))
      .toBe("/production/projects/proj-alpha/rights");
  });

  it("상태 전환·담당자 지정·다음 공정 원클릭 인계(메모·타임스탬프)를 수행하고 리로드 후에도 복원한다", () => {
    const firstRender = render(
      <MemoryRouter>
        <StudioProjectTeamKanbanBridge projectId="proj-kanban-persist" />
      </MemoryRouter>,
    );

    // 1) 상태 전환: 대기 → 검수 요청
    const storyboardStatus = screen.getByTestId("studio-kanban-status-select-storyboard") as HTMLSelectElement;
    fireEvent.change(storyboardStatus, { target: { value: "review_requested" } });
    expect(screen.getByTestId("studio-kanban-stage-status-badge-storyboard").textContent).toBe("검수 요청");
    expect(screen.getByTestId("studio-kanban-summary-counts").textContent).toContain("검수 요청 1");

    // 2) 담당자 지정: 콘티 담당자 & 3D 배경 담당자
    fireEvent.change(screen.getByTestId("studio-kanban-assignee-input-storyboard"), {
      target: { value: "지민(콘티)" },
    });
    fireEvent.change(screen.getByTestId("studio-kanban-assignee-input-bg3d"), {
      target: { value: "서준(배경)" },
    });

    // 3) 원클릭 인계 + 메모 기록
    fireEvent.change(screen.getByTestId("studio-kanban-memo-input-storyboard"), {
      target: { value: "12컷 카페 외경 구도 확정했습니다" },
    });
    fireEvent.click(screen.getByTestId("studio-kanban-handoff-btn-storyboard"));

    // 콘티 → 승인 완료, 3D 배경 → 진행 중 자동 전환 및 인계 로그 타임스탬프 기록
    expect(screen.getByTestId("studio-kanban-stage-status-badge-storyboard").textContent).toBe("승인 완료");
    expect(screen.getByTestId("studio-kanban-stage-status-badge-bg3d").textContent).toBe("진행 중");
    expect(screen.getByTestId("studio-kanban-summary-counts").textContent).toContain("승인 완료 1/5");
    expect(screen.getByTestId("studio-kanban-summary-counts").textContent).toContain("진행 중 1");

    const handoffLog = screen.getByTestId("studio-kanban-handoff-log");
    expect(handoffLog.textContent).toContain("12컷 카페 외경 구도 확정했습니다");
    expect(handoffLog.textContent).toContain("지민(콘티) → 서준(배경)");
    expect(handoffLog.querySelector("time")?.getAttribute("dateTime")).toMatch(/^\d{4}-\d{2}-\d{2}T/u);

    // 4) 언마운트 후 재마운트(리로드 시뮬레이션) 시 모든 상태·담당자·인계 이력 복원
    firstRender.unmount();

    render(
      <MemoryRouter>
        <StudioProjectTeamKanbanBridge projectId="proj-kanban-persist" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("studio-kanban-stage-status-badge-storyboard").textContent).toBe("승인 완료");
    expect(screen.getByTestId("studio-kanban-stage-status-badge-bg3d").textContent).toBe("진행 중");
    expect((screen.getByTestId("studio-kanban-assignee-input-storyboard") as HTMLInputElement).value).toBe("지민(콘티)");
    expect((screen.getByTestId("studio-kanban-assignee-input-bg3d") as HTMLInputElement).value).toBe("서준(배경)");
    expect(screen.getByTestId("studio-kanban-handoff-log").textContent).toContain("12컷 카페 외경 구도 확정했습니다");
  });

  it("프로젝트별로 독립 저장되어 다른 프로젝트로 전환하면 상태가 섞이지 않는다", () => {
    const view = render(
      <MemoryRouter>
        <StudioProjectTeamKanbanBridge projectId="proj-one" />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByTestId("studio-kanban-status-select-lineart"), {
      target: { value: "approved" },
    });
    expect(screen.getByTestId("studio-kanban-stage-status-badge-lineart").textContent).toBe("승인 완료");

    view.rerender(
      <MemoryRouter>
        <StudioProjectTeamKanbanBridge projectId="proj-two" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("studio-kanban-stage-status-badge-lineart").textContent).toBe("대기");
  });
});
