// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, createRef, type PropsWithChildren, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAssistantReadinessBanner } from "./StudioBg3dAssistantReadinessBanner";
import { StudioBg3dEditorModal } from "./StudioBg3dEditorModal";
import { deriveStudioBg3dReadinessState } from "./studio-bg3d-readiness-state";

import type { StudioBg3dEditorModalHost } from "./StudioBg3dEditorModal";
import type { StudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";

vi.mock("./studio-bg3d-editor-runtime-bindings", () => ({}));
vi.mock("./StudioBg3dEditorViewport", () => ({ StudioBg3dEditorViewport: () => <canvas data-testid="shared-viewport-canvas" /> }));
vi.mock("./StudioBg3dEditorSidebar", () => ({ StudioBg3dEditorSidebar: () => null }));
vi.mock("../scene3d/StudioScene3dBg3dCutPanel", () => ({
  StudioScene3dBg3dCutPanel: ({ host }: { host: StudioBg3dEditorModalHost }) => <div data-testid="pinned-cut-host" data-open={host.open} />,
}));
vi.mock("./StudioBg3dSceneAssistantWorkspace", () => ({
  StudioBg3dSceneAssistantWorkspace: ({ viewport }: { viewport: ReactNode }) => <div data-testid="mock-scene-assistant">{viewport}<input aria-label="장면 검색" /></div>,
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function emptyOutlinerController(): StudioBg3dSceneOutlinerController {
  return {
    query: "",
    items: [],
    filteredItems: [],
    hierarchy: {
      roots: [],
      childrenByParent: new Map(),
      parentById: new Map(),
      repairedOrphans: 0,
      repairedSelfParents: 0,
      repairedCycles: 0,
    },
    selectedIds: new Set(),
    setQuery: vi.fn(),
    select: vi.fn(),
    rename: vi.fn(),
    toggleVisibility: vi.fn(),
    toggleLock: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
  };
}

function host(
  overrides: Partial<StudioBg3dEditorModalHost> = {},
): StudioBg3dEditorModalHost {
  return {
    Boxes: () => null,
    X: () => null,
    CONTROL_BUTTON: "control",
    ICON_BUTTON: "icon-control",
    cx: (...parts: string[]) => parts.join(" "),
    open: true,
    webXrRendererLifetimeRetained: false,
    modalDialogRef: createRef<HTMLDivElement>(),
    isBatchRenderingShots: false,
    shotBatchProgress: null,
    shotBatchAbortRef: createRef<AbortController>(),
    isCapturing: false,
    deletingModelId: null,
    webXrSessionState: { status: "idle" },
    requestUserClose: vi.fn(),
    outlinerController: emptyOutlinerController(),
    ...overrides,
  };
}

// 실제 정밀 작업실의 내부 링크가 사용하는 라우터를 모든 render/rerender에 유지한다.
function StudioRouterContext({ children }: PropsWithChildren) {
  return <MemoryRouter initialEntries={["/studio/bg3d"]}>{children}</MemoryRouter>;
}

function renderModal(h: StudioBg3dEditorModalHost) {
  return render(createElement(StudioBg3dEditorModal, { h }), { wrapper: StudioRouterContext });
}

describe("BG3D modal compositor boundary", () => {
  it("uses a dense readable scrim rather than sampling the underlying full-screen GPU canvas", () => {
    renderModal(host());
    const dialog = screen.getByRole("dialog", { name: "장면 도우미" });
    expect(dialog.className).toContain("bg-[oklch(0.08_0.01_70/0.94)]");
    expect(dialog.className).not.toContain("backdrop-blur");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("tabindex")).toBe("-1");
  });

  it("opens in simple mode and keeps the professional workspace one click away", () => {
    renderModal(host());
    const dialog = screen.getByRole("dialog", { name: "장면 도우미" });
    expect(dialog.getAttribute("data-studio-bg3d-experience")).toBe("simple");
    expect(dialog.getAttribute("data-studio-bg3d-workspace")).toBe("scene-assistant-v1");
    expect(screen.getByTestId("mock-scene-assistant")).toBeDefined();
    expect(screen.getByRole("button", { name: /간편/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /정밀/ }));
    expect(dialog.getAttribute("data-studio-bg3d-experience")).toBe("pro");
    expect(dialog.getAttribute("data-studio-bg3d-workspace")).toBe("professional-v2");
    expect(screen.getByRole("dialog", { name: "정밀 3D 편집" })).toBeDefined();
    expect(screen.getByRole("button", { name: /정밀/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("간편·정밀 왕복은 같은 캔버스를 이동하고 편집기를 닫으면 제거한다", () => {
    const view = renderModal(host());
    const canvas = screen.getByTestId("shared-viewport-canvas");
    expect(screen.getByTestId("mock-scene-assistant").contains(canvas)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /정밀/ }));
    expect(document.querySelector("[data-bg3d-professional-viewport]")?.contains(canvas)).toBe(true);
    expect(screen.getByTestId("pinned-cut-host").dataset.open).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /간편/ }));
    expect(screen.getByTestId("mock-scene-assistant").contains(canvas)).toBe(true);
    expect(screen.getAllByTestId("shared-viewport-canvas")).toHaveLength(1);
    view.unmount();
    expect(canvas.isConnected).toBe(false);
  });

  it("keeps the keyboard-focusable close action and its original dismissal handler", () => {
    const h = host();
    renderModal(h);
    const close = screen.getByRole("button", { name: /^닫기$/ });
    expect(close.getAttribute("data-bg3d-initial-focus")).toBe("true");
    fireEvent.click(close);
    expect(h.requestUserClose).toHaveBeenCalledOnce();
  });

  it("닫힌 상태에서 연 모달도 키보드 높이를 적용하고 모드를 바꿔도 닫기를 유지한다", () => {
    vi.useFakeTimers();
    const viewport = Object.assign(new EventTarget(), { height: 664, offsetTop: 0, scale: 1 });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 664);
    const h = host({ open: false });
    const view = renderModal(h);
    view.rerender(createElement(StudioBg3dEditorModal, { h: { ...h, open: true } }));
    const dialog = screen.getByRole("dialog", { name: "장면 도우미" });
    screen.getByRole("textbox", { name: "장면 검색" }).focus();
    viewport.height = 350;
    viewport.dispatchEvent(new Event("resize"));
    act(() => { vi.advanceTimersByTime(32); });
    expect(dialog.style.getPropertyValue("--studio-3d-viewport-height")).toBe("350px");
    expect(dialog.getAttribute("data-studio-3d-keyboard-open")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBe("studio-bg3d-dialog-description");
    expect(document.getElementById("studio-bg3d-dialog-description")?.textContent).toContain("장소를 고르고");
    fireEvent.click(screen.getByRole("button", { name: /정밀/ }));
    expect(screen.getByRole("dialog", { name: "정밀 3D 편집" })).toBe(dialog);
    fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
    expect(h.requestUserClose).toHaveBeenCalledOnce();
    view.rerender(createElement(StudioBg3dEditorModal, { h }));
    expect(dialog.style.getPropertyValue("--studio-3d-viewport-height")).toBe("");
  });

  it("does not dismiss or expose scene editing while a capture owns the scene", () => {
    const h = host({ isCapturing: true });
    renderModal(h);
    const close = screen.getByRole("button", { name: /^닫기$/ }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    fireEvent.click(close);
    expect(h.requestUserClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").querySelector('[aria-busy="true"]')?.hasAttribute("inert"))
      .toBe(true);
  });

  it("retains a hidden inert XR owner without retaining an accessible dialog", () => {
    const h = host({ open: false, webXrRendererLifetimeRetained: true });
    const view = renderModal(h);
    const root = view.container.firstElementChild;
    expect(root?.hasAttribute("hidden")).toBe(true);
    expect(root?.hasAttribute("inert")).toBe(true);
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(createElement(StudioBg3dEditorModal, { h: host({ open: false }) }));
    expect(view.container.childNodes).toHaveLength(0);
  });

  it("모바일 헤더를 1행(제목·간편/정밀·닫기)과 선택적 2행(상태·원고 복귀)의 2줄 이내로 구성한다", () => {
    const unavailableReadiness = deriveStudioBg3dReadinessState({
      enginePhase: "ready",
      planStatus: "unavailable",
      selectedBackend: "webgpu",
      hasModelRenderer: false,
      isRestoringScene: false,
      planNotice: "사용 가능한 WebGPU 어댑터를 찾지 못했습니다.",
    });
    const view = renderModal(host());
    const header = document.querySelector<HTMLElement>("[data-bg3d-workspace-header]");
    expect(header?.getAttribute("data-bg3d-header-layout")).toBe("compact-two-row");
    expect(header?.querySelector("[data-bg3d-header-title]")?.className).toContain("order-1");
    expect(header?.querySelector("[data-bg3d-header-actions]")?.className).toContain("order-2");
    expect(header?.querySelector("[data-bg3d-header-status-row]")).toBeNull();

    view.rerender(createElement(StudioBg3dEditorModal, { h: host({ readinessState: unavailableReadiness }) }));
    const statusRow = header?.querySelector<HTMLElement>("[data-bg3d-header-status-row]");
    expect(statusRow?.className).toContain("order-3");
    expect(statusRow?.className).toContain("w-full");
    expect(screen.getByTestId("studio-bg3d-active-engine-badge").textContent).toContain("WebGPU 사용 불가");
    expect(screen.getByTestId("studio-bg3d-header-return-2d").className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: /간편/ }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: /정밀/ }).className).toContain("min-h-11");
  });

  it("모바일에서 중앙 복구 패널이 떠 있을 때 하단 경고 배너 중복을 억제하고 전체 시트 복구 경로는 유지한다", () => {
    const unavailableReadiness = deriveStudioBg3dReadinessState({
      enginePhase: "ready",
      planStatus: "unavailable",
      selectedBackend: "webgpu",
      hasModelRenderer: false,
      isRestoringScene: false,
    });
    render(
      createElement(StudioBg3dAssistantReadinessBanner, {
        readiness: unavailableReadiness,
        preference: "webgpu",
        hasDraftScene: false,
        onPreferenceChange: vi.fn(),
        onReturnTo2d: vi.fn(),
      }),
    );
    const errorBanner = screen.getByTestId("studio-bg3d-assistant-error");
    expect(errorBanner.getAttribute("data-bg3d-readiness-compact")).toBe("true");
    expect(errorBanner.getAttribute("data-bg3d-assistant-viewport-dedupe")).toBe("true");
    expect(errorBanner.textContent).toContain("WebGPU 사용 불가");

    const mobileCss = readFileSync(
      resolve(process.cwd(), "apps/web/src/domains/creator/bg3d/studio-bg3d-mobile-workspace.css"),
      "utf8",
    );
    expect(mobileCss).toContain('.scene-assistant:not([data-sheet-state="full"]):has([data-testid="studio-bg3d-engine-unavailable"])');
    expect(mobileCss).toContain('[data-testid="studio-bg3d-assistant-error"][data-bg3d-assistant-viewport-dedupe="true"]');
  });
});
