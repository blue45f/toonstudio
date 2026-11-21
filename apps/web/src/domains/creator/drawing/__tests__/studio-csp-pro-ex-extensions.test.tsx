/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCspReaCompleteWorkbenchSection } from "../StudioCspReaCompleteWorkbenchSection";
import {
  CSP_DRAWING_FIGURE_PRESETS,
  CSP_WEBTOON_GRADIENT_MAPS,
  applyCspColorizeHintAutoFill,
  applyCspWebtoonGradientMap,
  computeCspDrawingFigureLightingVector,
  createCspTimelapseSession,
  eraseCspVectorStrokes,
  extractCspSubViewReferencePalette,
  pinchCspVectorStroke,
  renderCspQuickMaskOverlay,
  rgbBytesToOklch,
  simplifyCspVectorStroke,
  type CspVectorStroke,
} from "../studio-csp-pro-ex-extensions";
import {
  CSP_REA_INTERNALIZATION_OBLIGATIONS,
  evaluateCspReaInternalizationCoverage,
} from "../studio-csp-rea-obligation-ledger";

afterEach(() => {
  cleanup();
});

const INTERSECTING_SAMPLE: readonly CspVectorStroke[] = [
  {
    id: "horiz",
    points: [
      { x: 10, y: 50, widthPx: 3, pressure: 0.7 },
      { x: 90, y: 50, widthPx: 3, pressure: 0.7 },
    ],
  },
  {
    id: "vert-l",
    points: [
      { x: 30, y: 10, widthPx: 2.5, pressure: 0.8 },
      { x: 30, y: 90, widthPx: 2.5, pressure: 0.8 },
    ],
  },
  {
    id: "vert-r",
    points: [
      { x: 70, y: 10, widthPx: 2.5, pressure: 0.8 },
      { x: 70, y: 90, widthPx: 2.5, pressure: 0.8 },
    ],
  },
];

describe("studio-csp-pro-ex-extensions (벡터 지우개·단순화·핀치·컬러라이즈·그라데이션맵·서브뷰·퀵마스크·타임랩스·3D데생)", () => {
  it("벡터 지우개 3모드(intersection·touch·whole)가 선분 교차와 원 절단을 정확히 계산한다", () => {
    const eraser = { x: 50, y: 50, radiusPx: 10 };

    // 1. intersection 모드: x=30..70 교차 구간만 깔끔히 삭제, 양쪽 세로선은 분할 없이 유지
    const interRes = eraseCspVectorStrokes(INTERSECTING_SAMPLE, eraser, "intersection");
    expect(interRes.strokes).toHaveLength(4);
    expect(interRes.intersectionCutCount).toBe(1);
    const leftPiece = interRes.strokes.find((s) => s.id === "horiz#cut-1");
    const rightPiece = interRes.strokes.find((s) => s.id === "horiz#cut-2");
    expect(leftPiece?.points[0]?.x).toBeCloseTo(10, 2);
    expect(leftPiece?.points[leftPiece.points.length - 1]?.x).toBeCloseTo(30, 2);
    expect(rightPiece?.points[0]?.x).toBeCloseTo(70, 2);
    expect(rightPiece?.points[rightPiece.points.length - 1]?.x).toBeCloseTo(90, 2);
    expect(interRes.strokes.find((s) => s.id === "vert-l")?.points).toHaveLength(2);
    expect(interRes.strokes.find((s) => s.id === "vert-r")?.points).toHaveLength(2);

    // 2. touch 모드: 지우개 원(r=10)과 닿은 x=40..60 구간만 정밀 절단
    const touchRes = eraseCspVectorStrokes(INTERSECTING_SAMPLE, eraser, "touch");
    expect(touchRes.strokes).toHaveLength(4);
    const touchL = touchRes.strokes.find((s) => s.id === "horiz#part-1");
    const touchR = touchRes.strokes.find((s) => s.id === "horiz#part-2");
    expect(touchL?.points[touchL.points.length - 1]?.x).toBeCloseTo(40, 2);
    expect(touchR?.points[0]?.x).toBeCloseTo(60, 2);

    // 3. whole 모드: 닿은 가로선 전체 삭제, 세로선 2개만 유지
    const wholeRes = eraseCspVectorStrokes(INTERSECTING_SAMPLE, eraser, "whole");
    expect(wholeRes.strokes).toHaveLength(2);
    expect(wholeRes.erasedStrokeCount).toBe(1);
  });

  it("RDP 벡터 선 단순화와 반경 내 제어점 핀치(끝점 고정 포함)가 정확히 동작한다", () => {
    const noisyStroke = [
      { x: 0, y: 0, widthPx: 3, pressure: 0.5 },
      { x: 10, y: 0.2, widthPx: 3, pressure: 0.6 },
      { x: 20, y: -0.1, widthPx: 3, pressure: 0.7 },
      { x: 30, y: 0.3, widthPx: 3, pressure: 0.8 },
      { x: 40, y: 12, widthPx: 3, pressure: 0.9 },
      { x: 50, y: 0.1, widthPx: 3, pressure: 0.7 },
      { x: 60, y: 0, widthPx: 3, pressure: 0.5 },
    ];
    const simplified = simplifyCspVectorStroke(noisyStroke, 1.0);
    expect(simplified.length).toBeLessThan(noisyStroke.length);
    expect(simplified[0]?.x).toBe(0);
    expect(simplified[simplified.length - 1]?.x).toBe(60);
    expect(simplified.some((pt) => pt.x === 40 && pt.y === 12)).toBe(true);

    const flatLine = [
      { x: 0, y: 20, widthPx: 3, pressure: 0.6 },
      { x: 20, y: 20, widthPx: 3, pressure: 0.8 },
      { x: 40, y: 20, widthPx: 3, pressure: 0.6 },
    ];
    const pinched = pinchCspVectorStroke(
      flatLine,
      { x: 20, y: 20 },
      { dx: 0, dy: -10 },
      28,
      { strength01: 1, pinEndpoints: true },
    );
    expect(pinched[0]?.y).toBe(20);
    expect(pinched[1]?.y).toBeCloseTo(10, 2);
    expect(pinched[2]?.y).toBe(20);
  });

  it("컬러라이즈(Colorize) 힌트 자동 채색이 선화 경계를 존중하며 두 영역을 분리 채색한다", () => {
    const w = 20;
    const h = 20;
    const lineArt = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        const isWall = x === 0 || y === 0 || x === w - 1 || y === h - 1 || x === 10;
        lineArt[idx] = isWall ? 12 : 255;
        lineArt[idx + 1] = isWall ? 12 : 255;
        lineArt[idx + 2] = isWall ? 14 : 255;
        lineArt[idx + 3] = 255;
      }
    }

    const res = applyCspColorizeHintAutoFill({
      lineArtRgba: lineArt,
      width: w,
      height: h,
      hints: [
        { x: 4, y: 10, r: 238, g: 46, b: 64 },
        { x: 15, y: 10, r: 42, g: 128, b: 242 },
      ],
    });

    expect(res.appliedHintCount).toBe(2);
    expect(res.detectedLinePixelCount).toBeGreaterThan(50);
    expect(res.filledPixelCount).toBeGreaterThan(200);

    // 왼쪽 방은 빨간 힌트 우세, 오른쪽 방은 파란 힌트 우세, 중앙 선화 벽은 어두운 잉크 유지
    const leftIdx = (10 * w + 5) * 4;
    const rightIdx = (10 * w + 14) * 4;
    const wallIdx = (10 * w + 10) * 4;
    expect(res.rgba[leftIdx] ?? 0).toBeGreaterThan(210);
    expect(res.rgba[leftIdx + 2] ?? 255).toBeLessThan(90);
    expect(res.rgba[rightIdx + 2] ?? 0).toBeGreaterThan(210);
    expect(res.rgba[rightIdx] ?? 255).toBeLessThan(90);
    expect(res.rgba[wallIdx] ?? 255).toBeLessThan(40);
  });

  it("웹툰 그라데이션 맵 8종 프리셋이 모두 실제 RGBA 픽셀 변환과 반전·강도 옵션을 반영한다", () => {
    expect(CSP_WEBTOON_GRADIENT_MAPS).toHaveLength(8);
    expect(CSP_WEBTOON_GRADIENT_MAPS.map((p) => p.labelKo)).toEqual([
      "노을",
      "새벽안개",
      "네온사이버",
      "빈티지세피아",
      "로판골드",
      "공포청록",
      "벚꽃파스텔",
      "흑백만화",
    ]);

    const src = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 256; i += 1) {
      src[i * 4] = i;
      src[i * 4 + 1] = i;
      src[i * 4 + 2] = i;
      src[i * 4 + 3] = 255;
    }

    for (const preset of CSP_WEBTOON_GRADIENT_MAPS) {
      expect(preset.previewOklchStops.every((s) => s.startsWith("oklch("))).toBe(true);
      const mapped = applyCspWebtoonGradientMap(src, 16, 16, preset.id);
      let diffs = 0;
      for (let i = 0; i < src.length; i += 4) {
        if (src[i] !== mapped[i] || src[i + 1] !== mapped[i + 1] || src[i + 2] !== mapped[i + 2]) {
          diffs += 1;
        }
      }
      expect(diffs, preset.id).toBeGreaterThan(100);
    }

    const normal = applyCspWebtoonGradientMap(src, 16, 16, "sunset", { reverse: false });
    const reversed = applyCspWebtoonGradientMap(src, 16, 16, "sunset", { reverse: true });
    expect(normal[0]).not.toBe(reversed[0]);
  });

  it("서브뷰 대표색 팔레트 추출·퀵 마스크·타임랩스 링버퍼·3D 데생 인형 6종이 정밀 동작한다", () => {
    // 1. 서브뷰 대표색 추출 (8개 distinct 색상 블록)
    const paletteColors: readonly (readonly [number, number, number])[] = [
      [230, 56, 72],
      [48, 120, 232],
      [246, 200, 52],
      [56, 188, 134],
      [166, 72, 224],
      [242, 128, 48],
      [34, 42, 68],
      [244, 236, 220],
    ];
    const refBuf = new Uint8ClampedArray(16 * 16 * 4);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const block = Math.floor(y / 4) * 2 + Math.floor(x / 8);
        const c = paletteColors[block % paletteColors.length] ?? [0, 0, 0];
        const idx = (y * 16 + x) * 4;
        refBuf[idx] = c[0];
        refBuf[idx + 1] = c[1];
        refBuf[idx + 2] = c[2];
        refBuf[idx + 3] = 255;
      }
    }
    const palette = extractCspSubViewReferencePalette(refBuf, 16, 16, { maxColors: 8 });
    expect(palette.swatches.length).toBeGreaterThanOrEqual(6);
    expect(palette.swatches.length).toBeLessThanOrEqual(8);
    expect(palette.sampledPixelCount).toBe(256);
    expect(palette.swatches.every((s) => s.oklchCss.startsWith("oklch("))).toBe(true);

    // 2. 퀵 마스크 오버레이 합성 & 반전
    const base = new Uint8ClampedArray(8 * 8 * 4).fill(220);
    const mask = new Uint8Array(64);
    for (let i = 0; i < 16; i += 1) mask[i] = 255;
    const qmNormal = renderCspQuickMaskOverlay({
      baseRgba: base,
      maskAlpha: mask,
      width: 8,
      height: 8,
      opacity01: 0.5,
      invertOverlay: false,
    });
    const qmInverted = renderCspQuickMaskOverlay({
      baseRgba: base,
      maskAlpha: mask,
      width: 8,
      height: 8,
      opacity01: 0.5,
      invertOverlay: true,
    });
    expect(qmNormal.maskedPixelCount).toBe(16);
    expect(qmInverted.maskedPixelCount).toBe(48);
    expect(qmNormal.rgba[1] ?? 255).toBeLessThan(220);

    // 3. 타임랩스 링버퍼(용량 초과 FIFO 교체 + 배속 샘플링)
    const session = createCspTimelapseSession({ maxRingCapacity: 6 });
    for (let i = 0; i < 10; i += 1) {
      const frame = new Uint8ClampedArray(4 * 4 * 4);
      frame[3] = 255;
      frame[0] = i * 20;
      session.recordFrame(frame, 4, 4, { strokeCount: i + 1, timestampMs: i * 1000 });
    }
    expect(session.getSnapshotCount()).toBe(6);
    expect(session.getTotalCapturedCount()).toBe(10);
    expect(session.getDroppedFrameCount()).toBe(4);
    expect(session.getFrames()[0]?.sequenceIndex).toBe(4);

    const longSession = createCspTimelapseSession({ maxRingCapacity: 60 });
    for (let i = 0; i < 45; i += 1) {
      const f = new Uint8ClampedArray(2 * 2 * 4).fill(255);
      longSession.recordFrame(f, 2, 2, { strokeCount: i + 1, timestampMs: i * 1500 });
    }
    const plan = longSession.buildExportPlan(15, 1);
    expect(plan.targetFrameCount).toBe(15);
    expect(plan.sampledFrames[0]?.sequenceIndex).toBe(0);
    expect(plan.sampledFrames[plan.sampledFrames.length - 1]?.sequenceIndex).toBe(44);
    expect(plan.effectiveSpeedMultiplier).toBeGreaterThanOrEqual(3);

    // 4. 3D 데생 인형 비율·광원 프리셋 6종
    expect(CSP_DRAWING_FIGURE_PRESETS).toHaveLength(6);
    for (const preset of CSP_DRAWING_FIGURE_PRESETS) {
      const light = computeCspDrawingFigureLightingVector(preset);
      const norm = Math.hypot(light.keyLightDir[0], light.keyLightDir[1], light.keyLightDir[2]);
      expect(norm).toBeCloseTo(1, 2);
      expect(light.headHeightCm).toBeGreaterThan(15);
      expect(preset.keyLightOklchCss.startsWith("oklch(")).toBe(true);
    }

    // sRGB -> OKLCH sanity
    expect(rgbBytesToOklch(255, 255, 255).l).toBeCloseTo(1, 2);
  });

  it("의무 원장에 신규 Pro/EX 기능 ID가 100% 내재화 상태로 반영되어 있다", () => {
    const ids = CSP_REA_INTERNALIZATION_OBLIGATIONS.map((o) => o.obligationId);
    expect(ids).toContain("OBL-PROEX-VECTOR-ERASER-SIMPLIFY-PINCH");
    expect(ids).toContain("OBL-PROEX-COLORIZE-HINT-AUTOFILL");
    expect(ids).toContain("OBL-PROEX-WEBTOON-GRADIENT-MAPS-8");
    expect(ids).toContain("OBL-PROEX-SUBVIEW-QUICKMASK-TIMELAPSE-FIGURE");
    const report = evaluateCspReaInternalizationCoverage();
    expect(report.coveragePercent).toBe(100);
    expect(report.coreFeatureSummary.executableCoreSubsystemCount).toBe(13);
  });
});

describe("StudioCspProExToolsPanel 워크벤치 통합 및 OKLCH·접근성·무슬롭 계약", () => {
  it("만화·애니 도구 하위 세그먼트에서 프로·자동 도구 7종이 원클릭 실행되고 기존 3탭 계약을 보존한다", () => {
    const onRunCoreFeature = vi.fn();
    render(<StudioCspReaCompleteWorkbenchSection onRunCoreFeature={onRunCoreFeature} />);

    // 상단 주 탭은 기존 3탭 계약 유지
    expect(screen.getAllByRole("tab").map((el) => el.textContent)).toEqual([
      "브러시 고르기",
      "필터·색조 보정",
      "만화·애니 도구",
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "만화·애니 도구" }));
    fireEvent.click(screen.getByTestId("csp-rea-core-segment-pro-ex"));
    expect(screen.getByTestId("csp-pro-ex-tools-panel")).toBeTruthy();

    // 1. 벡터 교차 지우개
    expect(screen.getByTestId("csp-pro-ex-vector-readout").textContent).toContain("남은 선 4개");
    fireEvent.click(screen.getByTestId("csp-pro-ex-vector-mode-whole"));
    expect(screen.getByTestId("csp-pro-ex-vector-readout").textContent).toContain("남은 선 2개");
    fireEvent.click(screen.getByTestId("csp-pro-ex-apply-vector-eraser"));
    expect(onRunCoreFeature).toHaveBeenCalledWith("pro-ex:vector-eraser:whole");
    expect(screen.getByTestId("csp-rea-applied-feedback").textContent).toContain(
      "적용됨 · 언제든 되돌리기 가능",
    );

    // 2. 힌트 자동 채색
    fireEvent.click(screen.getByTestId("csp-pro-ex-tool-btn-colorize-hint"));
    expect(screen.getByTestId("csp-pro-ex-colorize-readout").textContent).toContain("자동 채색");
    fireEvent.click(screen.getByTestId("csp-pro-ex-apply-colorize"));
    expect(onRunCoreFeature).toHaveBeenCalledWith("pro-ex:colorize:sakura-sky");

    // 3. 그라데이션 맵 8종
    fireEvent.click(screen.getByTestId("csp-pro-ex-tool-btn-gradient-map"));
    fireEvent.click(screen.getByTestId("csp-pro-ex-gradient-rofan-gold"));
    expect(screen.getByTestId("csp-pro-ex-gradient-readout").textContent).toContain("로판골드");
    fireEvent.click(screen.getByTestId("csp-pro-ex-apply-gradient-map"));
    expect(onRunCoreFeature).toHaveBeenCalledWith("pro-ex:gradient-map:rofan-gold");

    // 4. 서브뷰 팔레트 추출
    fireEvent.click(screen.getByTestId("csp-pro-ex-tool-btn-subview-palette"));
    expect(screen.getByTestId("csp-pro-ex-subview-readout").textContent).toContain("추출 대표색");

    // 5. 퀵 마스크
    fireEvent.click(screen.getByTestId("csp-pro-ex-tool-btn-quick-mask"));
    fireEvent.click(screen.getByTestId("csp-pro-ex-quick-mask-invert"));
    expect(screen.getByTestId("csp-pro-ex-quick-mask-readout").textContent).toContain("마스크 영역");

    // 6. 타임랩스 녹화
    fireEvent.click(screen.getByTestId("csp-pro-ex-tool-btn-timelapse"));
    fireEvent.click(screen.getByTestId("csp-pro-ex-timelapse-capture"));
    expect(screen.getByTestId("csp-pro-ex-timelapse-readout").textContent).toContain("저장 프레임 4/12");

    // 7. 3D 데생 인형 프리셋 6종
    fireEvent.click(screen.getByTestId("csp-pro-ex-tool-btn-drawing-figure"));
    fireEvent.click(screen.getByTestId("csp-pro-ex-figure-editorial-fashion-9head"));
    expect(screen.getByTestId("csp-pro-ex-figure-readout").textContent).toContain("85mm");
    fireEvent.click(screen.getByTestId("csp-pro-ex-apply-drawing-figure"));
    expect(onRunCoreFeature).toHaveBeenCalledWith("pro-ex:drawing-figure:editorial-fashion-9head");

    // 내부 개발 전문용어가 UI 텍스트에 0건
    const panelText = screen.getByTestId("csp-pro-ex-tools-panel").textContent ?? "";
    expect(panelText).not.toMatch(/OBL-|ghidra|REA|SQLite|OPFS|EditImageTool/iu);
  });

  it("신규 UI 컴포넌트 소스가 OKLCH·44px 터치 타깃·모션 축소를 준수하고 금지 토큰이 0건이다", () => {
    const files = [
      resolve(__dirname, "../StudioCspProExToolsPanel.tsx"),
      resolve(__dirname, "../StudioCspProExSecondaryViews.tsx"),
      resolve(__dirname, "../studio-csp-pro-ex-demo-fixtures.ts"),
    ];
    for (const filePath of files) {
      const src = readFileSync(filePath, "utf8");
      expect(src, filePath).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src, filePath).not.toMatch(/\brgba?\(/u);
      expect(src, filePath).not.toMatch(/\bbg-white\b/u);
      expect(src, filePath).not.toMatch(/\btransition-all\b/u);
      expect(src, filePath).not.toMatch(/\b(animate-bounce|animate-ping|animate-spin)\b/u);
      expect(src, filePath).not.toMatch(
        /\b(SQLite|OPFS|CRDT|leader tab|ghidra|EditImageTool\.todb|CSVectorizeV4|default\.laf)\b|OBL-/iu,
      );
    }

    const fixturesSrc = readFileSync(
      resolve(__dirname, "../studio-csp-pro-ex-demo-fixtures.ts"),
      "utf8",
    );
    expect(fixturesSrc).toContain("min-h-11");
    expect(fixturesSrc).toContain("motion-reduce:transition-none");
    expect(fixturesSrc).toContain("motion-reduce:transform-none");
    expect(fixturesSrc).toContain("color-mix(in oklch");
  });
});
