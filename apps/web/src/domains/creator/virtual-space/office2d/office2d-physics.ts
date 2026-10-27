/**
 * ToonOffice 2D 강체·회전·표면마찰·스프링 물리 엔진.
 *
 * 위에서 내려다보는(top-down) 사무실 공간 전용의 결정적(deterministic) 2D 물리 엔진이다.
 * 고정 시간 간격(기본 1/120초) 누산기와 고속 이동 시 자동 연속 충돌 세분화(CCD sub-stepping)로
 * 프레임 속도와 무관하게 동일한 물리 궤적을 보장한다.
 *
 * 핵심 물리 법칙:
 * 1. 선형 운동량 보존 + 충격량(impulse) 기반 반발(restitution) 및 쿨롱 마찰(Coulomb friction)
 * 2. 관성 모멘트(I)·각속도(ω)·접촉점 지렛대 팔(r × J) 기반 강체 회전 동역학(토크)
 * 3. 바닥 재질 구역(카펫·원목·테라조·타일·코르크·콘크리트)별 차등 구름 저항·마찰·반발 계수
 * 4. 훅의 법칙(Hooke's law, F = -k·Δx - c·v) 기반 임계 감쇠 제자리 복원력과 탄성 스프링 조인트
 * 5. 고속 비선형 공기 저항(quadratic drag)과 회전 구체의 마그누스 커브 효과(Magnus force, F_m = S·ω×v)
 * 6. 충돌 순간 부피 보존 탄성 압축·복원(impactSquash) 상태 계산
 */
import {
  OFFICE2D_CATEGORY,
  OFFICE2D_SURFACE_PHYSICS,
  Office2dBody,
  type Office2dBodyInit,
  type Office2dBodyKind,
  type Office2dManifold,
  type Office2dShape,
  Office2dSpatialHash,
  type Office2dSpringJoint,
  type Office2dSurfaceMaterial,
  type Office2dSurfacePhysics,
  type Office2dSurfaceRegion,
  office2dClamp,
  office2dCollide,
  office2dCross2d,
  office2dLayersCollide,
  office2dWrapAngle,
} from "./office2d-physics-collision";

export {
  OFFICE2D_CATEGORY,
  OFFICE2D_SURFACE_PHYSICS,
  Office2dBody,
  type Office2dBodyInit,
  type Office2dBodyKind,
  type Office2dManifold,
  type Office2dShape,
  type Office2dSpringJoint,
  type Office2dSurfaceMaterial,
  type Office2dSurfacePhysics,
  type Office2dSurfaceRegion,
  office2dCollide,
};

const DEFAULT_FIXED_STEP = 1 / 120;
const DEFAULT_MAX_SUB_STEPS = 8;
const DEFAULT_SOLVER_ITERATIONS = 5;
const DEFAULT_CELL_SIZE = 96;
const POSITION_SLOP = 0.04;
const POSITION_CORRECTION = 0.82;
const RESTITUTION_VELOCITY_THRESHOLD = 20;
const SLEEP_SPEED = 3.5;
const SLEEP_ANGULAR_SPEED = 0.08;
const SLEEP_DELAY_SECONDS = 0.6;
const WAKE_SPEED = 6;
const HOME_IDLE_SECONDS = 3.0;
const HOME_SPRING_STIFFNESS = 14.0;
const HOME_SPRING_DAMPING = 7.2;
const HOME_MAX_RETURN_SPEED = 110;
const MAX_ANGULAR_SPEED = 14.0;
const MAGNUS_COEFF = 0.085;
const IMPACT_REPORT_SPEED = 55;

export interface Office2dContactEvent {
  readonly a: string;
  readonly b: string;
  /** a → b 방향 단위 법선. */
  readonly nx: number;
  readonly ny: number;
  /** 접촉 지점 월드 좌표. */
  readonly contactX: number;
  readonly contactY: number;
  /** 접근 속력(px/s). 충돌 반발·효과음·파티클 세기 판정에 쓴다. */
  readonly impactSpeed: number;
}

export interface Office2dSensorEvent {
  readonly sensor: string;
  readonly body: string;
}

export interface Office2dStepReport {
  readonly subSteps: number;
  readonly impacts: readonly Office2dContactEvent[];
  readonly sensorEnters: readonly Office2dSensorEvent[];
  readonly sensorExits: readonly Office2dSensorEvent[];
}

export interface Office2dPhysicsOptions {
  readonly width: number;
  readonly height: number;
  readonly fixedStep?: number;
  readonly maxSubSteps?: number;
  readonly solverIterations?: number;
  readonly cellSize?: number;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

export class Office2dPhysicsWorld {
  readonly width: number;
  readonly height: number;
  private readonly fixedStep: number;
  private readonly maxSubSteps: number;
  private readonly solverIterations: number;
  private readonly bodyMap = new Map<string, Office2dBody>();
  private readonly ordered: Office2dBody[] = [];
  private readonly joints = new Map<string, Office2dSpringJoint>();
  private surfaceRegions: readonly Office2dSurfaceRegion[] = [];
  private readonly staticHash: Office2dSpatialHash;
  private readonly movingHash: Office2dSpatialHash;
  private staticDirty = true;
  private accumulator = 0;
  private activeSensorPairs = new Set<string>();

  constructor(options: Office2dPhysicsOptions) {
    if (!(options.width > 0 && options.height > 0)) throw new Error("office2d world size is invalid");
    this.width = options.width;
    this.height = options.height;
    this.fixedStep = options.fixedStep ?? DEFAULT_FIXED_STEP;
    this.maxSubSteps = options.maxSubSteps ?? DEFAULT_MAX_SUB_STEPS;
    this.solverIterations = options.solverIterations ?? DEFAULT_SOLVER_ITERATIONS;
    const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
    this.staticHash = new Office2dSpatialHash(cellSize);
    this.movingHash = new Office2dSpatialHash(cellSize);
  }

  /** 바닥 재질 구역을 등록해 구역별 마찰·구름 저항·반발 계수를 적용한다. */
  setSurfaceRegions(regions: readonly Office2dSurfaceRegion[]): void {
    this.surfaceRegions = [...regions];
  }

  /** 지정 좌표의 바닥 재질 물리 계수를 돌려준다. */
  surfaceAt(x: number, y: number): Office2dSurfacePhysics {
    for (let index = this.surfaceRegions.length - 1; index >= 0; index -= 1) {
      const region = this.surfaceRegions[index];
      if (!region) continue;
      if (x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height) {
        return OFFICE2D_SURFACE_PHYSICS[region.material];
      }
    }
    return OFFICE2D_SURFACE_PHYSICS.generic;
  }

  /** 훅의 법칙 스프링-댐퍼 조인트를 추가한다. */
  addSpringJoint(joint: Office2dSpringJoint): void {
    this.joints.set(joint.id, joint);
  }

  removeSpringJoint(id: string): boolean {
    return this.joints.delete(id);
  }

  addBody(init: Office2dBodyInit): Office2dBody {
    if (this.bodyMap.has(init.id)) throw new Error(`duplicate office2d body: ${init.id}`);
    const body = new Office2dBody(init);
    this.bodyMap.set(body.id, body);
    this.ordered.push(body);
    if (body.kind === "static") this.staticDirty = true;
    return body;
  }

  removeBody(id: string): boolean {
    const body = this.bodyMap.get(id);
    if (!body) return false;
    this.bodyMap.delete(id);
    const index = this.ordered.indexOf(body);
    if (index >= 0) this.ordered.splice(index, 1);
    if (body.kind === "static") this.staticDirty = true;
    const next = new Set<string>();
    for (const key of this.activeSensorPairs) if (!key.split("\u0000").includes(id)) next.add(key);
    this.activeSensorPairs = next;
    for (const [jointId, joint] of this.joints) {
      if (joint.bodyA === id || joint.bodyB === id) this.joints.delete(jointId);
    }
    return true;
  }

  getBody(id: string): Office2dBody | undefined {
    return this.bodyMap.get(id);
  }

  bodies(): readonly Office2dBody[] {
    return this.ordered;
  }

  /** 동적 물체 속도를 직접 정한다(로컬 아바타 조작). */
  setVelocity(id: string, vx: number, vy: number): void {
    const body = this.bodyMap.get(id);
    if (!body || body.kind !== "dynamic" || !Number.isFinite(vx) || !Number.isFinite(vy)) return;
    body.vx = vx;
    body.vy = vy;
    if (Math.hypot(vx, vy) > 0) body.wake();
  }

  /** 선형 충격량과 선택적 접촉점 토크(혹은 직접 각충격량)를 가한다. */
  applyImpulse(id: string, ix: number, iy: number, contactOffset?: { readonly rx: number; readonly ry: number }, angularImpulse = 0): void {
    const body = this.bodyMap.get(id);
    if (!body || body.invMass === 0 || !Number.isFinite(ix) || !Number.isFinite(iy)) return;
    body.vx += ix * body.invMass;
    body.vy += iy * body.invMass;
    if (body.invInertia > 0) {
      const torqueImpulse = contactOffset ? office2dCross2d(contactOffset.rx, contactOffset.ry, ix, iy) : 0;
      body.angularVelocity += (torqueImpulse + angularImpulse) * body.invInertia;
    }
    const speedDelta = Math.hypot(ix, iy) * body.invMass;
    if (speedDelta > 30) {
      body.impactSquash = Math.min(0.22, body.impactSquash + speedDelta / 900);
    }
    body.idleTime = 0;
    body.wake();
  }

  /** 충돌 마스크를 바꾼다(고스트 모드: 벽만 막고 사람·소품은 통과). */
  setCollisionMask(id: string, mask: number): void {
    const body = this.bodyMap.get(id);
    if (!body || !Number.isInteger(mask)) return;
    body.mask = mask;
    body.wake();
  }

  /** 순간이동. 속도와 각속도를 지우고 키네마틱 목표도 같은 곳으로 맞춘다. */
  teleport(id: string, x: number, y: number): void {
    const body = this.bodyMap.get(id);
    if (!body || !Number.isFinite(x) || !Number.isFinite(y)) return;
    body.x = x;
    body.y = y;
    body.targetX = x;
    body.targetY = y;
    body.vx = 0;
    body.vy = 0;
    body.angularVelocity = 0;
    body.wake();
    if (body.kind === "static") this.staticDirty = true;
  }

  /** 키네마틱 물체의 목표 지점. 다음 step 동안 이 지점으로 미끄러지듯 이동하며 길목의 소품을 민다. */
  setKinematicTarget(id: string, x: number, y: number): void {
    const body = this.bodyMap.get(id);
    if (!body || body.kind !== "kinematic" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    body.targetX = x;
    body.targetY = y;
  }

  /** 반지름 r인 원이 정적 충돌체·월드 경계와 겹치지 않는지 판정한다. */
  canOccupyCircle(x: number, y: number, radius: number): boolean {
    if (x - radius < 0 || y - radius < 0 || x + radius > this.width || y + radius > this.height) return false;
    this.rebuildStaticHash();
    const probe = new Office2dBody({ id: "__probe__", kind: "dynamic", shape: { type: "circle", radius }, x, y });
    let free = true;
    this.staticHash.query(x - radius, y - radius, x + radius, y + radius, (body) => {
      if (!free || body.sensor) return;
      if (office2dCollide(probe, body)) free = false;
    });
    return free;
  }

  /** 막힌 지점이면 나선형으로 가장 가까운 빈 지점을 찾는다. 찾지 못하면 null. */
  nearestFreePoint(x: number, y: number, radius: number, maxDistance = 240): { readonly x: number; readonly y: number } | null {
    const startX = office2dClamp(x, radius, this.width - radius);
    const startY = office2dClamp(y, radius, this.height - radius);
    if (this.canOccupyCircle(startX, startY, radius)) return { x: startX, y: startY };
    for (let distance = 8; distance <= maxDistance; distance += 8) {
      const samples = Math.max(12, Math.round(distance / 4));
      for (let index = 0; index < samples; index += 1) {
        const angle = (index / samples) * Math.PI * 2;
        const px = office2dClamp(startX + Math.cos(angle) * distance, radius, this.width - radius);
        const py = office2dClamp(startY + Math.sin(angle) * distance, radius, this.height - radius);
        if (this.canOccupyCircle(px, py, radius)) return { x: px, y: py };
      }
    }
    return null;
  }

  /** 프레임 경과 시간만큼 고정 간격으로 시뮬레이션한다. 고속 물체가 있으면 자동으로 CCD 하위 분할을 수행한다. */
  step(deltaSeconds: number): Office2dStepReport {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return { subSteps: 0, impacts: [], sensorEnters: [], sensorExits: [] };
    }
    this.accumulator = Math.min(this.accumulator + deltaSeconds, this.fixedStep * this.maxSubSteps);
    const impacts = new Map<string, Office2dContactEvent>();
    let subSteps = 0;
    const frameSteps = Math.floor(this.accumulator / this.fixedStep + 1e-9);
    while (this.accumulator + 1e-9 >= this.fixedStep && subSteps < this.maxSubSteps) {
      const ccdSplits = this.requiredCcdSplits(this.fixedStep);
      const splitStep = this.fixedStep / ccdSplits;
      for (let split = 0; split < ccdSplits; split += 1) {
        const remaining = (frameSteps - subSteps - 1) * ccdSplits + (ccdSplits - split);
        this.subStep(splitStep, remaining, impacts);
      }
      this.accumulator -= this.fixedStep;
      subSteps += 1;
    }
    const sensorEvents = subSteps > 0 ? this.updateSensors() : { enters: [], exits: [] };
    return { subSteps, impacts: [...impacts.values()], sensorEnters: sensorEvents.enters, sensorExits: sensorEvents.exits };
  }

  private requiredCcdSplits(h: number): number {
    let maxRatio = 1;
    for (const body of this.ordered) {
      if (body.kind !== "dynamic" || body.sleeping) continue;
      const safeStep = Math.max(4, body.minRadius() * 0.45);
      const ratio = (body.speed * h) / safeStep;
      if (ratio > maxRatio) maxRatio = ratio;
    }
    return Math.min(4, Math.max(1, Math.ceil(maxRatio)));
  }

  private rebuildStaticHash(): void {
    if (!this.staticDirty) return;
    this.staticHash.clear();
    for (const body of this.ordered) if (body.kind === "static") this.staticHash.insert(body);
    this.staticDirty = false;
  }

  private applySpringJoints(h: number): void {
    for (const joint of this.joints.values()) {
      const a = this.bodyMap.get(joint.bodyA);
      if (!a) continue;
      const b = joint.bodyB ? this.bodyMap.get(joint.bodyB) : undefined;
      const bx = b ? b.x : (joint.anchorPoint?.x ?? a.x);
      const by = b ? b.y : (joint.anchorPoint?.y ?? a.y);
      const bvx = b ? b.vx : 0;
      const bvy = b ? b.vy : 0;
      const dx = bx - a.x;
      const dy = by - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1e-5) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const stretch = distance - joint.restLength;
      const relVel = (bvx - a.vx) * nx + (bvy - a.vy) * ny;
      const force = joint.stiffness * stretch + joint.damping * relVel;
      if (a.invMass > 0) {
        a.vx += force * nx * a.invMass * h;
        a.vy += force * ny * a.invMass * h;
        if (Math.abs(force) > 1) a.wake();
      }
      if (b && b.invMass > 0) {
        b.vx -= force * nx * b.invMass * h;
        b.vy -= force * ny * b.invMass * h;
        if (Math.abs(force) > 1) b.wake();
      }
    }
  }

  private subStep(h: number, remainingSteps: number, impacts: Map<string, Office2dContactEvent>): void {
    this.rebuildStaticHash();
    this.applySpringJoints(h);

    for (const body of this.ordered) {
      if (body.kind === "kinematic") {
        const steps = Math.max(1, remainingSteps);
        const dx = (body.targetX - body.x) / steps;
        const dy = (body.targetY - body.y) / steps;
        body.vx = dx / h;
        body.vy = dy / h;
        if (steps === 1) {
          body.x = body.targetX;
          body.y = body.targetY;
        } else {
          body.x += dx;
          body.y += dy;
        }
        continue;
      }
      if (body.kind !== "dynamic") continue;
      body.impactSquash *= Math.exp(-14 * h);
      if (body.sleeping) {
        if (!body.returnHome) continue;
        body.idleTime += h;
        if (body.idleTime <= HOME_IDLE_SECONDS || Math.hypot(body.homeX - body.x, body.homeY - body.y) <= 0.75) continue;
        body.wake();
      }
      body.idleTime += h;

      // 1) 훅의 법칙(Hooke's law) 임계 감쇠 스프링 제자리 복원력: F = -k·Δx - c·v
      if (body.returnHome && body.idleTime > HOME_IDLE_SECONDS) {
        const hx = body.homeX - body.x;
        const hy = body.homeY - body.y;
        const distance = Math.hypot(hx, hy);
        if (distance > 0.5) {
          const ax = HOME_SPRING_STIFFNESS * hx - HOME_SPRING_DAMPING * body.vx;
          const ay = HOME_SPRING_STIFFNESS * hy - HOME_SPRING_DAMPING * body.vy;
          body.vx += ax * h;
          body.vy += ay * h;
          const returnSpeed = body.speed;
          if (returnSpeed > HOME_MAX_RETURN_SPEED) {
            body.vx = (body.vx / returnSpeed) * HOME_MAX_RETURN_SPEED;
            body.vy = (body.vy / returnSpeed) * HOME_MAX_RETURN_SPEED;
          }
        }
        if (!body.fixedRotation) {
          const angleDiff = office2dWrapAngle(-body.angle);
          body.angularVelocity += (12 * angleDiff - 6 * body.angularVelocity) * h;
        }
      }

      // 2) 회전 구체의 마그누스 커브 힘(Magnus effect): F_m = S · ω × v
      if (body.rolls && Math.abs(body.angularVelocity) > 0.05 && body.speed > 8) {
        const effectiveSpin = office2dClamp(body.angularVelocity, -8, 8);
        const magnusX = -MAGNUS_COEFF * effectiveSpin * body.vy;
        const magnusY = MAGNUS_COEFF * effectiveSpin * body.vx;
        body.vx += magnusX * h;
        body.vy += magnusY * h;
      }

      // 3) 바닥 재질별 선형 감쇠 + 고속 이차 공기 저항(quadratic drag)
      const surface = this.surfaceAt(body.x, body.y);
      const effectiveLinearDamping = body.linearDamping * surface.dampingMultiplier;
      const speedBeforeDrag = body.speed;
      const quadFactor = 1 / (1 + body.quadraticDrag * speedBeforeDrag * h);
      const linearFactor = Math.exp(-effectiveLinearDamping * h) * quadFactor;
      body.vx *= linearFactor;
      body.vy *= linearFactor;

      const angularFactor = Math.exp(-body.angularDamping * surface.dampingMultiplier * h);
      body.angularVelocity = office2dClamp(body.angularVelocity * angularFactor, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);

      const speed = body.speed;
      if (speed > body.maxSpeed) {
        body.vx = (body.vx / speed) * body.maxSpeed;
        body.vy = (body.vy / speed) * body.maxSpeed;
      }

      body.x += body.vx * h;
      body.y += body.vy * h;
      body.angle = office2dWrapAngle(body.angle + body.angularVelocity * h);
      const rollRadius = Math.max(4, body.shape.type === "circle" ? body.shape.radius : body.shape.halfWidth);
      body.spin += (speed * h) / rollRadius + body.angularVelocity * h * 0.35;
    }

    const manifolds = this.collectManifolds();
    for (let iteration = 0; iteration < this.solverIterations; iteration += 1) {
      for (const manifold of manifolds) this.solveVelocity(manifold, iteration === 0 ? impacts : null);
    }
    for (const manifold of manifolds) this.correctPosition(manifold);

    for (const body of this.ordered) {
      if (body.kind !== "dynamic") continue;
      this.keepInsideWorld(body);
      if (body.sleeping) continue;
      if (body.speed < SLEEP_SPEED && Math.abs(body.angularVelocity) < SLEEP_ANGULAR_SPEED) {
        body.sleepTime += h;
        const homeSettled = !body.returnHome || Math.hypot(body.homeX - body.x, body.homeY - body.y) <= 0.75 || body.idleTime <= HOME_IDLE_SECONDS;
        if (body.sleepTime >= SLEEP_DELAY_SECONDS && homeSettled) {
          body.sleeping = true;
          body.vx = 0;
          body.vy = 0;
          body.angularVelocity = 0;
        }
      } else {
        body.sleepTime = 0;
      }
    }
  }

  private collectManifolds(): Office2dManifold[] {
    this.movingHash.clear();
    const movers: Office2dBody[] = [];
    for (const body of this.ordered) {
      if (body.kind === "static" || body.sensor) continue;
      this.movingHash.insert(body);
      movers.push(body);
    }
    const manifolds: Office2dManifold[] = [];
    const seen = new Set<string>();
    for (const body of movers) {
      if (body.kind === "kinematic" && body.speed < 1e-3) continue;
      const box = body.bounds();
      const consider = (other: Office2dBody) => {
        if (other === body || other.sensor || !office2dLayersCollide(body, other)) return;
        if (other.kind !== "dynamic" && body.kind !== "dynamic") return;
        const key = pairKey(body.id, other.id);
        if (seen.has(key)) return;
        seen.add(key);
        if (body.sleeping && (other.kind === "static" || other.sleeping)) return;
        const manifold = office2dCollide(body, other);
        if (manifold) manifolds.push(manifold);
      };
      this.movingHash.query(box.minX, box.minY, box.maxX, box.maxY, consider);
      if (body.kind === "dynamic") this.staticHash.query(box.minX, box.minY, box.maxX, box.maxY, consider);
    }
    return manifolds;
  }

  private solveVelocity(manifold: Office2dManifold, impacts: Map<string, Office2dContactEvent> | null): void {
    const { a, b, nx, ny, contactX, contactY } = manifold;
    const inverseMassSum = a.invMass + b.invMass;
    if (inverseMassSum === 0) return;

    const rax = contactX - a.x;
    const ray = contactY - a.y;
    const rbx = contactX - b.x;
    const rby = contactY - b.y;

    // 접촉점에서의 상대 속도: v_ab = (v_b + ω_b × r_b) - (v_a + ω_a × r_a)
    const vax = a.vx - a.angularVelocity * ray;
    const vay = a.vy + a.angularVelocity * rax;
    const vbx = b.vx - b.angularVelocity * rby;
    const vby = b.vy + b.angularVelocity * rbx;
    const rvx = vbx - vax;
    const rvy = vby - vay;

    const normalSpeed = rvx * nx + rvy * ny;
    if (normalSpeed > 0) return;

    const surface = this.surfaceAt(contactX, contactY);
    if (impacts && -normalSpeed >= IMPACT_REPORT_SPEED) {
      const key = pairKey(a.id, b.id);
      const previous = impacts.get(key);
      if (!previous || previous.impactSpeed < -normalSpeed) {
        impacts.set(key, { a: a.id, b: b.id, nx, ny, contactX, contactY, impactSpeed: -normalSpeed });
      }
    }

    const raCrossN = office2dCross2d(rax, ray, nx, ny);
    const rbCrossN = office2dCross2d(rbx, rby, nx, ny);
    const effectiveInvMassN = inverseMassSum + raCrossN * raCrossN * a.invInertia + rbCrossN * rbCrossN * b.invInertia;
    const baseRestitution = -normalSpeed > RESTITUTION_VELOCITY_THRESHOLD ? Math.max(a.restitution, b.restitution) : 0;
    const restitution = office2dClamp(baseRestitution * surface.restitutionMultiplier, 0, 0.96);
    const normalImpulse = (-(1 + restitution) * normalSpeed) / effectiveInvMassN;

    const jnx = normalImpulse * nx;
    const jny = normalImpulse * ny;
    a.vx -= jnx * a.invMass;
    a.vy -= jny * a.invMass;
    a.angularVelocity -= office2dCross2d(rax, ray, jnx, jny) * a.invInertia;
    b.vx += jnx * b.invMass;
    b.vy += jny * b.invMass;
    b.angularVelocity += office2dCross2d(rbx, rby, jnx, jny) * b.invInertia;

    // 쿨롱 마찰 + 오프센터 접선 토크(회전 임펄스)
    const tvx = (b.vx - b.angularVelocity * rby) - (a.vx - a.angularVelocity * ray);
    const tvy = (b.vy + b.angularVelocity * rbx) - (a.vy + a.angularVelocity * rax);
    const tangentialX = tvx - (tvx * nx + tvy * ny) * nx;
    const tangentialY = tvy - (tvx * nx + tvy * ny) * ny;
    const tangentLength = Math.hypot(tangentialX, tangentialY);
    if (tangentLength > 1e-6) {
      const tx = tangentialX / tangentLength;
      const ty = tangentialY / tangentLength;
      const raCrossT = office2dCross2d(rax, ray, tx, ty);
      const rbCrossT = office2dCross2d(rbx, rby, tx, ty);
      const effectiveInvMassT = inverseMassSum + raCrossT * raCrossT * a.invInertia + rbCrossT * rbCrossT * b.invInertia;
      const mu = Math.sqrt(a.friction * b.friction) * surface.frictionMultiplier;
      const maxFriction = normalImpulse * mu;
      const frictionImpulse = office2dClamp(-(tvx * tx + tvy * ty) / effectiveInvMassT, -maxFriction, maxFriction);
      const jtx = frictionImpulse * tx;
      const jty = frictionImpulse * ty;
      a.vx -= jtx * a.invMass;
      a.vy -= jty * a.invMass;
      a.angularVelocity -= office2dCross2d(rax, ray, jtx, jty) * a.invInertia;
      b.vx += jtx * b.invMass;
      b.vy += jty * b.invMass;
      b.angularVelocity += office2dCross2d(rbx, rby, jtx, jty) * b.invInertia;
    }

    // 비중심 충돌 시 접선 미끄럼으로 인한 추가 스핀 토크(의자·카트·짐볼 회전감 강화)
    const centerVecX = b.x - a.x;
    const centerVecY = b.y - a.y;
    const centerDist = Math.max(1, Math.hypot(centerVecX, centerVecY));
    const eccentricity = office2dCross2d(centerVecX / centerDist, centerVecY / centerDist, rvx, rvy);
    if (Math.abs(eccentricity) > 4) {
      const spinTorque = office2dClamp(eccentricity * 0.018, -3.2, 3.2);
      if (a.invInertia > 0) a.angularVelocity -= spinTorque;
      if (b.invInertia > 0) b.angularVelocity += spinTorque;
    }

    const squashDelta = Math.min(0.2, -normalSpeed / 950);
    for (const [body, other] of [[a, b], [b, a]] as const) {
      if (body.kind !== "dynamic") continue;
      if (squashDelta > 0.02) body.impactSquash = Math.min(0.22, Math.max(body.impactSquash, squashDelta));
      if (other.kind !== "static") body.idleTime = 0;
      if (body.sleeping && (other.speed > WAKE_SPEED || Math.abs(other.angularVelocity) > 0.25)) body.wake();
    }
  }

  private correctPosition(manifold: Office2dManifold): void {
    const { a, b, nx, ny, depth } = manifold;
    const inverseMassSum = a.invMass + b.invMass;
    if (inverseMassSum === 0) return;
    const correction = (Math.max(depth - POSITION_SLOP, 0) / inverseMassSum) * POSITION_CORRECTION;
    a.x -= correction * nx * a.invMass;
    a.y -= correction * ny * a.invMass;
    b.x += correction * nx * b.invMass;
    b.y += correction * ny * b.invMass;
  }

  private keepInsideWorld(body: Office2dBody): void {
    const { minX, minY, maxX, maxY } = body.bounds();
    if (minX < 0) {
      body.x -= minX;
      body.vx = Math.abs(body.vx) * body.restitution;
      body.angularVelocity *= -0.7;
    }
    if (maxX > this.width) {
      body.x -= maxX - this.width;
      body.vx = -Math.abs(body.vx) * body.restitution;
      body.angularVelocity *= -0.7;
    }
    if (minY < 0) {
      body.y -= minY;
      body.vy = Math.abs(body.vy) * body.restitution;
      body.angularVelocity *= -0.7;
    }
    if (maxY > this.height) {
      body.y -= maxY - this.height;
      body.vy = -Math.abs(body.vy) * body.restitution;
      body.angularVelocity *= -0.7;
    }
  }

  private updateSensors(): { readonly enters: Office2dSensorEvent[]; readonly exits: Office2dSensorEvent[] } {
    const sensors = this.ordered.filter((body) => body.sensor);
    if (!sensors.length) return { enters: [], exits: [] };
    const current = new Set<string>();
    const enters: Office2dSensorEvent[] = [];
    for (const sensor of sensors) {
      const box = sensor.bounds();
      this.movingHash.query(box.minX, box.minY, box.maxX, box.maxY, (body) => {
        if (body === sensor || body.sensor || !office2dLayersCollide(sensor, body)) return;
        if (!office2dCollide(sensor, body)) return;
        const key = `${sensor.id}\u0000${body.id}`;
        current.add(key);
        if (!this.activeSensorPairs.has(key)) enters.push({ sensor: sensor.id, body: body.id });
      });
    }
    const exits: Office2dSensorEvent[] = [];
    for (const key of this.activeSensorPairs) {
      if (current.has(key)) continue;
      const [sensor = "", body = ""] = key.split("\u0000");
      exits.push({ sensor, body });
    }
    this.activeSensorPairs = current;
    return { enters, exits };
  }
}
