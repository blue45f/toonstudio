import { describe, expect, it } from "vitest";

import {
  requestStudioSpacePose,
  studioPoseSeatAnchors,
  studioSpacePoseBlend,
  STUDIO_POSE_SEAT_ANCHOR_RADIUS,
  STUDIO_SPACE_POSE_TRANSITION_MS,
  type StudioSeatAnchor,
} from "./studio-virtual-space-pose-controller";
import type { StudioSeatedActor } from "./studio-virtual-space-seated-actors";
import type { StudioWorldInteractionSlotDefinition } from "./studio-virtual-space-world-manifest";

const ANCHORS: readonly StudioSeatAnchor[] = [
  { point: { x: 100, y: 100 }, facing: "down", radius: 48 },
];

describe("requestStudioSpacePose", () => {
  it("의자 근처에서 휴식을 요청하면 앉기를 선택한다", () => {
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 120, y: 110 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 1000,
    });
    expect(result.accepted).toBe(true);
    expect(result.pose).toBe("sit");
    expect(result.anchor?.point).toEqual({ x: 100, y: 100 });
    expect(result.transitionStartedAt).toBe(1000);
  });

  it("빈 공간에서 휴식을 요청하면 눕기를 선택한다", () => {
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 500, y: 500 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 2000,
    });
    expect(result.accepted).toBe(true);
    expect(result.pose).toBe("lie");
    expect(result.anchor).toBeNull();
  });

  it("앉을 자리도 없고 빈 공간도 아니면 거부한다", () => {
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 500, y: 500 }, moving: false,
      seatAnchors: ANCHORS, openArea: false, now: 3000,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("no-suitable-spot");
    expect(result.pose).toBe("stand");
  });

  it("이동 중에는 자세 변경을 거부한다", () => {
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 120, y: 110 }, moving: true,
      seatAnchors: ANCHORS, openArea: true, now: 4000,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("moving");
  });

  it("일어서기는 이동 중이 아니면 항상 허용한다", () => {
    const fromSit = requestStudioSpacePose({
      current: "sit", request: "stand", position: { x: 120, y: 110 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 5000,
    });
    expect(fromSit.accepted).toBe(true);
    expect(fromSit.pose).toBe("stand");

    const already = requestStudioSpacePose({
      current: "stand", request: "stand", position: { x: 0, y: 0 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 5000,
    });
    expect(already.accepted).toBe(false);
    expect(already.reason).toBe("already-standing");
  });

  it("이미 휴식 중인데 휴식을 요청하면 거부한다", () => {
    const result = requestStudioSpacePose({
      current: "lie", request: "rest", position: { x: 500, y: 500 }, moving: false,
      seatAnchors: ANCHORS, openArea: true, now: 6000,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("already-resting");
  });
});

describe("studioPoseSeatAnchors", () => {
  const seated: readonly StudioSeatedActor[] = [
    { id: "peer-a", anchorPoint: { x: 320, y: 405 }, facing: "up" },
  ];
  const slot = (partial: Partial<StudioWorldInteractionSlotDefinition>): StudioWorldInteractionSlotDefinition => ({
    id: "slot-1", roomId: "room-1", labelKo: "자리", labelEn: "Seat",
    approachPoint: { x: 320, y: 432 }, anchorPoint: { x: 320, y: 432 },
    exitPoint: { x: 320, y: 460 }, facing: "up", radius: 10,
    ...partial,
  });

  it("리스 좌석과 매니페스트 가구 좌석을 하나의 앵커 목록으로 합친다", () => {
    const anchors = studioPoseSeatAnchors({
      seatedActors: seated,
      interactionSlots: [slot({ id: "slot-2", seatAttachmentPoint: { x: 550, y: 345 }, facing: "down" })],
    });
    expect(anchors).toEqual([
      { point: { x: 320, y: 405 }, facing: "up", radius: STUDIO_POSE_SEAT_ANCHOR_RADIUS },
      { point: { x: 550, y: 345 }, facing: "down", radius: STUDIO_POSE_SEAT_ANCHOR_RADIUS },
    ]);
  });

  it("앉을 자리가 없는 슬롯과 리스 좌석과 겹치는 슬롯은 제외한다", () => {
    const anchors = studioPoseSeatAnchors({
      seatedActors: seated,
      interactionSlots: [
        slot({ id: "no-seat" }),
        slot({ id: "same-seat", seatAttachmentPoint: { x: 324, y: 402 } }),
      ],
    });
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.point).toEqual({ x: 320, y: 405 });
  });

  it("합친 앵커로는 리스 없이도 가구 좌석에 앉을 수 있다", () => {
    const anchors = studioPoseSeatAnchors({
      seatedActors: [],
      interactionSlots: [slot({ seatAttachmentPoint: { x: 550, y: 345 }, facing: "down" })],
    });
    const result = requestStudioSpacePose({
      current: "stand", request: "rest", position: { x: 545, y: 380 }, moving: false,
      seatAnchors: anchors, openArea: false, now: 1000,
    });
    expect(result.accepted).toBe(true);
    expect(result.pose).toBe("sit");
    expect(result.anchor?.facing).toBe("down");
  });

  it("슬롯이 없어도 기존 리스 좌석 동작은 그대로다", () => {
    const anchors = studioPoseSeatAnchors({ seatedActors: seated });
    expect(anchors).toEqual([
      { point: { x: 320, y: 405 }, facing: "up", radius: STUDIO_POSE_SEAT_ANCHOR_RADIUS },
    ]);
  });
});

describe("studioSpacePoseBlend", () => {
  it("전이 시작 시 0, 종료 시 1을 반환한다", () => {
    expect(studioSpacePoseBlend(1000, 1000)).toBe(0);
    expect(studioSpacePoseBlend(1000, 1000 + STUDIO_SPACE_POSE_TRANSITION_MS)).toBe(1);
    expect(studioSpacePoseBlend(1000, 1000 + STUDIO_SPACE_POSE_TRANSITION_MS + 500)).toBe(1);
  });

  it("중간 진행도는 ease-in-out으로 0~1 사이", () => {
    const mid = studioSpacePoseBlend(0, STUDIO_SPACE_POSE_TRANSITION_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeCloseTo(0.5, 5);
  });

  it("전이 중이 아니면 1", () => {
    expect(studioSpacePoseBlend(null, 9999)).toBe(1);
  });
});
