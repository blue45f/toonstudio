import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_INFERENCE_AXIS_STYLE,
  STUDIO_BG3D_INFERENCE_UP_AXIS,
  resolveStudioBg3dInferenceAxisRoles,
} from "./studio-bg3d-inference-kinds";
import {
  applyStudioBg3dInferenceLength,
  createStudioBg3dInferenceHold,
  createStudioBg3dInferenceSessionState,
  measureStudioBg3dInferenceDistance,
  reduceStudioBg3dInferenceSession,
  resolveStudioBg3dInferenceApplyDirection,
} from "./studio-bg3d-inference-session";

import type {
  StudioBg3dInferenceKeyEvent,
  StudioBg3dInferenceReduceOptions,
  StudioBg3dInferenceReduction,
  StudioBg3dInferenceSessionEvent,
  StudioBg3dInferenceSessionState,
} from "./studio-bg3d-inference-session";
import type { StudioBg3dInferenceResult } from "./studio-bg3d-inference-types";

type Vec = readonly [number, number, number];

function result(partial: Partial<StudioBg3dInferenceResult> & Pick<StudioBg3dInferenceResult, "kind" | "point">): StudioBg3dInferenceResult {
  return {
    label: partial.kind,
    detail: null,
    announcement: partial.kind,
    axis: null,
    direction: null,
    normal: null,
    sourceIds: [],
    edgeId: null,
    alignmentOrigin: null,
    relation: null,
    guides: [],
    constraint: { kind: "none" },
    projected: false,
    approximate: false,
    distancePx: 0,
    ...partial,
  };
}

function start(referencePoint: Vec | null = [0, 0, 0]): StudioBg3dInferenceSessionState {
  const initial = createStudioBg3dInferenceSessionState("cm");
  return reduceStudioBg3dInferenceSession(initial, { type: "begin", tool: "measure", referencePoint }).state;
}

function press(
  state: StudioBg3dInferenceSessionState,
  key: string,
  extra: Partial<StudioBg3dInferenceKeyEvent> = {},
  options?: StudioBg3dInferenceReduceOptions,
): StudioBg3dInferenceReduction {
  return reduceStudioBg3dInferenceSession(state, { type: "key-down", event: { key, ...extra } }, options);
}

function run(state: StudioBg3dInferenceSessionState, ...events: StudioBg3dInferenceSessionEvent[]) {
  return events.reduce((current, event) => reduceStudioBg3dInferenceSession(current, event).state, state);
}

describe("방향키 축 잠금", () => {
  it("up 축 관례를 코드에서 읽어 → X, ← Z, ↑ Y로 매핑한다", () => {
    expect(STUDIO_BG3D_INFERENCE_UP_AXIS).toBe("y");
    expect(resolveStudioBg3dInferenceAxisRoles()).toEqual({ first: "x", second: "z", vertical: "y" });
    // Z-up 장면(SketchUp 관례)이라면 ← 가 Y로 바뀐다.
    expect(resolveStudioBg3dInferenceAxisRoles("z")).toEqual({ first: "x", second: "y", vertical: "z" });
    expect(resolveStudioBg3dInferenceAxisRoles("x")).toEqual({ first: "y", second: "z", vertical: "x" });
  });

  it("→ 는 X축, ← 는 두 번째 수평 축(Z), ↑ 는 수직 축(Y)을 잠그고 키를 처리한다", () => {
    const base = start();
    const right = press(base, "ArrowRight");
    expect(right.handled).toBe(true);
    expect(right.state.lock).toEqual({ kind: "axis", axis: "x" });
    expect(right.state.notice?.text).toBe("X축 잠금 — 좌우, 빨강");
    expect(right.state.notice?.urgent).toBe(true);
    expect(press(base, "ArrowLeft").state.lock).toEqual({ kind: "axis", axis: "z" });
    const up = press(base, "ArrowUp");
    expect(up.state.lock).toEqual({ kind: "axis", axis: "y" });
    expect(up.state.notice?.text).toBe("Y축 잠금 — 상하(높이), 초록");
    expect(STUDIO_BG3D_INFERENCE_AXIS_STYLE.z.colorName).toBe("파랑");
  });

  it("같은 키를 다시 누르면 해제하고, 다른 축 키는 잠금을 교체한다", () => {
    const locked = press(start(), "ArrowRight").state;
    const released = press(locked, "ArrowRight");
    expect(released.state.lock).toEqual({ kind: "none" });
    expect(released.state.notice?.text).toBe("X축 잠금 해제");
    expect(press(locked, "ArrowUp").state.lock).toEqual({ kind: "axis", axis: "y" });
  });

  it("기준점이 없으면 잠그지 않고 이유를 알린다 (키는 소비한다)", () => {
    const noReference = start(null);
    const attempt = press(noReference, "ArrowRight");
    expect(attempt.handled).toBe(true);
    expect(attempt.state.lock).toEqual({ kind: "none" });
    expect(attempt.state.notice).toMatchObject({ tone: "warn", urgent: true });
    expect(attempt.state.notice?.text).toContain("시작점");
  });

  it("↓ 는 현재 평행·수직 추론을 잠그고 다시 누르면 해제한다", () => {
    const withRelation = run(
      start(),
      {
        type: "result",
        result: result({
          kind: "perpendicular",
          point: [0, 0, 2],
          direction: [0, 0, 1],
          relation: { id: "wall", label: "벽선" },
        }),
      },
    );
    const locked = press(withRelation, "ArrowDown");
    expect(locked.handled).toBe(true);
    expect(locked.state.lock).toMatchObject({ kind: "direction", relation: "perpendicular", referenceId: "wall" });
    expect(locked.state.notice?.text).toBe("수직 잠금 — 벽선");
    const released = press(locked.state, "ArrowDown");
    expect(released.state.lock).toEqual({ kind: "none" });
    expect(released.state.notice?.text).toBe("평행·수직 잠금 해제");
  });

  it("↓ 는 평행·수직 추론이 없으면 안내만 하고 잠그지 않는다", () => {
    const withAxis = run(start(), { type: "result", result: result({ kind: "axis", point: [1, 0, 0], axis: "x" }) });
    const attempt = press(withAxis, "ArrowDown");
    expect(attempt.handled).toBe(true);
    expect(attempt.state.lock).toEqual({ kind: "none" });
    expect(attempt.state.notice?.tone).toBe("warn");
    expect(attempt.state.notice?.text).toContain("평행·수직");
    expect(press(start(), "ArrowDown").state.lock).toEqual({ kind: "none" });
  });

  it("다른 위젯이 방향키를 쓰는 곳(탭 목록 등)에서는 가로채지 않는다", () => {
    const attempt = press(start(), "ArrowRight", { widgetOwnsArrows: true });
    expect(attempt.handled).toBe(false);
    expect(attempt.state.lock).toEqual({ kind: "none" });
  });

  it("Ctrl/Alt/Meta와 함께 누른 방향키는 건드리지 않는다", () => {
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      const attempt = press(start(), "ArrowRight", modifier);
      expect(attempt.handled).toBe(false);
      expect(attempt.state.lock).toEqual({ kind: "none" });
    }
  });

  it("버튼으로도 같은 잠금을 걸 수 있다 (포인터·터치 대체 경로)", () => {
    const base = start();
    const reduce = (role: "first" | "second" | "vertical" | "relation") =>
      reduceStudioBg3dInferenceSession(base, { type: "request-lock", role }).state;
    expect(reduce("first").lock).toEqual({ kind: "axis", axis: "x" });
    expect(reduce("second").lock).toEqual({ kind: "axis", axis: "z" });
    expect(reduce("vertical").lock).toEqual({ kind: "axis", axis: "y" });
    expect(reduce("relation").lock).toEqual({ kind: "none" });
    const cleared = run(base, { type: "request-lock", role: "first" }, { type: "clear-lock" });
    expect(cleared.lock).toEqual({ kind: "none" });
  });

  it("새 기준점을 잡으면 잠금·유지·호버 기준·입력이 초기화된다", () => {
    const busy = run(
      start(),
      { type: "request-lock", role: "first" },
      { type: "add-hover-reference", point: [1, 0, 1] },
      { type: "vcb-change", text: "2m" },
    );
    expect(busy.lock.kind).toBe("axis");
    const next = run(busy, { type: "set-reference", point: [5, 0, 5] });
    expect(next.referencePoint).toEqual([5, 0, 5]);
    expect(next.lock).toEqual({ kind: "none" });
    expect(next.hoverReferences).toEqual([]);
    expect(next.vcb).toEqual({ text: "", error: null });
  });
});

describe("Shift 추론 유지", () => {
  it("현재 축 정렬을 Shift를 누르는 동안 직선으로 유지하고 떼면 해제한다", () => {
    const aligned = run(start(), {
      type: "result",
      result: result({ kind: "axis", point: [2, 0, 0], axis: "x", direction: [1, 0, 0], alignmentOrigin: [0, 0, 0] }),
    });
    const down = press(aligned, "Shift");
    expect(down.handled).toBe(false);
    expect(down.state.shiftDown).toBe(true);
    expect(down.state.hold).toEqual({ kind: "line", origin: [0, 0, 0], direction: [1, 0, 0], axis: "x", from: "axis" });
    expect(down.state.notice?.text).toBe("추론 유지 — X축 정렬");
    const up = reduceStudioBg3dInferenceSession(down.state, { type: "key-up", event: { key: "Shift" } });
    expect(up.state.hold).toBeNull();
    expect(up.state.shiftDown).toBe(false);
    expect(up.state.notice?.text).toBe("추론 유지 해제");
  });

  it("종류별로 알맞은 제약을 만든다: 선 위→직선, 면 위→평면, 끝점→점", () => {
    expect(createStudioBg3dInferenceHold(result({ kind: "on-edge", point: [1, 0, 1], direction: [1, 0, 0], axis: "x" })))
      .toEqual({ kind: "line", origin: [1, 0, 1], direction: [1, 0, 0], axis: "x", from: "on-edge" });
    expect(createStudioBg3dInferenceHold(result({ kind: "on-face", point: [1, 2, 3], normal: [0, 1, 0], sourceIds: ["A"] })))
      .toEqual({ kind: "plane", point: [1, 2, 3], normal: [0, 1, 0], sourceId: "A" });
    expect(createStudioBg3dInferenceHold(result({ kind: "endpoint", point: [1, 2, 3] })))
      .toEqual({ kind: "point", point: [1, 2, 3], from: "endpoint" });
    expect(createStudioBg3dInferenceHold(result({ kind: "intersection", point: [1, 2, 3] }))?.kind).toBe("point");
    expect(createStudioBg3dInferenceHold(result({ kind: "parallel", point: [1, 0, 1], direction: [1, 0, 0], alignmentOrigin: [0, 0, 0] }))?.kind)
      .toBe("line");
  });

  it("유지할 수 없는 추론(자유·격자·방향 정보 없음)은 제약을 만들지 않는다", () => {
    expect(createStudioBg3dInferenceHold(null)).toBeNull();
    expect(createStudioBg3dInferenceHold(result({ kind: "free", point: [0, 0, 0] }))).toBeNull();
    expect(createStudioBg3dInferenceHold(result({ kind: "grid", point: [0, 0, 0] }))).toBeNull();
    expect(createStudioBg3dInferenceHold(result({ kind: "axis", point: [1, 0, 0] }))).toBeNull();
    expect(createStudioBg3dInferenceHold(result({ kind: "on-face", point: [1, 0, 0] }))).toBeNull();
    const free = press(run(start(), { type: "result", result: result({ kind: "free", point: [1, 0, 0] }) }), "Shift");
    expect(free.state.hold).toBeNull();
    expect(free.state.notice?.text).toContain("유지할 추론이 없습니다");
    expect(free.state.notice?.urgent).toBe(false);
  });

  it("키 반복과 창 포커스 이탈로 Shift가 눌린 채 남지 않는다", () => {
    const aligned = run(start(), {
      type: "result",
      result: result({ kind: "endpoint", point: [2, 0, 0] }),
    });
    const down = press(aligned, "Shift").state;
    expect(press(down, "Shift", { repeat: true }).state).toBe(down);
    const blurred = run(down, { type: "reset-modifiers" });
    expect(blurred.shiftDown).toBe(false);
    expect(blurred.hold).toBeNull();
  });

  it("Alt 상태를 추적한다 (스냅 일시 해제용)", () => {
    const down = press(start(), "Alt").state;
    expect(down.altDown).toBe(true);
    const up = reduceStudioBg3dInferenceSession(down, { type: "key-up", event: { key: "Alt" } }).state;
    expect(up.altDown).toBe(false);
  });
});

describe("Esc 취소와 숫자 입력(VCB)", () => {
  it("입력 중 Esc는 입력만 지우고, 한 번 더 누르면 도구를 취소한다", () => {
    const typed = run(start(), { type: "vcb-change", text: "2.4m" });
    const first = press(typed, "Escape");
    expect(first.handled).toBe(true);
    expect(first.effects).toEqual([]);
    expect(first.state.vcb.text).toBe("");
    expect(first.state.notice?.text).toBe("입력을 지웠습니다.");
    const second = press(first.state, "Escape");
    expect(second.handled).toBe(true);
    expect(second.effects).toEqual([{ type: "cancel" }]);
    expect(second.state.referencePoint).toBeNull();
    expect(second.state.lock).toEqual({ kind: "none" });
    expect(second.state.notice?.text).toBe("취소했습니다.");
  });

  it("숫자 키는 입력창을 열고 첫 글자를 채우며 포커스 요청을 낸다", () => {
    const attempt = press(start(), "2");
    expect(attempt.handled).toBe(true);
    expect(attempt.state.vcb.text).toBe("2");
    expect(attempt.effects).toEqual([{ type: "focus-vcb" }]);
    expect(press(start(), ".").state.vcb.text).toBe(".");
    expect(press(start(), "-").state.vcb.text).toBe("-");
    // 입력창 안의 키, 이미 입력 중인 키, 수정자 조합은 가로채지 않는다.
    expect(press(start(), "2", { fromVcb: true }).handled).toBe(false);
    expect(press(run(start(), { type: "vcb-change", text: "1" }), "2").handled).toBe(false);
    expect(press(start(), "2", { ctrlKey: true }).handled).toBe(false);
    expect(press(start(), "t").handled).toBe(false);
  });

  it("Enter로 길이를 적용한다: 잠긴 축 방향과 결과가 가리키던 쪽의 부호를 따른다", () => {
    let state = run(start(), { type: "request-lock", role: "first" }, {
      type: "result",
      result: result({ kind: "axis", point: [-1, 0, 0], axis: "x", direction: [-1, 0, 0] }),
    });
    state = run(state, { type: "vcb-change", text: "80cm" });
    const entered = press(state, "Enter", { fromVcb: true });
    expect(entered.handled).toBe(true);
    expect(entered.effects).toEqual([{ type: "apply-length", meters: 0.8, direction: [-1, 0, 0], negative: false }]);
    expect(entered.state.vcb).toEqual({ text: "", error: null });
    expect(entered.state.notice).toMatchObject({ tone: "success", text: "길이 80 cm 적용" });
  });

  it("음수 입력은 방향을 뒤집는다", () => {
    const state = run(
      start(),
      { type: "request-lock", role: "vertical" },
      { type: "result", result: result({ kind: "axis", point: [0, 2, 0], axis: "y" }) },
      { type: "vcb-change", text: "-1.5m" },
    );
    const entered = reduceStudioBg3dInferenceSession(state, { type: "vcb-submit" });
    expect(entered.effects).toEqual([{ type: "apply-length", meters: 1.5, direction: [0, -1, 0], negative: true }]);
    expect(entered.state.notice?.text).toBe("길이 −150 cm 적용");
  });

  it("음수를 허용하지 않는 도구에서는 오류로 거부한다", () => {
    const state = run(
      start(),
      { type: "request-lock", role: "first" },
      { type: "vcb-change", text: "-1m" },
    );
    const rejected = press(state, "Enter", { fromVcb: true }, { allowNegative: false });
    expect(rejected.effects).toEqual([]);
    expect(rejected.state.vcb.error).toContain("음수");
    expect(rejected.state.notice).toMatchObject({ tone: "error", urgent: true });
    expect(rejected.state.notice?.text.startsWith("입력 오류:")).toBe(true);
    expect(rejected.state.vcb.text).toBe("-1m");
  });

  it("잘못된 단위·빈 입력·범위 밖은 이유를 보여 주고 입력을 보존한다", () => {
    const base = run(start(), { type: "request-lock", role: "first" });
    for (const [text, expected] of [["2,4m", "쉼표"], ["2.4km", "단위"], ["0", "0은"], ["30000m", "너무 깁니다"]] as const) {
      const attempt = press(run(base, { type: "vcb-change", text }), "Enter", { fromVcb: true });
      expect(attempt.effects, text).toEqual([]);
      expect(attempt.state.vcb.error, text).toContain(expected);
      expect(attempt.state.vcb.text, text).toBe(text);
    }
    // 입력이 비어 있으면 Enter를 가로채지 않는다.
    expect(press(base, "Enter").handled).toBe(false);
  });

  it("방향을 정할 수 없으면 적용하지 않고 안내한다", () => {
    const noDirection = run(start(), { type: "vcb-change", text: "2m" });
    const attempt = press(noDirection, "Enter", { fromVcb: true });
    expect(attempt.effects).toEqual([]);
    expect(attempt.state.vcb.error).toContain("방향");
    const noReference = run(start(null), { type: "vcb-change", text: "2m" });
    expect(press(noReference, "Enter", { fromVcb: true }).effects).toEqual([]);
  });

  it("잠금이 없으면 기준점에서 마지막 결과 점으로 향하는 방향을 쓴다", () => {
    const state = run(
      start([1, 0, 1]),
      { type: "result", result: result({ kind: "free", point: [1, 0, 5] }) },
      { type: "vcb-change", text: "2" },
    );
    const entered = press(state, "Enter", { fromVcb: true });
    expect(entered.effects).toEqual([{ type: "apply-length", meters: 0.02, direction: [0, 0, 1], negative: false }]);
    expect(resolveStudioBg3dInferenceApplyDirection(state)).toEqual([0, 0, 1]);
  });

  it("입력 변경은 오류를 지우고 길이 상한을 둔다", () => {
    const failed = press(run(start(), { type: "request-lock", role: "first" }, { type: "vcb-change", text: "x" }), "Enter", { fromVcb: true }).state;
    expect(failed.vcb.error).not.toBeNull();
    const edited = run(failed, { type: "vcb-change", text: "x2" });
    expect(edited.vcb.error).toBeNull();
    const long = run(start(), { type: "vcb-change", text: "9".repeat(500) });
    expect(long.vcb.text.length).toBeLessThanOrEqual(128);
  });

  it("단위 변경은 단위 없는 숫자의 해석에 반영된다", () => {
    const state = run(
      start(),
      { type: "set-unit", unit: "mm" },
      { type: "request-lock", role: "first" },
      { type: "vcb-change", text: "1200" },
    );
    const entered = press(state, "Enter", { fromVcb: true });
    expect(entered.effects).toEqual([{ type: "apply-length", meters: 1.2, direction: [1, 0, 0], negative: false }]);
  });
});

describe("세션 수명과 보조 함수", () => {
  it("begin 전에는 어떤 이벤트도 상태를 바꾸지 않고 키를 처리하지 않는다", () => {
    const idle = createStudioBg3dInferenceSessionState();
    expect(idle.active).toBe(false);
    const attempt = press(idle, "ArrowRight");
    expect(attempt.handled).toBe(false);
    expect(attempt.state).toBe(idle);
    expect(reduceStudioBg3dInferenceSession(idle, { type: "vcb-change", text: "1" }).state).toBe(idle);
  });

  it("end는 모든 상태를 비우되 안내 번호는 이어 간다", () => {
    const busy = run(start(), { type: "request-lock", role: "first" }, { type: "add-hover-reference", point: [1, 1, 1] });
    expect(busy.noticeSeq).toBeGreaterThan(0);
    const ended = run(busy, { type: "end" });
    expect(ended.active).toBe(false);
    expect(ended.lock).toEqual({ kind: "none" });
    expect(ended.hoverReferences).toEqual([]);
    expect(ended.noticeSeq).toBe(busy.noticeSeq);
  });

  it("안내 번호는 같은 문구가 반복돼도 매번 증가한다", () => {
    const first = press(start(), "ArrowRight").state;
    const released = press(first, "ArrowRight").state;
    const again = press(released, "ArrowRight").state;
    expect(new Set([first.notice?.id, released.notice?.id, again.notice?.id]).size).toBe(3);
    expect(first.notice?.text).toBe(again.notice?.text);
  });

  it("호버 기준점은 최대 4개까지만 쌓는다", () => {
    let state = start();
    for (let i = 0; i < 6; i += 1) state = run(state, { type: "add-hover-reference", point: [i, 0, 0] });
    expect(state.hoverReferences).toHaveLength(4);
    expect(run(state, { type: "clear-hover-references" }).hoverReferences).toEqual([]);
  });

  it("거리 측정과 길이 적용 보조 함수가 기준점 기준으로 계산한다", () => {
    expect(measureStudioBg3dInferenceDistance(null, [1, 2, 3])).toBeNull();
    expect(measureStudioBg3dInferenceDistance([0, 0, 0], [3, 4, 0])).toBe(5);
    expect(applyStudioBg3dInferenceLength([1, 1, 1], [0, 1, 0], 2.5)).toEqual([1, 3.5, 1]);
  });
});
