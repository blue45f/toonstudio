/**
 * Wave 127 — 양면 스프레드 책등(Gutter) 먹힘·외곽 재단선 안전 여백·도련(Bleed)
 * 인쇄 출고 감사기 및 결정론적 출고 매니페스트 SHA-256 생성기.
 *
 * 감사 항목:
 * 1. `spine-gutter-swallow-risk` (blocker): 얼굴·말풍선·중요 요소가 제본별 책등 금지대 안으로 침범.
 * 2. `outer-trim-safety-violation` (blocker / warning): 크리프 보정 전/후 외곽·상하 재단 안전선 침범.
 * 3. `insufficient-bleed` (blocker): 전면 인쇄(full-bleed) 컷 도련이 3.0mm 미만.
 * 4. `non-facing-spread-pairing` (blocker): 펼침면이 아닌 페이지 쌍에 양면 스프레드를 배치.
 */

import {
  BOOK_BINDING_PROFILES,
  BookImpositionValidationError,
  HARD_TRIM_CLIPPING_ZONE_MM,
  MIN_PRINT_BLEED_MM,
  assertFiniteNonNegative,
  canonicalizeImpositionJson,
  roundMm,
  sha256ImpositionHex,
  type BookAuditedBoxOverlay,
  type BookImportantBoxKind,
  type BookImportantBoxSpec,
  type BookPageBleedEdgesMm,
  type BookPageContentSpec,
  type BookPageSlotPlacement,
  type BookPrintAuditFindingCode,
  type BookPrintAuditSeverity,
  type BookPrintSafetyAuditInput,
  type BookPrintSafetyAuditReport,
  type BookPrintSafetyFinding,
  type BookReadingDirection,
  type BookSignatureImpositionPlan,
  type DoublePageSpreadSpec,
} from "./book-imposition-types";

const BOX_KIND_LABELS_KO: Readonly<Record<BookImportantBoxKind, string>> = {
  "character-face": "주인공 얼굴",
  "dialogue-balloon": "대사 말풍선",
  "panel-border": "컷 경계선",
  "caption-text": "내레이션·캡션",
  "sfx-lettering": "효과음 레터링",
};

function validateImportantBox(box: BookImportantBoxSpec, contextLabel: string): void {
  if (!box || typeof box !== "object") {
    throw new BookImpositionValidationError(
      "invalid-important-box",
      `${contextLabel}: 중요 요소 객체가 유효하지 않습니다.`,
    );
  }
  if (typeof box.id !== "string" || box.id.trim().length === 0) {
    throw new BookImpositionValidationError(
      "invalid-box-id",
      `${contextLabel}: 중요 요소 id가 비어 있습니다.`,
    );
  }
  if (
    !Number.isFinite(box.xMm) ||
    !Number.isFinite(box.yMm) ||
    !Number.isFinite(box.widthMm) ||
    !Number.isFinite(box.heightMm) ||
    box.widthMm <= 0 ||
    box.heightMm <= 0
  ) {
    throw new BookImpositionValidationError(
      "invalid-box-geometry",
      `${contextLabel} (${box.id}): 박스 좌표/크기가 유효한 유한수가 아닙니다.`,
    );
  }
}

function resolvePagePlacement(
  plan: BookSignatureImpositionPlan,
  pageNumber: number,
  fieldLabel: string,
): BookPageSlotPlacement {
  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > plan.paddedPageCount
  ) {
    throw new BookImpositionValidationError(
      "page-number-out-of-range",
      `${fieldLabel}: 페이지 번호(${String(pageNumber)})가 1..${String(plan.paddedPageCount)} 범위를 벗어났습니다.`,
    );
  }
  const placement = plan.pagePlacements[pageNumber - 1];
  if (!placement || placement.pageNumber !== pageNumber) {
    throw new BookImpositionValidationError(
      "missing-page-placement",
      `${fieldLabel}: p.${String(pageNumber)} 조판 배치 정보를 찾지 못했습니다.`,
    );
  }
  return placement;
}

function isValidFacingSpreadPair(
  leftPageNumber: number,
  rightPageNumber: number,
  readingDirection: BookReadingDirection,
): boolean {
  if (readingDirection === "ltr-korean-western") {
    return leftPageNumber % 2 === 0 && rightPageNumber === leftPageNumber + 1;
  }
  return rightPageNumber % 2 === 0 && leftPageNumber === rightPageNumber + 1;
}

function resolveEffectiveBleedMm(
  fallbackBleedMm: number,
  bleedMm: number | undefined,
  bleedEdgesMm: BookPageBleedEdgesMm | undefined,
  contextLabel: string,
): number {
  if (bleedEdgesMm !== undefined) {
    const top = assertFiniteNonNegative(bleedEdgesMm.topMm, `${contextLabel}.bleedEdgesMm.topMm`, 50);
    const bottom = assertFiniteNonNegative(
      bleedEdgesMm.bottomMm,
      `${contextLabel}.bleedEdgesMm.bottomMm`,
      50,
    );
    const outer = assertFiniteNonNegative(
      bleedEdgesMm.outerMm,
      `${contextLabel}.bleedEdgesMm.outerMm`,
      50,
    );
    if (bleedEdgesMm.innerMm !== undefined) {
      const inner = assertFiniteNonNegative(
        bleedEdgesMm.innerMm,
        `${contextLabel}.bleedEdgesMm.innerMm`,
        50,
      );
      return roundMm(Math.min(top, bottom, outer, inner));
    }
    return roundMm(Math.min(top, bottom, outer));
  }
  if (bleedMm !== undefined) {
    return roundMm(assertFiniteNonNegative(bleedMm, `${contextLabel}.bleedMm`, 50));
  }
  return roundMm(fallbackBleedMm);
}

function classifyOuterTrimSeverity(effectiveMinClearanceMm: number): BookPrintAuditSeverity {
  return effectiveMinClearanceMm < HARD_TRIM_CLIPPING_ZONE_MM ? "blocker" : "warning";
}

function buildSpineRecommendationKo(
  plan: BookSignatureImpositionPlan,
  spineHiddenZoneMm: number,
  intrusionMm: number,
): string {
  const shiftMm = roundMm(intrusionMm + 1.0);
  if (plan.bindingMethod === "perfect-bound-pur") {
    return `요소를 책등에서 바깥쪽으로 최소 ${String(shiftMm)}mm 이동하거나, 책등 금지대(${String(spineHiddenZoneMm)}mm)가 더 좁은 사철 양장 제본으로 변경하세요.`;
  }
  return `요소를 책등 금지대(${String(spineHiddenZoneMm)}mm) 바깥쪽으로 최소 ${String(shiftMm)}mm 이동해 배치하세요.`;
}

function buildOuterTrimRecommendationKo(
  safeMarginMm: number,
  intrusionMm: number,
  creepApplied: boolean,
  rawCreepPushOutMm: number,
): string {
  if (!creepApplied && rawCreepPushOutMm >= intrusionMm) {
    return `크리프 보정(${String(rawCreepPushOutMm)}mm 책등 방향 상쇄)을 활성화하면 재단 안전선(${String(safeMarginMm)}mm) 안쪽으로 복구됩니다.`;
  }
  return `요소를 재단 안전선(${String(safeMarginMm)}mm) 안쪽으로 최소 ${String(roundMm(intrusionMm + 0.5))}mm 이동하세요.`;
}

interface AuditMutableCounters {
  beforeCreepOuterTrimViolationCount: number;
  afterCreepOuterTrimViolationCount: number;
  outerTrimViolationsResolvedByCreepCount: number;
  auditedBoxCount: number;
}

function auditSinglePageSpec(
  plan: BookSignatureImpositionPlan,
  page: BookPageContentSpec,
  minBleedMm: number,
  safeMarginMm: number,
  spineHiddenZoneMm: number,
  applyCreep: boolean,
  findings: BookPrintSafetyFinding[],
  overlays: BookAuditedBoxOverlay[],
  counters: AuditMutableCounters,
): void {
  const placement = resolvePagePlacement(plan, page.pageNumber, `pages[p.${String(page.pageNumber)}]`);
  const rawCreepMm = placement.rawCreepPushOutMm;
  const appliedCreepShiftMm = applyCreep ? rawCreepMm : 0;

  if (page.hasFullBleedArt) {
    const effectiveBleedMm = resolveEffectiveBleedMm(
      plan.bleedMm,
      page.bleedMm,
      page.bleedEdgesMm,
      `p.${String(page.pageNumber)}`,
    );
    if (effectiveBleedMm < minBleedMm) {
      const deficitMm = roundMm(minBleedMm - effectiveBleedMm);
      findings.push({
        code: "insufficient-bleed",
        severity: "blocker",
        scope: "page",
        pageNumbers: [page.pageNumber],
        measuredMm: effectiveBleedMm,
        thresholdMm: minBleedMm,
        intrusionMm: deficitMm,
        messageKo: `p.${String(page.pageNumber)} 전면 인쇄 컷의 도련(${String(effectiveBleedMm)}mm)이 최소 기준(${String(minBleedMm)}mm)보다 ${String(deficitMm)}mm 부족합니다.`,
        recommendationKo: `재단 오차 시 흰 여백 노출을 막으려면 p.${String(page.pageNumber)} 전면 배경·컷 도련을 사방 ${String(minBleedMm)}mm 이상으로 확장하세요.`,
      });
    }
  }

  const boxes = page.importantBoxes ?? [];
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    if (!box) continue;
    validateImportantBox(box, `p.${String(page.pageNumber)}`);
    counters.auditedBoxCount += 1;

    const boxLeft = box.xMm;
    const boxRight = box.xMm + box.widthMm;
    const boxTop = box.yMm;
    const boxBottom = box.yMm + box.heightMm;

    const layoutSpineClearanceMm =
      placement.spineEdgeOnPage === "left" ? boxLeft : plan.trimWidthMm - boxRight;
    const layoutOuterClearanceMm =
      placement.spineEdgeOnPage === "left" ? plan.trimWidthMm - boxRight : boxLeft;
    const topClearanceMm = boxTop;
    const bottomClearanceMm = plan.trimHeightMm - boxBottom;

    const effectiveSpineClearanceMm = roundMm(layoutSpineClearanceMm - appliedCreepShiftMm);
    const outerBeforeCreepMm = roundMm(layoutOuterClearanceMm - rawCreepMm);
    const outerAfterCreepMm = roundMm(layoutOuterClearanceMm - rawCreepMm + rawCreepMm);
    const effectiveOuterClearanceMm = applyCreep ? outerAfterCreepMm : outerBeforeCreepMm;

    const kindLabel = BOX_KIND_LABELS_KO[box.kind] ?? box.kind;
    let overlayStatus: "safe" | "warning" | "blocker" = "safe";
    let primaryIssueCode: BookPrintAuditFindingCode | undefined;

    if (!box.allowGutterCrossing && effectiveSpineClearanceMm < spineHiddenZoneMm) {
      const intrusionMm = roundMm(spineHiddenZoneMm - effectiveSpineClearanceMm);
      findings.push({
        code: "spine-gutter-swallow-risk",
        severity: "blocker",
        scope: "page",
        pageNumbers: [page.pageNumber],
        boxId: box.id,
        boxKind: box.kind,
        boxLabel: box.label,
        measuredMm: effectiveSpineClearanceMm,
        thresholdMm: spineHiddenZoneMm,
        intrusionMm,
        uncompensatedMeasuredMm: roundMm(layoutSpineClearanceMm),
        creepShiftAppliedMm: appliedCreepShiftMm,
        messageKo: `p.${String(page.pageNumber)} '${box.label}'(${kindLabel})이 책등에서 ${String(effectiveSpineClearanceMm)}mm 위치에 있어 ${BOOK_BINDING_PROFILES[plan.bindingMethod].labelKo} 책등 금지대(${String(spineHiddenZoneMm)}mm)를 ${String(intrusionMm)}mm 침범했습니다.`,
        recommendationKo: buildSpineRecommendationKo(plan, spineHiddenZoneMm, intrusionMm),
      });
      overlayStatus = "blocker";
      primaryIssueCode = "spine-gutter-swallow-risk";
    }

    if (!box.isFullBleedEdge) {
      const minBeforeCreepMm = roundMm(Math.min(outerBeforeCreepMm, topClearanceMm, bottomClearanceMm));
      const minAfterCreepMm = roundMm(Math.min(outerAfterCreepMm, topClearanceMm, bottomClearanceMm));
      const beforeViolated = minBeforeCreepMm < safeMarginMm;
      const afterViolated = minAfterCreepMm < safeMarginMm;

      if (beforeViolated) counters.beforeCreepOuterTrimViolationCount += 1;
      if (afterViolated) counters.afterCreepOuterTrimViolationCount += 1;
      if (beforeViolated && !afterViolated) counters.outerTrimViolationsResolvedByCreepCount += 1;

      const activeMinClearanceMm = roundMm(
        Math.min(effectiveOuterClearanceMm, topClearanceMm, bottomClearanceMm),
      );
      if (activeMinClearanceMm < safeMarginMm) {
        const intrusionMm = roundMm(safeMarginMm - activeMinClearanceMm);
        const severity = classifyOuterTrimSeverity(activeMinClearanceMm);
        findings.push({
          code: "outer-trim-safety-violation",
          severity,
          scope: "page",
          pageNumbers: [page.pageNumber],
          boxId: box.id,
          boxKind: box.kind,
          boxLabel: box.label,
          measuredMm: activeMinClearanceMm,
          thresholdMm: safeMarginMm,
          intrusionMm,
          uncompensatedMeasuredMm: minBeforeCreepMm,
          creepShiftAppliedMm: appliedCreepShiftMm,
          messageKo: `p.${String(page.pageNumber)} '${box.label}'(${kindLabel})이 외곽/상하 재단선에서 ${String(activeMinClearanceMm)}mm까지 접근해 안전 여백(${String(safeMarginMm)}mm)을 ${String(intrusionMm)}mm 침범했습니다.`,
          recommendationKo: buildOuterTrimRecommendationKo(
            safeMarginMm,
            intrusionMm,
            applyCreep,
            rawCreepMm,
          ),
        });
        if (severity === "blocker") {
          overlayStatus = "blocker";
          primaryIssueCode = primaryIssueCode ?? "outer-trim-safety-violation";
        } else if (overlayStatus === "safe") {
          overlayStatus = "warning";
          primaryIssueCode = "outer-trim-safety-violation";
        }
      }
    }

    const spreadOffsetX = placement.spineEdgeOnPage === "right" ? 0 : plan.trimWidthMm;
    overlays.push({
      scope: "page",
      pageNumbers: [page.pageNumber],
      boxId: box.id,
      boxKind: box.kind,
      boxLabel: box.label,
      spreadXMm: roundMm(spreadOffsetX + box.xMm),
      spreadYMm: roundMm(box.yMm),
      widthMm: roundMm(box.widthMm),
      heightMm: roundMm(box.heightMm),
      status: overlayStatus,
      primaryIssueCode,
    });
  }
}

function auditSpreadSpec(
  plan: BookSignatureImpositionPlan,
  spread: DoublePageSpreadSpec,
  minBleedMm: number,
  safeMarginMm: number,
  spineHiddenZoneMm: number,
  applyCreep: boolean,
  findings: BookPrintSafetyFinding[],
  overlays: BookAuditedBoxOverlay[],
  counters: AuditMutableCounters,
): void {
  const spreadLabel = spread.label ?? spread.spreadId;
  const leftPlacement = resolvePagePlacement(
    plan,
    spread.leftPageNumber,
    `spread(${spread.spreadId}).leftPageNumber`,
  );
  const rightPlacement = resolvePagePlacement(
    plan,
    spread.rightPageNumber,
    `spread(${spread.spreadId}).rightPageNumber`,
  );
  const pageNumbers: readonly number[] = [spread.leftPageNumber, spread.rightPageNumber];

  if (!isValidFacingSpreadPair(spread.leftPageNumber, spread.rightPageNumber, plan.readingDirection)) {
    findings.push({
      code: "non-facing-spread-pairing",
      severity: "blocker",
      scope: "spread",
      spreadId: spread.spreadId,
      pageNumbers,
      measuredMm: 0,
      thresholdMm: 1,
      intrusionMm: 1,
      messageKo: `양면 스프레드 '${spreadLabel}'의 페이지 쌍(p.${String(spread.leftPageNumber)} / p.${String(spread.rightPageNumber)})이 ${plan.readingDirection === "ltr-korean-western" ? "좌철(LTR)" : "우철(RTL)"} 실제 펼침면과 맞지 않습니다.`,
      recommendationKo:
        plan.readingDirection === "ltr-korean-western"
          ? "좌철 단행본 양면 스프레드는 짝수 좌측면-홀수 우측면(예: p.2-3, p.4-5) 쌍으로 배치하세요."
          : "우철 만화책 양면 스프레드는 홀수 좌측면-짝수 우측면(예: p.3-2, p.5-4) 쌍으로 배치하세요.",
    });
  }

  if (spread.hasFullBleedArt) {
    const effectiveBleedMm = resolveEffectiveBleedMm(
      plan.bleedMm,
      spread.bleedMm,
      spread.bleedEdgesMm,
      `spread(${spread.spreadId})`,
    );
    if (effectiveBleedMm < minBleedMm) {
      const deficitMm = roundMm(minBleedMm - effectiveBleedMm);
      findings.push({
        code: "insufficient-bleed",
        severity: "blocker",
        scope: "spread",
        spreadId: spread.spreadId,
        pageNumbers,
        measuredMm: effectiveBleedMm,
        thresholdMm: minBleedMm,
        intrusionMm: deficitMm,
        messageKo: `양면 스프레드 '${spreadLabel}'(p.${String(spread.leftPageNumber)}-${String(spread.rightPageNumber)}) 전면 인쇄 도련(${String(effectiveBleedMm)}mm)이 최소 기준(${String(minBleedMm)}mm)보다 ${String(deficitMm)}mm 부족합니다.`,
        recommendationKo: `재단 후 흰 여백이 드러나지 않도록 양면 스프레드 상·하·외곽 도련을 ${String(minBleedMm)}mm 이상 확보하세요.`,
      });
    }
  }

  const spineCenterX = plan.trimWidthMm;
  const spreadTotalWidthMm = plan.trimWidthMm * 2;
  const boxes = spread.importantBoxes ?? [];

  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    if (!box) continue;
    validateImportantBox(box, `spread(${spread.spreadId})`);
    counters.auditedBoxCount += 1;

    const boxLeft = box.xMm;
    const boxRight = box.xMm + box.widthMm;
    const boxTop = box.yMm;
    const boxBottom = box.yMm + box.heightMm;

    const crossesCenterSpine = boxLeft < spineCenterX && boxRight > spineCenterX;
    const onLeftHalf = boxRight <= spineCenterX;
    const relevantCreepMm = crossesCenterSpine
      ? Math.max(leftPlacement.rawCreepPushOutMm, rightPlacement.rawCreepPushOutMm)
      : onLeftHalf
        ? leftPlacement.rawCreepPushOutMm
        : rightPlacement.rawCreepPushOutMm;
    const appliedCreepShiftMm = applyCreep ? relevantCreepMm : 0;

    const layoutSpineClearanceMm = crossesCenterSpine
      ? 0
      : onLeftHalf
        ? spineCenterX - boxRight
        : boxLeft - spineCenterX;
    const effectiveSpineClearanceMm = crossesCenterSpine
      ? 0
      : roundMm(layoutSpineClearanceMm - appliedCreepShiftMm);

    const kindLabel = BOX_KIND_LABELS_KO[box.kind] ?? box.kind;
    let overlayStatus: "safe" | "warning" | "blocker" = "safe";
    let primaryIssueCode: BookPrintAuditFindingCode | undefined;

    if (!box.allowGutterCrossing && effectiveSpineClearanceMm < spineHiddenZoneMm) {
      const intrusionMm = roundMm(spineHiddenZoneMm - effectiveSpineClearanceMm);
      findings.push({
        code: "spine-gutter-swallow-risk",
        severity: "blocker",
        scope: "spread",
        spreadId: spread.spreadId,
        pageNumbers,
        boxId: box.id,
        boxKind: box.kind,
        boxLabel: box.label,
        measuredMm: effectiveSpineClearanceMm,
        thresholdMm: spineHiddenZoneMm,
        intrusionMm,
        uncompensatedMeasuredMm: roundMm(layoutSpineClearanceMm),
        creepShiftAppliedMm: appliedCreepShiftMm,
        messageKo: crossesCenterSpine
          ? `양면 스프레드 '${spreadLabel}'의 '${box.label}'(${kindLabel})이 중앙 책등선을 직접 가로질러 ${BOOK_BINDING_PROFILES[plan.bindingMethod].labelKo} 제본 시 먹힘이 발생합니다.`
          : `양면 스프레드 '${spreadLabel}'의 '${box.label}'(${kindLabel})이 책등에서 ${String(effectiveSpineClearanceMm)}mm 위치에 있어 책등 금지대(${String(spineHiddenZoneMm)}mm)를 ${String(intrusionMm)}mm 침범했습니다.`,
        recommendationKo: buildSpineRecommendationKo(plan, spineHiddenZoneMm, intrusionMm),
      });
      overlayStatus = "blocker";
      primaryIssueCode = "spine-gutter-swallow-risk";
    }

    if (!box.isFullBleedEdge) {
      const leftOuterBeforeMm = roundMm(boxLeft - leftPlacement.rawCreepPushOutMm);
      const rightOuterBeforeMm = roundMm(
        spreadTotalWidthMm - boxRight - rightPlacement.rawCreepPushOutMm,
      );
      const leftOuterAfterMm = roundMm(boxLeft);
      const rightOuterAfterMm = roundMm(spreadTotalWidthMm - boxRight);
      const topClearanceMm = roundMm(boxTop);
      const bottomClearanceMm = roundMm(plan.trimHeightMm - boxBottom);

      const minBeforeCreepMm = roundMm(
        Math.min(leftOuterBeforeMm, rightOuterBeforeMm, topClearanceMm, bottomClearanceMm),
      );
      const minAfterCreepMm = roundMm(
        Math.min(leftOuterAfterMm, rightOuterAfterMm, topClearanceMm, bottomClearanceMm),
      );
      const beforeViolated = minBeforeCreepMm < safeMarginMm;
      const afterViolated = minAfterCreepMm < safeMarginMm;

      if (beforeViolated) counters.beforeCreepOuterTrimViolationCount += 1;
      if (afterViolated) counters.afterCreepOuterTrimViolationCount += 1;
      if (beforeViolated && !afterViolated) counters.outerTrimViolationsResolvedByCreepCount += 1;

      const activeMinClearanceMm = applyCreep ? minAfterCreepMm : minBeforeCreepMm;
      if (activeMinClearanceMm < safeMarginMm) {
        const intrusionMm = roundMm(safeMarginMm - activeMinClearanceMm);
        const severity = classifyOuterTrimSeverity(activeMinClearanceMm);
        findings.push({
          code: "outer-trim-safety-violation",
          severity,
          scope: "spread",
          spreadId: spread.spreadId,
          pageNumbers,
          boxId: box.id,
          boxKind: box.kind,
          boxLabel: box.label,
          measuredMm: activeMinClearanceMm,
          thresholdMm: safeMarginMm,
          intrusionMm,
          uncompensatedMeasuredMm: minBeforeCreepMm,
          creepShiftAppliedMm: appliedCreepShiftMm,
          messageKo: `양면 스프레드 '${spreadLabel}'의 '${box.label}'(${kindLabel})이 외곽/상하 재단선에서 ${String(activeMinClearanceMm)}mm까지 접근해 안전 여백(${String(safeMarginMm)}mm)을 ${String(intrusionMm)}mm 침범했습니다.`,
          recommendationKo: buildOuterTrimRecommendationKo(
            safeMarginMm,
            intrusionMm,
            applyCreep,
            relevantCreepMm,
          ),
        });
        if (severity === "blocker") {
          overlayStatus = "blocker";
          primaryIssueCode = primaryIssueCode ?? "outer-trim-safety-violation";
        } else if (overlayStatus === "safe") {
          overlayStatus = "warning";
          primaryIssueCode = "outer-trim-safety-violation";
        }
      }
    }

    overlays.push({
      scope: "spread",
      pageNumbers,
      spreadId: spread.spreadId,
      boxId: box.id,
      boxKind: box.kind,
      boxLabel: box.label,
      spreadXMm: roundMm(box.xMm),
      spreadYMm: roundMm(box.yMm),
      widthMm: roundMm(box.widthMm),
      heightMm: roundMm(box.heightMm),
      status: overlayStatus,
      primaryIssueCode,
    });
  }
}

/**
 * 조판 계획(`BookSignatureImpositionPlan`)을 기준으로 개별 페이지 및 양면 스프레드의
 * 책등 먹힘·외곽 재단 안전 여백(크리프 보정 전/후)·전면 도련(>=3mm)을 감사하고
 * 인쇄소 출고 매니페스트 SHA-256 지문을 생성한다.
 */
export function auditBookPrintSafety(
  plan: BookSignatureImpositionPlan,
  input: BookPrintSafetyAuditInput,
): BookPrintSafetyAuditReport {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.pagePlacements)) {
    throw new BookImpositionValidationError(
      "invalid-imposition-plan",
      "유효한 BookSignatureImpositionPlan 객체가 필요합니다.",
    );
  }
  if (!input || typeof input !== "object") {
    throw new BookImpositionValidationError(
      "invalid-audit-input",
      "인쇄 안전 감사 입력 객체가 비어 있습니다.",
    );
  }

  const minBleedMm = roundMm(
    assertFiniteNonNegative(input.minBleedMm ?? MIN_PRINT_BLEED_MM, "minBleedMm", 50),
  );
  const safeMarginMm = roundMm(
    assertFiniteNonNegative(
      input.safeMarginMmOverride ?? plan.safeMarginMm,
      "safeMarginMm",
      Math.min(plan.trimWidthMm, plan.trimHeightMm) * 0.49,
    ),
  );
  const spineHiddenZoneMm = roundMm(
    assertFiniteNonNegative(
      input.spineHiddenZoneMmOverride ?? plan.spineHiddenZoneMm,
      "spineHiddenZoneMm",
      plan.trimWidthMm * 0.49,
    ),
  );
  const applyCreep =
    input.applyCreepCompensationOverride !== undefined
      ? input.applyCreepCompensationOverride
      : plan.applyCreepCompensation;

  const findings: BookPrintSafetyFinding[] = [];
  const boxOverlays: BookAuditedBoxOverlay[] = [];
  const counters: AuditMutableCounters = {
    beforeCreepOuterTrimViolationCount: 0,
    afterCreepOuterTrimViolationCount: 0,
    outerTrimViolationsResolvedByCreepCount: 0,
    auditedBoxCount: 0,
  };

  const pages = input.pages ?? [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    if (page) {
      auditSinglePageSpec(
        plan,
        page,
        minBleedMm,
        safeMarginMm,
        spineHiddenZoneMm,
        applyCreep,
        findings,
        boxOverlays,
        counters,
      );
    }
  }

  const spreads = input.spreads ?? [];
  for (let i = 0; i < spreads.length; i += 1) {
    const spread = spreads[i];
    if (spread) {
      auditSpreadSpec(
        plan,
        spread,
        minBleedMm,
        safeMarginMm,
        spineHiddenZoneMm,
        applyCreep,
        findings,
        boxOverlays,
        counters,
      );
    }
  }

  let blockerCount = 0;
  let warningCount = 0;
  let spineGutterBlockerCount = 0;
  let outerTrimViolationCount = 0;
  let insufficientBleedBlockerCount = 0;
  let nonFacingSpreadBlockerCount = 0;

  for (let i = 0; i < findings.length; i += 1) {
    const f = findings[i];
    if (!f) continue;
    if (f.severity === "blocker") blockerCount += 1;
    else warningCount += 1;

    if (f.code === "spine-gutter-swallow-risk") spineGutterBlockerCount += 1;
    else if (f.code === "outer-trim-safety-violation") outerTrimViolationCount += 1;
    else if (f.code === "insufficient-bleed") insufficientBleedBlockerCount += 1;
    else if (f.code === "non-facing-spread-pairing") nonFacingSpreadBlockerCount += 1;
  }

  const releaseReady = blockerCount === 0;

  const auditManifestPayload = {
    schema: "toonstudio.wave127.book-print-release-manifest.v1",
    planManifestSha256Hex: plan.impositionManifestSha256Hex,
    bookId: plan.bookId,
    bindingMethod: plan.bindingMethod,
    readingDirection: plan.readingDirection,
    releaseReady,
    blockerCount,
    warningCount,
    minBleedMm,
    safeMarginMm,
    spineHiddenZoneMm,
    creepCompensationApplied: applyCreep,
    beforeCreepOuterTrimViolationCount: counters.beforeCreepOuterTrimViolationCount,
    afterCreepOuterTrimViolationCount: counters.afterCreepOuterTrimViolationCount,
    outerTrimViolationsResolvedByCreepCount: counters.outerTrimViolationsResolvedByCreepCount,
    findings: findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      scope: f.scope,
      pageNumbers: f.pageNumbers,
      spreadId: f.spreadId ?? null,
      boxId: f.boxId ?? null,
      measuredMm: f.measuredMm,
      thresholdMm: f.thresholdMm,
      intrusionMm: f.intrusionMm,
    })),
  };

  const impositionManifestSha256Hex = sha256ImpositionHex(
    canonicalizeImpositionJson(auditManifestPayload),
  );

  return {
    bookId: plan.bookId,
    bookTitle: plan.bookTitle,
    bindingMethod: plan.bindingMethod,
    readingDirection: plan.readingDirection,
    releaseReady,
    blockerCount,
    warningCount,
    spineGutterBlockerCount,
    outerTrimViolationCount,
    insufficientBleedBlockerCount,
    nonFacingSpreadBlockerCount,
    beforeCreepOuterTrimViolationCount: counters.beforeCreepOuterTrimViolationCount,
    afterCreepOuterTrimViolationCount: counters.afterCreepOuterTrimViolationCount,
    outerTrimViolationsResolvedByCreepCount: counters.outerTrimViolationsResolvedByCreepCount,
    creepCompensationApplied: applyCreep,
    auditedPageCount: pages.length,
    auditedSpreadCount: spreads.length,
    auditedBoxCount: counters.auditedBoxCount,
    minBleedMm,
    safeMarginMm,
    spineHiddenZoneMm,
    findings,
    boxOverlays,
    planManifestSha256Hex: plan.impositionManifestSha256Hex,
    impositionManifestSha256Hex,
  };
}
