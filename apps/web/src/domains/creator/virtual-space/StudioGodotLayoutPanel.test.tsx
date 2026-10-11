// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GodotSpaceDefinition } from "./studio-godot-space";
import {
  StudioGodotLayoutPanel,
  type StudioGodotLayoutPanelProps,
} from "./StudioGodotLayoutPanel";

const DEFINITION: GodotSpaceDefinition = {
  v: 1,
  id: "street",
  name: "거리",
  size: [2400, 1200],
  zones: [
    { id: "plaza", kind: "meeting", name: "광장", rect: [780, 310, 840, 460] },
  ],
  props: [{ kind: "bench", rect: [900, 800, 120, 48] }],
};

function renderPanel(overrides: Partial<StudioGodotLayoutPanelProps> = {}) {
  const props: StudioGodotLayoutPanelProps = {
    definition: DEFINITION,
    revision: 2,
    dirty: false,
    editMode: false,
    selection: null,
    loadState: "ready",
    saveState: "idle",
    onRetryLoad: vi.fn(),
    onToggleEdit: vi.fn(),
    onCommand: vi.fn(),
    onSave: vi.fn(),
    onReload: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<StudioGodotLayoutPanel {...props} />) };
}

describe("StudioGodotLayoutPanel", () => {
  afterEach(() => cleanup());

  it("shows a loading state while the definition resolves", () => {
    renderPanel({ loadState: "loading", definition: null });
    expect(screen.getByText("공간 정의를 불러오는 중이에요…")).toBeTruthy();
  });

  it("shows an error state with a retry action", () => {
    const { props } = renderPanel({ loadState: "error", definition: null });
    expect(screen.getByText("공간 정의를 불러오지 못했어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(props.onRetryLoad).toHaveBeenCalledTimes(1);
  });

  it("keeps the save button disabled until there are unsaved changes", () => {
    renderPanel();
    const save = screen.getByRole("button", { name: "배치 저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    cleanup();
    const { props } = renderPanel({ dirty: true });
    const save2 = screen.getByRole("button", { name: "배치 저장" }) as HTMLButtonElement;
    expect(save2.disabled).toBe(false);
    fireEvent.click(save2);
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("toggles edit mode and adds an item via command", () => {
    const first = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "편집 모드 켜기" }));
    expect(first.props.onToggleEdit).toHaveBeenCalledWith(true);
    cleanup();
    const second = renderPanel({ editMode: true });
    fireEvent.click(screen.getByRole("button", { name: "항목 추가" }));
    expect(second.props.onCommand).toHaveBeenCalledWith({
      op: "add",
      category: "prop",
      kind: "bench",
    });
  });

  it("applies selection edits as an update command with parsed numbers", () => {
    const { props } = renderPanel({
      editMode: true,
      selection: {
        category: "zone",
        index: 0,
        kind: "meeting",
        name: "광장",
        rect: [780, 310, 840, 460],
      },
    });
    expect(screen.getByTestId("layout-selection").textContent).toContain("광장");
    const width = screen.getByLabelText("너비") as HTMLInputElement;
    fireEvent.change(width, { target: { value: "900" } });
    fireEvent.submit(width.closest("form") as HTMLFormElement);
    expect(props.onCommand).toHaveBeenCalledWith({
      op: "update",
      category: "zone",
      index: 0,
      fields: {
        name: "광장",
        kind: "meeting",
        rect: [780, 310, 900, 460],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(props.onCommand).toHaveBeenCalledWith({
      op: "delete",
      category: "zone",
      index: 0,
    });
  });

  it("shows the conflict path with a reload action", () => {
    const { props } = renderPanel({ saveState: "conflict", dirty: true });
    expect(screen.getByText(/다른 편집자가 먼저 저장했어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "최신본 다시 불러오기" }));
    expect(props.onReload).toHaveBeenCalledTimes(1);
  });
});
