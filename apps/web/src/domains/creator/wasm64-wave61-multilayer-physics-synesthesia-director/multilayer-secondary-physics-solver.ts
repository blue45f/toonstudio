/**
 * Wave-61: 다층 레이어 2차 물리 연동 시뮬레이터 및 만화적 모션 스미어 엔진.
 *
 * Verlet / XPBD(Extended Position Based Dynamics) 제약 솔버로 머리카락(`hair`),
 * 망토(`cloak`), 빗줄기(`rain`), 파편(`debris`)의 2.5D 2차 모션을 결정론적으로
 * 시뮬레이션한다. 단일 바람 벡터와 충격파 입력만으로 선화(`lineart`)·채색(`color`)·
 * 그림자(`shadow`) 다층 레이어 변위 필드를 동기 산출하며, 고속 이동 노드에서 테이퍼드
 * 만화적 모션 스미어(Motion Smear) 폴리라인을 생성한다.
 */

export type SecondaryPhysicsElementKind = "cloak" | "debris" | "hair" | "rain";
export type ComicPhysicsLayerKind = "color" | "lineart" | "shadow";
export type ComicSmearStylePreset = "cel-soft" | "ink-drybrush" | "shonen-sharp";

export interface Vec3Px {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NodeLayerCouplingOverride {
  readonly colorFollowRatio?: number;
  readonly lineartGain?: number;
  readonly shadowCoupling?: number;
}

export interface SecondaryPhysicsNode {
  readonly angleRad: number;
  readonly angularVelocityRadPerSec: number;
  readonly chainId: string;
  readonly drag: number;
  readonly id: string;
  readonly invMass: number;
  readonly kind: SecondaryPhysicsElementKind;
  readonly layerCoupling?: NodeLayerCouplingOverride;
  readonly pinned: boolean;
  readonly prevX: number;
  readonly prevY: number;
  readonly prevZ: number;
  readonly radiusPx: number;
  readonly restX: number;
  readonly restY: number;
  readonly restZ: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface XpbdDistanceConstraint {
  readonly compliance: number;
  readonly nodeAIndex: number;
  readonly nodeBIndex: number;
  readonly restLengthPx: number;
}

export interface CircularCollider2D {
  readonly centerX: number;
  readonly centerY: number;
  readonly id: string;
  readonly radiusPx: number;
}

export interface WindField25D {
  readonly gustStrength?: number;
  readonly seed?: number;
  readonly turbulenceAmplitude: number;
  readonly turbulenceFrequencyHz: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

export interface ShockwaveImpulse25D {
  readonly elapsedSec: number;
  readonly frontWidthPx: number;
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  readonly peakImpulsePxPerSec: number;
  readonly radialLiftZ?: number;
  readonly radiusPx: number;
  readonly spinImpulseRadPerSec?: number;
  readonly waveSpeedPxPerSec: number;
}

export interface MultiLayerSyncConfig {
  readonly colorFollowRatio: number;
  readonly colorLagSec: number;
  readonly lightDirection: Vec3Px;
  readonly shadowBlurPerElevation: number;
  readonly shadowCoupling: number;
  readonly shadowProjectionGain: number;
}

export interface MultiLayerPhysicsStepInput {
  readonly colliders?: readonly CircularCollider2D[];
  readonly constraintIterations?: number;
  readonly constraints: readonly XpbdDistanceConstraint[];
  readonly damping?: number;
  readonly dtSec: number;
  readonly floorYPx?: number;
  readonly gravityPxPerSec2?: Vec3Px;
  readonly layerSync?: Partial<MultiLayerSyncConfig>;
  readonly nodes: readonly SecondaryPhysicsNode[];
  readonly prefersReducedMotion?: boolean;
  readonly shockwaves?: readonly ShockwaveImpulse25D[];
  readonly substeps?: number;
  readonly timeSec?: number;
  readonly wind: WindField25D;
}

export interface LayerNodeDisplacement {
  readonly angleRad: number;
  readonly blurRadiusPx: number;
  readonly displacementMagnitudePx: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly kind: SecondaryPhysicsElementKind;
  readonly layer: ComicPhysicsLayerKind;
  readonly nodeId: string;
  readonly projectedX: number;
  readonly projectedY: number;
  readonly speedPxPerSec: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

export interface SecondaryPhysicsDiagnostics {
  readonly kineticEnergyProxy: number;
  readonly maxConstraintErrorRatio: number;
  readonly maxDisplacementPx: number;
  readonly maxSpeedPxPerSec: number;
  readonly meanConstraintErrorRatio: number;
  readonly reducedMotionApplied: boolean;
  readonly substepCount: number;
}

export interface MultiLayerPhysicsStepResult {
  readonly diagnostics: SecondaryPhysicsDiagnostics;
  readonly layerDisplacements: Readonly<
    Record<ComicPhysicsLayerKind, readonly LayerNodeDisplacement[]>
  >;
  readonly nextTimeSec: number;
  readonly nodes: readonly SecondaryPhysicsNode[];
}

export interface MotionSmearPolylinePoint {
  readonly opacity: number;
  readonly t: number;
  readonly widthPx: number;
  readonly x: number;
  readonly y: number;
}

export interface ComicMotionSmearStroke {
  readonly arcLengthPx: number;
  readonly chainId: string;
  readonly kind: SecondaryPhysicsElementKind;
  readonly layer: ComicPhysicsLayerKind;
  readonly nodeId: string;
  readonly points: readonly MotionSmearPolylinePoint[];
  readonly speedPxPerSec: number;
  readonly strokeId: string;
  readonly stylePreset: ComicSmearStylePreset;
}

export interface ComicMotionSmearOptions {
  readonly baseStrokeWidthPx?: number;
  readonly curvatureBendGain?: number;
  readonly includeLayers?: readonly ComicPhysicsLayerKind[];
  readonly maxOpacity?: number;
  readonly maxSmearLengthPx?: number;
  readonly minOpacity?: number;
  readonly prefersReducedMotion?: boolean;
  readonly shutterSec?: number;
  readonly speedThresholdPxPerSec?: number;
  readonly stylePreset?: ComicSmearStylePreset;
  readonly taperSamples?: number;
}

export const DEFAULT_MULTI_LAYER_SYNC_CONFIG: MultiLayerSyncConfig = {
  colorFollowRatio: 0.99,
  colorLagSec: 0.002,
  lightDirection: { x: 0.35, y: 0.55, z: 0.76 },
  shadowBlurPerElevation: 0.14,
  shadowCoupling: 0.88,
  shadowProjectionGain: 0.65,
};

export const DEFAULT_GRAVITY_PX_PER_SEC2: Vec3Px = { x: 0, y: 980, z: 0 };

interface MutableNode {
  angleRad: number;
  angularVelocityRadPerSec: number;
  chainId: string;
  drag: number;
  id: string;
  invMass: number;
  kind: SecondaryPhysicsElementKind;
  layerCoupling?: NodeLayerCouplingOverride;
  pinned: boolean;
  prevX: number;
  prevY: number;
  prevZ: number;
  radiusPx: number;
  restX: number;
  restY: number;
  restZ: number;
  vx: number;
  vy: number;
  vz: number;
  x: number;
  y: number;
  z: number;
}

function toImmutablePhysicsNode(n: MutableNode): SecondaryPhysicsNode {
  return {
    angleRad: n.angleRad, angularVelocityRadPerSec: n.angularVelocityRadPerSec,
    chainId: n.chainId, drag: n.drag, id: n.id, invMass: n.invMass, kind: n.kind,
    layerCoupling: n.layerCoupling, pinned: n.pinned, prevX: n.prevX, prevY: n.prevY,
    prevZ: n.prevZ, radiusPx: n.radiusPx, restX: n.restX, restY: n.restY, restZ: n.restZ,
    x: n.x, y: n.y, z: n.z,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hypot3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** 결정론적 삼각 해시 난류 샘플러(`[-1, 1]`). */
function sampleDeterministicTurbulence(
  x: number, y: number, timeSec: number, freqHz: number, seed: number,
): Vec3Px {
  const phase = timeSec * Math.max(0.05, freqHz) * Math.PI * 2 + seed * 1.6180339;
  return {
    x: Math.sin(x * 0.017 + y * 0.011 + phase),
    y: Math.cos(x * 0.013 - y * 0.019 + phase * 1.13 + seed * 0.73),
    z: Math.sin((x + y) * 0.009 + phase * 0.87 - seed * 0.41),
  };
}

/** 머리카락·망토용 XPBD 스프링 체인 노드와 거리 제약을 생성한다. */
export function createPhysicsChainNodes(options: {
  readonly chainId: string;
  readonly compliance?: number;
  readonly drag?: number;
  readonly kind: "cloak" | "hair";
  readonly nodeMass?: number;
  readonly radiusPx?: number;
  readonly segmentLengthPx: number;
  readonly segments: number;
  readonly startX: number;
  readonly startY: number;
  readonly startZ?: number;
  readonly tiltXPerSegment?: number;
}): {
  readonly constraints: readonly XpbdDistanceConstraint[];
  readonly nodes: readonly SecondaryPhysicsNode[];
} {
  const segments = Math.max(1, Math.floor(finiteOr(options.segments, 4)));
  const segLen = Math.max(1, finiteOr(options.segmentLengthPx, 24));
  const tiltX = finiteOr(options.tiltXPerSegment, 0);
  const stepY = Math.sqrt(Math.max(0.0001, segLen * segLen - tiltX * tiltX));
  const mass = Math.max(0.05, finiteOr(options.nodeMass, 1));
  const compliance = Math.max(0, finiteOr(options.compliance, 0));
  const drag = clamp(finiteOr(options.drag, options.kind === "cloak" ? 3.2 : 2.4), 0, 12);
  const radiusPx = Math.max(1, finiteOr(options.radiusPx, options.kind === "cloak" ? 6 : 4));
  const startZ = finiteOr(options.startZ, 12);

  const nodes: SecondaryPhysicsNode[] = [];
  const constraints: XpbdDistanceConstraint[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const x = options.startX + tiltX * i;
    const y = options.startY + stepY * i;
    const pinned = i === 0;
    nodes.push({
      angleRad: Math.atan2(stepY, tiltX), angularVelocityRadPerSec: 0,
      chainId: options.chainId, drag, id: `${options.chainId}-n${i}`,
      invMass: pinned ? 0 : 1 / mass, kind: options.kind, pinned,
      prevX: x, prevY: y, prevZ: startZ, radiusPx,
      restX: x, restY: y, restZ: startZ, x, y, z: startZ,
    });
    if (i > 0) {
      constraints.push({ compliance, nodeAIndex: i - 1, nodeBIndex: i, restLengthPx: segLen });
    }
  }
  return { constraints, nodes };
}

/** 충격파 파편·빗줄기용 자유 입자 목록을 결정론적으로 생성한다. */
export function createBallisticPhysicsNodes(options: {
  readonly baseZ?: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly count: number;
  readonly drag?: number;
  readonly groupId: string;
  readonly kind: "debris" | "rain";
  readonly spreadRadiusPx: number;
}): readonly SecondaryPhysicsNode[] {
  const count = Math.max(1, Math.floor(finiteOr(options.count, 6)));
  const spread = Math.max(4, finiteOr(options.spreadRadiusPx, 60));
  const baseZ = finiteOr(options.baseZ, options.kind === "rain" ? 28 : 16);
  const drag = clamp(finiteOr(options.drag, options.kind === "rain" ? 4.2 : 1.4), 0, 12);
  const nodes: SecondaryPhysicsNode[] = [];

  for (let i = 0; i < count; i += 1) {
    const goldenAngle = i * 2.399963229728653;
    const radialRatio = Math.sqrt((i + 0.5) / count);
    const x = options.centerX + Math.cos(goldenAngle) * spread * radialRatio;
    const y = options.centerY + Math.sin(goldenAngle) * spread * radialRatio;
    const z = baseZ + ((i % 4) - 1.5) * 4;
    const mass = options.kind === "rain" ? 0.35 : 0.8 + (i % 3) * 0.35;
    nodes.push({
      angleRad: options.kind === "rain" ? Math.PI * 0.5 : (i * 0.7) % (Math.PI * 2),
      angularVelocityRadPerSec: 0, chainId: options.groupId, drag,
      id: `${options.groupId}-${options.kind}-${i}`, invMass: 1 / mass,
      kind: options.kind, pinned: false, prevX: x, prevY: y, prevZ: z,
      radiusPx: options.kind === "rain" ? 2 : 5 + (i % 3) * 2,
      restX: x, restY: y, restZ: z, x, y, z,
    });
  }
  return nodes;
}

function evaluateShockwaveDeltaV(
  node: MutableNode, shockwave: ShockwaveImpulse25D, substepRatio: number,
): { readonly dvx: number; readonly dvy: number; readonly dvz: number; readonly dOmega: number } {
  const dx = node.x - shockwave.originX;
  const dy = node.y - shockwave.originY;
  const dz = node.z - shockwave.originZ;
  const dist = hypot3(dx, dy, dz);
  const radius = Math.max(1, finiteOr(shockwave.radiusPx, 240));
  if (dist >= radius) return { dvx: 0, dvy: 0, dvz: 0, dOmega: 0 };

  const radialFalloff = clamp(1 - dist / radius, 0, 1);
  const frontWidth = Math.max(4, finiteOr(shockwave.frontWidthPx, 48));
  const waveSpeed = Math.max(0, finiteOr(shockwave.waveSpeedPxPerSec, 0));
  const frontRadius = waveSpeed * Math.max(0, finiteOr(shockwave.elapsedSec, 0));
  const frontEnvelope = waveSpeed > 0 ? Math.exp(-Math.pow((dist - frontRadius) / frontWidth, 2)) : 1;
  const strength =
    finiteOr(shockwave.peakImpulsePxPerSec, 0) * radialFalloff * frontEnvelope *
    substepRatio * Math.min(2.5, node.invMass);
  if (Math.abs(strength) < 1e-9) return { dvx: 0, dvy: 0, dvz: 0, dOmega: 0 };

  const nx = dist > 1e-6 ? dx / dist : 1;
  const ny = dist > 1e-6 ? dy / dist : 0;
  const nz = dist > 1e-6 ? dz / dist : 0;
  const liftZ = finiteOr(shockwave.radialLiftZ, 0.25);
  const spinBase = finiteOr(shockwave.spinImpulseRadPerSec, 6.0);
  const dOmega =
    node.kind === "debris"
      ? (nx >= 0 ? 1 : -1) * spinBase * radialFalloff * frontEnvelope * substepRatio
      : 0;

  return { dvx: nx * strength, dvy: ny * strength, dvz: (nz + liftZ) * strength * 0.45, dOmega };
}

function buildLayerDisplacements(
  nodes: readonly MutableNode[], syncConfig: MultiLayerSyncConfig,
): Readonly<Record<ComicPhysicsLayerKind, readonly LayerNodeDisplacement[]>> {
  const lightZ = Math.max(0.25, Math.abs(syncConfig.lightDirection.z));
  const lightSlopeX = syncConfig.lightDirection.x / lightZ;
  const lightSlopeY = syncConfig.lightDirection.y / lightZ;
  const lineart: LayerNodeDisplacement[] = [];
  const color: LayerNodeDisplacement[] = [];
  const shadow: LayerNodeDisplacement[] = [];

  for (const node of nodes) {
    const rawDx = node.x - node.restX;
    const rawDy = node.y - node.restY;
    const rawDz = node.z - node.restZ;
    const speed = hypot3(node.vx, node.vy, node.vz);

    const lineartGain = clamp(finiteOr(node.layerCoupling?.lineartGain, 1), 0.25, 1.5);
    const lDx = rawDx * lineartGain;
    const lDy = rawDy * lineartGain;
    const lDz = rawDz * lineartGain;
    lineart.push({
      angleRad: node.angleRad, blurRadiusPx: 0, displacementMagnitudePx: hypot3(lDx, lDy, lDz),
      dx: lDx, dy: lDy, dz: lDz, kind: node.kind, layer: "lineart", nodeId: node.id,
      projectedX: node.restX + lDx, projectedY: node.restY + lDy, speedPxPerSec: speed,
      vx: node.vx, vy: node.vy, vz: node.vz,
    });

    const colorFollow = clamp(
      finiteOr(node.layerCoupling?.colorFollowRatio, syncConfig.colorFollowRatio), 0.85, 1.0,
    );
    const cDx = lDx * colorFollow - node.vx * syncConfig.colorLagSec;
    const cDy = lDy * colorFollow - node.vy * syncConfig.colorLagSec;
    const cDz = lDz * colorFollow;
    color.push({
      angleRad: node.angleRad, blurRadiusPx: 0, displacementMagnitudePx: hypot3(cDx, cDy, cDz),
      dx: cDx, dy: cDy, dz: cDz, kind: node.kind, layer: "color", nodeId: node.id,
      projectedX: node.restX + cDx, projectedY: node.restY + cDy,
      speedPxPerSec: speed * colorFollow, vx: node.vx * colorFollow,
      vy: node.vy * colorFollow, vz: node.vz * colorFollow,
    });

    const shadowCoupling = clamp(
      finiteOr(node.layerCoupling?.shadowCoupling, syncConfig.shadowCoupling), 0.2, 1.2,
    );
    const elevationPx = Math.max(0, node.z);
    const sDx = lDx * shadowCoupling + lightSlopeX * elevationPx * syncConfig.shadowProjectionGain;
    const sDy = lDy * shadowCoupling + lightSlopeY * elevationPx * syncConfig.shadowProjectionGain;
    shadow.push({
      angleRad: node.angleRad,
      blurRadiusPx: Math.max(0.5, elevationPx * syncConfig.shadowBlurPerElevation),
      displacementMagnitudePx: hypot3(sDx, sDy, 0),
      dx: sDx, dy: sDy, dz: 0, kind: node.kind, layer: "shadow", nodeId: node.id,
      projectedX: node.restX + sDx, projectedY: node.restY + sDy,
      speedPxPerSec: speed * shadowCoupling, vx: node.vx * shadowCoupling,
      vy: node.vy * shadowCoupling, vz: 0,
    });
  }

  return { color, lineart, shadow };
}

/**
 * XPBD / Verlet 다층 레이어 2차 물리 시뮬레이션을 1스텝 전진시키고
 * 선화·채색·그림자 동기 변위 필드를 산출한다.
 */
export function stepMultiLayerSecondaryPhysics(
  input: MultiLayerPhysicsStepInput,
): MultiLayerPhysicsStepResult {
  const dtSec = clamp(finiteOr(input.dtSec, 1 / 60), 1e-4, 0.1);
  const substeps = Math.floor(clamp(finiteOr(input.substeps, 4), 1, 16));
  const iterations = Math.floor(clamp(finiteOr(input.constraintIterations, 6), 1, 32));
  const damping = clamp(finiteOr(input.damping, 0.08), 0, 0.95);
  const gravity = input.gravityPxPerSec2 ?? DEFAULT_GRAVITY_PX_PER_SEC2;
  const startTimeSec = finiteOr(input.timeSec, 0);
  const colliders = input.colliders ?? [];
  const shockwaves = input.shockwaves ?? [];

  const syncConfig: MultiLayerSyncConfig = {
    colorFollowRatio: clamp(
      finiteOr(input.layerSync?.colorFollowRatio, DEFAULT_MULTI_LAYER_SYNC_CONFIG.colorFollowRatio),
      0.85, 1.0,
    ),
    colorLagSec: clamp(
      finiteOr(input.layerSync?.colorLagSec, DEFAULT_MULTI_LAYER_SYNC_CONFIG.colorLagSec), 0, 0.02,
    ),
    lightDirection: input.layerSync?.lightDirection ?? DEFAULT_MULTI_LAYER_SYNC_CONFIG.lightDirection,
    shadowBlurPerElevation: clamp(
      finiteOr(input.layerSync?.shadowBlurPerElevation, DEFAULT_MULTI_LAYER_SYNC_CONFIG.shadowBlurPerElevation),
      0, 2,
    ),
    shadowCoupling: clamp(
      finiteOr(input.layerSync?.shadowCoupling, DEFAULT_MULTI_LAYER_SYNC_CONFIG.shadowCoupling),
      0.2, 1.2,
    ),
    shadowProjectionGain: clamp(
      finiteOr(input.layerSync?.shadowProjectionGain, DEFAULT_MULTI_LAYER_SYNC_CONFIG.shadowProjectionGain),
      0, 3,
    ),
  };

  const state: MutableNode[] = input.nodes.map((node) => ({
    angleRad: finiteOr(node.angleRad, 0),
    angularVelocityRadPerSec: finiteOr(node.angularVelocityRadPerSec, 0),
    chainId: node.chainId, drag: clamp(finiteOr(node.drag, 2), 0, 12), id: node.id,
    invMass: node.pinned ? 0 : Math.max(0, finiteOr(node.invMass, 1)), kind: node.kind,
    layerCoupling: node.layerCoupling, pinned: node.pinned,
    prevX: finiteOr(node.prevX, node.x), prevY: finiteOr(node.prevY, node.y),
    prevZ: finiteOr(node.prevZ, node.z), radiusPx: Math.max(0.5, finiteOr(node.radiusPx, 4)),
    restX: finiteOr(node.restX, node.x), restY: finiteOr(node.restY, node.y),
    restZ: finiteOr(node.restZ, node.z), vx: 0, vy: 0, vz: 0,
    x: finiteOr(node.x, 0), y: finiteOr(node.y, 0), z: finiteOr(node.z, 0),
  }));

  if (input.prefersReducedMotion) {
    for (const node of state) {
      node.x = node.restX; node.y = node.restY; node.z = node.restZ;
      node.prevX = node.restX; node.prevY = node.restY; node.prevZ = node.restZ;
      node.vx = 0; node.vy = 0; node.vz = 0; node.angularVelocityRadPerSec = 0;
    }
    return {
      diagnostics: {
        kineticEnergyProxy: 0, maxConstraintErrorRatio: 0, maxDisplacementPx: 0,
        maxSpeedPxPerSec: 0, meanConstraintErrorRatio: 0, reducedMotionApplied: true, substepCount: 0,
      },
      layerDisplacements: buildLayerDisplacements(state, syncConfig),
      nextTimeSec: startTimeSec + dtSec,
      nodes: state.map(toImmutablePhysicsNode),
    };
  }

  const h = dtSec / substeps;
  const hSq = h * h;
  const substepDamping = Math.pow(1 - damping, 1 / substeps);
  const gustGain = 1 + clamp(finiteOr(input.wind.gustStrength, 0), 0, 3);
  const windSeed = finiteOr(input.wind.seed, 17);
  const lambdas = new Float64Array(input.constraints.length);

  for (let step = 0; step < substeps; step += 1) {
    const t = startTimeSec + h * (step + 1);
    const substepRatio = 1 / substeps;

    // 1. 외력(중력·바람 공기저항·충격파) 및 Verlet 위치 예측
    for (const node of state) {
      if (node.pinned || node.invMass <= 0) {
        node.prevX = node.x; node.prevY = node.y; node.prevZ = node.z;
        node.vx = 0; node.vy = 0; node.vz = 0;
        continue;
      }
      const prevVx = ((node.x - node.prevX) / h) * substepDamping;
      const prevVy = ((node.y - node.prevY) / h) * substepDamping;
      const prevVz = ((node.z - node.prevZ) / h) * substepDamping;
      const turb = sampleDeterministicTurbulence(
        node.x, node.y, t, input.wind.turbulenceFrequencyHz, windSeed,
      );
      const amp = Math.max(0, finiteOr(input.wind.turbulenceAmplitude, 0));
      const windVx = finiteOr(input.wind.vx, 0) * gustGain + turb.x * amp;
      const windVy = finiteOr(input.wind.vy, 0) * gustGain + turb.y * amp;
      const windVz = finiteOr(input.wind.vz, 0) * gustGain + turb.z * amp * 0.5;
      const rainGravityScale = node.kind === "rain" ? 1.35 : 1.0;

      let vx = prevVx + (gravity.x + (windVx - prevVx) * node.drag) * h;
      let vy = prevVy + (gravity.y * rainGravityScale + (windVy - prevVy) * node.drag) * h;
      let vz = prevVz + (gravity.z + (windVz - prevVz) * node.drag) * h;

      for (const sw of shockwaves) {
        const delta = evaluateShockwaveDeltaV(node, sw, substepRatio);
        vx += delta.dvx; vy += delta.dvy; vz += delta.dvz;
        node.angularVelocityRadPerSec += delta.dOmega;
      }
      node.prevX = node.x; node.prevY = node.y; node.prevZ = node.z;
      node.x += vx * h; node.y += vy * h; node.z = Math.max(0, node.z + vz * h);
    }

    // 2. XPBD 거리 제약 및 충돌체 투영
    lambdas.fill(0);
    for (let iter = 0; iter < iterations; iter += 1) {
      for (let cIdx = 0; cIdx < input.constraints.length; cIdx += 1) {
        const c = input.constraints[cIdx];
        const a = c ? state[c.nodeAIndex] : undefined;
        const b = c ? state[c.nodeBIndex] : undefined;
        if (!c || !a || !b) continue;
        const wSum = a.invMass + b.invMass;
        if (wSum <= 0) continue;

        const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
        const dist = hypot3(dx, dy, dz);
        if (dist < 1e-9) continue;

        const restLen = Math.max(1e-4, finiteOr(c.restLengthPx, dist));
        const alphaTilde = Math.max(0, finiteOr(c.compliance, 0)) / hSq;
        const deltaLambda = (-(dist - restLen) - alphaTilde * lambdas[cIdx]) / (wSum + alphaTilde);
        lambdas[cIdx] += deltaLambda;

        const corr = deltaLambda / dist;
        if (a.invMass > 0) {
          a.x -= a.invMass * corr * dx;
          a.y -= a.invMass * corr * dy;
          a.z = Math.max(0, a.z - a.invMass * corr * dz);
        }
        if (b.invMass > 0) {
          b.x += b.invMass * corr * dx;
          b.y += b.invMass * corr * dy;
          b.z = Math.max(0, b.z + b.invMass * corr * dz);
        }
      }

      for (const node of state) {
        if (node.pinned || node.invMass <= 0) continue;
        for (const col of colliders) {
          const dx = node.x - col.centerX;
          const dy = node.y - col.centerY;
          const minDist = col.radiusPx + node.radiusPx;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq);
            node.x = col.centerX + (dist > 1e-6 ? dx / dist : 0) * minDist;
            node.y = col.centerY + (dist > 1e-6 ? dy / dist : -1) * minDist;
          }
        }
        if (typeof input.floorYPx === "number" && Number.isFinite(input.floorYPx)) {
          const maxY = input.floorYPx - node.radiusPx;
          if (node.y > maxY) node.y = maxY;
        }
      }
    }

    // 3. 서브스텝 종료 속도·각도 갱신
    for (const node of state) {
      node.vx = (node.x - node.prevX) / h;
      node.vy = (node.y - node.prevY) / h;
      node.vz = (node.z - node.prevZ) / h;
      if (node.kind === "debris") {
        node.angularVelocityRadPerSec *= Math.pow(0.92, substepRatio);
        node.angleRad += node.angularVelocityRadPerSec * h;
      } else if (!node.pinned && Math.abs(node.vx) + Math.abs(node.vy) > 1e-3) {
        node.angleRad = Math.atan2(node.vy, node.vx);
      }
    }
  }

  let maxConstraintErrorRatio = 0;
  let sumConstraintErrorRatio = 0;
  let validConstraintCount = 0;
  for (const c of input.constraints) {
    const a = state[c.nodeAIndex];
    const b = state[c.nodeBIndex];
    if (!a || !b || c.restLengthPx <= 0) continue;
    const errRatio = Math.abs(hypot3(b.x - a.x, b.y - a.y, b.z - a.z) - c.restLengthPx) / c.restLengthPx;
    if (errRatio > maxConstraintErrorRatio) maxConstraintErrorRatio = errRatio;
    sumConstraintErrorRatio += errRatio;
    validConstraintCount += 1;
  }

  let maxDisplacementPx = 0;
  let maxSpeedPxPerSec = 0;
  let kineticEnergyProxy = 0;
  for (const node of state) {
    const disp = hypot3(node.x - node.restX, node.y - node.restY, node.z - node.restZ);
    const speed = hypot3(node.vx, node.vy, node.vz);
    if (disp > maxDisplacementPx) maxDisplacementPx = disp;
    if (speed > maxSpeedPxPerSec) maxSpeedPxPerSec = speed;
    if (node.invMass > 0) kineticEnergyProxy += 0.5 * (1 / node.invMass) * speed * speed;
  }

  return {
    diagnostics: {
      kineticEnergyProxy, maxConstraintErrorRatio, maxDisplacementPx, maxSpeedPxPerSec,
      meanConstraintErrorRatio: validConstraintCount > 0 ? sumConstraintErrorRatio / validConstraintCount : 0,
      reducedMotionApplied: false, substepCount: substeps,
    },
    layerDisplacements: buildLayerDisplacements(state, syncConfig),
    nextTimeSec: startTimeSec + dtSec,
    nodes: state.map(toImmutablePhysicsNode),
  };
}

/**
 * 다층 물리 변위 결과에서 고속 이동 노드의 만화적 모션 스미어(Motion Smear)
 * 테이퍼드 폴리라인 스트로크를 동기 생성한다.
 */
export function generateComicMotionSmearStrokes(
  stepResult: MultiLayerPhysicsStepResult,
  options: ComicMotionSmearOptions = {},
): readonly ComicMotionSmearStroke[] {
  if (options.prefersReducedMotion || stepResult.diagnostics.reducedMotionApplied) return [];

  const speedThreshold = Math.max(1, finiteOr(options.speedThresholdPxPerSec, 120));
  const shutterSec = clamp(finiteOr(options.shutterSec, 0.045), 0.005, 0.25);
  const maxSmearLen = clamp(finiteOr(options.maxSmearLengthPx, 96), 6, 400);
  const taperSamples = Math.floor(clamp(finiteOr(options.taperSamples, 6), 3, 24));
  const baseWidth = clamp(finiteOr(options.baseStrokeWidthPx, 6), 1, 48);
  const minOpacity = clamp(finiteOr(options.minOpacity, 0.08), 0, 1);
  const maxOpacity = clamp(finiteOr(options.maxOpacity, 0.88), minOpacity, 1);
  const bendGain = clamp(finiteOr(options.curvatureBendGain, 0.16), 0, 0.6);
  const stylePreset: ComicSmearStylePreset = options.stylePreset ?? "shonen-sharp";
  const includeLayers: readonly ComicPhysicsLayerKind[] = options.includeLayers ?? [
    "lineart", "color", "shadow",
  ];

  const nodeChainMap = new Map<string, string>();
  for (const node of stepResult.nodes) nodeChainMap.set(node.id, node.chainId);

  const presetWidthScale =
    stylePreset === "shonen-sharp" ? 1.0 : stylePreset === "ink-drybrush" ? 1.25 : 0.85;
  const presetTaperExp =
    stylePreset === "shonen-sharp" ? 1.45 : stylePreset === "ink-drybrush" ? 1.15 : 0.9;

  const strokes: ComicMotionSmearStroke[] = [];
  for (const layer of includeLayers) {
    const layerWidthMult = layer === "lineart" ? 1.0 : layer === "color" ? 1.3 : 1.15;
    const layerOpacityMult = layer === "lineart" ? 1.0 : layer === "color" ? 0.72 : 0.42;

    for (const entry of stepResult.layerDisplacements[layer]) {
      const speed2D = Math.hypot(entry.vx, entry.vy);
      if (speed2D < speedThreshold) continue;
      const smearLength = Math.min(maxSmearLen, speed2D * shutterSec);
      if (smearLength < 2) continue;

      const dirX = entry.vx / speed2D;
      const dirY = entry.vy / speed2D;
      const perpX = -dirY;
      const perpY = dirX;
      const bendOffset = smearLength * bendGain * (entry.dx * perpX + entry.dy * perpY >= 0 ? 1 : -1);

      const p0x = entry.projectedX;
      const p0y = entry.projectedY;
      const p2x = p0x - dirX * smearLength;
      const p2y = p0y - dirY * smearLength;
      const p1x = (p0x + p2x) * 0.5 + perpX * bendOffset;
      const p1y = (p0y + p2y) * 0.5 + perpY * bendOffset;

      const points: MotionSmearPolylinePoint[] = [];
      let arcLengthPx = 0;
      const headWidth =
        baseWidth * presetWidthScale * layerWidthMult *
        clamp(0.75 + speed2D / (speedThreshold * 3), 0.75, 2.0);

      for (let s = 0; s < taperSamples; s += 1) {
        const t = s / (taperSamples - 1);
        const omt = 1 - t;
        const x = omt * omt * p0x + 2 * omt * t * p1x + t * t * p2x;
        const y = omt * omt * p0y + 2 * omt * t * p1y + t * t * p2y;
        if (s > 0) arcLengthPx += Math.hypot(x - points[s - 1].x, y - points[s - 1].y);

        points.push({
          opacity: clamp((minOpacity + (maxOpacity - minOpacity) * (1 - t)) * layerOpacityMult, 0, 1),
          t,
          widthPx: Math.max(0.35, headWidth * Math.pow(Math.max(0, 1 - t), presetTaperExp)),
          x,
          y,
        });
      }

      strokes.push({
        arcLengthPx,
        chainId: nodeChainMap.get(entry.nodeId) ?? "detached",
        kind: entry.kind,
        layer,
        nodeId: entry.nodeId,
        points,
        speedPxPerSec: speed2D,
        strokeId: `smear:${layer}:${entry.nodeId}`,
        stylePreset,
      });
    }
  }
  return strokes;
}
