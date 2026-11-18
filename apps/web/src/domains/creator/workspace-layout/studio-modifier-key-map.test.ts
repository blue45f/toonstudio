import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODIFIER_KEY_CONFIG,
  advanceModifierKeyHold,
  createModifierKeyControllerState,
  cycleToolRotationSet,
  normalizeModifierKeyConfig,
  onModifierKeyDown,
  onModifierKeyUp,
  onModifierWindowBlur,
} from "./studio-modifier-key-map";

describe("studio-modifier-key-map — 스프링 로드 수식키 및 ToolRotationSet", () => {
  it("holdThresholdMs 이상 누르면 일시적으로 도구를 전환하고 keyup 시 직전 도구를 복원한다", () => {
    const config = normalizeModifierKeyConfig({ holdThresholdMs: 200 });
    let state = createModifierKeyControllerState("pen");

    state = onModifierKeyDown(state, config, { key: " ", code: "Space" }, 1000);
    expect(state.pressedKey).toBe("Space");
    expect(state.activeToolId).toBe("pen"); // 아직 200ms 전

    state = advanceModifierKeyHold(state, config, 1150);
    expect(state.activeToolId).toBe("pen");

    state = advanceModifierKeyHold(state, config, 1210);
    expect(state.isSpringActive).toBe(true);
    expect(state.activeToolId).toBe("pan"); // 손바닥 도구로 일시 전환됨

    state = onModifierKeyUp(state, config, { key: " ", code: "Space" }, 1450);
    expect(state.isSpringActive).toBe(false);
    expect(state.activeToolId).toBe("pen"); // 직전 펜 도구로 복원됨
  });

  it("holdThresholdMs 미만 짧은 탭은 ToolRotationSet을 순서대로 순환한다", () => {
    const config = DEFAULT_MODIFIER_KEY_CONFIG;
    let state = createModifierKeyControllerState("brush");

    // 1번째 탭(80ms < 200ms): brush -> pen
    state = onModifierKeyDown(state, config, { key: "b" }, 0);
    state = onModifierKeyUp(state, config, { key: "b" }, 80);
    expect(state.activeToolId).toBe("pen");

    // 2번째 탭(50ms < 200ms): pen -> pencil
    state = onModifierKeyDown(state, config, { key: "b" }, 200);
    state = onModifierKeyUp(state, config, { key: "b" }, 250);
    expect(state.activeToolId).toBe("pencil");

    // 3번째 길게 홀드(260ms >= 200ms): 일시적으로 brush로 갔다가 떼면 pencil로 복귀!
    state = onModifierKeyDown(state, config, { key: "b" }, 400);
    state = advanceModifierKeyHold(state, config, 620);
    expect(state.activeToolId).toBe("brush");
    state = onModifierKeyUp(state, config, { key: "b" }, 660);
    expect(state.activeToolId).toBe("pencil");

    expect(cycleToolRotationSet("pencil", ["brush", "pen", "pencil"])).toBe("brush");
  });

  it("event.repeat 및 한글 IME 조합 중(isComposing / keyCode 229) 입력은 철저히 무시한다", () => {
    const config = DEFAULT_MODIFIER_KEY_CONFIG;
    const initial = createModifierKeyControllerState("pen");

    expect(
      onModifierKeyDown(initial, config, { key: " ", repeat: true }, 100),
    ).toBe(initial);
    expect(
      onModifierKeyDown(initial, config, { key: "b", isComposing: true }, 100),
    ).toBe(initial);
    expect(
      onModifierKeyDown(initial, config, { key: "Process", keyCode: 229 }, 100),
    ).toBe(initial);
  });

  it("창 blur 이벤트 발생 시 스프링 로드 상태를 자동 해제하고 원래 도구로 되돌린다", () => {
    const config = DEFAULT_MODIFIER_KEY_CONFIG;
    let state = createModifierKeyControllerState("select");
    state = onModifierKeyDown(state, config, { key: "Alt" }, 10);
    state = advanceModifierKeyHold(state, config, 300);
    expect(state.activeToolId).toBe("eyedropper");

    const blurred = onModifierWindowBlur(state);
    expect(blurred.activeToolId).toBe("select");
    expect(blurred.pressedRuleId).toBeNull();
    expect(blurred.isSpringActive).toBe(false);
  });
});
