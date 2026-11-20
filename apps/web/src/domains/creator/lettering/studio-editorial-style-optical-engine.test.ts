import { describe, expect, it } from "vitest";

import {
  composePageWithParentGraph,
  computeOpticalMarginAdjustment,
  layoutEditorialParagraph,
  resolveCharacterStyle,
  resolveParagraphStyle,
  resolveStyledTextRuns,
  runEditorialPublicationPreflight,
  threadPrimaryTextAcrossPages,
  type EditorialPageDocument,
  type EditorialStyleSheet,
  type ParentPageNode,
} from "./studio-editorial-style-optical-engine";

function createSampleStyleSheet(): EditorialStyleSheet {
  return {
    paragraphStyles: {
      base: {
        id: "base",
        name: "기본 본문",
        attributes: {
          fontFamily: "Pretendard",
          fontWeight: 400,
          fontSizePx: 14,
          lineHeightRatio: 1.5,
          align: "left",
          opticalMarginEnabled: true,
          kinsokuEnabled: true,
        },
      },
      narration: {
        id: "narration",
        name: "나레이션 박스",
        basedOnId: "base",
        attributes: {
          fontSizePx: 16,
          leftIndentPx: 8,
        },
        nestedStyles: [
          {
            id: "speaker-colon",
            characterStyleId: "speaker-bold",
            mode: "delimiter",
            delimiter: ":",
            includeDelimiter: true,
          },
          {
            id: "quote-accent",
            characterStyleId: "quote-italic",
            mode: "regex",
            pattern: "「[^」]+」",
            flags: "g",
          },
        ],
      },
      cycleA: {
        id: "cycleA",
        name: "순환 A",
        basedOnId: "cycleB",
        attributes: { fontSizePx: 18 },
      },
      cycleB: {
        id: "cycleB",
        name: "순환 B",
        basedOnId: "cycleA",
        attributes: { fontWeight: 700 },
      },
    },
    characterStyles: {
      "emphasis-root": {
        id: "emphasis-root",
        name: "강조 루트",
        attributes: { fontWeight: 700, trackingEm: 0.04 },
      },
      "speaker-bold": {
        id: "speaker-bold",
        name: "화자 볼드",
        basedOnId: "emphasis-root",
        attributes: { allCaps: true },
      },
      "quote-italic": {
        id: "quote-italic",
        name: "인용 이탤릭",
        attributes: { fontStyle: "italic", underline: true },
      },
    },
  };
}

describe("studio-editorial-style-optical-engine", () => {
  it("계층형 문단·문자 스타일 상속, 로컬 오버라이드, 순환 참조 차단을 처리한다", () => {
    const sheet = createSampleStyleSheet();

    const narration = resolveParagraphStyle(sheet, "narration", { spaceAfterPx: 12 });
    expect(narration.cycleDetected).toBe(false);
    expect(narration.inheritanceChain).toEqual(["base", "narration"]);
    expect(narration.resolved.fontFamily).toBe("Pretendard");
    expect(narration.resolved.fontSizePx).toBe(16);
    expect(narration.resolved.spaceAfterPx).toBe(12);
    expect(narration.overriddenKeys).toEqual(["spaceAfterPx"]);

    const speaker = resolveCharacterStyle(sheet, "speaker-bold", narration.resolved);
    expect(speaker.inheritanceChain).toEqual(["emphasis-root", "speaker-bold"]);
    expect(speaker.resolved.fontWeight).toBe(700);
    expect(speaker.resolved.trackingEm).toBeCloseTo(0.04, 4);
    expect(speaker.resolved.allCaps).toBe(true);

    const cyclic = resolveParagraphStyle(sheet, "cycleA");
    expect(cyclic.cycleDetected).toBe(true);
    expect(cyclic.inheritanceChain).toEqual(["cycleB", "cycleA"]);
  });

  it("Nested Styles(구분자 + 정규식)와 인라인 문자 오버라이드를 런으로 분할한다", () => {
    const sheet = createSampleStyleSheet();
    const text = "hero: 그날 「비밀의 문」이 열렸다.";
    const runs = resolveStyledTextRuns(text, sheet, "narration", [
      { start: 18, end: 21, localOverrides: { baselineShiftPx: 2 } },
    ]);

    expect(runs[0]!.text).toBe("HERO:");
    expect(runs[0]!.characterStyleId).toBe("speaker-bold");
    expect(runs[0]!.style.fontWeight).toBe(700);

    const quoteRun = runs.find((r) => r.text === "「비밀의 문」");
    expect(quoteRun).toBeDefined();
    expect(quoteRun?.style.fontStyle).toBe("italic");
    expect(quoteRun?.style.underline).toBe(true);

    const shifted = runs.find((r) => r.style.baselineShiftPx === 2);
    expect(shifted).toBeDefined();
  });

  it("광학 여백 정렬(Optical Margin Alignment)과 금칙처리 줄바꿈이 함께 작동한다", () => {
    const leftQuote = computeOpticalMarginAdjustment("「안녕하세요」", 20, { align: "left" });
    expect(leftQuote.leadingChar).toBe("「");
    expect(leftQuote.leadingHangPx).toBeCloseTo(10, 4);
    expect(leftQuote.xOffsetPx).toBeCloseTo(-10, 4);

    const justifyLine = computeOpticalMarginAdjustment("“A test line.”", 20, { align: "justify" });
    expect(justifyLine.leadingHangPx).toBeGreaterThan(0);
    expect(justifyLine.trailingHangPx).toBeGreaterThan(0);

    const ignored = computeOpticalMarginAdjustment("「무시」", 20, { ignoreParagraph: true });
    expect(ignored.leadingHangPx).toBe(0);
    expect(ignored.xOffsetPx).toBe(0);

    const sheet = createSampleStyleSheet();
    const style = resolveParagraphStyle(sheet, "base").resolved;
    const layout = layoutEditorialParagraph("「정말 그럴 리가 없잖아!」", 100, style);
    expect(layout.lines.length).toBeGreaterThanOrEqual(2);
    // 첫 줄의 여는 괄호 「 가 왼쪽으로 광학 돌출된다
    expect(layout.lines[0]!.leadingHangPx).toBeGreaterThan(0);
    // 두 번째 줄 첫머리에 행두 금칙 문자(! 또는 」)가 오지 않는다
    const secondStart = layout.lines[1]!.text[0] ?? "";
    expect(["!", "」", ".", ","]).not.toContain(secondStart);
  });

  it("다중 마스터 상속 그래프(Parent A -> Parent B), 로컬 해제/오버라이드, 페이지 간 텍스트 스레딩을 지원한다", () => {
    const parents: Record<string, ParentPageNode> = {
      "parent-a": {
        id: "parent-a",
        name: "기본 단행본 판형",
        elements: [
          { id: "folio", kind: "text", xMm: 10, yMm: 195, widthMm: 20, heightMm: 6, label: "쪽번호" },
          { id: "running-head", kind: "text", xMm: 15, yMm: 8, widthMm: 80, heightMm: 6, label: "머리말" },
        ],
      },
      "parent-b": {
        id: "parent-b",
        name: "챕터 표지 마스터",
        basedOnParentId: "parent-a",
        elements: [
          { id: "chapter-band", kind: "decoration", xMm: 0, yMm: 0, widthMm: 148, heightMm: 24 },
        ],
      },
    };

    const page: EditorialPageDocument = {
      id: "page-1",
      pageNumber: 1,
      widthMm: 148,
      heightMm: 210,
      bleed: { topMm: 3, rightMm: 3, bottomMm: 3, leftMm: 3 },
      parentPageId: "parent-b",
      localMasterOverrides: [
        { elementId: "running-head", detached: true, patch: { label: "1장: 여명" } },
        { elementId: "chapter-band", hidden: true },
      ],
      elements: [
        { id: "cut-panel-1", kind: "frame", xMm: 12, yMm: 20, widthMm: 124, heightMm: 160 },
      ],
    };

    const composed = composePageWithParentGraph(parents, page);
    expect(composed.parentChain).toEqual(["parent-a", "parent-b"]);
    expect(composed.cycleDetected).toBe(false);
    expect(composed.detachedElementIds).toEqual(["running-head"]);

    const folio = composed.elements.find((e) => e.id === "folio");
    const runningHead = composed.elements.find((e) => e.id === "running-head");
    const hiddenBand = composed.elements.find((e) => e.id === "chapter-band");
    expect(folio?.locked).toBe(true);
    expect(folio?.noClip).toBe(true);
    expect(runningHead?.locked).toBe(false);
    expect(runningHead?.label).toBe("1장: 여명");
    expect(hiddenBand).toBeUndefined();

    const sheet = createSampleStyleSheet();
    const style = resolveParagraphStyle(sheet, "base").resolved;
    const threaded = threadPrimaryTextAcrossPages(
      "단행본 자동 스레딩을 검증하기 위한 충분히 긴 나레이션 본문입니다. 첫 페이지 프레임 높이를 초과한 텍스트는 두 번째 페이지 프레임으로 자연스럽게 이어져야 합니다.",
      [
        { pageId: "p1", frameId: "f1", widthPx: 140, heightPx: 45 },
        { pageId: "p2", frameId: "f2", widthPx: 140, heightPx: 200 },
      ],
      style,
    );
    expect(threaded.slices[0]!.lines.length).toBeGreaterThan(0);
    expect(threaded.slices[0]!.remainingOversetCharCount).toBeGreaterThan(0);
    expect(threaded.slices[1]!.lines.length).toBeGreaterThan(0);
    expect(threaded.finalOversetText).toBe("");
  });

  it("출판 프리플라이트가 Overset·도련 미달·저해상도·RGB 혼입·폰트 라이선스를 정확히 감사한다", () => {
    const sheet = createSampleStyleSheet();
    const brokenPage: EditorialPageDocument = {
      id: "page-bad",
      pageNumber: 3,
      widthMm: 148,
      heightMm: 210,
      bleed: { topMm: 1, rightMm: 3, bottomMm: 3, leftMm: 3 },
      elements: [],
      textFrames: [
        {
          id: "tf-overflow",
          text: "이 문장은 좁고 낮은 텍스트 프레임에 들어가기에 너무 길어서 반드시 넘침 경고가 발생해야 합니다.",
          widthPx: 80,
          heightPx: 22,
          paragraphStyleId: "base",
        },
      ],
      images: [
        {
          id: "img-bg",
          assetName: "cover-bg.png",
          naturalWidthPx: 600,
          naturalHeightPx: 800,
          placedXMm: 0,
          placedYMm: 0,
          placedWidthMm: 148,
          placedHeightMm: 210,
          colorSpace: "srgb",
          intendedFullBleed: true,
        },
      ],
      fontsUsed: [
        { fontFamily: "FreePersonalFont", licenseStatus: "personal-only", allowPdfEmbed: false },
        { fontFamily: "UnknownFont", licenseStatus: "missing", allowPdfEmbed: true },
      ],
    };

    const badReport = runEditorialPublicationPreflight([brokenPage], sheet);
    expect(badReport.publishReady).toBe(false);
    const codes = new Set(badReport.issues.map((i) => i.code));
    expect(codes.has("insufficient-bleed")).toBe(true);
    expect(codes.has("overset-text")).toBe(true);
    expect(codes.has("low-resolution-image")).toBe(true);
    expect(codes.has("rgb-in-cmyk-print")).toBe(true);
    expect(codes.has("font-license-noncommercial")).toBe(true);
    expect(codes.has("font-license-missing")).toBe(true);
    expect(codes.has("font-embedding-restricted")).toBe(true);

    const cleanPage: EditorialPageDocument = {
      id: "page-good",
      pageNumber: 1,
      widthMm: 148,
      heightMm: 210,
      bleed: { topMm: 3, rightMm: 3, bottomMm: 3, leftMm: 3 },
      elements: [],
      textFrames: [
        { id: "tf-ok", text: "짧은 대사", widthPx: 200, heightPx: 60, paragraphStyleId: "base" },
      ],
      images: [
        {
          id: "img-cmyk",
          assetName: "chapter1.tif",
          naturalWidthPx: 2000,
          naturalHeightPx: 2700,
          placedXMm: -3,
          placedYMm: -3,
          placedWidthMm: 154,
          placedHeightMm: 216,
          colorSpace: "cmyk",
          intendedFullBleed: true,
        },
      ],
      fontsUsed: [
        { fontFamily: "Pretendard", licenseStatus: "verified-commercial", allowPdfEmbed: true },
      ],
    };

    const goodReport = runEditorialPublicationPreflight([cleanPage], sheet);
    expect(goodReport.publishReady).toBe(true);
    expect(goodReport.errorCount).toBe(0);
    expect(goodReport.fontRightsReport).toHaveLength(1);
    expect(goodReport.fontRightsReport[0]!.commercialPrintAllowed).toBe(true);
  });
});
