/**
 * StudioTooningPlusSuitePanel.tsx
 *
 * https://plus.tooning.io/ 전 제품군(TG 투닝 스토리 · TD 3D 스튜디오 연동 · ED 투닝 에디터 AI/3D 팝업 ·
 * MG 투닝 매직 B-LoRA/멀티 리터치 · DV 디브 AI 캐릭터/로어북/17모드 챗 · TB 툰비 웹툰 700px 검증기/웹소설 뷰어)을
 * 툰스튜디오 안에서 즉시 실행·연동하는 통합 워크스페이스 패널.
 */
import {
  BookOpen,
  Bot,
  Camera,
  Download,
  FileCheck2,
  Scissors,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  buildEdMultiAngleCameraPrompt,
  computeMgPostProcessingBitmask,
  createDefaultMgAdvancedRenderSettings,
  ED_EXPO_STYLE_TRANSFER_PRESETS,
  ED_MANNEQUIN_10_FINGERS,
  ED_MANNEQUIN_19_MIXAMO_JOINTS,
  ED_MANNEQUIN_CAMERA_ELEVATION_DEG,
  ED_MULTI_ANGLE_AZIMUTHS,
  ED_MULTI_ANGLE_DISTANCES,
  ED_MULTI_ANGLE_ELEVATIONS,
  ED_TTS_SUPPORTED_LANGUAGES,
  MG_ASPECT_RATIO_SPECS,
  prepareMgMultiImageRetouchJob,
  snapEdImageFilterValue,
  type EdMannequinCameraPreset,
  type MgRetouchModelId,
  type MgStyleSegment,
} from "../lettering/studio-tooning-editor-magic-suite";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { StudioTooningDeevToonBeSubPanel } from "./StudioTooningDeevToonBeSubPanel";
import {
  addTgConceptInstance,
  buildTgToTdExportPackage,
  cloneTgExploreWorkConcepts,
  compileTgConceptsToPrompt,
  exportTgStoryDocument,
  generateTgPlotSuggestionAndQuestions,
  publishTgStoryToExplore,
  recommendTgConceptValue,
  resetTgSplitCutDescription,
  splitTgStoryIntoCuts,
  TG_COVER_IMAGE_PRESETS,
  TG_STARTER_PROMPT_SAMPLES,
  TG_SUPPORTED_FONTS,
  TOONING_PLUS_SERVICES,
  updateTgSplitCutDescription,
  type TgAgentCategory,
  type TgConceptEntryInstance,
  type TgFileType,
  type TgSupportedFont,
} from "./tooning-stories-suite";

import { cn } from "@/shared/lib/utils";

export interface StudioTooningPlusSuitePanelProps {
  readonly scriptInput?: string;
  readonly onApplyScript?: (nextScript: string) => void;
}

type ActiveServiceTab = "TG" | "ED_MG" | "DV" | "TB";

export function StudioTooningPlusSuitePanel({
  scriptInput = "",
  onApplyScript,
}: StudioTooningPlusSuitePanelProps): ReactElement {
  const [serviceTab, setServiceTab] = useState<ActiveServiceTab>("TG");

  // 1. TG (Tooning Stories, Cut Splitter & TG->TD 3D Studio Interlock) State
  const [tgAgent, setTgAgent] = useState<TgAgentCategory>("webtoon");
  const [tgFont, setTgFont] = useState<TgSupportedFont>("Pretendard");
  const [tgCoverPresetId, setTgCoverPresetId] = useState(TG_COVER_IMAGE_PRESETS[0]!.presetId);
  const [tgConcepts, setTgConcepts] = useState<readonly TgConceptEntryInstance[]>([
    {
      instanceId: "character-profile-1",
      fieldId: "character-profile",
      selectedOption: "주인공(여)",
      inputText: recommendTgConceptValue("character-profile", "female", 0),
      genderHint: "female",
    },
    {
      instanceId: "worldbuilding-1",
      fieldId: "worldbuilding",
      inputText: recommendTgConceptValue("worldbuilding", "neutral", 0),
    },
  ]);
  const [tgCanvasText, setTgCanvasText] = useState(
    scriptInput.trim() ||
      "[C#1] 회귀한 황녀 엘레나가 북부 대공의 집무실 문을 열고 들어선다.\n-----\n[C#2] 엘레나: \"대공 전하, 저와 계약 결혼을 하시죠.\" ==운명을 바꿀 거래==가 시작된다.",
  );
  const [tgExportFileType, setTgExportFileType] = useState<TgFileType>("Html");
  const [tgLastExportSummary, setTgLastExportSummary] = useState<string>("");

  const tgSplitBundle = useMemo(() => splitTgStoryIntoCuts(tgCanvasText), [tgCanvasText]);
  const [tgEditableCuts, setTgEditableCuts] = useState(tgSplitBundle.cuts);

  const activeCuts = tgEditableCuts.length > 0 ? tgEditableCuts : tgSplitBundle.cuts;
  const tgToTdPackage = useMemo(
    () => buildTgToTdExportPackage("story-elena-01", "회귀 황녀의 계약 결혼", activeCuts),
    [activeCuts],
  );
  const tgSuggestion = useMemo(
    () => generateTgPlotSuggestionAndQuestions(tgAgent, tgCanvasText, tgConcepts),
    [tgAgent, tgCanvasText, tgConcepts],
  );

  const handleAddCharacterConcept = (gender: "male" | "female") => {
    const rec = recommendTgConceptValue("character-profile", gender, tgConcepts.length);
    const res = addTgConceptInstance(tgConcepts, {
      fieldId: "character-profile",
      selectedOption: gender === "male" ? "주인공(남)" : "주인공(여)",
      inputText: rec,
      genderHint: gender,
    });
    if (res.added) setTgConcepts(res.entries);
  };

  const handleRunTgExport = () => {
    const payload = exportTgStoryDocument("회귀_황녀의_계약", tgCanvasText, tgExportFileType, tgFont);
    const published = publishTgStoryToExplore({
      exploreId: "explore-11",
      title: "회귀 황녀의 계약",
      shareType: "Multiple",
      agentCategory: tgAgent,
      concepts: tgConcepts,
      canvasText: tgCanvasText,
      promptHistory: [compileTgConceptsToPrompt(tgAgent, tgConcepts)],
    });
    const cloned = cloneTgExploreWorkConcepts(published);
    setTgLastExportSummary(
      `${payload.fileName} (${payload.byteLength}B · BOM:${payload.hasUtf8Bom ? "Y" : "N"}) 내보내기 & 노하우(${cloned.clonedConcepts.length}개 설정) 준비 완료`,
    );
  };

  // 2. ED & MG (Multi-Angle <sks>, 3D Mannequin, Magic Bitmask & 5-Image Retouch) State
  const [azimuthDeg, setAzimuthDeg] = useState<0 | 45 | 90 | 135 | 180 | 225 | 270 | 315>(45);
  const [elevationDeg, setElevationDeg] = useState<-30 | 0 | 30 | 60 | 90>(-30);
  const [distanceMult, setDistanceMult] = useState<0.6 | 1.0 | 1.8>(0.6);
  const [mannequinCam, setMannequinCam] = useState<EdMannequinCameraPreset>("low");
  const [expoStyleId, setExpoStyleId] = useState(ED_EXPO_STYLE_TRANSFER_PRESETS[0]!.id);
  const [ttsLang, setTtsLang] = useState<(typeof ED_TTS_SUPPORTED_LANGUAGES)[number]>("ko");
  const [mgSettings, setMgSettings] = useState(createDefaultMgAdvancedRenderSettings);
  const [retouchModel, setRetouchModel] = useState<MgRetouchModelId>("SmartRetouchPro");
  const [retouchRefCount, setRetouchRefCount] = useState<number>(3);

  const multiAnglePrompt = useMemo(
    () =>
      buildEdMultiAngleCameraPrompt({
        azimuthDeg,
        elevationDeg,
        distanceMultiplier: distanceMult,
        subjectDescription: "protagonist dramatic webtoon panel",
      }),
    [azimuthDeg, elevationDeg, distanceMult],
  );
  const mgBitmask = useMemo(() => computeMgPostProcessingBitmask(mgSettings), [mgSettings]);
  const retouchJob = useMemo(
    () =>
      prepareMgMultiImageRetouchJob({
        model: retouchModel,
        referenceImageUrls: Array.from({ length: retouchRefCount }, (_, i) => `ref-${i + 1}.png`),
        editInstruction: "캐릭터 표정을 결연하게 수정하고 역광 이펙트 추가",
      }),
    [retouchModel, retouchRefCount],
  );

  return (
    <section
      aria-label="투닝 플러스 (Tooning Plus) 전 제품군 통합 워크스페이스"
      data-testid="studio-tooning-plus-suite-panel"
      className="flex flex-col gap-2.5 rounded-xl border border-accent/45 bg-card/90 p-3 text-[0.65rem] text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-accent" aria-hidden />
          <strong className="text-xs font-black text-fg">
            투닝 플러스 (Tooning Plus) 7대 제품군 통합 워크스페이스
          </strong>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.58rem] font-bold text-accent">
            {TOONING_PLUS_SERVICES.length}개 서비스 완전 내장
          </span>
        </div>

        <div role="tablist" aria-label="투닝 플러스 제품군 선택" className="flex flex-wrap gap-1">
          {(
            [
              { id: "TG", label: "TG 투닝 스토리·컷분할", icon: BookOpen },
              { id: "ED_MG", label: "ED/MG 다각도·매직·리터치", icon: Wand2 },
              { id: "DV", label: "DV 디브 캐릭터·로어북", icon: Bot },
              { id: "TB", label: "TB 툰비 원고검증·뷰어", icon: FileCheck2 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = serviceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setServiceTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.61rem] font-bold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-raised text-fg-2 hover:bg-card",
                )}
              >
                <Icon size={11} aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pillar 1: TG (Tooning Stories + Cut Splitter + TG->TD 3D Interlock) */}
      {serviceTab === "TG" && (
        <div className="flex flex-col gap-2" data-testid="tooning-pillar-tg">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="스토리 에이전트 유형">
              {(
                [
                  { id: "webtoon", label: "웹툰 스토리 에이전트" },
                  { id: "novel", label: "웹소설 에이전트" },
                  { id: "movie", label: "영화 시나리오 에이전트" },
                ] as const
              ).map((ag) => (
                <button
                  key={ag.id}
                  type="button"
                  aria-pressed={tgAgent === ag.id}
                  onClick={() => setTgAgent(ag.id)}
                  className={`rounded border px-2 py-0.5 text-[0.6rem] font-bold ${
                    tgAgent === ag.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  {ag.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => handleAddCharacterConcept("male")}
                className="rounded border border-line bg-raised px-2 py-0.5 text-[0.58rem] font-semibold text-fg-2"
              >
                + 남주인공 설정 추천 추가
              </button>
              <button
                type="button"
                onClick={() => handleAddCharacterConcept("female")}
                className="rounded border border-line bg-raised px-2 py-0.5 text-[0.58rem] font-semibold text-fg-2"
              >
                + 여주인공 설정 추천 추가
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {TG_STARTER_PROMPT_SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => setTgCanvasText(`[C#1] ${sample.promptText}`)}
                className="rounded border border-line bg-raised px-2 py-0.5 text-[0.58rem] text-fg-2 hover:border-accent"
              >
                예시: {sample.titleKo} ({sample.genreKo})
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-accent/30 bg-accent-soft/30 px-2.5 py-1.5 text-[0.6rem]">
            <strong className="text-accent">AI 전개 제안 (ReceiveSuggestion):</strong>{" "}
            {tgSuggestion.plotSuggestion}
          </div>

          <div className="rounded-lg border border-line bg-raised p-2">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 font-bold text-fg">
                <Scissors size={12} className="text-accent" aria-hidden />
                컷 분할기 ({activeCuts.length}컷 · 구분자 -----) & 3D 스튜디오 연동 (
                {tgToTdPackage.deepLinkUrl} · {tgToTdPackage.totalCreditCost} 크레딧)
              </span>
              {onApplyScript ? (
                <button
                  type="button"
                  data-testid="tg-apply-split-cuts-to-storyboard-btn"
                  onClick={() => onApplyScript(activeCuts.map((c) => c.description).join("\n"))}
                  className="rounded border border-accent bg-accent px-2 py-0.5 text-[0.6rem] font-bold text-on-accent"
                >
                  분할된 {activeCuts.length}개 컷 콘티 대본에 즉시 적용
                </button>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              {activeCuts.map((cut) => {
                const tdSpec = tgToTdPackage.cuts.find((item) => item.cutNumber === cut.cutIndex);
                return (
                  <div
                    key={cut.markerCode}
                    className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-line bg-card px-2 py-1 text-[0.6rem]"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono font-bold text-accent">
                        {cut.markerCode}
                      </span>
                      <input
                        type="text"
                        aria-label={`${cut.markerCode} 컷 지문 편집`}
                        value={cut.description}
                        onChange={(e) =>
                          setTgEditableCuts(
                            updateTgSplitCutDescription(activeCuts, cut.cutIndex, e.target.value),
                          )
                        }
                        className="min-w-0 flex-1 rounded border border-line bg-field px-1.5 py-0.5 text-[0.6rem]"
                      />
                    </div>
                    <div className="flex items-center gap-1 text-[0.56rem] text-fg-3">
                      {tdSpec ? (
                        <span>
                          3D: {tdSpec.cameraShotSize} · {tdSpec.cameraAngle} · {tdSpec.cameraLens}
                        </span>
                      ) : null}
                      {cut.isModified ? (
                        <button
                          type="button"
                          onClick={() =>
                            setTgEditableCuts(resetTgSplitCutDescription(activeCuts, cut.cutIndex))
                          }
                          className="rounded border border-line bg-raised px-1.5 py-0.5 text-accent"
                        >
                          원복
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[0.6rem]">
              <label>
                폰트(9종):
                <select
                  aria-label="투닝 스토리 캔버스 폰트"
                  value={tgFont}
                  onChange={(e) => setTgFont(e.target.value as TgSupportedFont)}
                  className="ml-1 rounded border border-line bg-field px-1 py-0.5"
                >
                  {TG_SUPPORTED_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                커버(844×264):
                <select
                  aria-label="투닝 스토리 커버 이미지 프리셋"
                  value={tgCoverPresetId}
                  onChange={(e) => setTgCoverPresetId(e.target.value)}
                  className="ml-1 rounded border border-line bg-field px-1 py-0.5"
                >
                  {TG_COVER_IMAGE_PRESETS.map((c) => (
                    <option key={c.presetId} value={c.presetId}>
                      {c.titleOverlay}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                내보내기(4종):
                <select
                  aria-label="투닝 스토리 내보내기 파일 포맷"
                  value={tgExportFileType}
                  onChange={(e) => setTgExportFileType(e.target.value as TgFileType)}
                  className="ml-1 rounded border border-line bg-field px-1 py-0.5"
                >
                  {(["PDF", "Docx", "Html", "Txt"] as const).map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {fmt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={handleRunTgExport}
              className="inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent"
            >
              <Download size={11} aria-hidden />
              스토리 내보내기 & 노하우 발행
            </button>
          </div>
          {tgLastExportSummary ? (
            <p className="text-[0.58rem] font-semibold text-good">{tgLastExportSummary}</p>
          ) : null}
        </div>
      )}

      {/* Pillar 2: ED & MG */}
      {serviceTab === "ED_MG" && (
        <div className="flex flex-col gap-2" data-testid="tooning-pillar-ed-mg">
          <div className="rounded-lg border border-line bg-raised p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 font-bold text-fg">
                <Camera size={12} className="text-accent" aria-hidden />
                다각도 카메라 생성기 (8방위 × 5고도 × 3거리 · &lt;sks&gt; 토큰)
              </span>
              <span className="font-mono text-[0.58rem] text-accent">{multiAnglePrompt}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[0.6rem]">
              <label className="flex flex-col gap-0.5">
                방위각 (Azimuth)
                <select
                  aria-label="다각도 카메라 방위각"
                  value={azimuthDeg}
                  onChange={(e) =>
                    setAzimuthDeg(Number(e.target.value) as 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315)
                  }
                  className="rounded border border-line bg-field px-1 py-0.5"
                >
                  {ED_MULTI_ANGLE_AZIMUTHS.map((a) => (
                    <option key={a.deg} value={a.deg}>
                      {a.labelKo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                고도각 (Elevation)
                <select
                  aria-label="다각도 카메라 고도각"
                  value={elevationDeg}
                  onChange={(e) => setElevationDeg(Number(e.target.value) as -30 | 0 | 30 | 60 | 90)}
                  className="rounded border border-line bg-field px-1 py-0.5"
                >
                  {ED_MULTI_ANGLE_ELEVATIONS.map((el) => (
                    <option key={el.deg} value={el.deg}>
                      {el.labelKo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                샷 거리 (Distance)
                <select
                  aria-label="다각도 카메라 샷 거리"
                  value={distanceMult}
                  onChange={(e) => setDistanceMult(Number(e.target.value) as 0.6 | 1.0 | 1.8)}
                  className="rounded border border-line bg-field px-1 py-0.5"
                >
                  {ED_MULTI_ANGLE_DISTANCES.map((d) => (
                    <option key={d.multiplier} value={d.multiplier}>
                      {d.labelKo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="rounded border border-line bg-card p-2 text-[0.6rem]">
              <strong className="block text-fg">
                3D 마네킹 ({ED_MANNEQUIN_19_MIXAMO_JOINTS.length}관절 · {ED_MANNEQUIN_10_FINGERS.length}손가락)
              </strong>
              <select
                aria-label="3D 마네킹 카메라 높이"
                value={mannequinCam}
                onChange={(e) => setMannequinCam(e.target.value as EdMannequinCameraPreset)}
                className="mt-1 w-full rounded border border-line bg-field px-1 py-0.5"
              >
                <option value="low">로우 앵글 ({ED_MANNEQUIN_CAMERA_ELEVATION_DEG.low}°)</option>
                <option value="eye">아이 레벨 ({ED_MANNEQUIN_CAMERA_ELEVATION_DEG.eye}°)</option>
                <option value="high">하이 앵글 ({ED_MANNEQUIN_CAMERA_ELEVATION_DEG.high}°)</option>
              </select>
            </div>

            <div className="rounded border border-line bg-card p-2 text-[0.6rem]">
              <strong className="block text-fg">AI 엑스포 웹캠 7종 화풍 변환</strong>
              <select
                aria-label="AI 엑스포 웹캠 화풍 선택"
                value={expoStyleId}
                onChange={(e) => setExpoStyleId(e.target.value as typeof expoStyleId)}
                className="mt-1 w-full rounded border border-line bg-field px-1 py-0.5"
              >
                {ED_EXPO_STYLE_TRANSFER_PRESETS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.labelKo} ({st.promptToken})
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded border border-line bg-card p-2 text-[0.6rem]">
              <strong className="block text-fg">
                AI 보이스 TTS ({ED_TTS_SUPPORTED_LANGUAGES.length}개 언어 · 필터 스냅{" "}
                {snapEdImageFilterValue(3)})
              </strong>
              <select
                aria-label="AI 보이스 다국어 선택"
                value={ttsLang}
                onChange={(e) => setTtsLang(e.target.value as typeof ttsLang)}
                className="mt-1 w-full rounded border border-line bg-field px-1 py-0.5"
              >
                {ED_TTS_SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    언어 코드: {lang.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card p-2 text-[0.6rem]">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <strong className="text-fg">투닝 매직 (MG) 스타일 & 후처리 비트마스크:</strong>
                <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono font-bold text-accent">
                  bitmask={mgBitmask} (규격 {MG_ASPECT_RATIO_SPECS.length}종)
                </span>
              </div>
              <div className="flex gap-1">
                {(["InhouseStyle", "OutsideStyle", "MyStyle"] as const).map((seg: MgStyleSegment) => (
                  <button
                    key={seg}
                    type="button"
                    aria-pressed={mgSettings.styleSegment === seg}
                    onClick={() => setMgSettings((prev) => ({ ...prev, styleSegment: seg }))}
                    className={`rounded border px-1.5 py-0.5 font-bold ${
                      mgSettings.styleSegment === seg
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-raised text-fg-3"
                    }`}
                  >
                    {seg === "MyStyle" ? "MyStyle (B-LoRA 3600s)" : seg}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={mgSettings.isFaceDetailer}
                    onChange={(e) =>
                      setMgSettings((prev) => ({ ...prev, isFaceDetailer: e.target.checked }))
                    }
                  />
                  얼굴 보정 (+4)
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={mgSettings.isRemoveBackground}
                    onChange={(e) =>
                      setMgSettings((prev) => ({ ...prev, isRemoveBackground: e.target.checked }))
                    }
                  />
                  배경 제거 (+2)
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={mgSettings.isColorBlend}
                    onChange={(e) =>
                      setMgSettings((prev) => ({ ...prev, isColorBlend: e.target.checked }))
                    }
                  />
                  색감 혼합 (+1)
                </label>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  aria-label="멀티 이미지 AI 리터치 모델"
                  value={retouchModel}
                  onChange={(e) => setRetouchModel(e.target.value as MgRetouchModelId)}
                  className="rounded border border-line bg-field px-1.5 py-0.5"
                >
                  {(
                    [
                      ["SmartRetouchStandard", "스탠다드 리터치"],
                      ["SmartRetouchFlash", "플래시 리터치 2.0"],
                      ["SmartRetouchPro", "프로 디테일 리터치"],
                      ["Seedream", "시드림 리터치"],
                      ["QwenImageEdit", "정밀 영역 편집"],
                    ] as const
                  ).map(([m, label]) => (
                    <option key={m} value={m}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="참조 이미지 장수"
                  value={retouchRefCount}
                  onChange={(e) => setRetouchRefCount(Number(e.target.value))}
                  className="rounded border border-line bg-field px-1 py-0.5"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      참조 {n}장
                    </option>
                  ))}
                </select>
                <span className="font-mono text-[0.56rem] text-good">
                  {retouchJob.valid ? `합성 준비 (${retouchJob.acceptedImages.length}장)` : retouchJob.reasonKo}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pillar 3 & 4: DV & TB */}
      {(serviceTab === "DV" || serviceTab === "TB") && (
        <StudioTooningDeevToonBeSubPanel mode={serviceTab} novelSampleText={tgCanvasText} />
      )}
    </section>
  );
}
