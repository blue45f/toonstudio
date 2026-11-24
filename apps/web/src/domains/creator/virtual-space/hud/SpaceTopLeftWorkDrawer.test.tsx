// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpaceTopLeftWorkDrawer, type SpaceTopLeftWorkDrawerProps } from "./SpaceTopLeftWorkDrawer";
import { buildZeroWalkShortcuts, spaceZoneWorkItems } from "./space-zone-workflow";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const drawerSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "SpaceTopLeftWorkDrawer.tsx"),
  "utf8",
);

function createProps(overrides?: Partial<SpaceTopLeftWorkDrawerProps>): SpaceTopLeftWorkDrawerProps {
  const personal = overrides?.personal ?? true;
  return {
    leadingTools: <span data-testid="mock-leading-profile">내 프로필</span>,
    personal,
    worldReady: true,
    authoringMode: false,
    soloBoardOpen: null,
    onToggleSoloBoard: vi.fn(),
    teamBoardOpen: false,
    onToggleTeamBoard: vi.fn(),
    teamAnnotationOpen: false,
    onToggleTeamAnnotation: vi.fn(),
    workStatusId: "storyboard",
    onSelectWorkStatus: vi.fn(),
    focusActive: false,
    onStartFocusSprint: vi.fn(),
    onCompleteCheckpoint: vi.fn(),
    zoneWorkKind: null,
    zoneWorkItems: [],
    pulse: null,
    zeroWalkShortcuts: buildZeroWalkShortcuts({ personal, activeZoneId: "lobby", reviewCount: 2 }),
    onPanel: vi.fn(),
    onCowork: vi.fn(),
    onShare: vi.fn(),
    onPulseAction: vi.fn(),
    onZeroWalkShortcut: vi.fn(),
    ...overrides,
  };
}

function renderDrawer(overrides?: Partial<SpaceTopLeftWorkDrawerProps>) {
  const props = createProps(overrides);
  const result = render(
    <MemoryRouter>
      <SpaceTopLeftWorkDrawer {...props} />
    </MemoryRouter>,
  );
  return { ...result, props };
}

describe("SpaceTopLeftWorkDrawer (좌상단 단일 접이식 작업 도구 드로어)", () => {
  it("기본 상태는 접힘(open=false)이며 활성 업무 상태 라벨 배지를 단일 토글 버튼에 표시한다", () => {
    const { container } = renderDrawer({ workStatusId: "storyboard" });

    const toolsRow = container.querySelector(".space-top-tools-row");
    expect(toolsRow).not.toBeNull();
    expect(within(toolsRow as HTMLElement).getByTestId("mock-leading-profile")).toBeTruthy();

    const toggle = screen.getByTestId("space-work-tools-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.className).toContain("min-h-11");
    expect(toggle.className).toContain("shrink-0");
    expect(toggle.className).toContain("whitespace-nowrap");
    expect(toggle.textContent).toContain("작업 도구");
    expect(screen.getByTestId("space-work-tools-status-badge").textContent).toBe("콘티 작업 중");

    // 로비 기본 진입 시 5중 바가 방을 가리지 않도록 도구·업무 상태·직행 바는 모두 접혀 있어야 한다.
    expect(screen.queryByTestId("space-work-tools-drawer")).toBeNull();
    expect(screen.queryByTestId("space-quick-whiteboard-btn")).toBeNull();
    expect(screen.queryByTestId("space-quick-stickies-btn")).toBeNull();
    expect(screen.queryByTestId("space-quick-annotation-btn")).toBeNull();
    expect(screen.queryByTestId("space-work-status-bar")).toBeNull();
    expect(screen.queryByTestId("space-zero-walk-bar")).toBeNull();
  });

  it("활성 업무 상태가 없으면 상태 배지 없이 '작업 도구'만 간결하게 표시한다", () => {
    renderDrawer({ workStatusId: null });
    const toggle = screen.getByTestId("space-work-tools-toggle");
    expect(toggle.textContent).toContain("작업 도구");
    expect(screen.queryByTestId("space-work-tools-status-badge")).toBeNull();
  });

  it("토글 클릭으로 펼치고 Escape·닫기 버튼·외부 클릭으로 접으며 포커스를 복귀한다", () => {
    renderDrawer();
    const toggle = screen.getByTestId("space-work-tools-toggle");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("space-work-tools-drawer")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("space-work-tools-drawer")).toBeNull();
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    expect(screen.getByTestId("space-work-tools-drawer")).toBeTruthy();
    fireEvent.click(screen.getByTestId("space-work-tools-close"));
    expect(screen.queryByTestId("space-work-tools-drawer")).toBeNull();
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    expect(screen.getByTestId("space-work-tools-drawer")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("space-work-tools-drawer")).toBeNull();
  });

  it("개인 모드에서 드로어를 펼치면 3종 보드·업무 상태 바·Zero-Walk 직행 3종이 모두 동작한다", () => {
    const { props } = renderDrawer({ personal: true, workStatusId: "inking" });
    const toggle = screen.getByTestId("space-work-tools-toggle");

    fireEvent.click(toggle);
    const drawer = screen.getByTestId("space-work-tools-drawer");

    // 1) 업무 상태 바: 상태 칩 선택 및 집중/공정 체크 동작 (드로어는 열린 상태 유지)
    const statusBar = within(drawer).getByTestId("space-work-status-bar");
    expect(statusBar).toBeTruthy();
    fireEvent.click(within(statusBar).getByTestId("work-status-btn-coloring-bg"));
    expect(props.onSelectWorkStatus).toHaveBeenCalledExactlyOnceWith("coloring-bg");
    fireEvent.click(within(statusBar).getByTestId("space-focus-sprint-btn"));
    expect(props.onStartFocusSprint).toHaveBeenCalledOnce();
    fireEvent.click(within(statusBar).getByTestId("space-milestone-check-btn"));
    expect(props.onCompleteCheckpoint).toHaveBeenCalledOnce();
    expect(screen.getByTestId("space-work-tools-drawer")).toBeTruthy();

    // 2) Zero-Walk 직행 3개 버튼이 드로어 안에 정돈되어 있다.
    const zeroWalk = within(drawer).getByTestId("space-zero-walk-bar");
    expect(within(zeroWalk).getByRole("link", { name: /내 원고 바로 열기/u })).toBeTruthy();
    fireEvent.click(within(zeroWalk).getByRole("button", { name: /붉은펜 검수실 직행/u }));
    expect(props.onZeroWalkShortcut).toHaveBeenCalledWith(
      expect.objectContaining({ id: "direct-redline-review" }),
    );
    expect(screen.queryByTestId("space-work-tools-drawer")).toBeNull();

    // 3) 3종 빠른 보드 버튼(기존 testid 100% 보존)
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId("space-quick-whiteboard-btn"));
    expect(props.onToggleSoloBoard).toHaveBeenLastCalledWith("whiteboard");
    expect(screen.queryByTestId("space-work-tools-drawer")).toBeNull();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId("space-quick-stickies-btn"));
    expect(props.onToggleSoloBoard).toHaveBeenLastCalledWith("stickies");

    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId("space-quick-annotation-btn"));
    expect(props.onToggleSoloBoard).toHaveBeenLastCalledWith("annotation");
  });

  it("월드 미준비 또는 authoringMode에서는 업무 상태 바를 숨긴다", () => {
    const { rerender, props } = renderDrawer({ worldReady: false, authoringMode: false });
    fireEvent.click(screen.getByTestId("space-work-tools-toggle"));
    expect(screen.queryByTestId("space-work-status-bar")).toBeNull();

    rerender(
      <MemoryRouter>
        <SpaceTopLeftWorkDrawer {...props} worldReady authoringMode />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("space-work-status-bar")).toBeNull();
  });

  it("특정 협업 구역(hasZoneItems=true)에서는 구역 안내 바를 즉시 노출하고 Zero-Walk는 드로어에 접어 둔다", () => {
    const items = spaceZoneWorkItems("meeting", {
      projectId: "work-1",
      productionProjectId: null,
      personal: false,
    });
    const { props } = renderDrawer({
      personal: false,
      zoneWorkKind: "meeting",
      zoneWorkItems: items,
      zeroWalkShortcuts: buildZeroWalkShortcuts({ personal: false, activeZoneId: "meeting", reviewCount: 1 }),
    });

    // 접힌 상태: 구역 안내 바만 즉시 보이고 Zero-Walk는 접혀 있다.
    expect(screen.getByRole("navigation", { name: "회의실에서 바로" })).toBeTruthy();
    expect(screen.queryByTestId("space-zero-walk-bar")).toBeNull();
    expect(screen.queryByTestId("space-work-tools-drawer")).toBeNull();

    // 펼친 상태: 구역 안내 바가 중복 없이 드로어 안에 포함되고 팀 보드·Zero-Walk가 함께 열린다.
    fireEvent.click(screen.getByTestId("space-work-tools-toggle"));
    expect(screen.getAllByRole("navigation", { name: "회의실에서 바로" })).toHaveLength(1);
    const drawer = screen.getByTestId("space-work-tools-drawer");
    expect(within(drawer).getByRole("navigation", { name: "회의실에서 바로" })).toBeTruthy();
    expect(within(drawer).getByTestId("space-zero-walk-bar")).toBeTruthy();

    fireEvent.click(within(drawer).getByTestId("space-quick-whiteboard-btn"));
    expect(props.onToggleTeamBoard).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("space-work-tools-drawer")).toBeNull();

    fireEvent.click(screen.getByTestId("space-work-tools-toggle"));
    fireEvent.click(screen.getByTestId("space-quick-annotation-btn"));
    expect(props.onToggleTeamAnnotation).toHaveBeenCalledOnce();
  });

  it("시맨틱 토큰·금지 문법 가드(원시 색·transition-all·localStorage·props={} 0건)를 만족한다", () => {
    expect(drawerSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(drawerSource).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/u);
    expect(drawerSource).not.toMatch(/transition-all/u);
    expect(drawerSource).not.toMatch(/localStorage|sessionStorage/u);
    expect(drawerSource).not.toMatch(/0x[0-9a-fA-F_]+n\b/u);
    expect(drawerSource).not.toMatch(/=\s*\{\s*\}\s*\)/u);
  });
});
