// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_VOICE_COACH_COOLDOWN_MS,
  EARCON_CHORD_PROFILES,
  NEURAL_VOICE_PROVIDER_IDS,
  StudioVoiceCoachPanel,
  VOICE_COACH_EMOTION_TONES,
  VOICE_COACH_MOMENT_CATALOG,
  VOICE_COACH_MOMENT_IDS,
  VOICE_COACH_PERSONAS,
  VoiceCoachCooldownGuard,
  checkNeuralProviderAvailability,
  createDefaultNeuralProviderConfig,
  createVoiceCoachPlaybackController,
  getVoiceCoachMomentScript,
  planExpressiveUtterance,
  playCoachAcousticEarcon,
  synthesizeWithNeuralFallback,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
} from "./index";

const HANGUL_REGEX = /[가-힣ㄱ-ㅎㅏ-ㅣ]/u;

interface MockOscillatorRecord {
  startCalls: number;
  stopCalls: number;
  disconnectCalls: number;
  freqValues: number[];
  fireEnded: () => void;
}

interface MockGainRecord {
  disconnectCalls: number;
  values: number[];
}

interface MockFilterRecord {
  disconnectCalls: number;
  freqValues: number[];
}

function createMockAudioContext(initialState: AudioContextState = "running") {
  let state: AudioContextState = initialState;
  const oscillators: MockOscillatorRecord[] = [];
  const gains: MockGainRecord[] = [];
  const filters: MockFilterRecord[] = [];

  const makeParam = (sink: number[]) => ({
    value: 0,
    setValueAtTime: vi.fn((val: number) => {
      sink.push(val);
    }),
    linearRampToValueAtTime: vi.fn((val: number) => {
      sink.push(val);
    }),
    exponentialRampToValueAtTime: vi.fn((val: number) => {
      sink.push(val);
    }),
  });

  let resolveResume: (() => void) | null = null;
  const resume = vi.fn(
    () =>
      new Promise<void>((resolvePromise) => {
        resolveResume = () => {
          state = "running";
          resolvePromise();
        };
      }),
  );

  const ctx = {
    get state() {
      return state;
    },
    currentTime: 2.5,
    sampleRate: 44100,
    destination: {},
    resume,
    createGain: vi.fn(() => {
      const rec: MockGainRecord = { disconnectCalls: 0, values: [] };
      gains.push(rec);
      return {
        gain: makeParam(rec.values),
        connect: vi.fn(),
        disconnect: vi.fn(() => {
          rec.disconnectCalls += 1;
        }),
      };
    }),
    createBiquadFilter: vi.fn(() => {
      const rec: MockFilterRecord = { disconnectCalls: 0, freqValues: [] };
      filters.push(rec);
      return {
        type: "lowpass" as BiquadFilterType,
        frequency: makeParam(rec.freqValues),
        Q: makeParam([]),
        connect: vi.fn(),
        disconnect: vi.fn(() => {
          rec.disconnectCalls += 1;
        }),
      };
    }),
    createOscillator: vi.fn(() => {
      const freqValues: number[] = [];
      let onendedHandler: (() => void) | null = null;
      const rec: MockOscillatorRecord = {
        startCalls: 0,
        stopCalls: 0,
        disconnectCalls: 0,
        freqValues,
        fireEnded: () => {
          onendedHandler?.();
        },
      };
      oscillators.push(rec);
      return {
        type: "sine" as OscillatorType,
        frequency: makeParam(freqValues),
        get onended() {
          return onendedHandler;
        },
        set onended(fn: (() => void) | null) {
          onendedHandler = fn;
        },
        connect: vi.fn(),
        disconnect: vi.fn(() => {
          rec.disconnectCalls += 1;
        }),
        start: vi.fn(() => {
          rec.startCalls += 1;
        }),
        stop: vi.fn(() => {
          rec.stopCalls += 1;
        }),
      };
    }),
  } as unknown as AudioContext;

  return {
    ctx,
    oscillators,
    gains,
    filters,
    resume,
    finishResume: async () => {
      resolveResume?.();
      resolveResume = null;
      await Promise.resolve();
      await Promise.resolve();
    },
    setState: (next: AudioContextState) => {
      state = next;
    },
  };
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useI18n.getState().setLang("ko");
});

describe("1. 감정·호흡 운율 분할 엔진 (planExpressiveUtterance)", () => {
  it("한국어/영어 문장을 자연스러운 호흡 절(Clause)로 분할하고 절 사이에 미세 휴지(pauseMs)를 배치한다", () => {
    const koPlan = planExpressiveUtterance(
      "작업실에 오신 걸 환영해요. 급하게 그리지 않아도 괜찮아요, 먼저 편한 선 하나만 가볍게 그어 볼까요?",
      "warm-mentor",
      "warm-guide",
    );
    expect(koPlan.locale).toBe("ko");
    expect(koPlan.clauses.length).toBeGreaterThanOrEqual(3);
    expect(koPlan.clauses[0].pauseMs).toBeGreaterThanOrEqual(240);
    expect(koPlan.clauses[1].pauseMs).toBeGreaterThanOrEqual(150);
    expect(koPlan.clauses.at(-1)?.pauseMs).toBe(0);
    expect(koPlan.totalPauseMs).toBeGreaterThan(350);
    // 질문 종결 절은 자연스러운 상승 억양을 가진다.
    const lastClause = koPlan.clauses.at(-1);
    expect(lastClause?.punctuation).toBe("question");
    expect(lastClause?.pitch ?? 0).toBeGreaterThan(koPlan.clauses[0].pitch);

    const enPlan = planExpressiveUtterance(
      "Welcome back to the atelier. No need to rush, try laying down one relaxed line to warm up?",
      "warm-mentor",
      "warm-guide",
    );
    expect(enPlan.locale).toBe("en");
    expect(enPlan.clauses.length).toBeGreaterThanOrEqual(3);
    expect(enPlan.totalPauseMs).toBeGreaterThan(300);
  });

  it("5종 감정 톤에 따라 피치·속도·호흡 휴지가 뚜렷하게 차별화된다(단조 TTS 제거)", () => {
    const sample =
      "방금 그린 작업이 안전하게 저장되었어요. 원하시는 속도로 다음 컷을 이어가 보세요!";
    const celebrate = planExpressiveUtterance(sample, "warm-mentor", "celebrate");
    const calmFocus = planExpressiveUtterance(sample, "warm-mentor", "calm-focus");
    const gentleAlert = planExpressiveUtterance(sample, "warm-mentor", "gentle-alert");
    const creativeSpark = planExpressiveUtterance(sample, "warm-mentor", "creative-spark");
    const warmGuide = planExpressiveUtterance(sample, "warm-mentor", "warm-guide");

    expect(celebrate.averagePitch).toBeGreaterThan(calmFocus.averagePitch);
    expect(celebrate.averageRate).toBeGreaterThan(calmFocus.averageRate);
    expect(calmFocus.totalPauseMs).toBeGreaterThan(celebrate.totalPauseMs);
    expect(creativeSpark.averagePitch).toBeGreaterThan(gentleAlert.averagePitch);
    expect(warmGuide.averageRate).toBeGreaterThan(calmFocus.averageRate);

    // 한 문장 내에서도 모든 절의 피치가 동일한 기계적 단조로움이 아니어야 한다.
    const distinctPitches = new Set(celebrate.clauses.map((c) => c.pitch));
    expect(distinctPitches.size).toBeGreaterThan(1);
  });

  it("3종 페르소나별 기본 템포·호흡 여백과 Flux TTS 평문 정규화를 정확히 산출한다", () => {
    const text = "<b>원고 내보내기</b> 완료! 이제 독자에게 공개할 준비가 됐습니다.";
    const mentor = planExpressiveUtterance(text, "warm-mentor", "warm-guide");
    const director = planExpressiveUtterance(text, "director", "warm-guide");
    const assistant = planExpressiveUtterance(text, "calm-assistant", "warm-guide");

    expect(director.averageRate).toBeGreaterThan(assistant.averageRate);
    expect(assistant.totalPauseMs).toBeGreaterThan(director.totalPauseMs);
    expect(mentor.averagePitch).toBeGreaterThan(assistant.averagePitch);
    expect(mentor.plainTextForFlux).not.toContain("<b>");
    expect(mentor.plainTextForFlux).toContain("원고 내보내기");
  });

  it("10종 스튜디오 모멘트 × 3종 페르소나 KO/EN 대본이 완비되어 있고 EN 대본에는 한글이 0자다", () => {
    expect(VOICE_COACH_MOMENT_IDS).toHaveLength(10);
    expect(VOICE_COACH_PERSONAS).toHaveLength(3);
    expect(VOICE_COACH_EMOTION_TONES).toHaveLength(5);

    for (const momentId of VOICE_COACH_MOMENT_IDS) {
      const spec = VOICE_COACH_MOMENT_CATALOG[momentId];
      expect(HANGUL_REGEX.test(spec.labelEn)).toBe(false);
      for (const persona of VOICE_COACH_PERSONAS) {
        const ko = getVoiceCoachMomentScript(momentId, persona, "ko");
        const en = getVoiceCoachMomentScript(momentId, persona, "en");
        expect(ko.trim().length).toBeGreaterThan(12);
        expect(en.trim().length).toBeGreaterThan(12);
        expect(HANGUL_REGEX.test(en)).toBe(false);
      }
    }
  });
});

describe("2. Web Audio 어쿠스틱 이어콘 신시사이저 (누수 0건 & suspended 가드)", () => {
  it("5종 감정 톤별 마림바/셀레스타 화음을 생성하고 모든 오실레이터 onended 완료 시 노드를 100% disconnect한다", () => {
    for (const tone of VOICE_COACH_EMOTION_TONES) {
      const mock = createMockAudioContext("running");
      const recipe = EARCON_CHORD_PROFILES[tone];
      const handle = playCoachAcousticEarcon(tone, { audioContext: mock.ctx, volume: 0.75 });

      expect(handle.played).toBe(true);
      expect(handle.reason).toBe("played");
      expect(handle.noteCount).toBe(recipe.notes.length);
      // 각 음표마다 기음 + 배음 2개 오실레이터 생성
      expect(mock.oscillators).toHaveLength(recipe.notes.length * 2);
      expect(handle.activeNodeCount()).toBeGreaterThan(0);

      for (const osc of mock.oscillators) {
        expect(osc.startCalls).toBe(1);
        expect(osc.stopCalls).toBe(1);
        osc.fireEnded();
      }

      // 완료 후 누수 0건 검증: 오실레이터·게인·필터 모두 정확히 1회 disconnect
      expect(handle.activeNodeCount()).toBe(0);
      for (const osc of mock.oscillators) {
        expect(osc.disconnectCalls).toBe(1);
      }
      for (const gain of mock.gains) {
        expect(gain.disconnectCalls).toBe(1);
      }
      for (const filter of mock.filters) {
        expect(filter.disconnectCalls).toBe(1);
      }
    }
  });

  it("stop() 즉시 호출 시 재생 중인 오실레이터와 공유 노드를 누수 없이 전부 해제한다", () => {
    const mock = createMockAudioContext("running");
    const handle = playCoachAcousticEarcon("celebrate", { audioContext: mock.ctx, volume: 0.8 });
    expect(handle.played).toBe(true);
    expect(handle.activeNodeCount()).toBeGreaterThan(0);

    handle.stop();
    expect(handle.activeNodeCount()).toBe(0);
    for (const osc of mock.oscillators) {
      expect(osc.disconnectCalls).toBe(1);
    }
    for (const gain of mock.gains) {
      expect(gain.disconnectCalls).toBe(1);
    }
    for (const filter of mock.filters) {
      expect(filter.disconnectCalls).toBe(1);
    }
  });

  it("suspended 상태의 AudioContext에서는 노드를 쌓지 않고 resume()만 1회 안전 요청하며 복귀 후 정상 재생된다", async () => {
    const mock = createMockAudioContext("suspended");
    const first = playCoachAcousticEarcon("warm-guide", { audioContext: mock.ctx, volume: 0.7 });
    const second = playCoachAcousticEarcon("warm-guide", { audioContext: mock.ctx, volume: 0.7 });

    expect(first.played).toBe(false);
    expect(first.reason).toBe("suspended");
    expect(second.reason).toBe("suspended");
    expect(mock.oscillators).toHaveLength(0);
    expect(mock.gains).toHaveLength(0);
    expect(mock.resume).toHaveBeenCalledTimes(1);

    await mock.finishResume();
    const afterResume = playCoachAcousticEarcon("warm-guide", {
      audioContext: mock.ctx,
      volume: 0.7,
    });
    expect(afterResume.played).toBe(true);
    expect(mock.oscillators.length).toBeGreaterThan(0);
    afterResume.stop();
    expect(afterResume.activeNodeCount()).toBe(0);
  });

  it("closed 상태·무음·컨텍스트 부재 시 예외 없이 안전하게 무시한다", () => {
    const closedMock = createMockAudioContext("closed");
    expect(playCoachAcousticEarcon("calm-focus", { audioContext: closedMock.ctx }).reason).toBe(
      "closed",
    );
    expect(
      playCoachAcousticEarcon("calm-focus", { audioContext: createMockAudioContext().ctx, muted: true })
        .reason,
    ).toBe("muted");
    expect(playCoachAcousticEarcon("calm-focus", { audioContext: null }).reason).toBe(
      "no-audio-context",
    );
  });
});

describe("3. Anti-Nag 쿨다운 가드 & 드로잉 액티브 연기(Queue & Defer) & cancelAll()", () => {
  it("동일 상황은 기본 90초 쿨다운 동안 재안내를 억제하고 90초 경과 후 다시 허용한다", () => {
    let now = 10_000;
    const guard = new VoiceCoachCooldownGuard({ nowMs: () => now });

    const first = guard.requestMoment("offline-saved", { outputMode: "full-voice" });
    expect(first.decision).toBe("allow");

    now += 45_000;
    const suppressed = guard.requestMoment("offline-saved", { outputMode: "full-voice" });
    expect(suppressed.decision).toBe("suppressed-cooldown");
    expect(suppressed.remainingCooldownMs).toBe(45_000);

    now += DEFAULT_VOICE_COACH_COOLDOWN_MS - 45_000;
    const allowedAgain = guard.requestMoment("offline-saved", { outputMode: "full-voice" });
    expect(allowedAgain.decision).toBe("allow");
  });

  it("드로잉 액티브 중 도착한 안내는 즉시 울리지 않고 연기(defer)되며 획 종료 시 최우선 1건만 전달한다", () => {
    let now = 1_000;
    const guard = new VoiceCoachCooldownGuard({ nowMs: () => now });
    guard.setDrawingActive(true);

    const low = guard.requestMoment("brush-discovered", { outputMode: "earcon-captions" });
    now += 500;
    const high = guard.requestMoment("backup-reminder", { outputMode: "earcon-captions" });
    now += 500;
    const dupHigh = guard.requestMoment("backup-reminder", { outputMode: "earcon-captions" });

    expect(low.decision).toBe("deferred-drawing");
    expect(high.decision).toBe("deferred-drawing");
    expect(dupHigh.deferredQueueLength).toBe(2);

    // 드로잉 중에는 flush되지 않는다.
    expect(guard.flushNextDeferred()).toBeNull();

    // 드로잉 종료 후 최우선(important)인 backup-reminder 먼저 전달
    guard.setDrawingActive(false);
    const delivered = guard.flushNextDeferred();
    expect(delivered?.momentId).toBe("backup-reminder");
  });

  it("cancelAll()은 연기 큐를 비우고 등록된 모든 재생 중단 훅을 즉시 호출한다", () => {
    const guard = new VoiceCoachCooldownGuard({ nowMs: () => 5_000 });
    const hook = vi.fn();
    guard.registerCancelHook(hook);

    guard.setDrawingActive(true);
    guard.requestMoment("export-complete", { outputMode: "full-voice" });
    expect(guard.peekDeferred()).toHaveLength(1);

    const report = guard.cancelAll();
    expect(report.clearedDeferredCount).toBe(1);
    expect(report.cancelledGeneration).toBe(1);
    expect(guard.peekDeferred()).toHaveLength(0);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("PlaybackController가 절별 SpeechSynthesis 운율을 실행하고 cancelAll() 시 즉시 중단한다", () => {
    vi.useFakeTimers();
    const spoken: SpeechUtteranceLike[] = [];
    const mockSpeech: SpeechSynthesisLike = {
      speak: vi.fn((utt: SpeechUtteranceLike) => {
        spoken.push(utt);
      }),
      cancel: vi.fn(),
      getVoices: () => [],
    };
    const mockAudio = createMockAudioContext("running");
    const plan = planExpressiveUtterance(
      "로컬 저장 완료. 오프라인 상태에서도 계속 작업하세요!",
      "director",
      "calm-focus",
    );
    const controller = createVoiceCoachPlaybackController();
    const clauseIndices: number[] = [];

    const { earconHandle } = controller.playPlan(plan, {
      outputMode: "full-voice",
      volume: 0.7,
      earconEnabled: true,
      audioContext: mockAudio.ctx,
      speechSynthesis: mockSpeech,
      createUtterance: (text) => ({
        text,
        lang: "",
        pitch: 1,
        rate: 1,
        volume: 1,
        voice: null,
        onend: null,
        onerror: null,
      }),
      onClauseChange: (_clause, idx) => clauseIndices.push(idx),
    });

    expect(earconHandle.played).toBe(true);
    vi.advanceTimersByTime(300);
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe("ko-KR");
    expect(spoken[0].pitch).toBe(plan.clauses[0].pitch);
    expect(spoken[0].rate).toBe(plan.clauses[0].rate);

    // 첫 절 종료 → 호흡 휴지 후 두 번째 절 발화
    spoken[0].onend?.();
    vi.advanceTimersByTime(plan.clauses[0].pauseMs + 10);
    expect(spoken).toHaveLength(2);
    expect(clauseIndices).toContain(1);

    controller.cancelAll();
    expect(mockSpeech.cancel).toHaveBeenCalled();
    expect(earconHandle.activeNodeCount()).toBe(0);
    expect(controller.isPlaying()).toBe(false);
  });
});

describe("4. 외부 뉴럴 보이스(Deepgram/Gemini Live/ElevenLabs) 어댑터 안전 폴백", () => {
  it("API 키 미설정 시 모든 외부 뉴럴 공급자가 예외 없이 로컬 운율 엔진으로 안전 폴백한다", async () => {
    expect(NEURAL_VOICE_PROVIDER_IDS).toEqual([
      "local-expressive",
      "deepgram-flux",
      "deepgram-aura2",
      "gemini-live",
      "elevenlabs-byok",
    ]);

    for (const providerId of NEURAL_VOICE_PROVIDER_IDS) {
      const config = createDefaultNeuralProviderConfig(providerId);
      const avail = checkNeuralProviderAvailability(config);
      if (providerId === "local-expressive") {
        expect(avail.status).toBe("ready-local");
        expect(avail.usingLocalFallback).toBe(false);
      } else {
        expect(avail.status).toBe("fallback-local");
        expect(avail.usingLocalFallback).toBe(true);
      }

      const result = await synthesizeWithNeuralFallback(
        {
          text: "Your hologram preview is glowing and ready! Tilt the view slowly.",
          persona: "warm-mentor",
          tone: "creative-spark",
          locale: "en",
        },
        config,
      );
      expect(result.resolvedProvider).toBe("local-expressive");
      expect(result.plan.clauses.length).toBeGreaterThanOrEqual(2);
      expect(result.usedFallback).toBe(providerId !== "local-expressive");
    }
  });
});

describe("5. StudioVoiceCoachPanel UI, 접근성 자막(CC), Esc 즉시 멈춤 & EN 모드 한글 0자 검증", () => {
  it("기본 100% 옵트인(꺼짐)으로 시작하고 토글·페르소나 전환·감정 톤 미리듣기·Esc 멈춤이 정확히 동작한다", () => {
    const mockAudio = createMockAudioContext("running");
    render(<StudioVoiceCoachPanel audioContext={mockAudio.ctx} />);

    // 기본값: 꺼짐(옵트인)
    const optInSwitch = screen.getByTestId("vc-optin-switch");
    expect(optInSwitch.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("vc-mode-off").getAttribute("aria-pressed")).toBe("true");

    // 옵트인 켜기 → 기본 이어콘+자막 모드 활성화
    fireEvent.click(optInSwitch);
    expect(optInSwitch.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("vc-mode-earcon-captions").getAttribute("aria-pressed")).toBe("true");

    // 페르소나 전환 (연출 디렉터)
    fireEvent.click(screen.getByTestId("vc-persona-director"));
    expect(screen.getByTestId("vc-persona-director").getAttribute("aria-pressed")).toBe("true");

    // 감정 톤 미리듣기(성취 축하) → 이어콘 재생 + 실시간 자막 바(role=status aria-live=polite) 갱신
    fireEvent.click(screen.getByTestId("vc-tone-celebrate"));
    const liveCaptionBar = screen.getByTestId("vc-live-caption-bar");
    expect(liveCaptionBar.getAttribute("role")).toBe("status");
    expect(liveCaptionBar.getAttribute("aria-live")).toBe("polite");
    expect(liveCaptionBar.getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("vc-caption-text").textContent).toContain("최종 마스터 출력 완료");
    expect(mockAudio.oscillators.length).toBeGreaterThan(0);

    // Esc 키 즉시 멈춤 → 오디오 노드 해제 및 자막 정지 상태 전환
    fireEvent.keyDown(window, { key: "Escape" });
    expect(liveCaptionBar.getAttribute("data-active")).toBe("false");
    for (const osc of mockAudio.oscillators) {
      expect(osc.disconnectCalls).toBe(1);
    }

    // 속도·볼륨 슬라이더 조절
    const speedSlider = screen.getByTestId("vc-speed-slider") as HTMLInputElement;
    const volumeSlider = screen.getByTestId("vc-volume-slider") as HTMLInputElement;
    fireEvent.change(speedSlider, { target: { value: "1.15" } });
    fireEvent.change(volumeSlider, { target: { value: "45" } });
    expect(speedSlider.value).toBe("1.15");
    expect(volumeSlider.value).toBe("45");
  });

  it("드로잉 중 시뮬레이션 시 상황 안내를 연기하고 획 종료 시 자동 전달한다", () => {
    const mockAudio = createMockAudioContext("running");
    render(
      <StudioVoiceCoachPanel
        defaultOutputMode="earcon-captions"
        audioContext={mockAudio.ctx}
      />,
    );

    fireEvent.click(screen.getByTestId("vc-drawing-defer-toggle"));
    fireEvent.click(screen.getByTestId("vc-moment-backup-reminder"));
    expect(screen.getByTestId("vc-live-caption-bar").textContent).toContain("연기했습니다");

    // 드로잉 종료 → 연기된 backup-reminder 자동 전달
    fireEvent.click(screen.getByTestId("vc-drawing-defer-toggle"));
    expect(screen.getByTestId("vc-caption-text").textContent).toContain("백업 스냅샷");
  });

  it("EN 모드에서는 초기 렌더·페르소나 전환·감정 톤 미리듣기·모멘트 트리거·속성 어디에도 한글이 0자다", () => {
    useI18n.getState().setLang("en");
    const mockAudio = createMockAudioContext("running");
    const { container } = render(<StudioVoiceCoachPanel audioContext={mockAudio.ctx} />);

    const assertZeroHangulInDom = () => {
      const text = container.textContent ?? "";
      expect(HANGUL_REGEX.test(text), `Unexpected Hangul in text: ${text}`).toBe(false);
      const allElements = container.querySelectorAll("*");
      for (const el of allElements) {
        for (const attr of ["aria-label", "aria-valuetext", "title", "placeholder"]) {
          const val = el.getAttribute(attr);
          if (val) {
            expect(HANGUL_REGEX.test(val), `Unexpected Hangul in ${attr}: ${val}`).toBe(false);
          }
        }
      }
    };

    assertZeroHangulInDom();

    fireEvent.click(screen.getByTestId("vc-optin-switch"));
    fireEvent.click(screen.getByTestId("vc-mode-full-voice"));
    fireEvent.click(screen.getByTestId("vc-persona-calm-assistant"));
    fireEvent.click(screen.getByTestId("vc-tone-creative-spark"));
    fireEvent.click(screen.getByTestId("vc-provider-deepgram-flux"));
    fireEvent.click(screen.getByTestId("vc-moment-hologram-ready"));
    assertZeroHangulInDom();

    fireEvent.click(screen.getByTestId("vc-drawing-defer-toggle"));
    fireEvent.click(screen.getByTestId("vc-moment-focus-break-45m"));
    assertZeroHangulInDom();

    fireEvent.keyDown(window, { key: "Escape" });
    assertZeroHangulInDom();
  });

  it("CSS/TSX 위생 불변식: 원시 hex 0건, transition-all 0건, reduced-motion 준수, 전 파일 800줄 이하", () => {
    const files = readdirSync(__dirname).filter((name) => /\.(ts|tsx|css)$/u.test(name));
    const hexRegex = /#[0-9a-fA-F]{3,8}\b/u;
    const transitionAllRegex = /transition(?:-all|\s*:\s*all\b)/u;

    expect(files.length).toBeGreaterThanOrEqual(5);

    for (const file of files) {
      const content = readFileSync(resolve(__dirname, file), "utf8");
      const lines = content.split("\n").length;
      expect(lines, `${file} must be <= 800 lines (got ${lines})`).toBeLessThanOrEqual(800);

      if (file.endsWith(".tsx") || file.endsWith(".css")) {
        if (!file.endsWith(".test.tsx")) {
          expect(hexRegex.test(content), `${file} must contain 0 raw hex colors`).toBe(false);
          expect(transitionAllRegex.test(content), `${file} must contain 0 transition-all`).toBe(
            false,
          );
        }
      }
    }

    const cssContent = readFileSync(resolve(__dirname, "studio-voice-coach.css"), "utf8");
    expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
