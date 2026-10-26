#!/usr/bin/env tsx
/**
 * Tripo 3D V3 (https://studio.tripo3d.ai & https://openapi.tripo3d.ai) 및
 * 글로벌 3D 생성 AI 경쟁사(Hyper3D Rodin, Meshy AI, VARCO 3D, Sloyd AI, CSM Cube) 통합 CLI.
 *
 * 지원 명령:
 * - doctor [--check]
 * - balance
 * - catalog [--section all|models|chains|scenarios|errors|competitors]
 * - plan [--scenario <id>] [--prompt <text>] [--model <alias>] [--face-limit <n>] [--quad] [--delight] [--then <chain>] [--rig-type <type>]
 * - make / generate [--scenario <id>] [--prompt <text>] [--image <path|url>] [--then <chain>] [--confirm]
 * - status <taskId>
 * - wait <taskId> [--timeout <ms>]
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPETITOR_3D_PLATFORM_MATRIX,
  TRIPO3D_BIPED_ANIMATION_PRESETS,
  TRIPO3D_CHAIN_STEPS,
  TRIPO3D_ERROR_CATALOG,
  TRIPO3D_GENERATION_ENDPOINTS,
  TRIPO3D_IMAGE_MODELS,
  TRIPO3D_IMAGE_TEMPLATES,
  TRIPO3D_MODEL_ALIASES,
  TRIPO3D_MODEL_STYLES,
  TRIPO3D_NON_BIPED_ANIMATION_MAP,
  TRIPO3D_POST_STYLES,
  TRIPO3D_REGIONS,
  TRIPO3D_RIG_SPECS,
  TRIPO3D_RIG_TYPES,
  TRIPO3D_RIG_VERSIONS,
  TRIPO3D_SCENARIO_PRESETS,
  TRIPO3D_WIRE_MODELS,
  type Tripo3dRigType,
} from "./lib/tripo3d-catalog.mts";
import {
  BLEND_AI_SCALE_REFERENCE_METERS,
  BLEND_AI_THREE_POINT_LIGHTING_RATIO,
  GLBFORGE_EXTRUDE_MATERIAL_PRESETS,
  GLBFORGE_LINT_RULES,
  GLBFORGE_PERFORMANCE_PROFILES,
  HYPER3D_RODIN_MCP_TOOLS,
  MESHY_CREATIVE_LAB_PRODUCTS,
  MESHY_MULTI_COLOR_SLICERS,
  TRIPO3D_STUDIO_ASSET_FILTERS,
  TRIPO3D_STUDIO_WEB_WORKSPACES,
  VRM0_REQUIRED_BONES,
  VRM1_REQUIRED_BONES,
  VRM_CAMERA_FRAMING_PRESETS,
  auditGlbAssetAgainstProfile,
  plan2dTo3dReliefExtrusion,
  planRodinBangDecomposition,
  validateVrmAssetSummary,
  type GlbForgeExtrudeMaterialPresetId,
  type GlbForgePerformanceBudget,
} from "./lib/tripo3d-ecosystem-catalog.mts";
import {
  buildTripo3dPlanCard,
  computeTripo3dAdaptivePollIntervalMs,
  detectTripo3dLowPolyIntent,
  formatTripo3dPoseControlPromptSuffix,
  inspectTripo3dMcpAndTools,
  loadTripo3dConfig,
  maskTripoApiKey,
  parseTripo3dChainExpression,
  REPO_ROOT,
  requestTripo3dJson,
  requireTripo3dApiKey,
  resolveTripo3dModelAndValidateParams,
  type Tripo3dResolvedConfig,
  validateTripo3dChain,
} from "./lib/tripo3d-runtime.mts";

export {
  auditGlbAssetAgainstProfile,
  BLEND_AI_SCALE_REFERENCE_METERS,
  BLEND_AI_THREE_POINT_LIGHTING_RATIO,
  buildTripo3dPlanCard,
  COMPETITOR_3D_PLATFORM_MATRIX,
  computeTripo3dAdaptivePollIntervalMs,
  detectTripo3dLowPolyIntent,
  formatTripo3dPoseControlPromptSuffix,
  GLBFORGE_EXTRUDE_MATERIAL_PRESETS,
  GLBFORGE_LINT_RULES,
  GLBFORGE_PERFORMANCE_PROFILES,
  HYPER3D_RODIN_MCP_TOOLS,
  inspectTripo3dMcpAndTools,
  loadTripo3dConfig,
  maskTripoApiKey,
  MESHY_CREATIVE_LAB_PRODUCTS,
  MESHY_MULTI_COLOR_SLICERS,
  parseTripo3dChainExpression,
  plan2dTo3dReliefExtrusion,
  planRodinBangDecomposition,
  REPO_ROOT,
  requestTripo3dJson,
  requireTripo3dApiKey,
  resolveTripo3dModelAndValidateParams,
  TRIPO3D_BIPED_ANIMATION_PRESETS,
  TRIPO3D_CHAIN_STEPS,
  TRIPO3D_ERROR_CATALOG,
  TRIPO3D_GENERATION_ENDPOINTS,
  TRIPO3D_IMAGE_MODELS,
  TRIPO3D_IMAGE_TEMPLATES,
  TRIPO3D_MODEL_ALIASES,
  TRIPO3D_MODEL_STYLES,
  TRIPO3D_NON_BIPED_ANIMATION_MAP,
  TRIPO3D_POST_STYLES,
  TRIPO3D_REGIONS,
  TRIPO3D_RIG_SPECS,
  TRIPO3D_RIG_TYPES,
  TRIPO3D_RIG_VERSIONS,
  TRIPO3D_SCENARIO_PRESETS,
  TRIPO3D_STUDIO_ASSET_FILTERS,
  TRIPO3D_STUDIO_WEB_WORKSPACES,
  TRIPO3D_WIRE_MODELS,
  type Tripo3dResolvedConfig,
  validateTripo3dChain,
  validateVrmAssetSummary,
  VRM0_REQUIRED_BONES,
  VRM1_REQUIRED_BONES,
  VRM_CAMERA_FRAMING_PRESETS,
};

export interface ParsedTripoCliArgs {
  readonly command: string;
  readonly positionals: readonly string[];
  readonly flags: ReadonlySet<string>;
  readonly options: ReadonlyMap<string, string>;
}

export interface RunTripoCliDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly repoRoot?: string;
  readonly homeDir?: string;
  readonly sleepMs?: (ms: number) => Promise<void>;
}

export interface RunTripoCliResult {
  readonly exitCode: number;
  readonly output: Record<string, unknown>;
}

const BOOLEAN_FLAGS = new Set([
  "check",
  "confirm",
  "dry-run",
  "quad",
  "smart-low-poly",
  "generate-parts",
  "no-texture",
  "no-pbr",
  "delight",
  "auto-size",
  "pose-control",
  "help",
]);

export function parseTripoCliArguments(argv: readonly string[]): ParsedTripoCliArgs {
  const [command = "doctor", ...rest] = argv.filter((arg) => arg !== "--");
  const positionals: string[] = [];
  const flags = new Set<string>();
  const options = new Map<string, string>();

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token) continue;
    if (token === "-h") {
      flags.add("help");
    } else if (!token.startsWith("--")) {
      positionals.push(token);
    } else if (token.indexOf("=") > 2) {
      const eqIdx = token.indexOf("=");
      options.set(token.slice(2, eqIdx), token.slice(eqIdx + 1));
    } else {
      const key = token.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags.add(key);
      } else {
        const nextVal = rest[i + 1];
        if (!nextVal || nextVal.startsWith("--")) {
          throw new Error(`--${key} 옵션에 값이 누락되었습니다.`);
        }
        options.set(key, nextVal);
        i += 1;
      }
    }
  }
  return { command, positionals, flags, options };
}

function buildPlanFromParsedArgs(parsed: ParsedTripoCliArgs) {
  const faceLimitRaw = parsed.options.get("face-limit");
  const faceLimit =
    faceLimitRaw !== undefined ? Number.parseInt(faceLimitRaw, 10) : undefined;
  const rigType = (parsed.options.get("rig-type") ?? "biped") as Tripo3dRigType;
  if (!TRIPO3D_RIG_TYPES.includes(rigType)) {
    throw new Error(
      `지원하지 않는 --rig-type(${rigType})입니다. 허용값: ${TRIPO3D_RIG_TYPES.join(", ")}`,
    );
  }
  const hasImage = Boolean(parsed.options.get("image"));
  const taskType = hasImage ? "image_to_model" : "text_to_model";

  return buildTripo3dPlanCard({
    scenarioId: parsed.options.get("scenario"),
    generationInput: {
      taskType,
      prompt: parsed.options.get("prompt") ?? parsed.positionals[0] ?? "stylized webtoon asset",
      negativePrompt: parsed.options.get("negative-prompt"),
      modelVersion: parsed.options.get("model"),
      faceLimit,
      quad: parsed.flags.has("quad") ? true : undefined,
      smartLowPoly: parsed.flags.has("smart-low-poly") ? true : undefined,
      generateParts: parsed.flags.has("generate-parts") ? true : undefined,
      texture: parsed.flags.has("no-texture") ? false : undefined,
      pbr: parsed.flags.has("no-pbr") ? false : undefined,
      delight: parsed.flags.has("delight") ? true : undefined,
      autoSize: parsed.flags.has("auto-size") ? true : undefined,
      textureQuality: parsed.options.get("texture-quality") as
        | "fast"
        | "standard"
        | "detailed"
        | "extreme"
        | undefined,
      geometryQuality: parsed.options.get("geometry-quality") as
        | "standard"
        | "detailed"
        | undefined,
      style: parsed.options.get("style"),
      poseControl: parsed.flags.has("pose-control")
        ? {
            enabled: true,
            poseType:
              (parsed.options.get("pose-type") as "T-Pose" | "A-Pose" | undefined) ??
              "T-Pose",
          }
        : undefined,
    },
    chainExpression: parsed.options.get("then"),
    rigType,
  });
}

export async function executeTripo3dCli(
  argv: readonly string[],
  deps: RunTripoCliDependencies = {},
): Promise<RunTripoCliResult> {
  const parsed = parseTripoCliArguments(argv);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleepMs =
    deps.sleepMs ??
    ((ms: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms)));

  const config = loadTripo3dConfig({
    explicitRegion: parsed.options.get("region"),
    explicitApiBase: parsed.options.get("api-base"),
    env: deps.env,
    cwd: deps.cwd,
    repoRoot: deps.repoRoot,
    homeDir: deps.homeDir,
  });

  if (parsed.flags.has("help") || parsed.command === "help") {
    return {
      exitCode: 0,
      output: {
        usage: "pnpm run tripo3d -- <command> [options]",
        commands: [
          "doctor [--check]",
          "balance",
          "catalog [--section all|models|chains|scenarios|errors|competitors]",
          "plan [--scenario <id>] [--prompt <text>] [--model <alias>] [--face-limit <n>] [--quad] [--delight] [--then <chain>] [--rig-type <type>]",
          "make [--scenario <id>] [--prompt <text>] [--image <url>] [--then <chain>] [--confirm]",
          "status <taskId>",
          "wait <taskId> [--timeout <ms>]",
        ],
      },
    };
  }

  if (parsed.command === "doctor" || parsed.command === "where") {
    return {
      exitCode: 0,
      output: {
        tool: "tripo3d",
        provider: "Tripo 3D V3 OpenAPI & Studio (studio.tripo3d.ai / openapi.tripo3d.ai)",
        mode: parsed.flags.has("check") ? "check" : "inspect",
        region: config.region,
        apiBase: config.apiBase,
        legacyV2Base: config.legacyV2Base,
        platformApiBase: config.platformApiBase,
        studioUrl: config.studioUrl,
        apiKeyConfigured: config.apiKeyConfigured,
        apiKeyMasked: config.apiKeyMasked,
        apiKeySource: config.apiKeySource,
        mcpAndTools: inspectTripo3dMcpAndTools(config),
        endpoints: TRIPO3D_GENERATION_ENDPOINTS,
        paidSubmissionRequiresConfirm: true,
      },
    };
  }

  if (parsed.command === "balance") {
    const apiKey = requireTripo3dApiKey(config);
    const { statusCode, payload, errorCatalogEntry } = await requestTripo3dJson(
      `${config.legacyV2Base}/user/balance`,
      { method: "GET", apiKey, region: config.region },
      fetchImpl,
    );
    return {
      exitCode:
        errorCatalogEntry?.exitCode ??
        (statusCode >= 200 && statusCode < 300 ? 0 : 1),
      output: {
        statusCode,
        region: config.region,
        apiKeySource: config.apiKeySource,
        ...payload,
        ...(errorCatalogEntry ? { errorCatalogEntry } : {}),
      },
    };
  }

  if (
    parsed.command === "catalog" ||
    parsed.command === "scenarios" ||
    parsed.command === "chains" ||
    parsed.command === "competitor-matrix"
  ) {
    const section =
      parsed.command === "scenarios"
        ? "scenarios"
        : parsed.command === "chains"
          ? "chains"
          : parsed.command === "competitor-matrix"
            ? "competitors"
            : (parsed.options.get("section") ?? "all");

    if (section === "models") {
      return {
        exitCode: 0,
        output: {
          wireModels: TRIPO3D_WIRE_MODELS,
          aliases: TRIPO3D_MODEL_ALIASES,
          imageModels: TRIPO3D_IMAGE_MODELS,
          imageTemplates: TRIPO3D_IMAGE_TEMPLATES,
          styles: TRIPO3D_MODEL_STYLES,
          postStyles: TRIPO3D_POST_STYLES,
        },
      };
    }
    if (section === "chains") {
      return {
        exitCode: 0,
        output: {
          chainSteps: TRIPO3D_CHAIN_STEPS,
          rigTypes: TRIPO3D_RIG_TYPES,
          rigSpecs: TRIPO3D_RIG_SPECS,
          rigVersions: TRIPO3D_RIG_VERSIONS,
          bipedAnimations: TRIPO3D_BIPED_ANIMATION_PRESETS,
          nonBipedAnimationMap: TRIPO3D_NON_BIPED_ANIMATION_MAP,
        },
      };
    }
    if (section === "scenarios") {
      return { exitCode: 0, output: { scenarios: TRIPO3D_SCENARIO_PRESETS } };
    }
    if (section === "errors") {
      return { exitCode: 0, output: { errorCatalog: TRIPO3D_ERROR_CATALOG } };
    }
    if (section === "competitors") {
      return {
        exitCode: 0,
        output: { competitorPlatforms: COMPETITOR_3D_PLATFORM_MATRIX },
      };
    }
    if (section === "ecosystem") {
      return {
        exitCode: 0,
        output: {
          studioWebWorkspaces: TRIPO3D_STUDIO_WEB_WORKSPACES,
          studioAssetFilters: TRIPO3D_STUDIO_ASSET_FILTERS,
          glbforgeProfiles: GLBFORGE_PERFORMANCE_PROFILES,
          glbforgeLintRules: GLBFORGE_LINT_RULES,
          glbforgeExtrudePresets: GLBFORGE_EXTRUDE_MATERIAL_PRESETS,
          rodinMcpTools: HYPER3D_RODIN_MCP_TOOLS,
          meshyCreativeLabProducts: MESHY_CREATIVE_LAB_PRODUCTS,
          meshyMultiColorSlicers: MESHY_MULTI_COLOR_SLICERS,
          vrmCameraPresets: VRM_CAMERA_FRAMING_PRESETS,
          blendAiScaleReferenceMeters: BLEND_AI_SCALE_REFERENCE_METERS,
          blendAiThreePointLightingRatio: BLEND_AI_THREE_POINT_LIGHTING_RATIO,
        },
      };
    }
    return {
      exitCode: 0,
      output: {
        wireModels: TRIPO3D_WIRE_MODELS,
        generationEndpoints: TRIPO3D_GENERATION_ENDPOINTS,
        chainSteps: TRIPO3D_CHAIN_STEPS,
        scenarios: TRIPO3D_SCENARIO_PRESETS,
        errorCatalog: TRIPO3D_ERROR_CATALOG,
        competitorPlatforms: COMPETITOR_3D_PLATFORM_MATRIX,
        studioWebWorkspaces: TRIPO3D_STUDIO_WEB_WORKSPACES,
      },
    };
  }

  if (parsed.command === "ecosystem") {
    return {
      exitCode: 0,
      output: {
        studioWebWorkspaces: TRIPO3D_STUDIO_WEB_WORKSPACES,
        studioAssetFilters: TRIPO3D_STUDIO_ASSET_FILTERS,
        glbforgeProfiles: GLBFORGE_PERFORMANCE_PROFILES,
        glbforgeLintRules: GLBFORGE_LINT_RULES,
        glbforgeExtrudePresets: GLBFORGE_EXTRUDE_MATERIAL_PRESETS,
        rodinMcpTools: HYPER3D_RODIN_MCP_TOOLS,
        meshyCreativeLabProducts: MESHY_CREATIVE_LAB_PRODUCTS,
        meshyMultiColorSlicers: MESHY_MULTI_COLOR_SLICERS,
        vrmCameraPresets: VRM_CAMERA_FRAMING_PRESETS,
        blendAiScaleReferenceMeters: BLEND_AI_SCALE_REFERENCE_METERS,
        blendAiThreePointLightingRatio: BLEND_AI_THREE_POINT_LIGHTING_RATIO,
      },
    };
  }

  if (parsed.command === "lint-glb") {
    const profile = (parsed.options.get("profile") ?? "mobile-hero") as GlbForgePerformanceBudget["id"];
    const report = auditGlbAssetAgainstProfile({
      profile,
      triangles: Number.parseInt(parsed.options.get("triangles") ?? "12000", 10),
      vertices: Number.parseInt(parsed.options.get("vertices") ?? "8000", 10),
      drawCalls: Number.parseInt(parsed.options.get("draw-calls") ?? "2", 10),
      materials: Number.parseInt(parsed.options.get("materials") ?? "2", 10),
      fileBytes: Number.parseInt(parsed.options.get("file-bytes") ?? "1500000", 10),
      maxTextureDimension: Number.parseInt(parsed.options.get("texture-size") ?? "1024", 10),
      textureBytesTotal: Number.parseInt(parsed.options.get("texture-bytes") ?? "800000", 10),
      nonManifoldEdges: Number.parseInt(parsed.options.get("non-manifold") ?? "0", 10),
    });
    return { exitCode: report.passed ? 0 : 2, output: { ...report } };
  }

  if (parsed.command === "extrude-plan") {
    const preset = (parsed.options.get("preset") ?? "enamel") as GlbForgeExtrudeMaterialPresetId;
    const mode = (parsed.options.get("mode") ?? "alpha") as "alpha" | "luma";
    const plan = plan2dTo3dReliefExtrusion({
      preset,
      mode,
      depthCm: parsed.options.has("depth-cm") ? Number(parsed.options.get("depth-cm")) : undefined,
      bevelCm: parsed.options.has("bevel-cm") ? Number(parsed.options.get("bevel-cm")) : undefined,
      layers: parsed.options.has("layers") ? Number(parsed.options.get("layers")) : undefined,
      pillowCm: parsed.options.has("pillow-cm") ? Number(parsed.options.get("pillow-cm")) : undefined,
      embossCm: parsed.options.has("emboss-cm") ? Number(parsed.options.get("emboss-cm")) : undefined,
    });
    return { exitCode: 0, output: { ...plan } };
  }

  if (parsed.command === "validate-vrm") {
    const specVersion = (parsed.options.get("spec") ?? "1.0") as "0.x" | "1.0";
    const defaultBones = specVersion === "1.0" ? VRM1_REQUIRED_BONES : VRM0_REQUIRED_BONES;
    const missingRaw = parsed.options.get("missing-bones");
    const missingSet = new Set(missingRaw ? missingRaw.split(",").map((s) => s.trim()) : []);
    const presentBones = defaultBones.filter((b) => !missingSet.has(b));
    const report = validateVrmAssetSummary({
      specVersion,
      presentBones,
      triangleCount: Number.parseInt(parsed.options.get("triangles") ?? "18000", 10),
      fileSizeBytes: Number.parseInt(parsed.options.get("file-bytes") ?? "4500000", 10),
      maxTextureSize: Number.parseInt(parsed.options.get("texture-size") ?? "2048", 10),
      materialCount: Number.parseInt(parsed.options.get("materials") ?? "6", 10),
    });
    return { exitCode: report.valid ? 0 : 2, output: { ...report } };
  }

  if (parsed.command === "bang-plan") {
    const report = planRodinBangDecomposition({
      assetId: parsed.options.get("asset-id"),
      instruction: parsed.options.get("instruction"),
      strength: parsed.options.has("strength") ? Number(parsed.options.get("strength")) : undefined,
      explodeStrength: parsed.options.has("explode-strength")
        ? Number(parsed.options.get("explode-strength"))
        : undefined,
      resolution: (parsed.options.get("resolution") as "Basic" | "High" | undefined) ?? "High",
    });
    return { exitCode: 0, output: { ...report } };
  }

  if (parsed.command === "plan") {
    const planCard = buildPlanFromParsedArgs(parsed);
    return {
      exitCode: planCard.readyToExecute ? 0 : 2,
      output: {
        dryRunPlanCard: true,
        ...planCard,
      },
    };
  }

  if (parsed.command === "make" || parsed.command === "generate") {
    const planCard = buildPlanFromParsedArgs(parsed);
    if (!planCard.readyToExecute) {
      return {
        exitCode: 2,
        output: {
          error: "체인 또는 파라미터 유효성 검증에 실패했습니다.",
          planCard,
        },
      };
    }

    const url = `${config.apiBase}${planCard.generationPlan.endpoint}`;
    if (!parsed.flags.has("confirm") || parsed.flags.has("dry-run")) {
      return {
        exitCode: 0,
        output: {
          dryRun: true,
          method: "POST",
          url,
          body: planCard.generationPlan.requestBody,
          chainSteps: planCard.chainValidation.normalizedSteps,
          estimatedCredits: planCard.totalEstimatedCredits,
          estimatedUsd: planCard.totalEstimatedUsd,
          apiKeyConfigured: config.apiKeyConfigured,
          note: "유료 크레딧 보호를 위해 기본 동작은 dry-run입니다. 실제 생성 요청은 --confirm 플래그를 추가하세요.",
        },
      };
    }

    const apiKey = requireTripo3dApiKey(config);
    const { statusCode, payload, errorCatalogEntry } = await requestTripo3dJson(
      url,
      {
        method: "POST",
        apiKey,
        region: config.region,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planCard.generationPlan.requestBody),
      },
      fetchImpl,
    );
    return {
      exitCode:
        errorCatalogEntry?.exitCode ??
        (statusCode >= 200 && statusCode < 300 ? 0 : 1),
      output: {
        statusCode,
        planCard,
        ...payload,
        ...(errorCatalogEntry ? { errorCatalogEntry } : {}),
      },
    };
  }

  if (parsed.command === "status") {
    const taskId = parsed.positionals[0] ?? parsed.options.get("task-id");
    if (!taskId) {
      throw new Error("조회할 taskId를 지정하세요. 예: pnpm run tripo3d -- status <taskId>");
    }
    const apiKey = requireTripo3dApiKey(config);
    const { statusCode, payload, errorCatalogEntry } = await requestTripo3dJson(
      `${config.legacyV2Base}/task/${taskId}`,
      { method: "GET", apiKey, region: config.region },
      fetchImpl,
    );
    return {
      exitCode:
        errorCatalogEntry?.exitCode ??
        (statusCode >= 200 && statusCode < 300 ? 0 : 1),
      output: {
        statusCode,
        ...payload,
        ...(errorCatalogEntry ? { errorCatalogEntry } : {}),
      },
    };
  }

  if (parsed.command === "wait") {
    const taskId = parsed.positionals[0] ?? parsed.options.get("task-id");
    if (!taskId) {
      throw new Error("대기할 taskId를 지정하세요. 예: pnpm run tripo3d -- wait <taskId>");
    }
    const apiKey = requireTripo3dApiKey(config);
    const timeoutMs = Math.max(
      2000,
      Number.parseInt(parsed.options.get("timeout") ?? "600000", 10) || 600_000,
    );
    const deadline = Date.now() + timeoutMs;
    let currentBackoffMs = 2000;

    for (;;) {
      const { statusCode, payload, errorCatalogEntry } = await requestTripo3dJson(
        `${config.legacyV2Base}/task/${taskId}`,
        { method: "GET", apiKey, region: config.region },
        fetchImpl,
      );
      const taskData =
        payload.data && typeof payload.data === "object"
          ? (payload.data as Record<string, unknown>)
          : payload;
      const status = String(taskData.status ?? "").toLowerCase();
      if (
        statusCode >= 400 ||
        status === "success" ||
        status === "failed" ||
        status === "cancelled" ||
        status === "banned" ||
        status === "expired"
      ) {
        return {
          exitCode:
            status === "success"
              ? 0
              : (errorCatalogEntry?.exitCode ?? 6),
          output: { statusCode, ...payload },
        };
      }
      if (Date.now() >= deadline) {
        throw new Error(`Tripo 태스크 완료 대기 시간이 초과되었습니다 (${timeoutMs}ms): ${taskId}`);
      }
      const runningLeftTime =
        typeof taskData.running_left_time === "number"
          ? taskData.running_left_time
          : undefined;
      currentBackoffMs = computeTripo3dAdaptivePollIntervalMs(
        runningLeftTime,
        currentBackoffMs,
      );
      await sleepMs(currentBackoffMs);
    }
  }

  throw new Error(
    `알 수 없는 명령입니다: ${parsed.command}. 도움말은 pnpm run tripo3d -- --help 로 확인하세요.`,
  );
}

async function main(): Promise<void> {
  try {
    const result = await executeTripo3dCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main();
}
