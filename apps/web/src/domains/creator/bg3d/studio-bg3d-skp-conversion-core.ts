/**
 * .skp → GLB 변환 코어. Worker 안과 메인 스레드 폴백이 같은 코드를 쓴다.
 *
 * 흐름: 사전 검사(크기·시그니처·버전·압축 해제 모델 데이터 크기) → 변환기 로드 → 이름·단위 2차 파싱(parseSkp, 실패해도 변환은 계속)
 *       → buildScene → 형상 검증·재질별 병합·면 방향 점검 → toGLB → GLB 컨테이너 검증 → 보고서.
 *
 * 변환기(openskp)는 주입한다. 테스트는 가짜 모듈로 성공·파싱 실패·빈 장면·비 GLB 출력·취소·시간 초과 경로를
 * 모두 증명하고, 실제 모듈은 worker-runtime 이 동적 import 로 공급한다.
 */

import {
  STUDIO_BG3D_SKP_HIGH_TRIANGLE_COUNT,
  STUDIO_BG3D_SKP_METADATA_PASS_MAX_BYTES,
  STUDIO_BG3D_SKP_ORIENTATION_CHECK_MAX_TRIANGLES,
  STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_BYTES,
  STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_COUNT,
  StudioBg3dSkpConversionError,
  StudioBg3dSkpConverterUnavailableError,
  StudioBg3dSkpParseError,
  type StudioBg3dSkpExecution,
  type StudioBg3dSkpStage,
  type StudioBg3dSkpStageProgress,
} from "./studio-bg3d-skp-contract";
import { assertStudioBg3dSkpGlbContainer } from "./studio-bg3d-skp-glb-scale";
import { analyzeStudioBg3dSkpMesh, type StudioBg3dSkpMeshStats } from "./studio-bg3d-skp-mesh-analysis";
import { mergeStudioBg3dSkpPrimitivesByMaterial, type StudioBg3dSkpPrimitive } from "./studio-bg3d-skp-mesh-merge";
import {
  buildStudioBg3dSkpTagList,
  summarizeOpenSkpHierarchy,
  summarizeOpenSkpModel,
  type StudioBg3dSkpModelSummary,
} from "./studio-bg3d-skp-model-summary";
import { preflightStudioBg3dSkpSource } from "./studio-bg3d-skp-preflight";
import {
  buildStudioBg3dSkpImportReport,
  buildStudioBg3dSkpNameList,
  createStudioBg3dSkpWarning,
  STUDIO_BG3D_SKP_UNAVAILABLE_NAME_LIST,
} from "./studio-bg3d-skp-report-builder";
import { describeStudioBg3dSkpDeclaredUnits, type StudioBg3dSkpDeclaredUnits } from "./studio-bg3d-skp-unit";

import type { StudioBg3dSkpImportReport, StudioBg3dSkpReportWarning } from "./studio-bg3d-skp-import-report";

/** openskp 진행 보고 콜백이 받는 값(ProgressInfo). */
export interface OpenSkpProgressInfo {
  readonly stage: string;
  readonly current: number;
  readonly total: number;
}

export interface OpenSkpBuildOptions {
  readonly respectEdgeVisibility?: boolean;
  readonly onProgress?: (info: OpenSkpProgressInfo) => void;
}

/** openskp 모듈의 최소 구조 계약 — 설치본의 실제 export 와 대조해 런타임에 검증한다. */
export interface OpenSkpModuleLike {
  readonly buildScene: (source: ArrayBuffer, options?: OpenSkpBuildOptions) => unknown;
  readonly toGLB: (scene: unknown, options?: { readonly textures?: boolean }) => Uint8Array | ArrayBuffer;
  /** 이름·단위·태그·장면 보고용. 없거나 실패해도 변환은 계속하고 보고서에 경고를 남긴다. */
  readonly parseSkp?: (source: ArrayBuffer) => unknown;
}

export type OpenSkpModuleLoader = () => Promise<OpenSkpModuleLike>;

export function isOpenSkpModuleLike(value: unknown): value is OpenSkpModuleLike {
  if (!isRecord(value)) return false;
  return typeof value.buildScene === "function"
    && typeof value.toGLB === "function"
    && (value.parseSkp === undefined || typeof value.parseSkp === "function");
}

export interface StudioBg3dSkpConversionHooks {
  readonly onStage?: (progress: StudioBg3dSkpStageProgress) => void;
  /** 단계 경계마다 확인한다. true 면 skp-cancelled 로 멈춘다. */
  readonly isCancelled?: () => boolean;
  readonly now?: () => number;
  /** 메인 스레드 폴백에서 단계 경계마다 화면이 숨 쉴 틈을 준다. Worker 에서는 필요 없다. */
  readonly yieldToEventLoop?: () => Promise<void>;
}

export interface StudioBg3dSkpConversionOptions {
  readonly loadModule: OpenSkpModuleLoader;
  readonly execution: StudioBg3dSkpExecution;
  /** 이 환경·프로필이 허용하는 원본 상한(바이트). */
  readonly maxBytes: number;
  /** 단계 경계에서만 확인하는 협력적 시간 상한. Worker 의 강제 종료와는 별개다. */
  readonly timeoutMs?: number;
  readonly hooks?: StudioBg3dSkpConversionHooks;
}

export interface StudioBg3dSkpConversionOutput {
  readonly glb: Uint8Array;
  readonly report: StudioBg3dSkpImportReport;
}

const PROGRESS_THROTTLE_MS = 100;

function toExactArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (bytes.byteOffset === 0 && bytes.buffer instanceof ArrayBuffer && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Array.isArray 는 any[] 로 좁히므로 unknown 배열로 좁히는 가드를 따로 둔다. */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isOutOfMemoryLike(error: unknown): boolean {
  if (!(error instanceof RangeError)) return false;
  return /allocation failed|invalid (?:typed )?array length|out of memory/iu.test(error.message);
}

function readOpenSkpStage(error: unknown): string | undefined {
  const stage = isRecord(error) ? error.stage : undefined;
  return typeof stage === "string" ? stage : undefined;
}

/** openskp 가 던진 값을 사용자 행동으로 이어지는 오류 분류로 바꾼다. 이미 분류된 오류는 그대로 둔다. */
export function classifyOpenSkpFailure(error: unknown): StudioBg3dSkpConversionError {
  if (error instanceof StudioBg3dSkpConversionError) return error;
  if (isOutOfMemoryLike(error)) {
    return new StudioBg3dSkpConversionError(
      "skp-too-large",
      "메모리가 부족해 .skp 파일을 변환하지 못했습니다.",
      { reason: "out-of-memory", cause: error },
    );
  }
  const stage = readOpenSkpStage(error);
  const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
  return new StudioBg3dSkpParseError(
    `.skp 파일 구조를 해석하지 못했습니다${stage ? ` (${stage} 단계)` : ""}${detail}`,
    { cause: error, ...(stage ? { detail: { stage } } : {}) },
  );
}

function readPrimitive(value: unknown): StudioBg3dSkpPrimitive {
  if (
    isRecord(value)
    && value.positions instanceof Float32Array
    && value.normals instanceof Float32Array
    && value.uvs instanceof Float32Array
    && value.indices instanceof Uint32Array
    && typeof value.materialIndex === "number"
  ) {
    return {
      positions: value.positions,
      normals: value.normals,
      uvs: value.uvs,
      indices: value.indices,
      materialIndex: value.materialIndex,
      geomName: typeof value.geomName === "string" ? value.geomName : "",
    };
  }
  throw new StudioBg3dSkpParseError("변환 결과의 형상 구조가 올바르지 않습니다.", { reason: "invalid-geometry" });
}

interface SceneTextureFacts {
  readonly count: number;
  readonly bytes: number;
}

function readTextureFacts(scene: Record<string, unknown>): SceneTextureFacts {
  const textures = scene.textures;
  if (!isUnknownArray(textures)) return { count: 0, bytes: 0 };
  let bytes = 0;
  for (const texture of textures) {
    const data = isRecord(texture) ? texture.data : undefined;
    if (data instanceof Uint8Array) bytes += data.byteLength;
  }
  return { count: textures.length, bytes };
}

interface ConversionClock {
  readonly now: () => number;
  readonly started: number;
}

class ConversionRun {
  private lastProgressAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly options: StudioBg3dSkpConversionOptions,
    private readonly clock: ConversionClock,
  ) {}

  elapsedMs(): number {
    return this.clock.now() - this.clock.started;
  }

  /** 취소·시간 상한을 확인하고 필요하면 이벤트 루프에 양보한다. */
  async checkpoint(): Promise<void> {
    const hooks = this.options.hooks;
    if (hooks?.isCancelled?.()) {
      throw new StudioBg3dSkpConversionError("skp-cancelled", "SketchUp 변환이 취소되었습니다.", { reason: "aborted" });
    }
    if (this.options.timeoutMs !== undefined && this.elapsedMs() > this.options.timeoutMs) {
      throw new StudioBg3dSkpConversionError(
        "skp-timeout",
        "SketchUp 변환이 제한 시간을 넘었습니다.",
        { reason: "timeout", detail: { timeoutMs: this.options.timeoutMs } },
      );
    }
    await hooks?.yieldToEventLoop?.();
  }

  stage(stage: StudioBg3dSkpStage, fraction: number | null = null): void {
    this.options.hooks?.onStage?.({ stage, fraction, execution: this.options.execution });
  }

  /** 같은 단계 안의 세부 진행은 너무 자주 보내지 않는다(마지막 값은 항상 보낸다). */
  stageThrottled(stage: StudioBg3dSkpStage, fraction: number | null, final = false): void {
    const now = this.clock.now();
    if (!final && now - this.lastProgressAt < PROGRESS_THROTTLE_MS) return;
    this.lastProgressAt = now;
    this.stage(stage, fraction);
  }
}

async function loadModuleOrFail(loadModule: OpenSkpModuleLoader): Promise<OpenSkpModuleLike> {
  let module: OpenSkpModuleLike;
  try {
    module = await loadModule();
  } catch (error) {
    if (error instanceof StudioBg3dSkpConversionError) throw error;
    throw new StudioBg3dSkpConverterUnavailableError(undefined, { cause: error });
  }
  if (!isOpenSkpModuleLike(module)) {
    throw new StudioBg3dSkpConverterUnavailableError(
      "openskp 패키지의 변환 API(buildScene/toGLB)를 확인하지 못했습니다.",
      { reason: "converter-api-mismatch" },
    );
  }
  return module;
}

interface MetadataOutcome {
  readonly status: "done" | "skipped-large" | "failed";
  readonly summary: StudioBg3dSkpModelSummary | null;
}

function readMetadata(module: OpenSkpModuleLike, source: ArrayBuffer): MetadataOutcome {
  if (source.byteLength > STUDIO_BG3D_SKP_METADATA_PASS_MAX_BYTES) {
    return { status: "skipped-large", summary: null };
  }
  if (!module.parseSkp) return { status: "failed", summary: null };
  try {
    const summary = summarizeOpenSkpModel(module.parseSkp(source));
    return summary ? { status: "done", summary } : { status: "failed", summary: null };
  } catch {
    // 이름·단위 보고는 부가 정보다. 실패는 보고서에 남기고 변환은 buildScene 결과로 계속한다.
    return { status: "failed", summary: null };
  }
}

function buildSceneOrFail(
  module: OpenSkpModuleLike,
  source: ArrayBuffer,
  run: ConversionRun,
): Record<string, unknown> {
  let scene: unknown;
  try {
    scene = module.buildScene(source, {
      respectEdgeVisibility: true,
      onProgress: (info) => {
        // openskp 는 VFF 최상위 레코드(tlv_walk)에서만 실제 총량을 알려 준다. 나머지는 미정(null)으로 둔다.
        const fraction = info.stage === "tlv_walk" && info.total > 0
          ? Math.min(1, Math.max(0, info.current / info.total))
          : null;
        run.stageThrottled("building-scene", fraction, fraction === 1);
      },
    });
  } catch (error) {
    throw classifyOpenSkpFailure(error);
  }
  if (!isRecord(scene) || !isUnknownArray(scene.glbPrimitives)) {
    throw new StudioBg3dSkpParseError("변환 결과에 형상(glbPrimitives)이 없습니다.", { reason: "invalid-geometry" });
  }
  return scene;
}

function collectTextureWarnings(
  metadata: StudioBg3dSkpModelSummary | null,
  facts: SceneTextureFacts,
  embed: boolean,
  omitDetail: "size" | "count" | null,
): StudioBg3dSkpReportWarning[] {
  const warnings: StudioBg3dSkpReportWarning[] = [];
  if (metadata && metadata.missingTextureMaterials.length > 0) {
    warnings.push(createStudioBg3dSkpWarning("texture-missing", "warning", {
      count: metadata.missingTextureMaterials.length,
      detail: metadata.missingTextureMaterials.slice(0, 3).join(", "),
    }));
  }
  if (metadata && metadata.unsupportedTextureMaterials.length > 0) {
    warnings.push(createStudioBg3dSkpWarning("texture-unsupported-format", "warning", {
      count: metadata.unsupportedTextureMaterials.length,
      detail: metadata.unsupportedTextureMaterials.slice(0, 3).join(", "),
    }));
  }
  if (facts.count > 0 && !embed) {
    warnings.push(createStudioBg3dSkpWarning("textures-omitted", "warning", {
      count: facts.count,
      ...(omitDetail ? { detail: omitDetail } : {}),
    }));
  }
  return warnings;
}

function collectGeometryWarnings(stats: StudioBg3dSkpMeshStats): StudioBg3dSkpReportWarning[] {
  const warnings: StudioBg3dSkpReportWarning[] = [];
  if (stats.orientation.status === "skipped") {
    warnings.push(createStudioBg3dSkpWarning("orientation-check-skipped", "info", { count: stats.triangleCount }));
  } else if (stats.orientation.conflictingEdges > 0) {
    warnings.push(createStudioBg3dSkpWarning("flipped-faces", "warning", { count: stats.orientation.conflictingEdges }));
  }
  if (stats.triangleCount >= STUDIO_BG3D_SKP_HIGH_TRIANGLE_COUNT) {
    warnings.push(createStudioBg3dSkpWarning("high-polygon-count", "warning", { count: stats.triangleCount }));
  }
  return warnings;
}

function collectMetadataWarnings(outcome: MetadataOutcome): StudioBg3dSkpReportWarning[] {
  const warnings: StudioBg3dSkpReportWarning[] = [];
  if (outcome.status !== "done") {
    warnings.push(createStudioBg3dSkpWarning("metadata-unavailable", "info", {
      detail: outcome.status === "skipped-large" ? "large-file" : "parse-unavailable",
    }));
    return warnings;
  }
  const summary = outcome.summary;
  if (summary && summary.hiddenInstanceCount > 0) {
    warnings.push(createStudioBg3dSkpWarning("hidden-instances-included", "warning", {
      count: summary.hiddenInstanceCount,
    }));
  }
  // 태그의 숨김 표시는 두 컨테이너 모두에서 OpenSKP 소스가 읽는다(레거시는 레이어 레코드, 2021 이후는 8E3C).
  // 타입 주석(Layer.hidden)은 레거시만 채워진다고 적었지만 소스와 다르므로, 파서가 보고한 값이 있으면 경고한다.
  if (summary && summary.hiddenTagNames.length > 0) {
    warnings.push(createStudioBg3dSkpWarning("hidden-tags-included", "warning", {
      count: summary.hiddenTagNames.length,
      detail: summary.hiddenTagNames.slice(0, 3).join(", "),
    }));
  }
  return warnings;
}

function resolveDeclaredUnits(summary: StudioBg3dSkpModelSummary | null): StudioBg3dSkpDeclaredUnits {
  return summary?.declaredUnits ?? describeStudioBg3dSkpDeclaredUnits(null);
}

/**
 * .skp 바이트를 자체 포함 GLB 와 보고서로 변환한다. 실패는 모두 StudioBg3dSkpConversionError 로 분류된다.
 * 입력 ArrayBuffer 는 읽기만 한다(전송 여부는 호출자가 정한다).
 */
export async function convertStudioBg3dSkpBytes(
  input: ArrayBuffer | Uint8Array,
  options: StudioBg3dSkpConversionOptions,
): Promise<StudioBg3dSkpConversionOutput> {
  const now = options.hooks?.now ?? (() => Date.now());
  const run = new ConversionRun(options, { now, started: now() });
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);

  run.stage("validating");
  const header = preflightStudioBg3dSkpSource(view, {
    maxBytes: options.maxBytes,
    mainThread: options.execution === "main-thread",
  });
  await run.checkpoint();

  run.stage("loading-converter");
  const module = await loadModuleOrFail(options.loadModule);
  await run.checkpoint();

  const source = toExactArrayBuffer(input);
  run.stage("reading-metadata");
  const metadata = readMetadata(module, source);
  await run.checkpoint();

  run.stage("building-scene", null);
  const scene = buildSceneOrFail(module, source, run);
  await run.checkpoint();

  run.stage("optimizing");
  const rawPrimitives = (isUnknownArray(scene.glbPrimitives) ? scene.glbPrimitives : []).map(readPrimitive);
  const merged = mergeStudioBg3dSkpPrimitivesByMaterial(rawPrimitives);
  const stats = analyzeStudioBg3dSkpMesh(merged, {
    orientationTriangleBudget: STUDIO_BG3D_SKP_ORIENTATION_CHECK_MAX_TRIANGLES,
  });
  const hierarchy = summarizeOpenSkpHierarchy(scene.sceneHierarchy);
  const textureFacts = readTextureFacts(scene);
  const embedTextures = textureFacts.count > 0
    && textureFacts.count <= STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_COUNT
    && textureFacts.bytes <= STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_BYTES;
  const omitDetail = textureFacts.count > STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_COUNT ? "count" : "size";
  const summary = metadata.summary;
  const container = header.container;

  const reportBase = {
    byteSize: view.byteLength,
    container,
    version: header.version,
    declaredUnits: resolveDeclaredUnits(summary),
    execution: options.execution,
    textures: embedTextures ? "embedded" : textureFacts.count > 0 ? "omitted" : "none",
    metadataPass: metadata.status,
    primitivesBeforeMerge: rawPrimitives.length,
    stats,
    texturesReferenced: textureFacts.count,
    texturesEmbedded: embedTextures ? textureFacts.count : 0,
    sourceFaces: summary?.sourceFaces ?? null,
    instances: hierarchy.instances,
    components: hierarchy.components,
    tags: summary || hierarchy.tagNames.length > 0
      ? buildStudioBg3dSkpTagList(summary?.tagNames ?? [], hierarchy.tagNames)
      : STUDIO_BG3D_SKP_UNAVAILABLE_NAME_LIST,
    scenes: summary && container === "vff"
      ? buildStudioBg3dSkpNameList(summary.sceneNames)
      : STUDIO_BG3D_SKP_UNAVAILABLE_NAME_LIST,
  } as const;
  const warnings = [
    ...collectMetadataWarnings(metadata),
    ...collectTextureWarnings(summary, textureFacts, embedTextures, omitDetail),
    ...collectGeometryWarnings(stats),
    ...(options.execution === "main-thread"
      ? [createStudioBg3dSkpWarning("main-thread-fallback", "info")]
      : []),
  ];

  if (stats.triangleCount === 0) {
    const report = buildStudioBg3dSkpImportReport({ ...reportBase, elapsedMs: run.elapsedMs(), warnings });
    throw new StudioBg3dSkpConversionError(
      "skp-empty-scene",
      "변환 결과에 삼각형이 없습니다. 배치된 형상이 없거나 모두 숨김 상태일 수 있습니다.",
      { reason: "no-geometry", report },
    );
  }
  await run.checkpoint();

  run.stage("writing-glb");
  let written: Uint8Array | ArrayBuffer;
  try {
    written = module.toGLB(
      { ...scene, glbPrimitives: merged },
      embedTextures ? { textures: true } : undefined,
    );
  } catch (error) {
    throw classifyOpenSkpFailure(error);
  }
  const glb = written instanceof Uint8Array ? written : new Uint8Array(written);
  if (glb.byteLength === 0) {
    throw new StudioBg3dSkpParseError(".skp 변환 결과가 비어 있습니다.", { reason: "invalid-output" });
  }
  try {
    assertStudioBg3dSkpGlbContainer(glb);
  } catch (error) {
    if (error instanceof StudioBg3dSkpConversionError) {
      throw new StudioBg3dSkpParseError(".skp 변환 결과가 올바른 GLB가 아닙니다.", {
        reason: "invalid-output",
        cause: error,
      });
    }
    throw error;
  }
  await run.checkpoint();

  return {
    glb,
    report: buildStudioBg3dSkpImportReport({ ...reportBase, elapsedMs: run.elapsedMs(), warnings }),
  };
}
