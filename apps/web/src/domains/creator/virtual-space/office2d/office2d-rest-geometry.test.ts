import { describe, expect, it } from "vitest";

import { OFFICE2D_ACTOR_HEIGHT, office2dActorFoot, office2dActorHeadY, office2dActorRestTransform } from "./office2d-actor-geometry";
import { createOffice2dActor } from "./office2d-actors";

describe("기존 정지 시트의 눕기 표시 폴백", () => {
  it("논리 발 위치를 유지하면서 그림을 바닥 중심에 눕히고 이름표 높이를 맞춘다", () => {
    const actor = createOffice2dActor({ id: "me", kind: "self", character: "artist", accent: "#123456", name: "작가", x: 200, y: 300, now: 0 });
    const standingHead = office2dActorHeadY(actor);
    actor.pose = "lie";
    const transform = office2dActorRestTransform(actor);
    expect(office2dActorFoot(actor)).toEqual({ x: 200, y: 300 });
    expect(transform.tiltRad).toBe(Math.PI / 2);
    expect(transform.offsetX).toBeCloseTo(-OFFICE2D_ACTOR_HEIGHT * 188 / 192 / 2);
    expect(office2dActorHeadY(actor)).toBeGreaterThan(standingHead);
    expect(office2dActorHeadY(actor)).toBeLessThan(300 - OFFICE2D_ACTOR_HEIGHT / 2);
    actor.moving = true;
    expect(office2dActorRestTransform(actor)).toEqual({ offsetX: 0, offsetY: 0, tiltRad: 0 });
  });
});
