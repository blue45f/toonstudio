// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BUILTIN_STORYBOARD_PRESETS,
  DEFAULT_PARALLAX_SPEEDS,
  MAX_RECOMMENDED_BPM,
  MIN_RECOMMENDED_BPM,
  StudioCutRhythmPromoDirectorPanel,
  analyzeWebtoonCutRhythm,
  buildRemotionPromoManifest,
  createAudioCueIndex,
  createPresetEntriesIndex,
  directWebtoonPromo,
  evaluateCubicBezier,
  evaluateParallaxCameraAtFrame,
  generateAudioCueSheet,
  generateParallaxCameraKeyframes,
  renderParallaxStageCanvas,
  serializeRemotionPromoManifest,
  type WebtoonCutInput,
} from "./index";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const FORBIDDEN_STORAGE_REGEX = /\blocalStorage\b|\bsessionStorage\b/;
const FORBIDDEN_TRANSITION_ALL_REGEX = /\btransition-all\b/;
const FORBIDDEN_SPARKLES_REGEX = /\bSparkles\b/;
const FORBIDDEN_PRIVATE_STORE_MAP_REGEX =
  /\bprivate\s+(?:readonly\s+)?store\b|\bstore\s*=\s*new\s+Map\b/;

function readModuleSourceFiles(): readonly { readonly file: string; readonly text: string }[] {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(ts|tsx|css)$/u.test(name) && !name.includes(".test."))
    .map((file) => ({
      file,
      text: fs.readFileSync(path.join(dir, file), "utf8"),
    }));
}

describe("cut-rhythm-promo-director: 웹툰 컷 리듬 -> 2.5D 무빙툰 & 15초/30초 프로모 자동 연출기", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("내장 프리셋 3종과 모든 길이(15s/30s)·FPS(30/60) 조합에서 0프레임 오차와 BPM 범위를 보장한다", () => {
    const presetEntries = createPresetEntriesIndex(BUILTIN_STORYBOARD_PRESETS);
    expect(presetEntries.size).toBe(3);

    const durations = [15, 30] as const;
    const framerates = [30, 60] as const;

    for (const preset of BUILTIN_STORYBOARD_PRESETS) {
      for (const targetDurationSec of durations) {
        for (const fps of framerates) {
          const report = analyzeWebtoonCutRhythm(preset.cuts, { targetDurationSec, fps });
          const expectedTotal = targetDurationSec * fps;
          const sumCutFrames = report.cuts.reduce((sum, cut) => sum + cut.durationFrames, 0);

          expect(report.totalFrames).toBe(expectedTotal);
          expect(report.allocatedFrames).toBe(expectedTotal);
          expect(sumCutFrames).toBe(expectedTotal);
          expect(report.frameDrift).toBe(0);
          expect(report.recommendedBpm).toBeGreaterThanOrEqual(MIN_RECOMMENDED_BPM);
          expect(report.recommendedBpm).toBeLessThanOrEqual(MAX_RECOMMENDED_BPM);

          // 컷 시작/종료 프레임이 끊김 없이 연속적으로 이어져야 한다.
          expect(report.cuts[0]?.startFrame).toBe(0);
          expect(report.cuts[report.cuts.length - 1]?.endFrame).toBe(expectedTotal);
          for (let i = 1; i < report.cuts.length; i += 1) {
            expect(report.cuts[i]?.startFrame).toBe(report.cuts[i - 1]?.endFrame);
            expect(report.cuts[i]?.durationFrames).toBeGreaterThan(0);
          }
        }
      }
    }

    const actionPreset = presetEntries.get("action-awakening-15s");
    const romancePreset = presetEntries.get("romance-first-meet-15s");
    expect(actionPreset).toBeDefined();
    expect(romancePreset).toBeDefined();

    const actionReport = analyzeWebtoonCutRhythm(actionPreset?.cuts ?? []);
    const romanceReport = analyzeWebtoonCutRhythm(romancePreset?.cuts ?? []);
    expect(actionReport.recommendedBpm).toBeGreaterThan(romanceReport.recommendedBpm);
    expect(actionReport.cuts.map((c) => c.beat)).toContain("hook");
    expect(actionReport.cuts.map((c) => c.beat)).toContain("setup");
    expect(actionReport.cuts.map((c) => c.beat)).toContain("tension-rise");
    expect(actionReport.cuts.map((c) => c.beat)).toContain("climax-drop");
    expect(actionReport.cuts.map((c) => c.beat)).toContain("cliffhanger");
  });

  it("말풍선 텍스트 밀도와 여백 비율 증가가 읽기 가중치에 반영되고 1~3컷 경계 입력에서도 0오차를 유지한다", () => {
    expect(() => analyzeWebtoonCutRhythm([])).toThrow(/최소 1개/);

    const baseCut: WebtoonCutInput = BUILTIN_STORYBOARD_PRESETS[0]?.cuts[0] as WebtoonCutInput;
    const denseCut: WebtoonCutInput = {
      ...baseCut,
      id: "dense-cut",
      order: 2,
      balloonTexts: [
        "이 봉인이 풀리는 순간 도시 전체의 결계가 무너지고 말 거야.",
        "지금 당장 옥상으로 돌아가야 해!",
      ],
      gutterWhitespaceRatio: 0.78,
    };

    const twoCutReport = analyzeWebtoonCutRhythm([baseCut, denseCut], {
      targetDurationSec: 15,
      fps: 30,
    });
    expect(twoCutReport.frameDrift).toBe(0);
    expect(twoCutReport.cuts[1]?.readingWeight).toBeGreaterThan(
      twoCutReport.cuts[0]?.readingWeight ?? 0,
    );
    expect(twoCutReport.cuts[1]?.durationFrames).toBeGreaterThan(
      twoCutReport.cuts[0]?.durationFrames ?? 0,
    );

    const singleReport = analyzeWebtoonCutRhythm([baseCut], { targetDurationSec: 15, fps: 30 });
    expect(singleReport.frameDrift).toBe(0);
    expect(singleReport.cuts[0]?.durationFrames).toBe(450);
    expect(singleReport.cuts[0]?.beat).toBe("climax-drop");

    const threeReport = analyzeWebtoonCutRhythm(
      BUILTIN_STORYBOARD_PRESETS[0]?.cuts.slice(0, 3) ?? [],
      { targetDurationSec: 30, fps: 60 },
    );
    expect(threeReport.frameDrift).toBe(0);
    expect(threeReport.totalFrames).toBe(1800);
    expect(threeReport.cuts.map((c) => c.beat)).toEqual(["hook", "climax-drop", "cliffhanger"]);
  });

  it("2.5D 다중 평면 패럴랙스 키프레임(BG 0.25 · MG 0.65 · FG 1.15)과 비트별 카메라 연출·미세 쉐이크를 검증한다", () => {
    expect(evaluateCubicBezier(0, [0.16, 1, 0.3, 1])).toBe(0);
    expect(evaluateCubicBezier(1, [0.16, 1, 0.3, 1])).toBe(1);
    expect(evaluateCubicBezier(0.3, [0.16, 1, 0.3, 1])).toBeGreaterThan(0.5);

    const actionPreset = BUILTIN_STORYBOARD_PRESETS[0]!;
    const rhythm = analyzeWebtoonCutRhythm(actionPreset.cuts, { targetDurationSec: 15, fps: 30 });
    const tracks = generateParallaxCameraKeyframes(rhythm, { aspectPreset: "9:16" });

    expect(tracks).toHaveLength(rhythm.cuts.length);
    for (const track of tracks) {
      expect(track.layerSpeeds).toEqual(DEFAULT_PARALLAX_SPEEDS);
      expect(track.keyframes.map((k) => k.phase)).toEqual(["start", "mid", "end"]);
    }

    const tensionTrack = tracks.find((t) => t.beat === "tension-rise");
    const climaxTrack = tracks.find((t) => t.beat === "climax-drop");
    const cliffTrack = tracks.find((t) => t.beat === "cliffhanger");
    expect(tensionTrack).toBeDefined();
    expect(climaxTrack).toBeDefined();
    expect(cliffTrack).toBeDefined();

    // tension-rise: 점진적 달리인(zoom 증가)
    expect(tensionTrack!.keyframes[2].zoom).toBeGreaterThan(tensionTrack!.keyframes[0].zoom);
    // climax-drop: 빠른 스냅 줌 + 미세 쉐이크 활성
    expect(climaxTrack!.keyframes[1].zoom).toBeGreaterThan(climaxTrack!.keyframes[0].zoom);
    expect(climaxTrack!.keyframes[1].localProgress).toBeLessThanOrEqual(0.35);
    expect(climaxTrack!.keyframes[1].microShakeAmp).toBeGreaterThan(0);
    // cliffhanger: 슬로우 리빌 풀백
    expect(cliffTrack!.keyframes[0].zoom).toBeGreaterThan(cliffTrack!.keyframes[2].zoom);

    const climaxMidFrame = climaxTrack!.keyframes[1].frame;
    const poseNormal = evaluateParallaxCameraAtFrame(tracks, climaxMidFrame, {
      reducedMotion: false,
    });
    const poseReduced = evaluateParallaxCameraAtFrame(tracks, climaxMidFrame, {
      reducedMotion: true,
    });
    expect(poseReduced.shakeOffsetX).toBe(0);
    expect(poseReduced.shakeOffsetY).toBe(0);
    expect(Math.abs(poseNormal.shakeOffsetX) + Math.abs(poseNormal.shakeOffsetY)).toBeGreaterThan(
      0,
    );

    // 차등 패럴랙스 속도 비례 검증 (|FG| > |MG| > |BG|)
    const hookTrack = tracks[0]!;
    const hookEndPose = evaluateParallaxCameraAtFrame(tracks, hookTrack.endFrame - 1, {
      reducedMotion: true,
    });
    expect(Math.abs(hookEndPose.fgOffset.x)).toBeGreaterThan(Math.abs(hookEndPose.mgOffset.x));
    expect(Math.abs(hookEndPose.mgOffset.x)).toBeGreaterThan(Math.abs(hookEndPose.bgOffset.x));
  });

  it("BGM 에너지 전환(intro/build/drop/sting)과 SFX 마커 자동 배치 및 Remotion 9:16/16:9 JSON 결정론성을 검증한다", () => {
    const thriller = BUILTIN_STORYBOARD_PRESETS[2]!;
    const plan9x16 = directWebtoonPromo(thriller.cuts, {
      targetDurationSec: 30,
      fps: 30,
      aspectPreset: "9:16",
      presetId: thriller.id,
      seriesTitle: thriller.seriesTitle,
      episodeTitle: thriller.episodeTitle,
    });
    const planRepeat = directWebtoonPromo(thriller.cuts, {
      targetDurationSec: 30,
      fps: 30,
      aspectPreset: "9:16",
      presetId: thriller.id,
      seriesTitle: thriller.seriesTitle,
      episodeTitle: thriller.episodeTitle,
    });

    // 결정론성: 동일 입력 -> 완전히 동일한 JSON 출력
    expect(serializeRemotionPromoManifest(plan9x16.manifest)).toBe(
      serializeRemotionPromoManifest(planRepeat.manifest),
    );

    // BGM 4구간 순서 및 클라이맥스 드롭 정렬 검증
    const bgmSections = plan9x16.audioCueSheet.bgmTransitions.map((b) => b.section);
    expect(bgmSections).toEqual(["intro", "build", "drop", "sting"]);
    for (let i = 1; i < plan9x16.audioCueSheet.bgmTransitions.length; i += 1) {
      expect(plan9x16.audioCueSheet.bgmTransitions[i]!.frame).toBeGreaterThan(
        plan9x16.audioCueSheet.bgmTransitions[i - 1]!.frame,
      );
    }

    const cueLookup = createAudioCueIndex(plan9x16.audioCueSheet);
    const dropCue = cueLookup.bgmBySection.get("drop");
    expect(dropCue).toBeDefined();
    expect(Math.abs((dropCue?.frame ?? 0) - plan9x16.rhythm.climaxFrame)).toBeLessThanOrEqual(4);

    // SFX 정렬 및 클라이맥스 impact-hit 포함 검증
    const sfxKinds = new Set(plan9x16.audioCueSheet.sfxMarkers.map((s) => s.kind));
    expect(sfxKinds.has("impact-hit")).toBe(true);
    expect(sfxKinds.has("whoosh")).toBe(true);
    expect(sfxKinds.has("heartbeat")).toBe(true);
    expect(sfxKinds.has("page-turn")).toBe(true);
    expect(sfxKinds.has("spark-chime")).toBe(true);
    for (let i = 1; i < plan9x16.audioCueSheet.sfxMarkers.length; i += 1) {
      expect(plan9x16.audioCueSheet.sfxMarkers[i]!.frame).toBeGreaterThanOrEqual(
        plan9x16.audioCueSheet.sfxMarkers[i - 1]!.frame,
      );
    }

    // Remotion 9:16 및 16:9 스펙 검증
    expect(plan9x16.manifest.width).toBe(1080);
    expect(plan9x16.manifest.height).toBe(1920);
    expect(plan9x16.manifest.durationInFrames).toBe(900);
    expect(plan9x16.manifest.frameDrift).toBe(0);
    expect(plan9x16.manifest.compositionId).toMatch(/^[A-Za-z0-9-]+$/u);
    expect(plan9x16.manifest.sequences[0]?.caption.safeZoneBottomPx).toBe(320);

    const parsedRoundTrip = JSON.parse(serializeRemotionPromoManifest(plan9x16.manifest));
    expect(parsedRoundTrip).toEqual(plan9x16.manifest);

    const manifest16x9 = buildRemotionPromoManifest(
      plan9x16.rhythm,
      plan9x16.parallaxTracks,
      generateAudioCueSheet(plan9x16.rhythm),
      { aspectPreset: "16:9", presetId: thriller.id },
    );
    expect(manifest16x9.width).toBe(1920);
    expect(manifest16x9.height).toBe(1080);
    expect(manifest16x9.sequences[0]?.caption.safeZoneBottomPx).toBe(140);
  });

  it("renderParallaxStageCanvas가 getComputedStyle 시맨틱 토큰으로 2.5D 다중 평면을 안전하게 렌더링한다", () => {
    const plan = directWebtoonPromo(BUILTIN_STORYBOARD_PRESETS[0]!.cuts);
    const canvas = document.createElement("canvas");
    canvas.width = 270;
    canvas.height = 480;

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      fillText: vi.fn(),
      globalAlpha: 1,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textBaseline: "alphabetic",
    };

    vi.spyOn(canvas, "getContext").mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
    const pose = evaluateParallaxCameraAtFrame(plan.parallaxTracks, plan.rhythm.climaxFrame);
    const cut = plan.rhythm.cuts.find((c) => c.id === pose.cutId)!;

    renderParallaxStageCanvas({
      canvas,
      cut,
      pose,
      aspectPreset: "9:16",
      activeSfx: plan.audioCueSheet.sfxMarkers.slice(0, 1),
      beatLabelKo: "클라이맥스 드롭",
    });

    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 270, 480);
    expect(mockCtx.translate).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  it("StudioCutRhythmPromoDirectorPanel이 props 없이 렌더되고 프리셋·길이·화면비·스크러버·Remotion JSON 탭을 제어한다", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<StudioCutRhythmPromoDirectorPanel />);

    expect(screen.getByText("컷 리듬 · 2.5D 무빙툰 프로모 자동 연출기")).toBeTruthy();
    expect(screen.getByText("450f · 오차 0f")).toBeTruthy();
    expect(screen.getByText("1080×1920 · 30fps")).toBeTruthy();
    expect(screen.getByLabelText("2.5D 패럴랙스 프리뷰 캔버스 (9:16)")).toBeTruthy();

    // 스릴러 30초 프리셋으로 전환 -> 900f · 7컷
    fireEvent.click(screen.getByRole("button", { name: "스릴러 반전 예고 7컷 (30초)" }));
    expect(screen.getByText("900f · 오차 0f")).toBeTruthy();
    expect(screen.getByText("컷별 서사 비트 타임라인 (7컷)")).toBeTruthy();

    // 16:9 및 60fps 전환 -> 1920×1080 · 60fps, 1800f
    fireEvent.click(screen.getByRole("button", { name: "16:9" }));
    fireEvent.click(screen.getByRole("button", { name: "60fps" }));
    expect(screen.getByText("1800f · 오차 0f")).toBeTruthy();
    expect(screen.getByText("1920×1080 · 60fps")).toBeTruthy();

    // 프레임 스크러버 이동 및 재생 토글
    const scrubber = screen.getByLabelText("프리뷰 프레임 스크러버") as HTMLInputElement;
    fireEvent.change(scrubber, { target: { value: "420" } });
    expect(scrubber.value).toBe("420");

    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    expect(screen.getByRole("button", { name: "일시정지" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));

    // 컷 액션 강도 조절 후 초기화 버튼 노출 확인
    const actionSlider = screen.getByLabelText("선택 컷 액션 강도") as HTMLInputElement;
    fireEvent.change(actionSlider, { target: { value: "0.95" } });
    expect(screen.getByRole("button", { name: "컷 수치 초기화" })).toBeTruthy();

    // Remotion JSON 탭에서 직렬화된 매니페스트 확인
    fireEvent.click(screen.getByRole("tab", { name: "Remotion JSON" }));
    const manifestPre = screen.getByTestId("remotion-manifest-json");
    const parsedManifest = JSON.parse(manifestPre.textContent ?? "{}");
    expect(parsedManifest.schemaVersion).toBe("toonstudio.remotion-promo.v1");
    expect(parsedManifest.width).toBe(1920);
    expect(parsedManifest.height).toBe(1080);
    expect(parsedManifest.durationInFrames).toBe(1800);
    expect(parsedManifest.frameDrift).toBe(0);
  });

  it("모듈 소스 위생 규칙(원시 색상·transition-all·Sparkles·스토리지·store Map 금지 및 800줄 이하)을 전수 준수한다", () => {
    const sources = readModuleSourceFiles();
    expect(sources.length).toBeGreaterThanOrEqual(5);

    for (const { file, text } of sources) {
      const lineCount = text.split(/\r?\n/u).length;
      expect(lineCount, `${file} 줄 수 초과`).toBeLessThanOrEqual(800);
      expect(text, `${file} 원시 색상 포함`).not.toMatch(RAW_COLOR_REGEX);
      expect(text, `${file} 브라우저 스토리지 포함`).not.toMatch(FORBIDDEN_STORAGE_REGEX);
      expect(text, `${file} transition-all 포함`).not.toMatch(FORBIDDEN_TRANSITION_ALL_REGEX);
      expect(text, `${file} Sparkles 아이콘 포함`).not.toMatch(FORBIDDEN_SPARKLES_REGEX);
      expect(text, `${file} 금지된 store Map 포함`).not.toMatch(FORBIDDEN_PRIVATE_STORE_MAP_REGEX);
    }
  });
});
