import { describe, expect, it } from "vitest";

import { OFFICE2D_CATEGORY, Office2dPhysicsWorld, office2dCollide, Office2dBody } from "./office2d-physics";

function world(): Office2dPhysicsWorld {
  return new Office2dPhysicsWorld({ width: 800, height: 600 });
}

function runFor(physics: Office2dPhysicsWorld, seconds: number, frame = 1 / 60) {
  const impacts = [];
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += frame) impacts.push(...physics.step(frame).impacts);
  return impacts;
}

describe("office2dCollide", () => {
  it("원-원 겹침 법선은 a에서 b를 향한다", () => {
    const a = new Office2dBody({ id: "a", kind: "dynamic", shape: { type: "circle", radius: 10 }, x: 0, y: 0 });
    const b = new Office2dBody({ id: "b", kind: "dynamic", shape: { type: "circle", radius: 10 }, x: 15, y: 0 });
    const manifold = office2dCollide(a, b);
    expect(manifold).not.toBeNull();
    expect(manifold?.nx).toBeCloseTo(1);
    expect(manifold?.depth).toBeCloseTo(5);
  });

  it("원-상자와 상자-원은 같은 접촉을 반대 순서로 표현한다", () => {
    const circle = new Office2dBody({ id: "c", kind: "dynamic", shape: { type: "circle", radius: 10 }, x: 0, y: -18 });
    const box = new Office2dBody({ id: "b", kind: "static", shape: { type: "box", halfWidth: 20, halfHeight: 10 }, x: 0, y: 0 });
    const circleFirst = office2dCollide(circle, box);
    const boxFirst = office2dCollide(box, circle);
    expect(circleFirst?.ny).toBeCloseTo(1);
    expect(boxFirst?.ny).toBeCloseTo(-1);
    expect(circleFirst?.depth).toBeCloseTo(2);
  });

  it("중심이 상자 안에 들어간 원은 가장 얕은 면으로 밀려난다", () => {
    const circle = new Office2dBody({ id: "c", kind: "dynamic", shape: { type: "circle", radius: 5 }, x: 18, y: 0 });
    const box = new Office2dBody({ id: "b", kind: "static", shape: { type: "box", halfWidth: 20, halfHeight: 10 }, x: 0, y: 0 });
    const manifold = office2dCollide(box, circle);
    expect(manifold?.nx).toBe(1);
    expect(manifold?.depth).toBeCloseTo(7);
  });

  it("떨어진 상자끼리는 겹치지 않는다", () => {
    const a = new Office2dBody({ id: "a", kind: "static", shape: { type: "box", halfWidth: 5, halfHeight: 5 }, x: 0, y: 0 });
    const b = new Office2dBody({ id: "b", kind: "dynamic", shape: { type: "box", halfWidth: 5, halfHeight: 5 }, x: 11, y: 0 });
    expect(office2dCollide(a, b)).toBeNull();
  });
});

describe("Office2dPhysicsWorld", () => {
  it("정적 벽을 뚫지 않고 벽 앞에서 멈춘다", () => {
    const physics = world();
    physics.addBody({ id: "wall", kind: "static", shape: { type: "box", halfWidth: 8, halfHeight: 200 }, x: 400, y: 300 });
    const actor = physics.addBody({ id: "actor", kind: "dynamic", shape: { type: "circle", radius: 12 }, x: 300, y: 300, linearDamping: 0, maxSpeed: 2000 });
    for (let index = 0; index < 120; index += 1) {
      physics.setVelocity("actor", 600, 0);
      physics.step(1 / 60);
    }
    expect(actor.x).toBeLessThanOrEqual(400 - 8 - 12 + 0.5);
    expect(actor.x).toBeGreaterThan(370);
  });

  it("벽에 비스듬히 부딪히면 벽을 따라 미끄러진다", () => {
    const physics = world();
    physics.addBody({ id: "wall", kind: "static", shape: { type: "box", halfWidth: 8, halfHeight: 280 }, x: 400, y: 300 });
    const actor = physics.addBody({ id: "actor", kind: "dynamic", shape: { type: "circle", radius: 12 }, x: 370, y: 200, linearDamping: 0, friction: 0 });
    for (let index = 0; index < 60; index += 1) {
      physics.setVelocity("actor", 200, 200);
      physics.step(1 / 60);
    }
    expect(actor.y).toBeGreaterThan(360);
    expect(actor.x).toBeLessThan(381);
  });

  it("무거운 아바타가 가벼운 짐볼을 밀면 운동량이 넘어가고 충돌이 보고된다", () => {
    const physics = world();
    const actor = physics.addBody({ id: "actor", kind: "dynamic", shape: { type: "circle", radius: 12 }, x: 200, y: 300, mass: 60, linearDamping: 0 });
    const ball = physics.addBody({ id: "ball", kind: "dynamic", shape: { type: "circle", radius: 10 }, x: 240, y: 300, mass: 2, restitution: 0.8, linearDamping: 0.6 });
    physics.setVelocity("actor", 240, 0);
    const impacts = runFor(physics, 0.5);
    expect(ball.vx).toBeGreaterThan(240);
    expect(actor.vx).toBeGreaterThan(150);
    expect(impacts.some((impact) => [impact.a, impact.b].includes("ball"))).toBe(true);
  });

  it("바닥 마찰로 굴러가던 소품이 멈추고 잠든다", () => {
    const physics = world();
    const chair = physics.addBody({ id: "chair", kind: "dynamic", shape: { type: "circle", radius: 14 }, x: 300, y: 300, linearDamping: 5 });
    physics.applyImpulse("chair", 300, 0);
    runFor(physics, 3);
    expect(chair.sleeping).toBe(true);
    expect(chair.vx).toBe(0);
    expect(chair.x).toBeGreaterThan(330);
  });

  it("returnHome 소품은 한동안 방치되면 원래 자리로 돌아간다", () => {
    const physics = world();
    const chair = physics.addBody({ id: "chair", kind: "dynamic", shape: { type: "circle", radius: 14 }, x: 300, y: 300, linearDamping: 6, returnHome: true });
    physics.applyImpulse("chair", 260, 0);
    runFor(physics, 1);
    expect(chair.x).toBeGreaterThan(320);
    runFor(physics, 9);
    expect(Math.hypot(chair.x - 300, chair.y - 300)).toBeLessThan(2);
    expect(chair.sleeping).toBe(true);
  });

  it("키네마틱 동료는 목표로 이동하며 길목의 소품을 밀고 자신은 밀리지 않는다", () => {
    const physics = world();
    const peer = physics.addBody({ id: "peer", kind: "kinematic", shape: { type: "circle", radius: 12 }, x: 100, y: 300, category: OFFICE2D_CATEGORY.actor });
    const box = physics.addBody({ id: "box", kind: "dynamic", shape: { type: "box", halfWidth: 10, halfHeight: 10 }, x: 140, y: 300, mass: 4 });
    for (let index = 0; index < 30; index += 1) {
      physics.setKinematicTarget("peer", 100 + (index + 1) * 4, 300);
      physics.step(1 / 60);
    }
    expect(peer.x).toBeCloseTo(220, 0);
    expect(box.x).toBeGreaterThan(220);
  });

  it("마스크가 맞지 않으면 통과한다(고스트 모드)", () => {
    const physics = world();
    physics.addBody({ id: "chair", kind: "dynamic", shape: { type: "circle", radius: 12 }, x: 260, y: 300, category: OFFICE2D_CATEGORY.prop });
    const ghost = physics.addBody({
      id: "ghost", kind: "dynamic", shape: { type: "circle", radius: 12 }, x: 200, y: 300, linearDamping: 0,
      category: OFFICE2D_CATEGORY.actor, mask: OFFICE2D_CATEGORY.world,
    });
    for (let index = 0; index < 30; index += 1) {
      physics.setVelocity("ghost", 300, 0);
      physics.step(1 / 60);
    }
    expect(ghost.x).toBeGreaterThan(330);
    expect(physics.getBody("chair")?.x).toBe(260);
  });

  it("센서는 진입과 이탈을 한 번씩만 알리고 충돌 응답은 없다", () => {
    const physics = world();
    physics.addBody({ id: "booth", kind: "static", sensor: true, shape: { type: "box", halfWidth: 40, halfHeight: 40 }, x: 400, y: 300 });
    const actor = physics.addBody({ id: "actor", kind: "dynamic", shape: { type: "circle", radius: 10 }, x: 300, y: 300, linearDamping: 0 });
    const enters: string[] = [];
    const exits: string[] = [];
    for (let index = 0; index < 120; index += 1) {
      physics.setVelocity("actor", 150, 0);
      const report = physics.step(1 / 60);
      enters.push(...report.sensorEnters.map((event) => event.sensor));
      exits.push(...report.sensorExits.map((event) => event.sensor));
    }
    expect(actor.x).toBeGreaterThan(550);
    expect(enters).toEqual(["booth"]);
    expect(exits).toEqual(["booth"]);
  });

  it("고정 간격 누산기로 프레임 분할과 무관하게 같은 결과를 낸다", () => {
    const simulate = (frame: number) => {
      const physics = world();
      const ball = physics.addBody({ id: "ball", kind: "dynamic", shape: { type: "circle", radius: 10 }, x: 100, y: 100, linearDamping: 1.5, restitution: 0.7 });
      physics.addBody({ id: "wall", kind: "static", shape: { type: "box", halfWidth: 10, halfHeight: 300 }, x: 500, y: 300 });
      physics.applyImpulse("ball", 700, 120);
      for (let elapsed = 0; elapsed < 2 - 1e-9; elapsed += frame) physics.step(frame);
      return { x: ball.x, y: ball.y };
    };
    const at60 = simulate(1 / 60);
    const at120 = simulate(1 / 120);
    expect(at60.x).toBeCloseTo(at120.x, 3);
    expect(at60.y).toBeCloseTo(at120.y, 3);
  });

  it("긴 정지 뒤의 거대한 프레임은 하위 단계 상한에서 잘린다", () => {
    const physics = world();
    physics.addBody({ id: "ball", kind: "dynamic", shape: { type: "circle", radius: 10 }, x: 100, y: 100 });
    expect(physics.step(5).subSteps).toBe(8);
    expect(physics.step(Number.NaN).subSteps).toBe(0);
  });

  it("월드 경계 밖으로 나가지 않는다", () => {
    const physics = world();
    const ball = physics.addBody({ id: "ball", kind: "dynamic", shape: { type: "circle", radius: 10 }, x: 20, y: 20, linearDamping: 0, restitution: 0.5 });
    physics.applyImpulse("ball", -500, -500);
    runFor(physics, 0.5);
    expect(ball.x).toBeGreaterThanOrEqual(10);
    expect(ball.y).toBeGreaterThanOrEqual(10);
  });

  it("점유 판정과 가장 가까운 빈 지점을 계산한다", () => {
    const physics = world();
    physics.addBody({ id: "desk", kind: "static", shape: { type: "box", halfWidth: 60, halfHeight: 20 }, x: 400, y: 300 });
    physics.addBody({ id: "zone", kind: "static", sensor: true, shape: { type: "box", halfWidth: 200, halfHeight: 200 }, x: 400, y: 300 });
    expect(physics.canOccupyCircle(400, 300, 10)).toBe(false);
    expect(physics.canOccupyCircle(400, 360, 10)).toBe(true);
    expect(physics.canOccupyCircle(5, 300, 10)).toBe(false);
    const free = physics.nearestFreePoint(400, 300, 10);
    expect(free).not.toBeNull();
    if (free) expect(physics.canOccupyCircle(free.x, free.y, 10)).toBe(true);
  });

  it("잘못된 입력을 거부한다", () => {
    const physics = world();
    expect(() => physics.addBody({ id: "", kind: "static", shape: { type: "circle", radius: 1 }, x: 0, y: 0 })).toThrow();
    expect(() => physics.addBody({ id: "x", kind: "static", shape: { type: "circle", radius: 0 }, x: 0, y: 0 })).toThrow();
    physics.addBody({ id: "x", kind: "static", shape: { type: "circle", radius: 2 }, x: 0, y: 0 });
    expect(() => physics.addBody({ id: "x", kind: "static", shape: { type: "circle", radius: 2 }, x: 0, y: 0 })).toThrow();
    expect(physics.removeBody("x")).toBe(true);
    expect(physics.removeBody("x")).toBe(false);
    expect(() => new Office2dPhysicsWorld({ width: 0, height: 10 })).toThrow();
  });

  it("오프센터 충돌 시 접촉점 지렛대 토크로 각속도(ω)와 회전각이 발생한다", () => {
    const physics = world();
    const cart = physics.addBody({
      id: "cart",
      kind: "dynamic",
      shape: { type: "box", halfWidth: 22, halfHeight: 16 },
      x: 340,
      y: 300,
      mass: 6,
      fixedRotation: false,
      friction: 0.6,
    });
    physics.addBody({
      id: "striker",
      kind: "dynamic",
      shape: { type: "circle", radius: 10 },
      x: 295,
      y: 286,
      mass: 40,
      linearDamping: 0,
    });
    physics.setVelocity("striker", 320, 0);
    runFor(physics, 0.25);
    expect(Math.abs(cart.angularVelocity)).toBeGreaterThan(0.1);
    expect(Math.abs(cart.angle)).toBeGreaterThan(0.01);
    expect(cart.impactSquash).toBeGreaterThan(0);
  });

  it("바닥 재질 구역에 따라 구름 저항이 달라 테라조 바닥에서 카펫보다 더 멀리 굴러간다", () => {
    const simulateOn = (material: "terrazzo" | "carpet-navy") => {
      const physics = world();
      physics.setSurfaceRegions([{ x: 0, y: 0, width: 800, height: 600, material }]);
      const ball = physics.addBody({
        id: "ball",
        kind: "dynamic",
        shape: { type: "circle", radius: 14 },
        x: 120,
        y: 300,
        mass: 3,
        linearDamping: 2.5,
      });
      physics.applyImpulse("ball", 600, 0);
      runFor(physics, 1.5);
      return ball.x;
    };
    const terrazzoX = simulateOn("terrazzo");
    const carpetX = simulateOn("carpet-navy");
    expect(terrazzoX).toBeGreaterThan(carpetX + 45);
  });

  it("회전하는 구체(rolls=true)는 마그누스 효과로 진행 방향 수직으로 궤적이 휜다", () => {
    const physics = world();
    const ball = physics.addBody({
      id: "ball",
      kind: "dynamic",
      shape: { type: "circle", radius: 14 },
      x: 150,
      y: 300,
      mass: 2,
      linearDamping: 0.5,
      angularDamping: 0.2,
      fixedRotation: false,
      rolls: true,
    });
    physics.applyImpulse("ball", 500, 0, { rx: 0, ry: -12 }, 180);
    runFor(physics, 0.8);
    expect(ball.x).toBeGreaterThan(280);
    expect(Math.abs(ball.y - 300)).toBeGreaterThan(8);
  });

  it("훅의 법칙 스프링 조인트로 연결된 물체는 탄성 복원력으로 끌려온다", () => {
    const physics = world();
    const tethered = physics.addBody({
      id: "tethered",
      kind: "dynamic",
      shape: { type: "circle", radius: 10 },
      x: 420,
      y: 300,
      mass: 2,
      linearDamping: 4,
    });
    physics.addSpringJoint({
      id: "spring-1",
      bodyA: "tethered",
      anchorPoint: { x: 300, y: 300 },
      restLength: 0,
      stiffness: 35,
      damping: 8,
    });
    runFor(physics, 2.5);
    expect(Math.hypot(tethered.x - 300, tethered.y - 300)).toBeLessThan(4);
    expect(physics.removeSpringJoint("spring-1")).toBe(true);
  });
});
