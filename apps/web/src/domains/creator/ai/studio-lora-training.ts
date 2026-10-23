/**
 * 캐릭터·화풍 LoRA 학습 잡 — 데이터 모델, 학습 아카이브(zip) 조립, 잡 저장소,
 * 상태 새로고침(전이 규칙)을 한곳에 모은 순수 로직 모듈.
 *
 * 상태 전이 규칙(전부 fal 큐 API의 실제 응답이 근거 — 진행 흉내 금지):
 * - 제출 성공 → `queued` (fal IN_QUEUE)
 * - IN_PROGRESS → `training`
 * - COMPLETED + 결과에서 LoRA 파일 확인 → `completed` (모델이 캐릭터에 연결된 상태)
 * - 결과 조회가 오류 본문이거나 LoRA 파일이 없거나, 상태 조회가 404 → `failed`
 * - 네트워크 오류·5xx·미지 상태 → 상태를 바꾸지 않고 `lastError`만 남긴다.
 *   `lastError`에는 해석된 문구가 아니라 studio.aiError.fal.* 키(코드)와
 *   `lastErrorParams`를 저장하고, 표시 시점에 현재 로케일로 해석한다
 *   (영속 코드화, 설계 §3.2-④). 구 레코드의 해석済 문자열은 표시측
 *   헬퍼가 그대로 돌려준다.
 *   (일시 장애를 학습 실패로 단정하지 않기 위해서다)
 * - 이미 `completed`/`failed`인 잡은 새로고침해도 다시 조회하지 않는다.
 */

import {
  fetchFalQueueResult,
  fetchFalQueueStatus,
  parseFalLoraTrainingResult,
  FAL_LORA_TRAINING_MODEL_ID,
  type StudioLoraClientDeps,
  type StudioLoraResult,
} from "./studio-lora-fal";
import { resolveAiErrorText } from "./studio-ai-error-i18n";

export type StudioLoraJobKind = "character" | "style";
export type StudioLoraJobStatus = "queued" | "training" | "completed" | "failed";

/** 작가 그림체 모델의 선화 두께·터치 특성. */
export type StudioArtistLineWeight = "fine" | "balanced" | "bold" | "brush";
/** 작가 그림체 모델의 채색·명암 기법. */
export type StudioArtistShadingMode = "cel" | "soft-gradient" | "hatching" | "painterly";
/** 작가 그림체 모델의 대표 색감 무드. */
export type StudioArtistPaletteMood = "vibrant" | "pastel" | "monochrome" | "noir";

export interface StudioArtistStyleTrait {
  readonly lineWeight: StudioArtistLineWeight;
  readonly shadingMode: StudioArtistShadingMode;
  readonly paletteMood: StudioArtistPaletteMood;
  /** 작가명·작품명 출처 표기(선택). */
  readonly artistAttribution?: string;
}

export const DEFAULT_STUDIO_ARTIST_STYLE_TRAIT: StudioArtistStyleTrait = Object.freeze({
  lineWeight: "balanced",
  shadingMode: "cel",
  paletteMood: "vibrant",
});

export const STUDIO_ARTIST_LINE_WEIGHT_LABELS: Readonly<Record<StudioArtistLineWeight, string>> = Object.freeze({
  fine: "섬세한 세필 선화",
  balanced: "표준 웹툰 펜선",
  bold: "강렬한 굵은 외곽선",
  brush: "먹·붓터치 필압",
});

export const STUDIO_ARTIST_SHADING_MODE_LABELS: Readonly<Record<StudioArtistShadingMode, string>> = Object.freeze({
  cel: "깔끔한 셀 채색",
  "soft-gradient": "부드러운 그라데이션",
  hatching: "펜선 해칭 명암",
  painterly: "밀도 높은 회화풍",
});

export const STUDIO_ARTIST_PALETTE_MOOD_LABELS: Readonly<Record<StudioArtistPaletteMood, string>> = Object.freeze({
  vibrant: "선명한 K-웹툰 원색",
  pastel: "따뜻한 파스텔 톤",
  monochrome: "단색·흑백 만화 톤",
  noir: "느와르 하이콘트라스트",
});

const LINE_WEIGHT_PROMPT_TOKENS: Readonly<Record<StudioArtistLineWeight, string>> = {
  fine: "delicate fine lineart, crisp thin contours",
  balanced: "clean balanced manhwa lineart, expressive contours",
  bold: "bold dynamic ink outlines, strong silhouette weight",
  brush: "expressive calligraphy brush strokes, variable ink pressure",
};

const SHADING_MODE_PROMPT_TOKENS: Readonly<Record<StudioArtistShadingMode, string>> = {
  cel: "crisp cel shading, clean two-tone shadow planes",
  "soft-gradient": "soft atmospheric airbrush gradients, luminous skin shading",
  hatching: "detailed cross-hatching ink shadows, comic screentone texture",
  painterly: "rich painterly brushstrokes, dimensional color blending",
};

const PALETTE_MOOD_PROMPT_TOKENS: Readonly<Record<StudioArtistPaletteMood, string>> = {
  vibrant: "vibrant K-webtoon color palette, high clarity saturation",
  pastel: "soft pastel color harmony, gentle warm daylight",
  monochrome: "monochrome manga ink and screentone contrast",
  noir: "dramatic noir chiaroscuro lighting, deep desaturated shadows",
};

export interface StudioLoraTrainingJob {
  readonly id: string;
  /** 연결 대상 캐릭터/화풍 식별자 — 이름에서 만든 안정 슬러그다. */
  readonly characterId: string;
  /** 화면 표시용 캐릭터 또는 작가 그림체 이름(학습 신청 시점의 이름 스냅샷). */
  readonly characterLabel: string;
  readonly triggerWord: string;
  readonly kind: StudioLoraJobKind;
  readonly providerRequestId: string;
  readonly statusUrl: string | null;
  readonly responseUrl: string | null;
  readonly status: StudioLoraJobStatus;
  readonly loraFileUrl: string | null;
  readonly configFileUrl: string | null;
  readonly trainingImageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * 마지막 오류 코드 — studio.aiError.fal.* 키를 저장한다(해석된 문구 아님).
   * 구 레코드는 한국어 해석済 문자열이 들어 있을 수 있으며 표시측이
   * 그대로 표시한다(하위호환). 보간 값은 lastErrorParams에 분리 저장한다.
   */
  readonly lastError: string | null;
  /** lastError 코드의 보간 파라미터({status} 등). 구 레코드에는 없을 수 있다. */
  readonly lastErrorParams?: Readonly<Record<string, string | number>> | null;
  /** 작가 본인의 그림체 데이터 권리·소유 확인 여부. */
  readonly artistOwnershipConfirmed?: boolean;
  /** 화풍 학습(`kind === "style"`) 시 기록된 작가 그림체 특성 프로필. */
  readonly styleTraits?: StudioArtistStyleTrait | null;
}

/**
 * 잡의 마지막 오류를 표시 시점 로케일로 해석한다. lastError가 코드(키)면
 * 사전에서, 구 레코드의 해석済 문자열이면 그대로 돌려준다.
 */
export function studioLoraJobErrorText(job: StudioLoraTrainingJob): string | null {
  if (!job.lastError) return null;
  return resolveAiErrorText(job.lastError, job.lastErrorParams);
}

/** fal 학습 문서의 권고 하한 — "at least 4 images". 이보다 적으면 제출을 막는다. */
export const STUDIO_LORA_MIN_TRAINING_IMAGES = 4;
/** 화풍 일반화 품질이 안정되는 권장 이미지 매수. */
export const STUDIO_LORA_RECOMMENDED_STYLE_IMAGES = 8;
/** 한 번에 묶을 수 있는 학습 이미지 상한 — 브라우저 메모리에서 zip을 만들기 때문이다. */
export const STUDIO_LORA_MAX_TRAINING_IMAGES = 20;

/** 캐릭터·화풍 이름 → 안정 식별자. 한글이면 라틴/숫자만 남기고, 비면 기본값을 쓴다. */
export function studioLoraCharacterIdFromLabel(label: string): string {
  const slug = label
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? `lora-${slug}` : "lora-character";
}

/**
 * 트리거 워드 제안 — 학습 캡션에 박히는 고유 토큰이다. 라틴 문자·숫자·밑줄만
 * 허용하고, 이름에서 뽑을 문자가 없으면(한글 이름 등) 중립 기본값을 제안한다.
 * 어디까지나 제안이며 사용자가 고칠 수 있다.
 */
export function suggestStudioLoraTriggerWord(label: string): string {
  const cleaned = label.trim().replace(/[^A-Za-z0-9_]+/g, "");
  if (cleaned.length >= 2) return cleaned.slice(0, 24);
  return "toonchar";
}

/** 작가 화풍 특성을 프롬프트 토큰 문자열로 직렬화한다. */
export function describeStudioArtistStyleTraits(traits?: StudioArtistStyleTrait | null): string {
  if (!traits) return "";
  return [
    LINE_WEIGHT_PROMPT_TOKENS[traits.lineWeight],
    SHADING_MODE_PROMPT_TOKENS[traits.shadingMode],
    PALETTE_MOOD_PROMPT_TOKENS[traits.paletteMood],
  ]
    .filter(Boolean)
    .join(", ");
}

/** 생성 프롬프트에 트리거 워드(+화풍 학습 모델이면 작가 그림체 특성 토큰)가 없으면 앞에 붙인다. */
export function buildStudioLoraGenerationPrompt(job: StudioLoraTrainingJob, prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return trimmed;
  const trigger = job.triggerWord.trim();
  const traitTokens = job.kind === "style" ? describeStudioArtistStyleTraits(job.styleTraits) : "";
  const hasTrigger = trigger.length > 0 && trimmed.toLocaleLowerCase().includes(trigger.toLocaleLowerCase());
  const prefixParts: string[] = [];
  if (trigger && !hasTrigger) prefixParts.push(trigger);
  if (traitTokens && !trimmed.toLocaleLowerCase().includes(traitTokens.toLocaleLowerCase())) {
    prefixParts.push(traitTokens);
  }
  return prefixParts.length > 0 ? `${prefixParts.join(", ")}, ${trimmed}` : trimmed;
}

/** 학습 제출 직후의 잡 레코드 — 상태는 fal이 돌려준 제출 응답이 근거이다. */
export function createStudioLoraJobRecord(options: {
  readonly id: string;
  readonly characterLabel: string;
  readonly triggerWord: string;
  readonly kind: StudioLoraJobKind;
  readonly providerRequestId: string;
  readonly statusUrl: string | null;
  readonly responseUrl: string | null;
  readonly trainingImageCount: number;
  readonly nowIso?: string;
  readonly artistOwnershipConfirmed?: boolean;
  readonly styleTraits?: StudioArtistStyleTrait | null;
}): StudioLoraTrainingJob {
  const nowIso = options.nowIso ?? new Date().toISOString();
  return Object.freeze({
    id: options.id,
    characterId: studioLoraCharacterIdFromLabel(options.characterLabel),
    characterLabel: options.characterLabel,
    triggerWord: options.triggerWord,
    kind: options.kind,
    providerRequestId: options.providerRequestId,
    statusUrl: options.statusUrl,
    responseUrl: options.responseUrl,
    status: "queued",
    loraFileUrl: null,
    configFileUrl: null,
    trainingImageCount: options.trainingImageCount,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastError: null,
    lastErrorParams: null,
    ...(options.artistOwnershipConfirmed !== undefined
      ? { artistOwnershipConfirmed: options.artistOwnershipConfirmed }
      : {}),
    ...(options.styleTraits !== undefined
      ? { styleTraits: options.styleTraits ? Object.freeze({ ...options.styleTraits }) : null }
      : {}),
  });
}

// ── 학습 아카이브(zip) ─────────────────────────────────────────────────────
// 의존성을 늘리지 않기 위해 STORE(무압축) zip을 직접 쓴다 — 학습 이미지는
// 이미 압축된 PNG/JPEG라 무압축이어도 크기 손해가 거의 없고, fal은 zip을
// 풀어서 이미지만 읽는다. CRC32와 로컬/중앙 헤더는 ZIP 명세(APPNOTE) 그대로다.

const CRC32_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

export function studioLoraCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = (CRC32_TABLE[(crc ^ data[i]) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface StudioLoraArchiveEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

/** STORE 방식 zip 바이트를 만든다(순수·결정적 — 날짜는 1980-01-01로 고정). */
export function createStudioLoraArchive(
  entries: readonly StudioLoraArchiveEntry[],
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const pushU16 = (target: number[], value: number) => {
    target.push(value & 0xff, (value >>> 8) & 0xff);
  };
  const pushU32 = (target: number[], value: number) => {
    target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  };
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = studioLoraCrc32(entry.data);
    const local: number[] = [];
    pushU32(local, 0x04034b50);
    pushU16(local, 20);
    pushU16(local, 0x0800); // UTF-8 파일명 플래그
    pushU16(local, 0); // STORE
    pushU16(local, 0); // mod time
    pushU16(local, 0x21); // mod date = 1980-01-01
    pushU32(local, crc);
    pushU32(local, entry.data.length);
    pushU32(local, entry.data.length);
    pushU16(local, nameBytes.length);
    pushU16(local, 0);
    const localHeader = new Uint8Array(local);
    chunks.push(localHeader, nameBytes, entry.data);

    const centralHeader: number[] = [];
    pushU32(centralHeader, 0x02014b50);
    pushU16(centralHeader, 20);
    pushU16(centralHeader, 20);
    pushU16(centralHeader, 0x0800);
    pushU16(centralHeader, 0);
    pushU16(centralHeader, 0);
    pushU16(centralHeader, 0x21);
    pushU32(centralHeader, crc);
    pushU32(centralHeader, entry.data.length);
    pushU32(centralHeader, entry.data.length);
    pushU16(centralHeader, nameBytes.length);
    pushU16(centralHeader, 0); // extra
    pushU16(centralHeader, 0); // comment
    pushU16(centralHeader, 0); // disk
    pushU16(centralHeader, 0); // internal attrs
    pushU32(centralHeader, 0); // external attrs
    pushU32(centralHeader, offset);
    central.push(new Uint8Array(centralHeader), nameBytes);
    offset += localHeader.length + nameBytes.length + entry.data.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const part of central) centralSize += part.length;
  const end: number[] = [];
  pushU32(end, 0x06054b50);
  pushU16(end, 0);
  pushU16(end, 0);
  pushU16(end, entries.length);
  pushU16(end, entries.length);
  pushU32(end, centralSize);
  pushU32(end, centralStart);
  pushU16(end, 0);
  chunks.push(...central, new Uint8Array(end));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

const DATA_URL_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** data URL 이미지 → 아카이브 항목. 이미지가 아니면 null. */
export function studioLoraArchiveEntryFromDataUrl(
  dataUrl: string,
  index: number,
): StudioLoraArchiveEntry | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const mime = match[1] ?? "";
  const extension = DATA_URL_IMAGE_EXTENSIONS[mime];
  if (!extension) return null;
  const binary = atob(match[2] ?? "");
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i);
  const name = `image-${String(index + 1).padStart(2, "0")}.${extension}`;
  return { name, data };
}

// ── 잡 저장소 ──────────────────────────────────────────────────────────────

export interface StudioLoraJobStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const STUDIO_LORA_JOBS_STORAGE_KEY = "toonstudio-studio-lora-jobs-v1";

export function browserStudioLoraJobStorage(): StudioLoraJobStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJobString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readJobErrorParams(record: Record<string, unknown>): Readonly<Record<string, string | number>> | null {
  const value = record["lastErrorParams"];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const params: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") params[key] = entry;
    else if (typeof entry === "number" && Number.isFinite(entry)) params[key] = entry;
    else return null;
  }
  return params;
}

function normalizeStudioStyleTrait(value: unknown): StudioArtistStyleTrait | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const lineWeight = readJobString(record, "lineWeight");
  const shadingMode = readJobString(record, "shadingMode");
  const paletteMood = readJobString(record, "paletteMood");
  if (lineWeight !== "fine" && lineWeight !== "balanced" && lineWeight !== "bold" && lineWeight !== "brush") {
    return null;
  }
  if (shadingMode !== "cel" && shadingMode !== "soft-gradient" && shadingMode !== "hatching" && shadingMode !== "painterly") {
    return null;
  }
  if (paletteMood !== "vibrant" && paletteMood !== "pastel" && paletteMood !== "monochrome" && paletteMood !== "noir") {
    return null;
  }
  const artistAttribution = readJobString(record, "artistAttribution")?.trim();
  return Object.freeze({
    lineWeight,
    shadingMode,
    paletteMood,
    ...(artistAttribution ? { artistAttribution } : {}),
  });
}

function normalizeStudioLoraJob(value: unknown): StudioLoraTrainingJob | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = readJobString(record, "id");
  const characterId = readJobString(record, "characterId");
  const characterLabel = readJobString(record, "characterLabel");
  const triggerWord = readJobString(record, "triggerWord");
  const providerRequestId = readJobString(record, "providerRequestId");
  const status = readJobString(record, "status");
  const kind = readJobString(record, "kind");
  const createdAt = readJobString(record, "createdAt");
  const updatedAt = readJobString(record, "updatedAt");
  if (!id || !characterId || !characterLabel || !triggerWord || !providerRequestId || !createdAt || !updatedAt) {
    return null;
  }
  if (status !== "queued" && status !== "training" && status !== "completed" && status !== "failed") return null;
  if (kind !== "character" && kind !== "style") return null;
  const trainingImageCount = record["trainingImageCount"];
  const artistOwnershipConfirmed =
    typeof record["artistOwnershipConfirmed"] === "boolean" ? record["artistOwnershipConfirmed"] : undefined;
  const styleTraits =
    record["styleTraits"] !== undefined ? normalizeStudioStyleTrait(record["styleTraits"]) : undefined;
  return Object.freeze({
    id,
    characterId,
    characterLabel,
    triggerWord,
    kind,
    providerRequestId,
    statusUrl: readJobString(record, "statusUrl"),
    responseUrl: readJobString(record, "responseUrl"),
    status,
    loraFileUrl: readJobString(record, "loraFileUrl"),
    configFileUrl: readJobString(record, "configFileUrl"),
    trainingImageCount: typeof trainingImageCount === "number" && Number.isFinite(trainingImageCount)
      ? trainingImageCount
      : 0,
    createdAt,
    updatedAt,
    lastError: readJobString(record, "lastError"),
    lastErrorParams: readJobErrorParams(record),
    ...(artistOwnershipConfirmed !== undefined ? { artistOwnershipConfirmed } : {}),
    ...(styleTraits !== undefined ? { styleTraits } : {}),
  });
}

/** 저장된 잡 목록 로드 — 손상된 항목은 버리고 읽을 수 있는 것만 돌려준다. */
export function loadStudioLoraJobs(
  storage: StudioLoraJobStorage | null | undefined,
): readonly StudioLoraTrainingJob[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STUDIO_LORA_JOBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const jobs: StudioLoraTrainingJob[] = [];
    for (const item of parsed) {
      const job = normalizeStudioLoraJob(item);
      if (job) jobs.push(job);
    }
    return Object.freeze(jobs);
  } catch {
    return [];
  }
}

/** 잡 목록 저장. 성공 여부를 돌려준다(실패를 숨기지 않는다). */
export function saveStudioLoraJobs(
  storage: StudioLoraJobStorage | null | undefined,
  jobs: readonly StudioLoraTrainingJob[],
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STUDIO_LORA_JOBS_STORAGE_KEY, JSON.stringify(jobs));
    return true;
  } catch {
    return false;
  }
}

export function upsertStudioLoraJob(
  jobs: readonly StudioLoraTrainingJob[],
  next: StudioLoraTrainingJob,
): readonly StudioLoraTrainingJob[] {
  const index = jobs.findIndex((job) => job.id === next.id);
  if (index < 0) return Object.freeze([next, ...jobs]);
  const copy = [...jobs];
  copy[index] = next;
  return Object.freeze(copy);
}

export function removeStudioLoraJob(
  jobs: readonly StudioLoraTrainingJob[],
  jobId: string,
): readonly StudioLoraTrainingJob[] {
  return Object.freeze(jobs.filter((job) => job.id !== jobId));
}

/** 캐릭터에 연결된 완료 모델 — 가장 최근 완료 잡을 돌려준다. */
export function findCompletedStudioLoraJob(
  jobs: readonly StudioLoraTrainingJob[],
  characterId: string,
): StudioLoraTrainingJob | null {
  let best: StudioLoraTrainingJob | null = null;
  for (const job of jobs) {
    if (job.characterId !== characterId || job.status !== "completed" || !job.loraFileUrl) continue;
    if (!best || job.updatedAt > best.updatedAt) best = job;
  }
  return best;
}

/** 학습이 완료된 작가 그림체 모델(`kind === "style"`) 목록을 최신순으로 돌려준다. */
export function listCompletedStudioStyleModels(
  jobs: readonly StudioLoraTrainingJob[],
): readonly StudioLoraTrainingJob[] {
  return Object.freeze(
    jobs
      .filter((job) => job.kind === "style" && job.status === "completed" && Boolean(job.loraFileUrl))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}

/** 식별자·이름·트리거 워드로 완료된 작가 그림체 모델을 찾는다. */
export function findCompletedStudioStyleModel(
  jobs: readonly StudioLoraTrainingJob[],
  query: string,
): StudioLoraTrainingJob | null {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return null;
  const slug = studioLoraCharacterIdFromLabel(query);
  for (const job of listCompletedStudioStyleModels(jobs)) {
    if (
      job.id.toLocaleLowerCase() === normalized ||
      job.characterId.toLocaleLowerCase() === normalized ||
      job.characterId === slug ||
      job.characterLabel.trim().toLocaleLowerCase() === normalized ||
      job.triggerWord.trim().toLocaleLowerCase() === normalized
    ) {
      return job;
    }
  }
  return null;
}

export interface StudioStyleDatasetValidationResult {
  readonly ready: boolean;
  readonly validImageCount: number;
  readonly duplicateCount: number;
  readonly invalidFormatCount: number;
  readonly recommendedSteps: number;
  readonly qualityTier: "insufficient" | "minimum" | "optimal";
  readonly blockingReason: string | null;
  readonly coachingTip: string;
}

/**
 * 작가 그림체 학습 데이터셋 검증기 — 이미지 수량·중복·포맷·권리 확인 여부를 점검하고
 * 예비/전문 작가를 위한 학습 품질 코칭 팁을 돌려준다.
 */
export function validateStudioStyleTrainingDataset(options: {
  readonly images: readonly string[];
  readonly kind: StudioLoraJobKind;
  readonly artistOwnershipConfirmed?: boolean;
}): StudioStyleDatasetValidationResult {
  const seen = new Set<string>();
  let validImageCount = 0;
  let duplicateCount = 0;
  let invalidFormatCount = 0;
  options.images.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (seen.has(trimmed)) {
      duplicateCount += 1;
      return;
    }
    seen.add(trimmed);
    if (!studioLoraArchiveEntryFromDataUrl(trimmed, idx)) invalidFormatCount += 1;
    else validImageCount += 1;
  });
  const baseCounts = { validImageCount, duplicateCount, invalidFormatCount };
  if (options.kind === "style" && options.artistOwnershipConfirmed === false) {
    return Object.freeze({
      ...baseCounts,
      ready: false,
      recommendedSteps: 1000,
      qualityTier: "insufficient",
      blockingReason: "작가 본인의 창작 그림체 데이터(또는 학습 허락을 받은 원고)인지 확인해 주세요.",
      coachingTip: "작가 고유 화풍 보호를 위해 본인 소유 또는 명시적으로 허락된 학습 데이터만 모델로 생성할 수 있습니다.",
    });
  }
  if (invalidFormatCount > 0) {
    return Object.freeze({
      ...baseCounts,
      ready: false,
      recommendedSteps: 1000,
      qualityTier: "insufficient",
      blockingReason: "학습 세트에 지원하지 않는 형식의 이미지가 섞여 있습니다(PNG·JPEG·WebP만 가능).",
      coachingTip: "선화와 채색 경계가 깨지지 않도록 PNG 또는 고화질 WebP 원고를 권장합니다.",
    });
  }
  if (validImageCount < STUDIO_LORA_MIN_TRAINING_IMAGES) {
    return Object.freeze({
      ...baseCounts,
      ready: false,
      recommendedSteps: 1000,
      qualityTier: "insufficient",
      blockingReason: `학습 이미지가 ${validImageCount}장입니다. fal 학습은 최소 ${STUDIO_LORA_MIN_TRAINING_IMAGES}장을 권합니다.`,
      coachingTip:
        options.kind === "style"
          ? `클로즈업·미디엄·전신 컷과 대표 채색 컷을 섞어 최소 ${STUDIO_LORA_MIN_TRAINING_IMAGES}장(${STUDIO_LORA_RECOMMENDED_STYLE_IMAGES}장 이상 권장)을 담아 주세요.`
          : `정면·측면·반측면 표정이 보이는 컷을 최소 ${STUDIO_LORA_MIN_TRAINING_IMAGES}장 담아 주세요.`,
    });
  }
  if (validImageCount > STUDIO_LORA_MAX_TRAINING_IMAGES) {
    return Object.freeze({
      ...baseCounts,
      ready: false,
      recommendedSteps: 1400,
      qualityTier: "optimal",
      blockingReason: `학습 이미지는 최대 ${STUDIO_LORA_MAX_TRAINING_IMAGES}장까지 담을 수 있습니다.`,
      coachingTip: "가장 선명하고 화풍 특징이 잘 드러나는 대표 원고 20장 이내로 추려 주세요.",
    });
  }
  const qualityTier = validImageCount >= STUDIO_LORA_RECOMMENDED_STYLE_IMAGES ? "optimal" : "minimum";
  const recommendedSteps = Math.min(1600, Math.max(800, validImageCount * 110));
  const coachingTip =
    qualityTier === "optimal"
      ? "화풍 일반화에 충분한 데이터셋입니다! 스토리보드 컷 생성 시 선 굵기와 채색 톤이 안정적으로 재현됩니다."
      : `최소 학습 요건을 충족했습니다. ${STUDIO_LORA_RECOMMENDED_STYLE_IMAGES}장 이상 담으면 다양한 카메라 앵글에서도 그림체 일관성이 한층 높아집니다.`;
  return Object.freeze({
    ...baseCounts,
    ready: true,
    recommendedSteps,
    qualityTier,
    blockingReason: null,
    coachingTip,
  });
}

// ── 상태 새로고침 ──────────────────────────────────────────────────────────

export interface StudioLoraRefreshOutcome {
  readonly job: StudioLoraTrainingJob;
  /** 실제로 fal 조회를 했는지 — 종료 상태 잡은 조회하지 않는다. */
  readonly queried: boolean;
}

function withJobPatch(
  job: StudioLoraTrainingJob,
  patch: Partial<StudioLoraTrainingJob>,
  nowIso: string,
): StudioLoraTrainingJob {
  return Object.freeze({ ...job, ...patch, updatedAt: nowIso });
}

/**
 * 잡 상태 새로고침 — fal 상태 조회 1회(+완료 시 결과 조회 1회)로 전이를 판정한다.
 * 전이 규칙은 파일 헤더가 정본이다. 조회 자체의 실패(키 없음 등)는 잡을 바꾸지
 * 않고 오류를 그대로 돌려준다.
 */
export async function refreshStudioLoraJob(
  deps: StudioLoraClientDeps,
  apiKey: string,
  job: StudioLoraTrainingJob,
): Promise<StudioLoraResult<StudioLoraRefreshOutcome>> {
  if (job.status === "completed" || job.status === "failed") {
    return { ok: true, data: { job, queried: false } };
  }
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  const statusOutcome = await fetchFalQueueStatus(deps, apiKey, {
    modelId: FAL_LORA_TRAINING_MODEL_ID,
    requestId: job.providerRequestId,
    statusUrl: job.statusUrl,
  });
  if (!statusOutcome.ok) {
    // 키 미등록 등 호출 전 실패 — 잡은 그대로 두고 사유만 전한다.
    return statusOutcome;
  }
  const { status, httpStatus } = statusOutcome.data;
  const queriedResult = (patch: Partial<StudioLoraTrainingJob>): StudioLoraResult<StudioLoraRefreshOutcome> => ({
    ok: true,
    data: { queried: true, job: withJobPatch(job, patch, nowIso) },
  });
  if (httpStatus === 404) {
    return queriedResult({ status: "failed", lastError: "studio.aiError.fal.jobRequestNotFound", lastErrorParams: null });
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return queriedResult({ lastError: "studio.aiError.fal.jobStatusRejected", lastErrorParams: { status: httpStatus } });
  }
  if (status === "IN_QUEUE") {
    return queriedResult({ status: "queued", lastError: null, lastErrorParams: null });
  }
  if (status === "IN_PROGRESS") {
    return queriedResult({ status: "training", lastError: null, lastErrorParams: null });
  }
  if (status === "COMPLETED") {
    const result = await fetchFalQueueResult(deps, apiKey, {
      modelId: FAL_LORA_TRAINING_MODEL_ID,
      requestId: job.providerRequestId,
      responseUrl: job.responseUrl,
    });
    if (!result.ok) {
      return queriedResult({ lastError: "studio.aiError.fal.jobResultFetchFailed", lastErrorParams: null });
    }
    if (result.data.httpStatus < 200 || result.data.httpStatus >= 300) {
      return queriedResult({
        status: "failed",
        lastError: "studio.aiError.fal.jobEndedWithoutResult",
        lastErrorParams: { status: result.data.httpStatus },
      });
    }
    const parsed = parseFalLoraTrainingResult(result.data.payload);
    if (!parsed) {
      return queriedResult({
        status: "failed",
        lastError: "studio.aiError.fal.jobResultLoraMissing",
        lastErrorParams: null,
      });
    }
    return queriedResult({
      status: "completed",
      loraFileUrl: parsed.loraFileUrl,
      configFileUrl: parsed.configFileUrl,
      lastError: null,
      lastErrorParams: null,
    });
  }
  // 문서화되지 않은 상태 값 — 실패로 단정하지 않고 마지막 상태를 유지한다.
  return queriedResult({ lastError: "studio.aiError.fal.jobUnknownStatus", lastErrorParams: null });
}
