// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { ProductionProjectPage } from "./ProductionHubPage";
import { resetProductionDemoSession } from "./production-demo-adapter";

const imports = vi.hoisted(() => ({ unselected: vi.fn() }));
vi.mock("./ProductionPlanningSurface", () => { imports.unselected("planning"); throw new Error("선택하지 않은 기획 표면을 로드했습니다."); });
vi.mock("./ProductionManuscriptWorkspace", () => { imports.unselected("manuscripts"); throw new Error("선택하지 않은 원고 표면을 로드했습니다."); });
vi.mock("./ProductionEpisodeRoomPage", () => { imports.unselected("episode-room"); throw new Error("선택하지 않은 회차 룸을 로드했습니다."); });
vi.mock("./ProductionManagementWorkspace", () => { imports.unselected("management"); throw new Error("선택하지 않은 운영 상세를 로드했습니다."); });
vi.mock("./ProductionWorkBoard", () => { imports.unselected("work-board"); throw new Error("선택하지 않은 보드를 로드했습니다."); });
vi.mock("./ProductionHandoffSurface", () => ({ ProductionHandoffSurface: () => <section data-testid="selected-handoff">선택한 인계 표면</section> }));


afterEach(() => { cleanup(); resetProductionDemoSession(); });

it("인계 진입은 선택한 표면만 로드하고 다른 제작 표면·회차 룸·접힌 운영 상세를 가져오지 않는다", async () => {
  render(<MemoryRouter initialEntries={["/production/projects/sample-project/handoff"]}><Routes>
    <Route path="/production/projects/:projectId/handoff" element={<ProductionProjectPage surface="handoff" />} />
  </Routes></MemoryRouter>);
  await act(async () => { await vi.dynamicImportSettled(); });
  expect(await screen.findByTestId("selected-handoff")).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "프로젝트 메뉴" })).toBeTruthy();
  expect(imports.unselected).not.toHaveBeenCalled();
});
