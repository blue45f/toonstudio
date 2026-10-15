/**
 * Studio 문서의 컷(프레임)을 홍보 쇼츠 편집기로 넘기기 위한 계획 — 순수 규칙.
 *
 * 컷 이미지는 새로 그리지 않는다. Studio가 이미 만드는 페이지 캡처(내보내기 메뉴의 캡처 경로)에서 컷(프레임) 영역을
 * 잘라 내고, 읽기 순서와 컷 안 말풍선 텍스트는 대사 일괄 편집이 쓰는 규칙(studio-dialogue-batch)을 그대로 쓴다.
 * 이 파일은 캔버스·DOM을 만지지 않는다. 어떤 컷이 있고 캡처의 어느 픽셀을 잘라 낼지만 계산한다.
 *
 * 이미지에서 컷을 자동으로 찾지는 않는다(문서에 그려 둔 프레임만 쓴다 — 그 기능은 별도 작업이다).
 */
import {
  collectDialogueItems,
  collectSpatialFrames,
  inferredFrameRank,
  type DialogueElementLike,
  type DialoguePageLike,
} from "../lettering/studio-dialogue-batch";
import {
  PROMO_DOCUMENT_CUTS_MAX,
  PROMO_DOCUMENT_DIALOGUE_TEXT_MAX,
  PROMO_DOCUMENT_DIALOGUES_MAX,
} from "../promo/promo-handoff-contract";
import { isEffectivelyHidden } from "../studio-layers";

/** 문서 좌표 기준으로 이보다 작은 프레임은 컷으로 보지 않는다(장식·실수로 그린 점). */
export const STUDIO_PROMO_CUT_MIN_SIZE = 24;
/** 캡처에서 잘라 낸 뒤 이 값 이하로만 줄인다(긴 변 기준). 영상은 1080px 급이라 충분하다. */
export const STUDIO_PROMO_CUT_MAX_EDGE = 2_048;
/** 캡처 픽셀로 이보다 작게 잘리는 컷은 쓸 수 없다(프레임이 캔버스 밖에 있는 경우). */
export const STUDIO_PROMO_CUT_MIN_PIXELS = 8;
/** 홍보 영상에 쓰기에 이보다 낮은 배율은 컷이 흐릿해 보일 수 있다. */
export const STUDIO_PROMO_CUT_RECOMMENDED_SCALE = 2;

export interface StudioPromoCutDialogue {
  readonly id: string;
  readonly text: string;
}
export interface StudioPromoCutFrame {
  readonly pageId: string;
  /** 문서에서 0부터 센 페이지 순번. */
  readonly pageIndex: number;
  readonly frameId: string;
  /** 문서 좌표(페이지 캔버스 기준)의 컷 영역. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 컷 안 말풍선·텍스트를 읽기 순서로 나열한 것(숨긴 것·빈 것 제외). */
  readonly dialogues: readonly StudioPromoCutDialogue[];
}
export interface StudioPromoCutListing {
  /** 읽기 순서(페이지 → 컷 위→아래, 왼→오른)로 나열한 컷. */
  readonly frames: readonly StudioPromoCutFrame[];
  /** 컷 안에 담긴 말풍선·텍스트 수. */
  readonly dialogueCount: number;
  /** 어느 컷에도 속하지 않아 뺀 말풍선·텍스트 수(여백·컷 사이에 놓인 것). */
  readonly outsideDialogueCount: number;
  /** 한 컷에 40개를 넘어 뺀 말풍선·텍스트 수. */
  readonly clippedDialogueCount: number;
  /** 숨겨졌거나 너무 작아 컷으로 보지 않은 프레임 수. */
  readonly skippedFrameCount: number;
  /** 컷이 하나도 없는 페이지(0부터 센 순번). */
  readonly pagesWithoutFrames: readonly number[];
}

/** UTF-16 길이 기준으로 자른다(묶음 검증이 같은 기준으로 길이를 센다). 서로게이트 쌍의 앞쪽 절반만 남기지는 않는다. */
function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  const head = value.slice(0, max);
  const last = head.charCodeAt(head.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head;
}

function isUsableFrame(element: DialogueElementLike, groups: DialoguePageLike["groups"]): boolean {
  if (isEffectivelyHidden(element, groups ?? [])) return false;
  const { width, height } = element;
  return (
    typeof width === "number" && Number.isFinite(width) && width >= STUDIO_PROMO_CUT_MIN_SIZE &&
    typeof height === "number" && Number.isFinite(height) && height >= STUDIO_PROMO_CUT_MIN_SIZE
  );
}

/**
 * 컷 계산에 쓸 페이지 요소 — 숨겼거나 너무 작은 프레임을 뺀다. 컷 나열과 번역 초안 나열이 같은 요소 집합으로 읽기 순서를
 * 계산해야 컷 안 말풍선이 번역 초안의 원문 행에서 이어진 구간으로 나온다.
 */
export function studioPromoPageElements(page: DialoguePageLike): { readonly elements: DialogueElementLike[]; readonly skippedFrameCount: number } {
  const groups = page.groups ?? [];
  let skippedFrameCount = 0;
  const elements = page.elements.filter((element) => {
    if (element.type !== "frame") return true;
    if (isUsableFrame(element, groups)) return true;
    skippedFrameCount += 1;
    return false;
  });
  return { elements, skippedFrameCount };
}

/**
 * 선택한 페이지 범위의 컷과 컷 안 말풍선을 읽기 순서로 나열한다.
 * 페이지 순번은 문서 기준이고, 범위 밖·없는 순번은 조용히 무시한다(호출자가 범위를 이미 검증한다).
 */
export function listStudioPromoCuts(
  pages: readonly DialoguePageLike[],
  pageIndices: readonly number[],
): StudioPromoCutListing {
  const indices = [...new Set(pageIndices)]
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((left, right) => left - right);
  const frames: StudioPromoCutFrame[] = [];
  const pagesWithoutFrames: number[] = [];
  let dialogueCount = 0;
  let outsideDialogueCount = 0;
  let clippedDialogueCount = 0;
  let skippedFrameCount = 0;

  for (const pageIndex of indices) {
    const page = pages[pageIndex];
    if (!page) continue;
    const groups = page.groups ?? [];
    // 숨겼거나 너무 작은 프레임은 컷에서 뺀다. 그 안의 말풍선은 바깥 컷(있다면)이나 "컷 밖"으로 센다.
    const usable = studioPromoPageElements(page);
    const elements = usable.elements;
    skippedFrameCount += usable.skippedFrameCount;
    const pageFrames = collectSpatialFrames(elements);
    if (pageFrames.length === 0) pagesWithoutFrames.push(pageIndex);

    const records = pageFrames.map((frame) => ({ frame, dialogues: [] as StudioPromoCutDialogue[] }));
    const byId = new Map(elements.map((element) => [element.id, element] as const));
    for (const item of collectDialogueItems([{ id: page.id, elements, groups }])) {
      // 숨긴 텍스트는 캡처에도 없으므로 자막 후보에서도 뺀다.
      if (item.hidden || !item.text.trim()) continue;
      const element = byId.get(item.id);
      if (!element) continue;
      const rank = inferredFrameRank(element, pageFrames);
      // 순번이 컷 수 이상이면 어느 컷에도 들어 있지 않은 것이다(컷이 하나도 없는 페이지 포함).
      if (rank >= records.length) {
        outsideDialogueCount += 1;
        continue;
      }
      const record = records[rank];
      if (record.dialogues.length >= PROMO_DOCUMENT_DIALOGUES_MAX) {
        clippedDialogueCount += 1;
        continue;
      }
      record.dialogues.push({ id: item.id, text: truncateText(item.text, PROMO_DOCUMENT_DIALOGUE_TEXT_MAX) });
      dialogueCount += 1;
    }

    for (const { frame, dialogues } of records) {
      frames.push({
        pageId: page.id,
        pageIndex,
        frameId: frame.id,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        dialogues,
      });
    }
  }

  return { frames, dialogueCount, outsideDialogueCount, clippedDialogueCount, skippedFrameCount, pagesWithoutFrames };
}

/** 한 묶음에 담을 수 있는 컷 수를 넘었는가. */
export function exceedsStudioPromoCutLimit(listing: Pick<StudioPromoCutListing, "frames">): boolean {
  return listing.frames.length > PROMO_DOCUMENT_CUTS_MAX;
}

export interface StudioPromoCutCapture {
  readonly width: number;
  readonly height: number;
}
export interface StudioPromoCutCrop {
  /** 캡처 캔버스에서 잘라 낼 영역(정수 픽셀). */
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  /** 잘라 낸 뒤 그릴 크기(긴 변이 maxEdge 이하). */
  readonly width: number;
  readonly height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 컷(문서 좌표)을 캡처 캔버스의 픽셀 영역으로 바꾼다. 캡처 폭 ÷ 문서 폭이 배율이다
 * (내보내기 캡처는 문서 폭 × 내보내기 배율 크기로 만들어진다). 영역이 캡처 밖이면 null.
 */
export function planStudioPromoCutCrop(
  frame: Pick<StudioPromoCutFrame, "x" | "y" | "width" | "height">,
  capture: StudioPromoCutCapture,
  canvasWidth: number,
  maxEdge: number = STUDIO_PROMO_CUT_MAX_EDGE,
): StudioPromoCutCrop | null {
  if (!(canvasWidth > 0) || !(capture.width > 0) || !(capture.height > 0) || !(maxEdge > 0)) return null;
  const scale = capture.width / canvasWidth;
  const sx = clamp(Math.floor(frame.x * scale), 0, capture.width);
  const sy = clamp(Math.floor(frame.y * scale), 0, capture.height);
  const ex = clamp(Math.ceil((frame.x + frame.width) * scale), 0, capture.width);
  const ey = clamp(Math.ceil((frame.y + frame.height) * scale), 0, capture.height);
  const sw = ex - sx;
  const sh = ey - sy;
  if (!(sw >= STUDIO_PROMO_CUT_MIN_PIXELS) || !(sh >= STUDIO_PROMO_CUT_MIN_PIXELS)) return null;
  const fit = Math.min(1, maxEdge / Math.max(sw, sh));
  return { sx, sy, sw, sh, width: Math.max(1, Math.round(sw * fit)), height: Math.max(1, Math.round(sh * fit)) };
}
