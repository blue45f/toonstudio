import { describe, expect, it, vi } from "vitest";

import {
  createStudioCommandExecutionBindings,
  type StudioCommandExecutionMenuGroup,
} from "../studio-command-execution-registry";
import { createStudioDrawingClarityCommandBindings } from "./StudioDrawingClarityCommands";

function presentation() { return { showSavedLayout: vi.fn(), openInspector: vi.fn() }; }

describe("간단한 그리기 검색 명령의 목적지", () => {
  it.each([
    "window.left-panel", "window.right-panel", "window.collapse-side-panels",
    "window.command-bar", "window.page-sequence", "file.project-tools",
  ])("%s는 기존 배치를 먼저 보이고 원본 명령을 정확히 한 번 실행한다", (commandId) => {
    const order: string[] = [];
    const original = vi.fn(() => order.push("원본 명령"));
    const ui = { showSavedLayout: vi.fn(() => order.push("기존 배치")), openInspector: vi.fn() };
    const bindings = createStudioDrawingClarityCommandBindings([{ items: [{ commandId, label: "기존 명령", onSelect: original }] }], ui);
    bindings[0]?.execute();
    expect(order).toEqual(["기존 배치", "원본 명령"]);
    expect(original).toHaveBeenCalledOnce();
    expect(ui.showSavedLayout).toHaveBeenCalledOnce();
    expect(ui.openInspector).not.toHaveBeenCalled();
  });

  it("미니맵은 작업 패널을 먼저 보이고 기존 탐색 명령을 한 번 실행한다", () => {
    const order: string[] = [];
    const original = vi.fn(() => order.push("원본 탐색"));
    const ui = { showSavedLayout: vi.fn(), openInspector: vi.fn(() => order.push("작업 패널")) };
    const bindings = createStudioDrawingClarityCommandBindings([{ items: [{ commandId: "view.navigator", label: "미니맵", onSelect: original }] }], ui);
    bindings[0]?.execute();
    expect(order).toEqual(["작업 패널", "원본 탐색"]);
    expect(original).toHaveBeenCalledOnce();
    expect(ui.openInspector).toHaveBeenCalledOnce();
    expect(ui.showSavedLayout).not.toHaveBeenCalled();
  });

  it("이름·비활성 상태·불가 사유를 바꾸지 않는다", () => {
    const original = vi.fn();
    const groups = [{ items: [{ commandId: "window.right-panel", label: "작업 패널", onSelect: original, disabled: true, unavailableReason: "현재 사용할 수 없음" }] }];
    const base = createStudioCommandExecutionBindings(groups)[0];
    const binding = createStudioDrawingClarityCommandBindings(groups, presentation())[0];
    expect(binding).toMatchObject({ commandId: base?.commandId, label: base?.label, disabled: true, unavailableReason: base?.unavailableReason });
    expect(original).not.toHaveBeenCalled();
  });

  it("일반 도구 명령은 원본 실행 함수와 UI 상태를 그대로 유지한다", () => {
    const original = vi.fn(), ui = presentation();
    const bindings = createStudioDrawingClarityCommandBindings([{ items: [{ commandId: "tool.pen", label: "펜", onSelect: original }] }], ui);
    expect(bindings[0]?.execute).toBe(original);
    bindings[0]?.execute();
    expect(original).toHaveBeenCalledOnce();
    expect(ui.showSavedLayout).not.toHaveBeenCalled();
    expect(ui.openInspector).not.toHaveBeenCalled();
  });

  it("위험·미승인·검색 재진입 명령을 새로 실행 가능하게 만들지 않는다", () => {
    const original = vi.fn(), ui = presentation();
    const groups: readonly StudioCommandExecutionMenuGroup[] = [{ items: [
      { commandId: "file.delete", label: "삭제", onSelect: original, danger: true, searchActivation: "execute" },
      { commandId: "file.save", label: "저장", onSelect: original },
      { commandId: "help.command-search", label: "검색", onSelect: original, searchActivation: "execute" },
      { commandId: "tool.pen", label: "잠긴 펜", onSelect: original, disabled: true, unavailableReason: "편집 잠김" },
    ] }];
    const bindings = createStudioDrawingClarityCommandBindings(groups, ui);
    expect(bindings).toEqual(createStudioCommandExecutionBindings(groups));
    expect(bindings.map((binding) => binding.commandId)).toEqual(["tool.pen"]);
    expect(original).not.toHaveBeenCalled();
    expect(ui.showSavedLayout).not.toHaveBeenCalled();
  });
});
