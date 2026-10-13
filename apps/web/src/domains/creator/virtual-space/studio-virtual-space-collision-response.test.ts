import { describe, expect, it } from "vitest";

import {
  STUDIO_COLLISION_BOUNCE_COOLDOWN_MS,
  STUDIO_COLLISION_BOUNCE_MIN_IMPACT_PX_S,
  StudioCollisionResponder,
  studioCollisionContact,
  type StudioCollisionContact,
  type StudioCollisionResponseInput,
} from "./studio-virtual-space-collision-response";

const NONE: StudioCollisionContact = { left: false, right: false, up: false, down: false };
const LEFT: StudioCollisionContact = { left: true, right: false, up: false, down: false };

function input(overrides: Partial<StudioCollisionResponseInput> = {}): StudioCollisionResponseInput {
  return {
    velocity: { x: -200, y: 0 },
    contact: LEFT,
    maxSpeed: 205,
    reducedMotion: false,
    effectsSuppressed: false,
    ...overrides,
  };
}

describe("studioCollisionContact", () => {
  it("blocked와 touching을 축별로 합친다", () => {
    expect(studioCollisionContact(
      { left: true, right: false, up: false, down: false },
      { left: false, right: false, up: true, down: false },
    )).toEqual({ left: true, right: false, up: true, down: false });
    expect(studioCollisionContact(NONE, NONE)).toEqual(NONE);
  });
});

describe("충돌 반발 판정기", () => {
  it("벽에 처음 닿은 프레임에만 법선 반사 반발을 돌려준다", () => {
    const responder = new StudioCollisionResponder();
    const bounce = responder.sample(input(), 1_000);
    expect(bounce).not.toBeNull();
    // 법선(+x) 성분은 되돌아오고(양수) 세기는 반발 계수만큼 줄어든다.
    expect(bounce!.x).toBeCloseTo(200 * 0.35, 5);
    expect(bounce!.y).toBe(0);
    // 접촉이 유지되는 동안에는 다시 발동하지 않는다.
    expect(responder.sample(input(), 1_016)).toBeNull();
    expect(responder.sample(input(), 1_032)).toBeNull();
  });

  it("접촉이 풀렸다가 쿨다운 뒤 다시 부딪히면 다시 반발한다", () => {
    const responder = new StudioCollisionResponder();
    expect(responder.sample(input(), 0)).not.toBeNull();
    expect(responder.sample(input({ contact: NONE }), 100)).toBeNull();
    // 쿨다운 안의 재접촉은 반발이 겹치지 않게 막는다.
    expect(responder.sample(input(), 150)).toBeNull();
    expect(responder.sample(input({ contact: NONE }), 300)).toBeNull();
    expect(responder.sample(input(), 300 + STUDIO_COLLISION_BOUNCE_COOLDOWN_MS)).not.toBeNull();
  });

  it("천천히 기대는 접촉(최소 충격 미만)은 튀지 않는다", () => {
    const responder = new StudioCollisionResponder();
    const slow = STUDIO_COLLISION_BOUNCE_MIN_IMPACT_PX_S - 1;
    expect(responder.sample(input({ velocity: { x: -slow, y: 0 } }), 0)).toBeNull();
  });

  it("접선 속도는 마찰로 줄고, 코너에서는 파고드는 성분이 큰 축을 쓴다", () => {
    const responder = new StudioCollisionResponder();
    const bounce = responder.sample(input({
      velocity: { x: -120, y: 260 },
      contact: { left: true, right: false, up: false, down: true },
      maxSpeed: 400,
    }), 0);
    expect(bounce).not.toBeNull();
    // 아래쪽 성분(260)이 왼쪽 성분(120)보다 크므로 법선은 위(0,-1)다.
    expect(bounce!.y).toBeCloseTo(-260 * 0.35, 5);
    expect(bounce!.x).toBeCloseTo(-120 * 0.85, 5);
  });

  it("반발 속도는 최고 속도의 상한을 넘지 않는다", () => {
    const responder = new StudioCollisionResponder();
    const bounce = responder.sample(input({
      velocity: { x: -600, y: 0 },
      maxSpeed: 205,
    }), 0);
    expect(bounce).not.toBeNull();
    expect(Math.hypot(bounce!.x, bounce!.y)).toBeCloseTo(205 * 0.4, 5);
  });

  it("모션 줄이기·효과 억제에서는 반발하지 않고, reset 뒤에는 접촉 이력이 사라진다", () => {
    const responder = new StudioCollisionResponder();
    expect(responder.sample(input({ reducedMotion: true }), 0)).toBeNull();
    expect(responder.sample(input({ effectsSuppressed: true }), 0)).toBeNull();
    const other = new StudioCollisionResponder();
    expect(other.sample(input(), 0)).not.toBeNull();
    other.reset();
    // reset 전 쿨다운이 남아 있어도 이력이 사라져 새 접촉으로 판정한다.
    expect(other.sample(input(), 10)).not.toBeNull();
  });
});
