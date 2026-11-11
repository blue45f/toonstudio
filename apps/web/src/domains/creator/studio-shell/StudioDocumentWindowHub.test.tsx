// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  OpenStudioDocumentWorkspaceInput,
  StudioDocumentWindowOpenStatus,
} from "../studio-document-window-launcher";
import { parseStudioDocumentLocation } from "../studio-document-workspace";
import { StudioDocumentWindowHub } from "./StudioDocumentWindowHub";

const runtime = vi.hoisted(() => ({
  open: vi.fn((_input: OpenStudioDocumentWorkspaceInput): StudioDocumentWindowOpenStatus => "opened"),
  focus: vi.fn((_instanceId: string) => true),
  snapshot: {
    local: {
      instanceId: "studio-window-current-1234",
      workspace: "draw" as const,
      visible: true,
      focused: true,
      openedAt: 1,
      lastSeenAt: 1,
    },
    peers: [] as Array<{
      instanceId: string;
      workspace: "review";
      visible: boolean;
      focused: boolean;
      openedAt: number;
      lastSeenAt: number;
    }>,
    transport: "broadcast" as const,
  },
}));

vi.mock("../studio-document-window-launcher", () => ({
  openStudioDocumentWorkspace: runtime.open,
}));
vi.mock("../studio-router/useStudioDocumentWindows", () => ({
  useStudioDocumentWindows: () => ({
    snapshot: runtime.snapshot,
    requestFocus: runtime.focus,
  }),
}));

function resolution() {
  const parsed = parseStudioDocumentLocation({
    pathname: "/studio/p/project-1/d/document-1",
    search: "?workspace=draw&focus=cut%3A2&language=ko&version=v3&room=team-a",
  });
  if (parsed.kind !== "document") throw new Error("document fixture failed");
  return parsed;
}

function renderHub() {
  const onChangeWorkspace = vi.fn();
  const onToggleQuickMode = vi.fn();
  render(
    <MemoryRouter>
      <StudioDocumentWindowHub
        locale="ko"
        resolution={resolution()}
        search="?workspace=draw&focus=cut%3A2&language=ko&version=v3&room=team-a"
        quickMode={false}
        onChangeWorkspace={onChangeWorkspace}
        onToggleQuickMode={onToggleQuickMode}
      />
    </MemoryRouter>,
  );
  return { onChangeWorkspace, onToggleQuickMode };
}

beforeEach(() => {
  runtime.open.mockReset().mockReturnValue("opened");
  runtime.focus.mockReset().mockReturnValue(true);
  runtime.snapshot.peers = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("StudioDocumentWindowHub", () => {
  it("keeps the workspace switcher clear of the app menubar and below tool popovers", () => {
    renderHub();

    const bar = document.querySelector<HTMLElement>(
      '[data-studio-document-window-hub-bar="true"]',
    );
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain("top-[3.25rem]");
    expect(bar?.className).toContain("z-[60]");
  });

  it("offers one-click links back to My work, project stages, and mobile-labeled export", () => {
    renderHub();

    const back = screen.getByRole("link", { name: "내 작업으로 돌아가기" });
    expect(back.getAttribute("href")).toBe("/studio");

    const projectStages = screen.getByRole("link", { name: "프로젝트 단계로 돌아가기" });
    expect(projectStages.getAttribute("href")).toBe("/studio/p/project-1/overview");

    const exportLink = screen.getByRole("link", { name: "저장 및 내보내기 화면 열기" });
    expect(exportLink.getAttribute("href")).toBe("/studio/p/project-1/export");
    expect(exportLink.textContent).toContain("내보내기");
  });

  it("keeps the grouped workspace switcher and direct tab/window actions", () => {
    renderHub();

    const select = screen.getByRole("combobox", { name: "문서 작업공간" });
    expect(screen.getAllByRole("group")).toHaveLength(6);
    expect(screen.getAllByRole("option")).toHaveLength(13);
    expect((select as HTMLSelectElement).value).toBe("draw");

    fireEvent.click(screen.getByRole("button", {
      name: "현재 작업공간을 새 탭으로 열기",
    }));
    expect(runtime.open).toHaveBeenCalledWith(expect.objectContaining({
      workspace: "draw",
      mode: "tab",
      href: expect.stringContaining("room=team-a"),
    }));
  });

  it("opens from the keyboard and copies a canonical cross-browser link", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderHub();

    fireEvent.keyDown(window, { key: "m", metaKey: true, shiftKey: true });
    expect(screen.getByRole("dialog", { name: "여러 창 작업공간" })).toBeTruthy();
    expect(screen.getByText("탭 자동 감지")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다른 브라우저 링크 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "/studio/p/project-1/d/document-1?focus=cut%3A2&language=ko&room=team-a&version=v3&workspace=draw",
    );
    expect(screen.getByRole("status").textContent).toContain("링크를 복사했습니다");
  });

  it("opens production presets as positioned companion windows", () => {
    renderHub();
    fireEvent.click(screen.getByRole("button", { name: "작업공간·창 메뉴, 1개 창" }));
    const preset = screen.getByRole("heading", { name: "원고 제작" }).closest("article");
    if (!preset) throw new Error("preset article missing");

    fireEvent.click(within(preset).getByRole("button", { name: "타일 창" }));
    expect(runtime.open).toHaveBeenCalledTimes(2);
    expect(runtime.open.mock.calls.map(([input]) => ({
      workspace: input.workspace,
      mode: input.mode,
      index: input.index,
      total: input.total,
    }))).toEqual([
      { workspace: "comic", mode: "window", index: 0, total: 2 },
      { workspace: "review", mode: "window", index: 1, total: 2 },
    ]);
  });

  it("키보드로 작업공간 메뉴에 진입하고 Escape로 원래 메뉴 버튼에 복귀한다", async () => {
    renderHub();
    const trigger = screen.getByRole("button", { name: "작업공간·창 메뉴, 1개 창" });
    trigger.focus();
    fireEvent.keyDown(window, { key: "m", ctrlKey: true, shiftKey: true });
    const currentWorkspace = screen.getByRole("button", { name: "그리기·채색" });
    await waitFor(() => expect(document.activeElement).toBe(currentWorkspace));
    fireEvent.keyDown(currentWorkspace, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("discovers a peer and requests focus without exposing its internal id", () => {
    runtime.snapshot.peers = [{
      instanceId: "studio-window-review-5678",
      workspace: "review",
      visible: true,
      focused: false,
      openedAt: 2,
      lastSeenAt: 2,
    }];
    renderHub();

    fireEvent.click(screen.getByRole("button", { name: "작업공간·창 메뉴, 2개 창" }));
    fireEvent.click(screen.getByRole("button", { name: "이 탭으로 전환" }));
    expect(runtime.focus).toHaveBeenCalledWith("studio-window-review-5678");
    expect(screen.getByRole("dialog").textContent).not.toContain(
      "studio-window-review-5678",
    );
  });

  it("surfaces a visible recovery message when the browser blocks a view", () => {
    runtime.open.mockReturnValue("blocked");
    renderHub();

    fireEvent.click(screen.getByRole("button", {
      name: "현재 작업공간을 독립 창으로 열기",
    }));
    fireEvent.click(screen.getByRole("button", { name: "작업공간·창 메뉴, 1개 창" }));

    expect(screen.getByRole("status").textContent).toContain(
      "브라우저가 새 창을 차단했습니다",
    );
  });

  it("기본 도구 줄은 현재 작업공간을 유지하고 다른 작업공간은 메뉴에서 선택한다", () => {
    const { onChangeWorkspace } = renderHub();
    expect(screen.queryByRole("navigation", { name: "작업공간 바로가기" })).toBeNull();
    expect(document.querySelector('[data-studio-autosave-dot="true"]')).toBeNull();
    const trigger = screen.getByRole("button", { name: "작업공간·창 메뉴, 1개 창" });
    fireEvent.click(trigger);
    const stageNav = screen.getByRole("navigation", { name: "작업공간 바로가기" });
    expect(stageNav.getAttribute("data-studio-stage-pill-bar")).toBe("true");
    expect(within(stageNav).getByRole("button", { name: "그리기·채색" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(stageNav).getByRole("button", { name: "콘티" }).getAttribute("aria-pressed")).toBe("false");
    expect(stageNav.textContent).not.toMatch(/\d\.|식자|공정/u);

    fireEvent.click(within(stageNav).getByRole("button", { name: "웹툰 편집" }));
    expect(onChangeWorkspace).toHaveBeenCalledWith("comic");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect((screen.getByRole("combobox", { name: "문서 작업공간" }) as HTMLSelectElement).value).toBe("draw");
  });
});
