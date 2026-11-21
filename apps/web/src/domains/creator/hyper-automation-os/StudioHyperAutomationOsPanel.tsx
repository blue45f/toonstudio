import { Eye, EyeOff, Layers, Lock, RotateCcw, Sparkles, Unlock, Wand2 } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  applyArtistAutonomyPreset,
  autoFillHyperAutomationInput,
  getSpectrumProfile,
  rerunSinglePipelineStage,
  restoreAutoFillSnapshot,
  runHyperAutomationPipeline,
  setStageAutonomyPercent,
  switchRunAutomationSpectrum,
  toggleStageManualLock,
  updateMasterLayer,
  updateRunCharacterDna,
  updateRunLightball,
  validateRequiredMinimalInput,
  type AutoFilledFieldMeta,
  type HyperAutomationPipelineRun,
  type HyperAutomationRawInput,
  type PipelineStageState,
} from "./automation-spectrum-pipeline-engine";
import {
  ART_STYLE_OPTIONS,
  AUTOMATION_SPECTRUM_PROFILES,
  BUILT_IN_ARTIST_PRESETS,
  DEFAULT_STAGE_AUTONOMY_BY_MODE,
  GENRE_OPTIONS,
  MASTER_LAYER_ORDER,
  MAX_AUTONOMY_PERCENT,
  MAX_CUT_COUNT,
  MIN_AUTONOMY_PERCENT,
  MIN_CUT_COUNT,
  PLATFORM_OPTIONS,
  computeAverageAutonomyPercent,
  createArtistAutonomyPreset,
  loadSavedArtistAutonomyPresets,
  saveArtistAutonomyPresets,
  type ArtistAutonomyPreset,
  type AutomationSpectrumMode,
  type LayerBlendMode,
  type MasterLayerId,
  type OptionalBriefField,
  type PipelineStageId,
  type StageAutonomyMap,
  type TargetWebtoonPlatform,
  type WebtoonArtStyle,
  type WebtoonGenre,
} from "./hyper-automation-catalog";
import { HyperAutoDnaLightballSection } from "./HyperAutoDnaLightballSection";
import "./hyper-automation-os.css";

const BLEND_MODE_OPTIONS: readonly { readonly value: LayerBlendMode; readonly label: string }[] = [
  { value: "normal", label: "표준 (Normal)" },
  { value: "multiply", label: "곱하기 (Multiply)" },
  { value: "screen", label: "스크린 (Screen)" },
  { value: "overlay", label: "오버레이 (Overlay)" },
];

const INITIAL_INPUT: HyperAutomationRawInput = {
  ideaLine: "",
};

function stageStatusLabel(stage: PipelineStageState): string {
  if (stage.manualLocked) return "수동 보호 잠금";
  if (stage.status === "manual-edited") return `수동 제어 v${stage.generationCount}`;
  if (stage.status === "generated") return `자동 생성 v${stage.generationCount}`;
  return "대기";
}

function toRawOptionalInput(resolved: HyperAutomationPipelineRun["resolvedInput"]): HyperAutomationRawInput {
  return {
    ideaLine: resolved.ideaLine,
    genre: resolved.genre,
    artStyle: resolved.artStyle,
    characterCount: resolved.characterCount,
    protagonistProfile: resolved.protagonistProfile,
    backgroundTheme: resolved.backgroundTheme,
    cutCount: resolved.cutCount,
    targetPlatform: resolved.targetPlatform,
  };
}

/**
 * 수동 프로 0% ↔ 50% 프로 어시스트 ↔ 99% 원클릭 완자동 하이퍼 오토메이션 OS 패널.
 *
 * 필수 입력은 한 줄 아이디어 1개만 요구하고, 비어 있는 선택 항목은 AI가 문맥 기반으로
 * 자동 채움(출처 배지 + 1클릭 되돌리기 포함)한다. 생성 직후에도 9단계 개별 수동 잠금·
 * 공정별 0~99% 비중 다이얼·캐릭터 DNA(8각도·12표정)·3D 라이트볼 실시간 명암·
 * 6계층 분리 레이어(01_BG_3D~06_SPEECH_SFX) 수동 편집이 100% 열려 있다.
 */
export function StudioHyperAutomationOsPanel() {
  const ideaInputId = useId();
  const [mode, setMode] = useState<AutomationSpectrumMode>("hyper-auto-99");
  const [draftAutonomy, setDraftAutonomy] = useState<StageAutonomyMap>(
    DEFAULT_STAGE_AUTONOMY_BY_MODE["hyper-auto-99"],
  );
  const [savedPresets, setSavedPresets] = useState<readonly ArtistAutonomyPreset[]>(() => [
    ...BUILT_IN_ARTIST_PRESETS,
    ...loadSavedArtistAutonomyPresets(),
  ]);
  const [rawInput, setRawInput] = useState<HyperAutomationRawInput>(INITIAL_INPUT);
  const [autoFilledFields, setAutoFilledFields] = useState<readonly AutoFilledFieldMeta[]>([]);
  const [undoSnapshot, setUndoSnapshot] = useState<HyperAutomationRawInput | null>(null);
  const [run, setRun] = useState<HyperAutomationPipelineRun | null>(null);
  const [selectedCutIndex, setSelectedCutIndex] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeProfile = useMemo(() => getSpectrumProfile(mode), [mode]);
  const activeAutonomyPercent = useMemo(
    () => (run ? run.automationPercent : computeAverageAutonomyPercent(draftAutonomy)),
    [draftAutonomy, run],
  );

  const displayedCuts = useMemo(() => {
    if (!run) return [];
    if (run.cuts.length <= 12) return run.cuts;
    const head = run.cuts.slice(0, 11);
    const tail = run.cuts[run.cuts.length - 1];
    return tail ? [...head, tail] : head;
  }, [run]);

  const activeCut = useMemo(() => {
    if (!run || run.cuts.length === 0) return null;
    return run.cuts.find((cut) => cut.cutIndex === selectedCutIndex) ?? run.cuts[0] ?? null;
  }, [run, selectedCutIndex]);

  function clearAutoFilledField(field: OptionalBriefField) {
    setAutoFilledFields((prev) => prev.filter((item) => item.field !== field));
  }

  function handleModeChange(nextMode: AutomationSpectrumMode) {
    setMode(nextMode);
    setDraftAutonomy(DEFAULT_STAGE_AUTONOMY_BY_MODE[nextMode]);
    const nextProfile = getSpectrumProfile(nextMode);
    if (run) {
      setRun((prev) => (prev ? switchRunAutomationSpectrum(prev, nextMode) : null));
    }
    setStatusMessage(`작업 모드를 "${nextProfile.label}"로 전환했습니다. 잠긴 단계와 수동 레이어 편집은 유지됩니다.`);
  }

  function handleAutoFill() {
    const check = validateRequiredMinimalInput(rawInput);
    if (!check.valid) {
      setErrorMessage(check.message);
      return;
    }
    setErrorMessage(null);
    const result = autoFillHyperAutomationInput(rawInput);
    setUndoSnapshot(result.undoSnapshot);
    setAutoFilledFields(result.autoFilledFields);
    setRawInput(toRawOptionalInput(result.resolved));
    setStatusMessage(
      result.autoFilledFields.length > 0
        ? `비어 있던 선택 항목 ${result.autoFilledFields.length}개를 아이디어 문맥에 맞춰 채웠습니다.`
        : "모든 선택 항목이 이미 입력되어 있어 기존 값을 유지했습니다.",
    );
  }

  function handleUndoAutoFill() {
    if (!undoSnapshot) return;
    const restored = restoreAutoFillSnapshot(undoSnapshot);
    setRawInput(restored);
    setAutoFilledFields([]);
    setUndoSnapshot(null);
    setErrorMessage(null);
    setStatusMessage("AI 자동 채움 직전의 사용자 입력 상태로 되돌렸습니다.");
  }

  function handleRunPipeline() {
    const check = validateRequiredMinimalInput(rawInput);
    if (!check.valid) {
      setErrorMessage(check.message);
      return;
    }
    setErrorMessage(null);
    const nextRun = runHyperAutomationPipeline({
      input: rawInput,
      mode,
      stageAutonomy: run ? run.stageAutonomy : draftAutonomy,
      previousRun: run,
    });
    setRun(nextRun);
    setDraftAutonomy(nextRun.stageAutonomy);
    setSelectedCutIndex(1);
    if (nextRun.autoFilledFields.length > 0) {
      setUndoSnapshot(nextRun.undoSnapshot);
      setAutoFilledFields(nextRun.autoFilledFields);
      setRawInput(toRawOptionalInput(nextRun.resolvedInput));
    }
    const protectedNotice = nextRun.protectedStageIds.length > 0
      ? ` (수동 잠금 ${nextRun.protectedStageIds.length}개 단계 원본 보호)`
      : "";
    setStatusMessage(
      `${activeProfile.label} 9단계 파이프라인 완료 · ${nextRun.resolvedInput.cutCount}컷과 ${MASTER_LAYER_ORDER.length}계층 수동 레이어를 열었습니다${protectedNotice}.`,
    );
  }

  function handleToggleStageLock(stageId: PipelineStageId) {
    if (!run) return;
    const nextRun = toggleStageManualLock(run, stageId);
    const target = nextRun.stages.find((stage) => stage.id === stageId);
    setRun(nextRun);
    if (target) {
      setStatusMessage(
        target.manualLocked
          ? `"${target.title}" 단계를 수동 잠금했습니다. 재실행해도 작가 수정본이 덮어쓰이지 않습니다.`
          : `"${target.title}" 단계 잠금을 해제했습니다.`,
      );
    }
  }

  function handleStageDialChange(stageId: PipelineStageId, nextPercent: number) {
    if (!run) return;
    const nextRun = setStageAutonomyPercent(run, stageId, nextPercent);
    setRun(nextRun);
    setDraftAutonomy(nextRun.stageAutonomy);
  }

  function handleApplyPreset(preset: ArtistAutonomyPreset) {
    setDraftAutonomy(preset.stageAutonomy);
    if (run) {
      setRun((prev) => (prev ? applyArtistAutonomyPreset(prev, preset.stageAutonomy) : null));
    }
    setStatusMessage(`"${preset.name}" 공정 비중 프리셋(평균 ${preset.averagePercent}%)을 적용했습니다.`);
  }

  function handleSavePreset(name: string) {
    const activeMap = run ? run.stageAutonomy : draftAutonomy;
    const customCount = savedPresets.filter((item) => !item.builtIn).length + 1;
    const created = createArtistAutonomyPreset(name, activeMap, customCount);
    const nextList = [...savedPresets, created];
    setSavedPresets(nextList);
    saveArtistAutonomyPresets(nextList);
    setStatusMessage(`"${created.name}" 프리셋(평균 ${created.averagePercent}%)을 저장했습니다.`);
  }

  function handleRerunStage(stageId: PipelineStageId) {
    if (!run) return;
    const result = rerunSinglePipelineStage(run, stageId);
    setRun(result.run);
    setStatusMessage(result.message);
  }

  function handleLayerPatch(
    layerId: MasterLayerId,
    patch: Parameters<typeof updateMasterLayer>[2],
  ) {
    if (!run) return;
    setRun((prev) => (prev ? updateMasterLayer(prev, layerId, patch) : null));
  }

  return (
    <section
      className="hyper-auto-os"
      aria-label="하이퍼 오토메이션 OS 작업대"
      data-testid="studio-hyper-automation-os-panel"
    >
      <header className="hyper-auto-os__header">
        <div className="hyper-auto-os__title-row">
          <div className="hyper-auto-os__title-group">
            <h3>하이퍼 오토메이션 OS</h3>
            <p>한 줄 아이디어로 9단계 웹툰을 만들고, 공정별 0~99% 비중·캐릭터 DNA·3D 라이트볼·6계층 레이어를 자유롭게 통제합니다.</p>
          </div>
          <span className="hyper-auto-os__guarantee-pill">
            <Layers size={14} aria-hidden />
            {activeProfile.manualGuarantee}
          </span>
        </div>

        <div
          className="hyper-auto-os__spectrum-bar"
          role="radiogroup"
          aria-label="자동화 스펙트럼 선택"
        >
          {AUTOMATION_SPECTRUM_PROFILES.map((profile) => {
            const checked = profile.mode === mode;
            return (
              <button
                key={profile.mode}
                type="button"
                role="radio"
                aria-checked={checked}
                className="hyper-auto-os__mode-btn"
                data-testid={`hyper-auto-mode-${profile.mode}`}
                onClick={() => handleModeChange(profile.mode)}
              >
                <strong>{profile.label}</strong>
                <span>{profile.summary}</span>
              </button>
            );
          })}
        </div>

        <div className="hyper-auto-os__meter" aria-live="polite" data-testid="hyper-auto-spectrum-meter">
          <div className="hyper-auto-os__meter-head">
            <span>현재 자동화 스펙트럼: <strong>{activeProfile.label}</strong></span>
            <span>수동 주도 {100 - activeAutonomyPercent}% · AI 자동화 {activeAutonomyPercent}%</span>
          </div>
          <div className="hyper-auto-os__meter-track" aria-hidden="true">
            <div
              className="hyper-auto-os__meter-fill"
              style={{ width: `${Math.max(4, activeAutonomyPercent)}%` }}
            />
          </div>
        </div>
      </header>

      <div className="hyper-auto-os__composer">
        <label htmlFor={ideaInputId} className="hyper-auto-os__required-label">
          <span className="hyper-auto-os__required-tag">필수 1개</span>
          <span>아이디어 한 줄만 입력하세요</span>
        </label>
        <input
          id={ideaInputId}
          type="text"
          className="hyper-auto-os__idea-input"
          data-testid="hyper-auto-idea-input"
          value={rawInput.ideaLine}
          placeholder="예: 비 오는 네온 서울 옥상에서 기억을 잃은 검사가 깨어난다"
          onChange={(event) => {
            setRawInput((prev) => ({ ...prev, ideaLine: event.target.value }));
            if (errorMessage) setErrorMessage(null);
          }}
        />

        <div className="hyper-auto-os__actions">
          <button
            type="button"
            className="hyper-auto-os__btn"
            data-testid="hyper-auto-fill-button"
            onClick={handleAutoFill}
          >
            <Wand2 size={15} aria-hidden />
            AI 빈칸 자동 채움
          </button>
          {undoSnapshot ? (
            <button
              type="button"
              className="hyper-auto-os__btn"
              data-testid="hyper-auto-undo-fill-button"
              onClick={handleUndoAutoFill}
            >
              <RotateCcw size={15} aria-hidden />
              자동 채움 되돌리기
            </button>
          ) : null}
          <button
            type="button"
            className="hyper-auto-os__btn hyper-auto-os__btn--primary"
            data-testid="hyper-auto-run-button"
            onClick={handleRunPipeline}
          >
            <Sparkles size={15} aria-hidden />
            {activeProfile.ctaLabel}
          </button>
        </div>

        {errorMessage ? (
          <p className="hyper-auto-os__alert" role="alert" data-testid="hyper-auto-error">
            {errorMessage}
          </p>
        ) : null}

        {statusMessage ? (
          <p className="hyper-auto-os__status-note" role="status" data-testid="hyper-auto-status">
            {statusMessage}
          </p>
        ) : null}

        {autoFilledFields.length > 0 ? (
          <div className="hyper-auto-os__autofill-badges" data-testid="hyper-auto-filled-badges">
            {autoFilledFields.map((item) => (
              <span key={item.field} className="hyper-auto-os__badge" title={item.reason}>
                <strong>AI 자동 채움</strong>
                <span>{item.label}: {item.valueSummary}</span>
              </span>
            ))}
          </div>
        ) : null}

        <details className="hyper-auto-os__optional" data-testid="hyper-auto-optional-details">
          <summary>선택 옵션 펼치기 (비워 두면 AI가 문맥으로 자동 채움)</summary>
          <div className="hyper-auto-os__optional-grid">
            <div className="hyper-auto-os__field">
              <label htmlFor={`${ideaInputId}-genre`}>장르 (선택)</label>
              <select
                id={`${ideaInputId}-genre`}
                data-testid="hyper-auto-genre-select"
                value={rawInput.genre ?? ""}
                onChange={(event) => {
                  const value = event.target.value as WebtoonGenre | "";
                  clearAutoFilledField("genre");
                  setRawInput((prev) => ({
                    ...prev,
                    ...(value ? { genre: value } : { genre: undefined }),
                  }));
                }}
              >
                <option value="">AI 자동 선택</option>
                {GENRE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="hyper-auto-os__field">
              <label htmlFor={`${ideaInputId}-style`}>화풍 (선택)</label>
              <select
                id={`${ideaInputId}-style`}
                data-testid="hyper-auto-style-select"
                value={rawInput.artStyle ?? ""}
                onChange={(event) => {
                  const value = event.target.value as WebtoonArtStyle | "";
                  clearAutoFilledField("artStyle");
                  setRawInput((prev) => ({
                    ...prev,
                    ...(value ? { artStyle: value } : { artStyle: undefined }),
                  }));
                }}
              >
                <option value="">AI 자동 선택</option>
                {ART_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="hyper-auto-os__field">
              <label htmlFor={`${ideaInputId}-platform`}>타겟 플랫폼 (선택)</label>
              <select
                id={`${ideaInputId}-platform`}
                data-testid="hyper-auto-platform-select"
                value={rawInput.targetPlatform ?? ""}
                onChange={(event) => {
                  const value = event.target.value as TargetWebtoonPlatform | "";
                  clearAutoFilledField("targetPlatform");
                  setRawInput((prev) => ({
                    ...prev,
                    ...(value ? { targetPlatform: value } : { targetPlatform: undefined }),
                  }));
                }}
              >
                <option value="">AI 자동 선택</option>
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="hyper-auto-os__field">
              <label htmlFor={`${ideaInputId}-cuts`}>컷 수 ({MIN_CUT_COUNT}~{MAX_CUT_COUNT}컷, 선택)</label>
              <input
                id={`${ideaInputId}-cuts`}
                type="number"
                min={MIN_CUT_COUNT}
                max={MAX_CUT_COUNT}
                data-testid="hyper-auto-cutcount-input"
                placeholder="비워 두면 AI 자동 배분"
                value={rawInput.cutCount ?? ""}
                onChange={(event) => {
                  const rawValue = event.target.value.trim();
                  clearAutoFilledField("cutCount");
                  setRawInput((prev) => ({
                    ...prev,
                    cutCount: rawValue === "" ? undefined : Number(rawValue),
                  }));
                }}
              />
            </div>

            <div className="hyper-auto-os__field">
              <label htmlFor={`${ideaInputId}-chars`}>캐릭터 수 (1~8명, 선택)</label>
              <input
                id={`${ideaInputId}-chars`}
                type="number"
                min={1}
                max={8}
                data-testid="hyper-auto-charcount-input"
                placeholder="비워 두면 AI 자동 설정"
                value={rawInput.characterCount ?? ""}
                onChange={(event) => {
                  const rawValue = event.target.value.trim();
                  clearAutoFilledField("characterCount");
                  setRawInput((prev) => ({
                    ...prev,
                    characterCount: rawValue === "" ? undefined : Number(rawValue),
                  }));
                }}
              />
            </div>

            <div className="hyper-auto-os__field">
              <label htmlFor={`${ideaInputId}-protagonist`}>주인공 설정 (선택)</label>
              <input
                id={`${ideaInputId}-protagonist`}
                type="text"
                data-testid="hyper-auto-protagonist-input"
                placeholder="비워 두면 한 줄 아이디어에서 추론"
                value={rawInput.protagonistProfile ?? ""}
                onChange={(event) => {
                  clearAutoFilledField("protagonistProfile");
                  setRawInput((prev) => ({ ...prev, protagonistProfile: event.target.value }));
                }}
              />
            </div>

            <div className="hyper-auto-os__field">
              <label htmlFor={`${ideaInputId}-background`}>배경 테마 (선택)</label>
              <input
                id={`${ideaInputId}-background`}
                type="text"
                data-testid="hyper-auto-background-input"
                placeholder="비워 두면 장르 3D 공간 자동 매칭"
                value={rawInput.backgroundTheme ?? ""}
                onChange={(event) => {
                  clearAutoFilledField("backgroundTheme");
                  setRawInput((prev) => ({ ...prev, backgroundTheme: event.target.value }));
                }}
              />
            </div>
          </div>
        </details>
      </div>

      {run ? (
        <>
          <div className="hyper-auto-os__section-head">
            <h4>9단계 End-to-End 파이프라인 (공정별 0~99% 비중 · 수동 잠금 · 단독 재실행)</h4>
            <small>수동 잠금된 단계: {run.protectedStageIds.length} / 9</small>
          </div>

          <div className="hyper-auto-os__pipeline-grid" data-testid="hyper-auto-pipeline-grid">
            {run.stages.map((stage) => (
              <article
                key={stage.id}
                className="hyper-auto-os__stage-card"
                data-locked={stage.manualLocked ? "true" : "false"}
                data-testid={`hyper-auto-stage-${stage.id}`}
              >
                <div className="hyper-auto-os__stage-head">
                  <div className="hyper-auto-os__stage-title">
                    <strong>{stage.order}. {stage.title}</strong>
                    <small>{stage.subtitle}</small>
                  </div>
                  <span className="hyper-auto-os__stage-pill" data-status={stage.status}>
                    {stageStatusLabel(stage)}
                  </span>
                </div>

                <label className="hyper-auto-os__dial-row">
                  <span>
                    공정 자동화 비중:{" "}
                    <strong>{stage.autonomyPercent === 0 ? "수동 100% (AI 0%)" : `AI ${stage.autonomyPercent}%`}</strong>
                  </span>
                  <input
                    type="range"
                    min={MIN_AUTONOMY_PERCENT}
                    max={MAX_AUTONOMY_PERCENT}
                    aria-label={`${stage.title} 자동화 비중`}
                    data-testid={`hyper-auto-dial-${stage.id}`}
                    value={stage.autonomyPercent}
                    onChange={(event) => handleStageDialChange(stage.id, Number(event.target.value))}
                  />
                </label>

                <p className="hyper-auto-os__stage-summary">{stage.summary}</p>

                <div className="hyper-auto-os__metrics">
                  {stage.metrics.map((metric) => (
                    <span key={metric} className="hyper-auto-os__metric-chip">{metric}</span>
                  ))}
                </div>

                <div className="hyper-auto-os__stage-actions">
                  <button
                    type="button"
                    className={`hyper-auto-os__btn ${stage.manualLocked ? "hyper-auto-os__btn--locked" : ""}`}
                    aria-pressed={stage.manualLocked}
                    data-testid={`hyper-auto-lock-${stage.id}`}
                    onClick={() => handleToggleStageLock(stage.id)}
                  >
                    {stage.manualLocked ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
                    {stage.manualLocked ? "잠금 해제" : "수동 잠금"}
                  </button>
                  <button
                    type="button"
                    className="hyper-auto-os__btn"
                    disabled={stage.manualLocked}
                    data-testid={`hyper-auto-rerun-${stage.id}`}
                    onClick={() => handleRerunStage(stage.id)}
                  >
                    이 단계만 다시 생성
                  </button>
                </div>
              </article>
            ))}
          </div>

          <HyperAutoDnaLightballSection
            presets={savedPresets}
            averageAutonomyPercent={run.automationPercent}
            characterDna={run.characterDna}
            lightball={run.lightball}
            onApplyPreset={handleApplyPreset}
            onSavePreset={handleSavePreset}
            onUpdateDna={(patch) => setRun((prev) => (prev ? updateRunCharacterDna(prev, patch) : null))}
            onUpdateLightball={(patch) => setRun((prev) => (prev ? updateRunLightball(prev, patch) : null))}
          />

          <div className="hyper-auto-os__workbench" data-testid="hyper-auto-master-workbench">
            <div className="hyper-auto-os__panel-box" data-testid="hyper-auto-cut-preview">
              <div className="hyper-auto-os__section-head">
                <h4>{run.episodeTitle}</h4>
                <small>총 {run.cuts.length}컷 · 모바일 가독성 {run.mobileReadabilityScore}점</small>
              </div>
              <p className="hyper-auto-os__stage-summary">{run.logline}</p>
              <p className="hyper-auto-os__stage-summary"><strong>클라이맥스 훅:</strong> {run.climaxHook}</p>

              <div className="hyper-auto-os__swatches" aria-label="OKLCH 팔레트 락">
                {run.paletteSwatches.map((swatch) => (
                  <span key={swatch.role} className="hyper-auto-os__swatch">
                    <span
                      className="hyper-auto-os__swatch-dot"
                      style={{ backgroundColor: swatch.value }}
                      aria-hidden="true"
                    />
                    <span>{swatch.label}</span>
                  </span>
                ))}
              </div>

              <div className="hyper-auto-os__cut-strip" aria-label="생성된 웹툰 컷 선택">
                {displayedCuts.map((cut) => (
                  <button
                    key={cut.cutIndex}
                    type="button"
                    className="hyper-auto-os__cut-btn"
                    aria-pressed={activeCut?.cutIndex === cut.cutIndex}
                    onClick={() => setSelectedCutIndex(cut.cutIndex)}
                  >
                    #{cut.cutIndex}
                  </button>
                ))}
              </div>

              {activeCut ? (
                <div className="hyper-auto-os__cut-frame">
                  <strong>
                    컷 #{activeCut.cutIndex} · {activeCut.act}막 · {activeCut.shotType} ({activeCut.lensMm}mm)
                  </strong>
                  <p>{activeCut.beatSummary}</p>
                  <p>대사: &ldquo;{activeCut.dialogueLine}&rdquo; · SFX: <strong>{activeCut.sfxCue}</strong></p>
                  <p>감정 텐션 {activeCut.tension}% · 시선 동선 {activeCut.eyeFlow}</p>
                </div>
              ) : null}

              <ul className="hyper-auto-os__platform-list" aria-label="6대 플랫폼 규격 검수 결과">
                {run.platformChecks.map((check) => (
                  <li key={check.platform}>
                    <strong>{check.name} ({check.readabilityScore}점)</strong>
                    <span>{check.targetWidthPx}px · {check.status === "pass" ? "통과" : "자동 교정"}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="hyper-auto-os__panel-box" data-testid="hyper-auto-layer-editor">
              <div className="hyper-auto-os__section-head">
                <h4>6계층 수동 레이어 편집기 ({run.masterLayers.length}계층 분리)</h4>
                <small>자동 생성 결과도 레이어별 100% 수동 제어</small>
              </div>

              <ul className="hyper-auto-os__layer-list">
                {run.masterLayers.map((layer) => (
                  <li
                    key={layer.id}
                    className="hyper-auto-os__layer-row"
                    data-visible={layer.visible ? "true" : "false"}
                    data-testid={`hyper-auto-layer-${layer.id}`}
                  >
                    <div className="hyper-auto-os__layer-top">
                      <span className="hyper-auto-os__layer-id">
                        <span
                          className="hyper-auto-os__swatch-dot"
                          style={{ backgroundColor: layer.colorTokenOklch }}
                          aria-hidden="true"
                        />
                        <code className="hyper-auto-os__layer-code">{layer.id}</code>
                        <span>{layer.label}</span>
                      </span>
                      <span className="hyper-auto-os__metric-chip">
                        요소 {layer.elementCount}개{layer.editCount > 0 ? ` · 수동 수정 ${layer.editCount}회` : ""}
                      </span>
                    </div>

                    <p className="hyper-auto-os__stage-summary">{layer.roleDescription}</p>

                    <div className="hyper-auto-os__layer-controls">
                      <button
                        type="button"
                        className="hyper-auto-os__btn"
                        aria-pressed={layer.visible}
                        data-testid={`hyper-auto-layer-vis-${layer.id}`}
                        onClick={() => handleLayerPatch(layer.id, { visible: !layer.visible })}
                      >
                        {layer.visible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
                        {layer.visible ? "표시" : "숨김"}
                      </button>

                      <button
                        type="button"
                        className={`hyper-auto-os__btn ${layer.manualLocked ? "hyper-auto-os__btn--locked" : ""}`}
                        aria-pressed={layer.manualLocked}
                        data-testid={`hyper-auto-layer-lock-${layer.id}`}
                        onClick={() => handleLayerPatch(layer.id, { manualLocked: !layer.manualLocked })}
                      >
                        {layer.manualLocked ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
                        {layer.manualLocked ? "잠금됨" : "잠금"}
                      </button>

                      <select
                        aria-label={`${layer.id} 블렌드 모드`}
                        data-testid={`hyper-auto-layer-blend-${layer.id}`}
                        value={layer.blendMode}
                        onChange={(event) => handleLayerPatch(layer.id, {
                          blendMode: event.target.value as LayerBlendMode,
                        })}
                      >
                        {BLEND_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>

                      <label className="hyper-auto-os__metric-chip">
                        불투명도 {layer.opacity}%
                        <input
                          type="range"
                          min={0}
                          max={100}
                          aria-label={`${layer.id} 불투명도`}
                          data-testid={`hyper-auto-layer-opacity-${layer.id}`}
                          value={layer.opacity}
                          onChange={(event) => handleLayerPatch(layer.id, { opacity: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <p className="hyper-auto-os__status-note">
          한 줄 아이디어를 입력하고 실행하면 ① 스토리·플롯부터 ⑨ 6계층 분리 레이어(01_BG_3D~06_SPEECH_SFX), 공정별 0~99% 다이얼, 캐릭터 DNA(8각도·12표정), 3D 라이트볼까지 바로 열립니다.
        </p>
      )}
    </section>
  );
}
