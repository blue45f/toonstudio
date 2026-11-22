/**
 * 물리 파티클 브러시 순수 레시피·스트로크 표본 정규화 및 메모리/버퍼 할당 커널 (Wave 3 #012).
 *
 * `studio-physics-particle-brush-provider.ts`에서 추출된 결정론 입력 정규화,
 * 고정 호길이(arc-length) 에미터 스테이션 생성, 바이트 예산 계산 및 시뮬레이션 버퍼 할당 모듈이다.
 * DOM/Canvas/Worker/GPU/시계/비결정론 난수 의존성이 전혀 없다.
 */

import {
  STUDIO_PHYSICS_PARTICLE_FLOAT_EPSILON,
  STUDIO_PHYSICS_PARTICLE_STATION_STRIDE,
  clamp01,
  f32,
  type PhysicsParticleConnectorBuffers,
  type PhysicsParticleDepositionBuffers,
  type PhysicsParticleExpressionSource,
  type PhysicsParticleExpressionView,
  type PhysicsParticleFlowView,
  type PhysicsParticleMode,
  type PhysicsParticleOrbitalView,
  type PhysicsParticlePathBuffers,
  type PhysicsParticleRecipeKernelView,
  type PhysicsParticleSimulationArraysView,
  type PhysicsParticleSpringTopology,
  type PhysicsParticleSpringView,
} from "./studio-physics-particle-kernel";

export interface PhysicsParticleBudgetLimits {
  readonly maxInputSamples: number;
  readonly maxParticles: number;
  readonly maxSpawnStations: number;
  readonly maxStepsPerSpawn: number;
  readonly maxCoordinateMagnitude: number;
  readonly maxSeed: number;
}

export interface PhysicsParticleValidationErrorCallbacks {
  readonly invalidRequest: (message: string) => never;
  readonly budget: (message: string) => never;
}

export interface PhysicsParticleExpressionInput {
  readonly source: PhysicsParticleExpressionSource;
  readonly minimum: number;
  readonly maximum: number;
  readonly invert?: boolean;
}

export interface PhysicsParticleExpressionSetInput {
  readonly radius?: PhysicsParticleExpressionInput;
  readonly alpha?: PhysicsParticleExpressionInput;
  readonly weight?: PhysicsParticleExpressionInput;
  readonly glow?: PhysicsParticleExpressionInput;
  readonly force?: PhysicsParticleExpressionInput;
  readonly chaos?: PhysicsParticleExpressionInput;
}

export interface PhysicsParticleCommonSettingsInput {
  readonly count: number;
  readonly spawnSpacing: number;
  readonly fixedTimeStepSeconds: number;
  readonly globalChaos: number;
  readonly localChaos: number;
  readonly chaosSmoothing: number;
  readonly damping: number;
  readonly dampingJitter: number;
  readonly directionalForce: number;
  readonly forceDirectionRadians: number;
  readonly baseRadius: number;
  readonly baseAlpha: number;
  readonly baseWeight: number;
  readonly baseGlow: number;
  readonly expressions?: PhysicsParticleExpressionSetInput;
}

export interface PhysicsParticleSpringSettingsInput {
  readonly topology: PhysicsParticleSpringTopology;
  readonly steps: number;
  readonly initialRadius: number;
  readonly stiffness: number;
  readonly springDamping: number;
  readonly restLength: number;
  readonly restLengthJitter: number;
  readonly emitConnectors?: boolean;
  readonly connectorAlpha?: number;
  readonly connectorWeight?: number;
  readonly connectorGlow?: number;
}

export interface PhysicsParticleRecipeInput {
  readonly mode: PhysicsParticleMode;
  readonly seed: number;
  readonly common: PhysicsParticleCommonSettingsInput;
  readonly orbital?: PhysicsParticleOrbitalView;
  readonly flow?: PhysicsParticleFlowView;
  readonly springNet?: PhysicsParticleSpringSettingsInput;
}

export interface PhysicsParticleStrokeSampleInput {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly speed?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
}

export interface NormalizedPhysicsParticleSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly speed: number;
  readonly tiltX: number;
  readonly tiltY: number;
}

function finiteInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  errors: PhysicsParticleValidationErrorCallbacks,
): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
  ) {
    errors.invalidRequest(
      `${label} must be finite and within [${minimum}, ${maximum}].`,
    );
  }
  return value;
}

function safeIntegerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  errors: PhysicsParticleValidationErrorCallbacks,
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    errors.invalidRequest(
      `${label} must be a safe integer within [${minimum}, ${maximum}].`,
    );
  }
  return value;
}

export function normalizePhysicsParticleExpression(
  input: PhysicsParticleExpressionInput | undefined,
  label: string,
  errors: PhysicsParticleValidationErrorCallbacks,
): PhysicsParticleExpressionView {
  const source = input?.source ?? "constant";
  if (
    source !== "constant"
    && source !== "pressure"
    && source !== "speed"
    && source !== "tilt"
  ) {
    errors.invalidRequest(`${label}.source is not supported.`);
  }
  return Object.freeze({
    source,
    minimum: finiteInRange(input?.minimum ?? 1, `${label}.minimum`, 0, 16, errors),
    maximum: finiteInRange(input?.maximum ?? 1, `${label}.maximum`, 0, 16, errors),
    invert: Boolean(input?.invert),
  });
}

export function normalizePhysicsParticleRecipe(
  input: PhysicsParticleRecipeInput,
  budgets: PhysicsParticleBudgetLimits,
  errors: PhysicsParticleValidationErrorCallbacks,
): PhysicsParticleRecipeKernelView {
  if (!input || typeof input !== "object") {
    errors.invalidRequest("A particle brush recipe is required.");
  }
  if (
    input.mode !== "orbital"
    && input.mode !== "flow"
    && input.mode !== "spring-net"
  ) {
    errors.invalidRequest("Particle mode must be orbital, flow, or spring-net.");
  }
  const common = input.common;
  if (!common || typeof common !== "object") {
    errors.invalidRequest("Common particle settings are required.");
  }
  const normalizedCommon = Object.freeze({
    count: safeIntegerInRange(
      common.count,
      "common.count",
      1,
      budgets.maxParticles,
      errors,
    ),
    spawnSpacing: finiteInRange(
      common.spawnSpacing,
      "common.spawnSpacing",
      0.01,
      1_000_000,
      errors,
    ),
    fixedTimeStepSeconds: finiteInRange(
      common.fixedTimeStepSeconds,
      "common.fixedTimeStepSeconds",
      0.0001,
      0.25,
      errors,
    ),
    globalChaos: finiteInRange(
      common.globalChaos,
      "common.globalChaos",
      0,
      100_000,
      errors,
    ),
    localChaos: finiteInRange(
      common.localChaos,
      "common.localChaos",
      0,
      100_000,
      errors,
    ),
    chaosSmoothing: finiteInRange(
      common.chaosSmoothing,
      "common.chaosSmoothing",
      0,
      0.9999,
      errors,
    ),
    damping: finiteInRange(common.damping, "common.damping", 0, 1_000, errors),
    dampingJitter: finiteInRange(
      common.dampingJitter,
      "common.dampingJitter",
      0,
      1,
      errors,
    ),
    directionalForce: finiteInRange(
      common.directionalForce,
      "common.directionalForce",
      -100_000,
      100_000,
      errors,
    ),
    forceDirectionRadians: finiteInRange(
      common.forceDirectionRadians,
      "common.forceDirectionRadians",
      -100_000,
      100_000,
      errors,
    ),
    baseRadius: finiteInRange(
      common.baseRadius,
      "common.baseRadius",
      0.001,
      1_000_000,
      errors,
    ),
    baseAlpha: finiteInRange(common.baseAlpha, "common.baseAlpha", 0, 1, errors),
    baseWeight: finiteInRange(
      common.baseWeight,
      "common.baseWeight",
      0,
      16,
      errors,
    ),
    baseGlow: finiteInRange(common.baseGlow, "common.baseGlow", 0, 16, errors),
    expressions: Object.freeze({
      radius: normalizePhysicsParticleExpression(
        common.expressions?.radius,
        "expressions.radius",
        errors,
      ),
      alpha: normalizePhysicsParticleExpression(
        common.expressions?.alpha,
        "expressions.alpha",
        errors,
      ),
      weight: normalizePhysicsParticleExpression(
        common.expressions?.weight,
        "expressions.weight",
        errors,
      ),
      glow: normalizePhysicsParticleExpression(
        common.expressions?.glow,
        "expressions.glow",
        errors,
      ),
      force: normalizePhysicsParticleExpression(
        common.expressions?.force,
        "expressions.force",
        errors,
      ),
      chaos: normalizePhysicsParticleExpression(
        common.expressions?.chaos,
        "expressions.chaos",
        errors,
      ),
    }),
  });

  let orbital: Readonly<PhysicsParticleOrbitalView> | null = null;
  let flow: Readonly<PhysicsParticleFlowView> | null = null;
  let springNet: Readonly<PhysicsParticleSpringView> | null = null;
  if (input.mode === "orbital") {
    if (!input.orbital) {
      errors.invalidRequest("Orbital settings are required for orbital mode.");
    }
    orbital = Object.freeze({
      steps: safeIntegerInRange(
        input.orbital.steps,
        "orbital.steps",
        1,
        budgets.maxStepsPerSpawn,
        errors,
      ),
      velocity: finiteInRange(
        input.orbital.velocity,
        "orbital.velocity",
        -100_000,
        100_000,
        errors,
      ),
      acceleration: finiteInRange(
        input.orbital.acceleration,
        "orbital.acceleration",
        -100_000,
        100_000,
        errors,
      ),
      spin: finiteInRange(
        input.orbital.spin,
        "orbital.spin",
        -10_000,
        10_000,
        errors,
      ),
      orbitRadius: finiteInRange(
        input.orbital.orbitRadius,
        "orbital.orbitRadius",
        0,
        1_000_000,
        errors,
      ),
      orbitRadiusJitter: finiteInRange(
        input.orbital.orbitRadiusJitter,
        "orbital.orbitRadiusJitter",
        0,
        1,
        errors,
      ),
    });
  } else if (input.mode === "flow") {
    if (!input.flow) {
      errors.invalidRequest("Flow settings are required for flow mode.");
    }
    flow = Object.freeze({
      lifetimeSteps: safeIntegerInRange(
        input.flow.lifetimeSteps,
        "flow.lifetimeSteps",
        1,
        Math.min(96, budgets.maxStepsPerSpawn),
        errors,
      ),
      velocity: finiteInRange(
        input.flow.velocity,
        "flow.velocity",
        -100_000,
        100_000,
        errors,
      ),
      positionJitter: finiteInRange(
        input.flow.positionJitter,
        "flow.positionJitter",
        0,
        1_000_000,
        errors,
      ),
      flowHeightGain: finiteInRange(
        input.flow.flowHeightGain,
        "flow.flowHeightGain",
        -100_000,
        100_000,
        errors,
      ),
      flowTangentGain: finiteInRange(
        input.flow.flowTangentGain,
        "flow.flowTangentGain",
        -100_000,
        100_000,
        errors,
      ),
    });
  } else {
    if (!input.springNet) {
      errors.invalidRequest(
        "Spring-net settings are required for spring-net mode.",
      );
    }
    const topology = input.springNet.topology;
    if (topology !== "radial" && topology !== "chain" && topology !== "ring") {
      errors.invalidRequest("Spring topology must be radial, chain, or ring.");
    }
    springNet = Object.freeze({
      topology,
      steps: safeIntegerInRange(
        input.springNet.steps,
        "springNet.steps",
        1,
        budgets.maxStepsPerSpawn,
        errors,
      ),
      initialRadius: finiteInRange(
        input.springNet.initialRadius,
        "springNet.initialRadius",
        0,
        1_000_000,
        errors,
      ),
      stiffness: finiteInRange(
        input.springNet.stiffness,
        "springNet.stiffness",
        0,
        1_000_000,
        errors,
      ),
      springDamping: finiteInRange(
        input.springNet.springDamping,
        "springNet.springDamping",
        0,
        10_000,
        errors,
      ),
      restLength: finiteInRange(
        input.springNet.restLength,
        "springNet.restLength",
        0.0001,
        1_000_000,
        errors,
      ),
      restLengthJitter: finiteInRange(
        input.springNet.restLengthJitter,
        "springNet.restLengthJitter",
        0,
        1,
        errors,
      ),
      emitConnectors: Boolean(input.springNet.emitConnectors),
      connectorAlpha: finiteInRange(
        input.springNet.connectorAlpha ?? 0.5,
        "springNet.connectorAlpha",
        0,
        1,
        errors,
      ),
      connectorWeight: finiteInRange(
        input.springNet.connectorWeight ?? 1,
        "springNet.connectorWeight",
        0,
        16,
        errors,
      ),
      connectorGlow: finiteInRange(
        input.springNet.connectorGlow ?? 0,
        "springNet.connectorGlow",
        0,
        16,
        errors,
      ),
    });
  }
  return Object.freeze({
    mode: input.mode,
    seed: safeIntegerInRange(input.seed, "seed", 0, budgets.maxSeed, errors),
    common: normalizedCommon,
    orbital,
    flow,
    springNet,
  });
}

export function normalizePhysicsParticleSamples(
  input: readonly PhysicsParticleStrokeSampleInput[],
  budgets: PhysicsParticleBudgetLimits,
  errors: PhysicsParticleValidationErrorCallbacks,
): readonly NormalizedPhysicsParticleSample[] {
  if (
    !Array.isArray(input)
    || input.length < 2
    || input.length > budgets.maxInputSamples
  ) {
    if (input?.length > budgets.maxInputSamples) {
      errors.budget("Particle strokes require two or more bounded input samples.");
    }
    errors.invalidRequest(
      "Particle strokes require two or more bounded input samples.",
    );
  }
  const result: NormalizedPhysicsParticleSample[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index];
    if (!sample || typeof sample !== "object") {
      errors.invalidRequest(`samples[${index}] is malformed.`);
    }
    const normalized = Object.freeze({
      x: finiteInRange(
        sample.x,
        `samples[${index}].x`,
        -budgets.maxCoordinateMagnitude,
        budgets.maxCoordinateMagnitude,
        errors,
      ),
      y: finiteInRange(
        sample.y,
        `samples[${index}].y`,
        -budgets.maxCoordinateMagnitude,
        budgets.maxCoordinateMagnitude,
        errors,
      ),
      pressure: finiteInRange(
        sample.pressure ?? 1,
        `samples[${index}].pressure`,
        0,
        1,
        errors,
      ),
      speed: finiteInRange(
        sample.speed ?? 0,
        `samples[${index}].speed`,
        0,
        1,
        errors,
      ),
      tiltX: finiteInRange(
        sample.tiltX ?? 0,
        `samples[${index}].tiltX`,
        -1,
        1,
        errors,
      ),
      tiltY: finiteInRange(
        sample.tiltY ?? 0,
        `samples[${index}].tiltY`,
        -1,
        1,
        errors,
      ),
    });
    const previous = result.at(-1);
    if (
      previous
      && Math.hypot(normalized.x - previous.x, normalized.y - previous.y)
        <= STUDIO_PHYSICS_PARTICLE_FLOAT_EPSILON
    ) {
      result[result.length - 1] = normalized;
    } else {
      result.push(normalized);
    }
  }
  if (result.length < 2) {
    errors.invalidRequest(
      "Particle stroke geometry must have non-zero arc length.",
    );
  }
  return Object.freeze(result);
}

export function buildPhysicsParticleEmitterStations(
  samples: readonly NormalizedPhysicsParticleSample[],
  spawnSpacing: number,
  maxSpawnStations: number,
  errors: PhysicsParticleValidationErrorCallbacks,
): Float32Array {
  const cumulative = new Float64Array(samples.length);
  let totalLength = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
    cumulative[index] = totalLength;
  }
  const spawnCount = Math.floor(
    (totalLength + spawnSpacing * 1e-9) / spawnSpacing,
  ) + 1;
  if (spawnCount < 1 || spawnCount > maxSpawnStations) {
    errors.budget("Fixed arc-length spawn station count exceeds its budget.");
  }
  const stations = new Float32Array(
    spawnCount * STUDIO_PHYSICS_PARTICLE_STATION_STRIDE,
  );
  let segment = 0;
  for (let spawn = 0; spawn < spawnCount; spawn += 1) {
    const distance = Math.min(totalLength, spawn * spawnSpacing);
    while (
      segment + 1 < cumulative.length - 1
      && cumulative[segment + 1]! < distance
    ) segment += 1;
    const start = samples[segment]!;
    const end = samples[segment + 1]!;
    const segmentLength = cumulative[segment + 1]! - cumulative[segment]!;
    const amount = segmentLength <= STUDIO_PHYSICS_PARTICLE_FLOAT_EPSILON
      ? 0
      : clamp01((distance - cumulative[segment]!) / segmentLength);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const inverseLength = 1 / Math.max(
      STUDIO_PHYSICS_PARTICLE_FLOAT_EPSILON,
      Math.hypot(dx, dy),
    );
    const offset = spawn * STUDIO_PHYSICS_PARTICLE_STATION_STRIDE;
    stations[offset] = f32(start.x + dx * amount);
    stations[offset + 1] = f32(start.y + dy * amount);
    stations[offset + 2] = f32(dx * inverseLength);
    stations[offset + 3] = f32(dy * inverseLength);
    stations[offset + 4] = f32(
      start.pressure + (end.pressure - start.pressure) * amount,
    );
    stations[offset + 5] = f32(
      start.speed + (end.speed - start.speed) * amount,
    );
    stations[offset + 6] = f32(
      start.tiltX + (end.tiltX - start.tiltX) * amount,
    );
    stations[offset + 7] = f32(
      start.tiltY + (end.tiltY - start.tiltY) * amount,
    );
  }
  return stations;
}

export function calculatePhysicsParticleOutputBytes(
  spawnCount: number,
  pathPointCount: number,
  connectorSegmentCount: number,
  errors: PhysicsParticleValidationErrorCallbacks,
): number {
  const emitterBytes =
    spawnCount
    * STUDIO_PHYSICS_PARTICLE_STATION_STRIDE
    * Float32Array.BYTES_PER_ELEMENT;
  const pathBytes = pathPointCount * (
    2 * Float32Array.BYTES_PER_ELEMENT
    + 3 * Uint32Array.BYTES_PER_ELEMENT
  );
  const depositionBytes = pathPointCount * (
    2 * Float32Array.BYTES_PER_ELEMENT
    + 4 * Float32Array.BYTES_PER_ELEMENT
  );
  const connectorBytes = connectorSegmentCount * (
    4 * Float32Array.BYTES_PER_ELEMENT
    + 2 * Uint32Array.BYTES_PER_ELEMENT
    + 3 * Float32Array.BYTES_PER_ELEMENT
  );
  const total = emitterBytes + pathBytes + depositionBytes + connectorBytes;
  if (!Number.isSafeInteger(total)) {
    errors.budget("Particle artifact bytes are unsafe.");
  }
  return total;
}

export function maximumPhysicsParticleArtifactPlaneBytes(
  spawnCount: number,
  pathPointCount: number,
  connectorSegmentCount: number,
): number {
  return Math.max(
    spawnCount
      * STUDIO_PHYSICS_PARTICLE_STATION_STRIDE
      * Float32Array.BYTES_PER_ELEMENT,
    pathPointCount * 2 * Float32Array.BYTES_PER_ELEMENT,
    pathPointCount * Uint32Array.BYTES_PER_ELEMENT,
    connectorSegmentCount * 4 * Float32Array.BYTES_PER_ELEMENT,
    connectorSegmentCount * Uint32Array.BYTES_PER_ELEMENT,
  );
}

export function allocatePhysicsParticleSimulationArrays(
  pathPointCount: number,
  connectorSegmentCount: number,
): PhysicsParticleSimulationArraysView {
  const path: PhysicsParticlePathBuffers = Object.freeze({
    positions: new Float32Array(pathPointCount * 2),
    particleIndices: new Uint32Array(pathPointCount),
    spawnIndices: new Uint32Array(pathPointCount),
    stepIndices: new Uint32Array(pathPointCount),
  });
  const deposition: PhysicsParticleDepositionBuffers = Object.freeze({
    positions: new Float32Array(pathPointCount * 2),
    radius: new Float32Array(pathPointCount),
    alpha: new Float32Array(pathPointCount),
    weight: new Float32Array(pathPointCount),
    glow: new Float32Array(pathPointCount),
  });
  const connectors: PhysicsParticleConnectorBuffers | null =
    connectorSegmentCount > 0
      ? Object.freeze({
        segments: new Float32Array(connectorSegmentCount * 4),
        spawnIndices: new Uint32Array(connectorSegmentCount),
        stepIndices: new Uint32Array(connectorSegmentCount),
        alpha: new Float32Array(connectorSegmentCount),
        weight: new Float32Array(connectorSegmentCount),
        glow: new Float32Array(connectorSegmentCount),
      })
      : null;
  return Object.freeze({ path, deposition, connectors });
}

export function isPreviousPhysicsParticleShapeValid(
  previous: Readonly<{
    spawnCount: number;
    emitterStations: Float32Array;
    path: PhysicsParticlePathBuffers;
    deposition: PhysicsParticleDepositionBuffers;
    connectors: PhysicsParticleConnectorBuffers | null;
  }>,
  particleCount: number,
  stepsPerSpawn: number,
  connectorEdgeCount: number,
  emitConnectors: boolean,
): boolean {
  const previousPointCount =
    previous.spawnCount * particleCount * stepsPerSpawn;
  const previousConnectorCount = emitConnectors
    ? previous.spawnCount * connectorEdgeCount * stepsPerSpawn
    : 0;
  return (
    previous.emitterStations.length
      === previous.spawnCount * STUDIO_PHYSICS_PARTICLE_STATION_STRIDE
    && previous.path.positions.length === previousPointCount * 2
    && previous.path.particleIndices.length === previousPointCount
    && previous.path.spawnIndices.length === previousPointCount
    && previous.path.stepIndices.length === previousPointCount
    && previous.deposition.positions.length === previousPointCount * 2
    && previous.deposition.radius.length === previousPointCount
    && previous.deposition.alpha.length === previousPointCount
    && previous.deposition.weight.length === previousPointCount
    && previous.deposition.glow.length === previousPointCount
    && (
      previousConnectorCount === 0
        ? previous.connectors === null
        : Boolean(
          previous.connectors
          && previous.connectors.segments.length === previousConnectorCount * 4
          && previous.connectors.spawnIndices.length === previousConnectorCount
          && previous.connectors.stepIndices.length === previousConnectorCount
          && previous.connectors.alpha.length === previousConnectorCount
          && previous.connectors.weight.length === previousConnectorCount
          && previous.connectors.glow.length === previousConnectorCount,
        )
    )
  );
}
