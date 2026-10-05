import { describe, expect, it } from "vitest";

import {
  STUDIO_COFFEE_BREW_MS,
  createInteractableRuntime,
  type StudioInteractableObjectKind,
  type StudioInteractableStateKey,
} from "./studio-virtual-space-interactable-objects";
import {
  STUDIO_OBJECT_REACTION_INDICATORS,
  STUDIO_OBJECT_REACTION_SPECS,
  objectReactionFrame,
} from "./studio-virtual-space-object-reaction";

function runtime(kind: StudioInteractableObjectKind, stateKey: StudioInteractableStateKey, changedAt: number) {
  return { ...createInteractableRuntime("obj-1", kind, changedAt), stateKey };
}

describe("오브젝트 상태 반응 표", () => {
  it("모든 상태 키에 반응 사양이 있고 배지 종류는 카탈로그 안에 있다", () => {
    const keys = Object.keys(STUDIO_OBJECT_REACTION_SPECS) as StudioInteractableStateKey[];
    expect(keys).toHaveLength(13);
    for (const key of keys) {
      const spec = STUDIO_OBJECT_REACTION_SPECS[key];
      expect(STUDIO_OBJECT_REACTION_INDICATORS).toContain(spec.indicator);
      if (spec.indicator === "none") expect(spec.label).toBeNull();
      else expect(spec.label).not.toBeNull();
    }
  });

  it("대기 상태(빈 의자·커피 대기)는 배지도 채널도 중립이다", () => {
    const chair = objectReactionFrame(runtime("chair", "chair:empty", 1000), 5000, false);
    expect(chair.indicator).toBe("none");
    expect(chair.label).toBeNull();
    expect(chair.settle).toBe(1);
    const coffee = objectReactionFrame(runtime("coffee-machine", "coffee:idle", 1000), 5000, false);
    expect(coffee.progress).toBe(0);
    expect(coffee.pulse).toBe(0);
  });
});

describe("종류별 반응 곡선", () => {
  it("문은 열리는 동안 swing이 ease-out으로 차오르고, 닫히는 동안 거꾸로 잦아든다", () => {
    const opening = runtime("door", "door:open", 1000);
    expect(objectReactionFrame(opening, 1000, false).swing).toBe(0);
    const mid = objectReactionFrame(opening, 1190, false).swing;
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
    expect(objectReactionFrame(opening, 1380, false).swing).toBe(1);
    expect(objectReactionFrame(opening, 9000, false).swing).toBe(1);
    const closing = runtime("door", "door:closed", 1000);
    expect(objectReactionFrame(closing, 1000, false).swing).toBe(1);
    expect(objectReactionFrame(closing, 1380, false).swing).toBe(0);
  });

  it("조명은 켜질 때 차오르고 꺼질 때 잦아들며 배지가 상태를 말한다", () => {
    const on = runtime("light-switch", "light:on", 0);
    expect(objectReactionFrame(on, 0, false).glow).toBe(0);
    expect(objectReactionFrame(on, 240, false).glow).toBe(1);
    expect(objectReactionFrame(on, 240, false).indicator).toBe("on");
    const off = runtime("light-switch", "light:off", 0);
    expect(objectReactionFrame(off, 0, false).glow).toBe(1);
    expect(objectReactionFrame(off, 240, false).glow).toBe(0);
    expect(objectReactionFrame(off, 240, false).indicator).toBe("none");
  });

  it("의자 안착은 앉는 순간 눌렸다 돌아오고 사용 중 배지가 붙는다", () => {
    const seated = runtime("chair", "chair:occupied", 1000);
    expect(objectReactionFrame(seated, 1000, false).settle).toBe(1);
    const dipped = objectReactionFrame(seated, 1160, false).settle;
    expect(dipped).toBeLessThan(1);
    expect(dipped).toBeGreaterThanOrEqual(0.95);
    expect(objectReactionFrame(seated, 1320, false).settle).toBe(1);
    expect(objectReactionFrame(seated, 1320, false).indicator).toBe("in-use");
  });

  it("커피 추출 진행은 추출 시간에 비례하고 준비 완료는 기존 맥동 곡선과 같다", () => {
    const brewing = runtime("coffee-machine", "coffee:brewing", 2000);
    expect(objectReactionFrame(brewing, 2000, false).progress).toBe(0);
    expect(objectReactionFrame(brewing, 2000 + STUDIO_COFFEE_BREW_MS / 2, false).progress).toBeCloseTo(0.5, 6);
    expect(objectReactionFrame(brewing, 2000 + STUDIO_COFFEE_BREW_MS * 2, false).progress).toBe(1);
    const ready = runtime("coffee-machine", "coffee:ready", 2000);
    const frame = objectReactionFrame(ready, 5260, false);
    expect(frame.indicator).toBe("ready");
    expect(frame.progress).toBe(1);
    // interaction-fx 손계산 곡선 0.45 + sin(t/260) * 0.25 와 동일해야 배선 교체가 무변화다.
    expect(frame.pulse).toBeCloseTo(0.45 + Math.sin(5260 / 260) * 0.25, 10);
    expect(objectReactionFrame(ready, 5260, true).pulse).toBe(0.6);
  });

  it("게시판은 안 읽으면 새 공지 맥동, 읽으면 한 번만 반사가 지나간다", () => {
    const unread = runtime("bulletin", "bulletin:unread", 0);
    const unreadFrame = objectReactionFrame(unread, 3000, false);
    expect(unreadFrame.indicator).toBe("attention");
    expect(unreadFrame.pulse).toBeGreaterThan(0);
    expect(unreadFrame.sweep).toBe(-1);
    const read = runtime("bulletin", "bulletin:read", 1000);
    expect(objectReactionFrame(read, 1000, false).sweep).toBe(0);
    expect(objectReactionFrame(read, 1450, false).sweep).toBeCloseTo(0.5, 6);
    expect(objectReactionFrame(read, 1900, false).sweep).toBe(-1);
    expect(objectReactionFrame(read, 1450, false).indicator).toBe("read");
  });

  it("미디어 보드는 열림 정도가 swing으로 표현된다", () => {
    const open = runtime("whiteboard", "media:open", 0);
    expect(objectReactionFrame(open, 0, false).swing).toBe(0);
    expect(objectReactionFrame(open, 300, false).swing).toBe(1);
    const closed = runtime("whiteboard", "media:closed", 0);
    expect(objectReactionFrame(closed, 300, false).swing).toBe(0);
  });

  it("모션 줄이기에서는 모든 전이가 최종값으로 즉시 수렴한다", () => {
    expect(objectReactionFrame(runtime("door", "door:open", 1000), 1000, true).swing).toBe(1);
    expect(objectReactionFrame(runtime("door", "door:closed", 1000), 1000, true).swing).toBe(0);
    expect(objectReactionFrame(runtime("light-switch", "light:on", 1000), 1000, true).glow).toBe(1);
    expect(objectReactionFrame(runtime("chair", "chair:occupied", 1000), 1100, true).settle).toBe(1);
    expect(objectReactionFrame(runtime("bulletin", "bulletin:read", 1000), 1100, true).sweep).toBe(-1);
    expect(objectReactionFrame(runtime("bulletin", "bulletin:unread", 1000), 1100, true).pulse).toBe(0.5);
  });

  it("시각이 상태 변경보다 이르거나 NaN이어도 안전하다", () => {
    const frame = objectReactionFrame(runtime("door", "door:open", 1000), 500, false);
    expect(frame.swing).toBe(0);
    const nan = objectReactionFrame(runtime("door", "door:open", 1000), Number.NaN, false);
    expect(nan.swing).toBe(0);
  });
});
