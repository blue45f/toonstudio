// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  StudioEngineCenterPage,
  StudioProductionJobsPage,
  StudioProductionToolchainPage,
} from "./StudioProductionToolchainPage";

function renderRoute(element: React.ReactNode, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {element}
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Studio production toolchain pages", () => {
  it("renders the integrated production overview without exposing NC tools in Open profile", () => {
    renderRoute(<StudioProductionToolchainPage />, "/studio/toolchain?projectId=project-a");

    expect(screen.getByRole("heading", { name: /그리기 이후의 제작/u })).toBeTruthy();
    expect(screen.getByTestId("toolchain-rea-pipeline-receipt-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("toolchain-rea-track-comfy-deterministic-seed"));
    expect(screen.getByTestId("toolchain-rea-pipeline-receipt-status").textContent).toContain("ComfyUI");
    expect(screen.getByRole("link", { name: /제작 작업 시작/u }).getAttribute("href"))
      .toBe("/studio/jobs?projectId=project-a");
    expect(screen.queryByText("Mixbox")).not.toBeTruthy();
    expect(screen.getByRole("button", { name: /^Open 기본/u }).getAttribute("aria-pressed"))
      .toBe("true");
  });

  it("guides the first run in three steps and keeps the project scope across pages", () => {
    renderRoute(<StudioProductionToolchainPage />, "/studio/toolchain?projectId=project-a");

    const steps = screen.getByRole("region", { name: "3단계로 시작하기" });
    expect(within(steps).getByText("연결 필요")).toBeTruthy();
    expect(within(steps).getByRole("link", { name: /실행기 연결하기/u }).getAttribute("href")).toBe("/studio/engines?projectId=project-a");
    const pages = screen.getByRole("navigation", { name: "제작 도구 화면" });
    expect(within(pages).getByRole("link", { name: /제작 흐름/u }).getAttribute("aria-current")).toBe("page");
    expect(within(pages).getByRole("link", { name: /작업 큐/u }).getAttribute("href")).toBe("/studio/jobs?projectId=project-a");
  });

  it("filters engines by status and search without hiding the reason", async () => {
    renderRoute(<StudioEngineCenterPage />, "/studio/engines");

    const filters = screen.getByRole("group", { name: "상태로 거르기" });
    fireEvent.click(within(filters).getByRole("button", { name: /프로필 제한/u }));
    expect(screen.getByRole("heading", { name: "Mixbox" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Tesseract OCR" })).toBeNull();

    fireEvent.click(within(filters).getByRole("button", { name: /전체/u }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "tesseract" } });
    expect(await screen.findByRole("heading", { name: "Tesseract OCR" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Mixbox" })).toBeNull();
    expect(screen.getAllByText("상업 이용 가능").length).toBeGreaterThan(0);
  });

  it("renders every reviewed engine with an honest disconnected state", () => {
    renderRoute(<StudioEngineCenterPage />, "/studio/engines");

    expect(screen.getByRole("heading", { name: "설치·라이선스 상태" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tesseract OCR" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mixbox" })).toBeTruthy();
    expect(screen.getAllByText("프로필 제한").length).toBeGreaterThan(0);
    expect(screen.getByText("연결 안 됨")).toBeTruthy();
  });

  it("renders the job workspace without claiming durable storage or a live runner prematurely", async () => {
    renderRoute(<StudioProductionJobsPage />, "/studio/jobs?projectId=project-a");

    expect(screen.getByRole("heading", { name: "제작 작업 큐" })).toBeTruthy();
    expect(screen.getByText("연결 안 됨")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "처리 중 작업" })).toBeTruthy();
    expect(screen.getByText("아직 제작 작업이 없습니다.")).toBeTruthy();
  });

  it("GAP-R6-04: 파이프라인 트랙 및 상태 필터 토글이 44px 최소 타깃·명시적 포커스 링·선택 상태·방향키 이동 계약을 충족한다", () => {
    renderRoute(<StudioProductionToolchainPage />, "/studio/toolchain?projectId=project-a");

    const trackGroup = screen.getByRole("group", { name: "로컬 실행기 파이프라인 트랙" });
    expect(trackGroup.getAttribute("data-testid")).toBe("toolchain-rea-track-group");
    expect(trackGroup.style.gap).toBe("8px");

    const trackButtons = within(trackGroup).getAllByRole("button");
    expect(trackButtons.length).toBe(4);
    for (const btn of trackButtons) {
      expect(btn.className).toContain("min-h-11");
      expect(btn.className).toContain("min-w-11");
      expect(btn.className).toContain("focus-visible:outline");
      expect(btn.className).toContain("scroll-my-24");
      expect(btn.className).toContain("break-words");
      expect(btn.className).toContain("[overflow-wrap:anywhere]");
      expect(btn.style.minHeight).toBe("44px");
      expect(btn.style.minWidth).toBe("44px");
    }

    const firstTrack = screen.getByTestId("toolchain-rea-track-flamenco-render-queue");
    const secondTrack = screen.getByTestId("toolchain-rea-track-comfy-deterministic-seed");
    const lastTrack = screen.getByTestId("toolchain-rea-track-scribus-cmyk-preflight");

    expect(firstTrack.getAttribute("aria-pressed")).toBe("true");
    expect(firstTrack.getAttribute("data-state")).toBe("active");
    expect(secondTrack.getAttribute("aria-pressed")).toBe("false");
    expect(secondTrack.getAttribute("data-state")).toBe("inactive");

    firstTrack.focus();
    fireEvent.keyDown(firstTrack, { key: "ArrowRight" });
    expect(document.activeElement).toBe(secondTrack);
    fireEvent.keyDown(secondTrack, { key: "End" });
    expect(document.activeElement).toBe(lastTrack);
    fireEvent.keyDown(lastTrack, { key: "Home" });
    expect(document.activeElement).toBe(firstTrack);
    fireEvent.keyDown(firstTrack, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(lastTrack);

    fireEvent.click(secondTrack);
    expect(secondTrack.getAttribute("aria-pressed")).toBe("true");
    expect(secondTrack.getAttribute("data-state")).toBe("active");
    expect(firstTrack.getAttribute("aria-pressed")).toBe("false");
    expect(firstTrack.getAttribute("data-state")).toBe("inactive");

    cleanup();
    renderRoute(<StudioEngineCenterPage />, "/studio/engines");
    const statusGroup = screen.getByRole("group", { name: "상태로 거르기" });
    expect(statusGroup.getAttribute("data-testid")).toBe("toolchain-engine-status-group");
    const statusChips = within(statusGroup).getAllByRole("button");
    expect(statusChips.length).toBeGreaterThan(1);
    for (const chip of statusChips) {
      expect(chip.className).toContain("min-h-11");
      expect(chip.className).toContain("focus-visible:outline");
      expect(chip.style.minHeight).toBe("44px");
      expect(chip.style.minWidth).toBe("44px");
    }
    statusChips[0]!.focus();
    fireEvent.keyDown(statusChips[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(statusChips[1]);
  });
});
