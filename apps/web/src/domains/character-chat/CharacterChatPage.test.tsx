/**
 * 캐릭터 토크 팬 페이지 테스트 — 키 없음 안내, 캐릭터 전환, 전송 흐름.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CharacterChatPage } from "./CharacterChatPage";
import { useCharacterChatStore } from "./character-chat-store";
import { useI18n } from "@/shared/lib/i18n";
import type {
  CharacterChatEngineInput,
  CharacterChatEngineResult,
} from "./character-chat-engine";

const engineState = vi.hoisted(() => ({
  ready: false,
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

function renderPage(route = "/character-chat") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CharacterChatPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
  useCharacterChatStore.getState().resetForTests();
  engineState.ready = false;
  engineState.generateReply.mockReset();
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

describe("CharacterChatPage", () => {
  it("키가 없으면 등록 안내와 캐릭터 인사말을 보여준다", () => {
    renderPage();
    expect(screen.getByText("지금은 파일럿 기간이에요")).toBeTruthy();
    expect(screen.getByRole("link", { name: /AI 키 등록하러 가기/ }).getAttribute("href")).toBe(
      "/settings/ai",
    );
    const shaperBridge = screen.getByTestId("character-chat-shaper-bridge");
    expect(shaperBridge.getAttribute("href")).toBe("/studio/assets/characters/new");
    expect(shaperBridge.className).toContain("min-h-11");
    // 첫 캐릭터(레이나)의 인사말이 스레드에 보인다.
    expect(screen.getByText(/내 이름은 레이나/)).toBeTruthy();
    // 입력은 잠겨 있다.
    expect((screen.getByLabelText("캐릭터에게 보낼 메시지") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("캐릭터를 바꾸면 그 캐릭터의 인사말로 스레드가 바뀐다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /하루/ }));
    expect(screen.getByText(/단팥빵 나왔는데/)).toBeTruthy();
  });

  it("키가 있으면 메시지를 보내고 캐릭터 답변이 붙는다", async () => {
    engineState.ready = true;
    engineState.generateReply.mockResolvedValue({ ok: true, text: "…볼일이 뭔데." });
    renderPage();
    const input = screen.getByLabelText("캐릭터에게 보낼 메시지");
    fireEvent.change(input, { target: { value: "안녕, 레이나" } });
    fireEvent.click(screen.getByRole("button", { name: /보내기/ }));
    await waitFor(() => {
      expect(screen.getByText("…볼일이 뭔데.")).toBeTruthy();
    });
    expect(screen.getByText("안녕, 레이나")).toBeTruthy();
    const profile = useCharacterChatStore
      .getState()
      .profiles.find((item) => item.characterName === "레이나");
    expect(profile).toBeTruthy();
    const summary = useCharacterChatStore.getState().activitySummary(profile!.id);
    expect(summary.fanMessageCount).toBe(1);
    expect(summary.characterMessageCount).toBe(1);
  });

  it("금지 주제를 입력하면 엔진 없이 안내만 뜬다", async () => {
    engineState.ready = true;
    engineState.generateReply.mockResolvedValue({ ok: true, text: "답변" });
    renderPage();
    const input = screen.getByLabelText("캐릭터에게 보낼 메시지");
    fireEvent.change(input, { target: { value: "왕의 죽음에 대해 알려줘" } });
    fireEvent.click(screen.getByRole("button", { name: /보내기/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("금지 주제");
    });
    expect(engineState.generateReply).not.toHaveBeenCalled();
  });

  it("작품 파라미터에 맞는 캐릭터가 없으면 상태를 알린다", () => {
    renderPage("/character-chat?work=no-such-work");
    expect(screen.getByText(/아직 캐릭터 챗을 열지 않았어요/)).toBeTruthy();
  });

  it("추천 첫마디 칩을 누르면 입력창에 문구가 채워지고 캐릭터 검색으로 목록을 좁힌다", () => {
    engineState.ready = true;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "오늘 기분은 어때?" }));
    const input = screen.getByLabelText("캐릭터에게 보낼 메시지") as HTMLTextAreaElement;
    expect(input.value).toBe("오늘 기분은 어때?");

    const searchInput = screen.getByRole("searchbox", { name: "대화할 캐릭터 검색" });
    expect(searchInput.closest("label")?.className).toContain("min-h-11");
    fireEvent.change(searchInput, { target: { value: "하루" } });
    expect(screen.getByRole("button", { name: /하루/ })).toBeTruthy();
  });

  it("REA 로어북 스포일러 펜스·페르소나 톤 워크벤치를 44px 규격으로 렌더링하고 양방향 상태를 전환한다", () => {
    renderPage();

    const bar = screen.getByTestId("character-chat-rea-lorebook-bar");
    expect(bar.textContent).toContain("Character.AI · Zeta · Wrtn · SillyTavern Lorebook");

    const fenceEp10 = screen.getByTestId("char-chat-rea-fence-ep10-canon-lock");
    const fenceS1 = screen.getByTestId("char-chat-rea-fence-season1-finale-sync");
    const fenceAu = screen.getByTestId("char-chat-rea-fence-au-whatif-sandbox");
    expect(fenceEp10.className).toContain("min-h-11");
    expect(fenceS1.className).toContain("min-h-11");
    expect(fenceAu.className).toContain("min-h-11");

    expect(fenceEp10.getAttribute("aria-pressed")).toBe("true");
    expect(fenceS1.getAttribute("aria-pressed")).toBe("false");
    expect(fenceAu.getAttribute("aria-pressed")).toBe("false");

    const toneStrict = screen.getByTestId("char-chat-rea-tone-canon-dialogue-strict");
    const toneAffection = screen.getByTestId("char-chat-rea-tone-affection-stage-reactive");
    const toneTts = screen.getByTestId("char-chat-rea-tone-voice-tts-prosody");
    expect(toneStrict.className).toContain("min-h-11");
    expect(toneAffection.className).toContain("min-h-11");
    expect(toneTts.className).toContain("min-h-11");

    expect(toneStrict.getAttribute("aria-pressed")).toBe("true");
    expect(toneAffection.getAttribute("aria-pressed")).toBe("false");
    expect(toneTts.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("character-chat-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.className).not.toContain("border-line");
    expect(status.textContent).toContain("10화 정사 스포일러 잠금");
    expect(status.textContent).toContain("원작 대사 말투 고정");

    fireEvent.click(fenceS1);
    expect(fenceS1.getAttribute("aria-pressed")).toBe("true");
    expect(fenceEp10.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("시즌1 완결 기억 동기화");

    fireEvent.click(toneAffection);
    expect(toneAffection.getAttribute("aria-pressed")).toBe("true");
    expect(toneStrict.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("호감도 단계별 반응");

    fireEvent.click(fenceAu);
    fireEvent.click(toneTts);
    expect(fenceAu.getAttribute("aria-pressed")).toBe("true");
    expect(toneTts.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("IF 외전 멀티버스 샌드박스");
    expect(status.textContent).toContain("보이스 TTS 감정 운율");
  });

  it("영어 로케일(en)에서 REA 워크벤치 및 셰이퍼 브리지에 한글이 섞이지 않는다", () => {
    useI18n.setState({ lang: "en" });
    renderPage();

    const bar = screen.getByTestId("character-chat-rea-lorebook-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("character-chat-shaper-bridge").textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("char-chat-rea-fence-au-whatif-sandbox"));
    fireEvent.click(screen.getByTestId("char-chat-rea-tone-voice-tts-prosody"));
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("character-chat-rea-status").textContent).toContain("AU What-If Sandbox");
    expect(screen.getByTestId("character-chat-rea-status").textContent).toContain("Voice TTS Prosody");
  });
});
