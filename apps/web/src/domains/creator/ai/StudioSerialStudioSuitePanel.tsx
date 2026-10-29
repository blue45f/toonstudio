/**
 * StudioSerialStudioSuitePanel.tsx
 *
 * https://www.ggumtoon.com/ (꿈툰 - AI 웹툰·웹소설 창작 스튜디오 및 연재·지갑·정산 플랫폼)
 * 전 기능을 툰스튜디오 웹스튜디오 안에서 실행·검증·적용할 수 있는 통합 워크스페이스 패널.
 */
import { BookText, Coins, FileCheck2, ImagePlus, Palette, Sparkles, UserPlus, Wand2 } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  clampSerialStudioSpacerPanelHeight,
  computeSerialStudioSpacerGradientCoordinates,
  generateSerialStudioAiNovelEpisode,
  generateSerialStudioCharacterSheetCandidates,
  generateSerialStudioSceneImages,
  generateSerialStudioStyleCandidates,
  SERIAL_STUDIO_OPENAI_SIZES,
  SERIAL_STUDIO_CREDIT_COSTS,
  SERIAL_STUDIO_STYLE_QUICK_PRESETS,
  runSerialStudioSceneInpaint,
  validateSerialStudioNovelUploadFile,
  validateSerialStudioUploadedWebtoonImage,
  type SerialStudioDetectedCharacterCandidate,
  type SerialStudioOpenAiSizeId,
  type SerialStudioSceneQualityMode,
  type SerialStudioSceneTextMode,
  type SerialStudioSceneItem,
} from "./serial-studio-suite";
import { StudioSerialPlatformSubPanel } from "./StudioSerialPlatformSubPanel";

import { cn } from "@/shared/lib/utils";

export interface StudioSerialStudioSuitePanelProps {
  readonly scriptInput?: string;
  readonly onApplyScript?: (nextScript: string) => void;
}

type SerialStudioWorkspaceTab = "STYLE_CHAR" | "SCENE_INPAINT" | "NOVEL_UPLOAD" | "PLATFORM_ECONOMY";

const DEFAULT_STYLE_NAME = "로맨스 판타지 시그니처";

export function StudioSerialStudioSuitePanel({
  scriptInput = "",
  onApplyScript,
}: StudioSerialStudioSuitePanelProps): ReactElement {
  const [activeTab, setActiveTab] = useState<SerialStudioWorkspaceTab>("STYLE_CHAR");
  const [credits, setCredits] = useState<number>(100);

  // 1. 스타일 & 캐릭터 시트 상태
  const [stylePrompt, setStylePrompt] = useState<string>(SERIAL_STUDIO_STYLE_QUICK_PRESETS[0]!);
  const [styleCandidates, setStyleCandidates] = useState<readonly string[]>([]);
  const [selectedStyleIdx, setSelectedStyleIdx] = useState<number>(0);
  const [isStyleConfirmed, setIsStyleConfirmed] = useState<boolean>(false);
  const [detectedCharacters, setDetectedCharacters] = useState<readonly SerialStudioDetectedCharacterCandidate[]>([]);

  const [charName, setCharName] = useState<string>("김지훈");
  const [charAppearance, setCharAppearance] = useState<string>("검은 단발머리, 붉은 눈동자, 날카로운 인상, 20대 초반 남성");
  const [charDescription, setCharDescription] = useState<string>("주인공, 냉철한 성격");
  const [charSheetUrls, setCharSheetUrls] = useState<readonly string[]>([]);

  // 2. 장면 생성 · 인페인팅 · 여백 패널 상태
  const [isCuttoonMode, setIsCuttoonMode] = useState<boolean>(false);
  const [sceneState, setSceneState] = useState<SerialStudioSceneItem>({
    id: "scene-1",
    prompt: scriptInput.trim() || "달빛 아래 두 남녀가 마주보며 서 있는 영화적 클로즈업 장면",
    mode: "normal",
    size: "1024x1536",
    textMode: "no_text",
    selectedCharacterIds: ["char-1"],
    autoReferenceEnabled: true,
    customReferenceImageB64: null,
    candidateImages: null,
    selectedImageIndex: null,
    savedSceneId: null,
    confirmedImageUrl: "https://cdn.toonstudio.local/ggumtoon/scenes/prev-confirmed.webp",
    savedBubbles: [],
    textPanel: {
      height: 240,
      backgroundColor: "#ffffff",
      backgroundGradient: { angle: 180, colorStart: "#1a1828", colorStop: "#7C5CFC" },
      bubbles: [],
    },
  });
  const [inpaintPrompt, setInpaintPrompt] = useState<string>("배경을 밤하늘로 변경, 캐릭터 표정을 슬프게");
  const [inpaintResults, setInpaintResults] = useState<readonly string[]>([]);
  const [spacerHeightInput, setSpacerHeightInput] = useState<number>(240);
  const [spacerAngleInput, setSpacerAngleInput] = useState<number>(180);

  // 3. 웹소설 AI 생성 · TXT/DOCX 추출 · 원고 높이 검증 상태
  const [novelPlot, setNovelPlot] = useState<string>(
    "회귀한 황녀가 북부 대공과 비밀 계약 결혼을 맺고 제국의 음모를 뒤집는 이야기",
  );
  const [generatedNovelText, setGeneratedNovelText] = useState<string>("");
  const [uploadFileName, setUploadFileName] = useState<string>("episode_01.docx");
  const [uploadSimCharCount, setUploadSimCharCount] = useState<number>(7500);
  const [manuscriptHeightPx, setManuscriptHeightPx] = useState<number>(1440);

  const spacerGradientInfo = useMemo(
    () =>
      computeSerialStudioSpacerGradientCoordinates(600, clampSerialStudioSpacerPanelHeight(spacerHeightInput), {
        angle: spacerAngleInput,
        colorStart: "#1a1828",
        colorStop: "#7C5CFC",
      }),
    [spacerHeightInput, spacerAngleInput],
  );

  const novelFileValidation = useMemo(
    () =>
      validateSerialStudioNovelUploadFile({
        fileName: uploadFileName,
        byteSize: 240_000,
        extractedText: "가".repeat(Math.max(0, uploadSimCharCount)),
      }),
    [uploadFileName, uploadSimCharCount],
  );

  const webtoonImageValidation = useMemo(
    () =>
      validateSerialStudioUploadedWebtoonImage({
        fileName: "cut_01.webp",
        naturalWidth: 800,
        naturalHeight: manuscriptHeightPx,
      }),
    [manuscriptHeightPx],
  );

  const handleGenerateStyle = (isRegeneration: boolean) => {
    const res = generateSerialStudioStyleCandidates({
      workId: "work-01",
      genre: "로맨스",
      prompt: stylePrompt,
      currentCredits: credits,
      isRegeneration,
    });
    if (res.ok) {
      setStyleCandidates(res.images);
      setSelectedStyleIdx(0);
      setCredits(res.creditsRemaining);
      setDetectedCharacters(res.detectedCharacters);
      setIsStyleConfirmed(false);
    }
  };

  const handleGenerateCharacterSheet = () => {
    const res = generateSerialStudioCharacterSheetCandidates({
      workId: "work-01",
      name: charName,
      appearancePrompt: charAppearance,
      description: charDescription,
      currentCredits: credits,
    });
    if (res.ok) {
      setCharSheetUrls(res.imageUrls);
      setCredits(res.creditsRemaining);
    }
  };

  const handleGenerateScene = () => {
    const res = generateSerialStudioSceneImages({
      scene: sceneState,
      workTitle: "레벨업 연애",
      workGenre: "로맨스",
      isCuttoon: isCuttoonMode,
      lastConfirmedImageUrl: sceneState.confirmedImageUrl,
      currentCredits: credits,
    });
    if (res.ok) {
      setSceneState((prev) => ({
        ...prev,
        size: res.effectiveSize,
        candidateImages: res.images,
        selectedImageIndex: 0,
      }));
      setCredits(res.creditsRemaining);
    }
  };

  const handleRunInpaint = () => {
    const baseImg =
      sceneState.candidateImages?.[sceneState.selectedImageIndex ?? 0] ??
      sceneState.confirmedImageUrl ??
      "https://cdn.toonstudio.local/ggumtoon/scenes/default.webp";
    const res = runSerialStudioSceneInpaint({
      sceneId: sceneState.id,
      baseImageUrl: baseImg,
      editPrompt: inpaintPrompt,
      size: isCuttoonMode ? "1024x1024" : sceneState.size,
      currentCredits: credits,
    });
    if (res.ok) {
      setInpaintResults(res.inpaintedImages);
      setCredits(res.creditsRemaining);
    }
  };

  const handleGenerateNovel = () => {
    const res = generateSerialStudioAiNovelEpisode({
      workTitle: "레벨업 연애",
      genre: "로맨스",
      plotSummary: novelPlot,
      currentCredits: credits,
    });
    if (res.ok) {
      setGeneratedNovelText(res.generatedText);
      setCredits(res.creditsRemaining);
      onApplyScript?.(res.generatedText);
    }
  };

  return (
    <section
      aria-label="꿈툰(Ggumtoon) AI 웹툰·웹소설 창작 스튜디오 및 플랫폼 통합 워크스페이스"
      data-testid="studio-ggumtoon-suite-panel"
      className="mt-3 space-y-3 rounded-xl border border-accent/40 bg-card/95 p-3 text-xs shadow-sm"
    >
      {/* 헤더 및 크레딧 잔액 표시 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Sparkles size={13} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-fg">
              꿈툰 (Ggumtoon · ggumtoon.com) AI 창작 스튜디오 & 연재·정산 통합 스위트
            </h3>
            <p className="text-[0.6rem] text-fg-3">
              스타일 3장 생성·등장인물 자동인식 · 캐릭터 시트 · 장면/인페인팅/여백 패널 · 웹소설 DOCX · 이중지갑/기다무/정산
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-testid="ggumtoon-studio-credits-badge"
            className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1 text-[0.65rem] font-bold text-accent"
          >
            <Coins size={12} aria-hidden="true" />
            크레딧 잔액: {credits}개
          </span>
          <button
            type="button"
            data-testid="ggumtoon-recharge-credits-btn"
            onClick={() => setCredits((c) => c + 50)}
            className={cn(
              "rounded-lg bg-accent px-2 py-1 text-[0.6rem] font-bold text-fg",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            +50 크레딧 충전
          </button>
        </div>
      </div>

      {/* 4대 워크스페이스 탭 */}
      <div
        role="tablist"
        aria-label="꿈툰 스튜디오 기능 탭"
        className="grid grid-cols-2 gap-1 sm:grid-cols-4"
      >
        {(
          [
            { id: "STYLE_CHAR", label: "1. 스타일 · 캐릭터 시트" },
            { id: "SCENE_INPAINT", label: "2. 장면 생성 · 인페인팅 · 여백" },
            { id: "NOVEL_UPLOAD", label: "3. 웹소설 AI · DOCX · 원고검증" },
            { id: "PLATFORM_ECONOMY", label: "4. 연재 · 지갑 · 기다무 · 정산" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-testid={`ggumtoon-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[0.64rem] font-bold transition-colors",
              activeTab === tab.id
                ? "border-accent bg-accent text-fg"
                : "border-line bg-raised text-fg-2 hover:bg-card",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 1: 스타일 생성 + 등장인물 자동 인식 + 캐릭터 시트 */}
      {activeTab === "STYLE_CHAR" ? (
        <div
          data-testid="ggumtoon-panel-style-char"
          className="grid grid-cols-1 gap-2.5 lg:grid-cols-2"
        >
          <div className="space-y-2 rounded-lg border border-line bg-raised p-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 font-bold text-fg">
                <Palette size={12} className="text-accent" aria-hidden="true" />
                웹툰 스타일 레퍼런스 3장 생성 ({SERIAL_STUDIO_CREDIT_COSTS.style_generate_initial}크레딧 / 재생성{" "}
                {SERIAL_STUDIO_CREDIT_COSTS.style_regenerate}크레딧)
              </span>
              {isStyleConfirmed ? (
                <span
                  data-testid="ggumtoon-style-confirmed-badge"
                  className="rounded bg-good/20 px-1.5 py-0.5 text-[0.58rem] font-bold text-good"
                >
                  ✓ 웹툰 스타일 확정됨 ({DEFAULT_STYLE_NAME})
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1">
              {SERIAL_STUDIO_STYLE_QUICK_PRESETS.map((preset, idx) => (
                <button
                  key={preset}
                  type="button"
                  data-testid={`ggumtoon-style-preset-${idx + 1}`}
                  onClick={() => setStylePrompt(preset)}
                  className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.56rem] text-fg-2 hover:border-accent"
                >
                  빠른 시작 #{idx + 1}
                </button>
              ))}
            </div>

            <textarea
              aria-label="그림체 설명 입력"
              data-testid="ggumtoon-style-prompt-input"
              rows={2}
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              className="w-full resize-none rounded border border-line bg-card px-2.5 py-1.5 text-[0.65rem] text-fg"
            />

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="ggumtoon-generate-style-btn"
                onClick={() => handleGenerateStyle(false)}
                className="rounded bg-accent px-2.5 py-1 text-[0.62rem] font-bold text-fg"
              >
                ⚡ 스타일 이미지 생성 · 3크레딧
              </button>
              <button
                type="button"
                data-testid="ggumtoon-regenerate-style-btn"
                onClick={() => handleGenerateStyle(true)}
                className="rounded border border-line bg-card px-2.5 py-1 text-[0.62rem] font-semibold text-fg-2"
              >
                다시 생성하기 · 1크레딧
              </button>
              {styleCandidates.length > 0 ? (
                <button
                  type="button"
                  data-testid="ggumtoon-confirm-style-btn"
                  onClick={() => setIsStyleConfirmed(true)}
                  className="rounded bg-good px-2.5 py-1 text-[0.62rem] font-bold text-fg"
                >
                  이 스타일로 확정하기
                </button>
              ) : null}
            </div>

            {styleCandidates.length > 0 ? (
              <div className="space-y-1.5 rounded border border-line/70 bg-card p-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {styleCandidates.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      data-testid={`ggumtoon-style-cand-${idx}`}
                      onClick={() => setSelectedStyleIdx(idx)}
                      className={cn(
                        "rounded border p-1.5 text-left text-[0.58rem]",
                        selectedStyleIdx === idx
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-raised text-fg-3",
                      )}
                    >
                      스타일 후보 #{idx + 1}
                    </button>
                  ))}
                </div>
                <p
                  data-testid="ggumtoon-detected-characters-summary"
                  className="text-[0.58rem] text-fg-2"
                >
                  등장인물 자동 인식(/api/studio/detect-characters):{" "}
                  <strong>{detectedCharacters.length}명 감지됨</strong> —{" "}
                  {detectedCharacters[0]?.appearancePrompt}
                </p>
              </div>
            ) : null}
          </div>

          {/* 캐릭터 시트 3장 생성기 */}
          <div className="space-y-2 rounded-lg border border-line bg-raised p-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 font-bold text-fg">
                <UserPlus size={12} className="text-accent" aria-hidden="true" />
                캐릭터 시트 등록 및 재생성 (/api/character/create-sheet ·{" "}
                {SERIAL_STUDIO_CREDIT_COSTS.character_sheet}크레딧)
              </span>
              <span className="text-[0.58rem] text-fg-3">3장 후보 동시 생성</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-0.5">
                <span className="text-[0.58rem] text-fg-3">캐릭터 이름</span>
                <input
                  type="text"
                  data-testid="ggumtoon-char-name-input"
                  value={charName}
                  onChange={(e) => setCharName(e.target.value)}
                  className="w-full rounded border border-line bg-card px-2 py-1 text-[0.64rem] text-fg"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[0.58rem] text-fg-3">추가 설명 (성격·역할)</span>
                <input
                  type="text"
                  value={charDescription}
                  onChange={(e) => setCharDescription(e.target.value)}
                  className="w-full rounded border border-line bg-card px-2 py-1 text-[0.64rem] text-fg"
                />
              </label>
            </div>

            <textarea
              aria-label="캐릭터 외모 설명 입력"
              data-testid="ggumtoon-char-appearance-input"
              rows={2}
              value={charAppearance}
              onChange={(e) => setCharAppearance(e.target.value)}
              className="w-full resize-none rounded border border-line bg-card px-2.5 py-1.5 text-[0.64rem] text-fg"
            />

            <button
              type="button"
              data-testid="ggumtoon-create-charsheet-btn"
              onClick={handleGenerateCharacterSheet}
              className="w-full rounded bg-accent py-1.5 text-[0.63rem] font-bold text-fg"
            >
              이미지 3장 생성하기 (크레딧 {SERIAL_STUDIO_CREDIT_COSTS.character_sheet}개)
            </button>

            {charSheetUrls.length > 0 ? (
              <div
                data-testid="ggumtoon-charsheet-results"
                className="grid grid-cols-3 gap-1.5 pt-1"
              >
                {charSheetUrls.map((u, idx) => (
                  <div
                    key={u}
                    className="rounded border border-accent/40 bg-card p-1.5 text-[0.56rem] text-fg-2"
                  >
                    시트 후보 #{idx + 1}: {charName}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 탭 2: 장면 생성 · 부분 수정(인페인팅) · 여백 패널 */}
      {activeTab === "SCENE_INPAINT" ? (
        <div
          data-testid="ggumtoon-panel-scene-inpaint"
          className="grid grid-cols-1 gap-2.5 lg:grid-cols-2"
        >
          <div className="space-y-2 rounded-lg border border-line bg-raised p-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 font-bold text-fg">
                <ImagePlus size={12} className="text-accent" aria-hidden="true" />
                장면 생성기 (일반 3장·3크레딧 / 하이라이트 1장·5크레딧)
              </span>
              <label className="inline-flex items-center gap-1 text-[0.58rem] text-fg-2">
                <input
                  type="checkbox"
                  data-testid="ggumtoon-cuttoon-mode-toggle"
                  checked={isCuttoonMode}
                  onChange={(e) => setIsCuttoonMode(e.target.checked)}
                />
                컷툰 포맷 (1024×1024 고정)
              </label>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded border border-line bg-card p-1.5 space-y-1">
                <span className="text-[0.58rem] font-semibold text-fg-3">생성 퀄리티</span>
                <div className="flex gap-1">
                  {(["normal", "highlight"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      data-testid={`ggumtoon-scene-mode-${m}`}
                      onClick={() =>
                        setSceneState((prev) => ({
                          ...prev,
                          mode: m as SerialStudioSceneQualityMode,
                        }))
                      }
                      className={cn(
                        "flex-1 rounded border py-1 text-[0.58rem] font-semibold",
                        sceneState.mode === m
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-raised text-fg-3",
                      )}
                    >
                      {m === "normal" ? "일반 (3장·3C)" : "하이라이트 (1장·5C)"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded border border-line bg-card p-1.5 space-y-1">
                <span className="text-[0.58rem] font-semibold text-fg-3">텍스트 옵션</span>
                <div className="flex gap-1">
                  {(["no_text", "with_text"] as const).map((tm) => (
                    <button
                      key={tm}
                      type="button"
                      data-testid={`ggumtoon-text-mode-${tm}`}
                      onClick={() =>
                        setSceneState((prev) => ({
                          ...prev,
                          textMode: tm as SerialStudioSceneTextMode,
                        }))
                      }
                      className={cn(
                        "flex-1 rounded border py-1 text-[0.58rem] font-semibold",
                        sceneState.textMode === tm
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-raised text-fg-3",
                      )}
                    >
                      {tm === "no_text" ? "텍스트 없이" : "텍스트 포함"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {SERIAL_STUDIO_OPENAI_SIZES.map((sz) => (
                <button
                  key={sz.id}
                  type="button"
                  disabled={isCuttoonMode && sz.id !== "1024x1024"}
                  data-testid={`ggumtoon-size-${sz.id}`}
                  onClick={() =>
                    setSceneState((prev) => ({
                      ...prev,
                      size: sz.id as SerialStudioOpenAiSizeId,
                    }))
                  }
                  className={cn(
                    "rounded border p-1.5 text-left disabled:opacity-40",
                    (isCuttoonMode ? "1024x1024" : sceneState.size) === sz.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2",
                  )}
                >
                  <div className="text-[0.6rem] font-bold">
                    {sz.label} ({sz.ratio})
                  </div>
                  <div className="text-[0.54rem] opacity-80">{sz.id}</div>
                </button>
              ))}
            </div>

            <textarea
              aria-label="장면 묘사 프롬프트"
              data-testid="ggumtoon-scene-prompt-input"
              rows={2}
              value={sceneState.prompt}
              onChange={(e) => setSceneState((prev) => ({ ...prev, prompt: e.target.value }))}
              className="w-full resize-none rounded border border-line bg-card px-2.5 py-1.5 text-[0.64rem] text-fg"
            />

            <button
              type="button"
              data-testid="ggumtoon-generate-scene-btn"
              onClick={handleGenerateScene}
              className="w-full rounded bg-accent py-1.5 text-[0.63rem] font-bold text-fg"
            >
              {sceneState.mode === "highlight"
                ? "⚡ 하이라이트 생성 · 크레딧 5개"
                : "⚡ AI로 생성하기 · 크레딧 3개"}
            </button>

            {sceneState.candidateImages ? (
              <p
                data-testid="ggumtoon-scene-generated-summary"
                className="text-[0.58rem] text-good font-semibold"
              >
                생성 완료: {sceneState.candidateImages.length}장 ({sceneState.size}) · 이전 확정 장면 자동 레퍼런스 적용됨
              </p>
            ) : null}
          </div>

          {/* 부분 수정(인페인팅) & 여백 패널(textPanel) */}
          <div className="space-y-2 rounded-lg border border-line bg-raised p-2.5">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Wand2 size={12} className="text-accent" aria-hidden="true" />
              부분 수정 (인페인팅 · 3크레딧) & 여백 패널 (80~2,000px 드래그 높이)
            </span>

            <input
              type="text"
              aria-label="인페인팅 수정 내용"
              data-testid="ggumtoon-inpaint-prompt-input"
              value={inpaintPrompt}
              onChange={(e) => setInpaintPrompt(e.target.value)}
              placeholder="수정할 내용을 입력하세요 예: 배경을 밤하늘로 변경"
              className="w-full rounded border border-line bg-card px-2.5 py-1.5 text-[0.64rem] text-fg"
            />
            <button
              type="button"
              data-testid="ggumtoon-run-inpaint-btn"
              onClick={handleRunInpaint}
              className="w-full rounded bg-warn py-1.5 text-[0.62rem] font-bold text-fg"
            >
              부분 수정 시작 (크레딧 3개 · 후보 3장 생성)
            </button>
            {inpaintResults.length > 0 ? (
              <p
                data-testid="ggumtoon-inpaint-results-summary"
                className="text-[0.58rem] text-warn font-semibold"
              >
                인페인팅 수정 후보 {inpaintResults.length}장 생성 완료: {inpaintResults[0]}
              </p>
            ) : null}

            <div className="space-y-1.5 rounded border border-line bg-card p-2">
              <div className="flex items-center justify-between text-[0.58rem]">
                <span className="font-semibold text-fg">
                  + 여백 패널 (클램핑 높이:{" "}
                  <strong data-testid="ggumtoon-spacer-clamped-height">
                    {clampSerialStudioSpacerPanelHeight(spacerHeightInput)}px
                  </strong>
                  )
                </span>
                <span className="text-fg-3">
                  그라디언트 벡터: ({spacerGradientInfo.x0}, {spacerGradientInfo.y0}) → (
                  {spacerGradientInfo.x1}, {spacerGradientInfo.y1})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="space-y-0.5">
                  <span className="text-[0.56rem] text-fg-3">여백 높이 입력 (80~2000px)</span>
                  <input
                    type="number"
                    data-testid="ggumtoon-spacer-height-input"
                    value={spacerHeightInput}
                    onChange={(e) => setSpacerHeightInput(Number(e.target.value) || 0)}
                    className="w-full rounded border border-line bg-raised px-2 py-1 text-[0.62rem] text-fg"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[0.56rem] text-fg-3">그라디언트 각도 (deg)</span>
                  <input
                    type="number"
                    value={spacerAngleInput}
                    onChange={(e) => setSpacerAngleInput(Number(e.target.value) || 0)}
                    className="w-full rounded border border-line bg-raised px-2 py-1 text-[0.62rem] text-fg"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 3: 웹소설 AI 생성 + TXT/DOCX 파일 파서 + 웹툰 세로 1,120px 원고 검증 */}
      {activeTab === "NOVEL_UPLOAD" ? (
        <div
          data-testid="ggumtoon-panel-novel-upload"
          className="grid grid-cols-1 gap-2.5 lg:grid-cols-2"
        >
          <div className="space-y-2 rounded-lg border border-line bg-raised p-2.5">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <BookText size={12} className="text-accent" aria-hidden="true" />
              웹소설 AI 생성기 (/api/studio/generate-novel · 크레딧 3개)
            </span>
            <textarea
              aria-label="웹소설 줄거리 입력"
              data-testid="ggumtoon-novel-plot-input"
              rows={2}
              value={novelPlot}
              onChange={(e) => setNovelPlot(e.target.value)}
              className="w-full resize-none rounded border border-line bg-card px-2.5 py-1.5 text-[0.64rem] text-fg"
            />
            <button
              type="button"
              data-testid="ggumtoon-generate-novel-btn"
              onClick={handleGenerateNovel}
              className="w-full rounded bg-accent py-1.5 text-[0.62rem] font-bold text-fg"
            >
              ✨ AI로 웹소설 내용 생성 및 스튜디오 대본 반영 (3크레딧)
            </button>
            {generatedNovelText ? (
              <pre
                data-testid="ggumtoon-generated-novel-output"
                className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded border border-line bg-card p-2 text-[0.6rem] text-fg-2"
              >
                {generatedNovelText}
              </pre>
            ) : null}
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-raised p-2.5">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <FileCheck2 size={12} className="text-accent" aria-hidden="true" />
              TXT·DOCX 파일 업로드 가이드 (10MB · 권장 5,000~20,000자) & 웹툰 원고 세로 1,120px 검증
            </span>

            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-0.5">
                <span className="text-[0.56rem] text-fg-3">업로드 파일명 (.txt / .docx)</span>
                <input
                  type="text"
                  data-testid="ggumtoon-upload-filename-input"
                  value={uploadFileName}
                  onChange={(e) => setUploadFileName(e.target.value)}
                  className="w-full rounded border border-line bg-card px-2 py-1 text-[0.62rem] text-fg"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[0.56rem] text-fg-3">추출 글자수</span>
                <input
                  type="number"
                  value={uploadSimCharCount}
                  onChange={(e) => setUploadSimCharCount(Number(e.target.value) || 0)}
                  className="w-full rounded border border-line bg-card px-2 py-1 text-[0.62rem] text-fg"
                />
              </label>
            </div>

            <div
              data-testid="ggumtoon-novel-file-validation-msg"
              className="rounded bg-card px-2 py-1 text-[0.6rem] text-fg-2"
            >
              {novelFileValidation.valid
                ? `✓ ${novelFileValidation.extension.toUpperCase()} 파싱 완료 (${novelFileValidation.charCount.toLocaleString()}자 · 권장 분량 충족: ${novelFileValidation.isWithinRecommendedLength ? "예" : "권장 범위 외"})`
                : `✕ ${novelFileValidation.errorMessage}`}
            </div>

            <div className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1.5 text-[0.6rem]">
              <label className="flex items-center gap-1.5">
                <span className="text-fg-3">직접 업로드 컷 세로(px):</span>
                <input
                  type="number"
                  data-testid="ggumtoon-manuscript-height-input"
                  value={manuscriptHeightPx}
                  onChange={(e) => setManuscriptHeightPx(Number(e.target.value) || 0)}
                  className="w-20 rounded border border-line bg-raised px-1.5 py-0.5 text-[0.6rem] text-fg"
                />
              </label>
              <span
                data-testid="ggumtoon-manuscript-validation-msg"
                className={cn(
                  "font-semibold",
                  webtoonImageValidation.valid ? "text-good" : "text-bad",
                )}
              >
                {webtoonImageValidation.valid
                  ? "✓ 세로 1,120px 이상 통과"
                  : webtoonImageValidation.errorMessage}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 4: 플랫폼 경제 · 연재 · 지갑 · 기다무 · 공유 · 뷰어 · 정산 */}
      {activeTab === "PLATFORM_ECONOMY" ? <StudioSerialPlatformSubPanel /> : null}
    </section>
  );
}
