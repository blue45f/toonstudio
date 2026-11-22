import {
  STUDIO_PHYSICS_PARTICLE_STATION_STRIDE,
  buildSpringEdges,
  expressionValue,
  f32,
  initializeParticleState,
  initializeSpawnSpringRestLengths,
  stepPhysicsParticles,
  type PhysicsParticleState,
} from "./brush/studio-physics-particle-kernel";
import {
  allocatePhysicsParticleSimulationArrays,
  buildPhysicsParticleEmitterStations,
  calculatePhysicsParticleOutputBytes,
  isPreviousPhysicsParticleShapeValid,
  maximumPhysicsParticleArtifactPlaneBytes,
  normalizePhysicsParticleRecipe,
  normalizePhysicsParticleSamples,
} from "./brush/studio-physics-particle-recipe";
import { sha256HexPortable } from "./studio-sha256";

export const STUDIO_PHYSICS_PARTICLE_BRUSH_REVISION = 1 as const;
export const STUDIO_PHYSICS_PARTICLE_APPEND_POLICY =
  "prefix-validated-fixed-station-exact" as const;

export const STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS = Object.freeze({
  maxInputSamples: 100_000,
  maxParticles: 256,
  maxSpawnStations: 100_000,
  maxStepsPerSpawn: 256,
  maxFlowCells: 4_194_304,
  maxPathPoints: 4_000_000,
  maxConnectorSegments: 4_000_000,
  maxWorkUnits: 24_000_000,
  maxOutputBytes: 320 * 1024 * 1024,
  maxResidentBytes: 512 * 1024 * 1024,
  maxCoordinateMagnitude: 1_000_000_000,
  maxSeed: 0xffff_ffff,
} as const);

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const STATION_STRIDE = STUDIO_PHYSICS_PARTICLE_STATION_STRIDE;
const MAX_SYNCHRONOUS_HASH_BYTES = 1024 * 1024;

export type StudioPhysicsParticleMode = "orbital" | "flow" | "spring-net";
export type StudioPhysicsParticleExpressionSource =
  | "constant"
  | "pressure"
  | "speed"
  | "tilt";
export type StudioPhysicsParticleSpringTopology = "radial" | "chain" | "ring";
export type StudioPhysicsParticleSha256 = `sha256:${string}`;

export interface StudioPhysicsParticleExpression {
  readonly source: StudioPhysicsParticleExpressionSource;
  readonly minimum: number;
  readonly maximum: number;
  readonly invert?: boolean;
}

export interface StudioPhysicsParticleExpressionSet {
  readonly radius?: StudioPhysicsParticleExpression;
  readonly alpha?: StudioPhysicsParticleExpression;
  readonly weight?: StudioPhysicsParticleExpression;
  readonly glow?: StudioPhysicsParticleExpression;
  readonly force?: StudioPhysicsParticleExpression;
  readonly chaos?: StudioPhysicsParticleExpression;
}

export interface StudioPhysicsParticleCommonSettings {
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
  readonly expressions?: StudioPhysicsParticleExpressionSet;
}

export interface StudioPhysicsParticleOrbitalSettings {
  readonly steps: number;
  readonly velocity: number;
  readonly acceleration: number;
  readonly spin: number;
  readonly orbitRadius: number;
  readonly orbitRadiusJitter: number;
}

export interface StudioPhysicsParticleFlowSettings {
  readonly lifetimeSteps: number;
  readonly velocity: number;
  readonly positionJitter: number;
  readonly flowHeightGain: number;
  readonly flowTangentGain: number;
}

export interface StudioPhysicsParticleSpringSettings {
  readonly topology: StudioPhysicsParticleSpringTopology;
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

export interface StudioPhysicsParticleBrushRecipe {
  readonly mode: StudioPhysicsParticleMode;
  readonly seed: number;
  readonly common: StudioPhysicsParticleCommonSettings;
  readonly orbital?: StudioPhysicsParticleOrbitalSettings;
  readonly flow?: StudioPhysicsParticleFlowSettings;
  readonly springNet?: StudioPhysicsParticleSpringSettings;
}

export interface StudioPhysicsParticleStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly speed?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
}

export interface StudioPhysicsParticleFlowField {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  readonly heights: Float32Array | readonly number[];
}

export interface StudioPhysicsParticlePathArtifact {
  readonly positions: Float32Array;
  readonly particleIndices: Uint32Array;
  readonly spawnIndices: Uint32Array;
  readonly stepIndices: Uint32Array;
}

export interface StudioPhysicsParticleDepositionArtifact {
  readonly positions: Float32Array;
  readonly radius: Float32Array;
  readonly alpha: Float32Array;
  readonly weight: Float32Array;
  readonly glow: Float32Array;
}

export interface StudioPhysicsParticleConnectorArtifact {
  readonly segments: Float32Array;
  readonly spawnIndices: Uint32Array;
  readonly stepIndices: Uint32Array;
  readonly alpha: Float32Array;
  readonly weight: Float32Array;
  readonly glow: Float32Array;
}

export interface StudioPhysicsParticleBrushArtifact {
  readonly kind: "studio-physics-particle-brush-artifact";
  readonly revision: typeof STUDIO_PHYSICS_PARTICLE_BRUSH_REVISION;
  readonly mode: StudioPhysicsParticleMode;
  readonly appendPolicy: typeof STUDIO_PHYSICS_PARTICLE_APPEND_POLICY;
  readonly seed: number;
  readonly count: number;
  readonly fixedTimeStepSeconds: number;
  readonly spawnCount: number;
  readonly stepsPerSpawn: number;
  readonly emitterStations: Float32Array;
  readonly path: StudioPhysicsParticlePathArtifact;
  readonly deposition: StudioPhysicsParticleDepositionArtifact;
  readonly connectors: StudioPhysicsParticleConnectorArtifact | null;
  readonly compositing: Readonly<{
    alpha: "straight-unassociated-coverage";
    weight: "normalized-path-weight";
    glow: "additive-linear-energy";
    connectorAlpha: "straight-unassociated-coverage";
  }>;
  readonly recipeFingerprint: StudioPhysicsParticleSha256;
  readonly strokeFingerprint: StudioPhysicsParticleSha256;
  readonly flowFieldHash: StudioPhysicsParticleSha256 | null;
  readonly replayFingerprint: StudioPhysicsParticleSha256;
  readonly artifactHash: StudioPhysicsParticleSha256;
  readonly outputBytes: number;
}

export interface StudioPhysicsParticleAppendRequest {
  readonly previous: StudioPhysicsParticleBrushArtifact;
}

export interface StudioPhysicsParticleBrushRequest {
  readonly recipe: StudioPhysicsParticleBrushRecipe;
  readonly samples: readonly StudioPhysicsParticleStrokeSample[];
  readonly flowField?: StudioPhysicsParticleFlowField;
  readonly append?: StudioPhysicsParticleAppendRequest;
  readonly epoch: number;
  readonly signal?: AbortSignal;
}

export interface StudioPhysicsParticleBrushReceipt {
  readonly kind: "studio-physics-particle-brush-receipt";
  readonly revision: typeof STUDIO_PHYSICS_PARTICLE_BRUSH_REVISION;
  readonly status: "complete" | "fail-closed";
  readonly execution: "rebuild" | "append";
  readonly appendPolicy: typeof STUDIO_PHYSICS_PARTICLE_APPEND_POLICY;
  readonly appendSourceArtifactHash: StudioPhysicsParticleSha256 | null;
  readonly epoch: number;
  readonly sequence: number;
  readonly mode: StudioPhysicsParticleMode;
  readonly seed: number;
  readonly inputSamples: number;
  readonly spawnCount: number;
  readonly appendedSpawnCount: number;
  readonly pathPointCount: number;
  readonly connectorSegmentCount: number;
  readonly workUnits: number;
  readonly outputBytes: number;
  readonly peakResidentBytes: number;
  readonly recipeFingerprint: StudioPhysicsParticleSha256;
  readonly strokeFingerprint: StudioPhysicsParticleSha256;
  readonly flowFieldHash: StudioPhysicsParticleSha256 | null;
  readonly replayFingerprint: StudioPhysicsParticleSha256;
  readonly artifactHash: StudioPhysicsParticleSha256 | null;
  readonly failureCode: StudioPhysicsParticleBrushErrorCode | null;
  readonly receiptHash: StudioPhysicsParticleSha256;
  readonly artifact: StudioPhysicsParticleBrushArtifact | null;
}

export type StudioPhysicsParticleBrushErrorCode =
  | "invalid-request"
  | "budget-exceeded"
  | "append-mismatch"
  | "integrity-mismatch"
  | "epoch-mismatch"
  | "backpressure"
  | "aborted"
  | "disposed"
  | "simulation-failed";

export class StudioPhysicsParticleBrushError extends Error {
  constructor(
    readonly code: StudioPhysicsParticleBrushErrorCode,
    message: string,
    readonly receipt: StudioPhysicsParticleBrushReceipt | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StudioPhysicsParticleBrushError";
  }
}

export interface StudioPhysicsParticleBrushProvider {
  render(
    request: StudioPhysicsParticleBrushRequest,
  ): Promise<StudioPhysicsParticleBrushReceipt>;
  setEpoch(epoch: number): void;
  snapshot(): Readonly<{
    state: "ready" | "disposed";
    epoch: number;
    sequence: number;
    active: boolean;
  }>;
  dispose(): void;
}

interface NormalizedExpression {
  readonly source: StudioPhysicsParticleExpressionSource;
  readonly minimum: number;
  readonly maximum: number;
  readonly invert: boolean;
}

interface NormalizedRecipe {
  readonly mode: StudioPhysicsParticleMode;
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
      radius: NormalizedExpression;
      alpha: NormalizedExpression;
      weight: NormalizedExpression;
      glow: NormalizedExpression;
      force: NormalizedExpression;
      chaos: NormalizedExpression;
    }>;
  }>;
  readonly orbital: Readonly<StudioPhysicsParticleOrbitalSettings> | null;
  readonly flow: Readonly<StudioPhysicsParticleFlowSettings> | null;
  readonly springNet: Readonly<Required<StudioPhysicsParticleSpringSettings>> | null;
}

interface PreparedFlowField {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  readonly heights: Float32Array;
  readonly hash: StudioPhysicsParticleSha256;
}

interface FlowFieldPreflight {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  readonly cellCount: number;
  readonly cloneBytes: number;
  readonly source: Float32Array | readonly number[];
}

interface PreviousArtifactPreflight {
  readonly artifact: StudioPhysicsParticleBrushArtifact;
  readonly pathPointCount: number;
  readonly connectorSegmentCount: number;
  readonly outputBytes: number;
}

type PreviousArtifactArraysSnapshot = Pick<
  StudioPhysicsParticleBrushArtifact,
  "emitterStations" | "path" | "deposition" | "connectors"
>;

interface PreparedRequest {
  readonly recipe: NormalizedRecipe;
  readonly samplesCount: number;
  readonly stations: Float32Array;
  readonly spawnCount: number;
  readonly stepsPerSpawn: number;
  readonly connectorEdges: readonly (readonly [number, number])[];
  readonly pathPointCount: number;
  readonly connectorSegmentCount: number;
  readonly workUnits: number;
  readonly outputBytes: number;
  readonly peakResidentBytes: number;
  readonly recipeFingerprint: StudioPhysicsParticleSha256;
  readonly strokeFingerprint: StudioPhysicsParticleSha256;
  readonly flowField: PreparedFlowField | null;
  readonly replayFingerprint: StudioPhysicsParticleSha256;
  readonly previous: StudioPhysicsParticleBrushArtifact | null;
  readonly appendStartSpawn: number;
}

interface SimulationArrays {
  readonly path: StudioPhysicsParticlePathArtifact;
  readonly deposition: StudioPhysicsParticleDepositionArtifact;
  readonly connectors: StudioPhysicsParticleConnectorArtifact | null;
}

type ParticleState = PhysicsParticleState;

interface AbortSignalBridge {
  readonly target: AbortSignal;
  readonly initiallyAborted: boolean;
  readonly add: AbortSignal["addEventListener"];
  readonly remove: AbortSignal["removeEventListener"];
}

type MaybePromise<T> = T | Promise<T>;
type CooperativeYieldTask = () => Promise<void>;

const COOPERATIVE_WORK_CHUNK = 131_072;
const COOPERATIVE_COPY_BYTES = 1024 * 1024;

function hashBytes(bytes: Uint8Array): StudioPhysicsParticleSha256 {
  return `sha256:${sha256HexPortable(bytes)}`;
}

function hashText(value: string): StudioPhysicsParticleSha256 {
  return hashBytes(new TextEncoder().encode(value));
}

function digestBytesToHash(
  digest: ArrayBuffer,
): StudioPhysicsParticleSha256 {
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `sha256:${hex}`;
}

function hashBytesCooperatively(
  bytes: Uint8Array,
  assertCurrent: () => void,
): MaybePromise<StudioPhysicsParticleSha256> {
  assertCurrent();
  if (bytes.byteLength <= MAX_SYNCHRONOUS_HASH_BYTES) {
    return hashBytes(bytes);
  }
  const source = bytes.buffer instanceof ArrayBuffer
    ? bytes as Uint8Array<ArrayBuffer>
    : new Uint8Array(bytes);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new StudioPhysicsParticleBrushError(
      "simulation-failed",
      "Large particle artifacts require an asynchronous SHA-256 implementation.",
    );
  }
  return subtle.digest("SHA-256", source).then(
    (digest) => {
      assertCurrent();
      return digestBytesToHash(digest);
    },
    (error: unknown) => {
      throw new StudioPhysicsParticleBrushError(
        "simulation-failed",
        "Large particle artifact hashing failed.",
        null,
        { cause: error },
      );
    },
  );
}

function typedArrayHashCooperatively(
  value: ArrayBufferView,
  assertCurrent: () => void,
): MaybePromise<StudioPhysicsParticleSha256> {
  return hashBytesCooperatively(
    new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    assertCurrent,
  );
}

function finite(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
  ) {
    throw new StudioPhysicsParticleBrushError(
      "invalid-request",
      `${label} must be finite and within [${minimum}, ${maximum}].`,
    );
  }
  return value;
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new StudioPhysicsParticleBrushError(
      "invalid-request",
      `${label} must be a safe integer within [${minimum}, ${maximum}].`,
    );
  }
  return value;
}

function budget(message: string): never {
  throw new StudioPhysicsParticleBrushError("budget-exceeded", message);
}

function invalidRequest(message: string, cause?: unknown): never {
  throw new StudioPhysicsParticleBrushError(
    "invalid-request",
    message,
    null,
    cause === undefined ? undefined : { cause },
  );
}

function checkedCount(
  factors: readonly number[],
  label: string,
  maximum: number,
): number {
  let result = BigInt(1);
  for (const factor of factors) result *= BigInt(factor);
  if (result > BigInt(maximum) || result > BigInt(Number.MAX_SAFE_INTEGER)) {
    budget(`${label} exceeds its deterministic work budget.`);
  }
  return Number(result);
}

function checkedByteSum(
  values: readonly number[],
  label: string,
  maximum: number,
): number {
  let total = BigInt(0);
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) {
      budget(`${label} contains an unsafe byte count.`);
    }
    total += BigInt(value);
  }
  if (
    total > BigInt(maximum)
    || total > BigInt(Number.MAX_SAFE_INTEGER)
  ) budget(`${label} exceeds its resident-memory budget.`);
  return Number(total);
}

function normalizeAbortSignal(value: unknown): AbortSignalBridge | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object") {
    invalidRequest("signal must implement the AbortSignal contract.");
  }
  try {
    const target = value as AbortSignal;
    const initiallyAborted = target.aborted;
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    if (
      typeof initiallyAborted !== "boolean"
      || typeof add !== "function"
      || typeof remove !== "function"
    ) invalidRequest("signal must implement the AbortSignal contract.");
    return Object.freeze({
      target,
      initiallyAborted,
      add,
      remove,
    });
  } catch (error) {
    if (error instanceof StudioPhysicsParticleBrushError) throw error;
    invalidRequest("signal could not be inspected safely.", error);
  }
}

function abortSignalIsAbortedSafely(
  bridge: AbortSignalBridge | null,
): boolean {
  if (!bridge) return false;
  try {
    const aborted = bridge.target.aborted;
    if (typeof aborted !== "boolean") {
      invalidRequest("signal must expose a boolean aborted state.");
    }
    return aborted;
  } catch (error) {
    if (error instanceof StudioPhysicsParticleBrushError) throw error;
    invalidRequest("signal aborted state could not be inspected safely.", error);
  }
}

function removeAbortListenerSafely(
  bridge: AbortSignalBridge | null,
  listener: () => void,
): void {
  if (!bridge) return;
  try {
    bridge.remove.call(bridge.target, "abort", listener);
  } catch {
    // Internal provider state is authoritative; hostile cleanup cannot retain it.
  }
}

function addAbortListenerSafely(
  bridge: AbortSignalBridge | null,
  listener: () => void,
): boolean {
  if (!bridge) return false;
  try {
    bridge.add.call(bridge.target, "abort", listener, { once: true });
    return true;
  } catch (error) {
    removeAbortListenerSafely(bridge, listener);
    invalidRequest("signal rejected abort-listener registration.", error);
  }
}

function createCooperativeYieldScheduler(
  signal: AbortSignal,
): Readonly<{
  yieldTask: CooperativeYieldTask;
  dispose(): void;
}> {
  let pending:
    | Readonly<{
      timer: ReturnType<typeof setTimeout>;
      resolve: () => void;
    }>
    | null = null;
  let disposed = false;

  const settlePending = (cancelTimer: boolean): void => {
    const current = pending;
    if (!current) return;
    pending = null;
    if (cancelTimer) clearTimeout(current.timer);
    current.resolve();
  };
  const onAbort = (): void => settlePending(true);
  signal.addEventListener("abort", onAbort);

  return Object.freeze({
    yieldTask: () => {
      if (disposed || signal.aborted) return Promise.resolve();
      if (pending !== null) {
        throw new StudioPhysicsParticleBrushError(
          "simulation-failed",
          "Particle cooperative scheduler already has pending work.",
        );
      }
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => settlePending(false), 0);
        pending = Object.freeze({ timer, resolve });
        if (disposed || signal.aborted) settlePending(true);
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      signal.removeEventListener("abort", onAbort);
      settlePending(true);
    },
  });
}

const VALIDATION_ERROR_CALLBACKS = Object.freeze({
  invalidRequest: (message: string): never => invalidRequest(message),
  budget,
});

function normalizeRecipe(
  input: StudioPhysicsParticleBrushRecipe,
): NormalizedRecipe {
  return normalizePhysicsParticleRecipe(
    input,
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS,
    VALIDATION_ERROR_CALLBACKS,
  );
}

function preflightFlowFieldUnsafe(
  input: StudioPhysicsParticleFlowField | undefined,
): FlowFieldPreflight | null {
  if (input === undefined) return null;
  if (!input || typeof input !== "object") {
    throw new StudioPhysicsParticleBrushError(
      "invalid-request",
      "flowField must be an object.",
    );
  }
  const width = safeInteger(input.width, "flowField.width", 2, 65_536);
  const height = safeInteger(input.height, "flowField.height", 2, 65_536);
  const cellCount = checkedCount(
    [width, height],
    "Flow-field cell count",
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxFlowCells,
  );
  const originX = finite(
    input.originX,
    "flowField.originX",
    -STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxCoordinateMagnitude,
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxCoordinateMagnitude,
  );
  const originY = finite(
    input.originY,
    "flowField.originY",
    -STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxCoordinateMagnitude,
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxCoordinateMagnitude,
  );
  const cellSize = finite(
    input.cellSize,
    "flowField.cellSize",
    0.0001,
    1_000_000,
  );
  let source: Float32Array | readonly number[];
  try {
    source = input.heights;
  } catch (error) {
    invalidRequest("flowField.heights could not be inspected safely.", error);
  }
  const cloneBytes = checkedCount(
    [cellCount, Float32Array.BYTES_PER_ELEMENT],
    "Flow-field clone bytes",
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxResidentBytes,
  );
  if (
    !(
      Array.isArray(source)
      || (
        source instanceof Float32Array
        && source.buffer instanceof ArrayBuffer
        && source.byteLength === cloneBytes
      )
    )
    || source.length !== cellCount
  ) {
    throw new StudioPhysicsParticleBrushError(
      "invalid-request",
      "flowField.heights must be an exact owned Float32 or number array.",
    );
  }
  return Object.freeze({
    width,
    height,
    originX,
    originY,
    cellSize,
    cellCount,
    cloneBytes,
    source,
  });
}

function preflightFlowField(
  input: StudioPhysicsParticleFlowField | undefined,
): FlowFieldPreflight | null {
  try {
    return preflightFlowFieldUnsafe(input);
  } catch (error) {
    if (error instanceof StudioPhysicsParticleBrushError) throw error;
    invalidRequest("flowField could not be inspected safely.", error);
  }
}

async function prepareFlowField(
  preflight: FlowFieldPreflight | null,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<PreparedFlowField | null> {
  if (!preflight) return null;
  const {
    width,
    height,
    originX,
    originY,
    cellSize,
    cellCount,
    source,
  } = preflight;
  assertCurrent();
  const heights = new Float32Array(cellCount);
  const copyChunkElements =
    COOPERATIVE_COPY_BYTES / Float32Array.BYTES_PER_ELEMENT;
  for (let index = 0; index < cellCount; index += 1) {
    try {
      heights[index] = f32(finite(
        source[index],
        `flowField.heights[${index}]`,
        -1_000_000,
        1_000_000,
      ));
    } catch (error) {
      if (error instanceof StudioPhysicsParticleBrushError) throw error;
      invalidRequest(
        `flowField.heights[${index}] could not be copied safely.`,
        error,
      );
    }
    if (
      index + 1 < cellCount
      && (index + 1) % copyChunkElements === 0
    ) {
      await yieldTask();
      assertCurrent();
    }
  }
  const heightsHash = await typedArrayHashCooperatively(
    heights,
    assertCurrent,
  );
  const descriptor = JSON.stringify({
    width,
    height,
    originX,
    originY,
    cellSize,
    heightsHash,
  });
  return Object.freeze({
    width,
    height,
    originX,
    originY,
    cellSize,
    heights,
    hash: hashText(descriptor),
  });
}

function normalizeSamples(
  input: readonly StudioPhysicsParticleStrokeSample[],
) {
  return normalizePhysicsParticleSamples(
    input,
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS,
    VALIDATION_ERROR_CALLBACKS,
  );
}

function buildEmitterStations(
  samples: ReturnType<typeof normalizeSamples>,
  spawnSpacing: number,
): Float32Array {
  return buildPhysicsParticleEmitterStations(
    samples,
    spawnSpacing,
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxSpawnStations,
    VALIDATION_ERROR_CALLBACKS,
  );
}

function canonicalRecipeRecord(recipe: NormalizedRecipe): string {
  return JSON.stringify(recipe);
}

function replayFingerprintFor(
  recipeFingerprint: StudioPhysicsParticleSha256,
  strokeFingerprint: StudioPhysicsParticleSha256,
  flowFieldHash: StudioPhysicsParticleSha256 | null,
): StudioPhysicsParticleSha256 {
  return hashText(JSON.stringify({
    revision: STUDIO_PHYSICS_PARTICLE_BRUSH_REVISION,
    appendPolicy: STUDIO_PHYSICS_PARTICLE_APPEND_POLICY,
    recipeFingerprint,
    strokeFingerprint,
    flowFieldHash,
  }));
}

async function artifactDataHash(
  artifact: Pick<
    StudioPhysicsParticleBrushArtifact,
    "emitterStations" | "path" | "deposition" | "connectors"
  >,
  assertCurrent: () => void,
): Promise<StudioPhysicsParticleSha256> {
  const entries: string[] = [
    await typedArrayHashCooperatively(
      artifact.emitterStations,
      assertCurrent,
    ),
    await typedArrayHashCooperatively(artifact.path.positions, assertCurrent),
    await typedArrayHashCooperatively(
      artifact.path.particleIndices,
      assertCurrent,
    ),
    await typedArrayHashCooperatively(
      artifact.path.spawnIndices,
      assertCurrent,
    ),
    await typedArrayHashCooperatively(
      artifact.path.stepIndices,
      assertCurrent,
    ),
    await typedArrayHashCooperatively(
      artifact.deposition.positions,
      assertCurrent,
    ),
    await typedArrayHashCooperatively(
      artifact.deposition.radius,
      assertCurrent,
    ),
    await typedArrayHashCooperatively(
      artifact.deposition.alpha,
      assertCurrent,
    ),
    await typedArrayHashCooperatively(
      artifact.deposition.weight,
      assertCurrent,
    ),
    await typedArrayHashCooperatively(
      artifact.deposition.glow,
      assertCurrent,
    ),
  ];
  if (artifact.connectors) {
    entries.push(
      await typedArrayHashCooperatively(
        artifact.connectors.segments,
        assertCurrent,
      ),
      await typedArrayHashCooperatively(
        artifact.connectors.spawnIndices,
        assertCurrent,
      ),
      await typedArrayHashCooperatively(
        artifact.connectors.stepIndices,
        assertCurrent,
      ),
      await typedArrayHashCooperatively(
        artifact.connectors.alpha,
        assertCurrent,
      ),
      await typedArrayHashCooperatively(
        artifact.connectors.weight,
        assertCurrent,
      ),
      await typedArrayHashCooperatively(
        artifact.connectors.glow,
        assertCurrent,
      ),
    );
  } else {
    entries.push("connectors:null");
  }
  return hashText(entries.join("\n"));
}

function calculateOutputBytes(
  spawnCount: number,
  pathPointCount: number,
  connectorSegmentCount: number,
): number {
  return calculatePhysicsParticleOutputBytes(
    spawnCount,
    pathPointCount,
    connectorSegmentCount,
    VALIDATION_ERROR_CALLBACKS,
  );
}

const maximumArtifactPlaneBytes = maximumPhysicsParticleArtifactPlaneBytes;

async function cloneFloat32Array(
  source: Float32Array,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<Float32Array> {
  assertCurrent();
  const clone = new Float32Array(source.length);
  const chunkElements = COOPERATIVE_COPY_BYTES / Float32Array.BYTES_PER_ELEMENT;
  for (let offset = 0; offset < source.length; offset += chunkElements) {
    const end = Math.min(source.length, offset + chunkElements);
    clone.set(source.subarray(offset, end), offset);
    if (end < source.length) {
      await yieldTask();
      assertCurrent();
    }
  }
  return clone;
}

async function cloneUint32Array(
  source: Uint32Array,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<Uint32Array> {
  assertCurrent();
  const clone = new Uint32Array(source.length);
  const chunkElements = COOPERATIVE_COPY_BYTES / Uint32Array.BYTES_PER_ELEMENT;
  for (let offset = 0; offset < source.length; offset += chunkElements) {
    const end = Math.min(source.length, offset + chunkElements);
    clone.set(source.subarray(offset, end), offset);
    if (end < source.length) {
      await yieldTask();
      assertCurrent();
    }
  }
  return clone;
}

async function clonePath(
  path: StudioPhysicsParticlePathArtifact,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<StudioPhysicsParticlePathArtifact> {
  return Object.freeze({
    positions: await cloneFloat32Array(path.positions, assertCurrent, yieldTask),
    particleIndices: await cloneUint32Array(
      path.particleIndices,
      assertCurrent,
      yieldTask,
    ),
    spawnIndices: await cloneUint32Array(
      path.spawnIndices,
      assertCurrent,
      yieldTask,
    ),
    stepIndices: await cloneUint32Array(
      path.stepIndices,
      assertCurrent,
      yieldTask,
    ),
  });
}

async function cloneDeposition(
  deposition: StudioPhysicsParticleDepositionArtifact,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<StudioPhysicsParticleDepositionArtifact> {
  return Object.freeze({
    positions: await cloneFloat32Array(
      deposition.positions,
      assertCurrent,
      yieldTask,
    ),
    radius: await cloneFloat32Array(deposition.radius, assertCurrent, yieldTask),
    alpha: await cloneFloat32Array(deposition.alpha, assertCurrent, yieldTask),
    weight: await cloneFloat32Array(deposition.weight, assertCurrent, yieldTask),
    glow: await cloneFloat32Array(deposition.glow, assertCurrent, yieldTask),
  });
}

async function cloneConnectors(
  connectors: StudioPhysicsParticleConnectorArtifact | null,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<StudioPhysicsParticleConnectorArtifact | null> {
  if (!connectors) return null;
  return Object.freeze({
    segments: await cloneFloat32Array(
      connectors.segments,
      assertCurrent,
      yieldTask,
    ),
    spawnIndices: await cloneUint32Array(
      connectors.spawnIndices,
      assertCurrent,
      yieldTask,
    ),
    stepIndices: await cloneUint32Array(
      connectors.stepIndices,
      assertCurrent,
      yieldTask,
    ),
    alpha: await cloneFloat32Array(connectors.alpha, assertCurrent, yieldTask),
    weight: await cloneFloat32Array(connectors.weight, assertCurrent, yieldTask),
    glow: await cloneFloat32Array(connectors.glow, assertCurrent, yieldTask),
  });
}

function appendMismatch(message: string, cause?: unknown): never {
  throw new StudioPhysicsParticleBrushError(
    "append-mismatch",
    message,
    null,
    cause === undefined ? undefined : { cause },
  );
}

function exactFloat32Array(value: unknown, length: number): boolean {
  return value instanceof Float32Array
    && value.buffer instanceof ArrayBuffer
    && value.length === length
    && value.byteLength === length * Float32Array.BYTES_PER_ELEMENT;
}

function exactUint32Array(value: unknown, length: number): boolean {
  return value instanceof Uint32Array
    && value.buffer instanceof ArrayBuffer
    && value.length === length
    && value.byteLength === length * Uint32Array.BYTES_PER_ELEMENT;
}

function preflightPreviousArtifactMetadata(
  input: StudioPhysicsParticleBrushArtifact,
  recipe: NormalizedRecipe,
  stepsPerSpawn: number,
  connectorEdges: readonly (readonly [number, number])[],
  currentSpawnCount: number,
): PreviousArtifactPreflight {
  if (!input || typeof input !== "object") {
    appendMismatch("Append requires a previous particle artifact.");
  }
  try {
    const kind = input.kind;
    const revision = input.revision;
    const appendPolicy = input.appendPolicy;
    const mode = input.mode;
    const seed = input.seed;
    const count = input.count;
    const fixedTimeStepSeconds = input.fixedTimeStepSeconds;
    const declaredStepsPerSpawn = input.stepsPerSpawn;
    if (
      kind !== "studio-physics-particle-brush-artifact"
      || revision !== STUDIO_PHYSICS_PARTICLE_BRUSH_REVISION
      || appendPolicy !== STUDIO_PHYSICS_PARTICLE_APPEND_POLICY
      || mode !== recipe.mode
      || seed !== recipe.seed
      || count !== recipe.common.count
      || fixedTimeStepSeconds !== recipe.common.fixedTimeStepSeconds
      || declaredStepsPerSpawn !== stepsPerSpawn
    ) {
      appendMismatch(
        "Previous particle artifact metadata does not match the recipe.",
      );
    }
    const spawnCount = safeInteger(
      input.spawnCount,
      "append.previous.spawnCount",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    if (
      spawnCount
        > STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxSpawnStations
    ) budget("Previous particle spawn count exceeds its budget.");
    if (spawnCount > currentSpawnCount) {
      appendMismatch(
        "Previous particle artifact extends beyond the current stroke.",
      );
    }
    const pathPointCount = checkedCount(
      [spawnCount, recipe.common.count, stepsPerSpawn],
      "Previous particle path point count",
      STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxPathPoints,
    );
    const connectorSegmentCount = (
      recipe.mode === "spring-net"
      && recipe.springNet?.emitConnectors
    )
      ? checkedCount(
        [spawnCount, connectorEdges.length, stepsPerSpawn],
        "Previous spring connector segment count",
        STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxConnectorSegments,
      )
      : 0;
    const outputBytes = calculateOutputBytes(
      spawnCount,
      pathPointCount,
      connectorSegmentCount,
    );
    const declaredOutputBytes = input.outputBytes;
    if (
      outputBytes > STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxOutputBytes
      || declaredOutputBytes !== outputBytes
    ) {
      budget("Previous particle artifact byte metadata is not admissible.");
    }
    const recipeFingerprint = input.recipeFingerprint;
    const strokeFingerprint = input.strokeFingerprint;
    const flowFieldHash = input.flowFieldHash;
    const replayFingerprint = input.replayFingerprint;
    const artifactHash = input.artifactHash;
    const compositingInput = input.compositing;
    const compositing = Object.freeze({
      alpha: compositingInput?.alpha,
      weight: compositingInput?.weight,
      glow: compositingInput?.glow,
      connectorAlpha: compositingInput?.connectorAlpha,
    });
    if (
      typeof recipeFingerprint !== "string"
      || !HASH_PATTERN.test(recipeFingerprint)
      || typeof strokeFingerprint !== "string"
      || !HASH_PATTERN.test(strokeFingerprint)
      || (
        flowFieldHash !== null
        && (
          typeof flowFieldHash !== "string"
          || !HASH_PATTERN.test(flowFieldHash)
        )
      )
      || typeof replayFingerprint !== "string"
      || !HASH_PATTERN.test(replayFingerprint)
      || typeof artifactHash !== "string"
      || !HASH_PATTERN.test(artifactHash)
      || compositing.alpha !== "straight-unassociated-coverage"
      || compositing.weight !== "normalized-path-weight"
      || compositing.glow !== "additive-linear-energy"
      || compositing.connectorAlpha
        !== "straight-unassociated-coverage"
    ) {
      appendMismatch("Previous particle artifact metadata is malformed.");
    }
    const arrays = validatePreviousArtifactArrays(
      input,
      spawnCount,
      pathPointCount,
      connectorSegmentCount,
    );
    const artifact: StudioPhysicsParticleBrushArtifact = Object.freeze({
      kind,
      revision,
      mode,
      appendPolicy,
      seed,
      count,
      fixedTimeStepSeconds,
      spawnCount,
      stepsPerSpawn: declaredStepsPerSpawn,
      ...arrays,
      compositing: compositing as StudioPhysicsParticleBrushArtifact["compositing"],
      recipeFingerprint:
        recipeFingerprint as StudioPhysicsParticleSha256,
      strokeFingerprint:
        strokeFingerprint as StudioPhysicsParticleSha256,
      flowFieldHash:
        flowFieldHash as StudioPhysicsParticleSha256 | null,
      replayFingerprint:
        replayFingerprint as StudioPhysicsParticleSha256,
      artifactHash:
        artifactHash as StudioPhysicsParticleSha256,
      outputBytes,
    });
    return Object.freeze({
      artifact,
      pathPointCount,
      connectorSegmentCount,
      outputBytes,
    });
  } catch (error) {
    if (error instanceof StudioPhysicsParticleBrushError) throw error;
    appendMismatch(
      "Previous particle artifact metadata could not be inspected safely.",
      error,
    );
  }
}

function validatePreviousArtifactArrays(
  artifact: StudioPhysicsParticleBrushArtifact,
  spawnCount: number,
  pathPointCount: number,
  connectorSegmentCount: number,
): PreviousArtifactArraysSnapshot {
  try {
    const emitterStations = artifact.emitterStations;
    const pathInput = artifact.path;
    const depositionInput = artifact.deposition;
    const connectorsInput = artifact.connectors;
    const path = Object.freeze({
      positions: pathInput?.positions,
      particleIndices: pathInput?.particleIndices,
      spawnIndices: pathInput?.spawnIndices,
      stepIndices: pathInput?.stepIndices,
    });
    const deposition = Object.freeze({
      positions: depositionInput?.positions,
      radius: depositionInput?.radius,
      alpha: depositionInput?.alpha,
      weight: depositionInput?.weight,
      glow: depositionInput?.glow,
    });
    const connectors = connectorsInput === null
      ? null
      : Object.freeze({
        segments: connectorsInput?.segments,
        spawnIndices: connectorsInput?.spawnIndices,
        stepIndices: connectorsInput?.stepIndices,
        alpha: connectorsInput?.alpha,
        weight: connectorsInput?.weight,
        glow: connectorsInput?.glow,
      });
    const valid = exactFloat32Array(
      emitterStations,
      spawnCount * STATION_STRIDE,
    )
      && exactFloat32Array(path.positions, pathPointCount * 2)
      && exactUint32Array(path.particleIndices, pathPointCount)
      && exactUint32Array(path.spawnIndices, pathPointCount)
      && exactUint32Array(path.stepIndices, pathPointCount)
      && exactFloat32Array(deposition.positions, pathPointCount * 2)
      && exactFloat32Array(deposition.radius, pathPointCount)
      && exactFloat32Array(deposition.alpha, pathPointCount)
      && exactFloat32Array(deposition.weight, pathPointCount)
      && exactFloat32Array(deposition.glow, pathPointCount)
      && (
        connectorSegmentCount === 0
          ? connectors === null
          : exactFloat32Array(
            connectors?.segments,
            connectorSegmentCount * 4,
          )
            && exactUint32Array(
              connectors?.spawnIndices,
              connectorSegmentCount,
            )
            && exactUint32Array(
              connectors?.stepIndices,
              connectorSegmentCount,
            )
            && exactFloat32Array(
              connectors?.alpha,
              connectorSegmentCount,
            )
            && exactFloat32Array(
              connectors?.weight,
              connectorSegmentCount,
            )
            && exactFloat32Array(
              connectors?.glow,
              connectorSegmentCount,
            )
      );
    if (!valid) {
      appendMismatch(
        "Previous particle artifact arrays do not match exact declared shapes.",
      );
    }
    return Object.freeze({
      emitterStations: emitterStations as Float32Array,
      path: path as StudioPhysicsParticlePathArtifact,
      deposition: deposition as StudioPhysicsParticleDepositionArtifact,
      connectors: connectors as StudioPhysicsParticleConnectorArtifact | null,
    });
  } catch (error) {
    if (error instanceof StudioPhysicsParticleBrushError) throw error;
    appendMismatch(
      "Previous particle artifact arrays could not be inspected safely.",
      error,
    );
  }
}

async function clonePreviousArtifact(
  preflight: PreviousArtifactPreflight,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<StudioPhysicsParticleBrushArtifact> {
  const artifact = preflight.artifact;
  const emitterStations = await cloneFloat32Array(
    artifact.emitterStations,
    assertCurrent,
    yieldTask,
  );
  const path = await clonePath(artifact.path, assertCurrent, yieldTask);
  const deposition = await cloneDeposition(
    artifact.deposition,
    assertCurrent,
    yieldTask,
  );
  const connectors = await cloneConnectors(
    artifact.connectors,
    assertCurrent,
    yieldTask,
  );
  const clone = Object.freeze({
    kind: artifact.kind,
    revision: artifact.revision,
    mode: artifact.mode,
    appendPolicy: artifact.appendPolicy,
    seed: artifact.seed,
    count: artifact.count,
    fixedTimeStepSeconds: artifact.fixedTimeStepSeconds,
    spawnCount: artifact.spawnCount,
    stepsPerSpawn: artifact.stepsPerSpawn,
    emitterStations,
    path,
    deposition,
    connectors,
    compositing: Object.freeze({ ...artifact.compositing }),
    recipeFingerprint: artifact.recipeFingerprint,
    strokeFingerprint: artifact.strokeFingerprint,
    flowFieldHash: artifact.flowFieldHash,
    replayFingerprint: artifact.replayFingerprint,
    artifactHash: artifact.artifactHash,
    outputBytes: artifact.outputBytes,
  });
  if (
    clone.kind !== "studio-physics-particle-brush-artifact"
    || clone.revision !== STUDIO_PHYSICS_PARTICLE_BRUSH_REVISION
    || !HASH_PATTERN.test(clone.artifactHash)
    || !HASH_PATTERN.test(clone.replayFingerprint)
    || await computeArtifactHash(
      clone.replayFingerprint,
      clone,
      assertCurrent,
    ) !== clone.artifactHash
  ) {
    throw new StudioPhysicsParticleBrushError(
      "integrity-mismatch",
      "Previous particle artifact failed its content hash validation.",
    );
  }
  return clone;
}

function typedPrefixEqual(
  prefix: Float32Array,
  full: Float32Array,
): boolean {
  if (prefix.length > full.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (!Object.is(prefix[index], full[index])) return false;
  }
  return true;
}

function prepareRequest(
  request: StudioPhysicsParticleBrushRequest,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): MaybePromise<PreparedRequest> {
  assertCurrent();
  const recipe = normalizeRecipe(request.recipe);
  const samples = normalizeSamples(request.samples);
  const stations = buildEmitterStations(samples, recipe.common.spawnSpacing);
  assertCurrent();
  const spawnCount = stations.length / STATION_STRIDE;
  const flowPreflight = preflightFlowField(request.flowField);
  const stepsPerSpawn = recipe.mode === "orbital"
    ? recipe.orbital?.steps ?? 0
    : recipe.mode === "flow"
      ? recipe.flow?.lifetimeSteps ?? 0
      : recipe.springNet?.steps ?? 0;
  const connectorEdges = buildSpringEdges(
    recipe.common.count,
    recipe.springNet?.topology ?? null,
  );
  const pathPointCount = checkedCount(
    [spawnCount, recipe.common.count, stepsPerSpawn],
    "Particle path point count",
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxPathPoints,
  );
  const connectorSegmentCount = (
    recipe.mode === "spring-net"
    && recipe.springNet?.emitConnectors
  )
    ? checkedCount(
      [spawnCount, connectorEdges.length, stepsPerSpawn],
      "Spring connector segment count",
      STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxConnectorSegments,
    )
    : 0;
  const workUnits = pathPointCount + connectorSegmentCount;
  if (workUnits > STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxWorkUnits) {
    budget("Particle simulation work exceeds its fixed budget.");
  }
  const outputBytes = calculateOutputBytes(
    spawnCount,
    pathPointCount,
    connectorSegmentCount,
  );
  if (outputBytes > STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxOutputBytes) {
    budget("Particle artifact output exceeds its byte budget.");
  }
  const appendInput = request.append;
  const previousPreflight = appendInput
    ? preflightPreviousArtifactMetadata(
      appendInput.previous,
      recipe,
      stepsPerSpawn,
      connectorEdges,
      spawnCount,
    )
    : null;
  const stateBytes = recipe.common.count * 9 * Float64Array.BYTES_PER_ELEMENT
    + connectorEdges.length * Float64Array.BYTES_PER_ELEMENT;
  const sampleScratchBytes = checkedCount(
    [
      samples.length,
      7,
      Float64Array.BYTES_PER_ELEMENT,
    ],
    "Normalized sample scratch bytes",
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxResidentBytes,
  );
  const hashScratchBytes = Math.max(
    flowPreflight?.cloneBytes ?? 0,
    maximumArtifactPlaneBytes(
      spawnCount,
      pathPointCount,
      connectorSegmentCount,
    ),
    previousPreflight
      ? maximumArtifactPlaneBytes(
        previousPreflight.artifact.spawnCount,
        previousPreflight.pathPointCount,
        previousPreflight.connectorSegmentCount,
      )
      : 0,
  );
  const peakResidentBytes = checkedByteSum(
    [
      outputBytes,
      previousPreflight?.outputBytes ?? 0,
      stations.byteLength,
      flowPreflight?.cloneBytes ?? 0,
      sampleScratchBytes,
      stateBytes,
      hashScratchBytes,
    ],
    "Particle simulation resident bytes",
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxResidentBytes,
  );
  const recipeFingerprint = hashText(canonicalRecipeRecord(recipe));
  if (
    previousPreflight
    && previousPreflight.artifact.recipeFingerprint !== recipeFingerprint
  ) {
    throw new StudioPhysicsParticleBrushError(
      "append-mismatch",
      "Previous particle artifact recipe fingerprint does not match.",
    );
  }
  const finish = (
    flowField: PreparedFlowField | null,
    strokeFingerprint: StudioPhysicsParticleSha256,
    previous: StudioPhysicsParticleBrushArtifact | null,
  ): PreparedRequest => {
    const replayFingerprint = replayFingerprintFor(
      recipeFingerprint,
      strokeFingerprint,
      flowField?.hash ?? null,
    );
    const appendStartSpawn = previous?.spawnCount ?? 0;
    return Object.freeze({
      recipe,
      samplesCount: samples.length,
      stations,
      spawnCount,
      stepsPerSpawn,
      connectorEdges,
      pathPointCount,
      connectorSegmentCount,
      workUnits,
      outputBytes,
      peakResidentBytes,
      recipeFingerprint,
      strokeFingerprint,
      flowField,
      replayFingerprint,
      previous,
      appendStartSpawn,
    });
  };
  const finishWithFlow = (
    flowField: PreparedFlowField | null,
  ): MaybePromise<PreparedRequest> => {
    const strokeHash = typedArrayHashCooperatively(stations, assertCurrent);
    const finishWithStroke = (
      strokeFingerprint: StudioPhysicsParticleSha256,
    ): MaybePromise<PreparedRequest> => {
      if (!previousPreflight) {
        return finish(flowField, strokeFingerprint, null);
      }
      return clonePreviousArtifact(
        previousPreflight,
        assertCurrent,
        yieldTask,
      ).then(
        async (previous) => {
          const expectedPreviousStrokeHash =
            await typedArrayHashCooperatively(
              previous.emitterStations,
              assertCurrent,
            );
          const expectedPreviousReplay = replayFingerprintFor(
            recipeFingerprint,
            expectedPreviousStrokeHash,
            flowField?.hash ?? null,
          );
          if (
            previous.flowFieldHash !== (flowField?.hash ?? null)
            || previous.strokeFingerprint !== expectedPreviousStrokeHash
            || previous.replayFingerprint !== expectedPreviousReplay
            || !typedPrefixEqual(previous.emitterStations, stations)
          ) {
            throw new StudioPhysicsParticleBrushError(
              "append-mismatch",
              "Append input does not preserve the committed fixed-station prefix.",
            );
          }
          return finish(flowField, strokeFingerprint, previous);
        },
      );
    };
    return strokeHash instanceof Promise
      ? strokeHash.then(finishWithStroke)
      : finishWithStroke(strokeHash);
  };
  if (!flowPreflight) return finishWithFlow(null);
  return prepareFlowField(
    flowPreflight,
    assertCurrent,
    yieldTask,
  ).then(finishWithFlow);
}

function allocateSimulationArrays(
  prepared: PreparedRequest,
): SimulationArrays {
  return allocatePhysicsParticleSimulationArrays(
    prepared.pathPointCount,
    prepared.connectorSegmentCount,
  );
}

function previousShapeIsValid(
  previous: StudioPhysicsParticleBrushArtifact,
  prepared: PreparedRequest,
): boolean {
  return isPreviousPhysicsParticleShapeValid(
    previous,
    prepared.recipe.common.count,
    prepared.stepsPerSpawn,
    prepared.connectorEdges.length,
    Boolean(prepared.recipe.springNet?.emitConnectors),
  );
}

async function copyTypedArrayIntoCooperatively<
  T extends Float32Array | Uint32Array,
>(
  target: T,
  source: T,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<void> {
  assertCurrent();
  const chunkElements = Math.max(
    1,
    Math.floor(COOPERATIVE_COPY_BYTES / source.BYTES_PER_ELEMENT),
  );
  for (let offset = 0; offset < source.length; offset += chunkElements) {
    const end = Math.min(source.length, offset + chunkElements);
    target.set(source.subarray(offset, end) as T, offset);
    if (end < source.length) {
      await yieldTask();
      assertCurrent();
    }
  }
}

async function copyPreviousArrays(
  previous: StudioPhysicsParticleBrushArtifact,
  arrays: SimulationArrays,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<void> {
  await copyTypedArrayIntoCooperatively(
    arrays.path.positions,
    previous.path.positions,
    assertCurrent,
    yieldTask,
  );
  await copyTypedArrayIntoCooperatively(
    arrays.path.particleIndices,
    previous.path.particleIndices,
    assertCurrent,
    yieldTask,
  );
  await copyTypedArrayIntoCooperatively(
    arrays.path.spawnIndices,
    previous.path.spawnIndices,
    assertCurrent,
    yieldTask,
  );
  await copyTypedArrayIntoCooperatively(
    arrays.path.stepIndices,
    previous.path.stepIndices,
    assertCurrent,
    yieldTask,
  );
  await copyTypedArrayIntoCooperatively(
    arrays.deposition.positions,
    previous.deposition.positions,
    assertCurrent,
    yieldTask,
  );
  await copyTypedArrayIntoCooperatively(
    arrays.deposition.radius,
    previous.deposition.radius,
    assertCurrent,
    yieldTask,
  );
  await copyTypedArrayIntoCooperatively(
    arrays.deposition.alpha,
    previous.deposition.alpha,
    assertCurrent,
    yieldTask,
  );
  await copyTypedArrayIntoCooperatively(
    arrays.deposition.weight,
    previous.deposition.weight,
    assertCurrent,
    yieldTask,
  );
  await copyTypedArrayIntoCooperatively(
    arrays.deposition.glow,
    previous.deposition.glow,
    assertCurrent,
    yieldTask,
  );
  if (arrays.connectors && previous.connectors) {
    await copyTypedArrayIntoCooperatively(
      arrays.connectors.segments,
      previous.connectors.segments,
      assertCurrent,
      yieldTask,
    );
    await copyTypedArrayIntoCooperatively(
      arrays.connectors.spawnIndices,
      previous.connectors.spawnIndices,
      assertCurrent,
      yieldTask,
    );
    await copyTypedArrayIntoCooperatively(
      arrays.connectors.stepIndices,
      previous.connectors.stepIndices,
      assertCurrent,
      yieldTask,
    );
    await copyTypedArrayIntoCooperatively(
      arrays.connectors.alpha,
      previous.connectors.alpha,
      assertCurrent,
      yieldTask,
    );
    await copyTypedArrayIntoCooperatively(
      arrays.connectors.weight,
      previous.connectors.weight,
      assertCurrent,
      yieldTask,
    );
    await copyTypedArrayIntoCooperatively(
      arrays.connectors.glow,
      previous.connectors.glow,
      assertCurrent,
      yieldTask,
    );
  }
}

async function simulatePrepared(
  prepared: PreparedRequest,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<SimulationArrays> {
  assertCurrent();
  const arrays = allocateSimulationArrays(prepared);
  if (prepared.previous) {
    if (!previousShapeIsValid(prepared.previous, prepared)) {
      throw new StudioPhysicsParticleBrushError(
        "integrity-mismatch",
        "Previous particle artifact arrays do not match their declared shape.",
      );
    }
    await copyPreviousArrays(
      prepared.previous,
      arrays,
      assertCurrent,
      yieldTask,
    );
  }
  const recipe = prepared.recipe;
  const count = recipe.common.count;
  const state: ParticleState = {
    x: new Float64Array(count),
    y: new Float64Array(count),
    vx: new Float64Array(count),
    vy: new Float64Array(count),
    damping: new Float64Array(count),
    chaosX: new Float64Array(count),
    chaosY: new Float64Array(count),
  };
  const accelerationX = new Float64Array(count);
  const accelerationY = new Float64Array(count);
  const restLengths = new Float64Array(prepared.connectorEdges.length);
  const directionalX = Math.cos(recipe.common.forceDirectionRadians);
  const directionalY = Math.sin(recipe.common.forceDirectionRadians);
  const maxCoordinateMagnitude =
    STUDIO_PHYSICS_PARTICLE_BRUSH_BUDGETS.maxCoordinateMagnitude;
  let workSinceYield = 0;

  for (
    let spawn = prepared.appendStartSpawn;
    spawn < prepared.spawnCount;
    spawn += 1
  ) {
    assertCurrent();
    initializeParticleState(recipe, prepared.stations, state, spawn);
    const stationOffset = spawn * STATION_STRIDE;
    const emitterX = prepared.stations[stationOffset] ?? 0;
    const emitterY = prepared.stations[stationOffset + 1] ?? 0;
    const forceExpression = expressionValue(
      recipe.common.expressions.force,
      prepared.stations,
      stationOffset,
    );
    const chaosExpression = expressionValue(
      recipe.common.expressions.chaos,
      prepared.stations,
      stationOffset,
    );
    initializeSpawnSpringRestLengths(
      recipe,
      prepared.connectorEdges.length,
      spawn,
      restLengths,
    );
    let globalChaosX = 0;
    let globalChaosY = 0;

    for (let step = 0; step < prepared.stepsPerSpawn; step += 1) {
      assertCurrent();
      const stepOutcome = stepPhysicsParticles({
        recipe,
        stations: prepared.stations,
        flowField: prepared.flowField,
        connectorEdges: prepared.connectorEdges,
        stepsPerSpawn: prepared.stepsPerSpawn,
        spawn,
        step,
        emitterX,
        emitterY,
        directionalX,
        directionalY,
        forceExpression,
        chaosExpression,
        globalChaosX,
        globalChaosY,
        maxCoordinateMagnitude,
        state,
        accelerationX,
        accelerationY,
        restLengths,
        arrays,
      });
      if (!stepOutcome.ok) {
        throw new StudioPhysicsParticleBrushError(
          "simulation-failed",
          "Particle integration escaped its finite coordinate envelope.",
        );
      }
      globalChaosX = stepOutcome.globalChaosX;
      globalChaosY = stepOutcome.globalChaosY;
      workSinceYield += count + prepared.connectorEdges.length;
      if (workSinceYield >= COOPERATIVE_WORK_CHUNK) {
        workSinceYield = 0;
        await yieldTask();
        assertCurrent();
      }
    }
  }
  assertCurrent();
  return arrays;
}

async function computeArtifactHash(
  replayFingerprint: StudioPhysicsParticleSha256,
  artifact: Pick<
    StudioPhysicsParticleBrushArtifact,
    "emitterStations" | "path" | "deposition" | "connectors"
  >,
  assertCurrent: () => void,
): Promise<StudioPhysicsParticleSha256> {
  const dataHash = await artifactDataHash(artifact, assertCurrent);
  assertCurrent();
  return hashText(`${replayFingerprint}\n${dataHash}`);
}

async function buildArtifact(
  prepared: PreparedRequest,
  arrays: SimulationArrays,
  assertCurrent: () => void,
  yieldTask: CooperativeYieldTask,
): Promise<StudioPhysicsParticleBrushArtifact> {
  const emitterStations = await cloneFloat32Array(
    prepared.stations,
    assertCurrent,
    yieldTask,
  );
  const base = Object.freeze({
    kind: "studio-physics-particle-brush-artifact" as const,
    revision: STUDIO_PHYSICS_PARTICLE_BRUSH_REVISION,
    mode: prepared.recipe.mode,
    appendPolicy: STUDIO_PHYSICS_PARTICLE_APPEND_POLICY,
    seed: prepared.recipe.seed,
    count: prepared.recipe.common.count,
    fixedTimeStepSeconds: prepared.recipe.common.fixedTimeStepSeconds,
    spawnCount: prepared.spawnCount,
    stepsPerSpawn: prepared.stepsPerSpawn,
    emitterStations,
    path: arrays.path,
    deposition: arrays.deposition,
    connectors: arrays.connectors,
    compositing: Object.freeze({
      alpha: "straight-unassociated-coverage" as const,
      weight: "normalized-path-weight" as const,
      glow: "additive-linear-energy" as const,
      connectorAlpha: "straight-unassociated-coverage" as const,
    }),
    recipeFingerprint: prepared.recipeFingerprint,
    strokeFingerprint: prepared.strokeFingerprint,
    flowFieldHash: prepared.flowField?.hash ?? null,
    replayFingerprint: prepared.replayFingerprint,
    outputBytes: prepared.outputBytes,
  });
  const artifactHash = await computeArtifactHash(
    prepared.replayFingerprint,
    base,
    assertCurrent,
  );
  assertCurrent();
  return Object.freeze({
    ...base,
    artifactHash,
  });
}

function receiptHash(
  receipt: Omit<StudioPhysicsParticleBrushReceipt, "receiptHash" | "artifact">,
): StudioPhysicsParticleSha256 {
  return hashText(JSON.stringify(receipt));
}

function buildReceipt(
  prepared: PreparedRequest,
  epoch: number,
  sequence: number,
  status: "complete" | "fail-closed",
  artifact: StudioPhysicsParticleBrushArtifact | null,
  failureCode: StudioPhysicsParticleBrushErrorCode | null,
): StudioPhysicsParticleBrushReceipt {
  const record = Object.freeze({
    kind: "studio-physics-particle-brush-receipt" as const,
    revision: STUDIO_PHYSICS_PARTICLE_BRUSH_REVISION,
    status,
    execution: prepared.previous ? "append" as const : "rebuild" as const,
    appendPolicy: STUDIO_PHYSICS_PARTICLE_APPEND_POLICY,
    appendSourceArtifactHash: prepared.previous?.artifactHash ?? null,
    epoch,
    sequence,
    mode: prepared.recipe.mode,
    seed: prepared.recipe.seed,
    inputSamples: prepared.samplesCount,
    spawnCount: prepared.spawnCount,
    appendedSpawnCount: prepared.spawnCount - prepared.appendStartSpawn,
    pathPointCount: prepared.pathPointCount,
    connectorSegmentCount: prepared.connectorSegmentCount,
    workUnits: prepared.workUnits,
    outputBytes: prepared.outputBytes,
    peakResidentBytes: prepared.peakResidentBytes,
    recipeFingerprint: prepared.recipeFingerprint,
    strokeFingerprint: prepared.strokeFingerprint,
    flowFieldHash: prepared.flowField?.hash ?? null,
    replayFingerprint: prepared.replayFingerprint,
    artifactHash: artifact?.artifactHash ?? null,
    failureCode,
  });
  return Object.freeze({
    ...record,
    receiptHash: receiptHash(record),
    artifact,
  });
}

export function createStudioPhysicsParticleBrushProvider(
  options: Readonly<{ epoch?: number }> = {},
): StudioPhysicsParticleBrushProvider {
  let epoch = options.epoch ?? 0;
  if (!Number.isSafeInteger(epoch) || epoch < 0) {
    throw new StudioPhysicsParticleBrushError(
      "invalid-request",
      "Provider epoch must be a non-negative safe integer.",
    );
  }
  let sequence = 0;
  let active = false;
  let disposed = false;
  let activeController: AbortController | null = null;

  const assertCurrent = (
    admittedEpoch: number,
    controller: AbortController,
  ): void => {
    if (disposed) {
      throw new StudioPhysicsParticleBrushError(
        "disposed",
        "Particle brush provider was disposed.",
      );
    }
    if (admittedEpoch !== epoch) {
      throw new StudioPhysicsParticleBrushError(
        "epoch-mismatch",
        "Particle brush result belongs to a stale document epoch.",
      );
    }
    if (controller.signal.aborted) {
      throw new StudioPhysicsParticleBrushError(
        "aborted",
        "Particle brush simulation was aborted.",
      );
    }
  };

  const render = async (
    request: StudioPhysicsParticleBrushRequest,
  ): Promise<StudioPhysicsParticleBrushReceipt> => {
    if (!request || typeof request !== "object") {
      throw new StudioPhysicsParticleBrushError(
        "invalid-request",
        "A particle brush request is required.",
      );
    }
    if (disposed) {
      throw new StudioPhysicsParticleBrushError(
        "disposed",
        "Particle brush provider has been disposed.",
      );
    }
    if (active) {
      throw new StudioPhysicsParticleBrushError(
        "backpressure",
        "The particle CPU oracle accepts one simulation at a time.",
      );
    }
    const controller = new AbortController();
    const scheduler = createCooperativeYieldScheduler(controller.signal);
    const onAbort = (): void => controller.abort();
    let signalBridge: AbortSignalBridge | null = null;
    let listenerRegistered = false;
    active = true;
    activeController = controller;

    try {
      const admittedEpoch = request.epoch;
      if (!Number.isSafeInteger(admittedEpoch) || admittedEpoch !== epoch) {
        throw new StudioPhysicsParticleBrushError(
          "epoch-mismatch",
          "Particle brush request epoch does not match.",
        );
      }
      let signalValue: unknown;
      try {
        signalValue = request.signal;
      } catch (error) {
        invalidRequest("signal could not be inspected safely.", error);
      }
      signalBridge = normalizeAbortSignal(signalValue);
      listenerRegistered = addAbortListenerSafely(signalBridge, onAbort);
      if (
        signalBridge?.initiallyAborted
        || abortSignalIsAbortedSafely(signalBridge)
      ) controller.abort();
      if (controller.signal.aborted) {
        throw new StudioPhysicsParticleBrushError(
          "aborted",
          "Particle brush request was already aborted.",
        );
      }
      const checkCurrent = (): void => {
        assertCurrent(admittedEpoch, controller);
      };
      const preparation = prepareRequest(
        request,
        checkCurrent,
        scheduler.yieldTask,
      );
      const prepared = preparation instanceof Promise
        ? await preparation
        : preparation;
      sequence += 1;
      const admittedSequence = sequence;
      let artifact: StudioPhysicsParticleBrushArtifact;
      try {
        checkCurrent();
        const arrays = await simulatePrepared(
          prepared,
          checkCurrent,
          scheduler.yieldTask,
        );
        checkCurrent();
        artifact = await buildArtifact(
          prepared,
          arrays,
          checkCurrent,
          scheduler.yieldTask,
        );
        checkCurrent();
      } catch (error) {
        const structured = error instanceof StudioPhysicsParticleBrushError
          ? error
          : new StudioPhysicsParticleBrushError(
            "simulation-failed",
            "Particle CPU oracle failed closed.",
            null,
            { cause: error },
          );
        const receipt = buildReceipt(
          prepared,
          admittedEpoch,
          admittedSequence,
          "fail-closed",
          null,
          structured.code,
        );
        throw new StudioPhysicsParticleBrushError(
          structured.code,
          structured.message,
          receipt,
          { cause: structured.cause },
        );
      }
      return buildReceipt(
        prepared,
        admittedEpoch,
        admittedSequence,
        "complete",
        artifact,
        null,
      );
    } finally {
      scheduler.dispose();
      if (activeController === controller) activeController = null;
      active = false;
      if (listenerRegistered) {
        removeAbortListenerSafely(signalBridge, onAbort);
      }
    }
  };

  return Object.freeze({
    render,
    setEpoch: (nextEpoch: number) => {
      if (disposed) {
        throw new StudioPhysicsParticleBrushError(
          "disposed",
          "Particle brush provider has been disposed.",
        );
      }
      if (!Number.isSafeInteger(nextEpoch) || nextEpoch < epoch) {
        throw new StudioPhysicsParticleBrushError(
          "invalid-request",
          "Particle brush epochs are monotonic non-negative safe integers.",
        );
      }
      if (nextEpoch !== epoch) {
        epoch = nextEpoch;
        activeController?.abort();
      }
    },
    snapshot: () => Object.freeze({
      state: disposed ? "disposed" as const : "ready" as const,
      epoch,
      sequence,
      active,
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      activeController?.abort();
      activeController = null;
    },
  });
}
