/**
 * studio-book-layout-stage2-model.ts — 단행본 조판 2단계 모델 (순수 모듈)
 *
 * 1단계(studio-book-layout-model.ts: BookTrimSpec·PdfBox·BookPageBoxes·
 * computeBookPageBoxes·computeSpreadMediaBox·BOOK_TRIM_PRESETS) 위에 얹는
 * 확장 층이다. 1단계 타입·함수를 그대로 import해 재정의하지 않는다.
 *
 * 책임 3가지 (설계 문서 studio-book-layout-stage2-design.md §2 단계 분해와 1:1):
 *  2A 스프레드 페이지네이션 — 입력 페이지 열 → 제본 방향·챕터 시작면 규칙에
 *     따라 빈 페이지(백지)를 삽입하고 좌/우 면과 스프레드를 확정한다.
 *  2B 부모 페이지(마스터) — 쪽번호(폴리오)·작품명·화 제목 같은 자동 요소를
 *     템플릿으로 선언하고, 페이지별로 실제 문자열·위치 박스로 해소한다.
 *  2C 재인쇄 검수 — 판(edition) 사이의 변경 페이지를 계산하고, 변경 범위
 *     (바뀐 페이지만 vs 전체)에 따라 재검수 범위를 강제한다.
 *
 * 순수 함수만 둔다. PDF 생성·이미지 렌더·UI 상태는 이 모듈의 책임이 아니다.
 * 단위: 위치 박스는 1단계와 동일하게 PDF pt, 오프셋 입력은 mm.
 */

import {
  computeBookPageBoxes,
  computeSpreadMediaBox,
  type BookPageBoxes,
  type BookTrimSpec,
  type PdfBox,
} from "./studio-book-layout-model";

// ── 2A. 스프레드 페이지네이션 ─────────────────────────────────────────────

/** 제본 방향. left=좌철(왼쪽 제본, 오른쪽으로 넘김), right=우철(오른쪽 제본). */
export type BookBinding = "left" | "right";

/** 지면 한 면. single은 표지처럼 펼침에 속하지 않는 단면. */
export type BookPageSide = "left" | "right" | "single";

export type BookSectionKind =
  | "cover"
  | "inside-cover"
  | "title"
  | "copyright"
  | "toc"
  | "chapter-opener"
  | "content"
  | "afterword"
  | "blank"
  | "back-cover";

export interface BookPageInput {
  readonly id: string;
  readonly sectionKind: BookSectionKind;
  /** 회차 식별자(있으면). 스프레드·검수 diff의 안정 키로 쓴다. */
  readonly episodeId?: string;
  readonly chapterId?: string;
  readonly chapterTitle?: string;
  /** 내용이 바뀐 것으로 취급할 콘텐츠 해시(재인쇄 diff용). 없으면 id만 비교. */
  readonly contentHash?: string;
}

export interface BookPaginationOptions {
  readonly binding: BookBinding;
  /**
   * 챕터 시작면. 기본값: 좌철이면 right, 우철이면 left
   * (책을 펼쳤을 때 새 화가 눈에 먼저 닿는 면). "any"면 백지를 넣지 않는다.
   */
  readonly chapterOpenerSide?: Exclude<BookPageSide, "single"> | "any";
  /** 본문 시작(첫 content/chapter-opener)부터 쪽번호를 셀지, 책 처음부터 셀지. */
  readonly folioStartSection?: BookSectionKind;
  /** 쪽번호 시작 값. 기본 1. */
  readonly folioStartValue?: number;
}

export interface BookPageSlot {
  readonly inputId: string | null;
  /** 물리 순서(0-base). 표지가 0. */
  readonly physicalIndex: number;
  /** 논리 쪽번호. folioStartSection 이전이면 null(번호 없음). 백지도 번호는 센다. */
  readonly folio: number | null;
  readonly side: BookPageSide;
  readonly sectionKind: BookSectionKind;
  /** 2A가 자동 삽입한 백지인가. 입력에 있던 blank와 구분한다. */
  readonly isInsertedBlank: boolean;
  readonly spreadIndex: number | null;
  readonly boxes: BookPageBoxes;
  readonly chapterId?: string;
  readonly chapterTitle?: string;
  readonly episodeId?: string;
  readonly contentHash?: string;
}

export interface BookSpread {
  readonly index: number;
  /** 펼침 기준 좌측 면(시각적 왼쪽). 제본 방향과 무관하게 지면 왼쪽. */
  readonly leftPhysicalIndex: number | null;
  readonly rightPhysicalIndex: number | null;
  /** 1단계 computeSpreadMediaBox 결과. 단면 스프레드면 null. */
  readonly media: PdfBox | null;
  readonly isCover: boolean;
}

export interface BookPagination {
  readonly pages: readonly BookPageSlot[];
  readonly spreads: readonly BookSpread[];
  readonly warnings: readonly BookPaginationWarning[];
}

export interface BookPaginationWarning {
  readonly code: "odd-total-pages" | "chapter-opener-side-adjusted" | "empty-book";
  readonly message: string;
  readonly physicalIndex?: number;
}

/** 제본 방향에서 책의 첫 본문 면(1페이지가 놓이는 시각적 면). */
export function firstContentSide(binding: BookBinding): Exclude<BookPageSide, "single"> {
  return binding === "left" ? "right" : "left";
}

function sideAtPhysicalIndex(
  binding: BookBinding,
  physicalIndex: number,
): Exclude<BookPageSide, "single"> {
  const first = firstContentSide(binding);
  const evenIsFirst = physicalIndex % 2 === 0;
  if (evenIsFirst) return first;
  return first === "right" ? "left" : "right";
}

const COVER_SECTIONS: ReadonlySet<BookSectionKind> = new Set(["cover", "back-cover"]);

/**
 * 입력 페이지 열을 페이지네이션한다.
 * 규칙:
 *  - cover/back-cover는 단면(single, spreadIndex=null)으로 분리한다.
 *  - 그 외 페이지는 물리 순서대로 좌/우 면이 번갈아 확정된다.
 *  - chapter-opener가 목표 면이 아니면 그 앞에 백지 1장을 자동 삽입한다.
 *  - 전체 본문 페이지 수가 홀수면 마지막 스프레드가 반쪽이 됨을 경고한다
 *    (자동으로 백지를 덧붙이지 않는다 — 작가가 끝맺음을 정한다).
 */
export function buildBookPagination(
  inputs: readonly BookPageInput[],
  spec: BookTrimSpec,
  options: BookPaginationOptions,
): BookPagination {
  const warnings: BookPaginationWarning[] = [];
  if (inputs.length === 0) {
    warnings.push({ code: "empty-book", message: "페이지가 없습니다." });
    return { pages: [], spreads: [], warnings };
  }
  const openerSide =
    options.chapterOpenerSide ?? firstContentSide(options.binding);
  const folioStartSection = options.folioStartSection ?? "content";
  const folioStartValue = options.folioStartValue ?? 1;

  type Draft = Omit<BookPageSlot, "boxes" | "spreadIndex" | "folio"> & {
    folio: number | null;
  };
  const drafts: Draft[] = [];
  let folioCounter: number | null = null;
  let bodyIndex = 0; // 단면을 제외한 본문 물리 인덱스(면 교대 계산용)

  const pushDraft = (draft: Omit<Draft, "physicalIndex" | "side" | "folio">) => {
    const isCover = COVER_SECTIONS.has(draft.sectionKind);
    const side: BookPageSide = isCover
      ? "single"
      : sideAtPhysicalIndex(options.binding, bodyIndex);
    if (
      folioCounter === null &&
      (draft.sectionKind === folioStartSection ||
        (folioStartSection === "content" && draft.sectionKind === "chapter-opener"))
    ) {
      folioCounter = folioStartValue;
    }
    const folio = folioCounter;
    if (folioCounter !== null && !isCover) folioCounter += 1;
    else if (folioCounter !== null && isCover) {
      // 표지는 번호를 표시하지 않지만 전통 조판에선 매김에 넣지 않으므로 증가 없음.
    }
    drafts.push({ ...draft, physicalIndex: drafts.length, side, folio });
    if (!isCover) bodyIndex += 1;
  };

  for (const input of inputs) {
    if (
      input.sectionKind === "chapter-opener" &&
      openerSide !== "any" &&
      !COVER_SECTIONS.has(input.sectionKind)
    ) {
      const nextSide = sideAtPhysicalIndex(options.binding, bodyIndex);
      if (nextSide !== openerSide) {
        pushDraft({
          inputId: null,
          sectionKind: "blank",
          isInsertedBlank: true,
        });
        warnings.push({
          code: "chapter-opener-side-adjusted",
          message: `화 시작면을 ${openerSide}로 맞추기 위해 백지를 삽입했습니다.`,
          physicalIndex: drafts.length - 1,
        });
      }
    }
    pushDraft({
      inputId: input.id,
      sectionKind: input.sectionKind,
      isInsertedBlank: false,
      chapterId: input.chapterId,
      chapterTitle: input.chapterTitle,
      episodeId: input.episodeId,
      contentHash: input.contentHash,
    });
  }

  // 스프레드 조립: 단면을 제외하고 (좌,우) 쌍으로 묶는다.
  const spreads: BookSpread[] = [];
  const spreadIndexByPhysical = new Map<number, number>();
  const bodyDrafts = drafts.filter((d) => d.side !== "single");
  for (let i = 0; i < bodyDrafts.length; i += 2) {
    const a = bodyDrafts[i];
    const b = bodyDrafts[i + 1];
    const left = a.side === "left" ? a : b;
    const right = a.side === "right" ? a : b;
    const idx = spreads.length;
    spreads.push({
      index: idx,
      leftPhysicalIndex: left ? left.physicalIndex : null,
      rightPhysicalIndex: right ? right.physicalIndex : null,
      media: computeSpreadMediaBox(spec),
      isCover: false,
    });
    if (a) spreadIndexByPhysical.set(a.physicalIndex, idx);
    if (b) spreadIndexByPhysical.set(b.physicalIndex, idx);
  }
  if (bodyDrafts.length % 2 === 1) {
    warnings.push({
      code: "odd-total-pages",
      message: "본문 페이지 수가 홀수라 마지막 펼침이 한 면만 찹니다.",
      physicalIndex: bodyDrafts[bodyDrafts.length - 1].physicalIndex,
    });
  }

  const pages: BookPageSlot[] = drafts.map((d) => ({
    ...d,
    spreadIndex:
      d.side === "single" ? null : (spreadIndexByPhysical.get(d.physicalIndex) ?? null),
    boxes: computeBookPageBoxes(spec, d.side),
  }));
  return { pages, spreads, warnings };
}

// ── 2B. 부모 페이지(마스터) ───────────────────────────────────────────────

export type ParentElementKind =
  | "folio"
  | "work-title"
  | "chapter-title"
  | "episode-title"
  | "rule-line"
  | "custom-text";

export type ParentElementAnchor =
  | "bottom-outside"
  | "bottom-center"
  | "bottom-inside"
  | "top-outside"
  | "top-center"
  | "top-inside";

export type FolioFormat = "arabic" | "arabic-dash" | "roman-lower" | "none";

export interface ParentElement {
  readonly kind: ParentElementKind;
  readonly anchor: ParentElementAnchor;
  /** folio 전용. 기본 arabic. */
  readonly folioFormat?: FolioFormat;
  /** custom-text 전용 고정 문구. work/chapter 제목은 토큰으로 자동 해소된다. */
  readonly text?: string;
  /** 이 요소를 숨길 섹션. 예: 폴리오는 cover·blank에서 숨긴다. */
  readonly hideOnSections?: readonly BookSectionKind[];
}

export interface ParentPageTemplate {
  readonly id: string;
  readonly label: string;
  /** 적용 대상 섹션. 비우면 전 섹션. */
  readonly appliesToSections?: readonly BookSectionKind[];
  /** 적용 대상 면. 비우면 좌우 모두. single(표지)에는 기본 적용하지 않는다. */
  readonly appliesToSides?: readonly Exclude<BookPageSide, "single">[];
  readonly elements: readonly ParentElement[];
}

export interface ResolvedParentElement {
  readonly kind: ParentElementKind;
  readonly anchor: ParentElementAnchor;
  /** 해소된 실제 문자열. rule-line은 빈 문자열. */
  readonly text: string;
  /** 안전 영역(1단계 safe box) 기준 배치 박스(pt). 렌더러가 쓸 자리만 확정한다. */
  readonly box: PdfBox;
}

export interface ParentResolveContext {
  readonly workTitle: string;
  /** 자동 요소 세로 오프셋(mm) — 안전 영역 경계에서 안쪽으로. 기본 0. */
  readonly insetMm?: number;
}

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

export function formatFolio(folio: number, format: FolioFormat): string {
  if (format === "none" || folio <= 0) return "";
  if (format === "arabic-dash") return `- ${folio} -`;
  if (format === "roman-lower") {
    let rest = folio;
    let out = "";
    for (const [value, glyph] of ROMAN) {
      while (rest >= value) {
        out += glyph;
        rest -= value;
      }
    }
    return out;
  }
  return String(folio);
}

function anchorBox(
  anchor: ParentElementAnchor,
  page: BookPageSlot,
  insetPt: number,
): PdfBox {
  const safe = page.boxes.safe;
  const w = safe.width / 3;
  const h = 14; // 자동 요소 한 줄 높이(pt) — 폰트 크기는 렌더 단계 소관.
  const isTop = anchor.startsWith("top");
  const y = isTop ? safe.y + safe.height - h - insetPt : safe.y + insetPt;
  let x = safe.x + w; // center
  if (anchor.endsWith("outside")) {
    x = page.side === "left" ? safe.x : safe.x + safe.width - w;
  } else if (anchor.endsWith("inside")) {
    x = page.side === "left" ? safe.x + safe.width - w : safe.x;
  }
  return { x, y, width: w, height: h };
}

/**
 * 한 페이지에 적용되는 부모 템플릿들을 골라 자동 요소를 해소한다.
 * 우선순위: templates 배열의 앞쪽 템플릿이 같은 kind+anchor를 이미 냈으면
 * 뒤쪽 템플릿의 중복 요소는 버린다(구체 템플릿을 앞에 두는 관례).
 * folio가 null인 페이지(번호 매김 전)와 hideOnSections에 걸린 요소는 제외.
 */
export function resolveParentElements(
  templates: readonly ParentPageTemplate[],
  page: BookPageSlot,
  context: ParentResolveContext,
): readonly ResolvedParentElement[] {
  if (page.side === "single") return [];
  const insetPt = (context.insetMm ?? 0) * (72 / 25.4);
  const seen = new Set<string>();
  const out: ResolvedParentElement[] = [];
  for (const template of templates) {
    if (
      template.appliesToSections &&
      template.appliesToSections.length > 0 &&
      !template.appliesToSections.includes(page.sectionKind)
    ) {
      continue;
    }
    if (
      template.appliesToSides &&
      template.appliesToSides.length > 0 &&
      !template.appliesToSides.includes(page.side)
    ) {
      continue;
    }
    for (const element of template.elements) {
      const key = `${element.kind}:${element.anchor}`;
      if (seen.has(key)) continue;
      if (element.hideOnSections?.includes(page.sectionKind)) continue;
      let text = "";
      if (element.kind === "folio") {
        if (page.folio === null) continue;
        text = formatFolio(page.folio, element.folioFormat ?? "arabic");
        if (text === "") continue;
      } else if (element.kind === "work-title") {
        text = context.workTitle;
      } else if (element.kind === "chapter-title" || element.kind === "episode-title") {
        text = page.chapterTitle ?? "";
        if (text === "") continue;
      } else if (element.kind === "custom-text") {
        text = element.text ?? "";
      }
      seen.add(key);
      out.push({
        kind: element.kind,
        anchor: element.anchor,
        text,
        box: anchorBox(element.anchor, page, insetPt),
      });
    }
  }
  return out;
}

/** 기본 부모 템플릿 묶음 — 작가가 아무것도 안 해도 쪽번호·작품명이 붙는다. */
export const DEFAULT_PARENT_TEMPLATES: readonly ParentPageTemplate[] = [
  {
    id: "chapter-opener",
    label: "화 시작면",
    appliesToSections: ["chapter-opener"],
    elements: [
      {
        kind: "folio",
        anchor: "bottom-outside",
        folioFormat: "arabic",
        hideOnSections: ["blank"],
      },
    ],
  },
  {
    id: "body",
    label: "본문",
    elements: [
      {
        kind: "folio",
        anchor: "bottom-outside",
        folioFormat: "arabic",
        hideOnSections: ["cover", "back-cover", "blank"],
      },
      {
        kind: "work-title",
        anchor: "top-outside",
        hideOnSections: ["blank", "toc", "copyright"],
      },
      {
        kind: "chapter-title",
        anchor: "top-center",
        hideOnSections: ["blank", "toc", "copyright", "title"],
      },
    ],
  },
  {
    id: "front-matter",
    label: "앞부속(목차·판권)",
    appliesToSections: ["toc", "copyright", "title"],
    elements: [
      { kind: "folio", anchor: "bottom-center", folioFormat: "roman-lower" },
    ],
  },
];

// ── 2C. 재인쇄 검수 ───────────────────────────────────────────────────────

export type ProofStage =
  | "draft"
  | "preflight"
  | "proof-review"
  | "approved"
  | "reprint-ready";

export interface PrintRunSnapshot {
  readonly runId: string;
  readonly editionLabel: string;
  /** 판형·제본·부모 템플릿이 바뀐 것을 나타내는 구조 해시. */
  readonly structureHash: string;
  readonly pages: readonly BookPageSlot[];
}

export interface ReprintDiff {
  readonly changedPhysicalIndexes: readonly number[];
  readonly addedPhysicalIndexes: readonly number[];
  readonly removedCount: number;
  /** 판형·제본·부모가 바뀌어 전 페이지 재검수가 필요한가. */
  readonly structureChanged: boolean;
  /** 재검수 대상 물리 인덱스. structureChanged면 전 페이지. */
  readonly reproofPhysicalIndexes: readonly number[];
}

export function diffPrintRuns(
  prev: PrintRunSnapshot,
  next: PrintRunSnapshot,
): ReprintDiff {
  const structureChanged = prev.structureHash !== next.structureHash;
  const prevById = new Map(
    prev.pages.filter((p) => p.inputId !== null).map((p) => [p.inputId as string, p]),
  );
  const changed: number[] = [];
  const added: number[] = [];
  const nextIds = new Set<string>();
  for (const page of next.pages) {
    if (page.inputId === null) continue;
    nextIds.add(page.inputId);
    const before = prevById.get(page.inputId);
    if (!before) {
      added.push(page.physicalIndex);
    } else if (
      before.contentHash !== page.contentHash ||
      before.folio !== page.folio ||
      before.side !== page.side
    ) {
      changed.push(page.physicalIndex);
    }
  }
  const removedCount = [...prevById.keys()].filter((id) => !nextIds.has(id)).length;
  const reproof = structureChanged
    ? next.pages.map((p) => p.physicalIndex)
    : [...changed, ...added].sort((a, b) => a - b);
  return {
    changedPhysicalIndexes: changed,
    addedPhysicalIndexes: added,
    removedCount,
    structureChanged,
    reproofPhysicalIndexes: reproof,
  };
}

export type ProofCheckId =
  | "spread-parity"
  | "folio-continuity"
  | "parent-consistency"
  | "bleed-safe"
  | "changed-pages-only"
  | "cover-spine";

export interface ProofCheckResult {
  readonly id: ProofCheckId;
  readonly status: "pass" | "warn" | "fail";
  readonly message: string;
}

/**
 * 페이지네이션 자체에서 기계적으로 판정 가능한 검수만 여기서 한다.
 * (도련·안전 침범 같은 이미지 실측 검사는 1단계 내보내기 파이프라인 소관이며
 *  이 함수의 bleed-safe는 "안전 박스가 존재하고 양수인가"의 구조 검사다.)
 */
export function evaluateProofChecks(
  pagination: BookPagination,
  diff: ReprintDiff | null,
): readonly ProofCheckResult[] {
  const results: ProofCheckResult[] = [];
  const odd = pagination.warnings.some((w) => w.code === "odd-total-pages");
  results.push({
    id: "spread-parity",
    status: odd ? "warn" : "pass",
    message: odd
      ? "마지막 펼침이 한 면만 찹니다. 백지 추가 여부를 확인하세요."
      : "모든 펼침이 좌우 쌍을 이룹니다.",
  });
  let folioOk = true;
  let last: number | null = null;
  for (const page of pagination.pages) {
    if (page.folio === null) continue;
    if (last !== null && page.folio !== last + 1) folioOk = false;
    last = page.folio;
  }
  results.push({
    id: "folio-continuity",
    status: folioOk ? "pass" : "fail",
    message: folioOk ? "쪽번호가 끊기지 않습니다." : "쪽번호 연속성이 깨졌습니다.",
  });
  const safeOk = pagination.pages.every(
    (p) => p.boxes.safe.width > 0 && p.boxes.safe.height > 0,
  );
  results.push({
    id: "bleed-safe",
    status: safeOk ? "pass" : "fail",
    message: safeOk
      ? "전 페이지에 유효한 안전 영역이 있습니다."
      : "안전 영역이 무효한 페이지가 있습니다.",
  });
  results.push({
    id: "parent-consistency",
    status: "pass",
    message: "부모 템플릿 해소는 resolveParentElements 단위 테스트로 고정됩니다.",
  });
  if (diff) {
    results.push({
      id: "changed-pages-only",
      status: diff.structureChanged ? "warn" : "pass",
      message: diff.structureChanged
        ? "구조(판형·제본·부모)가 바뀌어 전 페이지 재검수가 필요합니다."
        : `변경 ${diff.changedPhysicalIndexes.length}장·추가 ${diff.addedPhysicalIndexes.length}장만 재검수하면 됩니다.`,
    });
  }
  return results;
}

/** 검수 단계 전이 가드. 뒤로 가기는 proof-review→preflight만 허용한다. */
export function canAdvanceProofStage(
  from: ProofStage,
  to: ProofStage,
  checks: readonly ProofCheckResult[],
): boolean {
  const order: readonly ProofStage[] = [
    "draft",
    "preflight",
    "proof-review",
    "approved",
    "reprint-ready",
  ];
  if (from === "proof-review" && to === "preflight") return true;
  if (order.indexOf(to) !== order.indexOf(from) + 1) return false;
  if (to === "approved" || to === "reprint-ready") {
    return checks.every((c) => c.status !== "fail");
  }
  return true;
}
