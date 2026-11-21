import { describe, expect, it } from "vitest";

import { CSP_DEFAULT_LAF_AUTO_ACTION_SET } from "../../../../../../../packages/studio-format-gateway/src/csp-laf-sgs-spws";

import {
  CSP_REA_EXECUTABLE_BRUSH_PRESETS,
  adjustCspVectorLineWidth,
  connectCspVectorStrokes,
  pinchCspVectorStroke,
  renderCspFullBrushStroke,
  stabilizeCspStrokePoints,
} from "../studio-csp-brush-stroke-engine";
import {
  borderCspSelectionMask,
  combineCspStoryPagesToSpread,
  compositeCspLightTableCelRgba,
  compositeCspOnionSkinRgba,
  createCspAutoActionDocumentState,
  createCspStoryProject,
  eraseOutsideCspSelection,
  executeCspAutoAction,
  expandCspSelectionMask,
  featherCspSelectionMask,
  floodFillCspWithCloseGapAndExpand,
  projectPolylineToCspRuler,
  rasterizeCspFocusAndStreamLines,
  rasterizeCspScreentoneLayer,
  reorderCspStoryPages,
  runCspFilterStepOnActiveLayer,
  selectCspColorGamut,
  shrinkCspSelectionMask,
  splitCspComicFramePolygon,
  splitCspStorySpread,
} from "../studio-csp-core-features-engine";
import {
  CSP_REA_INTERNALIZATION_OBLIGATIONS,
  CSP_REA_STATIC_EVIDENCE_RECORDS,
  evaluateCspReaInternalizationCoverage,
} from "../studio-csp-rea-obligation-ledger";

describe("studio-csp-brush-stroke-engine (24종 브러시 · 전 파라미터 · 벡터 선 보정)", () => {
  it("24종 모든 실행 가능 CSP 브러시 프리셋이 실제 RGBA 스트로크를 렌더링한다", () => {
    expect(CSP_REA_EXECUTABLE_BRUSH_PRESETS).toHaveLength(24);
    const points = [
      { x: 6, y: 16, pressure: 0.45 },
      { x: 16, y: 12, pressure: 0.9 },
      { x: 26, y: 20, pressure: 0.6 },
    ];
    for (const preset of CSP_REA_EXECUTABLE_BRUSH_PRESETS) {
      const base = new Uint8ClampedArray(32 * 32 * 4);
      if (preset.category === "eraser") {
        base.fill(255);
      }
      const res = renderCspFullBrushStroke({
        width: 32,
        height: 32,
        targetRgba: base,
        points,
        mainColor: { r: 24, g: 72, b: 196 },
        subColor: { r: 240, g: 180, b: 40 },
        params: preset.params,
        seed: 77,
        isEraser: preset.category === "eraser",
      });
      expect(res.dabCount, preset.id).toBeGreaterThan(0);
      expect(res.modifiedPixelCount, preset.id).toBeGreaterThan(0);
    }
  });

  it("4단계 AA(0=1bit 도트), LMS 습식 혼색(노랑+파랑→초록 계열), 리본, 스프레이, 듀얼 브러시, 손떨림 보정이 실제 결과에 반영된다", () => {
    const dotPreset = CSP_REA_EXECUTABLE_BRUSH_PRESETS.find((p) => p.id === "dot-pen")!;
    const dotRes = renderCspFullBrushStroke({
      width: 24,
      height: 24,
      points: [
        { x: 4, y: 12, pressure: 1 },
        { x: 20, y: 12, pressure: 1 },
      ],
      mainColor: { r: 0, g: 0, b: 0 },
      params: dotPreset.params,
    });
    // AntiAlias=0: 모든 픽셀 알파는 0 또는 255 이진값
    for (let i = 3; i < dotRes.rgba.length; i += 4) {
      expect(dotRes.rgba[i] === 0 || dotRes.rgba[i] === 255).toBe(true);
    }

    // 습식 LMS 혼색: 파랑 바탕 위 노랑 브러시 → 녹색 채널 상승 확인
    const blueCanvas = new Uint8ClampedArray(24 * 24 * 4);
    for (let i = 0; i < 24 * 24; i += 1) {
      blueCanvas[i * 4] = 16;
      blueCanvas[i * 4 + 1] = 64;
      blueCanvas[i * 4 + 2] = 220;
      blueCanvas[i * 4 + 3] = 255;
    }
    const wetPreset = CSP_REA_EXECUTABLE_BRUSH_PRESETS.find((p) => p.id === "wet-watercolor")!;
    const wetRes = renderCspFullBrushStroke({
      width: 24,
      height: 24,
      targetRgba: blueCanvas,
      points: [
        { x: 4, y: 12, pressure: 0.85 },
        { x: 20, y: 12, pressure: 0.85 },
      ],
      mainColor: { r: 245, g: 220, b: 20 },
      params: wetPreset.params,
    });
    const centerIdx = (12 * 24 + 12) * 4;
    expect(wetRes.rgba[centerIdx + 1]!).toBeGreaterThan(110);
    expect(wetRes.appliedFeatures).toContain("wet-perceptual-lms");
    expect(wetRes.appliedFeatures).toContain("water-edge-v2");

    // 손떨림 보정: 지그재그 지터 진폭 감소 검증
    const jittered = [
      { x: 0, y: 10, pressure: 0.8 },
      { x: 5, y: 20, pressure: 0.8 },
      { x: 10, y: 0, pressure: 0.8 },
      { x: 15, y: 20, pressure: 0.8 },
      { x: 20, y: 10, pressure: 0.8 },
    ];
    const smooth = stabilizeCspStrokePoints(jittered, {
      ...dotPreset.params.correction,
      useStabilizer: true,
      stabilizerLevel: 70,
    });
    expect(Math.abs(smooth[2]!.y - 10)).toBeLessThan(Math.abs(jittered[2]!.y - 10));
  });

  it("벡터 선 핀치·5모드 선폭 보정·끝점 연결이 정확히 동작한다", () => {
    const stroke = [
      { x: 0, y: 0, widthPx: 4, pressure: 0.6 },
      { x: 10, y: 0, widthPx: 4, pressure: 0.8 },
      { x: 20, y: 0, widthPx: 4, pressure: 0.6 },
    ];
    const pinchedTight = pinchCspVectorStroke(stroke, { x: 10, y: 0 }, { dx: 0, dy: 8 }, 9, 1);
    expect(pinchedTight[1]!.y).toBeCloseTo(8, 2);
    expect(pinchedTight[0]!.y).toBeCloseTo(0, 2);
    const pinchedWide = pinchCspVectorStroke(stroke, { x: 10, y: 0 }, { dx: 0, dy: 8 }, 15, 1);
    expect(pinchedWide[0]!.y).toBeGreaterThan(0);
    expect(pinchedWide[0]!.y).toBeLessThan(8);

    const thick = adjustCspVectorLineWidth(stroke, "thicken", 2);
    expect(thick[1]!.widthPx).toBe(6);
    const fixed = adjustCspVectorLineWidth(stroke, "fix-width", 2.5);
    expect(fixed[0]!.widthPx).toBe(2.5);

    const connected = connectCspVectorStrokes(
      stroke,
      [{ x: 22, y: 1, widthPx: 4, pressure: 0.5 }, { x: 30, y: 1, widthPx: 4, pressure: 0.5 }],
      5,
    );
    expect(connected).toHaveLength(5);
  });
});

describe("studio-csp-core-features-engine (선택·채우기·오토액션·컷·톤·자·셀애니·스토리)", () => {
  it("선택 영역 확장/축소/경계/흐리기/색역/외부 지우기 및 틈새 닫기 채우기가 픽셀 단위로 동작한다", () => {
    const w = 16;
    const h = 16;
    const mask = new Uint8Array(w * h);
    for (let y = 5; y <= 10; y += 1) {
      for (let x = 5; x <= 10; x += 1) mask[y * w + x] = 255;
    }
    const countOn = (m: Uint8Array) => m.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
    const expanded = expandCspSelectionMask(mask, w, h, 2, "round");
    const shrunk = shrinkCspSelectionMask(mask, w, h, 1, "round");
    const border = borderCspSelectionMask(mask, w, h, 2);
    const feathered = featherCspSelectionMask(mask, w, h, 2);
    expect(countOn(expanded)).toBeGreaterThan(countOn(mask));
    expect(countOn(shrunk)).toBeLessThan(countOn(mask));
    expect(countOn(border)).toBeGreaterThan(0);
    expect(feathered[5 * w + 4]!).toBeGreaterThan(0);
    expect(feathered[5 * w + 4]!).toBeLessThan(255);

    // 1px 틈새가 있는 사각 선화 박스 내부에 FillCloseGap=2 적용 시 외부 유출 차단 검증
    const lineRgba = new Uint8ClampedArray(w * h * 4);
    for (let x = 3; x <= 12; x += 1) {
      for (const y of [3, 12]) {
        if (y === 12 && x === 8) continue; // 1px 틈새(gap)
        const idx = (y * w + x) * 4;
        lineRgba[idx + 3] = 255;
      }
    }
    for (let y = 3; y <= 12; y += 1) {
      for (const x of [3, 12]) {
        const idx = (y * w + x) * 4;
        lineRgba[idx + 3] = 255;
      }
    }
    const fill = floodFillCspWithCloseGapAndExpand({
      targetRgba: new Uint8ClampedArray(w * h * 4),
      referenceLineRgba: lineRgba,
      width: w,
      height: h,
      seedX: 7,
      seedY: 7,
      fillColor: [240, 120, 60, 255],
      closeGapPx: 2,
      expandPx: 0,
    });
    // 박스 외부 코너(0,0)로 새지 않아야 함
    expect(fill.filledMask[0]).toBe(0);
    expect(fill.filledPixelCount).toBeGreaterThan(20);
    expect(fill.filledPixelCount).toBeLessThan(120);

    const gamut = selectCspColorGamut(fill.rgba, w, h, [240, 120, 60], 10);
    expect(countOn(gamut)).toBe(fill.filledPixelCount);
    const erasedOut = eraseOutsideCspSelection(fill.rgba, shrunk);
    expect(erasedOut[0 * 4 + 3]).toBe(0);
  });

  it("default.laf 오토 액션 실실행, 컷 분할, 22종 톤, 집중선, 대칭 자, 어니언스킨/라이트테이블, 멀티페이지 스토리가 동작한다", () => {
    const doc = createCspAutoActionDocumentState(12, 12);
    const action = CSP_DEFAULT_LAF_AUTO_ACTION_SET.actions[0]!;
    const run = executeCspAutoAction(doc, action);
    expect(run.executedStepCount).toBe(action.items.length);
    expect(run.nextDoc.layers.length).toBe(2);
    expect(run.nextDoc.layers[1]!.isDraftLayer).toBe(true);
    expect(run.undoSnapshot.layers.length).toBe(1);

    const filteredDoc = runCspFilterStepOnActiveLayer(run.nextDoc, "reverse-gradient");
    expect(filteredDoc.executedLog).toContain("filter:reverse-gradient");

    const split = splitCspComicFramePolygon({
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      cutStart: { x: 0, y: 50 },
      cutEnd: { x: 100, y: 50 },
      gutterPx: 10,
    });
    expect(split.panelA.length).toBe(4);
    expect(split.panelB.length).toBe(4);

    const tone = rasterizeCspScreentoneLayer({
      width: 16,
      height: 16,
      dotShape: "star",
      lpi: 60,
      angleDeg: 45,
      fixedDensity01: 0.5,
    });
    expect(tone.some((v, idx) => idx % 4 === 3 && v > 0)).toBe(true);

    const focus = rasterizeCspFocusAndStreamLines({
      width: 24,
      height: 24,
      mode: "focus-lines",
      lineCount: 24,
    });
    expect(focus.some((v, idx) => idx % 4 === 3 && v > 0)).toBe(true);

    const symBranches = projectPolylineToCspRuler(
      { type: "symmetry", origin: { x: 50, y: 50 }, symmetryLineCount: 4, mirrorReflect: true },
      [
        { x: 60, y: 50 },
        { x: 70, y: 60 },
      ],
    );
    expect(symBranches).toHaveLength(8);

    const prevFrame = new Uint8ClampedArray(8 * 8 * 4);
    prevFrame[(2 * 8 + 2) * 4 + 3] = 255;
    const currFrame = new Uint8ClampedArray(8 * 8 * 4);
    currFrame[(4 * 8 + 4) * 4 + 3] = 255;
    const onion = compositeCspOnionSkinRgba({
      width: 8,
      height: 8,
      currentFrameRgba: currFrame,
      prevFrames: [prevFrame],
      nextFrames: [],
    });
    expect(onion[(2 * 8 + 2) * 4 + 3]!).toBeGreaterThan(0);

    const lt = compositeCspLightTableCelRgba({
      width: 8,
      height: 8,
      workingCelRgba: currFrame,
      referenceCelRgba: prevFrame,
      offsetX: 1,
      offsetY: 0,
      rotationDeg: 0,
      scale: 1,
      opacity01: 0.5,
    });
    expect(lt[(2 * 8 + 3) * 4 + 3]!).toBeGreaterThan(0);

    const story = createCspStoryProject("연재 1화", 6, "right-to-left");
    const combined = combineCspStoryPagesToSpread(story, 1);
    expect(combined.pages).toHaveLength(5);
    expect(combined.pages[1]!.isSpread).toBe(true);
    const reordered = reorderCspStoryPages(combined, 1, 3);
    expect(reordered.pages[3]!.isSpread).toBe(true);
    const splitBack = splitCspStorySpread(reordered, 3);
    expect(splitBack.pages).toHaveLength(6);
  });

  it("REA Ghidra 의무 원장이 100% 내재화율과 정적 증거/추론/미관측 분리를 보고한다", () => {
    const report = evaluateCspReaInternalizationCoverage();
    expect(report.analysisProviderEnforced).toBe("ghidra");
    expect(report.coveragePercent).toBe(100);
    expect(report.obligationVerifiedCount).toBe(CSP_REA_INTERNALIZATION_OBLIGATIONS.length);
    expect(report.evidenceRecordCount).toBe(CSP_REA_STATIC_EVIDENCE_RECORDS.length);
    expect(report.filterEngineSummary.totalExecutableFilters).toBe(46);
    expect(report.brushEngineSummary.executablePresetCount).toBe(24);
    expect(report.observedFactsKo.length).toBeGreaterThan(0);
    expect(report.inferencesKo.length).toBeGreaterThan(0);
    expect(report.unknownsKo.length).toBeGreaterThan(0);
    expect(report.wave2IntegrationExports.length).toBe(3);
  });
});
