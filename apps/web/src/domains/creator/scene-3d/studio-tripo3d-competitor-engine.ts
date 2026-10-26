import type { ShaperBodySliderValues } from "./studio-shaper-model";

export type TripoV3ModelVersion =
  | "H3.1-20260901"
  | "v3.1-20260211"
  | "P1-20260311"
  | "P2-20260801"
  | "v3.0-20250812"
  | "v2.5-20250123";

export type TripoV3GenerationMode =
  | "text-to-model"
  | "image-to-model"
  | "multiview-to-model"
  | "text-to-image"
  | "image-to-image"
  | "image-to-multiview"
  | "edit-multiview"
  | "image-to-splat";

export type TripoV3PostprocessStep =
  | "texture"
  | "convert"
  | "import"
  | "rig-check"
  | "rig"
  | "retarget"
  | "segment"
  | "complete"
  | "decimate"
  | "uv"
  | "edit"
  | "smartsegment";

export type TripoV3RigType =
  | "biped"
  | "quadruped"
  | "hexapod"
  | "octopod"
  | "avian"
  | "serpentine"
  | "aquatic"
  | "others";

export type TripoV3RigSpec = "tripo" | "mixamo" | "actorcore" | "unity" | "unreal" | "vrm";
export type TripoV3RigVersion = "v3.0-20260909" | "v2.5-20260210" | "v1.0-20240301";
export type TripoV3ExportFormat = "glb" | "fbx" | "obj" | "stl" | "usdz" | "3mf";

export type Hyper3dRodinVersion = "Gen-2.5" | "Gen-1.5";
export type Hyper3dRodinSubMode = "Standard" | "Remix Gen" | "Turbo Gen";
export type Hyper3dRodinCardMode = "Generation" | "3D Editing";
export type Hyper3dRodinEditOperation = "Parts" | "Refine" | "Modify";
export type Hyper3dControlNetMode = "default" | "bbox" | "voxel" | "pointcloud";
export type Hyper3dThinkingEffortId =
  | "Extreme-Low"
  | "Low"
  | "Medium"
  | "High"
  | "Extreme-High";

export interface Hyper3dThinkingEffortSpec {
  readonly id: Hyper3dThinkingEffortId;
  readonly labelKo: string;
  readonly durationSeconds: number;
  readonly stepBudget: number;
}

export const HYPER3D_RODIN_THINKING_EFFORTS: readonly Hyper3dThinkingEffortSpec[] = Object.freeze([
  { id: "Extreme-Low", labelKo: "초고속 (4초)", durationSeconds: 4, stepBudget: 8 },
  { id: "Low", labelKo: "빠름 (9초)", durationSeconds: 9, stepBudget: 16 },
  { id: "Medium", labelKo: "표준 (20초)", durationSeconds: 20, stepBudget: 32 },
  { id: "High", labelKo: "정밀 기본값 (40초)", durationSeconds: 40, stepBudget: 64 },
  { id: "Extreme-High", labelKo: "최고 정밀 (80초)", durationSeconds: 80, stepBudget: 128 },
]);

export const HYPER3D_RODIN_GEN25_GRADIENT =
  "linear-gradient(92.72deg, #EA888B 1.22%, #E195C0 50%, #D8A1F1 96.05%)" as const;
export const HYPER3D_RODIN_GEN15_ACCENT = "#5877CD" as const;

export interface CompetitorReaBenchmarkSummary {
  readonly id: "tripo-v3" | "hyper3d-rodin-gen25" | "meshy-ai" | "sloyd-ai" | "csm-cube";
  readonly name: string;
  readonly reaTarget: string;
  readonly coreStrengthsKo: readonly string[];
  readonly internalizedModules: readonly string[];
}

export const STUDIO_3D_COMPETITOR_REA_BENCHMARKS: readonly CompetitorReaBenchmarkSummary[] =
  Object.freeze([
    {
      id: "tripo-v3",
      name: "Tripo 3D Studio V3 & Platform",
      reaTarget: "tripo-cli@0.7.3 + platform.tripo3d.ai + tripo_3d Blender Addon",
      coreStrengthsKo: [
        "v3.1 / P1(삼각 로우폴리) / P2(쿼드 로우폴리+BBox 리두) 3원 자동 라우팅",
        "8종 생성 + 12종 후처리(Rig v3.0 8종 골격/6종 스펙, Segment→Complete, SmartSegment 4x4 행렬)",
        "Blender 5비율 T/A-Pose 프롬프트 제어 및 v3.5 Albedo 디라이팅",
      ],
      internalizedModules: [
        "planTripoV3Pipeline",
        "buildTripoPoseControlSpec",
        "normalizeTripoP2BBoxEditRegion",
        "buildSmartSegmentTransformMatrix",
      ],
    },
    {
      id: "hyper3d-rodin-gen25",
      name: "Hyper3D Rodin Gen-2.5 & Deemos Bang",
      reaTarget: "hyper3d.ai Gen-2.5 Astro/React Bundle (46,840 AST Nodes)",
      coreStrengthsKo: [
        "Gen-2.5 전용 5단계 Thinking Effort 스케줄러 (4초 Extreme-Low ~ 80초 Extreme-High)",
        "4종 공간 ControlNet (Default / BBox / Voxel / PointCloud)",
        "Dual-Card 스택: Generation 카드 ↔ 3D Editing 카드 (Deemos Bang Parts / Refine / Modify)",
      ],
      internalizedModules: ["planHyper3dRodinGen25Session"],
    },
    {
      id: "meshy-ai",
      name: "Meshy AI Studio",
      reaTarget: "Meshy AI Remesh / Delighting / Multi-LOD Pipeline",
      coreStrengthsKo: [
        "4단계 웹툰·게임 LOD 래더 자동 생성 (LOD0 100% → LOD1 50% → LOD2 25% → LOD3 10%)",
        "베이크 조명·그림자 제거(Albedo Delighting) 및 툰 셰이더용 PBR 거칠기·메탈릭 보정",
      ],
      internalizedModules: ["buildMultiStageLodLadder", "computeAlbedoDelightingMetrics"],
    },
    {
      id: "sloyd-ai",
      name: "Sloyd AI Parametric + Hybrid 3D",
      reaTarget: "Sloyd Parametric Architectural Generator",
      coreStrengthsKo: [
        "파라메트릭 건축 모듈(층수·지붕 경사각·창문 베이·골목 폭) 실시간 조합",
        "절차적 건축물과 AI 히어로 소품을 결합한 웹툰 배경 클러스터 구성",
      ],
      internalizedModules: ["buildWebtoon3dBackgroundCluster"],
    },
    {
      id: "csm-cube",
      name: "CSM (Common Sense Machines) Cube",
      reaTarget: "CSM Cube World-to-3D & 6-Plane Camera Framing",
      coreStrengthsKo: [
        "6방위 직교/원근 카메라 샷 프레이밍 및 씬 블록아웃 자동 배치",
        "배경 클러스터 내 캐릭터 포저 앵커 포인트 동기화",
      ],
      internalizedModules: ["buildWebtoon3dBackgroundCluster"],
    },
  ]);

const LOW_POLY_INTENT_REGEX =
  /\b(low[-_\s]?poly|lowpoly|stylized\s+game\s+prop|mobile\s+mesh|blockout)\b|로우\s*폴리|저폴리곤/iu;

const P1_INCOMPATIBLE_PARAMS = Object.freeze([
  "quad",
  "smart_low_poly",
  "generate_parts",
  "geometry_quality",
]);

const BIPED_ONLY_PRESETS = new Set([
  "preset:idle",
  "preset:walk",
  "preset:run",
  "preset:jump",
  "preset:climb",
  "preset:dance",
  "preset:slash",
  "preset:shoot",
  "preset:hurt",
  "preset:fall",
  "preset:turn",
  "preset:quadruped:idle",
  "preset:quadruped:walk",
  "preset:hexapod:idle",
  "preset:hexapod:walk",
  "preset:octopod:idle",
  "preset:octopod:walk",
  "preset:serpentine:idle",
  "preset:serpentine:walk",
  "preset:aquatic:idle",
  "preset:aquatic:walk",
]);

export function detectTripoLowPolyIntent(prompt: string): boolean {
  return LOW_POLY_INTENT_REGEX.test(prompt.trim());
}

export interface TripoPoseControlInput {
  readonly poseType: "None" | "T-Pose" | "A-Pose";
  readonly headBodyHeightRatio?: number;
  readonly headBodyWidthRatio?: number;
  readonly legsBodyHeightRatio?: number;
  readonly armsBodyLengthRatio?: number;
  readonly spanOfLegs?: number;
}

export interface TripoPoseControlSpec {
  readonly poseType: "None" | "T-Pose" | "A-Pose";
  readonly promptSuffix: string;
  readonly normalizedRatios: {
    readonly headBodyHeightRatio: number;
    readonly headBodyWidthRatio: number;
    readonly legsBodyHeightRatio: number;
    readonly armsBodyLengthRatio: number;
    readonly spanOfLegs: number;
  };
  readonly shaperSliders: ShaperBodySliderValues;
}

function clampRange(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}

export function buildTripoPoseControlSpec(input: TripoPoseControlInput): TripoPoseControlSpec {
  const headH = clampRange(input.headBodyHeightRatio, 1.0, 0.5, 2.0);
  const headW = clampRange(input.headBodyWidthRatio, 1.0, 0.5, 2.0);
  const legsH = clampRange(input.legsBodyHeightRatio, 1.0, 0.5, 2.0);
  const armsL = clampRange(input.armsBodyLengthRatio, 1.0, 0.5, 2.0);
  const span = clampRange(input.spanOfLegs, 9.0, 0.0, 45.0);

  const promptSuffix =
    input.poseType === "None"
      ? ""
      : `, ${input.poseType.toLowerCase()}:${headH.toFixed(1)}:${headW.toFixed(1)}:${legsH.toFixed(1)}:${armsL.toFixed(1)}:${span.toFixed(1)}`;

  const shaperSliders: ShaperBodySliderValues = {
    heightCm: Math.round(Math.max(120, Math.min(200, 170 + (legsH - 1.0) * 35))),
    headCount: Number(Math.max(3.0, Math.min(9.5, 7.5 + (headH - 1.0) * 2.0)).toFixed(1)),
    build: Number(Math.max(0.5, Math.min(2.5, 1.0 + (headW - 1.0) * 0.8)).toFixed(2)),
    shoulderWidth: Number(Math.max(0.7, Math.min(1.5, 1.0 + (armsL - 1.0) * 0.4)).toFixed(2)),
    hipWidth: Number(Math.max(0.7, Math.min(1.5, 1.0 + (span - 9.0) * 0.015)).toFixed(2)),
  };

  return {
    poseType: input.poseType,
    promptSuffix,
    normalizedRatios: {
      headBodyHeightRatio: headH,
      headBodyWidthRatio: headW,
      legsBodyHeightRatio: legsH,
      armsBodyLengthRatio: armsL,
      spanOfLegs: span,
    },
    shaperSliders,
  };
}

export interface TripoV3PipelinePlanInput {
  readonly mode: TripoV3GenerationMode;
  readonly prompt: string;
  readonly requestedModel?: TripoV3ModelVersion;
  readonly quad?: boolean;
  readonly faceLimit?: number;
  readonly smartLowPoly?: boolean;
  readonly generateParts?: boolean;
  readonly geometryQuality?: "standard" | "detailed";
  readonly texture?: boolean;
  readonly pbr?: boolean;
  readonly delight?: boolean;
  readonly textureQuality?: "standard" | "detailed" | "fast";
  readonly exportUv?: boolean;
  readonly autoSize?: boolean;
  readonly poseControl?: TripoPoseControlInput;
  readonly chainSteps?: readonly TripoV3PostprocessStep[];
  readonly rigType?: TripoV3RigType;
  readonly rigSpec?: TripoV3RigSpec;
  readonly rigVersion?: TripoV3RigVersion;
  readonly animations?: readonly string[];
  readonly exportFormat?: TripoV3ExportFormat;
  readonly packUv?: boolean;
}

export interface TripoV3PipelinePlanResult {
  readonly valid: boolean;
  readonly selectedModel: TripoV3ModelVersion;
  readonly autoRoutedLowPoly: boolean;
  readonly routeReasonKo: string;
  readonly strippedParams: readonly string[];
  readonly hardErrors: readonly string[];
  readonly softWarnings: readonly string[];
  readonly effectivePrompt: string;
  readonly swappedAnimations: readonly string[];
  readonly skippedRetarget: boolean;
  readonly estimatedCredits: number;
  readonly estimatedUsd: number;
  readonly stepBreakdown: readonly {
    readonly step: string;
    readonly endpoint: string;
    readonly credits: number;
  }[];
  readonly cliCommandPreview: string;
}

export function planTripoV3Pipeline(input: TripoV3PipelinePlanInput): TripoV3PipelinePlanResult {
  const hardErrors: string[] = [];
  const softWarnings: string[] = [];
  const strippedParams: string[] = [];

  const isLowPoly = Boolean(input.smartLowPoly) || detectTripoLowPolyIntent(input.prompt);
  let selectedModel: TripoV3ModelVersion = input.requestedModel ?? "v3.1-20260211";
  let autoRoutedLowPoly = false;
  let routeReasonKo = "기본 고정밀 생성 경로(v3.1-20260211)";

  if (!input.requestedModel && isLowPoly) {
    autoRoutedLowPoly = true;
    if (input.quad) {
      selectedModel = "P2-20260801";
      routeReasonKo = "로우폴리 의도 + Quad 토폴로지 감지 → P2-20260801 자동 라우팅";
    } else {
      selectedModel = "P1-20260311";
      routeReasonKo = "로우폴리 의도 감지 → P1-20260311 네이티브 로우폴리 자동 라우팅";
    }
  } else if (input.requestedModel) {
    routeReasonKo = `사용자 지정 모델 버전(${input.requestedModel})`;
  }

  if (selectedModel === "P1-20260311") {
    if (input.quad && input.requestedModel === "P1-20260311") {
      hardErrors.push("P1-20260311 모델은 삼각형(Triangle) 메쉬만 지원합니다 (quad 사용 불가, P2-20260801 권장).");
    }
    if (input.smartLowPoly) strippedParams.push(P1_INCOMPATIBLE_PARAMS[1]!);
    if (input.generateParts) strippedParams.push(P1_INCOMPATIBLE_PARAMS[2]!);
    if (input.geometryQuality === "detailed") strippedParams.push(P1_INCOMPATIBLE_PARAMS[3]!);
  }

  if (typeof input.faceLimit === "number") {
    if (selectedModel === "P1-20260311" && (input.faceLimit < 50 || input.faceLimit > 20_000)) {
      hardErrors.push(`P1-20260311 face_limit 범위는 50..20000 입니다 (입력값: ${input.faceLimit}).`);
    } else if (selectedModel === "P2-20260801") {
      const maxP2 = input.quad ? 25_000 : 50_000;
      if (input.faceLimit < 48 || input.faceLimit > maxP2) {
        hardErrors.push(`P2-20260801 face_limit 범위는 48..${maxP2} 입니다 (입력값: ${input.faceLimit}).`);
      }
    } else if (selectedModel === "v3.1-20260211" || selectedModel === "H3.1-20260901") {
      const maxV31 = input.quad ? 150_000 : 2_000_000;
      if (input.faceLimit < 1_000 || input.faceLimit > maxV31) {
        hardErrors.push(`${selectedModel} face_limit 범위는 1000..${maxV31} 입니다 (입력값: ${input.faceLimit}).`);
      }
    }
  }

  if (input.generateParts && (input.texture || input.pbr || input.quad)) {
    hardErrors.push("generate_parts 활성화 시 texture=false, pbr=false, quad=false 여야 합니다.");
  }

  if (input.exportUv === false && (input.texture ?? true)) {
    softWarnings.push("texture 또는 pbr 활성 상태에서는 export_uv=false 가 무시되고 UV가 생성됩니다.");
  }

  const poseSpec = buildTripoPoseControlSpec(
    input.poseControl ?? { poseType: "None" },
  );
  const effectivePrompt = `${input.prompt.trim()}${poseSpec.promptSuffix}`;

  const steps = [...(input.chainSteps ?? [])];
  for (let idx = 0; idx < steps.length; idx += 1) {
    const step = steps[idx]!;
    const upstream = steps.slice(0, idx);
    if (step === "complete" && !upstream.includes("segment")) {
      hardErrors.push("후처리 'complete'(mesh_completion) 단계는 선행 'segment'(mesh_segmentation) 단계가 필수입니다.");
    }
    if (step === "retarget" && !upstream.includes("rig")) {
      hardErrors.push("후처리 'retarget'(animate_retarget) 단계는 선행 'rig'(animate_rig) 단계가 필수입니다.");
    }
  }

  const rigType: TripoV3RigType = input.rigType ?? "biped";
  const rawAnims = [...(input.animations ?? [])];
  const swappedAnimations: string[] = [];
  let skippedRetarget = false;

  if (steps.includes("retarget")) {
    if (rawAnims.length === 0) {
      hardErrors.push("'retarget' 단계에는 최소 1개의 애니메이션 프리셋이 필요합니다.");
    }
    if (rawAnims.length > 5) {
      hardErrors.push(`'retarget' 단계는 최대 5개의 애니메이션만 지원합니다 (입력값: ${rawAnims.length}개).`);
    }
    if (rigType === "avian" || rigType === "others") {
      skippedRetarget = true;
      softWarnings.push(
        `rig_type='${rigType}' 골격은 내장 애니메이션 프리셋이 없어 retarget 단계를 건너뛰고 리깅된 메쉬만 유지합니다.`,
      );
    } else {
      for (const anim of rawAnims) {
        if (!BIPED_ONLY_PRESETS.has(anim)) {
          hardErrors.push(`지원하지 않는 애니메이션 프리셋입니다: ${anim}`);
        } else if (rigType !== "biped" && (anim === "preset:idle" || anim === "preset:walk")) {
          const suffix = anim.slice("preset:".length);
          swappedAnimations.push(`preset:${rigType}:${suffix}`);
        } else {
          swappedAnimations.push(anim);
        }
      }
    }
  }

  if (steps.includes("convert") && input.packUv && input.exportFormat !== "glb" && input.exportFormat !== "obj") {
    softWarnings.push("pack_uv 옵션은 GLB 및 OBJ 포맷에서만 적용됩니다.");
  }

  const stepBreakdown: Array<{ readonly step: string; readonly endpoint: string; readonly credits: number }> = [
    {
      step: input.mode,
      endpoint: `/v3/generation/${input.mode}`,
      credits: selectedModel === "P1-20260311" ? 15 : 20,
    },
  ];
  const stepCreditMap: Readonly<Record<TripoV3PostprocessStep, { endpoint: string; credits: number }>> = {
    texture: { endpoint: "/v3/postprocess/texture", credits: 10 },
    convert: { endpoint: "/v3/postprocess/convert", credits: 5 },
    import: { endpoint: "/v3/postprocess/import", credits: 5 },
    "rig-check": { endpoint: "/v3/postprocess/rig-check", credits: 0 },
    rig: { endpoint: "/v3/postprocess/rig", credits: 15 },
    retarget: { endpoint: "/v3/postprocess/retarget", credits: 10 },
    segment: { endpoint: "/v3/postprocess/segment", credits: 10 },
    complete: { endpoint: "/v3/postprocess/complete", credits: 10 },
    decimate: { endpoint: "/v3/postprocess/decimate", credits: 10 },
    uv: { endpoint: "/v3/postprocess/uv", credits: 5 },
    edit: { endpoint: "/v3/mesh/edit", credits: 15 },
    smartsegment: { endpoint: "/v3/scene/smartsegment", credits: 10 },
  };
  for (const s of steps) {
    if (s === "retarget" && skippedRetarget) continue;
    const meta = stepCreditMap[s];
    stepBreakdown.push({ step: s, endpoint: meta.endpoint, credits: meta.credits });
  }

  const estimatedCredits = stepBreakdown.reduce((acc, item) => acc + item.credits, 0);
  const estimatedUsd = Number((estimatedCredits / 100).toFixed(2));
  const chainFlag = steps.length > 0 ? ` --chain ${steps.join(",")}` : "";
  const cliCommandPreview = `pnpm run tripo3d -- make --mode ${input.mode} --prompt "${effectivePrompt}" --model-version ${selectedModel}${chainFlag}`;

  return {
    valid: hardErrors.length === 0,
    selectedModel,
    autoRoutedLowPoly,
    routeReasonKo,
    strippedParams,
    hardErrors,
    softWarnings,
    effectivePrompt,
    swappedAnimations,
    skippedRetarget,
    estimatedCredits,
    estimatedUsd,
    stepBreakdown,
    cliCommandPreview,
  };
}

export interface TripoP2BBoxEditInput {
  readonly taskId: string;
  readonly minCorner: readonly [number, number, number];
  readonly maxCorner: readonly [number, number, number];
  readonly editPrompt: string;
}

export interface TripoP2BBoxEditPlan {
  readonly taskId: string;
  readonly modelVersion: "P2-20260801";
  readonly endpoint: "/v3/mesh/edit";
  readonly normalizedMin: readonly [number, number, number];
  readonly normalizedMax: readonly [number, number, number];
  readonly dimensions: readonly [number, number, number];
  readonly volumeCubicUnits: number;
  readonly editPrompt: string;
}

export function normalizeTripoP2BBoxEditRegion(input: TripoP2BBoxEditInput): TripoP2BBoxEditPlan {
  const clampCoord = (v: number): number => Math.max(-5, Math.min(5, Number(v.toFixed(3))));
  const x0 = clampCoord(Math.min(input.minCorner[0], input.maxCorner[0]));
  const y0 = clampCoord(Math.min(input.minCorner[1], input.maxCorner[1]));
  const z0 = clampCoord(Math.min(input.minCorner[2], input.maxCorner[2]));
  const x1 = Math.max(x0 + 0.05, clampCoord(Math.max(input.minCorner[0], input.maxCorner[0])));
  const y1 = Math.max(y0 + 0.05, clampCoord(Math.max(input.minCorner[1], input.maxCorner[1])));
  const z1 = Math.max(z0 + 0.05, clampCoord(Math.max(input.minCorner[2], input.maxCorner[2])));
  const dx = Number((x1 - x0).toFixed(3));
  const dy = Number((y1 - y0).toFixed(3));
  const dz = Number((z1 - z0).toFixed(3));
  return {
    taskId: input.taskId.trim() || "task_p2_local_edit",
    modelVersion: "P2-20260801",
    endpoint: "/v3/mesh/edit",
    normalizedMin: [x0, y0, z0],
    normalizedMax: [x1, y1, z1],
    dimensions: [dx, dy, dz],
    volumeCubicUnits: Number((dx * dy * dz).toFixed(4)),
    editPrompt: input.editPrompt.trim() || "refine selected mesh region",
  };
}

export function buildSmartSegmentTransformMatrix(params: {
  readonly translate: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly yawDeg?: number;
}): readonly number[] {
  const rad = ((params.yawDeg ?? 0) * Math.PI) / 180;
  const c = Number(Math.cos(rad).toFixed(4));
  const s = Number(Math.sin(rad).toFixed(4));
  const [sx, sy, sz] = params.scale;
  const [tx, ty, tz] = params.translate;
  return Object.freeze([
    Number((c * sx).toFixed(4)),
    0,
    Number((-s * sx).toFixed(4)),
    0,
    0,
    Number(sy.toFixed(4)),
    0,
    0,
    Number((s * sz).toFixed(4)),
    0,
    Number((c * sz).toFixed(4)),
    0,
    Number(tx.toFixed(4)),
    Number(ty.toFixed(4)),
    Number(tz.toFixed(4)),
    1,
  ]);
}

export interface TripoPlatformWalletSummary {
  readonly defaultBalance: number;
  readonly defaultFrozen: number;
  readonly freeBalance: number;
  readonly totalAvailableCredits: number;
  readonly usdEquivalent: number;
  readonly thresholdAlertTriggered: boolean;
}

export function computeTripoPlatformWalletSummary(input: {
  readonly defaultBalance: number;
  readonly defaultFrozen?: number;
  readonly freeBalance?: number;
  readonly alertThreshold?: number;
}): TripoPlatformWalletSummary {
  const defBal = Math.max(0, Math.round(input.defaultBalance));
  const defFrz = Math.max(0, Math.round(input.defaultFrozen ?? 0));
  const freeBal = Math.max(0, Math.round(input.freeBalance ?? 0));
  const totalAvailableCredits = defBal + freeBal;
  const usdEquivalent = Number((defBal / 100).toFixed(2));
  const threshold = input.alertThreshold ?? 200;
  return {
    defaultBalance: defBal,
    defaultFrozen: defFrz,
    freeBalance: freeBal,
    totalAvailableCredits,
    usdEquivalent,
    thresholdAlertTriggered: totalAvailableCredits <= threshold,
  };
}

export interface Hyper3dRodinSessionInput {
  readonly cardMode: Hyper3dRodinCardMode;
  readonly requestedVersion?: Hyper3dRodinVersion;
  readonly subMode?: Hyper3dRodinSubMode;
  readonly controlNetMode?: Hyper3dControlNetMode;
  readonly bboxDimensions?: readonly [number, number, number];
  readonly voxelResolution?: 16 | 32 | 64;
  readonly pointCloudBudget?: number;
  readonly thinkingEffort?: Hyper3dThinkingEffortId;
  readonly editOperation?: Hyper3dRodinEditOperation;
  readonly sourceAssetExtension?: ".obj" | ".fbx" | ".glb";
}

export interface Hyper3dRodinSessionPlan {
  readonly cardMode: Hyper3dRodinCardMode;
  readonly effectiveVersion: Hyper3dRodinVersion;
  readonly versionLockedByEditingCard: boolean;
  readonly subMode: Hyper3dRodinSubMode;
  readonly badgeStyle: string;
  readonly controlNetMode: Hyper3dControlNetMode;
  readonly controlNetSummaryKo: string;
  readonly thinkingEffort: Hyper3dThinkingEffortSpec | null;
  readonly editOperation: Hyper3dRodinEditOperation | null;
  readonly deemosBangPartsEnabled: boolean;
}

export function planHyper3dRodinGen25Session(
  input: Hyper3dRodinSessionInput,
): Hyper3dRodinSessionPlan {
  const versionLockedByEditingCard = input.cardMode === "3D Editing";
  const effectiveVersion: Hyper3dRodinVersion = versionLockedByEditingCard
    ? "Gen-2.5"
    : (input.requestedVersion ?? "Gen-2.5");
  const subMode: Hyper3dRodinSubMode = input.subMode ?? "Standard";
  const badgeStyle =
    effectiveVersion === "Gen-2.5" ? HYPER3D_RODIN_GEN25_GRADIENT : HYPER3D_RODIN_GEN15_ACCENT;

  const controlNetMode: Hyper3dControlNetMode = input.controlNetMode ?? "default";
  let controlNetSummaryKo = "기본 자유 공간 생성 (ControlNet 비활성)";
  if (controlNetMode === "bbox") {
    const [w, h, l] = input.bboxDimensions ?? [1.0, 1.8, 1.0];
    controlNetSummaryKo = `Bounding Box ControlNet (${w.toFixed(1)}m × ${h.toFixed(1)}m × ${l.toFixed(1)}m)`;
  } else if (controlNetMode === "voxel") {
    const res = input.voxelResolution ?? 32;
    controlNetSummaryKo = `Voxel ControlNet (${res}³ 복셀 격자 구속)`;
  } else if (controlNetMode === "pointcloud") {
    const pts = Math.max(2048, Math.min(16384, input.pointCloudBudget ?? 8192));
    controlNetSummaryKo = `PointCloud ControlNet (${pts.toLocaleString()} 포인트 클라우드 정합)`;
  }

  const effortId: Hyper3dThinkingEffortId = input.thinkingEffort ?? "High";
  const thinkingEffort =
    effectiveVersion === "Gen-2.5"
      ? (HYPER3D_RODIN_THINKING_EFFORTS.find((e) => e.id === effortId) ??
        HYPER3D_RODIN_THINKING_EFFORTS[3]!)
      : null;

  const editOperation: Hyper3dRodinEditOperation | null =
    input.cardMode === "3D Editing" ? (input.editOperation ?? "Parts") : null;

  return {
    cardMode: input.cardMode,
    effectiveVersion,
    versionLockedByEditingCard,
    subMode,
    badgeStyle,
    controlNetMode,
    controlNetSummaryKo,
    thinkingEffort,
    editOperation,
    deemosBangPartsEnabled: editOperation === "Parts",
  };
}

export interface LodStageSpec {
  readonly stage: "LOD0" | "LOD1" | "LOD2" | "LOD3";
  readonly roleKo: string;
  readonly targetFaces: number;
  readonly screenCoverageRatio: number;
  readonly preserveUvSeams: boolean;
}

export function buildMultiStageLodLadder(baseFaces: number, quad: boolean): readonly LodStageSpec[] {
  const safeBase = Math.max(500, Math.min(2_000_000, Math.round(baseFaces)));
  const minFloor = quad ? 48 : 50;
  return Object.freeze([
    {
      stage: "LOD0",
      roleKo: "클로즈업 히어로 컷 (100%)",
      targetFaces: safeBase,
      screenCoverageRatio: 1.0,
      preserveUvSeams: true,
    },
    {
      stage: "LOD1",
      roleKo: "바스트·미디엄 컷 (50%)",
      targetFaces: Math.max(minFloor, Math.round(safeBase * 0.5)),
      screenCoverageRatio: 0.5,
      preserveUvSeams: true,
    },
    {
      stage: "LOD2",
      roleKo: "풀샷·와이드 배경 컷 (25%)",
      targetFaces: Math.max(minFloor, Math.round(safeBase * 0.25)),
      screenCoverageRatio: 0.25,
      preserveUvSeams: true,
    },
    {
      stage: "LOD3",
      roleKo: "원경 군중·실루엣 소품 (10%)",
      targetFaces: Math.max(minFloor, Math.round(safeBase * 0.1)),
      screenCoverageRatio: 0.1,
      preserveUvSeams: false,
    },
  ]);
}

export interface AlbedoDelightingMetrics {
  readonly shadowRemovalPercent: number;
  readonly specularSuppressionPercent: number;
  readonly clampedRoughnessRange: readonly [number, number];
  readonly clampedMetallicMax: number;
  readonly toonShaderReady: boolean;
}

export function computeAlbedoDelightingMetrics(options: {
  readonly delightEnabled: boolean;
  readonly shadowIntensity?: number;
  readonly toonShadingTarget?: boolean;
}): AlbedoDelightingMetrics {
  const shadow = Math.max(0, Math.min(100, options.shadowIntensity ?? 85));
  const removal = options.delightEnabled ? Math.min(98, Math.round(shadow * 1.08)) : 0;
  const specSuppression = options.delightEnabled ? 92 : 20;
  const clampedRoughnessRange: readonly [number, number] = options.toonShadingTarget
    ? [0.65, 0.95]
    : [0.15, 0.9];
  const clampedMetallicMax = options.toonShadingTarget ? 0.25 : 1.0;
  return {
    shadowRemovalPercent: removal,
    specularSuppressionPercent: specSuppression,
    clampedRoughnessRange,
    clampedMetallicMax,
    toonShaderReady: options.delightEnabled && Boolean(options.toonShadingTarget),
  };
}

export interface Webtoon3dBackgroundClusterInput {
  readonly presetId: "korean-alley-commercial" | "school-rooftop-sunset" | "fantasy-palace-courtyard";
  readonly floorCount: number;
  readonly roofPitchDeg: number;
  readonly windowBayCount: number;
  readonly alleyWidthMeters: number;
  readonly cameraPlane: "front" | "back" | "left" | "right" | "top-iso" | "street-low";
}

export interface Webtoon3dBackgroundClusterPlan {
  readonly presetId: Webtoon3dBackgroundClusterInput["presetId"];
  readonly labelKo: string;
  readonly proceduralModuleCount: number;
  readonly aiHeroPropCount: number;
  readonly totalEstimatedFaces: number;
  readonly cameraFovDeg: number;
  readonly cameraElevationDeg: number;
  readonly recommendedProviderChain: string;
}

export function buildWebtoon3dBackgroundCluster(
  input: Webtoon3dBackgroundClusterInput,
): Webtoon3dBackgroundClusterPlan {
  const floors = Math.max(1, Math.min(12, Math.round(input.floorCount)));
  const bays = Math.max(1, Math.min(16, Math.round(input.windowBayCount)));
  const pitch = Math.max(0, Math.min(60, Math.round(input.roofPitchDeg)));
  const alley = Math.max(1.5, Math.min(20, Number(input.alleyWidthMeters.toFixed(1))));

  const labelMap: Readonly<Record<Webtoon3dBackgroundClusterInput["presetId"], string>> = {
    "korean-alley-commercial": "한국형 상가 골목 & 편의점·간판 클러스터",
    "school-rooftop-sunset": "학교 옥상·펜스·급수탑 노을 클러스터",
    "fantasy-palace-courtyard": "로맨스판타지 황궁 회랑·분수대 클러스터",
  };

  const proceduralModuleCount = floors * bays + (pitch > 15 ? 4 : 2);
  const aiHeroPropCount =
    input.presetId === "fantasy-palace-courtyard" ? 8 : input.presetId === "korean-alley-commercial" ? 6 : 4;
  const totalEstimatedFaces = proceduralModuleCount * 420 + aiHeroPropCount * 6500;
  const cameraFovDeg = input.cameraPlane === "street-low" ? 28 : input.cameraPlane === "top-iso" ? 22 : 35;
  const cameraElevationDeg =
    input.cameraPlane === "street-low" ? -12 : input.cameraPlane === "top-iso" ? 38 : 6;

  return {
    presetId: input.presetId,
    labelKo: `${labelMap[input.presetId]} (${floors}층 · 폭 ${alley}m)`,
    proceduralModuleCount,
    aiHeroPropCount,
    totalEstimatedFaces,
    cameraFovDeg,
    cameraElevationDeg,
    recommendedProviderChain:
      "Sloyd 파라메트릭 건축 블록아웃 → Tripo P2/v3.1 히어로 소품 생성 → v3.5 Albedo 디라이팅 → CSM 6-Plane 카메라 앵커",
  };
}
