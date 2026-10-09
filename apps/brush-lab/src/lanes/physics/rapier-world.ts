import { BODY_STATE_STRIDE, queryCircleFromState } from "../../engine/physics/world2d/types";

import type { RapierModule } from "./rapier-loader";
import type { CircleBodySpec, PhysicsWorld2D, SpringSpec, WorldTraits } from "../../engine/physics/world2d/types";
import type { ImpulseJoint, RigidBody, World } from "@dimforge/rapier2d-compat";

/**
 * Rapier 2D(compat) 어댑터: `PhysicsWorld2D` 계약을 Rapier 월드에 옮긴다. 외부 패키지를 쓰므로 `lanes/physics/**`에 둔다.
 *
 * 옮기는 규칙(SP-A에서 실측으로 확인한 것):
 * - 스프링은 모터 기반 조인트(`JointData.spring`)이고 힘 기반(k, c)으로 동작한다 → 변환 없이 그대로 넘긴다.
 * - 휴지 길이·강성·감쇠를 바꾸는 API가 없어 `setSpring`은 조인트를 지우고 다시 만든다(비싸므로 호출자가 값이 바뀔 때만 부른다).
 * - 충돌은 16비트 멤버십 | 16비트 필터를 한 정수로 패킹한다(`collideGroup` n → 멤버십 1 << (n − 1), 그룹 0 = 충돌 없음). 그룹은 1..16까지.
 * - `lengthUnit`을 32 px로 둬서 접촉 허용 오차가 px 스케일에 맞게 한다.
 * - 속도·위치 조회는 몸체마다 JS 객체를 만들고 일괄 읽기 API가 없다.
 * - 외력은 `addForce` 후 `step` 뒤 `resetForces`로 한 틱에만 적용한다.
 * - wasm 힙 해제를 위해 `dispose`에서 `world.free()`를 부른다.
 */

const LENGTH_UNIT_PX = 32;
const MAX_COLLIDE_GROUP = 16;

export class RapierWorld2D implements PhysicsWorld2D {
  readonly traits: WorldTraits = { backendId: "rapier2d", labelKo: "Rapier 2D(compat, wasm)", needsDispose: true };

  private readonly R: RapierModule;
  private world: World | null;
  private readonly bodies: RigidBody[] = [];
  private readonly kinematic: boolean[] = [];
  private readonly radii: number[] = [];
  private readonly dynamicFlag: number[] = [];
  private readonly targets: { x: number; y: number }[] = [];
  private readonly forces: { x: number; y: number }[] = [];
  private forceDirty = false;
  private readonly springs: { a: number; b: number; spec: SpringSpec; handle: ImpulseJoint }[] = [];
  private scratch = new Float32Array(0);
  private stepCount = 0;
  private springRebuilds = 0;
  private nonFiniteStates = 0;

  constructor(R: RapierModule) {
    this.R = R;
    const world = new R.World({ x: 0, y: 0 });
    world.lengthUnit = LENGTH_UNIT_PX;
    this.world = world;
  }

  get bodyCount(): number {
    return this.bodies.length;
  }

  addCircle(spec: CircleBodySpec): number {
    const world = this.requireWorld();
    const R = this.R;
    if (!Number.isFinite(spec.x) || !Number.isFinite(spec.y)) throw new RangeError(`몸체 위치가 유한하지 않다(${spec.x}, ${spec.y})`);
    if (!Number.isFinite(spec.radius) || spec.radius <= 0) throw new RangeError(`Rapier 몸체 반경은 0보다 커야 한다(받은 값 ${spec.radius})`);
    const kin = spec.kinematic === true;
    if (!kin && !(Number.isFinite(spec.mass) && spec.mass > 0)) throw new RangeError(`동적 몸체의 질량은 0보다 커야 한다(받은 값 ${spec.mass})`);
    const group = spec.collideGroup ?? 0;
    if (!Number.isInteger(group) || group < 0 || group > MAX_COLLIDE_GROUP) throw new RangeError(`충돌 그룹은 0..${MAX_COLLIDE_GROUP} 정수여야 한다(받은 값 ${group})`);
    const desc = (kin ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic())
      .setTranslation(spec.x, spec.y)
      .setLinearDamping(spec.linearDamping ?? 0)
      .setCanSleep(false)
      .lockRotations();
    const body = world.createRigidBody(desc);
    const member = group === 0 ? 0 : 1 << (group - 1);
    const groups = ((member << 16) | member) >>> 0;
    const col = R.ColliderDesc.ball(spec.radius).setFriction(0).setRestitution(0).setCollisionGroups(groups);
    if (!kin) col.setMass(spec.mass);
    world.createCollider(col, body);
    this.bodies.push(body);
    this.kinematic.push(kin);
    this.radii.push(spec.radius);
    this.dynamicFlag.push(kin ? 0 : 1);
    this.targets.push({ x: spec.x, y: spec.y });
    this.forces.push({ x: 0, y: 0 });
    return this.bodies.length - 1;
  }

  setKinematicTarget(body: number, x: number, y: number): void {
    this.assertBody(body);
    if (!this.kinematic[body]) throw new RangeError(`몸체 ${body}는 kinematic이 아니다`);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError(`kinematic 목표가 유한하지 않다(${x}, ${y})`);
    const t = this.targets[body];
    if (t) {
      t.x = x;
      t.y = y;
    }
  }

  addSpring(a: number, b: number, spec: SpringSpec): number {
    this.assertBody(a);
    this.assertBody(b);
    assertSpring(spec);
    this.springs.push({ a, b, spec: { ...spec }, handle: this.makeJoint(a, b, spec) });
    return this.springs.length - 1;
  }

  setSpring(spring: number, spec: SpringSpec): void {
    const rec = this.springs[spring];
    if (!rec) throw new RangeError(`스프링 번호 ${spring}가 범위 밖이다(0..${this.springs.length - 1})`);
    assertSpring(spec);
    this.requireWorld().removeImpulseJoint(rec.handle, true);
    this.springRebuilds += 1;
    rec.spec = { ...spec };
    rec.handle = this.makeJoint(rec.a, rec.b, spec);
  }

  applyForce(body: number, fx: number, fy: number): void {
    this.assertBody(body);
    const force = this.forces[body];
    if (!force) return;
    force.x += fx;
    force.y += fy;
    this.forceDirty = true;
  }

  queryCircle(x: number, y: number, radius: number, out: number[]): number {
    const n = this.bodies.length;
    if (this.scratch.length < n * BODY_STATE_STRIDE) this.scratch = new Float32Array(n * BODY_STATE_STRIDE);
    this.readState(this.scratch);
    return queryCircleFromState(this.scratch, this.radii, this.dynamicFlag, n, x, y, radius, out);
  }

  step(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec <= 0) throw new RangeError(`step dt는 0보다 큰 유한 값이어야 한다(받은 값 ${dtSec})`);
    const world = this.requireWorld();
    world.timestep = dtSec;
    this.stepCount += 1;
    for (let i = 0; i < this.bodies.length; i += 1) {
      const body = this.bodies[i];
      if (!body) continue;
      if (this.kinematic[i]) {
        const t = this.targets[i];
        if (t) body.setNextKinematicTranslation({ x: t.x, y: t.y });
      } else {
        const force = this.forces[i];
        if (this.forceDirty && force && (force.x !== 0 || force.y !== 0)) body.addForce({ x: force.x, y: force.y }, true);
      }
    }
    world.step();
    if (this.forceDirty) {
      for (let i = 0; i < this.bodies.length; i += 1) {
        const force = this.forces[i];
        if (force && (force.x !== 0 || force.y !== 0)) {
          this.bodies[i]?.resetForces(true);
          force.x = 0;
          force.y = 0;
        }
      }
      this.forceDirty = false;
    }
  }

  readState(out: Float32Array): void {
    const n = this.bodies.length;
    if (out.length < n * BODY_STATE_STRIDE) throw new RangeError(`readState 버퍼가 작다(필요 ${n * BODY_STATE_STRIDE}, 받은 ${out.length})`);
    for (let i = 0; i < n; i += 1) {
      const body = this.bodies[i];
      if (!body) continue;
      const p = body.translation();
      const v = body.linvel();
      // 자체 PBD 월드와 달리 Rapier는 비유한 상태를 되돌리지 않는다. 침묵하지 않도록 세어 영수증이 드러내게 한다.
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(v.x) || !Number.isFinite(v.y)) this.nonFiniteStates += 1;
      const o = i * BODY_STATE_STRIDE;
      out[o] = p.x;
      out[o + 1] = p.y;
      out[o + 2] = v.x;
      out[o + 3] = v.y;
    }
  }

  diagnostics(): Readonly<Record<string, number>> {
    return { steps: this.stepCount, springRebuilds: this.springRebuilds, nonFiniteStates: this.nonFiniteStates };
  }

  dispose(): void {
    if (this.world === null) return;
    this.world.free();
    this.world = null;
    this.bodies.length = 0;
    this.springs.length = 0;
  }

  private makeJoint(a: number, b: number, spec: SpringSpec): ImpulseJoint {
    const world = this.requireWorld();
    const bodyA = this.bodies[a];
    const bodyB = this.bodies[b];
    if (!bodyA || !bodyB) throw new RangeError(`스프링 몸체 ${a}, ${b}가 없다`);
    const data = this.R.JointData.spring(spec.restLength, spec.stiffness, spec.damping, { x: 0, y: 0 }, { x: 0, y: 0 });
    const joint = world.createImpulseJoint(data, bodyA, bodyB, true);
    joint.setContactsEnabled(false);
    return joint;
  }

  private requireWorld(): World {
    if (this.world === null) throw new Error("RapierWorld2D: dispose된 월드다");
    return this.world;
  }

  private assertBody(body: number): void {
    if (!Number.isInteger(body) || body < 0 || body >= this.bodies.length) throw new RangeError(`몸체 번호 ${body}가 범위 밖이다(0..${this.bodies.length - 1})`);
  }
}

function assertSpring(spec: SpringSpec): void {
  if (!Number.isFinite(spec.restLength) || spec.restLength < 0) throw new RangeError(`스프링 휴지 길이는 0 이상의 유한 값이어야 한다(받은 값 ${spec.restLength})`);
  if (!Number.isFinite(spec.stiffness) || spec.stiffness < 0) throw new RangeError(`스프링 강성은 0 이상의 유한 값이어야 한다(받은 값 ${spec.stiffness})`);
  if (!Number.isFinite(spec.damping) || spec.damping < 0) throw new RangeError(`스프링 감쇠는 0 이상의 유한 값이어야 한다(받은 값 ${spec.damping})`);
}

/** 로드된 Rapier 모듈로 월드를 만든다. */
export function createRapierWorld(R: RapierModule): PhysicsWorld2D {
  return new RapierWorld2D(R);
}
