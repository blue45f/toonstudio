import { describe, expect, it } from "vitest";

import {
  resolveInteractionSfx,
  shouldPlayInteractionSfx,
} from "./studio-interaction-sfx";

const base = {
  sfxEnabled: true,
  muted: false,
  reducedMotion: false,
  click: true,
  draw: true,
  drag: true,
};

describe("studio-interaction-sfx", () => {
  it("이벤트를 기존 효과음 이름으로 매핑한다", () => {
    expect(resolveInteractionSfx("click", base)).toBe("tick");
    expect(resolveInteractionSfx("tool-select", base)).toBe("tab");
    expect(resolveInteractionSfx("stroke-start", base)).toBe("tick");
    expect(resolveInteractionSfx("stroke-end", base)).toBe("pop");
    expect(resolveInteractionSfx("drag-start", base)).toBe("woosh");
    expect(resolveInteractionSfx("drop", base)).toBe("pop");
    expect(resolveInteractionSfx("drop-invalid", base)).toBe("error");
  });

  it("마스터 OFF·음소거·reduced-motion이면 무음이다", () => {
    expect(resolveInteractionSfx("click", { ...base, sfxEnabled: false })).toBeNull();
    expect(resolveInteractionSfx("click", { ...base, muted: true })).toBeNull();
    expect(resolveInteractionSfx("click", { ...base, reducedMotion: true })).toBeNull();
  });

  it("카테고리 토글이 꺼지면 해당 계열만 무음이다", () => {
    expect(resolveInteractionSfx("stroke-start", { ...base, draw: false })).toBeNull();
    expect(resolveInteractionSfx("click", { ...base, draw: false })).toBe("tick");
    expect(resolveInteractionSfx("drop", { ...base, drag: false })).toBeNull();
  });

  it("스로틀 간격 이내에는 재생하지 않는다", () => {
    expect(shouldPlayInteractionSfx("click", null, 1000)).toBe(true);
    expect(shouldPlayInteractionSfx("click", 1000, 1029)).toBe(false);
    expect(shouldPlayInteractionSfx("click", 1000, 1030)).toBe(true);
    expect(shouldPlayInteractionSfx("stroke-start", 1000, 1100)).toBe(false);
  });
});
