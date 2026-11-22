import { describe, expect, it, vi } from "vitest";

import {
  buildShortformInputFromHistory,
  classifyHistoryStepStage,
  extractCutsFromHistoryPage,
} from "./timelapse-history-stage-adapter";
import {
  computeSafeCropRectPx,
  evaluateShortformFrameAt,
  exportShortformSubtitlesSrt,
  exportShortformSubtitlesWebVtt,
  normalizeProcessStageSnapshots,
  planLocalTimelapseShortform,
  renderShortformPreviewFrameToCanvas,
} from "./timelapse-shortform-planner";
import type { ManuscriptStageSnapshot, ShortformCutInput } from "./timelapse-stage-types";

import type { HistorySnapshot } from "../studio-history-labels";
import type { TimelapseStepInfo } from "../studio-timelapse";

const FIVE_STAGE_SNAPSHOTS: readonly ManuscriptStageSnapshot[] = [
  { id: "s-lettering", stage: "lettering", width: 800, height: 2400, capturedAtMs: 5000 },
  { id: "s-conti", stage: "conti", width: 800, height: 2400, capturedAtMs: 1000 },
  { id: "s-shading", stage: "shading", width: 800, height: 2400, capturedAtMs: 4000 },
  { id: "s-flat", stage: "flat-color", width: 800, height: 2400, capturedAtMs: 3000 },
  { id: "s-line", stage: "lineart", width: 800, height: 2400, capturedAtMs: 2000 },
];

const SAMPLE_CUTS: readonly ShortformCutInput[] = [
  {
    cutId: "cut-1",
    index: 0,
    bounds: { x: 40, y: 80, width: 720, height: 640 },
    focalPoint: { x: 420, y: 360 },
    captionText: "첫 장면 구도 잡기",
    dramaticWeight: 1.0,
  },
  {
    cutId: "cut-2",
    index: 1,
    bounds: { x: 40, y: 820, width: 720, height: 760 },
    focalPoint: { x: 380, y: 1180 },
    captionText: "클라이맥스 대치",
    dramaticWeight: 1.5,
  },
  {
    cutId: "cut-3",
    index: 2,
    bounds: { x: 40, y: 1680, width: 720, height: 640 },
    focalPoint: { x: 400, y: 1960 },
    captionText: "대사 임팩트 완성",
    dramaticWeight: 1.2,
  },
];

describe("timelapse-shortform-planner (₩0 로컬 타임랩스 & SNS 9:16·1:1 숏폼 플래너)", () => {
  it("뒤섞인 공정 스냅샷을 표준 순서(콘티→선화→밑색→명암→식자)로 정규화하고 중복을 최신본으로 정리한다", () => {
    const normalized = normalizeProcessStageSnapshots(
      [
        ...FIVE_STAGE_SNAPSHOTS,
        { id: "s-line-newer", stage: "lineart", width: 800, height: 2400, capturedAtMs: 2500 },
        { id: "s-disabled", stage: "conti", width: 800, height: 2400, capturedAtMs: 9999, available: false },
      ],
      800,
      2400,
    );

    expect(normalized.map((s) => s.stage)).toEqual([
      "conti",
      "lineart",
      "flat-color",
      "shading",
      "lettering",
    ]);
    expect(normalized.find((s) => s.stage === "lineart")?.id).toBe("s-line-newer");
    expect(normalized.find((s) => s.stage === "conti")?.id).toBe("s-conti");
  });

  it("9:16(1080×1920) 30fps와 60fps 플랜을 결정적으로 생성하고 로컬 비용 ₩0을 보장한다", () => {
    const plan30 = planLocalTimelapseShortform({
      title: "1화 예고",
      manuscriptWidth: 800,
      manuscriptHeight: 2400,
      stageSnapshots: FIVE_STAGE_SNAPSHOTS,
      cuts: SAMPLE_CUTS,
      aspectPreset: "9:16",
      platform: "youtube-shorts",
      fps: 30,
      targetDurationSec: 30,
    });
    const plan60 = planLocalTimelapseShortform({
      title: "1화 예고",
      manuscriptWidth: 800,
      manuscriptHeight: 2400,
      stageSnapshots: FIVE_STAGE_SNAPSHOTS,
      cuts: SAMPLE_CUTS,
      aspectPreset: "9:16",
      platform: "youtube-shorts",
      fps: 60,
      targetDurationSec: 30,
    });

    expect(plan30.width).toBe(1080);
    expect(plan30.height).toBe(1920);
    expect(plan30.fps).toBe(30);
    expect(plan30.totalFrames).toBe(900);
    expect(plan60.totalFrames).toBe(1800);
    expect(plan30.activeStages).toEqual(["conti", "lineart", "flat-color", "shading", "lettering"]);
    // 5단계 공정 + 마지막 완성 히어로 홀드 = 6세그먼트
    expect(plan30.segments).toHaveLength(6);
    expect(plan30.segments[5]?.isFinalShowcase).toBe(true);
    expect(plan30.encodingEstimate.localCostKrw).toBe(0);
    expect(plan60.encodingEstimate.videoBitsPerSecond).toBeGreaterThan(
      plan30.encodingEstimate.videoBitsPerSecond,
    );
    expect(plan60.encodingEstimate.estimatedVideoBytes).toBeGreaterThan(
      plan30.encodingEstimate.estimatedVideoBytes,
    );
    expect(plan30.encodingEstimate.withinDurationLimit).toBe(true);
    expect(plan30.encodingEstimate.withinFileSizeLimit).toBe(true);
  });

  it("1:1(1080×1080) 피드 플랜은 9:16 대비 더 작은 비트레이트와 1:1 안전 여백을 계산한다", () => {
    const plan9x16 = planLocalTimelapseShortform({
      title: "에피소드 홍보",
      manuscriptWidth: 1080,
      manuscriptHeight: 1920,
      stageSnapshots: FIVE_STAGE_SNAPSHOTS,
      aspectPreset: "9:16",
      fps: 30,
      targetDurationSec: 20,
    });
    const plan1x1 = planLocalTimelapseShortform({
      title: "에피소드 홍보",
      manuscriptWidth: 1080,
      manuscriptHeight: 1920,
      stageSnapshots: FIVE_STAGE_SNAPSHOTS,
      aspectPreset: "1:1",
      fps: 30,
      targetDurationSec: 20,
    });

    expect(plan1x1.width).toBe(1080);
    expect(plan1x1.height).toBe(1080);
    expect(plan1x1.platform.id).toBe("instagram-square");
    expect(plan1x1.encodingEstimate.estimatedVideoBytes).toBeLessThan(
      plan9x16.encodingEstimate.estimatedVideoBytes,
    );
    // 모든 키프레임 크롭 영역이 원고 경계를 벗어나지 않는다.
    for (const kf of plan1x1.keyframes) {
      expect(kf.cropRectPx.x).toBeGreaterThanOrEqual(0);
      expect(kf.cropRectPx.y).toBeGreaterThanOrEqual(0);
      expect(kf.cropRectPx.x + kf.cropRectPx.width).toBeLessThanOrEqual(1080.05);
      expect(kf.cropRectPx.y + kf.cropRectPx.height).toBeLessThanOrEqual(1920.05);
    }
  });

  it("공정 전환 디졸브 알파는 0→0.5→1로 단조 증가하고 reducedMotion 시 카메라 이동을 0으로 고정한다", () => {
    const plan = planLocalTimelapseShortform({
      title: "정적 접근성 테스트",
      manuscriptWidth: 800,
      manuscriptHeight: 2400,
      stageSnapshots: FIVE_STAGE_SNAPSHOTS,
      cuts: SAMPLE_CUTS,
      aspectPreset: "9:16",
      fps: 30,
      targetDurationSec: 25,
      dissolveDurationMs: 600,
      reducedMotion: true,
    });

    const lineartSeg = plan.segments[1];
    expect(lineartSeg?.fromStage).toBe("conti");
    expect(lineartSeg?.toStage).toBe("lineart");
    expect(lineartSeg?.cameraStart).toEqual(lineartSeg?.cameraEnd);

    const startFrame = evaluateShortformFrameAt(plan, lineartSeg?.dissolveStartMs ?? 0);
    const midMs = Math.round(((lineartSeg?.dissolveStartMs ?? 0) + (lineartSeg?.dissolveEndMs ?? 0)) / 2);
    const midFrame = evaluateShortformFrameAt(plan, midMs);
    const endFrame = evaluateShortformFrameAt(plan, lineartSeg?.dissolveEndMs ?? 0);

    expect(startFrame.dissolveAlpha).toBeCloseTo(0, 3);
    expect(midFrame.dissolveAlpha).toBeCloseTo(0.5, 2);
    expect(endFrame.dissolveAlpha).toBeCloseTo(1, 3);
  });

  it("안전 크롭 영역은 극단적 패닝·줌에서도 원고 경계 밖으로 이탈하지 않는다", () => {
    const crop = computeSafeCropRectPx(800, 1600, 1080, 1920, {
      centerX01: 0.99,
      centerY01: 0.99,
      zoom: 2.0,
    });
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeCloseTo(800, 1);
    expect(crop.y + crop.height).toBeCloseTo(1600, 1);
  });

  it("자막 큐를 안전 여백 검증 상태로 생성하고 WebVTT·SRT 포맷으로 직렬화한다", () => {
    const plan = planLocalTimelapseShortform({
      title: "회차 07",
      manuscriptWidth: 800,
      manuscriptHeight: 2400,
      stageSnapshots: FIVE_STAGE_SNAPSHOTS,
      cuts: SAMPLE_CUTS,
      aspectPreset: "9:16",
      platform: "instagram-reels",
      fps: 30,
      targetDurationSec: 30,
    });

    expect(plan.subtitleCues.length).toBe(plan.segments.length);
    expect(plan.subtitleCues.every((cue) => cue.safeZoneVerified)).toBe(true);
    expect(plan.subtitleCues[0]?.text).toContain("첫 장면 구도 잡기");

    const vtt = exportShortformSubtitlesWebVtt(plan.subtitleCues);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("-->");
    expect(vtt).toContain("회차 07 · 완성본 공개");

    const srt = exportShortformSubtitlesSrt(plan.subtitleCues);
    expect(srt).toMatch(/00:00:00,000 --> /u);
  });

  it("코덱 효율(AV1 < VP9 < H264)과 플랫폼 길이 초과 경고를 정확히 보고한다", () => {
    const common = {
      title: "코덱 비교",
      manuscriptWidth: 1080,
      manuscriptHeight: 1920,
      stageSnapshots: FIVE_STAGE_SNAPSHOTS,
      aspectPreset: "9:16" as const,
      platform: "youtube-shorts" as const,
      fps: 30 as const,
      targetDurationSec: 75,
    };
    const av1 = planLocalTimelapseShortform({ ...common, codec: "av1" });
    const vp9 = planLocalTimelapseShortform({ ...common, codec: "vp9" });
    const h264 = planLocalTimelapseShortform({ ...common, codec: "h264" });

    expect(av1.encodingEstimate.estimatedVideoBytes).toBeLessThan(
      vp9.encodingEstimate.estimatedVideoBytes,
    );
    expect(vp9.encodingEstimate.estimatedVideoBytes).toBeLessThan(
      h264.encodingEstimate.estimatedVideoBytes,
    );
    expect(vp9.encodingEstimate.withinDurationLimit).toBe(false);
    expect(vp9.encodingEstimate.warnings.some((w) => w.includes("권장 최대 길이"))).toBe(true);
  });

  it("Canvas2D 프리뷰 합성기가 공정 크로스디졸브와 자막 바를 로컬에서 정확히 렌더링한다", () => {
    const plan = planLocalTimelapseShortform({
      title: "합성 테스트",
      manuscriptWidth: 800,
      manuscriptHeight: 1600,
      stageSnapshots: FIVE_STAGE_SNAPSHOTS,
      aspectPreset: "9:16",
      fps: 30,
      targetDurationSec: 20,
      dissolveDurationMs: 600,
    });

    const lineartSeg = plan.segments[1];
    const midMs = Math.round(((lineartSeg?.dissolveStartMs ?? 0) + (lineartSeg?.dissolveEndMs ?? 0)) / 2);

    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const fillText = vi.fn();
    const save = vi.fn();
    const restore = vi.fn();
    const mockCtx = {
      save,
      restore,
      fillRect,
      drawImage,
      fillText,
      globalAlpha: 1,
      fillStyle: "",
      font: "",
      textAlign: "left",
      textBaseline: "alphabetic",
    } as unknown as CanvasRenderingContext2D;

    const fakeImg = {} as CanvasImageSource;
    const frame = renderShortformPreviewFrameToCanvas(mockCtx, plan, midMs, {
      conti: { source: fakeImg, width: 800, height: 1600 },
      lineart: { source: fakeImg, width: 800, height: 1600 },
    });

    expect(frame.fromStage).toBe("conti");
    expect(frame.toStage).toBe("lineart");
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(fillText).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});

describe("timelapse-history-stage-adapter (Studio 히스토리 → 5공정·컷 변환)", () => {
  it("한글 라벨 키워드와 진행 비율로 5단계 공정을 분류한다", () => {
    expect(classifyHistoryStepStage("컷 프레임 추가", 0, 5)).toBe("conti");
    expect(classifyHistoryStepStage("펜 스트로크 그리기", 1, 5)).toBe("lineart");
    expect(classifyHistoryStepStage("배경 밑색 채우기", 2, 5)).toBe("flat-color");
    expect(classifyHistoryStepStage("명암 보정 적용", 3, 5)).toBe("shading");
    expect(classifyHistoryStepStage("말풍선 대사 추가", 4, 5)).toBe("lettering");
  });

  it("HistorySnapshot 페이지에서 프레임 컷과 대사 후크 및 5공정 스냅샷을 추출한다", () => {
    const history: HistorySnapshot[] = [
      [
        {
          id: "page-1",
          canvasH: 2200,
          elements: [
            { id: "cut-a", type: "frame", x: 32, y: 60, width: 736, height: 840 },
            { id: "cut-b", type: "frame", x: 32, y: 980, width: 736, height: 960 },
            { id: "bub-1", type: "bubble", x: 180, y: 180, text: "지금 출발해야 해!" },
          ],
        },
      ],
    ];
    const steps: TimelapseStepInfo[] = [
      { historyIndex: 0, label: "콘티 초안", elementCount: 1 },
      { historyIndex: 1, label: "선화 펜터치", elementCount: 2 },
      { historyIndex: 2, label: "말풍선 대사 추가", elementCount: 3 },
    ];

    const cuts = extractCutsFromHistoryPage(history[0]?.[0], 800, 2200);
    expect(cuts).toHaveLength(2);
    expect(cuts[0]?.cutId).toBe("cut-a");
    expect(cuts[0]?.captionText).toBe("지금 출발해야 해!");

    const plannerInput = buildShortformInputFromHistory({
      title: "3화",
      history,
      steps,
      pageId: "page-1",
      aspectPreset: "9:16",
      fps: 60,
      targetDurationSec: 30,
    });
    expect(plannerInput.stageSnapshots).toHaveLength(5);
    expect(plannerInput.cuts).toHaveLength(2);
    expect(plannerInput.manuscriptHeight).toBe(2200);
  });
});
