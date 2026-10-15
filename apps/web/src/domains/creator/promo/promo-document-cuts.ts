import {
  PROMO_DOCUMENT_CUTS_KIND,
  PROMO_DOCUMENT_CUTS_MAX,
  PROMO_DOCUMENT_CUTS_MAX_BYTES,
  PROMO_DOCUMENT_CUTS_VERSION,
  PROMO_DOCUMENT_DIALOGUES_MAX,
  PROMO_DOCUMENT_DIALOGUE_TEXT_MAX,
} from "./promo-handoff-contract";
import { localPromoPlan, promoDataUrl, promoMaxPanels } from "./promo-model";

import type { PromoPanel, PromoProject } from "./promo-model";

// 이름표와 상한은 Studio 내보내기와 공유하는 계약 파일에 있다. 기존 import 경로를 그대로 쓰도록 다시 내보낸다.
export {
  PROMO_DOCUMENT_CUTS_KIND,
  PROMO_DOCUMENT_CUTS_MAX,
  PROMO_DOCUMENT_CUTS_MAX_BYTES,
  PROMO_DOCUMENT_CUTS_VERSION,
  PROMO_DOCUMENT_DIALOGUES_MAX,
};

/**
 * Studio 문서의 컷(프레임)을 홍보 샷 초안으로 바꾸는 순수 규칙.
 *
 * 이 파일은 "컷 묶음" 계약과 초안 규칙만 안다. 컷 이미지는 Studio가 기존 페이지 캡처 경로로 만들어 묶음에
 * 담아 주며(export/studio-promo-cuts.ts), 여기서는 이미지를 새로 만들거나 컷을 자동 감지하지 않는다.
 * 이미지에서 컷을 찾는 기능은 별도 작업(panel) 몫이다.
 */
export const PROMO_CAPTION_LIMIT = 120;
export const PROMO_DESCRIPTION_LIMIT = 500;
/** 여러 말풍선을 한 자막으로 이을 때 쓰는 구분자 — 로케일 치환(promo-locale-batch)이 같은 규칙으로 되돌린다. */
export const PROMO_CAPTION_JOINER = " ";

export interface PromoDocumentDialogue {
  readonly id: string;
  readonly text: string;
}
export interface PromoDocumentCut {
  /** 묶음 안에서 유일한 컷 키(보통 `페이지ID:프레임ID`). */
  readonly id: string;
  readonly pageId: string;
  /** 문서에서 0부터 센 페이지 순번. */
  readonly pageIndex: number;
  readonly frameId: string;
  /** 문서 전체 읽기 순서(0부터). 페이지 → 컷(위→아래, 왼→오른) 순이다. */
  readonly order: number;
  /** 컷 영역만 잘라 낸 PNG·JPEG·WebP data URL. */
  readonly image: string;
  /** 이 컷 안의 말풍선·텍스트를 읽기 순서로 나열한 것. */
  readonly dialogues: readonly PromoDocumentDialogue[];
}
export interface PromoDocumentCutBundle {
  readonly kind: typeof PROMO_DOCUMENT_CUTS_KIND;
  readonly version: typeof PROMO_DOCUMENT_CUTS_VERSION;
  readonly documentId: string | null;
  readonly title: string;
  readonly cuts: readonly PromoDocumentCut[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedString(value: unknown, max: number, message: string): string {
  if (typeof value !== "string" || value.length > max) throw new Error(message);
  return value;
}
function identifier(value: unknown, message: string): string {
  const id = boundedString(value, 200, message);
  if (!id || id.trim() !== id) throw new Error(message);
  return id;
}
function integerIn(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(message);
  return value;
}

/** 묶음 JSON을 검증한다. 원격 URL·SVG·스크립트 이미지, 중복 ID, 범위를 벗어난 값은 모두 거절한다. */
export function parsePromoDocumentCutBundle(input: unknown): PromoDocumentCutBundle {
  if (!isRecord(input) || input.kind !== PROMO_DOCUMENT_CUTS_KIND) throw new Error("ToonStudio 컷 묶음 파일이 아니에요. Studio 내보내기 메뉴의 「홍보 쇼츠용 컷 묶음」으로 저장한 JSON을 선택해 주세요.");
  if (input.version !== PROMO_DOCUMENT_CUTS_VERSION) throw new Error("지원하지 않는 컷 묶음 버전이에요. Studio를 최신 버전으로 열어 다시 내보내 주세요.");
  if (!Array.isArray(input.cuts) || input.cuts.length > PROMO_DOCUMENT_CUTS_MAX) throw new Error(`컷 묶음은 컷을 ${PROMO_DOCUMENT_CUTS_MAX}개까지 담을 수 있어요. Studio에서 페이지 범위를 줄여 다시 내보내 주세요.`);
  const ids = new Set<string>();
  let mediaSize = 0;
  const cuts = input.cuts.map((item, index): PromoDocumentCut => {
    if (!isRecord(item)) throw new Error(`컷 ${index + 1}의 형식이 올바르지 않아요.`);
    const id = identifier(item.id, `컷 ${index + 1}의 ID가 올바르지 않아요.`);
    if (ids.has(id)) throw new Error(`컷 ID가 중복되었어요: ${id}`);
    ids.add(id);
    if (!Array.isArray(item.dialogues) || item.dialogues.length > PROMO_DOCUMENT_DIALOGUES_MAX) throw new Error(`컷 ${index + 1}의 대사 수가 올바르지 않아요.`);
    const dialogueIds = new Set<string>();
    const dialogues = item.dialogues.map((entry): PromoDocumentDialogue => {
      if (!isRecord(entry)) throw new Error(`컷 ${index + 1}의 대사 형식이 올바르지 않아요.`);
      const dialogueId = identifier(entry.id, `컷 ${index + 1}의 대사 ID가 올바르지 않아요.`);
      if (dialogueIds.has(dialogueId)) throw new Error(`컷 ${index + 1}의 대사 ID가 중복되었어요.`);
      dialogueIds.add(dialogueId);
      return { id: dialogueId, text: boundedString(entry.text, PROMO_DOCUMENT_DIALOGUE_TEXT_MAX, `컷 ${index + 1}의 대사가 너무 길어요.`) };
    });
    const image = promoDataUrl(item.image, "image");
    mediaSize += image.length;
    return {
      id,
      pageId: identifier(item.pageId, `컷 ${index + 1}의 페이지 ID가 올바르지 않아요.`),
      pageIndex: integerIn(item.pageIndex, 0, 10_000, `컷 ${index + 1}의 페이지 순번이 올바르지 않아요.`),
      frameId: identifier(item.frameId, `컷 ${index + 1}의 프레임 ID가 올바르지 않아요.`),
      order: integerIn(item.order, 0, 100_000, `컷 ${index + 1}의 읽기 순서가 올바르지 않아요.`),
      image,
      dialogues,
    };
  });
  if (mediaSize > PROMO_DOCUMENT_CUTS_MAX_BYTES) throw new Error("컷 이미지 합계가 너무 커요. Studio에서 페이지 범위를 줄여 다시 내보내 주세요.");
  return {
    kind: PROMO_DOCUMENT_CUTS_KIND,
    version: PROMO_DOCUMENT_CUTS_VERSION,
    documentId: input.documentId === null || input.documentId === undefined ? null : identifier(input.documentId, "문서 ID가 올바르지 않아요."),
    title: input.title === undefined ? "" : boundedString(input.title, 200, "작품 제목이 너무 길어요.").trim(),
    cuts,
  };
}

/** 파일에서 묶음을 읽는다. 크기를 먼저 확인하고, JSON이 아니면 이유를 알려 준다. */
export async function readPromoDocumentCutBundle(file: File): Promise<PromoDocumentCutBundle> {
  if (file.size === 0) throw new Error("빈 파일이에요. Studio에서 컷 묶음을 다시 내보내 주세요.");
  if (file.size > PROMO_DOCUMENT_CUTS_MAX_BYTES) throw new Error("컷 묶음 파일은 90MB 이하여야 해요. Studio에서 페이지 범위를 줄여 다시 내보내 주세요.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("JSON으로 읽을 수 없는 파일이에요. Studio에서 저장한 컷 묶음(.json)을 선택해 주세요.");
  }
  return parsePromoDocumentCutBundle(parsed);
}

export function serializePromoDocumentCutBundle(bundle: PromoDocumentCutBundle): string {
  return JSON.stringify(bundle);
}

// ── 자막 후보 ──────────────────────────────────────────────────────────────

/** 여러 말풍선을 이은 후보의 ID — 문서 말풍선 ID와 겹치지 않게 접두사를 둔다. */
export const PROMO_ALL_CANDIDATE_ID = "promo:all";
export interface PromoCaptionCandidate {
  /** 말풍선 ID. 여러 말풍선을 이은 후보는 PROMO_ALL_CANDIDATE_ID. */
  readonly id: string;
  readonly kind: "dialogue" | "all";
  /** 공백을 정리한 자막 문구(120자 이내). */
  readonly text: string;
  /** 120자를 넘어 잘라 낸 후보인가. */
  readonly truncated: boolean;
  readonly sourceIds: readonly string[];
}

/** 줄바꿈·연속 공백을 한 칸으로 접는다 — 자막 렌더러가 줄바꿈을 공백으로 다루는 규칙과 같다. */
export function normalizePromoCaption(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
const MEANINGFUL = /[\p{L}\p{N}]/u;
const SENTENCE_END = /[.!?。！？…]/u;

/**
 * 앞에서 units개(UTF-16 길이)까지 자른다. 프로젝트 검증(parsePromoProject)과 입력창 maxLength가 UTF-16 길이로 세므로
 * 같은 기준을 쓰고, 이모지 같은 서로게이트 쌍의 앞쪽 절반만 남기지는 않는다.
 */
function headByUnits(value: string, units: number): string {
  const head = value.slice(0, Math.max(0, units));
  const last = head.charCodeAt(head.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head;
}

/** 자막을 120자(UTF-16 길이) 안으로 줄인다. 문장 끝에서 끊을 수 있으면 거기까지, 아니면 말줄임표로 끝내고 잘렸음을 알린다. */
export function clampPromoCaption(text: string): { text: string; truncated: boolean } {
  if (text.length <= PROMO_CAPTION_LIMIT) return { text, truncated: false };
  const head = headByUnits(text, PROMO_CAPTION_LIMIT - 1);
  // 문장 끝에서 끊을 수 있으면 그 자리까지, 아니면 말줄임표로 끝낸다. 중간 문장을 조용히 버리지 않도록 truncated로 알린다.
  let cut = -1;
  for (let index = head.length - 1; index >= Math.floor(PROMO_CAPTION_LIMIT / 3); index -= 1) {
    if (SENTENCE_END.test(head.charAt(index))) { cut = index + 1; break; }
  }
  return { text: cut > 0 ? head.slice(0, cut).trim() : `${head.trim()}…`, truncated: true };
}

/**
 * 컷 하나의 자막 후보 — 말풍선마다 하나, 둘 이상이면 모두 이은 후보를 마지막에 둔다.
 * 기호뿐인 말풍선(의성어 "!!!" 등)과 같은 문구의 반복은 후보에서 뺀다. 번역하거나 고쳐 쓰지 않는다.
 */
export function promoCaptionCandidates(dialogues: readonly PromoDocumentDialogue[]): PromoCaptionCandidate[] {
  const entries: { id: string; normalized: string }[] = [];
  const seen = new Set<string>();
  for (const dialogue of dialogues) {
    const normalized = normalizePromoCaption(dialogue.text);
    if (!normalized || !MEANINGFUL.test(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push({ id: dialogue.id, normalized });
  }
  const candidates = entries.map((entry): PromoCaptionCandidate => {
    const clamped = clampPromoCaption(entry.normalized);
    return { id: entry.id, kind: "dialogue", text: clamped.text, truncated: clamped.truncated, sourceIds: [entry.id] };
  });
  if (entries.length > 1) {
    const joined = entries.map((entry) => entry.normalized).join(PROMO_CAPTION_JOINER);
    if (joined.length <= PROMO_CAPTION_LIMIT) candidates.push({ id: PROMO_ALL_CANDIDATE_ID, kind: "all", text: joined, truncated: false, sourceIds: entries.map((entry) => entry.id) });
  }
  return candidates;
}

// ── 초안 ───────────────────────────────────────────────────────────────────

export interface PromoCutDraft {
  readonly cut: PromoDocumentCut;
  readonly candidates: readonly PromoCaptionCandidate[];
  readonly include: boolean;
  readonly caption: string;
  /** 선택한 후보 ID. 후보와 다르게 직접 고친 자막은 null이다. */
  readonly candidateId: string | null;
}

/** 후보 ID를 자막 문구에서 되짚는다 — 후보와 글자 그대로 같을 때만 후보로 본다. */
export function promoCaptionCandidateIdFor(candidates: readonly PromoCaptionCandidate[], caption: string): string | null {
  return candidates.find((candidate) => candidate.text === caption)?.id ?? null;
}

/**
 * 컷 묶음 → 샷 초안. 읽기 순서(order → 페이지 → 원래 위치)로 정렬하고, 앞에서부터 capacity개만 기본 선택한다.
 * 기본 자막은 첫 말풍선이고, 대사가 없는 컷은 자막을 비워 둔다(지어내지 않는다).
 */
export function buildPromoCutDrafts(bundle: PromoDocumentCutBundle, capacity: number): PromoCutDraft[] {
  const ordered = bundle.cuts
    .map((cut, index) => ({ cut, index }))
    .sort((left, right) => left.cut.order - right.cut.order || left.cut.pageIndex - right.cut.pageIndex || left.index - right.index);
  return ordered.map(({ cut }, position) => {
    const candidates = promoCaptionCandidates(cut.dialogues);
    const first = candidates[0];
    return { cut, candidates, include: position < Math.max(0, capacity), caption: first?.text ?? "", candidateId: first?.id ?? null };
  });
}

export function selectedPromoCutCount(drafts: readonly PromoCutDraft[]): number {
  return drafts.filter((draft) => draft.include).length;
}

/** 컷을 선택/해제한다. 상한을 넘겨 선택하려 하면 목록을 그대로 돌려준다. */
export function togglePromoCutDraft(drafts: readonly PromoCutDraft[], cutId: string, include: boolean, capacity: number): PromoCutDraft[] {
  const target = drafts.find((draft) => draft.cut.id === cutId);
  if (!target || target.include === include) return [...drafts];
  if (include && selectedPromoCutCount(drafts) >= capacity) return [...drafts];
  return drafts.map((draft) => (draft.cut.id === cutId ? { ...draft, include } : draft));
}

export function setPromoCutDraftCandidate(drafts: readonly PromoCutDraft[], cutId: string, candidateId: string): PromoCutDraft[] {
  return drafts.map((draft) => {
    if (draft.cut.id !== cutId) return draft;
    const candidate = draft.candidates.find((item) => item.id === candidateId);
    return candidate ? { ...draft, caption: candidate.text, candidateId: candidate.id } : draft;
  });
}

export function setPromoCutDraftCaption(drafts: readonly PromoCutDraft[], cutId: string, caption: string): PromoCutDraft[] {
  return drafts.map((draft) => (draft.cut.id === cutId ? { ...draft, caption, candidateId: promoCaptionCandidateIdFor(draft.candidates, caption) } : draft));
}

export function movePromoCutDraft(drafts: readonly PromoCutDraft[], cutId: string, direction: -1 | 1): PromoCutDraft[] {
  const index = drafts.findIndex((draft) => draft.cut.id === cutId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= drafts.length) return [...drafts];
  const next = [...drafts];
  const current = next[index];
  const neighbor = next[target];
  if (!current || !neighbor) return [...drafts];
  next[index] = neighbor;
  next[target] = current;
  return next;
}

// ── 적용 ───────────────────────────────────────────────────────────────────

export type PromoCutApplyMode = "replace" | "append";
export type PromoCutApplyResult =
  | { readonly ok: true; readonly panels: PromoPanel[]; readonly added: number }
  | { readonly ok: false; readonly message: string };

function describeCut(cut: PromoDocumentCut): string {
  const text = cut.dialogues.map((dialogue) => normalizePromoCaption(dialogue.text)).filter(Boolean).join("\n");
  return text.length <= PROMO_DESCRIPTION_LIMIT ? text : `${headByUnits(text, PROMO_DESCRIPTION_LIMIT - 1)}…`;
}

/** 선택한 초안 → 홍보 컷. 모션·상대 길이는 프로젝트 길이에 맞는 로컬 연출 규칙(localPromoPlan)을 쓴다 — 10초는 숏폼 가중치다. */
export function promoPanelsFromCutDrafts(
  drafts: readonly PromoCutDraft[],
  project: PromoProject,
  mode: PromoCutApplyMode,
  newId: () => string = () => crypto.randomUUID(),
): PromoCutApplyResult {
  const chosen = drafts.filter((draft) => draft.include);
  if (!chosen.length) return { ok: false, message: "샷으로 쓸 컷을 하나 이상 골라 주세요." };
  const existing = mode === "append" ? project.panels.length : 0;
  const capacity = promoMaxPanels(project.seconds) - existing;
  if (chosen.length > capacity) {
    return { ok: false, message: capacity > 0 ? `${project.seconds}초 영상은 컷을 ${promoMaxPanels(project.seconds)}개까지 담을 수 있어요. 지금 ${capacity}개만 더 넣을 수 있으니 선택을 줄여 주세요.` : `${project.seconds}초 영상은 이미 컷이 가득 찼어요. 「현재 컷 교체」를 고르거나 컷을 먼저 지워 주세요.` };
  }
  for (const [index, draft] of chosen.entries()) {
    if (draft.caption.trim().length > PROMO_CAPTION_LIMIT) return { ok: false, message: `선택한 ${index + 1}번째 컷의 자막이 ${PROMO_CAPTION_LIMIT}자를 넘어요. 줄여서 다시 적용해 주세요.` };
  }
  const base: PromoPanel[] = chosen.map((draft) => ({
    id: newId(),
    src: draft.cut.image,
    description: describeCut(draft.cut),
    caption: draft.caption.trim(),
    motion: "push-in",
    fit: "contain",
    weight: 1,
  }));
  // 모션·상대 길이는 "보이는 자막" 기준으로만 계산한다. 설명으로 자막을 채우거나(localPromoPlan의 기본 동작)
  // 자막을 비운 컷의 길이를 설명 글자 수로 늘리지 않도록, 계획에는 설명을 빼고 넘긴 뒤 다시 붙인다.
  const planned = localPromoPlan({ ...project, panels: base.map((panel) => ({ ...panel, description: "" })) }, existing)
    .map((panel, index) => ({ ...panel, description: base[index]?.description ?? "", caption: base[index]?.caption ?? "" }));
  return { ok: true, panels: mode === "append" ? [...project.panels, ...planned] : planned, added: planned.length };
}
