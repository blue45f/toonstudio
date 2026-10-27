/**
 * ToonOffice 2D 물리 엔진 — 강체(Office2dBody), 표면 재질 계수, 도형 충돌 판정(narrowphase), 공간 해시(broadphase).
 */

export type Office2dBodyKind = "static" | "dynamic" | "kinematic";

export type Office2dShape =
  | { readonly type: "circle"; readonly radius: number }
  | { readonly type: "box"; readonly halfWidth: number; readonly halfHeight: number };

export type Office2dSurfaceMaterial =
  | "oak"
  | "walnut"
  | "herringbone"
  | "carpet-sage"
  | "carpet-navy"
  | "terrazzo"
  | "concrete"
  | "tile-cream"
  | "cork"
  | "generic";

export interface Office2dSurfacePhysics {
  readonly dampingMultiplier: number;
  readonly frictionMultiplier: number;
  readonly restitutionMultiplier: number;
}

export const OFFICE2D_SURFACE_PHYSICS: Readonly<Record<Office2dSurfaceMaterial, Office2dSurfacePhysics>> = Object.freeze({
  oak: Object.freeze({ dampingMultiplier: 1.0, frictionMultiplier: 1.0, restitutionMultiplier: 1.0 }),
  walnut: Object.freeze({ dampingMultiplier: 1.02, frictionMultiplier: 1.02, restitutionMultiplier: 0.98 }),
  herringbone: Object.freeze({ dampingMultiplier: 0.98, frictionMultiplier: 0.98, restitutionMultiplier: 1.0 }),
  "carpet-sage": Object.freeze({ dampingMultiplier: 1.48, frictionMultiplier: 1.28, restitutionMultiplier: 0.78 }),
  "carpet-navy": Object.freeze({ dampingMultiplier: 1.54, frictionMultiplier: 1.32, restitutionMultiplier: 0.75 }),
  terrazzo: Object.freeze({ dampingMultiplier: 0.68, frictionMultiplier: 0.72, restitutionMultiplier: 1.14 }),
  concrete: Object.freeze({ dampingMultiplier: 0.84, frictionMultiplier: 0.88, restitutionMultiplier: 1.08 }),
  "tile-cream": Object.freeze({ dampingMultiplier: 0.66, frictionMultiplier: 0.7, restitutionMultiplier: 1.15 }),
  cork: Object.freeze({ dampingMultiplier: 1.26, frictionMultiplier: 1.16, restitutionMultiplier: 0.84 }),
  generic: Object.freeze({ dampingMultiplier: 1.0, frictionMultiplier: 1.0, restitutionMultiplier: 1.0 }),
});

export interface Office2dSurfaceRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly material: Office2dSurfaceMaterial;
}

export interface Office2dSpringJoint {
  readonly id: string;
  readonly bodyA: string;
  /** bodyB를 생략하면 anchorPoint(월드 고정점)와의 훅 스프링으로 작동한다. */
  readonly bodyB?: string;
  readonly anchorPoint?: { readonly x: number; readonly y: number };
  readonly restLength: number;
  readonly stiffness: number;
  readonly damping: number;
}

export interface Office2dBodyInit {
  readonly id: string;
  readonly kind: Office2dBodyKind;
  readonly shape: Office2dShape;
  readonly x: number;
  readonly y: number;
  /** 동적 물체 질량(kg 감각). 기본 1. 정적·키네마틱은 무시한다. */
  readonly mass?: number;
  /** 반발 계수 0~1. 두 물체 중 큰 값을 쓴다. */
  readonly restitution?: number;
  /** 접촉면 쿨롱 마찰 계수 0~1. 두 물체의 기하 평균을 쓴다. */
  readonly friction?: number;
  /** 바닥 마찰(초당 감쇠율). 클수록 빨리 멈춘다. */
  readonly linearDamping?: number;
  /** 회전 감쇠율(초당). 기본 4.5. */
  readonly angularDamping?: number;
  /** 비선형 공기/유체 저항 계수(v·|v| 비례). 기본 0.0008. */
  readonly quadraticDrag?: number;
  /** 회전이 고정된 물체인지(아바타는 true, 바퀴 의자·카트·공은 false). */
  readonly fixedRotation?: boolean;
  /** 구르는 구체 여부(짐볼 등: 마그누스 커브 및 구름 회전 적용). */
  readonly rolls?: boolean;
  /** 최대 속력(px/s). */
  readonly maxSpeed?: number;
  readonly sensor?: boolean;
  /** 충돌 분류 비트. */
  readonly category?: number;
  /** 함께 충돌할 분류 비트 마스크. */
  readonly mask?: number;
  /** 한동안 아무도 건드리지 않으면 훅의 법칙 스프링-댐퍼 복원력으로 제자리로 돌아간다. */
  readonly returnHome?: boolean;
  /** 렌더러·게임 로직용 꼬리표(스프라이트 키 등). */
  readonly tag?: string;
}

export const OFFICE2D_CATEGORY = Object.freeze({
  world: 0b0001,
  prop: 0b0010,
  actor: 0b0100,
  sensor: 0b1000,
} as const);

const ALL_CATEGORIES = 0xffff;

export function office2dClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function office2dCross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function office2dWrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function office2dLayersCollide(a: Office2dBody, b: Office2dBody): boolean {
  return (a.category & b.mask) !== 0 && (b.category & a.mask) !== 0;
}

export class Office2dBody {
  readonly id: string;
  readonly kind: Office2dBodyKind;
  readonly shape: Office2dShape;
  readonly invMass: number;
  readonly invInertia: number;
  readonly restitution: number;
  readonly friction: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly quadraticDrag: number;
  readonly fixedRotation: boolean;
  readonly rolls: boolean;
  readonly maxSpeed: number;
  readonly sensor: boolean;
  readonly category: number;
  /** 함께 충돌할 분류. 고스트 모드처럼 실행 중에 바뀔 수 있다(setCollisionMask). */
  mask: number;
  readonly tag: string | undefined;
  readonly homeX: number;
  readonly homeY: number;
  readonly returnHome: boolean;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  /** 강체 회전 각도(rad). 토크에 의해 변화하며 렌더러가 소품 회전에 반영한다. */
  angle = 0;
  /** 각속도 ω (rad/s). */
  angularVelocity = 0;
  /** 굴러간 거리 누적 각도(rad). 구체 구름 및 바퀴 진동 위상에 쓴다. */
  spin = 0;
  /** 충돌 시 부피 보존 탄성 압축량(0~0.25). 렌더러가 스쿼시 앤 스트레치로 표현한다. */
  impactSquash = 0;
  sleeping = false;
  sleepTime = 0;
  /** 마지막으로 다른 비정적 물체와 닿은 뒤 흐른 시간(초). */
  idleTime = 0;
  /** 키네마틱 목표 지점. */
  targetX: number;
  targetY: number;

  constructor(init: Office2dBodyInit) {
    if (!init.id) throw new Error("office2d body id is required");
    if (![init.x, init.y].every(Number.isFinite)) throw new Error(`office2d body position is invalid: ${init.id}`);
    if (init.shape.type === "circle" ? !(init.shape.radius > 0) : !(init.shape.halfWidth > 0 && init.shape.halfHeight > 0)) {
      throw new Error(`office2d body shape is invalid: ${init.id}`);
    }
    const mass = init.mass ?? 1;
    this.id = init.id;
    this.kind = init.kind;
    this.shape = init.shape;
    const isDynamic = init.kind === "dynamic" && mass > 0 && Number.isFinite(mass);
    this.invMass = isDynamic ? 1 / mass : 0;
    this.category = init.category ?? (init.sensor === true ? OFFICE2D_CATEGORY.sensor : OFFICE2D_CATEGORY.world);
    this.fixedRotation = init.fixedRotation ?? (this.category === OFFICE2D_CATEGORY.actor || !isDynamic);
    if (isDynamic && !this.fixedRotation) {
      const inertia =
        init.shape.type === "circle"
          ? 0.5 * mass * init.shape.radius * init.shape.radius
          : (mass / 3) * (init.shape.halfWidth * init.shape.halfWidth + init.shape.halfHeight * init.shape.halfHeight);
      this.invInertia = inertia > 1e-4 ? 1 / inertia : 0;
    } else {
      this.invInertia = 0;
    }
    this.restitution = office2dClamp(init.restitution ?? 0.1, 0, 1);
    this.friction = office2dClamp(init.friction ?? 0.4, 0, 1);
    this.linearDamping = Math.max(0, init.linearDamping ?? 4);
    this.angularDamping = Math.max(0, init.angularDamping ?? 4.5);
    this.quadraticDrag = Math.max(0, init.quadraticDrag ?? 0.0008);
    this.rolls = init.rolls === true;
    this.maxSpeed = Math.max(1, init.maxSpeed ?? 900);
    this.sensor = init.sensor === true;
    this.mask = init.mask ?? ALL_CATEGORIES;
    this.tag = init.tag;
    this.x = init.x;
    this.y = init.y;
    this.homeX = init.x;
    this.homeY = init.y;
    this.targetX = init.x;
    this.targetY = init.y;
    this.returnHome = init.returnHome === true && init.kind === "dynamic";
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** 최소 반경(CCD 세분화 임계 계산용). */
  minRadius(): number {
    return this.shape.type === "circle" ? this.shape.radius : Math.min(this.shape.halfWidth, this.shape.halfHeight);
  }

  /** 도형을 감싸는 축 정렬 경계. */
  bounds(): { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } {
    const hw = this.shape.type === "circle" ? this.shape.radius : this.shape.halfWidth;
    const hh = this.shape.type === "circle" ? this.shape.radius : this.shape.halfHeight;
    return { minX: this.x - hw, minY: this.y - hh, maxX: this.x + hw, maxY: this.y + hh };
  }

  wake(): void {
    this.sleeping = false;
    this.sleepTime = 0;
  }
}

export interface Office2dManifold {
  readonly a: Office2dBody;
  readonly b: Office2dBody;
  readonly nx: number;
  readonly ny: number;
  readonly depth: number;
  readonly contactX: number;
  readonly contactY: number;
}

/** 두 도형의 겹침과 접촉점을 계산한다. 겹치지 않으면 null. 법선은 a → b 방향이다. */
export function office2dCollide(a: Office2dBody, b: Office2dBody): Office2dManifold | null {
  if (a.shape.type === "circle" && b.shape.type === "circle") return circleCircle(a, b, a.shape.radius, b.shape.radius);
  if (a.shape.type === "circle" && b.shape.type === "box") {
    const manifold = circleBox(a, a.shape.radius, b, b.shape.halfWidth, b.shape.halfHeight);
    return manifold
      ? { a, b, nx: -manifold.nx, ny: -manifold.ny, depth: manifold.depth, contactX: manifold.contactX, contactY: manifold.contactY }
      : null;
  }
  if (a.shape.type === "box" && b.shape.type === "circle") {
    const manifold = circleBox(b, b.shape.radius, a, a.shape.halfWidth, a.shape.halfHeight);
    return manifold
      ? { a, b, nx: manifold.nx, ny: manifold.ny, depth: manifold.depth, contactX: manifold.contactX, contactY: manifold.contactY }
      : null;
  }
  if (a.shape.type === "box" && b.shape.type === "box") return boxBox(a, b, a.shape, b.shape);
  return null;
}

function circleCircle(a: Office2dBody, b: Office2dBody, ra: number, rb: number): Office2dManifold | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distanceSquared = dx * dx + dy * dy;
  const radii = ra + rb;
  if (distanceSquared >= radii * radii) return null;
  const distance = Math.sqrt(distanceSquared);
  if (distance < 1e-6) {
    return { a, b, nx: 1, ny: 0, depth: radii, contactX: a.x, contactY: a.y };
  }
  const nx = dx / distance;
  const ny = dy / distance;
  const depth = radii - distance;
  return {
    a,
    b,
    nx,
    ny,
    depth,
    contactX: a.x + nx * (ra - depth * 0.5),
    contactY: a.y + ny * (ra - depth * 0.5),
  };
}

/** 원 → 상자 결과의 법선은 상자 → 원 방향이다. */
function circleBox(
  circle: Office2dBody,
  radius: number,
  box: Office2dBody,
  halfWidth: number,
  halfHeight: number,
): { readonly nx: number; readonly ny: number; readonly depth: number; readonly contactX: number; readonly contactY: number } | null {
  const localX = circle.x - box.x;
  const localY = circle.y - box.y;
  const closestX = office2dClamp(localX, -halfWidth, halfWidth);
  const closestY = office2dClamp(localY, -halfHeight, halfHeight);
  const inside = closestX === localX && closestY === localY;
  if (inside) {
    const pushX = halfWidth - Math.abs(localX);
    const pushY = halfHeight - Math.abs(localY);
    if (pushX < pushY) {
      const sign = localX < 0 ? -1 : 1;
      return { nx: sign, ny: 0, depth: pushX + radius, contactX: box.x + sign * halfWidth, contactY: circle.y };
    }
    const sign = localY < 0 ? -1 : 1;
    return { nx: 0, ny: sign, depth: pushY + radius, contactX: circle.x, contactY: box.y + sign * halfHeight };
  }
  const dx = localX - closestX;
  const dy = localY - closestY;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= radius * radius) return null;
  const distance = Math.sqrt(distanceSquared);
  if (distance < 1e-6) {
    return { nx: 0, ny: -1, depth: radius, contactX: box.x + closestX, contactY: box.y + closestY };
  }
  return {
    nx: dx / distance,
    ny: dy / distance,
    depth: radius - distance,
    contactX: box.x + closestX,
    contactY: box.y + closestY,
  };
}

function boxBox(
  a: Office2dBody,
  b: Office2dBody,
  shapeA: { readonly halfWidth: number; readonly halfHeight: number },
  shapeB: { readonly halfWidth: number; readonly halfHeight: number },
): Office2dManifold | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const overlapX = shapeA.halfWidth + shapeB.halfWidth - Math.abs(dx);
  if (overlapX <= 0) return null;
  const overlapY = shapeA.halfHeight + shapeB.halfHeight - Math.abs(dy);
  if (overlapY <= 0) return null;
  const minX = Math.max(a.x - shapeA.halfWidth, b.x - shapeB.halfWidth);
  const maxX = Math.min(a.x + shapeA.halfWidth, b.x + shapeB.halfWidth);
  const minY = Math.max(a.y - shapeA.halfHeight, b.y - shapeB.halfHeight);
  const maxY = Math.min(a.y + shapeA.halfHeight, b.y + shapeB.halfHeight);
  const contactX = 0.5 * (minX + maxX);
  const contactY = 0.5 * (minY + maxY);
  if (overlapX < overlapY) return { a, b, nx: dx < 0 ? -1 : 1, ny: 0, depth: overlapX, contactX, contactY };
  return { a, b, nx: 0, ny: dy < 0 ? -1 : 1, depth: overlapY, contactX, contactY };
}

function cellKey(cx: number, cy: number): number {
  return (cy + 1024) * 4096 + (cx + 1024);
}

/** 균일 격자 공간 해시. 넓은 단계(broadphase) 후보 쌍을 만든다. */
export class Office2dSpatialHash {
  private readonly cells = new Map<number, Office2dBody[]>();

  constructor(private readonly cellSize: number) {}

  clear(): void {
    this.cells.clear();
  }

  insert(body: Office2dBody): void {
    const { minX, minY, maxX, maxY } = body.bounds();
    const x0 = Math.floor(minX / this.cellSize);
    const y0 = Math.floor(minY / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const y1 = Math.floor(maxY / this.cellSize);
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const key = cellKey(cx, cy);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(body);
        else this.cells.set(key, [body]);
      }
    }
  }

  query(minX: number, minY: number, maxX: number, maxY: number, visit: (body: Office2dBody) => void): void {
    const seen = new Set<Office2dBody>();
    const x0 = Math.floor(minX / this.cellSize);
    const y0 = Math.floor(minY / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const y1 = Math.floor(maxY / this.cellSize);
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const bucket = this.cells.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const body of bucket) {
          if (seen.has(body)) continue;
          seen.add(body);
          visit(body);
        }
      }
    }
  }
}
