import { describe, expect, it } from "vitest";

import {
  STUDIO_CHARM_BAR_MAX_CHARMS,
  STUDIO_CHARM_ID_MAX_LENGTH,
  appendStudioCharms,
  createEmptyStudioCharmBarState,
  createStudioCharmId,
  isStudioCharmPinned,
  isStudioCharmId,
  moveStudioCharm,
  normalizeStudioCharmBarState,
  parseStudioCharmId,
  pinStudioCharm,
  setStudioCharmBarOpen,
  shiftStudioCharm,
  splitStudioCharmId,
  studioCharmBarStatesEqual,
  studioCharmEmojiFromRawId,
  studioCharmEmojiRawId,
  toggleStudioCharm,
  unpinStudioCharm,
  type StudioCharmBarState,
  type StudioCharmId,
} from "./studio-charm-model";

function ids(count: number): StudioCharmId[] {
  return Array.from({ length: count }, (_, index) => createStudioCharmId("element", `item-${index}`));
}

function stateOf(charms: readonly StudioCharmId[], overrides: Partial<StudioCharmBarState> = {}): StudioCharmBarState {
  return normalizeStudioCharmBarState({
    version: 1,
    charms,
    open: false,
    starterSettled: false,
    ...overrides,
  });
}

describe("참 ID", () => {
  it("종류와 원본 ID 가 안전할 때만 만들고, 종류가 다르면 같은 원본 ID 도 다른 참이다", () => {
    const element = createStudioCharmId("element", "decor-burst-lines");
    const fx = createStudioCharmId("fx", "decor-burst-lines");
    expect(element).toBe("element:decor-burst-lines");
    expect(element).not.toBe(fx);
    expect(splitStudioCharmId(element)).toEqual({ kind: "element", rawId: "decor-burst-lines" });
  });

  it("공백을 다듬고, 잘못된 종류·콜론·공백·한글·너무 긴 ID 는 거절한다", () => {
    expect(createStudioCharmId("fx", "  radial-focus  ")).toBe("fx:radial-focus");
    expect(() => createStudioCharmId("fx", "")).toThrow(TypeError);
    expect(() => createStudioCharmId("fx", "a b")).toThrow(TypeError);
    expect(() => createStudioCharmId("fx", "한글")).toThrow(TypeError);
    expect(() => createStudioCharmId("fx", "a:b")).toThrow(TypeError);
    expect(() => createStudioCharmId("fx", "-leading")).toThrow(TypeError);
    expect(() => createStudioCharmId("fx", "x".repeat(STUDIO_CHARM_ID_MAX_LENGTH))).toThrow(TypeError);
    expect(isStudioCharmId("unknown:abc")).toBe(false);
    expect(isStudioCharmId("fx:")).toBe(false);
    expect(isStudioCharmId(":abc")).toBe(false);
    expect(isStudioCharmId(42)).toBe(false);
    expect(parseStudioCharmId("raster:builtin-raster-daily")).toBe("raster:builtin-raster-daily");
    expect(parseStudioCharmId("raster:bad id")).toBeNull();
  });

  it("이모지는 코드포인트 식별자로 오가며 제어 문자와 잘못된 식별자는 거절한다", () => {
    expect(studioCharmEmojiRawId("💧")).toBe("1f4a7");
    expect(studioCharmEmojiFromRawId("1f4a7")).toBe("💧");
    expect(studioCharmEmojiRawId("⚠️")).toBe("26a0-fe0f");
    expect(studioCharmEmojiFromRawId("26a0-fe0f")).toBe("⚠️");
    expect(studioCharmEmojiRawId("")).toBeNull();
    expect(studioCharmEmojiRawId("\u0007")).toBeNull();
    expect(studioCharmEmojiRawId("a".repeat(9))).toBeNull();
    expect(studioCharmEmojiFromRawId("zz")).toBeNull();
    expect(studioCharmEmojiFromRawId("d800")).toBeNull();
    expect(studioCharmEmojiFromRawId("110000")).toBeNull();
    expect(studioCharmEmojiFromRawId("1f4a7".concat("-1f4a7".repeat(8)))).toBeNull();
  });
});

describe("참 바 상태 정규화", () => {
  it("저장된 JSON 문자열도 읽고, 중복·잘못된 항목은 버리고 순서를 지킨다", () => {
    const state = normalizeStudioCharmBarState(JSON.stringify({
      version: 1,
      charms: ["fx:a", "fx:b", "fx:a", "bad id", 7, "emoji:1f4a7"],
      open: true,
      starterSettled: true,
    }));
    expect(state.charms).toEqual(["fx:a", "fx:b", "emoji:1f4a7"]);
    expect(state.open).toBe(true);
    expect(state.starterSettled).toBe(true);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.charms)).toBe(true);
  });

  it("버전이 다르거나 깨진 입력은 빈 상태로 돌아가며 불리언 필드는 true 일 때만 켜진다", () => {
    expect(normalizeStudioCharmBarState(null)).toEqual(createEmptyStudioCharmBarState());
    expect(normalizeStudioCharmBarState("{broken")).toEqual(createEmptyStudioCharmBarState());
    expect(normalizeStudioCharmBarState({ version: 2, charms: ["fx:a"] })).toEqual(createEmptyStudioCharmBarState());
    expect(normalizeStudioCharmBarState({ version: 1, charms: "fx:a" })).toEqual(createEmptyStudioCharmBarState());
    expect(normalizeStudioCharmBarState([])).toEqual(createEmptyStudioCharmBarState());
    const loose = normalizeStudioCharmBarState({ version: 1, charms: [], open: "yes", starterSettled: 1 });
    expect(loose.open).toBe(false);
    expect(loose.starterSettled).toBe(false);
  });

  it("최대 개수를 넘는 항목은 앞에서부터 남기고 자른다", () => {
    const many = ids(STUDIO_CHARM_BAR_MAX_CHARMS + 10);
    const state = normalizeStudioCharmBarState({ version: 1, charms: many });
    expect(state.charms).toHaveLength(STUDIO_CHARM_BAR_MAX_CHARMS);
    expect(state.charms[0]).toBe(many[0]);
  });
});

describe("고정·해제·순서", () => {
  it("고정은 맨 뒤에 붙고 이미 있으면 같은 상태를 돌려주며, 처음 고치면 스타터 자동 담기를 끈다", () => {
    const [a, b] = ids(2);
    const empty = createEmptyStudioCharmBarState();
    const first = pinStudioCharm(empty, a);
    expect(first).toMatchObject({ ok: true, changed: true });
    expect(first.state.charms).toEqual([a]);
    expect(first.state.starterSettled).toBe(true);
    const second = pinStudioCharm(first.state, b);
    expect(second.state.charms).toEqual([a, b]);
    const duplicate = pinStudioCharm(second.state, a);
    expect(duplicate).toMatchObject({ ok: true, changed: false });
    expect(duplicate.state).toBe(second.state);
    expect(isStudioCharmPinned(second.state, b)).toBe(true);
  });

  it("가득 차면 실패 이유 full 과 원래 상태를 돌려준다", () => {
    const full = stateOf(ids(STUDIO_CHARM_BAR_MAX_CHARMS));
    const extra = createStudioCharmId("fx", "extra");
    const result = pinStudioCharm(full, extra);
    expect(result).toMatchObject({ ok: false, reason: "full" });
    expect(result.state).toBe(full);
    expect(toggleStudioCharm(full, extra)).toMatchObject({ ok: false, reason: "full" });
  });

  it("해제와 토글은 순서를 지키며, 없는 참을 빼면 같은 상태다", () => {
    const [a, b, c] = ids(3);
    const state = stateOf([a, b, c]);
    expect(unpinStudioCharm(state, b).charms).toEqual([a, c]);
    expect(unpinStudioCharm(state, createStudioCharmId("fx", "none"))).toBe(state);
    const toggledOff = toggleStudioCharm(state, a);
    expect(toggledOff).toMatchObject({ ok: true, changed: true });
    expect(toggledOff.state.charms).toEqual([b, c]);
    const toggledOn = toggleStudioCharm(toggledOff.state, a);
    expect(toggledOn.state.charms).toEqual([b, c, a]);
  });

  it("옮기기는 범위를 양 끝으로 맞추고 제자리면 같은 상태를 돌려준다", () => {
    const [a, b, c, d] = ids(4);
    const state = stateOf([a, b, c, d]);
    expect(moveStudioCharm(state, a, 2).charms).toEqual([b, c, a, d]);
    expect(moveStudioCharm(state, d, 0).charms).toEqual([d, a, b, c]);
    expect(moveStudioCharm(state, b, 99).charms).toEqual([a, c, d, b]);
    expect(moveStudioCharm(state, b, -5).charms).toEqual([b, a, c, d]);
    expect(moveStudioCharm(state, b, 1)).toBe(state);
    expect(moveStudioCharm(state, createStudioCharmId("fx", "none"), 0)).toBe(state);
    expect(moveStudioCharm(state, b, Number.NaN)).toBe(state);
    expect(shiftStudioCharm(state, b, 1).charms).toEqual([a, c, b, d]);
    expect(shiftStudioCharm(state, a, -1)).toBe(state);
    expect(shiftStudioCharm(state, d, 1)).toBe(state);
  });

  it("목록을 고친 상태는 스타터 자동 담기를 끄고 펼침 상태는 유지한다", () => {
    const [a, b] = ids(2);
    const opened = setStudioCharmBarOpen(stateOf([a, b], { open: false }), true);
    expect(opened.open).toBe(true);
    expect(opened.starterSettled).toBe(false);
    expect(setStudioCharmBarOpen(opened, true)).toBe(opened);
    const moved = moveStudioCharm(opened, a, 1);
    expect(moved.open).toBe(true);
    expect(moved.starterSettled).toBe(true);
  });

  it("스타터 덧붙이기는 중복을 건너뛰고 최대 개수를 넘지 않으며 처리 완료로 표시한다", () => {
    const base = ids(STUDIO_CHARM_BAR_MAX_CHARMS - 1);
    const extra = [createStudioCharmId("fx", "x1"), createStudioCharmId("fx", "x2")];
    const appended = appendStudioCharms(stateOf(base), [base[0], ...extra]);
    expect(appended.charms).toHaveLength(STUDIO_CHARM_BAR_MAX_CHARMS);
    expect(appended.charms.at(-1)).toBe(extra[0]);
    expect(appended.starterSettled).toBe(true);
    const settled = stateOf(base, { starterSettled: true });
    expect(appendStudioCharms(settled, base)).toBe(settled);
  });

  it("같은 내용의 상태를 비교한다", () => {
    const [a, b] = ids(2);
    expect(studioCharmBarStatesEqual(stateOf([a, b]), stateOf([a, b]))).toBe(true);
    expect(studioCharmBarStatesEqual(stateOf([a, b]), stateOf([b, a]))).toBe(false);
    expect(studioCharmBarStatesEqual(stateOf([a]), stateOf([a], { open: true }))).toBe(false);
  });
});
