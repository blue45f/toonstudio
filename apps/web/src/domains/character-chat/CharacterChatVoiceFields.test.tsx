/**
 * 작가용 낭독 선호 입력 테스트 — 음성 후보(기기 안 우선), 범위 제한 입력, 저장 호환(기본값은 필드를 만들지
 * 않음), 미리 듣기, 미지원 브라우저, 이 기기에 없는 저장 음성의 보존. 가짜 SpeechSynthesis를 주입한다.
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterChatManagePage } from "./CharacterChatManagePage";
import {
  createFakeSpeech,
  fakeVoice,
  installFakeSpeechOnWindow,
  type FakeSpeech,
} from "./__tests__/fake-speech-synthesis";
import { useCharacterChatStore } from "./character-chat-store";
import type { CharacterChatProfileDraft } from "./character-chat-types";
import {
  CHARACTER_CHAT_VOICE_PITCH_MAX,
  CHARACTER_CHAT_VOICE_RATE_MAX,
  CHARACTER_CHAT_VOICE_RATE_MIN,
} from "./character-chat-voice";
import { resetCharacterChatVoiceSettingsForTests } from "./character-chat-voice-settings";

vi.mock("./use-character-chat-engine", () => ({
  useCharacterChatEngine: () => ({
    ready: false,
    engine: { id: "test-engine", generateReply: vi.fn(async () => ({ ok: true, text: "" })) },
  }),
}));

const LOCAL = fakeVoice({ name: "기기 한국어", localService: true });
const ONLINE = fakeVoice({ name: "Microsoft SunHi Online (Natural) - Korean", localService: false });
const ENGLISH = fakeVoice({ name: "English", lang: "en-US" });

let fake: FakeSpeech | null = null;
let uninstall: (() => void) | null = null;

function installSpeech(voices: readonly SpeechSynthesisVoice[] = [LOCAL, ONLINE, ENGLISH]): FakeSpeech {
  fake = createFakeSpeech({ voices });
  uninstall = installFakeSpeechOnWindow(fake);
  return fake;
}

function renderNewForm() {
  return render(
    <MemoryRouter initialEntries={["/character-chat/manage?new=1"]}>
      <CharacterChatManagePage />
    </MemoryRouter>,
  );
}

function fillRequiredFields() {
  // 입력 이름에는 라벨 옆의 도움말 문구가 이어 붙으므로 앞부분으로 찾는다.
  fireEvent.change(screen.getByRole("textbox", { name: /^캐릭터 이름 \*/ }), { target: { value: "서연" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^작품 이름 \*/ }), { target: { value: "달빛 도서관" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^성격 \*/ }), { target: { value: "조용하고 책을 좋아한다." } });
  fireEvent.change(screen.getByRole("textbox", { name: /^말투 \*/ }), { target: { value: "차분한 존댓말" } });
}

function submitForm() {
  fireEvent.click(screen.getByRole("button", { name: "캐릭터 챗 만들기" }));
}

function voiceFieldset(): HTMLElement {
  return screen.getByRole("group", { name: "음성 낭독 (선택)" });
}

function sliderNamed(name: RegExp): HTMLInputElement {
  const element = within(voiceFieldset()).getByRole("slider", { name });
  if (!(element instanceof HTMLInputElement)) throw new Error("슬라이더가 input 요소가 아니다");
  return element;
}

function rateSlider(): HTMLInputElement {
  return sliderNamed(/말하는 속도/);
}

function pitchSlider(): HTMLInputElement {
  return sliderNamed(/목소리 높낮이/);
}

/** 낭독 상태 안내 영역 — `<output>`처럼 role=status를 암묵적으로 갖는 요소와 구분해 aria-live로 찾는다. */
function liveStatus(): HTMLElement {
  const region = within(voiceFieldset())
    .getAllByRole("status")
    .find((element: HTMLElement) => element.getAttribute("aria-live") === "polite");
  if (!region) throw new Error("낭독 상태 안내 영역이 없다");
  return region;
}

function savedProfile() {
  const profile = useCharacterChatStore.getState().profiles.find((item) => item.characterName === "서연");
  if (!profile) throw new Error("저장된 프로필이 없다");
  return profile;
}

beforeEach(() => {
  window.localStorage.clear();
  resetCharacterChatVoiceSettingsForTests();
  useCharacterChatStore.getState().resetForTests();
});

afterEach(() => {
  cleanup();
  uninstall?.();
  uninstall = null;
  fake = null;
});

describe("낭독 선호 입력", () => {
  it("편집기에 음성 낭독 묶음이 기본값과 함께 나타나고 음성 파일을 만들지 않는다고 알린다", () => {
    installSpeech();
    renderNewForm();
    const group = within(voiceFieldset());
    expect((group.getByLabelText("읽는 음성") as HTMLSelectElement).value).toBe("");
    expect((group.getByLabelText("음색 힌트") as HTMLSelectElement).value).toBe("neutral");
    expect(rateSlider().value).toBe("1");
    expect(pitchSlider().value).toBe("1");
    expect(group.getByText(/음성 파일은 만들지도 저장하지도 않아요/)).toBeTruthy();
  });

  it("후보는 기기 안 한국어 음성뿐이고, 온라인 음성은 보기를 켰을 때만 더해진다", () => {
    installSpeech();
    renderNewForm();
    const group = within(voiceFieldset());
    const select = group.getByLabelText("읽는 음성") as HTMLSelectElement;
    const optionTexts = () => Array.from(select.options).map((option) => option.textContent ?? "");

    expect(optionTexts().some((text) => text.includes("기기 한국어") && text.includes("이 기기 안"))).toBe(true);
    expect(optionTexts().some((text) => text.includes("SunHi"))).toBe(false);
    expect(optionTexts().some((text) => text.includes("English"))).toBe(false);

    const online = group.getByRole("switch", { name: "온라인 음성도 보기" });
    expect(online.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(online);

    const withOnline = optionTexts().find((text) => text.includes("SunHi"));
    expect(withOnline).toContain("온라인(원격)");
  });

  it("고른 음성·음색·속도·높낮이가 프로필에 저장된다", () => {
    installSpeech();
    renderNewForm();
    fillRequiredFields();
    const group = within(voiceFieldset());
    fireEvent.change(group.getByLabelText("읽는 음성"), { target: { value: "기기 한국어" } });
    fireEvent.change(group.getByLabelText("음색 힌트"), { target: { value: "female" } });
    fireEvent.change(rateSlider(), { target: { value: "0.9" } });
    fireEvent.change(pitchSlider(), { target: { value: "1.1" } });
    submitForm();

    expect(savedProfile().voice).toEqual({ voiceURI: "기기 한국어", gender: "female", rate: 0.9, pitch: 1.1 });
  });

  it("속도·높낮이 입력은 정해진 범위를 속성으로 알리고 저장 값도 범위 안이다", () => {
    installSpeech();
    renderNewForm();
    fillRequiredFields();
    const rate = rateSlider();
    const pitch = pitchSlider();
    expect(rate.min).toBe(String(CHARACTER_CHAT_VOICE_RATE_MIN));
    expect(rate.max).toBe(String(CHARACTER_CHAT_VOICE_RATE_MAX));
    expect(pitch.max).toBe(String(CHARACTER_CHAT_VOICE_PITCH_MAX));
    // 값 표시는 슬라이더와 함께 읽히는 텍스트로도 제공한다.
    fireEvent.change(rate, { target: { value: "1.2" } });
    expect(rate.getAttribute("aria-valuetext")).toBe("1.20×");
    submitForm();
    const voice = savedProfile().voice;
    expect(voice?.rate).toBeLessThanOrEqual(CHARACTER_CHAT_VOICE_RATE_MAX);
    expect(voice?.rate).toBeGreaterThanOrEqual(CHARACTER_CHAT_VOICE_RATE_MIN);
  });

  it("낭독 선호를 건드리지 않으면 프로필에 voice 필드가 생기지 않는다(기존 저장 모양 유지)", () => {
    installSpeech();
    renderNewForm();
    fillRequiredFields();
    submitForm();
    expect("voice" in savedProfile()).toBe(false);
  });

  it("미리 듣기는 입력 중인 값(속도·높낮이)과 인사말로 읽고, 다시 누르면 멈춘다", () => {
    const speech = installSpeech();
    renderNewForm();
    fireEvent.change(screen.getByRole("textbox", { name: /^첫 인사말/ }), { target: { value: "어서 와요. 책 향기가 좋죠." } });
    const group = within(voiceFieldset());
    fireEvent.change(rateSlider(), { target: { value: "1.2" } });

    fireEvent.click(group.getByRole("button", { name: "미리 듣기" }));
    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0]?.text).toContain("어서 와요");
    expect(speech.spoken[0]?.rate).toBeGreaterThan(1.1);

    fireEvent.click(group.getByRole("button", { name: "미리듣기 정지" }));
    expect(group.getByRole("button", { name: "미리 듣기" })).toBeTruthy();
    expect(speech.synthesis.cancel).toHaveBeenCalled();
  });

  it("미리 듣는 중 편집기를 닫으면 소리가 멈춘다", () => {
    const speech = installSpeech();
    renderNewForm();
    fireEvent.click(within(voiceFieldset()).getByRole("button", { name: "미리 듣기" }));
    const cancelsBefore = speech.synthesis.cancel.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "폼 닫기" }));

    expect(screen.queryByRole("group", { name: "음성 낭독 (선택)" })).toBeNull();
    expect(speech.synthesis.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore);
  });

  it("미리 듣기가 안 되는 이유(한국어 음성 없음)는 눈에 보이는 안내로 알린다", () => {
    const speech = installSpeech([ENGLISH]);
    renderNewForm();
    const group = within(voiceFieldset());
    fireEvent.click(group.getByRole("button", { name: "미리 듣기" }));
    expect(speech.synthesis.speak).not.toHaveBeenCalled();
    const status = liveStatus();
    expect(status.textContent).toContain("한국어 음성을 찾지 못했어요");
    expect(status.className).not.toContain("sr-only");
  });

  it("음성 낭독을 지원하지 않는 브라우저에서는 음성 선택과 미리 듣기를 막고 값은 그대로 저장한다", () => {
    renderNewForm();
    fillRequiredFields();
    const group = within(voiceFieldset());
    expect(group.getByRole("note").textContent).toContain("음성 낭독을 지원하지 않아");
    expect((group.getByLabelText("읽는 음성") as HTMLSelectElement).disabled).toBe(true);
    expect(group.queryByRole("button", { name: "미리 듣기" })).toBeNull();

    fireEvent.change(group.getByLabelText("음색 힌트"), { target: { value: "male" } });
    fireEvent.change(rateSlider(), { target: { value: "1.1" } });
    submitForm();
    expect(savedProfile().voice).toMatchObject({ gender: "male", rate: 1.1 });
  });

  it("저장된 음성이 이 기기에 있지만 온라인 음성이라 숨겨졌다면 그 사유를 알리고, 보기를 켜면 실제 음성으로 고른다", () => {
    installSpeech([LOCAL, ONLINE]);
    const onlineName = "Microsoft SunHi Online (Natural) - Korean";
    useCharacterChatStore.getState().createProfile({
      characterName: "서연",
      workTitle: "달빛 도서관",
      workSlug: "",
      authorName: "",
      description: "",
      personality: "조용하다.",
      speechStyle: "존댓말",
      worldview: "",
      greeting: "",
      forbiddenTopics: [],
      appearanceHint: "",
      avatarUrl: "",
      canonSheetId: "",
      chatEnabled: false,
      voice: { voiceURI: onlineName, gender: "female", rate: 1, pitch: 1 },
    });
    render(
      <MemoryRouter initialEntries={["/character-chat/manage"]}>
        <CharacterChatManagePage />
      </MemoryRouter>,
    );
    const card = screen.getByText("서연").closest("li");
    if (!card) throw new Error("내 캐릭터 카드가 없다");
    fireEvent.click(within(card).getByRole("button", { name: "설정 수정" }));

    const group = within(voiceFieldset());
    const select = group.getByLabelText("읽는 음성") as HTMLSelectElement;
    expect(select.value).toBe(onlineName);
    expect(select.selectedOptions[0]?.textContent).toContain("온라인 음성이라 숨겨 둠");
    expect(select.selectedOptions[0]?.textContent).not.toContain("이 기기에는 없음");

    fireEvent.click(group.getByRole("switch", { name: "온라인 음성도 보기" }));
    expect(select.value).toBe(onlineName);
    expect(select.selectedOptions[0]?.textContent).toContain("온라인(원격)");
    expect(Array.from(select.options).some((option) => option.textContent?.includes("저장된 음성"))).toBe(false);
  });

  it("이 기기에 없는 저장 음성은 선택지로 보존되어 수정 후 저장해도 사라지지 않는다", () => {
    installSpeech([LOCAL]);
    const draft: CharacterChatProfileDraft = {
      characterName: "서연",
      workTitle: "달빛 도서관",
      workSlug: "",
      authorName: "",
      description: "",
      personality: "조용하다.",
      speechStyle: "존댓말",
      worldview: "",
      greeting: "",
      forbiddenTopics: [],
      appearanceHint: "",
      avatarUrl: "",
      canonSheetId: "",
      chatEnabled: false,
      voice: { voiceURI: "다른 기기의 음성", gender: "male", rate: 1.1, pitch: 0.9 },
    };
    useCharacterChatStore.getState().createProfile(draft);

    render(
      <MemoryRouter initialEntries={["/character-chat/manage"]}>
        <CharacterChatManagePage />
      </MemoryRouter>,
    );
    const card = screen.getByText("서연").closest("li");
    if (!card) throw new Error("내 캐릭터 카드가 없다");
    fireEvent.click(within(card).getByRole("button", { name: "설정 수정" }));

    const group = within(voiceFieldset());
    const select = group.getByLabelText("읽는 음성") as HTMLSelectElement;
    expect(select.value).toBe("다른 기기의 음성");
    expect(select.selectedOptions[0]?.textContent).toContain("이 기기에는 없음");
    expect((group.getByLabelText("음색 힌트") as HTMLSelectElement).value).toBe("male");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "승인 캐논 저장" }));
    });
    expect(savedProfile().voice).toEqual({ voiceURI: "다른 기기의 음성", gender: "male", rate: 1.1, pitch: 0.9 });
  });
});
