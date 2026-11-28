// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { creatorRoleDefinition } from "@/shared/lib/creator-role-contract";
import * as clipboard from "@/shared/lib/copy-text";
import { createProductionDemoProject } from "../production-hub/production-demo";
import { StudioVirtualSpaceOfficeStart } from "./StudioVirtualSpaceOfficeStart";
import { studioVirtualSpaceRolePreset } from "./studio-virtual-space-role-preset";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const empty: StudioVirtualOperationsSnapshot = { phase: "ready", project: null, inbox: [], calendar: [], error: null };
function options() {
  return { snapshot: empty, workId: "work/one", peerCount: 0, onOpenWork: vi.fn(), onOpenPeople: vi.fn(), onOpenSeats: vi.fn(), onRefresh: vi.fn(), onGuide: vi.fn(), onDismiss: vi.fn() };
}
function projectSnapshot(): StudioVirtualOperationsSnapshot {
  const aggregate = createProductionDemoProject();
  const template = aggregate.tasks[0];
  if (!template) throw new Error("기준 작업이 필요합니다.");
  return { ...empty, project: {
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    aggregate: { ...aggregate, workId: "work/one", tasks: [
      { ...template, id: "done", title: "완료 원고", status: "done", dueAt: "2026-09-01T00:00:00Z" },
      { ...template, id: "undated", title: "마감 없는 자료", processKey: "asset", status: "ready", dueAt: "invalid-date" },
      { ...template, id: "review", title: "1화 콘티 검수", processKey: "storyboard", status: "changes-requested", dueAt: "2026-09-28T00:00:00Z", completionCriteria: ["3컷 대사 확인"] },
      { ...template, id: "script", title: "2화 대본", processKey: "script", status: "in-progress", dueAt: "2026-09-29T00:00:00Z" },
    ] },
  } };
}

describe("가상 사무실의 첫 작업", () => {
  it("세 가지 주 행동과 실제 원고 링크를 제공하며 처음에는 아무 동작도 시작하지 않는다", () => {
    const props = options();
    render(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} /></MemoryRouter>);
    expect(props.onOpenWork).not.toHaveBeenCalled();
    expect(props.onOpenPeople).not.toHaveBeenCalled();
    expect(props.onOpenSeats).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /내 작업 열기/u }));
    fireEvent.click(screen.getByRole("button", { name: /동료 찾기/u }));
    fireEvent.click(screen.getByRole("button", { name: /작업 자리/u }));
    expect(props.onOpenWork).toHaveBeenCalledOnce();
    expect(props.onOpenPeople).toHaveBeenCalledOnce();
    expect(props.onOpenSeats).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "원고 목록 바로 열기" }).getAttribute("href")).toBe("/studio/p/work%2Fone/production?view=documents");
    expect(screen.getByText("현재 접속한 동료 없음")).toBeTruthy();
  });

  it("완료 작업과 잘못된 마감일을 앞세우지 않고 실제 다음 업무 하나만 안내한다", () => {
    const props = { ...options(), snapshot: projectSnapshot(), peerCount: 2 };
    render(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} /></MemoryRouter>);
    expect(screen.getByText("팀의 다음 작업")).toBeTruthy();
    expect(screen.getByText("1화 콘티 검수")).toBeTruthy();
    const taskLink = screen.getByRole("link", { name: "1화 콘티 검수 작업 카드 열기" });
    expect(taskLink.getAttribute("href")).toBe(`/production/projects/${encodeURIComponent(props.snapshot.project?.aggregate.projectId ?? "")}/production?productionView=board&openTask=review`);
    expect(screen.queryByText("완료 원고")).toBeNull();
    expect(screen.queryByText("2화 대본")).toBeNull();
    expect(screen.queryByText("마감 없는 자료")).toBeNull();
    expect(screen.getByText("현재 공간 2명")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검수실로 이동" }));
    expect(props.onGuide).toHaveBeenCalledExactlyOnceWith("review");
    expect(props.onOpenWork).not.toHaveBeenCalled();
  });

  it("현재 프로젝트의 개인 작업함에 있는 작업을 팀 전체 작업보다 우선한다", () => {
    const snapshot = projectSnapshot();
    const props = { ...options(), snapshot: { ...snapshot, inbox: [{ bucket: "inProgress" as const, projectId: snapshot.project?.aggregate.projectId ?? "", projectTitle: "팀", taskId: "script", taskTitle: "2화 대본", processKey: "script", status: "in-progress", dueAt: null, estimateHours: null, episodeId: null }] } };
    const view = render(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} /></MemoryRouter>);
    expect(screen.getByText("내 다음 작업")).toBeTruthy();
    expect(screen.getByText("2화 대본")).toBeTruthy();
    view.rerender(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} snapshot={{ ...props.snapshot, inbox: props.snapshot.inbox.map((item) => ({ ...item, projectId: "other-project" })) }} /></MemoryRouter>);
    expect(screen.queryByText("내 다음 작업")).toBeNull();
    expect(screen.getByText("1화 콘티 검수")).toBeTruthy();
  });

  it("인계 메모에는 실제 완료 기준과 작업 링크를 넣고 클립보드 거부 시 직접 복사할 수 있다", async () => {
    const copy = vi.spyOn(clipboard, "copyText").mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<MemoryRouter><StudioVirtualSpaceOfficeStart {...options()} snapshot={projectSnapshot()} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "인계 메모 복사" });
    expect(copy).not.toHaveBeenCalled();
    fireEvent.click(button);
    const manual = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: /인계 메모를 선택/u });
    const link = screen.getByRole<HTMLAnchorElement>("link", { name: "1화 콘티 검수 작업 카드 열기" });
    expect(manual.value).toContain("1화 콘티 검수");
    expect(manual.value).toContain("수정 요청");
    expect(manual.value).toContain("• 3컷 대사 확인");
    expect(manual.value).toContain(link.href);
    expect(copy).toHaveBeenCalledWith(manual.value);
    fireEvent.click(button);
    expect((await screen.findByRole("status")).textContent).toBe("작업 링크와 인계 메모를 복사했어요.");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each(["loading", "unavailable"] as const)("%s 중에는 이전 작업을 제안하지 않고 작업함과 상태를 제공한다", (phase) => {
    const props = { ...options(), snapshot: { ...projectSnapshot(), phase } };
    render(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} /></MemoryRouter>);
    expect(screen.queryByText("1화 콘티 검수")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /내 작업 열기/u }));
    expect(props.onOpenWork).toHaveBeenCalledOnce();
    if (phase === "unavailable") {
      fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
      expect(props.onRefresh).toHaveBeenCalledOnce();
    }
  });

  it("작품 전환 직후 이전 snapshot이 남아 있어도 다른 작품 업무를 표시하지 않는다", () => {
    const props = { ...options(), snapshot: projectSnapshot() };
    const view = render(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} /></MemoryRouter>);
    expect(screen.getByText("1화 콘티 검수")).toBeTruthy();
    view.rerender(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} workId="next-work" /></MemoryRouter>);
    expect(screen.queryByText("1화 콘티 검수")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("확인하고");
    expect(screen.getByRole("link", { name: "원고 목록 바로 열기" }).getAttribute("href")).toBe("/studio/p/next-work/production?view=documents");
    expect(props.onGuide).not.toHaveBeenCalled();
  });

  it("개인 로컬 작업실은 협업 수치를 만들지 않고 실제 내 작품과 새 작품 링크를 제공한다", () => {
    const props = { ...options(), snapshot: projectSnapshot(), peerCount: 8 };
    render(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} personal /></MemoryRouter>);
    const people = screen.getByRole("button", { name: /동료 찾기/u }) as HTMLButtonElement;
    expect(people.disabled).toBe(true);
    expect(within(people).getByText("개인 작업실 · 동료 없음")).toBeTruthy();
    fireEvent.click(people);
    expect(props.onOpenPeople).not.toHaveBeenCalled();
    expect(screen.queryByText("1화 콘티 검수")).toBeNull();
    expect(screen.getByRole("link", { name: /내 작품 열기/u }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("link", { name: "새 작품 만들기" }).getAttribute("href")).toBe("/studio/new");
    fireEvent.click(screen.getByRole("button", { name: /작업 자리/u }));
    expect(props.onOpenSeats).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "작업 시작 안내 접기" }));
    expect(props.onDismiss).toHaveBeenCalledOnce();
  });

  it("비로그인 게스트·직군 미설정 상태에서도 하이퍼 오토메이션 OS 접이식 진입점에 1클릭 도달하고 열 때 지연 마운트한다", async () => {
    const props = options();
    render(<MemoryRouter><StudioVirtualSpaceOfficeStart {...props} personal rolePreset={null} /></MemoryRouter>);

    const disclosures = screen.getAllByTestId("studio-hyper-automation-os-disclosure");
    expect(disclosures).toHaveLength(1);
    expect(screen.queryByTestId("studio-hyper-automation-os-panel")).toBeNull();

    const disclosure = disclosures[0] as HTMLDetailsElement;
    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));
    await vi.dynamicImportSettled();

    await waitFor(() => {
      expect(screen.getByTestId("studio-hyper-automation-os-panel")).toBeTruthy();
    });
  });

  it("직군 프리셋이 있는 사용자 화면에서도 하이퍼 오토메이션 OS 진입점은 중복 없이 1개만 노출된다", () => {
    const props = options();
    render(
      <MemoryRouter>
        <StudioVirtualSpaceOfficeStart
          {...props}
          rolePreset={{
            attempted: true,
            userId: "demo-art",
            activeRole: "reviewer",
            definition: creatorRoleDefinition("reviewer"),
            customRoleLabel: null,
            preset: studioVirtualSpaceRolePreset("reviewer", false),
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId("studio-hyper-automation-os-disclosure")).toHaveLength(1);
  });
});
