import { describe, expect, it } from "vitest";
import {
  BOOK_BINDING_PROFILES,
  BOOK_PAPER_STOCK_PRESETS,
  BookImpositionValidationError,
  MIN_PRINT_BLEED_MM,
  auditBookPrintSafety,
  canonicalizeImpositionJson,
  compileBookSignatureImposition,
  computeBookSpineWidthMm,
  computePaperCreepCompensationMm,
  escapeImpositionSvgXml,
  renderBookImpositionSheetSvg,
  resolvePageSpineEdge,
  sha256ImpositionHex,
  summarizeBookImpositionAuditKo,
  type BookBindingMethod,
  type BookImportantBoxSpec,
  type BookImpositionSpec,
  type BookSignatureImpositionPlan,
  type BookSignatureSizePages,
  type DoublePageSpreadSpec,
} from "./index";

function makeSpec(overrides: Partial<BookImpositionSpec> = {}): BookImpositionSpec {
  return { rawPageCount: 16, bindingMethod: "perfect-bound-pur", readingDirection: "ltr-korean-western", trimWidthMm: 148, trimHeightMm: 210, paperThicknessMm: 0.12, ...overrides };
}

function makeBox(id: string, kind: BookImportantBoxSpec["kind"], label: string, xMm: number, yMm: number, widthMm: number, heightMm: number, extra?: Partial<BookImportantBoxSpec>): BookImportantBoxSpec {
  return { id, kind, label, xMm, yMm, widthMm, heightMm, ...extra };
}

function assertCompletePermutationAndFoldSum(plan: BookSignatureImpositionPlan): void {
  const seen = new Set<number>();
  for (const sig of plan.signatures) {
    const expectedSum = sig.startPage + sig.endPage;
    expect(sig.expectedFoldPairSum).toBe(expectedSum);
    for (const sh of sig.sheets) {
      expect(sh.front.foldPairSum).toBe(expectedSum);
      expect(sh.back.foldPairSum).toBe(expectedSum);
      expect(sh.front.leftPage + sh.front.rightPage).toBe(expectedSum);
      expect(sh.back.leftPage + sh.back.rightPage).toBe(expectedSum);
      for (const pageNo of [sh.front.leftPage, sh.front.rightPage, sh.back.leftPage, sh.back.rightPage]) {
        expect(pageNo).toBeGreaterThanOrEqual(sig.startPage);
        expect(pageNo).toBeLessThanOrEqual(sig.endPage);
        expect(seen.has(pageNo)).toBe(false);
        seen.add(pageNo);
      }
    }
  }
  expect(seen.size).toBe(plan.paddedPageCount);
  for (let p = 1; p <= plan.paddedPageCount; p += 1) expect(seen.has(p)).toBe(true);
}

describe("Wave 127 — 웹툰 단행본 인쇄 대수 조판·제책 크리프 보정 & 양면 스프레드 책등 안전 솔버", () => {
  describe("1. 대수 조판 순열·접지 페어 합·LTR/RTL 대칭 불변식", () => {
    it("중철 8페이지 좌철(LTR) 대수가 정확한 시트 매핑 (8,1)/(2,7), (6,3)/(4,5)을 생성한다", () => {
      const plan = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 8, bindingMethod: "saddle-stitch", signatureSizePages: 8 }),
      );
      expect(plan.signatureCount).toBe(1);
      expect(plan.totalSheetCount).toBe(2);
      expect(plan.blankPaddingPageCount).toBe(0);
      const sig = plan.signatures[0];
      expect(sig?.expectedFoldPairSum).toBe(9);
      expect([sig?.sheets[0]?.front.leftPage, sig?.sheets[0]?.front.rightPage]).toEqual([8, 1]);
      expect([sig?.sheets[0]?.back.leftPage, sig?.sheets[0]?.back.rightPage]).toEqual([2, 7]);
      expect([sig?.sheets[1]?.front.leftPage, sig?.sheets[1]?.front.rightPage]).toEqual([6, 3]);
      expect([sig?.sheets[1]?.back.leftPage, sig?.sheets[1]?.back.rightPage]).toEqual([4, 5]);
      assertCompletePermutationAndFoldSum(plan);
    });

    it("우철(RTL 일본 만화) 조판은 좌철(LTR)의 모든 앞·뒷면 좌우를 정확히 미러링한다", () => {
      const base = { rawPageCount: 32, signatureSizePages: 16 as const, trimWidthMm: 128, trimHeightMm: 182 };
      const ltr = compileBookSignatureImposition(makeSpec({ ...base, readingDirection: "ltr-korean-western" }));
      const rtl = compileBookSignatureImposition(makeSpec({ ...base, readingDirection: "rtl-japanese-manga" }));
      assertCompletePermutationAndFoldSum(ltr);
      assertCompletePermutationAndFoldSum(rtl);
      expect(rtl.signatureCount).toBe(ltr.signatureCount);

      for (let s = 0; s < ltr.signatures.length; s += 1) {
        const lSig = ltr.signatures[s];
        const rSig = rtl.signatures[s];
        expect(rSig?.sheets.length).toBe(lSig?.sheets.length);
        for (let k = 0; k < (lSig?.sheets.length ?? 0); k += 1) {
          const lSh = lSig?.sheets[k];
          const rSh = rSig?.sheets[k];
          expect(rSh?.front.leftPage).toBe(lSh?.front.rightPage);
          expect(rSh?.front.rightPage).toBe(lSh?.front.leftPage);
          expect(rSh?.back.leftPage).toBe(lSh?.back.rightPage);
          expect(rSh?.back.rightPage).toBe(lSh?.back.leftPage);
        }
      }
    });

    it("4p / 8p / 16p 모든 대수 크기와 14p·32p·196p 원고에서 누락·중복 0건 전수 순열을 보장한다", () => {
      const cases: ReadonlyArray<{
        readonly rawPageCount: number;
        readonly bindingMethod: BookBindingMethod;
        readonly signatureSizePages: BookSignatureSizePages;
      }> = [
        { rawPageCount: 4, bindingMethod: "saddle-stitch", signatureSizePages: 4 },
        { rawPageCount: 14, bindingMethod: "saddle-stitch", signatureSizePages: 4 },
        { rawPageCount: 14, bindingMethod: "perfect-bound-pur", signatureSizePages: 8 },
        { rawPageCount: 14, bindingMethod: "perfect-bound-pur", signatureSizePages: 16 },
        { rawPageCount: 32, bindingMethod: "perfect-bound-pur", signatureSizePages: 8 },
        { rawPageCount: 196, bindingMethod: "smyth-sewn-hardcover", signatureSizePages: 16 },
      ];
      for (const tc of cases) {
        const plan = compileBookSignatureImposition(makeSpec(tc));
        expect(plan.paddedPageCount % tc.signatureSizePages).toBe(0);
        expect(plan.paddedPageCount).toBeGreaterThanOrEqual(tc.rawPageCount);
        expect(plan.blankPaddingPageCount).toBe(plan.paddedPageCount - tc.rawPageCount);
        assertCompletePermutationAndFoldSum(plan);
      }
    });

    it("14페이지 원고를 16페이지 대수로 조판하면 p.15·p.16 2면이 자동 백지 패딩으로 표시된다", () => {
      const plan = compileBookSignatureImposition(makeSpec({ rawPageCount: 14, signatureSizePages: 16 }));
      expect(plan.paddedPageCount).toBe(16);
      expect(plan.blankPaddingPageCount).toBe(2);
      expect(plan.blankPaddingPageNumbers).toEqual([15, 16]);
      expect(plan.pagePlacements[13]?.isBlankPadding).toBe(false);
      expect(plan.pagePlacements[14]?.isBlankPadding).toBe(true);
      expect(plan.pagePlacements[15]?.isBlankPadding).toBe(true);
      expect(plan.signatures[0]?.sheets[0]?.front.leftIsBlankPadding).toBe(true);
      expect(plan.signatures[0]?.sheets[0]?.back.rightIsBlankPadding).toBe(true);
    });

    it("196페이지 사철 양장(16p 대수)은 208페이지 13개 대수·52시트로 조판된다", () => {
      const plan = compileBookSignatureImposition(
        makeSpec({
          rawPageCount: 196,
          bindingMethod: "smyth-sewn-hardcover",
          signatureSizePages: 16,
          trimWidthMm: 152,
          trimHeightMm: 225,
          paperThicknessMm: 0.14,
        }),
      );
      expect(plan.paddedPageCount).toBe(208);
      expect(plan.blankPaddingPageCount).toBe(12);
      expect(plan.signatureCount).toBe(13);
      expect(plan.totalSheetCount).toBe(52);
      assertCompletePermutationAndFoldSum(plan);
    });

    it("읽기 방향에 따라 홀수/짝수 페이지의 책등 변(left/right)을 정확히 판정한다", () => {
      expect(resolvePageSpineEdge(1, "ltr-korean-western")).toBe("left");
      expect(resolvePageSpineEdge(2, "ltr-korean-western")).toBe("right");
      expect(resolvePageSpineEdge(1, "rtl-japanese-manga")).toBe("right");
      expect(resolvePageSpineEdge(2, "rtl-japanese-manga")).toBe("left");
    });
  });

  describe("2. 제책 크리프(Creep) 물리 보정 및 책등 폭 산출", () => {
    it("크리프 보정량은 최외곽 시트 0.0mm에서 최내측 시트까지 엄격히 단조 증가한다", () => {
      const plan = compileBookSignatureImposition(
        makeSpec({
          rawPageCount: 32,
          bindingMethod: "saddle-stitch",
          paperThicknessMm: BOOK_PAPER_STOCK_PRESETS["cream-uncoated-100g"]?.paperThicknessMm ?? 0.12,
        }),
      );
      const sheets = plan.signatures[0]?.sheets ?? [];
      expect(sheets.length).toBe(8);
      expect(sheets[0]?.creepShiftTowardSpineMm).toBe(0);
      for (let i = 1; i < sheets.length; i += 1) {
        expect(sheets[i]?.creepShiftTowardSpineMm ?? 0).toBeGreaterThan(
          sheets[i - 1]?.creepShiftTowardSpineMm ?? 0,
        );
      }
      expect(plan.maxCreepShiftTowardSpineMm).toBe(sheets[sheets.length - 1]?.creepShiftTowardSpineMm);
    });

    it("용지가 두꺼울수록(아트지 150g 0.14mm > 미색 모조 100g 0.12mm) 크리프 보정량이 비례 증가한다", () => {
      const thin = computePaperCreepCompensationMm({ sheetNestDepth: 3, nestedSheetCount: 4, paperThicknessMm: 0.12, bindingMethod: "saddle-stitch" });
      const thick = computePaperCreepCompensationMm({ sheetNestDepth: 3, nestedSheetCount: 4, paperThicknessMm: 0.14, bindingMethod: "saddle-stitch" });
      expect(thin.rawCreepPushOutMm).toBeCloseTo(0.54, 4);
      expect(thick.rawCreepPushOutMm).toBeCloseTo(0.63, 4);
      expect(thick.creepShiftTowardSpineMm).toBeGreaterThan(thin.creepShiftTowardSpineMm);
    });

    it("동일 32페이지에서 중철이 단일 중첩 대수로 인해 무선 PUR·사철 양장보다 최대 크리프가 크다", () => {
      const saddle = compileBookSignatureImposition(makeSpec({ rawPageCount: 32, bindingMethod: "saddle-stitch" }));
      const pur = compileBookSignatureImposition(makeSpec({ rawPageCount: 32, bindingMethod: "perfect-bound-pur", signatureSizePages: 16 }));
      const smyth = compileBookSignatureImposition(makeSpec({ rawPageCount: 32, bindingMethod: "smyth-sewn-hardcover", signatureSizePages: 16 }));
      expect(saddle.maxCreepPushOutMm).toBeGreaterThan(smyth.maxCreepPushOutMm);
      expect(smyth.maxCreepPushOutMm).toBeGreaterThan(pur.maxCreepPushOutMm);
    });

    it("인쇄 대지 좌측 슬롯은 +방향(우측 책등), 우측 슬롯은 -방향(좌측 책등)으로 크리프 상쇄된다", () => {
      const plan = compileBookSignatureImposition(makeSpec({ rawPageCount: 16, bindingMethod: "saddle-stitch", paperThicknessMm: 0.14 }));
      const p8 = plan.pagePlacements[7];
      const p9 = plan.pagePlacements[8];
      expect(p8?.slotPosition).toBe("left");
      expect(p9?.slotPosition).toBe("right");
      expect(p8?.horizontalPlateShiftMm).toBeGreaterThan(0);
      expect(p9?.horizontalPlateShiftMm).toBeLessThan(0);
      expect(p8?.horizontalPlateShiftMm).toBeCloseTo(-(p9?.horizontalPlateShiftMm ?? 0), 4);
    });

    it("무선 PUR·사철 양장 책등 폭 공식 (paddedPageCount / 2) * paperThicknessMm + coverBoardThicknessMm을 정확히 계산한다", () => {
      expect(computeBookSpineWidthMm(200, 0.12, 0.6)).toBeCloseTo(12.6, 4);
      expect(computeBookSpineWidthMm(208, 0.14, 4.0)).toBeCloseTo(18.56, 4);
      const purPlan = compileBookSignatureImposition(makeSpec({ rawPageCount: 196, bindingMethod: "perfect-bound-pur", signatureSizePages: 16, coverBoardThicknessMm: 0.8 }));
      expect(purPlan.textBlockThicknessMm).toBeCloseTo(12.48, 4);
      expect(purPlan.spineWidthMm).toBeCloseTo(13.28, 4);
      const hardcoverPlan = compileBookSignatureImposition(makeSpec({ rawPageCount: 196, bindingMethod: "smyth-sewn-hardcover", signatureSizePages: 16, paperThicknessMm: 0.14 }));
      expect(hardcoverPlan.coverBoardThicknessMm).toBe(BOOK_BINDING_PROFILES["smyth-sewn-hardcover"].defaultCoverBoardThicknessMm);
      expect(hardcoverPlan.spineWidthMm).toBeCloseTo(18.56, 4);
    });
  });

  describe("3. 양면 스프레드 책등(Gutter) 먹힘·외곽 재단·도련 안전 감사", () => {
    it("동일 양면 스프레드 얼굴 요소(책등 5mm 거리)가 PUR(8mm 금지대)에서는 차단되고 사철 양장(3mm)에서는 통과한다", () => {
      const spread: DoublePageSpreadSpec = {
        spreadId: "spread-climax-01",
        label: "클라이맥스 양면 펼침",
        leftPageNumber: 4,
        rightPageNumber: 5,
        hasFullBleedArt: true,
        bleedMm: 3.0,
        // trimWidth=148 -> 책등 x=148, 우측 끝=143 -> 책등 거리 5.0mm
        importantBoxes: [makeBox("hero-face", "character-face", "주인공 클로즈업 얼굴", 113, 60, 30, 36)],
      };
      const purPlan = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 32, bindingMethod: "perfect-bound-pur", applyCreepCompensation: false }),
      );
      const smythPlan = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 32, bindingMethod: "smyth-sewn-hardcover", applyCreepCompensation: false }),
      );

      const purAudit = auditBookPrintSafety(purPlan, { spreads: [spread] });
      const smythAudit = auditBookPrintSafety(smythPlan, { spreads: [spread] });

      expect(purAudit.releaseReady).toBe(false);
      expect(purAudit.spineGutterBlockerCount).toBe(1);
      expect(purAudit.findings[0]?.code).toBe("spine-gutter-swallow-risk");
      expect(purAudit.findings[0]?.severity).toBe("blocker");
      expect(purAudit.findings[0]?.intrusionMm).toBeCloseTo(3.0, 4);

      expect(smythAudit.releaseReady).toBe(true);
      expect(smythAudit.spineGutterBlockerCount).toBe(0);
      expect(smythAudit.findings.length).toBe(0);
    });

    it("중앙 책등선을 직접 가로지르는 대사 말풍선은 사철 양장에서도 즉시 차단된다", () => {
      const plan = compileBookSignatureImposition(makeSpec({ rawPageCount: 32, bindingMethod: "smyth-sewn-hardcover" }));
      const audit = auditBookPrintSafety(plan, {
        spreads: [
          {
            spreadId: "spread-cross-01",
            leftPageNumber: 8,
            rightPageNumber: 9,
            hasFullBleedArt: true,
            bleedMm: 3.0,
            importantBoxes: [makeBox("balloon-crossing", "dialogue-balloon", "결정적 대사 말풍선", 135, 40, 26, 20)],
          },
        ],
      });
      expect(audit.releaseReady).toBe(false);
      expect(audit.spineGutterBlockerCount).toBe(1);
      expect(audit.findings[0]?.measuredMm).toBe(0);
    });

    it("allowGutterCrossing=true가 명시된 양면 컷 경계선은 책등 관통을 허용한다", () => {
      const plan = compileBookSignatureImposition(makeSpec());
      const audit = auditBookPrintSafety(plan, {
        spreads: [
          {
            spreadId: "spread-border-ok",
            leftPageNumber: 2,
            rightPageNumber: 3,
            hasFullBleedArt: true,
            bleedMm: 3.0,
            importantBoxes: [
              makeBox("wide-panel-frame", "panel-border", "와이드 액션 컷 외곽선", 15, 20, 266, 170, {
                allowGutterCrossing: true,
              }),
            ],
          },
        ],
      });
      expect(audit.releaseReady).toBe(true);
      expect(audit.blockerCount).toBe(0);
    });

    it("크리프 보정 활성화 시 64p 중철 중앙 페이지의 외곽 재단 안전선 침범이 실제로 해소됨을 입증한다", () => {
      // 64p 중철 150g(0.14mm): 시트 15(p.32/p.33) 크리프 = 15 * 0.14 * 1.5 = 3.15mm
      const uncomp = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 64, bindingMethod: "saddle-stitch", paperThicknessMm: 0.14, applyCreepCompensation: false }),
      );
      const comp = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 64, bindingMethod: "saddle-stitch", paperThicknessMm: 0.14, applyCreepCompensation: true }),
      );
      const pageInput = {
        pages: [
          {
            pageNumber: 33,
            hasFullBleedArt: true,
            bleedMm: 3.0,
            // p.33 우측 끝 136.5 -> 외곽 11.5mm; 미보정 11.5-3.15=8.35mm<10mm, 보정 후 11.5mm>=10mm
            importantBoxes: [makeBox("centerfold-balloon", "dialogue-balloon", "중앙면 외곽 대사 말풍선", 106.5, 40, 30, 24)],
          },
        ],
      };

      const auditBefore = auditBookPrintSafety(uncomp, pageInput);
      const auditAfter = auditBookPrintSafety(comp, pageInput);
      expect(auditBefore.outerTrimViolationCount).toBe(1);
      expect(auditBefore.beforeCreepOuterTrimViolationCount).toBe(1);
      expect(auditBefore.findings[0]?.code).toBe("outer-trim-safety-violation");
      expect(auditBefore.findings[0]?.measuredMm).toBeCloseTo(8.35, 2);

      expect(auditAfter.outerTrimViolationCount).toBe(0);
      expect(auditAfter.beforeCreepOuterTrimViolationCount).toBe(1);
      expect(auditAfter.afterCreepOuterTrimViolationCount).toBe(0);
      expect(auditAfter.outerTrimViolationsResolvedByCreepCount).toBe(1);
      expect(auditAfter.releaseReady).toBe(true);
    });

    it("크리프 보정으로 책등 방향 이동 시 책등 금지대를 침범하는 경우를 정확히 검출한다", () => {
      // 32p 중철 0.14mm -> 시트 7(p.17) 크리프 = 1.47mm; x=3.2 -> 보정 후 1.73mm < 2.5mm
      const plan = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 32, bindingMethod: "saddle-stitch", paperThicknessMm: 0.14, applyCreepCompensation: true }),
      );
      const audit = auditBookPrintSafety(plan, {
        pages: [{ pageNumber: 17, importantBoxes: [makeBox("inner-caption", "caption-text", "책등 인접 캡션", 3.2, 50, 25, 15)] }],
      });
      expect(audit.releaseReady).toBe(false);
      expect(audit.spineGutterBlockerCount).toBe(1);
      expect(audit.findings[0]?.measuredMm).toBeCloseTo(1.73, 2);
      expect(audit.findings[0]?.uncompensatedMeasuredMm).toBeCloseTo(3.2, 2);
    });

    it("재단선 3mm 미만 절단 위험 구간 침범은 warning이 아니라 blocker로 출고를 차단한다", () => {
      const plan = compileBookSignatureImposition(makeSpec());
      const audit = auditBookPrintSafety(plan, {
        pages: [{ pageNumber: 1, hasFullBleedArt: true, bleedMm: 3.0, importantBoxes: [makeBox("clipped-sfx", "sfx-lettering", "외곽 잘림 효과음", 126, 30, 20, 20)] }],
      });
      expect(audit.releaseReady).toBe(false);
      expect(audit.outerTrimViolationCount).toBe(1);
      expect(audit.findings[0]?.severity).toBe("blocker");
    });

    it("전면 인쇄(full-bleed) 컷의 도련이 3.0mm 미만이면 insufficient-bleed blocker로 출고를 차단한다", () => {
      const plan = compileBookSignatureImposition(makeSpec({ bleedMm: 3.0 }));
      const audit = auditBookPrintSafety(plan, {
        pages: [
          { pageNumber: 1, hasFullBleedArt: true, bleedMm: 2.0, importantBoxes: [] },
          { pageNumber: 2, hasFullBleedArt: true, bleedMm: MIN_PRINT_BLEED_MM, importantBoxes: [] },
          { pageNumber: 3, hasFullBleedArt: false, bleedMm: 0, importantBoxes: [] },
        ],
      });
      expect(audit.releaseReady).toBe(false);
      expect(audit.insufficientBleedBlockerCount).toBe(1);
      expect(audit.findings[0]?.code).toBe("insufficient-bleed");
      expect(audit.findings[0]?.severity).toBe("blocker");
      expect(audit.findings[0]?.measuredMm).toBe(2.0);
      expect(audit.findings[0]?.thresholdMm).toBe(3.0);
    });

    it("양면 스프레드의 개별 변 도련(bleedEdgesMm) 중 한 변이라도 3.0mm 미만이면 출고를 차단한다", () => {
      const plan = compileBookSignatureImposition(makeSpec({ bindingMethod: "smyth-sewn-hardcover" }));
      const audit = auditBookPrintSafety(plan, {
        spreads: [{ spreadId: "spread-edge-bleed", leftPageNumber: 4, rightPageNumber: 5, hasFullBleedArt: true, bleedEdgesMm: { topMm: 3.0, bottomMm: 3.0, outerMm: 1.5 }, importantBoxes: [] }],
      });
      expect(audit.releaseReady).toBe(false);
      expect(audit.insufficientBleedBlockerCount).toBe(1);
      expect(audit.findings[0]?.measuredMm).toBe(1.5);
    });

    it("실제 펼침면이 아닌 페이지 쌍(LTR p.1-2, RTL p.2-3)은 non-facing-spread-pairing으로 차단한다", () => {
      const ltrPlan = compileBookSignatureImposition(makeSpec());
      const rtlPlan = compileBookSignatureImposition(makeSpec({ readingDirection: "rtl-japanese-manga", trimWidthMm: 128, trimHeightMm: 182 }));
      const badLtr = auditBookPrintSafety(ltrPlan, { spreads: [{ spreadId: "bad-ltr", leftPageNumber: 1, rightPageNumber: 2, importantBoxes: [] }] });
      const badRtl = auditBookPrintSafety(rtlPlan, { spreads: [{ spreadId: "bad-rtl", leftPageNumber: 2, rightPageNumber: 3, importantBoxes: [] }] });
      const goodRtl = auditBookPrintSafety(rtlPlan, { spreads: [{ spreadId: "good-rtl", leftPageNumber: 3, rightPageNumber: 2, importantBoxes: [] }] });
      expect(badLtr.nonFacingSpreadBlockerCount).toBe(1);
      expect(badLtr.releaseReady).toBe(false);
      expect(badRtl.nonFacingSpreadBlockerCount).toBe(1);
      expect(goodRtl.nonFacingSpreadBlockerCount).toBe(0);
      expect(goodRtl.releaseReady).toBe(true);
    });

    it("우철(RTL) 개별 페이지에서 홀수 페이지 오른쪽 책등·왼쪽 외곽 좌표계를 정확히 적용한다", () => {
      const rtlPlan = compileBookSignatureImposition(makeSpec({ readingDirection: "rtl-japanese-manga", trimWidthMm: 128, trimHeightMm: 182, applyCreepCompensation: false }));
      const audit = auditBookPrintSafety(rtlPlan, {
        pages: [{ pageNumber: 1, hasFullBleedArt: true, bleedMm: 3.0, importantBoxes: [makeBox("rtl-spine-face", "character-face", "우철 1p 책등 인접 얼굴", 104, 50, 20, 25)] }],
      });
      expect(audit.releaseReady).toBe(false);
      expect(audit.spineGutterBlockerCount).toBe(1);
      expect(audit.findings[0]?.measuredMm).toBeCloseTo(4.0, 4);
    });

    it("상단·하단 재단 안전 여백 침범도 감지하고 전면 컷 경계선(isFullBleedEdge)은 오탐하지 않는다", () => {
      const plan = compileBookSignatureImposition(makeSpec({ bindingMethod: "smyth-sewn-hardcover", safeMarginMm: 10 }));
      const audit = auditBookPrintSafety(plan, {
        pages: [{
          pageNumber: 2,
          hasFullBleedArt: true,
          bleedMm: 3.0,
          importantBoxes: [
            makeBox("full-bleed-panel", "panel-border", "전면 배경 컷", 0, 0, 148, 210, { allowGutterCrossing: true, isFullBleedEdge: true }),
            makeBox("top-header-text", "caption-text", "상단 여백 부족 캡션", 30, 6.5, 40, 12),
          ],
        }],
      });
      expect(audit.outerTrimViolationCount).toBe(1);
      expect(audit.findings[0]?.boxId).toBe("top-header-text");
      expect(audit.findings[0]?.measuredMm).toBeCloseTo(6.5, 4);
    });
  });

  describe("4. 순수 ES2017 FIPS 180-4 SHA-256 및 결정론적 매니페스트 지문", () => {
    it("공식 NIST FIPS 180-4 SHA-256 테스트 벡터 3종과 정확히 일치한다", () => {
      expect(sha256ImpositionHex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256ImpositionHex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(sha256ImpositionHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      );
    });

    it("UTF-8 한글 입력과 키 순서가 다른 JSON 객체에서 동일한 결정론적 해시를 생성한다", () => {
      const a = canonicalizeImpositionJson({ z: 1, a: { d: "단행본", c: [3, 2, 1] } });
      const b = canonicalizeImpositionJson({ a: { c: [3, 2, 1], d: "단행본" }, z: 1 });
      expect(a).toBe(b);
      expect(sha256ImpositionHex(a)).toBe(sha256ImpositionHex(b));
      expect(sha256ImpositionHex("웹툰 단행본 조판")).toMatch(/^[0-9a-f]{64}$/);
    });

    it("조판 및 감사 매니페스트 SHA-256이 입력 키 순서에 무관하게 동일하고 사양 변경 시 즉시 바뀐다", () => {
      const planA = compileBookSignatureImposition({ bookId: "vol-1", bookTitle: "성좌 단행본 1권", rawPageCount: 32, bindingMethod: "perfect-bound-pur", readingDirection: "ltr-korean-western", trimWidthMm: 148, trimHeightMm: 210, paperThicknessMm: 0.12 });
      const planB = compileBookSignatureImposition({ paperThicknessMm: 0.12, trimHeightMm: 210, trimWidthMm: 148, readingDirection: "ltr-korean-western", bindingMethod: "perfect-bound-pur", rawPageCount: 32, bookTitle: "성좌 단행본 1권", bookId: "vol-1" });
      const planChanged = compileBookSignatureImposition(makeSpec({ bookId: "vol-1", bookTitle: "성좌 단행본 1권", rawPageCount: 32, paperThicknessMm: 0.14 }));
      expect(planA.impositionManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
      expect(planA.impositionManifestSha256Hex).toBe(planB.impositionManifestSha256Hex);
      expect(planA.impositionManifestSha256Hex).not.toBe(planChanged.impositionManifestSha256Hex);
      const auditA = auditBookPrintSafety(planA, { pages: [] });
      const auditB = auditBookPrintSafety(planB, { pages: [] });
      expect(auditA.impositionManifestSha256Hex).toBe(auditB.impositionManifestSha256Hex);
      expect(auditA.planManifestSha256Hex).toBe(planA.impositionManifestSha256Hex);
    });
  });

  describe("5. 비정상 입력 Fail-Closed 검증", () => {
    it("0·음수·소수·NaN·Infinity 페이지 수 입력 시 BookImpositionValidationError를 던진다", () => {
      for (const badPages of [0, -8, 12.5, Number.NaN, Number.POSITIVE_INFINITY, 3000]) {
        expect(() => compileBookSignatureImposition(makeSpec({ rawPageCount: badPages }))).toThrow(BookImpositionValidationError);
      }
    });

    it("허용되지 않은 대수 크기·용지 두께·판형 치수는 즉시 차단한다", () => {
      expect(() => compileBookSignatureImposition(makeSpec({ signatureSizePages: 12 as unknown as BookSignatureSizePages }))).toThrow(BookImpositionValidationError);
      expect(() => compileBookSignatureImposition(makeSpec({ trimWidthMm: 10 }))).toThrow(BookImpositionValidationError);
      expect(() => compileBookSignatureImposition(makeSpec({ paperThicknessMm: 0 }))).toThrow(BookImpositionValidationError);
    });

    it("범위를 벗어난 sheetNestDepth 및 감사 페이지 번호·박스 좌표를 거부한다", () => {
      expect(() => computePaperCreepCompensationMm({ sheetNestDepth: 4, nestedSheetCount: 4, paperThicknessMm: 0.12, bindingMethod: "saddle-stitch" })).toThrow(BookImpositionValidationError);
      const plan = compileBookSignatureImposition(makeSpec());
      expect(() => auditBookPrintSafety(plan, { pages: [{ pageNumber: 17, importantBoxes: [] }] })).toThrow(BookImpositionValidationError);
      expect(() => auditBookPrintSafety(plan, { pages: [{ pageNumber: 1, importantBoxes: [makeBox("bad-box", "character-face", "오류", 10, 10, Number.NaN, 20)] }] })).toThrow(BookImpositionValidationError);
    });
  });

  describe("6. 순수 OKLCH 대수 조판 평면도 SVG 및 XSS 이스케이프", () => {
    it("SVG가 순수 oklch(...)만 사용하고 원시 hex/rgb/hsl 및 NaN/Infinity가 0건이다", () => {
      const plan = compileBookSignatureImposition(makeSpec({ bookTitle: "검은 별의 연대기 1권", rawPageCount: 14, signatureSizePages: 16 }));
      const audit = auditBookPrintSafety(plan, {
        spreads: [{ spreadId: "s-01", leftPageNumber: 4, rightPageNumber: 5, hasFullBleedArt: true, bleedMm: 2.0, importantBoxes: [makeBox("face-1", "character-face", "주인공 얼굴", 120, 60, 24, 26)] }],
      });
      const svg = renderBookImpositionSheetSvg(plan, audit);
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).toContain("백지 p.16");
      expect(svg).toContain("GUTTER");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\(/i);
      expect(svg).not.toMatch(/\bhsla?\(/i);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    });

    it("악의적인 XML/XSS 페이로드를 제목과 박스 라벨에서 완전히 이스케이프한다", () => {
      const xss = `<script>alert("xss")</script> & '단행본'`;
      expect(escapeImpositionSvgXml(xss)).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;단행본&apos;");
      const plan = compileBookSignatureImposition(makeSpec({ bookTitle: xss, rawPageCount: 8, bindingMethod: "saddle-stitch" }));
      const audit = auditBookPrintSafety(plan, {
        pages: [{ pageNumber: 1, hasFullBleedArt: true, bleedMm: 3.0, importantBoxes: [makeBox("xss-box", "dialogue-balloon", `<b>"대사"</b>`, 40, 40, 30, 20)] }],
      });
      const svg = renderBookImpositionSheetSvg(plan, audit);
      expect(svg).not.toContain("<script>");
      expect(svg).not.toContain("<b>");
      expect(svg).toContain("&lt;script&gt;");
      expect(svg).toContain("&amp;");
    });

    it("196페이지 대용량 단행본도 maxSignaturesToRender 제한으로 간결하게 렌더링한다", () => {
      const plan = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 196, bindingMethod: "smyth-sewn-hardcover", signatureSizePages: 16, paperThicknessMm: 0.14 }),
      );
      const svg = renderBookImpositionSheetSvg(plan, auditBookPrintSafety(plan, { pages: [] }), {
        maxSignaturesToRender: 2,
      });
      expect(svg).toContain("외 11개 대수 생략");
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    });
  });

  describe("7. 번역투 없는 자연스러운 한국어 제작 PD 출고 QA 브리프", () => {
    it("출고 보류 사례와 출고 승인 사례를 명확히 구분하고 금지 번역투를 포함하지 않는다", () => {
      const plan = compileBookSignatureImposition(
        makeSpec({ bookId: "kr-vol-01", bookTitle: "북부 대공의 시간 1권", rawPageCount: 14, signatureSizePages: 16 }),
      );
      const cleanAudit = auditBookPrintSafety(plan, {
        pages: [{ pageNumber: 1, hasFullBleedArt: true, bleedMm: 3.0, importantBoxes: [] }],
      });
      const blockedAudit = auditBookPrintSafety(plan, {
        spreads: [
          {
            spreadId: "sp-blocked",
            leftPageNumber: 4,
            rightPageNumber: 5,
            hasFullBleedArt: true,
            bleedMm: 1.5,
            importantBoxes: [makeBox("hero-face", "character-face", "주인공 얼굴", 130, 50, 14, 18)],
          },
        ],
      });
      const cleanBrief = summarizeBookImpositionAuditKo(plan, cleanAudit, { auditDateIso: "2026-11-28" });
      const blockedBrief = summarizeBookImpositionAuditKo(plan, blockedAudit, { auditDateIso: "2026-11-28" });

      expect(cleanBrief).toContain("출고 승인");
      expect(cleanBrief).toContain("북부 대공의 시간 1권");
      expect(cleanBrief).toContain("2026-11-28");
      expect(cleanBrief).toContain(cleanAudit.impositionManifestSha256Hex);
      expect(blockedBrief).toContain("출고 보류");
      expect(blockedBrief).toContain("[차단]");
      expect(blockedBrief).toContain("주인공 얼굴");
      expect(blockedBrief).toContain("도련");
      expect(blockedBrief).toContain("사철 양장");

      for (const phrase of [
        "가능하게 합니다",
        "직관적인 경험을 제공",
        "원활한 워크플로우를 보장",
        "효과적으로 제공합니다",
      ]) {
        expect(cleanBrief).not.toContain(phrase);
        expect(blockedBrief).not.toContain(phrase);
      }
    });
  });

  describe("8. 프로파일·프리셋 불변식 및 추가 경계 케이스", () => {
    it("3종 제본 프로파일과 4종 인쇄 용지 프리셋이 유효한 물리 치수를 가진다", () => {
      expect(BOOK_BINDING_PROFILES["saddle-stitch"].isSingleNestedGathering).toBe(true);
      expect(BOOK_BINDING_PROFILES["perfect-bound-pur"].defaultSpineHiddenZoneMm).toBe(8.0);
      expect(BOOK_BINDING_PROFILES["smyth-sewn-hardcover"].defaultSpineHiddenZoneMm).toBe(3.0);
      expect(Object.keys(BOOK_PAPER_STOCK_PRESETS).length).toBeGreaterThanOrEqual(4);
      for (const preset of Object.values(BOOK_PAPER_STOCK_PRESETS)) {
        expect(preset.paperThicknessMm).toBeGreaterThan(0.05);
        expect(preset.paperThicknessMm).toBeLessThan(0.5);
      }
    });

    it("최소 1페이지 원고도 4p 대수로 안전하게 패딩되며 단일 시트 크리프는 0mm이다", () => {
      const plan = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 1, bindingMethod: "saddle-stitch", signatureSizePages: 4 }),
      );
      expect(plan.paddedPageCount).toBe(4);
      expect(plan.blankPaddingPageCount).toBe(3);
      expect(plan.maxCreepPushOutMm).toBe(0);
      expect(plan.maxCreepShiftTowardSpineMm).toBe(0);
      assertCompletePermutationAndFoldSum(plan);
    });

    it("auditBookPrintSafety의 applyCreepCompensationOverride로 동일 계획의 보정 전/후를 즉시 비교할 수 있다", () => {
      const plan = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 64, bindingMethod: "saddle-stitch", paperThicknessMm: 0.14, applyCreepCompensation: true }),
      );
      const spread: DoublePageSpreadSpec = {
        spreadId: "center-spread-64p",
        leftPageNumber: 32,
        rightPageNumber: 33,
        hasFullBleedArt: true,
        bleedMm: 3.0,
        importantBoxes: [makeBox("outer-left-balloon", "dialogue-balloon", "좌측면 외곽 말풍선", 11.0, 45, 28, 22)],
      };
      const offAudit = auditBookPrintSafety(plan, { spreads: [spread], applyCreepCompensationOverride: false });
      const onAudit = auditBookPrintSafety(plan, { spreads: [spread], applyCreepCompensationOverride: true });
      expect(offAudit.outerTrimViolationCount).toBe(1);
      expect(onAudit.outerTrimViolationCount).toBe(0);
      expect(onAudit.outerTrimViolationsResolvedByCreepCount).toBe(1);
      expect(offAudit.impositionManifestSha256Hex).not.toBe(onAudit.impositionManifestSha256Hex);
    });

    it("모든 대수 크기의 뒷면(BACK) 페이지가 앞면(FRONT)의 물리적 뒷장(연속 홀짝 쌍)과 일치한다", () => {
      const plan = compileBookSignatureImposition(
        makeSpec({ rawPageCount: 32, bindingMethod: "smyth-sewn-hardcover", signatureSizePages: 16 }),
      );
      for (const sig of plan.signatures) {
        for (const sh of sig.sheets) {
          expect(sh.back.leftPage).toBe(sh.front.rightPage + 1);
          expect(sh.back.rightPage).toBe(sh.front.leftPage - 1);
        }
      }
    });

    it("대수 크기별(4p/8p/16p) PUR 제본 시트 수와 대수 수가 정확히 일치한다", () => {
      const p4 = compileBookSignatureImposition(makeSpec({ rawPageCount: 32, signatureSizePages: 4 }));
      const p8 = compileBookSignatureImposition(makeSpec({ rawPageCount: 32, signatureSizePages: 8 }));
      const p16 = compileBookSignatureImposition(makeSpec({ rawPageCount: 32, signatureSizePages: 16 }));
      expect(p4.signatureCount).toBe(8);
      expect(p8.signatureCount).toBe(4);
      expect(p16.signatureCount).toBe(2);
      expect(p4.totalSheetCount).toBe(8);
      expect(p8.totalSheetCount).toBe(8);
      expect(p16.totalSheetCount).toBe(8);
      expect(p4.maxCreepPushOutMm).toBe(0);
      expect(p8.maxCreepPushOutMm).toBeLessThan(p16.maxCreepPushOutMm);
    });
  });
});
