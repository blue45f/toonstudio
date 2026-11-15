// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createPaletteImeController, isImeKeyboardEvent } from "./palette-ime-guard";

describe("palette-ime-guard (순수 한글 IME 조합·단일 실행 제어기)", () => {
  it("표준 isComposing, keyCode 229, compositionend 동일 틱 Enter/Esc, repeat Enter를 정확히 식별한다", () => {
    expect(isImeKeyboardEvent({ key: "Enter", isComposing: true })).toBe(true);
    expect(isImeKeyboardEvent({ key: "Enter", isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeKeyboardEvent({ key: "Process" })).toBe(true);
    expect(isImeKeyboardEvent({ key: "Enter", isComposing: false, keyCode: 13 })).toBe(false);

    const guard = createPaletteImeController();
    guard.onCompositionStart();
    expect(guard.shouldIgnoreKeyDown({ key: "Enter", keyCode: 13 })).toBe(true);
    guard.onCompositionEnd();
    // WebKit/macOS: compositionend 직후 같은 틱에 들어오는 확정용 Enter 1회는 조합 완료로 흡수한다.
    expect(guard.shouldIgnoreKeyDown({ key: "Enter", keyCode: 13 })).toBe(true);
    // 조합 완료 직후 실제 명령 선택용 Enter는 통과한다.
    expect(guard.shouldIgnoreKeyDown({ key: "Enter", keyCode: 13 })).toBe(false);
    // 키 길게 누름(repeat)은 차단한다.
    expect(guard.shouldIgnoreKeyDown({ key: "Enter", keyCode: 13, repeat: true })).toBe(true);

    expect(guard.claimExecution()).toBe(true);
    expect(guard.claimExecution()).toBe(false);
    guard.reset();
    expect(guard.claimExecution()).toBe(true);
  });
});
