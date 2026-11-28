import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";

import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";
import type { BilingualText } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioAiAssistToolId } from "../../ai/studio-ai-assist-ux";
import {
  isStudioOpenAiAssistMode,
  isValidStudioOpenAiAssistSuccess,
  type StudioOpenAiAssistMode,
  type StudioOpenAiAssistSuccess,
} from "../../ai/studio-openai-creative-assist-client";

export type StudioProjectAssistantSectionId =
  | "overview"
  | "story"
  | "production"
  | "assets"
  | "review"
  | "export"
  | "settings";

export type AssistantSuggestionSpec = Readonly<{
  tool: StudioAiAssistToolId;
  openAiMode: StudioOpenAiAssistMode;
  label: BilingualText;
  prompt: BilingualText;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const STUDIO_ASSISTANT_SUGGESTIONS: Readonly<
  Record<StudioProjectAssistantSectionId, readonly AssistantSuggestionSpec[]>
> = Object.freeze({
  overview: [
    {
      tool: "composition",
      openAiMode: "idea-remix",
      label: { ko: "5가지 발상 넓히기", en: "5-angle idea remix" },
      prompt: {
        ko: "평범한 출퇴근길 지하철에서 우연히 시작되는 미스터리 웹툰 소재를 5가지 신선한 각도로 넓혀줘.",
        en: "Remix a subway commute mystery webtoon idea into 5 distinct angles.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "다음 장면 계획", en: "Plan next scene" },
      prompt: {
        ko: "주인공이 낯선 편지를 열어 보고 놀라 뒤돌아보는 오프닝 장면을 4컷 구성으로 나눠줘.",
        en: "Draft a 4-panel opening sequence where the lead opens a strange letter and turns around.",
      },
    },
    {
      tool: "palette",
      openAiMode: "idea-remix",
      label: { ko: "작품 색감 정리", en: "Refine project palette" },
      prompt: {
        ko: "현재 작품의 장르와 분위기에 맞는 일관된 색상과 연출 포인트를 제안해줘.",
        en: "Suggest consistent mood and direction cues for the project's genre.",
      },
    },
  ],
  story: [
    {
      tool: "dialogue",
      openAiMode: "dialogue-polish",
      label: { ko: "대사 다듬기", en: "Refine dialogue" },
      prompt: {
        ko: "“내가 어제 분명히 그 문서 절대 열어보지 말라고 말했잖아, 왜 내 말을 안 듣는 거야?”를 말풍선에 잘 읽히게 다듬어줘.",
        en: "Polish this long line so it reads naturally inside mobile speech balloons.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "대본을 컷으로", en: "Script to panels" },
      prompt: {
        ko: "현재 대본을 웹툰 컷 단위로 나누고 카메라 구도와 말풍선 여백을 제안해줘.",
        en: "Break the current script into webtoon panels with camera and balloon-space suggestions.",
      },
    },
    {
      tool: "character",
      openAiMode: "idea-remix",
      label: { ko: "소재 5각도 리믹스", en: "5-lens story remix" },
      prompt: {
        ko: "이번 회차 줄거리를 독자가 예측하기 어려운 반전·공감·디테일 5가지 시선으로 재해석해줘.",
        en: "Reinterpret this episode's premise from 5 fresh storytelling lenses.",
      },
    },
  ],
  production: [
    {
      tool: "background",
      openAiMode: "script-to-cuts",
      label: { ko: "배경 참고 만들기", en: "Create background reference" },
      prompt: {
        ko: "현재 컷의 카메라와 분위기에 맞는 배경·샷 구도 참고안을 만들어줘.",
        en: "Create background and shot framing references matching the current scene.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "컷 구성 개선", en: "Improve composition" },
      prompt: {
        ko: "현재 장면의 시선 흐름과 긴장감을 높이는 컷 분할 대안을 제안해줘.",
        en: "Suggest panel breakdowns that improve eye flow and dramatic tension.",
      },
    },
    {
      tool: "palette",
      openAiMode: "dialogue-polish",
      label: { ko: "말풍선 호흡 조절", en: "Adjust balloon pacing" },
      prompt: {
        ko: "액션 컷 사이에 들어갈 짧은 호흡의 대사 대안을 제안해줘.",
        en: "Suggest concise dialogue alternatives that fit fast action beats.",
      },
    },
  ],
  assets: [
    {
      tool: "character",
      openAiMode: "idea-remix",
      label: { ko: "캐릭터 연출 아이디어", en: "Character hook ideas" },
      prompt: {
        ko: "주인공의 성격을 소품과 행동 하나로 보여 줄 수 있는 첫 등장 컷 아이디어를 제안해줘.",
        en: "Suggest first-appearance panel hooks that show character personality through action.",
      },
    },
    {
      tool: "palette",
      openAiMode: "export-preflight-coach",
      label: { ko: "작품 소개글 다듬기", en: "Polish series blurb" },
      prompt: {
        ko: "작품 표지와 함께 걸어 둘 매력적인 한 줄 소개글과 주의할 표현을 점검해줘.",
        en: "Check and polish a one-line series blurb to pair with the cover.",
      },
    },
  ],
  review: [
    {
      tool: "dialogue",
      openAiMode: "dialogue-polish",
      label: { ko: "대사 검토", en: "Review dialogue" },
      prompt: {
        ko: "검토 중인 대사의 어색한 표현을 덜어내고 모바일에서 읽기 편한 길이로 다듬어줘.",
        en: "Trim awkward phrasing and fit review dialogue cleanly for mobile reading.",
      },
    },
    {
      tool: "composition",
      openAiMode: "script-to-cuts",
      label: { ko: "연출 검토", en: "Review direction" },
      prompt: {
        ko: "검토 중인 장면의 시선 흐름과 스크롤 여백을 살리는 컷 구성을 제안해줘.",
        en: "Suggest panel pacing and scroll gaps for smoother transitions.",
      },
    },
  ],
  export: [
    {
      tool: "dialogue",
      openAiMode: "export-preflight-coach",
      label: { ko: "글자 가독성·소개글 점검", en: "Check readability & blurb" },
      prompt: {
        ko: "1화 공개 전 독자 눈길이 멈추는 회차 소개글과 말풍선 가독성 점검표를 만들어줘.",
        en: "Prepare an episode release blurb and pre-export readability checklist.",
      },
    },
    {
      tool: "palette",
      openAiMode: "dialogue-polish",
      label: { ko: "마지막 대사 다듬기", en: "Final line polish" },
      prompt: {
        ko: "회차 마지막 컷의 엔딩 대사를 다음 화가 궁금해지도록 자연스럽게 다듬어줘.",
        en: "Polish the cliffhanger line in the final panel so readers want the next episode.",
      },
    },
  ],
  settings: [
    {
      tool: "palette",
      openAiMode: "export-preflight-coach",
      label: { ko: "작품 기본 소개 정리", en: "Organize series summary" },
      prompt: {
        ko: "이 작품의 장르와 독자층에 어울리는 작품 소개 문구와 연재 전 확인 항목을 정리해줘.",
        en: "Summarize series blurb ideas and pre-serial checks for this genre.",
      },
    },
  ],
});

export function defaultOpenAiModeForSection(
  section: StudioProjectAssistantSectionId,
): StudioOpenAiAssistMode {
  if (section === "overview" || section === "assets") return "idea-remix";
  if (section === "story" || section === "production") return "script-to-cuts";
  if (section === "review") return "dialogue-polish";
  return "export-preflight-coach";
}

const SESSION_KEY_PREFIX = "toonstudio:assistant-draft:v2:";

/** 이전 프로젝트 단독 키에는 소유자 정보가 없어 자동 복원하지 않는다. */
export function studioAssistantSessionKey(projectId: string, ownerId: string | null = null): string {
  const scope = ownerId === null ? ["guest", projectId] : ["account", ownerId, projectId];
  return SESSION_KEY_PREFIX + JSON.stringify(scope);
}

export interface StudioAssistantPendingRequest {
  readonly key: string;
  readonly requestHash: string;
  readonly issuedAt: number;
}

// 서버의 유료 작업 영수증 보존 기간이다. 만료하면 사용자가 새 생성을 직접 선택해야 한다.
const RECEIPT_RETENTION_MS = 30 * 60 * 1_000;
const MAX_PENDING_REQUESTS = 32;

function readPendingRequest(value: unknown): StudioAssistantPendingRequest | undefined {
  if (!isRecord(value) || typeof value.key !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.key) ||
    typeof value.requestHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.requestHash) ||
    typeof value.issuedAt !== "number" || !Number.isSafeInteger(value.issuedAt) || value.issuedAt <= 0) return undefined;
  return { key: value.key, requestHash: value.requestHash, issuedAt: value.issuedAt };
}

const MAX_PROMPT_CHARS = 6_000;
// 기존 결과 저장 공간에 제출 원문 필드의 최대 JSON 이스케이프 길이를 더한다.
const MAX_SESSION_CHARS = 64_000 + ',"submittedPrompt":""'.length + MAX_PROMPT_CHARS * 6 + MAX_PENDING_REQUESTS * 200;

export interface StudioAssistantSessionSnapshot {
  readonly prompt: string;
  readonly openAiMode: StudioOpenAiAssistMode;
  readonly lastResult: StudioOpenAiAssistSuccess | null;
  readonly submittedPrompt?: string;
  readonly pendingRequests?: readonly StudioAssistantPendingRequest[];
}

function readSubmittedPrompt(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= MAX_PROMPT_CHARS && value.trim()
    ? value
    : undefined;
}

/** 명시한 null/Storage를 우선하고, 기본 브라우저 저장소 getter 거부만 안전하게 처리한다. */
function resolveStudioAssistantSessionStorage(override: Storage | null | undefined): Storage | null {
  if (override !== undefined) return override;
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readSessionRecord(storage: Storage, projectId: string, ownerId: string | null): Record<string, unknown> | null {
  const raw = storage.getItem(studioAssistantSessionKey(projectId, ownerId));
  if (raw === null) return null;
  if (raw.length > MAX_SESSION_CHARS) throw new Error("도우미 탭 기록이 저장 한도를 초과했습니다.");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error("도우미 탭 기록의 형식이 잘못되었습니다.");
  return parsed;
}

/** 읽을 수 없는 표식이 하나라도 있으면 기존 요청을 덮어쓰거나 새로 보내지 않는다. */
function readPendingRequests(record: Record<string, unknown> | null, ownerId: string | null): StudioAssistantPendingRequest[] | null {
  if (!ownerId || !record) return [];
  const list = record.pendingRequests === undefined ? [] : record.pendingRequests;
  if (!Array.isArray(list) || list.length > MAX_PENDING_REQUESTS) return null;
  // 도입 초기의 v2 저장본에는 같은 소유 범위 안에 단일 표식만 있다.
  const values = record.pendingRequest === undefined ? list : [...list, record.pendingRequest];
  const byHash = new Map<string, StudioAssistantPendingRequest>();
  for (const value of values) {
    const marker = readPendingRequest(value);
    if (!marker) return null;
    const previous = byHash.get(marker.requestHash);
    if (previous && (previous.key !== marker.key || previous.issuedAt !== marker.issuedAt)) return null;
    byHash.set(marker.requestHash, marker);
  }
  return byHash.size <= MAX_PENDING_REQUESTS ? [...byHash.values()] : null;
}

function readDraft(record: Record<string, unknown> | null, pendingRequests: readonly StudioAssistantPendingRequest[]): StudioAssistantSessionSnapshot | null {
  if (!record) return null;
  const prompt = typeof record.prompt === "string" ? record.prompt : record.inputText;
  const openAiMode = record.openAiMode ?? record.mode;
  if (typeof prompt !== "string" || !isStudioOpenAiAssistMode(openAiMode)) return null;
  const lastResult = isValidStudioOpenAiAssistSuccess(record.lastResult) ? record.lastResult : null;
  if (!prompt.trim() && !lastResult && pendingRequests.length === 0) return null;
  const submittedPrompt = lastResult ? readSubmittedPrompt(record.submittedPrompt) : undefined;
  return {
    prompt: prompt.slice(0, MAX_PROMPT_CHARS),
    openAiMode,
    lastResult,
    ...(submittedPrompt === undefined ? {} : { submittedPrompt }),
    ...(pendingRequests.length ? { pendingRequests } : {}),
  };
}

export function readStudioAssistantSessionState(
  projectId: string,
  storageOverride?: Storage | null,
  ownerId: string | null = null,
): StudioAssistantSessionSnapshot | null {
  const storage = resolveStudioAssistantSessionStorage(storageOverride);
  if (!storage || !projectId) return null;
  try {
    const record = readSessionRecord(storage, projectId, ownerId);
    return readDraft(record, readPendingRequests(record, ownerId) ?? []);
  } catch {
    return null;
  }
}

function persistSnapshot(
  storage: Storage, projectId: string, ownerId: string | null,
  snapshot: StudioAssistantSessionSnapshot, pendingRequests: readonly StudioAssistantPendingRequest[],
  clearDefaultDraft = false,
): void {
  const sanitizedResult = isValidStudioOpenAiAssistSuccess(snapshot.lastResult) ? snapshot.lastResult : null;
  if (!sanitizedResult && pendingRequests.length === 0 && (clearDefaultDraft || !snapshot.prompt.trim())) {
    storage.removeItem(studioAssistantSessionKey(projectId, ownerId));
    return;
  }
  storage.setItem(
    studioAssistantSessionKey(projectId, ownerId),
    JSON.stringify({
      prompt: snapshot.prompt.slice(0, MAX_PROMPT_CHARS),
      openAiMode: snapshot.openAiMode,
      lastResult: sanitizedResult,
      submittedPrompt: sanitizedResult ? readSubmittedPrompt(snapshot.submittedPrompt) : undefined,
      pendingRequests: pendingRequests.length ? pendingRequests : undefined,
    }),
  );
}

export function writeStudioAssistantSessionState(
  projectId: string,
  snapshot: StudioAssistantSessionSnapshot,
  storageOverride?: Storage | null,
  ownerId: string | null = null,
  clearDefaultDraft = false,
): void {
  const storage = resolveStudioAssistantSessionStorage(storageOverride);
  if (!storage || !projectId || !isStudioOpenAiAssistMode(snapshot.openAiMode)) return;
  try {
    // 다른 패널의 완료·추가를 취소하지 않도록 React가 보관한 과거 표식은 쓰지 않는다.
    const pending = readPendingRequests(readSessionRecord(storage, projectId, ownerId), ownerId);
    if (pending) persistSnapshot(storage, projectId, ownerId, snapshot, pending, clearDefaultDraft);
  } catch {
    // 저장 실패 때도 기존 탭 기록과 화면의 편집 상태를 유지한다.
  }
}

export function clearStudioAssistantSessionState(
  projectId: string,
  storageOverride?: Storage | null,
  ownerId: string | null = null,
): void {
  writeStudioAssistantSessionState(projectId, { prompt: "", openAiMode: "script-to-cuts", lastResult: null },
    storageOverride, ownerId);
}

type PreparedRequest =
  | { kind: "ready"; pending: StudioAssistantPendingRequest }
  | { kind: "expired"; key: string }
  | { kind: "pending-limit" }
  | { kind: "storage-unavailable" };

/** 같은 탭에서 중간 await 없이 현재 표식을 읽고 쓰며, 보관을 확인한 키만 송신한다. */
export function prepareStudioAssistantRequest(
  projectId: string, ownerId: string, snapshot: StudioAssistantSessionSnapshot, requestBody: string,
  confirmedExpiredKey?: string,
): PreparedRequest {
  const storage = resolveStudioAssistantSessionStorage(undefined);
  if (!storage || !projectId || !ownerId) return { kind: "storage-unavailable" };
  const requestHash = sha256HexPortable(new TextEncoder().encode(requestBody));
  let pendingRequests: StudioAssistantPendingRequest[] | null;
  try {
    pendingRequests = readPendingRequests(readSessionRecord(storage, projectId, ownerId), ownerId);
  } catch {
    return { kind: "storage-unavailable" };
  }
  if (!pendingRequests) return { kind: "storage-unavailable" };
  const now = Date.now();
  const previous = pendingRequests.find((entry) => entry.requestHash === requestHash);
  if (previous) {
    const age = now - previous.issuedAt;
    if (age >= 0 && age < RECEIPT_RETENTION_MS) return { kind: "ready", pending: previous };
    if (previous.key !== confirmedExpiredKey) return { kind: "expired", key: previous.key };
  } else if (pendingRequests.length >= MAX_PENDING_REQUESTS) {
    return { kind: "pending-limit" };
  }

  const pending = { key: createSecureRandomUuid(), requestHash, issuedAt: now };
  const updated = previous ? pendingRequests.map((entry) => entry === previous ? pending : entry) : [...pendingRequests, pending];
  try {
    persistSnapshot(storage, projectId, ownerId, snapshot, updated);
    const stored = readPendingRequests(readSessionRecord(storage, projectId, ownerId), ownerId);
    if (stored?.length === updated.length && stored.every((entry, index) => {
      const expected = updated[index];
      return expected?.key === entry.key && expected.requestHash === entry.requestHash && expected.issuedAt === entry.issuedAt;
    })) {
      return { kind: "ready", pending };
    }
  } catch {
    // 요청을 보관할 수 없는 탭에서는 공급자 호출을 시작하지 않는다.
  }
  return { kind: "storage-unavailable" };
}

/** 성공한 작업의 키만 제거한다. 이전 시도의 지연 응답은 명시적으로 교체된 키를 완료할 수 없다. */
export function completeStudioAssistantRequest(
  projectId: string, ownerId: string, completed: StudioAssistantPendingRequest,
  result?: { lastResult: StudioOpenAiAssistSuccess; submittedPrompt: string },
): void {
  const storage = resolveStudioAssistantSessionStorage(undefined);
  if (!storage) return;
  try {
    const record = readSessionRecord(storage, projectId, ownerId);
    const pending = readPendingRequests(record, ownerId);
    if (!pending) return;
    const remaining = pending.filter((entry) => entry.requestHash !== completed.requestHash || entry.key !== completed.key);
    if (remaining.length === pending.length) return;
    const draft = readDraft(record, pending);
    if (draft) persistSnapshot(storage, projectId, ownerId, { ...draft, ...result }, remaining);
  } catch {
    // 완료 기록 쓰기가 실패하면 원래 키가 남아 다음 확인 때 재생성을 막는다.
  }
}
