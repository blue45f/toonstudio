/**
 * 피드백 3요소 패킷 — 순수 모델.
 *
 * 근거: Ko et al., "We-toon" (ACM UIST '22) — 글·그림 분업 현장에서 소통 효율이
 * 가장 낮은 단계는 캐릭터 디자인과 초안 수정이었고, 원인은 텍스트 설명의 모호함과
 * 부적절한 레퍼런스로 인한 오해·수정 반복이었다. 처방은 피드백을
 * "무엇을(설명) + 어디를(영역 표시) + 어떻게(레퍼런스)" 3요소 패킷으로 묶는 것.
 *
 * 이 모델은 그 패킷의 판정 규칙만 소유한다(React 비의존):
 * - 세 요소가 모두 있어야 제출 가능 — 텍스트만 보내는 경로는 기본값에서 제외된다.
 * - 빈 요소는 요소 단위 안내 문구로 돌려줘 입력 UI가 그 자리에서 알려 줄 수 있다.
 * - 영역은 원고/비교 이미지 위 핀 좌표(0..1 정규화), 레퍼런스는 댓글 문서의
 *   구조화 첨부(StudioCommentReference)를 그대로 쓴다 — 비교 검수 핀도 같은
 *   스레드 문서를 공유하므로 패킷이 그대로 따라간다.
 */

import {
  STUDIO_COMMENTS_MAX_REFERENCES_PER_THREAD,
  type StudioCommentReference,
} from "../studio-comments";
import { clampPinCoordinate } from "./manuscript-pin-feedback-model";

/** 피드백 패킷의 세 요소 */
export type FeedbackPacketElement = "description" | "area" | "reference";

export const FEEDBACK_PACKET_ELEMENTS: readonly FeedbackPacketElement[] = [
  "description",
  "area",
  "reference",
] as const;

/** 요소별 표시 이름·빈 요소 안내 (한/영). UI는 useBilingual로 골라 쓴다. */
export const FEEDBACK_PACKET_ELEMENT_COPY: Readonly<
  Record<
    FeedbackPacketElement,
    {
      readonly labelKo: string;
      readonly labelEn: string;
      readonly guidanceKo: string;
      readonly guidanceEn: string;
    }
  >
> = {
  description: {
    labelKo: "설명 — 무엇을",
    labelEn: "Description — what",
    guidanceKo: "무엇을 어떻게 바꿔야 하는지 설명을 적어 주세요.",
    guidanceEn: "Describe what should change.",
  },
  area: {
    labelKo: "영역 표시 — 어디를",
    labelEn: "Area — where",
    guidanceKo: "원고에서 해당 위치를 클릭해 핀으로 영역을 표시해 주세요.",
    guidanceEn: "Click the spot on the manuscript to mark the area with a pin.",
  },
  reference: {
    labelKo: "레퍼런스 — 어떻게",
    labelEn: "Reference — how",
    guidanceKo:
      "원하는 결과를 보여 주는 레퍼런스 이미지 1개 이상을 붙여 주세요. 텍스트만으로는 표정·포즈가 자주 어긋나요.",
    guidanceEn:
      "Attach at least one reference image showing the intended result. Text alone often misses expressions and poses.",
  },
};

/** 영역 표시 — 원고/비교 이미지 위 핀 좌표 (0..1 정규화) */
export interface FeedbackPacketArea {
  readonly x: number;
  readonly y: number;
}

/** 작성 중인 피드백 패킷 초안 */
export interface FeedbackPacketDraft {
  readonly body: string;
  readonly area: FeedbackPacketArea | null;
  readonly references: readonly StudioCommentReference[];
}

/** 패킷 완성도 판정 결과 */
export interface FeedbackPacketEvaluation {
  /** 세 요소가 모두 있는가 */
  readonly complete: boolean;
  /** 제출 가능 여부 — complete와 같으며, 텍스트만의 제출은 항상 false다 */
  readonly canSubmit: boolean;
  readonly present: readonly FeedbackPacketElement[];
  readonly missing: readonly FeedbackPacketElement[];
  readonly referenceCount: number;
}

/** 좌표가 실제 영역 표시로 쓸 수 있는 값인지 (유한·0..1) */
export function isFeedbackPacketAreaMarked(area: FeedbackPacketArea | null): boolean {
  return (
    area !== null &&
    Number.isFinite(area.x) &&
    Number.isFinite(area.y) &&
    area.x >= 0 &&
    area.x <= 1 &&
    area.y >= 0 &&
    area.y <= 1
  );
}

/**
 * 패킷 완성도를 판정한다. 설명은 공백만으로는 인정하지 않고,
 * 레퍼런스는 1개 이상 첨부돼야 하며, 영역은 유효 좌표 핀이 있어야 한다.
 */
export function evaluateFeedbackPacket(draft: FeedbackPacketDraft): FeedbackPacketEvaluation {
  const present: FeedbackPacketElement[] = [];
  if (draft.body.trim().length > 0) present.push("description");
  if (isFeedbackPacketAreaMarked(draft.area)) present.push("area");
  if (draft.references.length > 0) present.push("reference");
  const missing = FEEDBACK_PACKET_ELEMENTS.filter((element) => !present.includes(element));
  const complete = missing.length === 0;
  return {
    complete,
    canSubmit: complete,
    present,
    missing,
    referenceCount: draft.references.length,
  };
}

/** 빈 요소 안내 문구 목록 (UI 체크리스트·제출 버튼 안내 공용, 한/영 쌍) */
export function feedbackPacketMissingGuidance(
  evaluation: FeedbackPacketEvaluation
): readonly { readonly element: FeedbackPacketElement; readonly ko: string; readonly en: string }[] {
  return evaluation.missing.map((element) => ({
    element,
    ko: FEEDBACK_PACKET_ELEMENT_COPY[element].guidanceKo,
    en: FEEDBACK_PACKET_ELEMENT_COPY[element].guidanceEn,
  }));
}

/**
 * 레퍼런스 동일성 키 — 출처 종류 + 출처 ID(보드·풀) 또는 이미지 URL.
 * 같은 비교 풀 항목·보드 항목을 두 번 붙이는 것을 이 키로 막는다.
 */
export function feedbackReferenceIdentityKey(reference: StudioCommentReference): string {
  return JSON.stringify([
    reference.sourceKind,
    reference.sourceId ?? "",
    reference.sourceId ? "" : (reference.imageUrl ?? ""),
  ]);
}

export function isSameFeedbackReference(
  left: StudioCommentReference,
  right: StudioCommentReference
): boolean {
  return feedbackReferenceIdentityKey(left) === feedbackReferenceIdentityKey(right);
}

/**
 * 레퍼런스 토글 — 없으면 붙이고 있으면 뗀다. 상한(STUDIO_COMMENTS_MAX_REFERENCES_PER_THREAD)에
 * 닿은 상태에서 새 항목을 붙이면 목록을 그대로 돌려줘 UI가 상한 안내를 띄울 수 있게 한다.
 */
export function toggleFeedbackPacketReference(
  references: readonly StudioCommentReference[],
  candidate: StudioCommentReference
): readonly StudioCommentReference[] {
  if (references.some((reference) => isSameFeedbackReference(reference, candidate))) {
    return references.filter((reference) => !isSameFeedbackReference(reference, candidate));
  }
  if (references.length >= STUDIO_COMMENTS_MAX_REFERENCES_PER_THREAD) return references;
  return [...references, candidate];
}

/** URL 직접 첨부 레퍼런스를 만든다 (라벨·URL 공백 정리, 빈 값이면 null) */
export function buildFeedbackReferenceFromUrl(input: {
  readonly id: string;
  readonly label: string;
  readonly imageUrl: string;
}): StudioCommentReference | null {
  const label = input.label.trim();
  const imageUrl = input.imageUrl.trim();
  if (!label || !imageUrl) return null;
  return { id: input.id, label, sourceKind: "url", imageUrl };
}

/**
 * 비교 검수 풀 항목 → 레퍼런스. 비교 화면에서 본 그 이미지가 곧 "어떻게"의 기준이 되며,
 * sourceId(poolItemId)로 비교 핀과 같은 풀 항목에 연결된다.
 */
export function buildFeedbackReferenceFromComparePoolItem(input: {
  readonly poolItemId: string;
  readonly label: string;
  readonly imageUrl?: string;
}): StudioCommentReference {
  return {
    id: `compare-ref:${input.poolItemId}`,
    label: input.label.trim() || "비교 이미지",
    sourceKind: "compare-pool",
    sourceId: input.poolItemId,
    ...(input.imageUrl?.trim() ? { imageUrl: input.imageUrl.trim() } : {}),
  };
}

/** 레퍼런스 보드 항목 → 레퍼런스 (보드 항목과 sourceId로 연결) */
export function buildFeedbackReferenceFromBoardItem(input: {
  readonly boardItemId: string;
  readonly label: string;
  readonly imageUrl?: string;
}): StudioCommentReference {
  return {
    id: `board-ref:${input.boardItemId}`,
    label: input.label.trim() || "레퍼런스",
    sourceKind: "reference-board",
    sourceId: input.boardItemId,
    ...(input.imageUrl?.trim() ? { imageUrl: input.imageUrl.trim() } : {}),
  };
}

/**
 * 저장된 핀(원고 핀·비교 검수 핀 공용)의 패킷 완성도를 판정한다.
 * 핀은 그 자체가 영역 표시이므로 area는 좌표 유효성으로 판정하고,
 * 설명은 긴급 접두사를 뗀 본문이 기준이다. 레거시 핀(레퍼런스 없음)은
 * reference가 빈 요소로 보고돼 목록·스레드에서 "레퍼런스 없음"으로 안내된다.
 */
export function evaluateFeedbackPacketForPin(pin: {
  readonly body: string;
  readonly x: number;
  readonly y: number;
  readonly references?: readonly StudioCommentReference[];
}): FeedbackPacketEvaluation {
  return evaluateFeedbackPacket({
    body: pin.body,
    area: { x: pin.x, y: pin.y },
    references: pin.references ?? [],
  });
}

/** 핀 좌표 → 패킷 영역 (클램프해서 항상 유효 범위로) */
export function feedbackPacketAreaFromPin(pin: FeedbackPacketArea): FeedbackPacketArea {
  return { x: clampPinCoordinate(pin.x), y: clampPinCoordinate(pin.y) };
}
