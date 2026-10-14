/**
 * Studio Dialogue OCR Import — 외국어 회차 이미지에서 뽑은 대사(OCR 결과)를
 * "번역 초안 → 자동 배치 → 사람 검수 → 승인분만 캔버스 반영"까지 잇는 순수 코어.
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * 기존 번역 동선(studio-dialogue-translate.ts)은 "이미 캔버스에 있는 대사"를 다른
 * 언어로 옮기는 BYOK 흐름이고, 검수(studio-dialogue-review.ts)는 적용된 번역의
 * 사후 대조다. 그런데 해외 작품을 들여오거나 이미지로만 남은 회차를 현지화할 때는
 * 출발점이 캔버스 요소가 아니라 **이미지 속 글자**다. OCR 결과(텍스트+위치+신뢰도)를
 * 받아 읽기 순서 초안으로 정리하고, 번역이 붙을 자리와 말풍선 배치까지 계산해
 * "검수 대기" 큐로 넘기는 진입 계층이 없었다.
 *
 * 이 모듈이 추가하는 것:
 *  · OCR 블록 정규화 — 빈 블록 제거, 줄 단위 공백 정리, 읽기 순서(위→아래 행 밴드,
 *    같은 행이면 왼쪽→오른쪽) 정렬, 신뢰도 정규화(0~1 밖·NaN은 "모름"=null).
 *  · 자동 배치 — 위치 박스가 있는 블록은 그 박스를(패널이 주어지면 패널 안으로
 *    클램프해) 그대로 쓰고, 박스가 없는 블록은 기존 자동 배치 코어
 *    (studio-bubble-auto-layout.ts의 autoLayoutBalloons)에 위임한다. 패널 크기를
 *    모르면 결정적 세로 쌓기(stack)로 대체하고 배치 출처를 초안에 그대로 남긴다.
 *  · 번역 연결점 — 번역이 필요한 초안을 기존 번역 코어의 입력 형태
 *    (DialogueTranslatableItem)로 내보내고, 결과(Map)를 다시 초안에 채운다.
 *    이 모듈은 네트워크를 호출하지 않는다 — 실제 번역 생성(BYOK)은 기존
 *    studio-ai-client.ts 경로가 사용자 실행으로만 담당한다(비용 단계 분리).
 *  · 사람 검수 게이트 — 초안은 전부 "검수 대기"로 시작한다. 번역문을 고치면 검수
 *    상태는 자동으로 사라지고(고쳐진 문장을 예전 승인으로 통과시키지 않는다 —
 *    studio-dialogue-review.ts와 같은 정직성 규칙), 번역이 없는 초안은 승인할 수
 *    없다. 캔버스 반영(buildOcrImportElements)은 승인된 초안만 요소로 만들고,
 *    나머지는 사유와 함께 blocked로 돌려준다(조용히 버리지 않는다).
 *
 * 정직성 규칙:
 *  · OCR이 읽지 못한 것은 지어내지 않는다. 빈 텍스트 블록은 초안이 되지 않고
 *    skippedEmpty로 셈만 남는다. 신뢰도가 없으면 null이지 1.0이 아니다.
 *  · 배치는 추정이면 추정이라고 말한다(placementSource). 패널을 모르는 상태의
 *    쌓기 배치를 "OCR 위치"처럼 보이지 않는다.
 *  · 배치 크기는 번역 전 원문 길이 기준 추정이다 — 번역문 길이가 달라지면 넘침은
 *    기존 현지화 QA(studio-localization-qa.ts)의 몫으로 남는다.
 *
 * 규칙(번역·검수 코어와 동일 규율):
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 사용자 노출 문자열은 한글.
 *  - 입력 배열/객체는 절대 변형하지 않는다. 바뀐 초안·페이지만 새 객체로 만들고,
 *    바뀐 것이 하나도 없으면 입력 배열을 그대로(참조 동일) 돌려준다.
 */

import {
  autoLayoutBalloons,
  estimateBalloonSize,
  type AutoLayoutPanel,
} from "./studio-bubble-auto-layout";
import type { DialogueElementLike, DialoguePageLike } from "./studio-dialogue-batch";
import type { DialogueReviewStatus } from "./studio-dialogue-review";
import type { DialogueTranslatableItem } from "./studio-dialogue-translate";

// ── 입력(OCR 공급자 결과 — 공급자는 이 모듈 밖에 있다) ─────────────────────

/** OCR 블록 1건. box는 페이지 좌표(px) — 없는 공급자(텍스트만)도 허용한다. */
export interface OcrTextBlock {
  /** 공급자가 준 식별자. 없으면 페이지·순번으로 결정적으로 만든다. */
  id?: string;
  text: string;
  box?: { x: number; y: number; width: number; height: number };
  /** 0~1 인식 신뢰도. 없거나 숫자가 아니면 "모름"으로 다룬다. */
  confidence?: number;
}

/** 페이지 1장의 OCR 입력. panel을 알면 박스 클램프·자동 배치에 쓰고, 모르면 쌓기 배치. */
export interface OcrPageInput {
  pageId: string;
  panel?: AutoLayoutPanel;
  blocks: readonly OcrTextBlock[];
}

export interface OcrImportOptions {
  /** 이 값보다 낮은 신뢰도는 lowConfidence로 표시한다. 기본 0.6. */
  lowConfidenceThreshold?: number;
  /** 읽기 순서 행 밴드 높이(px) — y를 이 값으로 나눈 몫이 같은 블록은 같은 행. 기본 24. */
  rowBandPx?: number;
  /** 박스 없는 블록의 크기 추정·자동 배치용 폰트 크기. 기본 24. */
  fontSize?: number;
}

// ── 초안 모델 ─────────────────────────────────────────────────────────────

export type OcrPlacementSource = "ocr-box" | "auto-layout" | "stacked" | "unplaced";

export interface OcrPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  source: OcrPlacementSource;
}

/** 검수 대기 번역 초안 1건. status가 없으면(null) 미검수다. */
export interface OcrImportDraft {
  readonly id: string;
  readonly pageId: string;
  /** 0 기준 페이지 순번(입력 페이지 순서). */
  readonly pageIndex: number;
  /** OCR 원문(정규화됨). */
  readonly sourceText: string;
  /** 번역문. 없으면 null = 미번역(빈 문자열로 채우지 않는다). */
  readonly translation: string | null;
  /** 인식 신뢰도 0~1. 공급자가 주지 않았으면 null. */
  readonly confidence: number | null;
  /** 신뢰도가 임계 미만이라 사람이 원문을 특히 확인할 차례인지. */
  readonly lowConfidence: boolean;
  /** 자동 배치 결과. 배치할 수 없었으면 null이고 source 판정은 placementSource가 한다. */
  readonly placement: OcrPlacement | null;
  readonly placementSource: OcrPlacementSource;
  /** 검수 상태. null = 미검수. */
  readonly status: DialogueReviewStatus | null;
}

// ── 정규화 헬퍼 ───────────────────────────────────────────────────────────

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** OCR 텍스트 정리 — 줄마다 공백을 접고 빈 줄을 버린다. 결과가 비면 빈 문자열. */
export function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function normalizeConfidence(value: number | undefined): number | null {
  const n = finite(value);
  if (n === null) return null;
  return Math.min(1, Math.max(0, n));
}

function normalizeBox(
  box: OcrTextBlock["box"],
  panel: AutoLayoutPanel | undefined
): { x: number; y: number; width: number; height: number } | null {
  if (!box) return null;
  const x = finite(box.x);
  const y = finite(box.y);
  const width = finite(box.width);
  const height = finite(box.height);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }
  if (!panel) return { x, y, width, height };
  const clampedWidth = Math.min(width, panel.w);
  const clampedHeight = Math.min(height, panel.h);
  return {
    x: Math.min(Math.max(x, panel.x), panel.x + panel.w - clampedWidth),
    y: Math.min(Math.max(y, panel.y), panel.y + panel.h - clampedHeight),
    width: clampedWidth,
    height: clampedHeight,
  };
}

// ── 초안 만들기(OCR → 읽기 순서 → 자동 배치 → 검수 대기) ───────────────────

export interface OcrImportBuildResult {
  drafts: OcrImportDraft[];
  /** 텍스트가 비어 초안이 되지 못한 블록 수(페이지 전체 합). */
  skippedEmpty: number;
}

/**
 * OCR 페이지 입력들을 검수 대기 초안 목록으로 만든다.
 * 순서는 페이지 입력 순서 → 페이지 안 읽기 순서(박스 있는 블록은 행 밴드→x,
 * 박스 없는 블록은 그 뒤에 입력 순서)다. 초안 id는 블록 id가 있으면 그것을,
 * 없으면 `${pageId}:ocr:${읽기 순서}`로 결정적으로 만든다.
 */
export function buildOcrImportDrafts(
  pages: readonly OcrPageInput[],
  options: OcrImportOptions = {}
): OcrImportBuildResult {
  const threshold = options.lowConfidenceThreshold ?? 0.6;
  const rowBandPx = Math.max(1, options.rowBandPx ?? 24);
  const fontSize = options.fontSize ?? 24;
  const drafts: OcrImportDraft[] = [];
  let skippedEmpty = 0;

  pages.forEach((pageInput, pageIndex) => {
    type Prepared = {
      block: OcrTextBlock;
      text: string;
      box: { x: number; y: number; width: number; height: number } | null;
      inputIndex: number;
    };
    const prepared: Prepared[] = [];
    pageInput.blocks.forEach((block, inputIndex) => {
      const text = normalizeOcrText(block.text);
      if (!text) {
        skippedEmpty += 1;
        return;
      }
      prepared.push({
        block,
        text,
        box: normalizeBox(block.box, pageInput.panel),
        inputIndex,
      });
    });

    const boxed = prepared
      .filter((p) => p.box !== null)
      .sort(
        (a, b) =>
          Math.floor((a.box?.y ?? 0) / rowBandPx) - Math.floor((b.box?.y ?? 0) / rowBandPx) ||
          (a.box?.x ?? 0) - (b.box?.x ?? 0) ||
          a.inputIndex - b.inputIndex
      );
    const unboxed = prepared.filter((p) => p.box === null);
    const ordered = [...boxed, ...unboxed];

    // 박스 없는 블록의 배치 — 패널을 알면 기존 자동 배치 코어, 모르면 결정적 쌓기.
    const placementById = new Map<string, OcrPlacement>();
    if (unboxed.length > 0) {
      if (pageInput.panel) {
        const result = autoLayoutBalloons(
          unboxed.map((p, i) => ({
            id: draftIdFor(pageInput.pageId, p.block, ordered.indexOf(p)),
            text: p.text,
            fontSize,
            order: i,
          })),
          [],
          pageInput.panel
        );
        for (const balloon of result.balloons) {
          placementById.set(balloon.id, {
            x: balloon.x,
            y: balloon.y,
            width: balloon.width,
            height: balloon.height,
            source: "auto-layout",
          });
        }
      } else {
        let cursorY = 24;
        for (const p of unboxed) {
          const id = draftIdFor(pageInput.pageId, p.block, ordered.indexOf(p));
          const size = estimateBalloonSize(p.text, fontSize);
          placementById.set(id, {
            x: 24,
            y: cursorY,
            width: size.width,
            height: size.height,
            source: "stacked",
          });
          cursorY += size.height + 12;
        }
      }
    }

    ordered.forEach((p, orderIndex) => {
      const id = draftIdFor(pageInput.pageId, p.block, orderIndex);
      const confidence = normalizeConfidence(p.block.confidence);
      const placement: OcrPlacement | null = p.box
        ? { ...p.box, source: "ocr-box" }
        : (placementById.get(id) ?? null);
      drafts.push({
        id,
        pageId: pageInput.pageId,
        pageIndex,
        sourceText: p.text,
        translation: null,
        confidence,
        lowConfidence: confidence !== null && confidence < threshold,
        placement,
        placementSource: p.box ? "ocr-box" : placement ? placement.source : "unplaced",
        status: null,
      });
    });
  });

  return { drafts, skippedEmpty };
}

function draftIdFor(pageId: string, block: OcrTextBlock, orderIndex: number): string {
  return block.id && block.id.trim() ? block.id : `${pageId}:ocr:${orderIndex}`;
}

/**
 * 붙여넣은 평문(외부 OCR 도구 결과 등)을 블록 목록으로 바꾼다 — 빈 줄로 나뉜
 * 덩어리가 블록 하나, 덩어리 안 줄바꿈은 그대로 둔다. 위치·신뢰도는 없다
 * (지어내지 않는다 — 자동 배치가 추정으로 메운다).
 */
export function ocrBlocksFromPlainText(text: string): OcrTextBlock[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((chunk) => normalizeOcrText(chunk))
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => ({ text: chunk }));
}

// ── 번역 연결(기존 번역 코어와 같은 {id, text} 형태) ───────────────────────

/** 아직 번역이 없는 초안만 기존 번역 생성 입력 형태로 내보낸다. */
export function ocrDraftsNeedingTranslation(
  drafts: readonly OcrImportDraft[]
): DialogueTranslatableItem[] {
  return drafts
    .filter((draft) => draft.translation === null)
    .map((draft) => ({ id: draft.id, text: draft.sourceText }));
}

/**
 * 번역 결과(id → 번역문)를 초안에 채운다. 요청하지 않은 id는 무시하고(환각 방어 —
 * parseTranslationResponse와 같은 태도), 공백뿐인 결과는 미번역으로 둔다.
 * 번역문이 실제로 바뀌면 그 초안의 검수 상태는 사라진다(미검수로 복귀).
 * 바뀐 것이 없으면 입력 배열을 그대로 돌려준다.
 */
export function applyOcrTranslationResults(
  drafts: readonly OcrImportDraft[],
  results: ReadonlyMap<string, string>
): readonly OcrImportDraft[] {
  if (results.size === 0) return drafts;
  let changed = false;
  const next = drafts.map((draft) => {
    const raw = results.get(draft.id);
    if (raw === undefined) return draft;
    const text = raw.trim() ? raw : null;
    if (text === draft.translation) return draft;
    changed = true;
    return { ...draft, translation: text, status: null };
  });
  return changed ? next : drafts;
}

/** 검수 화면에서 번역문 하나를 손으로 고친다 — applyOcrTranslationResults와 같은 규칙. */
export function setOcrDraftTranslation(
  drafts: readonly OcrImportDraft[],
  draftId: string,
  text: string
): readonly OcrImportDraft[] {
  return applyOcrTranslationResults(drafts, new Map([[draftId, text]]));
}

// ── 사람 검수 ─────────────────────────────────────────────────────────────

/**
 * 초안의 검수 상태를 남긴다. 번역이 없는 초안은 판정할 수 없다 — 그런 편집은
 * 조용히 무시해 입력 배열을 그대로 돌려준다(미번역의 "승인"은 없다,
 * studio-dialogue-review.ts의 setDialogueReviewStatus와 같은 규칙).
 * null이면 상태를 지운다(미검수 복귀).
 */
export function setOcrDraftReviewStatus(
  drafts: readonly OcrImportDraft[],
  draftId: string,
  status: DialogueReviewStatus | null
): readonly OcrImportDraft[] {
  let changed = false;
  const next = drafts.map((draft) => {
    if (draft.id !== draftId) return draft;
    if (status !== null && draft.translation === null) return draft;
    if (draft.status === status) return draft;
    changed = true;
    return { ...draft, status };
  });
  return changed ? next : drafts;
}

/** 검수 진척 요약 — 패널 머리말의 숫자. */
export function summarizeOcrImport(drafts: readonly OcrImportDraft[]): {
  total: number;
  translated: number;
  untranslated: number;
  approved: number;
  needsEdit: number;
  unreviewed: number;
  lowConfidence: number;
  unplaced: number;
} {
  let translated = 0;
  let approved = 0;
  let needsEdit = 0;
  let lowConfidence = 0;
  let unplaced = 0;
  for (const draft of drafts) {
    if (draft.lowConfidence) lowConfidence += 1;
    if (draft.placement === null) unplaced += 1;
    if (draft.translation === null) continue;
    translated += 1;
    if (draft.status === "approved") approved += 1;
    else if (draft.status === "needs-edit") needsEdit += 1;
  }
  return {
    total: drafts.length,
    translated,
    untranslated: drafts.length - translated,
    approved,
    needsEdit,
    unreviewed: translated - approved - needsEdit,
    lowConfidence,
    unplaced,
  };
}

/** 초안을 페이지 단위로 묶는다(연속된 같은 pageId를 한 그룹으로 — 패널 표시 전용). */
export function groupOcrDrafts(
  drafts: readonly OcrImportDraft[]
): { pageId: string; pageIndex: number; drafts: OcrImportDraft[] }[] {
  const groups: { pageId: string; pageIndex: number; drafts: OcrImportDraft[] }[] = [];
  for (const draft of drafts) {
    const last = groups[groups.length - 1];
    if (last && last.pageId === draft.pageId) last.drafts.push(draft);
    else groups.push({ pageId: draft.pageId, pageIndex: draft.pageIndex, drafts: [draft] });
  }
  return groups;
}

// ── 캔버스 반영(승인분만) ─────────────────────────────────────────────────

export type OcrImportBlockReason =
  | "untranslated"
  | "unreviewed"
  | "needs-edit"
  | "unplaced"
  | "duplicate-id";

export interface OcrImportBlocked {
  draftId: string;
  reason: OcrImportBlockReason;
}

/** 반영이 막힌 사유의 사용자 표시 문구. */
export const OCR_IMPORT_BLOCK_REASON_LABEL: Record<OcrImportBlockReason, string> = {
  untranslated: "아직 번역이 없어요",
  unreviewed: "아직 검수 승인이 없어요",
  "needs-edit": "수정 필요로 표시됐어요",
  unplaced: "배치 위치를 정하지 못했어요",
  "duplicate-id": "같은 id의 말풍선이 이미 있어요",
};

/** 승인된 초안이 만들 새 말풍선 요소의 id — 초안 id와 충돌하지 않게 접두를 단다. */
export function ocrElementIdForDraft(draftId: string): string {
  return `ocr:${draftId}`;
}

/**
 * 승인된 초안만 새 말풍선 요소로 만들어 해당 페이지 끝에 덧붙인다.
 * 승인되지 않았거나(미번역·미검수·수정 필요) 배치·id가 막힌 초안은 blocked로
 * 사유와 함께 돌려준다 — 하나라도 반영되면 새 페이지 배열, 아니면 입력 그대로.
 * 새 요소의 text는 번역문이다(원문은 요소가 아니라 초안에 남는다).
 */
export function buildOcrImportElements<P extends DialoguePageLike>(
  pages: readonly P[],
  drafts: readonly OcrImportDraft[]
): { pages: readonly P[]; imported: number; blocked: OcrImportBlocked[] } {
  const blocked: OcrImportBlocked[] = [];
  const elementsByPage = new Map<string, DialogueElementLike[]>();

  for (const draft of drafts) {
    if (draft.translation === null) {
      blocked.push({ draftId: draft.id, reason: "untranslated" });
      continue;
    }
    if (draft.status === "needs-edit") {
      blocked.push({ draftId: draft.id, reason: "needs-edit" });
      continue;
    }
    if (draft.status !== "approved") {
      blocked.push({ draftId: draft.id, reason: "unreviewed" });
      continue;
    }
    if (draft.placement === null) {
      blocked.push({ draftId: draft.id, reason: "unplaced" });
      continue;
    }
    const page = pages.find((candidate) => candidate.id === draft.pageId);
    if (!page) {
      blocked.push({ draftId: draft.id, reason: "unplaced" });
      continue;
    }
    const elementId = ocrElementIdForDraft(draft.id);
    const alreadyThere =
      page.elements.some((el) => el.id === elementId) ||
      (elementsByPage.get(draft.pageId) ?? []).some((el) => el.id === elementId);
    if (alreadyThere) {
      blocked.push({ draftId: draft.id, reason: "duplicate-id" });
      continue;
    }
    const list = elementsByPage.get(draft.pageId) ?? [];
    list.push({
      id: elementId,
      type: "bubble",
      text: draft.translation,
      x: draft.placement.x,
      y: draft.placement.y,
      width: draft.placement.width,
      height: draft.placement.height,
    });
    elementsByPage.set(draft.pageId, list);
  }

  if (elementsByPage.size === 0) return { pages, imported: 0, blocked };
  let imported = 0;
  const next = pages.map((page): P => {
    const additions = elementsByPage.get(page.id);
    if (!additions || additions.length === 0) return page;
    imported += additions.length;
    return { ...page, elements: [...page.elements, ...additions] } as P;
  });
  return { pages: next, imported, blocked };
}
