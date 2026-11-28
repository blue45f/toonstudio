/**
 * Wave 127 — 인쇄 대수 조판(Signature Imposition)·제책 크리프(Creep) 물리 보정
 * 및 책등 폭(Spine Width) 솔버.
 *
 * - 중철(saddle-stitch): 전체 책이 단일 중첩 접지 대수(sheetNestDepth = 0..totalSheets-1).
 * - 무선 PUR(perfect-bound-pur) / 사철 양장(smyth-sewn-hardcover): 대수별 접지 후 병합.
 * - 모든 대수의 모든 시트(앞·뒷면)가 1..paddedPageCount 전수 순열(누락 0건·중복 0건)이며
 *   모든 접지 페어가 `leftPage + rightPage === signatureStart + signatureEnd`를 만족한다.
 */

import {
  BOOK_BINDING_PROFILES,
  BookImpositionValidationError,
  DEFAULT_SAFE_MARGIN_MM,
  MAX_BOOK_RAW_PAGE_COUNT,
  MIN_PRINT_BLEED_MM,
  assertFiniteNonNegative,
  assertFinitePositive,
  assertPositiveInteger,
  canonicalizeImpositionJson,
  isValidBindingMethod,
  isValidReadingDirection,
  isValidSignatureSizePages,
  roundMm,
  sha256ImpositionHex,
  type BookBindingMethod,
  type BookImpositionSheet,
  type BookImpositionSpec,
  type BookPageSlotPlacement,
  type BookPageSpineEdge,
  type BookReadingDirection,
  type BookSheetSidePair,
  type BookSignatureImpositionPlan,
  type BookSignatureSizePages,
  type BookSignatureUnit,
} from "./book-imposition-types";

export interface PaperCreepComputationInput {
  readonly sheetNestDepth: number;
  readonly nestedSheetCount: number;
  readonly paperThicknessMm: number;
  readonly bindingMethod: BookBindingMethod;
}

export interface PaperCreepCompensationResult {
  readonly sheetNestDepth: number;
  readonly nestedSheetCount: number;
  readonly paperThicknessMm: number;
  readonly bindingMethod: BookBindingMethod;
  readonly foldMultiplier: number;
  readonly rawCreepPushOutMm: number;
  readonly creepShiftTowardSpineMm: number;
}

/**
 * 읽기 방향과 페이지 번호(1-based)에 따라 페이지 상에서 책등(Spine)이 위치한 변을 반환한다.
 * - LTR(좌철): 홀수 페이지(1, 3, ...)는 우측면 → 책등은 왼쪽(`"left"`), 짝수 페이지는 오른쪽(`"right"`).
 * - RTL(우철): 홀수 페이지(1, 3, ...)는 좌측면 → 책등은 오른쪽(`"right"`), 짝수 페이지는 왼쪽(`"left"`).
 */
export function resolvePageSpineEdge(
  pageNumber: number,
  readingDirection: BookReadingDirection,
): BookPageSpineEdge {
  if (!isValidReadingDirection(readingDirection)) {
    throw new BookImpositionValidationError(
      "invalid-readingDirection",
      `지원하지 않는 읽기 방향입니다: ${String(readingDirection)}`,
    );
  }
  assertPositiveInteger(pageNumber, "pageNumber", MAX_BOOK_RAW_PAGE_COUNT + 16);
  const isOdd = pageNumber % 2 === 1;
  if (readingDirection === "ltr-korean-western") {
    return isOdd ? "left" : "right";
  }
  return isOdd ? "right" : "left";
}

/**
 * 제본 방식에 따른 책등 폭(mm)을 계산한다.
 * 공식: `spineWidthMm = (paddedPageCount / 2) * paperThicknessMm + coverBoardThicknessMm`
 */
export function computeBookSpineWidthMm(
  paddedPageCount: number,
  paperThicknessMm: number,
  coverBoardThicknessMm: number,
): number {
  assertPositiveInteger(paddedPageCount, "paddedPageCount", MAX_BOOK_RAW_PAGE_COUNT + 16);
  if (paddedPageCount % 2 !== 0) {
    throw new BookImpositionValidationError(
      "odd-paddedPageCount",
      `책등 폭 계산 시 paddedPageCount는 짝수여야 합니다 (입력값: ${String(paddedPageCount)}).`,
    );
  }
  assertFinitePositive(paperThicknessMm, "paperThicknessMm", 2.0);
  assertFiniteNonNegative(coverBoardThicknessMm, "coverBoardThicknessMm", 20.0);
  const leafCount = paddedPageCount / 2;
  return roundMm(leafCount * paperThicknessMm + coverBoardThicknessMm);
}

/**
 * 접지 대수 내 시트 중첩 깊이(`sheetNestDepth`: 0=최외곽 → nestedSheetCount-1=최내측)에 따른
 * 크리프(Shingling / Creep) 외곽 밀림량과 책등 방향 상쇄 이동량(mm)을 계산한다.
 *
 * - 최외곽 시트(`sheetNestDepth === 0`)는 항상 `0.0mm`.
 * - 시트가 안쪽으로 중첩될수록 `sheetNestDepth * paperThicknessMm * foldMultiplier`만큼 단조 증가한다.
 */
export function computePaperCreepCompensationMm(
  input: PaperCreepComputationInput,
): PaperCreepCompensationResult {
  if (!isValidBindingMethod(input.bindingMethod)) {
    throw new BookImpositionValidationError(
      "invalid-bindingMethod",
      `지원하지 않는 제본 방식입니다: ${String(input.bindingMethod)}`,
    );
  }
  const nestedSheetCount = assertPositiveInteger(
    input.nestedSheetCount,
    "nestedSheetCount",
    (MAX_BOOK_RAW_PAGE_COUNT + 16) / 4,
  );
  if (
    typeof input.sheetNestDepth !== "number" ||
    !Number.isFinite(input.sheetNestDepth) ||
    !Number.isInteger(input.sheetNestDepth) ||
    input.sheetNestDepth < 0 ||
    input.sheetNestDepth >= nestedSheetCount
  ) {
    throw new BookImpositionValidationError(
      "invalid-sheetNestDepth",
      `sheetNestDepth는 0 이상 ${String(nestedSheetCount - 1)} 이하 정수여야 합니다 (입력값: ${String(input.sheetNestDepth)}).`,
    );
  }
  const paperThicknessMm = assertFinitePositive(input.paperThicknessMm, "paperThicknessMm", 2.0);
  const profile = BOOK_BINDING_PROFILES[input.bindingMethod];

  const rawCreepPushOutMm =
    nestedSheetCount <= 1 || input.sheetNestDepth === 0
      ? 0
      : roundMm(input.sheetNestDepth * paperThicknessMm * profile.creepFoldMultiplier);

  return {
    sheetNestDepth: input.sheetNestDepth,
    nestedSheetCount,
    paperThicknessMm,
    bindingMethod: input.bindingMethod,
    foldMultiplier: profile.creepFoldMultiplier,
    rawCreepPushOutMm,
    creepShiftTowardSpineMm: rawCreepPushOutMm,
  };
}

function buildSidePair(
  side: "front" | "back",
  leftPage: number,
  rightPage: number,
  rawPageCount: number,
): BookSheetSidePair {
  return {
    side,
    leftPage,
    rightPage,
    leftIsBlankPadding: leftPage > rawPageCount,
    rightIsBlankPadding: rightPage > rawPageCount,
    foldPairSum: leftPage + rightPage,
  };
}

function buildSignatureUnit(
  signatureIndex: number,
  startPage: number,
  endPage: number,
  rawPageCount: number,
  bindingMethod: BookBindingMethod,
  readingDirection: BookReadingDirection,
  paperThicknessMm: number,
  applyCreepCompensation: boolean,
  globalSheetOffset: number,
): {
  readonly signature: BookSignatureUnit;
  readonly placements: readonly BookPageSlotPlacement[];
} {
  const pageCount = endPage - startPage + 1;
  const nestedSheetCount = pageCount / 4;
  const expectedFoldPairSum = startPage + endPage;
  const sheets: BookImpositionSheet[] = [];
  const placements: BookPageSlotPlacement[] = [];
  let maxCreepCompensationMm = 0;

  for (let nestDepth = 0; nestDepth < nestedSheetCount; nestDepth += 1) {
    const outerLow = startPage + 2 * nestDepth;
    const outerHigh = endPage - 2 * nestDepth;
    const innerLow = startPage + 2 * nestDepth + 1;
    const innerHigh = endPage - 2 * nestDepth - 1;

    const frontLeft = readingDirection === "ltr-korean-western" ? outerHigh : outerLow;
    const frontRight = readingDirection === "ltr-korean-western" ? outerLow : outerHigh;
    const backLeft = readingDirection === "ltr-korean-western" ? innerLow : innerHigh;
    const backRight = readingDirection === "ltr-korean-western" ? innerHigh : innerLow;

    const front = buildSidePair("front", frontLeft, frontRight, rawPageCount);
    const back = buildSidePair("back", backLeft, backRight, rawPageCount);

    const creep = computePaperCreepCompensationMm({
      sheetNestDepth: nestDepth,
      nestedSheetCount,
      paperThicknessMm,
      bindingMethod,
    });
    const appliedShiftMm = applyCreepCompensation ? creep.creepShiftTowardSpineMm : 0;
    if (creep.creepShiftTowardSpineMm > maxCreepCompensationMm) {
      maxCreepCompensationMm = creep.creepShiftTowardSpineMm;
    }

    const pressGridRow = nestDepth % 2;
    const headRotationDeg: 0 | 180 = pressGridRow === 1 ? 180 : 0;

    sheets.push({
      globalSheetIndex: globalSheetOffset + nestDepth,
      signatureIndex,
      sheetIndexInSignature: nestDepth,
      sheetNestDepth: nestDepth,
      pressGridRow,
      headRotationDeg,
      front,
      back,
      rawCreepPushOutMm: creep.rawCreepPushOutMm,
      creepShiftTowardSpineMm: appliedShiftMm,
    });

    const slotSpecs: ReadonlyArray<{
      readonly side: "front" | "back";
      readonly slotPosition: "left" | "right";
      readonly pageNumber: number;
    }> = [
      { side: "front", slotPosition: "left", pageNumber: front.leftPage },
      { side: "front", slotPosition: "right", pageNumber: front.rightPage },
      { side: "back", slotPosition: "left", pageNumber: back.leftPage },
      { side: "back", slotPosition: "right", pageNumber: back.rightPage },
    ];

    for (let s = 0; s < slotSpecs.length; s += 1) {
      const slot = slotSpecs[s];
      if (!slot) continue;
      // 인쇄 대지 위에서 좌측 슬롯은 책등이 오른쪽(+x), 우측 슬롯은 책등이 왼쪽(-x)에 있다.
      const horizontalPlateShiftMm =
        slot.slotPosition === "left" ? appliedShiftMm : roundMm(-appliedShiftMm);
      placements.push({
        pageNumber: slot.pageNumber,
        isBlankPadding: slot.pageNumber > rawPageCount,
        signatureIndex,
        sheetIndexInSignature: nestDepth,
        sheetNestDepth: nestDepth,
        side: slot.side,
        slotPosition: slot.slotPosition,
        spineEdgeOnPage: resolvePageSpineEdge(slot.pageNumber, readingDirection),
        rawCreepPushOutMm: creep.rawCreepPushOutMm,
        creepShiftTowardSpineMm: appliedShiftMm,
        horizontalPlateShiftMm,
      });
    }
  }

  return {
    signature: {
      signatureIndex,
      startPage,
      endPage,
      expectedFoldPairSum,
      pageCount,
      nestedSheetCount,
      maxCreepCompensationMm: roundMm(maxCreepCompensationMm),
      sheets,
    },
    placements,
  };
}

function validatePermutationInvariant(
  paddedPageCount: number,
  placements: readonly BookPageSlotPlacement[],
): void {
  if (placements.length !== paddedPageCount) {
    throw new BookImpositionValidationError(
      "imposition-slot-count-mismatch",
      `조판 슬롯 수(${String(placements.length)})가 총 패딩 페이지 수(${String(paddedPageCount)})와 일치하지 않습니다.`,
    );
  }
  const seen = new Uint8Array(paddedPageCount + 1);
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    if (!p || p.pageNumber < 1 || p.pageNumber > paddedPageCount) {
      throw new BookImpositionValidationError(
        "imposition-page-out-of-range",
        `조판 슬롯에 허용 범위 밖 페이지 번호가 포함되었습니다: ${String(p?.pageNumber)}`,
      );
    }
    if (seen[p.pageNumber] === 1) {
      throw new BookImpositionValidationError(
        "imposition-duplicate-page",
        `조판 결과에 중복 페이지 번호가 검출되었습니다: p.${String(p.pageNumber)}`,
      );
    }
    seen[p.pageNumber] = 1;
  }
}

/**
 * 단행본 사양을 바탕으로 인쇄 대수 조판 계획, 자동 백지 패딩, 시트별 크리프 보정량,
 * 책등 폭 및 결정론적 인쇄소 출고 매니페스트 SHA-256 지문을 컴파일한다.
 */
export function compileBookSignatureImposition(
  spec: BookImpositionSpec,
): BookSignatureImpositionPlan {
  if (!spec || typeof spec !== "object") {
    throw new BookImpositionValidationError("invalid-spec", "단행본 조판 사양 객체가 비어 있습니다.");
  }
  if (!isValidBindingMethod(spec.bindingMethod)) {
    throw new BookImpositionValidationError(
      "invalid-bindingMethod",
      `지원하지 않는 제본 방식입니다: ${String(spec.bindingMethod)}`,
    );
  }
  if (!isValidReadingDirection(spec.readingDirection)) {
    throw new BookImpositionValidationError(
      "invalid-readingDirection",
      `지원하지 않는 읽기 방향입니다: ${String(spec.readingDirection)}`,
    );
  }

  const profile = BOOK_BINDING_PROFILES[spec.bindingMethod];
  const signatureSizePages: BookSignatureSizePages =
    spec.signatureSizePages === undefined
      ? profile.defaultSignatureSizePages
      : spec.signatureSizePages;
  if (!isValidSignatureSizePages(signatureSizePages)) {
    throw new BookImpositionValidationError(
      "invalid-signatureSizePages",
      `signatureSizePages는 4, 8, 16 중 하나여야 합니다 (입력값: ${String(signatureSizePages)}).`,
    );
  }

  const rawPageCount = assertPositiveInteger(
    spec.rawPageCount,
    "rawPageCount",
    MAX_BOOK_RAW_PAGE_COUNT,
  );
  const trimWidthMm = assertFinitePositive(spec.trimWidthMm, "trimWidthMm", 1000);
  const trimHeightMm = assertFinitePositive(spec.trimHeightMm, "trimHeightMm", 1000);
  if (trimWidthMm < 20 || trimHeightMm < 20) {
    throw new BookImpositionValidationError(
      "trim-dimensions-too-small",
      `단행본 판형은 가로·세로 모두 20mm 이상이어야 합니다 (${String(trimWidthMm)}x${String(trimHeightMm)}mm).`,
    );
  }

  const paperThicknessMm = assertFinitePositive(spec.paperThicknessMm, "paperThicknessMm", 2.0);
  const coverBoardThicknessMm = assertFiniteNonNegative(
    spec.coverBoardThicknessMm ?? profile.defaultCoverBoardThicknessMm,
    "coverBoardThicknessMm",
    20.0,
  );
  const bleedMm = assertFiniteNonNegative(spec.bleedMm ?? MIN_PRINT_BLEED_MM, "bleedMm", 50.0);
  const safeMarginMm = assertFiniteNonNegative(
    spec.safeMarginMm ?? DEFAULT_SAFE_MARGIN_MM,
    "safeMarginMm",
    Math.min(trimWidthMm, trimHeightMm) * 0.49,
  );
  const spineHiddenZoneMm = assertFiniteNonNegative(
    spec.spineHiddenZoneMm ?? profile.defaultSpineHiddenZoneMm,
    "spineHiddenZoneMm",
    trimWidthMm * 0.49,
  );
  const applyCreepCompensation = spec.applyCreepCompensation !== false;

  const paddedPageCount = Math.ceil(rawPageCount / signatureSizePages) * signatureSizePages;
  const blankPaddingPageCount = paddedPageCount - rawPageCount;
  const blankPaddingPageNumbers: number[] = [];
  for (let p = rawPageCount + 1; p <= paddedPageCount; p += 1) {
    blankPaddingPageNumbers.push(p);
  }

  const signatures: BookSignatureUnit[] = [];
  const allPlacements: BookPageSlotPlacement[] = [];
  let globalSheetOffset = 0;

  if (profile.isSingleNestedGathering) {
    // 중철 제본은 전체 책이 단일 중첩 대수로 접힌다.
    const built = buildSignatureUnit(
      0,
      1,
      paddedPageCount,
      rawPageCount,
      spec.bindingMethod,
      spec.readingDirection,
      paperThicknessMm,
      applyCreepCompensation,
      0,
    );
    signatures.push(built.signature);
    for (let i = 0; i < built.placements.length; i += 1) {
      const p = built.placements[i];
      if (p) allPlacements.push(p);
    }
    globalSheetOffset = built.signature.sheets.length;
  } else {
    const signatureCount = paddedPageCount / signatureSizePages;
    for (let sigIdx = 0; sigIdx < signatureCount; sigIdx += 1) {
      const startPage = sigIdx * signatureSizePages + 1;
      const endPage = (sigIdx + 1) * signatureSizePages;
      const built = buildSignatureUnit(
        sigIdx,
        startPage,
        endPage,
        rawPageCount,
        spec.bindingMethod,
        spec.readingDirection,
        paperThicknessMm,
        applyCreepCompensation,
        globalSheetOffset,
      );
      signatures.push(built.signature);
      for (let i = 0; i < built.placements.length; i += 1) {
        const p = built.placements[i];
        if (p) allPlacements.push(p);
      }
      globalSheetOffset += built.signature.sheets.length;
    }
  }

  validatePermutationInvariant(paddedPageCount, allPlacements);

  allPlacements.sort((a, b) => a.pageNumber - b.pageNumber);

  let maxCreepPushOutMm = 0;
  let maxCreepShiftTowardSpineMm = 0;
  for (let i = 0; i < allPlacements.length; i += 1) {
    const p = allPlacements[i];
    if (!p) continue;
    if (p.rawCreepPushOutMm > maxCreepPushOutMm) {
      maxCreepPushOutMm = p.rawCreepPushOutMm;
    }
    if (p.creepShiftTowardSpineMm > maxCreepShiftTowardSpineMm) {
      maxCreepShiftTowardSpineMm = p.creepShiftTowardSpineMm;
    }
  }

  const textBlockThicknessMm = roundMm((paddedPageCount / 2) * paperThicknessMm);
  const spineWidthMm = computeBookSpineWidthMm(
    paddedPageCount,
    paperThicknessMm,
    coverBoardThicknessMm,
  );
  const pressSheetSpreadWidthMm = roundMm(trimWidthMm * 2 + bleedMm * 2);
  const pressSheetHeightMm = roundMm(trimHeightMm + bleedMm * 2);

  const bookId = (spec.bookId ?? "webtoon-print-vol-01").trim() || "webtoon-print-vol-01";
  const bookTitle = (spec.bookTitle ?? "웹툰 단행본 제1권").trim() || "웹툰 단행본 제1권";

  const manifestPayload = {
    schema: "toonstudio.wave127.book-signature-imposition-plan.v1",
    bookId,
    bookTitle,
    bindingMethod: spec.bindingMethod,
    readingDirection: spec.readingDirection,
    rawPageCount,
    paddedPageCount,
    blankPaddingPageCount,
    signatureSizePages,
    signatureCount: signatures.length,
    totalSheetCount: globalSheetOffset,
    trimWidthMm: roundMm(trimWidthMm),
    trimHeightMm: roundMm(trimHeightMm),
    bleedMm: roundMm(bleedMm),
    safeMarginMm: roundMm(safeMarginMm),
    spineHiddenZoneMm: roundMm(spineHiddenZoneMm),
    paperThicknessMm: roundMm(paperThicknessMm),
    coverBoardThicknessMm: roundMm(coverBoardThicknessMm),
    spineWidthMm,
    applyCreepCompensation,
    signatures: signatures.map((sig) => ({
      signatureIndex: sig.signatureIndex,
      startPage: sig.startPage,
      endPage: sig.endPage,
      sheets: sig.sheets.map((sh) => ({
        sheetIndexInSignature: sh.sheetIndexInSignature,
        front: [sh.front.leftPage, sh.front.rightPage],
        back: [sh.back.leftPage, sh.back.rightPage],
        rawCreepPushOutMm: sh.rawCreepPushOutMm,
        creepShiftTowardSpineMm: sh.creepShiftTowardSpineMm,
      })),
    })),
  };

  const impositionManifestSha256Hex = sha256ImpositionHex(
    canonicalizeImpositionJson(manifestPayload),
  );

  return {
    bookId,
    bookTitle,
    bindingMethod: spec.bindingMethod,
    readingDirection: spec.readingDirection,
    rawPageCount,
    paddedPageCount,
    blankPaddingPageCount,
    blankPaddingPageNumbers,
    signatureSizePages,
    signatureCount: signatures.length,
    totalSheetCount: globalSheetOffset,
    trimWidthMm: roundMm(trimWidthMm),
    trimHeightMm: roundMm(trimHeightMm),
    bleedMm: roundMm(bleedMm),
    safeMarginMm: roundMm(safeMarginMm),
    spineHiddenZoneMm: roundMm(spineHiddenZoneMm),
    paperThicknessMm: roundMm(paperThicknessMm),
    coverBoardThicknessMm: roundMm(coverBoardThicknessMm),
    textBlockThicknessMm,
    spineWidthMm,
    pressSheetSpreadWidthMm,
    pressSheetHeightMm,
    applyCreepCompensation,
    maxCreepPushOutMm: roundMm(maxCreepPushOutMm),
    maxCreepShiftTowardSpineMm: roundMm(maxCreepShiftTowardSpineMm),
    signatures,
    pagePlacements: allPlacements,
    impositionManifestSha256Hex,
  };
}
