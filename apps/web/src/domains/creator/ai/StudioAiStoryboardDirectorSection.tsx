/**
 * StudioAiStoryboardDirectorSection.tsx
 *
 * AI 슈퍼 스위트 탭 4(콘티 자동 디렉터) — 작가 그림체별 모델 바인딩·DNA 분석·화풍 블렌딩,
 * 간단한 스케치(프리셋 + 자유 드로잉 스트로크 기하 분석) 의도 결합,
 * 웹툰 스토리라인(단계별 패키지 + 1화 기승전결 4막 아크) 및 대사 추천·다국어 식자 프리뷰를
 * BYOK 수동 키 없이도 기본 동작하도록 통합 제공하는 섹션 컴포넌트.
 */
import { Clapperboard, Compass, Globe, MessageSquareQuote, Palette, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  analyzeWebtoonDialogueReadability,
  buildGlobalLocalizedDialoguePreview,
  formatDialogueSuggestionLine,
  recommendLocalDialogueCandidates,
  splitDialogueIntoWebtoonBubbles,
  type DialogueSuggestionCandidate,
} from "../lettering/studio-dialogue-suggest";
import {
  compileEpisodeArcToScript,
  compileStorylinePackageToScript,
  generateEpisodeStorylineArc,
  recommendStorylineAndDialogues,
  type StorylineDialoguePackage,
} from "../planning/studio-plot-development";
import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import type { StudioCopyFeedbackStatus } from "../use-studio-copy-feedback";

import { loadEffectiveStudioAiSettings } from "./studio-ai-settings";
import {
  bindLoraJobAsArtistStyle,
  STORYBOARD_ROUGH_SKETCH_PRESETS,
  StudioAiStoryboardDirector,
  type StoryboardArtistStyleBinding,
  type StoryboardRoughSketchInput,
  type StoryboardRoughSketchPresetId,
} from "./studio-ai-storyboard-director";
import { PANEL_CARD_CLASS, TEXT_FIELD_CLASS } from "./studio-ai-super-suite-options";
import {
  auditStoryboardStyleConsistency,
  blendArtistStyleModels,
  buildArtistStyleDnaProfile,
  BUILTIN_ARTIST_STYLE_PRESETS,
} from "./studio-artist-style-dna";
import {
  browserStudioLoraJobStorage,
  listCompletedStudioStyleModels,
  loadStudioLoraJobs,
} from "./studio-lora-training";
import {
  analyzeFreehandRoughSketchStrokes,
  ROUGH_SKETCH_STROKE_TEMPLATES,
} from "./studio-rough-sketch-analyzer";
import { StudioAiSuiteInputNeeded, StudioCopyTextButton } from "./StudioAiSuperSuiteControls";

import { cn } from "@/shared/lib/utils";

const STORYLINE_GENRES = ["판타지", "로맨스", "로판", "액션", "스릴러", "일상"] as const;

export interface StudioAiStoryboardDirectorSectionProps {
  readonly idPrefix: string;
  readonly scriptInput: string;
  readonly onScriptInputChange: (next: string) => void;
  readonly statusForCopy: (id: string) => StudioCopyFeedbackStatus | null;
  readonly onCopy: (id: string, text: string) => void;
  readonly onApplyPrompt?: (prompt: string) => void;
}

export function StudioAiStoryboardDirectorSection({
  idPrefix,
  scriptInput,
  onScriptInputChange,
  statusForCopy,
  onCopy,
  onApplyPrompt,
}: StudioAiStoryboardDirectorSectionProps): ReactElement {
  const storyboardDirector = useMemo(() => new StudioAiStoryboardDirector(), []);
  const effectiveAi = useMemo(() => {
    try {
      return loadEffectiveStudioAiSettings(globalThis.sessionStorage);
    } catch {
      return loadEffectiveStudioAiSettings(null);
    }
  }, []);

  const availableArtistStyles = useMemo<readonly StoryboardArtistStyleBinding[]>(() => {
    const trained = listCompletedStudioStyleModels(
      loadStudioLoraJobs(browserStudioLoraJobStorage()),
    ).map((job) => bindLoraJobAsArtistStyle(job));
    return [...trained, ...BUILTIN_ARTIST_STYLE_PRESETS];
  }, []);

  const [selectedStyleModelId, setSelectedStyleModelId] = useState(availableArtistStyles[0]?.modelId ?? "");
  const [secondaryStyleModelId, setSecondaryStyleModelId] = useState("");
  const [selectedSketchPresetId, setSelectedSketchPresetId] = useState<StoryboardRoughSketchPresetId | "">("");
  const [selectedStrokeTemplateId, setSelectedStrokeTemplateId] = useState("");
  const [sketchNote, setSketchNote] = useState("");
  const [creatorLevel, setCreatorLevel] = useState<"aspiring" | "pro">("aspiring");
  const [targetLocale, setTargetLocale] = useState<"ko" | "en" | "ja" | "es">("ko");
  const [storyGenre, setStoryGenre] = useState("판타지");
  const [coreConflict, setCoreConflict] = useState("봉인된 유적의 비밀과 동료의 배신");
  const [expandedCutDialogueNum, setExpandedCutDialogueNum] = useState<number | null>(null);

  const primaryArtistStyle = useMemo(
    () => availableArtistStyles.find((item) => item.modelId === selectedStyleModelId) ?? null,
    [availableArtistStyles, selectedStyleModelId],
  );
  const secondaryArtistStyle = useMemo(
    () => availableArtistStyles.find((item) => item.modelId === secondaryStyleModelId) ?? null,
    [availableArtistStyles, secondaryStyleModelId],
  );

  const blendedStyleBinding = useMemo(() => {
    if (!primaryArtistStyle || !secondaryArtistStyle || primaryArtistStyle.modelId === secondaryArtistStyle.modelId) {
      return null;
    }
    return blendArtistStyleModels(primaryArtistStyle, secondaryArtistStyle, { primaryWeight: 0.7, secondaryWeight: 0.3 });
  }, [primaryArtistStyle, secondaryArtistStyle]);

  const activeArtistStyle = blendedStyleBinding ?? primaryArtistStyle;
  const styleDnaProfile = useMemo(
    () => (activeArtistStyle ? buildArtistStyleDnaProfile(activeArtistStyle) : null),
    [activeArtistStyle],
  );

  const freehandAnalysis = useMemo(() => {
    if (!selectedStrokeTemplateId) return null;
    const tpl = ROUGH_SKETCH_STROKE_TEMPLATES.find((t) => t.id === selectedStrokeTemplateId);
    return tpl ? analyzeFreehandRoughSketchStrokes(tpl.strokes, sketchNote) : null;
  }, [selectedStrokeTemplateId, sketchNote]);

  const defaultSketch = useMemo<StoryboardRoughSketchInput | null>(() => {
    if (freehandAnalysis) return freehandAnalysis.roughSketchInput;
    if (!selectedSketchPresetId && !sketchNote.trim()) return null;
    return {
      ...(selectedSketchPresetId ? { presetId: selectedSketchPresetId } : {}),
      ...(sketchNote.trim() ? { sketchNote: sketchNote.trim() } : {}),
    };
  }, [freehandAnalysis, selectedSketchPresetId, sketchNote]);

  const storyboardResult = useMemo(
    () =>
      storyboardDirector.direct(scriptInput, {
        artistStyle: activeArtistStyle,
        defaultSketch,
        creatorLevel,
        targetLocale,
      }),
    [storyboardDirector, scriptInput, activeArtistStyle, defaultSketch, creatorLevel, targetLocale],
  );

  const styleConsistencyAudit = useMemo(
    () => auditStoryboardStyleConsistency(storyboardResult, { genre: storyGenre }),
    [storyboardResult, storyGenre],
  );

  const plannedStoryboard = useMemo(() => {
    if (storyboardResult.totalCuts === 0) return null;
    try {
      return storyboardDirector.toStudioStoryboardPlan(storyboardResult);
    } catch {
      return null;
    }
  }, [storyboardDirector, storyboardResult]);

  const storylinePackages = useMemo(() => {
    const currentLines = scriptInput
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    return recommendStorylineAndDialogues(
      { genre: storyGenre, turningPoints: currentLines.slice(0, 4), coreConflict },
      { limit: 2 },
    );
  }, [storyGenre, scriptInput, coreConflict]);

  const episodeArc = useMemo(
    () => generateEpisodeStorylineArc({ genre: storyGenre, coreConflict, turningPoints: [] }),
    [storyGenre, coreConflict],
  );

  const scriptReady = storyboardResult.totalCuts > 0;

  const applyStorylinePackage = (pkg: StorylineDialoguePackage) => {
    const compiled = compileStorylinePackageToScript(pkg);
    const trimmedCurrent = scriptInput.trim();
    onScriptInputChange(trimmedCurrent ? `${trimmedCurrent}\n${compiled}` : compiled);
    setSelectedSketchPresetId(pkg.recommendedSketchPresetId);
  };

  const applyFullEpisodeArc = () => {
    onScriptInputChange(compileEpisodeArcToScript(episodeArc));
    const firstPreset = episodeArc.acts[0]?.package.recommendedSketchPresetId;
    if (firstPreset) setSelectedSketchPresetId(firstPreset);
  };

  const generateFromSketchOnly = () => {
    if (freehandAnalysis) {
      const tpl = ROUGH_SKETCH_STROKE_TEMPLATES.find((t) => t.id === selectedStrokeTemplateId);
      onScriptInputChange(sketchNote.trim() || `${tpl?.label ?? "자유 스케치"} — ${freehandAnalysis.geometryNote}`);
      return;
    }
    const preset =
      STORYBOARD_ROUGH_SKETCH_PRESETS.find((p) => p.id === selectedSketchPresetId) ??
      STORYBOARD_ROUGH_SKETCH_PRESETS[0]!;
    onScriptInputChange(sketchNote.trim() || `${preset.label} — ${preset.summary}`);
  };

  const applyDialogueCandidateToCut = (cutNumber: number, candidate: DialogueSuggestionCandidate) => {
    const lines = scriptInput
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const targetIndex = cutNumber - 1;
    if (targetIndex < 0 || targetIndex >= lines.length) return;
    const baseLine = (lines[targetIndex] ?? "")
      .replace(/["“][^"”]*["”]/gu, "")
      .replace(/\((?:나레이션|독백|해설|N)[:：]?[^)]+\)/gu, "")
      .trim();
    lines[targetIndex] =
      candidate.kind === "narration"
        ? `${baseLine} (나레이션: ${candidate.text})`.trim()
        : `${baseLine} "${candidate.text}"`.trim();
    onScriptInputChange(lines.join("\n"));
  };

  const engineModeBadgeText =
    effectiveAi.source === "env-default"
      ? "기본 AI 키 연동됨 (GitHub Models · BYOK 불필요)"
      : effectiveAi.source === "byok-session"
        ? "BYOK 세션 키 연동됨"
        : "내장 화풍·스토리보드 엔진 활성 (BYOK 불필요)";

  return (
    <div className="flex flex-col gap-4">
      {/* 1. 작가 그림체 모델 바인딩 & DNA 프로필 & 창작자 모드 */}
      <div className={PANEL_CARD_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[0.75rem] font-bold text-fg">
              <Palette size={14} className="text-accent" aria-hidden />
              작가 그림체별 모델 연결 & 창작 지원 모드
            </span>
            <span
              data-testid="storyboard-ai-engine-mode-badge"
              className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.58rem] font-bold text-accent"
            >
              {engineModeBadgeText}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="창작자 모드">
            {(
              [
                { id: "aspiring", label: "미래 웹툰작가 코칭" },
                { id: "pro", label: "전문 작가 프로덕션" },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={creatorLevel === mode.id}
                onClick={() => setCreatorLevel(mode.id)}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[0.62rem] font-bold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  creatorLevel === mode.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[0.68rem] font-semibold text-fg-2">
            주 그림체 모델 (LoRA / K-웹툰 화풍)
            <select
              aria-label="그림체 모델 선택"
              value={selectedStyleModelId}
              onChange={(e) => setSelectedStyleModelId(e.target.value)}
              className={cn(TEXT_FIELD_CLASS, STUDIO_TOUCH_TARGET)}
            >
              <option value="">연결 안 함 (기본 웹툰 연출)</option>
              {availableArtistStyles.map((style) => (
                <option key={style.modelId ?? style.triggerWord} value={style.modelId ?? ""}>
                  {style.artistLabel} ({style.triggerWord})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[0.68rem] font-semibold text-fg-2">
            보조 화풍 블렌딩 (선택 · 7:3 믹스)
            <select
              aria-label="보조 화풍 블렌딩 선택"
              value={secondaryStyleModelId}
              onChange={(e) => setSecondaryStyleModelId(e.target.value)}
              className={cn(TEXT_FIELD_CLASS, STUDIO_TOUCH_TARGET)}
            >
              <option value="">블렌딩 안 함 (단일 화풍)</option>
              {availableArtistStyles.map((style) => (
                <option key={`sec-${style.modelId ?? style.triggerWord}`} value={style.modelId ?? ""}>
                  {style.artistLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[0.68rem] font-semibold text-fg-2">
            글로벌 K-콘텐츠 연재 타깃 언어 (말풍선 여백 자동 보정)
            <select
              aria-label="글로벌 K-콘텐츠 연재 타깃 언어"
              value={targetLocale}
              onChange={(e) => setTargetLocale(e.target.value as "ko" | "en" | "ja" | "es")}
              className={cn(TEXT_FIELD_CLASS, STUDIO_TOUCH_TARGET)}
            >
              <option value="ko">한국어 원고 기준 (KO)</option>
              <option value="en">글로벌 영어 연재 (EN · 말풍선 여유 +4%)</option>
              <option value="ja">일본어 연재 (JA · 세로/가로 식자 여유)</option>
              <option value="es">스페인어·글로벌 연재 (ES · 말풍선 여유 +4%)</option>
            </select>
          </label>
        </div>

        {styleDnaProfile ? (
          <div
            data-testid="artist-style-dna-summary"
            className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-[0.62rem] text-fg-2"
          >
            <span className="font-bold text-accent">화풍 DNA 분석:</span>{" "}
            {styleDnaProfile.strokePressureCurve} · {styleDnaProfile.shadowLayering} · 권장 LoRA{" "}
            {styleDnaProfile.recommendedLoraScale} / CFG {styleDnaProfile.recommendedGuidanceScale}
            {blendedStyleBinding ? ` · 블렌딩(${blendedStyleBinding.artistLabel})` : ""}
          </div>
        ) : null}
      </div>

      {/* 2. 웹툰 스토리라인 및 대사 생성·추천 + 1화 기승전결 4막 자동 설계 */}
      <div className={PANEL_CARD_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[0.75rem] font-bold text-fg">
            <Sparkles size={14} className="text-accent" aria-hidden />
            웹툰 스토리라인 & 대사 생성·추천
          </span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="스토리라인 추천 장르">
            {STORYLINE_GENRES.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={storyGenre === g}
                onClick={() => setStoryGenre(g)}
                className={cn(
                  "rounded border px-2 py-0.5 text-[0.62rem] font-bold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  storyGenre === g
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-[0.68rem] font-semibold text-fg-2">
            현재 화 핵심 갈등 / 소재 키워드
            <input
              type="text"
              aria-label="현재 화 핵심 갈등 키워드"
              value={coreConflict}
              onChange={(e) => setCoreConflict(e.target.value)}
              placeholder="예: 정체를 숨긴 전학생과 마주친 방과 후 교실"
              className={cn(TEXT_FIELD_CLASS, STUDIO_TOUCH_TARGET)}
            />
          </label>
          <button
            type="button"
            data-testid="generate-episode-arc-btn"
            onClick={applyFullEpisodeArc}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-[0.65rem] font-bold text-accent hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            1화 기·승·전·결 전체 대본 자동 설계
          </button>
        </div>

        <p className="text-[0.6rem] text-fg-3" data-testid="episode-arc-pacing-summary">
          {episodeArc.pacingSummary} · 다음 화 훅: {episodeArc.nextEpisodeHook}
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {storylinePackages.map((pkg) => (
            <div
              key={pkg.id}
              className="flex flex-col justify-between gap-1.5 rounded-lg border border-line bg-card p-2.5 text-[0.65rem]"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 font-bold text-accent">
                    {pkg.stageLabel} · {pkg.title}
                  </span>
                  <span className="text-[0.6rem] text-fg-3">
                    추천 스케치: {pkg.recommendedSketchPresetId}
                  </span>
                </div>
                <p className="font-semibold text-fg">{pkg.storylineBeat}</p>
                <p className="text-[0.62rem] text-fg-3">지문: {pkg.stageDirection}</p>
                <ul className="mt-0.5 flex list-none flex-col gap-0.5 border-l-2 border-accent/50 pl-2 text-[0.62rem] text-fg-2">
                  {pkg.dialogues.map((d, idx) => (
                    <li key={idx}>
                      {d.kind === "narration" ? `(나레이션) ${d.text}` : `${d.speaker}: "${d.text}"`}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => applyStorylinePackage(pkg)}
                className={cn(
                  "mt-1 inline-flex items-center justify-center gap-1 rounded-lg border border-accent bg-accent-soft px-2.5 py-1 text-[0.64rem] font-bold text-accent hover:bg-raised",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                )}
              >
                스토리라인·대사·스케치 콘티에 반영
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 간단한 스케치(Rough Sketch) 구도 의도 & 자유 스트로크 기하 분석 */}
      <div className={PANEL_CARD_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[0.75rem] font-bold text-fg">
            <Compass size={14} className="text-accent" aria-hidden />
            간단한 스케치 구도 의도 결합 (지문 + 스케치 하이브리드 연출)
          </span>
          {(selectedSketchPresetId !== "" || selectedStrokeTemplateId !== "") && (
            <button
              type="button"
              onClick={() => {
                setSelectedSketchPresetId("");
                setSelectedStrokeTemplateId("");
              }}
              className={cn(
                "rounded border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-3 hover:bg-raised",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              스케치 구도 초기화
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="간단한 스케치 구도 프리셋"
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
        >
          {STORYBOARD_ROUGH_SKETCH_PRESETS.map((preset) => {
            const isSelected = selectedSketchPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() =>
                  setSelectedSketchPresetId((prev) => (prev === preset.id ? "" : preset.id))
                }
                className={cn(
                  "flex flex-col rounded-lg border p-2 text-left",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  isSelected
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                <span className={cn("text-[0.66rem] font-bold", isSelected && "text-accent")}>
                  {preset.label}
                </span>
                <span className="mt-0.5 line-clamp-1 text-[0.58rem] text-fg-3">{preset.summary}</span>
              </button>
            );
          })}
        </div>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="자유 드로잉 스케치 스트로크 템플릿"
        >
          <span className="text-[0.62rem] font-semibold text-fg-3">드로잉 스트로크 분석:</span>
          {ROUGH_SKETCH_STROKE_TEMPLATES.map((tpl) => {
            const active = selectedStrokeTemplateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelectedStrokeTemplateId((prev) => (prev === tpl.id ? "" : tpl.id));
                  setSelectedSketchPresetId(tpl.linkedPresetId);
                }}
                className={cn(
                  "rounded border px-2 py-0.5 text-[0.6rem] font-bold",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                {tpl.label}
              </button>
            );
          })}
        </div>

        {freehandAnalysis ? (
          <p
            data-testid="freehand-sketch-geometry-note"
            className="rounded border border-accent/40 bg-accent-soft px-2 py-1 text-[0.6rem] font-semibold text-accent"
          >
            스트로크 기하 분석 ({freehandAnalysis.confidenceScore}% 신뢰도):{" "}
            {freehandAnalysis.geometryNote}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label="간단한 스케치 메모 입력"
            value={sketchNote}
            onChange={(e) => setSketchNote(e.target.value)}
            placeholder="간단한 스케치 메모 (예: 왼쪽 아래에 주인공 실루엣, 오른쪽 위에 성벽 배치)"
            className={cn(TEXT_FIELD_CLASS, "flex-1")}
          />
          <button
            type="button"
            onClick={generateFromSketchOnly}
            className={cn(
              "shrink-0 rounded-lg border border-line bg-card px-2.5 py-2 text-[0.64rem] font-bold text-fg hover:bg-raised",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            스케치 의도만으로 컷 생성
          </button>
        </div>
      </div>

      {/* 4. 대본 / 지문 입력 */}
      <div className={PANEL_CARD_CLASS}>
        <label htmlFor={`${idPrefix}-script`} className="text-[0.75rem] font-bold text-fg">
          대본 / 시나리오 줄글 입력
        </label>
        <textarea
          id={`${idPrefix}-script`}
          rows={4}
          value={scriptInput}
          onChange={(e) => onScriptInputChange(e.target.value)}
          placeholder="한 줄이 한 컷이 됩니다. 장면을 줄바꿈으로 나눠 적어 주세요."
          aria-invalid={!scriptReady}
          aria-describedby={scriptReady ? undefined : `${idPrefix}-script-error`}
          className={cn(TEXT_FIELD_CLASS, "resize-none font-mono")}
        />
        {!scriptReady && (
          <p
            id={`${idPrefix}-script-error`}
            className="rounded-md border border-bad/35 bg-bad/10 px-2 py-1 text-[0.65rem] font-semibold text-bad"
          >
            대본이 비어 있어요. 컷으로 나눌 문장을 한 줄 이상 적어 주세요.
          </p>
        )}
      </div>

      {/* 5. 자동 생성된 컷별 콘티 */}
      {scriptReady ? (
        <div className={PANEL_CARD_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.75rem] font-bold">
              자동 생성된 컷별 콘티 ({storyboardResult.totalCuts}개 컷)
            </span>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[0.65rem] text-fg-3">
              <span>예상 모바일 완독: 약 {storyboardResult.estimatedEpisodeReadingSec}초</span>
              {plannedStoryboard ? (
                <span>· 예상 캔버스 높이: {plannedStoryboard.estimatedCanvasHeightPx}px</span>
              ) : null}
              <span
                data-testid="storyboard-style-consistency-badge"
                className="rounded bg-accent-soft px-1.5 py-0.5 font-sans text-[0.6rem] font-bold text-accent"
              >
                화풍 일관성 {styleConsistencyAudit.consistencyScore}점
              </span>
              {storyboardResult.globalKWebtoonReadiness ? (
                <span>
                  · 번역 말풍선 안전율:{" "}
                  {Math.round(
                    storyboardResult.globalKWebtoonReadiness.localizationSafeBubbleRatio * 100,
                  )}
                  %
                </span>
              ) : null}
            </div>
          </div>

          <ol className="flex list-none flex-col gap-2 p-0">
            {storyboardResult.cuts.map((cut) => {
              const promptToUse = cut.artistStylePrompt ?? cut.backgroundPrompt;
              const isDialogueOpen = expandedCutDialogueNum === cut.cutNumber;
              const localDialogues = isDialogueOpen
                ? recommendLocalDialogueCandidates(cut.stageDirection ?? cut.summary, {
                    speaker: cut.speaker,
                    emotion: cut.emotion,
                  })
                : [];
              const readability = cut.dialogue ? analyzeWebtoonDialogueReadability(cut.dialogue) : null;
              const splitBubbles = cut.dialogue ? splitDialogueIntoWebtoonBubbles(cut.dialogue) : [];
              const previewSourceText = cut.dialogue ?? cut.narration ?? localDialogues[0]?.text ?? "";
              const localizedPreviews =
                isDialogueOpen && previewSourceText
                  ? buildGlobalLocalizedDialoguePreview(previewSourceText, {
                      speaker: cut.speaker,
                      emotion: cut.emotion,
                    })
                  : [];

              return (
                <li
                  key={cut.cutNumber}
                  className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2.5 text-[0.68rem]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 font-bold">
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">컷 #{cut.cutNumber}</span>
                      <span className="rounded bg-raised px-1.5 py-0.5 text-fg-2">
                        {cut.shotScale} · {cut.cameraAngle}
                      </span>
                      <span className="rounded bg-good/10 px-1.5 py-0.5 text-good">감정: {cut.emotion}</span>
                      {cut.sketchIntentApplied ? (
                        <span className="rounded border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[0.6rem] text-accent">
                          스케치 구도 반영
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {cut.suggestedSfx && (
                        <span className="rounded bg-accent-soft px-2 py-0.5 font-black text-accent">
                          효과음: {cut.suggestedSfx}
                        </span>
                      )}
                      <StudioCopyTextButton
                        copyKey={`cut-prompt-${cut.cutNumber}`}
                        label={`컷 ${cut.cutNumber} 작화 프롬프트`}
                        text={promptToUse}
                        statusFor={statusForCopy}
                        onCopy={onCopy}
                        variant="quiet"
                      />
                      {onApplyPrompt ? (
                        <button
                          type="button"
                          onClick={() => onApplyPrompt(promptToUse)}
                          className={cn(
                            "rounded-lg border border-accent bg-accent-soft px-2 py-1 text-[0.6rem] font-bold text-accent hover:bg-raised",
                            STUDIO_EASE,
                            STUDIO_FOCUS_RING,
                          )}
                        >
                          이 컷 생성기로 전송
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="text-fg">{cut.summary}</p>
                  {cut.dialogue && (
                    <div className="flex flex-wrap items-center justify-between gap-1 border-l-2 border-accent pl-2">
                      <p className="font-semibold text-accent">대사: &ldquo;{cut.dialogue}&rdquo;</p>
                      {readability ? (
                        <span className="text-[0.58rem] text-fg-3">
                          모바일 가독성 {readability.mobileReadabilityScore}점 · 권장 말풍선{" "}
                          {readability.recommendedBubbleCount}개
                          {splitBubbles.length > 1 ? ` (${splitBubbles.join(" / ")})` : ""}
                        </span>
                      ) : null}
                    </div>
                  )}
                  {cut.narration && (
                    <p className="border-l-2 border-line pl-2 text-[0.64rem] text-fg-2">
                      나레이션: ({cut.narration})
                    </p>
                  )}
                  <p className="text-[0.62rem] text-fg-3">배경 프롬프트: {cut.backgroundPrompt}</p>
                  {activeArtistStyle && cut.artistStylePrompt ? (
                    <p className="font-mono text-[0.6rem] text-fg-2">
                      작가 그림체 모델 프롬프트 ({activeArtistStyle.artistLabel}): {cut.artistStylePrompt}
                    </p>
                  ) : null}
                  {cut.creatorCoachingTip ? (
                    <p className="rounded bg-raised px-2 py-1 text-[0.61rem] text-fg-2">
                      {cut.creatorCoachingTip} (말풍선 여백{" "}
                      {Math.round((cut.reserveDialogueAreaRatio ?? 0.15) * 100)}% · 스크롤 간격{" "}
                      {cut.scrollGapAfterPx ?? 100}px)
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                    <button
                      type="button"
                      aria-expanded={isDialogueOpen}
                      onClick={() =>
                        setExpandedCutDialogueNum((prev) => (prev === cut.cutNumber ? null : cut.cutNumber))
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded border border-line bg-card px-2 py-0.5 text-[0.6rem] font-semibold text-fg-2 hover:bg-raised",
                        STUDIO_EASE,
                        STUDIO_FOCUS_RING,
                      )}
                    >
                      <MessageSquareQuote size={11} aria-hidden />
                      {isDialogueOpen ? "추천 대사 접기" : "이 컷 추천 대사·나레이션 보기"}
                    </button>
                  </div>

                  {isDialogueOpen && localDialogues.length > 0 ? (
                    <div className="mt-1 flex flex-col gap-1.5 rounded-lg border border-line bg-raised p-2 text-[0.62rem]">
                      <ul className="flex list-none flex-col gap-1 p-0">
                        {localDialogues.map((cand, idx) => (
                          <li key={idx} className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="text-fg-2">{formatDialogueSuggestionLine(cand)}</span>
                            <button
                              type="button"
                              onClick={() => applyDialogueCandidateToCut(cut.cutNumber, cand)}
                              className={cn(
                                "rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.58rem] font-bold text-accent hover:bg-card",
                                STUDIO_EASE,
                                STUDIO_FOCUS_RING,
                              )}
                            >
                              이 대사로 반영
                            </button>
                          </li>
                        ))}
                      </ul>
                      {localizedPreviews.length > 0 ? (
                        <div
                          data-testid={`cut-global-locale-preview-${cut.cutNumber}`}
                          className="border-t border-line pt-1.5 text-[0.58rem] text-fg-3"
                        >
                          <span className="inline-flex items-center gap-1 font-bold text-fg-2">
                            <Globe size={10} aria-hidden /> 글로벌 K-웹툰 번역·식자 프리뷰:
                          </span>
                          <ul className="mt-0.5 grid grid-cols-1 gap-0.5 sm:grid-cols-3">
                            {localizedPreviews
                              .filter((item) => item.locale !== "ko")
                              .map((item) => (
                                <li key={item.locale} className="rounded bg-card px-1.5 py-1">
                                  <strong className="text-accent">{item.locale.toUpperCase()}</strong>:{" "}
                                  {item.localizedText} (팽창 {Math.round(item.bubbleExpansionRatio * 100)}%)
                                </li>
                              ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <StudioAiSuiteInputNeeded
          icon={<Clapperboard size={20} aria-hidden />}
          description="대본 한 줄이 한 컷이 됩니다. 문장을 적거나 간단한 스케치 의도를 선택하면 샷 사이즈·앵글·효과음을 배정해 드려요."
        />
      )}
    </div>
  );
}
