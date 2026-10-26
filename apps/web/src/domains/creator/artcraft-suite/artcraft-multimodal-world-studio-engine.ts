/**
 * artcraft-multimodal-world-studio-engine.ts
 *
 * Midjourney / Storyteller `ArtCraft.app` v0.41.0 (`ai.artcraft.app`, Learning Machines LLC `DJ6XS33FX8`,
 * 바이너리 SHA-256 `d0e6da63cbfe5d8ed033c57b0c37bdc5bd534d4fb993c965354794c605cdcec8`,
 * REA 증거 `ev_88f17ab02466aa4275e7a39eb283f0f80d305de3bf01964b45b04b8f37ae54e1`)의
 * 22,967개 Rust 심볼 및 2,093개 도메인 경로에서 역공학하여 클린룸 내재화한
 * 멀티모달 AI 월드(3D Gaussian Splat) · 3D 메시 · 카메라 앵글 · 영상 프로모 · 태스크 큐 통합 엔진.
 */

import { computeFnv1a64Hex } from "@toonstudio/studio-format-gateway";

// ============================================================================
// 1. ArtCraft v0.41.0 멀티모달 프로바이더 및 모델 카탈로그 (`artcraft_router`, `enums`)
// ============================================================================

export type ArtCraftRouterProvider =
  | "artcraft"
  | "fal"
  | "kinovi"
  | "midjourney"
  | "grok_api"
  | "sora"
  | "worldlabs";

export type ArtCraftRouterImageModel =
  | "flux_1_dev"
  | "flux_1_schnell"
  | "flux_2_lora_angles"
  | "flux_pro_1p1"
  | "flux_pro_1p1_ultra"
  | "flux_pro_kontext_max"
  | "flux_dev_juggernaut_inpaint"
  | "gpt_image_1"
  | "gpt_image_1p5"
  | "gpt_image_2"
  | "gpt_image_2p5_flare"
  | "gpt_image_2p5_sunburst"
  | "midjourney_7"
  | "midjourney_7_niji"
  | "midjourney_8"
  | "nano_banana"
  | "nano_banana_2"
  | "nano_banana_pro"
  | "qwen_edit_2511_angles"
  | "seedream_4"
  | "seedream_4p5"
  | "seedream_5_lite"
  | "seedream_5p0_pro"
  | "seedream_5p0_pro_ultra"
  | "remove_image_background";

export type ArtCraftRouterVideoModel =
  | "flux_3"
  | "flux_3_draft"
  | "grok_imagine_video"
  | "grok_imagine_video_1p5"
  | "happy_horse_1p0"
  | "kling_1_6_pro"
  | "kling_2_1_master"
  | "kling_2_1_pro"
  | "kling_2_5_turbo_pro"
  | "kling_2_6_pro"
  | "kling_3p0_pro"
  | "kling_3p0_standard"
  | "minimax_h3"
  | "seedance_1p0_lite"
  | "seedance_1p5_pro"
  | "seedance_2p0"
  | "seedance_2p0_fast"
  | "seedance_2p0_mini"
  | "seedance_2p0_bp"
  | "seedance_2p0_bp_fast"
  | "seedance_2p0_bp_mini"
  | "seedance_2p0_bpu"
  | "seedance_2p0_bpu_fast"
  | "seedance_2p0_bpu_mini"
  | "seedance_2p5"
  | "seedance_2p5_preview"
  | "seedance_2p5_u"
  | "sora_2"
  | "sora_2_pro"
  | "veo_2"
  | "veo_3"
  | "veo_3_fast"
  | "veo_3p1"
  | "veo_3p1_fast"
  | "veo_3p1_lite"
  | "vidu_q3"
  | "vidu_q3_turbo"
  | "beeble_switchx_edit_video"
  | "lipsync"
  | "live_portrait";

export type ArtCraftRouterSplatModel =
  | "worldlabs_marble_0p1_mini"
  | "worldlabs_marble_0p1_plus";

export type ArtCraftRouterMeshModel =
  | "hunyuan_2_0_image_to_3d"
  | "hunyuan_2_1_image_to_3d"
  | "hunyuan3d_v3_multi_function_object_gen";

export type Hunyuan3dV3GenerateType =
  | "image-to-3d"
  | "multi-view-to-3d"
  | "text-to-3d";

export type Hunyuan3dV3PolygonType = "triangle" | "quad";

export type CommonVideoGenerationMode =
  | "text-to-video"
  | "image-to-video"
  | "first-last-frame-to-video"
  | "reference-to-video"
  | "reference-to-video-mix"
  | "elements-to-video"
  | "extend-video"
  | "switchx-relight-video"
  | "lipsync-portrait";

// ============================================================================
// 2. 통합 크레딧·비용 추정기 (`estimate_*_cost_command`, `OmniGen*CostAndGenerateRequest`)
// ============================================================================

export interface ArtCraftOmniCostEstimateInput {
  readonly modality: "image" | "video" | "splat" | "mesh";
  readonly model:
    | ArtCraftRouterImageModel
    | ArtCraftRouterVideoModel
    | ArtCraftRouterSplatModel
    | ArtCraftRouterMeshModel;
  readonly provider: ArtCraftRouterProvider;
  readonly resolution?: "720p" | "1080p" | "2k" | "4k";
  readonly durationSeconds?: number;
  readonly count?: number;
}

export interface ArtCraftOmniCostEstimateResult {
  readonly modality: "image" | "video" | "splat" | "mesh";
  readonly model: string;
  readonly provider: ArtCraftRouterProvider;
  readonly estimatedCredits: number;
  readonly estimatedLatencySeconds: number;
  readonly usesOmniEndpointV2: boolean;
  readonly supportsWebhookQueue: boolean;
}

export function estimateArtCraftOmniCost(
  input: ArtCraftOmniCostEstimateInput,
): ArtCraftOmniCostEstimateResult {
  const count = Math.max(1, Math.min(16, input.count ?? 1));
  const resMultiplier =
    input.resolution === "4k"
      ? 2.4
      : input.resolution === "2k"
        ? 1.6
        : input.resolution === "1080p"
          ? 1.25
          : 1.0;

  if (input.modality === "splat") {
    const baseCredits =
      input.model === "worldlabs_marble_0p1_plus" ? 120 : 45;
    return {
      modality: "splat",
      model: input.model,
      provider: input.provider,
      estimatedCredits: Math.round(baseCredits * count),
      estimatedLatencySeconds:
        input.model === "worldlabs_marble_0p1_plus" ? 42 : 16,
      usesOmniEndpointV2: true,
      supportsWebhookQueue: true,
    };
  }

  if (input.modality === "mesh") {
    const baseCredits =
      input.model === "hunyuan3d_v3_multi_function_object_gen"
        ? 85
        : input.model === "hunyuan_2_1_image_to_3d"
          ? 60
          : 40;
    return {
      modality: "mesh",
      model: input.model,
      provider: input.provider,
      estimatedCredits: Math.round(baseCredits * resMultiplier * count),
      estimatedLatencySeconds: 28,
      usesOmniEndpointV2: true,
      supportsWebhookQueue: true,
    };
  }

  if (input.modality === "video") {
    const dur = Math.max(2, Math.min(20, input.durationSeconds ?? 5));
    const isPremiumModel =
      input.model.startsWith("veo_3") ||
      input.model.startsWith("sora_2_pro") ||
      input.model.startsWith("kling_3p0_pro") ||
      input.model.startsWith("seedance_2p5_u") ||
      input.model === "beeble_switchx_edit_video";
    const perSecCredits = isPremiumModel ? 18 : 9;
    return {
      modality: "video",
      model: input.model,
      provider: input.provider,
      estimatedCredits: Math.round(perSecCredits * dur * resMultiplier * count),
      estimatedLatencySeconds: Math.round(12 + dur * (isPremiumModel ? 4.5 : 2.5)),
      usesOmniEndpointV2: input.provider === "artcraft" || input.provider === "fal",
      supportsWebhookQueue: input.provider !== "grok_api",
    };
  }

  // Image modality
  const isProImage =
    input.model.includes("ultra") ||
    input.model.includes("pro") ||
    input.model.startsWith("midjourney_8") ||
    input.model.startsWith("gpt_image_2p5");
  const baseImageCredits = isProImage ? 12 : 4;
  return {
    modality: "image",
    model: input.model,
    provider: input.provider,
    estimatedCredits: Math.round(baseImageCredits * resMultiplier * count),
    estimatedLatencySeconds: isProImage ? 9 : 4,
    usesOmniEndpointV2: input.provider === "artcraft",
    supportsWebhookQueue: input.provider === "fal" || input.provider === "artcraft",
  };
}

// ============================================================================
// 3. WorldLabs Marble 0.1 Mini/Plus 3D Gaussian Splat 월드 생성 파이프라인
//    (`worldlabs_consumer_client` & `artcraft_router::generate::generate_splat`)
// ============================================================================

export interface WorldLabsSplatPlanInput {
  readonly model: ArtCraftRouterSplatModel;
  readonly sourcePrompt: string;
  readonly hasInputReferenceImage: boolean;
  readonly enableRecaption2?: boolean;
  readonly cameraFovDeg?: number;
}

export interface WorldLabsRunGraphSummary {
  readonly runObjectId: string;
  readonly imageInputObjectId: string | null;
  readonly panoObjectId: string;
  readonly worldObjectId: string;
  readonly metaWorldObjectId: string;
  readonly recaptionedWorldPrompt: string;
  readonly spzDownloadUrl: string;
  readonly estimatedGaussianCount: number;
  readonly spzCompressedMegabytes: number;
}

/**
 * `worldlabs_consumer_client`의 `recaption_image` + `update_run_object_with_world` 노드 그래프 플래너:
 * `ImageInputNode` -> `PanoNode` -> `WorldNode`(`TypeGenerateWorld`)를 거쳐 `.spz` 가우시안 스플랫 월드를 생성한다.
 */
export function planWorldLabsGaussianSplatPipeline(
  input: WorldLabsSplatPlanInput,
): WorldLabsRunGraphSummary {
  const seedHash = computeFnv1a64Hex(
    `${input.model}:${input.sourcePrompt}:${input.hasInputReferenceImage}`,
  );
  const shortId = seedHash.slice(0, 12);
  const recaptionedWorldPrompt =
    input.enableRecaption2 !== false
      ? `[Recaption2 360° Spatial] ${input.sourcePrompt.trim()} — omnidirectional depth-consistent lighting, volumetric architectural geometry, occlusion-free floor plane`
      : input.sourcePrompt.trim();

  const isPlus = input.model === "worldlabs_marble_0p1_plus";
  const estimatedGaussianCount = isPlus ? 2_400_000 : 850_000;
  const spzCompressedMegabytes = isPlus ? 18.4 : 6.8;

  return {
    runObjectId: `run_${shortId}`,
    imageInputObjectId: input.hasInputReferenceImage ? `img_in_${shortId}` : null,
    panoObjectId: `pano_${shortId}`,
    worldObjectId: `world_${shortId}`,
    metaWorldObjectId: `metaworld_${shortId}`,
    recaptionedWorldPrompt,
    spzDownloadUrl: `https://cdn.artcraft.ai/splats/${input.model}/${shortId}.spz`,
    estimatedGaussianCount,
    spzCompressedMegabytes,
  };
}

// ============================================================================
// 4. Hunyuan3D v2.0 / v2.1 / v3.0 멀티펑션 3D 메시 오브젝트 생성기
//    (`generate::object::hunyuan3d_v3_multi_function_object_gen`)
// ============================================================================

export interface Hunyuan3dMeshPlanInput {
  readonly model: ArtCraftRouterMeshModel;
  readonly generateType: Hunyuan3dV3GenerateType;
  readonly polygonType: Hunyuan3dV3PolygonType;
  readonly quality: "draft" | "standard" | "high";
  readonly targetFaceBudget?: number;
}

export interface Hunyuan3dMeshPlanResult {
  readonly model: ArtCraftRouterMeshModel;
  readonly generateType: Hunyuan3dV3GenerateType;
  readonly polygonType: Hunyuan3dV3PolygonType;
  readonly outputGlbFilename: string;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly pbrTextureMaps: readonly ("albedo" | "normal" | "metallicRoughness" | "ao")[];
  readonly webtoonOutlineReady: boolean;
}

export function planHunyuan3dMeshGeneration(
  input: Hunyuan3dMeshPlanInput,
): Hunyuan3dMeshPlanResult {
  const defaultFaces =
    input.quality === "high"
      ? 120_000
      : input.quality === "standard"
        ? 50_000
        : 18_000;
  const faceCount = Math.max(2_000, input.targetFaceBudget ?? defaultFaces);
  const vertexCount =
    input.polygonType === "quad"
      ? Math.round(faceCount * 1.02)
      : Math.round(faceCount * 0.52);

  return {
    model: input.model,
    generateType: input.generateType,
    polygonType: input.polygonType,
    outputGlbFilename: `${input.model}_${input.polygonType}_${faceCount}f.glb`,
    vertexCount,
    faceCount,
    pbrTextureMaps: ["albedo", "normal", "metallicRoughness", "ao"],
    // Quad 토폴로지일 때 웹툰 배경 외곽선(펜선 추출) 품질이 극대화됨
    webtoonOutlineReady: true,
  };
}

// ============================================================================
// 5. 카메라 앵글 회전 편집기 (`flux_2_lora_edit_image_angle` & `qwen_edit_2511_angles`)
// ============================================================================

export interface CameraAngleEditInput {
  readonly model: "flux_2_lora_angles" | "qwen_edit_2511_angles";
  readonly referenceImageCount: number;
  readonly yawDeg: number; // -180 ~ +180
  readonly pitchDeg: number; // -85 ~ +85
  readonly rollDeg?: number;
  readonly numOutputs?: 1 | 2 | 4;
}

export interface CameraAngleEditPlan {
  readonly valid: boolean;
  readonly validationError: string | null;
  readonly normalizedYawDeg: number;
  readonly normalizedPitchDeg: number;
  readonly normalizedRollDeg: number;
  readonly cameraOrbitDescriptor: string;
  readonly numOutputs: 1 | 2 | 4;
}

/**
 * `artcraft_router::generate::generate_image::providers::artcraft::angle_validation::require_at_least_one_image_input`
 * 검증 규칙을 포함한 3D 카메라 궤도 각도 변환 플래너.
 */
export function planCameraAngleImageEdit(
  input: CameraAngleEditInput,
): CameraAngleEditPlan {
  if (input.referenceImageCount < 1) {
    return {
      valid: false,
      validationError: "RequireAtLeastOneImageInput",
      normalizedYawDeg: 0,
      normalizedPitchDeg: 0,
      normalizedRollDeg: 0,
      cameraOrbitDescriptor: "invalid-no-reference-image",
      numOutputs: input.numOutputs ?? 1,
    };
  }

  const normalizedYawDeg = Math.max(-180, Math.min(180, Math.round(input.yawDeg)));
  const normalizedPitchDeg = Math.max(-85, Math.min(85, Math.round(input.pitchDeg)));
  const normalizedRollDeg = Math.max(-45, Math.min(45, Math.round(input.rollDeg ?? 0)));

  const elevationLabel =
    normalizedPitchDeg >= 25
      ? "high-angle bird's-eye"
      : normalizedPitchDeg <= -25
        ? "low-angle worm's-eye"
        : "eye-level";
  const azimuthLabel =
    Math.abs(normalizedYawDeg) >= 135
      ? "rear-view"
      : Math.abs(normalizedYawDeg) >= 60
        ? "profile-side"
        : Math.abs(normalizedYawDeg) >= 20
          ? "three-quarter"
          : "frontal";

  return {
    valid: true,
    validationError: null,
    normalizedYawDeg,
    normalizedPitchDeg,
    normalizedRollDeg,
    cameraOrbitDescriptor: `${input.model}:${azimuthLabel}/${elevationLabel} (yaw=${normalizedYawDeg}°, pitch=${normalizedPitchDeg}°, roll=${normalizedRollDeg}°)`,
    numOutputs: input.numOutputs ?? 1,
  };
}

// ============================================================================
// 6. 영상 홍보(PV/트레일러) 멀티모달 비디오 라우터 (`veo_3p1`, `vidu_q3`, `beeble_switchx`, `sora_2`)
// ============================================================================

export interface PromoVideoOmniRouterInput {
  readonly videoModel: ArtCraftRouterVideoModel;
  readonly mode: CommonVideoGenerationMode;
  readonly aspectRatio: "16:9" | "9:16" | "1:1" | "21:9";
  readonly durationSeconds: number;
  readonly resolution: "720p" | "1080p" | "4k";
  readonly referenceImageCount?: number;
  readonly hasAudioReference?: boolean;
  readonly switchxLightingPreset?: "cyberpunk-neon" | "golden-hour-sunset" | "moonlit-noir" | "studio-rim";
}

export interface PromoVideoOmniRouterPlan {
  readonly selectedProvider: ArtCraftRouterProvider;
  readonly videoModel: ArtCraftRouterVideoModel;
  readonly mode: CommonVideoGenerationMode;
  readonly validatedDurationSeconds: number;
  readonly extendResolution: string | null;
  readonly pipelineSteps: readonly string[];
  readonly estimatedCredits: number;
}

/**
 * `artcraft_router::generate::generate_video`의 프로바이더별 제약 조건(`plan_duration`, `plan_extend_duration`,
 * `check_i2v_end_frame_resolution`, `BeebleSwitchXEditVideoRequest`)을 반영한 영상 홍보 라우터.
 */
export function planPromoVideoOmniRouter(
  input: PromoVideoOmniRouterInput,
): PromoVideoOmniRouterPlan {
  let selectedProvider: ArtCraftRouterProvider = "artcraft";
  if (input.videoModel.startsWith("grok_imagine")) {
    selectedProvider = "grok_api";
  } else if (input.videoModel.startsWith("sora_2") && input.mode === "text-to-video") {
    selectedProvider = "sora";
  } else if (input.videoModel.startsWith("veo_3") || input.videoModel.startsWith("vidu_q3")) {
    selectedProvider = "fal";
  }

  // Veo 3.1 / Flux 3 고정·확장 길이 정규화
  const validatedDurationSeconds =
    input.mode === "extend-video"
      ? Math.min(8, Math.max(4, input.durationSeconds))
      : Math.min(16, Math.max(4, input.durationSeconds));

  const extendResolution =
    input.mode === "extend-video"
      ? input.resolution === "4k"
        ? "1080p" // Veo 3.1 extend 해상도 캡(`to_extend_resolution`)
        : input.resolution
      : null;

  const pipelineSteps: string[] = [
    `[Router] ${selectedProvider}::${input.videoModel} (${input.mode}, ${input.aspectRatio})`,
  ];
  if ((input.referenceImageCount ?? 0) > 0) {
    pipelineSteps.push(
      `[Resolve] resolve_image_list_ref (${input.referenceImageCount}컷 캐릭터/배경 시트 바인딩)`,
    );
  }
  if (input.hasAudioReference) {
    pipelineSteps.push(`[Resolve] resolve_audio_list_ref (보이스/BGM 비트 싱크 바인딩)`);
  }
  if (input.videoModel === "beeble_switchx_edit_video" || input.switchxLightingPreset) {
    pipelineSteps.push(
      `[BeebleSwitchX] Relighting & PBR Normal/Albedo Switch (${input.switchxLightingPreset ?? "studio-rim"})`,
    );
  }
  pipelineSteps.push(
    `[Output] ${extendResolution ?? input.resolution} · ${validatedDurationSeconds}s MP4/ProRes 프리뷰 생성`,
  );

  const cost = estimateArtCraftOmniCost({
    modality: "video",
    model: input.videoModel,
    provider: selectedProvider,
    resolution: input.resolution,
    durationSeconds: validatedDurationSeconds,
  });

  return {
    selectedProvider,
    videoModel: input.videoModel,
    mode: input.mode,
    validatedDurationSeconds,
    extendResolution,
    pipelineSteps,
    estimatedCredits: cost.estimatedCredits,
  };
}

// ============================================================================
// 7. SQLite 태스크 큐 & 자동 다운로드 체크포인트 (`sqlite_tasks`, `AutoDownloadCheckpoint`)
// ============================================================================

export type SqliteTaskStatus = "pending" | "processing" | "completed" | "failed" | "dismissed";

export interface SqliteGenerationTaskRecord {
  readonly taskId: string;
  readonly provider: ArtCraftRouterProvider;
  readonly modelType: string;
  readonly status: SqliteTaskStatus;
  readonly createdAtIso: string;
  readonly resultUrls: readonly string[];
}

export interface SqliteTaskQueueDigest {
  readonly totalTasks: number;
  readonly nonArtcraftPendingCount: number;
  readonly completedCount: number;
  readonly autoDownloadCheckpointUrls: readonly string[];
  readonly suggestedDownloadFilenames: readonly string[];
  readonly orderedProvidersByPriority: readonly ArtCraftRouterProvider[];
}

/**
 * ` PreferredDownloadFilename::model_slug_from_model_type_str` + `sanitize` 클린룸 구현:
 * 모델 슬러그, 날짜 문자열(`YYYY-MM-DD`), 프롬프트 요약을 결합해 안전한 파일명을 생성한다.
 */
export function buildPreferredArtCraftDownloadFilename(options: {
  readonly modelType: string;
  readonly dateIso: string;
  readonly promptSnippet: string;
  readonly extension: string;
}): string {
  const modelSlug = options.modelType
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const datePart = options.dateIso.slice(0, 10);
  const sanitizedPrompt = options.promptSnippet
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 32);
  const ext = options.extension.replace(/^\.+/u, "");
  return `artcraft_${modelSlug}_${datePart}_${sanitizedPrompt || "asset"}.${ext}`;
}

export function summarizeSqliteTaskQueueAndAutoDownload(
  tasks: readonly SqliteGenerationTaskRecord[],
  alreadyCheckpointedTaskIds: ReadonlySet<string>,
  providerPriority: readonly ArtCraftRouterProvider[] = [
    "artcraft",
    "fal",
    "worldlabs",
    "sora",
    "midjourney",
    "grok_api",
    "kinovi",
  ],
): SqliteTaskQueueDigest {
  let nonArtcraftPendingCount = 0;
  let completedCount = 0;
  const autoDownloadCheckpointUrls: string[] = [];
  const suggestedDownloadFilenames: string[] = [];

  for (const task of tasks) {
    if (
      (task.status === "pending" || task.status === "processing") &&
      task.provider !== "artcraft"
    ) {
      nonArtcraftPendingCount += 1;
    }
    if (task.status === "completed") {
      completedCount += 1;
      if (!alreadyCheckpointedTaskIds.has(task.taskId)) {
        for (const url of task.resultUrls) {
          autoDownloadCheckpointUrls.push(url);
          const ext = url.endsWith(".spz")
            ? "spz"
            : url.endsWith(".glb")
              ? "glb"
              : url.endsWith(".mp4")
                ? "mp4"
                : "png";
          suggestedDownloadFilenames.push(
            buildPreferredArtCraftDownloadFilename({
              modelType: task.modelType,
              dateIso: task.createdAtIso,
              promptSnippet: task.taskId,
              extension: ext,
            }),
          );
        }
      }
    }
  }

  return {
    totalTasks: tasks.length,
    nonArtcraftPendingCount,
    completedCount,
    autoDownloadCheckpointUrls,
    suggestedDownloadFilenames,
    orderedProvidersByPriority: providerPriority,
  };
}
