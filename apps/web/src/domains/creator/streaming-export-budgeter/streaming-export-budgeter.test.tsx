// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_RESOURCE_BUDGET_POLICY,
  DEFAULT_SOURCE_DOCUMENT,
  DEFAULT_WORK_COLOR_SAMPLES,
  EXPORT_MEDIUM_PRESETS,
  FRAME_BUDGET_60FPS_MS,
  NEON_STRESS_COLOR_SAMPLES,
  PRINT_SAFE_COLOR_SAMPLES,
  StudioStreamingExportBudgeterPanel,
  calculateMediumResourceBudget,
  cancelStreamingPipeline,
  compareThreeMediaBudgets,
  createStreamingPipelineState,
  evaluateGamutForMedium,
  pauseStreamingPipeline,
  resumeStreamingPipeline,
  startStreamingPipeline,
  stepStreamingFrame,
  stepStreamingFramesBatch,
  type SourceDocumentSpec,
} from "./index";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const STORAGE_TOKEN_REGEX = new RegExp(`\\b(?:local|session)${"Storage"}\\b`);

describe("streaming-export-budgeter: 동적 리소스 예산 관리자 & 60fps 스트리밍 출고 엔진", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("웹툰(800/1600px sRGB·P3)·단행본(300/600DPI B5·신국판 CMYK 블리드)·방송(4K Rec.709·Rec.2020) 해상도·타일·메모리를 정확히 계산한다", () => {
    const doc: SourceDocumentSpec = {
      widthPx: 1600,
      heightPx: 12800,
      layerCount: 30,
      bitDepth: 8,
      sourceGamut: "display-p3",
      pageCount: 4,
      tileSizePx: 512,
    };

    // 1) 웹툰 세로 스크롤 800px sRGB vs 1600px Display P3
    const web800 = calculateMediumResourceBudget(doc, "webtoon-scroll-800-srgb");
    const web1600 = calculateMediumResourceBudget(doc, "webtoon-scroll-1600-p3");
    expect(web800.outputWidthPx).toBe(800);
    expect(web800.outputHeightPx).toBe(6400);
    expect(web800.stripSliceCount).toBe(5);
    expect(web800.tileCols).toBe(2);
    expect(web800.tileRows).toBe(13);
    expect(web800.totalTileChunks).toBe(26);
    expect(web800.preset.gamut).toBe("srgb");

    expect(web1600.outputWidthPx).toBe(1600);
    expect(web1600.outputHeightPx).toBe(12800);
    expect(web1600.effectiveBitDepth).toBe(16);
    expect(web1600.bytesPerPixel).toBe(8);
    expect(web1600.tileCols).toBe(4);
    expect(web1600.tileRows).toBe(25);
    expect(web1600.totalTileChunks).toBe(100);
    expect(web1600.memorySavingPct).toBeGreaterThan(50);
    expect(web1600.streamingPeakRamMb).toBeLessThan(web1600.nonStreamingPeakRamMb);

    // 2) 단행본 인쇄 B5 / 신국판 × 300 / 600 DPI + 3mm 블리드
    const b5_300 = calculateMediumResourceBudget(doc, "print-b5-300dpi-cmyk");
    expect(b5_300.bleedMm).toBe(3);
    expect(b5_300.outputWidthPx).toBe(Math.ceil(((182 + 6) / 25.4) * 300)); // 2221
    expect(b5_300.outputHeightPx).toBe(Math.ceil(((257 + 6) / 25.4) * 300)); // 3107
    expect(b5_300.unitCount).toBe(4);
    expect(b5_300.tileCols).toBe(5);
    expect(b5_300.tileRows).toBe(7);
    expect(b5_300.totalTileChunks).toBe(140);

    const shinguk600 = calculateMediumResourceBudget(doc, "print-shingukpan-600dpi-cmyk");
    expect(shinguk600.outputWidthPx).toBe(Math.ceil(((152 + 6) / 25.4) * 600)); // 3733
    expect(shinguk600.outputHeightPx).toBe(Math.ceil(((225 + 6) / 25.4) * 600)); // 5457
    expect(shinguk600.totalTileChunks).toBe(8 * 11 * 4); // 352

    // 3) 방송 4K 3840×2160 Rec.709 vs Rec.2020
    const bc709 = calculateMediumResourceBudget(doc, "broadcast-4k-rec709");
    const bc2020 = calculateMediumResourceBudget(doc, "broadcast-4k-rec2020");
    expect(bc709.outputWidthPx).toBe(3840);
    expect(bc709.outputHeightPx).toBe(2160);
    expect(bc709.tileCols).toBe(8);
    expect(bc709.tileRows).toBe(5);
    expect(bc709.totalTileChunks).toBe(160);
    expect(bc2020.effectiveBitDepth).toBe(16);
    expect(bc2020.streamingPeakVramMb).toBeGreaterThan(bc709.streamingPeakVramMb);

    // 4) 비정상 입력(NaN, 음수) 방어 불변식
    const sanitized = calculateMediumResourceBudget(
      { widthPx: Number.NaN, heightPx: -100, layerCount: Number.POSITIVE_INFINITY, bitDepth: 8, sourceGamut: "srgb", pageCount: 0 },
      "print-b5-300dpi-cmyk",
    );
    expect(Number.isFinite(sanitized.streamingPeakRamMb)).toBe(true);
    expect(Number.isFinite(sanitized.estimatedTotalSeconds)).toBe(true);
    expect(sanitized.totalTileChunks).toBeGreaterThan(0);
    expect(EXPORT_MEDIUM_PRESETS).toHaveLength(8);
  });

  it("매체별 색역 이탈(Out-of-Gamut) 경고가 Display P3→sRGB/Rec.709/CMYK 이탈과 Rec.2020/안전 팔레트 통과를 정밀 판별한다", () => {
    const p3Report = evaluateGamutForMedium(DEFAULT_WORK_COLOR_SAMPLES, "display-p3");
    const srgbReport = evaluateGamutForMedium(DEFAULT_WORK_COLOR_SAMPLES, "srgb");
    const rec709Report = evaluateGamutForMedium(DEFAULT_WORK_COLOR_SAMPLES, "rec709");
    const rec2020Report = evaluateGamutForMedium(DEFAULT_WORK_COLOR_SAMPLES, "rec2020");
    const cmykReport = evaluateGamutForMedium(DEFAULT_WORK_COLOR_SAMPLES, "cmyk-coated", 300);

    // P3 및 Rec.2020 광색역에서는 기본 P3 샘플 전부 색역 내부
    expect(p3Report.outOfGamutCount).toBe(0);
    expect(p3Report.severity).toBe("ok");
    expect(rec2020Report.outOfGamutCount).toBe(0);

    // sRGB / Rec.709에서는 고채도 Display P3 샘플들이 색역 이탈로 검출
    expect(srgbReport.outOfGamutCount).toBeGreaterThanOrEqual(2);
    expect(srgbReport.maxDeltaE).toBeGreaterThan(3);
    expect(rec709Report.outOfGamutCount).toBe(srgbReport.outOfGamutCount);

    // CMYK 코팅지에서는 고채도/네온 샘플 이탈 경고 + 스트레스 팔레트 TAC 초과 검증
    expect(cmykReport.outOfGamutCount).toBeGreaterThanOrEqual(3);
    const stressCmyk = evaluateGamutForMedium(NEON_STRESS_COLOR_SAMPLES, "cmyk-coated", 300);
    expect(stressCmyk.severity).toBe("critical");
    expect(stressCmyk.tacExceededCount).toBeGreaterThanOrEqual(1);

    // 단행본 안전 팔레트는 sRGB/Rec.709/CMYK 모두 안전
    const safeCmyk = evaluateGamutForMedium(PRINT_SAFE_COLOR_SAMPLES, "cmyk-coated", 300);
    expect(safeCmyk.outOfGamutCount).toBe(0);
    expect(safeCmyk.severity).toBe("ok");

    // 3대 매체 동시 비교 합계 검증
    const cmp = compareThreeMediaBudgets({ ...DEFAULT_SOURCE_DOCUMENT, colorSamples: DEFAULT_WORK_COLOR_SAMPLES });
    expect(cmp.totalOutOfGamutWarnings).toBe(
      cmp.webtoon.gamutReport.outOfGamutCount + cmp.print.gamutReport.outOfGamutCount + cmp.broadcast.gamutReport.outOfGamutCount,
    );
  });

  it("60fps 프레임 예산(<=16.67ms) 비침범·청크별 시간 상한·서브타일 분할·메모리 워터마크 플러시·일시정지/재개/취소를 보장한다", () => {
    const budget = calculateMediumResourceBudget(
      { widthPx: 1600, heightPx: 6400, layerCount: 28, bitDepth: 8, sourceGamut: "display-p3", pageCount: 2, tileSizePx: 512 },
      "print-b5-600dpi-cmyk",
    );
    const policy = {
      ...DEFAULT_RESOURCE_BUDGET_POLICY,
      frameBudgetMs: FRAME_BUDGET_60FPS_MS,
      maxChunkDurationMs: 2.5,
      maxRamWatermarkMb: 128,
      maxVramWatermarkMb: 64,
    };

    let state = createStreamingPipelineState(budget, policy);
    expect(state.status).toBe("idle");
    state = startStreamingPipeline(state);
    expect(state.status).toBe("running");

    // 1) 편집 부하가 60fps 예산을 꽉 채웠을 때(16.67ms) 백그라운드는 0ms로 즉시 양보
    state = stepStreamingFrame(state, { editorWorkMs: 16.67 });
    expect(state.recentFrames[0].backgroundWorkMs).toBe(0);
    expect(state.recentFrames[0].yieldedReason).toBe("editor-frame-full");
    expect(state.frameBudgetViolationCount).toBe(0);

    // 2) 타일 비용이 maxChunkDurationMs(2.5ms)보다 큰 상황(chunkCostScale=2.5)에서도 서브타일 분할로 60fps 및 청크 상한 엄수
    state = stepStreamingFramesBatch(state, 12, { editorWorkMs: 11.2, chunkCostScale: 2.5 });
    for (const frame of state.recentFrames) {
      expect(frame.totalFrameMs).toBeLessThanOrEqual(FRAME_BUDGET_60FPS_MS + 0.02);
      expect(frame.maxChunkSliceMs).toBeLessThanOrEqual(policy.maxChunkDurationMs + 0.02);
    }
    expect(state.frameBudgetViolationCount).toBe(0);
    expect(state.watermarkViolationCount).toBe(0);
    expect(state.completedChunks).toBeGreaterThan(0);

    // 3) 일시정지 -> 프레임 실행 시 변화 없음 -> 재개 시 이전 커서부터 이어서 진행
    const completedBeforePause = state.completedChunks;
    state = pauseStreamingPipeline(state);
    expect(state.status).toBe("paused");
    const pausedStep = stepStreamingFrame(state, { editorWorkMs: 8 });
    expect(pausedStep.completedChunks).toBe(completedBeforePause);
    state = resumeStreamingPipeline(pausedStep);
    expect(state.status).toBe("running");

    // 4) 외부 메모리 압박이 워터마크(RAM 128MB)에 도달 시 자동 스로틀링, 해소 시 재개 후 완주
    state = stepStreamingFrame(state, { editorWorkMs: 8, externalRamPressureMb: 128 });
    expect(state.status).toBe("throttled");
    expect(state.throttleReason).toBeTruthy();
    expect(state.watermarkViolationCount).toBe(0);

    // 백프레셔 플러시가 작동하며 끝까지 완료
    let guard = 0;
    while (state.status !== "completed" && guard < 40) {
      state = stepStreamingFramesBatch(state, 30, { editorWorkMs: 9.5, externalRamPressureMb: 108 });
      guard += 1;
    }
    expect(state.status).toBe("completed");
    expect(state.progressPct).toBe(100);
    expect(state.flushedChunks).toBe(state.totalChunks);
    expect(state.activeRamMb).toBe(0);
    expect(state.activeVramMb).toBe(0);
    expect(state.frameBudgetViolationCount).toBe(0);
    expect(state.watermarkViolationCount).toBe(0);

    // 5) 진행 중 취소 시 잔여 청크 취소 표기 및 임시 버퍼 즉시 해제, 취소 후 재개 불가 불변식
    let cancellable = startStreamingPipeline(createStreamingPipelineState(budget, policy));
    cancellable = stepStreamingFramesBatch(cancellable, 4, { editorWorkMs: 10 });
    expect(cancellable.completedChunks).toBeGreaterThan(0);
    cancellable = cancelStreamingPipeline(cancellable, "테스트 취소");
    expect(cancellable.status).toBe("cancelled");
    expect(cancellable.activeRamMb).toBe(0);
    expect(cancellable.activeVramMb).toBe(0);
    expect(cancellable.cancelledChunks).toBeGreaterThan(0);
    expect(resumeStreamingPipeline(cancellable).status).toBe("cancelled");
  });

  it("StudioStreamingExportBudgeterPanel이 props 없이 KO/EN 단독 렌더되고 3대 매체 비교·시뮬레이터·색역 경고를 상호작용한다", () => {
    const { container, unmount } = render(<StudioStreamingExportBudgeterPanel />);
    expect(screen.getByText("동적 리소스 예산 관리자 · 초고속 스트리밍 출고 엔진")).toBeTruthy();
    expect(container.innerHTML).toContain("[word-break:keep-all]");
    expect(container.innerHTML).toContain("tabular-nums");
    expect(container.innerHTML).not.toContain("transition-all");

    // 3대 매체 카드 동시 렌더 및 단행본 600DPI 전환 시 해상도 실시간 갱신 확인
    const printCard = screen.getByTestId("medium-card-print");
    expect(within(printCard).getByText("2221×3107px")).toBeTruthy();
    fireEvent.click(within(printCard).getByRole("button", { name: "신국판 600DPI" }));
    expect(within(printCard).getByText("3733×5457px")).toBeTruthy();

    // 웹툰 800px sRGB 전환 시 해상도 실시간 갱신
    const webtoonCard = screen.getByTestId("medium-card-webtoon");
    fireEvent.click(within(webtoonCard).getByRole("button", { name: "800px sRGB" }));
    expect(within(webtoonCard).getByText("800×6400px")).toBeTruthy();

    // 방송 4K Rec.2020 전환 시 색역 갱신
    const broadcastCard = screen.getByTestId("medium-card-broadcast");
    expect(within(broadcastCard).getByText("3840×2160px")).toBeTruthy();
    fireEvent.click(within(broadcastCard).getByRole("button", { name: "4K Rec.2020" }));
    expect(within(broadcastCard).getByText("REC2020")).toBeTruthy();

    // 팔레트를 단행본 안전 팔레트로 변경 시 색역 이탈 경고 0건으로 갱신
    fireEvent.click(screen.getByRole("button", { name: "단행본 안전 차분 팔레트" }));
    expect(screen.getByTestId("total-gamut-warning-badge").textContent).toContain("0건");

    // 스트리밍 시뮬레이터 시작 -> 15프레임 진행 -> 일시정지 -> 재개 -> 취소 -> 초기화
    fireEvent.click(screen.getByRole("button", { name: "스트리밍 시작" }));
    expect(screen.getByTestId("pipeline-status-badge").textContent).toBe("스트리밍 진행 중");

    fireEvent.click(screen.getByRole("button", { name: "15프레임 진행" }));
    const progressbar = screen.getByRole("progressbar", { name: "스트리밍 출고 진행률" });
    expect(Number(progressbar.getAttribute("aria-valuenow"))).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByTestId("pipeline-status-badge").textContent).toBe("일시정지됨");

    fireEvent.click(screen.getByRole("button", { name: "재개" }));
    expect(screen.getByTestId("pipeline-status-badge").textContent).toBe("스트리밍 진행 중");

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByTestId("pipeline-status-badge").textContent).toBe("취소됨");

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByTestId("pipeline-status-badge").textContent).toBe("대기 중");
    unmount();

    // EN 로케일 단독 렌더 확인
    useI18n.setState({ lang: "en" });
    const enView = render(<StudioStreamingExportBudgeterPanel />);
    expect(screen.getByText("Dynamic Resource Budgeter & Streaming Export Engine")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Streaming" })).toBeTruthy();
    enView.unmount();
  });

  it("정적 위생 검사: 모든 파일 800줄 이하 · 원시 색상 0건 · 브라우저 스토리지 0건 · transition-all 0건을 만족한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/streaming-export-budgeter");
    const files = [
      "dynamic-resource-budgeter.ts",
      "gamut-color-evaluator.ts",
      "StudioStreamingExportBudgeterPanel.tsx",
      "index.ts",
      "streaming-export-budgeter.test.tsx",
    ];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      expect(fs.existsSync(fullPath), `${file} must exist`).toBe(true);
      const src = fs.readFileSync(fullPath, "utf8");
      const lineCount = src.split("\n").length;
      expect(lineCount, `${file} exceeds 800-line ceiling (${lineCount})`).toBeLessThanOrEqual(800);
      if (file !== "streaming-export-budgeter.test.tsx") {
        expect(RAW_COLOR_REGEX.test(src), `${file} must not contain raw hex/rgb/hsl colors`).toBe(false);
        expect(STORAGE_TOKEN_REGEX.test(src), `${file} must not reference localStorage/sessionStorage`).toBe(false);
        expect(src.includes("transition-all"), `${file} must not contain transition-all`).toBe(false);
      }
    }
  });
});
