// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { writeStudioExactResumeContext } from "../../studio-exact-resume-context";
import { createStudioProjectDocument, trashStudioProjectDocument } from "../../studio-project-document-store";
import { archiveStudioProject, createStudioProject, markStudioProjectOpened } from "../../studio-project-library-store";
import { SpaceWorkLauncher } from "./SpaceWorkLauncher";
import { useSpaceWorkProject } from "./use-space-work-project";

afterEach(() => { cleanup(); localStorage.clear(); });

function seedManuscript(id: string, openedAt: string) {
  createStudioProject(localStorage, { id, title: `작품 ${id}`, kind: "webtoon" });
  createStudioProjectDocument(localStorage, id, { id: "page", title: "원고", kind: "webtoon" });
  markStudioProjectOpened(localStorage, id, "page", { at: openedAt });
  writeStudioExactResumeContext(localStorage, { projectId: id, documentId: "page", workspace: "draw", zoom: 2 });
}

function Launcher({ personal, initiallyOpen = false }: { readonly personal: boolean; readonly initiallyOpen?: boolean }) {
  const project = useSpaceWorkProject("team", personal);
  const location = useLocation();
  const [open, setOpen] = useState(initiallyOpen);
  return <>
    <SpaceWorkLauncher project={project} personal={personal} open={open} sheet={false} onOpenChange={setOpen}
      trigger={(props) => <button type="button" {...props} />}>
      <p>작업 목록</p>
    </SpaceWorkLauncher>
    <output data-testid="current-route">{location.pathname}{location.search}</output>
  </>;
}

describe("가상 스튜디오에서 원고 이어하기", () => {
  it("개인 공간은 작업을 자동으로 열지 않고 최근 활성 작품과 복원 지점을 제안한다", () => {
    seedManuscript("first", "2026-11-10T00:00:00Z");
    seedManuscript("recent", "2026-11-20T00:00:00Z");
    seedManuscript("archived", "2026-11-25T00:00:00Z");
    archiveStudioProject(localStorage, "archived");
    render(<MemoryRouter><Launcher personal /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "작업 시작" }));
    expect(screen.getByTestId("current-route").textContent).toBe("/");
    const resume = screen.getByRole("button", { name: /최근 원고 이어하기.*작품 recent.*200%/u });
    fireEvent.click(resume);
    expect(screen.getByTestId("current-route").textContent).toBe("/studio/p/recent/d/page?resume=latest&workspace=draw");
  });

  it("누르기 직전 원고가 휴지통으로 이동하면 대체 원고로 이동하지 않고 선택 창을 유지한다", () => {
    seedManuscript("recent", "2026-11-20T00:00:00Z");
    render(<MemoryRouter><Launcher personal initiallyOpen /></MemoryRouter>);
    const resume = screen.getByRole("button", { name: /최근 원고 이어하기/u });
    trashStudioProjectDocument(localStorage, "recent", "page");
    fireEvent.click(resume);
    expect(screen.getByTestId("current-route").textContent).toBe("/");
    expect(screen.getByText(/이어할 원고가 바뀌었어요/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /최근 원고 이어하기/u })).toBeNull();
    expect(screen.getByText("작업 목록")).toBeTruthy();
  });

  it("팀 공간은 더 최근의 다른 작품이 있어도 현재 팀의 원고만 한 번에 연다", () => {
    seedManuscript("team", "2026-11-10T00:00:00Z");
    seedManuscript("other", "2026-11-20T00:00:00Z");
    render(<MemoryRouter><Launcher personal={false} initiallyOpen /></MemoryRouter>);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "원고 이어하기" }));
    expect(screen.getByTestId("current-route").textContent).toBe("/studio/p/team/d/page?resume=latest&workspace=draw");
  });
});
