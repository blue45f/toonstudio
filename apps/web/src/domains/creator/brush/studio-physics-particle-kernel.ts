/**
 * 물리 파티클 브러시 순수 결정론 커널 (Wave 3 #012).
 *
 * `studio-physics-particle-brush-provider.ts`에서 추출된 순수 수학·물리 적분·
 * 플로우 필드 샘플링·시드 해시 PRNG·출력 버퍼 기록 커널이다.
 * DOM/Canvas/Worker/GPU/시계/비결정론 난수 의존성이 전혀 없다.
 */

export const STUDIO_PHYSICS_PARTICLE_FLOAT_EPSILON = 1e-7;
export const STUDIO_PHYSICS_PARTICLE_TAU = Math.PI * 2;
export const STUDIO_PHYSICS_PARTICLE_STATION_STRIDE = 8;

export type PhysicsParticleMode = "orbital" | "flow" | "spring-net";
export type PhysicsParticleExpressionSource =
  | "constant"
  | "pressure"
  | "speed"
  | "tilt";
export type PhysicsParticleSpringTopology = "radial" | "chain" | "ring";

export interface PhysicsParticleExpressionView {
  readonly source: PhysicsParticleExpressionSource;
  readonly minimum: number;
  readonly maximum: number;
  readonly invert: boolean;
}

export interface PhysicsParticleOrbitalView {
  readonly steps: number;
  readonly velocity: number;
  readonly acceleration: number;
  readonly spin: number;
  readonly orbitRadius: number;
  readonly orbitRadiusJitter: number;
}

export interface PhysicsParticleFlowView {
  readonly lifetimeSteps: number;
  readonly velocity: number;
  readonly positionJitter: number;
  readonly flowHeightGain: number;
  readonly flowTangentGain: number;
}

export interface PhysicsParticleSpringView {
  readonly topology: PhysicsParticleSpringTopology;
  readonly steps: number;
  readonly initialRadius: number;
  readonly stiffness: number;
  readonly springDamping: number;
  readonly restLength: number;
  readonly restLengthJitter: number;
  readonly emitConnectors: boolean;
  readonly connectorAlpha: number;
  readonly connectorWeight: number;
  readonly connectorGlow: number;
}

export interface PhysicsParticleRecipeKernelView {
  readonly mode: PhysicsParticleMode;
  readonly seed: number;
  readonly common: Readonly<{
    count: number;
    spawnSpacing: number;
    fixedTimeStepSeconds: number;
    globalChaos: number;
    localChaos: number;
    chaosSmoothing: number;
    damping: number;
    dampingJitter: number;
    directionalForce: number;
    forceDirectionRadians: number;
    baseRadius: number;
    baseAlpha: number;
    baseWeight: number;
    baseGlow: number;
    expressions: Readonly<{
      radius: PhysicsParticleExpressionView;
      alpha: PhysicsParticleExpressionView;
      weight: PhysicsParticleExpressionView;
      glow: PhysicsParticleExpressionView;
      force: PhysicsParticleExpressionView;
      chaos: PhysicsParticleExpressionView;
    }>;
  }>;
  readonly orbital: Readonly<PhysicsParticleOrbitalView> | null;
  readonly flow: Readonly<PhysicsParticleFlowView> | null;
  readonly springNet: Readonly<PhysicsParticleSpringView> | null;
}

export interface PhysicsParticleFlowFieldView {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  readonly heights: Float32Array;
}

export interface PhysicsParticleState {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly damping: Float64Array;
  readonly chaosX: Float64Array;
  readonly chaosY: Float64Array;
}

export interface PhysicsParticlePathBuffers {
  readonly positions: Float32Array;
  readonly particleIndices: Uint32Array;
  readonly spawnIndices: Uint32Array;
  readonly stepIndices: Uint32Array;
}

export interface PhysicsParticleDepositionBuffers {
  readonly positions: Float32Array;
  readonly radius: Float32Array;
  readonly alpha: Float32Array;
  readonly weight: Float32Array;
  readonly glow: Float32Array;
}

export interface PhysicsParticleConnectorBuffers {
  readonly segments: Float32Array;
  readonly spawnIndices: Uint32Array;
  readonly stepIndices: Uint32Array;
  readonly alpha: Float32Array;
  readonly weight: Float32Array;
  readonly glow: Float32Array;
}

export interface PhysicsParticleSimulationArraysView {
  readonly path: PhysicsParticlePathBuffers;
  readonly deposition: PhysicsParticleDepositionBuffers;
  readonly connectors: PhysicsParticleConnectorBuffers | null;
}

export interface PhysicsParticleStepInput {
  readonly recipe: PhysicsParticleRecipeKernelView;
  readonly stations: Float32Array;
  readonly flowField: PhysicsParticleFlowFieldView | null;
  readonly connectorEdges: readonly (readonly [number, number])[];
  readonly stepsPerSpawn: number;
  readonly spawn: number;
  readonly step: number;
  readonly emitterX: number;
  readonly emitterY: number;
  readonly directionalX: number;
  readonly directionalY: number;
  readonly forceExpression: number;
  readonly chaosExpression: number;
  readonly globalChaosX: number;
  readonly globalChaosY: number;
  readonly maxCoordinateMagnitude: number;
  readonly state: PhysicsParticleState;
  readonly accelerationX: Float64Array;
  readonly accelerationY: Float64Array;
  readonly restLengths: Float64Array;
  readonly arrays: PhysicsParticleSimulationArraysView;
}

export type PhysicsParticleStepOutcome =
  | Readonly<{
    ok: true;
    globalChaosX: number;
    globalChaosY: number;
  }>
  | Readonly<{
    ok: false;
  }>;

export function f32(value: number): number {
  return Math.fround(Number.isFinite(value) ? value : 0);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function deterministicUnit(
  seed: number,
  spawn: number,
  particle: number,
  step: number,
  channel: number,
): number {
  let value = seed >>> 0;
  value = mix32(value ^ Math.imul(spawn + 1, 0x9e37_79b1));
  value = mix32(value ^ Math.imul(particle + 1, 0x85eb_ca77));
  value = mix32(value ^ Math.imul(step + 1, 0xc2b2_ae3d));
  value = mix32(value ^ Math.imul(channel + 1, 0x27d4_eb2f));
  return value / 0x1_0000_0000;
}

export function deterministicSigned(
  seed: number,
  spawn: number,
  particle: number,
  step: number,
  channel: number,
): number {
  return deterministicUnit(seed, spawn, particle, step, channel) * 2 - 1;
}

export function expressionValue(
  expression: PhysicsParticleExpressionView,
  station: Float32Array,
  offset: number,
): number {
  let source = 1;
  if (expression.source === "pressure") source = station[offset + 4] ?? 1;
  else if (expression.source === "speed") source = station[offset + 5] ?? 0;
  else if (expression.source === "tilt") {
    source = clamp01(Math.hypot(station[offset + 6] ?? 0, station[offset + 7] ?? 0));
  }
  if (expression.invert) source = 1 - source;
  return expression.minimum
    + (expression.maximum - expression.minimum) * clamp01(source);
}

export function buildSpringEdges(
  count: number,
  topology: PhysicsParticleSpringTopology | null,
): readonly (readonly [number, number])[] {
  if (!topology || count < 2) return Object.freeze([]);
  const edges: (readonly [number, number])[] = [];
  if (topology === "radial") {
    for (let particle = 1; particle < count; particle += 1) {
      edges.push(Object.freeze([0, particle] as const));
    }
  } else if (topology === "chain") {
    for (let particle = 1; particle < count; particle += 1) {
      edges.push(Object.freeze([particle - 1, particle] as const));
    }
  } else {
    for (let particle = 0; particle < count; particle += 1) {
      edges.push(Object.freeze([particle, (particle + 1) % count] as const));
    }
  }
  return Object.freeze(edges);
}

export function sampleFlowHeight(
  field: PhysicsParticleFlowFieldView,
  x: number,
  y: number,
): number {
  const gridX = Math.min(
    field.width - 1,
    Math.max(0, (x - field.originX) / field.cellSize),
  );
  const gridY = Math.min(
    field.height - 1,
    Math.max(0, (y - field.originY) / field.cellSize),
  );
  const x0 = Math.floor(gridX);
  const y0 = Math.floor(gridY);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const tx = gridX - x0;
  const ty = gridY - y0;
  const topLeft = field.heights[y0 * field.width + x0] ?? 0;
  const topRight = field.heights[y0 * field.width + x1] ?? 0;
  const bottomLeft = field.heights[y1 * field.width + x0] ?? 0;
  const bottomRight = field.heights[y1 * field.width + x1] ?? 0;
  const top = topLeft + (topRight - topLeft) * tx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;
  return top + (bottom - top) * ty;
}

export function sampleFlowVector(
  field: PhysicsParticleFlowFieldView | null,
  x: number,
  y: number,
): Readonly<{ gradientX: number; gradientY: number; height: number }> {
  if (!field) {
    return { gradientX: 0, gradientY: 0, height: 0 };
  }
  const half = field.cellSize * 0.5;
  const left = sampleFlowHeight(field, x - half, y);
  const right = sampleFlowHeight(field, x + half, y);
  const top = sampleFlowHeight(field, x, y - half);
  const bottom = sampleFlowHeight(field, x, y + half);
  return {
    gradientX: (right - left) / field.cellSize,
    gradientY: (bottom - top) / field.cellSize,
    height: sampleFlowHeight(field, x, y),
  };
}

export function initializeParticleState(
  recipe: PhysicsParticleRecipeKernelView,
  stations: Float32Array,
  state: PhysicsParticleState,
  spawn: number,
): void {
  const count = recipe.common.count;
  const stationOffset = spawn * STUDIO_PHYSICS_PARTICLE_STATION_STRIDE;
  const emitterX = stations[stationOffset] ?? 0;
  const emitterY = stations[stationOffset + 1] ?? 0;
  const tangentX = stations[stationOffset + 2] ?? 0;
  const tangentY = stations[stationOffset + 3] ?? 0;
  const normalX = -tangentY;
  const normalY = tangentX;

  for (let particle = 0; particle < count; particle += 1) {
    const dampingVariation = deterministicSigned(
      recipe.seed,
      spawn,
      particle,
      0,
      1,
    );
    state.damping[particle] = Math.max(
      0,
      recipe.common.damping
        * (1 + recipe.common.dampingJitter * dampingVariation),
    );
    state.chaosX[particle] = 0;
    state.chaosY[particle] = 0;
    if (recipe.mode === "orbital" && recipe.orbital) {
      const angle = STUDIO_PHYSICS_PARTICLE_TAU * particle / count
        + deterministicSigned(recipe.seed, spawn, particle, 0, 2) * 0.2;
      const radius = recipe.orbital.orbitRadius * (
        1
        + recipe.orbital.orbitRadiusJitter
          * deterministicSigned(recipe.seed, spawn, particle, 0, 3)
      );
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      state.x[particle] = emitterX + radialX * radius;
      state.y[particle] = emitterY + radialY * radius;
      state.vx[particle] = tangentX * recipe.orbital.velocity
        - radialY * recipe.orbital.spin * radius;
      state.vy[particle] = tangentY * recipe.orbital.velocity
        + radialX * recipe.orbital.spin * radius;
    } else if (recipe.mode === "flow" && recipe.flow) {
      const angle = STUDIO_PHYSICS_PARTICLE_TAU * deterministicUnit(
        recipe.seed,
        spawn,
        particle,
        0,
        4,
      );
      const radius = recipe.flow.positionJitter * Math.sqrt(
        deterministicUnit(recipe.seed, spawn, particle, 0, 5),
      );
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      state.x[particle] = emitterX + radialX * radius;
      state.y[particle] = emitterY + radialY * radius;
      state.vx[particle] = tangentX * recipe.flow.velocity
        + radialX * Math.abs(recipe.flow.velocity) * 0.25;
      state.vy[particle] = tangentY * recipe.flow.velocity
        + radialY * Math.abs(recipe.flow.velocity) * 0.25;
    } else if (recipe.springNet) {
      if (recipe.springNet.topology === "chain") {
        const centered = particle - (count - 1) * 0.5;
        state.x[particle] = emitterX
          + normalX * centered * recipe.springNet.restLength;
        state.y[particle] = emitterY
          + normalY * centered * recipe.springNet.restLength;
      } else if (
        recipe.springNet.topology === "radial"
        && particle === 0
      ) {
        state.x[particle] = emitterX;
        state.y[particle] = emitterY;
      } else {
        const denominator = recipe.springNet.topology === "radial"
          ? Math.max(1, count - 1)
          : count;
        const ringIndex = recipe.springNet.topology === "radial"
          ? particle - 1
          : particle;
        const angle = STUDIO_PHYSICS_PARTICLE_TAU * ringIndex / denominator;
        state.x[particle] = emitterX
          + Math.cos(angle) * recipe.springNet.initialRadius;
        state.y[particle] = emitterY
          + Math.sin(angle) * recipe.springNet.initialRadius;
      }
      state.vx[particle] = tangentX
        * deterministicSigned(recipe.seed, spawn, particle, 0, 6)
        * 0.01;
      state.vy[particle] = tangentY
        * deterministicSigned(recipe.seed, spawn, particle, 0, 7)
        * 0.01;
    }
  }
}

export function initializeSpawnSpringRestLengths(
  recipe: PhysicsParticleRecipeKernelView,
  connectorEdgeCount: number,
  spawn: number,
  restLengths: Float64Array,
): void {
  const baseRestLength = recipe.springNet?.restLength ?? 0;
  const jitter = recipe.springNet?.restLengthJitter ?? 0;
  for (let edgeIndex = 0; edgeIndex < connectorEdgeCount; edgeIndex += 1) {
    restLengths[edgeIndex] = baseRestLength * (
      1 + jitter * deterministicSigned(recipe.seed, spawn, edgeIndex, 0, 20)
    );
  }
}

export function recordPhysicsParticlePathPoint(
  arrays: PhysicsParticleSimulationArraysView,
  recipe: PhysicsParticleRecipeKernelView,
  stations: Float32Array,
  stepsPerSpawn: number,
  spawn: number,
  step: number,
  particle: number,
  x: number,
  y: number,
): void {
  const count = recipe.common.count;
  const pointIndex = (
    spawn * stepsPerSpawn * count
    + step * count
    + particle
  );
  const positionOffset = pointIndex * 2;
  const stationOffset = spawn * STUDIO_PHYSICS_PARTICLE_STATION_STRIDE;
  const expressions = recipe.common.expressions;
  const life = recipe.mode === "flow"
    ? 1 - step / stepsPerSpawn
    : 1;
  const radius = recipe.common.baseRadius
    * expressionValue(expressions.radius, stations, stationOffset);
  const alpha = clamp01(
    recipe.common.baseAlpha
    * expressionValue(expressions.alpha, stations, stationOffset)
    * life,
  );
  const weight = Math.max(
    0,
    recipe.common.baseWeight
    * expressionValue(expressions.weight, stations, stationOffset),
  );
  const glow = Math.max(
    0,
    recipe.common.baseGlow
    * expressionValue(expressions.glow, stations, stationOffset)
    * life,
  );
  arrays.path.positions[positionOffset] = f32(x);
  arrays.path.positions[positionOffset + 1] = f32(y);
  arrays.path.particleIndices[pointIndex] = particle;
  arrays.path.spawnIndices[pointIndex] = spawn;
  arrays.path.stepIndices[pointIndex] = step;
  arrays.deposition.positions[positionOffset] = f32(x);
  arrays.deposition.positions[positionOffset + 1] = f32(y);
  arrays.deposition.radius[pointIndex] = f32(radius);
  arrays.deposition.alpha[pointIndex] = f32(alpha);
  arrays.deposition.weight[pointIndex] = f32(weight);
  arrays.deposition.glow[pointIndex] = f32(glow);
}

export function recordPhysicsParticleConnectors(
  arrays: PhysicsParticleSimulationArraysView,
  recipe: PhysicsParticleRecipeKernelView,
  connectorEdges: readonly (readonly [number, number])[],
  stepsPerSpawn: number,
  state: PhysicsParticleState,
  spawn: number,
  step: number,
): void {
  if (!arrays.connectors || !recipe.springNet) return;
  const settings = recipe.springNet;
  const baseIndex = (
    spawn * stepsPerSpawn * connectorEdges.length
    + step * connectorEdges.length
  );
  for (let edgeIndex = 0; edgeIndex < connectorEdges.length; edgeIndex += 1) {
    const edge = connectorEdges[edgeIndex]!;
    const left = edge[0];
    const right = edge[1];
    const connectorIndex = baseIndex + edgeIndex;
    const offset = connectorIndex * 4;
    arrays.connectors.segments[offset] = f32(state.x[left] ?? 0);
    arrays.connectors.segments[offset + 1] = f32(state.y[left] ?? 0);
    arrays.connectors.segments[offset + 2] = f32(state.x[right] ?? 0);
    arrays.connectors.segments[offset + 3] = f32(state.y[right] ?? 0);
    arrays.connectors.spawnIndices[connectorIndex] = spawn;
    arrays.connectors.stepIndices[connectorIndex] = step;
    arrays.connectors.alpha[connectorIndex] = f32(settings.connectorAlpha);
    arrays.connectors.weight[connectorIndex] = f32(settings.connectorWeight);
    arrays.connectors.glow[connectorIndex] = f32(settings.connectorGlow);
  }
}

/**
 * 단일 물리 스텝의 힘 누적(카오스·방향력·궤도·플로우 필드·스프링 망)과
 * 감쇠 반암시적 오일러 적분 및 경로/커넥터 기록을 수행한다.
 */
export function stepPhysicsParticles(
  input: PhysicsParticleStepInput,
): PhysicsParticleStepOutcome {
  const {
    recipe,
    stations,
    flowField,
    connectorEdges,
    stepsPerSpawn,
    spawn,
    step,
    emitterX,
    emitterY,
    directionalX,
    directionalY,
    forceExpression,
    chaosExpression,
    maxCoordinateMagnitude,
    state,
    accelerationX,
    accelerationY,
    restLengths,
    arrays,
  } = input;

  const count = recipe.common.count;
  const timeStep = recipe.common.fixedTimeStepSeconds;
  const smoothing = recipe.common.chaosSmoothing;
  const globalChaosX = input.globalChaosX * smoothing
    + deterministicSigned(recipe.seed, spawn, 0, step, 21) * (1 - smoothing);
  const globalChaosY = input.globalChaosY * smoothing
    + deterministicSigned(recipe.seed, spawn, 0, step, 22) * (1 - smoothing);

  accelerationX.fill(
    directionalX * recipe.common.directionalForce * forceExpression,
  );
  accelerationY.fill(
    directionalY * recipe.common.directionalForce * forceExpression,
  );

  for (let particle = 0; particle < count; particle += 1) {
    state.chaosX[particle] = state.chaosX[particle]! * smoothing
      + deterministicSigned(recipe.seed, spawn, particle, step, 23)
        * (1 - smoothing);
    state.chaosY[particle] = state.chaosY[particle]! * smoothing
      + deterministicSigned(recipe.seed, spawn, particle, step, 24)
        * (1 - smoothing);
    accelerationX[particle] = accelerationX[particle]! + (
      globalChaosX * recipe.common.globalChaos
      + state.chaosX[particle]! * recipe.common.localChaos
    ) * chaosExpression;
    accelerationY[particle] = accelerationY[particle]! + (
      globalChaosY * recipe.common.globalChaos
      + state.chaosY[particle]! * recipe.common.localChaos
    ) * chaosExpression;

    if (recipe.mode === "orbital" && recipe.orbital) {
      const relativeX = state.x[particle]! - emitterX;
      const relativeY = state.y[particle]! - emitterY;
      const length = Math.max(
        STUDIO_PHYSICS_PARTICLE_FLOAT_EPSILON,
        Math.hypot(relativeX, relativeY),
      );
      accelerationX[particle] = accelerationX[particle]!
        + relativeX / length * recipe.orbital.acceleration;
      accelerationY[particle] = accelerationY[particle]!
        + relativeY / length * recipe.orbital.acceleration;
      const angle = recipe.orbital.spin * timeStep;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const vx = state.vx[particle]!;
      const vy = state.vy[particle]!;
      state.vx[particle] = vx * cosine - vy * sine;
      state.vy[particle] = vx * sine + vy * cosine;
    } else if (recipe.mode === "flow" && recipe.flow) {
      const flow = sampleFlowVector(
        flowField,
        state.x[particle]!,
        state.y[particle]!,
      );
      accelerationX[particle] = accelerationX[particle]! + (
        flow.gradientX * recipe.flow.flowHeightGain
        - flow.gradientY * recipe.flow.flowTangentGain
      ) * (1 + Math.abs(flow.height) * 0.01);
      accelerationY[particle] = accelerationY[particle]! + (
        flow.gradientY * recipe.flow.flowHeightGain
        + flow.gradientX * recipe.flow.flowTangentGain
      ) * (1 + Math.abs(flow.height) * 0.01);
    }
  }

  if (recipe.mode === "spring-net" && recipe.springNet) {
    for (let edgeIndex = 0; edgeIndex < connectorEdges.length; edgeIndex += 1) {
      const edge = connectorEdges[edgeIndex]!;
      const left = edge[0];
      const right = edge[1];
      const deltaX = state.x[right]! - state.x[left]!;
      const deltaY = state.y[right]! - state.y[left]!;
      const length = Math.max(
        STUDIO_PHYSICS_PARTICLE_FLOAT_EPSILON,
        Math.hypot(deltaX, deltaY),
      );
      const directionX = deltaX / length;
      const directionY = deltaY / length;
      const relativeVelocity = (
        (state.vx[right]! - state.vx[left]!) * directionX
        + (state.vy[right]! - state.vy[left]!) * directionY
      );
      const magnitude = (
        recipe.springNet.stiffness * (length - restLengths[edgeIndex]!)
        + recipe.springNet.springDamping * relativeVelocity
      );
      const forceX = directionX * magnitude;
      const forceY = directionY * magnitude;
      accelerationX[left] = accelerationX[left]! + forceX;
      accelerationY[left] = accelerationY[left]! + forceY;
      accelerationX[right] = accelerationX[right]! - forceX;
      accelerationY[right] = accelerationY[right]! - forceY;
    }
    for (let particle = 0; particle < count; particle += 1) {
      accelerationX[particle] = accelerationX[particle]!
        + (emitterX - state.x[particle]!) * recipe.springNet.stiffness * 0.05;
      accelerationY[particle] = accelerationY[particle]!
        + (emitterY - state.y[particle]!) * recipe.springNet.stiffness * 0.05;
    }
  }

  for (let particle = 0; particle < count; particle += 1) {
    const anchored = (
      recipe.mode === "spring-net"
      && recipe.springNet
      && (
        recipe.springNet.topology === "radial"
        || recipe.springNet.topology === "chain"
      )
      && particle === 0
    );
    if (anchored) {
      state.x[particle] = emitterX;
      state.y[particle] = emitterY;
      state.vx[particle] = 0;
      state.vy[particle] = 0;
    } else {
      state.vx[particle] = state.vx[particle]! + accelerationX[particle]! * timeStep;
      state.vy[particle] = state.vy[particle]! + accelerationY[particle]! * timeStep;
      const dampingFactor = Math.exp(-state.damping[particle]! * timeStep);
      state.vx[particle] = state.vx[particle]! * dampingFactor;
      state.vy[particle] = state.vy[particle]! * dampingFactor;
      state.x[particle] = state.x[particle]! + state.vx[particle]! * timeStep;
      state.y[particle] = state.y[particle]! + state.vy[particle]! * timeStep;
    }
    const px = state.x[particle]!;
    const py = state.y[particle]!;
    if (
      !Number.isFinite(px)
      || !Number.isFinite(py)
      || Math.abs(px) > maxCoordinateMagnitude
      || Math.abs(py) > maxCoordinateMagnitude
    ) {
      return Object.freeze({ ok: false as const });
    }
    recordPhysicsParticlePathPoint(
      arrays,
      recipe,
      stations,
      stepsPerSpawn,
      spawn,
      step,
      particle,
      px,
      py,
    );
  }

  recordPhysicsParticleConnectors(
    arrays,
    recipe,
    connectorEdges,
    stepsPerSpawn,
    state,
    spawn,
    step,
  );
  return Object.freeze({ ok: true as const, globalChaosX, globalChaosY });
}
