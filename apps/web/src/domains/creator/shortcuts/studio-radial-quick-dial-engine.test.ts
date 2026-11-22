import { describe, expect, it } from "vitest";

import {
  DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS,
  RADIAL_DIAL_CONTEXT_IDS,
  RADIAL_DIAL_CONTEXT_META,
  RADIAL_DIAL_DEFAULT_DEADZONE_PX,
  RADIAL_DIAL_DIRECTIONS,
  assignRadialDialContextSlot,
  buildRadialDialSlotsForContext,
  buildRadialDialWedgePath,
  clampRadialDialCenter,
  cloneDefaultRadialDialContextSlots,
  computeRadialDialSectorPoint,
  createInitialRadialDialGestureState,
  inferRadialDialContext,
  reduceRadialDialGesture,
  resolveRadialDialSector,
  shortestAngleDiffDeg,
  stepRadialDialKeyboardSelection,
} from "./studio-radial-quick-dial-engine";

describe("studio-radial-quick-dial-engine", () => {
  it("8방위(N·NE·E·SE·S·SW·W·NW) 이동 벡터를 12시 기준 시계방향 45° 섹터로 정확히 판정한다", () => {
    const origin = { x: 200, y: 200 };
    const radius = 48;
    const expectedAngles = [0, 45, 90, 135, 180, 225, 270, 315];

    expectedAngles.forEach((deg, idx) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      const pointer = {
        x: origin.x + Math.cos(rad) * radius,
        y: origin.y + Math.sin(rad) * radius,
      };
      const result = resolveRadialDialSector(origin, pointer);
      expect(result.inDeadzone).toBe(false);
      expect(result.activeIndex).toBe(idx);
      expect(result.direction).toBe(RADIAL_DIAL_DIRECTIONS[idx]);
      expect(result.distancePx).toBeCloseTo(radius, 1);
    });
  });

  it("기본 18px 데드존 안쪽 이동은 선택하지 않고, 18px 이상 이동 시 선택되며 반경 히스테리시스로 떨림을 막는다", () => {
    const origin = { x: 100, y: 100 };

    // 17.9px 이동 → 데드존 내부(미선택)
    const inside = resolveRadialDialSector(origin, { x: 100, y: 100 - (RADIAL_DIAL_DEFAULT_DEADZONE_PX - 0.5) });
    expect(inside.inDeadzone).toBe(true);
    expect(inside.activeIndex).toBeNull();

    // 18px 이동 → 북쪽(0번) 선택
    const entered = resolveRadialDialSector(origin, { x: 100, y: 100 - RADIAL_DIAL_DEFAULT_DEADZONE_PX });
    expect(entered.inDeadzone).toBe(false);
    expect(entered.activeIndex).toBe(0);
    expect(entered.direction).toBe("N");

    // 이미 선택된 상태에서 15px로 살짝 후퇴 → exitDeadzone(14px) 이상이므로 선택 유지
    const heldNearEdge = resolveRadialDialSector(
      origin,
      { x: 100, y: 100 - 15 },
      { previousIndex: 0 },
    );
    expect(heldNearEdge.inDeadzone).toBe(false);
    expect(heldNearEdge.activeIndex).toBe(0);

    // 13px까지 중심 복귀 → 취소(미선택)
    const exited = resolveRadialDialSector(
      origin,
      { x: 100, y: 100 - 13 },
      { previousIndex: 0 },
    );
    expect(exited.inDeadzone).toBe(true);
    expect(exited.activeIndex).toBeNull();
  });

  it("섹터 경계선(22.5°) 부근 포인터 미세 떨림을 ±5° 히스테리시스로 안정화한다", () => {
    const origin = { x: 300, y: 300 };
    const radius = 60;
    const atDeg = (deg: number) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return { x: origin.x + Math.cos(rad) * radius, y: origin.y + Math.sin(rad) * radius };
    };

    // N(0°) 선택 상태에서 경계(22.5°)를 약간 넘은 25°로 흔들려도 N 유지
    const jittered = resolveRadialDialSector(origin, atDeg(25), { previousIndex: 0 });
    expect(jittered.activeIndex).toBe(0);
    expect(jittered.stabilizedByHysteresis).toBe(true);

    // 22.5° + 5° = 27.5°를 넘은 29°까지 이동하면 NE(1번)로 자연 전환
    const switched = resolveRadialDialSector(origin, atDeg(29), { previousIndex: 0 });
    expect(switched.activeIndex).toBe(1);
    expect(switched.direction).toBe("NE");
    expect(switched.stabilizedByHysteresis).toBe(false);

    // 0°/360° 경계(NW 315° ↔ N 0°) 래핑 구간에서도 동일하게 안정화
    expect(shortestAngleDiffDeg(358, 2)).toBe(4);
    const wrapJitter = resolveRadialDialSector(origin, atDeg(335), { previousIndex: 0 });
    expect(wrapJitter.activeIndex).toBe(0);
    expect(wrapJitter.stabilizedByHysteresis).toBe(true);
  });

  it("비정상 좌표(NaN·Infinity)와 포인터 제스처 리듀서 생명주기(start→move→commit/cancel)를 안전하게 처리한다", () => {
    const bad = resolveRadialDialSector({ x: Number.NaN, y: 100 }, { x: 120, y: 100 });
    expect(bad.activeIndex).toBeNull();
    expect(bad.inDeadzone).toBe(true);

    let state = createInitialRadialDialGestureState();
    state = reduceRadialDialGesture(state, { type: "start", origin: { x: 200, y: 200 } });
    expect(state.open).toBe(true);
    expect(state.dragging).toBe(true);

    state = reduceRadialDialGesture(state, { type: "move", pointer: { x: 250, y: 200 } });
    expect(state.activeIndex).toBe(2); // E

    state = reduceRadialDialGesture(state, { type: "commit", pointer: { x: 250, y: 200 } });
    expect(state.open).toBe(false);
    expect(state.committedIndex).toBe(2);

    const cancelled = reduceRadialDialGesture(
      reduceRadialDialGesture(createInitialRadialDialGestureState(), {
        type: "start",
        origin: { x: 100, y: 100 },
      }),
      { type: "cancel" },
    );
    expect(cancelled.open).toBe(false);
    expect(cancelled.committedIndex).toBeNull();
  });

  it("키보드 탐색(1~8·화살표·Home/End·Enter·Esc)과 기하·클램프 헬퍼가 결정적으로 동작한다", () => {
    expect(stepRadialDialKeyboardSelection(null, "ArrowRight")).toEqual({ kind: "highlight", index: 0 });
    expect(stepRadialDialKeyboardSelection(7, "ArrowDown")).toEqual({ kind: "highlight", index: 0 });
    expect(stepRadialDialKeyboardSelection(0, "ArrowLeft")).toEqual({ kind: "highlight", index: 7 });
    expect(stepRadialDialKeyboardSelection(3, "Home")).toEqual({ kind: "highlight", index: 0 });
    expect(stepRadialDialKeyboardSelection(3, "End")).toEqual({ kind: "highlight", index: 7 });
    expect(stepRadialDialKeyboardSelection(null, "8")).toEqual({ kind: "select", index: 7 });
    expect(stepRadialDialKeyboardSelection(4, "Enter")).toEqual({ kind: "select", index: 4 });
    expect(stepRadialDialKeyboardSelection(4, " ")).toEqual({ kind: "select", index: 4 });
    expect(stepRadialDialKeyboardSelection(null, "Enter")).toEqual({ kind: "noop" });
    expect(stepRadialDialKeyboardSelection(2, "Escape")).toEqual({ kind: "close" });

    const northPoint = computeRadialDialSectorPoint(0, { x: 124, y: 124 }, 86);
    expect(northPoint).toEqual({ x: 124, y: 38 });
    expect(buildRadialDialWedgePath(0, { x: 124, y: 124 }, 22, 118)).toContain("M ");

    const mobileClamped = clampRadialDialCenter({ x: 5, y: 10 }, { width: 320, height: 640 }, 248);
    expect(mobileClamped.scale).toBeLessThan(1);
    expect(mobileClamped.x).toBeGreaterThan(80);
    expect(mobileClamped.y).toBeGreaterThan(80);
  });

  it("5개 작업 상황(drawing·inking·bg3d·lettering·review)마다 8개 고유 액션 프리셋과 자동 추론·슬롯 교체를 지원한다", () => {
    for (const ctxId of RADIAL_DIAL_CONTEXT_IDS) {
      expect(RADIAL_DIAL_CONTEXT_META[ctxId].labelKo.length).toBeGreaterThan(0);
      const defaults = DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS[ctxId];
      expect(defaults).toHaveLength(8);
      expect(new Set(defaults).size).toBe(8);

      const slots = buildRadialDialSlotsForContext(ctxId);
      expect(slots).toHaveLength(8);
      expect(slots.map((s) => s.direction)).toEqual([...RADIAL_DIAL_DIRECTIONS]);
      expect(slots.map((s) => s.shortcutKey)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    }

    expect(inferRadialDialContext({ activeSurfaceReviewLocked: true })).toBe("review");
    expect(inferRadialDialContext({ tool: "comment" })).toBe("review");
    expect(inferRadialDialContext({ bg3dOpen: true })).toBe("bg3d");
    expect(inferRadialDialContext({ tool: "text" })).toBe("lettering");
    expect(inferRadialDialContext({ tool: "draw", drawMode: "pen", stabilizer: 2 })).toBe("inking");
    expect(inferRadialDialContext({ tool: "draw", drawMode: "pen", activeBrushName: "G펜" })).toBe("inking");
    expect(inferRadialDialContext({ tool: "draw", drawMode: "pen", stabilizer: 0 })).toBe("drawing");

    const baseSlots = cloneDefaultRadialDialContextSlots();
    const updated = assignRadialDialContextSlot(baseSlots, "drawing", 2, "cycle-stabilizer");
    expect(updated.drawing[2]).toBe("cycle-stabilizer");
    expect(baseSlots.drawing[2]).toBe("tool-fill"); // 불변성 보장
  });
});
