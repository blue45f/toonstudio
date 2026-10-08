// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, SLOT_GROUPS, createDefaultRecipe, createInitialLabState, createPresetCatalog } from "../../../contracts";
import { APPEARANCE_PRESETS } from "../../../presets";
import { planApply } from "../../../state/apply-plan";
import { createLabStore } from "../../../state/lab-store";
import { MockLabProvider, createMockLabStore } from "../../../testing/mock-store";
import { vocabularyCatalogEntries } from "../../../testing/recipe-fixtures";

import { SlotPanel } from "./SlotPanel";

import type { LabState, PresetCatalog, SlotCapability, SlotCapabilityMap } from "../../../contracts";
import type { ApplyLoop, ApplyLoopSnapshot } from "../apply-loop";

afterEach(cleanup);

function catalog(): PresetCatalog {
  const performance = vocabularyCatalogEntries().filter((e) => SLOT_GROUPS.performance.includes(e.slot));
  return createPresetCatalog([...APPEARANCE_PRESETS, ...performance]);
}

function capabilities(overrides: Partial<SlotCapabilityMap> = {}): SlotCapabilityMap {
  return { ...ALL_AVAILABLE_CAPABILITIES, ...overrides };
}

function card(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name: new RegExp(`^${name}`, "u") });
}

describe("SlotPanel", () => {
  it("기본 슬롯(얼굴형) 카드 6개를 보여주고 카드 클릭은 slot/apply 1회를 dispatch한다", () => {
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities() }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    const grid = screen.getByRole("group", { name: "얼굴형 프리셋" });
    expect(within(grid).getAllByRole("button")).toHaveLength(6);
    expect(card("계란형").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card("둥근형"));
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({ type: "slot/apply", slot: "face-shape", presetId: "face-shape/round" });
  });

  it("탭을 바꾸면 해당 슬롯 카드가 나오고 액세서리에는 '없음' 카드가 있다", () => {
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities() }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^헤어/u }));
    expect(screen.getByRole("tab", { name: /^헤어/u }).getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("group", { name: "헤어 프리셋" })).getAllByRole("button")).toHaveLength(7);
    fireEvent.click(screen.getByRole("tab", { name: /^액세서리/u }));
    const grid = screen.getByRole("group", { name: "액세서리 프리셋" });
    expect(within(grid).getAllByRole("button")).toHaveLength(7);
    const none = within(grid).getByRole("button", { name: "없음" });
    expect(none.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(none);
    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "slot/apply", slot: "accessory", presetId: null });
    expect(screen.getByRole("tablist", { name: "슬롯" }).querySelectorAll('[role="tab"]')).toHaveLength(15);
  });

  it("unavailable 슬롯의 카드는 disabled이고 사유를 보여주며 클릭해도 dispatch하지 않는다", () => {
    const dispatchSpy = vi.fn();
    const reason = "제작 패키지는 교체형 헤어를 제공하지 않습니다.";
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities({ hair: { status: "unavailable", reasonKo: reason } }) }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^헤어/u }));
    const bob = card("소프트 보브");
    expect(bob.disabled).toBe(true);
    expect(bob.title).toContain(reason);
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    expect(screen.getAllByText("미지원").length).toBeGreaterThan(0);
    fireEvent.click(bob);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("partial 슬롯은 경고 배지와 사유를 보여주지만 클릭할 수 있다", () => {
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities({ "face-shape": { status: "partial", reasonKo: "음수 방향 shape key 없음" } }) }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    expect(screen.getAllByText("부분 지원").length).toBeGreaterThan(0);
    expect(screen.getAllByText("음수 방향 shape key 없음").length).toBeGreaterThan(0);
    fireEvent.click(card("하트형"));
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it("현재 레시피와 충돌하는 후보 카드에 '겹침 주의' 배지를 단다", () => {
    const base = createDefaultRecipe();
    const recipe = { ...base, slots: { ...base.slots, hair: "hair/twin-tail" as const } };
    render(
      <MockLabProvider catalog={catalog()} initialState={{ capabilities: capabilities(), recipe }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^액세서리/u }));
    expect(within(card("캡 모자")).getByText("겹침 주의")).toBeTruthy();
    expect(card("캡 모자").title).toContain("트윈테일");
    expect(within(card("안경")).queryByText("겹침 주의")).toBeNull();
  });

  it("썸네일 pending/failed 배지를 보여준다", () => {
    const thumbnails: LabState["thumbnails"] = {
      "face-shape/oval": { status: "pending", cacheKey: "k1" },
      "face-shape/round": { status: "failed", cacheKey: "k2", reasonKo: "엔진이 준비되지 않아 썸네일을 만들 수 없습니다." },
    };
    render(
      <MockLabProvider catalog={catalog()} initialState={{ capabilities: capabilities(), thumbnails }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    expect(within(card("계란형")).getByText("생성 중")).toBeTruthy();
    expect(within(card("둥근형")).getByText(/썸네일 실패: 엔진이 준비되지 않아/u)).toBeTruthy();
    expect(within(card("하트형")).getByText("썸네일 없음")).toBeTruthy();
  });

  it("undo/redo 버튼은 history 상태를 따르고 dispatch한다", () => {
    const store = createMockLabStore({ capabilities: capabilities(), history: { canUndo: true, canRedo: false, depth: 2, revision: 2 } });
    render(
      <MockLabProvider catalog={catalog()} store={store}>
        <SlotPanel />
      </MockLabProvider>,
    );
    const undo = screen.getByRole("button", { name: "실행 취소" });
    const redo = screen.getByRole("button", { name: "다시 실행" });
    expect(undo.hasAttribute("disabled")).toBe(false);
    expect(redo.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("2단계")).toBeTruthy();
    fireEvent.click(undo);
    expect(store.dispatched).toEqual([{ type: "history/undo" }]);
    act(() => store.setState({ history: { canUndo: false, canRedo: true, depth: 1, revision: 3 } }));
    expect(screen.getByRole("button", { name: "다시 실행" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "다시 실행" }));
    expect(store.dispatched.at(-1)).toEqual({ type: "history/redo" });
  });

  it("실제 store와 함께 쓰면 카드 클릭이 레시피를 바꾸고 선택 카드가 옮겨간다", () => {
    const cat = catalog();
    const store = createLabStore({ catalog: cat, initial: createInitialLabState(createDefaultRecipe(), capabilities()) });
    render(
      <MockLabProvider catalog={cat} store={store}>
        <SlotPanel />
      </MockLabProvider>,
    );
    fireEvent.click(card("둥근형"));
    expect(store.getState().recipe.slots["face-shape"]).toBe("face-shape/round");
    expect(store.getState().recipe.face.jawWidth).toBe(0.35);
    expect(card("둥근형").getAttribute("aria-pressed")).toBe("true");
    expect(card("계란형").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(card("계란형").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("슬롯 15개 · 프리셋 94개")).toBeTruthy();
  });
});

/** 남성 베이스처럼 일부 헤어만 제공하는 부분 지원 슬롯 */
const MALE_HAIR: SlotCapability = {
  status: "partial",
  reasonKo: "제공 5/7종, 미제공: twin-tail, hime-cut",
  unavailablePresets: { "hair/twin-tail": "남성 핏 미제작", "hair/hime-cut": "남성 핏 미제작(히메컷)" },
};

function openHair(): void {
  fireEvent.click(screen.getByRole("tab", { name: /^헤어/u }));
}

describe("SlotPanel — 프리셋 단위 미제공(unavailablePresets)", () => {
  it("미제공 프리셋 카드만 disabled이고 사유를 툴팁·카드 텍스트로 보이며 클릭해도 dispatch하지 않는다", () => {
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities({ hair: MALE_HAIR }) }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    openHair();
    const twin = card("트윈테일");
    expect(twin.disabled).toBe(true);
    expect(twin.title).toContain("남성 핏 미제작");
    expect(twin.getAttribute("data-preset-unavailable")).toBe("true");
    expect(twin.className).toContain("cl-slot-card--preset-unavailable");
    expect(within(twin).getByText("남성 핏 미제작")).toBeTruthy();
    expect(within(twin).getByText("미제공", { selector: ".cl-slot-badge" })).toBeTruthy();
    // 썸네일 자리는 "미제공"이다(썸네일 요청·표시 없음)
    expect(within(twin).getByText("미제공", { selector: ".cl-slot-thumb" })).toBeTruthy();
    expect(card("히메컷").disabled).toBe(true);
    fireEvent.click(twin);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("제공되는 카드는 평소처럼 쓰고 카드마다 '부분 지원' 경고를 반복하지 않는다(탭 배지·캡션·툴팁으로만)", () => {
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities({ hair: MALE_HAIR }) }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    openHair();
    const bob = card("소프트 보브");
    expect(bob.disabled).toBe(false);
    expect(within(bob).queryByText("부분 지원")).toBeNull();
    expect(within(bob).queryByText(/제공 5\/7종/u)).toBeNull();
    // 슬롯 수준 안내는 남는다: 탭 배지, 캡션, 카드 툴팁
    expect(within(screen.getByRole("tab", { name: /^헤어/u })).getByText("부분 지원")).toBeTruthy();
    expect(screen.getByText(/— 제공 5\/7종, 미제공: twin-tail, hime-cut/u)).toBeTruthy();
    expect(bob.title).toContain("제공 5/7종");
    fireEvent.click(bob);
    expect(dispatchSpy).toHaveBeenCalledWith({ type: "slot/apply", slot: "hair", presetId: "hair/soft-bob" });
  });

  it("카드 사유는 플래너가 그 프리셋을 unsupported로 계획하는 사유와 같은 문구다", () => {
    const base = createDefaultRecipe();
    const recipe = { ...base, slots: { ...base.slots, hair: "hair/hime-cut" as const } };
    const caps = capabilities({ hair: MALE_HAIR });
    const plan = planApply(recipe, caps, catalog());
    const planned = plan.unsupported.find((item) => item.slot === "hair");
    expect(planned?.presetId).toBe("hair/hime-cut");
    render(
      <MockLabProvider catalog={catalog()} initialState={{ capabilities: caps, recipe }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    openHair();
    const hime = card("히메컷");
    expect(hime.title).toContain(planned?.reasonKo ?? "(플랜 사유 없음)");
    expect(within(hime).getByText(planned?.reasonKo ?? "(플랜 사유 없음)")).toBeTruthy();
  });

  it("이미 선택된 프리셋이 미제공이면 선택 표시는 유지되고 다른 프리셋으로 대체되지 않으며 미적용 사유가 한 번만 보인다", () => {
    const base = createDefaultRecipe();
    const recipe = { ...base, slots: { ...base.slots, hair: "hair/twin-tail" as const } };
    const caps = capabilities({ hair: MALE_HAIR });
    const plan = planApply(recipe, caps, catalog());
    const snapshot: ApplyLoopSnapshot = { plan, receipt: null, sequence: 1 };
    const loop: ApplyLoop = {
      start: () => () => undefined,
      flush: async () => undefined,
      lastPlan: () => snapshot.plan,
      lastReceipt: () => snapshot.receipt,
      snapshot: () => snapshot,
      markSourceLoaded: () => undefined,
      retrySource: () => undefined,
      settled: () => true,
      subscribe: () => () => undefined,
    };
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: caps, recipe }} shell={{ applyLoop: loop }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    openHair();
    const twin = card("트윈테일");
    expect(twin.getAttribute("aria-pressed")).toBe("true");
    expect(twin.disabled).toBe(true);
    expect(within(twin).queryByText("미적용")).toBeNull();
    expect(screen.getByText(/현재 선택이 적용되지 않았습니다: 남성 핏 미제작/u)).toBeTruthy();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("슬롯 전체가 미지원이면 슬롯 사유가 먼저이고 프리셋 단위 표시를 쓰지 않는다", () => {
    const slotReason = "이 소스는 교체형 헤어를 제공하지 않습니다.";
    render(
      <MockLabProvider
        catalog={catalog()}
        initialState={{ capabilities: capabilities({ hair: { status: "unavailable", reasonKo: slotReason, unavailablePresets: { "hair/twin-tail": "프리셋 사유" } } }) }}
      >
        <SlotPanel />
      </MockLabProvider>,
    );
    openHair();
    const twin = card("트윈테일");
    expect(twin.disabled).toBe(true);
    expect(twin.title).toContain(slotReason);
    expect(twin.title).not.toContain("프리셋 사유");
    expect(twin.getAttribute("data-preset-unavailable")).toBeNull();
    expect(within(twin).getByText("미지원")).toBeTruthy();
  });

  it("미제공 목록이 없는 부분 지원 슬롯은 기존처럼 카드마다 배지와 사유를 보인다", () => {
    render(
      <MockLabProvider catalog={catalog()} initialState={{ capabilities: capabilities({ hair: { status: "partial", reasonKo: "일부 스타일만 반영" } }) }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    openHair();
    expect(within(card("소프트 보브")).getByText("부분 지원")).toBeTruthy();
    expect(within(card("소프트 보브")).getByText("일부 스타일만 반영")).toBeTruthy();
    expect(card("소프트 보브").disabled).toBe(false);
  });
});

