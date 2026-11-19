import { describe, expect, it, vi } from "vitest";

import {
  createStudioCommandExecutionBindings,
  type StudioCommandExecutionMenuGroup,
} from "../studio-command-execution-registry";
import { createStudioDrawingClarityCommandBindings } from "./StudioDrawingClarityCommands";

function presentation() { return { showSavedLayout: vi.fn(), openInspector: vi.fn(), openPages: vi.fn(), closePanels: vi.fn() }; }

describe("간단한 그리기 검색 명령의 목적지", () => {
  it.each([
    ["window.left-panel", "openPages"], ["window.page-sequence", "openPages"],
    ["window.right-panel", "openInspector"], ["view.navigator", "openInspector"],
    ["canvas.document-settings", "openInspector"],
    ["filter.levels", "openInspector"], ["filter.tone-curve", "openInspector"],
    ["window.collapse-side-panels", "closePanels"], ["window.command-bar", "showSavedLayout"],
    ["file.project-tools", "showSavedLayout"],
  ] as const)("%s는 같은 편집기의 %s를 열고 원래 명령을 한 번 실행한다", (commandId, destination) => {
    const ui = presentation(), original = vi.fn();
    const bindings = createStudioDrawingClarityCommandBindings([{ items: [{ commandId, label: "원고 도구", onSelect: original, searchActivation: "execute" }] }], ui);
    bindings[0]?.execute();
    expect(original).toHaveBeenCalledOnce();
    expect(ui[destination]).toHaveBeenCalledOnce();
    expect(ui[destination].mock.invocationCallOrder[0]).toBeLessThan(original.mock.invocationCallOrder[0] ?? 0);
  });

  it("검색에서 실행을 허용하지 않은 문서 설정은 메뉴 전용으로 남는다", () => {
    const bindings = createStudioDrawingClarityCommandBindings([
      { items: [{ commandId: "canvas.document-settings", label: "문서 설정", onSelect: vi.fn() }] },
    ], presentation());
    expect(bindings).toHaveLength(0);
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
