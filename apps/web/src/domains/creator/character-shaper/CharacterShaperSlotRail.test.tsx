// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHARACTER_SLOT_METAS } from "./character-shaper-catalog";
import { EMPTY_CHARACTER_CAPABILITY_PROFILE } from "./character-shaper-capability";
import { createEmptyCharacterRecipe } from "./character-shaper-recipe";
import { CharacterShaperSlotRail } from "./CharacterShaperSlotRail";
import type { CharacterHostSnapshot, CharacterSlotKind } from "./character-shaper-contract";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";

afterEach(cleanup);
function binding(): CharacterShaperBinding {
  return {
    catalog: { version: 1, slots: CHARACTER_SLOT_METAS, entries: [] },
    profile: EMPTY_CHARACTER_CAPABILITY_PROFILE,
    snapshot: {} as CharacterHostSnapshot,
    recipe: createEmptyCharacterRecipe(), baselineRecipe: createEmptyCharacterRecipe(),
    history: { canUndo: false, canRedo: false, recentLabels: [], length: 0 },
    busyReason: null, handSide: "both", compareActive: false,
    evaluate: vi.fn<CharacterShaperBinding["evaluate"]>(() => ({ status: "available", reason: null, missing: [] })),
    plan: vi.fn(), commitPreset: vi.fn(), commit: vi.fn(), clear: vi.fn(() => null), remove: vi.fn(() => null),
    setHandSide: vi.fn(), undo: vi.fn(), redo: vi.fn(), setCompareActive: vi.fn(), resetToBaseline: vi.fn(),
    commitFaceParams: vi.fn(), commitSemanticMorphs: vi.fn(), commitHairParams: vi.fn(), commitColor: vi.fn(),
  };
}
function Host({ value }: { readonly value: CharacterShaperBinding }) {
  const [active, select] = useState<CharacterSlotKind>("face-shape");
  return <CharacterShaperSlotRail binding={value} activeSlot={active} onSelectSlot={select} orientation="horizontal" />;
}
describe("캐릭터 편집 분류", () => {
  it("세 분류에서 15슬롯을 각각 7·5·3개로 나누며 분류 전환은 문서를 수정하지 않는다", () => {
    const value = binding(); render(<Host value={value} />);
    expect(screen.getAllByRole("button")).toHaveLength(7);
    fireEvent.change(screen.getByRole("combobox", { name: "캐릭터 편집 분류" }), { target: { value: "figure" } });
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(document.activeElement?.getAttribute("data-character-slot")).toBe("body");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "performance" } });
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(document.activeElement?.getAttribute("data-character-slot")).toBe("expression");
    expect(value.commit).not.toHaveBeenCalled();
    expect(value.clear).not.toHaveBeenCalled();
    expect(value.commitPreset).not.toHaveBeenCalled();
  });
  it("기존 전체 슬롯 방향키·숫자 단축키는 다른 분류로 이동한 뒤 새 슬롯에 포커스를 보낸다", () => {
    render(<Host value={binding()} />);
    const face = screen.getAllByRole("button")[0];
    fireEvent.keyDown(face, { key: "8" });
    expect(document.activeElement?.getAttribute("data-character-slot")).toBe("body");
    expect(screen.getByRole("combobox").getAttribute("value")).not.toBe("identity");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement?.getAttribute("data-character-slot")).toBe("hair");
    expect(screen.getAllByRole("button")).toHaveLength(7);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement?.getAttribute("data-character-slot")).toBe("hand-pose");
    expect(screen.getAllByRole("button").filter(button => button.tabIndex === 0)).toHaveLength(1);
  });
});
