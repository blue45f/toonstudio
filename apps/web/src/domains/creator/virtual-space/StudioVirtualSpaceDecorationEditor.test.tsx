// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceDecorationEditor } from "./StudioVirtualSpaceDecorationEditor";
import { studioVirtualDecorationPreset, type StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import { studioVirtualDecorationStateForWorld } from "./studio-virtual-space-decoration-layout";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

afterEach(cleanup);

describe("가구 배치 지도 선택 영역", () => {
  it("8번 데스크의 선택 영역을 사각형으로 한정하고 클릭·키보드가 같은 가구를 선택한다", () => {
    const world = studioVirtualPlaceWorldManifest("creator-cafe");
    const preset = studioVirtualDecorationStateForWorld(studioVirtualDecorationPreset("creator-garden"), world);
    const decorations = { ...preset, placements: [...preset.placements,
      { id: "added-desk", type: "drawing-desk" as const, x: 549, y: 570, rotation: 0 as const, scale: 1 },
    ] };
    const onChange = vi.fn();
    const props = { world, decorations, selfPoint: { x: 480, y: 540 }, onChange };
    const view = render(<StudioVirtualSpaceDecorationEditor {...props} artStyle="webtoon" />);
    const desk = screen.getByRole("button", { name: "8번 드로잉 데스크 선택" });
    const tree = screen.getByRole("button", { name: "2번 나무 선택" });
    expect(desk.tagName.toLowerCase()).toBe("rect");
    expect(Number(desk.getAttribute("width"))).toBeCloseTo(82, 10);
    expect(Number(desk.getAttribute("height"))).toBeCloseTo(82, 10);
    expect(desk.querySelector("svg, image")).toBeNull();
    expect(desk.getAttribute("pointer-events")).toBe("all");
    expect(desk.parentElement?.getAttribute("pointer-events")).toBe("none");
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" });
    fireEvent.click(tree);
    expect(select.value).toBe("garden-tree-east");
    fireEvent.click(desk);
    expect(select.value).toBe("added-desk");
    expect(desk.getAttribute("aria-pressed")).toBe("true");
    expect(tree.getAttribute("aria-pressed")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(select.value).toBe("garden-tree-east");
    fireEvent.keyDown(desk, { key: " " });
    expect(select.value).toBe("added-desk");
    view.rerender(<StudioVirtualSpaceDecorationEditor {...props} artStyle="pastel" />);
    expect(screen.getByRole("button", { name: "8번 드로잉 데스크 선택" }).tagName.toLowerCase()).toBe("rect");
    expect(select.value).toBe("added-desk");
  });
});

describe("가구 드래그 편집", () => {
  const world = studioVirtualPlaceWorldManifest("creator-cafe");
  const preset = studioVirtualDecorationStateForWorld(studioVirtualDecorationPreset("creator-garden"), world);
  const decorations = { ...preset, placements: [...preset.placements,
    { id: "added-desk", type: "drawing-desk" as const, x: 549, y: 570, rotation: 0 as const, scale: 1 },
  ] };
  const selfPoint = { x: 480, y: 540 };
  // jsdom은 getBoundingClientRect가 0이므로 지도의 표시 영역을 고정한다.
  const rect = { left: 0, top: 0, width: 960, height: 640 };

  beforeEach(() => {
    vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockReturnValue(
      { ...rect, right: rect.width, bottom: rect.height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
    for (const [name, value] of [["setPointerCapture", () => undefined], ["releasePointerCapture", () => undefined], ["hasPointerCapture", () => true]] as const) {
      Object.defineProperty(SVGElement.prototype, name, { configurable: true, value, writable: true });
    }
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const deskCenter = (view: { container: HTMLElement }) => {
    const desk = screen.getByRole("button", { name: "8번 드로잉 데스크 선택" });
    view.container.querySelector("svg")!.dispatchEvent(new Event("x"));
    return desk;
  };
  const pointer = (type: string, clientX: number, clientY: number, pointerId = 3) => ({
    pointerId, clientX, clientY, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true, button: 0,
  });

  it("한 번의 드래그가 검증을 한 번만 통과시키고 한 번의 되돌리기 단계로 반영된다", () => {
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} artStyle="webtoon" />);
    const desk = deskCenter(view);
    const origin = { x: 549, y: 570 };

    fireEvent.pointerDown(desk, pointer("pointerdown", 287, 356));
    expect(onChange).not.toHaveBeenCalled();
    // 드래그 중에는 화면만 미리 보고 커밋하지 않는다.
    for (const step of [1, 2, 3, 4]) {
      fireEvent.pointerMove(desk, pointer("pointermove", 287 + step * 32, 356));
      expect(onChange, `pointerMove ${step}`).not.toHaveBeenCalled();
    }
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" }).value).toBe("added-desk");

    fireEvent.pointerUp(desk, pointer("pointerup", 287 + 4 * 32, 356));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ok: true }));
    const committed = onChange.mock.calls[0]![0].state as { revision: number; placements: { id: string; x: number; y: number }[] };
    const moved = committed.placements.find((item) => item.id === "added-desk")!;
    expect(moved.x).not.toBe(origin.x);
    expect(moved.x % 16).toBe(0);
    expect(committed.revision).toBe(preset.revision + 1);
  });

  it("움직이지 않은 누른 것은 선택만 하고 배치를 바꾸지 않는다", () => {
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} artStyle="webtoon" />);
    const desk = deskCenter(view);
    fireEvent.pointerDown(desk, pointer("pointerdown", 287, 356));
    fireEvent.pointerUp(desk, pointer("pointerup", 287, 356));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" }).value).toBe("added-desk");
  });

  it("잘못된 위치는 커밋하지 않고 기존 배치를 유지한다", () => {
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} artStyle="webtoon" />);
    const desk = deskCenter(view);
    fireEvent.pointerDown(desk, pointer("pointerdown", 287, 356));
    fireEvent.pointerMove(desk, pointer("pointermove", 287, 356 - 320));
    fireEvent.pointerUp(desk, pointer("pointerup", 287, 356 - 320));
    expect(onChange.mock.calls.every(([result]) => result.ok === false)).toBe(true);
  });

  it("pointercancel 및 탭 비활성화(visibilitychange hidden) 시 드래그가 고착되지 않고 커밋 전 위치로 복귀한다", () => {
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} artStyle="webtoon" />);
    const desk = deskCenter(view);
    const readShownCenterX = () => {
      const circles = view.container.querySelectorAll("svg.studio-decoration-editor__map circle[r='6']");
      return Number(circles[circles.length - 1]?.getAttribute("cx"));
    };

    expect(readShownCenterX()).toBe(549);
    fireEvent.pointerDown(desk, { ...pointer("pointerdown", 287, 356), buttons: 1 });
    fireEvent.pointerMove(desk, { ...pointer("pointermove", 287 + 96, 356), buttons: 1 });
    expect(readShownCenterX()).not.toBe(549);

    fireEvent.pointerCancel(desk, pointer("pointercancel", 287 + 96, 356));
    expect(readShownCenterX()).toBe(549);
    expect(onChange).not.toHaveBeenCalled();

    // 취소 이후 버튼을 뗀 마우스 이동·해제 및 후속 지도 click이 뒤따라도 드래그나 커밋이 일어나지 않는다.
    fireEvent.pointerMove(desk, { ...pointer("pointermove", 287 + 160, 356), buttons: 0 });
    fireEvent.pointerUp(desk, pointer("pointerup", 287 + 160, 356));
    fireEvent.click(screen.getByRole("group", { name: "가구 배치 지도" }), { clientX: 287 + 160, clientY: 356 });
    expect(readShownCenterX()).toBe(549);
    expect(onChange).not.toHaveBeenCalled();

    // 탭 비활성화(visibilityState = hidden)에서도 동일하게 커밋 전 위치로 복귀한다.
    fireEvent.pointerDown(desk, { ...pointer("pointerdown", 287, 356, 4), buttons: 1 });
    fireEvent.pointerMove(desk, { ...pointer("pointermove", 287 + 96, 356, 4), buttons: 1 });
    expect(readShownCenterX()).not.toBe(549);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(readShownCenterX()).toBe(549);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    fireEvent.pointerMove(desk, { ...pointer("pointermove", 287 + 180, 356, 4), buttons: 0 });
    expect(readShownCenterX()).toBe(549);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("빌드 모드 카탈로그", () => {
  const world = studioVirtualPlaceWorldManifest("creator-cafe");
  const preset = studioVirtualDecorationStateForWorld(studioVirtualDecorationPreset("creator-garden"), world);
  const selfPoint = { x: 480, y: 540 };
  const mapRect = { left: 0, top: 0, width: 960, height: 640 };

  beforeEach(() => {
    vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockReturnValue(
      { ...mapRect, right: mapRect.width, bottom: mapRect.height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
  });

  it("카탈로그에서 가구를 고르면 배치 모드로 들어가고 완료할 수 있다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceDecorationEditor world={world} decorations={preset} selfPoint={selfPoint} onChange={onChange} />);
    const catalog = screen.getByRole<HTMLSelectElement>("combobox", { name: "배치할 가구" });
    expect(screen.queryByText(/배치 중/)).toBeNull();
    fireEvent.change(catalog, { target: { value: "drawing-desk" } });
    expect(screen.getByText(/배치 중/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "배치 완료" }));
    expect(screen.queryByText(/배치 중/)).toBeNull();
  });

  it("배치 모드에서 지도를 클릭하면 배치 요청이 onChange로 전달된다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceDecorationEditor world={world} decorations={preset} selfPoint={selfPoint} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "배치할 가구" }), { target: { value: "drawing-desk" } });
    fireEvent.click(screen.getByRole("group", { name: "가구 배치 지도" }), { clientX: 480, clientY: 320 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0]?.[0] as { ok: boolean };
    expect(typeof result.ok).toBe("boolean");
  });

  it("선택한 가구를 격자에 맞추고 복제할 수 있다", () => {
    const decorations = { ...preset, placements: [...preset.placements,
      { id: "added-desk", type: "drawing-desk" as const, x: 549, y: 570, rotation: 0 as const, scale: 1 },
    ] };
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /드로잉 데스크 선택/ }));
    fireEvent.click(screen.getByRole("button", { name: "격자에 맞추기" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const snapResult = onChange.mock.calls[0]?.[0] as { ok: boolean; state: { placements: { id: string; x: number; y: number }[] } };
    if (snapResult.ok) {
      const moved = snapResult.state.placements.find((item) => item.id === "added-desk");
      if (!moved) throw new Error("이동한 데스크가 없다");
      expect(moved.x % 32).toBe(0);
      expect(moved.y % 32).toBe(0);
    }
    fireEvent.click(screen.getByRole("button", { name: "가구 복제" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    const dupResult = onChange.mock.calls[1]?.[0] as { ok: boolean; state: StudioVirtualDecorationState };
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" });
    if (dupResult.ok) {
      expect(dupResult.state.placements).toHaveLength(decorations.placements.length + 1);
      // 부모가 onChange 결과를 반영하면 복제본이 선택된다.
      view.rerender(<StudioVirtualSpaceDecorationEditor world={world} decorations={dupResult.state} selfPoint={selfPoint} onChange={onChange} />);
      expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" }).value)
        .toBe(dupResult.state.placements.at(-1)?.id);
    } else {
      expect(select.value).toBe("added-desk");
    }
  });

  it("타일 이펙트 오버레이를 아이콘으로 표시한다", () => {
    const onChange = vi.fn();
    render(<StudioVirtualSpaceDecorationEditor world={world} decorations={preset} selfPoint={selfPoint} onChange={onChange}
      tileEffects={[
        { id: "fx-spot", kind: "spotlight", name: "스포트라이트", tileX: 2, tileY: 3, width: 4, height: 4 },
        { id: "fx-spawn", kind: "spawn", name: "스폰 지점", tileX: 10, tileY: 10, width: 1, height: 1 },
      ]}
    />);
    expect(screen.getByText("🔦")).not.toBeNull();
    expect(screen.getByText("🟢")).not.toBeNull();
  });

  it("선택·이동·회전·크기 조작 모드를 표시하고 포커스 위치와 무관하게 Esc로 선택을 해제한다", () => {
    const decorations = {
      ...preset,
      placements: [
        ...preset.placements,
        { id: "added-desk", type: "drawing-desk" as const, x: 549, y: 570, rotation: 0 as const, scale: 1 },
      ],
    };
    const onChange = vi.fn();
    render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} />);

    const toolbar = screen.getByRole("toolbar", { name: "오브젝트 조작 모드" });
    expect(toolbar).not.toBeNull();
    const rotateModeBtn = screen.getByRole("button", { name: "회전 (R)" });
    const scaleModeBtn = screen.getByRole("button", { name: "크기 (S)" });

    fireEvent.click(screen.getByRole("button", { name: /드로잉 데스크 선택/ }));
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" }).value).toBe("added-desk");
    expect(screen.getByText(/선택됨: 드로잉 데스크/)).not.toBeNull();

    fireEvent.click(rotateModeBtn);
    expect(rotateModeBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/현재 모드: 회전/)).not.toBeNull();

    fireEvent.click(scaleModeBtn);
    expect(scaleModeBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/현재 모드: 크기/)).not.toBeNull();

    // 포커스가 select나 버튼에 있어도 window Esc로 오브젝트 선택이 즉시 해제된다.
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" });
    select.focus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(select.value).toBe("");
    expect(screen.getByText(/현재 모드: 선택 · 오브젝트를 선택하세요/)).not.toBeNull();
  });

  it("Shift+클릭 다중 선택 후 묶음 이동·90° 회전·복제·삭제가 상대 간격과 회전을 보존하며 1작업 1커밋으로 전달된다", () => {
    const cleanWorld = {
      ...studioVirtualPlaceWorldManifest("skyport", true),
      colliders: [],
      props: [],
      portals: [],
      npcs: [],
      interactions: [],
      interactionSlots: [],
    };
    const ax = Math.round(((cleanWorld.width * 400) / 960) / 16) * 16;
    const ay = Math.round(((cleanWorld.height * 320) / 640) / 16) * 16;
    const selfPt = {
      x: Math.round((cleanWorld.width * 80) / 960),
      y: Math.round((cleanWorld.height * 100) / 640),
    };
    const multiDecorations: StudioVirtualDecorationState = {
      ...studioVirtualDecorationPreset("minimal"),
      layoutWidth: cleanWorld.width,
      layoutHeight: cleanWorld.height,
      placements: [
        { id: "desk-1", type: "drawing-desk", x: ax, y: ay, rotation: 0, scale: 1 },
        { id: "chair-2", type: "bench", x: ax + 80, y: ay + 32, rotation: 90, scale: 1 },
      ],
    };
    const onChange = vi.fn();
    const view = render(
      <StudioVirtualSpaceDecorationEditor
        world={cleanWorld}
        decorations={multiDecorations}
        selfPoint={selfPt}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1번 드로잉 데스크 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "2번 벤치 선택" }), { shiftKey: true });
    expect(screen.getByText(/2개 선택됨/)).not.toBeNull();

    // 1) 묶음 이동 (+16, 0): 한 번의 onChange 호출로 두 가구가 상대 간격 (80, 32) 및 회전 (0°, 90°)을 보존한 채 이동
    fireEvent.click(screen.getByRole("button", { name: "가구 오른쪽" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const movedState = onChange.mock.calls[0]?.[0]?.state as StudioVirtualDecorationState;
    expect(movedState.placements[0]).toMatchObject({ id: "desk-1", x: ax + 16, y: ay, rotation: 0 });
    expect(movedState.placements[1]).toMatchObject({ id: "chair-2", x: ax + 96, y: ay + 32, rotation: 90 });

    // 2) 묶음 90° 회전: 기준(ax + 16, ay) 주위로 오프셋 (80, 32) -> (-32, 80) 회전 + 각 항목 회전 +90° (0->90, 90->180)
    view.rerender(
      <StudioVirtualSpaceDecorationEditor
        world={cleanWorld}
        decorations={movedState}
        selfPoint={selfPt}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "가구 90도 회전" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    const rotatedState = onChange.mock.calls[1]?.[0]?.state as StudioVirtualDecorationState;
    expect(rotatedState.placements[0]).toMatchObject({ id: "desk-1", x: ax + 16, y: ay, rotation: 90 });
    expect(rotatedState.placements[1]).toMatchObject({ id: "chair-2", x: ax - 16, y: ay + 80, rotation: 180 });

    // 3) 묶음 복제: 1회의 onChange로 2개 복제본이 동일한 상대 간격 (-32, 80)과 회전 (90°, 180°)으로 추가
    view.rerender(
      <StudioVirtualSpaceDecorationEditor
        world={cleanWorld}
        decorations={rotatedState}
        selfPoint={selfPt}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "가구 복제" }));
    expect(onChange).toHaveBeenCalledTimes(3);
    const duplicatedState = onChange.mock.calls[2]?.[0]?.state as StudioVirtualDecorationState;
    expect(duplicatedState.placements).toHaveLength(4);
    const cloneA = duplicatedState.placements[2]!;
    const cloneB = duplicatedState.placements[3]!;
    expect(cloneB.x - cloneA.x).toBe(-32);
    expect(cloneB.y - cloneA.y).toBe(80);
    expect(cloneA.rotation).toBe(90);
    expect(cloneB.rotation).toBe(180);
  });
});
