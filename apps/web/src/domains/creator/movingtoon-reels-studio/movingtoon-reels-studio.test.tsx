// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  ASPECT_SAFE_ZONE_PROFILES,
  autoFitElementToSafeZone,
  buildBpmBeatGrid,
  computeRectOverlapAreaPx2,
  DEFAULT_BGM_DUCKING_DB,
  DEFAULT_MOVINGTOON_SCENES,
  DEFAULT_REELS_AUDIO_SESSION,
  evaluateDuckingGainAtTime,
  evaluateLoudnessLimiterPreflight,
  evaluateParallaxFrame,
  evaluateParallaxSequence,
  formatSubRipTimecode,
  formatWebVttTimecode,
  generateBgmSidechainDuckingCurve,
  generateSubtitleTracks,
  MAX_TRUE_PEAK_DBTP,
  MOVINGTOON_CAMERA_PRESETS,
  PARALLAX_DEPTH_PLANES,
  snapTimelineEventsToBeatGrid,
  SRT_TIMECODE_LINE_RE,
  StudioMovingtoonReelsPanel,
  TARGET_INTEGRATED_LUFS,
  validateSubtitleTiming,
  WEBVTT_TIMECODE_LINE_RE,
  type MovingtoonCutScene,
  type SubtitleCueInput,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/movingtoon-reels-studio",
);

const ROOFTOP_SCENE: MovingtoonCutScene = DEFAULT_MOVINGTOON_SCENES[0] ?? {
  sceneId: "missing-rooftop", episodeCode: "EP.12", titleKo: "", titleEn: "",
  durationSec: 6, focalLengthPx: 920, depthSeparationPx: 145, layers: [],
};
const SAFE_MASTER_SCENE: MovingtoonCutScene = DEFAULT_MOVINGTOON_SCENES[1] ?? ROOFTOP_SCENE;

describe("Wave 40E: 실시간 무빙툰 릴스/쇼츠 2.5D 패럴랙스 · BPM 비트싱크 · BGM 덕킹 · 자막 익스포터", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. 웹툰 컷을 5개 깊이 평면(bg-sky~speech-balloon)으로 분리하고 유효한 3×3·4×4 변환 행렬을 계산한다", () => {
    const frame = evaluateParallaxFrame(ROOFTOP_SCENE, {
      presetId: "ken-burns-drift",
      frameIndex: 90,
      fps: 60,
      aspectTarget: "reels-9x16",
    });

    expect(frame.planes.map((p) => p.planeId)).toEqual([...PARALLAX_DEPTH_PLANES]);
    expect(frame.planes.map((p) => p.zIndex)).toEqual([1, 2, 3, 4, 5]);

    for (const plane of frame.planes) {
      expect(plane.matrix3x3).toHaveLength(9);
      expect(plane.matrix3x3.slice(6)).toEqual([0, 0, 1]);
      expect(plane.matrix3x3[2]).toBeCloseTo(plane.translateXpx, 2);
      expect(plane.matrix3x3[5]).toBeCloseTo(plane.translateYpx, 2);

      expect(plane.matrix4x4).toHaveLength(16);
      expect(plane.matrix4x4[12]).toBeCloseTo(plane.translateXpx, 2);
      expect(plane.matrix4x4[13]).toBeCloseTo(plane.translateYpx, 2);
      expect(plane.matrix4x4[14]).toBeCloseTo(plane.translateZpx, 2);
      expect(plane.matrix4x4[15]).toBe(1);
      expect(plane.cssTransform).toContain("translate3d(");
    }

    const bg = frame.planes.find((p) => p.planeId === "bg-sky");
    const fg = frame.planes.find((p) => p.planeId === "foreground-fx");
    expect(Math.abs(fg?.translateXpx ?? 0)).toBeGreaterThan(Math.abs(bg?.translateXpx ?? 0));
  });

  it("2. 5종 무빙툰 카메라 모션 프리셋이 모두 고유한 카메라 궤적과 패럴랙스 응답을 생성한다", () => {
    const signatures = new Set<string>();
    for (const presetId of MOVINGTOON_CAMERA_PRESETS) {
      const frame = evaluateParallaxFrame(SAFE_MASTER_SCENE, {
        presetId,
        frameIndex: 45,
        fps: 30,
        aspectTarget: "reels-9x16",
      });
      expect(frame.presetId).toBe(presetId);
      expect(frame.planes).toHaveLength(5);
      signatures.add(
        `${frame.camera.xPx}|${frame.camera.yPx}|${frame.camera.zPx}|${frame.camera.zoom}|${frame.camera.rollDeg}`,
      );
    }
    expect(signatures.size).toBe(5);
  });

  it("3. 돌리 줌 긴장감(dolly-zoom-tension)은 인물 배율을 1.0에 고정하면서 원경과 전경을 반대 방향으로 왜곡한다", () => {
    const climaxFrame = evaluateParallaxFrame(SAFE_MASTER_SCENE, {
      presetId: "dolly-zoom-tension",
      frameIndex: 359,
      fps: 60,
      aspectTarget: "reels-9x16",
    });

    const bg = climaxFrame.planes.find((p) => p.planeId === "bg-sky");
    const character = climaxFrame.planes.find((p) => p.planeId === "character");
    const fg = climaxFrame.planes.find((p) => p.planeId === "foreground-fx");

    expect(climaxFrame.camera.zPx).toBeLessThan(-100);
    expect(climaxFrame.camera.fovDeg).toBeLessThan(40);
    expect(character?.scale).toBeCloseTo(1.0, 3);
    expect(bg?.scale ?? 0).toBeGreaterThan(1.05);
    expect(fg?.scale ?? 2).toBeLessThan(1.0);
  });

  it("4. 액션 임팩트 셰이크(action-impact-shake)는 타격 직후 최대 진동 후 후반부로 갈수록 결정론적으로 감쇠한다", () => {
    const impactFrame = evaluateParallaxFrame(SAFE_MASTER_SCENE, {
      presetId: "action-impact-shake",
      frameIndex: 66, // ~18.3% (impact peak)
      fps: 60,
      aspectTarget: "reels-9x16",
    });
    const tailFrame = evaluateParallaxFrame(SAFE_MASTER_SCENE, {
      presetId: "action-impact-shake",
      frameIndex: 345,
      fps: 60,
      aspectTarget: "reels-9x16",
    });

    const impactMag = Math.hypot(impactFrame.camera.shakeOffsetXpx, impactFrame.camera.shakeOffsetYpx);
    const tailMag = Math.hypot(tailFrame.camera.shakeOffsetXpx, tailFrame.camera.shakeOffsetYpx);
    expect(impactMag).toBeGreaterThan(5);
    expect(tailMag).toBeLessThan(impactMag * 0.15);
  });

  it("5. evaluateParallaxFrame은 30/60fps에서 비트 단위 결정론을 보장하고 모션 축소(reducedMotion) 시 흔들림·롤을 0으로 억제한다", () => {
    const runA = evaluateParallaxFrame(ROOFTOP_SCENE, {
      presetId: "speedline-pulse",
      frameIndex: 120,
      fps: 60,
      aspectTarget: "reels-9x16",
    });
    const runB = evaluateParallaxFrame(ROOFTOP_SCENE, {
      presetId: "speedline-pulse",
      frameIndex: 120,
      fps: 60,
      aspectTarget: "reels-9x16",
    });
    expect(runA).toEqual(runB);
    expect(runA.totalFrames).toBe(360);
    expect(runA.timestampSec).toBe(2);

    const frame30 = evaluateParallaxFrame(ROOFTOP_SCENE, {
      presetId: "ken-burns-drift",
      frameIndex: 0,
      fps: 30,
      aspectTarget: "reels-9x16",
    });
    const frame60 = evaluateParallaxFrame(ROOFTOP_SCENE, {
      presetId: "ken-burns-drift",
      frameIndex: 0,
      fps: 60,
      aspectTarget: "reels-9x16",
    });
    expect(frame30.totalFrames).toBe(180);
    expect(frame60.totalFrames).toBe(360);
    expect(frame30.camera).toEqual(frame60.camera);

    const reduced = evaluateParallaxFrame(ROOFTOP_SCENE, {
      presetId: "action-impact-shake",
      frameIndex: 66,
      fps: 60,
      aspectTarget: "reels-9x16",
      reducedMotion: true,
    });
    expect(reduced.camera.rollDeg).toBe(0);
    expect(reduced.camera.shakeOffsetXpx).toBe(0);
    expect(reduced.camera.shakeOffsetYpx).toBe(0);
  });

  it("6. 9:16 릴스/쇼츠/틱톡 세이프존 검증은 우측 좋아요 레일과 하단 캡션 영역 침범을 정밀 탐지하고 보정 좌표를 산출한다", () => {
    const frame = evaluateParallaxFrame(ROOFTOP_SCENE, {
      presetId: "ken-burns-drift",
      frameIndex: 60,
      fps: 60,
      aspectTarget: "reels-9x16",
    });

    expect(frame.safeZone.passed).toBe(false);
    expect(frame.safeZone.status).toBe("critical");
    expect(frame.safeZone.totalOverlapAreaPx2).toBeGreaterThan(0);

    const kinds = frame.safeZone.issues.map((i) => i.hazardKind);
    expect(kinds).toContain("right-actions");
    expect(kinds).toContain("bottom-caption");

    const balloonIssue = frame.safeZone.issues.find((i) => i.planeId === "speech-balloon");
    expect(balloonIssue).toBeDefined();
    expect(balloonIssue?.recommendedNudgePx.dx).toBeLessThan(0);
    expect(balloonIssue?.recommendedNudgePx.dy).toBeLessThan(0);
  });

  it("7. autoFitElementToSafeZone은 9:16 릴스·틱톡·쇼츠 및 16:9 유튜브에서 0px² 무침범 보정을 보장한다", () => {
    for (const target of ["reels-9x16", "tiktok-9x16", "shorts-9x16", "youtube-16x9"] as const) {
      const profile = ASPECT_SAFE_ZONE_PROFILES[target];
      const collidingRect = {
        x: profile.widthPx * 0.72,
        y: profile.heightPx * 0.82,
        width: profile.widthPx * 0.34,
        height: profile.heightPx * 0.14,
      };
      const { fittedRect } = autoFitElementToSafeZone(collidingRect, target);

      for (const hazard of profile.hazards) {
        expect(computeRectOverlapAreaPx2(fittedRect, hazard.rect)).toBe(0);
      }
    }
  });

  it("8. 16:9 유튜브 세이프존 검증은 하단 플레이어 시크바와 우하단 채널 배지 침범을 감지하고 중앙 배치는 통과시킨다", () => {
    const ytCollisionScene: MovingtoonCutScene = {
      ...SAFE_MASTER_SCENE,
      sceneId: "yt-collision-test",
      layers: SAFE_MASTER_SCENE.layers.map((layer) =>
        layer.planeId === "speech-balloon"
          ? { ...layer, normalizedBounds: { x: 0.78, y: 0.84, width: 0.2, height: 0.14 }, safeAnchorLocked: true }
          : layer,
      ),
    };

    const badFrame = evaluateParallaxFrame(ytCollisionScene, {
      presetId: "ken-burns-drift",
      frameIndex: 30,
      fps: 30,
      aspectTarget: "youtube-16x9",
    });
    expect(badFrame.safeZone.passed).toBe(false);
    expect(badFrame.safeZone.issues.some((i) => i.hazardKind === "bottom-player-bar")).toBe(true);
    expect(badFrame.safeZone.issues.some((i) => i.hazardKind === "right-channel-badge")).toBe(true);

    const goodFrame = evaluateParallaxFrame(SAFE_MASTER_SCENE, {
      presetId: "ken-burns-drift",
      frameIndex: 30,
      fps: 30,
      aspectTarget: "youtube-16x9",
    });
    expect(goodFrame.safeZone.passed).toBe(true);
    expect(goodFrame.safeZone.totalOverlapAreaPx2).toBe(0);
  });

  it("9. evaluateParallaxSequence는 클립 전체 표본 프레임에서 최악 세이프존 침범과 안전 마스터 컷(0건)을 정확히 판별한다", () => {
    const hazardAudit = evaluateParallaxSequence(ROOFTOP_SCENE, {
      presetId: "vertical-pan-reveal",
      fps: 30,
      aspectTarget: "tiktok-9x16",
      sampleCount: 7,
    });
    expect(hazardAudit.sampledFrameCount).toBe(7);
    expect(hazardAudit.offendingFrameIndices.length).toBeGreaterThan(0);
    expect(hazardAudit.worstStatus).toBe("critical");

    const cleanAudit = evaluateParallaxSequence(SAFE_MASTER_SCENE, {
      presetId: "ken-burns-drift",
      fps: 30,
      aspectTarget: "reels-9x16",
      sampleCount: 7,
    });
    expect(cleanAudit.offendingFrameIndices).toHaveLength(0);
    expect(cleanAudit.worstStatus).toBe("pass");
    expect(cleanAudit.maxOverlapAreaPx2).toBe(0);
  });

  it("10. buildBpmBeatGrid는 4/4 · 3/4 · 6/8 박자표에 따라 정확한 비트·다운비트 간격을 생성한다", () => {
    const grid44 = buildBpmBeatGrid({ bpm: 120, durationSec: 8, timeSignature: "4/4" });
    expect(grid44.beatIntervalSec).toBe(0.5);
    expect(grid44.barIntervalSec).toBe(2.0);
    expect(grid44.downbeatTimesSec).toEqual([0, 2, 4, 6, 8]);

    const grid34 = buildBpmBeatGrid({ bpm: 120, durationSec: 6, timeSignature: "3/4" });
    expect(grid34.beatsPerBar).toBe(3);
    expect(grid34.barIntervalSec).toBe(1.5);
    expect(grid34.downbeatTimesSec).toEqual([0, 1.5, 3, 4.5, 6]);

    const grid68 = buildBpmBeatGrid({ bpm: 120, durationSec: 6, timeSignature: "6/8" });
    expect(grid68.beatsPerBar).toBe(6);
    expect(grid68.downbeatTimesSec).toEqual([0, 3, 6]);
  });

  it("11. snapTimelineEventsToBeatGrid는 드라마틱 컷 전환과 SFX 타점을 정확한 다운비트에 정렬하고 오차(ms)를 산출한다", () => {
    const report = snapTimelineEventsToBeatGrid(DEFAULT_REELS_AUDIO_SESSION.events, {
      bpm: 128,
      durationSec: 15,
      timeSignature: "4/4",
      mode: "downbeat",
    });

    expect(report.totalEventCount).toBe(4);
    expect(report.downbeatAlignedCount).toBe(4);
    for (const ev of report.snappedEvents) {
      expect(ev.isDownbeatAligned).toBe(true);
      expect(ev.targetBeatInBar).toBe(1);
      expect(report.grid.downbeatTimesSec).toContain(ev.snappedTimeSec);
      expect(Math.abs(ev.deltaMs)).toBeLessThanOrEqual(Math.round((report.grid.barIntervalSec * 1000) / 2) + 2);
    }

    // 128 BPM 4/4에서 마디 길이 = 1.875s -> 1.79s는 1.875s(Bar 2.1, +85ms)로 스냅되어야 한다
    expect(report.snappedEvents[0]?.snappedTimeSec).toBe(1.875);
    expect(report.snappedEvents[0]?.deltaMs).toBe(85);
    expect(report.syncTightnessScore).toBeGreaterThan(70);
  });

  it("12. generateBgmSidechainDuckingCurve는 대사·보이스오버·SFX 구간에 자동 -12dB 덕킹을 적용하고 근접 구간을 병합한다", () => {
    const curve = generateBgmSidechainDuckingCurve({
      durationSec: 15,
      triggers: DEFAULT_REELS_AUDIO_SESSION.duckingTriggers,
      bgmBaseGainDb: -6,
      duckingDepthDb: DEFAULT_BGM_DUCKING_DB,
      attackMs: 45,
      holdMs: 120,
      releaseMs: 260,
    });

    expect(curve.duckingDepthDb).toBe(-12);
    expect(curve.minGainOffsetDb).toBe(-12);
    expect(curve.duckedCoveragePct).toBeGreaterThan(40);

    // 1.9~3.4s 와 3.65~4.35s는 gap 250ms > hold(120)+attack(45)=165ms이므로 분리,
    // 100ms 이내 인접 트리거 병합 검증을 별도로 수행한다.
    const mergedTest = generateBgmSidechainDuckingCurve({
      durationSec: 10,
      triggers: [
        { id: "a", source: "dialogue", labelKo: "대사 A", labelEn: "Line A", startSec: 1.0, endSec: 2.0 },
        { id: "b", source: "sfx", labelKo: "효과음 B", labelEn: "SFX B", startSec: 2.1, endSec: 3.0 },
      ],
    });
    expect(mergedTest.mergedSpans).toHaveLength(1);
    expect(mergedTest.mergedSpans[0]?.triggerIds).toEqual(["a", "b"]);
  });

  it("13. evaluateDuckingGainAtTime은 대기(0dB)·어택 램프·유지(-12dB)·릴리즈 단계를 정확히 반환한다", () => {
    const curve = generateBgmSidechainDuckingCurve({
      durationSec: 10,
      bgmBaseGainDb: -6,
      duckingDepthDb: -12,
      attackMs: 100,
      holdMs: 100,
      releaseMs: 200,
      triggers: [{ id: "vo-1", source: "voiceover", labelKo: "내레이션", labelEn: "VO", startSec: 3.0, endSec: 5.0 }],
    });

    const idlePoint = evaluateDuckingGainAtTime(curve, 1.0);
    expect(idlePoint.phase).toBe("idle");
    expect(idlePoint.gainOffsetDb).toBe(0);
    expect(idlePoint.effectiveBgmDb).toBe(-6);

    const attackPoint = evaluateDuckingGainAtTime(curve, 2.95);
    expect(attackPoint.phase).toBe("attack");
    expect(attackPoint.gainOffsetDb).toBeLessThan(0);
    expect(attackPoint.gainOffsetDb).toBeGreaterThan(-12);

    const holdPoint = evaluateDuckingGainAtTime(curve, 4.0);
    expect(holdPoint.phase).toBe("hold");
    expect(holdPoint.gainOffsetDb).toBe(-12);
    expect(holdPoint.effectiveBgmDb).toBe(-18);
    expect(holdPoint.activeTriggerIds).toContain("vo-1");

    const releasePoint = evaluateDuckingGainAtTime(curve, 5.2);
    expect(releasePoint.phase).toBe("release");
    expect(releasePoint.gainOffsetDb).toBeLessThan(0);
    expect(releasePoint.gainOffsetDb).toBeGreaterThan(-12);

    const postPoint = evaluateDuckingGainAtTime(curve, 6.0);
    expect(postPoint.phase).toBe("idle");
    expect(postPoint.gainOffsetDb).toBe(0);
  });

  it("14. 통합 라우드니스(-14 LUFS) 및 True-Peak(-1.0 dBTP) 리미터 프리플라이트가 덕킹 반영 마스터 적합 상태를 산출한다", () => {
    const duckingCurve = generateBgmSidechainDuckingCurve({
      durationSec: DEFAULT_REELS_AUDIO_SESSION.durationSec,
      triggers: DEFAULT_REELS_AUDIO_SESSION.duckingTriggers,
    });
    const report = evaluateLoudnessLimiterPreflight({
      stems: DEFAULT_REELS_AUDIO_SESSION.stems,
      totalDurationSec: DEFAULT_REELS_AUDIO_SESSION.durationSec,
      duckingCurve,
      limiterEnabled: true,
    });

    expect(report.targetIntegratedLufs).toBe(TARGET_INTEGRATED_LUFS);
    expect(report.maxTruePeakDbtp).toBe(MAX_TRUE_PEAK_DBTP);
    expect(report.isLufsCompliant).toBe(true);
    expect(report.isTruePeakCompliant).toBe(true);
    expect(Math.abs(report.masteredIntegratedLufs - -14)).toBeLessThanOrEqual(1.0);
    expect(report.masteredTruePeakDbtp).toBeLessThanOrEqual(-1.0);
    expect(report.status).toBe("pass");

    const bgmStem = report.stemBreakdown.find((s) => s.role === "bgm");
    expect(bgmStem?.duckingAppliedDb).toBeLessThan(0);
  });

  it("15. 과도한 피크 입력에서 리미터 OFF 시 클리핑 위험(clip-risk)을 감지하고 ON 시 -1.0 dBTP 천장으로 제한한다", () => {
    const hotStems = [
      { stemId: "bgm", role: "bgm" as const, labelKo: "과입력 BGM", labelEn: "Hot BGM", rmsDbfs: -19, peakDbtp: -0.4, activeDurationSec: 10, gainDb: 0 },
      { stemId: "sfx", role: "sfx" as const, labelKo: "폭발 SFX", labelEn: "Blast SFX", rmsDbfs: -18, peakDbtp: -0.2, activeDurationSec: 4, gainDb: 0 },
    ];

    const unlimited = evaluateLoudnessLimiterPreflight({
      stems: hotStems,
      totalDurationSec: 10,
      limiterEnabled: false,
    });
    expect(unlimited.status).toBe("clip-risk");
    expect(unlimited.isTruePeakCompliant).toBe(false);
    expect(unlimited.masteredTruePeakDbtp).toBeGreaterThan(-1.0);
    expect(unlimited.requiredLimiterReductionDb).toBeGreaterThan(0);

    const limited = evaluateLoudnessLimiterPreflight({
      stems: hotStems,
      totalDurationSec: 10,
      limiterEnabled: true,
    });
    expect(limited.isTruePeakCompliant).toBe(true);
    expect(limited.masteredTruePeakDbtp).toBe(-1.0);
  });

  it("16. WebVTT(.vtt) 자막 생성기는 헤더·밀리초 올림 타임코드·9:16 세이프존 line 배치를 규격대로 출력한다", () => {
    expect(formatWebVttTimecode(59.9996)).toBe("00:01:00.000");
    expect(formatWebVttTimecode(3661.005)).toBe("01:01:01.005");
    expect(formatSubRipTimecode(59.9996)).toBe("00:01:00,000");

    const exported = generateSubtitleTracks(DEFAULT_REELS_AUDIO_SESSION.subtitleCuesKo, {
      title: "EP.12 릴스",
      safeZoneLinePct: 72,
      includeSpeakerLabel: true,
    });

    expect(exported.cueCount).toBe(4);
    expect(exported.vttTimecodeFormatValid).toBe(true);
    expect(exported.srtTimecodeFormatValid).toBe(true);
    expect(exported.validation.valid).toBe(true);
    expect(exported.vttContent.startsWith("WEBVTT - EP.12 릴스\n\n")).toBe(true);
    expect(exported.vttContent).toContain("00:00:01.900 --> 00:00:03.400 line:72% align:center");
    expect(exported.vttContent).toContain("[서준] 비 그치기 전에 끝낸다.");

    const vttTimeLines = exported.vttContent.split("\n").filter((line) => line.includes(" --> "));
    expect(vttTimeLines).toHaveLength(4);
    for (const line of vttTimeLines) expect(WEBVTT_TIMECODE_LINE_RE.test(line)).toBe(true);
  });

  it("17. SubRip(.srt) 생성기와 validateSubtitleTiming은 콤마 타임코드 규격과 겹침·역전·과속 읽기 오류를 검증한다", () => {
    const exported = generateSubtitleTracks(DEFAULT_REELS_AUDIO_SESSION.subtitleCuesEn);
    const srtTimeLines = exported.srtContent.split("\n").filter((line) => line.includes(" --> "));
    expect(srtTimeLines).toHaveLength(4);
    for (const line of srtTimeLines) expect(SRT_TIMECODE_LINE_RE.test(line)).toBe(true);
    expect(exported.srtContent).toContain("1\n00:00:01,900 --> 00:00:03,400");

    const brokenCues: SubtitleCueInput[] = [
      { id: "c1", startSec: 2.0, endSec: 1.5, text: "역전 구간" },
      { id: "c2", startSec: 3.0, endSec: 5.0, text: "정상 자막" },
      { id: "c3", startSec: 4.5, endSec: 5.5, text: "겹침 자막" },
      { id: "c4", startSec: 6.0, endSec: 6.4, text: "매우짧은시간에엄청나게많은글자를우겨넣은자막" },
      { id: "c5", startSec: 7.0, endSec: 8.0, text: "   " },
    ];
    const check = validateSubtitleTiming(brokenCues);
    expect(check.valid).toBe(false);
    const kinds = check.issues.map((issue) => issue.kind);
    expect(kinds).toContain("invalid-range");
    expect(kinds).toContain("overlap");
    expect(kinds).toContain("fast-reading-speed");
    expect(kinds).toContain("empty-text");
  });

  it("18. StudioMovingtoonReelsPanel은 Props 없이 단독 렌더링되고 탭 1 카메라 프리셋·FPS·화면비·프레임 스크러버가 동작한다", () => {
    const onParallax = vi.fn();
    render(<StudioMovingtoonReelsPanel onParallaxEvaluated={onParallax} />);

    expect(screen.getByTestId("movingtoon-reels-studio-panel")).toBeTruthy();
    expect(screen.getByTestId("tab-parallax-safezone").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("parallax-planes-list").children).toHaveLength(5);

    fireEvent.click(screen.getByTestId("preset-btn-action-impact-shake"));
    fireEvent.click(screen.getByTestId("fps-btn-30"));
    fireEvent.click(screen.getByTestId("aspect-btn-youtube-16x9"));
    fireEvent.change(screen.getByTestId("parallax-frame-slider"), { target: { value: "45" } });

    expect(screen.getByTestId("parallax-frame-readout").textContent).toContain("#45");
    expect(screen.getByTestId("parallax-frame-readout").textContent).toContain("30fps");
    expect(onParallax).toHaveBeenCalled();
  });

  it("19. 탭 1 세이프존 자동 보정 버튼 클릭 시 옥상 컷 말풍선 침범이 0px² 통과 상태로 전환된다", () => {
    const onParallax = vi.fn();
    render(<StudioMovingtoonReelsPanel onParallaxEvaluated={onParallax} />);

    expect(screen.getByTestId("safezone-status-badge").textContent).toContain("침범");
    expect(screen.getByTestId("safezone-issues-list")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-autofit-safezone"));

    expect(screen.getByTestId("safezone-status-badge").textContent).toContain("통과 (0px²)");
    expect(screen.getByTestId("safezone-clean-banner")).toBeTruthy();
    expect(onParallax).toHaveBeenCalledTimes(1);
    const lastCall = onParallax.mock.calls[0]?.[0];
    expect(lastCall?.safeZone.passed).toBe(true);
  });

  it("20. 탭 2 BPM·덕킹·리미터·VTT/SRT 출고 인터랙션, 영문 로케일 및 모듈 전체 정적 위생 규칙을 통과한다", () => {
    const onExport = vi.fn();
    render(<StudioMovingtoonReelsPanel initialTab="audio-subtitles" locale="en" onExportSubtitles={onExport} />);

    expect(screen.getByTestId("panel-audio-subtitles")).toBeTruthy();
    expect(screen.getByTestId("kpi-ducking-depth").textContent).toContain("-12.0 dB");
    expect(screen.getByTestId("kpi-true-peak-badge").textContent).toContain("Pass");

    fireEvent.click(screen.getByTestId("bpm-preset-145"));
    expect(screen.getByTestId("bpm-value-readout").textContent).toContain("145 BPM");

    fireEvent.change(screen.getByTestId("ducking-playhead-slider"), { target: { value: "8.2" } });
    expect(screen.getByTestId("ducking-playhead-readout").textContent).toContain("-12.0 dB");

    fireEvent.click(screen.getByTestId("subtitle-format-srt"));
    expect(screen.getByTestId("subtitle-preview-code").textContent).toContain("00:00:01,900 --> 00:00:03,400");

    fireEvent.click(screen.getByTestId("btn-export-subtitles"));
    expect(screen.getByTestId("subtitle-export-status").textContent).toContain("SubRip (.srt)");
    expect(onExport).toHaveBeenCalledTimes(1);

    // 모듈 전체 정적 위생·구조 규칙 검증
    const files = [
      "movingtoon-parallax-engine.ts",
      "reels-audio-beat-master.ts",
      "StudioMovingtoonReelsPanel.tsx",
      "index.ts",
      "movingtoon-reels-studio.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""));

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      expect(content.split("\n").length, `${file} 800줄 제한 위반`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} 0x...n BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} 비공개 Map store 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioMovingtoonReelsPanel.tsx"), "utf8");
    expect(rawColorRe.test(panelSrc), "UI 패널은 원시 hex/rgb/hsl 색상을 포함할 수 없다").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioMovingtoonReelsPanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
