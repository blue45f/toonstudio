// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CspWatermarkVelocityPanel } from "./CspWatermarkVelocityPanel";
import {
  buildBatchWatermarkExportPlan,
  createDemoBatchWatermarkCuts,
  createDemoWebtoonCutBuffer,
  detectWatermarkSignature,
  embedAntiAiNoiseWatermark,
} from "./invisible-watermark-codec";
import {
  VELOCITY_BRUSH_PRESETS,
  applyHiddenLayerCleanup,
  applySelectionSafeBlur,
  applyStandardUnmaskedBlur,
  createDemoBoundaryBlurFixture,
  createDemoCleanupLayers,
  createDemoWorkTimeSessions,
  evaluateVelocityBrushDynamics,
  measureSelectionBoundaryBleed,
  planHiddenLayerCleanup,
  sampleVelocityCurvePoints,
  summarizeDailyWorkHours,
  type CleanupCandidateLayer,
  type VelocityBrushPresetId,
} from "./velocity-brush-boundary-blur";

afterEach(cleanup);

describe("비가시 Anti-AI 노이즈 워터마크 코덱 & 배치 출고 (invisible-watermark-codec)", () => {
  it("강도 1..8 전역에서 실측 PSNR >= 38dB를 유지하며 동일 서명은 검출(matched:true), 타인/다른 작품/다른 시드 서명은 거부(matched:false)한다", () => {
    const width = 64;
    const height = 64;
    const original = createDemoWebtoonCutBuffer(width, height, 0);
    const originalSnapshot = new Uint8ClampedArray(original);

    let prevPsnr = Number.POSITIVE_INFINITY;
    for (let strength = 1; strength <= 8; strength += 1) {
      const embedded = embedAntiAiNoiseWatermark(original, width, height, {
        authorId: "author-seoyeon",
        workId: "ep042-climax",
        strength,
        seed: 777,
      });

      // 원본 버퍼 불변 보장
      expect(original).toEqual(originalSnapshot);
      expect(embedded.psnrDb).toBeGreaterThanOrEqual(38);
      expect(embedded.invisiblePass).toBe(true);
      expect(embedded.modifiedPixelCount).toBeGreaterThan(0);
      expect(embedded.psnrDb).toBeLessThanOrEqual(prevPsnr);
      prevPsnr = embedded.psnrDb;

      // 동일 서명 역검출 성공
      const selfCheck = detectWatermarkSignature(
        embedded.rgba,
        width,
        height,
        "author-seoyeon",
        "ep042-climax",
        777,
      );
      expect(selfCheck.matched).toBe(true);
      expect(selfCheck.confidence).toBeGreaterThanOrEqual(0.7);
      expect(selfCheck.normalizedCorrelation).toBeGreaterThan(0.25);

      // 타인 작가 서명 거부
      const wrongAuthor = detectWatermarkSignature(
        embedded.rgba,
        width,
        height,
        "author-imposter",
        "ep042-climax",
        777,
      );
      expect(wrongAuthor.matched).toBe(false);
      expect(wrongAuthor.confidence).toBeLessThan(0.2);
    }

    // 다른 작품 ID / 다른 시드 / 미삽입 원본도 모두 거부
    const embeddedMid = embedAntiAiNoiseWatermark(original, width, height, {
      authorId: "author-seoyeon",
      workId: "ep042-climax",
      strength: 4,
      seed: 777,
    });
    expect(
      detectWatermarkSignature(embeddedMid.rgba, width, height, "author-seoyeon", "ep099-other", 777).matched,
    ).toBe(false);
    expect(
      detectWatermarkSignature(embeddedMid.rgba, width, height, "author-seoyeon", "ep042-climax", 888).matched,
    ).toBe(false);
    expect(
      detectWatermarkSignature(original, width, height, "author-seoyeon", "ep042-climax", 777).matched,
    ).toBe(false);
  });

  it("다중 컷 배치 출고 계획은 모든 컷에 워터마크 삽입·검증·파일명·권리 메타 매니페스트를 생성한다", () => {
    const demoCuts = createDemoBatchWatermarkCuts().map((cut) => ({
      cutId: cut.cutId,
      cutNumber: cut.cutNumber,
      title: cut.titleKo,
      width: cut.width,
      height: cut.height,
      rgba: cut.rgba,
    }));

    const plan = buildBatchWatermarkExportPlan(demoCuts, {
      authorId: "creator-han",
      workId: "Season2 EP12",
      strength: 5,
      seed: 2026,
      format: "webp",
      copyrightHolder: "Han Studio",
    });

    expect(plan.summary.totalCuts).toBe(3);
    expect(plan.summary.processedPixelCuts).toBe(3);
    expect(plan.summary.verifiedCuts).toBe(3);
    expect(plan.summary.allInvisiblePass).toBe(true);
    expect(plan.summary.minPsnrDb).not.toBeNull();
    expect(plan.summary.minPsnrDb ?? 0).toBeGreaterThanOrEqual(38);
    expect(plan.items[0]?.outputFilename).toBe("season2-ep12_cut001_anti-ai-wm.webp");
    expect(plan.items[2]?.outputFilename).toBe("season2-ep12_cut003_anti-ai-wm.webp");
    expect(plan.manifest.aiTrainingPolicy).toBe("no-ai-training-no-scraping");
    expect(plan.manifest.copyrightNotice).toContain("Han Studio");
    expect(plan.manifest.cutEntries).toHaveLength(3);

    // 픽셀 버퍼가 없는 메타데이터 전용 컷도 안전하게 계획
    const metaOnly = buildBatchWatermarkExportPlan(
      [{ cutId: "meta-1", cutNumber: 1, title: "메타 전용 컷", width: 800, height: 1280 }],
      { authorId: "creator-han", workId: "ep13", strength: 4, seed: 2026 },
    );
    expect(metaOnly.items[0]?.processedWithPixels).toBe(false);
    expect(metaOnly.items[0]?.psnrDb).toBeNull();
    expect(metaOnly.items[0]?.signatureDigest).toMatch(/^WM-[0-9A-F]{10}$/);
  });
});

describe("속도 기반 브러시 곡선 · 선택 경계 색번짐 0% 차단 블러 · 작업시간 · 숨김 레이어 정리", () => {
  it("4종 속도 브러시 프리셋의 경계값·클램핑·단조성 및 예측 선행 좌표를 정확히 계산한다", () => {
    const presetIds: readonly VelocityBrushPresetId[] = [
      "ink-snap",
      "calligraphy-whip",
      "airbrush-glide",
      "manga-speedline",
    ];

    for (const id of presetIds) {
      const profile = VELOCITY_BRUSH_PRESETS[id];
      const atZero = evaluateVelocityBrushDynamics(0, profile, { currentX: 50, currentY: 60, directionAngleRad: 0 });
      const atBelow = evaluateVelocityBrushDynamics(-3, profile, { currentX: 50, currentY: 60 });
      const atMax = evaluateVelocityBrushDynamics(4, profile, { currentX: 50, currentY: 60, directionAngleRad: 0 });
      const atAbove = evaluateVelocityBrushDynamics(12, profile, { currentX: 50, currentY: 60, directionAngleRad: 0 });

      // 경계값 & 클램핑 일치
      expect(atZero.sizeMultiplier).toBeCloseTo(profile.sizeCurve.y0, 3);
      expect(atZero.opacityMultiplier).toBeCloseTo(profile.opacityCurve.y0, 3);
      expect(atBelow.sizeMultiplier).toBe(atZero.sizeMultiplier);
      expect(atZero.lookaheadDistancePx).toBe(0);
      expect(atZero.predictedX).toBe(50);
      expect(atZero.predictedY).toBe(60);

      expect(atMax.sizeMultiplier).toBeCloseTo(profile.sizeCurve.y3, 3);
      expect(atMax.opacityMultiplier).toBeCloseTo(profile.opacityCurve.y3, 3);
      expect(atAbove.sizeMultiplier).toBe(atMax.sizeMultiplier);
      expect(atMax.lookaheadDistancePx).toBeGreaterThan(0);
      expect(atMax.lookaheadDistancePx).toBeLessThanOrEqual(profile.maxLookaheadPx);
      expect(atMax.predictedX).toBeCloseTo(50 + atMax.lookaheadDistancePx, 2);

      // 속도 0 -> 4 단조성 검증
      const samples = sampleVelocityCurvePoints(profile, 20);
      const isSizeIncreasing = profile.sizeCurve.y3 > profile.sizeCurve.y0;
      for (let i = 1; i < samples.length; i += 1) {
        const prev = samples[i - 1];
        const curr = samples[i];
        if (!prev || !curr) continue;
        if (isSizeIncreasing) {
          expect(curr.sizeMultiplier).toBeGreaterThanOrEqual(prev.sizeMultiplier);
        } else {
          expect(curr.sizeMultiplier).toBeLessThanOrEqual(prev.sizeMultiplier);
        }
        // 모든 프리셋의 불투명도는 고속에서 단조 비증가
        expect(curr.opacityMultiplier).toBeLessThanOrEqual(prev.opacityMultiplier);
      }
    }
  });

  it("선택 경계 차단 블러는 안쪽 빨강/바깥 초록 경계에서 초록 G채널 증가가 정확히 0이며(소형·대형 반경 및 L자 오목 마스크 포함) 내부 블러는 정상 동작한다", () => {
    const fixture = createDemoBoundaryBlurFixture(36, 36);
    const beforeCopy = new Uint8ClampedArray(fixture.rgba);

    // 대조군: 일반 블러는 바깥 초록(G=240)이 선택 내부로 크게 번짐
    const standardBlurred = applyStandardUnmaskedBlur(
      fixture.rgba,
      fixture.width,
      fixture.height,
      fixture.selectionMask,
      4,
    );
    const standardAudit = measureSelectionBoundaryBleed(
      fixture.rgba,
      standardBlurred,
      fixture.width,
      fixture.height,
      fixture.selectionMask,
    );
    expect(standardAudit.maxGreenIncreaseInside).toBeGreaterThan(40);
    expect(standardAudit.bledInsidePixelCount).toBeGreaterThan(0);
    expect(standardAudit.zeroExternalBleed).toBe(false);

    // 1) 정밀 2D 마스크 블러 (radiusPx = 4)
    const safe2d = applySelectionSafeBlur(
      fixture.rgba,
      fixture.width,
      fixture.height,
      fixture.selectionMask,
      4,
    );
    expect(fixture.rgba).toEqual(beforeCopy);
    expect(safe2d.kernelMode).toBe("exact-2d-masked");
    expect(safe2d.externalPixelsRead).toBe(0);

    const safe2dAudit = measureSelectionBoundaryBleed(
      fixture.rgba,
      safe2d.rgba,
      fixture.width,
      fixture.height,
      fixture.selectionMask,
    );
    expect(safe2dAudit.maxGreenIncreaseInside).toBe(0);
    expect(safe2dAudit.bledInsidePixelCount).toBe(0);
    expect(safe2dAudit.bleedRatioPercent).toBe(0);
    expect(safe2dAudit.outsideMaxDelta).toBe(0);
    expect(safe2dAudit.zeroExternalBleed).toBe(true);

    // 내부 명암 경계(x=18, 좌측 R=240 / 우측 R=120)가 실제로 부드럽게 블러링되었는지 확인
    const seamOff = (18 * fixture.width + 18) * 4;
    expect(safe2d.rgba[seamOff] ?? 0).toBeGreaterThan(130);
    expect(safe2d.rgba[seamOff] ?? 0).toBeLessThan(230);
    expect(safe2d.rgba[seamOff + 1]).toBe(0);

    // 2) 대형 반경 분리 마스크 블러 (radiusPx = 10, separable-masked 경로)에서도 G채널 증가 정확히 0
    const safeLarge = applySelectionSafeBlur(
      fixture.rgba,
      fixture.width,
      fixture.height,
      fixture.selectionMask,
      10,
    );
    expect(safeLarge.kernelMode).toBe("separable-masked");
    expect(safeLarge.externalPixelsRead).toBe(0);
    const safeLargeAudit = measureSelectionBoundaryBleed(
      fixture.rgba,
      safeLarge.rgba,
      fixture.width,
      fixture.height,
      fixture.selectionMask,
    );
    expect(safeLargeAudit.maxGreenIncreaseInside).toBe(0);
    expect(safeLargeAudit.bledInsidePixelCount).toBe(0);
    expect(safeLargeAudit.outsideMaxDelta).toBe(0);

    // 3) 오목한 L자 비정형 선택 영역에서도 바깥 초록 침투 정확히 0
    const w = 24;
    const h = 24;
    const lRgba = new Uint8ClampedArray(w * h * 4);
    const lMask = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        const off = idx * 4;
        const inL = (x >= 4 && x < 10 && y >= 4 && y < 20) || (x >= 4 && x < 20 && y >= 14 && y < 20);
        lMask[idx] = inL ? 1 : 0;
        lRgba[off] = inL ? 210 : 0;
        lRgba[off + 1] = inL ? 0 : 255;
        lRgba[off + 2] = 0;
        lRgba[off + 3] = 255;
      }
    }
    const safeL = applySelectionSafeBlur(lRgba, w, h, lMask, 5);
    const lAudit = measureSelectionBoundaryBleed(lRgba, safeL.rgba, w, h, lMask);
    expect(lAudit.maxGreenIncreaseInside).toBe(0);
    expect(lAudit.zeroExternalBleed).toBe(true);
  });

  it("일별 작업시간 및 24시간 집중 피크 분석과 숨김/빈 레이어 정리(잠금·비출력 붉은펜 보호)를 정확히 수행한다", () => {
    const sessions = createDemoWorkTimeSessions();
    const summary = summarizeDailyWorkHours(sessions);

    expect(summary.days).toHaveLength(5);
    expect(summary.totalMinutes).toBe(1035);
    expect(summary.totalHours).toBe(17.25);
    expect(summary.peakDay?.date).toBe("2026-11-18");
    expect(summary.peakDay?.totalMinutes).toBe(255);
    // 21시대 누적: 110 + 135 + 155 + 125 = 525분
    expect(summary.peakFocusHour?.hour).toBe(21);
    expect(summary.peakFocusHour?.label).toBe("21:00–22:00");
    expect(summary.peakFocusHour?.totalMinutes).toBe(525);

    const emptySummary = summarizeDailyWorkHours([]);
    expect(emptySummary.totalMinutes).toBe(0);
    expect(emptySummary.peakDay).toBeNull();
    expect(emptySummary.peakFocusHour).toBeNull();

    // 숨김/빈 레이어 정리 계획: 잠금 레이어 + 비출력 붉은펜 보호 검증
    const layers: readonly CleanupCandidateLayer[] = [
      ...createDemoCleanupLayers(),
      {
        id: "layer-empty-redline",
        name: "2차 검수 붉은펜 (비어있음)",
        visible: false,
        locked: false,
        isEmpty: true,
        kind: "draft-markup",
        widthPx: 1600,
        heightPx: 6000,
      },
    ];

    const plan = planHiddenLayerCleanup(layers);
    expect(plan.removableLayerIds).toEqual([
      "layer-hidden-rough-v1",
      "layer-hidden-alt-bg",
      "layer-empty-stray",
    ]);
    expect(plan.protectedLockedCount).toBe(1);
    expect(plan.protectedRedlineCount).toBe(2);
    expect(plan.protectedCount).toBe(3);
    expect(plan.keptActiveCount).toBe(2);
    expect(plan.estimatedSavingsMiB).toBeGreaterThan(70);

    const remaining = applyHiddenLayerCleanup(layers, plan);
    const remainingIds = remaining.map((layer) => layer.id);
    expect(remainingIds).toContain("layer-locked-guide");
    expect(remainingIds).toContain("layer-pd-redline");
    expect(remainingIds).toContain("layer-empty-redline");
    expect(remainingIds).toContain("layer-ink-main");
    expect(remainingIds).not.toContain("layer-hidden-rough-v1");
    expect(remainingIds).not.toContain("layer-empty-stray");
  });
});

describe("CspWatermarkVelocityPanel UI · 3개 서브탭 · Calm Atelier 위생 계약", () => {
  it("props 없이 마운트되며 탭 1에서 강도 조절에 따른 실측 PSNR >= 38dB·본인/타인 역검출·배치 출고가 동작한다", () => {
    const onBatchExport = vi.fn();
    render(<CspWatermarkVelocityPanel onBatchExport={onBatchExport} locale="ko" />);

    const psnrBefore = Number.parseFloat(screen.getByTestId("watermark-psnr").textContent ?? "0");
    expect(psnrBefore).toBeGreaterThanOrEqual(38);
    expect(screen.getByTestId("watermark-self-detect").textContent).toContain("일치 검출");
    expect(screen.getByTestId("watermark-foreign-detect").textContent).toContain("정상 거부");

    // 강도를 8로 올려도 실측 PSNR >= 38dB 유지
    const strengthSlider = screen.getByLabelText(/노이즈 삽입 강도/i);
    fireEvent.change(strengthSlider, { target: { value: "8" } });
    const psnrAtMax = Number.parseFloat(screen.getByTestId("watermark-psnr").textContent ?? "0");
    expect(psnrAtMax).toBeGreaterThanOrEqual(38);
    expect(psnrAtMax).toBeLessThan(psnrBefore);

    fireEvent.click(screen.getByRole("button", { name: /배치 워터마크 매니페스트 출고/i }));
    expect(onBatchExport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("3컷 배치 워터마크 완료");
  });

  it("탭 2에서 4종 속도 프리셋·SVG 곡선·경계 차단 블러 0.00% 비교가 동작한다", () => {
    render(<CspWatermarkVelocityPanel locale="ko" />);

    fireEvent.click(screen.getByRole("tab", { name: /속도 브러시 곡선·경계 차단 블러/i }));

    const initialSizeText = screen.getByTestId("velocity-size-multiplier").textContent;
    fireEvent.click(screen.getByRole("button", { name: /에어브러시 글라이드/i }));
    const airbrushSizeText = screen.getByTestId("velocity-size-multiplier").textContent;
    expect(airbrushSizeText).not.toBe(initialSizeText);

    // 일반 블러는 오염 발생, 경계 차단 블러는 +0 G · 0.00%
    expect(screen.getByTestId("standard-blur-bleed").textContent).not.toContain("+0 G");
    expect(screen.getByTestId("safe-blur-bleed").textContent).toContain("+0 G · 0.00%");

    // 블러 반경을 9px(분리 마스크 경로)로 키워도 여전히 0.00%
    fireEvent.change(screen.getByLabelText(/가우시안 블러 반경/i), { target: { value: "9" } });
    expect(screen.getByTestId("safe-blur-bleed").textContent).toContain("+0 G · 0.00%");
  });

  it("탭 3에서 일별 작업시간 그래프가 표시되고 1클릭 숨김/빈 레이어 정리 시 잠금·붉은펜 레이어가 보존된다", () => {
    const onCleanupLayers = vi.fn();
    render(<CspWatermarkVelocityPanel onCleanupLayers={onCleanupLayers} locale="en" />);

    fireEvent.click(screen.getByRole("tab", { name: /Work Hours & Layer Cleanup/i }));

    expect(screen.getByTestId("peak-focus-hour").textContent).toContain("21:00–22:00");
    expect(screen.getByTestId("cleanup-removable-count").textContent).toBe("3");
    expect(screen.getByTestId("cleanup-protected-count").textContent).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: /Clean 3 Layers/i }));
    expect(onCleanupLayers).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cleanup-removable-count").textContent).toBe("0");
    expect(screen.getByTestId("cleanup-protected-count").textContent).toBe("2");

    const layerList = screen.getByTestId("cleanup-layer-list");
    expect(within(layerList).getByText(/Safe Gutter Guide \(Locked\)/i)).toBeTruthy();
    expect(within(layerList).getByText(/PD Pass-1 Redline Markup/i)).toBeTruthy();
    expect(within(layerList).queryByText(/Old Rough Sketch v1/i)).toBeNull();

    // 복원 버튼 클릭 시 초기 7개 레이어 복구
    fireEvent.click(screen.getByRole("button", { name: /Restore Layers/i }));
    expect(screen.getByTestId("cleanup-removable-count").textContent).toBe("3");
  });

  it("CspWatermarkVelocityPanel.tsx는 원시 hex/rgb/hsl 0건 · transition-all 0건 · 500줄 이하 · keep-all · tabular-nums 계약을 지킨다", () => {
    render(<CspWatermarkVelocityPanel />);
    expect(screen.getByRole("tablist")).toBeTruthy();

    const panelPath = resolve(
      process.cwd(),
      "apps/web/src/domains/creator/csp-watermark-velocity/CspWatermarkVelocityPanel.tsx",
    );
    const source = readFileSync(panelPath, "utf8");
    const lineCount = source.split("\n").length;

    expect(lineCount).toBeLessThanOrEqual(500);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
    expect(source).not.toMatch(/\bhsla?\s*\(/i);
    expect(source).not.toContain("transition-all");
    expect(source).toContain("[word-break:keep-all]");
    expect(source).toContain("tabular-nums");
  });
});
