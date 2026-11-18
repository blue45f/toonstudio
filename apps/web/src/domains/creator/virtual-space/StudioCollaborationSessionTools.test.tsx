// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { StudioCollaborationSessionTools } from "./StudioCollaborationSessionTools";
import { useStudioCollaborationSpaceTarget } from "./use-studio-collaboration-space-target";
import { initialPanel } from "./studio-virtual-space-page-helpers";

function Tools({ board = false }: { board?: boolean }) {
  const target = useStudioCollaborationSpaceTarget();
  return <StudioCollaborationSessionTools target={target} board={board} />;
}
afterEach(cleanup);
it("프로젝트가 없는 편집기에서 가상 참가자, 초대나 미디어 상태를 만들지 않는다", () => {
  render(<MemoryRouter><Tools /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "프로젝트 열기" }).getAttribute("href")).toBe("/studio");
  expect(screen.getByText("팀원과 함께 작업하려면 프로젝트를 여세요.")).toBeTruthy();
});
it.each([[false, "people"], [true, "board"]] as const)("프로젝트의 실제 공간 도구로 이동한다 (%s)", (board, activity) => {
  render(<MemoryRouter initialEntries={["/studio/p/comic/edit"]}><Routes>
    <Route path="/studio/p/:projectId/edit" element={<Tools board={board} />} />
  </Routes></MemoryRouter>);
  const href = new URL(screen.getByRole("link").getAttribute("href")!, "https://example.org");
  expect(href.pathname).toBe("/studio/p/comic/space");
  expect(initialPanel(href.search)).toBe(activity);
});
