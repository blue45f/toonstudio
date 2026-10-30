// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioHybridDccPanel } from "./StudioHybridDccPanel";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceLoopCutActive,
} from "./studio-hybrid-dcc-workspace";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

// 실제 패널·도구 목록·번역·실행 큐를 사용하고 WebGL 캔버스만 기존 패널 검증처럼 대체한다.
vi.mock("./StudioHybridDccViewportCore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./StudioHybridDccViewportCore")>();
  return {
    ...actual,
    StudioHybridDccViewport: (_props: StudioHybridDccViewportProps) => <div data-testid="loop-cut-viewport-probe" />,
  };
});

vi.mock("./studio-hybrid-dcc-workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-hybrid-dcc-workspace")>();
  const { StudioHybridDccLoopCutError } = await import("./studio-hybrid-dcc-loop-cut-workspace");
  return {
    ...actual,
    workspaceLoopCutActive: vi.fn(() => {
      throw new StudioHybridDccLoopCutError("budget-exceeded", "종단 면 129코너: 내부 진단 번호 984321에서 절단이 중단됐습니다.");
    }),
  };
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
  vi.clearAllMocks();
});

describe("영어 패널의 루프 절단 실패 안내", () => {
  it("실제 도구 실행 후 aria-live에 영어 작업명과 번역한 복구 안내를 연결한다", async () => {
    useI18n.getState().setLang("en");
    const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("loop-cut-feedback-en"), "cube");
    const { container } = render(<StudioHybridDccPanel initialWorkspace={workspace} />);
    const button = container.querySelector<HTMLButtonElement>('[data-studio-hybrid-dcc-tool="Loop cut"]');
    if (!button) throw new Error("실제 루프 절단 도구 버튼이 없습니다.");
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => {
      const status = container.querySelector<HTMLElement>('[data-studio-hybrid-dcc-log="true"]');
      if (!status) throw new Error("실시간 작업 상태 안내가 없습니다.");
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.textContent).toContain("Loop cut failed ·");
      expect(status.textContent).toContain("Split or simplify the model");
      expect(status.textContent).toContain("The original and edit history are unchanged");
      expect(status.textContent).not.toMatch(/[가-힣]/u);
      expect(status.textContent).not.toContain("129");
      expect(status.textContent).not.toContain("984321");
    });
    expect(workspaceLoopCutActive).toHaveBeenCalledOnce();
  });
});
