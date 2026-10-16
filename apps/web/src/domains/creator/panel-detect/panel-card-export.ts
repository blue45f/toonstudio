/**
 * 카드뉴스 ZIP(PNG) 묶음 — 순서 파일명, 안내문, 매니페스트(원본 영수증·권리 확인 기록).
 *
 * ZIP 은 기존 패키지 아카이브 작성기(studio-package-archive)로 만든다: 경로 검사·중복 거절·CRC-32·취소·메모리 한도를 이미 갖췄다.
 * 파일 이름은 `cards/card-01.png` 처럼 순서가 곧 정렬 순서가 되게 0 으로 채운다. 이미지 바이트는 이 브라우저 안에서만 오간다.
 */

import { createStudioDownloadFileName } from "../export/studio-download-file-name";
import { buildStudioPackageArchiveBlob, type StudioPackageArchiveEntry } from "../studio-package-archive";

import { PANEL_IMPORT_RIGHTS_STATEMENT_KO, PANEL_IMPORT_TOOL, type PanelImportRights } from "./panel-import-rights";

import type { RenderedCard } from "./panel-card-render";
import type { CardAlignment, CardSlicePlan, CardSliceWarning } from "./panel-card-slice-types";
import type { StudioCrc32ExecutionMode } from "../studio-crc32-worker-client";

export const CARD_BUNDLE_SCHEMA = "toonstudio.card-news-bundle/v1" as const;
export const CARD_BUNDLE_MIME = "application/zip" as const;
export const CARD_BUNDLE_MANIFEST_PATH = "manifest.json" as const;
export const CARD_BUNDLE_README_PATH = "README.txt" as const;

/** 카드 파일 이름: 전체 장수의 자릿수(최소 2)에 맞춰 0 을 채운다. index 는 0부터. */
export function cardImageFileName(index: number, total: number): string {
  const digits = Math.max(2, String(Math.max(1, total)).length);
  return `card-${String(index + 1).padStart(digits, "0")}.png`;
}

export function cardImagePath(index: number, total: number): string {
  return `cards/${cardImageFileName(index, total)}`;
}

export interface CardBundleManifestCard {
  readonly ordinal: number;
  readonly path: string;
  readonly mimeType: "image/png";
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  /** 이 카드가 원본에서 가져온 행 범위 [시작, 끝). */
  readonly sourceRows: readonly [number, number];
  /** 이 카드 아래 절단선의 품질. 마지막 카드는 null. */
  readonly cutBelow: { readonly y: number; readonly kind: string; readonly manual: boolean } | null;
}

export interface CardBundleManifest {
  readonly schema: typeof CARD_BUNDLE_SCHEMA;
  readonly title: string;
  readonly generatedAt: string;
  readonly card: {
    readonly width: number;
    readonly height: number;
    readonly ratio: "4:5";
    readonly alignment: CardAlignment;
    readonly background: string;
  };
  readonly source: PanelImportRights["source"];
  /** 사용자가 남긴 권리 확인 기록(자기 확인이며 법률 자문·권리 인증이 아니다). */
  readonly rights: PanelImportRights;
  readonly cards: readonly CardBundleManifestCard[];
  readonly warnings: readonly CardSliceWarning[];
  readonly tool: { readonly name: string; readonly version: number };
}

export class CardBundleError extends Error {
  readonly code: "no-cards" | "mismatch" | "archive-failed" | "cancelled";

  constructor(code: CardBundleError["code"], message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "CardBundleError";
    this.code = code;
  }
}

export interface BuildCardBundleInput {
  readonly cards: readonly RenderedCard[];
  readonly plan: CardSlicePlan;
  readonly title: string;
  readonly rights: PanelImportRights;
  readonly alignment: CardAlignment;
  readonly generatedAt: Date;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
  readonly crc32ExecutionMode?: StudioCrc32ExecutionMode;
  /** 시험 주입점. */
  readonly buildArchive?: typeof buildStudioPackageArchiveBlob;
}

export interface CardBundleResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly manifest: CardBundleManifest;
}

export function buildCardBundleManifest(input: BuildCardBundleInput): CardBundleManifest {
  const { plan, cards } = input;
  if (cards.length === 0) throw new CardBundleError("no-cards", "묶음에 넣을 카드가 없어요.");
  if (cards.length !== plan.cards.length) throw new CardBundleError("mismatch", "카드 이미지 수가 계획과 달라요.");
  return {
    schema: CARD_BUNDLE_SCHEMA,
    title: input.title.trim() || "ToonStudio 카드뉴스",
    generatedAt: input.generatedAt.toISOString(),
    card: {
      width: plan.cardWidth,
      height: plan.cardHeight,
      ratio: "4:5",
      alignment: input.alignment,
      background: plan.background,
    },
    source: input.rights.source,
    rights: input.rights,
    cards: cards.map((card, index) => {
      const slice = plan.cards[index];
      const cut = plan.cuts[index];
      return {
        ordinal: index + 1,
        path: cardImagePath(index, cards.length),
        mimeType: "image/png" as const,
        byteLength: card.blob.size,
        width: card.width,
        height: card.height,
        sourceRows: [slice.y0, slice.y1] as const,
        cutBelow: cut ? { y: cut.y, kind: cut.kind, manual: cut.manual } : null,
      };
    }),
    warnings: plan.warnings,
    tool: { name: PANEL_IMPORT_TOOL.name, version: PANEL_IMPORT_TOOL.version },
  };
}

export function buildCardBundleReadme(manifest: CardBundleManifest): string {
  const lines = [
    `${manifest.title} — 카드뉴스 ${manifest.cards.length}장 (${manifest.card.width}×${manifest.card.height}, 4:5)`,
    "",
    "카드 순서",
    ...manifest.cards.map((card) => `  ${String(card.ordinal).padStart(2, " ")}. ${card.path}`),
    "",
    "원본",
    `  파일: ${manifest.source.fileName} (${manifest.source.width}×${manifest.source.height}px)`,
    `  SHA-256: ${manifest.source.sha256}`,
    "",
    "권리 확인 기록",
    `  사용자가 "${PANEL_IMPORT_RIGHTS_STATEMENT_KO}"에 동의했어요 (${manifest.rights.attestedAt.slice(0, 10)}).`,
    ...(manifest.rights.note ? [`  메모: ${manifest.rights.note}`] : []),
    "  이 기록은 사용자의 자기 확인이며 법률 자문, 권리 인증, 제3자의 권리 보유 보증이 아니에요.",
    "  게시 전에 원문 사용권과 대상 플랫폼의 최신 정책을 직접 확인해 주세요.",
    "",
    "이미지는 이 브라우저 안에서만 처리했고 서버로 보내지 않았어요.",
    "",
  ];
  return lines.join("\n");
}

export function cardBundleFileName(title: string): string {
  return createStudioDownloadFileName({ title, fallbackTitle: "toonstudio-cards", suffix: "card-news", extension: "zip" });
}

export async function buildCardNewsBundle(input: BuildCardBundleInput): Promise<CardBundleResult> {
  const manifest = buildCardBundleManifest(input);
  const entries: StudioPackageArchiveEntry[] = [
    { path: CARD_BUNDLE_README_PATH, data: new Blob([buildCardBundleReadme(manifest)], { type: "text/plain;charset=utf-8" }) },
    { path: CARD_BUNDLE_MANIFEST_PATH, data: new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json;charset=utf-8" }) },
    ...input.cards.map((card, index) => ({ path: cardImagePath(index, input.cards.length), data: card.blob })),
  ];
  const buildArchive = input.buildArchive ?? buildStudioPackageArchiveBlob;
  let blob: Blob;
  try {
    blob = await buildArchive(entries, {
      modifiedAt: input.generatedAt,
      mimeType: CARD_BUNDLE_MIME,
      signal: input.signal,
      crc32ExecutionMode: input.crc32ExecutionMode ?? "worker",
      onProgress: (progress) => {
        // 안내문·매니페스트는 진행률에 세지 않고 카드만 센다.
        if (progress.path.startsWith("cards/")) input.onProgress?.(progress.completedFiles - 2, input.cards.length);
      },
    });
  } catch (cause) {
    if (input.signal?.aborted) throw new CardBundleError("cancelled", "ZIP 만들기를 취소했어요.", { cause });
    throw new CardBundleError("archive-failed", "ZIP 파일을 만들지 못했어요.", { cause });
  }
  return { blob, fileName: cardBundleFileName(manifest.title), manifest };
}
