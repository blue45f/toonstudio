import { describe, expect, it } from "vitest";

import {
  studioBuildPlacementGhostFrame,
  studioBuildPlacementRejectionText,
  studioBuildPlacementVerdict,
} from "./studio-virtual-space-build-placement";
import {
  studioPlacedFixturePointNear,
  STUDIO_PLACED_FIXTURE_LIMIT,
} from "./studio-virtual-space-placed-fixtures";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldSpawn,
} from "./studio-virtual-space-world-manifest";

const world = DEFAULT_STUDIO_WORLD_MANIFEST;
const spawn = studioWorldSpawn(world).point;
// 자동 탐색이 실제로 골라 주는 지점 — 직접 배치 판정도 같은 규칙으로 ok여야 한다.
const freePoint = studioPlacedFixturePointNear(world, [], spawn)!;
const LAMP = "furniture:floor-lamp";

describe("studioBuildPlacementVerdict", () => {
  it("자동 탐색이 고른 빈 지점은 직접 배치도 가능하다", () => {
    const verdict = studioBuildPlacementVerdict({ world, entryId: LAMP, point: freePoint, occupied: [], placedCount: 0 });
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBeNull();
    expect(verdict.point).toEqual(freePoint);
  });

  it("찍은 지점을 16px 격자에 스냅한다", () => {
    const verdict = studioBuildPlacementVerdict({
      world, entryId: LAMP, point: { x: freePoint.x + 3, y: freePoint.y + 5 }, occupied: [], placedCount: 0,
    });
    expect(verdict.point.x % 16).toBe(0);
    expect(verdict.point.y % 16).toBe(0);
  });

  it("상한에 닿으면 limit로 거부한다", () => {
    const verdict = studioBuildPlacementVerdict({
      world, entryId: LAMP, point: freePoint, occupied: [], placedCount: STUDIO_PLACED_FIXTURE_LIMIT,
    });
    expect(verdict).toMatchObject({ ok: false, reason: "limit" });
  });

  it("월드 가장자리면 bounds로 거부한다", () => {
    const verdict = studioBuildPlacementVerdict({ world, entryId: LAMP, point: { x: 2, y: 2 }, occupied: [], placedCount: 0 });
    expect(verdict).toMatchObject({ ok: false, reason: "bounds" });
  });

  it("이미 놓인 지점과 32px보다 가까우면 occupied로 거부한다", () => {
    const verdict = studioBuildPlacementVerdict({
      world, entryId: LAMP, point: { x: freePoint.x + 16, y: freePoint.y }, occupied: [freePoint], placedCount: 1,
    });
    expect(verdict).toMatchObject({ ok: false, reason: "occupied" });
  });

  it("고정물 충돌 지점이면 access로 거부한다", () => {
    // 에셋 아카이브 터미널 충돌 상자 안쪽 지점.
    const verdict = studioBuildPlacementVerdict({ world, entryId: LAMP, point: { x: 176, y: 128 }, occupied: [], placedCount: 0 });
    expect(verdict).toMatchObject({ ok: false, reason: "access" });
  });

  it("고정물 층에 못 놓는 가구(커피 머신)는 invalid로 거부한다", () => {
    const verdict = studioBuildPlacementVerdict({
      world, entryId: "furniture:coffee-machine", point: freePoint, occupied: [], placedCount: 0,
    });
    expect(verdict).toMatchObject({ ok: false, reason: "invalid" });
  });

});

describe("studioBuildPlacementGhostFrame", () => {
  it("가능 지점에서는 대표 상태(켜짐) 반응 프레임을 그대로 쓴다", () => {
    const frame = studioBuildPlacementGhostFrame({ entryId: LAMP, ok: true, now: 1_000, reducedMotion: false });
    expect(frame.valid).toBe(true);
    expect(frame.kind).toBe("light-switch");
    expect(frame.shakeX).toBe(0);
    expect(frame.reaction?.label).toEqual({ ko: "● 켜짐", en: "● On" });
    expect(frame.reaction?.glow).toBeGreaterThan(0);
  });

  it("불가 지점에서는 꺼진 counterpart 프레임과 흔들림으로 바뀐다", () => {
    const frame = studioBuildPlacementGhostFrame({ entryId: LAMP, ok: false, now: 1_000, reducedMotion: false });
    expect(frame.valid).toBe(false);
    expect(frame.reaction?.glow).toBe(0);
    expect(frame.reaction?.label).toBeNull();
    expect(frame.shakeX).toBeCloseTo(Math.sin(1_000 / 40) * 2);
  });

  it("미디어 보드의 불가 프레임은 닫힘(swing 0)이다", () => {
    const frame = studioBuildPlacementGhostFrame({ entryId: "furniture:whiteboard", ok: false, now: 500, reducedMotion: false });
    expect(frame.kind).toBe("whiteboard");
    expect(frame.reaction?.swing).toBe(0);
    const open = studioBuildPlacementGhostFrame({ entryId: "furniture:whiteboard", ok: true, now: 500, reducedMotion: false });
    expect(open.reaction?.swing).toBe(1);
  });

  it("모션 줄이기에서는 불가여도 흔들리지 않는다", () => {
    const frame = studioBuildPlacementGhostFrame({ entryId: LAMP, ok: false, now: 1_000, reducedMotion: true });
    expect(frame.shakeX).toBe(0);
  });

  it("모르는 항목은 반응 없이 유효성만 전한다", () => {
    const frame = studioBuildPlacementGhostFrame({ entryId: "furniture:unknown", ok: false, now: 0, reducedMotion: false });
    expect(frame.kind).toBeNull();
    expect(frame.reaction).toBeNull();
  });
});

describe("studioBuildPlacementRejectionText", () => {
  it("이유마다 양쪽 언어로 안내한다", () => {
    for (const reason of ["bounds", "occupied", "access", "limit", "invalid"] as const) {
      const text = studioBuildPlacementRejectionText(reason);
      expect(text.ko.length).toBeGreaterThan(0);
      expect(text.en.length).toBeGreaterThan(0);
    }
    expect(studioBuildPlacementRejectionText("limit").ko).toContain(String(STUDIO_PLACED_FIXTURE_LIMIT));
  });
});
