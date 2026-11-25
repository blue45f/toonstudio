// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FOCUS_AUTO_PAN_CONFIG,
  FOCUS_PAN_MAX_DAMPING,
  FOCUS_PAN_MIN_DAMPING,
  LOCAL_NON_MEDICAL_NOTICE_KO,
  NIB_HAPTIC_PROFILES,
  StudioFocusPanHapticPanel,
  WORK_RHYTHM_PRESETS,
  applyFocusHapticSession,
  buildNibFrequencyCurve,
  computeFocusAutoPanDelta,
  createFocusHapticSession,
  evaluateWorkRhythmSession,
  exportFocusHapticProfileJson,
  formatOklch,
  getNibHapticProfile,
  isVioletSlopHue,
  previewNibHapticPreset,
  revertFocusHapticSession,
  sanitizeNonVioletHue,
  simulateFocusAutoPanTrajectory,
  synthesizeNibHapticResponse,
  triggerSafeNavigatorVibrate,
  tweakFocusHapticConfig,
} from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("1. 비침습 로컬 작업 리듬 코치 (evaluateWorkRhythmSession)", () => {
  it("낮은 Undo와 안정적 스트로크 리듬의 집중 작업을 flow로 판정하고 UI 크롬 완화·앰비언스 -6dB를 제안한다", () => {
    const res = evaluateWorkRhythmSession({
      continuousMinutes: 26,
      undoPerMinute: 1.5,
      strokeCadencePerMin: 48,
      zoomLevel: 320,
    });
    expect(res.state).toBe("flow");
    expect(res.adjustment.uiChromeOpacity).toBeLessThan(0.7);
    expect(res.adjustment.ambienceGainDb).toBe(-6);
    expect(res.adjustment.wristStretchReminderMinutes).toBeNull();
    expect(res.adjustment.dimPeripheralChrome).toBe(true);
    expect(res.processingScope).toBe("local-input-only");
  });

  it("초기 워밍업 또는 중간 수정 빈도 구간을 steady(안정 리듬)로 판정한다", () => {
    const warmup = evaluateWorkRhythmSession({
      continuousMinutes: 6,
      undoPerMinute: 1,
      strokeCadencePerMin: 35,
      zoomLevel: 150,
    });
    const storyboard = evaluateWorkRhythmSession({
      continuousMinutes: 32,
      undoPerMinute: 5,
      strokeCadencePerMin: 28,
      zoomLevel: 210,
    });
    expect(warmup.state).toBe("steady");
    expect(storyboard.state).toBe("steady");
    expect(storyboard.adjustment.ambienceGainDb).toBe(-3);
  });

  it("연속 55분 이상이거나 분당 Undo가 9회 이상이면 drift-check와 3분 손목·눈 스트레칭 알림을 제안한다", () => {
    const longSession = evaluateWorkRhythmSession({
      continuousMinutes: 64,
      undoPerMinute: 3,
      strokeCadencePerMin: 32,
      zoomLevel: 350,
    });
    const undoSpike = evaluateWorkRhythmSession({
      continuousMinutes: 22,
      undoPerMinute: 11,
      strokeCadencePerMin: 24,
      zoomLevel: 400,
    });
    expect(longSession.state).toBe("drift-check");
    expect(undoSpike.state).toBe("drift-check");
    expect(longSession.adjustment.wristStretchReminderMinutes).toBe(3);
    expect(longSession.adjustment.ambienceGainDb).toBe(-6);
    expect(longSession.adjustment.dimPeripheralChrome).toBe(false);
  });

  it("범위 밖·음수·NaN 입력을 안전하게 클램프하며 동일 입력에 결정론적 결과를 반환한다", () => {
    const weird = evaluateWorkRhythmSession({
      continuousMinutes: Number.NaN,
      undoPerMinute: -4,
      strokeCadencePerMin: 999,
      zoomLevel: 9999,
    });
    expect(weird.clampedInput.continuousMinutes).toBe(0);
    expect(weird.clampedInput.undoPerMinute).toBe(0);
    expect(weird.clampedInput.strokeCadencePerMin).toBe(160);
    expect(weird.clampedInput.zoomLevel).toBe(800);
    expect(weird.rhythmStabilityScore).toBeGreaterThanOrEqual(0);
    expect(weird.rhythmStabilityScore).toBeLessThanOrEqual(100);

    const a = evaluateWorkRhythmSession(WORK_RHYTHM_PRESETS[0].input);
    const b = evaluateWorkRhythmSession(WORK_RHYTHM_PRESETS[0].input);
    expect(a).toEqual(b);
  });

  it("내장 3종 작업 리듬 시나리오 프리셋이 flow·steady·drift-check 상태를 고르게 대표한다", () => {
    const states = WORK_RHYTHM_PRESETS.map((p) => evaluateWorkRhythmSession(p.input).state);
    expect(states).toEqual(["flow", "steady", "drift-check"]);
  });

  it("결과 문구와 안내에 100% 로컬 비의료 고지를 포함하고 의료·생체 진단 표현이 0건이다", () => {
    const forbidden = /심박|뇌파|치료|처방|질환|증후군|진단합니다|의학적|바이오메트릭/u;
    for (const preset of WORK_RHYTHM_PRESETS) {
      const res = evaluateWorkRhythmSession(preset.input);
      expect(res.nonMedicalNoticeKo).toBe(LOCAL_NON_MEDICAL_NOTICE_KO);
      const joined = [
        res.labelKo,
        ...res.observedSignalsKo,
        ...res.adjustment.suggestionsKo,
      ].join(" ");
      expect(joined).not.toMatch(forbidden);
    }
  });
});

describe("2. 확대 작화 포커스 자동 패닝 추종기 (computeFocusAutoPanDelta)", () => {
  it("확대 배율이 200% 미만이면 below-zoom-threshold 상태로 패닝을 비활성화한다", () => {
    const res = computeFocusAutoPanDelta(
      { cursorNormX: 0.94, cursorNormY: 0.92, velocityX: 20, velocityY: 14, zoomLevel: 160 },
      DEFAULT_FOCUS_AUTO_PAN_CONFIG,
    );
    expect(res.active).toBe(false);
    expect(res.reason).toBe("below-zoom-threshold");
    expect(res.panDeltaX).toBe(0);
    expect(res.panDeltaY).toBe(0);
  });

  it("커서가 뷰포트 중앙 안전 구역에 있으면 inside-safe-zone으로 0 벡터를 반환한다", () => {
    const res = computeFocusAutoPanDelta(
      { cursorNormX: 0.5, cursorNormY: 0.5, velocityX: 24, velocityY: -12, zoomLevel: 350 },
      DEFAULT_FOCUS_AUTO_PAN_CONFIG,
    );
    expect(res.active).toBe(false);
    expect(res.reason).toBe("inside-safe-zone");
    expect(res.triggeredEdges).toEqual([]);
  });

  it("우측 하단 외곽 18% 데드존 진입 시 양수(+, +) 패닝 추종 벡터와 진입 변을 산출한다", () => {
    const res = computeFocusAutoPanDelta(
      { cursorNormX: 0.92, cursorNormY: 0.9, velocityX: 18, velocityY: 12, zoomLevel: 360 },
      DEFAULT_FOCUS_AUTO_PAN_CONFIG,
    );
    expect(res.active).toBe(true);
    expect(res.reason).toBe("active-edge-pan");
    expect(res.panDeltaX).toBeGreaterThan(0);
    expect(res.panDeltaY).toBeGreaterThan(0);
    expect(res.triggeredEdges).toEqual(["right", "bottom"]);
    expect(res.edgePenetrationX).toBeGreaterThan(0);
    expect(res.edgePenetrationY).toBeGreaterThan(0);
  });

  it("좌측 상단 외곽 데드존 진입 시 음수(-, -) 패닝 추종 벡터를 산출한다", () => {
    const res = computeFocusAutoPanDelta(
      { cursorNormX: 0.05, cursorNormY: 0.07, velocityX: -15, velocityY: -11, zoomLevel: 420 },
      DEFAULT_FOCUS_AUTO_PAN_CONFIG,
    );
    expect(res.active).toBe(true);
    expect(res.panDeltaX).toBeLessThan(0);
    expect(res.panDeltaY).toBeLessThan(0);
    expect(res.triggeredEdges).toEqual(["left", "top"]);
  });

  it("prefers-reduced-motion 설정 시 고배율 외곽 진입에서도 자동 비활성화(0, 0) 안전 가드가 작동한다", () => {
    const res = computeFocusAutoPanDelta(
      { cursorNormX: 0.98, cursorNormY: 0.98, velocityX: 40, velocityY: 35, zoomLevel: 550 },
      { ...DEFAULT_FOCUS_AUTO_PAN_CONFIG, prefersReducedMotion: true },
    );
    expect(res.active).toBe(false);
    expect(res.reason).toBe("reduced-motion-guard");
    expect(res.panDeltaX).toBe(0);
    expect(res.panDeltaY).toBe(0);
    expect(res.magnitudePx).toBe(0);
  });

  it("감쇠 계수(0.12~0.45)·데드존(0.08~0.30)·최대 이동량을 클램프하며 감쇠가 클수록 초기 반응이 크다", () => {
    const sample = {
      cursorNormX: 0.93,
      cursorNormY: 0.5,
      velocityX: 20,
      velocityY: 0,
      zoomLevel: 400,
    };
    const soft = computeFocusAutoPanDelta(sample, {
      ...DEFAULT_FOCUS_AUTO_PAN_CONFIG,
      damping: 0.02,
      edgeDeadzoneRatio: 0.01,
    });
    const crisp = computeFocusAutoPanDelta(sample, {
      ...DEFAULT_FOCUS_AUTO_PAN_CONFIG,
      damping: 0.95,
      edgeDeadzoneRatio: 0.6,
    });
    expect(soft.effectiveDamping).toBe(FOCUS_PAN_MIN_DAMPING);
    expect(crisp.effectiveDamping).toBe(FOCUS_PAN_MAX_DAMPING);
    expect(soft.effectiveDeadzoneRatio).toBe(0.08);
    expect(crisp.effectiveDeadzoneRatio).toBe(0.3);
    expect(crisp.panDeltaX).toBeGreaterThan(soft.panDeltaX);

    const capped = computeFocusAutoPanDelta(
      { cursorNormX: 1, cursorNormY: 1, velocityX: 120, velocityY: 120, zoomLevel: 600 },
      { ...DEFAULT_FOCUS_AUTO_PAN_CONFIG, damping: 0.45, maxPanStepPx: 20 },
    );
    expect(capped.magnitudePx).toBeLessThanOrEqual(20.05);
  });

  it("simulateFocusAutoPanTrajectory가 흔들림 없이 단조 수렴하는 6프레임 궤적을 만들고 가드 시 0을 유지한다", () => {
    const sample = {
      cursorNormX: 0.92,
      cursorNormY: 0.85,
      velocityX: 16,
      velocityY: 10,
      zoomLevel: 350,
    };
    const traj = simulateFocusAutoPanTrajectory(sample, DEFAULT_FOCUS_AUTO_PAN_CONFIG, 6);
    expect(traj).toHaveLength(6);
    for (let i = 1; i < traj.length; i += 1) {
      expect(traj[i].deltaX).toBeGreaterThanOrEqual(traj[i - 1].deltaX);
      expect(traj[i].cumulativeX).toBeGreaterThan(traj[i - 1].cumulativeX);
    }

    const guarded = simulateFocusAutoPanTrajectory(
      sample,
      { ...DEFAULT_FOCUS_AUTO_PAN_CONFIG, prefersReducedMotion: true },
      4,
    );
    expect(guarded.every((pt) => pt.deltaX === 0 && pt.deltaY === 0)).toBe(true);
  });
});

describe("3. 4종 펜촉 햅틱 · 마찰음 프로파일러 (NIB_HAPTIC_PROFILES & synthesizeNibHapticResponse)", () => {
  it("필수 4종 펜촉 프로파일(kent-gpen, hanji-brush, marker-smooth, coldpress-pencil)이 모두 정의된다", () => {
    expect(NIB_HAPTIC_PROFILES.map((p) => p.id)).toEqual([
      "kent-gpen",
      "hanji-brush",
      "marker-smooth",
      "coldpress-pencil",
    ]);
    for (const p of NIB_HAPTIC_PROFILES) {
      expect(p.baseVibrationHz).toBeLessThan(p.maxVibrationHz);
      expect(p.bandpassBaseHz).toBeLessThan(p.bandpassMaxHz);
      expect(isVioletSlopHue(p.accentOklch.h)).toBe(false);
    }
  });

  it("필압·속도가 높을수록 진동 주파수·진폭·대역통과 주파수가 증가하고 정지 시 0을 반환한다", () => {
    const idle = synthesizeNibHapticResponse("kent-gpen", { pressure: 0, speedPxPerSec: 0 });
    expect(idle.amplitude).toBe(0);
    expect(idle.audioFrictionGain).toBe(0);
    expect(idle.vibratePatternMs).toEqual([]);

    const light = synthesizeNibHapticResponse("kent-gpen", { pressure: 0.25, speedPxPerSec: 220 });
    const heavy = synthesizeNibHapticResponse("kent-gpen", { pressure: 0.9, speedPxPerSec: 1100 });
    expect(heavy.vibrationFrequencyHz).toBeGreaterThan(light.vibrationFrequencyHz);
    expect(heavy.amplitude).toBeGreaterThan(light.amplitude);
    expect(heavy.audioBandpassHz).toBeGreaterThan(light.audioBandpassHz);
  });

  it("4종 펜촉의 물리적 특성(G펜 최고 대역, 한지 먹붓 최저 진동, 황목지 최고 요철, 마커지 최저 요철)이 구분된다", () => {
    const stroke = { pressure: 0.7, speedPxPerSec: 650 };
    const gpen = synthesizeNibHapticResponse("kent-gpen", stroke);
    const hanji = synthesizeNibHapticResponse("hanji-brush", stroke);
    const marker = synthesizeNibHapticResponse("marker-smooth", stroke);
    const pencil = synthesizeNibHapticResponse("coldpress-pencil", stroke);

    expect(gpen.audioBandpassHz).toBeGreaterThan(pencil.audioBandpassHz);
    expect(hanji.vibrationFrequencyHz).toBeLessThan(marker.vibrationFrequencyHz);
    expect(getNibHapticProfile("coldpress-pencil").paperRoughness).toBeGreaterThan(
      getNibHapticProfile("marker-smooth").paperRoughness,
    );
    expect(pencil.vibratePatternMs.length).toBeGreaterThan(hanji.vibratePatternMs.length);
  });

  it("navigator.vibrate 펄스 패턴이 안전 상한(단일 <= 45ms, 총합 <= 180ms, 홀수 종료)과 모션 축소 차단을 지킨다", () => {
    for (const profile of NIB_HAPTIC_PROFILES) {
      const res = synthesizeNibHapticResponse(profile.id, { pressure: 1, speedPxPerSec: 1600 });
      expect(res.vibratePatternMs.length).toBeGreaterThan(0);
      expect(res.vibratePatternMs.length % 2).toBe(1);
      expect(res.totalPulseDurationMs).toBeLessThanOrEqual(180);
      for (const ms of res.vibratePatternMs) {
        expect(ms).toBeGreaterThanOrEqual(4);
        expect(ms).toBeLessThanOrEqual(45);
      }
    }

    const reduced = synthesizeNibHapticResponse(
      "coldpress-pencil",
      { pressure: 0.8, speedPxPerSec: 800 },
      { prefersReducedMotion: true },
    );
    expect(reduced.vibratePatternMs).toEqual([]);
    expect(reduced.suppressedByReducedMotion).toBe(true);
  });

  it("마찰음 필터를 끄면 audioFrictionGain이 0이 되며 대역통과 주파수는 300~6500Hz 안전 범위를 지킨다", () => {
    const muted = synthesizeNibHapticResponse(
      "kent-gpen",
      { pressure: 0.8, speedPxPerSec: 900 },
      { audioFrictionEnabled: false },
    );
    expect(muted.audioFrictionGain).toBe(0);
    expect(muted.audioBandpassHz).toBeGreaterThanOrEqual(300);
    expect(muted.audioBandpassHz).toBeLessThanOrEqual(6500);
  });

  it("buildNibFrequencyCurve는 9개 상승 필압 구간을 생성하고 waveformSamples는 [-1, 1] 범위 내에 있다", () => {
    const curve = buildNibFrequencyCurve("coldpress-pencil", 500);
    expect(curve).toHaveLength(9);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i].audioBandpassHz).toBeGreaterThanOrEqual(curve[i - 1].audioBandpassHz);
    }

    const synth = synthesizeNibHapticResponse("hanji-brush", { pressure: 0.75, speedPxPerSec: 450 });
    expect(synth.waveformSamples.length).toBe(28);
    for (const sample of synth.waveformSamples) {
      expect(sample).toBeGreaterThanOrEqual(-1);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it("triggerSafeNavigatorVibrate가 가드·미지원·예외 상황을 안전하게 처리한다", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", { value: vibrateMock, configurable: true });

    expect(triggerSafeNavigatorVibrate([10, 14, 10], false)).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith([10, 14, 10]);

    expect(triggerSafeNavigatorVibrate([10, 14, 10], true)).toBe(false);
    expect(triggerSafeNavigatorVibrate([], false)).toBe(false);

    vibrateMock.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    expect(triggerSafeNavigatorVibrate([12], false)).toBe(false);
  });
});

describe("4. 탈-바이올렛 OKLCH 컬러 가드 (270~320도 0%)", () => {
  it("isVioletSlopHue가 270~320도 구간 및 음수·360도 초과 각도를 정확히 판정한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(-70)).toBe(true);
    expect(isVioletSlopHue(650)).toBe(true);
    expect(isVioletSlopHue(230)).toBe(false);
    expect(isVioletSlopHue(155)).toBe(false);
  });

  it("sanitizeNonVioletHue가 270~320도 전 구간을 비-바이올렛 안전 휴로 변환한다", () => {
    for (let deg = 270; deg <= 320; deg += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(deg))).toBe(false);
    }
  });

  it("formatOklch가 원시 hex/rgb/hsl 없이 유효한 oklch(...) 문자열만 출력한다", () => {
    const solid = formatOklch({ l: 0.56, c: 0.14, h: 155 });
    const alpha = formatOklch({ l: 0.62, c: 0.15, h: 290 }, 0.35);
    expect(solid).toBe("oklch(0.56 0.14 155)");
    expect(alpha).toBe("oklch(0.62 0.15 248 / 0.35)");
    expect(solid).not.toMatch(/#|rgb|hsl/iu);
  });
});

describe("5. 비파괴 프리셋 적용·원복 상태 머신 & JSON 내보내기", () => {
  it("초기 세션은 baseline 상태이며 미리보기 시 원본 appliedConfig·baselineConfig를 변형하지 않는다", () => {
    const base = createFocusHapticSession({ nibProfileId: "kent-gpen" });
    expect(base.status).toBe("baseline");
    expect(base.canRevert).toBe(false);

    const previewed = previewNibHapticPreset(base, "hanji-brush");
    expect(previewed.status).toBe("previewing");
    expect(previewed.workingConfig.nibProfileId).toBe("hanji-brush");
    expect(previewed.appliedConfig.nibProfileId).toBe("kent-gpen");
    expect(previewed.baselineConfig.nibProfileId).toBe("kent-gpen");
    expect(previewed.canRevert).toBe(true);
  });

  it("tweakFocusHapticConfig가 패닝 감쇠·데드존·햅틱 강도를 안전 클램프하고 tweaked 상태로 전이한다", () => {
    const base = createFocusHapticSession();
    const tweaked = tweakFocusHapticConfig(base, {
      panDamping: 0.99,
      edgeDeadzoneRatio: 0.01,
      hapticIntensity: 1.5,
    });
    expect(tweaked.status).toBe("tweaked");
    expect(tweaked.workingConfig.panDamping).toBe(FOCUS_PAN_MAX_DAMPING);
    expect(tweaked.workingConfig.edgeDeadzoneRatio).toBe(0.08);
    expect(tweaked.workingConfig.hapticIntensity).toBe(1);
    expect(tweaked.canRevert).toBe(true);
  });

  it("applyFocusHapticSession 적용 후 revertFocusHapticSession 1클릭으로 원본 baseline에 완전 원복된다", () => {
    const base = createFocusHapticSession({ nibProfileId: "kent-gpen", panDamping: 0.24 });
    const tweaked = tweakFocusHapticConfig(previewNibHapticPreset(base, "coldpress-pencil"), {
      panDamping: 0.38,
      edgeDeadzoneRatio: 0.22,
    });
    const applied = applyFocusHapticSession(tweaked);
    expect(applied.status).toBe("applied");
    expect(applied.appliedConfig.nibProfileId).toBe("coldpress-pencil");
    expect(applied.appliedConfig.panDamping).toBe(0.38);
    expect(applied.canRevert).toBe(true);

    const reverted = revertFocusHapticSession(applied);
    expect(reverted.status).toBe("reverted");
    expect(reverted.appliedConfig).toEqual(base.baselineConfig);
    expect(reverted.workingConfig).toEqual(base.baselineConfig);
    expect(reverted.canRevert).toBe(false);
  });

  it("exportFocusHapticProfileJson이 스키마·비의료 고지·리듬·패닝·햅틱 정보를 유효한 JSON으로 직렬화한다", () => {
    const session = applyFocusHapticSession(
      previewNibHapticPreset(createFocusHapticSession(), "marker-smooth"),
    );
    const rhythm = evaluateWorkRhythmSession(WORK_RHYTHM_PRESETS[0].input);
    const autoPan = computeFocusAutoPanDelta(
      { cursorNormX: 0.92, cursorNormY: 0.88, velocityX: 16, velocityY: 10, zoomLevel: 320 },
      DEFAULT_FOCUS_AUTO_PAN_CONFIG,
    );
    const haptic = synthesizeNibHapticResponse("marker-smooth", {
      pressure: 0.65,
      speedPxPerSec: 600,
    });

    const json = exportFocusHapticProfileJson(session, rhythm, autoPan, haptic);
    const parsed = JSON.parse(json) as {
      schema: string;
      processingScope: string;
      nonMedicalNoticeKo: string;
      nibHaptic: { profileId: string; audioBandpassHz: number };
      focusAutoPan: { active: boolean };
    };
    expect(parsed.schema).toBe("toonstudio.focus-pan-haptic-profile.v1");
    expect(parsed.processingScope).toBe("local-input-only");
    expect(parsed.nonMedicalNoticeKo).toBe(LOCAL_NON_MEDICAL_NOTICE_KO);
    expect(parsed.nibHaptic.profileId).toBe("marker-smooth");
    expect(parsed.nibHaptic.audioBandpassHz).toBeGreaterThan(1000);
    expect(parsed.focusAutoPan.active).toBe(true);
  });
});

describe("6. 스튜디오 패널 UI 통합 상호작용 (StudioFocusPanHapticPanel)", () => {
  it("props 없이 기본 렌더 시 비의료 안내 배지·2단 시맨틱 SVG·4종 펜촉 프리셋 카드를 모두 표시한다", () => {
    render(<StudioFocusPanHapticPanel />);
    expect(screen.getByTestId("studio-focus-pan-haptic-panel")).toBeTruthy();
    expect(screen.getByTestId("focus-nonmedical-badge").textContent).toContain(
      LOCAL_NON_MEDICAL_NOTICE_KO,
    );
    expect(screen.getByTestId("focus-autopan-svg")).toBeTruthy();
    expect(screen.getByTestId("nib-haptic-waveform-svg")).toBeTruthy();
    for (const p of NIB_HAPTIC_PROFILES) {
      expect(screen.getByTestId(`nib-preset-card-${p.id}`)).toBeTruthy();
    }
  });

  it("선택적 props(initialNibId, initialWorkMinutes, locale='en')를 반영해 초기 상태와 영문 UI를 렌더한다", () => {
    render(
      <StudioFocusPanHapticPanel
        initialNibId="hanji-brush"
        initialWorkMinutes={68}
        locale="en"
      />,
    );
    expect(screen.getByTestId("focus-nonmedical-badge").textContent).toContain(
      "Not Medical Advice",
    );
    expect(screen.getByTestId("rhythm-state-badge").getAttribute("data-rhythm-state")).toBe(
      "drift-check",
    );
    expect(screen.getByTestId("nib-haptic-waveform-svg").getAttribute("data-nib-id")).toBe(
      "hanji-brush",
    );
  });

  it("작업 리듬 시나리오 버튼과 슬라이더 조작 시 상태 배지·크롬 투명도·휴식 알림이 즉시 갱신된다", () => {
    render(<StudioFocusPanHapticPanel />);
    expect(screen.getByTestId("rhythm-state-badge").getAttribute("data-rhythm-state")).toBe("flow");
    expect(screen.getByTestId("rhythm-chrome-opacity").textContent).toBe("58%");

    fireEvent.click(screen.getByTestId("rhythm-preset-long-detail-drift"));
    expect(screen.getByTestId("rhythm-state-badge").getAttribute("data-rhythm-state")).toBe(
      "drift-check",
    );
    expect(screen.getByTestId("rhythm-break-cue").textContent).toContain("3분 스트레칭");

    fireEvent.change(screen.getByTestId("rhythm-slider-minutes"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("rhythm-slider-undo"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("rhythm-slider-cadence"), { target: { value: "44" } });
    expect(screen.getByTestId("rhythm-state-badge").getAttribute("data-rhythm-state")).toBe("flow");
  });

  it("데드존·감쇠 슬라이더, 커서 위치, 모션 축소 가드 토글이 자동 패닝 SVG와 출력을 즉시 제어한다", () => {
    render(<StudioFocusPanHapticPanel />);
    expect(screen.getByTestId("focus-autopan-svg").getAttribute("data-pan-active")).toBe("true");

    fireEvent.change(screen.getByTestId("pan-slider-deadzone"), { target: { value: "24" } });
    fireEvent.change(screen.getByTestId("pan-slider-damping"), { target: { value: "0.36" } });
    expect(screen.getByTestId("focus-autopan-svg").getAttribute("data-deadzone-pct")).toBe("24");
    expect(screen.getByTestId("focus-autopan-svg").getAttribute("data-damping")).toBe("0.36");

    fireEvent.click(screen.getByTestId("cursor-preset-safe-center"));
    expect(screen.getByTestId("focus-autopan-svg").getAttribute("data-pan-reason")).toBe(
      "inside-safe-zone",
    );

    fireEvent.click(screen.getByTestId("cursor-preset-right-bottom-edge"));
    fireEvent.click(screen.getByTestId("reduced-motion-guard-btn"));
    expect(screen.getByTestId("focus-autopan-svg").getAttribute("data-pan-active")).toBe("false");
    expect(screen.getByTestId("focus-autopan-svg").getAttribute("data-pan-reason")).toBe(
      "reduced-motion-guard",
    );
    expect(screen.getByTestId("focus-pan-vector-readout").textContent).toBe("Δ(0.0, 0.0)px");
  });

  it("4종 펜촉 프리셋 카드 전환·필압/속도 슬라이더·진동 펄스 테스트가 안전하게 동작한다", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", { value: vibrateMock, configurable: true });

    render(<StudioFocusPanHapticPanel />);
    fireEvent.click(screen.getByTestId("nib-preset-card-coldpress-pencil"));
    expect(screen.getByTestId("nib-haptic-waveform-svg").getAttribute("data-nib-id")).toBe(
      "coldpress-pencil",
    );
    expect(screen.getByTestId("nib-preset-card-coldpress-pencil").getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(screen.getByTestId("nib-vibrate-test-btn"));
    expect(vibrateMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("reduced-motion-guard-btn"));
    fireEvent.click(screen.getByTestId("nib-vibrate-test-btn"));
    expect(vibrateMock).toHaveBeenCalledTimes(1);
  });

  it("비파괴 적용(onApply)·원복·JSON 복사(onExportJson)·미리보기 토글 및 초기화가 정상 동작한다", () => {
    const onApply = vi.fn();
    const onExportJson = vi.fn();
    render(<StudioFocusPanHapticPanel onApply={onApply} onExportJson={onExportJson} />);

    expect((screen.getByTestId("focus-revert-btn") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("nib-preset-card-marker-smooth"));
    fireEvent.click(screen.getByTestId("focus-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]?.nibProfileId).toBe("marker-smooth");
    expect(screen.getByTestId("focus-session-status-badge").textContent).toContain("비파괴 적용됨");
    expect((screen.getByTestId("focus-revert-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("focus-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.focus-pan-haptic-profile.v1");
    expect(screen.getByTestId("focus-json-preview").textContent).toContain("marker-smooth");

    fireEvent.click(screen.getByTestId("focus-toggle-json-btn"));
    expect(screen.queryByTestId("focus-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("focus-revert-btn"));
    expect(screen.getByTestId("nib-haptic-waveform-svg").getAttribute("data-nib-id")).toBe(
      "kent-gpen",
    );
    expect((screen.getByTestId("focus-revert-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("렌더된 모든 버튼이 min-h-11 터치 영역을 지키고 두 SVG에 접근성 role='img'과 aria-label이 설정된다", () => {
    const { container } = render(<StudioFocusPanHapticPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(16);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
    const svgs = [
      screen.getByTestId("focus-autopan-svg"),
      screen.getByTestId("nib-haptic-waveform-svg"),
    ];
    for (const svg of svgs) {
      expect(svg.getAttribute("role")).toBe("img");
      expect((svg.getAttribute("aria-label") ?? "").length).toBeGreaterThan(8);
    }
  });
});

describe("7. 엄격 품질·하네스 계약 및 비의료·탈-바이올렛 자가 검증", () => {
  it("4개 소유 파일 존재, 전 파일 800줄 이하 및 금지 패턴·번역투·의료 진단 표현 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "focus-pan-haptic-engine.ts",
      "StudioFocusPanHapticPanel.tsx",
      "index.ts",
      "focus-pan-haptic.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "focus-pan-haptic.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
        expect(src).not.toMatch(/심박|뇌파|치료|처방|질환|증후군|진단합니다/u);
      }

      if (file === "StudioFocusPanHapticPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("렌더된 모든 SVG에 raw hex/rgb/hsl 및 바이올렛 휴(270~320도)가 0건이다", () => {
    const { container } = render(<StudioFocusPanHapticPanel />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    for (const svg of svgs) {
      const html = svg.outerHTML;
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(html).not.toMatch(/\brgba?\s*\(/iu);
      expect(html).not.toMatch(/\bhsla?\s*\(/iu);
      const oklchMatches = html.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu);
      for (const m of oklchMatches) {
        expect(isVioletSlopHue(Number(m[1]))).toBe(false);
      }
    }
  });
});
