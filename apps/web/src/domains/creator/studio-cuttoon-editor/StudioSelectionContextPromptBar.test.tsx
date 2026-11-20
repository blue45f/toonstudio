// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioSelectionContextPromptBar,
  type SelectionContextPromptItem,
} from "./StudioSelectionContextPromptBar";

afterEach(() => cleanup());

const ITEM_A: SelectionContextPromptItem = { id: "layer-a", label: "주인공 선화", kind: "layer" };
const ITEM_B: SelectionContextPromptItem = { id: "layer-b", label: "교실 배경", kind: "background" };
const ITEM_C: SelectionContextPromptItem = { id: "layer-c", label: "우산 소품", kind: "prop" };

describe("StudioSelectionContextPromptBar", () => {
  it("0개 선택 시 새로 생성(create) 모드로 동작하고 화풍 프리셋과 함께 제출한다", () => {
    const onSubmitCreate = vi.fn();
    render(
      <StudioSelectionContextPromptBar
        selectedItems={[]}
        onSubmitCreate={onSubmitCreate}
        onSubmitEdit={() => undefined}
        onSubmitComposite={() => undefined}
      />,
    );

    const section = screen.getByLabelText("선택 반응형 제작 바");
    expect(section.getAttribute("data-selection-prompt-mode")).toBe("create");
    expect(screen.getByText("0개 선택 · 새로 생성")).toBeTruthy();
    expect(screen.queryByRole("toolbar", { name: "심화 보정 도구" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "수채화" }));
    fireEvent.change(screen.getByLabelText("장면 지시 입력"), {
      target: { value: "비 오는 학교 복도 로우 앵글" },
    });
    fireEvent.click(screen.getByRole("button", { name: "새로 생성" }));

    expect(onSubmitCreate).toHaveBeenCalledWith({
      prompt: "비 오는 학교 복도 로우 앵글",
      stylePresetId: "watercolor",
    });
  });

  it("1개 선택 시 수정·화풍변경·심화보정(M/L/B·유동화·자동채색) 모드로 자동 전이한다", () => {
    const onSubmitEdit = vi.fn();
    const onSelectRefinementTool = vi.fn();
    render(
      <StudioSelectionContextPromptBar
        selectedItems={[ITEM_A]}
        activeRefinementTool="lasso"
        onSubmitCreate={() => undefined}
        onSubmitEdit={onSubmitEdit}
        onSubmitComposite={() => undefined}
        onSelectRefinementTool={onSelectRefinementTool}
      />,
    );

    const section = screen.getByLabelText("선택 반응형 제작 바");
    expect(section.getAttribute("data-selection-prompt-mode")).toBe("edit");
    expect(screen.getByRole("toolbar", { name: "심화 보정 도구" })).toBeTruthy();

    // 심화 보정 도구 버튼 및 단축키(M/L/B) 검증
    fireEvent.click(screen.getByRole("button", { name: "유동화" }));
    fireEvent.click(screen.getByRole("button", { name: "자동 채색" }));
    expect(onSelectRefinementTool).toHaveBeenNthCalledWith(1, "liquify", "layer-a");
    expect(onSelectRefinementTool).toHaveBeenNthCalledWith(2, "auto-color", "layer-a");

    fireEvent.keyDown(section, { key: "m" });
    expect(onSelectRefinementTool).toHaveBeenNthCalledWith(3, "marquee", "layer-a");

    // 입력창 안에서 타이핑할 때는 단축키가 가로채지 않는다.
    const input = screen.getByLabelText("장면 지시 입력");
    fireEvent.keyDown(input, { key: "b" });
    expect(onSelectRefinementTool).toHaveBeenCalledTimes(3);

    // 화풍 변경 탭으로 전환해 구도 유지 상태로 제출
    fireEvent.click(screen.getByRole("tab", { name: "화풍 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "흑백 만화" }));
    fireEvent.click(screen.getByRole("button", { name: "화풍 변경" }));

    expect(onSubmitEdit).toHaveBeenCalledWith({
      targetId: "layer-a",
      prompt: "",
      subMode: "restyle",
      stylePresetId: "monochrome-comic",
      preserveComposition: true,
    });
  });

  it("2개 이상 선택 시 번호순(#1,#2...) 참조 합성 모드로 전이하고 순서 변경·토큰 삽입을 지원한다", () => {
    const onSubmitComposite = vi.fn();
    const onReorderSelection = vi.fn();
    render(
      <StudioSelectionContextPromptBar
        selectedItems={[ITEM_A, ITEM_B, ITEM_C]}
        onSubmitCreate={() => undefined}
        onSubmitEdit={() => undefined}
        onSubmitComposite={onSubmitComposite}
        onReorderSelection={onReorderSelection}
      />,
    );

    const section = screen.getByLabelText("선택 반응형 제작 바");
    expect(section.getAttribute("data-selection-prompt-mode")).toBe("composite");
    expect(screen.getByText("3개 선택 · 번호순 참조 합성")).toBeTruthy();
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("#3")).toBeTruthy();

    // 참조 칩 클릭 시 #1, #2 토큰이 프롬프트에 자동 삽입된다.
    fireEvent.click(screen.getByRole("button", { name: "#1 주인공 선화 프롬프트에 넣기" }));
    fireEvent.click(screen.getByRole("button", { name: "#2 교실 배경 프롬프트에 넣기" }));
    const input = screen.getByLabelText("장면 지시 입력") as HTMLInputElement;
    expect(input.value).toBe("#1 #2 ");

    // 순서 변경
    fireEvent.click(screen.getByRole("button", { name: "#2 앞으로 옮기기" }));
    expect(onReorderSelection).toHaveBeenCalledWith(["layer-b", "layer-a", "layer-c"]);

    // 합성 제출
    fireEvent.change(input, { target: { value: "#1 인물을 #2 배경에 배치" } });
    fireEvent.click(screen.getByRole("button", { name: "참조 합성" }));
    expect(onSubmitComposite).toHaveBeenCalledWith({
      orderedTargetIds: ["layer-a", "layer-b", "layer-c"],
      prompt: "#1 인물을 #2 배경에 배치",
    });
  });
});
