/**
 * 확장 전문 도구 56종 라이브 엔진 모듈 검사 및 실제 export 실행기.
 *
 * - 56종 엔진 모듈에 대해 정적 import 0을 유지하고, 동적 로드된 실제 `loadedModule` export를 호출한다.
 * - 가짜 목업 결과를 반환하지 않으며, 오버라이드 모듈은 실제 export를 리플렉션으로 안전하게 실행한다.
 */
import type { StudioEcosystemLoaderId } from "./studio-ecosystem-lazy-registry";

export interface LoadedModuleExportInfo {
  readonly name: string;
  readonly kind: "function" | "class" | "constant";
  readonly arity: number;
  readonly valueSummary: string;
}

export interface LoadedModuleInspection {
  readonly totalExports: number;
  readonly functions: readonly LoadedModuleExportInfo[];
  readonly constants: readonly LoadedModuleExportInfo[];
}

export interface LiveEngineExecutionReport {
  readonly status: "ok" | "error" | "inspect-only";
  readonly invokedExportName: string | null;
  readonly elapsedMs: number;
  readonly resultType: string;
  readonly summaryLines: readonly string[];
  readonly jsonPreview: string;
  readonly errorMessage?: string;
}

type CallableExport = (...args: readonly unknown[]) => unknown;
type ConstructableExport = new (...args: readonly unknown[]) => unknown;

type EngineProbeSpec = {
  readonly exportName: string;
  readonly invoke: (target: unknown, mod: Record<string, unknown>) => unknown;
};

function asCallable(value: unknown): CallableExport {
  return value as CallableExport;
}

function asConstructable(value: unknown): ConstructableExport {
  return value as ConstructableExport;
}

function isClassExport(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  return /^class\s/u.test(Function.prototype.toString.call(fn));
}

function summarizeValue(val: unknown): string {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  if (typeof val === "string") return val.length > 36 ? `"${val.slice(0, 36)}…"` : `"${val}"`;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return `배열(${val.length}건)`;
  if (ArrayBuffer.isView(val)) return `${val.constructor.name}(${(val as Uint8Array).length})`;
  if (typeof val === "object") return `객체(${Object.keys(val).length}키)`;
  return typeof val;
}

export function inspectLoadedEcosystemModule(mod: Record<string, unknown>): LoadedModuleInspection {
  const functions: LoadedModuleExportInfo[] = [];
  const constants: LoadedModuleExportInfo[] = [];

  for (const [name, value] of Object.entries(mod)) {
    if (name === "__esModule") continue;
    if (typeof value === "function") {
      const cls = isClassExport(value);
      functions.push({
        name,
        kind: cls ? "class" : "function",
        arity: value.length,
        valueSummary: cls ? `클래스(생성자 인자 ${value.length})` : `함수(인자 ${value.length})`,
      });
    } else {
      constants.push({ name, kind: "constant", arity: 0, valueSummary: summarizeValue(value) });
    }
  }

  functions.sort((a, b) => a.arity - b.arity || a.name.localeCompare(b.name));
  constants.sort((a, b) => a.name.localeCompare(b.name));
  return { totalExports: functions.length + constants.length, functions, constants };
}

function safeJsonPreview(value: unknown, maxChars = 1400): string {
  const seen = new WeakSet<object>();
  try {
    const raw = JSON.stringify(
      value,
      (_key, current: unknown) => {
        if (typeof current === "bigint") return current.toString();
        if (typeof current === "function") return `[함수 ${current.name || "익명"}]`;
        if (current instanceof Map) return Object.fromEntries(current.entries());
        if (current instanceof Set) return [...current.values()];
        if (ArrayBuffer.isView(current)) {
          const typed = current as unknown as ArrayLike<number>;
          const preview = Array.from({ length: Math.min(8, typed.length) }, (_, idx) => typed[idx]);
          return { type: current.constructor.name, length: typed.length, head: preview };
        }
        if (typeof current === "object" && current !== null) {
          if (seen.has(current)) return "[순환 참조]";
          seen.add(current);
        }
        return current;
      },
      2,
    );
    if (!raw) return String(value);
    return raw.length > maxChars ? `${raw.slice(0, maxChars)}\n… (출력 생략)` : raw;
  } catch (caught) {
    return caught instanceof Error ? `직렬화 생략: ${caught.message}` : String(value);
  }
}

function buildResultSummaryLines(exportName: string, result: unknown): readonly string[] {
  const lines: string[] = [`실행 대상: ${exportName}`];
  if (result === null || result === undefined) {
    lines.push(`반환 값: ${String(result)}`);
    return lines;
  }
  if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
    lines.push(`반환 결과: ${summarizeValue(result)}`);
    return lines;
  }
  if (Array.isArray(result)) {
    lines.push(`반환 배열 항목 수: ${result.length}건`);
    if (result.length > 0) lines.push(`첫 항목: ${summarizeValue(result[0])}`);
    return lines;
  }
  if (typeof result === "object") {
    const entries = Object.entries(result as Record<string, unknown>);
    lines.push(`반환 객체 필드 수: ${entries.length}개`);
    for (const [k, v] of entries.slice(0, 5)) lines.push(`${k}: ${summarizeValue(v)}`);
    return lines;
  }
  lines.push(`반환 형식: ${typeof result}`);
  return lines;
}

const CURATED_ENGINE_PROBES: Readonly<Partial<Record<StudioEcosystemLoaderId, EngineProbeSpec>>> = {
  "colorize-mask-engine": {
    exportName: "createColorizeHintStrokeFromPoints",
    invoke: (fn) => asCallable(fn)([{ x: 12, y: 16 }, { x: 48, y: 36 }], { id: "sample-hint" }),
  },
  "vector-surgery-engine": {
    exportName: "simplifyDrawElStrokeRegion",
    invoke: (fn) => asCallable(fn)({ id: "s1", type: "draw", points: [0, 0, 10, 2, 20, 1, 30, 0], strokeWidth: 3 }),
  },
  "camera-perspective-ruler-engine": {
    exportName: "createDisabledPerspectiveGuideState",
    invoke: (fn) => asCallable(fn)({ width: 800, height: 1200 }),
  },
  "twist-swing-ik-engine": {
    exportName: "OneEuroQuatFilter",
    invoke: (cls) => {
      const filter = new (asConstructable(cls))() as { filter: (q: readonly [number, number, number, number], t: number) => unknown };
      return { filteredQuat: filter.filter([0, 0, 0, 1], 0.016) };
    },
  },
  "bg3d-180-axis-engine": {
    exportName: "createActionLine180Frame",
    invoke: (fn) => asCallable(fn)({
      actorA: { id: "a", position: [-1, 0, 0] },
      actorB: { id: "b", position: [1, 0, 0] },
      initialCameraPosition: [0, 1.5, 4],
    }),
  },
  "bg3d-ground-snap-engine": {
    exportName: "verticalFovToFocalLengthMm",
    invoke: (fn) => ({ fovDeg: 35, focalLengthMm: asCallable(fn)(35) }),
  },
  "lt-vector-brush-engine": {
    exportName: "styleExtractedLineArtPaths",
    invoke: (fn) => asCallable(fn)([], { styleId: "g-pen", layerId: "sample-lt" }),
  },
  "false-perspective-3d-engine": {
    exportName: "createDefaultFalsePerspectiveConfig",
    invoke: (fn) => asCallable(fn)(),
  },
  "screentone-live-mask-engine": {
    exportName: "createLiveScreentoneMaskLayer",
    invoke: (fn) => asCallable(fn)({
      id: "tone-1",
      selection: { kind: "rect", x: 0, y: 0, width: 16, height: 16, canvasWidth: 16, canvasHeight: 16, featherPx: 0 },
    }),
  },
  "timelapse-export-engine": {
    exportName: "pruneUndoneTimelapseStrokes",
    invoke: (fn) => asCallable(fn)({ version: 1, canvasWidth: 800, canvasHeight: 1200, strokes: [] }, []),
  },
  "custom-pattern-tip-engine": {
    exportName: "StudioCustomPatternTipRegistry",
    invoke: (cls) => {
      const reg = new (asConstructable(cls))() as { list?: () => unknown };
      return { registryReady: true, count: Array.isArray(reg.list?.()) ? (reg.list?.() as unknown[]).length : 0 };
    },
  },
  "remote-companion-pairing-engine": {
    exportName: "buildCompanionPairingQrUri",
    invoke: (fn) => ({
      qrUri: asCallable(fn)({
        version: 1,
        sessionId: "sample-session",
        pairingCode: "482910",
        hostLabel: "ToonStudio",
        relayUrl: "wss://local.invalid",
        expiresAtMs: 1_800_000_000_000,
      }),
    }),
  },
  "smart-object-runtime-engine": {
    exportName: "createIdentityWarpMesh",
    invoke: (fn) => asCallable(fn)(3, 3),
  },
  "vanishing-point-planes-engine": {
    exportName: "solveHomography3x3",
    invoke: (fn) => asCallable(fn)(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      [{ x: 8, y: 4 }, { x: 96, y: 10 }, { x: 100, y: 96 }, { x: 2, y: 98 }],
    ),
  },
  "live-performing-recorder-engine": {
    exportName: "fitCubicHermiteKeyframes",
    invoke: (fn) => asCallable(fn)([
      { timeSeconds: 0, values: { x: 0, y: 0 } },
      { timeSeconds: 0.5, values: { x: 40, y: -12 } },
      { timeSeconds: 1, values: { x: 90, y: 0 } },
    ]),
  },
  "dip-pen-impasto-package": { exportName: "createImpastoOilCarry", invoke: (fn) => asCallable(fn)() },
  "shaper-15-slot-package": { exportName: "allShaperVocabularyPresetIds", invoke: (fn) => asCallable(fn)() },
  "clip-vector-sut-package": { exportName: "createDefaultCspCxsTextStyle", invoke: (fn) => asCallable(fn)() },
  "vector-mask-engine": {
    exportName: "createRectVectorMaskSubpath",
    invoke: (fn) => asCallable(fn)({ id: "mask-rect-1", x: 0, y: 0, width: 160, height: 120 }),
  },
  "viewport-wrap-around-engine": { exportName: "createViewportWrapAroundState", invoke: (fn) => asCallable(fn)() },
  "pochade-blockin-engine": {
    exportName: "computeDeterministicPochadeColor",
    invoke: (fn) => asCallable(fn)({ r: 196, g: 148, b: 124 }, 1),
  },
  "patchmatch-inpaint-engine": {
    exportName: "runPatchMatchInpaint",
    invoke: (fn) => {
      const size = 8;
      const data = new Uint8ClampedArray(size * size * 4).fill(200);
      const holeMask = new Uint8Array(size * size);
      holeMask[3 * size + 3] = 1;
      return asCallable(fn)({ width: size, height: size, data }, holeMask, undefined, { iterations: 1, patchRadius: 1 });
    },
  },
  "planar-shape-builder-engine": { exportName: "buildPlanarArrangement", invoke: (fn) => asCallable(fn)([]) },
  "variable-width-tool-engine": {
    exportName: "normalizeWidthProfile",
    invoke: (fn) => asCallable(fn)([{ id: "w0", t: 0, width: 2 }, { id: "w1", t: 0.5, width: 8 }, { id: "w2", t: 1, width: 1 }]),
  },
  "vector-network-graph-engine": { exportName: "createEmptyVectorNetwork", invoke: (fn) => asCallable(fn)() },
  "auto-layout-grid-engine": {
    exportName: "solveAutoLayoutContainer",
    invoke: (fn) => asCallable(fn)({
      id: "auto-1",
      mode: "flex",
      direction: "horizontal",
      width: 320,
      height: 120,
      gap: 12,
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      children: [{ id: "c1", width: 80, height: 60 }, { id: "c2", width: 80, height: 60 }],
    }),
  },
  "live-component-token-engine": {
    exportName: "exportWebtoonTokensToDtcg",
    invoke: (fn) => asCallable(fn)({ version: 1, tokens: [] }),
  },
  "recolor-artwork-engine": { exportName: "srgbToOklab", invoke: (fn) => asCallable(fn)({ r: 0.55, g: 0.42, b: 0.78 }) },
  "bg3d-spatial-grease-loft-engine": {
    exportName: "createCameraPlaneGuide",
    invoke: (fn) => asCallable(fn)({ id: "guide-1", origin: [0, 1.4, 0], cameraForward: [0, 0, -1] }),
  },
  "bg3d-light-switchboard-engine": { exportName: "createBg3dLightSwitchboard", invoke: (fn) => asCallable(fn)() },
  "lt-style-builder-edge-engine": { exportName: "createDefaultLineArtModifierStackConfig", invoke: (fn) => asCallable(fn)() },
  "hybrid-cad-gestures-engine": {
    exportName: "computeSafeMaxBevelRadius",
    invoke: (fn) => ({ maxSafeRadius: asCallable(fn)({ vertices: [], edges: [], faces: [] }, []) }),
  },
  "shot-grammar-floorplan-engine": { exportName: "parseShotGrammar", invoke: (fn) => asCallable(fn)("투샷 미디엄 옥상 로우앵글") },
  "multi-actor-ensemble-engine": { exportName: "createEmptyEnsembleStage", invoke: (fn) => asCallable(fn)() },
  "mannequin-screen-pose-engine": {
    exportName: "inflate2dSilhouetteTo3dMesh",
    invoke: (fn) => asCallable(fn)([[0, 0], [1, 0], [1, 1], [0, 1]]),
  },
  "reference-pro-overlay-engine": { exportName: "createReferenceProOverlayDocument", invoke: (fn) => asCallable(fn)() },
  "asset-color-smart-folder-engine": {
    exportName: "deltaE2000",
    invoke: (fn) => ({ deltaE2000: asCallable(fn)({ L: 52, a: 18, b: -12 }, { L: 56, a: 15, b: -9 }) }),
  },
  "animatic-pacing-shotlist-engine": {
    exportName: "countDialogueMetrics",
    invoke: (fn) => asCallable(fn)("지금 당장 옥상으로 올라가야 해!"),
  },
  "anchor-3d-auto-capture-engine": { exportName: "resolveAnchorAnglesForMode", invoke: (fn) => asCallable(fn)("four-view") },
  "regional-control-stack-engine": {
    exportName: "snapBoundingBoxTo64",
    invoke: (fn) => asCallable(fn)({ x: 18, y: 24, width: 210, height: 310 }, 800, 1200),
  },
  "spatial-moodboard-dna-engine": {
    exportName: "fromColumnMoodboardToSpatial",
    invoke: (fn) => asCallable(fn)({ id: "mb-1", title: "1화 무드보드", columns: [] }),
  },
  "neural-voice-lipsync-engine": {
    exportName: "parseInlineVoiceTags",
    invoke: (fn) => asCallable(fn)("[속삭임] 처음부터 알고 있었어."),
  },
  "dynamic-snippets-engine": {
    exportName: "expandDynamicTemplate",
    invoke: (fn) => asCallable(fn)("{{episode}} · {{scene}} 컷 메모", { episode: "1화", scene: "옥상" }),
  },
  "keyboard-triage-cycle-engine": { exportName: "createTriageInboxState", invoke: (fn) => asCallable(fn)([]) },
  "slash-script-director-engine": {
    exportName: "parseSlashScriptDocument",
    invoke: (fn) => asCallable(fn)("/cut 1\n서연: 여기서 기다리고 있었어."),
  },
  "groom-guide-cage-engine": {
    exportName: "buildGuideDomeWireframeGrid",
    invoke: (fn, mod) => asCallable(fn)(mod["DEFAULT_HAIR_GUIDE_DOME_CAGE"]),
  },
  "autophysics-trajectory-engine": { exportName: "solveAutoPhysicsTrajectory", invoke: (fn) => asCallable(fn)([]) },
  "vrm-video-mocap-engine": {
    exportName: "validateLocalMocapVideoSource",
    invoke: (fn) => asCallable(fn)({ fileName: "pose-clip.mp4", durationSec: 4.2, fps: 30, width: 1280, height: 720, byteLength: 1_048_576 }),
  },
  "vrm-garment-conform-engine": {
    exportName: "conformGarmentVerticesToBodyProfile",
    invoke: (fn, mod) => asCallable(fn)(new Float32Array([0, 1.0, 0.1, 0.2, 1.1, 0.1, -0.2, 1.1, 0.1]), mod["NEUTRAL_BODY_ZONE_PROFILE"]),
  },
  "vrm-pattern-sewing-drape-engine": {
    exportName: "arrangePatternPiece3D",
    invoke: (fn) => asCallable(fn)({
      id: "front-panel",
      labelKo: "앞판",
      widthM: 0.4,
      heightM: 0.5,
      cols: 3,
      rows: 3,
      layerIndex: 0,
      fabric: "cotton",
      pinTopEdge: true,
      arrangement: { axisCenterXZ: [0, 0], baseRadiusM: 0.18, azimuthCenterRad: 0, wrapArcRad: 1.4, topHeightM: 1.35 },
    }),
  },
  "hybrid-sdf-clay-engine": { exportName: "smoothMin", invoke: (fn) => ({ smoothMinValue: asCallable(fn)(1.2, 0.8, 0.4) }) },
  "smart-mask-triplanar-engine": { exportName: "createTriPlanarGlslChunk", invoke: (fn) => asCallable(fn)() },
  "planned-live2d-artmesh-rig": {
    exportName: "createGridArtMesh",
    invoke: (fn) => asCallable(fn)({ id: "artmesh-sample", originX: 0, originY: 0, width: 200, height: 200, cols: 3, rows: 3 }),
  },
  "planned-rive-state-machine": {
    exportName: "evaluateAutoAnimatePose",
    invoke: (fn) => asCallable(fn)({ blink: 0, smile: 0.2 }, { blink: 1, smile: 0.8 }, 0.5),
  },
  "planned-multiplane-z-camera": {
    exportName: "createMultiplaneCameraDoc",
    invoke: (fn) => asCallable(fn)({ id: "zcam-sample", viewportWidth: 800, viewportHeight: 1200 }),
  },
  "planned-ai-node-graph": {
    exportName: "createAiNodeGraph",
    invoke: (fn) => asCallable(fn)({ id: "graph-sample", name: "샘플 AI 노드 파이프라인" }),
  },
};

function runExportSafely(exportName: string, fn: () => unknown): LiveEngineExecutionReport {
  const started = performance.now();
  try {
    const result = fn();
    const elapsedMs = Math.max(0, Math.round((performance.now() - started) * 100) / 100);
    return {
      status: "ok",
      invokedExportName: exportName,
      elapsedMs,
      resultType: summarizeValue(result),
      summaryLines: buildResultSummaryLines(exportName, result),
      jsonPreview: safeJsonPreview(result),
    };
  } catch (caught) {
    const elapsedMs = Math.max(0, Math.round((performance.now() - started) * 100) / 100);
    const message = caught instanceof Error ? caught.message : String(caught);
    return {
      status: "error",
      invokedExportName: exportName,
      elapsedMs,
      resultType: "오류",
      summaryLines: [`실행 대상: ${exportName}`, `오류 내용: ${message}`],
      jsonPreview: message,
      errorMessage: message,
    };
  }
}

export function executeNamedModuleExport(
  mod: Record<string, unknown>,
  exportName: string,
): LiveEngineExecutionReport {
  const target = mod[exportName];
  if (typeof target !== "function") {
    return {
      status: "error",
      invokedExportName: exportName,
      elapsedMs: 0,
      resultType: "실행 불가",
      summaryLines: [`${exportName} 항목은 호출 가능한 함수가 아닙니다.`],
      jsonPreview: summarizeValue(target),
      errorMessage: "호출 가능한 함수가 아닙니다.",
    };
  }
  return runExportSafely(exportName, () =>
    isClassExport(target) ? new (asConstructable(target))() : asCallable(target)(),
  );
}

export function executeLiveEngineSample(
  loaderId: StudioEcosystemLoaderId,
  mod: Record<string, unknown>,
  primaryExportName?: string,
): LiveEngineExecutionReport {
  const curated = CURATED_ENGINE_PROBES[loaderId];
  if (curated && typeof mod[curated.exportName] === "function") {
    return runExportSafely(curated.exportName, () => curated.invoke(mod[curated.exportName], mod));
  }
  if (primaryExportName && typeof mod[primaryExportName] === "function") {
    const primaryFn = mod[primaryExportName] as CallableExport;
    if (primaryFn.length === 0) return executeNamedModuleExport(mod, primaryExportName);
  }
  const inspection = inspectLoadedEcosystemModule(mod);
  const zeroArgCandidate = inspection.functions.find(
    (item) => item.arity === 0 && !item.name.endsWith("Error"),
  );
  if (zeroArgCandidate) return executeNamedModuleExport(mod, zeroArgCandidate.name);

  return {
    status: "inspect-only",
    invokedExportName: null,
    elapsedMs: 0,
    resultType: `내보내기 ${inspection.totalExports}건`,
    summaryLines: [
      `모듈 로드 확인됨 (함수 ${inspection.functions.length}개 · 상수 ${inspection.constants.length}개)`,
      "무인수 실행 함수가 없어 실제 모듈 내보내기 구조를 표시합니다.",
    ],
    jsonPreview: safeJsonPreview({
      functions: inspection.functions.map((item) => item.name),
      constants: inspection.constants.map((item) => item.name),
    }),
  };
}
