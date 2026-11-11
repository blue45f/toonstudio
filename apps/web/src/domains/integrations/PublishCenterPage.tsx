import { CheckCircle2, ChevronDown, CircleAlert, Download, FileCheck2, PackageCheck, Rss } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { getApiErrorMessage } from "@/platform/api";
import { useI18n } from "@/shared/lib/i18n";
import { useApp } from "@/shared/lib/store";

import {
  IntegrationError,
  IntegrationLoading,
  IntegrationPage,
} from "./IntegrationUi";
import { INTEGRATION_PROVIDER_STATUS_LABELS } from "./integration-platform-copy";
import { integrationPlatformClient } from "./integration-platform-client";
import {
  downloadIntegrationJson,
  downloadIntegrationText,
} from "./integration-platform-storage";
import type { IntegrationProviderStatus, PublishPackageResponse } from "./integration-platform-types";
import { PublishSurfaceCrossBridge } from "./PublishSurfaceCrossBridge";
import { SerialCenterOverview } from "./SerialCenterOverview";
import { integrationsStatusText } from "./integrations-status-i18n";

import { PublishSurfaceGuide } from "@/shared/components/publish-surface-guide";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { EpisodeStageStepper } from "@/shared/components/episode-stage-stepper";
import {
  representativeEpisodeStage,
  type RepresentativeEpisodeStage,
} from "@/domains/creator/public/episode-stage";
import { getProductionProject } from "@/domains/creator/public/production-projects";
import { useIntegrationCatalog } from "./use-integration-catalog";

/**
 * 작품 포스터 그라디언트 — 표지 아트가 없어도 제목이 주인공이 되도록,
 * 제목(없으면 프로젝트 ID) 해시로 색을 정하는 타이포그래픽 포스터.
 * 같은 작품은 언제나 같은 색을 갖는다.
 */
function posterBackground(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return [
    `radial-gradient(120% 90% at 18% 8%, oklch(0.78 0.1 ${hash} / 0.55), transparent 55%)`,
    `linear-gradient(155deg, oklch(0.64 0.13 ${hash}), oklch(0.48 0.14 ${(hash + 42) % 360}) 58%, oklch(0.36 0.11 ${(hash + 84) % 360}))`,
  ].join(", ");
}

function providerDotColor(providerId: string): string {
  let hash = 0;
  for (let index = 0; index < providerId.length; index += 1) {
    hash = (hash * 31 + providerId.charCodeAt(index)) % 360;
  }
  return `oklch(0.62 0.14 ${hash})`;
}

export function PublishCenterPage() {
  const [searchParams] = useSearchParams();
  const userId = useApp((state) => state.userId);
  return <PublishCenterSession key={JSON.stringify([userId, searchParams.get("projectId")?.trim() ?? ""])} />;
}

function PublishCenterSession() {
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const ko = isKo;
  const userId = useApp((state) => state.userId);
  const { catalog, error, loading, refresh } = useIntegrationCatalog();
  const publishingProviders = useMemo(
    () => catalog?.providers.filter((provider) => provider.category === "publishing") ?? [],
    [catalog],
  );
  const [searchParams] = useSearchParams();
  // 제작 허브 등에서 넘어올 때는 ?projectId=(와 ?title=)로 작품을 들고 온다.
  // 직접 방문에는 가짜 프로젝트를 넣지 않고 실제 제작 프로젝트 선택을 기다린다.
  const initialProjectId = searchParams.get("projectId")?.trim() ?? "";
  const [projectId, setProjectId] = useState(initialProjectId);
  const [verifiedProjectId, setVerifiedProjectId] = useState<string | null>(null);
  const [projectChecking, setProjectChecking] = useState(false);
  const [projectError, setProjectError] = useState(false);
  const [projectReload, setProjectReload] = useState(0);
  const [projectSelectionOpen, setProjectSelectionOpen] = useState(!initialProjectId || !userId);
  // 회차 단계 compact 칩 (S2-5): 선택한 작품 1건의 aggregate만 읽어 제작 허브
  // 개요와 같은 합성(representativeEpisodeStage)으로 대표 회차 단계를 도출한다.
  // 같은 함수를 쓰므로 같은 회차는 이 표면에서도 같은 단계로 표시된다.
  // 로그인 전이거나 작품을 읽지 못하면 칩 근거가 없는 것이므로 stage는 null로
  // 두고 칩을 그리지 않는다 — 연재 현황 요약 수치로 단계를 지어내지 않는다.
  const [stage, setStage] = useState<RepresentativeEpisodeStage | null>(null);
  useEffect(() => {
    setStage(null);
    setVerifiedProjectId(null);
    setProjectError(false);
    if (!userId || !projectId) {
      setProjectChecking(false);
      return;
    }
    let active = true;
    setProjectChecking(true);
    void getProductionProject(projectId)
      .then((record) => {
        if (!active) return;
        if (record.aggregate.projectId !== projectId) {
          setProjectError(true);
          return;
        }
        const nextStage = representativeEpisodeStage(record.aggregate);
        setStage(nextStage);
        setVerifiedProjectId(projectId);
        setTitle((current) => current.trim() ? current : record.aggregate.title);
      })
      .catch(() => {
        if (active) setProjectError(true);
      })
      .finally(() => {
        if (active) setProjectChecking(false);
      });
    return () => { active = false; };
  }, [userId, projectId, projectReload]);
  const [title, setTitle] = useState(() => searchParams.get("title")?.trim() ?? "");
  const [description, setDescription] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState(() => searchParams.get("canonicalUrl")?.trim() ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [tags, setTags] = useState("");
  const [channels, setChannels] = useState<readonly string[]>(["external-webtoon-platforms", "rss-json-feed"]);
  const [result, setResult] = useState<PublishPackageResponse | null>(null);
  const [feedResult, setFeedResult] = useState<Awaited<ReturnType<typeof integrationPlatformClient.buildFeedPreview>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const clearPreparedFiles = () => {
    setResult(null);
    setFeedResult(null);
  };

  const toggleChannel = (id: string) => {
    if (busy) return;
    clearPreparedFiles();
    setChannels((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  const buildPackage = async () => {
    if (busy || !canBuild) return;
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const response = await integrationPlatformClient.buildPublishPackage({
        projectId: projectId.trim(),
        title: title.trim(),
        description,
        canonicalUrl: canonicalUrl.trim(),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        channels,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setResult(response);
    } catch (reason) {
      setMessage(await getApiErrorMessage(reason, integrationsStatusText("integrations.status.publish.packageFailed", "게시 패키지를 만들지 못했습니다.")));
    } finally {
      setBusy(false);
    }
  };

  const buildFeeds = async () => {
    if (busy || !canPrepare) return;
    setBusy(true);
    setFeedResult(null);
    setMessage(null);
    try {
      const publishedAt = scheduledAt
        ? new Date(scheduledAt).toISOString()
        : new Date().toISOString();
      const response = await integrationPlatformClient.buildFeedPreview({
        title: `${title || "ToonStudio"} feed`,
        homePageUrl: canonicalUrl,
        feedUrl: `${canonicalUrl.replace(/\/$/u, "")}/feed.xml`,
        description,
        items: [{
          id: `${projectId}:${publishedAt}`,
          url: canonicalUrl,
          title: title || "Untitled release",
          summary: description,
          datePublished: publishedAt,
        }],
      });
      setFeedResult(response);
    } catch (reason) {
      setMessage(await getApiErrorMessage(reason, integrationsStatusText("integrations.status.publish.feedPreviewFailed", "피드 미리보기를 만들지 못했습니다.")));
    } finally {
      setBusy(false);
    }
  };

  // compact 칩은 현재 단계가 있을 때만 존재한다(공용 스텝퍼 compact와 같은 규칙).
  const stageCurrent = stage?.states.find((state) => state.status === "current") ?? null;
  const trimmedTitle = title.trim();
  const projectVerified = Boolean(userId && projectId && verifiedProjectId === projectId);
  const validSchedule = !scheduledAt || Number.isFinite(new Date(scheduledAt).getTime());
  const canPrepare = Boolean(projectVerified && trimmedTitle && canonicalUrl.trim() && validSchedule);
  const canBuild = canPrepare && channels.length > 0;
  const missingHints = [
    !projectVerified ? (ko ? "제작 프로젝트 선택·확인" : "a verified production project") : null,
    !trimmedTitle ? (ko ? "제목" : "a title") : null,
    !canonicalUrl.trim() ? (ko ? "작품 대표 주소" : "the work's main URL") : null,
    channels.length === 0 ? (ko ? "채널 한 곳" : "at least one channel") : null,
    !validSchedule ? (ko ? "유효한 희망 시각" : "a valid planned time") : null,
  ].filter((hint): hint is string => hint !== null);
  // 태그·설명 같은 선택 입력은 기본 화면에서 접어 둔다 — 처음 온 사람이 마주하는 결정은
  // 제목·대표 주소가 우선이며 희망 시각은 계획으로만 기록한다. 값이 들어 있으면 펼친 채로 시작한다.
  const [optionalOpen, setOptionalOpen] = useState(false);
  const optionalVisible = optionalOpen || Boolean(tags || description);
  const scheduledLabel = scheduledAt && validSchedule
    ? new Date(scheduledAt).toLocaleString(ko ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <IntegrationPage
      eyebrow={ko ? "연재 센터" : "Serialization center"}
      title={ko ? "연재 센터" : "Serialization center"}
      description={ko
        ? "제작 프로젝트의 제목·대표 주소·채널을 게시 정보 JSON으로 준비합니다. 원고 변환·업로드·게시 예약은 각 플랫폼에서 별도로 진행하세요."
        : "Prepare a production project's title, main URL and channels as a publication JSON file. Convert and upload manuscripts and arrange publication in each platform separately."}
    >
      <SiteContextualSubNav className="mb-5" />
      <details id="publish-project-selection" open={projectSelectionOpen} onToggle={(event) => setProjectSelectionOpen(event.currentTarget.open)} className="mb-5 rounded-2xl border border-line bg-card">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-fg focus-visible:outline-2 focus-visible:outline-accent">
          {projectId ? (ko ? "다른 제작 프로젝트 선택" : "Choose another production project") : (ko ? "게시 준비할 제작 프로젝트 선택" : "Choose a production project")}
        </summary>
        <div className="border-t border-line p-3">
          <SerialCenterOverview
            ko={ko}
            selectionDisabled={busy}
            onSelectProject={(project) => {
              if (busy) return;
              setProjectId(project.projectId);
              setTitle(project.title);
              setDescription(""); setTags(""); setScheduledAt(""); setCanonicalUrl("");
              clearPreparedFiles(); setMessage(null); setProjectSelectionOpen(false);
              const target = document.getElementById("serial-publish-target");
              target?.scrollIntoView?.({ block: "start" }); target?.focus();
            }}
          />
        </div>
      </details>
      {!projectId ? <p className="mb-5 rounded-xl border border-line bg-panel p-4 text-sm text-fg-2" role="status">{ko ? "게시 정보를 준비하려면 위 목록에서 제작 프로젝트를 선택하세요." : "Choose an existing production project above before preparing its publication information."}</p> : null}
      {projectChecking ? <p className="mb-4 text-sm text-fg-2" role="status">{ko ? "선택한 제작 프로젝트를 확인하고 있어요." : "Checking the selected production project."}</p> : null}
      {projectError ? <div role="alert" className="mb-5 rounded-xl border border-warn/30 bg-panel p-4 text-sm text-fg-2">
        <p>{ko ? "제작 프로젝트를 확인하지 못했어요. 입력은 유지됩니다. 다시 확인하거나 제작 관리에서 프로젝트를 선택하세요." : "Could not verify this production project. Your input is retained. Retry or choose a project in Production."}</p>
        <button type="button" disabled={busy || projectChecking} onClick={() => setProjectReload((current) => current + 1)} className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-line px-3 font-semibold">{ko ? "프로젝트 다시 확인" : "Retry project check"}</button>
      </div> : null}
      <Link to={projectVerified ? `/production/projects/${encodeURIComponent(projectId)}/overview` : "/production/projects"} className="mb-5 inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-semibold text-accent hover:underline">{projectVerified ? (ko ? "선택한 프로젝트로 돌아가기" : "Return to this project") : (ko ? "제작 프로젝트 목록으로" : "Production projects")}</Link>
      {loading ? <IntegrationLoading /> : null}
      {error ? <IntegrationError message={error} onRetry={refresh} /> : null}
      {catalog ? (
        <div className="space-y-6">
          {/* 발행할 작품 히어로 — 제목 포스터·준비 상태·다음 행동을 한눈에. */}
          <section id="serial-publish-target" tabIndex={-1} className="scroll-mt-24 overflow-hidden rounded-3xl border border-line bg-card" aria-label={ko ? "게시 준비할 작품" : "Work to prepare"}>
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
              <div
                aria-hidden="true"
                className="relative hidden aspect-[3/4] w-28 shrink-0 sm:block overflow-hidden rounded-2xl sm:w-36"
                style={{ background: posterBackground(trimmedTitle || projectId) }}
              >
                <span className="absolute -right-3 -top-5 select-none text-[6.5rem] font-black leading-none text-[oklch(0.98_0.01_70/0.22)]">
                  {(trimmedTitle || projectId).slice(0, 1)}
                </span>
                <span className="absolute inset-x-3 bottom-3 line-clamp-3 text-sm font-black leading-snug text-[oklch(0.98_0.01_70)]">
                  {trimmedTitle || (ko ? "제목 없는 작품" : "Untitled work")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
                  {ko ? "이번에 준비할 게시 정보" : "Publication information to prepare"}
                </p>
                <h2 className="mt-1.5 truncate text-2xl font-black tracking-tight text-fg">
                  {trimmedTitle || (ko ? "제목 없는 작품" : "Untitled work")}
                </h2>
                <p className="mt-1 truncate text-sm text-fg-3">
                  {canonicalUrl.trim() || (ko ? "작품 대표 주소 미입력" : "No main URL yet")}
                </p>
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={ko ? "준비 상태" : "Readiness"}>
                  <li className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${trimmedTitle ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
                    {trimmedTitle ? <CheckCircle2 size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />}
                    {ko ? "제목" : "Title"} {trimmedTitle ? (ko ? "입력됨" : "set") : (ko ? "비어 있음" : "missing")}
                  </li>
                  <li className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${channels.length > 0 ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
                    {channels.length > 0 ? <CheckCircle2 size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />}
                    {ko ? `채널 ${channels.length}곳 선택` : `${channels.length} channel(s) selected`}
                  </li>
                  <li className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-xs font-semibold text-fg-2">
                    {scheduledLabel
                      ? (ko ? `희망 시각 ${scheduledLabel} · 계획` : `Planned time ${scheduledLabel}`)
                      : (ko ? "희망 시각 미입력" : "No planned time entered")}
                  </li>
                  {result ? (
                    <li className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${result.ready ? "bg-good/10 text-good" : "bg-danger/10 text-danger"}`}>
                      <PackageCheck size={13} aria-hidden />
                      {result.ready ? (ko ? "게시 정보 JSON 준비됨" : "Publication JSON prepared") : (ko ? "채널 정보 확인 필요" : "Check channel information")}
                    </li>
                  ) : null}
                </ul>
                {projectVerified && stage && stageCurrent ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-fg-3">
                      {stage.selection?.episodeNumber
                        ? (ko ? `${stage.selection.episodeNumber}화 단계` : `Episode ${stage.selection.episodeNumber} stage`)
                        : (ko ? "지금 만드는 회차 단계" : "Current episode stage")}
                    </span>
                    <EpisodeStageStepper states={stage.states} variant="compact" />
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={busy || !canBuild}
                    onClick={() => void buildPackage()}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 sm:w-auto text-sm font-bold text-on-accent disabled:opacity-50"
                  >
                    <FileCheck2 size={16} aria-hidden /> {busy ? (ko ? "준비 중" : "Preparing") : (ko ? "게시 정보 JSON 준비" : "Prepare publication JSON")}
                  </button>
                  <p className="text-sm leading-6 text-fg-2" role="status">
                    {result
                      ? (result.ready ? (ko ? "게시 정보 파일이 준비됐어요. 외부 게시와 예약은 아직 실행되지 않았습니다." : "The information file is prepared. External publication and scheduling have not run.") : (ko ? "채널 정보를 확인하세요. 게시가 실행되지 않았습니다." : "Review channel information. No publication has run."))
                      : missingHints.length > 0
                        ? (ko ? `${missingHints.join(" · ")}만 채우면 만들 수 있어요.` : `Add ${missingHints.join(", ")} and you can build.`)
                        : (ko ? "선택한 채널 정보를 확인하고 게시 정보 파일을 준비할 수 있어요." : "Review the selected channels and prepare the publication information file.")}
                  </p>
                </div>
              </div>
            </div>
          </section>
          {message ? <p className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger" role="alert">{message}</p> : null}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-on-accent" aria-hidden>1</span>
                  <FileCheck2 size={19} aria-hidden /> {ko ? "게시 정보" : "Publication details"}
                </h2>
                {/* 작품은 위 연재 현황에서 고르거나 링크로 들고 온다 — 내부 식별자(프로젝트 ID)를
                    사람이 직접 입력하게 하지 않는다. 식별자는 상태로만 들고 다닌다. */}
                <p className="mt-4 rounded-xl bg-panel px-3 py-2.5 text-sm text-fg-2" role="status">
                  {trimmedTitle
                    ? (ko ? `선택한 작품 · ${trimmedTitle}` : `Selected work · ${trimmedTitle}`)
                    : (ko ? "위 목록에서 게시 준비할 제작 프로젝트를 먼저 선택하세요." : "Choose a production project from the list above.")}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-fg-2">
                    {ko ? "제목" : "Title"}
                    <input required disabled={busy} value={title} onChange={(event) => { setTitle(event.currentTarget.value); clearPreparedFiles(); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                  </label>
                  <div className="text-sm font-semibold text-fg-2">
                    <label htmlFor="publish-planned-at">{ko ? "게시 희망 시각 · 계획 기록" : "Planned publication time · record only"}</label>
                    <input id="publish-planned-at" aria-describedby="publish-planned-help" type="datetime-local" disabled={busy} value={scheduledAt} onChange={(event) => { setScheduledAt(event.currentTarget.value); clearPreparedFiles(); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                    <span id="publish-planned-help" className="mt-1 block text-xs font-normal leading-5 text-fg-3">{ko ? "JSON과 피드 미리보기에 날짜를 기록합니다. 외부 플랫폼의 예약을 등록하지 않습니다." : "Records a date in the JSON and feed preview. It does not book a release in an external platform."}</span>
                  </div>
                  <div className="text-sm font-semibold text-fg-2 sm:col-span-2">
                    <label htmlFor="publish-canonical-url">{ko ? "작품 대표 주소" : "Work's main URL"}</label>
                    <input id="publish-canonical-url" aria-describedby="publish-canonical-help" type="url" disabled={busy} value={canonicalUrl} onChange={(event) => { setCanonicalUrl(event.currentTarget.value); clearPreparedFiles(); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                    <span id="publish-canonical-help" className="mt-1 block text-xs font-normal leading-5 text-fg-3">
                      {ko ? "독자가 실제로 작품을 볼 수 있는 주소를 입력하세요." : "Enter the actual address where readers can view this work."}
                    </span>
                  </div>
                </div>
                <details
                  open={optionalVisible}
                  onToggle={(event) => setOptionalOpen(event.currentTarget.open)}
                  className="group mt-4 rounded-xl border border-line/70"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold text-fg-2 outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                    {ko ? "선택 입력 · 태그와 설명" : "Optional · tags and description"}
                    <ChevronDown size={15} aria-hidden className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <div className="grid gap-4 border-t border-line/70 p-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-fg-2">
                      {ko ? "태그(쉼표 구분)" : "Tags (comma separated)"}
                      <input disabled={busy} value={tags} onChange={(event) => { setTags(event.currentTarget.value); clearPreparedFiles(); }} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-fg" />
                    </label>
                    <label className="text-sm font-semibold text-fg-2">
                      {ko ? "설명" : "Description"}
                      <textarea disabled={busy} value={description} onChange={(event) => { setDescription(event.currentTarget.value); clearPreparedFiles(); }} rows={3} className="mt-1 w-full rounded-xl border border-line bg-canvas p-3 text-fg" />
                    </label>
                  </div>
                </details>
              </section>
              <section className="rounded-2xl border border-line bg-card p-5">
                <fieldset>
                  <legend className="flex items-center gap-2 text-lg font-bold text-fg">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-on-accent" aria-hidden>2</span>
                    {ko ? "어느 채널의 정보를 준비할까요" : "Which channels should the file describe?"}
                  </legend>
                  <p className="mt-2 text-sm leading-6 text-fg-2">
                    {ko
                      ? "파일에 포함할 채널을 고르세요. 채널 선택이나 JSON 준비만으로 업로드·게시가 실행되지 않습니다."
                      : "Choose the channels to describe. Selecting a channel or preparing JSON does not upload or publish anything."}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {publishingProviders.map((provider) => (
                      <ChannelCard
                        key={provider.id}
                        provider={provider}
                        selected={channels.includes(provider.id)}
                        ko={ko}
                        onToggle={() => toggleChannel(provider.id)}
                        disabled={busy}
                      />
                    ))}
                    <div className="flex flex-col rounded-2xl border border-dashed border-line bg-panel/50 p-4">
                      <strong className="flex items-center gap-2 text-sm text-fg">
                        <Rss size={16} aria-hidden className="text-accent" /> {ko ? "피드 파일 미리보기" : "Preview feed files"}
                      </strong>
                      <span className="mt-1.5 text-xs leading-5 text-fg-3">
                        {ko
                          ? "RSS · JSON Feed · ActivityPub 파일 내용을 준비합니다. 구독 주소의 게시·호스팅은 별도로 진행하세요."
                          : "Prepare RSS, JSON Feed and ActivityPub file contents. Publish and host the subscription address separately."}
                      </span>
                      <button
                        type="button"
                        disabled={busy || !canPrepare}
                        onClick={() => void buildFeeds()}
                        className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg disabled:opacity-50"
                      >
                        <Rss size={15} aria-hidden /> {ko ? "피드 파일 미리보기" : "Preview feed files"}
                      </button>
                    </div>
                  </div>
                </fieldset>
              </section>
            </div>
            <aside className="space-y-5">
              <section className="rounded-2xl border border-line bg-card p-5" aria-label={ko ? "패키지 결과" : "Package result"}>
                <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-on-accent" aria-hidden>3</span>
                  {ko ? "패키지 결과" : "Package result"}
                </h2>
                {!result ? <p className="mt-3 text-sm leading-6 text-fg-2">{ko ? "입력과 채널을 확인한 뒤 게시 정보 JSON을 준비하세요." : "Prepare publication JSON after reviewing the details and channels."}</p> : (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-panel p-3"><p className="text-xs text-fg-3">{ko ? "등록 채널 확인" : "Registered channels"}</p><p className="mt-1 font-bold text-fg">{result.ready ? integrationsStatusText("integrations.status.publish.validationPassed", "통과") : integrationsStatusText("integrations.status.publish.validationFailed", "실패")}</p></div>
                      <div className="rounded-xl bg-panel p-3"><p className="text-xs text-fg-3">{ko ? "후속 전달" : "Next handoff"}</p><p className="mt-1 font-bold text-fg">{result.directlyExecutable ? (ko ? "연동 사용 가능 · 미게시" : "Integration available · unpublished") : (ko ? "수동 전달 필요" : "Manual handoff required")}</p></div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-fg-2">{ko ? "생성 결과는 게시 정보 JSON입니다. 이미지 변환·ZIP 생성·업로드·예약 등록·게시 완료를 뜻하지 않습니다." : "The output is publication metadata JSON. It does not convert images, create a ZIP, upload, schedule or complete publication."}</p>
                    <ul className="mt-4 space-y-2">
                      {result.channels.map((channel) => (
                        <li key={channel.id} className="flex gap-3 rounded-xl border border-line p-3 text-sm">
                          {channel.valid
                            ? <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-good" />
                            : <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-danger" />}
                          <div className="min-w-0">
                            <strong className="text-fg">{channel.name ?? channel.id}</strong>
                            <span className="mt-0.5 block text-xs text-fg-3">
                              {channel.mode.startsWith("manual") ? (ko ? "수동 업로드" : "Manual upload") : (ko ? "채널 연동 정보" : "Channel integration information")} · {channel.executable ? (ko ? "연동 가능 · 실행 전" : "Integration available · not executed") : (ko ? "업로드 후 직접 확인" : "Confirm after uploading")}
                            </span>
                            {channel.reason ? <span className="mt-1 block text-xs leading-5 text-fg-2">{channel.reason}</span> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => downloadIntegrationJson(`publish-${result.projectId}.json`, result)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg">
                      <Download size={15} aria-hidden /> {ko ? "게시 정보 JSON 다운로드" : "Download publication JSON"}
                    </button>
                    <details className="mt-4 rounded-xl border border-line p-3">
                      <summary className="min-h-11 cursor-pointer text-sm font-semibold text-fg-2">{ko ? "준비 파일 확인 정보" : "Prepared file details"}</summary>
                      {result.notices.map((notice) => <p key={notice} className="mt-2 text-xs leading-5 text-fg-2">{notice}</p>)}
                      <p className="mt-3 break-all font-mono text-[0.68rem] text-fg-3">sha256:{result.packageDigest}</p>
                    </details>
                  </>
                )}
              </section>
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="text-lg font-bold text-fg">RSS · JSON Feed · ActivityPub</h2>
                {!feedResult ? <p className="mt-3 text-sm leading-6 text-fg-2">{ko ? "미리보기 후 파일을 내려받을 수 있습니다. 이 화면은 피드를 호스팅하거나 공개 주소를 개설하지 않습니다." : "Preview and download the files. This screen does not host feeds or create a public subscription address."}</p> : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => downloadIntegrationText("feed.xml", feedResult.rss, "application/rss+xml;charset=utf-8")} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 py-2 text-sm font-semibold">RSS</button>
                    <button type="button" onClick={() => downloadIntegrationJson("feed.json", feedResult.jsonFeed)} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 py-2 text-sm font-semibold">JSON Feed</button>
                    <button type="button" onClick={() => downloadIntegrationJson("activitypub.json", feedResult.activityPub)} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 py-2 text-sm font-semibold">ActivityPub</button>
                    <p className="w-full break-all pt-2 font-mono text-[0.68rem] text-fg-3">sha256:{feedResult.digest}</p>
                  </div>
                )}
              </section>
              <section className="rounded-2xl border border-line bg-panel/50 p-5 text-sm leading-6 text-fg-2">
                <strong className="block text-fg">{ko ? "게시 준비 다음 단계" : "After preparing the file"}</strong>
                {ko
                  ? "원고 파일은 작업실에서 내보내고, 각 채널에서 업로드·예약·공개 결과를 확인하세요. 이 화면에서 JSON을 준비하거나 다운로드해도 외부 게시가 완료되지는 않습니다."
                  : "Export manuscript files from Studio, then upload, schedule and verify publication in each channel. Preparing or downloading JSON here does not complete external publication."}
              </section>
            </aside>
          </div>
        </div>
      ) : null}
      <details className="group/publish-guide mt-6 rounded-2xl border border-line bg-panel" aria-label={ko ? "원고 출력·게시 계획 안내" : "Manuscript export and publication planning guide"}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-fg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          {ko ? "원고 출력·게시 계획 안내" : "Manuscript export and publication planning guide"}
          <ChevronDown size={15} aria-hidden className="transition-transform group-open/publish-guide:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="space-y-4 border-t border-line p-4 text-sm leading-6 text-fg-2">
          <p>{ko ? "이 화면의 출력은 제목·주소·채널·태그·설명·희망 시각을 담은 JSON입니다. 원고 이미지의 크기·용량·컷 분할은 작업실 출력에서 설정하고, 제출처의 최신 안내를 확인하세요." : "This screen outputs JSON with title, URL, channels, tags, description and planned time. Configure manuscript image dimensions, size and slices in Studio and check the destination's current requirements."}</p>
          <p>{ko ? "해외 동시 공개와 유료 미리보기 기간은 각 플랫폼에서 별도로 설정·확인하세요. 여기서 시간대를 동기화하거나 공개 범위를 자동으로 잠그지 않습니다." : "Set and verify regional release times and paid-preview windows in each platform. This screen does not synchronize time zones or lock publication visibility."}</p>
          <PublishSurfaceGuide surface="serial" />
          <PublishSurfaceCrossBridge ko={ko} />
        </div>
      </details>
    </IntegrationPage>
  );
}

function ChannelCard({
  provider,
  selected,
  ko,
  onToggle,
  disabled,
}: Readonly<{
  provider: IntegrationProviderStatus;
  selected: boolean;
  ko: boolean;
  onToggle: () => void;
  disabled: boolean;
}>) {
  const inputId = `publish-channel-${provider.id}`;
  const ready = provider.status === "ready" || provider.status === "manual";
  return (
    <label
      htmlFor={inputId}
      className={`flex cursor-pointer flex-col rounded-2xl border p-4 transition ${
        selected
          ? "border-accent bg-accent/5 ring-1 ring-accent"
          : "border-line bg-card hover:border-fg-3"
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <strong className="flex items-center gap-2 text-sm text-fg">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: providerDotColor(provider.id) }} />
          {provider.name}
        </strong>
        <input
          id={inputId}
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          className="mt-0.5 h-5 w-5 shrink-0 [accent-color:var(--color-accent)]"
        />
      </span>
      <span className="mt-2 line-clamp-2 text-xs leading-5 text-fg-2">{provider.summary}</span>
      <span className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${ready ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
          {INTEGRATION_PROVIDER_STATUS_LABELS[provider.status]}
        </span>
        <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[0.7rem] text-fg-3">
          {provider.connectionMode}
        </span>
      </span>
      {provider.status === "manual" ? (
        <span className="mt-2 text-xs font-semibold text-fg-2">
          {ko ? "직접 업로드용 패키지로 준비돼요" : "Prepared as a manual-upload package"}
        </span>
      ) : null}
    </label>
  );
}
