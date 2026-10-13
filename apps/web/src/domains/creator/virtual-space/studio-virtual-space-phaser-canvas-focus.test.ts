import { describe, expect, it } from "vitest";

import {
  WORLD_FOCUS_RECLAIM_CODES,
  WORLD_KEY_CODES,
  studioWorldShouldReclaimFocus,
} from "./studio-virtual-space-phaser-canvas-model";

const body = { name: "body" };
const documentElement = { name: "html" };
const root = { body, documentElement };
const reclaim = (overrides: Partial<Parameters<typeof studioWorldShouldReclaimFocus>[0]> = {}) =>
  studioWorldShouldReclaimFocus({ active: body, root, code: "KeyD", modified: false, composing: false, blocked: false, ...overrides });

describe("초점을 잃은 월드의 이동 키 복구 판정", () => {
  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"])(
    "닫은 배너처럼 초점이 있던 요소가 사라져 <body>에 초점이 떨어졌으면 %s를 월드가 받는다", (code) => {
      expect(reclaim({ code })).toBe(true);
    });

  it("초점이 <html>이나 null이어도 아무 요소에도 초점이 없는 것으로 본다", () => {
    expect(reclaim({ active: documentElement })).toBe(true);
    expect(reclaim({ active: null })).toBe(true);
  });

  it("버튼·입력 칸·패널 등 다른 요소에 초점이 있으면 건드리지 않는다", () => {
    expect(reclaim({ active: { name: "button" } })).toBe(false);
    expect(reclaim({ active: { name: "input" } })).toBe(false);
  });

  it("대화상자·입력 칸·숨은 탭처럼 입력이 막힌 상태이거나 조합 입력·수정 키가 눌렸으면 건드리지 않는다", () => {
    expect(reclaim({ blocked: true })).toBe(false);
    expect(reclaim({ composing: true })).toBe(false);
    expect(reclaim({ modified: true })).toBe(false);
  });

  it.each(["ShiftLeft", "ShiftRight", "KeyX", "KeyG", "KeyE", "KeyM", "Digit1", "Enter", "Space", "Tab", "Escape"])(
    "이동 키가 아닌 %s로는 초점을 가져오지 않는다", (code) => {
      expect(reclaim({ code })).toBe(false);
    });

  it("복구하는 키는 모두 월드가 처리하는 키여야 한다(초점만 가져가고 키를 놓치면 안 된다)", () => {
    for (const code of WORLD_FOCUS_RECLAIM_CODES) expect(WORLD_KEY_CODES.has(code), code).toBe(true);
  });
});
