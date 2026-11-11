import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Download, FileCheck2, Rss } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { getApiErrorMessage } from "@/platform/api";
import { useI18n } from "@/shared/lib/i18n";
import { useApp } from "@/shared/lib/store";
import { Container } from "@/shared/components/container";
import { PublishSurfaceGuide } from "@/shared/components/publish-surface-guide";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { EpisodeStageStepper } from "@/shared/components/episode-stage-stepper";
import { representativeEpisodeStage, type RepresentativeEpisodeStage } from "@/domains/creator/public/episode-stage";
import { getProductionProject } from "@/domains/creator/public/production-projects";

import { IntegrationError, IntegrationLoading } from "./IntegrationUi";
import { INTEGRATION_PROVIDER_STATUS_LABELS } from "./integration-platform-copy";
import { integrationPlatformClient } from "./integration-platform-client";
import type { IntegrationProviderStatus, PublishPackageResponse } from "./integration-platform-types";
import { PublishSurfaceCrossBridge } from "./PublishSurfaceCrossBridge";
import { SerialCenterOverview } from "./SerialCenterOverview";
import { integrationsStatusText } from "./integrations-status-i18n";
import { useIntegrationCatalog } from "./use-integration-catalog";
import { PublishPreparedFiles } from "./PublishPreparedFiles";
import { downloadPreparedPublication, downloadPreparedRss, type PublishFeedResult } from "./publish-prepared-file-downloads";

type PreparationStep = "project" | "details" | "files";
const STEPS: readonly PreparationStep[] = ["project", "details", "files"];
const fieldClass = "mt-2 min-h-11 w-full scroll-mb-40 scroll-mt-24 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60";
const quietButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-fg disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent";
const primaryButton = "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-cool sm:flex-none";

export function PublishCenterPage() {
  const [searchParams] = useSearchParams();
  const userId = useApp((state) => state.userId);
  return <PublishCenterSession key={JSON.stringify([userId, searchParams.get("projectId")?.trim() ?? ""])} />;
}

function PublishCenterSession() {
  const ko = useI18n((state) => state.lang).startsWith("ko");
  const userId = useApp((state) => state.userId);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { catalog, error, loading, refresh } = useIntegrationCatalog();
  const publishingProviders = useMemo(() => catalog?.providers.filter((provider) => provider.category === "publishing") ?? [], [catalog]);
  // 작품·계정이 바뀌면 바깥 세션을 교체하지만 단계 이동은 같은 입력 소유자를 유지한다.
  const initialProjectId = searchParams.get("projectId")?.trim() ?? "";
  const projectId = initialProjectId;
  const [projectTitle, setProjectTitle] = useState("");
  const [verifiedProjectId, setVerifiedProjectId] = useState<string | null>(null);
  const [projectChecking, setProjectChecking] = useState(false);
  const [projectError, setProjectError] = useState(false);
  const [projectReload, setProjectReload] = useState(0);
  const [stage, setStage] = useState<RepresentativeEpisodeStage | null>(null);
  const [title, setTitle] = useState(() => searchParams.get("title")?.trim() ?? "");
  const [description, setDescription] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState(() => searchParams.get("canonicalUrl")?.trim() ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [tags, setTags] = useState("");
  const [channels, setChannels] = useState<readonly string[]>(["external-webtoon-platforms", "rss-json-feed"]);
  const [result, setResult] = useState<PublishPackageResponse | null>(null);
  const [feedResult, setFeedResult] = useState<PublishFeedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validationField, setValidationField] = useState<string | null>(null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [projectChoicesOpen, setProjectChoicesOpen] = useState(!initialProjectId || !userId);
  const [focusNonce, setFocusNonce] = useState(0);
  const pendingFocus = useRef<{ readonly id: string; readonly search: string } | null>(null);
  const alive = useRef(true);
  const currentLocationKey = useRef(location.key);
  currentLocationKey.current = location.key;
  const projectVerified = Boolean(userId && projectId && verifiedProjectId === projectId);
  const hasFiles = Boolean(result || feedResult);
  const requestedStep = searchParams.get("step");
  const step: PreparationStep = requestedStep === "project" ? "project" : requestedStep === "files" && hasFiles ? "files" : requestedStep === "details" || projectId ? "details" : "project";
  const stepIndex = STEPS.indexOf(step);
  const stepNames = ko ? ["작품 선택", "정보와 채널", "파일 확인"] : ["Choose work", "Details and channels", "Check files"];
  const stepDescriptions = ko ? ["제작 프로젝트 확인", "입력 · 전달 대상", "결과 · 다운로드"] : ["Verify production project", "Details · destinations", "Results · downloads"];

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    setStage(null); setVerifiedProjectId(null); setProjectError(false);
    if (!userId || !projectId) { setProjectChecking(false); return; }
    let active = true;
    setProjectChecking(true);
    void getProductionProject(projectId).then((record) => {
      if (!active) return;
      if (record.aggregate.projectId !== projectId) { setProjectError(true); return; }
      setStage(representativeEpisodeStage(record.aggregate));
      setVerifiedProjectId(projectId); setProjectTitle(record.aggregate.title);
      setTitle((current) => current.trim() ? current : record.aggregate.title);
    }).catch(() => { if (active) setProjectError(true); })
      .finally(() => { if (active) setProjectChecking(false); });
    return () => { active = false; };
  }, [userId, projectId, projectReload]);

  // 단계 전환과 브라우저 Back은 같은 입력을 두고 현재 단계의 제목으로 초점을 옮긴다.
  useEffect(() => {
    if (!focusNonce && !searchParams.has("step")) return;
    if (pendingFocus.current && pendingFocus.current.search !== location.search) return;
    const target = document.getElementById(pendingFocus.current?.id ?? `publish-step-heading-${step}`);
    if (!target || target.closest("[hidden]")) return;
    pendingFocus.current = null;
    target.focus(); target.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [step, location.key, location.search, focusNonce, searchParams]);

  const goToStep = (next: PreparationStep, targetId?: string) => {
    const nextParams = new URLSearchParams(searchParams); nextParams.set("step", next);
    pendingFocus.current = { id: targetId ?? `publish-step-heading-${next}`, search: `?${nextParams.toString()}` };
    setFocusNonce((current) => current + 1);
    if (nextParams.toString() !== searchParams.toString()) setSearchParams(nextParams);
  };
  const clearPreparedFiles = () => { setResult(null); setFeedResult(null); setValidationField(null); };
  const toggleChannel = (id: string) => {
    if (busy) return;
    clearPreparedFiles(); setChannels((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const validateDetails = (needsChannel: boolean) => {
    let field: string | null = null;
    if (!projectVerified) field = "publish-project-choice";
    else if (!title.trim()) field = "publish-title";
    else if (!canonicalUrl.trim() || !document.getElementById("publish-canonical-url")?.matches(":valid")) field = "publish-canonical-url";
    else if (needsChannel && channels.length === 0) field = "publish-channel-list";
    else if (scheduledAt && !Number.isFinite(new Date(scheduledAt).getTime())) field = "publish-planned-at";
    setValidationField(field);
    if (!field) return true;
    if (field === "publish-planned-at") setOptionalOpen(true);
    goToStep(field === "publish-project-choice" ? "project" : "details", field);
    return false;
  };

  const buildPackage = async () => {
    if (busy || !validateDetails(true)) return;
    const requestedLocationKey = location.key;
    setBusy(true); setMessage(null); setResult(null);
    try {
      const response = await integrationPlatformClient.buildPublishPackage({
        projectId: projectId.trim(), title: title.trim(), description, canonicalUrl: canonicalUrl.trim(),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        channels, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      if (!alive.current) return;
      setResult(response);
      if (currentLocationKey.current === requestedLocationKey) goToStep("files");
    } catch (reason) {
      const failure = await getApiErrorMessage(reason, integrationsStatusText("integrations.status.publish.packageFailed", "게시 정보 파일을 만들지 못했습니다."));
      if (alive.current) {
        setMessage(failure);
        if (currentLocationKey.current === requestedLocationKey) { pendingFocus.current = { id: "publish-preparation-error", search: location.search }; setFocusNonce((current) => current + 1); }
      }
    } finally { if (alive.current) setBusy(false); }
  };
  const buildFeeds = async () => {
    if (busy || !validateDetails(false)) return;
    const requestedLocationKey = location.key;
    setBusy(true); setFeedResult(null); setMessage(null);
    try {
      const publishedAt = scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString();
      const response = await integrationPlatformClient.buildFeedPreview({
        title: `${title || "ToonStudio"} feed`, homePageUrl: canonicalUrl,
        feedUrl: `${canonicalUrl.replace(/\/$/u, "")}/feed.xml`, description,
        items: [{ id: `${projectId}:${publishedAt}`, url: canonicalUrl, title: title || "Untitled release", summary: description, datePublished: publishedAt }],
      });
      if (!alive.current) return;
      setFeedResult(response);
      if (currentLocationKey.current === requestedLocationKey) goToStep("files");
    } catch (reason) {
      const failure = await getApiErrorMessage(reason, integrationsStatusText("integrations.status.publish.feedPreviewFailed", "피드 미리보기를 만들지 못했습니다."));
      if (alive.current) {
        setMessage(failure);
        if (currentLocationKey.current === requestedLocationKey) { pendingFocus.current = { id: "publish-preparation-error", search: location.search }; setFocusNonce((current) => current + 1); }
      }
    } finally { if (alive.current) setBusy(false); }
  };
  const stageCurrent = stage?.states.find((state) => state.status === "current") ?? null;
  const fieldError = validationField ? (ko ? "필수 정보를 확인해 주세요. 입력한 내용은 유지됩니다." : "Check the required information. Your input is retained.") : null;

  return <Container size="standard" className="py-6 sm:py-8" style={{ maxWidth: "74rem" }}>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-[length:var(--site-task-heading-size)] font-bold leading-[1.2] tracking-[-0.025em] text-fg">{ko ? "게시 정보 파일 준비" : "Prepare publication information"}</h1>
        <p className="mt-2 text-sm leading-6 text-fg-2">{ko ? "작품과 채널 정보를 확인해 전달할 JSON 파일을 만들어요." : "Check the work and channel details and prepare a JSON file to hand off."}</p></div>
      <p className="rounded-full border border-line px-3 py-1.5 text-xs text-cool">{ko ? "외부 게시·예약은 실행되지 않아요" : "No external publication or scheduling runs"}</p>
    </header>
    <nav aria-label={ko ? "게시 정보 준비 단계" : "Publication preparation steps"} className="mb-5 grid grid-cols-3 gap-1.5 sm:gap-2">
      {STEPS.map((item, index) => <button key={item} type="button" disabled={busy || (item === "files" && !hasFiles)} aria-current={step === item ? "step" : undefined} onClick={() => goToStep(item)} className={`min-h-14 rounded-xl border px-1 py-2 text-center text-xs focus-visible:outline-2 focus-visible:outline-cool disabled:opacity-50 sm:px-3 sm:text-sm ${step === item ? "border-accent bg-accent/10 font-bold text-accent" : "border-line bg-panel text-fg-2"}`}>
        {index + 1}. {stepNames[index]}<span className="mt-1 block text-[11px] font-normal text-fg-2 sm:text-xs">{stepDescriptions[index]}</span>
      </button>)}
    </nav>
    {projectChecking ? <p className="mb-4 text-sm text-fg-2" role="status">{ko ? "선택한 제작 프로젝트를 확인하고 있어요." : "Checking the selected production project."}</p> : null}
    {projectError ? <div role="alert" className="mb-4 rounded-xl border border-warn/30 bg-panel p-4 text-sm text-fg-2"><p>{ko ? "제작 프로젝트를 확인하지 못했어요. 입력은 유지됩니다. 다시 확인하거나 작품 선택 단계에서 프로젝트를 고르세요." : "Could not verify this production project. Your input is retained. Retry or choose a project in the first step."}</p><button type="button" disabled={busy || projectChecking} onClick={() => setProjectReload((current) => current + 1)} className={`${quietButton} mt-3`}>{ko ? "프로젝트 다시 확인" : "Retry project check"}</button></div> : null}
    {message ? <p id="publish-preparation-error" tabIndex={-1} className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger" role="alert">{message}</p> : null}
    {fieldError ? <p className="mb-4 text-sm text-danger" role="alert">{fieldError}</p> : null}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
      <div className="min-w-0 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <section hidden={step !== "project"} aria-labelledby="publish-step-heading-project">
          <h2 id="publish-step-heading-project" tabIndex={-1} className="text-lg font-bold text-fg">{ko ? "어떤 작품의 정보를 준비할까요?" : "Which work should the file describe?"}</h2>
          {projectVerified ? <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-card p-4"><CheckCircle2 size={20} aria-hidden className="shrink-0 text-cool" /><div className="min-w-0"><p className="break-words font-bold text-fg">{projectTitle}</p><p className="mt-1 text-xs text-fg-2">{ko ? "선택한 제작 프로젝트 · 정보 입력을 이어갈 수 있어요" : "Selected production project · Continue with its details"}</p></div></div> : null}
          <details id="publish-project-selection" open={projectChoicesOpen || !projectVerified} onToggle={(event) => setProjectChoicesOpen(event.currentTarget.open)} className="mt-4 rounded-xl border border-line px-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-fg-2">{projectVerified ? (ko ? "다른 제작 프로젝트 선택" : "Choose another production project") : (ko ? "게시 준비할 제작 프로젝트 선택" : "Choose a production project")}</summary>
          <div id="publish-project-choice" tabIndex={-1} className="rounded-xl pb-3 focus-visible:outline-2 focus-visible:outline-accent"><SerialCenterOverview ko={ko} selectionMode selectionDisabled={busy} onSelectProject={(project) => {
            if (busy) return;
            setProjectChoicesOpen(false);
            if (project.projectId === projectId) { goToStep("details"); return; }
            // 새 작품은 새 입력 소유자로 열고, Back 목적지도 같은 작품의 선택 단계로 만든다.
            const projectParams = new URLSearchParams(searchParams);
            projectParams.set("projectId", project.projectId); projectParams.set("step", "project");
            projectParams.delete("title"); projectParams.delete("canonicalUrl");
            setSearchParams(projectParams, { replace: true });
            const detailsParams = new URLSearchParams(projectParams); detailsParams.set("step", "details");
            setSearchParams(detailsParams);
          }} /></div></details>
          {!projectId ? <p className="mt-4 text-sm leading-6 text-fg-2" role="status">{ko ? "게시 정보를 준비하려면 위 목록에서 제작 프로젝트를 선택하세요." : "Choose an existing production project above before preparing its publication information."}</p> : null}
        </section>
        <section hidden={step !== "details"} aria-labelledby="publish-step-heading-details">
          <h2 id="publish-step-heading-details" tabIndex={-1} className="text-lg font-bold text-fg">{ko ? "정보와 채널 확인" : "Check details and channels"}</h2>
          <p className="mt-2 break-words text-sm text-fg-2">{projectTitle || (ko ? "작품 선택 단계에서 제작 프로젝트를 고르세요." : "Choose a production project in the first step.")}</p>
          <label htmlFor="publish-title" className="mt-5 block text-sm font-semibold text-fg">{ko ? "제목" : "Title"}</label>
          <input id="publish-title" required maxLength={200} disabled={busy} aria-invalid={validationField === "publish-title" || undefined} value={title} onChange={(event) => { setTitle(event.currentTarget.value); clearPreparedFiles(); }} className={fieldClass} />
          <label htmlFor="publish-canonical-url" className="mt-4 block text-sm font-semibold text-fg">{ko ? "작품 대표 주소" : "Work's main URL"}</label>
          <input id="publish-canonical-url" required type="url" maxLength={2048} aria-describedby="publish-canonical-help" aria-invalid={validationField === "publish-canonical-url" || undefined} disabled={busy} value={canonicalUrl} onChange={(event) => { setCanonicalUrl(event.currentTarget.value); clearPreparedFiles(); }} className={fieldClass} />
          <p id="publish-canonical-help" className="mt-2 text-xs leading-5 text-fg-2">{ko ? "독자가 실제로 작품을 볼 수 있는 주소를 입력하세요." : "Enter the actual address where readers can view this work."}</p>
          {loading ? <div className="mt-5"><IntegrationLoading /></div> : null}
          {error ? <div className="mt-5"><IntegrationError message={error} onRetry={refresh} /></div> : null}
          <fieldset id="publish-channel-list" tabIndex={-1} aria-invalid={validationField === "publish-channel-list" || undefined} className="mt-5 space-y-2 rounded-xl focus-visible:outline-2 focus-visible:outline-accent">
            <legend className="mb-2 text-sm font-bold text-fg">{ko ? "파일에 넣을 채널" : "Channels to include"}</legend>
            {publishingProviders.map((provider) => <ChannelCard key={provider.id} provider={provider} selected={channels.includes(provider.id)} ko={ko} onToggle={() => toggleChannel(provider.id)} disabled={busy} />)}
          </fieldset>
          <details open={optionalOpen} onToggle={(event) => setOptionalOpen(event.currentTarget.open)} className="mt-4 rounded-xl border border-line px-3">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-fg-2">{ko ? "선택 입력 · 일정·태그·설명" : "Optional · planned time, tags and description"}<ChevronDown size={15} aria-hidden /></summary>
            <div className="space-y-4 border-t border-line pb-4 pt-3">
              <div><label htmlFor="publish-planned-at" className="text-sm font-semibold text-fg">{ko ? "게시 희망 시각 · 계획 기록" : "Planned publication time · record only"}</label><input id="publish-planned-at" aria-describedby="publish-planned-help" type="datetime-local" disabled={busy} value={scheduledAt} onChange={(event) => { setScheduledAt(event.currentTarget.value); clearPreparedFiles(); }} className={fieldClass} /><p id="publish-planned-help" className="mt-2 text-xs leading-5 text-fg-2">{ko ? "JSON과 피드 미리보기에 날짜를 기록합니다. 외부 플랫폼의 예약을 등록하지 않습니다." : "Records a date in the JSON and feed preview. It does not book a release in an external platform."}</p></div>
              <div><label htmlFor="publish-tags" className="text-sm font-semibold text-fg">{ko ? "태그(쉼표 구분)" : "Tags (comma separated)"}</label><input id="publish-tags" disabled={busy} value={tags} onChange={(event) => { setTags(event.currentTarget.value); clearPreparedFiles(); }} className={fieldClass} /></div>
              <div><label htmlFor="publish-description" className="text-sm font-semibold text-fg">{ko ? "설명" : "Description"}</label><textarea id="publish-description" disabled={busy} value={description} maxLength={5000} onChange={(event) => { setDescription(event.currentTarget.value); clearPreparedFiles(); }} rows={3} className={fieldClass} /></div>
            </div>
          </details>
        </section>
        <section hidden={step !== "files"} aria-labelledby="publish-step-heading-files">
          <h2 id="publish-step-heading-files" tabIndex={-1} className="mb-4 text-lg font-bold text-fg">{ko ? "파일 결과를 확인하세요" : "Check the prepared files"}</h2>
          <PublishPreparedFiles ko={ko} result={result} feedResult={feedResult} />
        </section>
      </div>
      <aside className="min-w-0 space-y-4" aria-label={ko ? "준비 중인 내용" : "Preparation summary"}>
        <div className="hidden rounded-2xl border border-line bg-panel p-5 lg:block"><h2 className="text-lg font-bold text-fg">{ko ? "준비 중인 내용" : "Preparation summary"}</h2><dl className="mt-4 space-y-3 rounded-xl bg-card p-4 text-sm"><div><dt className="text-fg-2">{ko ? "제작 프로젝트" : "Production project"}</dt><dd className="mt-1 break-words font-bold text-fg">{projectTitle || (ko ? "작품 선택 필요" : "Choose a work")}</dd></div><div><dt className="text-fg-2">{ko ? "전달 정보" : "Handoff information"}</dt><dd className="mt-1 text-fg">{ko ? `제목 · 대표 주소 · 선택 채널 ${channels.length}곳` : `Title · main URL · ${channels.length} selected channels`}</dd></div></dl><p className="mt-4 text-sm leading-6 text-fg-2">{ko ? "JSON 준비는 이미지 자르기, 업로드, 연재 예약을 실행하지 않습니다." : "Preparing JSON does not slice images, upload or schedule a release."}</p></div>
        {step !== "project" ? <details className="rounded-xl border border-line bg-panel px-4"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-fg-2">{ko ? "다른 전달 형식 · 피드 파일" : "Other handoff formats · feed files"}<ChevronDown size={15} aria-hidden /></summary><div className="space-y-3 border-t border-line pb-4 pt-3"><p className="text-sm leading-6 text-fg-2">{ko ? "RSS · JSON Feed · ActivityPub 파일 내용을 준비합니다. 구독 주소의 게시·호스팅은 별도로 진행하세요." : "Prepare RSS, JSON Feed and ActivityPub file contents. Publish and host the subscription address separately."}</p><button type="button" disabled={busy || !projectVerified} onClick={() => void buildFeeds()} className={quietButton}><Rss size={15} aria-hidden />{ko ? "피드 파일 미리보기" : "Preview feed files"}</button></div></details> : null}
        <Link to={projectVerified ? `/production/projects/${encodeURIComponent(projectId)}/overview` : "/production/projects"} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline"><ArrowLeft size={15} aria-hidden />{projectVerified ? (ko ? "선택한 프로젝트로 돌아가기" : "Return to this project") : (ko ? "제작 프로젝트 목록으로" : "Production projects")}</Link>
        {projectVerified && stage && stageCurrent ? <details className="rounded-xl border border-line bg-panel px-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-fg-2">{ko ? "선택한 작품의 제작 단계" : "Production stage for this work"}</summary><div className="pb-4"><EpisodeStageStepper states={stage.states} variant="compact" /></div></details> : null}
      </aside>
    </div>
    <div data-publish-preparation-actions="true" className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3 md:bottom-0 sm:p-4">
      <p className="mr-auto hidden text-xs text-fg-2 sm:block">{stepIndex + 1} / 3 · {ko ? "이전 단계로 돌아가도 입력과 선택 유지" : "Details and selections stay when returning to a step"}</p>
      {step !== "project" ? <button type="button" disabled={busy} onClick={() => goToStep(step === "files" ? "details" : "project")} className={quietButton}><ArrowLeft size={15} aria-hidden />{step === "files" ? (ko ? "입력 내용 수정" : "Edit details") : (ko ? "작품 선택" : "Choose work")}</button> : null}
      {step === "project" ? <button type="button" disabled={busy || !projectVerified} onClick={() => goToStep("details")} className={primaryButton}>{ko ? "정보와 채널 확인" : "Check details and channels"}<ArrowRight size={15} aria-hidden /></button> : step === "details" ? <button type="button" disabled={busy || !projectVerified || !catalog} onClick={() => void buildPackage()} className={primaryButton}><FileCheck2 size={16} aria-hidden />{busy ? (ko ? "준비 중" : "Preparing") : (ko ? "게시 정보 JSON 준비" : "Prepare publication JSON")}</button> : result ? <button type="button" onClick={() => downloadPreparedPublication(result)} className={primaryButton}><Download size={15} aria-hidden />{ko ? "게시 정보 JSON 다운로드" : "Download publication JSON"}</button> : feedResult ? <button type="button" onClick={() => downloadPreparedRss(feedResult)} className={primaryButton}><Download size={15} aria-hidden />RSS</button> : null}
    </div>
    {hasFiles && step !== "files" ? <button type="button" disabled={busy} onClick={() => goToStep("files")} className={`${quietButton} mt-3`}>{ko ? "준비된 파일 다시 보기" : "Return to prepared files"}<ArrowRight size={15} aria-hidden /></button> : null}
    <details className="mt-5 rounded-2xl border border-line bg-panel" aria-label={ko ? "원고 출력·게시 계획 안내" : "Manuscript export and publication planning guide"}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-fg">{ko ? "원고 출력·게시 계획 안내" : "Manuscript export and publication planning guide"}<ChevronDown size={15} aria-hidden /></summary>
      <div className="space-y-4 border-t border-line p-4 text-sm leading-6 text-fg-2"><p>{ko ? "이 화면의 출력은 제목·주소·채널·태그·설명·희망 시각을 담은 JSON입니다. 원고 이미지는 작업실에서 내보내고 제출처의 최신 안내를 확인하세요." : "This screen prepares JSON containing the title, URL, channels, tags, description and planned time. Export manuscript images from Studio and check the destination's current requirements."}</p><p>{ko ? "해외 동시 공개와 유료 미리보기 기간은 각 플랫폼에서 별도로 설정·확인하세요. 여기서 시간대를 동기화하거나 공개 범위를 자동으로 잠그지 않습니다." : "Set and verify regional release times and paid-preview windows in each platform. This screen does not synchronize time zones or lock publication visibility."}</p><PublishSurfaceGuide surface="serial" /><PublishSurfaceCrossBridge ko={ko} /><SiteContextualSubNav /></div>
    </details>
  </Container>;
}

function ChannelCard({ provider, selected, ko, onToggle, disabled }: {
  readonly provider: IntegrationProviderStatus; readonly selected: boolean; readonly ko: boolean;
  readonly onToggle: () => void; readonly disabled: boolean;
}) {
  const inputId = `publish-channel-${provider.id}`;
  return <label htmlFor={inputId} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border bg-canvas p-3 ${selected ? "border-accent/60" : "border-line"}`}>
    <input id={inputId} type="checkbox" aria-label={provider.name} checked={selected} disabled={disabled} onChange={onToggle} className="mt-1 size-5 shrink-0 [accent-color:var(--color-accent)]" />
    <span className="min-w-0 text-sm"><strong className="font-semibold text-fg">{provider.name}</strong><span className="mt-1 block text-xs leading-5 text-fg-2">{provider.status === "manual" ? (ko ? "직접 업로드용 패키지로 준비돼요" : "Prepared as a manual-upload package") : provider.summary}</span><span className="mt-1 block text-xs text-fg-2">{INTEGRATION_PROVIDER_STATUS_LABELS[provider.status]} · {ko ? "채널 정보만 포함 · 직접 게시 아님" : "Channel information only · not a publication"}</span></span>
  </label>;
}
