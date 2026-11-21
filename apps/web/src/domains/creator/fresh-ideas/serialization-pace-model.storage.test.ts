// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { completeStageAllCuts, createInitialPaceState, loadSerializationPaceState, nudgeStageCuts,
  recordDailyPaceCheckIn, saveSerializationPaceState } from "./serialization-pace-model";

const key = "toonstudio.serialization-pace-board.v1";
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("개인 연재 페이스 작업 사본", () => {
  it.each(["unavailable", "malformed"])("최초 읽기 실패 초안은 화면 편집 뒤에도 원본을 보존하고 정상 재읽기로 복구한다: %s", failure => {
    const saved = nudgeStageCuts({ ...createInitialPaceState(), episodeLabel: "저장된 회차" }, "color", 20);
    expect(saveSerializationPaceState(saved)).toBe(true);
    const original = localStorage.getItem(key);
    const read = vi.spyOn(Storage.prototype, "getItem");
    if (failure === "unavailable") read.mockImplementationOnce(() => { throw new Error("일시적 읽기 거부"); });
    else read.mockReturnValueOnce("{broken");
    const fallback = loadSerializationPaceState();
    // 실제 화면의 부분 편집·공정 조작·출석 갱신은 모두 원래 초안의 저장 제한을 이어받는다.
    const edits = [
      { ...fallback, daysRemaining: fallback.daysRemaining + 1 },
      nudgeStageCuts(fallback, "ink", 5),
      completeStageAllCuts(fallback, "lettering"),
      recordDailyPaceCheckIn(fallback, "2026-11-21").state,
    ];
    for (const edited of edits) {
      expect(saveSerializationPaceState(edited)).toBe(false);
      expect(localStorage.getItem(key)).toBe(original);
    }
    const restored = loadSerializationPaceState();
    expect(restored).toEqual(saved);
    expect(saveSerializationPaceState({ ...restored, episodeLabel: "재읽기 후 편집" })).toBe(true);
    expect(loadSerializationPaceState()).toMatchObject({ episodeLabel: "재읽기 후 편집", completedByStage: { color: 20 } });
    expect(saveSerializationPaceState({ ...fallback })).toBe(false);
  });

  it("계획·수치 필드만 저장하고 경계를 정규화하여 다시 읽는다", () => {
    const state = { ...createInitialPaceState("instatoon-8"), targetCuts: 250, daysRemaining: 40,
      completedByStage: { storyboard: 999, bg3d: -5, ink: 3, color: 4, lettering: 5 }, manuscript: "저장 대상 아님" };
    expect(saveSerializationPaceState(state)).toBe(true);
    expect(loadSerializationPaceState()).toMatchObject({ targetCuts: 200, daysRemaining: 30, completedByStage: { storyboard: 200, bg3d: 0 } });
    expect(JSON.parse(localStorage.getItem(key) ?? "null")).not.toHaveProperty("manuscript");
  });

  it.each(["{broken", "null", JSON.stringify({ ...createInitialPaceState(), targetCuts: "invalid" })])("읽지 못한 원본은 기본값이나 새 계획으로 덮지 않는다: %s", original => {
    localStorage.setItem(key, original);
    expect(JSON.parse(JSON.stringify(loadSerializationPaceState()))).toEqual(createInitialPaceState());
    expect(saveSerializationPaceState(createInitialPaceState("instatoon-8"))).toBe(false);
    expect(localStorage.getItem(key)).toBe(original);
  });

  it("비유한 수치와 저장 거부는 마지막 정상 저장본을 보존한다", () => {
    const state = createInitialPaceState();
    expect(saveSerializationPaceState(state)).toBe(true);
    const original = localStorage.getItem(key);
    expect(saveSerializationPaceState({ ...state, targetCuts: Number.NaN })).toBe(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(saveSerializationPaceState({ ...state, episodeLabel: "메모리 계획" })).toBe(false);
    expect(localStorage.getItem(key)).toBe(original);
  });
});
