// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { RedlineCanvasOverlayPanel } from "./RedlineCanvasOverlayPanel";
import {
  NONPRINT_REDLINE_LAYER_ID,
  addRedlinePinToOverlay,
  buildRedlineStrokeSvgPath,
  buildSampleCanvasLayerStack,
  clampOverlayOpacity,
  computeViewportJumpTarget,
  createInitialRedlineOverlayState,
  filterPinsByStageAndCut,
  stripNonPrintOverlayForExport,
  syncRedlineResolutionToReviewBoard,
  updateNonPrintOverlayControls,
  type CanvasViewportMetrics,
  type ExportableCanvasLayer,
} from "./redline-canvas-overlay-engine";

const HANGUL_REGEX = /[가-힣]/u;
const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/u;
const INITIAL_LANG = useI18n.getState().lang;

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: INITIAL_LANG });
});

describe("붉은펜 비출력 캔버스 오버레이 엔진", () => {
  it("비출력 레이어 불변 계약과 PNG/PSD/웹툰 분할/PDF 출고 시 강제 제거 무결성을 보장한다", () => {
    const state = createInitialRedlineOverlayState();
    expect(state.layerId).toBe(NONPRINT_REDLINE_LAYER_ID);
    expect(state.exportable).toBe(false);
    expect(state.printVisible).toBe(false);
    expect(clampOverlayOpacity(0.01)).toBe(0.1);
    expect(clampOverlayOpacity(2.8)).toBe(1);
    expect(clampOverlayOpacity(Number.NaN)).toBe(0.85);

    const updated = updateNonPrintOverlayControls(state, { opacity: 0.4, visible: false });
    expect(updated.opacity).toBe(0.4);
    expect(updated.visible).toBe(false);
    expect(updated.layerId).toBe(NONPRINT_REDLINE_LAYER_ID);
    expect(updated.exportable).toBe(false);
    expect(updated.printVisible).toBe(false);

    const mixedLayers: readonly ExportableCanvasLayer[] = [
      ...buildSampleCanvasLayerStack(state),
      {
        id: "custom-guide",
        name: "강사 메모 가이드",
        kind: "guide",
        visible: true,
        opacity: 0.7,
        exportable: false,
      },
      {
        id: "print-hidden-notes",
        name: "비인쇄 노트",
        kind: "text",
        visible: true,
        opacity: 1,
        printVisible: false,
      },
      {
        id: "flagged-nonprint",
        name: "교정 오버레이",
        kind: "raster",
        visible: true,
        opacity: 0.9,
        nonPrint: true,
      },
      {
        id: "99_NONPRINT_BACKUP",
        name: "99_NONPRINT_BACKUP",
        kind: "raster",
        visible: true,
        opacity: 0.8,
      },
    ];

    for (const format of ["png", "psd", "webtoon-slice", "pdf-print"] as const) {
      const report = stripNonPrintOverlayForExport(mixedLayers, { format });
      expect(report.passed).toBe(true);
      expect(report.redlinePixelLeakCount).toBe(0);
      expect(report.exportedLayerCount).toBe(5);
      expect(report.strippedCount).toBe(5);
      expect(report.exportedLayers.some((layer) => layer.id === NONPRINT_REDLINE_LAYER_ID)).toBe(
        false,
      );
      expect(report.strippedLayers.map((item) => item.reason)).toEqual([
        "nonprint-layer-id",
        "exportable-false",
        "print-visible-false",
        "nonprint-flag",
        "nonprint-name-prefix",
      ]);
      expect(HANGUL_REGEX.test(report.summaryEn)).toBe(false);
    }
  });

  it("핀 클릭 뷰포트 자동 점프 좌표를 컷 오프셋·줌·클램핑 포함하여 결정론적으로 계산한다", () => {
    const state = createInitialRedlineOverlayState();
    const metrics: CanvasViewportMetrics = {
      viewportWidth: 960,
      viewportHeight: 680,
      canvasWidth: 800,
      canvasTotalHeight: 3840,
      targetZoom: 1.5,
      cuts: state.cuts,
    };

    const cut2Pin = state.pins.find((pin) => pin.id === "rpin-03");
    expect(cut2Pin).toBeDefined();
    if (!cut2Pin) return;

    const midJump = computeViewportJumpTarget(cut2Pin, metrics);
    expect(midJump.cutId).toBe("CUT-02");
    expect(midJump.focusCanvasX).toBe(416);
    expect(midJump.focusCanvasY).toBe(1702.4);
    expect(midJump.zoom).toBe(1.5);
    expect(midJump.scrollLeft).toBe(144);
    expect(midJump.scrollTop).toBe(2214);
    expect(midJump.panOffsetX).toBe(-144);
    expect(midJump.panOffsetY).toBe(-2214);
    expect(midJump.clampedX).toBe(false);
    expect(midJump.clampedY).toBe(false);

    const topEdgeJump = computeViewportJumpTarget(
      { id: "edge-tl", cutId: "CUT-01", cutIndex: 1, xPct: -20, yPct: -10 },
      metrics,
    );
    expect(topEdgeJump.scrollLeft).toBe(0);
    expect(topEdgeJump.scrollTop).toBe(0);
    expect(topEdgeJump.panOffsetX).toBe(0);
    expect(topEdgeJump.panOffsetY).toBe(0);
    expect(topEdgeJump.clampedX).toBe(true);
    expect(topEdgeJump.clampedY).toBe(true);

    const bottomEdgeJump = computeViewportJumpTarget(
      { id: "edge-br", cutId: "CUT-03", cutIndex: 3, xPct: 120, yPct: 130 },
      { ...metrics, targetZoom: 99, maxZoom: 3 },
    );
    expect(bottomEdgeJump.zoom).toBe(3);
    expect(bottomEdgeJump.scrollLeft).toBe(1440);
    expect(bottomEdgeJump.scrollTop).toBe(10840);
    expect(bottomEdgeJump.clampedX).toBe(true);
    expect(bottomEdgeJump.clampedY).toBe(true);

    expect(buildRedlineStrokeSvgPath([])).toBe("");
    expect(buildRedlineStrokeSvgPath([{ xPct: 50, yPct: 50 }])).toContain("M 200 150");
    expect(
      buildRedlineStrokeSvgPath([
        { xPct: 10, yPct: 20 },
        { xPct: 50, yPct: 40 },
        { xPct: 80, yPct: 70 },
      ]),
    ).toContain("Q ");
  });

  it("상태 전이(open -> resolved -> canShip: true), 재오픈, 공정별 필터링, 새 핀 추가를 동기화한다", () => {
    let state = createInitialRedlineOverlayState();
    const openIds = state.pins
      .filter((pin) => pin.status === "open" || pin.status === "in-progress")
      .map((pin) => pin.id);
    expect(openIds).toEqual(["rpin-01", "rpin-02", "rpin-03", "rpin-04"]);

    let lastSnapshot = syncRedlineResolutionToReviewBoard(state, openIds[0] ?? "", "resolved", {
      actorKo: "김민재",
      actorEn: "Minjae Kim",
      syncedAtIso: "2026-11-23T08:01:00Z",
    });
    expect(lastSnapshot.openCount).toBe(3);
    expect(lastSnapshot.canShip).toBe(false);
    expect(lastSnapshot.changedPin?.resolvedAtIso).toBe("2026-11-23T08:01:00Z");
    expect(HANGUL_REGEX.test(lastSnapshot.syncEventSummaryEn)).toBe(false);
    state = lastSnapshot.nextState;

    for (const id of openIds.slice(1)) {
      lastSnapshot = syncRedlineResolutionToReviewBoard(state, id, "resolved");
      state = lastSnapshot.nextState;
    }

    expect(lastSnapshot.openCount).toBe(0);
    expect(lastSnapshot.completionPct).toBe(100);
    expect(lastSnapshot.canShip).toBe(true);
    expect(lastSnapshot.stageProgress.every((item) => item.openCount === 0)).toBe(true);

    const verified = syncRedlineResolutionToReviewBoard(state, "rpin-01", "verified");
    expect(verified.verifiedCount).toBe(1);
    expect(verified.canShip).toBe(true);

    const reopened = syncRedlineResolutionToReviewBoard(verified.nextState, "rpin-01", "open");
    expect(reopened.openCount).toBe(1);
    expect(reopened.canShip).toBe(false);
    expect(reopened.changedPin?.resolvedAtIso).toBeNull();

    const letteringOnly = filterPinsByStageAndCut(reopened.nextState.pins, {
      stage: "lettering",
      cutIndex: "all",
    });
    expect(letteringOnly).toHaveLength(1);
    expect(letteringOnly[0]?.id).toBe("rpin-04");

    const withAdded = addRedlinePinToOverlay(reopened.nextState, {
      cutIndex: 3,
      xPct: 145,
      yPct: -12,
      stage: "pd-qa",
      titleKo: "최종 컷 하단 크롭 여백 확인",
      titleEn: "Verify bottom crop margin on final cut",
      noteKo: "하단 여백 40px 유지 확인",
      noteEn: "Maintain 40px bottom safe margin",
    });
    const added = withAdded.pins[withAdded.pins.length - 1];
    expect(added?.pinNumber).toBe(6);
    expect(added?.xPct).toBe(100);
    expect(added?.yPct).toBe(0);
    expect(added?.strokes.length).toBeGreaterThanOrEqual(1);
    expect(withAdded.activeCutIndex).toBe(3);
  });
});

describe("RedlineCanvasOverlayPanel UI 인터랙션 및 다국어·품질 계약", () => {
  it("눈 토글, 불투명도 슬라이더, 핀 점프, 새 핀 찍기, 수정 완료 동기화 및 출고 감사를 수행한다", () => {
    const onViewportJump = vi.fn();
    const onSyncStateChange = vi.fn();
    const onExportAudit = vi.fn();

    render(
      <RedlineCanvasOverlayPanel
        onViewportJump={onViewportJump}
        onSyncStateChange={onSyncStateChange}
        onExportAudit={onExportAudit}
      />,
    );

    expect(screen.getByTestId("rlo-export-safety-badge").textContent).toContain(
      "출고 시 붉은펜 0% 포함 보장",
    );
    const svgLayer = screen.getByTestId("rlo-nonprint-svg-layer");
    expect(svgLayer.getAttribute("data-layer-id")).toBe(NONPRINT_REDLINE_LAYER_ID);
    expect(svgLayer.getAttribute("data-exportable")).toBe("false");
    expect(svgLayer.getAttribute("data-print-visible")).toBe("false");

    // 불투명도 슬라이더 조작
    fireEvent.change(screen.getByTestId("rlo-opacity-slider"), { target: { value: "45" } });
    expect(screen.getByTestId("rlo-opacity-value").textContent).toBe("45%");
    expect(svgLayer.style.opacity).toBe("0.45");

    // 비출력 레이어 눈 토글
    fireEvent.click(screen.getByTestId("rlo-visibility-toggle"));
    expect(svgLayer.getAttribute("data-visible")).toBe("false");
    expect(svgLayer.style.opacity).toBe("0");
    fireEvent.click(screen.getByTestId("rlo-visibility-toggle"));
    expect(svgLayer.getAttribute("data-visible")).toBe("true");

    // 캔버스 위 번호 핀 직접 클릭 시 자동 점프 콜백 호출
    fireEvent.click(screen.getByTestId("rlo-canvas-pin-rpin-01"));
    expect(onViewportJump).toHaveBeenCalledTimes(1);

    // 다른 컷(CUT-03) 핀으로 자동 점프
    fireEvent.click(screen.getByTestId("rlo-jump-btn-rpin-04"));
    expect(onViewportJump).toHaveBeenCalledTimes(2);
    const [jumpTarget] = onViewportJump.mock.calls[1] ?? [];
    expect(jumpTarget?.cutId).toBe("CUT-03");
    expect(screen.getByTestId("rlo-jump-readout").textContent).toContain("CUT-03");

    // 새 붉은펜 핀 추가 (스테이지 클릭 좌표 지정 포함)
    fireEvent.click(screen.getByTestId("rlo-place-pin-toggle"));
    const stageSurface = screen.getByTestId("rlo-stage-hit-surface");
    vi.spyOn(stageSurface, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    });
    fireEvent.click(stageSurface, { clientX: 240, clientY: 150 });
    const form = screen.getByTestId("rlo-new-pin-form");
    expect(form.textContent).toContain("X 60%, Y 50%");
    fireEvent.change(within(form).getByLabelText("붉은펜 수정 요청 내용"), {
      target: { value: "말풍선 테두리 두께 2px로 통일" },
    });
    fireEvent.submit(form);
    expect(screen.getByTestId("rlo-thread-list").textContent).toContain(
      "말풍선 테두리 두께 2px로 통일",
    );

    // 공정별 필터링(식자·말풍선)
    fireEvent.click(screen.getByTestId("rlo-stage-filter-lettering"));
    expect(screen.getByTestId("rlo-thread-card-rpin-04")).toBeDefined();
    expect(screen.queryByTestId("rlo-thread-card-rpin-01")).toBeNull();

    // 전체로 복귀 후 모든 미해결 핀을 수정 완료 처리 -> canShip: true 확인
    fireEvent.click(screen.getByRole("button", { name: /^전체/ }));
    const resolveButtons = screen.getAllByRole("button", { name: "수정 완료" });
    for (const button of resolveButtons) {
      fireEvent.click(button);
    }
    expect(onSyncStateChange).toHaveBeenCalled();
    expect(screen.getByTestId("rlo-ship-status-badge").getAttribute("data-can-ship")).toBe("true");

    // 출고 포맷 전환 감사 확인
    fireEvent.click(screen.getByRole("button", { name: "PSD" }));
    expect(onExportAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "psd",
        passed: true,
        redlinePixelLeakCount: 0,
        strippedCount: 1,
      }),
    );
  });

  it("EN 모드에서는 렌더링 텍스트와 접근성 속성에 한글이 0자여야 한다", () => {
    useI18n.setState({ lang: "en" });
    const { container } = render(<RedlineCanvasOverlayPanel />);

    // 핀 찍기 폼, 음성 첨삭, 상태 동기화, 출고 감사 포맷 전환까지 모두 노출
    fireEvent.click(screen.getByTestId("rlo-place-pin-toggle"));
    fireEvent.click(screen.getByRole("button", { name: /Voice Critique 18s/ }));
    fireEvent.click(screen.getByTestId("rlo-resolve-btn-rpin-01"));
    fireEvent.click(screen.getByRole("button", { name: "Print PDF" }));

    expect(HANGUL_REGEX.test(container.textContent ?? "")).toBe(false);

    const elements = container.querySelectorAll("[aria-label], [title], [placeholder]");
    for (const el of elements) {
      expect(HANGUL_REGEX.test(el.getAttribute("aria-label") ?? "")).toBe(false);
      expect(HANGUL_REGEX.test(el.getAttribute("title") ?? "")).toBe(false);
      expect(HANGUL_REGEX.test(el.getAttribute("placeholder") ?? "")).toBe(false);
    }
  });

  it("정적 품질 계약(파일 800줄 이하, 원시 hex/rgb/hsl 0건, transition-all 0건, any 0건)을 준수한다", () => {
    const baseDir = resolve(process.cwd(), "apps/web/src/domains/creator/review-redline-overlay");
    const files = [
      "redline-canvas-overlay-catalog.ts",
      "redline-canvas-overlay-engine.ts",
      "RedlineCanvasOverlayPanel.tsx",
      "RedlineCanvasOverlaySubsections.tsx",
      "redline-canvas-overlay.css",
    ];

    for (const file of files) {
      const content = readFileSync(resolve(baseDir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} exceeds 800 lines`).toBeLessThanOrEqual(800);
      expect(content.includes("transition-all"), `${file} contains transition-all`).toBe(false);
      if (file.endsWith(".css") || file.endsWith(".tsx")) {
        expect(RAW_COLOR_REGEX.test(content), `${file} contains raw color`).toBe(false);
      }
      if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        expect(/\b(?:as\s+any|:\s*any)\b/.test(content), `${file} contains any`).toBe(false);
      }
    }
  });
});
