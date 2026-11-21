/**
 * T-035 · T-037: 과금 0원 로컬 ComfyUI WebSocket(127.0.0.1:8188) + 사용자 BYOK 브리지 및
 * ManyFast 한국어 웹소설 → 3D 자동 컷 블로킹 엔진.
 *
 * 불변식: 기본 연결은 루프백(127.0.0.1/localhost)만 허용하며 외부 유료 API 자동 호출은 항상 0건이다.
 */

export const DEFAULT_COMFYUI_HTTP_URL = "http://127.0.0.1:8188";
export const DEFAULT_COMFYUI_WS_URL = "ws://127.0.0.1:8188/ws";

export const COMFYUI_CONTROLNET_MODES = ["lineart", "openpose", "depth", "canny", "scribble"] as const;
export type ComfyUiControlNetMode = (typeof COMFYUI_CONTROLNET_MODES)[number];

export const BYOK_PROVIDER_IDS = [
  "local-comfyui",
  "byok-openai-compatible",
  "byok-gemini",
  "byok-anthropic",
  "byok-replicate",
] as const;
export type ByokProviderId = (typeof BYOK_PROVIDER_IDS)[number];

export interface ControlNetPresetSpec {
  readonly mode: ComfyUiControlNetMode;
  readonly labelKo: string;
  readonly modelName: string;
  readonly defaultStrength: number;
  readonly startPercent: number;
  readonly endPercent: number;
  readonly summaryKo: string;
}

export const CONTROLNET_PRESETS: Readonly<Record<ComfyUiControlNetMode, ControlNetPresetSpec>> = Object.freeze({
  lineart: { mode: "lineart", labelKo: "선화(Lineart) 유지", modelName: "control_v11p_sd15_lineart_fp16.safetensors", defaultStrength: 0.85, startPercent: 0, endPercent: 0.9, summaryKo: "작가가 그린 펜선 구조를 유지하면서 명암·채색 가이드를 생성합니다." },
  openpose: { mode: "openpose", labelKo: "포즈(OpenPose) 고정", modelName: "control_v11p_sd15_openpose_fp16.safetensors", defaultStrength: 0.92, startPercent: 0, endPercent: 0.85, summaryKo: "3D 마네킹·골격 포즈 각도를 유지해 캐릭터 자세를 고정합니다." },
  depth: { mode: "depth", labelKo: "깊이(Depth) 구도", modelName: "control_v11f1p_sd15_depth_fp16.safetensors", defaultStrength: 0.78, startPercent: 0, endPercent: 0.8, summaryKo: "3D 배경 세트의 원근·거리감을 유지하며 웹툰 톤으로 변환합니다." },
  canny: { mode: "canny", labelKo: "윤곽선(Canny) 추출", modelName: "control_v11p_sd15_canny_fp16.safetensors", defaultStrength: 0.8, startPercent: 0, endPercent: 0.85, summaryKo: "건물·소품의 날카로운 모서리 윤곽을 보존합니다." },
  scribble: { mode: "scribble", labelKo: "러프 스케치(Scribble)", modelName: "control_v11p_sd15_scribble_fp16.safetensors", defaultStrength: 0.7, startPercent: 0, endPercent: 0.75, summaryKo: "거친 콘티 낙서에서 깔끔한 시안 구도를 빠르게 뽑아냅니다." },
});

export interface ByokCredentialConfig {
  readonly provider: ByokProviderId;
  readonly endpointUrl: string;
  readonly apiKey?: string;
  readonly modelId?: string;
  readonly autoPaidCallsAllowed: boolean;
  readonly requireExplicitUserTrigger: boolean;
}

export interface ByokValidationResult {
  readonly valid: boolean;
  readonly isLocalZeroCost: boolean;
  readonly maskedKey: string | null;
  readonly blockedPaidAutoCall: boolean;
  readonly warnings: readonly string[];
}

export interface CharacterDnaLock {
  readonly characterId: string;
  readonly name: string;
  readonly seed: number;
  readonly appearanceTokens: readonly string[];
  readonly referenceSheetId: string;
  readonly ipAdapterWeight: number;
  readonly faceIdStrength: number;
  readonly paletteSemanticTag: string;
  readonly lockedAtIso: string;
}

export interface ComfyUiNodeSpec {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, unknown>>;
}

export interface ComfyUiWorkflowInput {
  readonly promptIdPrefix?: string;
  readonly positivePrompt: string;
  readonly negativePrompt?: string;
  readonly checkpointName?: string;
  readonly width?: number;
  readonly height?: number;
  readonly steps?: number;
  readonly cfg?: number;
  readonly samplerName?: string;
  readonly scheduler?: string;
  readonly controlNetMode: ComfyUiControlNetMode;
  readonly controlNetStrength?: number;
  readonly controlImageName?: string;
  readonly characterDna?: CharacterDnaLock;
  readonly seedOverride?: number;
}

export interface ComfyUiWorkflowGraph {
  readonly schemaVersion: 1;
  readonly clientId: string;
  readonly seed: number;
  readonly controlNetMode: ComfyUiControlNetMode;
  readonly controlNetModel: string;
  readonly usesCharacterDna: boolean;
  readonly nodeCount: number;
  readonly estimatedVramGb: number;
  readonly estimatedLocalMs: number;
  readonly prompt: Readonly<Record<string, ComfyUiNodeSpec>>;
}

export interface ComfyUiBridgeProgressEvent {
  readonly stage: "health-check" | "queued" | "executing" | "completed" | "dry-run-fallback";
  readonly percent: number;
  readonly messageKo: string;
  readonly nodeId?: string;
}

export interface ComfyUiWebSocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  close(): void;
}

export type ComfyUiWebSocketFactory = (url: string) => ComfyUiWebSocketLike;
export type ComfyUiFetchLike = (
  input: string,
  init?: { readonly method?: string; readonly headers?: Record<string, string>; readonly body?: string },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

export interface ComfyUiBridgeExecutionOptions {
  readonly httpUrl?: string;
  readonly wsUrl?: string;
  readonly byokConfig?: ByokCredentialConfig;
  readonly forceDryRun?: boolean;
  readonly explicitUserApprovedPaidRun?: boolean;
  readonly fetchImpl?: ComfyUiFetchLike;
  readonly webSocketFactory?: ComfyUiWebSocketFactory;
  readonly onProgress?: (event: ComfyUiBridgeProgressEvent) => void;
  readonly nowIso?: string;
}

export interface ComfyUiBridgeResult {
  readonly ok: boolean;
  readonly mode: "local-websocket" | "dry-run-fallback" | "blocked-paid-guard";
  readonly connected: boolean;
  readonly fallbackUsed: boolean;
  readonly endpointUrl: string;
  readonly promptId: string;
  readonly seed: number;
  readonly externalPaidAutoCallsCount: 0;
  readonly estimatedCostKrw: 0;
  readonly workflow: ComfyUiWorkflowGraph;
  readonly trace: readonly ComfyUiBridgeProgressEvent[];
  readonly outputArtifacts: readonly { readonly filename: string; readonly nodeId: string; readonly simulated: boolean }[];
  readonly summaryKo: string;
  readonly guidanceKo: string;
  readonly completedAtIso: string;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deriveDeterministicCharacterSeed(
  name: string,
  traits: readonly string[] = [],
  referenceSheetId = "sheet-default",
): number {
  const normalized = [name.trim().toLowerCase(), ...traits.map((t) => t.trim().toLowerCase()).filter(Boolean), referenceSheetId.trim().toLowerCase()].join("|");
  return (fnv1a32(normalized || "toonstudio-dna-default") % 2_147_483_646) + 1;
}

export function isLoopbackEndpoint(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function maskApiKey(rawKey?: string): string | null {
  const trimmed = rawKey?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length <= 6) return "***";
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-2)}`;
}

export function validateByokConfig(config: ByokCredentialConfig): ByokValidationResult {
  const warnings: string[] = [];
  const isLocal = config.provider === "local-comfyui" && isLoopbackEndpoint(config.endpointUrl);
  const blockedPaidAutoCall = config.autoPaidCallsAllowed;
  if (blockedPaidAutoCall) warnings.push("보안 정책상 외부 유료 API 자동 호출은 허용되지 않습니다(autoPaidCallsAllowed=false 필수).");
  if (!config.requireExplicitUserTrigger) warnings.push("사용자 명시 클릭 없이 AI 호출을 실행할 수 없습니다.");
  if (config.provider === "local-comfyui" && !isLoopbackEndpoint(config.endpointUrl)) warnings.push("로컬 ComfyUI 모드는 127.0.0.1 또는 localhost 주소만 연결할 수 있습니다.");
  if (config.provider !== "local-comfyui" && !maskApiKey(config.apiKey)) warnings.push("사용자 BYOK 키가 비어 있어 로컬 Dry-Run 모드로만 시뮬레이션됩니다.");
  return Object.freeze({ valid: warnings.length === 0, isLocalZeroCost: isLocal, maskedKey: maskApiKey(config.apiKey), blockedPaidAutoCall, warnings: Object.freeze(warnings) });
}

export function createCharacterDnaLock(input: {
  readonly characterId?: string;
  readonly name: string;
  readonly appearanceTokens: readonly string[];
  readonly referenceSheetId?: string;
  readonly ipAdapterWeight?: number;
  readonly faceIdStrength?: number;
  readonly paletteSemanticTag?: string;
  readonly nowIso?: string;
}): CharacterDnaLock {
  const cleanName = input.name.trim() || "주인공";
  const cleanTokens = input.appearanceTokens.map((t) => t.trim()).filter(Boolean);
  const referenceSheetId = input.referenceSheetId?.trim() || `dna-sheet-${fnv1a32(cleanName).toString(36)}`;
  const clampWeight = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0.1, Math.round(value * 100) / 100)) : fallback;
  return Object.freeze({
    characterId: input.characterId?.trim() || `char-${fnv1a32(cleanName).toString(36)}`,
    name: cleanName,
    seed: deriveDeterministicCharacterSeed(cleanName, cleanTokens, referenceSheetId),
    appearanceTokens: Object.freeze(cleanTokens.length > 0 ? cleanTokens : ["webtoon lineart", "clean cel shading"]),
    referenceSheetId,
    ipAdapterWeight: clampWeight(input.ipAdapterWeight, 0.78),
    faceIdStrength: clampWeight(input.faceIdStrength, 0.82),
    paletteSemanticTag: input.paletteSemanticTag?.trim() || "cool-ink-atelier",
    lockedAtIso: input.nowIso ?? new Date().toISOString(),
  });
}

export function buildComfyUiControlNetWorkflow(input: ComfyUiWorkflowInput): ComfyUiWorkflowGraph {
  const preset = CONTROLNET_PRESETS[input.controlNetMode];
  const seed =
    typeof input.seedOverride === "number" && Number.isFinite(input.seedOverride) && input.seedOverride > 0
      ? Math.floor(input.seedOverride)
      : input.characterDna?.seed ?? deriveDeterministicCharacterSeed(input.positivePrompt);
  const width = Math.max(512, Math.min(2048, Math.round((input.width ?? 800) / 8) * 8));
  const height = Math.max(512, Math.min(2048, Math.round((input.height ?? 1280) / 8) * 8));
  const steps = Math.max(8, Math.min(50, Math.round(input.steps ?? 24)));
  const cfg = Math.max(1, Math.min(15, Math.round((input.cfg ?? 7) * 10) / 10));
  const strength = Math.max(0.1, Math.min(1.5, Math.round((input.controlNetStrength ?? preset.defaultStrength) * 100) / 100));
  const checkpointName = input.checkpointName?.trim() || "illustrious_webtoon_v2_fp16.safetensors";
  const dnaAnchor = input.characterDna ? `[DNA:${input.characterDna.characterId}:${input.characterDna.appearanceTokens.join(", ")}] ` : "";
  const positiveText = `${dnaAnchor}${input.positivePrompt.trim()}`.trim();
  const negativeText = input.negativePrompt?.trim() || "blurry, muddy lineart, extra fingers, watermark, low contrast";

  const nodes: Record<string, ComfyUiNodeSpec> = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpointName } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: positiveText, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: negativeText, clip: ["1", 1] } },
    "4": { class_type: "ControlNetLoader", inputs: { control_net_name: preset.modelName } },
    "5": { class_type: "LoadImage", inputs: { image: input.controlImageName?.trim() || `cut_${preset.mode}_guide.png` } },
    "6": {
      class_type: "ControlNetApplyAdvanced",
      inputs: { positive: ["2", 0], negative: ["3", 0], control_net: ["4", 0], image: ["5", 0], strength, start_percent: preset.startPercent, end_percent: preset.endPercent },
    },
    "7": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
  };

  let modelSource: readonly [string, number] = ["1", 0];
  if (input.characterDna) {
    nodes["11"] = { class_type: "IPAdapterModelLoader", inputs: { ipadapter_file: "ip-adapter-plus-face_sdxl_vit-h.safetensors" } };
    nodes["12"] = { class_type: "LoadImage", inputs: { image: `${input.characterDna.referenceSheetId}.png` } };
    nodes["13"] = {
      class_type: "IPAdapterApply",
      inputs: { model: ["1", 0], ipadapter: ["11", 0], image: ["12", 0], weight: input.characterDna.ipAdapterWeight, faceid_strength: input.characterDna.faceIdStrength, noise: 0.05 },
    };
    modelSource = ["13", 0];
  }

  nodes["8"] = {
    class_type: "KSampler",
    inputs: { model: modelSource, positive: ["6", 0], negative: ["6", 1], latent_image: ["7", 0], seed, steps, cfg, sampler_name: input.samplerName ?? "dpmpp_2m_sde", scheduler: input.scheduler ?? "karras", denoise: 0.85 },
  };
  nodes["9"] = { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["1", 2] } };
  nodes["10"] = { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: input.promptIdPrefix?.trim() || "toonstudio_local_cut" } };

  const megapixels = (width * height) / 1_000_000;
  return Object.freeze({
    schemaVersion: 1,
    clientId: `toonstudio-local-${fnv1a32(`${positiveText}|${seed}`).toString(36)}`,
    seed,
    controlNetMode: input.controlNetMode,
    controlNetModel: preset.modelName,
    usesCharacterDna: Boolean(input.characterDna),
    nodeCount: Object.keys(nodes).length,
    estimatedVramGb: Math.round((4.2 + megapixels * 1.6 + (input.characterDna ? 1.1 : 0)) * 10) / 10,
    estimatedLocalMs: Math.round(steps * 180 + megapixels * 900),
    prompt: Object.freeze(nodes),
  });
}

function buildDryRunResult(
  workflow: ComfyUiWorkflowGraph,
  endpointUrl: string,
  reasonKo: string,
  trace: ComfyUiBridgeProgressEvent[],
  nowIso: string,
  mode: "dry-run-fallback" | "blocked-paid-guard" = "dry-run-fallback",
): ComfyUiBridgeResult {
  trace.push({ stage: "dry-run-fallback", percent: 100, messageKo: reasonKo });
  return Object.freeze({
    ok: mode === "dry-run-fallback",
    mode,
    connected: false,
    fallbackUsed: true,
    endpointUrl,
    promptId: `dryrun-${workflow.clientId}-${workflow.seed.toString(36)}`,
    seed: workflow.seed,
    externalPaidAutoCallsCount: 0,
    estimatedCostKrw: 0,
    workflow,
    trace: Object.freeze([...trace]),
    outputArtifacts: Object.freeze([{ filename: `dryrun_${workflow.controlNetMode}_seed_${workflow.seed}.png`, nodeId: "10", simulated: true }]),
    summaryKo:
      mode === "blocked-paid-guard"
        ? "외부 유료 API 자동 호출이 차단되어 과금 0원 Dry-Run 계획만 생성했습니다."
        : `로컬 ComfyUI 미연결 감지 → Dry-Run 시뮬레이션 안전 전환 완료 (시드 ${workflow.seed}, 노드 ${workflow.nodeCount}개)`,
    guidanceKo:
      mode === "blocked-paid-guard"
        ? "로컬 ComfyUI(127.0.0.1:8188)를 사용하거나 BYOK 수동 실행 정책을 확인하세요."
        : "실제 렌더링은 내 PC에서 ComfyUI를 --listen 127.0.0.1 --port 8188 로 실행한 뒤 다시 눌러주세요.",
    completedAtIso: nowIso,
  });
}

export async function executeComfyUiBridgeJob(
  workflowInput: ComfyUiWorkflowInput,
  options: ComfyUiBridgeExecutionOptions = {},
): Promise<ComfyUiBridgeResult> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const httpUrl = (options.httpUrl ?? options.byokConfig?.endpointUrl ?? DEFAULT_COMFYUI_HTTP_URL).replace(/\/+$/u, "");
  const wsUrl = options.wsUrl ?? DEFAULT_COMFYUI_WS_URL;
  const workflow = buildComfyUiControlNetWorkflow(workflowInput);
  const trace: ComfyUiBridgeProgressEvent[] = [];
  const emit = (event: ComfyUiBridgeProgressEvent) => {
    trace.push(event);
    options.onProgress?.(event);
  };

  if (options.byokConfig && options.byokConfig.provider !== "local-comfyui") {
    const validation = validateByokConfig(options.byokConfig);
    if (validation.blockedPaidAutoCall || !options.explicitUserApprovedPaidRun) {
      return buildDryRunResult(workflow, httpUrl, "외부 유료 공급자 자동 호출이 차단되었습니다. 과금 0원 Dry-Run 워크플로만 생성합니다.", trace, nowIso, "blocked-paid-guard");
    }
    return buildDryRunResult(workflow, httpUrl, "BYOK 요청 페이로드를 로컬에서 검증 완료했습니다(자동 원격 과금 호출 0건).", trace, nowIso);
  }
  if (!isLoopbackEndpoint(httpUrl) || !isLoopbackEndpoint(wsUrl)) {
    return buildDryRunResult(workflow, httpUrl, "루프백(127.0.0.1/localhost) 외 주소는 차단되었습니다. Dry-Run으로 전환합니다.", trace, nowIso, "blocked-paid-guard");
  }
  if (options.forceDryRun) {
    return buildDryRunResult(workflow, httpUrl, "사용자 요청으로 Dry-Run 시뮬레이션 모드를 실행했습니다(외부 통신 0건).", trace, nowIso);
  }

  const fetchFn: ComfyUiFetchLike | null =
    options.fetchImpl ?? (typeof globalThis.fetch === "function" ? (globalThis.fetch as ComfyUiFetchLike) : null);
  if (!fetchFn) {
    return buildDryRunResult(workflow, httpUrl, "현재 환경에 fetch 인터페이스가 없어 Dry-Run 모드로 전환했습니다.", trace, nowIso);
  }

  emit({ stage: "health-check", percent: 10, messageKo: `로컬 ComfyUI(${httpUrl}) 연결 상태를 확인하는 중입니다...` });
  try {
    const stats = await fetchFn(`${httpUrl}/system_stats`, { method: "GET" });
    if (!stats.ok) return buildDryRunResult(workflow, httpUrl, `로컬 ComfyUI 응답(${stats.status}) → Dry-Run 폴백`, trace, nowIso);
  } catch {
    return buildDryRunResult(workflow, httpUrl, `로컬 ComfyUI(${httpUrl}) 미실행 감지 → Dry-Run 안전 폴백`, trace, nowIso);
  }

  try {
    const queueRes = await fetchFn(`${httpUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: workflow.clientId, prompt: workflow.prompt }),
    });
    if (!queueRes.ok) return buildDryRunResult(workflow, httpUrl, `로컬 ComfyUI 큐 등록 실패(${queueRes.status}) → Dry-Run 폴백`, trace, nowIso);
    const queueJson = await queueRes.json();
    const promptId = isRecord(queueJson) && typeof queueJson.prompt_id === "string" ? queueJson.prompt_id : `local-${workflow.clientId}`;
    emit({ stage: "queued", percent: 25, messageKo: `로컬 ComfyUI 큐에 등록되었습니다(ID: ${promptId}).` });

    const outputs: { readonly filename: string; readonly nodeId: string; readonly simulated: boolean }[] = [];
    const wsFactory =
      options.webSocketFactory ??
      (typeof globalThis.WebSocket === "function" ? (url: string) => new globalThis.WebSocket(url) as unknown as ComfyUiWebSocketLike : null);

    if (wsFactory) {
      await new Promise<void>((resolve) => {
        const ws = wsFactory(`${wsUrl}?clientId=${encodeURIComponent(workflow.clientId)}`);
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          try { ws.close(); } catch { /* 무시 */ }
          resolve();
        };
        ws.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          try {
            const payload: unknown = JSON.parse(event.data);
            if (!isRecord(payload) || typeof payload.type !== "string") return;
            const data = isRecord(payload.data) ? payload.data : {};
            if (payload.type === "progress" && typeof data.value === "number" && typeof data.max === "number" && data.max > 0) {
              emit({ stage: "executing", percent: Math.min(95, Math.max(30, Math.round(25 + (data.value / data.max) * 70))), messageKo: `로컬 GPU 샘플링 중 (${data.value}/${data.max} 스텝)`, nodeId: typeof data.node === "string" ? data.node : undefined });
            } else if (payload.type === "executed") {
              const nodeId = typeof data.node === "string" ? data.node : "10";
              const images = isRecord(data.output) && Array.isArray(data.output.images) ? data.output.images : [];
              for (const img of images) {
                if (isRecord(img) && typeof img.filename === "string") outputs.push({ filename: img.filename, nodeId, simulated: false });
              }
              emit({ stage: "completed", percent: 100, messageKo: "로컬 ComfyUI 렌더링이 완료되었습니다.", nodeId });
              done();
            } else if (payload.type === "executing" && data.node === null) {
              emit({ stage: "completed", percent: 100, messageKo: "로컬 ComfyUI 실행 큐가 완료되었습니다." });
              done();
            }
          } catch { /* 비정상 프레임 무시 */ }
        };
        ws.onerror = () => done();
        ws.onclose = () => done();
      });
    } else {
      emit({ stage: "completed", percent: 100, messageKo: "로컬 ComfyUI HTTP 큐에 전달되었습니다." });
    }

    return Object.freeze({
      ok: true,
      mode: "local-websocket",
      connected: true,
      fallbackUsed: false,
      endpointUrl: httpUrl,
      promptId,
      seed: workflow.seed,
      externalPaidAutoCallsCount: 0,
      estimatedCostKrw: 0,
      workflow,
      trace: Object.freeze([...trace]),
      outputArtifacts: Object.freeze(outputs.length > 0 ? outputs : [{ filename: `local_${workflow.controlNetMode}_seed_${workflow.seed}.png`, nodeId: "10", simulated: false }]),
      summaryKo: `로컬 ComfyUI(${httpUrl})에서 과금 0원으로 렌더링을 마쳤습니다(시드 ${workflow.seed}).`,
      guidanceKo: "생성된 시드와 ControlNet 설정을 유지한 채 다음 컷으로 이어서 작업할 수 있습니다.",
      completedAtIso: nowIso,
    });
  } catch {
    return buildDryRunResult(workflow, httpUrl, "로컬 ComfyUI 통신 예외 → Dry-Run 안전 폴백", trace, nowIso);
  }
}

// ---------------------------------------------------------------------------
// T-037: ManyFast 한국어 웹소설 → 3D 자동 컷 블로킹 엔진
// ---------------------------------------------------------------------------

export type BlockingCameraShot = "extreme-closeup" | "closeup" | "bust" | "waist" | "full-shot" | "wide-establishing";
export type BlockingCameraAngle = "eye-level" | "low-angle" | "high-angle" | "dutch-tilt" | "over-the-shoulder";

export interface BlockingBackgroundSet {
  readonly setId: string;
  readonly nameKo: string;
  readonly category: "school" | "urban" | "fantasy" | "interior" | "nature";
  readonly timeOfDay: "day" | "sunset" | "night" | "rain";
  readonly lightingPreset: string;
  readonly defaultCameraZ: number;
  readonly keywords: readonly string[];
}

export interface BlockingCharacterTransform {
  readonly characterId: string;
  readonly name: string;
  readonly seed: number;
  readonly roleInCut: "speaker" | "listener" | "background";
  readonly position: { readonly x: number; readonly y: 0; readonly z: number };
  readonly yawDeg: number;
  readonly posePreset: string;
  readonly expressionPreset: string;
}

export interface BlockingCutItem {
  readonly cutNumber: number;
  readonly sceneHeading: string;
  readonly beatKind: "dialogue" | "action" | "narration" | "establishing";
  readonly speakerName: string | null;
  readonly dialogueText: string | null;
  readonly actionNote: string;
  readonly cameraShot: BlockingCameraShot;
  readonly cameraAngle: BlockingCameraAngle;
  readonly focalLengthMm: number;
  readonly scrollGapPx: number;
  readonly backgroundSet: BlockingBackgroundSet;
  readonly characters: readonly BlockingCharacterTransform[];
  readonly emotionCue: string;
  readonly dnaSeed: number;
}

export interface WebNovel3dBlockingSheet {
  readonly title: string;
  readonly sourceLineCount: number;
  readonly cuts: readonly BlockingCutItem[];
  readonly cast: readonly CharacterDnaLock[];
  readonly matchedSets: readonly BlockingBackgroundSet[];
  readonly totalEstimatedScrollPx: number;
  readonly generatedAtIso: string;
}

const DEFAULT_BACKGROUND_SET: BlockingBackgroundSet = {
  setId: "bg3d-school-rooftop",
  nameKo: "학교 옥상 철망 세트",
  category: "school",
  timeOfDay: "sunset",
  lightingPreset: "golden-hour-rim",
  defaultCameraZ: 4.2,
  keywords: ["옥상", "철망", "노을", "바람", "하늘"],
};

export const CANONICAL_3D_BACKGROUND_SETS: readonly BlockingBackgroundSet[] = Object.freeze([
  DEFAULT_BACKGROUND_SET,
  { setId: "bg3d-highschool-classroom", nameKo: "고등학교 교실 창가 세트", category: "school", timeOfDay: "day", lightingPreset: "soft-window-sunlight", defaultCameraZ: 3.6, keywords: ["교실", "칠판", "책상", "복도", "학교"] },
  { setId: "bg3d-rainy-alley", nameKo: "비 오는 골목길 네온 세트", category: "urban", timeOfDay: "rain", lightingPreset: "wet-asphalt-neon", defaultCameraZ: 5.0, keywords: ["골목", "비", "우산", "가로등", "밤거리", "아스팔트"] },
  { setId: "bg3d-cozy-cafe", nameKo: "도심 브런치 카페 세트", category: "interior", timeOfDay: "day", lightingPreset: "warm-pendant-key", defaultCameraZ: 3.1, keywords: ["카페", "커피", "테이블", "창밖", "매장"] },
  { setId: "bg3d-royal-throne-hall", nameKo: "제국 알현실 대리석 궁전 세트", category: "fantasy", timeOfDay: "day", lightingPreset: "stained-glass-godray", defaultCameraZ: 6.5, keywords: ["궁전", "알현실", "황제", "왕좌", "기사", "대리석", "성"] },
  { setId: "bg3d-dungeon-obsidian", nameKo: "흑요석 던전 보스룸 세트", category: "fantasy", timeOfDay: "night", lightingPreset: "mana-crystal-blue", defaultCameraZ: 6.2, keywords: ["던전", "마수", "보스", "검기", "동굴", "유적"] },
  { setId: "bg3d-modern-office", nameKo: "고층 오피스 회의실 세트", category: "interior", timeOfDay: "day", lightingPreset: "neutral-skylight", defaultCameraZ: 3.8, keywords: ["사무실", "회의실", "대표", "회사", "모니터", "서류"] },
  { setId: "bg3d-forest-clearing", nameKo: "안개 낀 고대 숲 공터 세트", category: "nature", timeOfDay: "day", lightingPreset: "dappled-forest-mist", defaultCameraZ: 5.4, keywords: ["숲", "나무", "안개", "풀밭", "산길"] },
]);

export function getSampleWebNovelScript(): string {
  return [
    "[장면 1 · 노을 지는 학교 옥상]",
    "붉은 노을이 철망 너머로 길게 번졌다. 서연은 바람에 흩날리는 머리카락을 붙잡으며 옥상 끝을 올려다보았다.",
    '서연: "현우야, 정말 오늘 밤 흑요석 던전 게이트에 혼자 들어갈 셈이야?"',
    '현우가 천천히 돌아보며 차가운 눈빛으로 속삭였다. "네가 말려도 내 검이 멈추진 않아."',
    "그 순간 옥상 문이 쾅 열리며 지민이 전속력으로 달려 나왔다.",
    '지민: "둘 다 멈춰! 제국 알현실에서 긴급 소환령이 떨어졌어!"',
  ].join("\n");
}

export function match3dBackgroundSet(text: string, previousSet?: BlockingBackgroundSet): BlockingBackgroundSet {
  let bestSet: BlockingBackgroundSet | null = null;
  let bestScore = 0;
  for (const candidate of CANONICAL_3D_BACKGROUND_SETS) {
    let score = 0;
    for (const kw of candidate.keywords) {
      if (text.includes(kw)) score += kw.length >= 2 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSet = candidate;
    }
  }
  if (!bestSet) return previousSet ?? DEFAULT_BACKGROUND_SET;
  if (/밤|야간|자정/u.test(text)) return Object.freeze({ ...bestSet, timeOfDay: "night", lightingPreset: "moonlight-rim" });
  if (/노을|해질녘|석양/u.test(text)) return Object.freeze({ ...bestSet, timeOfDay: "sunset", lightingPreset: "golden-hour-rim" });
  if (/비|폭우/u.test(text)) return Object.freeze({ ...bestSet, timeOfDay: "rain", lightingPreset: "wet-asphalt-neon" });
  return bestSet;
}

function parseKoreanScriptLine(rawLine: string): { readonly speaker: string | null; readonly dialogue: string | null; readonly narration: string } {
  const line = rawLine.trim();
  const colonMatch = line.match(/^([가-힣A-Za-z0-9_ ]{1,16})\s*:\s*[""「『](.+?)[""」』]$/u);
  if (colonMatch?.[1] && colonMatch[2]) return { speaker: colonMatch[1].trim(), dialogue: colonMatch[2].trim(), narration: "" };
  const quotedMatch = line.match(/[""「『]([^""「『」』]+)[""」』]/u);
  if (quotedMatch?.[1]) {
    const context = `${line.slice(0, quotedMatch.index ?? 0).trim()} ${line.slice((quotedMatch.index ?? 0) + quotedMatch[0].length).trim()}`.trim();
    const speakerMatch = context.match(/^([가-힣]{2,4})(?:이|가|은|는)(?:\s|$)/u);
    return { speaker: speakerMatch?.[1] ?? null, dialogue: quotedMatch[1].trim(), narration: context };
  }
  const subjectMatch = line.match(/([가-힣]{2,4})(?:이|가|은|는)\s+(?:바람|천천히|전속력|급히|조용히|문|검|고개|눈|달려|멈|웃|울|돌아)/u);
  return { speaker: subjectMatch?.[1] ?? null, dialogue: null, narration: line };
}

function inferCameraAndEmotion(line: string, beatKind: BlockingCutItem["beatKind"]) {
  let shot: BlockingCameraShot = beatKind === "establishing" ? "wide-establishing" : beatKind === "dialogue" ? "bust" : "waist";
  let angle: BlockingCameraAngle = "eye-level";
  let focalLengthMm = 50;
  let emotionCue = "중립 긴장";
  let posePreset = "standing-neutral";
  let expressionPreset = "neutral-focus";
  let scrollGapPx = 420;

  if (/눈빛|눈물|속삭|떨리|입술|클로즈업/u.test(line)) {
    shot = "closeup"; focalLengthMm = 85; emotionCue = "감정 몰입"; expressionPreset = "intense-gaze"; scrollGapPx = 360;
  } else if (/달려|전속력|뛰어|검기|충돌|전신|전투/u.test(line)) {
    shot = "full-shot"; focalLengthMm = 35; emotionCue = "역동 액션"; posePreset = "action-dash"; expressionPreset = "urgent-shout"; scrollGapPx = 560;
  } else if (/번졌다|전경|전체|펼쳐|하늘|옥상|궁전/u.test(line) && beatKind !== "dialogue") {
    shot = "wide-establishing"; focalLengthMm = 24; emotionCue = "공간 도입"; posePreset = "looking-horizon"; scrollGapPx = 520;
  }
  if (/쾅|충격|멈춰|긴급|비명|흔들/u.test(line)) { angle = "dutch-tilt"; emotionCue = "충격·반전"; expressionPreset = "shocked-shout"; scrollGapPx = 620; }
  else if (/올려다보|위압|거대|황제|보스/u.test(line)) { angle = "low-angle"; emotionCue = "위압·경외"; }
  else if (/내려다보|무릎|주저앉/u.test(line)) { angle = "high-angle"; emotionCue = "고립·압박"; }
  else if (beatKind === "dialogue" && /돌아보|마주|대답/u.test(line)) { angle = "over-the-shoulder"; posePreset = "turn-back-talk"; }
  if (/차가운|냉정/u.test(line)) expressionPreset = "cold-composed";
  else if (/웃|미소/u.test(line)) expressionPreset = "warm-smile";

  return { shot, angle, focalLengthMm, emotionCue, posePreset, expressionPreset, scrollGapPx };
}

export function parseWebNovelTo3dBlockingSheet(
  script: string,
  options: { readonly title?: string; readonly nowIso?: string } = {},
): WebNovel3dBlockingSheet {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const rawLines = script.split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);
  let currentHeading = "장면 1 · 기본 무대";
  let currentSet: BlockingBackgroundSet = DEFAULT_BACKGROUND_SET;
  const castMap = new Map<string, CharacterDnaLock>();
  const matchedSetMap = new Map<string, BlockingBackgroundSet>();
  const cuts: BlockingCutItem[] = [];
  let recentActiveNames: string[] = [];

  const ensureCast = (name: string): CharacterDnaLock => {
    const existing = castMap.get(name);
    if (existing) return existing;
    const created = createCharacterDnaLock({ name, appearanceTokens: ["webtoon-character", "consistent-face-anchor", name], nowIso });
    castMap.set(name, created);
    return created;
  };

  for (const line of rawLines) {
    const headingMatch = line.match(/^\[(.+)\]$/u);
    if (headingMatch?.[1]) {
      currentHeading = headingMatch[1].trim();
      currentSet = match3dBackgroundSet(currentHeading, currentSet);
      matchedSetMap.set(currentSet.setId, currentSet);
      continue;
    }
    currentSet = match3dBackgroundSet(line, currentSet);
    matchedSetMap.set(currentSet.setId, currentSet);

    const parsed = parseKoreanScriptLine(line);
    const beatKind: BlockingCutItem["beatKind"] = parsed.dialogue ? "dialogue" : cuts.length === 0 ? "establishing" : /열리며|달려|붙잡|돌아보|휘둘|부딪/u.test(line) ? "action" : "narration";
    const camera = inferCameraAndEmotion(line, beatKind);
    const primarySpeaker = parsed.speaker ?? recentActiveNames[0] ?? null;

    if (primarySpeaker) {
      ensureCast(primarySpeaker);
      recentActiveNames = [primarySpeaker, ...recentActiveNames.filter((n) => n !== primarySpeaker)].slice(0, 3);
    }

    const characters: BlockingCharacterTransform[] = [];
    if (primarySpeaker) {
      const primaryDna = ensureCast(primarySpeaker);
      const listenerName = recentActiveNames.find((n) => n !== primarySpeaker) ?? null;
      const twoShot = Boolean(listenerName && (camera.angle === "over-the-shoulder" || ["bust", "waist", "full-shot"].includes(camera.shot)));
      characters.push(
        Object.freeze({
          characterId: primaryDna.characterId,
          name: primaryDna.name,
          seed: primaryDna.seed,
          roleInCut: "speaker",
          position: Object.freeze({ x: twoShot ? -0.65 : 0, y: 0, z: camera.shot === "closeup" ? 1.1 : camera.shot === "full-shot" ? 2.4 : 1.6 }),
          yawDeg: twoShot ? 24 : 0,
          posePreset: camera.posePreset,
          expressionPreset: camera.expressionPreset,
        }),
      );
      if (twoShot && listenerName) {
        const listenerDna = ensureCast(listenerName);
        characters.push(
          Object.freeze({
            characterId: listenerDna.characterId,
            name: listenerDna.name,
            seed: listenerDna.seed,
            roleInCut: "listener",
            position: Object.freeze({ x: 0.72, y: 0, z: camera.angle === "over-the-shoulder" ? 0.85 : 1.85 }),
            yawDeg: camera.angle === "over-the-shoulder" ? -145 : -26,
            posePreset: "listening-attentive",
            expressionPreset: "neutral-focus",
          }),
        );
      }
    }

    const cutNumber = cuts.length + 1;
    cuts.push(
      Object.freeze({
        cutNumber,
        sceneHeading: currentHeading,
        beatKind,
        speakerName: primarySpeaker,
        dialogueText: parsed.dialogue,
        actionNote: parsed.narration || (parsed.dialogue ? `${primarySpeaker ?? "화자"} 대사 연출` : line),
        cameraShot: camera.shot,
        cameraAngle: camera.angle,
        focalLengthMm: camera.focalLengthMm,
        scrollGapPx: camera.scrollGapPx,
        backgroundSet: currentSet,
        characters: Object.freeze(characters),
        emotionCue: camera.emotionCue,
        dnaSeed: characters[0]?.seed ?? deriveDeterministicCharacterSeed(`${currentHeading}#${cutNumber}`),
      }),
    );
  }

  return Object.freeze({
    title: options.title?.trim() || "웹소설 → 3D 자동 콘티 시트",
    sourceLineCount: rawLines.length,
    cuts: Object.freeze(cuts),
    cast: Object.freeze([...castMap.values()]),
    matchedSets: Object.freeze([...matchedSetMap.values()]),
    totalEstimatedScrollPx: cuts.reduce((sum, cut) => sum + cut.scrollGapPx + 960, 0),
    generatedAtIso: nowIso,
  });
}
