import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Clapperboard,
  MessageSquareQuote,
  Sparkles,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

import "./tooning-plus-allinone.css";
import {
  applyToneVariationToPlan,
  autoArrangeAllPlanCuts,
  buildStudio2dFountainScript,
  buildTeamDivisionHandoffPacket,
  buildTooning3dStageHandoff,
  createPlanFromSampleScenario,
  generateTooningEpisodePlan,
  getTooningGenre,
  serializeTooningPacketToJson,
  serializeTooningPacketToText,
  TOONING_SAMPLE_SCENARIOS,
  updatePlanCut,
  type TooningCharacterId,
  type TooningCutDirectionPatch,
  type TooningEpisodePlan,
  type TooningGenreId,
  type TooningLocale,
  type TooningProductionMode,
  type TooningToneId,
} from "./tooning-plus-allinone-engine";
import {
  TooningStep1StoryPanel,
  TooningStep2Studio3dPanel,
  TooningStep3SmartEditorPanel,
} from "./TooningPlusStepPanels";

export type TooningWizardStep = 1 | 2 | 3;

export interface TooningPlusAllInOneSectionProps {
  readonly locale: TooningLocale;
  readonly onSelectWorkspacePreset?: (workspaceId: StudioDefaultWorkspaceId) => void;
  readonly onTransferCutsToScript?: (fountainScript: string) => void;
}

const STEP_META: readonly {
  readonly step: TooningWizardStep;
  readonly badge: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly accentOklch: string;
}[] = Object.freeze([
  {
    step: 1,
    badge: "01",
    labelKo: "① 스토리 기획",
    labelEn: "1. Story Planner",
    hintKo: "장르 · 화자 · 기승전결 대본",
    hintEn: "Genre · Cast · Beat Script",
    accentOklch: "oklch(0.68 0.19 36)",
  },
  {
    step: 2,
    badge: "02",
    labelKo: "② 3D 포즈·표정 연출",
    labelEn: "2. 3D Pose & Mood",
    hintKo: "캐스트 · 포즈 · 표정 · 카메라",
    hintEn: "Cast · Pose · Face · Camera",
    accentOklch: "oklch(0.66 0.16 236)",
  },
  {
    step: 3,
    badge: "03",
    labelKo: "③ 스마트 말풍선·분업 완성",
    labelEn: "3. Bubbles & Handoff",
    hintKo: "자동 말풍선 · 효과음 · 6단계 분업",
    hintEn: "Auto Bubbles · SFX · 6 Stages",
    accentOklch: "oklch(0.68 0.16 156)",
  },
]);

export function TooningPlusAllInOneSection({
  locale,
  onSelectWorkspacePreset,
  onTransferCutsToScript,
}: TooningPlusAllInOneSectionProps) {
  const ko = locale === "ko";
  const [activeStep, setActiveStep] = useState<TooningWizardStep>(1);
  const [activeSampleId, setActiveSampleId] = useState<string>(TOONING_SAMPLE_SCENARIOS[0].id);
  const [plan, setPlan] = useState<TooningEpisodePlan>(() =>
    createPlanFromSampleScenario(TOONING_SAMPLE_SCENARIOS[0].id),
  );
  const [selectedCutNumber, setSelectedCutNumber] = useState<number>(1);
  const [productionMode, setProductionMode] = useState<TooningProductionMode>("team");
  const [completedChecklistIds, setCompletedChecklistIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(["story-1", "conti-1"]),
  );
  const [exportFormat, setExportFormat] = useState<"none" | "text" | "json">("none");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const stage3dHandoff = useMemo(() => buildTooning3dStageHandoff(plan), [plan]);

  const divisionPacket = useMemo(
    () => buildTeamDivisionHandoffPacket(plan, productionMode, completedChecklistIds),
    [plan, productionMode, completedChecklistIds],
  );

  const exportedPayload = useMemo(() => {
    if (exportFormat === "json") {
      return serializeTooningPacketToJson(divisionPacket);
    }
    if (exportFormat === "text") {
      return serializeTooningPacketToText(divisionPacket, locale);
    }
    return "";
  }, [divisionPacket, exportFormat, locale]);

  const handleLoadSample = (scenarioId: string) => {
    const scenario =
      TOONING_SAMPLE_SCENARIOS.find((item) => item.id === scenarioId) ?? TOONING_SAMPLE_SCENARIOS[0];
    setActiveSampleId(scenario.id);
    setPlan(createPlanFromSampleScenario(scenario.id));
    setSelectedCutNumber(1);
    setExportFormat("none");
    setStatusMessage(
      ko
        ? `'${scenario.labelKo}' 4컷 샘플을 불러왔습니다. 바로 연출과 말풍선을 확인해 보세요.`
        : `Loaded 4-cut sample "${scenario.labelEn}". Ready to direct and arrange bubbles.`,
    );
  };

  const handleChangeGenre = (genreId: TooningGenreId) => {
    const genre = getTooningGenre(genreId);
    const nextSpeakers = plan.speakers.map((slot, index) => ({
      slotIndex: slot.slotIndex,
      characterId: genre.defaultCastIds[index] ?? slot.characterId,
    }));
    setPlan(
      generateTooningEpisodePlan({
        keywordKo: plan.keywordKo,
        keywordEn: plan.keywordEn,
        genreId,
        toneId: plan.toneId,
        cutCount: plan.cutCount,
        speakers: nextSpeakers,
      }),
    );
  };

  const handleChangeTone = (toneId: TooningToneId) => {
    setPlan((prev) => applyToneVariationToPlan(prev, toneId));
  };

  const handleChangeKeyword = (nextKeyword: string) => {
    setPlan((prev) =>
      generateTooningEpisodePlan({
        keywordKo: ko ? nextKeyword : prev.keywordKo,
        keywordEn: ko ? prev.keywordEn : nextKeyword,
        genreId: prev.genreId,
        toneId: prev.toneId,
        cutCount: prev.cutCount,
        speakers: prev.speakers,
      }),
    );
  };

  const handleChangeCutCount = (cutCount: 4 | 6 | 8) => {
    setPlan((prev) =>
      generateTooningEpisodePlan({
        keywordKo: prev.keywordKo,
        keywordEn: prev.keywordEn,
        genreId: prev.genreId,
        toneId: prev.toneId,
        cutCount,
        speakers: prev.speakers,
      }),
    );
    setSelectedCutNumber((prev) => Math.min(prev, cutCount));
  };

  const handleChangeSpeaker = (slotIndex: number, characterId: TooningCharacterId) => {
    setPlan((prev) => {
      const nextSpeakers = prev.speakers.map((slot) =>
        slot.slotIndex === slotIndex ? { ...slot, characterId } : slot,
      );
      return generateTooningEpisodePlan({
        keywordKo: prev.keywordKo,
        keywordEn: prev.keywordEn,
        genreId: prev.genreId,
        toneId: prev.toneId,
        cutCount: prev.cutCount,
        speakers: nextSpeakers,
      });
    });
  };

  const handleToggleThirdSpeaker = () => {
    setPlan((prev) => {
      const genre = getTooningGenre(prev.genreId);
      const nextSpeakers =
        prev.speakers.length < 3
          ? [...prev.speakers, { slotIndex: 2, characterId: genre.defaultCastIds[2] }]
          : prev.speakers.slice(0, 2);
      return generateTooningEpisodePlan({
        keywordKo: prev.keywordKo,
        keywordEn: prev.keywordEn,
        genreId: prev.genreId,
        toneId: prev.toneId,
        cutCount: prev.cutCount,
        speakers: nextSpeakers,
      });
    });
  };

  const handleEditCutDialogue = (cutNumber: number, value: string) => {
    setPlan((prev) =>
      updatePlanCut(prev, cutNumber, {
        ...(ko ? { dialogueKo: value } : { dialogueEn: value }),
        customEdited: true,
      }),
    );
  };

  const handlePatchCut = (cutNumber: number, patch: TooningCutDirectionPatch) => {
    setPlan((prev) => updatePlanCut(prev, cutNumber, patch));
  };

  const handleAutoArrangeAll = () => {
    setPlan((prev) => autoArrangeAllPlanCuts(prev));
    setStatusMessage(
      ko
        ? "모든 컷의 말풍선과 효과음을 인물과 겹치지 않게 다시 배치했습니다."
        : "Re-arranged all speech bubbles and SFX stamps clear of every speaker.",
    );
  };

  const handleToggleChecklistItem = (itemId: string) => {
    setCompletedChecklistIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleDeliverTo2dStudio = () => {
    const fountain = buildStudio2dFountainScript(plan, locale);
    onTransferCutsToScript?.(fountain);
    onSelectWorkspacePreset?.("storyboard");
    setStatusMessage(
      ko
        ? `${plan.cuts.length}컷 구성을 2D 스튜디오 작업 보드로 전달했습니다.`
        : `Delivered ${plan.cuts.length} panels to the 2D Studio storyboard workspace.`,
    );
  };

  const handleCopyExport = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard && exportedPayload) {
      void navigator.clipboard.writeText(exportedPayload);
    }
    setStatusMessage(
      ko
        ? `${exportFormat === "json" ? "JSON 패킷" : "텍스트 분업표"}을 복사했습니다.`
        : `Copied ${exportFormat === "json" ? "JSON packet" : "text brief"} to clipboard.`,
    );
  };

  return (
    <section
      data-testid="tooning-plus-allinone-section"
      aria-label={ko ? "올인원 3단계 웹툰 제작실" : "All-in-One 3-Step Webtoon Studio"}
      className="tp-shell"
    >
      <header className="tp-hero">
        <div className="tp-hero-copy">
          <div className="tp-kicker">
            <Sparkles size={13} aria-hidden="true" />
            <span>{ko ? "초보자 3초 체험 · 올인원 제작실" : "3-Second Quick Start · All-in-One Studio"}</span>
          </div>
          <h3 className="tp-hero-title [word-break:keep-all]">
            {ko ? "올인원 3단계 웹툰 제작 워크벤치" : "All-in-One 3-Step Webtoon Workbench"}
          </h3>
          <p className="tp-hero-desc [word-break:keep-all]">
            {ko
              ? "스토리 기획부터 3D 포즈·표정 연출, 스마트 말풍선·효과음, 6단계 팀 분업까지 한 번에 완성합니다."
              : "Move smoothly from story planning to 3D pose direction, smart speech bubbles, SFX, and 6-stage team division."}
          </p>
        </div>

        <div className="tp-sample-block">
          <span className="tp-sample-label">
            {ko ? "3초 완성 샘플 바로 체험" : "Try a 4-Cut Sample"}
          </span>
          <div role="group" aria-label={ko ? "원클릭 샘플 시나리오" : "One-click sample scenarios"} className="tp-sample-strip">
            {TOONING_SAMPLE_SCENARIOS.map((scenario) => {
              const active = activeSampleId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  data-testid={`tooning-sample-${scenario.id}`}
                  aria-pressed={active}
                  onClick={() => handleLoadSample(scenario.id)}
                  className={active ? "tp-sample-chip tp-sample-chip--active min-h-11" : "tp-sample-chip min-h-11"}
                >
                  {ko ? scenario.labelKo : scenario.labelEn}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* 3-Step Studio Stepper */}
      <nav
        aria-label={ko ? "3단계 웹툰 제작 단계" : "3-step webtoon production steps"}
        className="tp-stepper"
      >
        {STEP_META.map((item) => {
          const active = activeStep === item.step;
          const Icon = item.step === 1 ? BookOpenText : item.step === 2 ? Clapperboard : MessageSquareQuote;
          return (
            <button
              key={item.step}
              type="button"
              data-testid={`tooning-step-btn-${item.step}`}
              aria-current={active ? "step" : undefined}
              aria-pressed={active}
              onClick={() => setActiveStep(item.step)}
              className={active ? "tp-step-btn tp-step-btn--active min-h-11" : "tp-step-btn min-h-11"}
              style={{ "--tp-step-accent": item.accentOklch } as CSSProperties}
            >
              <span className="tp-step-icon" aria-hidden="true">
                <Icon size={15} />
              </span>
              <span className="tp-step-text">
                <strong className="[word-break:keep-all]">{ko ? item.labelKo : item.labelEn}</strong>
                <span className="[word-break:keep-all]">{ko ? item.hintKo : item.hintEn}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Active Step Panel (1 step at a time for 390px mobile clarity) */}
      <div className="tp-step-viewport">
        {activeStep === 1 ? (
          <TooningStep1StoryPanel
            locale={locale}
            plan={plan}
            onChangeGenre={handleChangeGenre}
            onChangeTone={handleChangeTone}
            onChangeKeyword={handleChangeKeyword}
            onChangeCutCount={handleChangeCutCount}
            onChangeSpeaker={handleChangeSpeaker}
            onToggleThirdSpeaker={handleToggleThirdSpeaker}
            onEditCutDialogue={handleEditCutDialogue}
          />
        ) : null}

        {activeStep === 2 ? (
          <TooningStep2Studio3dPanel
            locale={locale}
            plan={plan}
            selectedCutNumber={selectedCutNumber}
            stage3dHandoff={stage3dHandoff}
            onSelectCut={setSelectedCutNumber}
            onPatchCut={handlePatchCut}
            onOpen3dWorkspace={
              onSelectWorkspacePreset ? () => onSelectWorkspacePreset("pose-3d") : undefined
            }
          />
        ) : null}

        {activeStep === 3 ? (
          <TooningStep3SmartEditorPanel
            locale={locale}
            plan={plan}
            productionMode={productionMode}
            divisionPacket={divisionPacket}
            exportFormat={exportFormat}
            exportedPayload={exportedPayload}
            onAutoArrangeAll={handleAutoArrangeAll}
            onPatchCut={handlePatchCut}
            onChangeProductionMode={setProductionMode}
            onToggleChecklistItem={handleToggleChecklistItem}
            onDeliverTo2dStudio={handleDeliverTo2dStudio}
            onOpenStageWorkspace={onSelectWorkspacePreset}
            onExportPacket={(format) => setExportFormat((prev) => (prev === format ? "none" : format))}
            onCopyExport={handleCopyExport}
          />
        ) : null}
      </div>

      {/* Step Footer Navigation & Live Status */}
      <footer className="tp-footer">
        <p aria-live="polite" data-testid="tooning-status-bar" className="tp-status-text [word-break:keep-all]">
          {statusMessage ||
            (ko
              ? `${plan.episodeTitleKo} · 현재 ${activeStep}/3단계`
              : `${plan.episodeTitleEn} · Step ${activeStep} of 3`)}
        </p>

        <div className="tp-footer-nav">
          <button
            type="button"
            data-testid="tooning-prev-step"
            disabled={activeStep === 1}
            onClick={() => setActiveStep((prev) => (prev > 1 ? ((prev - 1) as TooningWizardStep) : 1))}
            className="tp-mini-action min-h-11"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>{ko ? "이전 단계" : "Previous"}</span>
          </button>

          {activeStep < 3 ? (
            <button
              type="button"
              data-testid="tooning-next-step"
              onClick={() => setActiveStep((prev) => (prev < 3 ? ((prev + 1) as TooningWizardStep) : 3))}
              className="tp-primary-btn min-h-11"
            >
              <span>{ko ? "다음 단계로" : "Next Step"}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              data-testid="tooning-finish-to-studio"
              onClick={handleDeliverTo2dStudio}
              className="tp-primary-btn min-h-11"
            >
              <Sparkles size={14} aria-hidden="true" />
              <span>{ko ? "완성본 2D 스튜디오로 열기" : "Open Final Cuts in Studio"}</span>
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
