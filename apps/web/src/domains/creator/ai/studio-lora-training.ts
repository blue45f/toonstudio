/**
 * 캐릭터·화풍 LoRA 학습 잡 — 데이터 모델, 학습 아카이브(zip) 조립, 잡 저장소,
 * 상태 새로고침(전이 규칙)을 한곳에 모은 순수 로직 모듈.
 *
 * 상태 전이 규칙(전부 fal 큐 API의 실제 응답이 근거 — 진행 흉내 금지):
 * - 제출 성공 → `queued` (fal IN_QUEUE)
 * - IN_PROGRESS → `training`
 * - COMPLETED + 결과에서 LoRA 파일 확인 → `completed` (모델이 캐릭터에 연결된 상태)
 * - 결과 조회가 오류 본문이거나 LoRA 파일이 없거나, 상태 조회가 404 → `failed`
 * - 네트워크 오류·5xx·미지 상태 → 상태를 바꾸지 않고 `lastError`만 남긴다
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

export type StudioLoraJobKind = "character" | "style";
export type StudioLoraJobStatus = "queued" | "training" | "completed" | "failed";

export interface StudioLoraTrainingJob {
  readonly id: string;
  /** 연결 대상 캐릭터 식별자 — 캐릭터 이름에서 만든 안정 슬러그다. */
  readonly characterId: string;
  /** 화면 표시용 캐릭터 이름(학습 신청 시점의 이름 스냅샷). */
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
  readonly lastError: string | null;
}

/** fal 학습 문서의 권고 하한 — "at least 4 images". 이보다 적으면 제출을 막는다. */
export const STUDIO_LORA_MIN_TRAINING_IMAGES = 4;
/** 한 번에 묶을 수 있는 학습 이미지 상한 — 브라우저 메모리에서 zip을 만들기 때문이다. */
export const STUDIO_LORA_MAX_TRAINING_IMAGES = 20;

/** 캐릭터 이름 → 안정 식별자. 한글이면 라틴/숫자만 남기고, 비면 기본값을 쓴다. */
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

/** 생성 프롬프트에 트리거 워드가 없으면 앞에 붙인다(이미 있으면 그대로 둔다). */
export function buildStudioLoraGenerationPrompt(job: StudioLoraTrainingJob, prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return trimmed;
  const trigger = job.triggerWord.trim();
  if (!trigger) return trimmed;
  if (trimmed.toLocaleLowerCase().includes(trigger.toLocaleLowerCase())) return trimmed;
  return `${trigger}, ${trimmed}`;
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
  readonly nowIso: string;
}): StudioLoraTrainingJob {
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
    createdAt: options.nowIso,
    updatedAt: options.nowIso,
    lastError: null,
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
  if (httpStatus === 404) {
    return {
      ok: true,
      data: {
        queried: true,
        job: withJobPatch(job, {
          status: "failed",
          lastError: "fal에서 이 학습 요청을 찾을 수 없습니다(만료되었거나 취소됨).",
        }, nowIso),
      },
    };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      ok: true,
      data: {
        queried: true,
        job: withJobPatch(job, {
          lastError: `fal 상태 조회가 거부됐습니다(HTTP ${httpStatus}). 잠시 뒤 다시 시도해 주세요.`,
        }, nowIso),
      },
    };
  }
  if (status === "IN_QUEUE") {
    return { ok: true, data: { queried: true, job: withJobPatch(job, { status: "queued", lastError: null }, nowIso) } };
  }
  if (status === "IN_PROGRESS") {
    return { ok: true, data: { queried: true, job: withJobPatch(job, { status: "training", lastError: null }, nowIso) } };
  }
  if (status === "COMPLETED") {
    const result = await fetchFalQueueResult(deps, apiKey, {
      modelId: FAL_LORA_TRAINING_MODEL_ID,
      requestId: job.providerRequestId,
      responseUrl: job.responseUrl,
    });
    if (!result.ok) {
      return {
        ok: true,
        data: {
          queried: true,
          job: withJobPatch(job, {
            lastError: "학습은 끝났지만 결과를 가져오지 못했습니다. 다시 새로고침해 주세요.",
          }, nowIso),
        },
      };
    }
    if (result.data.httpStatus < 200 || result.data.httpStatus >= 300) {
      return {
        ok: true,
        data: {
          queried: true,
          job: withJobPatch(job, {
            status: "failed",
            lastError: `fal 학습이 결과 없이 종료됐습니다(HTTP ${result.data.httpStatus}).`,
          }, nowIso),
        },
      };
    }
    const parsed = parseFalLoraTrainingResult(result.data.payload);
    if (!parsed) {
      return {
        ok: true,
        data: {
          queried: true,
          job: withJobPatch(job, {
            status: "failed",
            lastError: "fal 학습 결과에서 LoRA 파일을 찾지 못했습니다.",
          }, nowIso),
        },
      };
    }
    return {
      ok: true,
      data: {
        queried: true,
        job: withJobPatch(job, {
          status: "completed",
          loraFileUrl: parsed.loraFileUrl,
          configFileUrl: parsed.configFileUrl,
          lastError: null,
        }, nowIso),
      },
    };
  }
  // 문서화되지 않은 상태 값 — 실패로 단정하지 않고 마지막 상태를 유지한다.
  return {
    ok: true,
    data: {
      queried: true,
      job: withJobPatch(job, {
        lastError: "fal이 알 수 없는 학습 상태를 돌려줬습니다. 잠시 뒤 다시 새로고침해 주세요.",
      }, nowIso),
    },
  };
}
