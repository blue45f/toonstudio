/**
 * 3D/2D OBB·AABB 간섭 방지 & 중력 안착 솔버 · 포물선 탄도/유리파편/꽃잎 물리 궤적 프레임 추출 ·
 * Web MIDI 8채널 노브/페이더 믹서 · USB/BLE 3-페달 풋 스위치 핸즈프리 라우터 (Wave 29).
 * 순수 메모리 결정론적 연산(네트워크·스토리지·원시 색상 코드 없음).
 */

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface EulerDeg { readonly x: number; readonly y: number; readonly z: number }

export interface CollisionBodyInput {
  readonly id: string; readonly label?: string; readonly shape: "obb" | "aabb";
  readonly center: Vec3; readonly halfExtents: Vec3; readonly rotationDeg?: EulerDeg;
  readonly isStatic?: boolean; readonly massKg?: number; readonly enableGravityDrop?: boolean;
}

export interface CollisionResolveOptions {
  readonly floorY?: number; readonly minClearanceMm?: number; readonly maxIterations?: number;
  readonly dimensionMode?: "3d" | "2d"; readonly allowStacking?: boolean;
}

export interface ResolvedCollisionBody {
  readonly id: string; readonly label: string; readonly shape: "obb" | "aabb"; readonly isStatic: boolean;
  readonly initialCenter: Vec3; readonly resolvedCenter: Vec3; readonly halfExtents: Vec3; readonly rotationDeg: EulerDeg;
  readonly displacementMm: number; readonly minWorldY: number; readonly maxWorldY: number;
  readonly grounded: boolean; readonly supportedById: string | null;
}

export interface CollisionResolveResult {
  readonly bodies: readonly ResolvedCollisionBody[];
  readonly initialMaxPenetrationMm: number; readonly finalMaxPenetrationMm: number;
  readonly zeroPenetrationVerified: boolean; readonly resolvedPairCount: number;
  readonly iterationsUsed: number; readonly floorY: number;
  readonly summaryKo: string; readonly summaryEn: string;
}

export type TrajectoryPreset = "ballistic" | "glass-shatter" | "petal-drift";

export interface TrajectorySimulationInput {
  readonly preset: TrajectoryPreset; readonly timeSec: number; readonly fps?: number;
  readonly origin?: Vec3; readonly initialVelocity?: Vec3;
  readonly gravityMps2?: number; readonly dragCoefficient?: number; readonly restitution?: number;
  readonly wind?: Vec3; readonly floorY?: number; readonly particleCount?: number;
  readonly seed?: number; readonly trailSteps?: number;
}

export interface TrajectoryParticleState {
  readonly id: string; readonly position: Vec3; readonly velocity: Vec3; readonly speedMps: number;
  readonly rotationDeg: EulerDeg; readonly scale: number; readonly glintIntensity: number;
  readonly motionBlurAngleDeg: number; readonly motionBlurLengthPx: number;
  readonly bounces: number; readonly settled: boolean; readonly trail: readonly Vec3[];
}

export interface TrajectoryFrameSnapshot {
  readonly preset: TrajectoryPreset; readonly timeSec: number; readonly fps: number; readonly frameIndex: number;
  readonly particles: readonly TrajectoryParticleState[];
  readonly metrics: {
    readonly apexHeightM: number; readonly maxHorizontalRangeM: number;
    readonly activeParticleCount: number; readonly settledParticleCount: number; readonly averageSpeedMps: number;
  };
  readonly summaryKo: string; readonly summaryEn: string;
}

export type StudioMidiControlId =
  | "brush-size" | "opacity" | "moisture" | "paper-grain"
  | "impasto" | "color-temp" | "lightness" | "saturation";

export interface MidiChannelBinding {
  readonly cc: number; readonly controlId: StudioMidiControlId;
  readonly labelKo: string; readonly labelEn: string; readonly unit: string;
  readonly min: number; readonly max: number;
  readonly curve: "linear" | "exponential" | "bipolar-center-detent";
  readonly defaultValue: number;
}

export type MidiMixerValues = Readonly<Record<StudioMidiControlId, number>>;

export interface MidiCcControlInput {
  readonly status: number; readonly cc: number; readonly value: number; readonly lsbValue?: number;
  readonly channelMap?: readonly MidiChannelBinding[]; readonly currentValues?: Partial<MidiMixerValues>;
  readonly pickupMode?: boolean; readonly smoothingAlpha?: number;
}

export interface MidiCcMappedResult {
  readonly matched: boolean; readonly rejectReason?: "not-cc-status" | "unmapped-cc";
  readonly midiChannel: number; readonly cc: number;
  readonly controlId?: StudioMidiControlId; readonly labelKo?: string; readonly labelEn?: string; readonly unit?: string;
  readonly normalized: number; readonly mappedValue: number; readonly formattedValue: string;
  readonly pickedUp: boolean; readonly deltaFromPrevious: number;
  readonly ledFeedbackBytes: readonly [number, number, number];
}

export type FootPedalSlot = "left" | "center" | "right";
export type FootPedalTransport = "usb-hid" | "ble-midi" | "keyboard-emulation";
export type StudioDrawingTool = "brush" | "eraser" | "pen" | "fill" | "lasso";
export type FootPedalBindingAction = "undo" | "momentary-eraser" | "canvas-flip-horizontal";

export interface FootPedalRouterState {
  readonly activeTool: StudioDrawingTool; readonly toolBeforeHold: StudioDrawingTool | null;
  readonly canvasFlippedH: boolean; readonly undoCount: number; readonly redoCount: number;
  readonly pressedPedals: readonly FootPedalSlot[];
  readonly lastEventAtByPedal: Readonly<Record<FootPedalSlot, number>>;
  readonly lastTapAtByPedal: Readonly<Record<FootPedalSlot, number>>;
}

export interface FootPedalEventInput {
  readonly pedal: FootPedalSlot; readonly phase: "down" | "up"; readonly timestampMs: number;
  readonly transport?: FootPedalTransport; readonly debounceMs?: number; readonly doubleTapWindowMs?: number;
  readonly bindings?: Readonly<Record<FootPedalSlot, FootPedalBindingAction>>;
}

export interface FootPedalRouteResult {
  readonly accepted: boolean; readonly rejectReason?: "debounced" | "duplicate-phase";
  readonly transport: FootPedalTransport;
  readonly command: "undo" | "redo" | "momentary-eraser-engage" | "momentary-eraser-release" | "canvas-flip-horizontal" | "none";
  readonly nextState: FootPedalRouterState; readonly summaryKo: string; readonly summaryEn: string;
}

interface InternalObb {
  readonly id: string; readonly label: string; readonly shape: "obb" | "aabb";
  readonly isStatic: boolean; readonly invMass: number; readonly enableGravityDrop: boolean;
  readonly initialCenter: Vec3; center: { x: number; y: number; z: number };
  readonly halfExtents: Vec3; readonly rotationDeg: EulerDeg;
  readonly axes: readonly [Vec3, Vec3, Vec3]; supportedById: string | null;
}

const ZERO_VEC: Vec3 = { x: 0, y: 0, z: 0 };
const SAT_ZERO_EPS = 1e-7;
const DEG_TO_RAD = Math.PI / 180;

function clamp(v: number, min: number, max: number): number { return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min; }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }
function round2(v: number): number { return Math.round(v * 100) / 100; }
function dot3(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross3(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }

function normalize3(v: Vec3): Vec3 | null {
  const lenSq = v.x * v.x + v.y * v.y + v.z * v.z;
  if (lenSq < 1e-12) return null;
  const inv = 1 / Math.sqrt(lenSq);
  return { x: v.x * inv, y: v.y * inv, z: v.z * inv };
}

function buildObbAxes(rot: EulerDeg): readonly [Vec3, Vec3, Vec3] {
  const rx = rot.x * DEG_TO_RAD; const ry = rot.y * DEG_TO_RAD; const rz = rot.z * DEG_TO_RAD;
  const cx = Math.cos(rx); const sx = Math.sin(rx);
  const cy = Math.cos(ry); const sy = Math.sin(ry);
  const cz = Math.cos(rz); const sz = Math.sin(rz);
  return [
    { x: cy * cz, y: cy * sz, z: -sy },
    { x: sx * sy * cz - cx * sz, y: sx * sy * sz + cx * cz, z: sx * cy },
    { x: cx * sy * cz + sx * sz, y: cx * sy * sz - sx * cz, z: cx * cy },
  ];
}

function projectedRadius(b: InternalObb, axis: Vec3): number {
  return Math.abs(dot3(b.axes[0], axis)) * b.halfExtents.x + Math.abs(dot3(b.axes[1], axis)) * b.halfExtents.y + Math.abs(dot3(b.axes[2], axis)) * b.halfExtents.z;
}

function worldAxisExtent(b: InternalObb, key: "x" | "y" | "z"): number {
  return Math.abs(b.axes[0][key]) * b.halfExtents.x + Math.abs(b.axes[1][key]) * b.halfExtents.y + Math.abs(b.axes[2][key]) * b.halfExtents.z;
}

function minWorldY(b: InternalObb): number { return b.center.y - worldAxisExtent(b, "y"); }
function maxWorldY(b: InternalObb): number { return b.center.y + worldAxisExtent(b, "y"); }

function horizontalFootprintOverlaps(a: InternalObb, b: InternalObb, is2d: boolean): boolean {
  if (Math.abs(a.center.x - b.center.x) >= worldAxisExtent(a, "x") + worldAxisExtent(b, "x") - 1e-4) return false;
  if (is2d) return true;
  if (Math.abs(a.center.z - b.center.z) >= worldAxisExtent(a, "z") + worldAxisExtent(b, "z") - 1e-4) return false;
  // 회전 OBB 대각 인접 오탐을 막기 위해 XZ 평면 2D SAT 투영으로 정밀 겹침을 판정한다.
  const dx = b.center.x - a.center.x;
  const dz = b.center.z - a.center.z;
  for (const raw of [a.axes[0], a.axes[2], b.axes[0], b.axes[2]]) {
    const flat = normalize3({ x: raw.x, y: 0, z: raw.z });
    if (!flat) continue;
    const dist = Math.abs(dx * flat.x + dz * flat.z);
    if (dist >= projectedRadius(a, flat) + projectedRadius(b, flat) - 1e-4) return false;
  }
  return true;
}

function computeSatMtv(
  a: InternalObb,
  b: InternalObb,
  clearanceM: number,
  is2d: boolean,
  pairTieSign: number,
): { readonly normal: Vec3; readonly depth: number } | null {
  const candidates: Vec3[] = [];
  if (is2d) {
    for (const axis of [a.axes[0], a.axes[1], b.axes[0], b.axes[1]]) {
      const flat = normalize3({ x: axis.x, y: axis.y, z: 0 });
      if (flat) candidates.push(flat);
    }
  } else {
    candidates.push(a.axes[0], a.axes[1], a.axes[2], b.axes[0], b.axes[1], b.axes[2]);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const crossed = normalize3(cross3(a.axes[i], b.axes[j]));
        if (crossed) candidates.push(crossed);
      }
    }
  }

  const delta: Vec3 = { x: b.center.x - a.center.x, y: b.center.y - a.center.y, z: is2d ? 0 : b.center.z - a.center.z };
  let minDepth = Number.POSITIVE_INFINITY;
  let bestNormal: Vec3 = { x: pairTieSign, y: 0, z: 0 };

  for (const axis of candidates) {
    const dist = dot3(delta, axis);
    const overlap = projectedRadius(a, axis) + projectedRadius(b, axis) + clearanceM - Math.abs(dist);
    if (overlap <= SAT_ZERO_EPS) return null;
    if (overlap < minDepth) {
      minDepth = overlap;
      const sign = Math.abs(dist) < 1e-9 ? pairTieSign : dist >= 0 ? 1 : -1;
      bestNormal = { x: axis.x * sign, y: axis.y * sign, z: axis.z * sign };
    }
  }
  return Number.isFinite(minDepth) ? { normal: bestNormal, depth: minDepth } : null;
}

function measureMaxPenetrationM(bodies: readonly InternalObb[], clearanceM: number, is2d: boolean): number {
  let maxPen = 0;
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      if (bodies[i].isStatic && bodies[j].isStatic) continue;
      const mtv = computeSatMtv(bodies[i], bodies[j], clearanceM, is2d, 1);
      if (mtv && mtv.depth > maxPen) maxPen = mtv.depth;
    }
  }
  return maxPen;
}

/** 3D/2D OBB·AABB 오브젝트 간섭을 0mm로 해소하고 중력 방향으로 바닥 또는 하부 지지면에 안착시킨다. */
export function resolveObjectCollisionAndDropToFloor(
  inputs: readonly CollisionBodyInput[],
  options?: CollisionResolveOptions,
): CollisionResolveResult {
  const floorY = options?.floorY ?? 0;
  const clearanceM = Math.max(0, (options?.minClearanceMm ?? 0) / 1000);
  const maxIterations = Math.round(clamp(options?.maxIterations ?? 48, 4, 160));
  const is2d = options?.dimensionMode === "2d";
  const allowStacking = options?.allowStacking ?? true;

  const bodies: InternalObb[] = inputs.map((item) => {
    const isStatic = Boolean(item.isStatic);
    const rot: EulerDeg = item.shape === "aabb" ? ZERO_VEC : (item.rotationDeg ?? ZERO_VEC);
    return {
      id: item.id, label: item.label ?? item.id, shape: item.shape, isStatic,
      invMass: isStatic ? 0 : 1 / Math.max(0.05, item.massKg ?? 1),
      enableGravityDrop: item.enableGravityDrop ?? !isStatic,
      initialCenter: { ...item.center }, center: { ...item.center },
      halfExtents: { x: Math.max(0.001, Math.abs(item.halfExtents.x)), y: Math.max(0.001, Math.abs(item.halfExtents.y)), z: Math.max(0.001, Math.abs(item.halfExtents.z)) },
      rotationDeg: rot, axes: buildObbAxes(rot), supportedById: null,
    };
  });

  const initialMaxPenetrationMm = round3(measureMaxPenetrationM(bodies, clearanceM, is2d) * 1000);
  const resolvedPairs = new Set<string>();
  let iterationsUsed = 0;

  const runSatPass = (budget: number, enforceFloor: boolean): void => {
    for (let iter = 0; iter < budget; iter += 1) {
      let anyMoved = false;
      iterationsUsed += 1;
      for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
          const a = bodies[i]; const b = bodies[j];
          if (a.isStatic && b.isStatic) continue;
          const mtv = computeSatMtv(a, b, clearanceM, is2d, i < j ? 1 : -1);
          if (!mtv) continue;

          resolvedPairs.add(`${a.id}::${b.id}`);
          const push = mtv.depth + 4e-7;
          const totalInv = a.invMass + b.invMass;
          const shareA = totalInv > 0 ? a.invMass / totalInv : 0;
          const shareB = totalInv > 0 ? b.invMass / totalInv : 0;

          if (!a.isStatic) {
            a.center.x -= mtv.normal.x * push * shareA;
            a.center.y -= mtv.normal.y * push * shareA;
            if (!is2d) a.center.z -= mtv.normal.z * push * shareA;
            if (enforceFloor && a.enableGravityDrop && minWorldY(a) < floorY) a.center.y += floorY - minWorldY(a);
          }
          if (!b.isStatic) {
            b.center.x += mtv.normal.x * push * shareB;
            b.center.y += mtv.normal.y * push * shareB;
            if (!is2d) b.center.z += mtv.normal.z * push * shareB;
            if (enforceFloor && b.enableGravityDrop && minWorldY(b) < floorY) b.center.y += floorY - minWorldY(b);
          }
          anyMoved = true;
        }
      }
      if (!anyMoved) break;
    }
  };

  runSatPass(Math.max(8, Math.floor(maxIterations / 2)), false);

  const dropOrder = bodies.filter((b) => !b.isStatic && b.enableGravityDrop).sort((a, b) => minWorldY(a) - minWorldY(b));
  const settledSet = new Set<string>(bodies.filter((b) => b.isStatic).map((b) => b.id));
  for (const body of dropOrder) {
    let supportY = floorY;
    let supportedBy = "floor";
    if (allowStacking) {
      for (const candidate of bodies) {
        if (candidate.id === body.id || !settledSet.has(candidate.id)) continue;
        if (!horizontalFootprintOverlaps(body, candidate, is2d)) continue;
        const candTop = maxWorldY(candidate);
        if (candTop <= minWorldY(body) + 0.025 && candTop + clearanceM >= supportY) {
          supportY = candTop + clearanceM;
          supportedBy = candidate.id;
        }
      }
    }
    body.center.y += supportY - minWorldY(body);
    body.supportedById = supportedBy;
    settledSet.add(body.id);
  }

  runSatPass(maxIterations, true);

  const finalMaxPenM = measureMaxPenetrationM(bodies, clearanceM, is2d);
  const finalMaxPenetrationMm = finalMaxPenM <= SAT_ZERO_EPS ? 0 : round3(finalMaxPenM * 1000);
  const resolvedBodies: ResolvedCollisionBody[] = bodies.map((b) => {
    const bottomY = round3(minWorldY(b));
    return {
      id: b.id, label: b.label, shape: b.shape, isStatic: b.isStatic,
      initialCenter: b.initialCenter,
      resolvedCenter: { x: round3(b.center.x), y: round3(b.center.y), z: round3(b.center.z) },
      halfExtents: b.halfExtents, rotationDeg: b.rotationDeg,
      displacementMm: round2(Math.hypot(b.center.x - b.initialCenter.x, b.center.y - b.initialCenter.y, b.center.z - b.initialCenter.z) * 1000),
      minWorldY: bottomY, maxWorldY: round3(maxWorldY(b)),
      grounded: !b.enableGravityDrop || b.supportedById !== null || Math.abs(bottomY - floorY) <= 0.002,
      supportedById: b.supportedById,
    };
  });

  return {
    bodies: resolvedBodies, initialMaxPenetrationMm, finalMaxPenetrationMm,
    zeroPenetrationVerified: finalMaxPenetrationMm === 0,
    resolvedPairCount: resolvedPairs.size, iterationsUsed, floorY,
    summaryKo: `초기 간섭 ${initialMaxPenetrationMm}mm → 최종 ${finalMaxPenetrationMm}mm (${resolvedPairs.size}쌍 해소 · 바닥 안착 완료)`,
    summaryEn: `Penetration ${initialMaxPenetrationMm}mm -> ${finalMaxPenetrationMm}mm (${resolvedPairs.size} pairs resolved · Floor grounded)`,
  };
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 포물선 탄도 · 유리파편 폭발 · 꽃잎 흩날림 물리 궤적의 지정 시점 프레임을 추출한다. */
export function simulatePhysicalTrajectoryFrame(input: TrajectorySimulationInput): TrajectoryFrameSnapshot {
  const preset = input.preset;
  const timeSec = round3(clamp(input.timeSec, 0, 15));
  const fps = Math.round(clamp(input.fps ?? 24, 12, 120));
  const frameIndex = Math.round(timeSec * fps);
  const floorY = input.floorY ?? 0;
  const trailSteps = Math.round(clamp(input.trailSteps ?? 8, 2, 24));
  const rng = createMulberry32(Math.trunc(input.seed ?? 2901));

  const defaults =
    preset === "ballistic"
      ? { origin: { x: 0, y: 1.5, z: 0 }, velocity: { x: 10.8, y: 7.4, z: 0 }, gravity: 9.81, drag: 0.04, restitution: 0.58, wind: ZERO_VEC, count: 1 }
      : preset === "glass-shatter"
        ? { origin: { x: 0, y: 1.8, z: 0 }, velocity: { x: 4.2, y: 2.5, z: 0 }, gravity: 9.81, drag: 0.24, restitution: 0.36, wind: ZERO_VEC, count: 14 }
        : { origin: { x: -1.4, y: 3.2, z: 0 }, velocity: { x: 1.2, y: -0.2, z: 0 }, gravity: 1.15, drag: 1.45, restitution: 0.05, wind: { x: 1.55, y: 0.12, z: 0.2 }, count: 12 };

  const origin = input.origin ?? defaults.origin;
  const baseVel = input.initialVelocity ?? defaults.velocity;
  const gravity = Math.max(0.05, input.gravityMps2 ?? defaults.gravity);
  const drag = Math.max(0, input.dragCoefficient ?? defaults.drag);
  const restitution = clamp(input.restitution ?? defaults.restitution, 0, 0.95);
  const wind = input.wind ?? defaults.wind;
  const count = Math.round(clamp(input.particleCount ?? defaults.count, 1, 48));

  const dt = 1 / 120;
  const totalSteps = Math.max(0, Math.round(timeSec / dt));
  const sampleStride = Math.max(1, Math.floor(Math.max(1, totalSteps) / trailSteps));

  const particles: TrajectoryParticleState[] = [];
  let apexHeightM = origin.y;
  let maxHorizontalRangeM = 0;
  let speedSum = 0;
  let settledCount = 0;

  for (let idx = 0; idx < count; idx += 1) {
    let x = origin.x; let y = origin.y; let z = origin.z;
    let vx = baseVel.x; let vy = baseVel.y; let vz = baseVel.z;
    let wx = 0; let wy = 0; let wz = 0; let scale = 1;
    const flutterPhase = rng() * Math.PI * 2;
    const flutterFreq = 3.2 + rng() * 2.4;

    if (preset === "glass-shatter") {
      const az = (idx / count) * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const el = (rng() - 0.25) * 1.15;
      const burst = 2.8 + rng() * 5.6;
      vx += Math.cos(az) * Math.cos(el) * burst;
      vy += Math.sin(el) * burst + 1.2;
      vz += Math.sin(az) * Math.cos(el) * burst;
      wx = (rng() - 0.5) * 780; wy = (rng() - 0.5) * 780; wz = (rng() - 0.5) * 900;
      scale = round2(0.45 + rng() * 0.85);
    } else if (preset === "petal-drift") {
      x += (rng() - 0.5) * 1.6; y += (rng() - 0.5) * 0.9; z += (rng() - 0.5) * 0.8;
      vx += (rng() - 0.5) * 0.6; vy += (rng() - 0.5) * 0.3; vz += (rng() - 0.5) * 0.4;
      wx = 35 + rng() * 65; wy = 45 + rng() * 75; wz = 30 + rng() * 55;
      scale = round2(0.55 + rng() * 0.65);
    }

    let rx = 0; let ry = 0; let rz = 0; let bounces = 0; let settled = false;
    const trail: Vec3[] = [{ x: round3(x), y: round3(y), z: round3(z) }];

    for (let step = 1; step <= totalSteps; step += 1) {
      const t = step * dt;
      if (!settled) {
        let ax = -drag * (vx - wind.x);
        let ay = -gravity - drag * (vy - wind.y);
        let az = -drag * (vz - wind.z);
        if (preset === "petal-drift") {
          ax += Math.sin(t * flutterFreq + flutterPhase) * 1.65;
          ay += Math.cos(t * flutterFreq * 0.8 + flutterPhase) * 0.55;
          az += Math.sin(t * flutterFreq * 0.65 + flutterPhase) * 0.8;
        }
        vx += ax * dt; vy += ay * dt; vz += az * dt;
        x += vx * dt; y += vy * dt; z += vz * dt;
        rx += wx * dt; ry += wy * dt; rz += wz * dt;
        if (y > apexHeightM) apexHeightM = y;

        if (y <= floorY) {
          y = floorY;
          if (Math.abs(vy) > 0.35 && restitution > 0.08) {
            vy = -vy * restitution; vx *= 0.78; vz *= 0.78;
            wx *= 0.65; wy *= 0.65; wz *= 0.65; bounces += 1;
          } else {
            vx = 0; vy = 0; vz = 0; settled = true;
          }
        }
      }
      if (step % sampleStride === 0 || step === totalSteps) trail.push({ x: round3(x), y: round3(y), z: round3(z) });
    }

    const speed = Math.hypot(vx, vy, vz);
    const horizontalRange = Math.hypot(x - origin.x, z - origin.z);
    if (horizontalRange > maxHorizontalRangeM) maxHorizontalRangeM = horizontalRange;
    speedSum += speed;
    if (settled) settledCount += 1;

    particles.push({
      id: `${preset}-${idx + 1}`,
      position: { x: round3(x), y: round3(y), z: round3(z) },
      velocity: { x: round3(vx), y: round3(vy), z: round3(vz) },
      speedMps: round2(speed),
      rotationDeg: { x: round2(rx % 360), y: round2(ry % 360), z: round2(rz % 360) },
      scale,
      glintIntensity:
        preset === "glass-shatter"
          ? round2(Math.abs(Math.sin(rx * DEG_TO_RAD) * Math.cos(ry * DEG_TO_RAD)))
          : preset === "petal-drift"
            ? round2(0.25 + 0.35 * Math.abs(Math.cos(rz * DEG_TO_RAD)))
            : 0.2,
      motionBlurAngleDeg: speed > 0.05 ? round2((Math.atan2(vy, vx) * 180) / Math.PI) : 0,
      motionBlurLengthPx: round2(clamp(speed * 2.4, 0, 42)),
      bounces, settled, trail,
    });
  }

  return {
    preset, timeSec, fps, frameIndex, particles,
    metrics: {
      apexHeightM: round3(apexHeightM), maxHorizontalRangeM: round3(maxHorizontalRangeM),
      activeParticleCount: count - settledCount, settledParticleCount: settledCount,
      averageSpeedMps: round2(speedSum / Math.max(1, count)),
    },
    summaryKo: `${preset} @ ${timeSec}s (F${frameIndex}/${fps}fps) · 최고점 ${round2(apexHeightM)}m · 입자 ${count}개`,
    summaryEn: `${preset} @ ${timeSec}s (F${frameIndex}/${fps}fps) · Apex ${round2(apexHeightM)}m · ${count} particles`,
  };
}

export const DEFAULT_MIDI_CHANNEL_MAP: readonly MidiChannelBinding[] = [
  { cc: 1, controlId: "brush-size", labelKo: "브러시 크기", labelEn: "Brush Size", unit: "px", min: 1, max: 300, curve: "exponential", defaultValue: 24 },
  { cc: 2, controlId: "opacity", labelKo: "불투명도", labelEn: "Opacity", unit: "%", min: 0, max: 100, curve: "linear", defaultValue: 90 },
  { cc: 3, controlId: "moisture", labelKo: "수분 번짐", labelEn: "Moisture", unit: "%", min: 0, max: 100, curve: "linear", defaultValue: 35 },
  { cc: 4, controlId: "paper-grain", labelKo: "종이결 강도", labelEn: "Paper Grain", unit: "%", min: 0, max: 100, curve: "linear", defaultValue: 42 },
  { cc: 5, controlId: "impasto", labelKo: "임파스토 두께", labelEn: "Impasto", unit: "%", min: 0, max: 100, curve: "linear", defaultValue: 28 },
  { cc: 6, controlId: "color-temp", labelKo: "색온도", labelEn: "Color Temp", unit: "K", min: 2700, max: 9500, curve: "bipolar-center-detent", defaultValue: 6100 },
  { cc: 7, controlId: "lightness", labelKo: "명도", labelEn: "Lightness", unit: "%", min: 0, max: 100, curve: "linear", defaultValue: 55 },
  { cc: 8, controlId: "saturation", labelKo: "채도", labelEn: "Saturation", unit: "%", min: 0, max: 100, curve: "linear", defaultValue: 68 },
];

/** Web MIDI 8채널 기본 믹서 상태를 생성한다. */
export function createDefaultMidiMixerState(): MidiMixerValues {
  return { "brush-size": 24, opacity: 90, moisture: 35, "paper-grain": 42, impasto: 28, "color-temp": 6100, lightness: 55, saturation: 68 };
}

function normalizedToControlValue(norm: number, binding: MidiChannelBinding): number {
  if (binding.curve === "exponential") return round2(binding.min * Math.pow(binding.max / binding.min, norm));
  if (binding.curve === "bipolar-center-detent" && Math.abs(norm - 64 / 127) <= 0.015) return round2((binding.min + binding.max) / 2);
  return round2(binding.min + (binding.max - binding.min) * norm);
}

function controlValueToNormalized(value: number, binding: MidiChannelBinding): number {
  const clamped = clamp(value, binding.min, binding.max);
  if (binding.curve === "exponential") return clamp(Math.log(clamped / binding.min) / Math.log(binding.max / binding.min), 0, 1);
  return clamp((clamped - binding.min) / Math.max(1e-6, binding.max - binding.min), 0, 1);
}

/** Web MIDI CC 패킷을 8채널 브러시/색상 파라미터로 매핑하고 피드백 바이트를 생성한다. */
export function mapMidiCcToStudioControl(input: MidiCcControlInput): MidiCcMappedResult {
  const status = input.status & 0xff;
  const midiChannel = status & 0x0f;
  const cc = Math.round(clamp(input.cc, 0, 127));
  const msb = Math.round(clamp(input.value, 0, 127));

  if ((status & 0xf0) !== 0xb0) {
    return { matched: false, rejectReason: "not-cc-status", midiChannel, cc, normalized: 0, mappedValue: 0, formattedValue: "-", pickedUp: false, deltaFromPrevious: 0, ledFeedbackBytes: [0xb0 | midiChannel, cc, 0] };
  }
  const binding = (input.channelMap ?? DEFAULT_MIDI_CHANNEL_MAP).find((entry) => entry.cc === cc);
  if (!binding) {
    return { matched: false, rejectReason: "unmapped-cc", midiChannel, cc, normalized: round3(msb / 127), mappedValue: 0, formattedValue: "-", pickedUp: false, deltaFromPrevious: 0, ledFeedbackBytes: [0xb0 | midiChannel, cc, msb] };
  }

  const normalized =
    typeof input.lsbValue === "number" && Number.isFinite(input.lsbValue)
      ? ((msb << 7) | Math.round(clamp(input.lsbValue, 0, 127))) / 16383
      : msb / 127;
  const prevValue = input.currentValues?.[binding.controlId] ?? binding.defaultValue;
  const prevNorm = controlValueToNormalized(prevValue, binding);
  const rawMapped = normalizedToControlValue(normalized, binding);

  if (input.pickupMode && Math.abs(normalized - prevNorm) > 0.12) {
    return {
      matched: true, midiChannel, cc, controlId: binding.controlId, labelKo: binding.labelKo, labelEn: binding.labelEn, unit: binding.unit,
      normalized: round3(prevNorm), mappedValue: prevValue, formattedValue: `${prevValue}${binding.unit}`,
      pickedUp: false, deltaFromPrevious: 0, ledFeedbackBytes: [0xb0 | midiChannel, cc, Math.round(prevNorm * 127)],
    };
  }

  const alpha = clamp(input.smoothingAlpha ?? 1, 0.1, 1);
  const smoothed = round2(prevValue + (rawMapped - prevValue) * alpha);
  const finalLed = Math.round(controlValueToNormalized(smoothed, binding) * 127);
  return {
    matched: true, midiChannel, cc, controlId: binding.controlId, labelKo: binding.labelKo, labelEn: binding.labelEn, unit: binding.unit,
    normalized: round3(normalized), mappedValue: smoothed, formattedValue: `${smoothed}${binding.unit}`,
    pickedUp: true, deltaFromPrevious: round2(smoothed - prevValue), ledFeedbackBytes: [0xb0 | midiChannel, cc, finalLed],
  };
}

export const DEFAULT_FOOT_PEDAL_BINDINGS: Readonly<Record<FootPedalSlot, FootPedalBindingAction>> = {
  left: "undo", center: "momentary-eraser", right: "canvas-flip-horizontal",
};

/** USB/BLE 3-페달 풋 스위치 초기 라우터 상태를 생성한다. */
export function createInitialFootPedalState(initialTool: StudioDrawingTool = "brush"): FootPedalRouterState {
  return {
    activeTool: initialTool, toolBeforeHold: null, canvasFlippedH: false, undoCount: 0, redoCount: 0,
    pressedPedals: [], lastEventAtByPedal: { left: -1000, center: -1000, right: -1000 }, lastTapAtByPedal: { left: -1000, center: -1000, right: -1000 },
  };
}

/** USB/BLE 3-페달 풋 스위치(Undo/더블탭 Redo · 홀드 임시 지우개 · 좌우 반전) 핸즈프리 이벤트를 라우팅한다. */
export function routeFootPedalEvent(state: FootPedalRouterState, event: FootPedalEventInput): FootPedalRouteResult {
  const transport = event.transport ?? "usb-hid";
  const debounceMs = Math.max(0, event.debounceMs ?? 35);
  const doubleTapWindowMs = Math.max(80, event.doubleTapWindowMs ?? 320);
  const bindings = event.bindings ?? DEFAULT_FOOT_PEDAL_BINDINGS;

  const isCurrentlyPressed = state.pressedPedals.includes(event.pedal);
  if ((event.phase === "down" && isCurrentlyPressed) || (event.phase === "up" && !isCurrentlyPressed)) {
    return { accepted: false, rejectReason: "duplicate-phase", transport, command: "none", nextState: state, summaryKo: `${event.pedal} 페달 중복 상태 무시`, summaryEn: `Ignored duplicate phase on ${event.pedal} pedal` };
  }
  const elapsed = event.timestampMs - state.lastEventAtByPedal[event.pedal];
  if (elapsed >= 0 && elapsed < debounceMs) {
    return { accepted: false, rejectReason: "debounced", transport, command: "none", nextState: state, summaryKo: `${event.pedal} 페달 채터링(${elapsed}ms) 차단`, summaryEn: `Debounced contact chatter (${elapsed}ms) on ${event.pedal} pedal` };
  }

  const nextPressed = event.phase === "down" ? [...state.pressedPedals, event.pedal] : state.pressedPedals.filter((slot) => slot !== event.pedal);
  const nextLastEventAt = { ...state.lastEventAtByPedal, [event.pedal]: event.timestampMs };
  const action = bindings[event.pedal];

  if (action === "momentary-eraser") {
    if (event.phase === "down") {
      const priorTool = state.activeTool;
      return {
        accepted: true, transport, command: "momentary-eraser-engage",
        nextState: { ...state, activeTool: "eraser", toolBeforeHold: priorTool, pressedPedals: nextPressed, lastEventAtByPedal: nextLastEventAt },
        summaryKo: `중앙 페달 홀드 → 임시 지우개 활성 (이전 도구: ${priorTool})`,
        summaryEn: `Center pedal hold -> Momentary eraser engaged (prior: ${priorTool})`,
      };
    }
    const restoredTool = state.toolBeforeHold ?? "brush";
    return {
      accepted: true, transport, command: "momentary-eraser-release",
      nextState: { ...state, activeTool: restoredTool, toolBeforeHold: null, pressedPedals: nextPressed, lastEventAtByPedal: nextLastEventAt },
      summaryKo: `중앙 페달 해제 → 원래 도구(${restoredTool}) 즉시 복귀`,
      summaryEn: `Center pedal released -> Restored previous tool (${restoredTool})`,
    };
  }

  if (event.phase === "up") {
    return {
      accepted: true, transport, command: "none",
      nextState: { ...state, pressedPedals: nextPressed, lastEventAtByPedal: nextLastEventAt },
      summaryKo: `${event.pedal} 페달 릴리즈 완료`, summaryEn: `Released ${event.pedal} pedal`,
    };
  }

  if (action === "undo") {
    const sinceLastTap = event.timestampMs - state.lastTapAtByPedal[event.pedal];
    const isDoubleTap = sinceLastTap >= debounceMs && sinceLastTap <= doubleTapWindowMs;
    const nextTapMap = { ...state.lastTapAtByPedal, [event.pedal]: isDoubleTap ? -1000 : event.timestampMs };
    return {
      accepted: true, transport, command: isDoubleTap ? "redo" : "undo",
      nextState: {
        ...state,
        undoCount: isDoubleTap ? state.undoCount : state.undoCount + 1,
        redoCount: isDoubleTap ? state.redoCount + 1 : state.redoCount,
        pressedPedals: nextPressed, lastEventAtByPedal: nextLastEventAt, lastTapAtByPedal: nextTapMap,
      },
      summaryKo: isDoubleTap ? "좌측 페달 더블탭 → 다시 실행(Redo)" : "좌측 페달 탭 → 실행 취소(Undo)",
      summaryEn: isDoubleTap ? "Left pedal double-tap -> Redo" : "Left pedal tap -> Undo",
    };
  }

  const nextFlip = !state.canvasFlippedH;
  return {
    accepted: true, transport, command: "canvas-flip-horizontal",
    nextState: { ...state, canvasFlippedH: nextFlip, pressedPedals: nextPressed, lastEventAtByPedal: nextLastEventAt },
    summaryKo: nextFlip ? "우측 페달 → 캔버스 좌우 반전 ON" : "우측 페달 → 캔버스 좌우 반전 OFF",
    summaryEn: nextFlip ? "Right pedal -> Canvas horizontal flip ON" : "Right pedal -> Canvas horizontal flip OFF",
  };
}

export const DEFAULT_COLLISION_SCENE_BODIES: readonly CollisionBodyInput[] = [
  { id: "desk-static", label: "작업 책상", shape: "aabb", center: { x: 0, y: 0.375, z: 0 }, halfExtents: { x: 0.7, y: 0.375, z: 0.4 }, isStatic: true, enableGravityDrop: false },
  { id: "mug-obb", label: "머그컵", shape: "obb", center: { x: -0.18, y: 0.88, z: 0.02 }, halfExtents: { x: 0.08, y: 0.06, z: 0.08 }, rotationDeg: { x: 0, y: 32, z: 0 }, massKg: 0.5 },
  { id: "sketchbook-obb", label: "스케치북", shape: "obb", center: { x: 0.04, y: 0.87, z: 0.03 }, halfExtents: { x: 0.14, y: 0.02, z: 0.1 }, rotationDeg: { x: 0, y: -18, z: 0 }, massKg: 0.8 },
  { id: "chair-obb", label: "작업 의자", shape: "obb", center: { x: 0.96, y: 0.52, z: 0 }, halfExtents: { x: 0.28, y: 0.45, z: 0.28 }, rotationDeg: { x: 0, y: 20, z: 0 }, massKg: 6.5 },
];
