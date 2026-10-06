import { ArrowRight, CalendarDays, CircleAlert, Clock3, Layers, LogIn, PackageOpen, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getApiErrorMessage } from "@/platform/api";
import { useApp } from "@/shared/lib/store";
import Link from "@/shared/navigation/router-link";

import {
  listProductionProjects,
  type ProductionProjectSummary,
} from "@/domains/creator/public/production-projects";

/**
 * 연재 센터 첫 화면의 "내 작품 연재 현황".
 *
 * 데이터는 제작 허브가 이미 쓰는 프로젝트 목록(listProductionProjects)을 그대로 읽는다.
 * 요약 필드(nextReleaseAt·readyBufferCount·overdueTaskCount 등)만으로 구성하며,
 * 없는 일정을 만들지 않는다 — 다음 발행이 잡혀 있지 않으면 "예정 없음"으로 표기한다.
 * 외부 카탈로그 작품은 사용자 프로젝트가 아니라 이 목록에 들어오지 않으며,
 * 그 구분과 독자용 연재표(/calendar)로의 동선을 하단에 명시한다.
 */
export function SerialCenterOverview({
  ko,
  onSelectProject,
}: Readonly<{
  ko: boolean;
  onSelectProject: (project: ProductionProjectSummary) => void;
}>) {
  const userId = useApp((state) => state.userId);
  const [projects, setProjects] = useState<readonly ProductionProjectSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void listProductionProjects()
      .then((result) => {
        if (active) setProjects(result.projects);
      })
      .catch(async (cause: unknown) => {
        if (active) setError(await getApiErrorMessage(cause, "연재 현황을 불러오지 못했습니다."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, reloadToken]);

  // 밀린 작품을 먼저, 그다음 다음 발행이 가까운 순으로 — "뭐가 밀렸고 뭐가 다음인가"가 첫 판단이다.
  const sorted = useMemo(() => [...projects].sort((a, b) => {
    const overdueOrder = Number(b.overdueTaskCount > 0) - Number(a.overdueTaskCount > 0);
    if (overdueOrder !== 0) return overdueOrder;
    const aNext = a.nextReleaseAt ? new Date(a.nextReleaseAt).getTime() : Number.POSITIVE_INFINITY;
    const bNext = b.nextReleaseAt ? new Date(b.nextReleaseAt).getTime() : Number.POSITIVE_INFINITY;
    if (aNext !== bNext) return aNext - bNext;
    return a.title.localeCompare(b.title);
  }), [projects]);

  const overdueTotal = useMemo(
    () => projects.reduce((sum, project) => sum + project.overdueTaskCount, 0),
    [projects],
  );
  const readyTotal = useMemo(
    () => projects.reduce((sum, project) => sum + project.readyBufferCount, 0),
    [projects],
  );

  return (
    <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-label={ko ? "내 작품 연재 현황" : "My works' serialization status"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
            {ko ? "연재 현황" : "Serialization status"}
          </p>
          <h2 className="mt-1.5 text-xl font-black tracking-tight text-fg">
            {ko ? "내 작품은 지금 어디까지 왔나" : "Where each of my works stands"}
          </h2>
        </div>
        {userId && !loading && !error && projects.length > 0 ? (
          <p className="text-sm text-fg-2" role="status">
            {ko
              ? `작품 ${projects.length}개 · 밀린 작업 ${overdueTotal}개 · 바로 올릴 수 있는 회차 ${readyTotal}개`
              : `${projects.length} work(s) · ${overdueTotal} overdue task(s) · ${readyTotal} episode(s) ready to publish`}
          </p>
        ) : null}
      </div>

      {!userId ? (
        <div className="mt-5 flex flex-col items-start gap-3 rounded-2xl bg-panel/60 p-5">
          <p className="text-sm leading-6 text-fg-2">
            {ko
              ? "로그인하면 내 작품의 다음 발행 예정, 준비된 회차, 밀린 작업을 여기서 한눈에 볼 수 있어요."
              : "Sign in to see each work's next release, ready episodes, and overdue tasks at a glance."}
          </p>
          <Link
            href="/auth/login"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
          >
            <LogIn size={15} aria-hidden /> {ko ? "로그인하기" : "Sign in"}
          </Link>
        </div>
      ) : loading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className="rounded-2xl border border-line p-4">
              <div className="skeleton h-5 w-2/5 rounded" />
              <div className="skeleton mt-3 h-4 w-4/5 rounded" />
              <div className="skeleton mt-2 h-4 w-3/5 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-5 flex flex-col items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-5" role="alert">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <CircleAlert size={16} aria-hidden /> {error}
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg"
          >
            <RefreshCw size={14} aria-hidden /> {ko ? "다시 시도" : "Retry"}
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-5 flex flex-col items-start gap-3 rounded-2xl bg-panel/60 p-5">
          <p className="text-sm leading-6 text-fg-2">
            {ko
              ? "아직 제작 중인 작품이 없어요. 첫 작품을 시작하면 연재 현황이 여기에 모입니다."
              : "No works in production yet. Start your first work and its serialization status will gather here."}
          </p>
          <Link
            href="/create"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
          >
            <PackageOpen size={15} aria-hidden /> {ko ? "작품 시작하기" : "Start a work"}
          </Link>
        </div>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {sorted.map((project) => (
            <SerialProjectCard key={project.projectId} project={project} ko={ko} onSelectProject={onSelectProject} />
          ))}
        </ul>
      )}

      <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-fg-3">
        {ko
          ? "이 현황은 내 작품(제작 프로젝트) 기준입니다. 외부 플랫폼 작품은 여기에 없어요 — 독자들이 보는 요일별 연재표는 "
          : "This status covers my works (production projects) only. External platform titles are not listed here — readers see them in the "}
        <Link href="/calendar" className="font-semibold text-accent underline-offset-2 hover:underline">
          {ko ? "연재 캘린더" : "serialization calendar"}
        </Link>
        {ko ? "에서 확인하세요." : "."}
      </p>
    </section>
  );
}

function SerialProjectCard({
  project,
  ko,
  onSelectProject,
}: Readonly<{
  project: ProductionProjectSummary;
  ko: boolean;
  onSelectProject: (project: ProductionProjectSummary) => void;
}>) {
  const nextReleaseLabel = project.nextReleaseAt
    ? new Date(project.nextReleaseAt).toLocaleString(ko ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-panel/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <strong className="min-w-0 truncate text-base font-bold text-fg">{project.title}</strong>
        {project.criticalRiskCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[0.7rem] font-semibold text-danger">
            <TriangleAlert size={11} aria-hidden /> {ko ? `위험 ${project.criticalRiskCount}` : `${project.criticalRiskCount} risk(s)`}
          </span>
        ) : null}
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <dt className="inline-flex shrink-0 items-center gap-1 text-fg-3">
            <Clock3 size={13} aria-hidden /> {ko ? "다음 발행" : "Next release"}
          </dt>
          <dd className="font-semibold text-fg">
            {nextReleaseLabel ?? (ko ? "예정 없음" : "Not scheduled")}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="inline-flex shrink-0 items-center gap-1 text-fg-3">
            <Layers size={13} aria-hidden /> {ko ? "회차" : "Episodes"}
          </dt>
          <dd className="text-fg-2">
            {ko
              ? `진행 중 ${project.activeEpisodeCount}개 · 준비됨 ${project.readyBufferCount}개`
              : `${project.activeEpisodeCount} in progress · ${project.readyBufferCount} ready`}
          </dd>
        </div>
        {project.overdueTaskCount > 0 ? (
          <div className="flex items-center gap-2">
            <dt className="inline-flex shrink-0 items-center gap-1 text-warn">
              <CircleAlert size={13} aria-hidden /> {ko ? "밀린 작업" : "Overdue"}
            </dt>
            <dd className="font-semibold text-warn">
              {ko ? `${project.overdueTaskCount}개` : `${project.overdueTaskCount} task(s)`}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSelectProject(project)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-on-accent"
        >
          {ko ? "이 작품으로 게시 준비" : "Prepare release"} <ArrowRight size={14} aria-hidden />
        </button>
        <Link
          href={`/production/projects/${encodeURIComponent(project.projectId)}/overview`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg"
        >
          <CalendarDays size={14} aria-hidden /> {ko ? "제작 현황" : "Production status"}
        </Link>
      </div>
    </li>
  );
}
