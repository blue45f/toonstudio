import { describe, expect, it, vi } from "vitest";

import { pickPromoLocaleVoice, previewPromoLocaleText } from "./promo-locale-voice";

import type { NaturalSpeechVoice } from "../../../shared/lib/natural-browser-speech";

function voice(name: string, lang: string, extra: Partial<NaturalSpeechVoice> = {}): NaturalSpeechVoice {
  return { name, lang, voiceURI: name, localService: true, ...extra };
}

describe("로케일 음성 고르기", () => {
  it("이 기기에 설치된 음성만 쓰고 원격 음성은 문구가 밖으로 나갈 수 있어 뺀다", () => {
    const voices = [voice("Cloud English", "en-US", { localService: false }), voice("Unknown origin", "en-US", { localService: undefined })];
    expect(pickPromoLocaleVoice(voices, "en")).toBeNull();
    expect(pickPromoLocaleVoice([...voices, voice("Local English", "en-US")], "en")?.name).toBe("Local English");
  });

  it("언어가 같은 음성만 고르고 없으면 null이다", () => {
    const voices = [voice("Korean", "ko-KR"), voice("Japanese", "ja-JP")];
    expect(pickPromoLocaleVoice(voices, "ja")?.name).toBe("Japanese");
    expect(pickPromoLocaleVoice(voices, "en")).toBeNull();
    expect(pickPromoLocaleVoice(voices, "fr")).toBeNull();
    expect(pickPromoLocaleVoice([], "en")).toBeNull();
    // 앞 두 글자가 같아도 다른 언어(fil ↔ fi)는 섞이지 않는다.
    expect(pickPromoLocaleVoice([voice("Finnish", "fi-FI")], "fil")).toBeNull();
  });

  it("지역이 있는 로케일은 같은 지역 음성을 먼저 쓰고, 없으면 같은 언어의 다른 지역을 쓴다", () => {
    const voices = [voice("US", "en-US"), voice("GB", "en-GB")];
    expect(pickPromoLocaleVoice(voices, "en-GB")?.name).toBe("GB");
    expect(pickPromoLocaleVoice(voices, "en-US")?.name).toBe("US");
    expect(pickPromoLocaleVoice([voice("US", "en-US")], "en-GB")?.name).toBe("US");
  });

  it("간체·번체 로케일은 같은 쪽 지역 음성을 먼저 쓴다", () => {
    const voices = [voice("Taiwan", "zh-TW"), voice("China", "zh-CN"), voice("Hong Kong", "zh-HK")];
    expect(pickPromoLocaleVoice(voices, "zh-Hans")?.name).toBe("China");
    expect(pickPromoLocaleVoice(voices, "zh-Hant")?.name).toBe("Taiwan");
    // 번체는 타이완 → 홍콩 순으로 우선하고, 같은 쪽 음성이 없으면 같은 언어의 다른 중국어 음성으로 대신한다.
    expect(pickPromoLocaleVoice([voice("Hong Kong", "zh-HK"), voice("China", "zh-CN")], "zh-Hant")?.name).toBe("Hong Kong");
    expect(pickPromoLocaleVoice([voice("Taiwan", "zh-TW")], "zh-Hans")?.name).toBe("Taiwan");
  });

  it("언더스코어·대소문자가 달라도 같은 태그로 본다", () => {
    expect(pickPromoLocaleVoice([voice("Android style", "en_US")], "en-us")?.name).toBe("Android style");
    expect(pickPromoLocaleVoice([voice("Upper", "JA-jp")], "ja")?.name).toBe("Upper");
  });

  it("같은 점수면 기본 음성, 그다음 이름순이라 결과가 늘 같다", () => {
    const voices = [voice("Zed", "en-US"), voice("Alpha", "en-GB"), voice("Default", "en-AU", { default: true })];
    expect(pickPromoLocaleVoice(voices, "en")?.name).toBe("Default");
    expect(pickPromoLocaleVoice(voices.filter((value) => !value.default), "en")?.name).toBe("Alpha");
    expect(pickPromoLocaleVoice([...voices].reverse(), "en")?.name).toBe("Default");
  });

  it("입력 목록을 바꾸지 않는다", () => {
    const voices = [voice("B", "en-US"), voice("A", "en-US")];
    const snapshot = voices.map((value) => value.name);
    pickPromoLocaleVoice(voices, "en");
    expect(voices.map((value) => value.name)).toEqual(snapshot);
  });
});

describe("번역 자막 미리듣기", () => {
  class FakeUtterance {
    lang = "";
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: SpeechSynthesisVoice | null = null;
    onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
    constructor(readonly text: string) {}
  }
  function fakeScope() {
    const spoken: FakeUtterance[] = [];
    const synthesis = {
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
    return {
      spoken,
      synthesis,
      scope: {
        speechSynthesis: synthesis,
        SpeechSynthesisUtterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
        requestAnimationFrame: vi.fn(() => 1),
        cancelAnimationFrame: vi.fn(),
        performance: { now: () => 0 },
      },
    };
  }
  const selected = { name: "Local English", lang: "en-US", voiceURI: "local-en", localService: true, default: false } as SpeechSynthesisVoice;

  it("한국어 발음 보정 없이 문구를 그대로, 고른 음성의 언어로 읽는다", async () => {
    const { spoken, scope } = fakeScope();
    const onEnd = vi.fn();
    const session = previewPromoLocaleText("  Use AI\n   now  ", selected, { onEnd, onError: vi.fn() }, scope);
    expect(session?.plan).toHaveLength(1);
    expect(spoken).toHaveLength(1);
    // "AI"가 "에이 아이"로 바뀌면 영어 음성이 이상하게 읽는다.
    expect(spoken[0]?.text).toBe("Use AI now");
    expect(spoken[0]?.lang).toBe("en-US");
    expect(spoken[0]?.voice).toBe(selected);
    expect(spoken[0]?.rate).toBe(1);
    spoken[0]?.onend?.();
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
  });

  it("빈 문구는 읽지 않는다", () => {
    const { spoken, scope } = fakeScope();
    expect(previewPromoLocaleText("  \n ", selected, { onEnd: vi.fn(), onError: vi.fn() }, scope)).toBeNull();
    expect(spoken).toHaveLength(0);
  });

  it("음성 합성을 쓸 수 없으면 null이다", () => {
    expect(previewPromoLocaleText("Hello", selected, { onEnd: vi.fn(), onError: vi.fn() }, {})).toBeNull();
  });

  it("재생 오류를 알리고, 취소하면 완료로 알리지 않는다", () => {
    const first = fakeScope();
    const onError = vi.fn();
    previewPromoLocaleText("Hello", selected, { onEnd: vi.fn(), onError }, first.scope);
    first.spoken[0]?.onerror?.({ error: "synthesis-failed" } as SpeechSynthesisErrorEvent);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);

    const second = fakeScope();
    const onEnd = vi.fn();
    const session = previewPromoLocaleText("Hello", selected, { onEnd, onError: vi.fn() }, second.scope);
    session?.cancel();
    second.spoken[0]?.onend?.();
    expect(onEnd).not.toHaveBeenCalled();
    expect(second.synthesis.cancel).toHaveBeenCalled();
  });

  it("읽는 시간은 글자 수에 비례하되 최소 길이를 둔다", () => {
    const { scope } = fakeScope();
    const short = previewPromoLocaleText("Hi", selected, { onEnd: vi.fn(), onError: vi.fn() }, scope);
    const long = previewPromoLocaleText("a".repeat(80), selected, { onEnd: vi.fn(), onError: vi.fn() }, scope);
    expect(short?.plan[0]?.estimatedSpeechMs).toBe(360);
    expect(long?.plan[0]?.estimatedSpeechMs).toBe(10_000);
  });
});
