// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { blendExpressionPresets, relaxAntagonists } from "../../../animation/expression-blend";
import { findExpressionPreset } from "../../../animation/presets";
import { ALL_AVAILABLE_CAPABILITIES, FACS_LABELS_KO, FACS_UNITS, createDefaultRecipe } from "../../../contracts";
import { MockLabProvider, createMockLabStore } from "../../../testing/mock-store";

import { ExpressionPanel, expressionsEqual } from "./ExpressionPanel";

import type { CharacterRecipe, LabCommand, SlotCapabilityMap } from "../../../contracts";

afterEach(cleanup);

function setup(options: { recipe?: CharacterRecipe; capabilities?: SlotCapabilityMap } = {}): LabCommand[] {
  const dispatched: LabCommand[] = [];
  render(
    <MockLabProvider initialState={{ capabilities: options.capabilities ?? ALL_AVAILABLE_CAPABILITIES, ...(options.recipe ? { recipe: options.recipe } : {}) }} dispatchSpy={(command) => dispatched.push(command)}>
      <ExpressionPanel />
    </MockLabProvider>,
  );
  return dispatched;
}

function card(name: string): HTMLButtonElement {
  return within(screen.getByRole("group", { name: "표정 프리셋" })).getByRole("button", { name: new RegExp(`^${name}`, "u") });
}

describe("ExpressionPanel", () => {
  it("프리셋 12 카드와 FACS 16 슬라이더를 보여주고, 카드 클릭은 slot/apply 1회", () => {
    const dispatched = setup();
    expect(within(screen.getByRole("group", { name: "표정 프리셋" })).getAllByRole("button")).toHaveLength(12);
    expect(within(screen.getByRole("group", { name: "FACS 슬라이더" })).getAllByRole("slider")).toHaveLength(16);
    for (const unit of FACS_UNITS) expect(screen.getByLabelText(FACS_LABELS_KO[unit])).toHaveProperty("value", "0");
    expect(card("무표정").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card("미소"));
    expect(dispatched).toEqual([{ type: "slot/apply", slot: "expression", presetId: "expression/smile" }]);
    expect(screen.getByText(/활성 유닛 0개 · morph 0개 · 프리셋 무표정/u)).toBeTruthy();
  });

  it("슬라이더 변경은 해당 유닛만 expression/set(merge: true, coalesceKey: unit)로 보내고 값은 레시피를 반영한다", () => {
    const recipe = createDefaultRecipe();
    recipe.expression = { mouthSmile: 0.6, eyeSquint: 0.15 };
    recipe.slots.expression = "expression/smile";
    const dispatched = setup({ recipe });
    expect(screen.getByLabelText("입꼬리 올림")).toHaveProperty("value", "0.6");
    expect(screen.getByText(/활성 유닛 2개 · morph 2개 · 프리셋 미소/u)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("턱 열기"), { target: { value: "0.4" } });
    expect(dispatched).toEqual([{ type: "expression/set", weights: { jawOpen: 0.4 }, merge: true, coalesceKey: "jawOpen" }]);
    fireEvent.change(screen.getByLabelText("입꼬리 올림"), { target: { value: "0" } });
    expect(dispatched[1]).toEqual({ type: "expression/set", weights: { mouthSmile: 0 }, merge: true, coalesceKey: "mouthSmile" });
  });

  it("프리셋 세기는 프리셋 가중치를 영향도로 줄이되 슬라이더로 만진 유닛은 유지한다(슬라이더 우선)", () => {
    const recipe = createDefaultRecipe();
    recipe.slots.expression = "expression/joy";
    recipe.expression = { ...findExpressionPreset("joy").weights };
    const dispatched = setup({ recipe });
    const joy = findExpressionPreset("joy").weights;
    fireEvent.change(screen.getByLabelText("프리셋 세기"), { target: { value: "0.5" } });
    expect(dispatched[0]).toEqual({ type: "expression/set", weights: blendExpressionPresets([{ weights: joy, influence: 0.5 }]), merge: false });
    expect(screen.getByText("50%")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("턱 열기"), { target: { value: "0.9" } });
    fireEvent.change(screen.getByLabelText("프리셋 세기"), { target: { value: "0.25" } });
    const last = dispatched[2];
    if (last?.type !== "expression/set") throw new Error("expression/set 기대");
    expect(last.merge).toBe(false);
    expect(last.weights.jawOpen).toBe(0.9);
    expect(last.weights.mouthSmile).toBeCloseTo((joy.mouthSmile ?? 0) * 0.25, 9);
    expect("coalesceKey" in last).toBe(false);
    // 빠른 강도 프리셋 버튼 클릭으로 세기를 즉시 변경할 수 있다
    fireEvent.click(screen.getByRole("button", { name: "자연스럽게 70%" }));
    expect(screen.getByLabelText("프리셋 세기")).toHaveProperty("value", "0.7");
    // 프리셋을 바꾸면 세기와 덮어쓰기 목록이 초기화된다
    fireEvent.click(card("놀람"));
    expect(screen.getByLabelText("프리셋 세기")).toHaveProperty("value", "1");
  });

  it("초기화는 빈 표정으로 교체하고, 모순 유닛 완화는 길항 쌍이 있을 때만 활성이며 로컬 오버라이드를 비운다", () => {
    const dispatched = setup();
    const relaxButton = screen.getByRole("button", { name: "모순 유닛 완화" }) as HTMLButtonElement;
    expect(relaxButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "표정 초기화" }));
    expect(dispatched).toEqual([{ type: "expression/set", weights: {}, merge: false }]);
    cleanup();

    const recipe = createDefaultRecipe();
    recipe.slots.expression = "expression/smile";
    recipe.expression = { mouthSmile: 1, mouthFrown: 0.5 };
    const dispatched2 = setup({ recipe });
    // 슬라이더로 jawOpen 오버라이드를 만든 뒤 모순 유닛 완화를 누르면 오버라이드도 초기화된다
    fireEvent.change(screen.getByLabelText("턱 열기"), { target: { value: "0.75" } });
    const enabled = screen.getByRole("button", { name: "모순 유닛 완화" }) as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    fireEvent.click(enabled);
    expect(dispatched2[1]).toEqual({ type: "expression/set", weights: relaxAntagonists(recipe.expression), merge: false });
    expect(dispatched2[1]).toMatchObject({ weights: { mouthSmile: 0.5 } });
    // 이후 프리셋 세기를 조절할 때 이전 jawOpen 오버라이드가 섞이지 않는다
    fireEvent.change(screen.getByLabelText("프리셋 세기"), { target: { value: "0.5" } });
    const afterRelax = dispatched2[2];
    if (afterRelax?.type !== "expression/set") throw new Error("expression/set 기대");
    expect(afterRelax.weights.jawOpen).toBeUndefined();
  });

  it("외부(Undo/Redo 등)에서 recipe.expression이 바뀌면 로컬 슬라이더 오버라이드를 동기화·초기화한다", () => {
    const dispatched: LabCommand[] = [];
    const store = createMockLabStore(undefined, (cmd) => dispatched.push(cmd));
    const recipe = createDefaultRecipe();
    recipe.slots.expression = "expression/joy";
    recipe.expression = { ...findExpressionPreset("joy").weights };
    store.setState({ ...store.getState(), recipe });

    render(
      <MockLabProvider store={store}>
        <ExpressionPanel />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("턱 열기"), { target: { value: "0.8" } });
    // 외부(예: Undo)로 표정이 원래 joy로 돌아옴
    const restoredRecipe = createDefaultRecipe();
    restoredRecipe.slots.expression = "expression/joy";
    restoredRecipe.expression = { ...findExpressionPreset("joy").weights };
    act(() => {
      store.setState({ ...store.getState(), recipe: restoredRecipe });
    });
    expect(screen.getByLabelText("턱 열기")).toHaveProperty("value", String(restoredRecipe.expression.jawOpen ?? 0));
    fireEvent.change(screen.getByLabelText("프리셋 세기"), { target: { value: "0.5" } });
    const last = dispatched.at(-1);
    if (last?.type !== "expression/set") throw new Error("expression/set 기대");
    expect(last.weights.jawOpen).toBeCloseTo((restoredRecipe.expression.jawOpen ?? 0) * 0.5, 6);
  });

  it("미지원 슬롯은 카드·슬라이더·버튼이 disabled이고 사유를 보여준다", () => {
    const reason = "제작 패키지에 FACS shape key가 없습니다.";
    const dispatched = setup({ capabilities: { ...ALL_AVAILABLE_CAPABILITIES, expression: { status: "unavailable", reasonKo: reason } } });
    expect(card("미소").disabled).toBe(true);
    expect(card("미소").title).toBe(reason);
    expect(screen.getByText(new RegExp(reason, "u"))).toBeTruthy();
    expect((screen.getByLabelText("턱 열기") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "표정 초기화" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(card("미소"));
    expect(dispatched).toEqual([]);
  });

  it("expressionsEqual은 클램프 후 비교한다(0·범위 밖·누락 동일시)", () => {
    expect(expressionsEqual({ jawOpen: 0 }, {})).toBe(true);
    expect(expressionsEqual({ jawOpen: 1.5 }, { jawOpen: 1 })).toBe(true);
    expect(expressionsEqual({ jawOpen: 0.5 }, { jawOpen: 0.4 })).toBe(false);
  });

  it("안구 엔진이 없으면 시선 제어를 비활성화하고 하이라이트 미지원 경계를 설명한다", () => {
    setup();
    expect(screen.getByTestId("shaper-expression-headpart-section")).toBeTruthy();
    expect(screen.getByLabelText("카메라 응시").closest("fieldset")?.disabled).toBe(true);
    expect(screen.getByText(/안구 본을 확인할 렌더 엔진/u)).toBeTruthy();
    for (const name of ["안구 고정 (fix)", "카메라 추적 (cam)", "조명 반사 (light)", "월드 고정 (world)"]) {
      expect(screen.getByRole("radio", { name }).closest("fieldset")?.disabled).toBe(true);
    }
    expect(screen.getByText(/독립 하이라이트 방향 제어는 현재 렌더러가 지원하지 않습니다/u)).toBeTruthy();
  });

  it("실제 store에서 FACS 슬라이더 조작 후 Undo하면 로컬 overrides도 정리되어 프리셋 세기 변경 시 취소된 값이 되살아나지 않는다", async () => {
    const { PERFORMANCE_PRESETS } = await import("../../../animation/presets");
    const { createPresetCatalog } = await import("../../../contracts");
    const { APPEARANCE_PRESETS } = await import("../../../presets");
    const { createLabStore } = await import("../../../state/lab-store");
    let tick = 1_000;
    const store = createLabStore({
      catalog: createPresetCatalog([...APPEARANCE_PRESETS, ...PERFORMANCE_PRESETS]),
      now: () => {
        tick += 1;
        return tick;
      },
      initial: { capabilities: ALL_AVAILABLE_CAPABILITIES },
    });
    render(
      <MockLabProvider store={store}>
        <ExpressionPanel />
      </MockLabProvider>,
    );
    fireEvent.click(card("미소"));
    fireEvent.change(screen.getByLabelText("턱 열기"), { target: { value: "0.8" } });
    expect(store.getState().recipe.expression.jawOpen).toBe(0.8);

    // 턱 열기 조작을 Undo로 취소
    act(() => {
      store.dispatch({ type: "history/undo" });
    });
    expect(store.getState().recipe.expression.jawOpen).toBeUndefined();

    // 이후 프리셋 세기를 조절해도 취소된 jawOpen(0.8)이 부활하지 않아야 한다
    fireEvent.change(screen.getByLabelText("프리셋 세기"), { target: { value: "0.5" } });
    expect(store.getState().recipe.expression.jawOpen).toBeUndefined();
  });
});
