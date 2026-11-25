// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HANDOFF_STAGE_IDS,
  HANDOFF_STAGE_SPECS,
  STANDARD_LAYER_CODES,
  STANDARD_LAYER_SLOTS,
  StudioAssistantHandoffKitPanel,
  applyLayerAutoFix,
  auditLayerNamingConvention,
  buildHandoffBriefMarkdown,
  buildLayerRenamePreview,
  createDefaultPayoutAllocations,
  createSampleHandoffDocument,
  estimateAssistantPayout,
  evaluateHandoffReadiness,
  exportHandoffPackageJson,
  getHandoffStageSpec,
  isArbitraryLayerName,
  parseStandardLayerCode,
  type StudioLayerInput,
} from "./index";

afterEach(cleanup);

function makeLayer(overrides: Partial<StudioLayerInput> & { readonly id: string; readonly name: string }): StudioLayerInput {
  return {
    id: overrides.id,
    name: overrides.name,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    kind: overrides.kind ?? "raster",
    opacityPct: overrides.opacityPct ?? 100,
    blendMode: overrides.blendMode ?? "normal",
  };
}

describe("1. 한국 웹툰 스튜디오 7대 표준 레이어 명명 규약 및 자동 검증기", () => {
  it("7대 표준 레이어 코드(01_LINE~07_TEXT)와 5대 분업 공정이 모두 정의되어 있다", () => {
    expect(STANDARD_LAYER_CODES).toEqual([
      "01_LINE", "02_BASE", "03_SHADOW", "04_LIGHT", "05_BG3D", "06_SFX", "07_TEXT",
    ]);
    expect(STANDARD_LAYER_SLOTS).toHaveLength(7);
    expect(HANDOFF_STAGE_IDS).toEqual(["lineart", "flat-color", "shading", "background-3d", "lettering"]);
    expect(HANDOFF_STAGE_SPECS).toHaveLength(5);

    expect(parseStandardLayerCode("01_LINE")).toBe("01_LINE");
    expect(parseStandardLayerCode("03_SHADOW_FACE")).toBe("03_SHADOW");
    expect(parseStandardLayerCode("레이어 1 복사본")).toBeNull();
    expect(isArbitraryLayerName("레이어 1 복사본")).toBe(true);
    expect(isArbitraryLayerName("Layer 2 copy")).toBe(true);
    expect(isArbitraryLayerName("02_BASE")).toBe(false);
  });

  it("규약 준수 원고(300/350 DPI · sRGB · 표준 레이어명 · 올바른 잠금/표시)는 차단·경고 0건으로 100점을 받는다", () => {
    const clean300 = createSampleHandoffDocument("shading", "clean");
    const result300 = auditLayerNamingConvention(clean300);
    expect(result300.blockers).toHaveLength(0);
    expect(result300.warnings).toHaveLength(0);
    expect(result300.standardCompliancePct).toBe(100);
    expect(result300.auditScore).toBe(100);
    expect(result300.dpiValid).toBe(true);
    expect(result300.colorSpaceValid).toBe(true);

    const clean350 = { ...clean300, dpi: 350, expectedDpi: 350 as const };
    const result350 = auditLayerNamingConvention(clean350);
    expect(result350.blockers).toHaveLength(0);
    expect(result350.dpiValid).toBe(true);
  });

  it("누락 필수 레이어를 공정별 규격에 맞춰 차단 이슈(missing-required-layer)로 탐지한다", () => {
    const audit = auditLayerNamingConvention({
      stageId: "lettering",
      dpi: 300,
      colorSpace: "sRGB",
      layers: [makeLayer({ id: "l1", name: "01_LINE", locked: true })],
    });
    expect(audit.missingRequiredCodes).toEqual(["06_SFX", "07_TEXT"]);
    expect(audit.blockers.filter((b) => b.code === "missing-required-layer")).toHaveLength(2);
  });

  it("임의 레이어명(레이어 1 복사본 등)은 차단으로, 비표준 서술명은 경고로 구분 탐지한다", () => {
    const audit = auditLayerNamingConvention({
      stageId: "lineart",
      dpi: 300,
      colorSpace: "sRGB",
      layers: [
        makeLayer({ id: "a", name: "01_LINE" }),
        makeLayer({ id: "b", name: "레이어 1 복사본" }),
        makeLayer({ id: "c", name: "Layer 3 copy" }),
        makeLayer({ id: "d", name: "캐릭터 명암 메모" }),
      ],
    });
    expect(audit.blockers.filter((b) => b.code === "arbitrary-layer-name")).toHaveLength(2);
    expect(audit.warnings.filter((w) => w.code === "non-standard-layer-name")).toHaveLength(1);
  });

  it("필수 레이어 비표시 실수·작업 레이어 잠금 실수·전공정 미잠금 주의·불투명도 0%를 모두 탐지한다", () => {
    const audit = auditLayerNamingConvention({
      stageId: "flat-color",
      dpi: 300,
      colorSpace: "sRGB",
      layers: [
        makeLayer({ id: "l1", name: "01_LINE", visible: false, locked: false }),
        makeLayer({ id: "l2", name: "02_BASE", visible: true, locked: true, opacityPct: 0 }),
      ],
    });
    const codes = new Set(audit.issues.map((i) => i.code));
    expect(codes.has("hidden-required-layer")).toBe(true);
    expect(codes.has("locked-editable-layer")).toBe(true);
    expect(codes.has("unlocked-upstream-layer")).toBe(true);
    expect(codes.has("zero-opacity-layer")).toBe(true);
  });

  it("300/350 DPI 표준 위반(72·150 DPI) 및 지정 목표 DPI 불일치를 차단 이슈로 탐지한다", () => {
    const lowDpi = auditLayerNamingConvention({
      stageId: "lineart",
      dpi: 72,
      colorSpace: "sRGB",
      layers: [makeLayer({ id: "l1", name: "01_LINE" })],
    });
    expect(lowDpi.dpiValid).toBe(false);
    expect(lowDpi.blockers.some((b) => b.code === "dpi-mismatch")).toBe(true);

    const targetMismatch = auditLayerNamingConvention({
      stageId: "lineart",
      dpi: 300,
      expectedDpi: 350,
      colorSpace: "sRGB",
      layers: [makeLayer({ id: "l1", name: "01_LINE" })],
    });
    expect(targetMismatch.dpiValid).toBe(false);
    expect(targetMismatch.blockers.some((b) => b.code === "dpi-mismatch")).toBe(true);

    const flexible350 = auditLayerNamingConvention({
      stageId: "lineart",
      dpi: 350,
      colorSpace: "sRGB",
      layers: [makeLayer({ id: "l1", name: "01_LINE" })],
    });
    expect(flexible350.dpiValid).toBe(true);
  });

  it("색공간 불일치(CMYK · Display-P3 · Grayscale ≠ sRGB)를 차단 이슈로 탐지한다", () => {
    for (const cs of ["CMYK", "Display-P3", "Grayscale"] as const) {
      const audit = auditLayerNamingConvention({
        stageId: "lineart",
        dpi: 300,
        colorSpace: cs,
        expectedColorSpace: "sRGB",
        layers: [makeLayer({ id: "l1", name: "01_LINE" })],
      });
      expect(audit.colorSpaceValid).toBe(false);
      expect(audit.blockers.some((b) => b.code === "color-space-mismatch")).toBe(true);
    }
  });

  it("레이어 순서 역전(02_BASE·05_BG3D가 01_LINE 위) 및 중복 레이어명 경고를 탐지한다", () => {
    const audit = auditLayerNamingConvention({
      stageId: "background-3d",
      dpi: 300,
      colorSpace: "sRGB",
      layers: [
        makeLayer({ id: "bg", name: "05_BG3D", kind: "3d" }),
        makeLayer({ id: "base", name: "02_BASE" }),
        makeLayer({ id: "line1", name: "01_LINE", locked: true }),
        makeLayer({ id: "line2", name: "01_LINE", locked: true }),
      ],
    });
    expect(audit.warnings.filter((w) => w.code === "layer-order-inverted")).toHaveLength(2);
    expect(audit.warnings.some((w) => w.code === "duplicate-exact-name")).toBe(true);
  });

  it("buildLayerRenamePreview가 기존 표준명을 보호하면서 임의명·키워드·블렌드 기반 표준명을 충돌 없이 생성한다", () => {
    const layers: StudioLayerInput[] = [
      makeLayer({ id: "1", name: "선화 추가" }),
      makeLayer({ id: "2", name: "01_LINE" }),
      makeLayer({ id: "3", name: "레이어 1 복사본", blendMode: "multiply" }),
      makeLayer({ id: "4", name: "레이어 2 복사본", kind: "text" }),
    ];
    const preview = buildLayerRenamePreview(layers, "shading");
    const existingLine = preview.find((p) => p.layerId === "2");
    const extraLine = preview.find((p) => p.layerId === "1");
    const shadow = preview.find((p) => p.layerId === "3");
    const text = preview.find((p) => p.layerId === "4");

    expect(existingLine?.afterName).toBe("01_LINE");
    expect(existingLine?.changed).toBe(false);
    expect(extraLine?.afterName).not.toBe("01_LINE");
    expect(extraLine?.afterName.startsWith("01_LINE_")).toBe(true);
    expect(shadow?.afterName).toBe("03_SHADOW");
    expect(text?.afterName).toBe("07_TEXT");
    expect(new Set(preview.map((p) => p.afterName)).size).toBe(preview.length);
  });
});

describe("2. 원클릭 자동 정리 · 5대 공정 체크리스트 · 차단 이슈 집계", () => {
  it("applyLayerAutoFix 전체 정리 실행 후 재감사에서 차단·경고 0건과 100점을 달성한다", () => {
    const broken = {
      ...createSampleHandoffDocument("shading", "with-issues"),
      dpi: 72,
      colorSpace: "CMYK" as const,
    };
    const before = auditLayerNamingConvention(broken);
    expect(before.blockers.length).toBeGreaterThanOrEqual(4);

    const fixed = applyLayerAutoFix(broken, { normalizeStatesAndSpec: true });
    expect(fixed.totalFixCount).toBeGreaterThan(0);
    expect(fixed.specFixCount).toBe(2);

    const after = auditLayerNamingConvention(fixed.nextDocument);
    expect(after.blockers).toHaveLength(0);
    expect(after.warnings).toHaveLength(0);
    expect(after.standardCompliancePct).toBe(100);
    expect(after.auditScore).toBe(100);
    expect(after.dpi).toBe(300);
    expect(after.colorSpace).toBe("sRGB");
  });

  it("applyLayerAutoFix({ normalizeStatesAndSpec: false })는 표준명만 적용하고 DPI·잠금 상태는 유지한다", () => {
    const broken = {
      ...createSampleHandoffDocument("shading", "with-issues"),
      dpi: 150,
    };
    const renamedOnly = applyLayerAutoFix(broken, { normalizeStatesAndSpec: false });
    expect(renamedOnly.renamedCount).toBeGreaterThanOrEqual(2);
    expect(renamedOnly.specFixCount).toBe(0);
    expect(renamedOnly.stateFixCount).toBe(0);
    expect(renamedOnly.nextDocument.dpi).toBe(150);
  });

  it("evaluateHandoffReadiness가 레이어 감사 차단 + 미확인 필수 체크리스트 + 커스텀 차단을 통합 집계한다", () => {
    const doc = createSampleHandoffDocument("flat-color", "clean");
    const report = evaluateHandoffReadiness({
      document: doc,
      checkedChecklistIds: ["flat-part-masks"],
      customBlockers: ["12컷 교복 리본 색상 수정 필요"],
    });
    expect(report.verdict).toBe("blocked");
    expect(report.layerAudit.blockers).toHaveLength(0);
    // flat-color 공정 필수 차단 체크리스트 3건 + 커스텀 1건 = 4건
    expect(report.blockerCount).toBe(4);
    expect(report.blockers.filter((b) => b.source === "checklist")).toHaveLength(3);
    expect(report.blockers.filter((b) => b.source === "custom")).toHaveLength(1);
    expect(report.readinessScore).toBeLessThanOrEqual(79);
  });

  it("차단 이슈 0건이고 경고만 남아 있으면 ready-with-warnings, 경고까지 해소되면 ready를 반환한다", () => {
    const stage = getHandoffStageSpec("flat-color");
    const allChecks = stage.checklist.map((c) => c.id);
    const withWarn = {
      ...createSampleHandoffDocument("flat-color", "clean"),
      layers: [
        makeLayer({ id: "l1", name: "01_LINE", visible: true, locked: false }), // 전공정 미잠금 경고
        makeLayer({ id: "l2", name: "02_BASE", visible: true, locked: false }),
      ],
    };
    const warnReport = evaluateHandoffReadiness({ document: withWarn, checkedChecklistIds: allChecks });
    expect(warnReport.blockerCount).toBe(0);
    expect(warnReport.warningCount).toBe(1);
    expect(warnReport.verdict).toBe("ready-with-warnings");

    const cleanReport = evaluateHandoffReadiness({
      document: createSampleHandoffDocument("flat-color", "clean"),
      checkedChecklistIds: allChecks,
    });
    expect(cleanReport.blockerCount).toBe(0);
    expect(cleanReport.warningCount).toBe(0);
    expect(cleanReport.verdict).toBe("ready");
    expect(cleanReport.readinessScore).toBe(100);
  });

  it("5대 공정 모두 clean 샘플과 전체 체크리스트 확인 시 ready 판정과 100점을 반환한다", () => {
    for (const stageId of HANDOFF_STAGE_IDS) {
      const stage = getHandoffStageSpec(stageId);
      const report = evaluateHandoffReadiness({
        document: createSampleHandoffDocument(stageId, "clean"),
        checkedChecklistIds: stage.checklist.map((item) => item.id),
      });
      expect(report.verdict).toBe("ready");
      expect(report.blockerCount).toBe(0);
      expect(report.readinessScore).toBe(100);
    }
  });
});

describe("3. 어시스턴트 정산 프리뷰(추정 · 3.3%) 및 인수인계 브리프(Markdown/JSON)", () => {
  it("estimateAssistantPayout가 dataSourceKind='estimate'와 한국 3.3%(3.0%+0.3%) 원천징수를 정확히 계산한다", () => {
    const est = estimateAssistantPayout({
      allocations: [
        { stageId: "lineart", assigneeName: "김선화", cutCount: 10, ratePerCutKrw: 10_000 },
        { stageId: "flat-color", assigneeName: "이밑색", cutCount: 20, ratePerCutKrw: 5_000 },
      ],
      includeWithholdingTax: true,
    });
    expect(est.dataSourceKind).toBe("estimate");
    expect(est.badgeLabelKo).toBe("추정");
    expect(est.withholdingRatePct).toBe(3.3);
    expect(est.totalCuts).toBe(30);
    expect(est.totalGrossAmountKrw).toBe(200_000);
    expect(est.totalNationalIncomeTaxKrw).toBe(6_000);
    expect(est.totalLocalIncomeTaxKrw).toBe(600);
    expect(est.totalWithholdingTaxKrw).toBe(6_600);
    expect(est.totalNetPayoutKrw).toBe(193_400);
  });

  it("원천징수 미적용(includeWithholdingTax=false) 시 원천징수 0원 및 실지급=세전 합계를 반환한다", () => {
    const est = estimateAssistantPayout({
      allocations: [{ stageId: "shading", cutCount: 15, ratePerCutKrw: 8_000 }],
      includeWithholdingTax: false,
    });
    expect(est.dataSourceKind).toBe("estimate");
    expect(est.withholdingRatePct).toBe(0);
    expect(est.totalGrossAmountKrw).toBe(120_000);
    expect(est.totalWithholdingTaxKrw).toBe(0);
    expect(est.totalNetPayoutKrw).toBe(120_000);
  });

  it("마감 긴급 할증(120%·150%) 반영 시 할증액과 3.3% 원천징수가 정확히 증가한다", () => {
    const base = estimateAssistantPayout({
      allocations: [{ stageId: "background-3d", cutCount: 10, ratePerCutKrw: 10_000, rushMultiplierPct: 100 }],
    });
    const rush = estimateAssistantPayout({
      allocations: [{ stageId: "background-3d", cutCount: 10, ratePerCutKrw: 10_000, rushMultiplierPct: 120 }],
    });
    expect(rush.totalBaseSubtotalKrw).toBe(100_000);
    expect(rush.totalRushSurchargeKrw).toBe(20_000);
    expect(rush.totalGrossAmountKrw).toBe(120_000);
    expect(rush.totalWithholdingTaxKrw).toBe(3_960);
    expect(rush.totalNetPayoutKrw).toBe(116_040);
    expect(rush.totalNetPayoutKrw).toBeGreaterThan(base.totalNetPayoutKrw);
  });

  it("빈 배열·음수·NaN 입력에서도 예외나 NaN 없이 0원 이상 안전하게 계산한다", () => {
    const empty = estimateAssistantPayout({ allocations: [] });
    expect(empty.totalGrossAmountKrw).toBe(0);
    expect(empty.averageGrossPerCutKrw).toBe(0);

    const weird = estimateAssistantPayout({
      allocations: [{ stageId: "lettering", cutCount: -5, ratePerCutKrw: Number.NaN, rushMultiplierPct: 40 }],
    });
    expect(weird.totalCuts).toBe(0);
    expect(weird.totalGrossAmountKrw).toBe(0);
    expect(weird.totalNetPayoutKrw).toBe(0);
  });

  it("buildHandoffBriefMarkdown이 한글/영문 인수인계 브리프에 차단 이슈·보정 목록·[추정] 정산표·3.3% 면책을 포함한다", () => {
    const readiness = evaluateHandoffReadiness({
      document: createSampleHandoffDocument("shading", "with-issues"),
      checkedChecklistIds: [],
    });
    const payout = estimateAssistantPayout({ allocations: createDefaultPayoutAllocations() });

    const koMd = buildHandoffBriefMarkdown({
      projectTitle: "별빛 아틀리에", episodeLabel: "제14화", senderName: "메인 작가", receiverName: "명암 어시",
      dueDateIso: "2026-11-28", deliverableFormat: "CLIP", notes: "12컷 역광 강조",
      readiness, payout, locale: "ko",
    });
    expect(koMd).toContain("어시스턴트 인수인계 브리프 — 별빛 아틀리에 (제14화)");
    expect(koMd).toContain("[차단]");
    expect(koMd).toContain("레이어 1 복사본");
    expect(koMd).toContain("[추정]");
    expect(koMd).toContain("3.3%");
    expect(koMd).toContain("12컷 역광 강조");

    const enMd = buildHandoffBriefMarkdown({
      projectTitle: "Starlight Atelier", episodeLabel: "Ep. 14", senderName: "Lead Artist", receiverName: "Shading Assist",
      dueDateIso: "2026-11-28", deliverableFormat: "PSD",
      readiness, payout, locale: "en",
    });
    expect(enMd).toContain("Assistant Handoff Brief — Starlight Atelier (Ep. 14)");
    expect(enMd).toContain("[Estimate]");
    expect(enMd).toContain("3.3%");
  });

  it("exportHandoffPackageJson이 스키마 버전·추정 태그·검수 판정·정산 내역을 유효 JSON으로 직렬화한다", () => {
    const readiness = evaluateHandoffReadiness({
      document: createSampleHandoffDocument("lettering", "clean"),
      checkedChecklistIds: getHandoffStageSpec("lettering").checklist.map((i) => i.id),
    });
    const payout = estimateAssistantPayout({ allocations: createDefaultPayoutAllocations() });
    const raw = exportHandoffPackageJson({
      projectTitle: "별빛 아틀리에", episodeLabel: "제14화", senderName: "메인 작가", receiverName: "식자 어시",
      dueDateIso: "2026-11-28", deliverableFormat: "TOONSTUDIO", readiness, payout,
    });
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      dataSourceKind: string;
      stage: { id: string };
      readiness: { verdict: string; blockerCount: number };
      payoutEstimate: { dataSourceKind: string; withholdingRatePct: number };
    };
    expect(parsed.schemaVersion).toBe("toonstudio.assistant-handoff-kit.v1");
    expect(parsed.dataSourceKind).toBe("estimate");
    expect(parsed.stage.id).toBe("lettering");
    expect(parsed.readiness.verdict).toBe("ready");
    expect(parsed.readiness.blockerCount).toBe(0);
    expect(parsed.payoutEstimate.dataSourceKind).toBe("estimate");
    expect(parsed.payoutEstimate.withholdingRatePct).toBe(3.3);
  });
});

describe("4. StudioAssistantHandoffKitPanel UI · 상호작용 · 접근성 · 코드 위생 감사", () => {
  it("props 없이 단독 렌더링되며 추정 배지·차단 이슈·자동 보정 미리보기·브리프 프리뷰를 표시한다", () => {
    render(<StudioAssistantHandoffKitPanel />);
    expect(screen.getByTestId("studio-assistant-handoff-kit-panel")).toBeTruthy();
    expect(screen.getByTestId("handoff-estimate-badge").textContent).toContain("추정");
    expect(screen.getByTestId("handoff-payout-estimate-badge").textContent).toContain("추정");
    expect(screen.getByTestId("handoff-verdict-value").textContent).toContain("출고 차단");
    expect(screen.getByTestId("handoff-rename-preview-panel").textContent).toContain("03_SHADOW");
    expect(screen.getByTestId("handoff-export-preview").textContent).toContain("어시스턴트 인수인계 브리프");
  });

  it("5대 공정 버튼을 모두 클릭해 전환할 수 있으며 공정 체크리스트가 즉시 바뀐다", () => {
    render(<StudioAssistantHandoffKitPanel />);
    for (const stageId of HANDOFF_STAGE_IDS) {
      const btn = screen.getByTestId(`handoff-stage-${stageId}`);
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
    }
    expect(screen.getByTestId("handoff-checklist-panel").textContent).toContain("07_TEXT");
  });

  it("파일 DPI(72 DPI)·목표 DPI(350 DPI)·색공간(CMYK) 버튼 조작 시 차단 이슈가 즉시 갱신된다", () => {
    render(<StudioAssistantHandoffKitPanel />);
    fireEvent.click(screen.getByTestId("handoff-preset-clean"));
    expect(screen.getByTestId("handoff-verdict-value").textContent).toContain("출고 가능");

    fireEvent.click(screen.getByTestId("handoff-dpi-72"));
    expect(screen.getByTestId("handoff-blockers-panel").textContent).toContain("72 DPI");

    fireEvent.click(screen.getByTestId("handoff-dpi-300"));
    fireEvent.click(screen.getByTestId("handoff-expected-dpi-350"));
    expect(screen.getByTestId("handoff-blockers-panel").textContent).toContain("350 DPI");

    fireEvent.click(screen.getByTestId("handoff-dpi-350"));
    fireEvent.click(screen.getByTestId("handoff-colorspace-CMYK"));
    expect(screen.getByTestId("handoff-blockers-panel").textContent).toContain("CMYK");
  });

  it("레이어 이름 수정·표시/잠금 토글·임의 레이어 추가·삭제가 실시간 감사에 반영된다", () => {
    render(<StudioAssistantHandoffKitPanel />);
    fireEvent.click(screen.getByTestId("handoff-preset-clean"));
    expect(screen.getByTestId("handoff-verdict-value").textContent).toContain("출고 가능");

    fireEvent.click(screen.getByTestId("handoff-add-layer-btn"));
    expect(screen.getByTestId("handoff-blockers-panel").textContent).toContain("레이어 2 복사본");

    fireEvent.change(screen.getByTestId("handoff-layer-name-0"), { target: { value: "01_LINE_EXTRA" } });
    expect(screen.getByTestId("handoff-blockers-panel").textContent).not.toContain("레이어 2 복사본");

    fireEvent.click(screen.getByTestId("handoff-layer-remove-0"));
    expect(screen.getByTestId("handoff-verdict-value").textContent).toContain("출고 가능");
  });

  it("원클릭 표준명 보정 적용 · 전체 자동 정리 · 체크리스트 전체 확인으로 출고 가능 상태에 도달한다", () => {
    render(<StudioAssistantHandoffKitPanel />);
    expect(screen.getByTestId("handoff-verdict-value").textContent).toContain("출고 차단");

    fireEvent.click(screen.getByTestId("handoff-apply-rename-btn"));
    expect(screen.getByTestId("handoff-compliance-pct").textContent).toBe("100%");

    fireEvent.click(screen.getByTestId("handoff-auto-fix-all-btn"));
    fireEvent.click(screen.getByTestId("handoff-check-all-btn"));
    expect(screen.getByTestId("handoff-verdict-value").textContent).toContain("출고 가능");
    expect(screen.getByTestId("handoff-blocker-count").textContent).toContain("0건");
  });

  it("정산 시뮬레이터에서 담당 컷 수·단가·3.3% 원천징수 토글·긴급 할증이 즉시 재계산된다", () => {
    render(<StudioAssistantHandoffKitPanel />);
    const initialNetText = screen.getByTestId("handoff-payout-net-total").textContent ?? "";

    fireEvent.change(screen.getByTestId("handoff-payout-cuts-lineart"), { target: { value: "40" } });
    fireEvent.change(screen.getByTestId("handoff-payout-rate-lineart"), { target: { value: "10000" } });
    const updatedNetText = screen.getByTestId("handoff-payout-net-total").textContent ?? "";
    expect(updatedNetText).not.toBe(initialNetText);

    fireEvent.click(screen.getByTestId("handoff-tax-toggle"));
    expect(screen.getByTestId("handoff-payout-tax-total").textContent).toContain("0원");

    fireEvent.click(screen.getByTestId("handoff-tax-toggle"));
    fireEvent.click(screen.getByTestId("handoff-rush-120"));
    expect(screen.getByTestId("handoff-rush-120").getAttribute("aria-pressed")).toBe("true");
  });

  it("브리프 복사·JSON 복사·미리보기 탭 전환·콜백 및 영문 로케일(locale='en')이 정상 동작한다", () => {
    const onReadinessChange = vi.fn();
    const onExportBrief = vi.fn();
    const onExportJson = vi.fn();

    render(
      <StudioAssistantHandoffKitPanel
        locale="en"
        initialStageId="lettering"
        onReadinessChange={onReadinessChange}
        onExportBrief={onExportBrief}
        onExportJson={onExportJson}
      />,
    );

    expect(onReadinessChange).toHaveBeenCalled();
    expect(screen.getByTestId("handoff-estimate-badge").textContent).toContain("Estimate");

    fireEvent.click(screen.getByTestId("handoff-copy-md-btn"));
    expect(onExportBrief).toHaveBeenCalledTimes(1);
    expect(onExportBrief.mock.calls[0]?.[0]).toContain("Assistant Handoff Brief");

    fireEvent.click(screen.getByTestId("handoff-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.assistant-handoff-kit.v1");
    expect(screen.getByTestId("handoff-export-preview").textContent).toContain('"schemaVersion"');

    fireEvent.click(screen.getByTestId("handoff-tab-hidden"));
    expect(screen.queryByTestId("handoff-export-preview")).toBeNull();
  });

  it("코드 위생 자가 검증(4개 파일 800줄 이하 · 원시 색/transition-all/= {}/Storage/private Map store/BigInt 리터럴 0건)", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "assistant-handoff-engine.ts",
      "StudioAssistantHandoffKitPanel.tsx",
      "index.ts",
      "assistant-handoff-qa-kit.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "assistant-handoff-qa-kit.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioAssistantHandoffKitPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("추정");
      }
    }
  });
});
