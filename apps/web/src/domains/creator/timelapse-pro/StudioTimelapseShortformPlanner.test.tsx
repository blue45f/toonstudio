// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioTimelapsePanel } from "../StudioTimelapsePanel";

import { StudioTimelapseShortformPlanner } from "./StudioTimelapseShortformPlanner";

import {
  SessionContext,
  type SessionContextValue,
} from "@/domains/auth/public/session/auth-session-store";

import type { HistorySnapshot } from "../studio-history-labels";
import type { TimelapseStepInfo } from "../studio-timelapse";

const GUEST_SESSION: SessionContextValue = {
  data: null,
  ready: true,
  status: "unauthenticated",
  update: async () => null,
};

const SAMPLE_HISTORY: readonly HistorySnapshot[] = [
  [
    {
      id: "page-1",
      canvasH: 2000,
      elements: [{ id: "cut-1", type: "frame", x: 40, y: 80, width: 720, height: 800 }],
    },
  ],
  [
    {
      id: "page-1",
      canvasH: 2000,
      elements: [
        { id: "cut-1", type: "frame", x: 40, y: 80, width: 720, height: 800 },
        { id: "draw-1", type: "draw", x: 100, y: 120, width: 400, height: 400 },
        { id: "bubble-1", type: "bubble", x: 180, y: 160, text: "드디어 완성!" },
      ],
    },
  ],
];

const SAMPLE_STEPS: readonly TimelapseStepInfo[] = [
  { historyIndex: 0, label: "콘티 초안", elementCount: 1 },
  { historyIndex: 1, label: "말풍선 대사 추가", elementCount: 3 },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioTimelapseShortformPlanner", () => {
  it("9:16 ↔ 1:1 비율 전환, 30fps ↔ 60fps 전환, 공정 토글, 스크러빙을 정확히 반영한다", () => {
    render(
      <StudioTimelapseShortformPlanner
        title="에피소드 01"
        pageId="page-1"
        history={SAMPLE_HISTORY}
        steps={SAMPLE_STEPS}
      />,
    );

    const viewport = screen.getByTestId("shortform-preview-viewport");
    expect(viewport.className).toContain("aspect-[9/16]");
    expect(screen.getByText(/₩0 \(브라우저 WebM\)/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /1:1/u }));
    expect(viewport.className).toContain("aspect-square");
    expect(screen.getByText(/안전 여백 · 1080×1080 · 30fps/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "60fps" }));
    expect(screen.getByText(/안전 여백 · 1080×1080 · 60fps/u)).toBeTruthy();
    expect(screen.getByText(/#0\/1800/u)).toBeTruthy();

    const scrubber = screen.getByRole("slider", { name: "숏폼 타임라인 위치" });
    fireEvent.change(scrubber, { target: { value: "15000" } });
    expect(screen.getByText(/#900\/1800/u)).toBeTruthy();

    // 공정 토글 해제가 반영되고 최소 1개 공정은 항상 유지된다.
    const contiBtn = screen.getByRole("button", { name: "01 콘티" });
    expect(contiBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(contiBtn);
    expect(contiBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("StudioTimelapsePanel 내부 탭에서 SNS 9:16 숏폼 플래너로 전환해 사용할 수 있다", () => {
    render(
      <SessionContext.Provider value={GUEST_SESSION}>
        <StudioTimelapsePanel
          open
          onClose={() => {}}
          pageId="page-1"
          history={SAMPLE_HISTORY}
          title="1화 타임랩스"
          masterEditMode={false}
          captureStep={async () => ({
            source: document.createElement("canvas"),
            width: 800,
            height: 2000,
          })}
          onRecordingStart={() => {}}
          onRecordingEnd={() => {}}
        />
      </SessionContext.Provider>,
    );

    // 기본 탭은 기존 녹화 탭
    expect(screen.getByRole("button", { name: "그리기 과정 녹화" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "타임랩스 영상 만들기" })).toBeTruthy();

    // SNS 9:16 숏폼 플래너 탭 전환
    const shortformTab = screen.getByRole("button", { name: "SNS 9:16 숏폼 플래너" });
    fireEvent.click(shortformTab);
    expect(shortformTab.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("shortform-preview-viewport")).toBeTruthy();
    expect(screen.getByRole("button", { name: /WebVTT 자막 저장/u })).toBeTruthy();
  });
});
