import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYER_DEPTH_Z_METERS,
  SHORTFORM_PLATFORM_SPECS,
  SHORTFORM_VIEWPORT_PRESETS,
  buildShortformExportManifest,
  compileMotionToonAnimaticTimeline,
  computeOverscanSafeCropEnvelope,
  estimateBlockOpticalFlow,
  evaluateParallax25dFrameTransforms,
  interpolateMotionToonFrameRgba,
  measureLayerBlackBorderExposurePx,
  planKeyframeTo60fpsInterpolationSchedule,
  resolveShortformViewport,
  sampleAnimaticTimelineAtTimeMs,
  sampleCameraChoreographyPose,
  upsampleKeyframeSequenceTo60fps,
  type AnimaticCutScriptInput,
  type CameraChoreographyMode,
  type Parallax25dLayerSpec,
  type RgbaImageFrame,
  type ShortformAspectPreset,
} from "./index";

const SAMPLE_LAYERS_25D: readonly Parallax25dLayerSpec[] = [
  { depthZ: DEFAULT_LAYER_DEPTH_Z_METERS.backdrop, fullBleed: true, id: "layer-bg", name: "노을 하늘 원경", role: "backdrop", zOrder: 10 },
  { depthZ: DEFAULT_LAYER_DEPTH_Z_METERS.midground, fullBleed: true, id: "layer-mid", name: "골목 건물 중경", role: "midground", zOrder: 20 },
  { depthZ: DEFAULT_LAYER_DEPTH_Z_METERS.character, fullBleed: false, id: "layer-char", name: "주인공 캐릭터", role: "character", zOrder: 30 },
  { depthZ: DEFAULT_LAYER_DEPTH_Z_METERS["foreground-fx"], fullBleed: false, id: "layer-fg", name: "전경 벚꽃 잎 이펙트", role: "foreground-fx", zOrder: 40 },
  { depthZ: DEFAULT_LAYER_DEPTH_Z_METERS["speech-balloon"], id: "layer-balloon", lockToViewportFrame: true, name: "대사 말풍선", role: "speech-balloon", zOrder: 50 },
];

const ALL_CAMERA_MODES: readonly CameraChoreographyMode[] = [
  "dolly-in", "ken-burns-pan", "dramatic-rack-focus", "whip-reveal", "breath-idle",
];
const ALL_ASPECT_PRESETS: readonly ShortformAspectPreset[] = ["9:16", "16:9", "1:1"];

const SAMPLE_CUTS: readonly AnimaticCutScriptInput[] = [
  {
    cutId: "cut-01",
    dialogues: [{ balloonId: "b-1", revealStyle: "pop-then-type", speakerId: "hero", text: "지금이 마지막 기회야!" }],
    emotionIntensity: 0.55,
    emotionTag: "tension",
    secondaryMotionElements: [{ elementId: "hero-hair", kind: "hair" }, { elementId: "hero-cape", kind: "cape" }],
    sfxCues: [{ impactStrength: 0.45, relativeBeatOffset: 1, sfxId: "sfx-wind", text: "휘이잉-" }],
    title: "긴장 대치",
  },
  {
    cutId: "cut-02",
    dialogues: [
      { balloonId: "b-2", revealStyle: "pop-then-type", speakerId: "rival", text: "막을 수 있을까?" },
      { balloonId: "b-3", revealStyle: "typewriter", speakerId: "hero", text: "당연하지!" },
    ],
    emotionIntensity: 0.92,
    emotionTag: "climax",
    secondaryMotionElements: [{ elementId: "cloak-ribbon", kind: "ribbon" }],
    sfxCues: [{ impactStrength: 0.95, relativeBeatOffset: 1, sfxId: "sfx-boom", text: "쿠구궁!" }],
    title: "절정 충돌",
  },
  {
    cutId: "cut-03",
    dialogues: [{ balloonId: "b-4", revealStyle: "pop-in", speakerId: "hero", text: "끝났다." }],
    emotionIntensity: 0.25,
    emotionTag: "calm",
    title: "여운 엔딩",
  },
];

function createSyntheticMovingSpriteFrame(
  width: number, height: number, spriteX: number, spriteY: number, spriteSize: number,
  options: { readonly texturedBackground?: boolean } = {},
): RgbaImageFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const stripe = options.texturedBackground ? ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) * 34 : 0;
      data[idx] = (options.texturedBackground ? 22 : 16) + stripe;
      data[idx + 1] = (options.texturedBackground ? 28 : 18) + stripe;
      data[idx + 2] = (options.texturedBackground ? 44 : 24) + stripe;
      data[idx + 3] = 255;
    }
  }
  for (let y = spriteY; y < spriteY + spriteSize; y += 1) {
    if (y < 0 || y >= height) continue;
    for (let x = spriteX; x < spriteX + spriteSize; x += 1) {
      if (x < 0 || x >= width) continue;
      const lx = x - spriteX;
      const ly = y - spriteY;
      const idx = (y * width + x) * 4;
      const isBorder = lx === 0 || ly === 0 || lx === spriteSize - 1 || ly === spriteSize - 1;
      data[idx] = isBorder ? 255 : 220 + Math.min(35, lx * 2);
      data[idx + 1] = isBorder ? 210 : 120 + Math.min(120, ly * 7);
      data[idx + 2] = isBorder ? 90 : 70 + Math.min(140, (lx + ly) * 4);
      data[idx + 3] = 255;
    }
  }
  return { data, height, width };
}

function measureBrightObjectCentroid(
  frame: RgbaImageFrame, thresholdLuma = 100,
): { readonly count: number; readonly cx: number; readonly cy: number } {
  let sumX = 0;
  let sumY = 0;
  let sumW = 0;
  let count = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const idx = (y * frame.width + x) * 4;
      const luma = 0.299 * (frame.data[idx] ?? 0) + 0.587 * (frame.data[idx + 1] ?? 0) + 0.114 * (frame.data[idx + 2] ?? 0);
      if (luma >= thresholdLuma) {
        const w = luma - thresholdLuma + 1;
        sumX += x * w;
        sumY += y * w;
        sumW += w;
        count += 1;
      }
    }
  }
  return { count, cx: sumW > 0 ? sumX / sumW : 0, cy: sumW > 0 ? sumY / sumW : 0 };
}

describe("wasm64-wave69-motion-toon-animatic-director", () => {
  describe("parallax-25d-camera-choreographer", () => {
    it("근경 레이어 시차 변위가 캐릭터·중경·원경 레이어 시차 변위보다 엄격히 크다", () => {
      const result = evaluateParallax25dFrameTransforms({
        aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, layers: SAMPLE_LAYERS_25D, normalizedTime: 0.8,
        plan: { durationMs: 3000, endAnchor: { x: 0.6, y: -0.35 }, intensity: 1.0, mode: "ken-burns-pan", startAnchor: { x: -0.5, y: 0.25 } },
      });
      const byId = new Map(result.layerTransforms.map((item) => [item.layerId, item]));
      const disp = (id: string): number => {
        const tr = byId.get(id);
        return tr ? Math.hypot(tr.translateXPx, tr.translateYPx) : 0;
      };
      expect(disp("layer-fg")).toBeGreaterThan(disp("layer-char"));
      expect(disp("layer-char")).toBeGreaterThan(disp("layer-mid"));
      expect(disp("layer-mid")).toBeGreaterThan(disp("layer-bg"));
      expect(byId.get("layer-fg")?.parallaxGain ?? 0).toBeGreaterThan(byId.get("layer-bg")?.parallaxGain ?? 0);
    });

    it("dolly-in 카메라 전진 시 근경 레이어가 원경 레이어보다 더 크게 확대된다", () => {
      const result = evaluateParallax25dFrameTransforms({
        aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, layers: SAMPLE_LAYERS_25D, normalizedTime: 1.0,
        plan: { dollyDepthMeters: 0.45, durationMs: 2500, intensity: 1.0, mode: "dolly-in" },
      });
      const byId = new Map(result.layerTransforms.map((item) => [item.layerId, item]));
      expect(byId.get("layer-fg")?.scale ?? 0).toBeGreaterThan(byId.get("layer-char")?.scale ?? 0);
      expect(byId.get("layer-char")?.scale ?? 0).toBeGreaterThan(byId.get("layer-bg")?.scale ?? 0);
    });

    it("9:16·16:9·1:1 숏폼 화면비 프리셋이 정확한 60fps 해상도와 안전 여백을 반환한다", () => {
      expect(resolveShortformViewport("9:16")).toEqual(SHORTFORM_VIEWPORT_PRESETS["9:16"]);
      expect([resolveShortformViewport("9:16").widthPx, resolveShortformViewport("9:16").heightPx]).toEqual([1080, 1920]);
      expect([resolveShortformViewport("16:9").widthPx, resolveShortformViewport("16:9").heightPx]).toEqual([1920, 1080]);
      expect([resolveShortformViewport("1:1").widthPx, resolveShortformViewport("1:1").heightPx]).toEqual([1080, 1080]);
      for (const preset of ALL_ASPECT_PRESETS) expect(resolveShortformViewport(preset).fps).toBe(60);
    });

    it("5종 카메라 모드와 3종 화면비 전 구간에서 오버스캔 크롭이 0px 검은 테두리를 보장한다", () => {
      for (const preset of ALL_ASPECT_PRESETS) {
        const viewport = resolveShortformViewport(preset);
        for (const mode of ALL_CAMERA_MODES) {
          const plan = {
            dollyDepthMeters: 0.38, durationMs: 2400, endAnchor: { x: 0.65, y: -0.4 }, intensity: 1.15,
            mode, panAmplitudeRatio: 0.14, rollAmplitudeDeg: 3.2, startAnchor: { x: -0.65, y: 0.4 },
          };
          const envelope = computeOverscanSafeCropEnvelope(
            { heightPx: 1400, widthPx: 900 }, viewport, SAMPLE_LAYERS_25D, plan, { sampleSteps: 12 },
          );
          expect(envelope.zeroBlackBorderGuaranteed).toBe(true);
          expect(envelope.maxExposedBlackMarginPx).toBe(0);

          for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const evalFrame = evaluateParallax25dFrameTransforms({
              aspectPreset: preset, cutHeightPx: 1400, cutWidthPx: 900, layers: SAMPLE_LAYERS_25D, normalizedTime: t, plan,
            });
            expect(evalFrame.zeroBlackBorderGuaranteed).toBe(true);
            for (const tr of evalFrame.layerTransforms) {
              if (!tr.fullBleed) continue;
              const check = measureLayerBlackBorderExposurePx(tr, 900, 1400, viewport.widthPx, viewport.heightPx);
              expect(check.exposedBlackMarginPx).toBe(0);
              expect(tr.blackBorderSafe).toBe(true);
            }
          }
        }
      }
    });

    it("See-Through 인페인팅 스커트 여백(overscanMarginPx)이 있으면 필요 크롭 스케일이 낮아진다", () => {
      const plan = {
        durationMs: 2000, endAnchor: { x: 0.7, y: 0.4 }, intensity: 1.0, mode: "ken-burns-pan" as const,
        panAmplitudeRatio: 0.14, rollAmplitudeDeg: 2.5, startAnchor: { x: -0.7, y: -0.4 },
      };
      const noSkirt = evaluateParallax25dFrameTransforms({
        aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, normalizedTime: 1.0, plan,
        layers: [{ depthZ: 10, fullBleed: true, id: "bg", name: "배경", overscanMarginPx: 0, role: "backdrop" }],
      });
      const withSkirt = evaluateParallax25dFrameTransforms({
        aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, normalizedTime: 1.0, plan,
        layers: [{ depthZ: 10, fullBleed: true, id: "bg", name: "배경", overscanMarginPx: 120, role: "backdrop" }],
      });
      expect(noSkirt.zeroBlackBorderGuaranteed).toBe(true);
      expect(withSkirt.zeroBlackBorderGuaranteed).toBe(true);
      expect(withSkirt.overscanReport.maxRequiredOverscanScale).toBeLessThan(noSkirt.overscanReport.maxRequiredOverscanScale);
    });

    it("dramatic-rack-focus가 전경에서 캐릭터 평면으로 초점과 착란원 블러를 전환한다", () => {
      const plan = { durationMs: 2000, endFocusDepthZ: 2.5, mode: "dramatic-rack-focus" as const, startFocusDepthZ: 1.2 };
      const startFrame = evaluateParallax25dFrameTransforms({ aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, layers: SAMPLE_LAYERS_25D, normalizedTime: 0, plan });
      const endFrame = evaluateParallax25dFrameTransforms({ aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, layers: SAMPLE_LAYERS_25D, normalizedTime: 1, plan });
      const getBlur = (evalRes: typeof startFrame, id: string): number => evalRes.layerTransforms.find((l) => l.layerId === id)?.dofBlurRadiusPx ?? 99;
      expect(getBlur(startFrame, "layer-fg")).toBeLessThan(getBlur(startFrame, "layer-char"));
      expect(getBlur(endFrame, "layer-char")).toBeLessThan(getBlur(endFrame, "layer-fg"));
    });

    it("whip-reveal이 진입 순간 강한 모션블러를 만들고 종료 시점에 0으로 감쇠한다", () => {
      const plan = { durationMs: 1600, endAnchor: { x: 0.6, y: 0 }, intensity: 1.0, mode: "whip-reveal" as const, startAnchor: { x: -0.8, y: 0 } };
      const startPose = sampleCameraChoreographyPose(plan, 0.02);
      const endPose = sampleCameraChoreographyPose(plan, 1.0);
      expect(Math.hypot(startPose.motionBlurVectorPx.x, startPose.motionBlurVectorPx.y)).toBeGreaterThan(15);
      expect(Math.hypot(endPose.motionBlurVectorPx.x, endPose.motionBlurVectorPx.y)).toBeCloseTo(0, 5);
    });

    it("breath-idle이 주기적 호흡 부유를 생성하고 1사이클 끝에서 원점으로 회귀한다", () => {
      const plan = { breathCycles: 1, durationMs: 4000, intensity: 1.0, mode: "breath-idle" as const };
      const quarter = sampleCameraChoreographyPose(plan, 0.25);
      const end = sampleCameraChoreographyPose(plan, 1.0);
      expect(Math.abs(quarter.camXNorm)).toBeGreaterThan(0.1);
      expect(Math.abs(end.camXNorm)).toBeLessThan(1e-6);
      expect(Math.abs(end.camYNorm)).toBeLessThan(1e-6);
    });

    it("프레임 고정 말풍선 레이어는 화가 순서 최상위에 놓이고 시차·블러 0을 유지한다", () => {
      const evalFrame = evaluateParallax25dFrameTransforms({
        aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, layers: SAMPLE_LAYERS_25D,
        normalizedTime: 0.6, plan: { durationMs: 2000, mode: "whip-reveal" },
      });
      const lastLayer = evalFrame.layerTransforms[evalFrame.layerTransforms.length - 1];
      expect(lastLayer?.layerId).toBe("layer-balloon");
      expect([lastLayer?.translateXPx, lastLayer?.translateYPx, lastLayer?.dofBlurRadiusPx]).toEqual([0, 0, 0]);
    });

    it("prefersReducedMotion 활성화 시 카메라 변위·롤·모션블러를 0으로 억제한다", () => {
      const evalFrame = evaluateParallax25dFrameTransforms({
        aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, layers: SAMPLE_LAYERS_25D,
        normalizedTime: 0.35, plan: { durationMs: 2000, intensity: 1.2, mode: "whip-reveal", rollAmplitudeDeg: 3.5 },
        prefersReducedMotion: true,
      });
      expect(evalFrame.cameraPose.reducedMotionClamped).toBe(true);
      expect(evalFrame.cameraPose.camXNorm).toBe(0);
      expect(evalFrame.cameraPose.rollDeg).toBe(0);
      expect(evalFrame.cameraPose.motionBlurVectorPx).toEqual({ x: 0, y: 0 });
      expect(evalFrame.zeroBlackBorderGuaranteed).toBe(true);
      for (const tr of evalFrame.layerTransforms) {
        expect([tr.translateXPx, tr.translateYPx, tr.rotationDeg]).toEqual([0, 0, 0]);
      }
    });
  });

  describe("beat-synced-animatic-sequencer", () => {
    it("BPM 120(500ms/beat)에서 모든 컷 전환 경계를 정확히 500ms 비트 그리드에 스냅한다", () => {
      const timeline = compileMotionToonAnimaticTimeline({ bpm: 120, cuts: SAMPLE_CUTS, sequenceId: "seq-bpm120" });
      expect(timeline.beatDurationMs).toBe(500);
      expect(timeline.cuts.length).toBe(3);
      for (const cut of timeline.cuts) {
        expect(cut.isBeatLocked).toBe(true);
        expect(cut.beatAlignmentErrorMs).toBe(0);
        expect([cut.startTimeMs % 500, cut.endTimeMs % 500, cut.durationMs % 500]).toEqual([0, 0, 0]);
      }
    });

    it("BPM 150 및 오프셋 250ms 환경에서도 비트 정렬과 마디 다운비트 마커를 정확히 생성한다", () => {
      const timeline = compileMotionToonAnimaticTimeline({
        beatGridOffsetMs: 250, beatsPerBar: 4, bpm: 150, cuts: SAMPLE_CUTS, sequenceId: "seq-bpm150",
      });
      expect(timeline.beatDurationMs).toBe(400);
      expect(timeline.cuts[0]?.startTimeMs).toBe(250);
      for (const cut of timeline.cuts) {
        expect(cut.isBeatLocked).toBe(true);
        expect((cut.startTimeMs - 250) % 400).toBe(0);
      }
      expect(timeline.beatMarkers[0]?.isDownbeat).toBe(true);
      expect(timeline.beatMarkers[4]?.isDownbeat).toBe(true);
      expect(timeline.beatMarkers[4]?.barIndex).toBe(1);
    });

    it("한국어 말풍선 팝인 후 타이핑 리빌이 한글 음절 손상 없이 단조 증가한다", () => {
      const timeline = compileMotionToonAnimaticTimeline({ bpm: 120, cuts: SAMPLE_CUTS, sequenceId: "seq-balloons" });
      const balloon = timeline.cuts[0]?.balloons[0];
      expect(balloon).toBeDefined();
      if (!balloon) return;
      const before = sampleAnimaticTimelineAtTimeMs(timeline, Math.max(0, balloon.popInStartMs - 10));
      const popping = sampleAnimaticTimelineAtTimeMs(timeline, (balloon.popInStartMs + balloon.popInEndMs) * 0.5);
      const midType = sampleAnimaticTimelineAtTimeMs(timeline, (balloon.typingStartMs + balloon.typingEndMs) * 0.5);
      const after = sampleAnimaticTimelineAtTimeMs(timeline, balloon.typingEndMs + 20);
      expect(before.balloons[0]?.visibility).toBe("hidden");
      expect(popping.balloons[0]?.visibility).toBe("popping-in");
      expect(midType.balloons[0]?.visibility).toBe("typing");
      expect(midType.balloons[0]?.visibleCharCount ?? 0).toBeGreaterThan(0);
      expect(midType.balloons[0]?.visibleCharCount ?? 99).toBeLessThan(balloon.totalChars);
      expect(after.balloons[0]?.visibleText).toBe("지금이 마지막 기회야!");
    });

    it("한 컷에 속한 복수 말풍선 대사가 겹치지 않고 순차 스케줄링된다", () => {
      const timeline = compileMotionToonAnimaticTimeline({ bpm: 120, cuts: SAMPLE_CUTS, sequenceId: "seq-multi-balloon" });
      const b1 = timeline.cuts[1]?.balloons[0];
      const b2 = timeline.cuts[1]?.balloons[1];
      expect(timeline.cuts[1]?.balloons.length).toBe(2);
      expect(Boolean(b1 && b2 && b2.popInStartMs >= b1.typingEndMs)).toBe(true);
    });

    it("SFX 타격 임펄스가 비트에 정렬되고 감쇠 카메라 쉐이크가 시간에 따라 줄어든다", () => {
      const timeline = compileMotionToonAnimaticTimeline({ bpm: 120, cuts: SAMPLE_CUTS, sequenceId: "seq-shake" });
      const sfx = timeline.cuts[1]?.sfxCues[0];
      expect(sfx).toBeDefined();
      if (!sfx) return;
      expect(sfx.triggerTimeMs % 500).toBe(0);
      const early = sampleAnimaticTimelineAtTimeMs(timeline, sfx.triggerTimeMs + 15);
      const late = sampleAnimaticTimelineAtTimeMs(timeline, sfx.triggerTimeMs + 260);
      const ended = sampleAnimaticTimelineAtTimeMs(timeline, sfx.triggerTimeMs + sfx.shakeDurationMs + 40);
      expect(early.cameraShake.intensity).toBeGreaterThan(late.cameraShake.intensity);
      expect(Math.hypot(early.cameraShake.offsetXPx, early.cameraShake.offsetYPx)).toBeGreaterThan(2);
      expect(ended.cameraShake.intensity).toBe(0);
    });

    it("2차 모션 요소(머리카락·망토)가 고유 진동수 및 충격량과 연동되어 흔들린다", () => {
      const timeline = compileMotionToonAnimaticTimeline({ bpm: 120, cuts: SAMPLE_CUTS, sequenceId: "seq-secondary" });
      const s1 = sampleAnimaticTimelineAtTimeMs(timeline, 350);
      const s2 = sampleAnimaticTimelineAtTimeMs(timeline, 550);
      expect(s1.secondaryMotions.length).toBe(2);
      expect(s1.secondaryMotions[0]?.swayOffsetPx).not.toBe(s2.secondaryMotions[0]?.swayOffsetPx);
      expect(Math.abs(s1.secondaryMotions[1]?.swayAngleDeg ?? 0)).toBeGreaterThan(0);
    });

    it("감정 강도와 오버라이드에 따라 5종 트랜지션이 분기되고 경계에서 outgoingCutId를 추적한다", () => {
      const timeline = compileMotionToonAnimaticTimeline({
        bpm: 120,
        cuts: [
          SAMPLE_CUTS[0] as AnimaticCutScriptInput,
          { ...(SAMPLE_CUTS[1] as AnimaticCutScriptInput), preferredTransitionIn: "whip-pan" },
          { ...(SAMPLE_CUTS[2] as AnimaticCutScriptInput), preferredTransitionIn: "ink-wipe" },
        ],
        sequenceId: "seq-transitions",
      });
      expect([timeline.cuts[0]?.transitionInKind, timeline.cuts[1]?.transitionInKind, timeline.cuts[2]?.transitionInKind]).toEqual([
        "cut", "whip-pan", "ink-wipe",
      ]);
      const inTrans = sampleAnimaticTimelineAtTimeMs(timeline, (timeline.cuts[1]?.startTimeMs ?? 0) + 40);
      expect(inTrans.transition.active).toBe(true);
      expect(inTrans.transition.outgoingCutId).toBe("cut-01");
      expect(inTrans.transition.whipPanOffsetNormalized).toBeGreaterThan(0);
    });

    it("prefersReducedMotion 시 카메라 쉐이크·휩팬·플래시·2차 모션을 0 억제하고 저자극 전환으로 대체한다", () => {
      const timeline = compileMotionToonAnimaticTimeline({
        bpm: 120,
        cuts: [
          SAMPLE_CUTS[0] as AnimaticCutScriptInput,
          { ...(SAMPLE_CUTS[1] as AnimaticCutScriptInput), preferredTransitionIn: "whip-pan" },
          { ...(SAMPLE_CUTS[2] as AnimaticCutScriptInput), preferredTransitionIn: "flash-impact" },
        ],
        prefersReducedMotion: true,
        sequenceId: "seq-reduced",
      });
      expect(timeline.cuts[1]?.transitionInKind).toBe("cross-dissolve");
      expect(timeline.cuts[1]?.reducedMotionFallbackApplied).toBe(true);
      expect(timeline.cuts[1]?.originalRequestedTransitionIn).toBe("whip-pan");
      expect(timeline.cuts[2]?.transitionInKind).toBe("cross-dissolve");

      const cut2Start = timeline.cuts[1]?.startTimeMs ?? 0;
      const sfxTime = timeline.cuts[1]?.sfxCues[0]?.triggerTimeMs ?? cut2Start;
      for (const sampleTime of [cut2Start + 30, sfxTime + 15, sfxTime + 120]) {
        const state = sampleAnimaticTimelineAtTimeMs(timeline, sampleTime);
        expect(state.cameraShake).toEqual({ intensity: 0, offsetXPx: 0, offsetYPx: 0, rollDeg: 0 });
        expect(state.transition.whipPanOffsetNormalized).toBe(0);
        expect(state.transition.flashOpacity).toBe(0);
        for (const sec of state.secondaryMotions) expect([sec.swayOffsetPx, sec.swayAngleDeg]).toEqual([0, 0]);
        for (const balloon of state.balloons) expect(balloon.scale).toBe(1);
      }
    });

    it("음수·초과 타임스탬프와 빈 컷 입력을 안전하게 처리한다", () => {
      const timeline = compileMotionToonAnimaticTimeline({ bpm: 120, cuts: SAMPLE_CUTS, sequenceId: "seq-clamp" });
      expect(sampleAnimaticTimelineAtTimeMs(timeline, -500).clampedTimeMs).toBe(0);
      expect(sampleAnimaticTimelineAtTimeMs(timeline, timeline.totalDurationMs + 5000).activeCutIndex).toBe(2);
      const empty = compileMotionToonAnimaticTimeline({ bpm: 120, cuts: [], sequenceId: "empty" });
      expect(sampleAnimaticTimelineAtTimeMs(empty, 100).activeCutIndex).toBe(-1);
    });

    it("flash-impact 및 cross-dissolve 트랜지션의 진행 곡선이 [0, 1] 범위에서 정상 작동한다", () => {
      const timeline = compileMotionToonAnimaticTimeline({ bpm: 120, cuts: SAMPLE_CUTS, sequenceId: "seq-curves" });
      const flashMid = sampleAnimaticTimelineAtTimeMs(
        timeline, (timeline.cuts[1]?.startTimeMs ?? 0) + (timeline.cuts[1]?.transitionInDurationMs ?? 0) * 0.5,
      );
      const dissolveMid = sampleAnimaticTimelineAtTimeMs(
        timeline, (timeline.cuts[2]?.startTimeMs ?? 0) + (timeline.cuts[2]?.transitionInDurationMs ?? 0) * 0.5,
      );
      expect(flashMid.transition.kind).toBe("flash-impact");
      expect(flashMid.transition.flashOpacity).toBeGreaterThan(0.7);
      expect(dissolveMid.transition.kind).toBe("cross-dissolve");
      expect(dissolveMid.transition.dissolveAlpha).toBeGreaterThan(0.3);
      expect(dissolveMid.transition.dissolveAlpha).toBeLessThan(0.7);
    });
  });

  describe("optical-flow-frame-interpolator & shortform export manifest", () => {
    it("2프레임 이동 물체에서 블록 매칭 옵티컬 플로가 수평·대각 모션벡터를 정확히 실측한다", () => {
      const frameA = createSyntheticMovingSpriteFrame(64, 64, 16, 16, 16);
      const frameB = createSyntheticMovingSpriteFrame(64, 64, 24, 20, 16);
      const flow = estimateBlockOpticalFlow(frameA, frameB, { blockSize: 8, searchRadius: 12 });
      const spriteBlocks = flow.forwardVectors.filter((v) => v.blockX >= 2 && v.blockX <= 3 && v.blockY >= 2 && v.blockY <= 3);
      expect(spriteBlocks.length).toBe(4);
      const meanDx = spriteBlocks.reduce((acc, v) => acc + v.dx, 0) / spriteBlocks.length;
      const meanDy = spriteBlocks.reduce((acc, v) => acc + v.dy, 0) / spriteBlocks.length;
      expect(Math.abs(meanDx - 8)).toBeLessThan(0.6);
      expect(Math.abs(meanDy - 4)).toBeLessThan(0.6);
    });

    it("정적 단색 배경 블록은 노이즈 없이 (0, 0) 모션벡터로 정규화된다", () => {
      const frameA = createSyntheticMovingSpriteFrame(64, 64, 16, 16, 16);
      const frameB = createSyntheticMovingSpriteFrame(64, 64, 24, 16, 16);
      const flow = estimateBlockOpticalFlow(frameA, frameB, { blockSize: 8, searchRadius: 10 });
      const corner = flow.forwardVectors.find((v) => v.blockX === 0 && v.blockY === 0);
      expect([corner?.dx, corner?.dy, corner?.isFlat]).toEqual([0, 0, true]);
    });

    it("t=0.5 보간 프레임에서 이동 물체 무게중심이 정확히 절반 지점으로 이동한다", () => {
      const frameA = createSyntheticMovingSpriteFrame(64, 64, 16, 24, 16);
      const frameB = createSyntheticMovingSpriteFrame(64, 64, 26, 24, 16);
      const cA = measureBrightObjectCentroid(frameA);
      const cB = measureBrightObjectCentroid(frameB);
      const midResult = interpolateMotionToonFrameRgba(frameA, frameB, 0.5, { flowOptions: { blockSize: 8, searchRadius: 12 } });
      const cMid = measureBrightObjectCentroid(midResult.frame);
      expect(Math.abs(cMid.cx - (cA.cx + cB.cx) * 0.5)).toBeLessThan(0.75);
      expect(Math.abs(cMid.cy - (cA.cy + cB.cy) * 0.5)).toBeLessThan(0.75);
      expect(cMid.count).toBeGreaterThan(cA.count * 0.8);
      expect(cMid.count).toBeLessThan(cA.count * 1.25);
    });

    it("alpha=0과 alpha=1 보간 결과는 원본 frameA·frameB와 픽셀 단위로 정확히 일치한다", () => {
      const frameA = createSyntheticMovingSpriteFrame(32, 32, 6, 8, 10);
      const frameB = createSyntheticMovingSpriteFrame(32, 32, 14, 8, 10);
      expect(Array.from(interpolateMotionToonFrameRgba(frameA, frameB, 0).frame.data)).toEqual(Array.from(frameA.data));
      expect(Array.from(interpolateMotionToonFrameRgba(frameA, frameB, 1).frame.data)).toEqual(Array.from(frameB.data));
    });

    it("질감 배경 위 이동 물체에서 전·후방 차폐 블록을 검출하고 양방향 차폐 인지 워핑을 수행한다", () => {
      const frameA = createSyntheticMovingSpriteFrame(64, 64, 16, 20, 16, { texturedBackground: true });
      const frameB = createSyntheticMovingSpriteFrame(64, 64, 28, 20, 16, { texturedBackground: true });
      const flow = estimateBlockOpticalFlow(frameA, frameB, { blockSize: 8, computeBackwardFlow: true, searchRadius: 14 });
      expect(flow.backwardVectors.length).toBe(flow.forwardVectors.length);
      expect(flow.occludedBlockRatio).toBeGreaterThan(0);
      const mid = interpolateMotionToonFrameRgba(frameA, frameB, 0.5, { flowField: flow });
      const cA = measureBrightObjectCentroid(frameA, 130);
      const cB = measureBrightObjectCentroid(frameB, 130);
      const cMid = measureBrightObjectCentroid(mid.frame, 130);
      expect(Math.abs(cMid.cx - (cA.cx + cB.cx) * 0.5)).toBeLessThan(1.2);
      expect(mid.splattedPixelCoverageRatio).toBeGreaterThan(0.8);
    });

    it("12fps->60fps(5x) 및 24fps->60fps(2.5x) 보간 스케줄이 드리프트 없이 정확히 생성된다", () => {
      const sched12 = planKeyframeTo60fpsInterpolationSchedule(3, 12, 60);
      expect(sched12.length).toBe(11);
      expect(sched12[1]?.alpha).toBeCloseTo(0.2, 6);
      expect(sched12[5]?.frameAIndex).toBe(1);
      const sched24 = planKeyframeTo60fpsInterpolationSchedule(3, 24, 60);
      expect(sched24.length).toBe(6);
      expect(sched24.map((s) => Number(s.alpha.toFixed(1)))).toEqual([0, 0.4, 0.8, 0.2, 0.6, 0]);
    });

    it("12fps 3키프레임 시퀀스를 60fps 11프레임으로 보간하면 물체 중심이 단조 전진한다", () => {
      const k0 = createSyntheticMovingSpriteFrame(64, 48, 8, 16, 16);
      const k1 = createSyntheticMovingSpriteFrame(64, 48, 18, 16, 16);
      const k2 = createSyntheticMovingSpriteFrame(64, 48, 28, 16, 16);
      const upsampled = upsampleKeyframeSequenceTo60fps([k0, k1, k2], 12, 60, { blockSize: 8, searchRadius: 12 });
      expect(upsampled.frames.length).toBe(11);
      let prevCx = -1;
      for (const frame of upsampled.frames) {
        const centroid = measureBrightObjectCentroid(frame);
        expect(centroid.cx).toBeGreaterThanOrEqual(prevCx - 0.15);
        prevCx = centroid.cx;
      }
      expect(prevCx).toBeGreaterThan(measureBrightObjectCentroid(k0).cx + 18);
    });

    it("9:16 1080x1920 60fps 출고 매니페스트가 쇼츠·틱톡·릴스 3개 플랫폼 규격을 모두 통과한다", () => {
      const manifest = buildShortformExportManifest({
        aspectPreset: "9:16", audioSampleRateHz: 48000, bpm: 120, durationMs: 24000, meanOccludedBlockRatio: 0.08,
        projectId: "webtoon-ep12-shorts", sourceFps: 24, targetBitrateKbps: 12000, targetFps: 60, targetLufs: -14,
        zeroBlackBorderGuaranteed: true,
      });
      expect(manifest.allPlatformsCompliant).toBe(true);
      expect(manifest.platformChecks.length).toBe(3);
      expect([manifest.videoProfile.widthPx, manifest.videoProfile.heightPx, manifest.videoProfile.targetFps]).toEqual([1080, 1920, 60]);
      expect(manifest.videoProfile.interpolationRatio).toBe(2.5);
      expect(manifest.videoProfile.totalOutputFrames).toBe(1440);
      expect(SHORTFORM_PLATFORM_SPECS["youtube-shorts"].maxFps).toBe(60);
    });

    it("숏폼 출고 규격 위반(비-9:16, 30fps, 릴스 길이 초과, 검은 여백 미보장)을 정확히 검출한다", () => {
      const manifest = buildShortformExportManifest({
        aspectPreset: "16:9", audioSampleRateHz: 44100, bpm: 120, durationMs: 120000,
        projectId: "bad-export", sourceFps: 12, targetBitrateKbps: 12000, targetFps: 30, zeroBlackBorderGuaranteed: false,
      });
      expect(manifest.allPlatformsCompliant).toBe(false);
      const reelsCodes = manifest.platformChecks.find((c) => c.platform === "instagram-reels")?.issues.map((i) => i.code) ?? [];
      const shortsCodes = manifest.platformChecks.find((c) => c.platform === "youtube-shorts")?.issues.map((i) => i.code) ?? [];
      expect(reelsCodes).toContain("ASPECT_MISMATCH");
      expect(reelsCodes).toContain("FPS_NOT_60");
      expect(reelsCodes).toContain("DURATION_OUT_OF_RANGE");
      expect(reelsCodes).toContain("BLACK_BORDER_EXPOSED");
      expect(shortsCodes).toContain("AUDIO_SAMPLE_RATE_UNSUPPORTED");
    });

    it("종단 간 Wave-69 통합: 2.5D 시차 + BPM 128 시퀀서 + 24fps->60fps 보간 + 숏폼 매니페스트 연동", () => {
      const timeline = compileMotionToonAnimaticTimeline({ bpm: 128, cuts: SAMPLE_CUTS, fps: 60, sequenceId: "ep01-trailer" });
      const sample = sampleAnimaticTimelineAtTimeMs(timeline, timeline.cuts[1]?.startTimeMs ?? 0);
      const parallax = evaluateParallax25dFrameTransforms({
        aspectPreset: "9:16", cutHeightPx: 1920, cutWidthPx: 1080, layers: SAMPLE_LAYERS_25D,
        normalizedTime: sample.cutNormalizedProgress, plan: { durationMs: timeline.cuts[1]?.durationMs ?? 2000, mode: sample.cameraMode },
      });
      const k0 = createSyntheticMovingSpriteFrame(48, 48, 10, 14, 14);
      const k1 = createSyntheticMovingSpriteFrame(48, 48, 18, 14, 14);
      const upsampled = upsampleKeyframeSequenceTo60fps([k0, k1], 24, 60);
      const manifest = buildShortformExportManifest({
        aspectPreset: "9:16", bpm: timeline.bpm, durationMs: timeline.totalDurationMs,
        meanOccludedBlockRatio: upsampled.meanOccludedBlockRatio, prefersReducedMotion: timeline.prefersReducedMotion,
        projectId: timeline.sequenceId, sourceFps: 24, targetFps: 60, zeroBlackBorderGuaranteed: parallax.zeroBlackBorderGuaranteed,
      });
      expect(timeline.cuts.every((c) => c.isBeatLocked)).toBe(true);
      expect(parallax.zeroBlackBorderGuaranteed).toBe(true);
      expect(upsampled.frames.length).toBeGreaterThan(2);
      expect(manifest.allPlatformsCompliant).toBe(true);
    });
  });
});
