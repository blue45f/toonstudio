/**
 * Studio → 홍보 쇼츠 연동 파일(컷 묶음·번역 초안)을 실제로 만든다.
 *
 * 내보내기 메뉴가 버튼을 눌렀을 때만 동적으로 불러온다. 캔버스에서 컷을 잘라 인코딩하고, 홍보 편집기가 읽는 검증
 * 규칙(parsePromoDocumentCutBundle·parsePromoTranslationBundle)으로 한 번 더 확인한 JSON을 돌려준다 — 이 파일이
 * 만든 묶음은 홍보 편집기에서 읽을 수 있다. 계획(어떤 컷을 어느 픽셀에서 자를지)은 studio-promo-cuts가 계산한다.
 */
import {
  parsePromoDocumentCutBundle,
  serializePromoDocumentCutBundle,
  type PromoDocumentCut,
  type PromoDocumentCutBundle,
} from "../promo/promo-document-cuts";
import {
  PROMO_CUT_IMAGE_MAX_CHARS,
  PROMO_DOCUMENT_CUTS_KIND,
  PROMO_DOCUMENT_CUTS_MAX,
  PROMO_DOCUMENT_CUTS_VERSION,
  PROMO_TRANSLATION_DRAFTS_KIND,
  PROMO_TRANSLATION_DRAFTS_MAX,
  PROMO_TRANSLATION_DRAFTS_VERSION,
  PROMO_TRANSLATION_ROWS_MAX,
} from "../promo/promo-handoff-contract";
import { parsePromoTranslationBundle } from "../promo/promo-translation-drafts";
import { createStudioDownloadFileName } from "./studio-download-file-name";
import { drawWatermarkOnSlice } from "./studio-export-presets";
import { planStudioPromoCutCrop, type StudioPromoCutCrop, type StudioPromoCutListing } from "./studio-promo-cuts";
import { studioPromoTranslationDraftId, type StudioPromoTranslationListing } from "./studio-promo-translations";

import type { WatermarkSettings } from "../studio-watermark";

// ── 컷 이미지 ───────────────────────────────────────────────────────────────

/** 크기가 상한을 넘으면 이 비율로 줄여 다시 인코딩한다. */
const SHRINK_STEPS: readonly number[] = [1, 0.75, 0.55, 0.4];
const ENCODINGS = [
  { type: "image/webp", quality: 0.92 },
  { type: "image/jpeg", quality: 0.88 },
] as const;
const ALLOWED_IMAGE_URL = /^data:image\/(?:png|jpeg|webp);base64,/u;

export type StudioPromoCutImageRenderer = (
  source: HTMLCanvasElement,
  crop: StudioPromoCutCrop,
) => Promise<string>;

export interface StudioPromoCutRendererOptions {
  readonly watermark: WatermarkSettings;
  /** 테스트·특수 환경에서 캔버스 생성을 바꾼다. 기본은 document.createElement("canvas"). */
  readonly createCanvas?: () => HTMLCanvasElement;
  readonly maxChars?: number;
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  // 큰 임시 래스터는 인코딩이 끝나면 바로 놓는다(모바일 메모리 보호).
  canvas.width = 1;
  canvas.height = 1;
}

function flattenOnWhite(canvas: HTMLCanvasElement, createCanvas: () => HTMLCanvasElement): HTMLCanvasElement {
  const flat = createCanvas();
  flat.width = canvas.width;
  flat.height = canvas.height;
  const context = flat.getContext("2d");
  if (!context) return canvas;
  // JPEG에는 투명도가 없다. 투명한 영역이 검게 변하지 않도록 흰 종이 위에 올린다.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, flat.width, flat.height);
  context.drawImage(canvas, 0, 0);
  return flat;
}

function encodeCutCanvas(
  canvas: HTMLCanvasElement,
  createCanvas: () => HTMLCanvasElement,
  maxChars: number,
): string | null {
  for (const { type, quality } of ENCODINGS) {
    const target = type === "image/jpeg" ? flattenOnWhite(canvas, createCanvas) : canvas;
    try {
      // 브라우저가 WebP를 인코딩하지 못하면 PNG가 돌아온다. 허용 형식이고 크기가 맞으면 그대로 쓴다.
      const url = target.toDataURL(type, quality);
      if (ALLOWED_IMAGE_URL.test(url) && url.length <= maxChars) return url;
    } finally {
      if (target !== canvas) releaseCanvas(target);
    }
  }
  return null;
}

/** 캡처 캔버스에서 컷 영역을 잘라 data URL로 만든다. 워터마크 설정이 켜져 있으면 컷마다 찍는다. */
export function createStudioPromoCutImageRenderer(options: StudioPromoCutRendererOptions): StudioPromoCutImageRenderer {
  const createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));
  const maxChars = options.maxChars ?? PROMO_CUT_IMAGE_MAX_CHARS;
  return (source, crop) => {
    for (const factor of SHRINK_STEPS) {
      const width = Math.max(1, Math.round(crop.width * factor));
      const height = Math.max(1, Math.round(crop.height * factor));
      const canvas = createCanvas();
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("컷 이미지를 그릴 캔버스를 만들지 못했어요. 브라우저 메모리가 부족할 수 있어요. 페이지 범위를 줄여 다시 시도해 주세요.");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
        drawWatermarkOnSlice(canvas, options.watermark);
        const url = encodeCutCanvas(canvas, createCanvas, maxChars);
        if (url) return Promise.resolve(url);
      } catch (reason) {
        return Promise.reject(reason instanceof Error ? reason : new Error("컷 이미지를 만들지 못했어요."));
      } finally {
        releaseCanvas(canvas);
      }
    }
    return Promise.reject(new Error("컷 이미지가 너무 커서 담지 못했어요. 내보내기 배율을 낮추거나 페이지 범위를 줄여 다시 시도해 주세요."));
  };
}

// ── 컷 묶음 ─────────────────────────────────────────────────────────────────

export interface StudioPromoCutCaptureInput {
  /** 문서에서 0부터 센 페이지 순번. */
  readonly pageIndex: number;
  readonly canvas: HTMLCanvasElement;
}
export interface StudioPromoCutBundleInput {
  readonly listing: StudioPromoCutListing;
  readonly captures: readonly StudioPromoCutCaptureInput[];
  /** 문서 캔버스 폭(문서 좌표). 캡처 폭 ÷ 이 값이 배율이다. */
  readonly canvasWidth: number;
  readonly title: string;
  readonly documentId: string | null;
  readonly render: StudioPromoCutImageRenderer;
  readonly signal?: AbortSignal;
  readonly onProgress?: (completed: number, total: number) => void;
}
export interface StudioPromoCutBundleResult {
  readonly bundle: PromoDocumentCutBundle;
  readonly json: string;
  readonly fileName: string;
  /** 캡처 밖에 있어 담지 못한 컷 수. */
  readonly skippedFrameCount: number;
}

function abortError(): DOMException {
  return new DOMException("홍보 쇼츠용 컷 묶음 만들기를 취소했어요.", "AbortError");
}

/** 컷 하나를 만든 뒤 브라우저에 한 번 넘겨 진행률과 취소 버튼이 그려지게 한다. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

export function studioPromoCutsFileName(title: string): string {
  return createStudioDownloadFileName({ title, fallbackTitle: "toonstudio", extension: "json", suffix: "promo-cuts" });
}

/** 컷마다 캡처에서 잘라 묶음을 만들고, 홍보 편집기가 읽는 규칙으로 검증한 JSON을 돌려준다. */
export async function buildStudioPromoCutBundle(input: StudioPromoCutBundleInput): Promise<StudioPromoCutBundleResult> {
  const { listing, signal } = input;
  if (listing.frames.length === 0) throw new Error("선택한 범위에 컷(프레임)이 없어요. 컷을 그린 페이지를 선택해 주세요.");
  if (listing.frames.length > PROMO_DOCUMENT_CUTS_MAX) {
    throw new Error(`컷이 ${listing.frames.length}개예요. 한 묶음은 ${PROMO_DOCUMENT_CUTS_MAX}컷까지 담을 수 있어요. 페이지 범위를 줄여 주세요.`);
  }
  const canvases = new Map(input.captures.map((capture) => [capture.pageIndex, capture.canvas] as const));
  const cuts: PromoDocumentCut[] = [];
  let skippedFrameCount = 0;
  for (const [index, frame] of listing.frames.entries()) {
    if (signal?.aborted) throw abortError();
    const canvas = canvases.get(frame.pageIndex);
    const crop = canvas ? planStudioPromoCutCrop(frame, canvas, input.canvasWidth) : null;
    if (!canvas || !crop) {
      skippedFrameCount += 1;
    } else {
      const image = await input.render(canvas, crop);
      cuts.push({
        id: `${frame.pageId}:${frame.frameId}`,
        pageId: frame.pageId,
        pageIndex: frame.pageIndex,
        frameId: frame.frameId,
        order: cuts.length,
        image,
        dialogues: frame.dialogues.map((dialogue) => ({ id: dialogue.id, text: dialogue.text })),
      });
    }
    input.onProgress?.(index + 1, listing.frames.length);
    if (index < listing.frames.length - 1) await nextTask();
  }
  if (signal?.aborted) throw abortError();
  if (cuts.length === 0) throw new Error("캡처 안에 들어오는 컷이 없어요. 컷(프레임)이 페이지 밖에 있지 않은지 확인해 주세요.");

  const bundle = parsePromoDocumentCutBundle({
    kind: PROMO_DOCUMENT_CUTS_KIND,
    version: PROMO_DOCUMENT_CUTS_VERSION,
    documentId: input.documentId,
    title: Array.from(input.title.trim()).slice(0, 200).join(""),
    cuts,
  });
  return { bundle, json: serializePromoDocumentCutBundle(bundle), fileName: studioPromoCutsFileName(input.title), skippedFrameCount };
}

// ── 번역 초안 ───────────────────────────────────────────────────────────────

export interface StudioPromoTranslationFileInput {
  readonly listing: StudioPromoTranslationListing;
  readonly documentId: string | null;
  readonly title: string;
  /** 초안의 갱신 시각으로 쓴다. */
  readonly exportedAt: Date;
}
export interface StudioPromoTranslationFileResult {
  readonly json: string;
  readonly fileName: string;
  readonly draftCount: number;
  readonly rowCount: number;
  readonly localeCount: number;
}

export function studioPromoTranslationsFileName(title: string): string {
  return createStudioDownloadFileName({ title, fallbackTitle: "toonstudio", extension: "json", suffix: "translation-drafts" });
}

/** 문서의 대사 번역을 홍보 편집기가 읽는 번역 초안 JSON으로 만든다. */
export function buildStudioPromoTranslationFile(input: StudioPromoTranslationFileInput): StudioPromoTranslationFileResult {
  const { listing } = input;
  if (listing.entries.length === 0) throw new Error("선택한 범위에 번역된 대사가 없어요. 대사 번역을 만든 뒤 다시 시도해 주세요.");
  if (listing.entries.length > PROMO_TRANSLATION_DRAFTS_MAX || listing.rows.length > PROMO_TRANSLATION_ROWS_MAX) {
    throw new Error(`번역 초안은 ${PROMO_TRANSLATION_DRAFTS_MAX}건, 대사는 ${PROMO_TRANSLATION_ROWS_MAX}줄까지 담을 수 있어요. 페이지 범위를 줄여 주세요.`);
  }
  const updatedAt = input.exportedAt.toISOString();
  const file = {
    kind: PROMO_TRANSLATION_DRAFTS_KIND,
    version: PROMO_TRANSLATION_DRAFTS_VERSION,
    ...(input.documentId ? { documentId: input.documentId } : {}),
    rows: listing.rows.map((row) => ({ pageId: row.pageId, elementId: row.elementId, source: row.source })),
    drafts: listing.entries.map((entry) => ({
      id: studioPromoTranslationDraftId(entry.pageId, entry.elementId, entry.locale),
      pageId: entry.pageId,
      elementId: entry.elementId,
      source: entry.source,
      locale: entry.locale,
      text: entry.text,
      approved: entry.approved,
      updatedAt,
    })),
  };
  // 홍보 편집기가 읽는 규칙으로 한 번 더 확인한다. 읽을 수 없는 파일을 저장하지 않는다.
  const parsed = parsePromoTranslationBundle(file);
  return {
    json: JSON.stringify(file),
    fileName: studioPromoTranslationsFileName(input.title),
    draftCount: parsed.drafts.length,
    rowCount: parsed.rows.length,
    localeCount: listing.locales.length,
  };
}
