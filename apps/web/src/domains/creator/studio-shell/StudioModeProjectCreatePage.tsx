import {
  Lightbulb,
  Sparkles, Upload,
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
  STUDIO_PROJECT_FORMAT_PROFILES,
  STUDIO_PROJECT_PURPOSE_OPTIONS,
  STUDIO_PROJECT_START_POINT_OPTIONS,
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
  AUXILIARY_ICONS,
  CANVAS_DIMENSION_MAX,
  CANVAS_DIMENSION_MIN,
  CANVAS_HEIGHT_INPUT_ID,
  CANVAS_WIDTH_INPUT_ID,
  COLLABORATION_ICONS,
  CREATE_DISABLED_REASON_ID,
  CREATE_SIZE_REASON_ID,
  PROJECT_TITLE_INPUT_ID,
  START_POINT_ICONS,
  focusProjectTitle,
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
import { StudioProjectFormatVisual } from "./StudioProjectFormatPreview";
import { STUDIO_PROJECT_TITLE_MAX_LENGTH, normalizeStudioProjectTitleDraft } from "./studio-project-title";
import "./studio-illustrated-project-surfaces.css";
import "./studio-create-focused-flow.css";

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
    document.getElementById(customWidth === null ? CANVAS_WIDTH_INPUT_ID : CANVAS_HEIGHT_INPUT_ID)?.focus();
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

  return (
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
          onCreate={create} onFixName={focusProjectTitle} onFixSize={focusCanvasSize}>
          {(onInputKeyDown) => <>
          <StudioJourneyStepBar currentStep="start" startHref="/create" allowCurrentStepLink className="mb-4" />
          {/* 기본 선택 뒤에 주 행동 하나를 두고 추가 설정·미리보기는 뒤로 분리한다. */}
          <PurposeHeader
            eyebrow={(
              <>
                <Sparkles size={14} aria-hidden="true" />
                {bt("새 프로젝트", "New project")}
              </>
            )}
            title={bt("어떤 작품을 만들까요?", "What would you like to create?")}
            description={bt(
              "만들 형식과 시작 단계만 고르면 바로 작업실이 열려요. 해상도나 협업 설정은 필요할 때만 아래에서 펼쳐 보세요.",
              "Pick a format and starting step to open your workspace right away. Extra settings stay folded until you need them.",
            )}
            secondaryActions={(
              <Link href="/studio/import" className={buttonClass({ variant: "outline" })}>
                <Upload size={16} aria-hidden="true" />
                {bt("가진 파일 불러오기", "Import an existing file")}
              </Link>
            )}
          />

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
                onClick={focusProjectTitle}
                className="ml-auto inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {bt("프로젝트 이름으로 채웠어요 · 확인하기", "Used as the project name · Review")}
              </button>
            </p>
          ) : null}

          <StudioCreateQuickPresetStrip
            activePresetId={activeQuickPresetId}
            onSelectPreset={applyQuickPreset}
            onQuickStart={titleReady && sizeReady ? () => { create(); } : undefined}
            quickStartSummary={`${title.trim() || targetTitle} · ${documentWidth} × ${documentHeight}px · ${nextStepLabel}`}
            creating={creating}
          />

          <FormStepSection
            step={1}
            titleId="studio-format-title"
            title={bt("만들 작품 형식을 골라 주세요", "Choose the format to create")}
            description={bt("독자가 보게 될 화면 형태를 고르면 알맞은 캔버스 크기를 자동으로 맞춰 드려요.", "Choose how readers will view your work and we will set the right canvas size.")}
          >
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" data-studio-format-count={STUDIO_PROJECT_FORMAT_PROFILES.length}>
              {STUDIO_PROJECT_FORMAT_PROFILES.map((profile) => {
                const active = !auxiliary && profile.id === format.id;
                const outputs = locale === "ko" ? profile.outputsKo : profile.outputsEn;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={active}
                    data-studio-create-format={profile.id}
                    onClick={() => chooseFormat(profile)}
                    className={cn(
                      "min-w-0 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active
                        ? "border-accent bg-accent-soft/45"
                        : "border-line bg-panel/45 hover:border-line-strong hover:bg-raised",
                    )}
                  >
                    <span className="studio-format-illustration" data-format={profile.id} aria-hidden="true">
                      <span>{bt("안내 일러스트", "Guide illustration")}</span>
                    </span>
                    <StudioProjectFormatVisual profile={profile} active={active} className="h-32" />
                    <strong className="mt-3 block break-words text-sm text-fg">{bt(profile.titleKo, profile.titleEn)}</strong>
                    <span className="mt-1 block min-h-5 text-xs font-bold text-accent">{active ? bt("✓ 선택됨", "✓ Selected") : null}</span>
                    <span className="mt-1 block break-words text-xs leading-5 text-fg-2">
                      {bt(profile.descriptionKo, profile.descriptionEn)}
                    </span>
                    <span className={cn("mt-2 block break-words text-xs font-bold", active ? "text-fg" : "text-fg-2")}>
                      {bt("출력", "Output")} · {outputs.slice(0, 2).join(" · ")}
                    </span>
                  </button>
                );
              })}
            </div>

            <details className="mt-4 rounded-2xl border border-line bg-panel/35" open={Boolean(auxiliary) || undefined} data-studio-auxiliary-workspaces="true">
              <summary className="min-h-12 cursor-pointer content-center px-4 text-sm font-bold text-fg-2">
                {bt("작품 프로젝트가 아닌 단일 작업실로 시작", "Start with a standalone workspace")}
                <span className="ml-2 text-xs font-medium text-fg-2">
                  {bt("스토리보드·이미지 편집·3D·홍보·발표", "Storyboard, image, 3D, promotion or slides")}
                </span>
              </summary>
              <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-5">
                {STUDIO_AUXILIARY_WORKSPACE_OPTIONS.map((option) => {
                  const Icon = AUXILIARY_ICONS[option.id];
                  const active = auxiliary?.id === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      data-studio-auxiliary-kind={option.id}
                      onClick={() => chooseAuxiliary(option)}
                      className={cn(
                        "min-h-24 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                        active ? "border-accent bg-accent-soft/45" : "border-line bg-card hover:bg-raised",
                      )}
                    >
                      <Icon size={18} className={active ? "text-accent" : "text-fg-2"} aria-hidden="true" />
                      <strong className="mt-2 block text-xs text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                      <span className="mt-1 line-clamp-2 block text-[0.68rem] leading-5 text-fg-2">
                        {bt(option.descriptionKo, option.descriptionEn)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </details>
          </FormStepSection>
          <FormStepSection
            step={2}
            titleId="studio-start-point-title"
            title={bt("지금 어디서부터 시작할까요?", "Where would you like to start?")}
            description={bt("고른 단계에 맞춰 가장 먼저 필요한 작업 화면으로 바로 안내해 드려요.", "Jump straight to the first workspace that matches what you have ready.")}
          >
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {STUDIO_PROJECT_START_POINT_OPTIONS.map((option) => {
                const Icon = START_POINT_ICONS[option.id];
                const active = effectiveStartPoint === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    data-studio-start-point={option.id}
                    onClick={() => chooseStartPoint(option.id)}
                    className={cn(
                      "flex min-h-24 min-w-0 flex-col items-start gap-2 rounded-2xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:flex-row sm:gap-3",
                      active ? "border-accent bg-accent-soft/45" : "border-line bg-panel/45 hover:bg-raised",
                    )}
                  >
                    <span className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl",
                      active ? "bg-accent text-on-accent" : "bg-card text-fg-2",
                    )}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 break-words">
                      <strong className="block text-sm text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                      <span className="mt-1 block text-xs leading-5 text-fg-2">
                        {bt(option.descriptionKo, option.descriptionEn)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </FormStepSection>
          <FormStepSection
            step={3}
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
                    aria-describedby={!titleReady ? CREATE_DISABLED_REASON_ID : undefined}
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
                <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={bt("임시 제목 예시", "Working title examples")}>
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
                        className="min-h-8 rounded-full border border-line bg-panel/70 px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        {sample}
                      </button>
                    );
                  })}
                </div>
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
            <StudioCanvasSafeZoneSimulator
              width={documentWidth}
              height={documentHeight}
              formatId={auxiliary ? undefined : format.id}
              pageCount={selectedPageCount}
            />
          </FormStepSection>

          <StudioCreateLaunchSummary
            targetTitle={targetTitle} width={documentWidth} height={documentHeight}
            titleReady={titleReady} sizeReady={sizeReady} structuredWebtoon={structuredWebtoon}
            creating={creating} startLabel={startLabel} nextStepLabel={nextStepLabel} error={error}
            onFixName={focusProjectTitle} onFixSize={focusCanvasSize}
          />

          <details ref={advancedSettingsRef} className="mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5" data-studio-create-advanced="true">
            <summary className="min-h-12 cursor-pointer content-center rounded-xl text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {bt("크기·제작 목적·협업 설정 (선택)", "Size, purpose and collaboration (optional)")}
              <span className="mt-1 block text-xs font-normal leading-5 text-fg-2">{bt("직접 정할 필요가 있을 때만 바꾸세요. 접어도 선택한 값은 유지됩니다.", "Change these only when needed. Collapsing this section keeps your choices.")}</span>
            </summary>
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
                    aria-describedby={sizeOverride !== null && customWidth === null ? CREATE_SIZE_REASON_ID : undefined}
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
                    aria-describedby={sizeOverride !== null && customHeight === null ? CREATE_SIZE_REASON_ID : undefined}
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
          </>}
        </StudioCreateKeyboardForm>
      </Container>
    </div>
  );
}
