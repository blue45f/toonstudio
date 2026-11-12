import {
  Lightbulb,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { FormStepSection } from "@/shared/components/layout/FormStepSection";
import { PurposeHeader } from "@/shared/components/layout/PurposeHeader";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import {
  DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  createStudioWebtoonOnboardingProfile,
  webtoonOnboardingProjectHref,
  webtoonOnboardingSelectionFromSearchParams,
  writeStudioWebtoonOnboardingProfile,
  type WebtoonOnboardingSelection,
} from "@/shared/lib/webtoon-production-onboarding";

import {
  STUDIO_AUXILIARY_WORKSPACE_OPTIONS,
  STUDIO_PROJECT_COLLABORATION_OPTIONS,
  STUDIO_PROJECT_PURPOSE_OPTIONS,
  studioProjectDefinitionFromSelection,
  studioProjectFormatDocumentTitle,
  studioProjectFormatProfile,
  studioProjectFormatTemplate,
  type StudioAuxiliaryWorkspaceOption,
  type StudioProjectFormatProfile,
} from "../studio-project-format-catalog";
import type {
  StudioProjectCollaboration, StudioProjectKind,
  StudioProjectFormat,
  StudioProjectPurpose,
  StudioProjectStartPoint,
} from "../studio-project-definition";
import {
  resolveStudioCreateLane,
  studioCreateExplicitLane,
  studioCreateLanding,
  studioCreateLaneForStartPoint,
  studioCreateLaneSpec,
  type StudioCreateLane,
} from "../studio-create-lane";
import { buildStudioModeLaunchHref, resolveStudioModeCreationPlan } from "../studio-mode-creation-plan";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";
import { STUDIO_PROJECT_CREATE_TEMPLATES } from "../save-first/studio-project-create-options";
import { ensureStudioSaveProfile } from "../save-first/studio-save-profile";
import {
  CANVAS_DIMENSION_MAX,
  CANVAS_DIMENSION_MIN,
  CANVAS_HEIGHT_INPUT_ID,
  CANVAS_WIDTH_INPUT_ID,
  COLLABORATION_ICONS,
  PROJECT_TITLE_INPUT_ID,
  hrefWithFormat,
  normalizedRequestedTemplate,
  onboardingStartPointFromProject,
  parseCanvasDimension,
  projectCollaborationFromOnboarding,
  projectPurposeFromOnboarding,
  projectStartPointFromOnboarding,
  requestedAuxiliary,
  requestedFormat,
  requestedStartPoint,
  standaloneDocumentTitle,
  type AuxiliaryKind,
} from "./studio-mode-project-create-helpers";
import { StudioCanvasSafeZoneSimulator } from "./guided-flow/StudioCanvasSafeZoneSimulator";
import { findGuidedGenreStarter } from "./guided-flow/studio-guided-flow-catalog";
import { StudioCreateProductionPlanSection } from "./guided-flow/StudioCreateProductionPlanSection";
import { StudioCreateKeyboardForm } from "./StudioCreateKeyboardForm";
import { StudioCreateLaunchSummary, StudioCreateReturnToStart } from "./StudioCreateLaunchSummary";
import { StudioCreateQuickPresetStrip, type StudioCreateQuickPreset } from "./StudioCreateQuickPresetStrip";
import { StudioCreateReviewDetails } from "./StudioCreateReviewDetails";
import { StudioJourneyStepBar } from "./StudioJourneyStepBar";
import { StudioCreateFormatStep, StudioCreateStartStep } from "./StudioCreateChoiceSteps";
import { StudioCreateStepActions, StudioCreateStepNavigation, StudioCreateStepPanel, StudioCreateStepScope } from "./StudioCreateStepFlow";
import { useStudioCreateStepFlow } from "./useStudioCreateStepFlow";
import { STUDIO_PROJECT_TITLE_MAX_LENGTH, normalizeStudioProjectTitleDraft } from "./studio-project-title";
import "./studio-illustrated-project-surfaces.css";
import "./studio-create-focused-flow.css";
import "./studio-create-step-flow.css";

export function StudioModeProjectCreatePage() {
  const bt = useBilingual("StudioModeProjectCreatePage");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locale = useI18n((state) => state.lang) === "ko" ? "ko" : "en";
  const initialPreset = findGuidedGenreStarter(searchParams.get("preset"));
  const requestedTemplateId = searchParams.get("template") ?? initialPreset?.templateId ?? null;
  const requestedSelection = webtoonOnboardingSelectionFromSearchParams(searchParams);
  const initialFormatId = requestedFormat(searchParams.get("format"), searchParams.get("kind"), requestedTemplateId);
  const initialFormat = studioProjectFormatProfile(initialFormatId);
  const initialAuxiliary = requestedAuxiliary(searchParams.get("format"), searchParams.get("kind"), requestedTemplateId);
  const normalizedTemplateId = normalizedRequestedTemplate(initialFormatId, requestedTemplateId);
  const initialMainTemplate = studioProjectFormatTemplate(initialFormat, normalizedTemplateId);
  const initialAuxiliaryTemplate = initialAuxiliary
    ? STUDIO_PROJECT_CREATE_TEMPLATES[initialAuxiliary.id].find((candidate) => candidate.id === requestedTemplateId)?.id ?? initialAuxiliary.templateId
    : null;

  const [formatId, setFormatId] = useState<StudioProjectFormat>(initialFormatId);
  const [auxiliaryKind, setAuxiliaryKind] = useState<AuxiliaryKind | null>(initialAuxiliary?.id ?? null);
  const [templateId, setTemplateId] = useState(initialAuxiliaryTemplate ?? initialMainTemplate.id);
  const requestedTitle = normalizeStudioProjectTitleDraft(searchParams.get("title"));
  const [title, setTitle] = useState(() => requestedTitle ?? (initialAuxiliary ? bt(initialAuxiliary.defaultTitleKo, initialAuxiliary.defaultTitleEn) : bt(initialFormat.defaultTitleKo, initialFormat.defaultTitleEn)));
  const [titleEdited, setTitleEdited] = useState(requestedTitle !== null);
  const requestedStart = requestedStartPoint(searchParams.get("start"));
  const entryLane = resolveStudioCreateLane(searchParams);
  const explicitEntryLane = studioCreateExplicitLane(searchParams);
  const [lane, setLane] = useState<StudioCreateLane | null>(entryLane);
  // 작품 홈에서 직접 적어 온 한 줄 아이디어만 표시하고, 장르 프리셋의 샘플 가제는 제외한다.
  const importedIdea = !initialPreset && requestedStart === "idea" ? requestedTitle : null;
  const [startPoint, setStartPoint] = useState<StudioProjectStartPoint>(
    requestedStart
      ?? (entryLane ? studioCreateLaneSpec(entryLane).startPoint : null)
      ?? projectStartPointFromOnboarding(requestedSelection?.startingPoint),
  );
  const [purpose, setPurpose] = useState<StudioProjectPurpose>(
    projectPurposeFromOnboarding(requestedSelection?.goal),
  );
  const [collaboration, setCollaboration] = useState<StudioProjectCollaboration>(
    projectCollaborationFromOnboarding(requestedSelection?.teamModel),
  );
  // 관문이 명시한 레인은 착지를 레인이 결정하므로, 제작 계획을 자동으로 켜서 착지를 가로채지 않는다.
  // 사용자가 토글로 직접 켜면 그때부터 제작 계획 착지를 따른다. 온보딩 흐름(?onboarding=production)은
  // 레인을 명시하지 않으므로 기존 자동 활성화를 유지한다.
  const [onboardingEnabled, setOnboardingEnabled] = useState(
    Boolean(requestedSelection)
      && (explicitEntryLane === null || searchParams.get("onboarding") === "production"),
  );
  const [selection, setSelection] = useState<WebtoonOnboardingSelection>(
    requestedSelection ?? DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  );
  // 템플릿이 정한 초기 크기를 숫자로 덮어쓴 값. null이면 템플릿 크기를 그대로 쓴다.
  const [sizeOverride, setSizeOverride] = useState<{ width: string; height: string } | null>(null);
  const [activeQuickPresetId, setActiveQuickPresetId] = useState<string | null>(
    () => initialPreset?.quickPresetId ?? null,
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advancedSettingsRef = useRef<HTMLDetailsElement>(null);
  const stepFlow = useStudioCreateStepFlow(initialPreset || explicitEntryLane || requestedTemplateId ? 2 : 1);

  const format = studioProjectFormatProfile(formatId);
  const auxiliary = STUDIO_AUXILIARY_WORKSPACE_OPTIONS.find((option) => option.id === auxiliaryKind) ?? null;
  const activeKind: StudioProjectKind = auxiliary?.id ?? format.projectKind;
  const mainTemplate = studioProjectFormatTemplate(format, templateId);
  const auxiliaryTemplates = auxiliary ? STUDIO_PROJECT_CREATE_TEMPLATES[auxiliary.id] : [];
  const selectedAuxiliaryTemplate = auxiliaryTemplates.find((candidate) => candidate.id === templateId)
    ?? auxiliaryTemplates[0];
  const selectedTemplateId = auxiliary
    ? selectedAuxiliaryTemplate?.id ?? auxiliary.templateId
    : mainTemplate.id;
  const selectedPageCount = auxiliary ? 1 : mainTemplate.pageCount;
  const modePlan = resolveStudioModeCreationPlan(activeKind, selectedTemplateId);
  const customWidth = sizeOverride ? parseCanvasDimension(sizeOverride.width) : null;
  const customHeight = sizeOverride ? parseCanvasDimension(sizeOverride.height) : null;
  const sizeReady = !sizeOverride || (customWidth !== null && customHeight !== null);
  const documentWidth = customWidth ?? modePlan.document.width;
  const documentHeight = customHeight ?? modePlan.document.height;
  const supportsProductionPlan = !auxiliary && format.projectKind === "webtoon";
  const structuredWebtoon = supportsProductionPlan && onboardingEnabled;
  const effectiveStartPoint = structuredWebtoon
    ? projectStartPointFromOnboarding(selection.startingPoint)
    : startPoint;
  const titleReady = title.trim().length > 0;
  const targetTitle = auxiliary
    ? bt(auxiliary.titleKo, auxiliary.titleEn)
    : bt(format.titleKo, format.titleEn);
  const startLabel = structuredWebtoon
    ? bt("프로젝트와 제작 계획 만들기", "Create project and production plan")
    : effectiveStartPoint === "files" && !auxiliary
      ? bt("프로젝트 만들고 파일 가져오기", "Create project and import files")
      : bt(`${targetTitle} 시작`, `Start ${targetTitle}`);

  const nextStepLabel = structuredWebtoon ? bt("다음: 제작 계획에 맞춘 작업 화면", "Next: your planned workspace")
    : !auxiliary && effectiveStartPoint === "files" ? bt("다음: 파일 가져오기", "Next: import files")
      : !auxiliary && studioCreateLanding(lane) === "editor" ? bt("다음: 편집기", "Next: editor")
        : !auxiliary && effectiveStartPoint === "idea" ? bt("다음: 이야기 기획", "Next: story planning")
          : !auxiliary && effectiveStartPoint === "script" ? bt("다음: 대본 작성", "Next: script writing")
            : bt("다음: 편집기", "Next: editor");
  function focusCanvasSize() {
    if (advancedSettingsRef.current) advancedSettingsRef.current.open = true;
    stepFlow.goTo(2, customWidth === null ? CANVAS_WIDTH_INPUT_ID : CANVAS_HEIGHT_INPUT_ID);
  }

  function syncStartPointSelection(next: StudioProjectStartPoint, supportsPlan = supportsProductionPlan) {
    setStartPoint(next);
    // 재료를 직접 바꾸면 첫 단계가 바뀐 것이므로 레인(과 그 착지)도 따라간다.
    // files는 가져오기 착지가 따로 있어 레인을 유지한다.
    const nextLane = studioCreateLaneForStartPoint(next);
    if (nextLane !== null) setLane(nextLane);
    if (supportsPlan) {
      setSelection((current) => ({
        ...current,
        startingPoint: onboardingStartPointFromProject(next),
      }));
    }
  }

  function chooseFormat(profile: StudioProjectFormatProfile) {
    setActiveQuickPresetId(null);
    setAuxiliaryKind(null);
    setFormatId(profile.id);
    setTemplateId(profile.templates[0]!.id);
    setSizeOverride(null);
    if (!titleEdited) setTitle(bt(profile.defaultTitleKo, profile.defaultTitleEn));
    if (profile.projectKind !== "webtoon") setOnboardingEnabled(false);
    setError(null);
  }

  function applyQuickPreset(preset: StudioCreateQuickPreset) {
    const nextProfile = studioProjectFormatProfile(preset.formatId);
    setActiveQuickPresetId(preset.quickPresetId);
    setAuxiliaryKind(null);
    setFormatId(nextProfile.id);
    setTemplateId(preset.templateId ?? nextProfile.templates[0]!.id);
    setSizeOverride(null);
    setTitle(bt(preset.sampleTitleKo, preset.sampleTitleEn));
    setTitleEdited(true);
    syncStartPointSelection(preset.startPoint, nextProfile.projectKind === "webtoon");
    if (nextProfile.projectKind !== "webtoon") setOnboardingEnabled(false);
    setError(null);
  }

  function chooseAuxiliary(option: StudioAuxiliaryWorkspaceOption) {
    setActiveQuickPresetId(null);
    setAuxiliaryKind(option.id);
    setTemplateId(option.templateId);
    setSizeOverride(null);
    if (!titleEdited) setTitle(bt(option.defaultTitleKo, option.defaultTitleEn));
    setOnboardingEnabled(false);
    setError(null);
  }

  function chooseStartPoint(next: StudioProjectStartPoint) {
    setActiveQuickPresetId(null);
    syncStartPointSelection(next);
  }

  function create(): boolean {
    const normalizedTitle = title.trim();
    if (creating || !normalizedTitle || !sizeReady) return false;
    setCreating(true);
    setError(null);
    try {
      const definition = auxiliary
        ? null
        : studioProjectDefinitionFromSelection(
          format,
          purpose,
          effectiveStartPoint,
          collaboration,
        );
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title: normalizedTitle,
        kind: activeKind,
        templateId: selectedTemplateId,
        primaryLocale: locale,
        definition,
        document: {
          title: auxiliary
            ? standaloneDocumentTitle(activeKind, normalizedTitle, locale)
            : studioProjectFormatDocumentTitle(format.id, normalizedTitle, locale),
          kind: modePlan.document.kind,
          defaultWorkspace: modePlan.document.workspace,
          width: documentWidth,
          height: documentHeight,
          pageCount: selectedPageCount,
        },
      }, window);
      ensureStudioSaveProfile(window.localStorage, result.project.id, {
        provider: "browser",
        autoSave: true,
        createVersions: true,
        target: window,
      });

      if (structuredWebtoon) {
        writeStudioWebtoonOnboardingProfile(
          window.localStorage,
          createStudioWebtoonOnboardingProfile(result.project.id, selection, result.project.createdAt),
        );
        navigate(webtoonOnboardingProjectHref(result.project.id, selection), { replace: true });
        return true;
      }
      if (!auxiliary && effectiveStartPoint === "files") {
        navigate(`/studio/import?projectId=${encodeURIComponent(result.project.id)}&format=${format.id}`, {
          replace: true,
        });
        return true;
      }
      // 레인 착지 (S2-7): 콘티·빈 캔버스·템플릿 레인은 재료 기본값(idea)이 아니라
      // 에디터로 착지한다. 이야기 레인과 레인 없는 진입은 아래 기존 착지(기획)를 따른다.
      if (!auxiliary && studioCreateLanding(lane) === "editor") {
        const launchHref = buildStudioModeLaunchHref(result, modePlan);
        navigate(hrefWithFormat(launchHref, format.id), { replace: true });
        return true;
      }
      if (!auxiliary && effectiveStartPoint === "idea") {
        navigate(`/studio/p/${encodeURIComponent(result.project.id)}/story`, { replace: true });
        return true;
      }
      if (!auxiliary && effectiveStartPoint === "script") {
        navigate(`/studio/p/${encodeURIComponent(result.project.id)}/story?view=script`, { replace: true });
        return true;
      }
      const launchHref = buildStudioModeLaunchHref(result, modePlan);
      navigate(auxiliary ? launchHref : hrefWithFormat(launchHref, format.id), { replace: true });
      return true;
    } catch (cause) {
      setCreating(false);
      setError(cause instanceof Error
        ? cause.message
        : bt("새 작업을 만들지 못했습니다.", "The new work could not be created."));
      return false;
    }
  }

  function focusName() { stepFlow.goTo(2, PROJECT_TITLE_INPUT_ID); }
  function returnToReview() { stepFlow.goTo(3, titleReady && sizeReady ? "studio-create-primary-action" : "studio-create-launch-summary"); }
  function submitStep(): boolean {
    if (stepFlow.step < 3) { stepFlow.goTo(stepFlow.step === 1 ? 2 : 3); return false; }
    return create();
  }

  return (
    <StudioCreateStepScope onReturn={returnToReview}>
    <div
      data-page-template="form"
      data-route-ready="studio-new"
      data-studio-illustrated-surface="new"
      data-studio-mode-create="true"
      data-studio-outcome-create="true"
      data-studio-create-lane={lane ?? "none"}
      className="min-h-[calc(100vh-4rem)] bg-bg"
    >
      <Container size="wide" className="py-4 sm:py-7">
        <StudioCreateKeyboardForm label={bt("새 프로젝트 설정", "New project settings")}
          titleReady={titleReady} sizeReady={sizeReady} creating={creating}
          onCreate={submitStep} onFixName={focusName} onFixSize={focusCanvasSize}>
          {(onInputKeyDown) => <>
          {/* 기본 선택 뒤에 주 행동 하나를 두고 추가 설정·미리보기는 뒤로 분리한다. */}
          <PurposeHeader
            className="studio-create-purpose-header"
            title={stepFlow.step === 1 ? bt("새 작품 만들기", "Create a new work")
              : stepFlow.step === 2 ? bt("이름과 기본 크기", "Name and starting size")
                : bt("시작할 준비가 됐나요?", "Ready to start?")}
            secondaryActions={(
              <Link href="/studio/import" className={buttonClass({ variant: "outline", className: "min-h-12" })}>
                <Upload size={16} aria-hidden="true" />
                {bt("파일 불러오기", "Import a file")}
              </Link>
            )}
          />
          <StudioCreateStepNavigation step={stepFlow.step} onStep={stepFlow.goTo} />

          {importedIdea ? (
            <p
              data-studio-imported-idea="true"
              className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-accent/40 bg-accent-soft/35 px-4 py-3 text-sm text-fg"
            >
              <Lightbulb size={16} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="font-black text-accent">{bt("가져온 아이디어", "Imported idea")}</span>
              <span className="min-w-0 break-words font-bold [word-break:keep-all]">{importedIdea}</span>
              <button
                type="button"
                onClick={focusName}
                className="ml-auto inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {bt("프로젝트 이름으로 채웠어요 · 확인하기", "Used as the project name · Review")}
              </button>
            </p>
          ) : null}

          <StudioCreateStepPanel step={1} current={stepFlow.step}>
            <StudioCreateFormatStep format={format} auxiliary={auxiliary} locale={locale} onFormat={chooseFormat} onAuxiliary={chooseAuxiliary}
              primaryAction={<StudioCreateStepActions step={1} onStep={stepFlow.goTo} />} />
            <details className="studio-create-genre-options" data-studio-create-genres="true" open={Boolean(activeQuickPresetId) || undefined}>
              <summary>{bt("장르 예시로 시작하기", "Start from a genre example")}</summary>
          <StudioCreateQuickPresetStrip
            activePresetId={activeQuickPresetId}
            onSelectPreset={applyQuickPreset}
            onQuickStart={titleReady && sizeReady ? returnToReview : undefined}
            quickStartLabel={bt("시작 전 확인", "Review before starting")}
            quickStartSummary={`${title.trim() || targetTitle} · ${documentWidth} × ${documentHeight}px · ${nextStepLabel}`}
            creating={creating}
          />
            </details>
          </StudioCreateStepPanel>
          <StudioCreateStepPanel step={2} current={stepFlow.step}>
          <FormStepSection
            step={2}
            titleId="studio-project-details-title"
            title={bt("이름과 기본 크기를 확인하세요", "Check the name and starting size")}
            description={bt("별도 규격이 없다면 미리 채워진 값으로 시작하세요.", "Use the prefilled values unless your project needs a different specification.")}
          >
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-fg-2" htmlFor={PROJECT_TITLE_INPUT_ID}>
                  {bt("프로젝트 이름", "Project name")}
                  <input
                    id={PROJECT_TITLE_INPUT_ID}
                    onKeyDown={onInputKeyDown}
                    enterKeyHint="go"
                    aria-invalid={!titleReady || undefined}
                    aria-describedby={!titleReady ? "studio-create-name-step-reason" : undefined}
                    value={title}
                    maxLength={STUDIO_PROJECT_TITLE_MAX_LENGTH}
                    onChange={(event) => {
                      setActiveQuickPresetId(null);
                      setTitle(event.target.value);
                      setTitleEdited(true);
                    }}
                    className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
                  />
                </label>
                {!titleReady ? <p id="studio-create-name-step-reason" role="alert" className="mt-2 text-sm text-danger">{bt("프로젝트 이름을 입력해 주세요.", "Enter a project name.")}</p> : null}
                <details className="studio-create-genre-options" aria-label={bt("임시 제목 예시", "Working title examples")}>
                  <summary>{bt("이름 예시 보기", "See name examples")}</summary>
                <div className="flex flex-wrap items-center gap-1.5 p-2">
                  <span className="text-[0.68rem] text-fg-3">{bt("임시 제목:", "Quick title:")}</span>
                  {([
                    ["1화 초안", "Episode 1 Draft"],
                    ["비 오는 날의 만남", "Rainy Day Encounter"],
                    ["일상 4컷 기록", "4-Panel Daily Note"],
                  ] as const).map(([koTitle, enTitle]) => {
                    const sample = bt(koTitle, enTitle);
                    return (
                      <button
                        key={koTitle}
                        type="button"
                        onClick={() => {
                          setActiveQuickPresetId(null);
                          setTitle(sample);
                          setTitleEdited(true);
                        }}
                        className="min-h-12 rounded-full border border-line bg-panel/70 px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        {sample}
                      </button>
                    );
                  })}
                </div>
                </details>
              </div>
              <label className="block text-xs font-bold text-fg-2" htmlFor="studio-mode-template">
                {bt("형식·초기 크기", "Format and initial size")}
                <select
                  id="studio-mode-template"
                  aria-label={bt("시작 템플릿", "Starting template")}
                  value={selectedTemplateId}
                  onChange={(event) => {
                    setActiveQuickPresetId(null);
                    setTemplateId(event.target.value);
                    setSizeOverride(null);
                  }}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
                >
                  {(auxiliary ? auxiliaryTemplates : format.templates).map((option) => (
                    <option key={option.id} value={option.id}>
                      {bt(option.labelKo, option.labelEn)}
                    </option>
                  ))}
                </select>
                {!auxiliary ? (
                  <span className="mt-1.5 block text-[0.68rem] leading-5 text-fg-2">
                    {bt(mainTemplate.detailKo, mainTemplate.detailEn)}
                  </span>
                ) : null}
              </label>
            </div>
            <details className="studio-create-genre-options">
              <summary>{bt("원고 크기 미리보기", "Preview the canvas size")}</summary>
            <StudioCanvasSafeZoneSimulator
              width={documentWidth}
              height={documentHeight}
              formatId={auxiliary ? undefined : format.id}
              pageCount={selectedPageCount}
            />
            </details>
          </FormStepSection>
          <details ref={advancedSettingsRef} className="mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5" data-studio-create-advanced="true">
            <summary className="min-h-12 cursor-pointer content-center rounded-xl text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {bt("크기·제작 목적·협업 설정 (선택)", "Size, purpose and collaboration (optional)")}
              <span className="mt-1 block text-xs font-normal leading-5 text-fg-2">{bt("직접 정할 필요가 있을 때만 바꾸세요. 접어도 선택한 값은 유지됩니다.", "Change these only when needed. Collapsing this section keeps your choices.")}</span>
            </summary>
            {!sizeReady ? <p id="studio-create-size-step-reason" role="alert" className="mt-3 text-sm text-danger">{bt("너비와 높이는 1부터 1,000,000 사이의 정수로 입력해 주세요.", "Enter width and height as whole numbers between 1 and 1,000,000.")}</p> : null}
            <fieldset className="mt-4" data-studio-create-custom-size="true">
              <legend className="text-xs font-bold text-fg-2">
                {bt("캔버스 크기 직접 입력", "Enter canvas size directly")}
              </legend>
              <div className="mt-2 flex flex-wrap items-end gap-3" data-studio-create-dimensions="true">
                <label className="block text-xs font-bold text-fg-2" htmlFor={CANVAS_WIDTH_INPUT_ID}>
                  {bt("너비(px)", "Width (px)")}
                  <input
                    id={CANVAS_WIDTH_INPUT_ID}
                    onKeyDown={onInputKeyDown}
                    type="number"
                    inputMode="numeric"
                    min={CANVAS_DIMENSION_MIN}
                    max={CANVAS_DIMENSION_MAX}
                    step={1}
                    value={sizeOverride?.width ?? String(modePlan.document.width)}
                    aria-invalid={sizeOverride !== null && customWidth === null ? true : undefined}
                    aria-describedby={sizeOverride !== null && customWidth === null ? "studio-create-size-step-reason" : undefined}
                    onChange={(event) => {
                      setActiveQuickPresetId(null);
                      setSizeOverride({
                        width: event.target.value,
                        height: sizeOverride?.height ?? String(modePlan.document.height),
                      });
                    }}
                    className="mt-2 min-h-11 w-36 rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
                  />
                </label>
                <span aria-hidden="true" className="pb-3 text-sm font-black text-fg-2">×</span>
                <label className="block text-xs font-bold text-fg-2" htmlFor={CANVAS_HEIGHT_INPUT_ID}>
                  {bt("높이(px)", "Height (px)")}
                  <input
                    id={CANVAS_HEIGHT_INPUT_ID}
                    onKeyDown={onInputKeyDown}
                    type="number"
                    inputMode="numeric"
                    min={CANVAS_DIMENSION_MIN}
                    max={CANVAS_DIMENSION_MAX}
                    step={1}
                    value={sizeOverride?.height ?? String(modePlan.document.height)}
                    aria-invalid={sizeOverride !== null && customHeight === null ? true : undefined}
                    aria-describedby={sizeOverride !== null && customHeight === null ? "studio-create-size-step-reason" : undefined}
                    onChange={(event) => {
                      setActiveQuickPresetId(null);
                      setSizeOverride({
                        width: sizeOverride?.width ?? String(modePlan.document.width),
                        height: event.target.value,
                      });
                    }}
                    className="mt-2 min-h-11 w-36 rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
                  />
                </label>
                {sizeOverride ? (
                  <button
                    type="button"
                    onClick={() => setSizeOverride(null)}
                    className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    {bt("템플릿 크기로 되돌리기", "Reset to template size")}
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-[0.68rem] leading-5 text-fg-2">
                {sizeOverride
                  ? bt(
                    "템플릿 기본 크기와 다르게 직접 지정한 크기로 첫 문서를 만듭니다.",
                    "The first document will use your custom size instead of the template default.",
                  )
                  : bt(
                    "템플릿 기본 크기가 표시되어 있습니다. 자체 규격(출판·해외 플랫폼 등)이 있을 때만 숫자를 바꾸세요.",
                    "Template sizes are shown. Change the numbers only for a custom spec (print, overseas platforms).",
                  )}
              </p>
            </fieldset>

            {!auxiliary ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <fieldset>
                  <legend className="text-xs font-bold text-fg-2">{bt("제작 목적", "Production purpose")}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {STUDIO_PROJECT_PURPOSE_OPTIONS.map((option) => {
                      const active = purpose === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setPurpose(option.id)}
                          className={cn(
                            "rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                            active ? "border-accent bg-accent-soft/45" : "border-line bg-panel/45 hover:bg-raised",
                          )}
                        >
                          <strong className="block text-xs text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                          <span className="mt-1 block text-[0.68rem] leading-5 text-fg-2">
                            {bt(option.descriptionKo, option.descriptionEn)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-bold text-fg-2">{bt("작업 방식", "Collaboration")}</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {STUDIO_PROJECT_COLLABORATION_OPTIONS.map((option) => {
                      const Icon = COLLABORATION_ICONS[option.id];
                      const active = collaboration === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setCollaboration(option.id)}
                          className={cn(
                            "rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                            active ? "border-accent bg-accent-soft/45" : "border-line bg-panel/45 hover:bg-raised",
                          )}
                        >
                          <Icon size={16} className={active ? "text-accent" : "text-fg-2"} aria-hidden="true" />
                          <strong className="mt-2 block text-xs text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                          <span className="mt-1 line-clamp-2 block text-[0.68rem] leading-5 text-fg-2">
                            {bt(option.descriptionKo, option.descriptionEn)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-panel/60 px-3 py-2.5 text-xs leading-5 text-fg-2">
                {bt(
                  "단일 작업실은 작품 전체 구조 없이 해당 문서와 전문 도구만 준비합니다. 나중에 작품 프로젝트로 이어 만들 수 있습니다.",
                  "A standalone workspace prepares only its document and specialist tools. You can hand it off to a full project later.",
                )}
              </p>
            )}
            <StudioCreateReturnToStart />
          </details>
            <StudioCreateStepActions step={2} onStep={stepFlow.goTo} ready={titleReady && sizeReady} />
          </StudioCreateStepPanel>
          <StudioCreateStepPanel step={3} current={stepFlow.step}>
            <StudioCreateStepActions step={3} onStep={stepFlow.goTo} />
            {auxiliary ? (
              <FormStepSection step={3} titleId="studio-start-point-title"
                title={bt("열릴 작업실을 확인하세요", "Review your workspace")}
                description={bt("단일 작업실은 선택한 도구와 첫 문서를 준비해요.", "A standalone workspace prepares its tools and first document.")}>
                <p className="mt-3 text-base font-semibold text-fg">{targetTitle}</p>
              </FormStepSection>
            ) : <StudioCreateStartStep effectiveStartPoint={effectiveStartPoint} onStartPoint={chooseStartPoint} />}
          <StudioCreateLaunchSummary
            targetTitle={targetTitle} width={documentWidth} height={documentHeight}
            titleReady={titleReady} sizeReady={sizeReady} structuredWebtoon={structuredWebtoon}
            creating={creating} startLabel={startLabel} nextStepLabel={nextStepLabel} error={error}
            onFixName={focusName} onFixSize={focusCanvasSize}
          />
          <StudioCreateReviewDetails format={auxiliary ? null : format} workspace={modePlan.profile} locale={locale} pageCount={selectedPageCount} />

          {/* 명시적인 제작 계획 선택은 기존 토글·온보딩 상태를 유지한다. */}
          {supportsProductionPlan ? (
            <StudioCreateProductionPlanSection
              onboardingEnabled={onboardingEnabled}
              selection={selection}
              onToggleOnboarding={() => setOnboardingEnabled((value) => !value)}
              onChangeSelection={setSelection}
              onSyncStartPoint={chooseStartPoint}
              onSyncPurpose={setPurpose}
              onSyncCollaboration={setCollaboration}
            />
          ) : null}
          <details className="studio-create-genre-options">
            <summary>{bt("작품 제작 흐름 보기", "See the production journey")}</summary>
            <StudioJourneyStepBar currentStep="start" startHref="/create" allowCurrentStepLink />
          </details>
          </StudioCreateStepPanel>
          </>}
        </StudioCreateKeyboardForm>
      </Container>
    </div>
    </StudioCreateStepScope>
  );
}
