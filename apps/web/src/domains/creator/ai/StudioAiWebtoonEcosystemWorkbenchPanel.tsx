/**
 * StudioAiWebtoonEcosystemWorkbenchPanel.tsx
 *
 * 4대 카테고리 12대 AI 웹툰·인스타툰 보조 어플 REA 역공학 내재화 통합 워크벤치 UI 패널:
 * 1. 올인원 웹툰 및 인스타툰 제작 가속화 툴 (젠툰 GenToon · 투닝 Tooning · ComicAI · Dashtoon)
 * 2. 전문 작화 보조 툴 — 선화·채색·정밀 편집 (에이드 AiD 3.1 · 네이버웹툰 AI 페인터 · 클립스튜디오 페인트)
 * 3. 스토리보드 및 콘티/콘셉트 기획 툴 (LlamaGen AI · 미드저니/스테이블 디퓨전 · 포토샵 AI Adobe Firefly)
 * 4. 사진 및 영상을 만화로 변환하는 스타일 툴 (원더쉐어 필모라 Filmora · 캔바 Canva AI)
 */

import { Brush, Layers, Palette, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  buildComicAiCharacterSheetAndPanels,
  GENTOON_STYLE_FAMILIES,
  GENTOON_SUPPORTED_LANGUAGES,
  runDashtoonAgencyPublishPipeline,
  runGenToonStoryToComicPipeline,
  runTooningTextToCharacterActing,
  type GenToonAspectRatio,
  type GenToonInputMode,
  type GenToonLanguageCode,
  type GenToonOutputFormatId,
  type GenToonStyleFamilyId,
} from "./all-in-one-webtoon-accelerator-suite";
import {
  DEFAULT_NAVER_AI_PAINTER_HINTS,
  runAidStudioPipeline,
  runClipStudioPaintAiAssist,
  runNaverWebtoonAiHintPainter,
  type AidCharacterCreationMode,
  type AidStudioStageId,
  type ColorHintPoint,
} from "./pro-drawing-coloring-assist-suite";
import { REA_WEBTOON_ECOSYSTEM_12_TOOLS } from "./storyboard-style-transfer-suite";
import {
  StudioAiWebtoonCategory3Panel,
  StudioAiWebtoonCategory4Panel,
} from "./StudioAiWebtoonEcosystemCategory34Panels";

import { cn } from "@/shared/lib/utils";

export interface StudioAiWebtoonEcosystemWorkbenchPanelProps {
  readonly scriptInput: string;
  readonly storyGenre?: string;
  readonly onApplyScript: (nextScript: string) => void;
}

type EcosystemCategoryTabId =
  | "cat-1-all-in-one"
  | "cat-2-pro-drawing"
  | "cat-3-storyboard"
  | "cat-4-style-transfer";

const CATEGORY_TABS: readonly {
  readonly id: EcosystemCategoryTabId;
  readonly badge: string;
  readonly labelKo: string;
}[] = Object.freeze([
  {
    id: "cat-1-all-in-one",
    badge: "카테고리 1",
    labelKo: "올인원 가속 (젠툰 · 투닝 · ComicAI · Dashtoon)",
  },
  {
    id: "cat-2-pro-drawing",
    badge: "카테고리 2",
    labelKo: "전문 작화 보조 (에이드 AiD · 네이버 AI 페인터 · 클립스튜디오)",
  },
  {
    id: "cat-3-storyboard",
    badge: "카테고리 3",
    labelKo: "콘티·콘셉트 기획 (LlamaGen · 미드저니/SD · 포토샵 Firefly)",
  },
  {
    id: "cat-4-style-transfer",
    badge: "카테고리 4",
    labelKo: "사진·영상 만화 변환 (필모라 Filmora · 캔바 Canva AI)",
  },
]);

export function StudioAiWebtoonEcosystemWorkbenchPanel({
  scriptInput,
  storyGenre = "로맨스 판타지",
  onApplyScript,
}: StudioAiWebtoonEcosystemWorkbenchPanelProps): ReactElement {
  const [activeTab, setActiveTab] = useState<EcosystemCategoryTabId>("cat-1-all-in-one");

  // Category 1 States (GenToon, Tooning, ComicAI, Dashtoon)
  const [gentoonMode, setGentoonMode] = useState<GenToonInputMode>("anecdote-1600");
  const [gentoonFormat, setGentoonFormat] = useState<GenToonOutputFormatId>(
    "vertical-scroll-webtoon",
  );
  const [gentoonRatio, setGentoonRatio] = useState<GenToonAspectRatio>("9:16");
  const [gentoonStyleId, setGentoonStyleId] = useState<GenToonStyleFamilyId>("webtoon");
  const [gentoonLang, setGentoonLang] = useState<GenToonLanguageCode>("ko");

  // Category 2 States (AiD 3.1, Naver AI Painter, Clip Studio Paint)
  const [aidStage, setAidStage] = useState<AidStudioStageId>("02-lineart-pentouch");
  const [aidCreationMode, setAidCreationMode] =
    useState<AidCharacterCreationMode>("trait-synthesis");
  const [painterHints, setPainterHints] = useState<readonly ColorHintPoint[]>(
    DEFAULT_NAVER_AI_PAINTER_HINTS,
  );
  const [cspToneLpi, setCspToneLpi] = useState<45 | 60 | 85>(60);

  // Computed outputs for Category 1 & 2
  const gentoonResult = useMemo(
    () =>
      runGenToonStoryToComicPipeline({
        rawText: scriptInput,
        inputMode: gentoonMode,
        outputFormat: gentoonFormat,
        aspectRatio: gentoonRatio,
        styleFamilyId: gentoonStyleId,
        languageCode: gentoonLang,
      }),
    [scriptInput, gentoonMode, gentoonFormat, gentoonRatio, gentoonStyleId, gentoonLang],
  );

  const tooningResult = useMemo(
    () => runTooningTextToCharacterActing(scriptInput),
    [scriptInput],
  );

  const comicAiResult = useMemo(
    () => buildComicAiCharacterSheetAndPanels({ characterName: "카일" }),
    [],
  );

  const dashtoonResult = useMemo(
    () => runDashtoonAgencyPublishPipeline({ episodeTitle: storyGenre, panelCount: 12 }),
    [storyGenre],
  );

  const aidResult = useMemo(
    () =>
      runAidStudioPipeline({
        activeStage: aidStage,
        creationMode: aidCreationMode,
        episodeTitle: `01화 · ${storyGenre}`,
      }),
    [aidStage, aidCreationMode, storyGenre],
  );

  const naverPainterResult = useMemo(
    () => runNaverWebtoonAiHintPainter(painterHints),
    [painterHints],
  );

  const cspAssistResult = useMemo(
    () => runClipStudioPaintAiAssist({ screentoneLpi: cspToneLpi }),
    [cspToneLpi],
  );

  return (
    <section
      aria-label="4대 카테고리 12대 AI 웹툰·인스타툰 보조 어플 내재화 워크벤치"
      data-testid="studio-ai-webtoon-ecosystem-workbench"
      className="flex flex-col gap-2.5 rounded-lg border border-accent bg-card p-3 text-[0.64rem]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
          <Sparkles size={14} className="text-accent" aria-hidden="true" />
          글로벌·국내 12대 AI 웹툰·인스타툰 보조 툴 REA 역공학 내재화 워크벤치
        </span>
        <span
          data-testid="rea-ecosystem-tool-count-badge"
          className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent"
        >
          4대 카테고리 · {REA_WEBTOON_ECOSYSTEM_12_TOOLS.length}개 AI 보조 어플 완비
        </span>
      </div>

      {/* 4대 카테고리 탭 네비게이션 */}
      <div
        role="tablist"
        aria-label="AI 웹툰 보조 어플 4대 카테고리 선택"
        className="grid grid-cols-1 gap-1 sm:grid-cols-2"
      >
        {CATEGORY_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`panel-${tab.id}`}
              data-testid={`ecosystem-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center justify-between gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-[0.61rem] font-bold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                isSelected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-raised text-fg-2 hover:bg-panel",
              )}
            >
              <span>{tab.labelKo}</span>
              <span className="shrink-0 rounded bg-card px-1.5 py-0.5 text-[0.55rem] text-fg-3">
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* 카테고리 1: 올인원 웹툰 및 인스타툰 제작 가속화 툴 (젠툰 · 투닝 · ComicAI · Dashtoon) */}
      {activeTab === "cat-1-all-in-one" ? (
        <div
          role="tabpanel"
          id="panel-cat-1-all-in-one"
          aria-labelledby="tab-cat-1-all-in-one"
          data-testid="ecosystem-panel-cat-1"
          className="flex flex-col gap-2"
        >
          <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 font-bold text-fg">
                <Wand2 size={12} className="text-accent" aria-hidden="true" />
                젠툰 (GenToon) Story-to-Comic · 4컷 워크시트 & 소품 연속성 원장 (점수{" "}
                {gentoonResult.continuityScore}점)
              </span>
              <button
                type="button"
                data-testid="apply-gentoon-worksheet-script-btn"
                onClick={() => {
                  const nextLines = gentoonResult.worksheetPanels
                    .map((p) =>
                      p.isSilentReactionBeat
                        ? `[침묵 컷 #${p.panelNumber}] (${p.visualActionKo})`
                        : `${gentoonResult.continuitySheet.characterName}: ${p.dialogueLine}`,
                    )
                    .join("\n");
                  onApplyScript(nextLines);
                }}
                className={cn(
                  "rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.59rem] font-bold text-accent hover:bg-card",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                )}
              >
                젠툰 4컷 워크시트 대본 반영
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex gap-1" role="group" aria-label="젠툰 입력 모드">
                {(
                  [
                    { id: "anecdote-1600", label: "내 썰 (1,600자)" },
                    { id: "manuscript", label: "내 원고" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={gentoonMode === m.id}
                    onClick={() => setGentoonMode(m.id)}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[0.58rem] font-semibold",
                      gentoonMode === m.id
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-3",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-1" role="group" aria-label="젠툰 포맷 선택">
                {(
                  [
                    { id: "vertical-scroll-webtoon", label: "세로 스크롤 웹툰" },
                    { id: "instatoon-carousel", label: "인스타툰" },
                    { id: "four-panel-comic", label: "4컷 만화" },
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    aria-pressed={gentoonFormat === fmt.id}
                    onClick={() => setGentoonFormat(fmt.id)}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[0.58rem] font-semibold",
                      gentoonFormat === fmt.id
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-3",
                    )}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-1" role="group" aria-label="젠툰 종횡비 선택">
                {(["1:1", "4:5", "2:3", "9:16"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    aria-pressed={gentoonRatio === ratio}
                    onClick={() => setGentoonRatio(ratio)}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[0.58rem] font-semibold",
                      gentoonRatio === ratio
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-3",
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>

              <label className="inline-flex items-center gap-1 text-[0.58rem] text-fg-2">
                <span>화풍:</span>
                <select
                  aria-label="젠툰 화풍 패밀리 선택"
                  value={gentoonStyleId}
                  onChange={(e) => setGentoonStyleId(e.target.value as GenToonStyleFamilyId)}
                  className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.58rem] text-fg"
                >
                  {GENTOON_STYLE_FAMILIES.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.labelKo} ({st.presetCount}+)
                    </option>
                  ))}
                </select>
              </label>

              <label className="inline-flex items-center gap-1 text-[0.58rem] text-fg-2">
                <span>언어(21개국):</span>
                <select
                  aria-label="젠툰 다국어 선택"
                  value={gentoonLang}
                  onChange={(e) => setGentoonLang(e.target.value as GenToonLanguageCode)}
                  className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.58rem] text-fg"
                >
                  {GENTOON_SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.labelKo}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {gentoonResult.worksheetPanels.map((panel) => (
                <div
                  key={panel.panelNumber}
                  className="rounded border border-line bg-card p-1.5 text-[0.58rem]"
                >
                  <strong className="text-accent">{panel.beatLabelKo}</strong> (
                  {panel.cameraFraming})
                  <p className="text-fg-2">{panel.visualActionKo}</p>
                  <span className="text-fg-3">
                    왼손 소품: {panel.handPropState.leftHandProp} · 시점:{" "}
                    {panel.handPropState.viewerSide}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="flex flex-col gap-1 rounded border border-line bg-raised p-2 text-[0.59rem]">
              <strong className="text-accent">투닝 (Tooning) 글로 캐릭터 연출</strong>
              <p className="text-fg-2">{tooningResult.autoDirectingSummaryKo}</p>
              {tooningResult.beats[0] ? (
                <span className="text-fg-3">
                  1절 연출: {tooningResult.beats[0].posePresetCode} ·{" "}
                  {tooningResult.beats[0].chatBubbleSvg.bubbleShape} ·{" "}
                  {tooningResult.beats[0].cutMaskConfig.maskType}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-1 rounded border border-line bg-raised p-2 text-[0.59rem]">
              <strong className="text-accent">ComicAI 4면도 캐릭터 시트 & 연속 컷</strong>
              <p className="text-fg-2">
                시드 #{comicAiResult.characterSheet.seedLockNumber} · LoRA{" "}
                {comicAiResult.characterSheet.loraWeight} ·{" "}
                {comicAiResult.characterSheet.turnaroundViews.length}면도 고정
              </p>
              <span className="text-fg-3">
                연속 패널 {comicAiResult.sequentialPanels.length}컷 프리폼 조립 준비 완료
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded border border-line bg-raised p-2 text-[0.59rem]">
              <strong className="text-accent">Dashtoon 올인원 출판 & Frameo 브리지</strong>
              <p className="text-fg-2">
                출판 경로: <code>{dashtoonResult.publicationManifest.readerRoute}</code> (
                {dashtoonResult.publicationManifest.sliceSpec.sliceCount}슬라이스)
              </p>
              <span className="text-fg-3">
                Photo-to-Comic ID 보존율 {dashtoonResult.photoToComicJob.preservarIdentityScore}% ·{" "}
                {dashtoonResult.studioMigrationBridge.partnerBridgeTarget}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* 카테고리 2: 전문 작화 보조 툴 (에이드 AiD 3.1 · 네이버웹툰 AI 페인터 · 클립스튜디오 페인트) */}
      {activeTab === "cat-2-pro-drawing" ? (
        <div
          role="tabpanel"
          id="panel-cat-2-pro-drawing"
          aria-labelledby="tab-cat-2-pro-drawing"
          data-testid="ecosystem-panel-cat-2"
          className="flex flex-col gap-2"
        >
          <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 font-bold text-fg">
                <Brush size={12} className="text-accent" aria-hidden="true" />
                에이드 (AiD 3.1) 4단계 작화 파이프라인 (01 스케치 → 02 선화 → 03 채색 → 04 배경 · PSD 내보내기)
              </span>
              <span className="text-[0.58rem] font-semibold text-good">
                {aidResult.characterSheet.totalSheetCount}장 시트(선화 5·채색 5) ·{" "}
                {aidResult.psdExportManifest.fileName}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex flex-wrap gap-1" role="group" aria-label="AiD 작화 단계 선택">
                {aidResult.stageOutputs.map((st) => (
                  <button
                    key={st.stageId}
                    type="button"
                    aria-pressed={aidStage === st.stageId}
                    onClick={() => setAidStage(st.stageId)}
                    className={cn(
                      "rounded border px-2 py-0.5 text-[0.58rem] font-semibold",
                      aidStage === st.stageId
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2",
                    )}
                  >
                    {st.stageLabelKo}
                  </button>
                ))}
              </div>

              <div className="flex gap-1" role="group" aria-label="AiD 캐릭터 창작 방식">
                {(
                  [
                    { id: "trait-synthesis", label: "캐릭터 형질 합성 (최대 3인)" },
                    { id: "text-description", label: "완성할 캐릭터 설명" },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={aidCreationMode === mode.id}
                    onClick={() => setAidCreationMode(mode.id)}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[0.58rem] font-semibold",
                      aidCreationMode === mode.id
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-3",
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[0.59rem] text-fg-2">
              {aidResult.stageOutputs.find((s) => s.stageId === aidStage)?.technicalSummaryKo}{" "}
              (브러시: {aidResult.brushCanvasSpec.brushTypeKo}{" "}
              {aidResult.brushCanvasSpec.brushSizePx}px · 선 보정{" "}
              {aidResult.brushCanvasSpec.lineStabilizationPercent}% · 단축키{" "}
              {aidResult.brushCanvasSpec.shortcuts.brush}/
              {aidResult.brushCanvasSpec.shortcuts.eraser})
            </p>

            <div className="grid grid-cols-1 gap-1 sm:grid-cols-5">
              {aidResult.psdExportManifest.layers.map((layer) => (
                <div
                  key={layer.layerOrder}
                  className="rounded border border-line bg-card p-1 text-[0.56rem]"
                >
                  <strong className="text-accent">L{layer.layerOrder}</strong> {layer.layerNameKo}{" "}
                  ({layer.blendMode})
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 rounded border border-line bg-raised p-2 text-[0.59rem]">
              <img
                src={naverPainterResult.previewSvgDataUrl}
                alt="네이버웹툰 AI 페인터 힌트 채색 프리뷰"
                className="h-20 w-20 shrink-0 rounded border border-line bg-card object-cover"
              />
              <div className="flex flex-col gap-1">
                <strong className="inline-flex items-center gap-1 text-accent">
                  <Palette size={11} aria-hidden="true" />
                  네이버웹툰 AI 페인터 (딥러닝 힌트 채색 · 경계 보존{" "}
                  {naverPainterResult.edgeAwarenessScore}점)
                </strong>
                <p className="text-fg-2">{naverPainterResult.coachingTipKo}</p>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    data-testid="naver-painter-warm-sunset-preset-btn"
                    onClick={() =>
                      setPainterHints((prev) =>
                        prev.map((h) =>
                          h.regionRole === "background-ambient"
                            ? { ...h, hexColor: "#FF7E67" }
                            : h,
                        ),
                      )
                    }
                    className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 text-[0.56rem] font-bold text-accent"
                  >
                    노을빛 힌트 적용 (#FF7E67)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1 rounded border border-line bg-raised p-2 text-[0.59rem]">
              <div className="flex items-center justify-between gap-1">
                <strong className="inline-flex items-center gap-1 text-accent">
                  <Layers size={11} aria-hidden="true" />
                  클립스튜디오 페인트 (3D 포즈 스캐너 & 배경 LT 변환)
                </strong>
                <div className="flex gap-1" role="group" aria-label="클립스튜디오 스크린톤 선수">
                  {([45, 60, 85] as const).map((lpi) => (
                    <button
                      key={lpi}
                      type="button"
                      aria-pressed={cspToneLpi === lpi}
                      onClick={() => setCspToneLpi(lpi)}
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[0.55rem] font-semibold",
                        cspToneLpi === lpi
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-3",
                      )}
                    >
                      {lpi}LPI
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-fg-2">{cspAssistResult.poseScannerRig.poseDescriptionKo}</p>
              <span className="text-fg-3">
                LT 분리 레이어:{" "}
                {cspAssistResult.backgroundLtConversion.separatedLayers.join(" · ")}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* 카테고리 3 & 4 */}
      {activeTab === "cat-3-storyboard" ? (
        <StudioAiWebtoonCategory3Panel scriptInput={scriptInput} storyGenre={storyGenre} />
      ) : null}
      {activeTab === "cat-4-style-transfer" ? (
        <StudioAiWebtoonCategory4Panel storyGenre={storyGenre} />
      ) : null}
    </section>
  );
}
