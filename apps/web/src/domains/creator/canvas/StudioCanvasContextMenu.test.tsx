// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_Z } from "../studio-z-index";

import {
  StudioCanvasContextMenu,
  type StudioCanvasContextMenuProps,
} from "./StudioCanvasContextMenu";

afterEach(cleanup);

function createProps(
  overrides: Partial<StudioCanvasContextMenuProps> = {}
): StudioCanvasContextMenuProps {
  return {
    open: true,
    x: 120,
    y: 240,
    hasElement: true,
    locked: false,
    onPreloadBackground3d: vi.fn(),
    onSaveAsEmeres: vi.fn(),
    onDuplicate: vi.fn(),
    onReorder: vi.fn(),
    onToggleLock: vi.fn(),
    onDelete: vi.fn(),
    onSelectPen: vi.fn(),
    onAddSpeechBubble: vi.fn(),
    onAddText: vi.fn(),
    onAddPage: vi.fn(),
    onEnableQuickShape: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("StudioCanvasContextMenu", () => {
  it("키보드로 메뉴를 이동하고 닫으면 원래 캔버스로 포커스가 돌아간다", () => {
    const canvas = document.createElement("button");
    document.body.append(canvas);
    canvas.focus();
    const props = createProps();
    const mounted = render(<StudioCanvasContextMenu {...props} />);
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "End" });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(items.at(-1)!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
    mounted.unmount();
    expect(document.activeElement).toBe(canvas);
    canvas.remove();
  });

  it("renders nothing while closed", () => {
    render(<StudioCanvasContextMenu {...createProps({ open: false })} />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs element commands before closing the menu", () => {
    const order: string[] = [];
    const props = createProps({
      onDuplicate: vi.fn(() => order.push("duplicate")),
      onClose: vi.fn(() => order.push("close")),
    });

    render(<StudioCanvasContextMenu {...props} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "복제하기 (⌘J)" }));

    expect(order).toEqual(["duplicate", "close"]);
  });

  it("does not generically close the menu when saving to Emeres", () => {
    const props = createProps();

    render(<StudioCanvasContextMenu {...props} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "이메레스로 저장" }));

    expect(props.onSaveAsEmeres).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("preloads and opens the optional 3D editors through semantic callbacks", () => {
    const order: string[] = [];
    const props = createProps({
      onEditVrm: vi.fn(() => order.push("vrm")),
      onEditBackground3d: vi.fn(() => order.push("background")),
      onClose: vi.fn(() => order.push("close")),
    });

    render(<StudioCanvasContextMenu {...props} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "3D 캐릭터 편집" }));
    expect(order).toEqual(["vrm", "close"]);

    order.length = 0;
    const backgroundButton = screen.getByRole("menuitem", { name: "3D 배경 편집" });
    fireEvent.pointerEnter(backgroundButton);
    fireEvent.pointerDown(backgroundButton);
    fireEvent.focus(backgroundButton);
    fireEvent.click(backgroundButton);

    expect(props.onPreloadBackground3d).toHaveBeenCalledTimes(3);
    expect(order).toEqual(["background", "close"]);
  });

  it("preserves layer ordering directions and lock wording", () => {
    const props = createProps({ locked: true });

    render(<StudioCanvasContextMenu {...props} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "맨 앞으로" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "한 단계 앞으로" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "한 단계 뒤로" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "맨 뒤로" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "잠금 해제" }));

    expect(props.onReorder).toHaveBeenNthCalledWith(1, "front");
    expect(props.onReorder).toHaveBeenNthCalledWith(2, "forward");
    expect(props.onReorder).toHaveBeenNthCalledWith(3, "backward");
    expect(props.onReorder).toHaveBeenNthCalledWith(4, "back");
    expect(props.onToggleLock).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledTimes(5);
  });

  it("routes blank-canvas commands without owning editor state", () => {
    const props = createProps({ hasElement: false });

    render(<StudioCanvasContextMenu {...props} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "펜으로 그리기" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "말풍선 추가" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "텍스트 추가" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "새 페이지 추가" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "스마트 도형 켜기" }));

    expect(props.onSelectPen).toHaveBeenCalledOnce();
    expect(props.onAddSpeechBubble).toHaveBeenCalledOnce();
    expect(props.onAddText).toHaveBeenCalledOnce();
    expect(props.onAddPage).toHaveBeenCalledOnce();
    expect(props.onEnableQuickShape).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledTimes(5);
  });

  it("positions the menu and stops the global outside-click bubble", () => {
    const parentClick = vi.fn();
    render(<StudioCanvasContextMenu {...createProps()} />);
    document.body.addEventListener("click", parentClick);
    const menu = screen.getByRole("menu", {name: "캔버스 작업"});
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.zIndex).toBe(String(STUDIO_Z.toolPopover));

    expect(menu?.style.top).toBe("240px");
    expect(menu?.style.left).toBe("120px");
    fireEvent.click(menu);
    expect(parentClick).not.toHaveBeenCalled();
    document.body.removeEventListener("click", parentClick);
  });

  it("전체화면 원고에서는 메뉴를 그 화면에 포털한다", () => {
    const root = document.body.appendChild(document.createElement("main"));
    const original = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    Object.defineProperty(document, "fullscreenElement", {configurable: true, value: root});
    try {
      render(<StudioCanvasContextMenu {...createProps()} />);
      expect(screen.getByRole("menu").parentElement).toBe(root);
    } finally {
      cleanup();
      if (original) Object.defineProperty(document, "fullscreenElement", original);
      else Reflect.deleteProperty(document, "fullscreenElement");
      root.remove();
    }
  });

  it("renders quick canvas control strip when undo/redo/flip/zoom callbacks are provided", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onFlipHorizontal = vi.fn();
    const onZoomReset = vi.fn();
    const onClose = vi.fn();
    render(
      <StudioCanvasContextMenu
        {...createProps({
          onUndo,
          onRedo,
          onFlipHorizontal,
          onZoomReset,
          onClose,
        })}
      />
    );

    expect(screen.getByTestId("canvas-context-quick-strip")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "실행 취소 (⌘Z)" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "다시 실행 (⇧⌘Z)" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "좌우 반전 데생 점검" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "화면 맞춤 (100%)" }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
    expect(onFlipHorizontal).toHaveBeenCalledOnce();
    expect(onZoomReset).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});

