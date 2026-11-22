// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioErgonomicsSettingsSection } from "../ergonomics/StudioErgonomicsSettingsSection";
import { resetStudioErgonomicsStoreForTests } from "../ergonomics/studio-ergonomics-preferences";

import {
  CoalescedPointerCadenceProfiler,
  PEN_DELTA_MAX_CLAMP_MS,
  PEN_PREDICTION_MAX_MS,
  PEN_PREDICTION_MIN_MS,
  PEN_SPIKE_THRESHOLD_MS,
  clampPenDeltaMs,
  detectPenOsFamily,
  evaluatePenPalmGuard,
  predictCatmullRomPoint,
  resetSharedPenCadenceProfilerForTests,
  type CoalescedPointerEventLike,
  type PenPointerSampleInput,
} from "./pen-cadence-latency-tuner";
import { StudioPenCadenceBadge } from "./StudioPenCadenceBadge";
import { isPalmContactSize, shouldRejectPalmTouch } from "./touch-gesture-model";

function makePenSample(
  timeStamp: number,
  x: number,
  y: number,
  overrides: Partial<PenPointerSampleInput> = {},
): PenPointerSampleInput {
  return {
    pointerId: 11,
    pointerType: "pen",
    timeStamp,
    clientX: x,
    clientY: y,
    width: 1,
    height: 1,
    pressure: 0.6,
    ...overrides,
  };
}

function makeCoalescedEvent(
  samples: readonly PenPointerSampleInput[],
): CoalescedPointerEventLike {
  const last = samples[samples.length - 1] ?? makePenSample(0, 0, 0);
  return {
    ...last,
    getCoalescedEvents: () => samples,
  };
}

function feedCadenceStream(
  profiler: CoalescedPointerCadenceProfiler,
  stepMs: number,
  batches: number,
  samplesPerBatch: number,
  startT = 100,
): number {
  let t = startT;
  let stepIndex = 0;
  for (let b = 0; b < batches; b += 1) {
    const batch: PenPointerSampleInput[] = [];
    for (let s = 0; s < samplesPerBatch; s += 1) {
      batch.push(makePenSample(t, stepIndex * 4, Math.sin(stepIndex * 0.2) * 12));
      t += stepMs;
      stepIndex += 1;
    }
    profiler.ingestEvent(makeCoalescedEvent(batch));
  }
  return t;
}

describe("CoalescedPointerCadenceProfiler & OS 120Hz/240Hz 자동 튜너", () => {
  beforeEach(() => {
    resetSharedPenCadenceProfilerForTests();
    resetStudioErgonomicsStoreForTests();
  });

  afterEach(() => {
    cleanup();
    resetSharedPenCadenceProfilerForTests();
    resetStudioErgonomicsStoreForTests();
    vi.restoreAllMocks();
  });

  it("getCoalescedEvents 타임스탬프로 60Hz/90Hz/120Hz/240Hz 기기 프로파일을 정확히 판별한다", () => {
    const cases: readonly { readonly stepMs: number; readonly expectedHz: 60 | 90 | 120 | 240; readonly perBatch: number }[] = [
      { stepMs: 16.67, expectedHz: 60, perBatch: 1 },
      { stepMs: 11.11, expectedHz: 90, perBatch: 2 },
      { stepMs: 8.33, expectedHz: 120, perBatch: 2 },
      { stepMs: 4.17, expectedHz: 240, perBatch: 4 },
    ];

    for (const testCase of cases) {
      const profiler = new CoalescedPointerCadenceProfiler({
        osOverride: "android",
      });
      feedCadenceStream(profiler, testCase.stepMs, 10, testCase.perBatch);
      const snap = profiler.getSnapshot();

      expect(snap.calibrationState).toBe("locked");
      expect(snap.detectedTierHz).toBe(testCase.expectedHz);
      expect(snap.detectedProfileId).toBe(`${testCase.expectedHz}hz`);
      expect(snap.coalescedSupported).toBe(true);
      expect(snap.coalescedBatchAverage).toBe(testCase.perBatch);
      expect(snap.p95JitterMs).not.toBeNull();
      expect(snap.p95JitterMs ?? 99).toBeLessThan(0.5);
      expect(snap.recommendedPredictionWindowMs).toBeGreaterThanOrEqual(PEN_PREDICTION_MIN_MS);
      expect(snap.recommendedPredictionWindowMs).toBeLessThanOrEqual(PEN_PREDICTION_MAX_MS);
    }
  });

  it("getCoalescedEvents가 예외를 던지거나 빈 배열을 반환해도 원본 이벤트로 안전 폴백한다", () => {
    const profiler = new CoalescedPointerCadenceProfiler({ osOverride: "windows" });
    for (let i = 0; i < 12; i += 1) {
      const brokenEvent: CoalescedPointerEventLike = {
        ...makePenSample(100 + i * 8.33, i * 3, i * 2),
        getCoalescedEvents: () => {
          if (i % 2 === 0) {
            throw new Error("webview coalesced unsupported");
          }
          return [];
        },
      };
      profiler.ingestEvent(brokenEvent);
    }

    const snap = profiler.getSnapshot();
    expect(snap.calibrationState).toBe("locked");
    expect(snap.detectedTierHz).toBe(120);
    expect(snap.coalescedSupported).toBe(false);
  });

  it("OS 계열(iPadOS·Android·Windows·macOS)을 판별하고 지터 급증 시 Catmull-Rom 예측 창을 0ms까지 자동 감쇠한다", () => {
    expect(
      detectPenOsFamily({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe("ipados");
    expect(detectPenOsFamily({ userAgent: "Mozilla/5.0 (Linux; Android 15; SM-X920)" })).toBe("android");
    expect(detectPenOsFamily({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe("windows");
    expect(
      detectPenOsFamily({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe("macos");

    // 안정적인 120Hz에서 iPadOS는 Android보다 보수적인 예측 창을 추천한다.
    const ipadProfiler = new CoalescedPointerCadenceProfiler({ osOverride: "ipados" });
    const androidProfiler = new CoalescedPointerCadenceProfiler({ osOverride: "android" });
    feedCadenceStream(ipadProfiler, 8.33, 6, 2);
    feedCadenceStream(androidProfiler, 8.33, 6, 2);

    const ipadSnap = ipadProfiler.getSnapshot();
    const androidSnap = androidProfiler.getSnapshot();
    expect(ipadSnap.recommendedPredictionWindowMs).toBeLessThan(
      androidSnap.recommendedPredictionWindowMs,
    );
    expect(ipadSnap.osPolicy.preferPointerRawUpdate).toBe(false);
    expect(androidSnap.osPolicy.preferPointerRawUpdate).toBe(true);

    // 극심한 P95 지터(4ms/24ms 교차)에서는 오버슈트 방지를 위해 예측 창을 0ms로 내린다.
    const jitteryProfiler = new CoalescedPointerCadenceProfiler({ osOverride: "windows" });
    let t = 100;
    for (let i = 0; i < 20; i += 1) {
      const step = i % 2 === 0 ? 4 : 24;
      jitteryProfiler.ingestEvent(makePenSample(t, i * 5, i * 2));
      t += step;
    }
    const jitterySnap = jitteryProfiler.getSnapshot();
    expect(jitterySnap.calibrationState).toBe("locked");
    expect(jitterySnap.p95JitterMs ?? 0).toBeGreaterThan(5);
    expect(jitterySnap.recommendedPredictionWindowMs).toBe(0);
    expect(jitterySnap.recommendation.healthTone).toBe("bad");
  });

  it("히든 디테일(#005): 탭 복귀·슬립 직후 Δt > 200ms 스파이크를 maxClampMs=24ms로 차단하고 주사율·예측을 보호한다", () => {
    expect(PEN_SPIKE_THRESHOLD_MS).toBe(200);
    expect(PEN_DELTA_MAX_CLAMP_MS).toBe(24);

    const spikeClamp = clampPenDeltaMs(640);
    expect(spikeClamp).toEqual({
      rawDeltaMs: 640,
      clampedDeltaMs: 24,
      spikeDetected: true,
      clamped: true,
    });

    const hitchClamp = clampPenDeltaMs(42);
    expect(hitchClamp).toEqual({
      rawDeltaMs: 42,
      clampedDeltaMs: 24,
      spikeDetected: false,
      clamped: true,
    });

    const profiler = new CoalescedPointerCadenceProfiler({ osOverride: "ipados" });
    const afterStreamT = feedCadenceStream(profiler, 4.17, 6, 4, 1000);

    // 480ms 탭 복귀 스파이크 주입
    const resumeResult = profiler.ingestEvent(
      makePenSample(afterStreamT + 480, 400, 220),
    );

    expect(resumeResult.spikeClampedCount).toBe(1);
    expect(resumeResult.lastEffectiveDeltaMs).toBe(24);
    expect(resumeResult.lastSpikeRawMs).toBeGreaterThan(200);
    // 복귀 직후에는 이전 스트로크 속도로 점프 보간하지 않고 현재 복귀 좌표를 그대로 유지한다.
    expect(resumeResult.predictedPoint).toEqual({
      x: 400,
      y: 220,
      t: afterStreamT + 480,
    });

    const snap = profiler.getSnapshot();
    expect(snap.spikeClampedCount).toBe(1);
    expect(snap.detectedTierHz).toBe(240);
    expect(snap.p95JitterMs ?? 99).toBeLessThan(0.5);
  });

  it("히든 디테일(#005): 손바닥 접촉 크기 및 스타일러스 활성 시간창 팜 리젝션 가드를 통합한다", () => {
    // touch-gesture-model 레벨 크기 기반 팜 판정
    expect(
      isPalmContactSize({ pointerType: "touch", width: 42, height: 38 }),
    ).toBe(true);
    expect(
      isPalmContactSize({ pointerType: "touch", width: 14, height: 14 }),
    ).toBe(false);
    expect(
      shouldRejectPalmTouch(
        { pointerId: 2, x: 50, y: 50, t: 900, pointerType: "touch", width: 32, height: 30 },
        null,
      ),
    ).toBe(true);

    // 프로파일러 통합 팜 가드: 대형 접촉 팜 + 펜 활성창 내 터치 팜 + 마우스 비-펜 무시
    const profiler = new CoalescedPointerCadenceProfiler({ osOverride: "android" });

    const palmSizeGuard = evaluatePenPalmGuard(
      makePenSample(100, 80, 80, { pointerType: "touch", width: 46, height: 40 }),
      null,
    );
    expect(palmSizeGuard).toEqual({
      rejected: true,
      isPalm: true,
      reason: "palm-contact-size",
    });

    // 대형 팜 터치 먼저 유입 → 팜 거부 카운트 증가, 펜 표본은 오염되지 않음
    const r1 = profiler.ingestEvent(
      makePenSample(100, 80, 80, { pointerType: "touch", width: 46, height: 40 }),
    );
    expect(r1.acceptedCount).toBe(0);
    expect(r1.palmRejectedCount).toBe(1);

    // 실제 펜 입력 1건 후 120ms 뒤 일반 크기 터치 → 펜 활성창 팜 리젝션
    profiler.ingestEvent(makePenSample(200, 10, 10));
    const r2 = profiler.ingestEvent(
      makePenSample(320, 90, 90, { pointerType: "touch", width: 12, height: 12 }),
    );
    expect(r2.acceptedCount).toBe(0);
    expect(r2.palmRejectedCount).toBe(1);

    // 마우스 이벤트는 팜이 아닌 non-pen으로 무시
    const r3 = profiler.ingestEvent(
      makePenSample(330, 100, 100, { pointerType: "mouse" }),
    );
    expect(r3.acceptedCount).toBe(0);
    expect(r3.palmRejectedCount).toBe(0);
    expect(r3.nonPenIgnoredCount).toBe(1);

    const snap = profiler.getSnapshot();
    expect(snap.totalAcceptedSamples).toBe(1);
    expect(snap.palmRejectedCount).toBe(2);
    expect(snap.lastPalmRejectReason).toBe("palm-pen-window");
  });

  it("Catmull-Rom 예측 좌표는 부드럽게 전진하되 최대 변위 상한을 넘지 않는다", () => {
    const smooth = predictCatmullRomPoint(
      [
        { x: 0, y: 0, t: 0 },
        { x: 8, y: 2, t: 4.17 },
        { x: 16, y: 5, t: 8.34 },
        { x: 24, y: 9, t: 12.51 },
      ],
      1.8,
    );
    expect(smooth).not.toBeNull();
    expect(smooth?.x ?? 0).toBeGreaterThan(24);
    expect(smooth?.x ?? 999).toBeLessThan(32);

    // 극단적 고속 점프에서도 최대 변위 24px 상한을 지킨다.
    const clamped = predictCatmullRomPoint(
      [
        { x: 0, y: 0, t: 0 },
        { x: 100, y: 0, t: 4 },
        { x: 200, y: 0, t: 8 },
        { x: 400, y: 0, t: 12 },
      ],
      6,
    );
    expect(Math.hypot((clamped?.x ?? 0) - 400, clamped?.y ?? 0)).toBeLessThanOrEqual(24.001);
  });
});

describe("StudioPenCadenceBadge Calm Atelier UI 및 인체공학 설정 연동", () => {
  beforeEach(() => {
    resetSharedPenCadenceProfilerForTests();
    resetStudioErgonomicsStoreForTests();
  });

  afterEach(() => {
    cleanup();
    resetSharedPenCadenceProfilerForTests();
    resetStudioErgonomicsStoreForTests();
    vi.restoreAllMocks();
  });

  it("기본 접힘 1줄 배지로 렌더링되고 Calm Atelier 접근성·토큰 규율과 순수 메모리 계약을 지킨다", () => {
    const localSetSpy = vi.spyOn(Storage.prototype, "setItem");
    const profiler = new CoalescedPointerCadenceProfiler({ osOverride: "ipados" });
    const onRecommendationChange = vi.fn();

    render(
      <StudioPenCadenceBadge
        profiler={profiler}
        onRecommendationChange={onRecommendationChange}
      />,
    );

    const root = document.querySelector('[data-studio-pen-cadence-badge="true"]');
    expect(root).not.toBeNull();
    expect(root?.className).toContain("[word-break:keep-all]");
    expect(root?.getAttribute("data-studio-pen-cadence-expanded")).toBe("false");

    const toggle = screen.getByRole("button", { name: /펜 지연 튜너/u });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.className).toContain("min-h-11");
    expect(toggle.className).toContain("motion-reduce:transition-none");
    expect(document.querySelector('[data-studio-pen-cadence-panel="true"]')).toBeNull();

    // 240Hz Coalesced 스트림 주입 시 접힘 배지 pill이 즉시 실측값으로 갱신된다.
    act(() => {
      feedCadenceStream(profiler, 4.17, 6, 4, 200);
    });
    expect(toggle.textContent).toContain("240Hz");
    expect(toggle.textContent).toContain("예측");
    expect(onRecommendationChange).toHaveBeenCalled();

    // 클릭해 펼치면 상세 지표·OS 프로파일 버튼·실측 패드·초기화 버튼이 열린다.
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[data-studio-pen-cadence-panel="true"]')).not.toBeNull();
    expect(document.querySelector('[data-studio-pen-cadence-hz="true"]')?.className).toContain(
      "tabular-nums",
    );

    // OS 프로파일 전환(Android) 시 예측 창이 재계산되고 브라우저 저장소는 0회 호출된다.
    const androidBtn = screen.getByRole("button", { name: "Android" });
    expect(androidBtn.className).toContain("min-h-11");
    fireEvent.click(androidBtn);
    expect(androidBtn.getAttribute("aria-pressed")).toBe("true");
    expect(profiler.getSnapshot().osFamily).toBe("android");

    // 실측 초기화 버튼 동작 확인
    const resetBtn = screen.getByRole("button", { name: "측정 초기화" });
    expect(resetBtn.className).toContain("min-h-11");
    fireEvent.click(resetBtn);
    expect(profiler.getSnapshot().calibrationState).toBe("idle");
    expect(toggle.textContent).toContain("측정 대기");

    // ₩0 순수 메모리: localStorage/sessionStorage 쓰기 0건
    expect(localSetSpy).not.toHaveBeenCalled();
  });

  it("StudioErgonomicsSettingsSection 안에 기본 접힘 상태로 자연스럽게 연결되어 있다", () => {
    render(<StudioErgonomicsSettingsSection />);

    const badgeToggle = screen.getByRole("button", { name: /펜 지연 튜너/u });
    expect(badgeToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(badgeToggle);
    const probePad = screen.getByRole("region", { name: "펜 주사율 실측 패드" });
    expect(probePad).toBeTruthy();

    // 실측 패드에 손바닥 크기 touch 이벤트 유입 시 팜 차단 카운터가 실시간 증가한다.
    fireEvent.pointerDown(probePad, {
      pointerId: 9,
      pointerType: "touch",
      clientX: 40,
      clientY: 20,
      width: 48,
      height: 44,
    });
    expect(document.querySelector('[data-studio-pen-cadence-guards="true"]')?.textContent).toContain(
      "0건 · 1건",
    );
  });
});
