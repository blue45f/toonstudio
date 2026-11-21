// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  BEGINNER_ONBOARDING_STEPS,
  BEGINNER_ONBOARDING_STORAGE_KEY,
  MOBILE_THUMB_DOCK_ACTIONS,
  MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX,
  advanceOnboardingStep,
  completeCurrentOnboardingStep,
  createInitialOnboardingState,
  getOnboardingProgressSummary,
  jumpToOnboardingStep,
  loadBeginnerOnboardingState,
  resolveMobileThumbDockLayout,
  restartBeginnerOnboarding,
  retreatOnboardingStep,
  saveBeginnerOnboardingState,
  skipBeginnerOnboarding,
} from "../beginner-onboarding-mobile-dock";
import {
  buildStudioSpeculationRulesSpec,
  classifyWebtoonFontCategory,
  createComputePressureMonitor,
  createStudioAudioWorkletProcessor,
  detectChromeNextGenCapabilities,
  getComputePressurePolicy,
  injectSpeculationRules,
  openStudioReferencePipWindow,
  probeCanvasHdrDisplayP3,
  probeWebNnRuntime,
  queryWebtoonLocalFonts,
  runScopedViewTransition,
  sampleScreenColorWithEyeDropper,
  yieldToMainThread,
  type ChromeNextGenRuntimeEnv,
  type ComputePressureState,
  type PressureRecordLike,
} from "../chrome-nextgen-apis";
import StudioNextGenWebPlatformHub from "../StudioNextGenWebPlatformHub";
import {
  DEFAULT_DEMO_CUTS_PANELS,
  buildCutsTimelinePlan,
  buildCutsWebVtt,
  evaluateCutsPanelTransform,
  exportCutsMovingWebtoon,
  negotiateWebCodecsVideoConfig,
} from "../webcodecs-cuts-exporter";

function createFullChromeMockEnv(): ChromeNextGenRuntimeEnv {
  class MockEyeDropper {
    async open() {
      return { sRGBHex: "oklch(0.75 0.16 205)" };
    }
  }
  class MockPressureObserver {
    observe() {
      return Promise.resolve();
    }
    disconnect() {
      return undefined;
    }
  }
  const win = {
    matchMedia: (query: string) => ({
      matches: query.includes("p3") || query.includes("high"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
    EyeDropper: MockEyeDropper,
    queryLocalFonts: async () => [
      { family: "Pretendard", fullName: "Pretendard Bold", postscriptName: "Pretendard-Bold", style: "Bold" },
      { family: "Black Han Sans", fullName: "Black Han Sans", postscriptName: "BlackHanSans", style: "Regular" },
    ],
    documentPictureInPicture: {
      requestWindow: async () =>
        ({
          document: document.implementation.createHTMLDocument("PiP"),
          close: vi.fn(),
        }) as unknown as Window,
    },
    AudioWorkletNode: function MockAudioWorkletNode() {
      return undefined;
    },
    VideoEncoder: function MockVideoEncoder() {
      return undefined;
    },
    VideoFrame: function MockVideoFrame() {
      return undefined;
    },
    scheduler: { yield: async () => undefined },
    PressureObserver: MockPressureObserver,
  } as unknown as NonNullable<ChromeNextGenRuntimeEnv["win"]>;

  const doc = {
    documentElement: document.createElement("html"),
    head: document.createElement("head"),
    createElement: (tag: string) => document.createElement(tag),
    startViewTransition: (arg: (() => void) | { update: () => void }) => {
      const fn = typeof arg === "function" ? arg : arg.update;
      fn();
      return { finished: Promise.resolve() };
    },
  } as unknown as NonNullable<ChromeNextGenRuntimeEnv["doc"]>;

  const nav = {
    ml: {
      createContext: async () => ({}),
    },
  } as unknown as NonNullable<ChromeNextGenRuntimeEnv["nav"]>;

  return {
    win,
    doc,
    nav,
    scriptSupports: (type: string) => type === "speculationrules",
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("chrome-nextgen-apis (Chrome 2025–2026 통합 및 폴백)", () => {
  it("차세대 Chrome 환경에서 10종 이상 API를 탐지하고 nextgen-full 등급을 반환한다", () => {
    const env = createFullChromeMockEnv();
    const originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;
    (globalThis as Record<string, unknown>).AudioContext = class {
      baseLatency = 0.006;
      close = async () => undefined;
    };
    try {
      const caps = detectChromeNextGenCapabilities(env);
      expect(caps.viewTransitions).toBe(true);
      expect(caps.schedulerYield).toBe(true);
      expect(caps.computePressure).toBe(true);
      expect(caps.eyeDropper).toBe(true);
      expect(caps.localFontAccess).toBe(true);
      expect(caps.documentPictureInPicture).toBe(true);
      expect(caps.webnn).toBe(true);
      expect(caps.canvasHdrDisplayP3).toBe(true);
      expect(caps.speculationRules).toBe(true);
      expect(caps.audioWorklet).toBe(true);
      expect(caps.webCodecs).toBe(true);
      expect(caps.tier).toBe("nextgen-full");
      expect(caps.supportedCount).toBe(caps.totalCount);
    } finally {
      (globalThis as Record<string, unknown>).AudioContext = originalAudioContext;
    }
  });

  it("미지원 브라우저 환경에서는 안전하게 compat-fallback 등급으로 판정한다", () => {
    const emptyEnv: ChromeNextGenRuntimeEnv = {
      win: {} as NonNullable<ChromeNextGenRuntimeEnv["win"]>,
      doc: {} as NonNullable<ChromeNextGenRuntimeEnv["doc"]>,
      nav: {} as NonNullable<ChromeNextGenRuntimeEnv["nav"]>,
      scriptSupports: () => false,
    };
    const caps = detectChromeNextGenCapabilities(emptyEnv);
    expect(caps.supportedCount).toBe(0);
    expect(caps.tier).toBe("compat-fallback");
    expect(caps.features.every((f) => f.fallbackLabelKo.length > 0)).toBe(true);
  });

  it("runScopedViewTransition은 startViewTransition을 실행하고 완료 후 data-vt-scope를 정리한다", async () => {
    const env = createFullChromeMockEnv();
    let updated = false;
    const res = runScopedViewTransition(
      () => {
        updated = true;
      },
      { scopeName: "hub-tab", transitionTypes: ["slide"], env },
    );
    expect(res.usedViewTransition).toBe(true);
    expect(res.reason).toBe("applied");
    expect(updated).toBe(true);
    await res.finished;
    expect(env.doc?.documentElement.dataset.vtScope).toBeUndefined();
  });

  it("runScopedViewTransition은 prefers-reduced-motion: reduce일 때 애니메이션 없이 즉시 적용한다", async () => {
    const env = createFullChromeMockEnv();
    const startSpy = vi.fn();
    const reducedEnv: ChromeNextGenRuntimeEnv = {
      ...env,
      win: {
        ...env.win,
        matchMedia: (q: string) => ({ matches: q.includes("prefers-reduced-motion") }),
      } as unknown as NonNullable<ChromeNextGenRuntimeEnv["win"]>,
      doc: {
        ...env.doc,
        startViewTransition: startSpy,
      } as unknown as NonNullable<ChromeNextGenRuntimeEnv["doc"]>,
    };
    let ran = false;
    const res = runScopedViewTransition(() => {
      ran = true;
    }, { env: reducedEnv });
    expect(res.usedViewTransition).toBe(false);
    expect(res.reason).toBe("reduced-motion");
    expect(ran).toBe(true);
    expect(startSpy).not.toHaveBeenCalled();
    await res.finished;
  });

  it("yieldToMainThread는 scheduler.yield()를 우선 사용하고 미지원 시 타이머 폴백으로 전환한다", async () => {
    const yieldSpy = vi.fn(async () => undefined);
    const nativeRes = await yieldToMainThread({
      env: {
        win: { scheduler: { yield: yieldSpy } } as unknown as NonNullable<ChromeNextGenRuntimeEnv["win"]>,
      },
    });
    expect(nativeRes.mechanism).toBe("scheduler-yield");
    expect(yieldSpy).toHaveBeenCalledTimes(1);

    const fallbackRes = await yieldToMainThread({
      env: { win: {} as NonNullable<ChromeNextGenRuntimeEnv["win"]> },
    });
    expect(fallbackRes.mechanism).toBe("timeout-fallback");
  });

  it("yieldToMainThread는 이미 취소된 AbortSignal이면 AbortError를 던진다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(yieldToMainThread({ signal: controller.signal })).rejects.toThrow();
  });

  it("Compute Pressure 상태별 정책은 부하가 높아질수록 워커 수와 FPS를 단계적으로 낮춘다", () => {
    const states: ComputePressureState[] = ["nominal", "fair", "serious", "critical"];
    const policies = states.map((s) => getComputePressurePolicy(s));
    expect(policies[0].maxConcurrentWorkers).toBeGreaterThan(policies[1].maxConcurrentWorkers);
    expect(policies[1].maxConcurrentWorkers).toBeGreaterThan(policies[2].maxConcurrentWorkers);
    expect(policies[2].maxConcurrentWorkers).toBeGreaterThan(policies[3].maxConcurrentWorkers);
    expect(policies[0].targetFps).toBe(60);
    expect(policies[3].targetFps).toBe(15);
  });

  it("createComputePressureMonitor는 PressureObserver 이벤트를 구독하고 disconnect로 해제한다", () => {
    const holder: { cb: ((records: readonly PressureRecordLike[]) => void) | null } = { cb: null };
    const disconnectSpy = vi.fn();
    class SpyPressureObserver {
      constructor(cb: (records: readonly PressureRecordLike[]) => void) {
        holder.cb = cb;
      }
      observe() {
        return Promise.resolve();
      }
      disconnect() {
        disconnectSpy();
      }
    }
    const observed: ComputePressureState[] = [];
    const monitor = createComputePressureMonitor(
      (policy) => observed.push(policy.state),
      {
        env: {
          win: { PressureObserver: SpyPressureObserver } as unknown as NonNullable<ChromeNextGenRuntimeEnv["win"]>,
        },
      },
    );
    expect(monitor.supported).toBe(true);
    holder.cb?.([{ state: "serious" }]);
    holder.cb?.([{ state: "critical" }]);
    expect(observed).toEqual(["serious", "critical"]);
    expect(monitor.getState()).toBe("critical");
    monitor.disconnect();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it("sampleScreenColorWithEyeDropper는 네이티브 스포이드·취소·폴백 팔레트를 모두 처리한다", async () => {
    const env = createFullChromeMockEnv();
    const native = await sampleScreenColorWithEyeDropper({ env });
    expect(native.ok).toBe(true);
    expect(native.mode).toBe("eyedropper");

    const cancelEnv: ChromeNextGenRuntimeEnv = {
      win: {
        EyeDropper: class {
          async open() {
            throw new DOMException("cancelled", "AbortError");
          }
        },
      } as unknown as NonNullable<ChromeNextGenRuntimeEnv["win"]>,
    };
    const cancelled = await sampleScreenColorWithEyeDropper({ env: cancelEnv });
    expect(cancelled.ok).toBe(false);
    expect(cancelled.mode).toBe("cancelled");

    const fallback = await sampleScreenColorWithEyeDropper({
      fallbackSwatchId: "sunset-coral",
      env: { win: {} as NonNullable<ChromeNextGenRuntimeEnv["win"]> },
    });
    expect(fallback.ok).toBe(true);
    expect(fallback.mode).toBe("fallback-palette");
    expect(fallback.sampledColor).toContain("oklch(");
  });

  it("queryWebtoonLocalFonts는 설치 폰트를 중복 제거·자동 분류하고 미지원 시 프리셋을 반환한다", async () => {
    expect(classifyWebtoonFontCategory({ family: "Pretendard" })).toBe("korean-dialogue");
    expect(classifyWebtoonFontCategory({ family: "Black Han Sans" })).toBe("webtoon-sfx");
    expect(classifyWebtoonFontCategory({ family: "Nanum Myeongjo" })).toBe("editorial");

    const env = createFullChromeMockEnv();
    const localRes = await queryWebtoonLocalFonts({ category: "webtoon-sfx", env });
    expect(localRes.source).toBe("local-font-access");
    expect(localRes.fonts).toHaveLength(1);
    expect(localRes.fonts[0].family).toBe("Black Han Sans");

    const fallbackRes = await queryWebtoonLocalFonts({
      category: "korean-dialogue",
      env: { win: {} as NonNullable<ChromeNextGenRuntimeEnv["win"]> },
    });
    expect(fallbackRes.source).toBe("fallback-presets");
    expect(fallbackRes.fonts.length).toBeGreaterThan(0);
  });

  it("openStudioReferencePipWindow는 Document PiP 창에 안전하게 체크리스트를 구성하고 미지원 시 폴백한다", async () => {
    const env = createFullChromeMockEnv();
    const opened = await openStudioReferencePipWindow({
      title: "웹툰 검수 창",
      checklistItems: ["모바일 글자 크기 확인", "컷츠 자막 확인"],
      env,
    });
    expect(opened.opened).toBe(true);
    expect(opened.mode).toBe("document-pip");
    expect(opened.pipWindow?.document.body.textContent).toContain("모바일 글자 크기 확인");
    opened.close();

    const fallback = await openStudioReferencePipWindow({
      title: "웹툰 검수 창",
      checklistItems: ["항목 1"],
      env: { win: {} as NonNullable<ChromeNextGenRuntimeEnv["win"]> },
    });
    expect(fallback.opened).toBe(false);
    expect(fallback.mode).toBe("inline-fallback");
  });

  it("probeWebNnRuntime은 NPU→GPU→CPU 순서로 시도하고 미지원 시 WebGPU/WASM으로 폴백한다", async () => {
    const gpuOnlyEnv: ChromeNextGenRuntimeEnv = {
      nav: {
        ml: {
          createContext: async (opts?: { deviceType?: "gpu" | "npu" | "cpu" }) => {
            if (opts?.deviceType === "npu") throw new Error("no npu");
            return {};
          },
        },
      } as unknown as NonNullable<ChromeNextGenRuntimeEnv["nav"]>,
    };
    const gpuRes = await probeWebNnRuntime(gpuOnlyEnv);
    expect(gpuRes.supported).toBe(true);
    expect(gpuRes.preferredDevice).toBe("gpu");

    const fallbackRes = await probeWebNnRuntime({
      nav: {} as NonNullable<ChromeNextGenRuntimeEnv["nav"]>,
    });
    expect(fallbackRes.supported).toBe(false);
    expect(fallbackRes.fallbackBackend).toBe("wasm-simd");
  });

  it("buildStudioSpeculationRulesSpec과 injectSpeculationRules는 안전 경로만 허용하고 스크립트를 주입한다", () => {
    const spec = buildStudioSpeculationRulesSpec({
      prerenderPaths: ["/studio", "https://evil.example/steal", "/admin/delete"],
      prefetchPaths: ["/market/browse", "//protocol-relative.example"],
    });
    expect(spec.prerender[0].urls).toEqual(["/studio"]);
    expect(spec.prefetch[0].urls).toEqual(["/market/browse"]);

    const env = createFullChromeMockEnv();
    const applied = injectSpeculationRules(spec, env);
    expect(applied.applied).toBe(true);
    const script = env.doc?.head.querySelector("script[type='speculationrules']");
    expect(script?.textContent).toContain("/studio");

    const unsupported = injectSpeculationRules(spec, {
      doc: env.doc,
      scriptSupports: () => false,
    });
    expect(unsupported.applied).toBe(false);
    expect(unsupported.fallback).toBe("link-prefetch");
  });

  it("probeCanvasHdrDisplayP3와 createStudioAudioWorkletProcessor가 안전하게 동작한다", async () => {
    const env = createFullChromeMockEnv();
    const hdr = probeCanvasHdrDisplayP3(env);
    expect(hdr.displayP3).toBe(true);
    expect(hdr.hdrDisplay).toBe(true);
    expect(hdr.recommendedColorSpace).toBe("display-p3");

    const audio = await createStudioAudioWorkletProcessor(
      { sfxGain: 1.5, bgmGain: -0.2, duckingDb: -10 },
      { win: {} as NonNullable<ChromeNextGenRuntimeEnv["win"]> },
    );
    expect(audio.config.sfxGain).toBe(1);
    expect(audio.config.bgmGain).toBe(0);
    expect(audio.triggerSfxPreview("sfx-1").played).toBe(true);
    await audio.dispose();
  });
});

describe("webcodecs-cuts-exporter (T-045 30초 컷츠 무빙 웹툰)", () => {
  it("30초 컷츠 타임라인·패럴랙스 키프레임·자막·효과음 싱크를 정확히 생성한다", () => {
    const plan = buildCutsTimelinePlan(DEFAULT_DEMO_CUTS_PANELS, {
      targetDurationSec: 30,
      width: 1080,
      height: 1920,
      fps: 30,
      preferredCodec: "av1",
    });
    expect(plan.totalDurationSec).toBe(30);
    expect(plan.totalFrames).toBe(900);
    expect(plan.segments).toHaveLength(5);
    expect(plan.segments.at(-1)?.endSec).toBe(30);
    expect(plan.subtitleCues).toHaveLength(5);
    expect(plan.sfxCues).toHaveLength(5);
    expect(plan.keyframes.length).toBe(15);

    const tStart = evaluateCutsPanelTransform("parallax-depth", 0, 0.8);
    const tEnd = evaluateCutsPanelTransform("parallax-depth", 1, 0.8);
    expect(tEnd.foregroundParallaxPx).toBeGreaterThan(tStart.foregroundParallaxPx);
    expect(tEnd.backgroundParallaxPx).toBeLessThan(tStart.backgroundParallaxPx);
  });

  it("Compute Pressure가 critical이면 컷츠 목표 FPS를 15fps 이하로 자동 보호 조절한다", () => {
    const plan = buildCutsTimelinePlan(DEFAULT_DEMO_CUTS_PANELS, {
      targetDurationSec: 30,
      fps: 60,
      pressureState: "critical",
    });
    expect(plan.fps).toBe(15);
    expect(plan.totalFrames).toBe(450);
  });

  it("buildCutsWebVtt가 표준 WEBVTT 타임스탬프와 대사 자막을 생성한다", () => {
    const plan = buildCutsTimelinePlan(DEFAULT_DEMO_CUTS_PANELS, { targetDurationSec: 30 });
    const vtt = buildCutsWebVtt(plan);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:06.000");
    expect(vtt).toContain("비 온 뒤 옥상");
  });

  it("negotiateWebCodecsVideoConfig는 AV1/H.264를 우선 협상하고 미지원 시 스토리보드로 폴백한다", async () => {
    class MockEncoder {
      static async isConfigSupported(cfg: { codec: string }) {
        return { supported: cfg.codec.startsWith("avc1.") };
      }
    }
    const h264Fallback = await negotiateWebCodecsVideoConfig(
      { preferredCodec: "av1" },
      { win: { VideoEncoder: MockEncoder } as unknown as NonNullable<ChromeNextGenRuntimeEnv["win"]> },
    );
    expect(h264Fallback.supported).toBe(true);
    expect(h264Fallback.backend).toBe("webcodecs");
    expect(h264Fallback.codecKey).toBe("h264");

    const noCodec = await negotiateWebCodecsVideoConfig(
      { preferredCodec: "av1" },
      { win: {} as NonNullable<ChromeNextGenRuntimeEnv["win"]> },
    );
    expect(noCodec.supported).toBe(false);
    expect(noCodec.backend).toBe("storyboard-json-fallback");
  });

  it("exportCutsMovingWebtoon은 WebCodecs 인코딩 중 scheduler.yield() 양보와 프레임 해제를 보장한다", async () => {
    const encodedFrames: number[] = [];
    const closedFrames: number[] = [];
    const yieldSpy = vi.fn(async () => undefined);
    class MockVideoEncoder {
      private outputCb: (chunk: { byteLength: number }) => void;
      constructor(init: { output: (chunk: { byteLength: number }) => void }) {
        this.outputCb = init.output;
      }
      static async isConfigSupported() {
        return { supported: true };
      }
      configure() {
        return undefined;
      }
      encode() {
        encodedFrames.push(1);
        this.outputCb({ byteLength: 4096 });
      }
      async flush() {
        return undefined;
      }
      close() {
        return undefined;
      }
    }

    const progressValues: number[] = [];
    const result = await exportCutsMovingWebtoon(
      DEFAULT_DEMO_CUTS_PANELS,
      { targetDurationSec: 30, preferredCodec: "av1", pressureState: "serious" },
      {
        maxSimulatedFrames: 6,
        createFrame: (idx) => ({ close: () => closedFrames.push(idx) }),
        onProgress: (p) => progressValues.push(p.percent),
        env: {
          win: {
            VideoEncoder: MockVideoEncoder,
            scheduler: { yield: yieldSpy },
          } as unknown as NonNullable<ChromeNextGenRuntimeEnv["win"]>,
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.backend).toBe("webcodecs");
    expect(result.encodedFrames).toBe(6);
    expect(encodedFrames).toHaveLength(6);
    expect(closedFrames).toEqual([0, 1, 2, 3, 4, 5]);
    expect(yieldSpy).toHaveBeenCalledTimes(6);
    expect(progressValues.at(-1)).toBe(100);
  });

  it("exportCutsMovingWebtoon은 미지원 환경에서도 스토리보드 JSON과 WebVTT 패키지를 완성한다", async () => {
    const result = await exportCutsMovingWebtoon(DEFAULT_DEMO_CUTS_PANELS, {
      targetDurationSec: 15,
    });
    expect(result.ok).toBe(true);
    expect(result.backend).toBe("storyboard-json-fallback");
    expect(result.storyboardJson).toContain("toonstudio.cuts-storyboard/1");
    expect(result.webVtt).toContain("WEBVTT");
  });
});

describe("beginner-onboarding-mobile-dock (T-054 60초 가이드 · T-057 모바일 독)", () => {
  it("60초 첫 1컷 온보딩은 정확히 5단계 합계 60초로 구성된다", () => {
    expect(BEGINNER_ONBOARDING_STEPS).toHaveLength(5);
    const totalSec = BEGINNER_ONBOARDING_STEPS.reduce((sum, step) => sum + step.durationSec, 0);
    expect(totalSec).toBe(60);
  });

  it("온보딩 상태 머신은 단계 완료·이전/다음 이동·건너뛰기·다시 보기와 영속화를 지원한다", () => {
    let state = createInitialOnboardingState("2026-11-21T00:00:00Z");
    state = completeCurrentOnboardingStep(state);
    state = completeCurrentOnboardingStep(state);
    expect(getOnboardingProgressSummary(state).completedCount).toBe(2);
    expect(getOnboardingProgressSummary(state).remainingSeconds).toBe(35);

    expect(saveBeginnerOnboardingState(window.localStorage, state)).toBe(true);
    expect(window.localStorage.getItem(BEGINNER_ONBOARDING_STORAGE_KEY)).toBeTruthy();

    const restored = loadBeginnerOnboardingState(window.localStorage);
    expect(restored.completedStepIds).toEqual(["select-cut", "place-background"]);

    const jumped = jumpToOnboardingStep(restored, "save-cuts");
    expect(jumped.currentIndex).toBe(4);
    expect(retreatOnboardingStep(jumped).currentIndex).toBe(3);
    expect(advanceOnboardingStep(retreatOnboardingStep(jumped)).currentIndex).toBe(4);

    const skipped = skipBeginnerOnboarding(restored);
    expect(getOnboardingProgressSummary(skipped).isSkipped).toBe(true);

    const restarted = restartBeginnerOnboarding();
    expect(getOnboardingProgressSummary(restarted).completedCount).toBe(0);
    expect(getOnboardingProgressSummary(restarted).remainingSeconds).toBe(60);
  });

  it("모바일(320px·390px·430px) 5대 액션 독은 넘침 없이 모든 버튼이 44×44px 이상 터치 타깃을 만족한다", () => {
    expect(MOBILE_THUMB_DOCK_ACTIONS).toHaveLength(5);
    for (const viewportWidthPx of [320, 390, 430]) {
      const layout = resolveMobileThumbDockLayout({
        viewportWidthPx,
        safeAreaBottomPx: 24,
        handedness: "right",
      });
      expect(layout.clampedMobileRange).toBe(true);
      expect(layout.overflowsViewport).toBe(false);
      expect(layout.meetsMinimumTouchTarget).toBe(true);
      expect(layout.hitWidthPx).toBeGreaterThanOrEqual(MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX);
      expect(layout.hitHeightPx).toBeGreaterThanOrEqual(MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX);
      expect(layout.safeAreaInsetCss).toContain("env(safe-area-inset-bottom)");
    }
  });
});

describe("StudioNextGenWebPlatformHub UI 및 CSS 계약", () => {
  it("초보자용 3분할 탭과 차세대 웹 도구 버튼들이 작동한다", async () => {
    render(
      <StudioNextGenWebPlatformHub
        projectId="proj-nextgen-1"
        locale="ko"
        manuscriptWidth={800}
        manuscriptHeight={1280}
      />,
    );

    expect(screen.getByTestId("nextgen-web-platform-hub")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "차세대 성능·도구" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "30초 컷츠 영상" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "60초 첫 1컷 가이드" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("nextgen-pressure-serious"));
    expect(screen.getByTestId("nextgen-pressure-serious").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("nextgen-eyedropper-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("nextgen-status-banner").textContent).toContain("팔레트");
    });

    fireEvent.click(screen.getByTestId("nextgen-load-fonts-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("nextgen-font-list").textContent).toContain("Pretendard");
    });

    fireEvent.click(screen.getByTestId("nextgen-pip-btn"));
    fireEvent.click(screen.getByTestId("nextgen-audio-btn"));
    fireEvent.click(screen.getByTestId("nextgen-webnn-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("nextgen-panel-platform").textContent).toContain("AI 엔진");
    });
  });

  it("30초 컷츠 영상 탭에서 원클릭 컷츠 내보내기 진행률과 결과를 표시한다", async () => {
    render(<StudioNextGenWebPlatformHub projectId="proj-cuts-1" locale="ko" />);

    fireEvent.click(screen.getByTestId("nextgen-tab-cuts"));
    expect(screen.getByTestId("nextgen-panel-cuts")).toBeTruthy();

    fireEvent.click(screen.getByTestId("nextgen-cuts-export-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("nextgen-cuts-result").textContent).toContain("30초 컷츠");
    });
    expect(screen.getByTestId("nextgen-cuts-progress").textContent).toContain("100%");
  });

  it("60초 첫 1컷 가이드 탭에서 단계 완료·건너뛰기·다시 보기와 모바일 5대 액션 독이 연동된다", () => {
    render(<StudioNextGenWebPlatformHub projectId="proj-guide-1" locale="ko" />);

    fireEvent.click(screen.getByTestId("nextgen-tab-beginner"));
    expect(screen.getByTestId("nextgen-panel-beginner")).toBeTruthy();
    expect(screen.getByTestId("nextgen-spotlight-hint").textContent).toContain("① 컷 선택");

    fireEvent.click(screen.getByTestId("nextgen-onboarding-complete-step"));
    expect(screen.getByTestId("nextgen-spotlight-hint").textContent).toContain("② 3D·배경 얹기");

    fireEvent.click(screen.getByTestId("nextgen-mobile-action-export"));
    expect(screen.getByTestId("nextgen-spotlight-hint").textContent).toContain("⑤ PNG·컷츠 저장");

    fireEvent.click(screen.getByTestId("nextgen-onboarding-skip"));
    expect(screen.getByTestId("nextgen-panel-beginner").textContent).toContain("건너뛰었어요");

    fireEvent.click(screen.getByTestId("nextgen-onboarding-restart"));
    expect(screen.getByTestId("nextgen-spotlight-hint").textContent).toContain("① 컷 선택");
  });

  it("nextgen-web-platform.css는 차세대 CSS 기능과 OKLCH·모션 감소 규칙을 준수하고 원시 HEX/transition:all을 금지한다", () => {
    const cssPath = resolve(
      process.cwd(),
      "apps/web/src/domains/creator/nextgen-web-platform/nextgen-web-platform.css",
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain("oklch(");
    expect(css).toContain("@supports (animation-timeline: view())");
    expect(css).toContain("@supports (anchor-name: --nextgen-spotlight-trigger)");
    expect(css).toContain("@starting-style");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/transition\s*:\s*all\b/iu);
  });
});
