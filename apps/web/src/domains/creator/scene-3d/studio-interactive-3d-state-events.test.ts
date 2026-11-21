import { describe, expect, it } from "vitest";

import {
  deserializeInteractive3dBlueprint,
  INTERACTIVE_3D_STATE_SCHEMA_VERSION,
  Interactive3dStateMachine,
  serializeInteractive3dBlueprint,
  type Interactive3dSceneBlueprint,
} from "./studio-interactive-3d-state-events";

function createDemoBlueprint(): Interactive3dSceneBlueprint {
  return {
    version: INTERACTIVE_3D_STATE_SCHEMA_VERSION,
    entities: [
      {
        id: "hero-mascot",
        kind: "object",
        baseState: {
          id: "base",
          label: "기본 상태",
          transform: { position: [0, 1.0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1] },
          surface: { opacity: 1, roughness: 0.6, metalness: 0, toonSteps: 3, matcapId: "clay-warm" },
        },
        variantStates: [
          {
            id: "hover",
            label: "호버 상승",
            transform: { position: [0, 1.5, 0], rotationEuler: [0, 0.2, 0], scale: [1.15, 1.15, 1.15] },
            surface: { roughness: 0.35, matcapId: "clay-gloss" },
          },
          {
            id: "drop",
            label: "바닥 낙하",
            transform: { position: [0, 0.0, 0], rotationEuler: [0, 0, 0], scale: [1, 0.9, 1] },
          },
        ],
        spring: { stiffness: 260, damping: 8, mass: 1, bouncePlaneY: 0.0, restitution: 0.6 },
      },
      {
        id: "key-light",
        kind: "light",
        baseState: {
          id: "day",
          label: "주간 조명",
          transform: { position: [2, 4, 2], rotationEuler: [0, 0, 0], scale: [1, 1, 1] },
          light: { intensity: 1.0, colorTempK: 5800 },
        },
        variantStates: [
          {
            id: "sunset",
            label: "노을 조명",
            transform: { position: [-2, 2, 1], rotationEuler: [0, 0, 0], scale: [1, 1, 1] },
            light: { intensity: 1.8, colorTempK: 3200 },
          },
        ],
        spring: { stiffness: 180, damping: 24, mass: 1 },
      },
    ],
    triggers: [
      {
        id: "tr-hover",
        kind: "onPointerHover",
        entityId: "hero-mascot",
        hoverStateId: "hover",
        restStateId: "base",
      },
      {
        id: "tr-click",
        kind: "onClick",
        entityId: "hero-mascot",
        mode: "toggle",
        stateIds: ["drop", "base"],
      },
      {
        id: "tr-look",
        kind: "onCursorLookAt",
        entityId: "hero-mascot",
        maxYawRad: 0.45,
        maxPitchRad: 0.25,
      },
      {
        id: "tr-scroll-light",
        kind: "onScrollRatio",
        entityId: "key-light",
        startRatio: 0.2,
        endRatio: 0.8,
        fromStateId: "day",
        toStateId: "sunset",
      },
    ],
  };
}

describe("studio-interactive-3d-state-events", () => {
  it("호버·커서 시선 추적·스크롤 연속 보간이 스프링 물리로 부드럽게 수렴한다", () => {
    const bp = deserializeInteractive3dBlueprint(serializeInteractive3dBlueprint(createDemoBlueprint()));
    const machine = new Interactive3dStateMachine(bp);

    machine.dispatchEvent({ type: "pointerEnter", entityId: "hero-mascot" });
    machine.dispatchEvent({ type: "cursorMove", ndcX: 1, ndcY: -0.5 });
    machine.dispatchEvent({ type: "scroll", ratio: 0.5 });

    // 초기 스텝 직후엔 과도 상태(not settled)
    machine.step(1 / 60);
    const mid = machine.getEntityPose("hero-mascot");
    expect(mid.settled).toBe(false);
    expect(mid.position[1]).toBeGreaterThan(1.0);

    // 충분한 시뮬레이션 시간 후 목표 상태에 수렴
    for (let i = 0; i < 180; i += 1) {
      machine.step(1 / 60);
    }

    const mascot = machine.getEntityPose("hero-mascot");
    expect(mascot.activeStateId).toBe("hover");
    expect(mascot.position[1]).toBeCloseTo(1.5, 2);
    expect(mascot.scale[0]).toBeCloseTo(1.15, 2);
    expect(mascot.rotationEuler[1]).toBeCloseTo(0.2 + 0.45, 2);
    expect(mascot.rotationEuler[0]).toBeCloseTo(-0.125, 2);

    // 스크롤 0.5는 [0.2, 0.8]의 정확히 중간(t=0.5): 주간 5800K <-> 노을 3200K = 4500K
    const light = machine.getEntityPose("key-light");
    expect(light.colorTempK).toBeCloseTo(4500, 0);
    expect(light.lightIntensity).toBeCloseTo(1.4, 2);
  });

  it("언더댐핑 낙하 시 바닥 충돌 평면에서 탄성 바운스 이벤트를 발생시키고 평면 아래를 뚫지 않는다", () => {
    const machine = new Interactive3dStateMachine(createDemoBlueprint());
    // 클릭으로 drop(y=0) 트리거 -> 낮은 감쇠(damping=8)로 오버슈트하며 bouncePlaneY=0과 충돌
    machine.dispatchEvent({ type: "click", entityId: "hero-mascot" });

    let totalBounces = 0;
    for (let i = 0; i < 120; i += 1) {
      const bounces = machine.step(1 / 60);
      totalBounces += bounces.length;
      const pose = machine.getEntityPose("hero-mascot");
      expect(pose.position[1]).toBeGreaterThanOrEqual(-1e-6);
    }
    expect(totalBounces).toBeGreaterThanOrEqual(1);
    expect(machine.getBounceHistory().length).toBe(totalBounces);
  });

  it("prefersReducedMotion 모드에서는 스프링 진동 없이 목표 상태로 즉시 스냅된다", () => {
    const machine = new Interactive3dStateMachine(createDemoBlueprint(), {
      prefersReducedMotion: true,
    });
    machine.dispatchEvent({ type: "pointerEnter", entityId: "hero-mascot" });

    const pose = machine.getEntityPose("hero-mascot");
    expect(pose.settled).toBe(true);
    expect(pose.position[1]).toBeCloseTo(1.5, 5);
    expect(pose.matcapId).toBe("clay-gloss");
    expect(machine.isAllSettled()).toBe(true);
  });
});
