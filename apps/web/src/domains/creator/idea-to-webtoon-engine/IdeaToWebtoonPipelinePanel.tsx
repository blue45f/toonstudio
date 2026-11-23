/**
 * 아이디어 → 완성 웹툰 6단계 멀티모달 에이전트 자동화 파이프라인 디렉터 워크벤치.
 *
 * 단 1줄의 로그라인 입력만으로:
 * 1) 기·승·전·결·클리프행어 서사 비트 시트
 * 2) 주연·조연 캐릭터 DNA 락
 * 3) 세로 스크롤 호흡 & 컷별 연출 시트
 * 4) 장기 연재 연속성·모순 감사 + 원클릭 자동 교정
 * 5) 감정 곡선 연동 적응형 OST SVG 그래프 & 큐
 * 6) ToonStudio 프로젝트 블루프린트 JSON 내보내기
 * 까지 완결된 결과를 결정론적으로 생성한다.
 */

import "./idea-to-webtoon-pipeline.css";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCopy,
  Code2,
  Download,
  FileJson,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
  Wrench,
} from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  IDEA_PROMPT_PRESETS,
  STORY_ACT_LABELS,
  WEBTOON_GENRE_CATALOG,
} from "./idea-to-episode-catalog";
import {
  autoRepairEpisodeContinuity,
  compileIdeaToWebtoonEpisode,
  injectDemoContinuityFaults,
  serializeEpisodeBlueprintJson,
} from "./idea-to-episode-pipeline";
import {
  EPISODE_LENGTH_SPECS,
  WEBTOON_GENRE_IDS,
  type CompiledWebtoonEpisodePlan,
  type ContinuityRuleId,
  type EpisodeLengthId,
  type IdeaPipelineLocale,
  type IdeaPromptPreset,
  type WebtoonGenreId,
} from "./idea-to-episode-types";
import {
  AdaptiveOstCurveSection,
  CharacterDnaSection,
  ScrollPanelDirectionSection,
} from "./IdeaToWebtoonStageViews";

export interface IdeaToWebtoonPipelinePanelProps {
  readonly onExportBlueprintJson?: (
    jsonText: string,
    plan: CompiledWebtoonEpisodePlan,
  ) => void;
}

type ContinuityViewMode = "clean" | "fault-injected" | "repaired";

type NoticeKind =
  | "ready"
  | "generated"
  | "preset"
  | "faults-injected"
  | "repaired"
  | "json-copied"
  | "json-downloaded";

const CONTINUITY_RULE_LABELS: Readonly<
  Record<ContinuityRuleId, { readonly ko: string; readonly en: string }>
> = {
  OUTFIT_MISMATCH: { ko: "의상 불일치", en: "Outfit Mismatch" },
  TIMELINE_REGRESSION: { ko: "시간대 역행", en: "Timeline Regression" },
  DIALOGUE_BUBBLE_OVERLOAD: { ko: "말풍선 과밀", en: "Bubble Overload" },
  MISSING_CLIFFHANGER: { ko: "클리프행어 누락", en: "Missing Cliffhanger" },
  MONOTONOUS_SHOT_SEQUENCE: { ko: "샷 단조로움", en: "Monotonous Shots" },
};

export function IdeaToWebtoonPipelinePanel({
  onExportBlueprintJson,
}: IdeaToWebtoonPipelinePanelProps = {}) {
  const lang = useI18n((state) => state.lang);
  const locale: IdeaPipelineLocale = lang.toLowerCase().startsWith("ko") ? "ko" : "en";
  const t = (ko: string, en: string) => (locale === "ko" ? ko : en);

  const loglineInputId = useId();
  const [selectedPresetId, setSelectedPresetId] = useState<string>(IDEA_PROMPT_PRESETS[0].id);
  const [genre, setGenre] = useState<WebtoonGenreId>(IDEA_PROMPT_PRESETS[0].genre);
  const [lengthId, setLengthId] = useState<EpisodeLengthId>(IDEA_PROMPT_PRESETS[0].lengthId);
  const [draftCustomLogline, setDraftCustomLogline] = useState<string | null>(null);
  const [submittedCustomLogline, setSubmittedCustomLogline] = useState<string | null>(null);
  const [continuityMode, setContinuityMode] = useState<ContinuityViewMode>("clean");
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>("ready");

  const activePreset = useMemo(
    () => IDEA_PROMPT_PRESETS.find((preset) => preset.id === selectedPresetId) ?? IDEA_PROMPT_PRESETS[0],
    [selectedPresetId],
  );

  const defaultLocalizedLogline = useMemo(() => {
    if (activePreset.genre === genre) {
      return activePreset.logline[locale];
    }
    return WEBTOON_GENRE_CATALOG[genre].defaultLogline[locale];
  }, [activePreset, genre, locale]);

  const inputLoglineValue = draftCustomLogline ?? defaultLocalizedLogline;
  const activeCompiledLogline = submittedCustomLogline ?? defaultLocalizedLogline;

  const basePlan = useMemo(
    () =>
      compileIdeaToWebtoonEpisode({
        logline: activeCompiledLogline,
        genre,
        lengthId,
        locale,
      }),
    [activeCompiledLogline, genre, lengthId, locale],
  );

  const activePlan = useMemo(() => {
    if (continuityMode === "fault-injected") {
      return injectDemoContinuityFaults(basePlan);
    }
    if (continuityMode === "repaired") {
      return autoRepairEpisodeContinuity(injectDemoContinuityFaults(basePlan));
    }
    return basePlan;
  }, [basePlan, continuityMode]);

  const blueprintJson = useMemo(
    () => serializeEpisodeBlueprintJson(activePlan),
    [activePlan],
  );

  const handleSubmitIdea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = inputLoglineValue.trim();
    setSubmittedCustomLogline(cleaned.length > 0 ? cleaned : null);
    setContinuityMode("clean");
    setNoticeKind("generated");
  };

  const handleSelectPreset = (preset: IdeaPromptPreset) => {
    setSelectedPresetId(preset.id);
    setGenre(preset.genre);
    setLengthId(preset.lengthId);
    setDraftCustomLogline(null);
    setSubmittedCustomLogline(null);
    setContinuityMode("clean");
    setNoticeKind("preset");
  };

  const handleSelectGenre = (nextGenre: WebtoonGenreId) => {
    setGenre(nextGenre);
    setDraftCustomLogline(null);
    setSubmittedCustomLogline(null);
    setContinuityMode("clean");
    setNoticeKind("generated");
  };

  const handleSelectLength = (nextLength: EpisodeLengthId) => {
    setLengthId(nextLength);
    setContinuityMode("clean");
    setNoticeKind("generated");
  };

  const handleSimulateFaults = () => {
    setContinuityMode("fault-injected");
    setNoticeKind("faults-injected");
  };

  const handleAutoRepair = () => {
    setContinuityMode("repaired");
    setNoticeKind("repaired");
  };

  const handleCopyBlueprintJson = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(blueprintJson).catch(() => undefined);
    }
    setShowJsonPreview(true);
    setNoticeKind("json-copied");
    onExportBlueprintJson?.(blueprintJson, activePlan);
  };

  const handleDownloadBlueprintJson = () => {
    if (typeof window !== "undefined" && typeof URL.createObjectURL === "function") {
      const blob = new Blob([blueprintJson], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${activePlan.planId}.toonstudio.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    setNoticeKind("json-downloaded");
    onExportBlueprintJson?.(blueprintJson, activePlan);
  };

  const noticeText = useMemo(() => {
    const isKo = locale === "ko";
    switch (noticeKind) {
      case "preset":
        return isKo
          ? `추천 아이디어(${activePreset.chipLabel.ko})로 6단계 에피소드 플랜을 즉시 생성했습니다.`
          : `Compiled 6-stage episode plan from preset (${activePreset.chipLabel.en}).`;
      case "generated":
        return isKo
          ? `${activePlan.panels.length}컷 · 연속성 ${activePlan.continuityAudit.score}점 · ToonStudio 프로젝트 블루프린트를 컴파일했습니다.`
          : `Compiled ${activePlan.panels.length} panels · ${activePlan.continuityAudit.score}/100 continuity · ToonStudio blueprint ready.`;
      case "faults-injected":
        return isKo
          ? `장기 연재 모순 ${activePlan.continuityAudit.findings.length}건이 감지되었습니다. 원클릭 자동 교정으로 즉시 해소할 수 있습니다.`
          : `Detected ${activePlan.continuityAudit.findings.length} continuity faults. Run One-Click Auto-Repair to resolve all issues.`;
      case "repaired":
        return isKo
          ? "원클릭 자동 교정 완료: 모순 0건 · 연속성 100점 · OST 큐와 프로젝트 JSON을 동기화했습니다."
          : "One-Click Auto-Repair complete: 0 faults · 100/100 continuity · OST cues and project JSON synced.";
      case "json-copied":
        return isKo
          ? `ToonStudio 프로젝트 JSON(${blueprintJson.length.toLocaleString("ko-KR")}자)을 복사하고 미리보기를 열었습니다.`
          : `Copied ToonStudio Project JSON (${blueprintJson.length.toLocaleString("en-US")} chars) and opened preview.`;
      case "json-downloaded":
        return isKo
          ? `${activePlan.planId}.toonstudio.json 파일 내보내기를 완료했습니다.`
          : `Exported ${activePlan.planId}.toonstudio.json blueprint file.`;
      default:
        return isKo
          ? "1줄 아이디어를 입력하거나 추천 칩을 누르면 6단계 멀티에이전트가 완성 웹툰 설계도를 결정론적으로 컴파일합니다."
          : "Enter a one-line logline or choose a preset chip to compile a deterministic 6-stage webtoon blueprint.";
    }
  }, [activePlan, activePreset, blueprintJson.length, locale, noticeKind]);

  return (
    <div className="i2w-shell" data-testid="idea-to-webtoon-pipeline-panel">
      <div className="i2w-body">
        <header className="i2w-header">
          <div>
            <span className="i2w-kicker">
              <Sparkles size={14} aria-hidden="true" />
              <span>{t("6단계 멀티모달 에이전트 디렉터 워크벤치", "6-Stage Multimodal Agent Director Workbench")}</span>
            </span>
            <h2 className="i2w-title">{activePlan.episodeTitle[locale]}</h2>
            <p className="i2w-subtitle">
              {t(
                "1줄 아이디어에서 서사 비트·캐릭터 DNA 락·스크롤 컷 연출·장기 연속성 감사·적응형 OST·ToonStudio JSON까지 한 번에 컴파일합니다.",
                "Compile a single logline into story beats, character DNA locks, vertical scroll panels, continuity audit, adaptive OST cues, and ToonStudio JSON.",
              )}
            </p>
          </div>
          <div className="i2w-header-meta">
            <span className="i2w-pill i2w-num" data-testid="i2w-seed-badge">
              {activePlan.deterministicSeed}
            </span>
            <span
              className={`i2w-pill i2w-num ${activePlan.continuityAudit.passed ? "i2w-pill--good" : "i2w-pill--bad"}`}
              data-testid="i2w-continuity-score-badge"
            >
              {activePlan.continuityAudit.passed ? (
                <ShieldCheck size={14} aria-hidden="true" />
              ) : (
                <ShieldAlert size={14} aria-hidden="true" />
              )}
              <span>
                {t(
                  `연속성 ${activePlan.continuityAudit.score}점`,
                  `Continuity ${activePlan.continuityAudit.score}/100`,
                )}
              </span>
            </span>
          </div>
        </header>

        {/* 1줄 아이디어 입력 + 4종 추천 칩 + 장르/분량 컨트롤 */}
        <section className="i2w-section" aria-labelledby="i2w-composer-heading">
          <div className="i2w-section-head">
            <h3 id="i2w-composer-heading" className="i2w-section-title">
              <Wand2 size={16} aria-hidden="true" />
              <span>{t("1줄 아이디어 입력 & 편성 설정", "One-Line Idea Input & Episode Spec")}</span>
            </h3>
            <span className="i2w-pill i2w-pill--accent">
              {t("결정론적 로컬 컴파일", "Deterministic Local Compiler")}
            </span>
          </div>

          <form className="i2w-form" onSubmit={handleSubmitIdea}>
            <label htmlFor={loglineInputId} className="i2w-input-label">
              {t("에피소드 로그라인 (1줄 아이디어)", "Episode Logline (One-Line Idea)")}
            </label>
            <div className="i2w-input-row">
              <input
                id={loglineInputId}
                type="text"
                className="i2w-input"
                value={inputLoglineValue}
                onChange={(event) => setDraftCustomLogline(event.target.value)}
                placeholder={t(
                  "예: 처형 직전 회귀한 공녀가 황실 태엽시계를 훔쳐 판을 뒤집는다.",
                  "e.g. A regressed duchess steals the imperial clockwork seal to overturn her fate.",
                )}
                data-testid="i2w-logline-input"
              />
              <button
                type="submit"
                className="i2w-btn i2w-btn--primary"
                data-testid="i2w-generate-btn"
              >
                <Sparkles size={15} aria-hidden="true" />
                <span>{t("6단계 파이프라인 생성", "Run 6-Stage Pipeline")}</span>
              </button>
            </div>
          </form>

          <div>
            <span className="i2w-control-label">
              {t("추천 원클릭 아이디어 칩 4종", "4 Recommended One-Click Idea Chips")}
            </span>
            <div className="i2w-chip-group" data-testid="i2w-preset-chips">
              {IDEA_PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="i2w-chip"
                  aria-pressed={selectedPresetId === preset.id && draftCustomLogline === null}
                  onClick={() => handleSelectPreset(preset)}
                  data-testid={`i2w-preset-${preset.id}`}
                >
                  {preset.chipLabel[locale]}
                </button>
              ))}
            </div>
          </div>

          <div className="i2w-controls-grid">
            <div>
              <span className="i2w-control-label">{t("웹툰 장르 6종", "6 Webtoon Genres")}</span>
              <div className="i2w-chip-group" data-testid="i2w-genre-selector">
                {WEBTOON_GENRE_IDS.map((genreId) => (
                  <button
                    key={genreId}
                    type="button"
                    className="i2w-chip"
                    aria-pressed={genre === genreId}
                    onClick={() => handleSelectGenre(genreId)}
                    data-testid={`i2w-genre-${genreId}`}
                  >
                    {WEBTOON_GENRE_CATALOG[genreId].label[locale]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="i2w-control-label">{t("에피소드 분량 3종", "3 Episode Lengths")}</span>
              <div className="i2w-chip-group" data-testid="i2w-length-selector">
                {EPISODE_LENGTH_SPECS.map((spec) => (
                  <button
                    key={spec.id}
                    type="button"
                    className="i2w-chip i2w-num"
                    aria-pressed={lengthId === spec.id}
                    onClick={() => handleSelectLength(spec.id)}
                    data-testid={`i2w-length-${spec.id}`}
                  >
                    {spec.label[locale]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="i2w-status-banner" role="status" aria-live="polite" data-testid="i2w-status-banner">
            {noticeText}
          </div>
        </section>

        {/* 6단계 멀티에이전트 진행 스테퍼 */}
        <section className="i2w-section" aria-labelledby="i2w-stepper-heading">
          <div className="i2w-section-head">
            <h3 id="i2w-stepper-heading" className="i2w-section-title">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{t("6단계 멀티에이전트 자동화 파이프라인 상태", "6-Stage Multi-Agent Pipeline Progress")}</span>
            </h3>
          </div>
          <ol className="i2w-stepper" data-testid="i2w-stage-stepper">
            {activePlan.stages.map((step) => {
              const modifier =
                step.status === "warning"
                  ? "i2w-step-card--warning"
                  : step.status === "repaired"
                    ? "i2w-step-card--repaired"
                    : "";
              return (
                <li
                  key={step.stageId}
                  className={`i2w-step-card ${modifier}`}
                  data-testid={`i2w-stage-${step.stageNumber}`}
                >
                  <div className="i2w-step-top i2w-num">
                    <span>
                      {t(`STAGE ${step.stageNumber}`, `STAGE ${step.stageNumber}`)} · {step.agentName[locale]}
                    </span>
                    <span>{step.artifactCount}</span>
                  </div>
                  <div className="i2w-step-title">{step.title[locale]}</div>
                  <div className="i2w-step-summary">{step.summary[locale]}</div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Stage 1: 서사 비트 시트 */}
        <section className="i2w-section" aria-labelledby="i2w-beats-heading" data-testid="i2w-story-beats-section">
          <div className="i2w-section-head">
            <h3 id="i2w-beats-heading" className="i2w-section-title">
              <BookOpen size={16} aria-hidden="true" />
              <span>{t("1단계 · 기·승·전·결·엔딩 클리프행어 비트 시트", "Stage 1 · 5-Act Story Beat Sheet & Cliffhanger")}</span>
            </h3>
          </div>
          <div className="i2w-beat-grid">
            {activePlan.storyBeats.map((beat) => (
              <article
                key={beat.beatId}
                className={`i2w-beat-card ${beat.isCliffhanger ? "i2w-beat-card--cliff" : ""}`}
              >
                <div className="i2w-step-top i2w-num">
                  <span>{STORY_ACT_LABELS[beat.act][locale]}</span>
                  <span>
                    {t(
                      `컷 ${beat.panelIndices.join(",")}`,
                      `P${beat.panelIndices.join(",")}`,
                    )}
                  </span>
                </div>
                <div className="i2w-step-title">{beat.title[locale]}</div>
                <div className="i2w-step-summary">{beat.summary[locale]}</div>
                {beat.hookQuestion && (
                  <div className="i2w-step-summary">
                    <strong>{t("클리프행어 훅", "Cliffhanger Hook")}:</strong> {beat.hookQuestion[locale]}
                  </div>
                )}
                <div className="i2w-meter-track" aria-hidden="true">
                  <div className="i2w-meter-fill" style={{ width: `${beat.tensionScore}%` }} />
                </div>
                <div className="i2w-step-top i2w-num">
                  <span>{t("긴장도", "Tension")}</span>
                  <span>{beat.tensionScore}/100</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Stage 2: 캐릭터 DNA 락 */}
        <CharacterDnaSection characters={activePlan.characters} locale={locale} />

        {/* Stage 4: 장기 연재 연속성·모순 감사 + 원클릭 자동 교정 */}
        <section className="i2w-section" aria-labelledby="i2w-audit-heading" data-testid="i2w-continuity-audit-section">
          <div className="i2w-section-head">
            <h3 id="i2w-audit-heading" className="i2w-section-title">
              {activePlan.continuityAudit.passed ? (
                <ShieldCheck size={16} aria-hidden="true" />
              ) : (
                <AlertTriangle size={16} aria-hidden="true" />
              )}
              <span>{t("4단계 · 장기 연재 연속성·모순 감사기", "Stage 4 · Long-Term Continuity & Contradiction Auditor")}</span>
            </h3>

            <div className="i2w-audit-actions">
              <button
                type="button"
                className="i2w-btn i2w-btn--warn"
                onClick={handleSimulateFaults}
                data-testid="i2w-simulate-faults-btn"
              >
                <ShieldAlert size={15} aria-hidden="true" />
                <span>{t("모순 5종 시뮬레이션", "Simulate 5 Faults")}</span>
              </button>
              <button
                type="button"
                className="i2w-btn i2w-btn--good"
                disabled={activePlan.continuityAudit.passed}
                onClick={handleAutoRepair}
                data-testid="i2w-auto-repair-btn"
              >
                <Wrench size={15} aria-hidden="true" />
                <span>{t("원클릭 자동 교정", "One-Click Auto-Repair")}</span>
              </button>
            </div>
          </div>

          <div className="i2w-header-meta" data-testid="i2w-audit-summary-badges">
            <span
              className={`i2w-pill i2w-num ${activePlan.continuityAudit.passed ? "i2w-pill--good" : "i2w-pill--bad"}`}
              data-testid="i2w-audit-finding-count"
            >
              {t(
                `검출 모순 ${activePlan.continuityAudit.findings.length}건`,
                `${activePlan.continuityAudit.findings.length} Findings`,
              )}
            </span>
            <span className="i2w-pill i2w-num">
              {t(`연속성 점수 ${activePlan.continuityAudit.score}/100`, `Score ${activePlan.continuityAudit.score}/100`)}
            </span>
            {activePlan.repairCount > 0 && (
              <span className="i2w-pill i2w-pill--good i2w-num" data-testid="i2w-repair-count-badge">
                {t(`자동 교정 ${activePlan.repairCount}회 완료`, `Auto-Repaired ×${activePlan.repairCount}`)}
              </span>
            )}
          </div>

          {activePlan.continuityAudit.findings.length === 0 ? (
            <div className="i2w-status-banner" data-testid="i2w-audit-clean-state">
              {t(
                "의상 DNA 락, 시간대 순행, 말풍선 밀도(<=3개·<=48자), 엔딩 클리프행어, 카메라 샷 다양성 5대 규칙을 모두 통과했습니다.",
                "Passed all 5 long-term continuity rules: outfit DNA lock, chronological flow, bubble density (<=3 / <=48 chars), ending cliffhanger, and shot variety.",
              )}
            </div>
          ) : (
            <ul className="i2w-finding-list" data-testid="i2w-audit-findings-list">
              {activePlan.continuityAudit.findings.map((finding) => (
                <li
                  key={finding.findingId}
                  className={`i2w-finding-item ${
                    finding.severity === "error"
                      ? "i2w-finding-item--error"
                      : "i2w-finding-item--warning"
                  }`}
                >
                  <div className="i2w-panel-meta">
                    <span
                      className={`i2w-pill ${finding.severity === "error" ? "i2w-pill--bad" : "i2w-pill--warn"}`}
                    >
                      {CONTINUITY_RULE_LABELS[finding.ruleId][locale]}
                    </span>
                    <span className="i2w-pill i2w-num">
                      {t(
                        `대상 컷: ${finding.panelIndices.join(", ")}`,
                        `Panels: ${finding.panelIndices.join(", ")}`,
                      )}
                    </span>
                  </div>
                  <div className="i2w-step-title">{finding.message[locale]}</div>
                  <div className="i2w-finding-fix">
                    <strong>{t("자동 교정 계획", "Auto-Repair Plan")}:</strong> {finding.autoFixPreview[locale]}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Stage 3: 세로 스크롤 컷 연출 미리보기 */}
        <ScrollPanelDirectionSection
          panels={activePlan.panels}
          totalStripHeightPx={activePlan.totalStripHeightPx}
          locale={locale}
        />

        {/* Stage 5: 감정 곡선 연동 적응형 OST SVG 그래프 */}
        <AdaptiveOstCurveSection
          panels={activePlan.panels}
          ostCues={activePlan.ostCues}
          locale={locale}
        />

        {/* Stage 6: ToonStudio 프로젝트 블루프린트 JSON 내보내기 */}
        <section className="i2w-section" aria-labelledby="i2w-export-heading" data-testid="i2w-blueprint-export-section">
          <div className="i2w-section-head">
            <h3 id="i2w-export-heading" className="i2w-section-title">
              <FileJson size={16} aria-hidden="true" />
              <span>{t("6단계 · ToonStudio 프로젝트 블루프린트 JSON 내보내기", "Stage 6 · Export ToonStudio Project Blueprint JSON")}</span>
            </h3>
            <span className="i2w-pill i2w-pill--cool">
              {activePlan.studioBlueprint.schemaVersion}
            </span>
          </div>

          <div className="i2w-header-meta i2w-num">
            <span className="i2w-pill">
              {t(
                `캔버스 ${activePlan.studioBlueprint.canvas.widthPx}×${activePlan.studioBlueprint.canvas.totalHeightPx.toLocaleString("ko-KR")}px`,
                `Canvas ${activePlan.studioBlueprint.canvas.widthPx}×${activePlan.studioBlueprint.canvas.totalHeightPx.toLocaleString("en-US")}px`,
              )}
            </span>
            <span className="i2w-pill">
              {t(
                `표준 레이어 ${activePlan.studioBlueprint.layers.length}개`,
                `${activePlan.studioBlueprint.layers.length} Studio Layers`,
              )}
            </span>
            <span className="i2w-pill">
              {t(
                `에피소드 컷 ${activePlan.studioBlueprint.panels.length}개`,
                `${activePlan.studioBlueprint.panels.length} Compiled Panels`,
              )}
            </span>
          </div>

          <div className="i2w-audit-actions">
            <button
              type="button"
              className="i2w-btn i2w-btn--primary"
              onClick={handleCopyBlueprintJson}
              data-testid="i2w-export-json-btn"
            >
              <ClipboardCopy size={15} aria-hidden="true" />
              <span>{t("ToonStudio 프로젝트 JSON 내보내기", "Export ToonStudio Project JSON")}</span>
            </button>
            <button
              type="button"
              className="i2w-btn"
              onClick={handleDownloadBlueprintJson}
              data-testid="i2w-download-json-btn"
            >
              <Download size={15} aria-hidden="true" />
              <span>{t("JSON 파일 다운로드", "Download JSON File")}</span>
            </button>
            <button
              type="button"
              className="i2w-btn"
              aria-expanded={showJsonPreview}
              onClick={() => setShowJsonPreview((prev) => !prev)}
              data-testid="i2w-toggle-json-preview-btn"
            >
              <Code2 size={15} aria-hidden="true" />
              <span>
                {showJsonPreview
                  ? t("JSON 미리보기 닫기", "Hide JSON Preview")
                  : t("JSON 미리보기 열기", "Show JSON Preview")}
              </span>
            </button>
          </div>

          {showJsonPreview && (
            <pre className="i2w-json-pre" data-testid="i2w-json-preview">
              {blueprintJson}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}

export default IdeaToWebtoonPipelinePanel;
