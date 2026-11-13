import "../studio-shell/creator-workflow-surfaces.css";
import "./production-front-door.css";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  CloudOff,
  Columns2,
  GalleryVerticalEnd,
  Kanban,
  Layers3,
  LayoutDashboard,
  MessageSquareMore,
  Plus,
  RefreshCw,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  getProductionPersonalInbox,
  getProductionProjectCollabRecord,
  listProductionProjects,
  type ProductionPersonalInboxItem,
  type ProductionProjectSummary,
} from "./production-dashboard-api";
import { formatProductionDay } from "./production-format";
import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import { ProductionLandingOverview } from "./ProductionLandingOverview";
import { ProductionCreateProjectEntry } from "./ProductionCreateProjectEntry";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { PRODUCTION_PROCESS_LABELS } from "./production-labels";
import { reviewInboxItemHref } from "./review-request-model";
import { ProductionMetric, ProductionPill, ProductionSampleBadge, type ProductionTone } from "./production-ui";
import { CollabNotificationInbox } from "./CollabNotificationInbox";
import {
  collabInboxReadIds,
  markAllCollabInboxRead,
  markCollabInboxRead,
  projectCollabInbox,
  type CollabInboxItem,
} from "./collab-notification-model";
import {
  collabEventsFromPersonalInboxItems,
  collabEventsFromProjectAggregate,
  collabEventsFromTeamCommentThreads,
  loadCollabInboxReadIds,
  saveCollabInboxReadIds,
} from "./collab-notification-landing-source";
import { listStudioTeamComments } from "../studio-team-comment-client";

import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { getApiErrorMessage } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";
import { trimTrailingSlashes } from "@/shared/lib/trim-trailing-slashes";

const SAMPLE_BASE = "/production/projects/sample-project";

interface Copy {
  readonly ko: string;
  readonly en: string;
}

interface FlowStep {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: Copy;
  readonly copy: Copy;
  readonly href: string;
  readonly art: string;
}

/** 샘플 진입 뒤 바로 선택할 수 있는 세 가지 제작 목적. */
const FLOW_STEPS: readonly FlowStep[] = [
  {
    id: "board",
    icon: Kanban,
    title: { ko: "공정 정리", en: "Organize production" },
    copy: { ko: "담당과 마감을 정하고 진행 상태를 확인하세요.", en: "Set owners and deadlines, then follow progress." },
    href: `${SAMPLE_BASE}/production?boardLayout=process`,
    art: "storyboard",
  },
  {
    id: "room",
    icon: MessageSquareMore,
    title: { ko: "원고 피드백", en: "Give manuscript feedback" },
    copy: { ko: "원고 위에 수정할 곳을 표시하세요.", en: "Mark the places that need changes on the page." },
    href: `${SAMPLE_BASE}/episodes/episode-12`,
    art: "canvas-noir",
  },
  {
    id: "approve",
    icon: BadgeCheck,
    title: { ko: "검수·승인", en: "Review and approve" },
    copy: { ko: "수정 요청과 승인 상태를 확인하세요.", en: "Check requested changes and approvals." },
    href: `${SAMPLE_BASE}/review`,
    art: "project-crimson",
  },
];

interface ModuleCard {
  readonly icon: LucideIcon;
  readonly title: Copy;
  readonly copy: Copy;
  readonly href: string;
}

const MODULES: readonly ModuleCard[] = [
  { icon: Kanban, title: { ko: "공정 보드", en: "Process board" }, copy: { ko: "담당·마감·진행 상태 관리", en: "Manage owners, deadlines and progress" }, href: `${SAMPLE_BASE}/production` },
  { icon: MessageSquareMore, title: { ko: "회차 룸", en: "Episode room" }, copy: { ko: "원고 뷰어와 핀 코멘트", en: "Page viewer with pinned comments" }, href: `${SAMPLE_BASE}/episodes/episode-12` },
  { icon: Layers3, title: { ko: "원고·버전", en: "Manuscripts" }, copy: { ko: "최신본과 최종본을 나눠 관리", en: "Latest vs. final versions" }, href: `${SAMPLE_BASE}/manuscripts` },
  { icon: Columns2, title: { ko: "버전 비교", en: "Compare versions" }, copy: { ko: "선화와 채색을 나란히 확인", en: "Compare line art and color versions" }, href: `${SAMPLE_BASE}/episodes/episode-12?roomView=compare` },
  { icon: ClipboardCheck, title: { ko: "검수·승인", en: "Review" }, copy: { ko: "역할별 승인과 게시 조건 확인", en: "Check role approvals and publishing requirements" }, href: `${SAMPLE_BASE}/review` },
  { icon: Users, title: { ko: "사람·권한", en: "People & access" }, copy: { ko: "소유자·관리자·멤버·게스트", en: "Owner, admin, member, guest" }, href: "/team/people" },
  { icon: BriefcaseBusiness, title: { ko: "구인·의뢰", en: "Hiring" }, copy: { ko: "팀원 모집과 작업 의뢰", en: "Recruit and commission work" }, href: "/collaborate" },
  { icon: GalleryVerticalEnd, title: { ko: "검수본 공개 전시", en: "Approved showcase" }, copy: { ko: "작가가 공개를 허락한 검수본", en: "Reviews creators chose to show" }, href: "/showcase/reviews" },
  { icon: LayoutDashboard, title: { ko: "샘플 프로젝트", en: "Sample project" }, copy: { ko: "로그인 없이 전체 흐름 체험", en: "Try the whole flow without signing in" }, href: `${SAMPLE_BASE}/overview` },
];

const INBOX_BUCKETS: Readonly<Record<ProductionPersonalInboxItem["bucket"], { readonly label: Copy; readonly tone: ProductionTone }>> = {
  dueToday: { label: { ko: "오늘 제출", en: "Due today" }, tone: "danger" },
  inProgress: { label: { ko: "진행 중", en: "In progress" }, tone: "accent" },
  review: { label: { ko: "내 검수", en: "To review" }, tone: "warning" },
  ready: { label: { ko: "시작 가능", en: "Ready" }, tone: "success" },
  waitingInput: { label: { ko: "입력 대기", en: "Waiting for input" }, tone: "warning" },
  blockingOthers: { label: { ko: "다른 작업 차단", en: "Blocking others" }, tone: "danger" },
};


/** 브랜드 원고 한 장으로 제작 흐름을 안내하며 실제 프로젝트 화면과 구분한다. */
function HeroPreview() {
  const bt = useBilingual("ProductionLandingPage");
  return (
    <figure className="production-front-preview" aria-label={bt("선화에서 채색으로 이어지는 제작 안내 이미지", "Production artwork from line art to color")}>
      <img src="/brand/workflow-20260928/create-640.webp"
        srcSet="/brand/workflow-20260928/create-320.webp 320w, /brand/workflow-20260928/create-640.webp 640w, /brand/workflow-20260928/create-960.webp 960w"
        sizes="(min-width: 1024px) 32rem, 90vw" width={960} height={600} alt="" aria-hidden="true" loading="eager" decoding="async" />
      <figcaption>{bt("제작 안내를 위한 브랜드 아트", "Brand artwork illustrating production")}</figcaption>
    </figure>
  );
}

function FlowCards() {
  const bt = useBilingual("ProductionLandingPage");
  return (
    <section aria-labelledby="production-flow-title" className="production-front-flow mt-6 sm:mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="production-flow-title" className="text-xl font-black tracking-tight text-fg">{bt("어떤 작업을 해 볼까요?", "What would you like to try?")}</h2>
          <p className="mt-1 text-sm text-fg-2">{bt("샘플에서 필요한 작업을 바로 열어 보세요.", "Open the task you need in the sample.")}</p>
        </div>
        <ProductionSampleBadge label={bt("예시 데이터", "Example data")} />
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {FLOW_STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <Link
                to={step.href}
                className="group flex h-full min-h-24 overflow-hidden rounded-2xl border border-line bg-card outline-none transition-colors hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none sm:flex-col"
              >
                <span className="production-front-step" aria-hidden="true"><Icon size={22} /></span>
                <span className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
                  <span className="flex items-center gap-2 text-sm font-black text-fg group-hover:text-accent">
                    {bt(step.title.ko, step.title.en)}
                  </span>
                  <span className="mt-1 text-xs leading-5 text-fg-2">{bt(step.copy.ko, step.copy.en)}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-bold text-accent">
                    {bt("열어 보기", "Open")}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ModuleGrid() {
  const bt = useBilingual("ProductionLandingPage");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !details?.open) return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector("summary")?.focus();
    }
    details.addEventListener("keydown", closeOnEscape);
    return () => details.removeEventListener("keydown", closeOnEscape);
  }, []);
  return (
    <section className="mt-6" aria-label={bt("제작 관리 도구", "Production management tools")}>
      <details ref={detailsRef} aria-labelledby="production-tools-title" className="group/tools rounded-2xl border border-line bg-card p-3 sm:p-4">
        <summary id="production-tools-title" className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 text-sm font-bold text-fg outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          {bt("제작 도구 더 보기", "More production tools")}
          <ChevronDown className="size-4 shrink-0 transition-transform group-open/tools:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <p className="mt-2 text-xs leading-5 text-fg-2">{bt("원고·버전과 팀 관리, 구인·의뢰를 찾을 수 있습니다. 샘플 화면의 데이터는 모두 예시입니다.", "Find manuscripts, versions, team management and hiring. Data in sample screens is illustrative.")}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <li key={module.href + module.title.ko}>
                <Link
                  to={module.href}
                  className="group flex h-full min-h-12 items-start gap-3 rounded-xl border border-line bg-panel p-3 outline-none transition-colors hover:border-accent/45 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon className="size-4" aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <strong className="block text-sm text-fg group-hover:text-accent">{bt(module.title.ko, module.title.en)}</strong>
                    <span className="mt-1 block text-xs leading-5 text-fg-2">{bt(module.copy.ko, module.copy.en)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <SiteArtSurfaceSpotlight cardId="nb-production-control" compact className="mt-4" />
      </details>
      <p className="mt-2 px-1 text-xs text-fg-3">{bt("원고·버전, 사람·권한, 구인·의뢰는 더 보기에서 찾으세요.", "Find manuscripts, people, access and hiring in More tools.")}</p>
    </section>
  );
}

function PortfolioSection({
  projects,
  inboxItems,
  loading,
  error,
  onRetry,
  collabItems,
  collabLoading,
  onOpenCollabItem,
  onMarkAllCollabRead,
}: {
  readonly projects: readonly ProductionProjectSummary[];
  readonly inboxItems: readonly ProductionPersonalInboxItem[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
  readonly collabItems: readonly CollabInboxItem[];
  readonly collabLoading: boolean;
  readonly onOpenCollabItem: (item: CollabInboxItem) => void;
  readonly onMarkAllCollabRead: () => void;
}) {
  const bt = useBilingual("ProductionLandingPage");
  const sum = (pick: (project: ProductionProjectSummary) => number) => projects.reduce((total, project) => total + pick(project), 0);
  return (
    <section className="creator-workflow-panel mt-8 rounded-2xl border border-line bg-card p-4 sm:p-5" aria-labelledby="production-portfolio-title">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="production-portfolio-title" className="text-base font-black text-fg">{bt("내 제작 포트폴리오", "My production portfolio")}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-2">{bt("여러 작품의 다음 연재와 막힌 작업·검수 대기·담당 없는 작업을 같은 기준으로 비교합니다. 위험한 작품이 먼저 보입니다.", "Compare upcoming releases, blocked work, pending reviews and unassigned tasks across projects. Riskier projects come first.")}</p>
        </div>
        <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })} to="/create"><Plus className="size-4" aria-hidden="true" />{bt("작품 시작하기", "Start a work")}</Link>
      </header>
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={bt("프로젝트 목록 불러오는 중", "Loading projects")} role="status">
          {[0, 1, 2].map((index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-raised motion-reduce:animate-none" />)}
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-bad/35 bg-bad/10 p-4">
          <p className="min-w-0 flex-1 text-sm text-fg">{error}</p>
          <button type="button" onClick={onRetry} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
            <RefreshCw size={13} aria-hidden="true" /> {bt("다시 불러오기", "Retry")}
          </button>
          <Link className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })} to={`${SAMPLE_BASE}/overview`}>{bt("그동안 샘플 보기", "Open the sample meanwhile")}</Link>
        </div>
      ) : projects.length > 0 ? (
        <div className="space-y-4">
          <ProductionLandingOverview projects={projects} inboxItems={inboxItems} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ProductionMetric label={bt("내 작품", "Projects")} value={String(projects.length)} detail={bt(`진행 회차 ${sum((project) => project.activeEpisodeCount)}개`, `${sum((project) => project.activeEpisodeCount)} active episodes`)} icon={LayoutDashboard} tone="accent" />
            <ProductionMetric label={bt("위험 작품", "At risk")} value={String(projects.filter((project) => project.healthScore < 64).length)} detail={bt(`기한 초과 ${sum((project) => project.overdueTaskCount)}건`, `${sum((project) => project.overdueTaskCount)} overdue`)} icon={AlertTriangle} tone={projects.some((project) => project.healthScore < 64) ? "danger" : "success"} />
            <ProductionMetric label={bt("완성 비축", "Ready buffer")} value={bt(`${sum((project) => project.readyBufferCount)}회`, `${sum((project) => project.readyBufferCount)}`)} detail={bt("게시 준비가 끝난 미공개 회차", "Finished, unreleased episodes")} icon={BadgeCheck} tone="success" />
            <ProductionMetric label={bt("검수 대기", "Waiting review")} value={String(sum((project) => project.reviewTaskCount))} detail={bt(`미배정 ${sum((project) => project.unassignedTaskCount)}건`, `${sum((project) => project.unassignedTaskCount)} unassigned`)} icon={ClipboardCheck} tone="warning" />
          </div>
          <div className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-fg">{bt("내 통합 작업함", "My inbox")}</h3>
                <p className="mt-1 text-xs text-fg-2">{bt("모든 작품에서 오늘 제출·진행·검수·입력 대기 업무를 우선순위 순으로 모았습니다.", "Due-today, in-progress, review and waiting work from every project, by priority.")}</p>
              </div>
              <ProductionPill tone="accent">{bt(`조치 ${inboxItems.length}건`, `${inboxItems.length} items`)}</ProductionPill>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {inboxItems.slice(0, 8).map((item) => {
                const bucket = INBOX_BUCKETS[item.bucket];
                return (
                  <Link
                    key={`${item.bucket}:${item.projectId}:${item.taskId}`}
                    to={reviewInboxItemHref(item)}
                    className="rounded-xl border border-line bg-card p-3 outline-none transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <ProductionPill tone={bucket.tone}>{bt(bucket.label.ko, bucket.label.en)}</ProductionPill>
                      <span className="text-[0.625rem] text-fg-3">{formatProductionDay(item.dueAt, bt("미정", "No date"))}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-black leading-5 text-fg">{item.taskTitle}</p>
                    <p className="mt-1 truncate text-[0.6875rem] text-fg-3">{item.projectTitle} · {(() => { const processLabel = PRODUCTION_PROCESS_LABELS[canonicalProductionProcessKey(item.processKey)]; return processLabel ? bt(processLabel.ko, processLabel.en) : item.processKey; })()} · {item.estimateHours === null ? bt("예상 시간 미입력", "No estimate") : `${item.estimateHours}h`}</p>
                    {item.bucket === "review" && item.episodeId ? (
                      <p className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-bold text-accent">
                        <Columns2 className="size-3.5" aria-hidden="true" />
                        {bt("비교 검수로 바로 열기", "Open in compare review")}
                      </p>
                    ) : null}
                  </Link>
                );
              })}
              {inboxItems.length === 0 ? <div className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3 md:col-span-2 xl:col-span-4">{bt("현재 배정된 조치 업무가 없습니다.", "Nothing assigned to you right now.")}</div> : null}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-4">
            <CollabNotificationInbox
              items={collabItems}
              loading={collabLoading}
              onOpenItem={onOpenCollabItem}
              onMarkAllRead={onMarkAllCollabRead}
            />
            <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">{bt("읽음 표시는 이 기기에 저장됩니다.", "Read marks are stored on this device.")}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const healthTone: ProductionTone = project.healthScore >= 82 ? "success" : project.healthScore >= 64 ? "warning" : "danger";
              return (
                <Link
                  key={project.projectId}
                  to={`/production/projects/${encodeURIComponent(project.projectId)}/overview`}
                  className="group rounded-2xl border border-line bg-panel p-4 outline-none transition-colors hover:border-accent/40 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-base font-black text-fg">{project.title}</p>
                    <ProductionPill tone={healthTone}>{bt(`건강 점수 ${project.healthScore}`, `Health score ${project.healthScore}`)}</ProductionPill>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[0.6875rem]">
                    <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">{bt("진행 회차", "Active")}</p><p className="mt-1 font-black text-fg">{project.activeEpisodeCount}</p></div>
                    <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">{bt("막힘·지연", "Blocked")}</p><p className={cn("mt-1 font-black", project.blockedTaskCount + project.overdueTaskCount > 0 ? "text-bad" : "text-fg")}>{project.blockedTaskCount + project.overdueTaskCount}</p></div>
                    <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">{bt("비축", "Buffer")}</p><p className="mt-1 font-black text-fg">{project.readyBufferCount}</p></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-fg-2">
                    <span>{bt("다음 공개", "Next release")} {formatProductionDay(project.nextReleaseAt, bt("미정", "TBD"))}</span>
                    <span className="flex items-center gap-1 font-bold text-accent">{bt("개요 열기", "Open")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <ActionableEmptyState
          icon={LayoutDashboard}
          title={bt("첫 제작 프로젝트를 연결하세요", "Connect your first production project")}
          description={bt("새 작품을 만든 뒤 제작 관리에 연결하면 회차·담당·마감·검수를 한 흐름에서 운영할 수 있습니다.", "Create a work, then connect it to run episodes, owners, deadlines and reviews in one flow.")}
          primary={{ href: "/create", label: bt("작품 시작하기", "Start a work") }}
          secondary={{ href: "/studio", label: bt("기존 작품 열기", "Open existing works") }}
          sample={{ href: `${SAMPLE_BASE}/overview`, label: bt("샘플로 먼저 보기", "See the sample first") }}
        />
      )}
    </section>
  );
}

export function ProductionLandingPage() {
  const t = useT();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const directoryMode = trimTrailingSlashes(pathname) === "/production/projects";
  const userId = useApp((state) => state.userId);
  const bt = useBilingual("ProductionLandingPage");
  const [projects, setProjects] = useState<readonly ProductionProjectSummary[]>([]);
  const [inboxItems, setInboxItems] = useState<readonly ProductionPersonalInboxItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(Boolean(userId));
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [collabItems, setCollabItems] = useState<readonly CollabInboxItem[]>([]);
  const [collabLoading, setCollabLoading] = useState(false);
  /** 프로젝트 목록 API 오류 시 "다시 불러오기" 버튼용 재시도 트리거. */
  const [projectsReloadToken, setProjectsReloadToken] = useState(0);

  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setInboxItems([]);
      setProjectsLoading(false);
      setProjectsError(null);
      return;
    }
    let active = true;
    setProjectsLoading(true);
    setProjectsError(null);
    void Promise.all([listProductionProjects(), getProductionPersonalInbox()])
      .then(([projectResult, inboxResult]) => {
        if (!active) return;
        setProjects(projectResult.projects);
        setInboxItems(inboxResult.items);
      })
      .catch(async (cause: unknown) => {
        if (active) setProjectsError(await getApiErrorMessage(cause, t("productionHub.landing.portfolioLoadFailed", "제작 포트폴리오를 불러오지 못했습니다.")));
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, projectsReloadToken, t]);

  /**
   * 통합 협업 알림 투영. 개인 작업함(검수 요청)은 이미 불러온 데이터로 즉시
   * 만들고, 프로젝트 aggregate(서버 알림·승인 결과·인계)와 팀 댓글(핀 멘션)은
   * 프로젝트별로 불러오되 한 프로젝트의 실패가 전체를 죽이지 않게 격리한다.
   * 읽음은 서버 알림의 읽음 상태 + 이 기기 로컬 저장(spec §3)을 합친다.
   */
  useEffect(() => {
    if (!userId) {
      setCollabItems([]);
      setCollabLoading(false);
      return;
    }
    if (projectsLoading) {
      setCollabLoading(true);
      return;
    }
    let active = true;
    setCollabLoading(true);
    const readIds = loadCollabInboxReadIds();
    const events = [
      ...collabEventsFromPersonalInboxItems(inboxItems, {
        projectUpdatedAtById: new Map(projects.map((project) => [project.projectId, project.updatedAt])),
        now: new Date(),
      }),
    ];
    void Promise.allSettled(
      projects.flatMap((project) => [
        getProductionProjectCollabRecord(project.projectId).then((record) => {
          const projected = collabEventsFromProjectAggregate(record.aggregate, userId);
          events.push(...projected.events);
          projected.serverReadIds.forEach((id) => readIds.add(id));
        }),
        listStudioTeamComments(project.workId, { status: "all", limit: 9, messageLimit: 51 }).then((response) => {
          events.push(
            ...collabEventsFromTeamCommentThreads(response.items, {
              projectId: project.projectId,
              currentUserId: userId,
            }),
          );
        }),
      ]),
    ).then(() => {
      if (!active) return;
      setCollabItems(projectCollabInbox(events, readIds));
      setCollabLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId, projectsLoading, projects, inboxItems]);

  const handleOpenCollabItem = (item: CollabInboxItem) => {
    setCollabItems((previous) => {
      const next = markCollabInboxRead(previous, item.id);
      saveCollabInboxReadIds(collabInboxReadIds(next));
      return next;
    });
    navigate(item.target.href);
  };

  const handleMarkAllCollabRead = () => {
    setCollabItems((previous) => {
      const next = markAllCollabInboxRead(previous);
      saveCollabInboxReadIds(collabInboxReadIds(next));
      return next;
    });
  };

  const IntroHeading = userId ? "h2" : "h1";
  const intro = (
    <header className="creator-workflow-intro production-front-intro relative overflow-hidden rounded-3xl border border-accent/25 bg-panel p-4 sm:p-8 lg:p-10">
          <span aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-accent/10 blur-3xl" />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-10 size-96 rounded-full bg-cool/10 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
                <span>ToonStudio</span><span aria-hidden="true">/</span><span>{directoryMode ? bt("제작 프로젝트", "Production projects") : bt("웹툰 제작 관리", "Webtoon production")}</span>
              </p>
              <IntroHeading className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-tight text-fg sm:text-5xl">
                {directoryMode
                  ? bt("제작 프로젝트를 찾고 바로 운영하세요", "Find a production project and run it")
                  : bt("웹툰 제작을 한 흐름으로", "Webtoon production in one flow")}
              </IntroHeading>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">
                {bt(
                  "공정을 정리하고, 원고에 피드백을 남기고, 검수하세요. 샘플로 먼저 둘러볼 수 있습니다.",
                  "Organize production, give manuscript feedback and review. Explore the sample first.",
                )}
              </p>
              <div className="production-front-actions mt-7 flex flex-wrap gap-3">
                <Link className={buttonClass({ size: "lg", className: "min-h-12 w-full gap-2 sm:w-auto" })} to={`${SAMPLE_BASE}/overview`}>
                  {bt("샘플 프로젝트로 체험하기", "Try the sample project")} <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link className={buttonClass({ variant: "outline", size: "lg" })} to="/create">
                  {bt("작품 시작하기", "Start a work")}
                </Link>
                {userId ? <ProductionCreateProjectEntry key={userId} actorId={userId} /> : null}
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-fg-3">
                <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
                {bt("로그인 없는 예시입니다. 변경은 같은 탭에서만 유지되고 새로고침하면 초기화됩니다.", "A sample without sign-in. Changes last in this tab and reset on reload.")}
              </p>
            </div>
            <div className="pb-6">
              <HeroPreview />
            </div>
          </div>
        </header>
  );
  return (
    <div data-creator-workflow="production-home" data-route-ready="production-home" className="min-h-dvh bg-canvas text-fg">
      <CampusObjectSource objects={projects.slice(0, 8).flatMap((project) => {
        const id = encodeURIComponent(project.projectId);
        return [
          { id: project.projectId, title: project.title, href: `/production/projects/${id}/overview`, kind: "project" as const, exposure: "private" as const },
          { id: `${project.projectId}.review`, title: `${project.title} · 검수`, href: `/production/projects/${id}/review`, kind: "review" as const, exposure: "private" as const },
          { id: `${project.projectId}.handoff`, title: `${project.title} · 인계`, href: `/production/projects/${id}/handoff`, kind: "handoff" as const, exposure: "private" as const },
        ];
      })} />
      <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8">


        {userId ? (
          <>
          <h1 className="text-2xl font-black text-fg sm:text-3xl">{bt("제작 프로젝트", "Production projects")}</h1>
          <PortfolioSection
            projects={projects}
            inboxItems={inboxItems}
            loading={projectsLoading}
            error={projectsError}
            onRetry={() => setProjectsReloadToken((token) => token + 1)}
            collabItems={collabItems}
            collabLoading={collabLoading}
            onOpenCollabItem={handleOpenCollabItem}
            onMarkAllCollabRead={handleMarkAllCollabRead}
          />
          </>
        ) : directoryMode ? (
          <section className="creator-workflow-panel mt-8 rounded-2xl border border-line bg-card p-5" aria-labelledby="production-directory-title">
            <h2 id="production-directory-title" className="text-base font-black text-fg">{bt("제작 프로젝트를 한곳에서 관리하세요", "Manage production projects in one place")}</h2>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-fg-2">{bt("로그인하면 팀 프로젝트가 일정·담당·검수 상태와 함께 표시됩니다. 기기 안의 개인 작품은 작품 라이브러리에서 계속 작업할 수 있습니다.", "Sign in to see team projects with schedule, owners and review status. Personal works stay in your library.")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className={buttonClass({ className: "min-h-11" })} to="/studio">{bt("내 작품 라이브러리", "My library")}</Link>
              <Link className={buttonClass({ variant: "outline", className: "min-h-11" })} to={`${SAMPLE_BASE}/overview`}>{bt("샘플 제작 프로젝트", "Sample project")}</Link>
            </div>
          </section>
        ) : null}

        {userId ? <details className="group mt-6 rounded-2xl border border-line bg-panel">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-bold text-fg-2">{bt("샘플 체험과 제작 안내", "Sample and production guide")}<span aria-hidden="true">⌄</span></summary>
          {intro}
          <FlowCards />
        </details> : <>
          {intro}
          <FlowCards />
        </>}
        <ModuleGrid />
      </div>
    </div>
  );
}
