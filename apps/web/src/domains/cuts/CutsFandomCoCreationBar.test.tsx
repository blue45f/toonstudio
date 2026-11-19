// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CutsFandomCoCreationBar } from "./CutsFandomCoCreationBar";

afterEach(cleanup);

describe("CutsFandomCoCreationBar", () => {
  it("취향 큐레이션 전환과 독자 공동기획 투표가 즉시 반영된다", () => {
    render(
      <MemoryRouter>
        <CutsFandomCoCreationBar />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "30대+ 서사·직장인" }));
    expect(screen.getByText(/30대\+ 성인 독자 취향 맞춤/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /숨겨진 조력자 시점 프리퀄 3컷/ }));
    expect(screen.getByText("143명 참여")).toBeTruthy();
  });
});
