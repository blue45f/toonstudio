/**
 * 캐릭터·화풍 LoRA 학습 BYOK — fal.ai 키 보관 + 큐 REST 클라이언트.
 *
 * 배경: 기존 캐릭터 일관성은 "참고 이미지 + 프롬프트"를 Images Edits API로 보내는
 * 근사 방식뿐이라 컷마다 얼굴이 흔들린다(StudioAiCharacterConsistencyPanel 안내 문구
 * 참고). 이 모듈은 학습 기반 고정 — fal.ai의 FLUX LoRA 학습으로 캐릭터/화풍 전용
 * 가중치를 만들어 그 파일로 생성하는 경로를 연다.
 *
 * 제공자 정본은 fal.ai다(2026-10-06 공식 문서로 확인):
 * - 학습: `fal-ai/flux-lora-fast-training` — 큐 제출 → 상태 조회 → 결과의
 *   `diffusers_lora_file.url`이 학습된 LoRA 가중치 파일이다.
 * - 생성: `fal-ai/flux-lora` — 입력 `loras: [{ path, scale }]`에 위 파일 URL을 넣는다.
 * - 인증: 모든 REST 호출에 `Authorization: Key <사용자 키>`.
 * - 학습 이미지 묶음은 zip 아카이브 URL(`images_data_url`)로 넘겨야 해서, fal
 *   스토리지 업로드(initiate → PUT) 계약을 함께 구현한다.
 * 대안이던 Replicate는 학습 API는 있으나 트레이너 버전 해시 고정 + 목적지 모델
 * 사전 생성이 필요하고 산출물이 가중치 파일이 아닌 호스팅 모델이라 채택하지 않았다
 * (기록: hidden_files/competitor-analysis-2026-10-06/impl-lora-byok.md).
 *
 * 과금 경계: 큐 제출(POST queue.fal.run/...)이 성공하는 순간부터 fal 계정 과금이
 * 시작된다 — 학습 제출과 생성 제출 모두 유료 호출이다. 이 모듈의 조회(GET) 호출은
 * 과금하지 않는다. 키는 사용자 본인의 fal 계정 키이며 현재 탭 sessionStorage에만
 * 보관한다(뉴스레터 Resend 키와 같은 정책). fal 공식 문서는 클라이언트 사용 시
 * 서버 프록시를 권장하지만, ToonStudio의 BYOK 일관 정책(본인 키를 본인 브라우저
 * 세션에만 보관, 서버에 저장하지 않음)을 따르며 그 사실을 패널 문구로 알린다.
 *
 * 오류 계약: studio-ai-client와 동일하게 async 함수는 throw하지 않고
 * `StudioLoraResult`를 resolve한다. 키가 없으면 fetch를 아예 호출하지 않는다.
 * 키 원문은 로그·오류 메시지·반환값 어디에도 넣지 않는다.
 */

export interface StudioFalKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STUDIO_FAL_API_KEY_STORAGE_KEY = "toonstudio_fal_api_key";

/** fal.ai 키 발급 페이지 — 2026-10-06 실재 확인(미로그인 시 로그인으로 리다이렉트). */
export const STUDIO_FAL_API_KEYS_URL = "https://fal.ai/dashboard/keys";

export const FAL_QUEUE_BASE_URL = "https://queue.fal.run";
export const FAL_STORAGE_INITIATE_URL = "https://rest.alpha.fal.ai/storage/upload/initiate";
export const FAL_LORA_TRAINING_MODEL_ID = "fal-ai/flux-lora-fast-training";
export const FAL_LORA_GENERATION_MODEL_ID = "fal-ai/flux-lora";

/** 브라우저 sessionStorage를 안전하게 얻는다(비브라우저·차단 환경에서는 null). */
export function browserStudioFalSessionStorage(): StudioFalKeyStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** 저장된 fal 키 로드 — 저장소 부재·조회 실패는 빈 문자열(미등록 상태)로 취급한다. */
export function loadStudioFalApiKey(
  storage: StudioFalKeyStorage | null | undefined = browserStudioFalSessionStorage(),
): string {
  if (!storage) return "";
  try {
    return storage.getItem(STUDIO_FAL_API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** fal 키를 현재 탭 세션에 저장한다. 성공 여부를 돌려준다(실패를 숨기지 않는다). */
export function saveStudioFalApiKey(
  storage: StudioFalKeyStorage | null | undefined = browserStudioFalSessionStorage(),
  apiKey: string,
): boolean {
  if (!storage) return false;
  try {
    const trimmed = apiKey.trim();
    if (trimmed) storage.setItem(STUDIO_FAL_API_KEY_STORAGE_KEY, trimmed);
    else storage.removeItem(STUDIO_FAL_API_KEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** fal 키가 등록돼 있으면 true — 빈 문자열은 미등록이다. */
export function isStudioFalConfigured(apiKey: string): boolean {
  return apiKey.trim().length > 0;
}

export type StudioLoraErrorCode =
  | "not_configured"
  | "invalid_input"
  | "network_error"
  | "provider_error"
  | "parse_error";

export type StudioLoraResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: StudioLoraErrorCode; readonly error: string };

export type StudioLoraFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** 테스트 주입 지점 — 실호출 기본값은 전역 fetch와 실제 대기다. */
export interface StudioLoraClientDeps {
  readonly fetchImpl?: StudioLoraFetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

function resolveFetch(deps: StudioLoraClientDeps): StudioLoraFetch {
  return deps.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function failure<T>(code: StudioLoraErrorCode, error: string): StudioLoraResult<T> {
  return { ok: false, code, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** fal 오류 본문에서 사람이 읽을 사유만 뽑는다 — 키·요청 원문은 절대 섞지 않는다. */
function describeFalError(status: number, payload: unknown): string {
  if (isRecord(payload)) {
    const detail = payload["detail"];
    if (typeof detail === "string" && detail.trim()) {
      return `fal 요청이 거부됐습니다(HTTP ${status}): ${detail.slice(0, 200)}`;
    }
    if (Array.isArray(detail)) {
      const first = detail.find((item) => isRecord(item) && typeof item["msg"] === "string");
      if (isRecord(first)) {
        return `fal 요청이 거부됐습니다(HTTP ${status}): ${String(first["msg"]).slice(0, 200)}`;
      }
    }
    const message = readString(payload, "message") ?? readString(payload, "error");
    if (message) return `fal 요청이 거부됐습니다(HTTP ${status}): ${message.slice(0, 200)}`;
  }
  return `fal 요청이 거부됐습니다(HTTP ${status}).`;
}

interface FalCallOutcome {
  readonly status: number;
  readonly payload: unknown;
}

/** fal REST 1회 호출 — JSON 파싱 실패는 payload=null로 두고 호출부가 판정한다. */
async function callFal(
  deps: StudioLoraClientDeps,
  apiKey: string,
  url: string,
  init: RequestInit,
): Promise<StudioLoraResult<FalCallOutcome>> {
  let response: Response;
  try {
    response = await resolveFetch(deps)(url, {
      ...init,
      headers: {
        Authorization: `Key ${apiKey.trim()}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    return failure("network_error", "fal 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.");
  }
  const payload: unknown = await response.json().catch(() => null);
  return { ok: true, data: { status: response.status, payload } };
}

export interface FalQueueSubmission {
  readonly requestId: string;
  readonly statusUrl: string | null;
  readonly responseUrl: string | null;
}

/** 큐 제출 응답 파싱(순수) — request_id가 없으면 계약 위반으로 본다. */
export function parseFalQueueSubmission(payload: unknown): FalQueueSubmission | null {
  if (!isRecord(payload)) return null;
  const requestId = readString(payload, "request_id");
  if (!requestId) return null;
  return {
    requestId,
    statusUrl: readString(payload, "status_url"),
    responseUrl: readString(payload, "response_url"),
  };
}

/**
 * 큐 제출 — **이 호출이 성공하는 순간부터 fal 계정 과금이 시작된다.**
 * 학습 제출·생성 제출이 공유하는 단일 진입점이다.
 */
async function submitFalQueueRequest(
  deps: StudioLoraClientDeps,
  apiKey: string,
  modelId: string,
  input: Record<string, unknown>,
): Promise<StudioLoraResult<FalQueueSubmission>> {
  if (!isStudioFalConfigured(apiKey)) {
    return failure("not_configured", "fal.ai 키가 등록되어 있지 않습니다.");
  }
  const outcome = await callFal(deps, apiKey, `${FAL_QUEUE_BASE_URL}/${modelId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!outcome.ok) return outcome;
  const { status, payload } = outcome.data;
  if (status < 200 || status >= 300) {
    return failure("provider_error", describeFalError(status, payload));
  }
  const submission = parseFalQueueSubmission(payload);
  if (!submission) {
    return failure("parse_error", "fal 큐 제출 응답에서 요청 ID를 찾지 못했습니다.");
  }
  return { ok: true, data: submission };
}

/** 학습 입력 조립(순수) — fal flux-lora-fast-training 입력 스키마 그대로다. */
export function buildFalLoraTrainingInput(options: {
  readonly imagesDataUrl: string;
  readonly triggerWord: string;
  readonly isStyle: boolean;
  readonly steps?: number;
}): Record<string, unknown> {
  const input: Record<string, unknown> = {
    images_data_url: options.imagesDataUrl,
    trigger_word: options.triggerWord,
    is_style: options.isStyle,
    create_masks: !options.isStyle,
  };
  if (typeof options.steps === "number" && Number.isFinite(options.steps) && options.steps > 0) {
    input["steps"] = Math.floor(options.steps);
  }
  return input;
}

/** LoRA 학습 잡 제출 — 과금은 이 호출부터다. 조회가 아니라 제출만 한다. */
export async function submitStudioLoraTraining(
  deps: StudioLoraClientDeps,
  apiKey: string,
  options: {
    readonly imagesDataUrl: string;
    readonly triggerWord: string;
    readonly isStyle: boolean;
    readonly steps?: number;
  },
): Promise<StudioLoraResult<FalQueueSubmission>> {
  if (!options.imagesDataUrl.trim()) {
    return failure("invalid_input", "학습 이미지 묶음 주소가 비어 있습니다.");
  }
  if (!options.triggerWord.trim()) {
    return failure("invalid_input", "트리거 워드를 입력하세요.");
  }
  return submitFalQueueRequest(deps, apiKey, FAL_LORA_TRAINING_MODEL_ID, buildFalLoraTrainingInput(options));
}

/**
 * fal 스토리지 업로드 — 학습 zip처럼 URL로 넘겨야 하는 파일을 올린다.
 * initiate(POST, 인증) → presigned upload_url에 PUT(인증 헤더 없음이 계약) 순서다.
 * 업로드 자체는 학습 제출과 별개로 fal 스토리지 정책의 적용을 받는다.
 */
export async function uploadStudioLoraFile(
  deps: StudioLoraClientDeps,
  apiKey: string,
  file: { readonly name: string; readonly contentType: string; readonly body: Blob },
): Promise<StudioLoraResult<{ readonly fileUrl: string }>> {
  if (!isStudioFalConfigured(apiKey)) {
    return failure("not_configured", "fal.ai 키가 등록되어 있지 않습니다.");
  }
  const initiated = await callFal(deps, apiKey, FAL_STORAGE_INITIATE_URL, {
    method: "POST",
    body: JSON.stringify({ file_name: file.name, content_type: file.contentType }),
  });
  if (!initiated.ok) return initiated;
  if (initiated.data.status < 200 || initiated.data.status >= 300) {
    return failure("provider_error", describeFalError(initiated.data.status, initiated.data.payload));
  }
  const payload = initiated.data.payload;
  const fileUrl = isRecord(payload) ? readString(payload, "file_url") : null;
  const uploadUrl = isRecord(payload) ? readString(payload, "upload_url") : null;
  if (!fileUrl || !uploadUrl) {
    return failure("parse_error", "fal 스토리지 업로드 응답에서 주소를 찾지 못했습니다.");
  }
  let putResponse: Response;
  try {
    putResponse = await resolveFetch(deps)(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.contentType },
      body: file.body,
    });
  } catch {
    return failure("network_error", "fal 스토리지에 파일을 올리지 못했습니다.");
  }
  if (!putResponse.ok) {
    return failure("provider_error", `fal 스토리지 업로드가 거부됐습니다(HTTP ${putResponse.status}).`);
  }
  return { ok: true, data: { fileUrl } };
}

export type FalQueueStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";

/** 큐 상태 응답 파싱(순수) — 문서화된 3종 외의 값은 null(미지)로 돌려준다. */
export function parseFalQueueStatus(payload: unknown): FalQueueStatus | null {
  if (!isRecord(payload)) return null;
  const status = payload["status"];
  if (status === "IN_QUEUE" || status === "IN_PROGRESS" || status === "COMPLETED") return status;
  return null;
}

export interface FalQueueStatusOutcome {
  readonly kind: "status";
  readonly status: FalQueueStatus | null;
  readonly httpStatus: number;
  readonly payload: unknown;
}

/** 큐 상태 조회(GET — 과금 없음). 제출 응답의 status_url을 우선 쓰고 없으면 조립한다. */
export async function fetchFalQueueStatus(
  deps: StudioLoraClientDeps,
  apiKey: string,
  target: { readonly modelId: string; readonly requestId: string; readonly statusUrl?: string | null },
): Promise<StudioLoraResult<FalQueueStatusOutcome>> {
  if (!isStudioFalConfigured(apiKey)) {
    return failure("not_configured", "fal.ai 키가 등록되어 있지 않습니다.");
  }
  const url = target.statusUrl
    ?? `${FAL_QUEUE_BASE_URL}/${target.modelId}/requests/${target.requestId}/status`;
  const outcome = await callFal(deps, apiKey, url, { method: "GET" });
  if (!outcome.ok) return outcome;
  return {
    ok: true,
    data: {
      kind: "status",
      status: parseFalQueueStatus(outcome.data.payload),
      httpStatus: outcome.data.status,
      payload: outcome.data.payload,
    },
  };
}

/** 큐 결과 조회(GET — 과금 없음). 완료된 요청의 산출물 JSON을 그대로 돌려준다. */
export async function fetchFalQueueResult(
  deps: StudioLoraClientDeps,
  apiKey: string,
  target: { readonly modelId: string; readonly requestId: string; readonly responseUrl?: string | null },
): Promise<StudioLoraResult<{ readonly httpStatus: number; readonly payload: unknown }>> {
  if (!isStudioFalConfigured(apiKey)) {
    return failure("not_configured", "fal.ai 키가 등록되어 있지 않습니다.");
  }
  const url = target.responseUrl
    ?? `${FAL_QUEUE_BASE_URL}/${target.modelId}/requests/${target.requestId}`;
  const outcome = await callFal(deps, apiKey, url, { method: "GET" });
  if (!outcome.ok) return outcome;
  return { ok: true, data: { httpStatus: outcome.data.status, payload: outcome.data.payload } };
}

export interface FalLoraTrainingResult {
  readonly loraFileUrl: string;
  readonly configFileUrl: string | null;
}

/** 학습 결과 파싱(순수) — diffusers_lora_file.url이 없으면 학습 산출물이 아니다. */
export function parseFalLoraTrainingResult(payload: unknown): FalLoraTrainingResult | null {
  if (!isRecord(payload)) return null;
  const loraFile = payload["diffusers_lora_file"];
  if (!isRecord(loraFile)) return null;
  const loraFileUrl = readString(loraFile, "url");
  if (!loraFileUrl) return null;
  const configFile = payload["config_file"];
  return {
    loraFileUrl,
    configFileUrl: isRecord(configFile) ? readString(configFile, "url") : null,
  };
}

/** 생성 입력 조립(순수) — fal flux-lora 입력 스키마의 loras 배열에 학습 파일을 건다. */
export function buildFalLoraGenerationInput(options: {
  readonly prompt: string;
  readonly loraFileUrl: string;
  readonly loraScale?: number;
}): Record<string, unknown> {
  return {
    prompt: options.prompt,
    loras: [{ path: options.loraFileUrl, scale: options.loraScale ?? 1 }],
    output_format: "png",
    num_images: 1,
  };
}

export interface FalGeneratedImage {
  readonly imageUrl: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly seed: number | null;
}

/** 생성 결과 파싱(순수) — images[0].url이 없으면 산출물이 아니다. */
export function parseFalLoraGenerationResult(payload: unknown): FalGeneratedImage | null {
  if (!isRecord(payload)) return null;
  const images = payload["images"];
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (!isRecord(first)) return null;
  const imageUrl = readString(first, "url");
  if (!imageUrl) return null;
  const width = first["width"];
  const height = first["height"];
  const seed = payload["seed"];
  return {
    imageUrl,
    width: typeof width === "number" && Number.isFinite(width) ? width : null,
    height: typeof height === "number" && Number.isFinite(height) ? height : null,
    seed: typeof seed === "number" && Number.isFinite(seed) ? seed : null,
  };
}

export interface StudioLoraGenerationPollOptions {
  /** 상태 조회 간격(ms). 기본 3초. */
  readonly pollIntervalMs?: number;
  /** 최대 상태 조회 횟수. 기본 40회(약 2분). */
  readonly maxPollAttempts?: number;
}

/**
 * 학습 모델로 이미지 생성 — 큐 제출(과금 시작) → 상태 폴링 → 결과 수신.
 * 폴링은 조회만 하므로 추가 과금은 제출 1건분뿐이다. 시간 초과는 실패로
 * 단정하지 않고 "아직 처리 중" 오류로 돌려준다(잡이 죽은 게 아니다).
 */
export async function generateStudioLoraImage(
  deps: StudioLoraClientDeps,
  apiKey: string,
  options: {
    readonly prompt: string;
    readonly loraFileUrl: string;
    readonly loraScale?: number;
  },
  poll: StudioLoraGenerationPollOptions = {},
): Promise<StudioLoraResult<FalGeneratedImage>> {
  if (!options.prompt.trim()) return failure("invalid_input", "생성할 장면을 입력하세요.");
  if (!options.loraFileUrl.trim()) return failure("invalid_input", "학습된 모델 파일 주소가 없습니다.");
  const submission = await submitFalQueueRequest(
    deps,
    apiKey,
    FAL_LORA_GENERATION_MODEL_ID,
    buildFalLoraGenerationInput(options),
  );
  if (!submission.ok) return submission;
  const sleep = deps.sleep ?? defaultSleep;
  const intervalMs = poll.pollIntervalMs ?? 3_000;
  const maxAttempts = poll.maxPollAttempts ?? 40;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    const statusOutcome = await fetchFalQueueStatus(deps, apiKey, {
      modelId: FAL_LORA_GENERATION_MODEL_ID,
      requestId: submission.data.requestId,
      statusUrl: submission.data.statusUrl,
    });
    if (!statusOutcome.ok) return statusOutcome;
    const { status, httpStatus, payload } = statusOutcome.data;
    if (httpStatus === 404) {
      return failure("provider_error", "fal에서 생성 요청을 찾을 수 없습니다.");
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      return failure("provider_error", describeFalError(httpStatus, payload));
    }
    if (status === "COMPLETED") {
      const result = await fetchFalQueueResult(deps, apiKey, {
        modelId: FAL_LORA_GENERATION_MODEL_ID,
        requestId: submission.data.requestId,
        responseUrl: submission.data.responseUrl,
      });
      if (!result.ok) return result;
      if (result.data.httpStatus < 200 || result.data.httpStatus >= 300) {
        return failure("provider_error", describeFalError(result.data.httpStatus, result.data.payload));
      }
      const image = parseFalLoraGenerationResult(result.data.payload);
      if (!image) return failure("parse_error", "fal 생성 결과에서 이미지를 찾지 못했습니다.");
      return { ok: true, data: image };
    }
    if (status === null) {
      return failure("parse_error", "fal 생성 상태 응답을 해석하지 못했습니다.");
    }
  }
  return failure(
    "network_error",
    "fal 생성이 제한 시간 안에 끝나지 않았습니다. 요청 자체는 fal에서 계속 처리될 수 있습니다.",
  );
}
