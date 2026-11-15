// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductionCommandPalette } from "../production-hub/ProductionCommandPalette";
import { createProductionDemoProject } from "../production-hub/production-demo";
import {
  installStudioCommandExecutionBindings,
  resetStudioCommandExecutionBindingsForTests,
} from "../studio-command-execution-registry";
import { StudioCommandSearchDialog } from "../StudioCommandSearchDialog";
import {
  StudioProjectCenterSearch,
  StudioProjectCenterSection,
} from "../StudioProjectCenterSearch";
import { normalizeStudioQuickAccessState } from "../studio-quick-access";
import { StudioQuickAccessPalette } from "../StudioQuickAccessPalette";

afterEach(() => {
  cleanup();
  resetStudioCommandExecutionBindingsForTests();
  window.localStorage.clear();
});

describe("팔레트 한글 IME 조합·Enter·Esc 및 단일 실행 통합 계약 (백로그 14)", () => {
  it("StudioCommandSearchDialog: 한글 조합 완료(isComposing·229·동일 틱 compositionend)는 실행·종료하지 않고 실제 선택 후 1회만 실행된다", () => {
    const executeCopyEffect = vi.fn();
    const onClose = vi.fn();
    installStudioCommandExecutionBindings([
      {
        commandId: "filter.photocopy",
        label: "복사기 효과",
        execute: executeCopyEffect,
        disabled: false,
      },
    ]);

    render(<StudioCommandSearchDialog open onClose={onClose} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "복사기 효과" } });
    input.focus();

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 229 });
    fireEvent.keyDown(input, { key: "Escape", isComposing: false, keyCode: 229 });
    fireEvent.compositionStart(input, { data: "복사기 효" });
    fireEvent.compositionEnd(input, { data: "복사기 효과" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 13 });

    expect(executeCopyEffect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 13 });
    fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 13 });
    const option = screen.getByRole("option", { name: /복사기 효과/u });
    fireEvent.click(option);

    expect(executeCopyEffect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("ProductionCommandPalette: 한글 조합 중 Enter·Esc로 닫히지 않으며 확정 후 선택 시 한 번만 이동한다", () => {
    const aggregate = createProductionDemoProject();
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/overview"]}>
        <ProductionCommandPalette aggregate={aggregate} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /빠른 이동/u }));
    const dialog = screen.getByRole("dialog", { name: "제작 관리 빠른 이동" });
    const input = within(dialog).getByRole("textbox");
    fireEvent.change(input, { target: { value: "검수" } });

    fireEvent.compositionStart(input, { data: "검" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true, keyCode: 229 });
    fireEvent.compositionEnd(input, { data: "검수" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 13 });

    expect(screen.queryByRole("dialog", { name: "제작 관리 빠른 이동" })).not.toBeNull();

    fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 13 });
    expect(screen.queryByRole("dialog", { name: "제작 관리 빠른 이동" })).toBeNull();
  });

  it("StudioQuickAccessPalette & StudioProjectCenterSearch: 한글 조합 취소 Esc가 편집 모드나 검색어를 지우지 않고 Enter 중복 실행을 막는다", () => {
    const onQuickExecute = vi.fn();
    render(
      <div>
        <StudioQuickAccessPalette
          state={normalizeStudioQuickAccessState(undefined)}
          catalog={[
            { id: "edit.undo", label: "실행 취소", category: "편집", available: true },
          ]}
          onStateChange={vi.fn()}
          onExecute={onQuickExecute}
        />
        <div data-studio-project-actions-menu="true">
          <StudioProjectCenterSearch />
          <StudioProjectCenterSection title="작업 관리" description="저장 동작" />
          <button type="button" onClick={onQuickExecute}>즉시 저장</button>
        </div>
      </div>,
    );

    const customizeBtn = screen.getByRole("button", { name: "빠른 액세스 편집" });
    fireEvent.click(customizeBtn);
    const qaSearch = screen.getByRole("searchbox", { name: "추가할 빠른 액세스 명령 검색" });
    fireEvent.change(qaSearch, { target: { value: "실행" } });
    fireEvent.compositionStart(qaSearch, { data: "실" });
    fireEvent.keyDown(qaSearch, { key: "Escape", isComposing: false, keyCode: 229 });
    fireEvent.compositionEnd(qaSearch, { data: "실행" });
    expect(screen.queryByRole("searchbox", { name: "추가할 빠른 액세스 명령 검색" })).not.toBeNull();

    const pcSearch = screen.getByRole("searchbox", { name: "프로젝트 센터 도구 검색" }) as HTMLInputElement;
    fireEvent.change(pcSearch, { target: { value: "즉시 저장" } });
    fireEvent.compositionStart(pcSearch, { data: "즉시" });
    fireEvent.keyDown(pcSearch, { key: "Escape", isComposing: false, keyCode: 229 });
    fireEvent.compositionEnd(pcSearch, { data: "즉시 저장" });
    expect(pcSearch.value).toBe("즉시 저장");

    fireEvent.keyDown(pcSearch, { key: "Enter", isComposing: false, keyCode: 13 });
    fireEvent.keyDown(pcSearch, { key: "Enter", isComposing: false, keyCode: 13 });
    expect(onQuickExecute).toHaveBeenCalledTimes(1);
  });
});
