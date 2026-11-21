/**
 * 캐릭터 토크 연출 컨텍스트·1탭 장면 스타터·실연동 테스트.
 *
 * - 순수 모델: 스포일러 안전선·말투 온도 -> 시스템 프롬프트 지시문, 금지 주제 무누출, 3종 장면 생성
 * - BYOK 엔진 연동: spoilerFence·personaTone이 실제 LLM system prompt에 주입되는지 검증
 * - UI 통합: 무키 게스트 1탭 정사 미리보기·실시간 연출 반영·AI 키 연결 CTA / 키 보유 사용자 입력 채움·즉시 대화 시작
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CharacterChatPage } from "./CharacterChatPage";
import {
  createByokCharacterChatEngine,
  type CharacterChatEngineInput,
  type CharacterChatEngineResult,
} from "./character-chat-engine";
import { findForbiddenTopicHits } from "./character-chat-filter";
import { buildCharacterChatProfile } from "./character-chat-profile";
import { buildCharacterChatSystemPrompt } from "./character-chat-prompt";
import {
  buildCharacterChatDirectorContext,
  buildCharacterChatSceneStarters,
  DEFAULT_PERSONA_TONE,
  DEFAULT_SPOILER_FENCE,
  type PersonaToneId,
  type SpoilerFenceId,
} from "./character-chat-scene-starter";
import { buildSeedCharacterChatProfiles } from "./character-chat-seed";
import { useCharacterChatStore } from "./character-chat-store";

const engineState = vi.hoisted(() => ({
  ready: false,
  generateReply:
    vi.fn<(input: CharacterChatEngineInput) => Promise<CharacterChatEngineResult>>(
      async () => ({ ok: true, text: "…알겠다." }),
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
  engineState.generateReply.mockResolvedValue({ ok: true, text: "…알겠다." });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

describe("character-chat-scene-starter 순수 모델", () => {
  const [reina, haru] = buildSeedCharacterChatProfiles();

  it("스포일러 안전선과 말투 온도를 실제 시스템 프롬프트 연출 지시문으로 변환한다", () => {
    const context = buildCharacterChatDirectorContext({
      spoilerFence: "season1-finale-sync",
      personaTone: "affection-stage-reactive",
    });
    expect(context).toContain("[대화 연출 설정]");
    expect(context).toContain("시즌1 완결 기억 동기화");
    expect(context).toContain("호감도 단계별 반응");

    const prompt = buildCharacterChatSystemPrompt(reina, {
      spoilerFence: "au-whatif-sandbox",
      personaTone: "voice-tts-prosody",
    });
    expect(prompt).toContain("[대화 연출 설정]");
    expect(prompt).toContain("IF 외전 멀티버스 샌드박스");
    expect(prompt).toContain("보이스 TTS 감정 운율");
    // 금지 주제 지시는 여전히 유지된다.
    expect(prompt).toContain("왕의 죽음");
  });

  it("BYOK 엔진이 spoilerFence·personaTone을 실제 완성 요청 시스템 프롬프트에 실어 보낸다", async () => {
    let capturedSystem = "";
    const engine = createByokCharacterChatEngine(async (system) => {
      capturedSystem = system;
      return "짧게 말해.";
    });

    const result = await engine.generateReply({
      profile: reina,
      history: [],
      userText: "월광검 이야기 좀 해 줘",
      spoilerFence: "season1-finale-sync",
      personaTone: "voice-tts-prosody",
    });

    expect(result).toEqual({ ok: true, text: "짧게 말해." });
    expect(capturedSystem).toContain("시즌1 완결 기억 동기화");
    expect(capturedSystem).toContain("보이스 TTS 감정 운율");
  });

  it("모든 연출 조합과 커스텀 금지 주제에서도 3종 장면 스타터가 금지 주제를 누출하지 않는다", () => {
    const guardedProfile = buildCharacterChatProfile(
      {
        characterName: "세라",
        workTitle: "안개 성채",
        workSlug: "",
        authorName: "작가",
        description: "성채를 지키는 기록관",
        personality: "침착하고 단호하다. 비밀 서고를 끝까지 지킨다.",
        speechStyle: "차분한 존댓말을 쓴다.",
        worldview: "안개 성채 아래에는 금지된 열쇠가 잠들어 있다. 기록관만 서고에 들어간다.",
        greeting: "어서 오세요.",
        forbiddenTopics: ["금지된 열쇠", "비밀 서고", "안개 성채"],
        appearanceHint: "검은 망토와 안경",
        avatarUrl: "",
        canonSheetId: "",
        chatEnabled: true,
      },
      { id: "guarded-1" },
    );

    const fences: readonly SpoilerFenceId[] = [
      "ep10-canon-lock",
      "season1-finale-sync",
      "au-whatif-sandbox",
    ];
    const tones: readonly PersonaToneId[] = [
      "canon-dialogue-strict",
      "affection-stage-reactive",
      "voice-tts-prosody",
    ];

    for (const profile of [reina, haru, guardedProfile]) {
      for (const spoilerFence of fences) {
        for (const personaTone of tones) {
          const starters = buildCharacterChatSceneStarters(profile, { spoilerFence, personaTone });
          expect(starters).toHaveLength(3);
          expect(starters.map((item) => item.kind)).toEqual([
            "first-meeting",
            "world-secret",
            "crisis-response",
          ]);
          for (const starter of starters) {
            expect(findForbiddenTopicHits(profile, starter.promptKo)).toHaveLength(0);
            expect(findForbiddenTopicHits(profile, starter.previewReplyKo)).toHaveLength(0);
            expect(findForbiddenTopicHits(profile, starter.promptEn)).toHaveLength(0);
            expect(findForbiddenTopicHits(profile, starter.previewReplyEn)).toHaveLength(0);
          }
        }
      }
    }
  });

  it("캐릭터 말투(반말/존댓말)와 스포일러 안전선 변경에 따라 정사 미리보기 응답이 달라진다", () => {
    const reinaEp10 = buildCharacterChatSceneStarters(reina, {
      spoilerFence: DEFAULT_SPOILER_FENCE,
      personaTone: DEFAULT_PERSONA_TONE,
    });
    const reinaS1 = buildCharacterChatSceneStarters(reina, {
      spoilerFence: "season1-finale-sync",
      personaTone: "affection-stage-reactive",
    });
    const haruEp10 = buildCharacterChatSceneStarters(haru, {
      spoilerFence: DEFAULT_SPOILER_FENCE,
      personaTone: DEFAULT_PERSONA_TONE,
    });

    expect(reinaEp10[1]?.previewReplyKo).not.toBe(reinaS1[1]?.previewReplyKo);
    expect(reinaEp10[0]?.previewReplyKo).not.toBe(haruEp10[0]?.previewReplyKo);
  });
});

describe("CharacterChatSceneStarterBar 통합 연동", () => {
  it("무키 게스트가 장면 카드를 누르면 정사 미리보기 말풍선과 AI 키 연결 CTA를 즉시 보여준다", () => {
    engineState.ready = false;
    renderPage();

    const bar = screen.getByTestId("character-chat-scene-starter-bar");
    expect(bar).toBeTruthy();

    const worldSecretCard = screen.getByTestId("scene-starter-card-world-secret");
    expect(worldSecretCard.className).toContain("min-h-11");
    fireEvent.click(worldSecretCard);

    const preview = screen.getByTestId("scene-starter-guest-preview");
    expect(preview.textContent).toContain("정사 샘플 미리보기");
    expect(preview.textContent).toContain("10화 잠금");

    const beforeReply = preview.textContent;
    // 스포일러 안전선과 말투 온도를 바꾸면 미리보기 말풍선 응답이 즉시 바뀐다.
    fireEvent.click(screen.getByTestId("scene-starter-fence-au-whatif-sandbox"));
    fireEvent.click(screen.getByTestId("scene-starter-tone-affection-stage-reactive"));
    expect(preview.textContent).toContain("IF 외전");
    expect(preview.textContent).toContain("친밀도 반응");
    expect(preview.textContent).not.toBe(beforeReply);

    const connectLink = screen.getByTestId("scene-starter-connect-key-cta");
    expect(connectLink.getAttribute("href")).toBe("/settings/ai");
    expect(connectLink.className).toContain("min-h-11");

    // 무키 게스트 경계는 깨지지 않는다(입력 잠금·엔진 미호출).
    expect((screen.getByLabelText("캐릭터에게 보낼 메시지") as HTMLTextAreaElement).disabled).toBe(true);
    expect(engineState.generateReply).not.toHaveBeenCalled();
  });

  it("AI 키가 등록된 경우 장면 카드로 입력창을 채우고 스포일러·말투 설정을 엔진에 실어 전송한다", async () => {
    engineState.ready = true;
    engineState.generateReply.mockResolvedValue({ ok: true, text: "좋아, 이쪽 길로 움직이지." });
    renderPage();

    fireEvent.click(screen.getByTestId("scene-starter-fence-season1-finale-sync"));
    fireEvent.click(screen.getByTestId("scene-starter-tone-voice-tts-prosody"));

    const activeDirector = screen.getByTestId("character-chat-active-director");
    expect(activeDirector.textContent).toContain("시즌1 동기화");
    expect(activeDirector.textContent).toContain("보이스 운율");

    fireEvent.click(screen.getByTestId("scene-starter-card-crisis-response"));
    const input = screen.getByLabelText("캐릭터에게 보낼 메시지") as HTMLTextAreaElement;
    expect(input.value).toContain("위기");

    fireEvent.click(screen.getByTestId("scene-starter-instant-trigger"));
    await waitFor(() => {
      expect(engineState.generateReply).toHaveBeenCalledTimes(1);
    });
    const call = engineState.generateReply.mock.calls[0]?.[0];
    expect(call?.spoilerFence).toBe("season1-finale-sync");
    expect(call?.personaTone).toBe("voice-tts-prosody");
    expect(call?.userText).toContain("위기");

    await waitFor(() => {
      expect(screen.getByText("좋아, 이쪽 길로 움직이지.")).toBeTruthy();
    });
  });

  it("영어 로케일에서도 장면 스타터 바 UI 라벨이 영어로 전환된다", () => {
    useI18n.setState({ lang: "en" });
    engineState.ready = false;
    renderPage();

    const fenceBtn = screen.getByTestId("scene-starter-fence-ep10-canon-lock");
    expect(fenceBtn.textContent).toContain("Ep.10 Lock");
    expect(fenceBtn.textContent).not.toMatch(/[가-힣]/u);

    const toneBtn = screen.getByTestId("scene-starter-tone-voice-tts-prosody");
    expect(toneBtn.textContent).toContain("Voice Cadence");
    expect(toneBtn.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("scene-starter-card-first-meeting"));
    const cta = screen.getByTestId("scene-starter-connect-key-cta");
    expect(cta.textContent).toContain("Connect my AI key to keep talking");
    expect(cta.textContent).not.toMatch(/[가-힣]/u);
  });
});
