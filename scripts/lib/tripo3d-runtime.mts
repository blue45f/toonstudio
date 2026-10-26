/**
 * Tripo 3D V3 CLI 및 MCP 런타임 헬퍼.
 * - 환경변수/.env.infrastructure.local/~/.tripo/config.json 자격증명 해석 (비밀값 출력 금지)
 * - Dual/Triple Model 자동 라우팅 (v3.1-20260211 / P1-20260311 / P2-20260801)
 * - 파라미터 연동 검증 (Hard/Soft Linkage) 및 12단계 체인(Chain) 유효성 검증
 * - Pre-Run Plan Card & 크레딧/ETA 산출기, Adaptive Polling 스케줄러
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRIPO3D_API_KEY_NAMES,
  TRIPO3D_BIPED_ANIMATION_PRESETS,
  TRIPO3D_CHAIN_STEPS,
  TRIPO3D_ERROR_CATALOG,
  TRIPO3D_LOW_POLY_PATTERNS,
  TRIPO3D_MODEL_ALIASES,
  TRIPO3D_NON_BIPED_ANIMATION_MAP,
  TRIPO3D_REGIONS,
  TRIPO3D_RIG_SPECS,
  TRIPO3D_RIG_VERSIONS,
  TRIPO3D_SCENARIO_PRESETS,
  TRIPO3D_WIRE_MODELS,
  type Tripo3dRegionId,
  type Tripo3dRigSpec,
  type Tripo3dRigType,
  type Tripo3dWireModel,
} from "./tripo3d-catalog.mts";
import { parseEnvFile } from "./varco3d-runtime.mts";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface Tripo3dResolvedConfig {
  readonly region: Tripo3dRegionId;
  readonly apiBase: string;
  readonly legacyV2Base: string;
  readonly platformApiBase: string;
  readonly studioUrl: string;
  readonly apiKey: string;
  readonly apiKeyConfigured: boolean;
  readonly apiKeyMasked: string;
  readonly apiKeySource: string;
  readonly repoRoot: string;
  readonly homeDir: string;
}

export interface LoadTripo3dConfigOptions {
  readonly explicitRegion?: string;
  readonly explicitApiBase?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly repoRoot?: string;
  readonly homeDir?: string;
}

export function maskTripoApiKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (!trimmed) return "missing";
  if (trimmed.length <= 12) return `${trimmed.slice(0, 4)}…`;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

export function loadTripo3dConfig(
  options: LoadTripo3dConfigOptions = {},
): Tripo3dResolvedConfig {
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();

  const rawRegion = (options.explicitRegion ?? env.TRIPO_REGION ?? "ov").trim().toLowerCase();
  const region: Tripo3dRegionId = rawRegion === "cn" ? "cn" : "ov";
  const regionMeta = TRIPO3D_REGIONS[region];
  const apiBase = (options.explicitApiBase ?? env.TRIPO_API_BASE ?? regionMeta.apiBase).replace(/\/+$/u, "");
  const baseFields = {
    region,
    apiBase,
    legacyV2Base: regionMeta.legacyV2Base,
    platformApiBase: regionMeta.platformApiBase,
    studioUrl: regionMeta.studioUrl,
    repoRoot,
    homeDir,
  };

  for (const keyName of TRIPO3D_API_KEY_NAMES) {
    const fromEnv = env[keyName]?.trim();
    if (fromEnv && fromEnv.startsWith("tsk_")) {
      return {
        ...baseFields,
        apiKey: fromEnv,
        apiKeyConfigured: true,
        apiKeyMasked: maskTripoApiKey(fromEnv),
        apiKeySource: `env:${keyName}`,
      };
    }
  }

  const candidateEnvFiles = new Set([
    resolve(cwd, ".env.infrastructure.local"),
    resolve(cwd, ".env.local"),
    resolve(repoRoot, ".env.infrastructure.local"),
    resolve(repoRoot, ".env.local"),
    resolve(homeDir, "WebstormProjects/toonstudio/.env.infrastructure.local"),
    resolve(homeDir, "WebstormProjects/toonstudio/.env.local"),
    resolve(homeDir, ".config/tripo3d/credentials.env"),
  ]);

  for (const filePath of candidateEnvFiles) {
    const parsed = parseEnvFile(filePath);
    for (const keyName of TRIPO3D_API_KEY_NAMES) {
      const val = parsed[keyName]?.trim();
      if (val && val.startsWith("tsk_")) {
        return {
          ...baseFields,
          apiKey: val,
          apiKeyConfigured: true,
          apiKeyMasked: maskTripoApiKey(val),
          apiKeySource: `file:${basename(filePath)}:${keyName}`,
        };
      }
    }
  }

  const tripoCliConfigPath = resolve(homeDir, ".tripo/config.json");
  if (existsSync(tripoCliConfigPath)) {
    try {
      const parsed = JSON.parse(readFileSync(tripoCliConfigPath, "utf8")) as {
        apiKey?: string;
        api_key?: string;
        region?: string;
      };
      const key = (parsed.apiKey ?? parsed.api_key)?.trim();
      if (key && key.startsWith("tsk_")) {
        const resolvedRegion: Tripo3dRegionId =
          !options.explicitRegion && parsed.region?.toLowerCase() === "cn" ? "cn" : region;
        const meta = TRIPO3D_REGIONS[resolvedRegion];
        return {
          ...baseFields,
          region: resolvedRegion,
          apiBase: options.explicitApiBase ?? meta.apiBase,
          legacyV2Base: meta.legacyV2Base,
          platformApiBase: meta.platformApiBase,
          studioUrl: meta.studioUrl,
          apiKey: key,
          apiKeyConfigured: true,
          apiKeyMasked: maskTripoApiKey(key),
          apiKeySource: "file:.tripo/config.json",
        };
      }
    } catch {
      // ignore malformed ~/.tripo/config.json
    }
  }

  return { ...baseFields, apiKey: "", apiKeyConfigured: false, apiKeyMasked: "missing", apiKeySource: "missing" };
}

export function requireTripo3dApiKey(config: Tripo3dResolvedConfig): string {
  if (!config.apiKeyConfigured || !config.apiKey.startsWith("tsk_")) {
    throw new Error("TRIPO_API_KEY(tsk_...)가 설정되어 있지 않습니다. .env.infrastructure.local 또는 ~/.tripo/config.json을 확인하세요.");
  }
  return config.apiKey;
}

export function inspectTripo3dMcpAndTools(config: Tripo3dResolvedConfig): Record<string, unknown> {
  const globalTripoCli = "/Users/hjunkim/.nvm/versions/node/v24.22.1/bin/tripo";
  const localTripoWrapper = resolve(config.homeDir, ".local/bin/toonspectrum-tripo");
  const localTripoCliMcp = resolve(config.homeDir, ".local/bin/toonspectrum-tripo-cli-mcp");
  const localTripoBlenderMcp = resolve(config.homeDir, ".local/bin/toonspectrum-tripo-mcp");
  const blenderAddonInit = resolve(
    config.homeDir,
    "Library/Application Support/Blender/5.2/scripts/addons/tripo_3d/__init__.py",
  );
  const claudeDesktopPath = resolve(
    config.homeDir,
    "Library/Application Support/Claude/claude_desktop_config.json",
  );
  const cursorMcpPath = resolve(config.homeDir, ".cursor/mcp.json");
  const geminiSettingsPath = resolve(config.homeDir, ".gemini/settings.json");

  const hasMcpServer = (filePath: string, serverKey: string): boolean => {
    if (!existsSync(filePath)) return false;
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { mcpServers?: Record<string, unknown> };
      return Boolean(parsed.mcpServers && serverKey in parsed.mcpServers);
    } catch {
      return false;
    }
  };

  return {
    binaries: {
      globalTripoCli: { path: globalTripoCli, installed: existsSync(globalTripoCli) },
      localTripoWrapper: { path: localTripoWrapper, installed: existsSync(localTripoWrapper) },
      localTripoCliMcp: { path: localTripoCliMcp, installed: existsSync(localTripoCliMcp) },
      localTripoBlenderMcp: { path: localTripoBlenderMcp, installed: existsSync(localTripoBlenderMcp) },
      blenderAddon: { path: blenderAddonInit, installed: existsSync(blenderAddonInit), tcpPort: 9876 },
    },
    mcpRegistrations: {
      claudeDesktop: {
        path: claudeDesktopPath,
        tripoCliRegistered: hasMcpServer(claudeDesktopPath, "tripo-cli"),
        tripo3dBlenderRegistered: hasMcpServer(claudeDesktopPath, "tripo3d"),
      },
      cursor: {
        path: cursorMcpPath,
        tripoCliRegistered: hasMcpServer(cursorMcpPath, "tripo-cli"),
        tripo3dBlenderRegistered: hasMcpServer(cursorMcpPath, "tripo3d"),
      },
      geminiCli: {
        path: geminiSettingsPath,
        tripoCliRegistered: hasMcpServer(geminiSettingsPath, "tripo-cli"),
        tripo3dBlenderRegistered: hasMcpServer(geminiSettingsPath, "tripo3d"),
      },
    },
  };
}

export interface Tripo3dPoseControlInput {
  readonly enabled: boolean;
  readonly poseType?: "T-Pose" | "A-Pose";
  readonly headBodyHeightRatio?: number;
  readonly headBodyWidthRatio?: number;
  readonly legsBodyHeightRatio?: number;
  readonly armsBodyLengthRatio?: number;
  readonly spanOfLegs?: number;
}

export function formatTripo3dPoseControlPromptSuffix(pose: Tripo3dPoseControlInput): string {
  if (!pose.enabled) return "";
  const poseType = (pose.poseType ?? "T-Pose").toLowerCase();
  const hHeight = (pose.headBodyHeightRatio ?? 1.0).toFixed(1);
  const hWidth = (pose.headBodyWidthRatio ?? 1.0).toFixed(1);
  const lHeight = (pose.legsBodyHeightRatio ?? 1.0).toFixed(1);
  const aLength = (pose.armsBodyLengthRatio ?? 1.0).toFixed(1);
  const span = (pose.spanOfLegs ?? 9.0).toFixed(1);
  return `, ${poseType}:${hHeight}:${hWidth}:${lHeight}:${aLength}:${span}`;
}

export function detectTripo3dLowPolyIntent(prompt?: string): boolean {
  if (!prompt) return false;
  return TRIPO3D_LOW_POLY_PATTERNS.some((pattern) => pattern.test(prompt));
}

export interface Tripo3dGenerationInput {
  readonly taskType?: "text_to_model" | "image_to_model" | "multiview_to_model" | "image_to_splat";
  readonly prompt?: string;
  readonly negativePrompt?: string;
  readonly modelVersion?: string;
  readonly faceLimit?: number;
  readonly quad?: boolean;
  readonly smartLowPoly?: boolean;
  readonly generateParts?: boolean;
  readonly texture?: boolean;
  readonly pbr?: boolean;
  readonly textureQuality?: "fast" | "standard" | "detailed" | "extreme";
  readonly geometryQuality?: "standard" | "detailed";
  readonly delight?: boolean;
  readonly autoSize?: boolean;
  readonly style?: string;
  readonly poseControl?: Tripo3dPoseControlInput;
}

export interface Tripo3dValidatedGenerationPlan {
  readonly wireModel: Tripo3dWireModel;
  readonly modelSelectionReasonKo: string;
  readonly endpoint: string;
  readonly requestBody: Record<string, unknown>;
  readonly strippedFields: readonly string[];
  readonly warningsKo: readonly string[];
  readonly estimatedCredits: number;
  readonly estimatedSeconds: number;
}

export function resolveTripo3dModelAndValidateParams(
  input: Tripo3dGenerationInput,
): Tripo3dValidatedGenerationPlan {
  const warningsKo: string[] = [];
  const strippedFields: string[] = [];
  const taskType = input.taskType ?? "text_to_model";

  let wireModel: Tripo3dWireModel = TRIPO3D_WIRE_MODELS.V31;
  let modelSelectionReasonKo = "기본 고품질 모델(v3.1-20260211) 선택";

  if (input.modelVersion) {
    const aliasResolved =
      TRIPO3D_MODEL_ALIASES[input.modelVersion.trim()] ??
      TRIPO3D_MODEL_ALIASES[input.modelVersion.trim().toLowerCase()];
    if (!aliasResolved) {
      throw new Error(
        `지원하지 않는 Tripo 모델 버전입니다 (${input.modelVersion}). 지원 모델: tripo-v3.1, tripo-p1, tripo-p2, v3.0, v2.5`,
      );
    }
    wireModel = aliasResolved;
    modelSelectionReasonKo = `사용자 명시 모델(${wireModel}) 적용`;
  } else {
    const lowPolyPrompt = detectTripo3dLowPolyIntent(input.prompt);
    const lowFaceLimit =
      typeof input.faceLimit === "number" && input.faceLimit <= 20000;
    if (lowPolyPrompt || lowFaceLimit) {
      if (input.quad) {
        wireModel = TRIPO3D_WIRE_MODELS.P2;
        modelSelectionReasonKo =
          "로우폴리 의도 + Quad 토폴로지 요청 감지 → P2-20260801 자동 라우팅";
      } else {
        wireModel = TRIPO3D_WIRE_MODELS.P1;
        modelSelectionReasonKo = lowPolyPrompt
          ? "프롬프트 내 로우폴리/복셀 키워드 감지 → P1-20260311 네이티브 로우폴리 자동 라우팅"
          : `face_limit(${input.faceLimit}) <= 20000 감지 → P1-20260311 네이티브 로우폴리 자동 라우팅`;
      }
    }
  }

  let quad = Boolean(input.quad);
  let smartLowPoly = Boolean(input.smartLowPoly);
  let generateParts = Boolean(input.generateParts);
  const geometryQuality = input.geometryQuality ?? "standard";
  const texture = input.texture ?? true;
  let pbr = input.pbr ?? true;
  const textureQuality = input.textureQuality ?? "standard";
  const delight = Boolean(input.delight);

  if (wireModel === TRIPO3D_WIRE_MODELS.P1) {
    if (quad) {
      quad = false;
      strippedFields.push("quad");
      warningsKo.push(
        "P1-20260311 모델은 Triangle 전용이므로 quad 옵션이 자동 제거되었습니다 (Quad 로우폴리는 P2 모델을 사용하세요).",
      );
    }
    if (smartLowPoly) {
      smartLowPoly = false;
      strippedFields.push("smart_low_poly");
    }
    if (generateParts) {
      generateParts = false;
      strippedFields.push("generate_parts");
    }
    if (input.geometryQuality) strippedFields.push("geometry_quality");
    if (typeof input.faceLimit === "number" && (input.faceLimit < 50 || input.faceLimit > 20000)) {
      throw new Error(`P1-20260311 모델의 face_limit(${input.faceLimit})은 50 이상 20000 이하여야 합니다.`);
    }
  } else if (wireModel === TRIPO3D_WIRE_MODELS.P2) {
    if (smartLowPoly) {
      smartLowPoly = false;
      strippedFields.push("smart_low_poly");
    }
    if (generateParts) {
      generateParts = false;
      strippedFields.push("generate_parts");
    }
    if (input.geometryQuality) strippedFields.push("geometry_quality");
    const maxP2Faces = quad ? 25000 : 50000;
    if (typeof input.faceLimit === "number" && (input.faceLimit < 48 || input.faceLimit > maxP2Faces)) {
      throw new Error(
        `P2-20260801 모델(${quad ? "quad" : "tri"})의 face_limit(${input.faceLimit})은 48 이상 ${maxP2Faces} 이하여야 합니다.`,
      );
    }
  } else {
    const maxV3Faces = quad ? 150000 : 2000000;
    if (typeof input.faceLimit === "number" && (input.faceLimit < 1000 || input.faceLimit > maxV3Faces)) {
      throw new Error(
        `${wireModel} 모델(${quad ? "quad" : "tri"})의 face_limit(${input.faceLimit})은 1000 이상 ${maxV3Faces} 이하여야 합니다.`,
      );
    }
  }

  if (!texture && pbr) {
    pbr = false;
    warningsKo.push(
      "texture=false 설정 시 pbr=true를 함께 사용할 수 없어 pbr=false로 자동 보정되었습니다.",
    );
  }

  if (generateParts && (texture || pbr || quad)) {
    pbr = false;
    quad = false;
    warningsKo.push(
      "generate_parts=true 활성화 시 호환성 규칙에 따라 quad=false, pbr=false로 자동 조정되었습니다.",
    );
  }

  if (textureQuality === "fast" || delight) {
    warningsKo.push(
      "texture_quality='fast' 또는 delight=true는 Texture v3.5(v3.5-20260815) 파이프라인과 연동됩니다.",
    );
  }

  let finalPrompt = (input.prompt ?? "").trim();
  if (taskType === "text_to_model" && input.poseControl?.enabled) {
    finalPrompt += formatTripo3dPoseControlPromptSuffix(input.poseControl);
  }

  const requestBody: Record<string, unknown> = {
    type: taskType,
    model_version: wireModel,
    texture,
    pbr,
  };
  if (taskType === "text_to_model") {
    requestBody.prompt = finalPrompt;
    if (input.negativePrompt?.trim()) requestBody.negative_prompt = input.negativePrompt.trim();
  }
  if (typeof input.faceLimit === "number") requestBody.face_limit = input.faceLimit;
  if (quad) requestBody.quad = true;
  if (smartLowPoly) requestBody.smart_low_poly = true;
  if (generateParts) requestBody.generate_parts = true;
  if (wireModel !== TRIPO3D_WIRE_MODELS.P1 && wireModel !== TRIPO3D_WIRE_MODELS.P2) {
    requestBody.geometry_quality = geometryQuality;
  }
  if (texture) requestBody.texture_quality = textureQuality;
  if (delight) requestBody.delight = true;
  if (input.autoSize) requestBody.auto_size = true;
  if (input.style && input.style !== "original") requestBody.style = input.style;

  let estimatedCredits = taskType === "text_to_model" ? 10 : 20;
  if (texture || pbr) estimatedCredits += 10;
  if (textureQuality === "detailed" || textureQuality === "extreme") estimatedCredits += 10;
  if (wireModel === TRIPO3D_WIRE_MODELS.V31 && geometryQuality === "detailed") estimatedCredits += 20;
  if (quad) estimatedCredits += 5;
  if (generateParts) estimatedCredits += 15;

  const estimatedSeconds =
    wireModel === TRIPO3D_WIRE_MODELS.P1 ? 12 : geometryQuality === "detailed" ? 45 : 25;
  const endpointMap: Record<string, string> = {
    text_to_model: "/v3/generation/text-to-model",
    image_to_model: "/v3/generation/image-to-model",
    multiview_to_model: "/v3/generation/multiview-to-model",
    image_to_splat: "/v3/generation/image-to-splat",
  };

  return {
    wireModel,
    modelSelectionReasonKo,
    endpoint: endpointMap[taskType] ?? "/v3/generation/text-to-model",
    requestBody,
    strippedFields,
    warningsKo,
    estimatedCredits,
    estimatedSeconds,
  };
}

export interface ParsedTripo3dChainStep {
  readonly step: string;
  readonly taskType: string;
  readonly endpoint: string;
  readonly params: Record<string, string | number | boolean | readonly string[]>;
}

/**
 * `--then "rig-check,rig:model_version=v3.0,retarget:animations=preset:idle|preset:walk"` 파서
 */
export function parseTripo3dChainExpression(
  expression: string,
): readonly ParsedTripo3dChainStep[] {
  const trimmed = expression.trim();
  if (!trimmed) return [];
  const rawSteps = trimmed
    .split(";")
    .flatMap((token) => {
      // step 이름 뒤의 `:key=val,key2=val2`와 다음 `,stepName`을 구분
      const parts: string[] = [];
      let buffer = "";
      for (const piece of token.split(",")) {
        const pieceTrimmed = piece.trim();
        if (!pieceTrimmed) continue;
        const stepCandidate = pieceTrimmed.split(":")[0]!.trim();
        if (stepCandidate in TRIPO3D_CHAIN_STEPS && buffer) {
          parts.push(buffer);
          buffer = pieceTrimmed;
        } else if (buffer) {
          buffer += `,${pieceTrimmed}`;
        } else {
          buffer = pieceTrimmed;
        }
      }
      if (buffer) parts.push(buffer);
      return parts;
    });

  return rawSteps.map((raw) => {
    const colonIdx = raw.indexOf(":");
    const stepName = (colonIdx >= 0 ? raw.slice(0, colonIdx) : raw).trim();
    const def = TRIPO3D_CHAIN_STEPS[stepName];
    if (!def) {
      throw new Error(
        `지원하지 않는 Tripo 체인 단계입니다 (${stepName}). 허용 단계: ${Object.keys(TRIPO3D_CHAIN_STEPS).join(", ")}`,
      );
    }
    const params: Record<string, string | number | boolean | readonly string[]> = {};
    if (colonIdx >= 0) {
      const kvPart = raw.slice(colonIdx + 1).trim();
      for (const pair of kvPart.split(",")) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx <= 0) continue;
        const k = pair.slice(0, eqIdx).trim();
        const v = pair.slice(eqIdx + 1).trim();
        if (v === "true") params[k] = true;
        else if (v === "false") params[k] = false;
        else if (v.includes("|")) params[k] = v.split("|").map((s) => s.trim());
        else if (/^-?\d+(\.\d+)?$/u.test(v)) params[k] = Number(v);
        else params[k] = v;
      }
    }
    return {
      step: stepName,
      taskType: def.taskType,
      endpoint: def.endpoint,
      params,
    };
  });
}

export interface Tripo3dChainValidationResult {
  readonly valid: boolean;
  readonly normalizedSteps: readonly ParsedTripo3dChainStep[];
  readonly errorsKo: readonly string[];
  readonly warningsKo: readonly string[];
  readonly estimatedChainCredits: number;
}

export function validateTripo3dChain(
  steps: readonly ParsedTripo3dChainStep[],
  initialTaskType = "text_to_model",
  rigType: Tripo3dRigType = "biped",
): Tripo3dChainValidationResult {
  const errorsKo: string[] = [];
  const warningsKo: string[] = [];
  const normalizedSteps: ParsedTripo3dChainStep[] = [];
  let currentUpstreamType = initialTaskType;
  let estimatedChainCredits = 0;

  for (const stepItem of steps) {
    const def = TRIPO3D_CHAIN_STEPS[stepItem.step];
    if (!def) {
      errorsKo.push(`알 수 없는 체인 단계: ${stepItem.step}`);
      continue;
    }

    if (
      Array.isArray(def.acceptedUpstreamTypes) &&
      def.acceptedUpstreamTypes.length > 0 &&
      !def.acceptedUpstreamTypes.includes(currentUpstreamType)
    ) {
      errorsKo.push(
        `'${stepItem.step}'(${def.taskType}) 단계는 선행 태스크가 [${def.acceptedUpstreamTypes.join(", ")}]이어야 하지만 현재 선행 태스크는 '${currentUpstreamType}'입니다.`,
      );
    }

    const clonedParams = { ...stepItem.params };

    if (stepItem.step === "rig") {
      const spec = String(clonedParams.spec ?? "tripo") as Tripo3dRigSpec;
      if (!TRIPO3D_RIG_SPECS.includes(spec)) {
        errorsKo.push(
          `지원하지 않는 rig spec(${spec})입니다. 허용값: ${TRIPO3D_RIG_SPECS.join(", ")}`,
        );
      }
      const verKey = String(clonedParams.model_version ?? "v3.0");
      if (verKey in TRIPO3D_RIG_VERSIONS) {
        clonedParams.model_version =
          TRIPO3D_RIG_VERSIONS[verKey as keyof typeof TRIPO3D_RIG_VERSIONS];
      }
      clonedParams.rig_type = clonedParams.rig_type ?? rigType;
      estimatedChainCredits += 15;
    } else if (stepItem.step === "retarget") {
      if (rigType === "avian" || rigType === "others") {
        warningsKo.push(
          `체형('${rigType}')은 공식 프리셋 리타게팅을 지원하지 않아 retarget 단계가 자동 생략됩니다.`,
        );
        continue;
      }
      const rawAnims = clonedParams.animations ?? clonedParams.animation ?? ["preset:idle"];
      const animList = Array.isArray(rawAnims) ? [...rawAnims] : [String(rawAnims)];
      if (animList.length > 5) {
        errorsKo.push(
          `retarget 단계는 태스크당 최대 5개의 애니메이션만 허용합니다 (현재 ${animList.length}개).`,
        );
      }
      if (rigType !== "biped" && rigType in TRIPO3D_NON_BIPED_ANIMATION_MAP) {
        const replacement =
          TRIPO3D_NON_BIPED_ANIMATION_MAP[
            rigType as keyof typeof TRIPO3D_NON_BIPED_ANIMATION_MAP
          ];
        const hasBipedOnly = animList.some((a) =>
          (TRIPO3D_BIPED_ANIMATION_PRESETS as readonly string[]).includes(a),
        );
        if (hasBipedOnly) {
          clonedParams.animations = [replacement];
          warningsKo.push(
            `비인간형 체형('${rigType}') 감지 → 인체용 모션 프리셋을 '${replacement}'로 자동 치환했습니다.`,
          );
        }
      }
      estimatedChainCredits += 10 * Math.min(animList.length, 5);
    } else if (stepItem.step === "decimate") {
      if (clonedParams.smart_uv === true && clonedParams.model_version !== "v3.0") {
        clonedParams.model_version = "v3.0";
        warningsKo.push(
          "decimate에서 smart_uv=true 사용 시 model_version='v3.0'이 필수여서 자동 승격되었습니다.",
        );
      }
      estimatedChainCredits += 10;
    } else if (stepItem.step === "texture") {
      if (
        clonedParams.delight === true ||
        clonedParams.texture_quality === "fast"
      ) {
        clonedParams.model_version = TRIPO3D_WIRE_MODELS.TEXTURE_V35;
      }
      estimatedChainCredits += 10;
    } else if (stepItem.step === "rig-check") {
      estimatedChainCredits += 0;
    } else {
      estimatedChainCredits += 10;
    }

    normalizedSteps.push({
      ...stepItem,
      params: clonedParams,
    });

    if (!def.passthrough) {
      currentUpstreamType = def.taskType;
    }
  }

  return {
    valid: errorsKo.length === 0,
    normalizedSteps,
    errorsKo,
    warningsKo,
    estimatedChainCredits,
  };
}

export function computeTripo3dAdaptivePollIntervalMs(
  runningLeftTimeSec: number | undefined | null,
  currentBackoffMs = 2000,
): number {
  if (typeof runningLeftTimeSec === "number" && runningLeftTimeSec > 0) {
    return Math.max(2000, Math.round(runningLeftTimeSec * 500));
  }
  return Math.min(Math.round(currentBackoffMs * 1.5), 30000);
}

export interface Tripo3dPlanCard {
  readonly scenarioId: string | null;
  readonly generationPlan: Tripo3dValidatedGenerationPlan;
  readonly chainValidation: Tripo3dChainValidationResult;
  readonly totalEstimatedCredits: number;
  readonly totalEstimatedUsd: number;
  readonly readyToExecute: boolean;
}

export function buildTripo3dPlanCard(options: {
  readonly scenarioId?: string;
  readonly generationInput: Tripo3dGenerationInput;
  readonly chainExpression?: string;
  readonly rigType?: Tripo3dRigType;
}): Tripo3dPlanCard {
  const scenario = options.scenarioId
    ? TRIPO3D_SCENARIO_PRESETS[options.scenarioId]
    : undefined;
  if (options.scenarioId && !scenario) {
    throw new Error(
      `알 수 없는 시나리오 프리셋입니다 (${options.scenarioId}). 허용 프리셋: ${Object.keys(TRIPO3D_SCENARIO_PRESETS).join(", ")}`,
    );
  }

  const mergedGenInput: Tripo3dGenerationInput = {
    ...(scenario
      ? {
          modelVersion: String(scenario.generationDefaults.model_version ?? ""),
          faceLimit:
            typeof scenario.generationDefaults.face_limit === "number"
              ? scenario.generationDefaults.face_limit
              : undefined,
          quad: Boolean(scenario.generationDefaults.quad),
          generateParts: Boolean(scenario.generationDefaults.generate_parts),
          texture:
            typeof scenario.generationDefaults.texture === "boolean"
              ? scenario.generationDefaults.texture
              : true,
          pbr:
            typeof scenario.generationDefaults.pbr === "boolean"
              ? scenario.generationDefaults.pbr
              : true,
          geometryQuality:
            (scenario.generationDefaults.geometry_quality as "standard" | "detailed" | undefined) ??
            "standard",
          textureQuality:
            (scenario.generationDefaults.texture_quality as
              | "fast"
              | "standard"
              | "detailed"
              | "extreme"
              | undefined) ?? "standard",
          autoSize: Boolean(scenario.generationDefaults.auto_size),
        }
      : {}),
    ...Object.fromEntries(Object.entries(options.generationInput).filter(([, v]) => v !== undefined)),
  };

  const generationPlan = resolveTripo3dModelAndValidateParams(mergedGenInput);
  const effectiveChainExpr = options.chainExpression ?? (scenario ? scenario.defaultChain.join(";") : "");
  const parsedSteps = parseTripo3dChainExpression(effectiveChainExpr);
  const chainValidation = validateTripo3dChain(
    parsedSteps,
    mergedGenInput.taskType ?? "text_to_model",
    options.rigType ?? "biped",
  );
  const totalEstimatedCredits = generationPlan.estimatedCredits + chainValidation.estimatedChainCredits;

  return {
    scenarioId: scenario?.id ?? null,
    generationPlan,
    chainValidation,
    totalEstimatedCredits,
    totalEstimatedUsd: Number((totalEstimatedCredits / 100).toFixed(2)),
    readyToExecute: chainValidation.valid,
  };
}

export async function requestTripo3dJson(
  url: string,
  init: {
    readonly method: "GET" | "POST" | "PUT" | "PATCH";
    readonly apiKey: string;
    readonly region?: Tripo3dRegionId;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: BodyInit;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{
  readonly statusCode: number;
  readonly payload: Record<string, unknown>;
  readonly errorCatalogEntry?: (typeof TRIPO3D_ERROR_CATALOG)[number];
}> {
  const regionHeaders: Record<string, string> = init.region === "cn" ? { "X-Tripo-Region": "rg2" } : {};
  const response = await fetchImpl(url, {
    method: init.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${init.apiKey}`,
      ...regionHeaders,
      ...(init.headers ?? {}),
    },
    body: init.body,
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text) as unknown;
      payload =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { data: parsed };
    } catch {
      payload = { error: text.trim() };
    }
  }
  const apiCode = typeof payload.code === "number" ? payload.code : undefined;
  const errorCatalogEntry =
    apiCode !== undefined && apiCode !== 0 ? TRIPO3D_ERROR_CATALOG[apiCode] : undefined;
  return { statusCode: response.status, payload, ...(errorCatalogEntry ? { errorCatalogEntry } : {}) };
}
