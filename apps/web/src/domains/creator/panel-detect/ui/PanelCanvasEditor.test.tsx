// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { clampSplitPosition, percentRectStyle, rectFromPoints } from "../panel-canvas-geometry";
import { detectPanels } from "../panel-detect-core";
import { addPanel, createPanelEditState, moveRect, resizeRectEdge, type EditablePanel } from "../panel-detect-edit";

import { PanelCanvasEditor, type PanelCanvasEditorProps } from "./PanelCanvasEditor";
import { mockBounds, samplePage } from "./panel-ui-test-kit";

const IMAGE = samplePage();
const SIZE = { width: IMAGE.width, height: IMAGE.height } as const;
const DETECTED = createPanelEditState(detectPanels({ width: IMAGE.width, height: IMAGE.height, data: new Uint8ClampedArray(IMAGE.data) }, {}));
const PANELS = DETECTED.panels;

function handlers() {
  return { onSelect: vi.fn(), onSetRect: vi.fn(), onMoveBy: vi.fn(), onDraw: vi.fn(), onSplit: vi.fn(), onDelete: vi.fn(), onAdopt: vi.fn() };
}

function renderEditor(overrides: Partial<PanelCanvasEditorProps> = {}) {
  const spies = handlers();
  const props: PanelCanvasEditorProps = {
    imageUrl: "blob:preview",
    image: SIZE,
    panels: PANELS,
    selectedId: null,
    tool: "select",
    undetectable: [],
    ignored: [],
    zoom: 1,
    ...spies,
    ...overrides,
  };
  const view = render(<PanelCanvasEditor {...props} />);
  const root = screen.getByRole("group", { name: /컷 편집 캔버스|Panel editing canvas/ });
  return { ...view, ...spies, root };
}

function panelButtons(): HTMLElement[] {
  return screen.getAllByRole("button", { name: /^(컷|Panel) \d+, / });
}

function panelOf(index: number): EditablePanel {
  const panel = PANELS[index];
  if (!panel) throw new Error(`시험 원고에서 ${index + 1}번 컷을 찾지 못했어요.`);
  return panel;
}

function elementOf(elements: readonly HTMLElement[], index: number): HTMLElement {
  const element = elements[index];
  if (!element) throw new Error(`${index + 1}번째 요소가 없어요.`);
  return element;
}

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => {
  vi.restoreAllMocks();
  useI18n.getState().setLang("ko");
});

describe("시험 원고", () => {
  it("합성 페이지에서 컷 셋을 찾는다(이후 시험의 전제)", () => {
    expect(PANELS).toHaveLength(3);
  });
});

describe("컷 편집 캔버스 — 표시와 접근성", () => {
  it("컷마다 번호와 신뢰도, 위치·크기를 읽어 주는 이름을 가진다", () => {
    renderEditor();
    const buttons = panelButtons();
    expect(buttons).toHaveLength(3);
    PANELS.forEach((panel, index) => {
      const label = elementOf(buttons, index).getAttribute("aria-label") ?? "";
      expect(label).toContain(`컷 ${index + 1}, `);
      expect(label).toContain(`위치 x ${panel.x}, y ${panel.y}, 크기 ${panel.width}×${panel.height} 픽셀`);
      expect(label).toMatch(/신뢰도 (높음|보통|낮음)/u);
    });
    expect(screen.getByRole("img", { name: "가져온 원고 이미지" }).getAttribute("src")).toBe("blob:preview");
  });

  it("컷이 있으면 컷이 포커스를 받으므로 스크롤 영역은 따로 포커스를 받지 않는다", () => {
    const { container } = renderEditor();
    const scroller = container.querySelector("[data-panel-canvas-scroller]");
    expect(scroller?.hasAttribute("tabindex")).toBe(false);
    expect(screen.queryByRole("region", { name: /컷 편집 영역/ })).toBeNull();
  });

  it("컷도 제외 조각도 검출 불가 영역도 없으면 스크롤 영역 자체가 포커스를 받아 키보드로 이미지를 훑을 수 있다", () => {
    renderEditor({ panels: [] });
    const region = screen.getByRole("region", { name: /컷 편집 영역 \(방향키로 스크롤\)/ });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.hasAttribute("data-panel-canvas-scroller")).toBe(true);
    region.focus();
    expect(document.activeElement).toBe(region);
  });

  it("컷의 위치는 이미지 대비 퍼센트로 놓여 표시 크기와 무관하게 맞는다", () => {
    renderEditor();
    const first = elementOf(panelButtons(), 0);
    const style = percentRectStyle(panelOf(0), SIZE);
    expect(first.style.left).toBe(style.left);
    expect(first.style.top).toBe(style.top);
    expect(first.style.width).toBe(style.width);
    expect(first.style.height).toBe(style.height);
  });

  it("겹쳐 놓은 상자는 단추 일괄 효과(마우스를 올리면 떠오름)로 이미지에서 어긋나지 않게 인라인으로 고정한다", () => {
    renderEditor({
      ignored: [{ id: "ignored-1", x: 5, y: 5, width: 20, height: 20, reason: "too-small" }],
      undetectable: [{ id: "undetectable-1", x: 100, y: 100, width: 60, height: 60, reason: "non-separable", componentCount: 2 }],
    });
    for (const button of panelButtons()) expect(button.style.transform).toBe("none");
    expect(screen.getByRole("button", { name: /제외된 조각 1/ }).style.transform).toBe("none");
    expect(screen.getByRole("button", { name: /자동으로 나눌 수 없는 영역 1/ }).style.transform).toBe("none");
  });

  it("선택한 컷만 눌림 상태이고 가장자리 손잡이가 나타난다", () => {
    renderEditor({ selectedId: panelOf(1).id });
    const buttons = panelButtons();
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(elementOf(buttons, 1).querySelectorAll("[data-edge]")).toHaveLength(4);
    expect(elementOf(buttons, 0).querySelectorAll("[data-edge]")).toHaveLength(0);
  });

  it("직접 만든 컷은 이름에서 구분된다", () => {
    const withUser = addPanel(DETECTED, { x: 20, y: 300, width: 60, height: 40 });
    renderEditor({ panels: withUser.panels });
    const labels = panelButtons().map((button) => button.getAttribute("aria-label") ?? "");
    expect(labels).toHaveLength(4);
    expect(labels[3]).toContain("직접 만든 컷");
  });

  it("영문 화면에서는 영문 이름이 붙는다", () => {
    useI18n.getState().setLang("en");
    renderEditor();
    const label = elementOf(panelButtons(), 0).getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^Panel 1, (High|Medium|Low) confidence, at x \d+, y \d+, size \d+×\d+ px$/u);
    expect(screen.getByRole("group", { name: "Panel editing canvas" })).toBeTruthy();
  });

  it("확대 배율은 캔버스 폭으로 나타난다", () => {
    const { root } = renderEditor({ zoom: 2 });
    expect(root.style.width).toBe("200%");
  });
});

describe("컷 편집 캔버스 — 키보드", () => {
  it("방향키는 화면 4px 정도, Shift 는 정확히 1픽셀 옮긴다", () => {
    mockBounds(400, 560);
    const { onMoveBy, onSelect } = renderEditor();
    const first = elementOf(panelButtons(), 0);
    const { id } = panelOf(0);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onMoveBy).toHaveBeenLastCalledWith(id, 4, 0);
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(onMoveBy).toHaveBeenLastCalledWith(id, 0, 4);
    fireEvent.keyDown(first, { key: "ArrowLeft", shiftKey: true });
    expect(onMoveBy).toHaveBeenLastCalledWith(id, -1, 0);
    fireEvent.keyDown(first, { key: "ArrowUp", shiftKey: true });
    expect(onMoveBy).toHaveBeenLastCalledWith(id, 0, -1);
    expect(onSelect).toHaveBeenCalledWith(id);
  });

  it("축소 표시 중에는 같은 화면 거리를 위해 더 많은 픽셀을 옮긴다", () => {
    mockBounds(200, 280);
    const { onMoveBy } = renderEditor();
    fireEvent.keyDown(elementOf(panelButtons(), 0), { key: "ArrowRight" });
    expect(onMoveBy).toHaveBeenLastCalledWith(panelOf(0).id, 8, 0);
  });

  it("Alt+방향키는 오른쪽·아래 변을 움직여 크기를 바꾼다", () => {
    mockBounds(400, 560);
    const { onSetRect, onMoveBy } = renderEditor();
    const panel = panelOf(0);
    const first = elementOf(panelButtons(), 0);
    fireEvent.keyDown(first, { key: "ArrowRight", altKey: true });
    expect(onSetRect).toHaveBeenLastCalledWith(panel.id, resizeRectEdge(panel, "right", panel.x + panel.width + 4, SIZE.width, SIZE.height));
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true, shiftKey: true });
    expect(onSetRect).toHaveBeenLastCalledWith(panel.id, resizeRectEdge(panel, "bottom", panel.y + panel.height + 1, SIZE.width, SIZE.height));
    expect(onMoveBy).not.toHaveBeenCalled();
  });

  it("Delete·Backspace 는 삭제, Esc 는 선택 해제, Enter·Space 는 선택", () => {
    const { onDelete, onSelect } = renderEditor();
    const first = elementOf(panelButtons(), 0);
    const { id } = panelOf(0);
    fireEvent.keyDown(first, { key: "Delete" });
    fireEvent.keyDown(first, { key: "Backspace" });
    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(onDelete).toHaveBeenCalledWith(id);
    fireEvent.keyDown(first, { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.keyDown(first, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith(id);
    fireEvent.keyDown(first, { key: " " });
    expect(onSelect).toHaveBeenLastCalledWith(id);
  });

  it("관계없는 키는 아무 것도 바꾸지 않는다", () => {
    const { onDelete, onMoveBy, onSetRect, onDraw } = renderEditor();
    fireEvent.keyDown(elementOf(panelButtons(), 0), { key: "a" });
    fireEvent.keyDown(elementOf(panelButtons(), 0), { key: "Tab" });
    for (const spy of [onDelete, onMoveBy, onSetRect, onDraw]) expect(spy).not.toHaveBeenCalled();
  });

  it("컷에 포커스가 가면 그 컷이 선택된다(선택 도구일 때)", () => {
    const { onSelect } = renderEditor();
    fireEvent.focus(elementOf(panelButtons(), 2));
    expect(onSelect).toHaveBeenCalledWith(panelOf(2).id);
  });
});

describe("컷 편집 캔버스 — 끌기", () => {
  it("컷을 끌면 미리 보여 주고, 놓을 때 한 번만 확정한다", () => {
    mockBounds(400, 560);
    const { root, onSelect, onSetRect } = renderEditor();
    const panel = panelOf(0);
    const first = elementOf(panelButtons(), 0);
    fireEvent.pointerDown(first, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith(panel.id);
    fireEvent.pointerMove(root, { clientX: 70, clientY: 90, pointerId: 1 });
    const expected = moveRect(panel, 20, 30, SIZE.width, SIZE.height);
    expect(first.style.left).toBe(percentRectStyle(expected, SIZE).left);
    expect(first.style.top).toBe(percentRectStyle(expected, SIZE).top);
    expect(onSetRect).not.toHaveBeenCalled();
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onSetRect).toHaveBeenCalledTimes(1);
    expect(onSetRect).toHaveBeenCalledWith(panel.id, expected);
  });

  it("움직이지 않았거나 제자리로 돌아오면 확정하지 않는다", () => {
    mockBounds(400, 560);
    const { root, onSetRect } = renderEditor();
    const first = elementOf(panelButtons(), 0);
    fireEvent.pointerDown(first, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    fireEvent.pointerDown(first, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 90, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 50, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onSetRect).not.toHaveBeenCalled();
  });

  it("끌기를 취소하면 확정하지 않는다", () => {
    mockBounds(400, 560);
    const { root, onSetRect } = renderEditor();
    const first = elementOf(panelButtons(), 0);
    fireEvent.pointerDown(first, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 90, clientY: 120, pointerId: 1 });
    fireEvent.pointerCancel(root, { pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onSetRect).not.toHaveBeenCalled();
  });

  it("마우스 오른쪽 단추로는 끌지 않는다", () => {
    mockBounds(400, 560);
    const { root, onSelect, onSetRect } = renderEditor();
    fireEvent.pointerDown(elementOf(panelButtons(), 0), { button: 2, clientX: 50, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 90, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSetRect).not.toHaveBeenCalled();
  });

  it("가장자리를 끌면 그 변만 움직여 크기가 바뀐다", () => {
    mockBounds(400, 560);
    const panel = panelOf(0);
    const { root, onSetRect } = renderEditor({ selectedId: panel.id });
    const edge = elementOf(panelButtons(), 0).querySelector('[data-edge="right"]');
    if (!edge) throw new Error("오른쪽 가장자리 손잡이를 찾지 못했어요.");
    const right = panel.x + panel.width;
    fireEvent.pointerDown(edge, { button: 0, clientX: right, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: right - 30, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onSetRect).toHaveBeenCalledTimes(1);
    expect(onSetRect).toHaveBeenCalledWith(panel.id, resizeRectEdge(panel, "right", right - 30, SIZE.width, SIZE.height));
  });

  it("손잡이를 변에서 벗어난 곳에서 잡아도 변이 포인터 밑으로 튀지 않고 끈 만큼만 움직인다", () => {
    mockBounds(400, 560);
    const panel = panelOf(0);
    const { root, onSetRect } = renderEditor({ selectedId: panel.id });
    const edge = elementOf(panelButtons(), 0).querySelector('[data-edge="right"]');
    if (!edge) throw new Error("오른쪽 가장자리 손잡이를 찾지 못했어요.");
    const right = panel.x + panel.width;
    // 손잡이는 변 둘레 약 10px 까지 잡힌다. 변에서 8px 바깥을 눌러 그대로 놓으면 아무 일도 일어나지 않는다.
    fireEvent.pointerDown(edge, { button: 0, clientX: right + 8, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onSetRect).not.toHaveBeenCalled();
    // 30px 끌면 변이 정확히 30px 안쪽으로 온다(포인터가 있는 right - 22 가 아니라 right - 30).
    fireEvent.pointerDown(edge, { button: 0, clientX: right + 8, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: right + 8 - 30, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onSetRect).toHaveBeenCalledTimes(1);
    expect(onSetRect).toHaveBeenCalledWith(panel.id, resizeRectEdge(panel, "right", right - 30, SIZE.width, SIZE.height));
  });

  it("빈 곳을 누르면 선택이 풀린다", () => {
    mockBounds(400, 560);
    const { root, onSelect } = renderEditor({ selectedId: panelOf(0).id });
    fireEvent.pointerDown(root, { button: 0, clientX: 5, clientY: 5, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("상자 크기를 아직 알 수 없으면(배치 전) 끌기를 시작하지 않는다", () => {
    const { root, onSetRect } = renderEditor();
    fireEvent.pointerDown(elementOf(panelButtons(), 0), { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 90, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onSetRect).not.toHaveBeenCalled();
  });
});

describe("컷 편집 캔버스 — 새 컷 그리기와 나누기", () => {
  it("그리기 도구로 끌면 새 컷이 되고, 너무 작으면 버린다", () => {
    mockBounds(400, 560);
    const { root, onDraw, onSelect } = renderEditor({ tool: "draw" });
    fireEvent.pointerDown(root, { button: 0, clientX: 30, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 130, clientY: 360, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(onDraw).toHaveBeenCalledWith({ x: 30, y: 300, width: 100, height: 60 });

    fireEvent.pointerDown(root, { button: 0, clientX: 200, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 203, clientY: 303, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("기존 컷 위에서 시작해도 그리기 도구면 새 컷을 그린다", () => {
    mockBounds(400, 560);
    const { root, onDraw, onSetRect } = renderEditor({ tool: "draw" });
    fireEvent.pointerDown(elementOf(panelButtons(), 0), { button: 0, clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(root, { clientX: 140, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(onDraw).toHaveBeenCalledWith(rectFromPoints({ x: 40, y: 40 }, { x: 140, y: 120 }));
    expect(onSetRect).not.toHaveBeenCalled();
  });

  it("그리기 도구에서는 가장자리 손잡이가 없다", () => {
    renderEditor({ tool: "draw", selectedId: panelOf(0).id });
    expect(document.querySelectorAll("[data-edge]")).toHaveLength(0);
  });

  it("나누기 도구는 누른 자리의 컷을 가로선·세로선으로 나눈다", () => {
    mockBounds(400, 560);
    const bottom = PANELS.find((panel) => panel.y > 200);
    if (!bottom) throw new Error("아래쪽 컷을 찾지 못했어요.");
    const centerX = bottom.x + bottom.width / 2;
    const centerY = bottom.y + bottom.height / 2;

    const horizontal = renderEditor({ tool: "split-horizontal" });
    fireEvent.click(screen.getByRole("button", { name: "나눌 컷 위를 눌러 분할선 놓기" }), { clientX: centerX, clientY: centerY });
    expect(horizontal.onSplit).toHaveBeenCalledWith(bottom.id, "horizontal", clampSplitPosition(bottom, "horizontal", centerY));
    horizontal.unmount();

    const vertical = renderEditor({ tool: "split-vertical" });
    fireEvent.click(screen.getByRole("button", { name: "나눌 컷 위를 눌러 분할선 놓기" }), { clientX: centerX, clientY: centerY });
    expect(vertical.onSplit).toHaveBeenCalledWith(bottom.id, "vertical", clampSplitPosition(bottom, "vertical", centerX));
  });

  it("컷이 없는 여백을 누르면 나누지 않는다", () => {
    mockBounds(400, 560);
    const { onSplit } = renderEditor({ tool: "split-horizontal" });
    fireEvent.click(screen.getByRole("button", { name: "나눌 컷 위를 눌러 분할선 놓기" }), { clientX: 2, clientY: 2 });
    expect(onSplit).not.toHaveBeenCalled();
  });

  it("나누기 도구가 아닐 때는 나누기 덮개가 없다", () => {
    renderEditor({ tool: "select" });
    expect(screen.queryByRole("button", { name: "나눌 컷 위를 눌러 분할선 놓기" })).toBeNull();
  });
});

describe("컷 편집 캔버스 — 자동으로 못 나눈 영역과 제외한 조각", () => {
  it("검출 불가 영역과 제외 조각을 눌러 컷으로 채택할 수 있다", () => {
    const undetectable = { id: "u1", x: 20, y: 30, width: 100, height: 80, reason: "non-separable", componentCount: 3 } as const;
    const ignored = { id: "i1", x: 300, y: 500, width: 30, height: 20, reason: "too-small" } as const;
    const { onAdopt } = renderEditor({ undetectable: [undetectable], ignored: [ignored] });
    fireEvent.click(screen.getByRole("button", { name: "자동으로 나눌 수 없는 영역 1 (100×80). 눌러 한 컷으로 쓰기" }));
    expect(onAdopt).toHaveBeenLastCalledWith(undetectable);
    fireEvent.click(screen.getByRole("button", { name: "제외된 조각 1 (30×20). 눌러 컷으로 쓰기" }));
    expect(onAdopt).toHaveBeenLastCalledWith(ignored);
    expect(screen.getByText("검출 불가")).toBeTruthy();
  });
});
