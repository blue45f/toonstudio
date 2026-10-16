/**
 * 캐릭터 챗 응답 낭독 화면 테스트 — 메시지별 듣기/정지, 접근성 상태 안내, 자동 낭독(기본 꺼짐),
 * 이탈·언마운트 시 정지, 미지원 브라우저 안내, 음성 없음·온라인 음성 허용 흐름.
 * 가짜 SpeechSynthesis를 window에 주입하므로 실제 소리는 나지 않는다.
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterChatPage } from "./CharacterChatPage";
import {
  createFakeSpeech,
  fakeVoice,
  installFakeSpeechOnWindow,
  type FakeSpeech,
} from "./__tests__/fake-speech-synthesis";
import type { CharacterChatEngineInput, CharacterChatEngineResult } from "./character-chat-engine";
import { useCharacterChatStore } from "./character-chat-store";
import {
  resetCharacterChatVoiceSettingsForTests,
  updateCharacterChatVoiceSettings,
} from "./character-chat-voice-settings";

const engineState = vi.hoisted(() => ({
  ready: true,
  generateReply:
    vi.fn<(input: CharacterChatEngineInput) => Promise<CharacterChatEngineResult>>(
      async () => ({ ok: true, text: "" }),
    ),
}));

vi.mock("./use-character-chat-engine", () => ({
  useCharacterChatEngine: () => ({
    ready: engineState.ready,
    engine: { id: "test-engine", generateReply: engineState.generateReply },
  }),
}));

const LOCAL = fakeVoice({ name: "기기 한국어", localService: true });
const ONLINE = fakeVoice({ name: "Microsoft SunHi Online (Natural) - Korean", localService: false });
const ENGLISH = fakeVoice({ name: "English", lang: "en-US" });

let fake: FakeSpeech | null = null;
let uninstall: (() => void) | null = null;

function installSpeech(voices: readonly SpeechSynthesisVoice[] = [LOCAL]): FakeSpeech {
  fake = createFakeSpeech({ voices });
  uninstall = installFakeSpeechOnWindow(fake);
  return fake;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/character-chat"]}>
      <CharacterChatPage />
    </MemoryRouter>,
  );
}

async function sendMessage(text: string) {
  fireEvent.change(screen.getByLabelText("캐릭터에게 보낼 메시지"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /보내기/ }));
}

function statusRegions(): HTMLElement[] {
  return screen.getAllByRole("status");
}

beforeEach(() => {
  window.localStorage.clear();
  resetCharacterChatVoiceSettingsForTests();
  useCharacterChatStore.getState().resetForTests();
  engineState.ready = true;
  engineState.generateReply.mockReset();
  engineState.generateReply.mockResolvedValue({ ok: true, text: "…볼일이 뭔데." });
});

afterEach(() => {
  cleanup();
  uninstall?.();
  uninstall = null;
  fake = null;
});

describe("응답 낭독 — 듣기/정지", () => {
  it("캐릭터 메시지에만 듣기 버튼이 있고, 이름에 캐릭터와 동작이 들어 있다", async () => {
    installSpeech();
    renderPage();
    // 인사말(캐릭터 메시지)에는 버튼이 있다.
    const greetingButton = screen.getByRole("button", { name: "레이나의 답변 듣기" });
    expect(greetingButton.textContent).toContain("듣기");

    await sendMessage("안녕, 레이나");
    await waitFor(() => expect(screen.getByText("…볼일이 뭔데.")).toBeTruthy());
    // 팬 메시지에는 버튼이 없다 — 캐릭터 메시지(인사말 + 답변) 두 개만.
    expect(screen.getAllByRole("button", { name: "레이나의 답변 듣기" })).toHaveLength(2);
  });

  it("듣기를 누르면 브라우저 음성으로 읽고, 같은 자리의 버튼이 정지로 바뀌며 상태를 알린다", async () => {
    const speech = installSpeech();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));

    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0]?.text).toContain("누구지");
    expect(speech.spoken[0]?.voice).toBe(LOCAL);

    const stopButton = screen.getByRole("button", { name: "레이나의 답변 낭독 정지" });
    expect(stopButton.textContent).toContain("정지");
    expect(screen.queryByRole("button", { name: "레이나의 답변 듣기" })).toBeNull();
    // 상태 영역(role=status, aria-live=polite)이 시작을 알린다.
    const announcer = statusRegions().find((region) => region.textContent?.includes("읽어요"));
    expect(announcer?.getAttribute("aria-live")).toBe("polite");
    expect(announcer?.className).toContain("sr-only");
  });

  it("정지를 누르면 멈추고 브라우저 재생을 취소한다", () => {
    const speech = installSpeech();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));
    const cancelsBefore = speech.synthesis.cancel.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 낭독 정지" }));

    expect(speech.synthesis.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore);
    expect(screen.getByRole("button", { name: "레이나의 답변 듣기" })).toBeTruthy();
    expect(statusRegions().some((region) => region.textContent === "낭독을 멈췄어요")).toBe(true);
  });

  it("끝까지 읽으면 완료를 알리고 버튼이 듣기로 돌아온다", async () => {
    const speech = installSpeech();
    engineState.generateReply.mockResolvedValue({ ok: true, text: "…볼일이 뭔데." });
    renderPage();
    await sendMessage("안녕");
    await waitFor(() => expect(screen.getByText("…볼일이 뭔데.")).toBeTruthy());

    const replyButtons = screen.getAllByRole("button", { name: "레이나의 답변 듣기" });
    fireEvent.click(replyButtons[1] as HTMLElement);
    expect(speech.spoken[0]?.text).toContain("볼일이 뭔데");
    act(() => speech.endLast());

    await waitFor(() =>
      expect(statusRegions().some((region) => region.textContent === "낭독이 끝났어요")).toBe(true),
    );
    expect(screen.getAllByRole("button", { name: "레이나의 답변 듣기" })).toHaveLength(2);
  });

  it("한 번에 한 메시지만 읽는다 — 다른 메시지의 듣기를 누르면 앞의 정지 버튼은 듣기로 돌아온다", async () => {
    const speech = installSpeech();
    renderPage();
    await sendMessage("안녕");
    await waitFor(() => expect(screen.getByText("…볼일이 뭔데.")).toBeTruthy());

    const [greetingListen, replyListen] = screen.getAllByRole("button", { name: "레이나의 답변 듣기" });
    fireEvent.click(greetingListen as HTMLElement);
    expect(screen.getAllByRole("button", { name: "레이나의 답변 낭독 정지" })).toHaveLength(1);

    fireEvent.click(replyListen as HTMLElement);
    expect(speech.spoken.at(-1)?.text).toContain("볼일이 뭔데");
    // 정지 버튼은 지금 읽는 메시지 하나뿐이다.
    expect(screen.getAllByRole("button", { name: "레이나의 답변 낭독 정지" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "레이나의 답변 듣기" })).toHaveLength(1);
  });
});

describe("응답 낭독 — 자동 낭독(기본 꺼짐)", () => {
  it("기본값에서는 새 답변이 와도 읽지 않는다", async () => {
    const speech = installSpeech();
    renderPage();
    await sendMessage("안녕");
    await waitFor(() => expect(screen.getByText("…볼일이 뭔데.")).toBeTruthy());
    expect(speech.synthesis.speak).not.toHaveBeenCalled();
  });

  it("설정에서 자동 낭독을 켜면 새 답변부터 읽고, 인사말은 읽지 않는다", async () => {
    const speech = installSpeech();
    renderPage();
    expect(speech.synthesis.speak).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "음성 낭독 설정" }));
    const autoSwitch = screen.getByRole("switch", { name: "새 답변을 자동으로 읽기" });
    expect(autoSwitch.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(autoSwitch);
    expect(autoSwitch.getAttribute("aria-checked")).toBe("true");

    await sendMessage("안녕");
    await waitFor(() => expect(speech.spoken.length).toBeGreaterThan(0));
    expect(speech.spoken[0]?.text).toContain("볼일이 뭔데");
  });

  it("엔진에는 자동 낭독이 켜진 경우에만 읽기 좋은 대사를 요청한다", async () => {
    installSpeech();
    renderPage();
    await sendMessage("안녕");
    await waitFor(() => expect(screen.getByText("…볼일이 뭔데.")).toBeTruthy());
    expect(engineState.generateReply).toHaveBeenCalledTimes(1);
    expect(engineState.generateReply.mock.calls[0]?.[0]?.readAloud).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "음성 낭독 설정" }));
    fireEvent.click(screen.getByRole("switch", { name: "새 답변을 자동으로 읽기" }));
    await sendMessage("또 안녕");
    await waitFor(() => expect(engineState.generateReply).toHaveBeenCalledTimes(2));
    expect(engineState.generateReply.mock.calls[1]?.[0]?.readAloud).toBe(true);
  });

  it("낭독을 지원하지 않는 브라우저에서는 자동 낭독 설정이 남아 있어도 읽기 좋은 대사를 요청하지 않는다", async () => {
    updateCharacterChatVoiceSettings({ autoRead: true });
    renderPage();
    await sendMessage("안녕");
    await waitFor(() => expect(engineState.generateReply).toHaveBeenCalledTimes(1));
    expect(engineState.generateReply.mock.calls[0]?.[0]?.readAloud).toBe(false);
  });

  it("답변이 오기 전에 다른 캐릭터로 바꾸면 자동 낭독하지 않는다", async () => {
    updateCharacterChatVoiceSettings({ autoRead: true });
    const speech = installSpeech();
    let resolveReply: (result: CharacterChatEngineResult) => void = () => undefined;
    engineState.generateReply.mockImplementation(
      () => new Promise<CharacterChatEngineResult>((resolve) => { resolveReply = resolve; }),
    );
    renderPage();
    await sendMessage("안녕");
    await waitFor(() => expect(engineState.generateReply).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /하루/ }));
    await act(async () => {
      resolveReply({ ok: true, text: "…볼일이 뭔데." });
    });

    expect(speech.synthesis.speak).not.toHaveBeenCalled();
  });

  it("답변이 오기 전에 화면을 떠나면 자동 낭독하지 않는다", async () => {
    updateCharacterChatVoiceSettings({ autoRead: true });
    const speech = installSpeech();
    let resolveReply: (result: CharacterChatEngineResult) => void = () => undefined;
    engineState.generateReply.mockImplementation(
      () => new Promise<CharacterChatEngineResult>((resolve) => { resolveReply = resolve; }),
    );
    const view = renderPage();
    await sendMessage("안녕");
    await waitFor(() => expect(engineState.generateReply).toHaveBeenCalled());

    view.unmount();
    await act(async () => {
      resolveReply({ ok: true, text: "…볼일이 뭔데." });
    });

    expect(speech.synthesis.speak).not.toHaveBeenCalled();
  });
});

describe("응답 낭독 — 이탈 시 정지", () => {
  it("읽는 중에 화면을 떠나면(언마운트) 소리를 끊는다", () => {
    const speech = installSpeech();
    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));
    const cancelsBefore = speech.synthesis.cancel.mock.calls.length;

    view.unmount();

    expect(speech.synthesis.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore);
  });

  it("읽는 중에 다른 캐릭터를 고르면 소리를 끊는다", () => {
    const speech = installSpeech();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));
    const cancelsBefore = speech.synthesis.cancel.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /하루/ }));

    expect(speech.synthesis.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore);
    // 새 캐릭터 화면에는 정지 버튼이 남아 있지 않다.
    expect(screen.queryByRole("button", { name: /낭독 정지/ })).toBeNull();
  });

  it("페이지를 떠나는 pagehide에서도 소리를 끊는다", () => {
    const speech = installSpeech();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));
    const cancelsBefore = speech.synthesis.cancel.mock.calls.length;

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(speech.synthesis.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore);
    expect(screen.queryByRole("button", { name: /낭독 정지/ })).toBeNull();
  });

  it("읽는 중 Esc로 멈추고, 한글 조합 중의 Esc는 건드리지 않는다", () => {
    installSpeech();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));
    const input = screen.getByLabelText("캐릭터에게 보낼 메시지");

    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(screen.getByRole("button", { name: "레이나의 답변 낭독 정지" })).toBeTruthy();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "레이나의 답변 낭독 정지" })).toBeNull();
    expect(screen.getByRole("button", { name: "레이나의 답변 듣기" })).toBeTruthy();
  });

  it("읽는 중에는 도구줄에도 낭독 멈추기 버튼이 나타난다", () => {
    installSpeech();
    renderPage();
    expect(screen.queryByRole("button", { name: "낭독 멈추기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));

    const stopAll = screen.getByRole("button", { name: "낭독 멈추기" });
    expect(stopAll.getAttribute("aria-keyshortcuts")).toBe("Escape");
    fireEvent.click(stopAll);
    expect(screen.queryByRole("button", { name: "낭독 멈추기" })).toBeNull();
  });
});

describe("응답 낭독 — 지원하지 않는 브라우저와 음성 부족", () => {
  it("음성 합성이 없으면 듣기 버튼을 숨기고 이유를 안내한다", () => {
    // 가짜를 심지 않는다 — jsdom에는 speechSynthesis가 없다.
    renderPage();
    expect(screen.queryByRole("button", { name: /답변 듣기/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "음성 낭독 설정" })).toBeNull();
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("음성 낭독을 지원하지 않아");
    // 대화 자체는 그대로 쓸 수 있다.
    expect(screen.getByLabelText("캐릭터에게 보낼 메시지")).toBeTruthy();
  });

  it("한국어 음성이 없으면 읽지 않고 눈에 보이는 안내를 띄운다", () => {
    const speech = installSpeech([ENGLISH]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));

    expect(speech.synthesis.speak).not.toHaveBeenCalled();
    const warning = statusRegions().find((region) => region.textContent?.includes("한국어 음성을 찾지 못했어요"));
    expect(warning).toBeTruthy();
    expect(warning?.className).not.toContain("sr-only");
    // 버튼은 읽지 못했으므로 듣기 상태 그대로다.
    expect(screen.getByRole("button", { name: "레이나의 답변 듣기" })).toBeTruthy();
  });

  it("온라인 음성만 있으면 기본으로는 읽지 않고, 허용하면 그 음성으로 읽는다", () => {
    const speech = installSpeech([ONLINE, ENGLISH]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));
    expect(speech.synthesis.speak).not.toHaveBeenCalled();
    expect(statusRegions().some((region) => region.textContent?.includes("온라인 음성도 허용"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "음성 낭독 설정" }));
    const online = screen.getByRole("switch", { name: "온라인 음성도 허용" });
    expect(online.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(online);

    fireEvent.click(screen.getByRole("button", { name: "레이나의 답변 듣기" }));
    expect(speech.spoken).toHaveLength(1);
    expect(speech.spoken[0]?.voice).toBe(ONLINE);
    // 설정 패널에는 지금 쓰는 음성과 그것이 온라인임이 보인다.
    const panel = screen.getByRole("switch", { name: "온라인 음성도 허용" }).closest("div[id]");
    expect(panel).toBeTruthy();
    expect(within(panel as HTMLElement).getByText(/읽는 음성: .*SunHi.*온라인\(원격\)/)).toBeTruthy();
  });

  it("낭독 설정 스위치는 이름과 설명이 연결되어 있고 기본 꺼짐이다", () => {
    installSpeech();
    renderPage();
    const toggle = screen.getByRole("button", { name: "음성 낭독 설정" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    for (const name of ["새 답변을 자동으로 읽기", "온라인 음성도 허용"]) {
      const control = screen.getByRole("switch", { name });
      expect(control.getAttribute("aria-checked")).toBe("false");
      expect(control.getAttribute("aria-describedby")).toBeTruthy();
    }
    expect(screen.getByText("낭독 중에는 Esc 키로 멈출 수 있어요.")).toBeTruthy();
  });
});
