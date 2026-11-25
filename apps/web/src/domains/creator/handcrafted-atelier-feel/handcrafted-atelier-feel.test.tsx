// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  ANALOG_ARTISAN_PRESET_IDS,
  applyAnalogJitterProfile,
  applyWorkbenchProposal,
  buildWorkbenchProposal,
  computeOklchContrastRatio,
  computeOklchRelativeLuminance,
  createAdaptiveWorkbenchState,
  DEFAULT_HABIT_SCENARIOS,
  DEFAULT_SAMPLE_STROKES,
  dismissWorkbenchProposal,
  previewWorkbenchProposal,
  PROCEDURAL_THEME_MOOD_IDS,
  recordToolSequence,
  recordToolUsage,
  resetWorkbenchLearning,
  revertWorkbenchLayout,
  simulateTactileSpring,
  StudioHandcraftedAtelierPanel,
  synthesizeProceduralStudioTheme,
  TACTILE_MATERIAL_IDS,
  type AnalogStrokePoint,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/handcrafted-atelier-feel",
);

describe("Wave 40A: 수공예 아날로그 미학 · 물리 관성 모션 · 절차적 OKLCH 테마 · 적응형 워크벤치", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. applyAnalogJitterProfile은 동일 시드에서 완전 결정론적으로 재현되고 시드 변경 시 다른 손떨림을 생성한다", () => {
    const stroke = DEFAULT_SAMPLE_STROKES[0]?.points ?? [];
    const runA = applyAnalogJitterProfile(stroke, "fountain-watercolor", 4201);
    const runB = applyAnalogJitterProfile(stroke, "fountain-watercolor", 4201);
    const runC = applyAnalogJitterProfile(stroke, "fountain-watercolor", 9917);

    expect(runA.points).toEqual(runB.points);
    expect(runA.svgPathData).toBe(runB.svgPathData);
    expect(runA.bloomSpots).toEqual(runB.bloomSpots);

    // 다른 시드에서는 지터 좌표가 실제로 달라져야 한다
    const coordDiffCount = runA.points.filter((pt, idx) => {
      const other = runC.points[idx];
      return other ? Math.abs(pt.x - other.x) > 0.001 || Math.abs(pt.y - other.y) > 0.001 : false;
    }).length;
    expect(coordDiffCount).toBeGreaterThanOrEqual(Math.floor(stroke.length * 0.7));
  });

  it("2. 5종 장인 프리셋은 서로 구별되는 지터·번짐·종이결 메트릭과 유효한 SVG 경로를 생성한다", () => {
    const stroke = DEFAULT_SAMPLE_STROKES[0]?.points ?? [];
    expect(ANALOG_ARTISAN_PRESET_IDS).toHaveLength(5);

    const results = ANALOG_ARTISAN_PRESET_IDS.map((presetId) =>
      applyAnalogJitterProfile(stroke, presetId, 20261124),
    );

    for (const res of results) {
      expect(res.points).toHaveLength(stroke.length);
      expect(res.metrics.meanJitterPx).toBeGreaterThan(0);
      expect(res.metrics.organicHumanizationScore).toBeGreaterThanOrEqual(35);
      expect(res.metrics.organicHumanizationScore).toBeLessThanOrEqual(100);
      expect(res.svgPathData.startsWith("M ")).toBe(true);
      expect(res.sourceSvgPathData.startsWith("M ")).toBe(true);
    }

    const fountain = results.find((r) => r.presetId === "fountain-watercolor");
    const gpen = results.find((r) => r.presetId === "gpen-manuscript");
    const graphite = results.find((r) => r.presetId === "graphite-croquis");
    const sumi = results.find((r) => r.presetId === "sumi-brush");
    const woodblock = results.find((r) => r.presetId === "woodblock-print");

    // 만년필 수채는 건식 연필 크로키보다 모세관 잉크 번짐 반경이 뚜렷하게 크다
    expect(fountain?.metrics.maxBloomRadiusPx ?? 0).toBeGreaterThan(
      (graphite?.metrics.maxBloomRadiusPx ?? 0) * 1.8,
    );
    // 지펜 원고는 동양 먹선보다 평균 종이결 페더링이 절제되어 있다
    expect(gpen?.metrics.meanFeatherSpreadPx ?? 0).toBeLessThan(
      sumi?.metrics.meanFeatherSpreadPx ?? 0,
    );
    // 목판화는 나뭇결 방향 편향을 보유한다
    expect(woodblock?.preset.grainDirectionBiasRad).not.toBeNull();
  });

  it("3. 펜 멈춤·감속 구간에서 모세관 잉크 번짐 반경이 고속 이동 구간보다 뚜렷하게 커진다", () => {
    const mixedSpeedStroke: readonly AnalogStrokePoint[] = [
      { x: 0, y: 50, pressure: 0.65, timestampMs: 0 },
      { x: 80, y: 50, pressure: 0.65, timestampMs: 32 }, // 고속 이동 (~2500 px/s)
      { x: 160, y: 50, pressure: 0.65, timestampMs: 64 }, // 고속 이동
      { x: 164, y: 51, pressure: 0.85, timestampMs: 280 }, // 216ms 멈춤·감속 구간
      { x: 167, y: 51, pressure: 0.9, timestampMs: 490 }, // 210ms 정체 구간
      { x: 250, y: 52, pressure: 0.62, timestampMs: 524 }, // 재가속 고속 구간
    ];

    const result = applyAnalogJitterProfile(mixedSpeedStroke, "fountain-watercolor", 777);
    const fastPoint = result.points[2];
    const pausedPoint = result.points[4];

    expect(fastPoint).toBeDefined();
    expect(pausedPoint).toBeDefined();
    expect(pausedPoint?.capillaryBloomRadiusPx ?? 0).toBeGreaterThan(
      (fastPoint?.capillaryBloomRadiusPx ?? 0) + 2,
    );
    expect(result.bloomSpots.some((spot) => spot.pointIndex === 3 || spot.pointIndex === 4)).toBe(
      true,
    );
  });

  it("4. 빠른 크로키 호에서 동양 먹선과 연필 크로키는 비백(dry-brush skip)과 섬유 페더링 잔털을 형성한다", () => {
    const fastArc = DEFAULT_SAMPLE_STROKES[1]?.points ?? [];
    const sumiFast = applyAnalogJitterProfile(fastArc, "sumi-brush", 1234);
    const fountainFast = applyAnalogJitterProfile(fastArc, "fountain-watercolor", 1234);
    const graphiteFast = applyAnalogJitterProfile(fastArc, "graphite-croquis", 1234);

    expect(sumiFast.metrics.meanDrySkipRatio).toBeGreaterThan(fountainFast.metrics.meanDrySkipRatio);
    expect(graphiteFast.metrics.meanDrySkipRatio).toBeGreaterThan(
      fountainFast.metrics.meanDrySkipRatio,
    );
    expect(sumiFast.featherWhiskers.length).toBeGreaterThanOrEqual(4);
  });

  it("5. 아날로그 지터 엔진은 빈 스트로크·단일 점·비유한 좌표를 NaN 없이 안전하게 처리한다", () => {
    const empty = applyAnalogJitterProfile([], "gpen-manuscript", 1);
    expect(empty.points).toHaveLength(0);
    expect(empty.bloomSpots).toHaveLength(0);
    expect(empty.svgPathData).toBe("");
    expect(Number.isFinite(empty.metrics.meanJitterPx)).toBe(true);

    const single = applyAnalogJitterProfile([{ x: 40, y: 80 }], "sumi-brush", 5);
    expect(single.points).toHaveLength(1);
    expect(Number.isFinite(single.points[0]?.x)).toBe(true);
    expect(Number.isFinite(single.points[0]?.effectiveWidthPx)).toBe(true);

    const dirty = applyAnalogJitterProfile(
      [
        { x: Number.NaN, y: Number.POSITIVE_INFINITY, pressure: 5, timestampMs: Number.NaN },
        { x: 20, y: 30, pressure: -2, timestampMs: 40 },
      ],
      "woodblock-print",
      Number.NaN,
    );
    expect(dirty.points).toHaveLength(2);
    for (const pt of dirty.points) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
      expect(pt.pressure).toBeGreaterThanOrEqual(0.05);
      expect(pt.pressure).toBeLessThanOrEqual(1);
    }
  });

  it("6. simulateTactileSpring은 종이·목재·금속 3종 화구의 RK4 수렴 곡선과 촉각·음향 메타데이터를 정확히 산출한다", () => {
    expect(TACTILE_MATERIAL_IDS).toEqual(["paper", "wood", "metal"]);

    const paper = simulateTactileSpring({ material: "paper", from: 0, to: 1 });
    const wood = simulateTactileSpring({ material: "wood", from: 0, to: 1 });
    const metal = simulateTactileSpring({ material: "metal", from: 0, to: 1 });

    for (const sim of [paper, wood, metal]) {
      expect(sim.settledImmediately).toBe(false);
      expect(sim.settleTimeMs).toBeGreaterThan(50);
      expect(sim.settleTimeMs).toBeLessThan(2400);
      expect(sim.frames.length).toBeGreaterThan(8);
      expect(sim.frames[0]?.value).toBe(0);
      expect(sim.frames[sim.frames.length - 1]?.value).toBe(1);
      expect(sim.cssLinearEasing.startsWith("linear(")).toBe(true);
      expect(sim.materialSignature.haptic.patternMs.length).toBeGreaterThan(0);
      expect(sim.materialSignature.acoustic.fundamentalHz).toBeGreaterThan(100);
    }

    // 종이는 높은 감쇠비로 오버슈트가 매우 낮고, 금속은 가장 높은 공명 주파수를 가진다
    expect(paper.dampingRatio).toBeGreaterThan(wood.dampingRatio);
    expect(paper.peakOvershootRatio).toBeLessThan(wood.peakOvershootRatio);
    expect(metal.materialSignature.acoustic.fundamentalHz).toBeGreaterThan(
      wood.materialSignature.acoustic.fundamentalHz,
    );
  });

  it("7. simulateTactileSpring에 reducedMotion: true를 주면 0ms 즉시 정착하며 오버슈트와 CSS 전환을 제거한다", () => {
    for (const material of TACTILE_MATERIAL_IDS) {
      const instant = simulateTactileSpring({
        material,
        from: 0,
        to: 120,
        initialVelocity: 800,
        reducedMotion: true,
      });

      expect(instant.reducedMotion).toBe(true);
      expect(instant.settledImmediately).toBe(true);
      expect(instant.settleTimeMs).toBe(0);
      expect(instant.peakOvershootRatio).toBe(0);
      expect(instant.frames).toHaveLength(1);
      expect(instant.frames[0]?.timeMs).toBe(0);
      expect(instant.frames[0]?.value).toBe(120);
      expect(instant.cssTransitionFallback).toBe("none");
    }
  });

  it("8. RK4 스프링은 강성·감쇠·초기속도 물리 법칙(과감쇠 무오버슈트 vs 저감쇠 진동)을 충족한다", () => {
    const underdamped = simulateTactileSpring({
      material: "wood",
      mass: 1,
      stiffness: 300,
      damping: 12,
    });
    const overdamped = simulateTactileSpring({
      material: "wood",
      mass: 1,
      stiffness: 300,
      damping: 48,
    });
    const stiff = simulateTactileSpring({
      material: "metal",
      mass: 1,
      stiffness: 600,
      damping: 24,
    });

    expect(underdamped.regime).toBe("underdamped");
    expect(underdamped.peakOvershootRatio).toBeGreaterThan(0.15);
    expect(overdamped.regime).toBe("overdamped");
    expect(overdamped.peakOvershootRatio).toBe(0);
    expect(stiff.naturalFrequencyHz).toBeGreaterThan(underdamped.naturalFrequencyHz);
  });

  it("9. synthesizeProceduralStudioTheme는 5종 장르 테마 모두에서 OKLCH 시맨틱 토큰과 WCAG AA 4.5:1 이상 대비를 보증한다", () => {
    expect(PROCEDURAL_THEME_MOOD_IDS).toEqual([
      "romance-pastel",
      "noir-ink",
      "fantasy-parchment",
      "scifi-slate",
      "slice-warm-linen",
    ]);

    for (const moodId of PROCEDURAL_THEME_MOOD_IDS) {
      const theme = synthesizeProceduralStudioTheme(moodId);
      expect(theme.contrastAudit.wcagAaPassed, `${moodId} WCAG AA fail`).toBe(true);
      expect(theme.contrastAudit.minTextContrastRatio).toBeGreaterThanOrEqual(4.5);
      expect(theme.contrastAudit.minBorderContrastRatio).toBeGreaterThanOrEqual(3.0);
      expect(theme.contrastAudit.checks.length).toBe(18);
      expect(theme.contrastAudit.checks.every((c) => c.passed)).toBe(true);

      // 모든 CSS 변수가 OKLCH 형식을 따른다
      for (const value of Object.values(theme.cssVariables)) {
        expect(value.startsWith("oklch(")).toBe(true);
      }
    }
  });

  it("10. 절차적 테마 생성기에 극단적인 paletteSeedHue·chromaScale을 주입해도 WCAG AA 4.5:1 자동 가드가 유지된다", () => {
    const trickyHues = [60, 95, 140, 210, 315];
    for (const hue of trickyHues) {
      const lightTheme = synthesizeProceduralStudioTheme("romance-pastel", {
        paletteSeedHue: hue,
        chromaScale: 1.5,
      });
      const darkTheme = synthesizeProceduralStudioTheme("noir-ink", {
        paletteSeedHue: hue,
        chromaScale: 1.5,
      });

      expect(lightTheme.contrastAudit.wcagAaPassed).toBe(true);
      expect(lightTheme.contrastAudit.minTextContrastRatio).toBeGreaterThanOrEqual(4.5);
      expect(darkTheme.contrastAudit.wcagAaPassed).toBe(true);
      expect(darkTheme.contrastAudit.minTextContrastRatio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("11. OKLCH 상대 휘도 및 WCAG 명암비 연산은 흑백 21:1, 동일색 1:1 및 대칭성을 정확히 만족한다", () => {
    const black = { l: 0, c: 0, h: 0 };
    const white = { l: 1, c: 0, h: 0 };
    const accent = { l: 0.62, c: 0.14, h: 250 };

    expect(computeOklchRelativeLuminance(0, 0, 0)).toBeCloseTo(0, 4);
    expect(computeOklchRelativeLuminance(1, 0, 0)).toBeCloseTo(1, 4);
    expect(computeOklchContrastRatio(white, black)).toBeCloseTo(21, 2);
    expect(computeOklchContrastRatio(accent, accent)).toBe(1);
    expect(computeOklchContrastRatio(accent, black)).toBe(
      computeOklchContrastRatio(black, accent),
    );
  });

  it("12. 적응형 워크벤치는 순수 인메모리 1차 마르코프 행렬로 전환 빈도와 조건부 확률 P(to|from)를 정확히 학습한다", () => {
    const initial = createAdaptiveWorkbenchState();
    const afterSeq = recordToolSequence(initial, [
      "watercolor",
      "eyedropper",
      "watercolor",
      "eyedropper",
      "watercolor",
      "fill",
    ]);

    // 불변성 확인: 초기 상태는 변경되지 않음
    expect(initial.totalTransitions).toBe(0);
    expect(afterSeq.totalTransitions).toBe(5);
    expect(afterSeq.transitionMatrix.watercolor.eyedropper).toBe(2);
    expect(afterSeq.transitionMatrix.watercolor.fill).toBe(1);
    expect(afterSeq.transitionMatrix.eyedropper.watercolor).toBe(2);

    const proposal = buildWorkbenchProposal(afterSeq, { minTransitions: 5 });
    expect(proposal.topTransitions[0]?.bidirectionalAffinity).toBe(4);
    const wcToEye = proposal.topTransitions.find(
      (pair) => pair.fromToolId === "watercolor" && pair.toToolId === "eyedropper",
    );
    const eyeToWc = proposal.topTransitions.find(
      (pair) => pair.fromToolId === "eyedropper" && pair.toToolId === "watercolor",
    );
    expect(wcToEye?.probability).toBeCloseTo(2 / 3, 2);
    expect(eyeToWc?.probability).toBe(1);
    expect(wcToEye?.bidirectionalAffinity).toBe(4);
  });

  it("13. 옵트인 안전 불변 조건: 도구 전환 누적과 미리보기(preview)만으로는 활성 툴바와 단축키가 절대 움직이지 않는다", () => {
    const initial = createAdaptiveWorkbenchState();
    const scenario = DEFAULT_HABIT_SCENARIOS[1];
    expect(scenario).toBeDefined();
    if (!scenario) return;

    const observed = recordToolSequence(initial, scenario.sequence);
    expect(observed.activeToolbarOrder).toEqual(initial.baselineToolbarOrder);
    expect(observed.activeShortcuts).toEqual(initial.baselineShortcuts);
    expect(observed.approvalStatus).toBe("idle");

    const previewing = previewWorkbenchProposal(observed);
    expect(previewing.approvalStatus).toBe("previewing");
    expect(previewing.pendingProposal?.readyForProposal).toBe(true);
    expect(previewing.pendingProposal?.hasActionableChanges).toBe(true);
    // 미리보기 상태에서도 실제 툴바·단축키는 그대로 고정
    expect(previewing.activeToolbarOrder).toEqual(initial.baselineToolbarOrder);
    expect(previewing.activeShortcuts).toEqual(initial.baselineShortcuts);
  });

  it("14. 사용자 승인(apply)은 동선 단축 인접 배치와 무충돌 왼손 단축키 승격을 적용하고, 복구(revert)는 원상 복원한다", () => {
    const initial = createAdaptiveWorkbenchState();
    const scenario = DEFAULT_HABIT_SCENARIOS[1]; // watercolor <-> eyedropper + lasso -> fill
    expect(scenario).toBeDefined();
    if (!scenario) return;

    const previewing = previewWorkbenchProposal(recordToolSequence(initial, scenario.sequence));
    const proposal = previewing.pendingProposal;
    expect(proposal?.estimatedTravelReductionPct ?? 0).toBeGreaterThan(0);
    expect(proposal?.shortcutPromotions.length ?? 0).toBeGreaterThanOrEqual(1);

    // 승인 적용
    const applied = applyWorkbenchProposal(previewing);
    expect(applied.approvalStatus).toBe("applied");
    expect(applied.appliedCount).toBe(1);
    expect(applied.activeToolbarOrder).toEqual(proposal?.proposedToolbarOrder);
    expect(applied.activeShortcuts).toEqual(proposal?.proposedShortcuts);

    // 가장 강한 쌍(watercolor ↔ eyedropper)이 인접(거리 1) 배치되었는지 검증
    const wcIdx = applied.activeToolbarOrder.indexOf("watercolor");
    const eyeIdx = applied.activeToolbarOrder.indexOf("eyedropper");
    expect(Math.abs(wcIdx - eyeIdx)).toBe(1);

    // 단축키 중복 충돌 0건 검증
    const assignedKeys = Object.values(applied.activeShortcuts);
    expect(new Set(assignedKeys).size).toBe(assignedKeys.length);

    // 되돌리기(revert) 시 적용 직전 기본 순서와 단축키로 정확히 복원
    const reverted = revertWorkbenchLayout(applied);
    expect(reverted.approvalStatus).toBe("reverted");
    expect(reverted.activeToolbarOrder).toEqual(initial.baselineToolbarOrder);
    expect(reverted.activeShortcuts).toEqual(initial.baselineShortcuts);
  });

  it("15. 전환 이력이 임계치 미만일 때는 제안이 대기 상태를 유지하고 dismiss/reset이 상태를 깔끔히 정리한다", () => {
    let state = createAdaptiveWorkbenchState();
    state = recordToolUsage(state, "gpen");
    state = recordToolUsage(state, "eraser");
    const earlyProposal = buildWorkbenchProposal(state, { minTransitions: 5 });
    expect(earlyProposal.readyForProposal).toBe(false);
    expect(earlyProposal.hasActionableChanges).toBe(false);

    const previewed = previewWorkbenchProposal(state);
    const dismissed = dismissWorkbenchProposal(previewed);
    expect(dismissed.approvalStatus).toBe("idle");
    expect(dismissed.pendingProposal).toBeNull();

    const reset = resetWorkbenchLearning(dismissed);
    expect(reset.totalTransitions).toBe(0);
    expect(reset.totalToolActivations).toBe(0);
    expect(reset.lastToolId).toBeNull();
  });

  it("16. StudioHandcraftedAtelierPanel은 Props 없이 단독 렌더링되고 탭 1의 5종 프리셋 전환·시드 변경이 동작한다", () => {
    const onAnalogApplied = vi.fn();
    render(<StudioHandcraftedAtelierPanel onAnalogProfileApplied={onAnalogApplied} />);

    expect(screen.getByTestId("handcrafted-atelier-feel-panel")).toBeTruthy();
    expect(screen.getByTestId("tab-analog-jitter").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("analog-stroke-preview")).toBeTruthy();

    const initialJitterText = screen.getByTestId("analog-mean-jitter").textContent;
    fireEvent.click(screen.getByTestId("preset-btn-gpen-manuscript"));
    expect(onAnalogApplied).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("analog-mean-jitter").textContent).not.toBe(initialJitterText);

    fireEvent.click(screen.getByTestId("preset-btn-woodblock-print"));
    fireEvent.click(screen.getByTestId("btn-reseed-jitter"));
    expect(onAnalogApplied).toHaveBeenCalledTimes(3);
  });

  it("17. 탭 2에서 화구 물성 전환·모션 감소 0ms 즉시 정착 스위치·5종 절차적 OKLCH 테마 WCAG AA 검증이 동작한다", () => {
    const onThemeSynthesized = vi.fn();
    render(<StudioHandcraftedAtelierPanel onThemeSynthesized={onThemeSynthesized} />);

    fireEvent.click(screen.getByTestId("tab-spring-theme"));
    expect(screen.getByTestId("panel-spring-theme")).toBeTruthy();

    fireEvent.click(screen.getByTestId("material-btn-metal"));
    const normalSettle = screen.getByTestId("spring-settle-ms").textContent ?? "";
    expect(Number.parseInt(normalSettle, 10)).toBeGreaterThan(50);

    // 모션 감소 스위치 ON -> 0ms 즉시 정착 확인
    const rmSwitch = screen.getByTestId("switch-reduced-motion");
    fireEvent.click(rmSwitch);
    expect(rmSwitch.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("spring-settle-ms").textContent).toMatch(/^0ms/);

    // 절차적 테마 전환 -> WCAG AA 통과 배지 및 콜백 확인
    fireEvent.click(screen.getByTestId("theme-mood-fantasy-parchment"));
    expect(onThemeSynthesized).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("theme-wcag-badge").textContent).toContain("WCAG AA 통과");
    expect(screen.getByTestId("procedural-theme-preview")).toBeTruthy();
  });

  it("18. 탭 3 적응형 워크벤치는 루틴 학습 후 미리보기→승인 적용→이전 배치 복구 전체 옵트인 흐름을 수행한다", () => {
    const onWorkbenchApplied = vi.fn();
    render(<StudioHandcraftedAtelierPanel onWorkbenchApplied={onWorkbenchApplied} />);

    fireEvent.click(screen.getByTestId("tab-adaptive-workbench"));
    expect(screen.getByTestId("panel-adaptive-workbench")).toBeTruthy();

    // 초기 순서 스냅샷
    const readOrder = (): string[] =>
      Array.from(screen.getByTestId("active-toolbar-strip").querySelectorAll("button")).map(
        (btn) => btn.getAttribute("data-testid") ?? "",
      );
    const initialOrder = readOrder();

    // 수채·채색 루틴 시나리오 실행 -> 학습은 되지만 실제 툴바는 움직이지 않음
    fireEvent.click(screen.getByTestId("scenario-btn-watercolor-shading"));
    expect(screen.getByTestId("markov-top-pairs")).toBeTruthy();
    expect(readOrder()).toEqual(initialOrder);

    // 미리보기 클릭 -> 제안 박스 노출, 여전히 실제 툴바 미이동
    fireEvent.click(screen.getByTestId("btn-workbench-preview"));
    expect(screen.getByTestId("workbench-preview-box")).toBeTruthy();
    expect(readOrder()).toEqual(initialOrder);

    // 승인 후 적용 클릭 -> 툴바 재배치 반영 및 콜백 호출
    fireEvent.click(screen.getByTestId("btn-workbench-apply"));
    expect(onWorkbenchApplied).toHaveBeenCalledTimes(1);
    expect(readOrder()).not.toEqual(initialOrder);
    expect(screen.getByTestId("workbench-approval-status").textContent).toContain("승인 반영됨");

    // 이전 배치 복구 클릭 -> 원래 순서 100% 복원
    fireEvent.click(screen.getByTestId("btn-workbench-revert"));
    expect(readOrder()).toEqual(initialOrder);
  });

  it("19. 영문 로케일(locale='en')과 단독 무프롭스 렌더링, ARIA 탭·스위치 접근성 속성을 정확히 제공한다", () => {
    const { unmount } = render(<StudioHandcraftedAtelierPanel />);
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    unmount();

    render(<StudioHandcraftedAtelierPanel locale="en" initialTab="spring-theme" />);
    expect(screen.getByText(/Tactile Instrument RK4 Spring Simulator/)).toBeTruthy();
    expect(screen.getByTestId("theme-wcag-badge").textContent).toContain("WCAG AA Pass");
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("아날로그 예제 알림은 비동기 실패·중복 억제·재시도를 처리하고 실제 적용 성공으로 표시하지 않는다", async () => {
    const onAnalogProfileApplied = vi.fn().mockRejectedValueOnce(new Error("알림 실패")).mockResolvedValueOnce(undefined);
    render(<StudioHandcraftedAtelierPanel onAnalogProfileApplied={onAnalogProfileApplied} />);
    expect(screen.getByTestId("handcrafted-scope-notice").textContent).toContain("시간·기기 성능 실측이 아니에요");
    const preset = screen.getByTestId("preset-btn-gpen-manuscript");
    fireEvent.click(preset);
    expect(screen.getByTestId("handcrafted-atelier-feel-panel").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(preset);
    expect(onAnalogProfileApplied).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("handcrafted-notification-status").textContent).toContain("처리에 실패"));
    fireEvent.click(screen.getByTestId("handcrafted-notification-retry"));
    await waitFor(() => expect(screen.getByTestId("handcrafted-notification-status").textContent).toContain("실제 원고·설정 적용이나 저장 완료를 뜻하지 않아요"));
    expect(onAnalogProfileApplied).toHaveBeenCalledTimes(2);
    expect(onAnalogProfileApplied.mock.calls[0]?.[0]).toEqual(onAnalogProfileApplied.mock.calls[1]?.[0]);
  });

  it("동기 테마 알림 오류를 다시 시도하며 토큰 명암비 계산 범위를 표시한다", () => {
    const onThemeSynthesized = vi.fn().mockImplementationOnce(() => { throw new Error("알림 오류"); });
    render(<StudioHandcraftedAtelierPanel initialTab="spring-theme" onThemeSynthesized={onThemeSynthesized} />);
    fireEvent.click(screen.getByTestId("theme-mood-fantasy-parchment"));
    expect(screen.getByTestId("handcrafted-notification-status").textContent).toContain("처리에 실패");
    fireEvent.click(screen.getByTestId("handcrafted-notification-retry"));
    expect(onThemeSynthesized).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("theme-wcag-badge").textContent).toContain("토큰 쌍");
  });

  it("승인 알림 재시도는 배치를 다시 적용하지 않고 복구·초기화도 예제 상태를 알린다", async () => {
    const onWorkbenchApplied = vi.fn().mockRejectedValueOnce(new Error("알림 실패")).mockResolvedValue(undefined);
    render(<StudioHandcraftedAtelierPanel initialTab="adaptive-workbench" onWorkbenchApplied={onWorkbenchApplied} />);
    fireEvent.click(screen.getByTestId("scenario-btn-watercolor-shading"));
    fireEvent.click(screen.getByTestId("btn-workbench-apply"));
    fireEvent.click(screen.getByTestId("btn-workbench-reset"));
    expect(onWorkbenchApplied).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("handcrafted-notification-status").textContent).toContain("처리에 실패"));
    fireEvent.click(screen.getByTestId("handcrafted-notification-retry"));
    await waitFor(() => expect(screen.getByTestId("handcrafted-atelier-feel-panel").getAttribute("aria-busy")).toBe("false"));
    expect(onWorkbenchApplied).toHaveBeenCalledTimes(2);
    expect(onWorkbenchApplied.mock.calls[0]?.[0]?.appliedCount).toBe(1);
    expect(onWorkbenchApplied.mock.calls[1]?.[0]?.appliedCount).toBe(1);
    fireEvent.click(screen.getByTestId("btn-workbench-revert"));
    await waitFor(() => expect(screen.getByTestId("handcrafted-atelier-feel-panel").getAttribute("aria-busy")).toBe("false"));
    expect(onWorkbenchApplied.mock.calls[2]?.[0]?.approvalStatus).toBe("reverted");
    expect(screen.getByTestId("btn-workbench-revert").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("btn-workbench-reset"));
    await waitFor(() => expect(screen.getByTestId("handcrafted-atelier-feel-panel").getAttribute("aria-busy")).toBe("false"));
    expect(onWorkbenchApplied.mock.calls[3]?.[0]?.approvalStatus).toBe("idle");
    expect(onWorkbenchApplied.mock.calls[3]?.[0]?.appliedCount).toBe(0);
    expect(screen.queryByTestId("handcrafted-notification-retry")).toBeNull();
  });

  it("20. 모듈 전체 정적 위생 규칙(800줄 이하·무스토리지·무BigInt·무비공개저장소·패널 무원시색·props규칙)을 통과한다", () => {
    const files = [
      "analog-jitter-engine.ts",
      "spring-inertia-theme-engine.ts",
      "adaptive-workbench-learner.ts",
      "StudioHandcraftedAtelierPanel.tsx",
      "index.ts",
      "handcrafted-atelier-feel.test.tsx",
    ];

    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(
      ["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""),
    );

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} 800줄 이하 제한 위반 (${lineCount})`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} 비공개 Map 저장소 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioHandcraftedAtelierPanel.tsx"), "utf8");
    const themeSrc = readFileSync(resolve(MODULE_DIR, "spring-inertia-theme-engine.ts"), "utf8");
    expect(rawColorRe.test(panelSrc), "Panel must contain zero raw hex/rgb/hsl colors").toBe(false);
    expect(rawColorRe.test(themeSrc), "Theme engine must contain zero raw hex/rgb/hsl colors").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioHandcraftedAtelierPanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
