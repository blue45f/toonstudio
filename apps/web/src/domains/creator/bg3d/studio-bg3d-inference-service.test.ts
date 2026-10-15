import { describe, expect, it, vi } from "vitest";

import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";

import type {
  StudioBg3dInferenceApplyLengthRequest,
  StudioBg3dInferenceService,
} from "./studio-bg3d-inference-service";
import type { StudioBg3dInferenceSceneEntity } from "./studio-bg3d-inference-sources";
import type { StudioBg3dInferenceCursor } from "./studio-bg3d-inference-types";

/** 64px = 1m (이진 분수라 px 경계 비교가 정확하다). */
const WPP = 1 / 64;

type Vec = readonly [number, number, number];

function box(id: string, position: Vec, scale = 1): StudioBg3dInferenceSceneEntity {
  return { id, kind: "box", label: `상자 ${id}`, position, rotation: [0, 0, 0], scale: [scale, scale, scale] };
}

function pointCursor(point: Vec): StudioBg3dInferenceCursor {
  return { kind: "point", point, worldPerPixel: WPP };
}

interface Fixture {
  readonly service: StudioBg3dInferenceService;
  readonly clock: { t: number };
  /** 예약된 지연 실행을 시간 순으로 실행한다. */
  advance(ms: number): void;
  readonly pending: () => number;
}

function createFixture(): Fixture {
  const clock = { t: 1_000 };
  const queue: Array<{ at: number; run: () => void; canceled: boolean }> = [];
  const service = createStudioBg3dInferenceService({
    now: () => clock.t,
    scheduler: (run, delay) => {
      const entry = { at: clock.t + delay, run, canceled: false };
      queue.push(entry);
      return () => {
        entry.canceled = true;
      };
    },
  });
  return {
    service,
    clock,
    advance(ms) {
      clock.t += ms;
      for (const entry of queue.filter((item) => !item.canceled && item.at <= clock.t)) {
        entry.canceled = true;
        entry.run();
      }
    },
    pending: () => queue.filter((entry) => !entry.canceled).length,
  };
}

function sceneWithBox(service: StudioBg3dInferenceService): void {
  service.syncScene({ entities: [box("A", [0, 0.5, 0])] });
}

describe("서비스 수명과 스냅샷", () => {
  it("스냅샷은 변경이 없으면 같은 객체이고, 변경이 있으면 새 객체와 알림을 준다", () => {
    const { service } = createFixture();
    const first = service.getSnapshot();
    expect(service.getSnapshot()).toBe(first);
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    service.begin("measure", { referencePoint: [0, 0, 0] });
    expect(listener).toHaveBeenCalled();
    const second = service.getSnapshot();
    expect(second).not.toBe(first);
    expect(second.session.active).toBe(true);
    expect(second.version).toBeGreaterThan(first.version);
    unsubscribe();
    const calls = listener.mock.calls.length;
    service.end();
    expect(listener.mock.calls.length).toBe(calls);
  });

  it("begin 전에는 resolve가 null이고 키를 처리하지 않는다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    expect(service.resolve({ cursor: pointCursor([0.5, 1, 0.5]) })).toBeNull();
    expect(service.handleKey("key-down", { key: "ArrowRight" }).handled).toBe(false);
    expect(service.isActive()).toBe(false);
  });

  it("end는 핸들러와 기준점을 비우지만 마지막 안내문은 live region에 남긴다", () => {
    const { service } = createFixture();
    const cancel = vi.fn();
    service.begin("measure", { referencePoint: [0, 0, 0], handlers: { cancel } });
    service.handleKey("key-down", { key: "ArrowRight" });
    const spoken = service.getSnapshot().live.text;
    expect(spoken).toContain("X축 잠금");
    service.end();
    const after = service.getSnapshot();
    expect(after.session.active).toBe(false);
    expect(after.session.referencePoint).toBeNull();
    expect(after.live.text).toBe(spoken);
    service.begin("measure", { referencePoint: [0, 0, 0] });
    service.handleKey("key-down", { key: "Escape" });
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("도구 옵션 (keyboard·hud)", () => {
  it("keyboard:false 도구는 키보드 라우팅 대상이 아니고 hud:false 는 스냅샷에 반영된다", () => {
    const { service } = createFixture();
    expect(service.isKeyboardActive()).toBe(false);
    service.begin("move", { referencePoint: [0, 0, 0], keyboard: false, hud: false });
    expect(service.isActive()).toBe(true);
    expect(service.isKeyboardActive()).toBe(false);
    expect(service.getSnapshot().options).toEqual({ keyboard: false, hud: false });
    service.end();
    service.begin("measure", {});
    expect(service.isKeyboardActive()).toBe(true);
    expect(service.getSnapshot().options).toEqual({ keyboard: true, hud: true });
  });
});

describe("장면 동기화", () => {
  it("같은 장면이면 색인을 다시 만들지 않고, 달라지면 한 번만 다시 만든다", () => {
    const { service } = createFixture();
    const entities = [box("A", [0, 0.5, 0]), box("B", [3, 0.5, 0])];
    expect(service.syncScene({ entities })).toBe(true);
    expect(service.getSnapshot().scene.builds).toBe(1);
    expect(service.syncScene({ entities: entities.map((entity) => ({ ...entity })) })).toBe(false);
    expect(service.getSnapshot().scene.builds).toBe(1);
    expect(service.syncScene({ entities: [box("A", [0, 0.5, 0.25]), entities[1]!] })).toBe(true);
    expect(service.getSnapshot().scene.builds).toBe(2);
    expect(service.getSnapshot().scene.stats?.entities).toBe(2);
  });

  it("제외 출처를 바꾸면 색인이 달라지고 보이지 않는 객체는 후보에서 빠진다", () => {
    const { service } = createFixture();
    service.syncScene({ entities: [box("A", [0, 0.5, 0]), { ...box("H", [5, 0.5, 0]), visible: false }] });
    expect(service.getSnapshot().scene.stats?.skippedHidden).toBe(1);
    expect(service.syncScene({ entities: [box("A", [0, 0.5, 0])], excludeIds: new Set(["A"]) })).toBe(true);
    expect(service.listPickCandidates(50)).toHaveLength(0);
  });
});

describe("커서 해석과 점 치환", () => {
  it("모서리 근처 커서는 끝점이 되고 스냅샷·안내문에 반영된다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: [3, 0, 0] });
    const outcome = service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    expect(outcome?.ok).toBe(true);
    const snapshot = service.getSnapshot();
    expect(snapshot.session.lastResult?.kind).toBe("endpoint");
    expect(snapshot.measuredMeters).toBeCloseTo(Math.hypot(2.5, 1, 0.5), 6);
    expect(snapshot.live.text).toContain("끝점");
    expect(snapshot.live.text).toContain("길이");
  });

  it("같은 결과를 되풀이해도 상태를 바꾸지 않고 같은 안내를 반복해 읽지 않는다", () => {
    const { service, advance } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: [3, 0, 0] });
    service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    const first = service.getSnapshot();
    advance(100);
    service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    expect(service.getSnapshot()).toBe(first);
    expect(service.getSnapshot().live.seq).toBe(first.live.seq);
  });

  it("resolveFreshPoint는 방금 계산한 커서 근처의 원래 점만 추론 점으로 바꾼다", () => {
    const { service, advance } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: [3, 0, 0] });
    service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    const raw = [0.52, 1, 0.5] as const;
    const fresh = service.resolveFreshPoint(raw);
    expect(fresh.snapped).toBe(true);
    expect(fresh.point).toEqual([0.5, 1, 0.5]);
    expect(fresh.result?.kind).toBe("endpoint");
    // 커서에서 멀리 떨어진 점(다른 호출 경로)은 건드리지 않는다.
    const far = service.resolveFreshPoint([2, 0, 2]);
    expect(far.snapped).toBe(false);
    expect(far.point).toEqual([2, 0, 2]);
    // 오래된 결과는 쓰지 않는다.
    advance(2_000);
    expect(service.resolveFreshPoint(raw).snapped).toBe(false);
  });

  it("스냅이 없는 자유 위치는 원래 점을 그대로 돌려준다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: null });
    service.resolve({ cursor: pointCursor([7, 0, 7]) });
    expect(service.getResult()?.kind).toBe("free");
    expect(service.resolveFreshPoint([7, 0, 7])).toEqual({ point: [7, 0, 7], result: null, snapped: false });
  });

  it("잘못된 커서는 결과를 비우고 실패 결과를 돌려준다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: [3, 0, 0] });
    service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    const outcome = service.resolve({ cursor: pointCursor([Number.NaN, 0, 0]) });
    expect(outcome?.ok).toBe(false);
    expect(service.getResult()).toBeNull();
    expect(service.resolveFreshPoint([0.52, 1, 0.5]).snapped).toBe(false);
  });
});

describe("방향키·Shift·Esc", () => {
  it("→ 는 X축을 잠그고 커서가 어디에 있든 결과가 기준점의 X축 위에 놓인다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: [3, 0, 3] });
    expect(service.handleKey("key-down", { key: "ArrowRight" }).handled).toBe(true);
    expect(service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "x" });
    service.resolve({ cursor: pointCursor([5, 0, 8]) });
    const result = service.getResult();
    expect(result?.kind).toBe("axis");
    expect(result?.axis).toBe("x");
    expect(result?.point[2]).toBeCloseTo(3, 9);
    expect(result?.constraint).toEqual({ kind: "axis", axis: "x" });
    // 같은 키로 해제.
    service.handleKey("key-down", { key: "ArrowRight" });
    expect(service.getSnapshot().session.lock).toEqual({ kind: "none" });
  });

  it("← 는 Z축, ↑ 는 Y(높이)축을 잠근다 (장면 up 축 관례)", () => {
    const { service } = createFixture();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    service.handleKey("key-down", { key: "ArrowLeft" });
    expect(service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "z" });
    service.handleKey("key-down", { key: "ArrowUp" });
    expect(service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "y" });
    expect(service.getSnapshot().live.text).toContain("Y축 잠금");
    expect(service.getAxisRoles()).toEqual({ first: "x", second: "z", vertical: "y" });
  });

  it("Shift를 누르면 현재 추론을 유지하고 떼면 풀린다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: [3, 0, 0] });
    service.handleKey("key-down", { key: "ArrowRight" });
    service.resolve({ cursor: pointCursor([5, 0, 0.02]) });
    service.handleKey("key-down", { key: "Shift", shiftKey: true });
    expect(service.getSnapshot().session.hold?.kind).toBe("line");
    service.handleKey("key-up", { key: "Shift" });
    expect(service.getSnapshot().session.hold).toBeNull();
  });

  it("창 포커스 이탈로 modifier 상태를 초기화한다", () => {
    const { service } = createFixture();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    service.handleKey("key-down", { key: "Shift", shiftKey: true });
    expect(service.getSnapshot().session.shiftDown).toBe(true);
    service.resetModifiers();
    expect(service.getSnapshot().session.shiftDown).toBe(false);
    service.end();
    expect(() => service.resetModifiers()).not.toThrow();
  });

  it("Esc는 입력을 먼저 지우고, 다음에 취소 핸들러를 호출한다", () => {
    const { service } = createFixture();
    const cancel = vi.fn();
    service.begin("measure", { referencePoint: [0, 0, 0], handlers: { cancel } });
    service.setVcbText("2.4");
    service.handleKey("key-down", { key: "Escape" });
    expect(cancel).not.toHaveBeenCalled();
    expect(service.getVcbText()).toBe("");
    expect(service.handleKey("key-down", { key: "Escape" }).handled).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("↓ 는 평행·수직 추론이 없으면 안내만 하고 잠그지 않는다", () => {
    const { service } = createFixture();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    service.handleKey("key-down", { key: "ArrowDown" });
    expect(service.getSnapshot().session.lock).toEqual({ kind: "none" });
    expect(service.getSnapshot().live.text).toContain("평행·수직");
  });
});

describe("Alt 추론 일시 해제", () => {
  it("Alt를 누르는 동안은 끝점에 붙지 않고, 놓으면 다시 붙는다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: [3, 0, 0] });
    service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    expect(service.getResult()?.kind).toBe("endpoint");
    service.handleKey("key-down", { key: "Alt", altKey: true });
    service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    expect(service.getResult()?.kind).toBe("free");
    expect(service.resolveFreshPoint([0.52, 1, 0.5]).snapped).toBe(false);
    service.handleKey("key-up", { key: "Alt" });
    service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    expect(service.getResult()?.kind).toBe("endpoint");
  });

  it("축 잠금 중에는 Alt를 눌러도 사용자가 건 제약을 풀지 않는다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: [3, 0, 3] });
    service.handleKey("key-down", { key: "ArrowRight" });
    service.handleKey("key-down", { key: "Alt", altKey: true });
    service.resolve({ cursor: pointCursor([5, 0, 8]) });
    expect(service.getResult()?.kind).toBe("axis");
    expect(service.getResult()?.point[2]).toBeCloseTo(3, 9);
  });

  it("Alt를 누르고 뗄 때 일반(polite) 안내를 한다", () => {
    const { service } = createFixture();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    service.handleKey("key-down", { key: "Alt", altKey: true });
    expect(service.getSnapshot().live.text).toContain("추론 일시 해제");
    expect(service.getSnapshot().live.urgent).toBe(false);
  });
});

describe("길이 직접 입력(VCB)", () => {
  function setup() {
    const fixture = createFixture();
    const applied: StudioBg3dInferenceApplyLengthRequest[] = [];
    fixture.service.begin("wall", {
      referencePoint: [1, 0, 1],
      handlers: { applyLength: (request) => applied.push(request) },
    });
    return { ...fixture, applied };
  }

  it("축을 잠그고 2.4m를 입력해 Enter를 누르면 기준점에서 정확히 그 길이만큼 간다", () => {
    const { service, applied } = setup();
    service.handleKey("key-down", { key: "ArrowRight" });
    service.setVcbText("2.4m");
    expect(service.handleKey("key-down", { key: "Enter", fromVcb: true }).handled).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.meters).toBeCloseTo(2.4, 12);
    expect(applied[0]?.endPoint[0]).toBeCloseTo(3.4, 12);
    expect(applied[0]?.endPoint[1]).toBe(0);
    expect(applied[0]?.endPoint[2]).toBe(1);
    expect(service.getVcbText()).toBe("");
    expect(service.getSnapshot().live.text).toContain("길이");
  });

  it.each([
    ["80cm", 0.8],
    ["1200mm", 1.2],
    [`3'6"`, 1.0668],
  ])("%s 입력도 같은 방식으로 적용한다", (text, meters) => {
    const { service, applied } = setup();
    service.handleKey("key-down", { key: "ArrowUp" });
    service.setVcbText(text);
    service.submitVcb();
    expect(applied[0]?.meters).toBeCloseTo(meters, 9);
    expect(applied[0]?.endPoint[1]).toBeCloseTo(meters, 9);
  });

  it("음수 길이는 반대 방향으로 적용한다", () => {
    const { service, applied } = setup();
    service.handleKey("key-down", { key: "ArrowRight" });
    service.setVcbText("-2m");
    service.submitVcb();
    expect(applied[0]?.negative).toBe(true);
    expect(applied[0]?.endPoint[0]).toBeCloseTo(-1, 12);
  });

  it("잘못된 입력은 적용하지 않고 오류 이유를 스냅샷과 안내문에 남긴다", () => {
    const { service, applied } = setup();
    service.handleKey("key-down", { key: "ArrowRight" });
    service.setVcbText("abc");
    service.submitVcb();
    expect(applied).toHaveLength(0);
    const snapshot = service.getSnapshot();
    expect(snapshot.session.vcb.error).toBeTruthy();
    expect(snapshot.session.vcb.text).toBe("abc");
    expect(snapshot.live.text).toContain("입력 오류");
  });

  it("방향이 없으면(잠금도 커서 결과도 없음) 적용하지 않고 이유를 알린다", () => {
    const { service, applied } = setup();
    service.setVcbText("1m");
    service.submitVcb();
    expect(applied).toHaveLength(0);
    expect(service.getSnapshot().session.vcb.error).toContain("방향");
  });

  it("입력창 밖에서 숫자를 누르면 입력이 시작되고 입력창 포커스를 요청한다", () => {
    const { service } = setup();
    const focus = vi.fn();
    const unregister = service.registerVcbFocus(focus);
    expect(service.handleKey("key-down", { key: "2" }).handled).toBe(true);
    expect(service.getVcbText()).toBe("2");
    expect(focus).toHaveBeenCalledTimes(1);
    unregister();
    service.handleKey("key-down", { key: "Backspace" });
    expect(service.getVcbText()).toBe("");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("핸들러는 setHandlers로 바꿀 수 있다 (렌더마다 바뀌는 클로저 대응)", () => {
    const { service } = setup();
    const replaced = vi.fn();
    service.setHandlers({ applyLength: replaced });
    service.handleKey("key-down", { key: "ArrowRight" });
    service.setVcbText("1");
    service.submitVcb();
    expect(replaced).toHaveBeenCalledTimes(1);
  });
});

describe("스크린리더 안내", () => {
  it("잠금·오류 같은 긴급 안내는 즉시, 일반 추론 안내는 간격을 두고 마지막 것만 읽는다", () => {
    const { service, advance, pending } = createFixture();
    service.syncScene({ entities: [box("A", [0, 0.5, 0]), box("B", [4, 0.5, 0])] });
    service.begin("measure", { referencePoint: [2, 0, 0] });
    service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    const first = service.getSnapshot().live;
    expect(first.text).toContain("끝점");
    // 간격 안에서 다른 후보가 오면 보류한다.
    advance(100);
    service.resolve({ cursor: pointCursor([4.48, 1, 0.5]) });
    expect(service.getSnapshot().live.seq).toBe(first.seq);
    expect(pending()).toBe(1);
    // 긴급 안내는 보류하지 않고 바로 읽는다.
    service.handleKey("key-down", { key: "ArrowRight" });
    expect(service.getSnapshot().live.text).toContain("X축 잠금");
    expect(service.getSnapshot().live.urgent).toBe(true);
    // 보류 중이던 안내는 간격이 지난 뒤에 나온다.
    advance(600);
    expect(service.getSnapshot().live.seq).toBeGreaterThan(first.seq);
  });

  it("같은 문구의 긴급 안내가 반복돼도 번호가 증가해 다시 읽힌다", () => {
    const { service } = createFixture();
    service.begin("measure", { referencePoint: null });
    service.handleKey("key-down", { key: "ArrowRight" });
    const first = service.getSnapshot().live;
    service.handleKey("key-down", { key: "ArrowRight" });
    const second = service.getSnapshot().live;
    expect(second.text).toBe(first.text);
    expect(second.seq).toBeGreaterThan(first.seq);
  });

  it("자유 위치는 안내하지 않는다", () => {
    const { service } = createFixture();
    sceneWithBox(service);
    service.begin("measure", { referencePoint: null });
    service.resolve({ cursor: pointCursor([9, 0, 9]) });
    expect(service.getSnapshot().live.text).toBe("");
  });
});

describe("키보드 점 고르기", () => {
  it("가까운 순서로 후보를 나열하고 고른 점을 현재 결과로 만든다", () => {
    const { service } = createFixture();
    service.syncScene({ entities: [box("A", [0, 0.5, 0]), box("B", [10, 0.5, 0])] });
    service.begin("measure", { referencePoint: [0.5, 0, 0.5] });
    const candidates = service.listPickCandidates(6);
    expect(candidates).toHaveLength(6);
    expect(candidates[0]?.distanceMeters).toBeLessThanOrEqual(candidates[5]?.distanceMeters ?? 0);
    expect(candidates[0]?.sourceId).toBe("A");
    expect(candidates[0]?.label).toContain("상자 A");
    const first = candidates[0];
    expect(first).toBeDefined();
    if (!first) return;
    const picked = service.pickCandidate(first);
    expect(picked.point).toEqual(first.point);
    expect(service.getResult()).toBe(picked);
    expect(service.getSnapshot().live.text).toContain("선택");
    // 직접 고른 점은 커서 결과가 아니므로 클릭 치환에 쓰이지 않는다.
    expect(service.resolveFreshPoint(picked.point).snapped).toBe(false);
  });

  it("기준점이 없으면 설정한 초점(선택 객체)에서 가까운 후보를 보여 준다", () => {
    const { service } = createFixture();
    service.syncScene({ entities: [box("A", [0, 0.5, 0]), box("B", [10, 0.5, 0])] });
    service.begin("measure", {});
    service.setFocusPoint([10, 0.5, 0]);
    expect(service.listPickCandidates(3).every((candidate) => candidate.sourceId === "B")).toBe(true);
  });

  it("장면이 비어 있으면 빈 목록을 돌려준다", () => {
    const { service } = createFixture();
    service.begin("measure", {});
    expect(service.listPickCandidates()).toEqual([]);
  });
});

describe("외부 결과 게시와 기준 방향", () => {
  it("이동 스냅 계획 같은 외부 결과를 표시·안내용으로 게시한다", () => {
    const { service } = createFixture();
    service.begin("move", { referencePoint: [0, 0, 0] });
    service.publishResult({
      kind: "endpoint",
      point: [1, 0, 0],
      label: "끝점",
      detail: "상자 A · 꼭짓점",
      announcement: "끝점 — 상자 A · 꼭짓점",
      axis: null,
      direction: null,
      normal: null,
      sourceIds: ["A"],
      edgeId: null,
      alignmentOrigin: null,
      relation: null,
      guides: [],
      constraint: { kind: "none" },
      projected: false,
      approximate: false,
      distancePx: 2,
    });
    expect(service.getResult()?.kind).toBe("endpoint");
    expect(service.getSnapshot().live.text).toContain("끝점");
    service.publishResult(null);
    expect(service.getResult()).toBeNull();
  });

  it("호출자가 넘긴 기준 방향과 평행인 위치는 '평행' 추론이 된다", () => {
    const { service } = createFixture();
    service.begin("wall", { referencePoint: [0, 0, 0] });
    service.setReferenceDirections([{ id: "wall-1", label: "벽 1", direction: [1, 0, 1].map((v) => v / Math.SQRT2) as unknown as Vec }]);
    service.resolve({ cursor: pointCursor([3.02, 0, 3]) });
    expect(service.getResult()?.kind).toBe("parallel");
    expect(service.getResult()?.relation?.label).toBe("벽 1");
  });
});

describe("방 빌더 벽 그리기 시나리오 (공개 서비스만 사용)", () => {
  it("끝점에서 시작해 X축을 잠그고 3.2m를 입력하면 벽 끝점이 정확히 계산된다", () => {
    const { service } = createFixture();
    service.syncScene({ entities: [box("pillar", [0, 0.5, 0])] });
    const walls: Array<{ from: Vec; to: Vec }> = [];
    service.begin("wall", {
      handlers: {
        applyLength: (request) => walls.push({ from: request.reference, to: request.endPoint }),
      },
    });
    // 1) 기둥 모서리에 붙여 시작점을 잡는다.
    service.resolve({ cursor: pointCursor([0.53, 0, 0.5]) });
    const snap = service.resolveFreshPoint([0.53, 0, 0.5]);
    expect(snap.result?.kind).toBe("endpoint");
    service.setReference(snap.point);
    // 2) X축을 잠그고 길이를 입력한다.
    service.handleKey("key-down", { key: "ArrowRight" });
    service.setVcbText("3.2m");
    service.handleKey("key-down", { key: "Enter", fromVcb: true });
    expect(walls).toHaveLength(1);
    expect(walls[0]?.from).toEqual([0.5, 0, 0.5]);
    expect(walls[0]?.to[0]).toBeCloseTo(3.7, 12);
    expect(walls[0]?.to[1]).toBe(0);
    expect(walls[0]?.to[2]).toBe(0.5);
  });
});
