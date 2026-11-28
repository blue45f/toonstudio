// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";
import { useI18n } from "@/shared/lib/i18n";
import { useApp } from "@/shared/lib/store";

import {
  ALL_STUDIO_OPENAI_ASSIST_MODES,
  isValidStudioOpenAiStructuredResult,
  type StudioOpenAiAssistSuccess,
  type StudioOpenAiExtendedStructuredResult,
} from "../ai/studio-openai-creative-assist-client";
import { createStudioProjectDefinition } from "../studio-project-definition";
import {
  ensureStudioProjectFeatureSuite,
  studioProjectFeatureSuiteStorageKey,
  updateStudioProjectFeatureSuite,
} from "../studio-project-feature-suite-store";
import { createStudioProject } from "../studio-project-library-store";
import {
  readStudioAssistantSessionState,
  studioAssistantSessionKey,
  writeStudioAssistantSessionState,
} from "./guided-flow/studio-assistant-session-store";
import { StudioOpenAiAssistResultCard } from "./StudioOpenAiAssistResultCard";
import { StudioOpenAiExtendedResultBody } from "./StudioOpenAiExtendedResultBody";
import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";

const EXTENDED_RESULTS: readonly StudioOpenAiExtendedStructuredResult[] = [
  {
    mode: "character-bible-forge",
    data: {
      characterName: "한서연",
      archetypeKo: "과묵한 야간 아키비스트",
      speechTone: "짧은 문장과 담백한 어미",
      appearancePalette: "딥 틸 코트와 황동 열쇠 목걸이",
      coreMotivation: "사라진 필름 기록의 마지막 장면을 복원한다.",
      forbiddenLines: ["운명이니까 어쩔 수 없지", "그냥 대충 넘어가자"],
      relationshipHooks: [{ target: "윤태오", dynamic: "서로 단서를 숨기며 공조한다." }],
      visualConsistencyCue: "왼쪽 손목의 얇은 필름 상처",
    },
  },
  {
    mode: "continuity-plot-audit",
    data: {
      overallConsistencyScore: 84,
      summary: "3컷의 우산 색상이 1컷과 달라 독자 혼선이 생깁니다.",
      issues: [
        {
          severity: "critical",
          category: "소품 일관성",
          locationHint: "1컷 ↔ 3컷",
          conflictDetail: "1컷 노란 우산이 3컷에서 투명 우산으로 바뀜",
          fixSuggestion: "3컷 우산을 노란 천 재질로 통일하세요.",
        },
      ],
    },
  },
  {
    mode: "bg3d-camera-blocking",
    data: {
      sceneSummary: "비 내리는 야간 지하철 계단 입구",
      camera: {
        lensMm: 35,
        fovDeg: 54,
        angleLabel: "로우 앵글",
        position: [0, 1.1, 4.5],
        target: [0, 1.6, 0],
        rollDeg: -4,
      },
      lighting: {
        timeOfDay: "늦은 밤",
        keyLightColor: "차가운 청록 가로등",
        rimLightNote: "어깨선을 따라 빗방울 역광 강조",
        ambientRatio: 0.25,
      },
      propsToPlace: ["젖은 우산", "지하철 출구 표지판"],
      blockingNotes: ["인물은 화면 우측 1/3 지점에 배치", "계단 난간으로 시선 유도"],
    },
  },
  {
    mode: "color-mood-director",
    data: {
      emotionLabel: "긴장감 있는 정적",
      moodSummary: "젖은 아스팔트 톤 위에 황동 빛 한 점으로 시선을 모읍니다.",
      palette: [
        { role: "배경", nameKo: "젖은 슬레이트", oklch: "oklch(0.24 0.02 225)", usageTip: "원경 70%" },
        { role: "주인공", nameKo: "깊은 청록", oklch: "oklch(0.45 0.08 195)", usageTip: "코트 주색" },
        { role: "강조", nameKo: "가로등 앰버", oklch: "oklch(0.76 0.14 75)", usageTip: "열쇠·눈빛 포인트" },
      ],
      lightingGuide: "상단 35도 키 라이트와 약한 하단 반사광",
      contrastWarning: "어두운 배경 위 말풍선 테두리는 1.5px 이상 유지하세요.",
    },
  },
  {
    mode: "sfx-onomatopoeia-lab",
    data: {
      sceneEnergy: "짧고 날카로운 정적 깨짐",
      suggestions: [
        {
          ko: "철컥—",
          ja: "ガチャン",
          en: "CLACK",
          intent: "잠긴 보관함 문이 열리는 순간",
          typographyTip: "세로로 약간 기울인 고딕 굵은 획",
          placementHint: "손목 옆 여백 40px 바깥",
        },
        {
          ko: "후두둑",
          ja: "パラパラ",
          en: "PATTER",
          intent: "우산 위로 빗방울 떨어지는 호흡",
          typographyTip: "얇은 손글씨 브러시로 크기 점감",
          placementHint: "컷 상단 우측에서 사선 배치",
        },
      ],
    },
  },
  {
    mode: "photoshop-fx-recipe",
    data: {
      lookNameKo: "야간 비 오는 필름 룩",
      summary: "선화 대비를 지키면서 하이라이트만 부드럽게 번지게 합니다.",
      layerStyles: [
        { effect: "외부 광선", blendMode: "스크린", opacityPct: 32, paramsSummary: "크기 18px, 스프레드 4%" },
        { effect: "그라디언트 오버레이", blendMode: "곱하기", opacityPct: 24, paramsSummary: "상단 짙은 청회색" },
      ],
      cameraRaw: {
        exposure: -0.2,
        contrast: 14,
        clarity: 8,
        dehaze: 6,
        temperatureShift: -12,
        grainPct: 12,
      },
      nonDestructiveTip: "보정 레이어 그룹을 컷 폴더 최상단에 클리핑하세요.",
    },
  },
  {
    mode: "scroll-pacing-auditor",
    data: {
      rhythmVerdict: "도입 컷 간격이 다소 좁아 시선이 급하게 넘어갑니다.",
      averageGapPx: 260,
      cliffhangerScore: 88,
      cliffhangerTip: "엔딩 대사 직전 무대사 정적 컷을 420px 여백으로 띄우세요.",
      beatPacing: [
        { section: "도입 1~2컷", pacing: "breath", recommendedGapPx: 320, readerRetentionNote: "분위기 안착" },
        { section: "반전 엔딩", pacing: "drop", recommendedGapPx: 480, readerRetentionNote: "다음 화 클릭 유도" },
      ],
    },
  },
  {
    mode: "thumbnail-hook-optimizer",
    data: {
      hookDiagnosis: "인물 시선이 정면을 향해 썸네일 클릭 집중도가 높습니다.",
      titleVariants: [
        { variantLabel: "미스터리형", title: "열리지 않던 7번 보관함", subCopy: "빗속에서 발견한 필름 한 통", hookReason: "궁금증 직결" },
        { variantLabel: "인물형", title: "그날 밤 아무도 믿지 마라", subCopy: "서연의 마지막 기록", hookReason: "감정선 몰입" },
      ],
      thumbnailSpec: {
        focalSubject: "노란 우산 아래 서연의 클로즈업",
        contrastNote: "배경 명도 30% 이하로 낮춰 얼굴 부각",
        textOverlayMaxChars: 12,
        cropSafetyTip: "1:1 중앙 65% 안전 영역 안에 눈높이 고정",
      },
    },
  },
  {
    mode: "localization-glossary-check",
    data: {
      targetLocales: ["en-US", "ja-JP"],
      glossary: [
        { termKo: "야간 보관소", en: "Night Archive", ja: "夜間保管庫", ruleNote: "전 회차 대문자 고정" },
        { termKo: "필름 열쇠", en: "Reel Key", ja: "フィルムキー", ruleNote: "고유 소품명 유지" },
      ],
      culturalNotes: [
        { severity: "warn", topic: "존댓말 전환", adaptationTip: "영어판은 호칭 변화로 거리감 축소를 표현하세요." },
      ],
    },
  },
  {
    mode: "mcp-workflow-macro",
    data: {
      macroTitle: "야간 비 장면 3D 카메라·조명 세팅",
      summary: "3D 배경 카메라를 맞춘 뒤 말풍선 안전 여백을 검증합니다.",
      zeroCostSafe: true,
      steps: [
        { stepOrder: 1, toolName: "studio_set_camera", reasonKo: "35mm 로우 앵글 고정", argumentsJson: '{"lensMm":35}' },
        { stepOrder: 2, toolName: "studio_check_preflight", reasonKo: "말풍선 가독성 검증", argumentsJson: '{"minContrast":4.5}' },
      ],
    },
  },
];

function makeSuccess(result: StudioOpenAiExtendedStructuredResult): StudioOpenAiAssistSuccess {
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    result,
    privacy: { storeData: false, piiRedactedCount: 0 },
    quota: { remainingDaily: 55, dailyLimit: 60 },
    usage: { promptTokens: 90, completionTokens: 140, totalTokens: 230 },
  };
}

function renderSessionPanel(panel: ReactElement) {
  const ownerId = useApp.getState().userId;
  const session: SessionContextValue = ownerId
    ? { data: { user: { id: ownerId } }, ready: true, status: "authenticated", update: async () => null }
    : { data: null, ready: true, status: "unauthenticated", update: async () => null };
  return render(<SessionContext.Provider value={session}>{panel}</SessionContext.Provider>);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useApp.getState().setSessionIdentity(null, null);
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("OpenAI 14모드 확장 렌더링·세션 복원·원문 비교·부분 실행취소·무과금 랩 접근", () => {
  it("확장 10종 모드가 모두 빈 카드 없이 렌더링되고 세션 저장/복원을 통과한다", () => {
    expect(ALL_STUDIO_OPENAI_ASSIST_MODES).toHaveLength(14);

    for (const extended of EXTENDED_RESULTS) {
      expect(isValidStudioOpenAiStructuredResult(extended)).toBe(true);
      const response = makeSuccess(extended);
      const submittedPrompt = `합성 원고 요청 (${extended.mode})`;
      writeStudioAssistantSessionState(
        `proj-${extended.mode}`,
        {
          prompt: "다음 요청을 위한 편집 중인 초안",
          submittedPrompt,
          openAiMode: extended.mode,
          lastResult: response,
        },
        window.sessionStorage,
      );
      const restored = readStudioAssistantSessionState(
        `proj-${extended.mode}`,
        window.sessionStorage,
      );
      expect(restored?.openAiMode).toBe(extended.mode);
      expect(restored?.lastResult?.result.mode).toBe(extended.mode);
      expect(restored?.prompt).toBe("다음 요청을 위한 편집 중인 초안");
      expect(restored?.submittedPrompt).toBe(submittedPrompt);

      const view = render(
        <StudioOpenAiAssistResultCard
          response={response}
          originalPrompt={restored?.submittedPrompt}
        />,
      );
      expect(screen.getByTestId(`openai-extended-result-${extended.mode}`)).toBeTruthy();
      expect(screen.getByTestId("openai-original-vs-suggestion").textContent).toContain(
        submittedPrompt,
      );
      view.unmount();
    }
  });

  it("자동 단계가 없는 매크로는 수동 대기와 복사할 재개 조건을 표시한다", () => {
    const summary = "분필 가루 레이어의 실제 ID를 확인한 뒤 편집기에서 불투명도를 19%로 맞추세요.";
    const result: StudioOpenAiExtendedStructuredResult = {
      mode: "mcp-workflow-macro", data: { macroTitle: "분필 가루", summary, zeroCostSafe: true, steps: [] },
    };
    expect(isValidStudioOpenAiStructuredResult(result)).toBe(true);
    const onCopy = vi.fn();
    render(<StudioOpenAiExtendedResultBody result={result} copiedKey={null} onCopy={onCopy} />);
    expect(screen.getByText("자동 단계 없음 · 수동 확인 대기")).toBeTruthy();
    expect(screen.getByText(summary)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "재개 조건 복사" }));
    expect(onCopy).toHaveBeenCalledWith("mcp-macro", summary);
  });

  it.each([[null, "엔딩 점수 미평가"], [0, "엔딩 흡인력 AI 추정 0/100"]] as const)(
    "엔딩 점수 %s를 저장·복원한 뒤 편집 추정과 미평가를 구별해 표시한다", (score, label) => {
      const previous = EXTENDED_RESULTS.find(result => result.mode === "scroll-pacing-auditor");
      if (!previous || previous.mode !== "scroll-pacing-auditor") throw new Error("스크롤 예시 누락");
      const response = makeSuccess({ mode: previous.mode, data: { ...previous.data, cliffhangerScore: score } });
      writeStudioAssistantSessionState("saved-ending", {
        prompt: "원고", openAiMode: previous.mode, lastResult: response,
      }, window.sessionStorage);
      const restored = readStudioAssistantSessionState("saved-ending", window.sessionStorage)?.lastResult;
      if (!restored) throw new Error("저장된 엔딩 결과 누락");
      render(<StudioOpenAiAssistResultCard response={restored} />);
      const card = screen.getByTestId("openai-extended-result-scroll-pacing-auditor");
      expect(card.textContent).toContain(label);
      expect(card.textContent).toContain(previous.data.cliffhangerTip);
      if (score === null) expect(card.textContent).not.toContain("/100");
    },
  );

  const authorId = "comparison-author";
  const comparisonProjectId = "project-original-input";
  const originalInput = "서연의 캐릭터 바이블을 정리해 줘";
  const statusResponse = () => Response.json({
    configured: true,
    provider: "openai",
    model: "gpt-4o-mini",
    modes: [
      { id: "character-bible-forge", labelKo: "캐릭터 바이블 생성", descriptionKo: "캐릭터" },
    ],
  });

  function renderComparisonPanel(fetchImpl: typeof fetch) {
    return renderSessionPanel(
      <MemoryRouter>
        <StudioProjectAssistantPanel
          projectId={comparisonProjectId}
          section="story"
          locale="ko"
          fetchImpl={fetchImpl}
        />
      </MemoryRouter>,
    );
  }

  it.each(["다음 요청을 위한 별도 초안", ""])("편집 후 다시 열어도 받은 결과의 원문을 유지한다 (%j)", async (editedDraft) => {
    useApp.getState().setSessionIdentity(authorId, null);
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => statusResponse())
      .mockImplementationOnce(async () => Response.json(makeSuccess(EXTENDED_RESULTS[0])))
      .mockImplementationOnce(async () => statusResponse());

    const view = renderComparisonPanel(fetchMock);
    fireEvent.click(await screen.findByTestId("openai-mode-character-bible-forge"));
    fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value: originalInput } });
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    expect((await screen.findByTestId("openai-original-vs-suggestion")).textContent).toContain(originalInput);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ inputText: originalInput });

    fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value: editedDraft } });
    view.unmount();
    renderComparisonPanel(fetchMock);

    expect(await screen.findByTestId("openai-extended-result-character-bible-forge")).toBeTruthy();
    expect(screen.getByLabelText<HTMLTextAreaElement>("요청 내용").value).toBe(editedDraft);
    expect(screen.getByTestId("openai-original-vs-suggestion").textContent).toContain(originalInput);
    expect(readStudioAssistantSessionState(comparisonProjectId, window.sessionStorage, authorId)?.submittedPrompt).toBe(originalInput);
  });

  it("로그인·게스트가 공유하던 v1 원고는 게스트 화면에서 복원하지 않는다", async () => {
    const legacyKey = `toonstudio:assistant-draft:v1:${comparisonProjectId}`;
    const previousDraft = JSON.stringify({
      prompt: "이전 로그인 작가의 편집 중 원고",
      openAiMode: "character-bible-forge",
      lastResult: makeSuccess(EXTENDED_RESULTS[0]),
    });
    window.sessionStorage.setItem(legacyKey, previousDraft);
    const fetchMock = vi.fn<typeof fetch>().mockImplementationOnce(async () => statusResponse());

    renderComparisonPanel(fetchMock);
    await screen.findByTestId("openai-mode-character-bible-forge");

    expect(screen.getByLabelText<HTMLTextAreaElement>("요청 내용").value).not.toContain("이전 로그인 작가");
    expect(screen.queryByTestId("openai-extended-result-character-bible-forge")).toBeNull();
    expect(window.sessionStorage.getItem(legacyKey)).toBe(previousDraft);
  });

  it("같은 계정의 저장본에서 제출 원문이 없으면 입력과 결과만 복원한다", async () => {
    useApp.getState().setSessionIdentity(authorId, null);
    const editedDraft = "보낸 원문과 다른 편집 중 초안";
    window.sessionStorage.setItem(
      studioAssistantSessionKey(comparisonProjectId, authorId),
      JSON.stringify({
        prompt: editedDraft,
        openAiMode: "character-bible-forge",
        lastResult: makeSuccess(EXTENDED_RESULTS[0]),
      }),
    );
    const fetchMock = vi.fn<typeof fetch>().mockImplementationOnce(async () => statusResponse());

    renderComparisonPanel(fetchMock);

    expect(await screen.findByTestId("openai-extended-result-character-bible-forge")).toBeTruthy();
    expect(screen.getByLabelText<HTMLTextAreaElement>("요청 내용").value).toBe(editedDraft);
    expect(screen.queryByTestId("openai-original-vs-suggestion")).toBeNull();
  });

  it.each(["append", "undo"])("컷 계획 %s 저장 실패 시 재시도하고 새 컷만 되돌린다", async (failedAction) => {
    useApp.getState().setSessionIdentity(authorId, null);
    createStudioProject(window.localStorage, {
      id: "project-undo-test",
      title: "비 오는 보관소",
      description: "느와르 미스터리 웹툰",
      kind: "webtoon",
      definition: createStudioProjectDefinition({
        format: "vertical-webtoon",
        purpose: "serial",
        startPoint: "storyboard",
        collaboration: "solo",
        primaryWorkspace: "webtoon",
        enabledWorkspaces: ["webtoon"],
        deliveryProfileIds: ["vertical-scroll-webtoon"],
      }),
    });

    const baselineSuite = ensureStudioProjectFeatureSuite(
      window.localStorage,
      "project-undo-test",
    );
    const baselineCount = baselineSuite.storyBeats.length;

    const statusPayload = {
      configured: true,
      provider: "openai",
      model: "gpt-4o-mini",
      keyLocation: "server-env-only",
      storeData: false,
      piiMasking: true,
      autoBillingDisabled: null,
      modelConfigurationError: null,
      modes: [
        { id: "script-to-cuts", labelKo: "대본 → 컷 분할", descriptionKo: "컷 분할" },
        { id: "character-bible-forge", labelKo: "캐릭터 바이블 생성", descriptionKo: "캐릭터" },
      ],
      limits: { burstPerMinute: 5, hourlyRequests: 20, dailyRequests: 60, maxInputChars: 6000 },
      setupNoticeKo: "연결됨",
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(statusPayload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "openai",
            model: "gpt-4o-mini",
            result: {
              mode: "script-to-cuts",
              data: {
                episodeGoal: "열쇠를 건네받는 첫 장면 긴장감 형성",
                pacingTip: "1컷과 2컷 사이 여백을 넓게 두세요.",
                cuts: [
                  {
                    cutNumber: 1,
                    beatKind: "setup",
                    shotType: "와이드 샷",
                    visualAction: "빗속 지하철 출구 계단",
                    dialogue: "",
                    scrollGapHint: "보통 여백",
                  },
                  {
                    cutNumber: 2,
                    beatKind: "dialogue",
                    shotType: "클로즈업",
                    visualAction: "황동 열쇠를 내미는 손",
                    dialogue: "오늘 안에 이 보관함부터 열어.",
                    scrollGapHint: "넓은 여백",
                  },
                ],
              },
            },
            privacy: { storeData: false, piiRedactedCount: 0 },
            quota: { remainingDaily: 59, dailyLimit: 60 },
            usage: { promptTokens: 110, completionTokens: 160, totalTokens: 270 },
          }),
          { status: 200 },
        ),
      );

    renderSessionPanel(
      <MemoryRouter initialEntries={["/studio/p/project-undo-test/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-undo-test"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("openai-mode-character-bible-forge")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("openai-mode-script-to-cuts"));
    const originalDraft = "비가 쏟아지는 지하철 입구에서 윤태오가 서연에게 7번 보관함 열쇠를 건넨다.";
    fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value: originalDraft } });
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("openai-original-vs-suggestion").textContent).toContain(
        originalDraft,
      );
    });

    // genreOrTone가 프로젝트 설명에서 함께 전달되었는지 검증
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      mode: "script-to-cuts",
      genreOrTone: "느와르 미스터리 웹툰",
    });

    const storyStorageKey = studioProjectFeatureSuiteStorageKey("project-undo-test");
    const rejectStorySave = (action: () => void) => {
      const originalSetItem = Storage.prototype.setItem;
      const attempt = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (this === window.localStorage && key === storyStorageKey) {
          throw new DOMException("테스트 저장 한도", "QuotaExceededError");
        }
        originalSetItem.call(this, key, value);
      });
      try {
        action();
        expect(attempt).toHaveBeenCalled();
      } finally {
        attempt.mockRestore();
      }
    };
    const append = () => fireEvent.click(screen.getByRole("button", {
      name: "기획 컷 목록에 사본으로 추가",
    }));
    const undo = () => fireEvent.click(screen.getByTestId("openai-undo-appended-beats-btn"));

    if (failedAction === "append") {
      rejectStorySave(append);
      expect(ensureStudioProjectFeatureSuite(window.localStorage, "project-undo-test").storyBeats)
        .toEqual(baselineSuite.storyBeats);
      expect(screen.getByRole("button", { name: "기획 컷 목록에 사본으로 추가" }).getAttribute("disabled")).toBeNull();
      expect(screen.queryByTestId("openai-undo-appended-beats-btn")).toBeNull();
      expect(screen.getByRole("alert").textContent).toContain("프로젝트 기능 변경 내용을 저장하지 못했습니다");
    }

    append();
    const afterAppend = ensureStudioProjectFeatureSuite(window.localStorage, "project-undo-test");
    expect(afterAppend.storyBeats).toHaveLength(baselineCount + 2);

    // 2) 사용자가 직접 수동 컷을 1개 더 추가한 뒤 AI 실행취소를 눌러도 수동 컷은 보존되어야 한다
    updateStudioProjectFeatureSuite(window.localStorage, "project-undo-test", (current) => ({
      ...current,
      storyBeats: [
        ...current.storyBeats,
        {
          id: "manual-beat:preserve-me",
          sceneId: "scene:manual",
          order: current.storyBeats.length,
          kind: "reaction",
          summary: "작가가 직접 넣은 반응 컷",
          dialogue: "정말 이게 마지막 단서일까?",
          characterIds: ["character:lead"],
          locationId: "location:opening",
        },
      ],
    }));

    if (failedAction === "undo") {
      const beforeUndo = ensureStudioProjectFeatureSuite(window.localStorage, "project-undo-test");
      rejectStorySave(undo);
      expect(ensureStudioProjectFeatureSuite(window.localStorage, "project-undo-test").storyBeats)
        .toEqual(beforeUndo.storyBeats);
      expect(screen.getByTestId("openai-undo-appended-beats-btn").getAttribute("disabled")).toBeNull();
      expect(screen.getByRole("alert").textContent).toContain("프로젝트 기능 변경 내용을 저장하지 못했습니다");
    }

    undo();
    expect(screen.queryByRole("alert")).toBeNull();
    const afterUndo = ensureStudioProjectFeatureSuite(window.localStorage, "project-undo-test");
    expect(afterUndo.storyBeats).toHaveLength(baselineCount + 1);
    expect(afterUndo.storyBeats.some((beat) => beat.id === "manual-beat:preserve-me")).toBe(true);
    expect(afterUndo.storyBeats.some((beat) => beat.dialogue === "오늘 안에 이 보관함부터 열어.")).toBe(
      false,
    );
  });

  it("OPENAI_API_KEY가 미설정 상태여도 무과금 14모드 AI 랩을 바로 열고 진행 중 요청을 취소할 수 있다", async () => {
    let capturedCancelSignal: AbortSignal | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((url, init) => {
      const target = String(url);
      if (target.includes("/openai-assist/status")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              configured: false,
              provider: "openai",
              model: "gpt-4o-mini",
              modes: [],
              setupNoticeKo: "서버에 OPENAI_API_KEY가 없습니다.",
            }),
            { status: 200 },
          ),
        );
      }
      if (target.includes("/creative-assist")) {
        capturedCancelSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return Promise.reject(new Error("offline"));
    });

    renderSessionPanel(
      <MemoryRouter initialEntries={["/studio/p/project-free-lab/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-free-lab"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    // OpenAI 결과 카드가 없어도 무과금 14모드 AI 랩 버튼이 바로 보여야 한다
    const toggleBtn = screen.getByTestId("toggle-free-ai-lab-btn");
    fireEvent.click(toggleBtn);

    const runBtn = await screen.findByTestId("free-ai-workbench-run-btn");
    fireEvent.click(runBtn);

    const cancelBtn = await screen.findByTestId("free-ai-workbench-cancel-btn");
    fireEvent.click(cancelBtn);

    expect(capturedCancelSignal?.aborted).toBe(true);
    expect(screen.queryByTestId("free-ai-workbench-cancel-btn")).toBeNull();
    expect(screen.getByText(/무과금 AI 분석 요청을 취소했어요/u)).toBeTruthy();
  });

  it("오류 발생 후에도 입력 문장이 남고 재시도로 정상 결과를 복구한다", async () => {
    useApp.getState().setSessionIdentity(authorId, null);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            configured: true,
            provider: "openai",
            model: "gpt-4o-mini",
            modes: [
              { id: "character-bible-forge", labelKo: "캐릭터 바이블 생성", descriptionKo: "캐릭터" },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "UPSTREAM_503", message: "일시적인 서버 혼잡입니다. 다시 시도해 주세요." }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeSuccess(EXTENDED_RESULTS[0])),
          { status: 200 },
        ),
      );

    renderSessionPanel(
      <MemoryRouter initialEntries={["/studio/p/project-retry/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-retry"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId("openai-mode-character-bible-forge"));
    const textarea = screen.getByLabelText("요청 내용") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "서연의 캐릭터 바이블을 정리해 줘" } });

    // 1차 시도 실패
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("일시적인 서버 혼잡");
    });
    expect(textarea.value).toBe("서연의 캐릭터 바이블을 정리해 줘");

    // 2차 재시도 성공
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("openai-extended-result-character-bible-forge")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      expect(JSON.parse(String(init?.body))).toMatchObject({ mode: "character-bible-forge" });
    }
  });
});
