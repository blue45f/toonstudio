import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  applyDailyCheck,
  buildPortfolioSnapshot,
  buildStreakBoard,
  declareHiatus,
  emptyStreakState,
  endHiatusEarly,
  evaluateSignupGate,
  evaluateTrack,
  parseStreakState,
  recordActivity,
  serializeStreakState,
  type StreakState,
} from "./streak-recovery";

/** 2026-10-05(월)부터 이어지는 고정 달력으로 결정적으로 검증한다. */
function stateWith(track: "learning" | "serialization", dates: string[]): StreakState {
  let state = emptyStreakState();
  for (const date of dates) state = recordActivity(state, track, date);
  return state;
}

const MON_FRI = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];

describe("streak recovery — 하루 끊김은 리셋이 아니다", () => {
  it("프리즈가 있으면 하루 빈 날이 자동으로 덮이고 기록이 유지된다", () => {
    // 월~금 활동, 토요일(10-10) 빈 날, 일요일(10-11)에 점검
    const state = stateWith("learning", MON_FRI);
    const checked = applyDailyCheck(state, "2026-10-11");
    assert.equal(checked.tracks.learning.freezeBalance, 1);
    assert.deepEqual(checked.tracks.learning.freezeCoveredDates, ["2026-10-10"]);
    const view = evaluateTrack(checked, "learning", "2026-10-11");
    assert.equal(view.status, "protected-by-freeze");
    assert.equal(view.currentStreak, 5);
    assert.equal(view.longestStreak, 5);
  });

  it("프리즈가 없어도 어제 하루 빈 날은 오늘 하면 이어지는 회복 가능 상태다", () => {
    let state = stateWith("learning", MON_FRI);
    state = { ...state, tracks: { ...state.tracks, learning: { ...state.tracks.learning, freezeBalance: 0 } } };
    const view = evaluateTrack(state, "learning", "2026-10-11");
    assert.equal(view.status, "recoverable-today");
    assert.equal(view.currentStreak, 5);
    // 오늘 실제로 기록하면 끊기지 않고 6일이 된다
    const recovered = recordActivity(state, "learning", "2026-10-11");
    const after = evaluateTrack(recovered, "learning", "2026-10-11");
    assert.equal(after.status, "active");
    assert.equal(after.currentStreak, 6);
  });

  it("이틀 이상 비고 보호 장치도 없으면 현재 기록만 0이 되고 성과는 남는다", () => {
    let state = stateWith("learning", MON_FRI);
    state = { ...state, tracks: { ...state.tracks, learning: { ...state.tracks.learning, freezeBalance: 0 } } };
    const view = evaluateTrack(state, "learning", "2026-10-13");
    assert.equal(view.status, "reset-preserved");
    assert.equal(view.currentStreak, 0);
    assert.equal(view.longestStreak, 5);
    assert.equal(view.totalActiveDays, 5);
    const snapshot = buildPortfolioSnapshot(state, "learning");
    assert.equal(snapshot.preserved, true);
    assert.equal(snapshot.longestStreak, 5);
    assert.equal(snapshot.firstActivityDate, "2026-10-05");
    assert.equal(snapshot.lastActivityDate, "2026-10-09");
  });

  it("일일 점검은 이틀 이상 빈 경우 프리즈를 소모하지 않는다", () => {
    const state = stateWith("learning", MON_FRI);
    const checked = applyDailyCheck(state, "2026-10-13");
    assert.equal(checked.tracks.learning.freezeBalance, 2);
    assert.deepEqual(checked.tracks.learning.freezeCoveredDates, []);
  });
});

describe("streak recovery — 휴재 선언", () => {
  it("휴재 기간은 기록을 끊지 않고 개수로도 세지 않는다", () => {
    let state = stateWith("serialization", MON_FRI);
    const declared = declareHiatus(state, "serialization",
      { id: "h1", startsOn: "2026-10-10", endsOn: "2026-10-14", reason: "재정비" }, "2026-10-09");
    assert.ok(declared);
    state = declared;
    const during = evaluateTrack(state, "serialization", "2026-10-12");
    assert.equal(during.status, "on-hiatus");
    assert.equal(during.currentStreak, 5);
    // 휴재가 끝난 다음 날 기록하면 6일로 이어진다 (휴재 5일은 개수 제외)
    const resumed = recordActivity(state, "serialization", "2026-10-15");
    const view = evaluateTrack(resumed, "serialization", "2026-10-15");
    assert.equal(view.currentStreak, 6);
    assert.equal(view.longestStreak, 6);
  });

  it("이미 끝난 기간·90일 초과·역전 기간의 휴재 선언은 거부된다", () => {
    const state = stateWith("serialization", MON_FRI);
    assert.equal(declareHiatus(state, "serialization",
      { id: "past", startsOn: "2026-10-01", endsOn: "2026-10-02" }, "2026-10-09"), null);
    assert.equal(declareHiatus(state, "serialization",
      { id: "long", startsOn: "2026-10-10", endsOn: "2027-02-01" }, "2026-10-09"), null);
    assert.equal(declareHiatus(state, "serialization",
      { id: "rev", startsOn: "2026-10-14", endsOn: "2026-10-10" }, "2026-10-09"), null);
    assert.equal(declareHiatus(state, "serialization",
      { id: "bad", startsOn: "2026-02-31", endsOn: "2026-10-10" }, "2026-10-09"), null);
  });

  it("휴재를 조기 종료하면 그날까지로 줄고, 시작 전이면 선언이 취소된다", () => {
    let state = stateWith("serialization", MON_FRI);
    state = declareHiatus(state, "serialization",
      { id: "h1", startsOn: "2026-10-10", endsOn: "2026-10-20" }, "2026-10-09")!;
    const ended = endHiatusEarly(state, "serialization", "h1", "2026-10-12");
    assert.equal(ended!.tracks.serialization.hiatuses[0].endsOn, "2026-10-12");
    const cancelled = endHiatusEarly(state, "serialization", "h1", "2026-10-09");
    assert.equal(cancelled!.tracks.serialization.hiatuses.length, 0);
  });
});

describe("streak recovery — 학습과 연재는 분리된 지표다", () => {
  it("학습 활동이 연재 기록을 메우지 않고, 연재 활동도 학습을 메우지 않는다", () => {
    const state = stateWith("learning", MON_FRI);
    const board = buildStreakBoard(state, "2026-10-09");
    assert.equal(board.separated, true);
    assert.equal(board.learning.currentStreak, 5);
    assert.equal(board.serialization.currentStreak, 0);
    assert.equal(board.serialization.status, "not-started");
    assert.notEqual(board.learning.label, board.serialization.label);
  });

  it("프리즈 지급은 트랙별로 따로 쌓인다 (7일 이정표)", () => {
    const week = [...MON_FRI, "2026-10-10", "2026-10-11"];
    const state = stateWith("learning", week);
    assert.equal(state.tracks.learning.freezeBalance, 3); // 기본 2 + 이정표 1 (상한 3)
    assert.equal(state.tracks.serialization.freezeBalance, 2);
  });
});

describe("streak recovery — 저장 검증", () => {
  it("직렬화 왕복이 상태를 그대로 복원한다", () => {
    let state = stateWith("learning", MON_FRI);
    state = declareHiatus(state, "learning",
      { id: "h1", startsOn: "2026-10-10", endsOn: "2026-10-12", reason: "휴식" }, "2026-10-09")!;
    assert.deepEqual(parseStreakState(serializeStreakState(state)), state);
  });

  it("깨진 저장값은 빈 상태로, 존재하지 않는 날짜는 버려진다", () => {
    assert.deepEqual(parseStreakState("{broken"), emptyStreakState());
    assert.deepEqual(parseStreakState('{"version":2}'), emptyStreakState());
    const parsed = parseStreakState(JSON.stringify({
      version: 1,
      tracks: {
        learning: { activityDates: ["2026-02-31", "2026-10-05"], freezeCoveredDates: [], freezeBalance: 99, freezeMilestonesAwarded: [], hiatuses: [] },
        serialization: { activityDates: [], freezeCoveredDates: [], freezeBalance: 1, freezeMilestonesAwarded: [], hiatuses: [] },
      },
    }));
    assert.deepEqual(parsed.tracks.learning.activityDates, ["2026-10-05"]);
    assert.equal(parsed.tracks.learning.freezeBalance, 3); // 상한으로 클램프
  });
});

describe("signup gate — 가입은 첫 성공 뒤다", () => {
  it("첫 성공 전에는 가입 제안을 띄우지 않고 계정 없이 시작할 수 있다", () => {
    const gate = evaluateSignupGate({ firstSuccessDate: null, hasAccount: false });
    assert.equal(gate.canStartWithoutAccount, true);
    assert.equal(gate.showSignupPrompt, false);
    assert.equal(gate.step, "start-without-account");
  });

  it("첫 성공이 기록된 뒤에만 가입 제안을 띄운다", () => {
    const gate = evaluateSignupGate({ firstSuccessDate: "2026-10-09", hasAccount: false });
    assert.equal(gate.showSignupPrompt, true);
    assert.equal(gate.step, "signup-prompt");
    assert.ok(gate.promptReason?.includes("첫 기록"));
  });

  it("이미 계정이 있으면 제안을 띄우지 않는다", () => {
    const gate = evaluateSignupGate({ firstSuccessDate: "2026-10-09", hasAccount: true });
    assert.equal(gate.showSignupPrompt, false);
    assert.equal(gate.step, "continue");
  });
});
