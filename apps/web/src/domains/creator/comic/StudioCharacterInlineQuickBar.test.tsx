// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioCharacterInlineQuickBar,
  type CharacterInlineQuickState,
} from "./StudioCharacterInlineQuickBar";

afterEach(() => {
  cleanup();
});

const INITIAL_STATE: CharacterInlineQuickState = {
  characterId: "char-hana",
  characterName: "한하나",
  expressionId: "neutral",
  poseId: "standing",
  outfitId: "casual-daily",
  flipX: false,
};

describe("StudioCharacterInlineQuickBar", () => {
  it("표정 12종 · 포즈 10종 · 의상 교체 팝오버와 좌우 반전을 1클릭으로 전환한다", () => {
    const onChangeExpression = vi.fn();
    const onChangePose = vi.fn();
    const onChangeOutfit = vi.fn();
    const onToggleFlipX = vi.fn();
    const onReset = vi.fn();

    render(
      <StudioCharacterInlineQuickBar
        state={INITIAL_STATE}
        onChangeExpression={onChangeExpression}
        onChangePose={onChangePose}
        onChangeOutfit={onChangeOutfit}
        onToggleFlipX={onToggleFlipX}
        onReset={onReset}
      />,
    );

    // 표정 12종 팝오버
    fireEvent.click(screen.getByRole("button", { name: /표정 · 기본/u }));
    const exprDialog = screen.getByRole("dialog", { name: "표정 12종 선택" });
    expect(exprDialog.querySelectorAll("button[aria-pressed]")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: /깜짝 놀람/u }));
    expect(onChangeExpression).toHaveBeenCalledWith("surprised");
    expect(screen.queryByRole("dialog", { name: "표정 12종 선택" })).toBeNull();

    // 포즈 10종 팝오버
    fireEvent.click(screen.getByRole("button", { name: /포즈 · 기본 서기/u }));
    const poseDialog = screen.getByRole("dialog", { name: "포즈 10종 선택" });
    expect(poseDialog.querySelectorAll("button[aria-pressed]")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: /턱 괴고 고민/u }));
    expect(onChangePose).toHaveBeenCalledWith("thinking");

    // 의상 교체 팝오버
    fireEvent.click(screen.getByRole("button", { name: /의상 · 일상 캐주얼/u }));
    fireEvent.click(screen.getByRole("button", { name: /교복 하복/u }));
    expect(onChangeOutfit).toHaveBeenCalledWith("school-summer");

    // 좌우 반전 & 초기화
    fireEvent.click(screen.getByRole("button", { name: "좌우 반전" }));
    expect(onToggleFlipX).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "캐릭터 상태 초기화" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("Escape 키를 누르면 열려 있는 팝오버를 즉시 닫는다", () => {
    render(
      <StudioCharacterInlineQuickBar
        state={INITIAL_STATE}
        onChangeExpression={vi.fn()}
        onChangePose={vi.fn()}
        onChangeOutfit={vi.fn()}
        onToggleFlipX={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /표정 · 기본/u }));
    expect(screen.getByRole("dialog", { name: "표정 12종 선택" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "표정 12종 선택" })).toBeNull();
  });
});
