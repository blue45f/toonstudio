import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import {
  listProductionProjects,
  type ProductionProjectSummary,
} from "@/domains/creator/public/production-projects";
import { NowCard } from "@/shared/components/layout/NowCard";
import { deriveNowCard } from "@/shared/components/layout/now-card-model";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import Link from "@/shared/navigation/router-link";

import { HomePersonalStrip } from "./HomePersonalStrip";

/** 오늘 자정 기준 D-day — 마감 규칙(③)의 daysUntil은 표면이 오늘 기준으로 계산해 넘긴다(now-card-model 계약). */
function daysUntil(iso: string): number {
  const target = new Date(iso);
  const now = new Date();
  const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((dayStart(target) - dayStart(now)) / 86_400_000);
}

function episodesHref(project: ProductionProjectSummary): string {
  return `/production/projects/${encodeURIComponent(project.projectId)}/episodes`;
}

/**
 * 사이트 홈(/)의 "지금 할 일" (BLUEPRINT §3.2 확산, S3-5).
 *
 * 실제 이어하기·가까운 일정은 소개보다 먼저, 빈 상태·완료·불러오기 폴백은 소개 다음에 둔다.
 * 게스트에게는 카드를 만들지 않는다(작품이 없다고 단정할 근거가 없다).
 * 로그인 사용자는 연재 센터 현황이 쓰는 같은 권위(listProductionProjects)로
 * 작품 목록을 읽어 공용 순수 함수(deriveNowCard)에 신호만 넘긴다. 목록을 읽는
 * 동안·실패하면 기존 개인 스트립이 그대로 개인 동선을 소유한다 — 카드가
 * 로딩 실패로 기존 동선을 지우지 않게 하기 위해서다.
 * 정렬은 연재 센터 현황과 같은 기준(밀린 작품 먼저, 다음 발행이 가까운 순)을
 * 써서 두 표면이 같은 작품을 "다음"으로 지목하게 한다.
 */
export function HomeNowCard({ children }: { readonly children?: ReactNode }) {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const { data, ready, status } = useSession();
  const userId = useApp((state) => state.userId);
  const authenticatedUserId = ready && status === "authenticated" ? data.user.id : null;
  const ownerId = authenticatedUserId && authenticatedUserId === userId ? authenticatedUserId : null;
  const [projectList, setProjectList] = useState<{
    readonly ownerId: string;
    readonly projects: readonly ProductionProjectSummary[];
  } | null>(null);
  // 세션과 앱의 계정이 바뀐 렌더부터 이전 원고를 숨긴다.
  const projects = projectList?.ownerId === ownerId ? projectList.projects : null;

  useEffect(() => {
    setProjectList(null);
    if (!ownerId) return;
    let active = true;
    void listProductionProjects()
      .then((result) => {
        if (active) setProjectList({ ownerId, projects: result.projects });
      })
      .catch(() => {
        // 실패한 목록은 기존 개인 스트립으로 이어진다.
        if (active) setProjectList(null);
      });
    return () => {
      active = false;
    };
  }, [ownerId]);

  const nowCard = useMemo(() => {
    if (!projects) return null;
    const sorted = [...projects].sort((a, b) => {
      const overdueOrder = Number(b.overdueTaskCount > 0) - Number(a.overdueTaskCount > 0);
      if (overdueOrder !== 0) return overdueOrder;
      const aNext = a.nextReleaseAt ? new Date(a.nextReleaseAt).getTime() : Number.POSITIVE_INFINITY;
      const bNext = b.nextReleaseAt ? new Date(b.nextReleaseAt).getTime() : Number.POSITIVE_INFINITY;
      if (aNext !== bNext) return aNext - bNext;
      return a.title.localeCompare(b.title);
    });
    const top = sorted[0];
    const nearestRelease = sorted
      .filter((project) => project.nextReleaseAt)
      .sort((a, b) => new Date(a.nextReleaseAt ?? "").getTime() - new Date(b.nextReleaseAt ?? "").getTime())[0];
    const nearestReleaseAt = nearestRelease?.nextReleaseAt ?? null;
    return deriveNowCard({
      // ② 진행 중 회차 — 진행 중이거나 밀린 작업이 있는 작품이 있을 때만.
      resume: top && (top.activeEpisodeCount > 0 || top.overdueTaskCount > 0)
        ? {
            href: episodesHref(top),
            projectTitle: top.title,
            summary: bi(
              `${top.title} · 진행 중 회차 ${top.activeEpisodeCount}개 · 준비된 회차 ${top.readyBufferCount}개${top.overdueTaskCount > 0 ? ` · 밀린 작업 ${top.overdueTaskCount}개` : ""}`,
              `${top.title} · ${top.activeEpisodeCount} episode(s) in progress · ${top.readyBufferCount} ready${top.overdueTaskCount > 0 ? ` · ${top.overdueTaskCount} overdue task(s)` : ""}`,
            ),
          }
        : null,
      // ③ 가장 가까운 다음 발행 — 창(3일) 판정은 모델이 한다.
      deadline: nearestRelease && nearestReleaseAt
        ? {
            href: episodesHref(nearestRelease),
            label: bi(`${nearestRelease.title} 다음 발행`, `Next release of ${nearestRelease.title}`),
            daysUntil: daysUntil(nearestReleaseAt),
          }
        : null,
      hasProject: projects.length > 0,
      startHref: "/create",
      allClearHref: top ? episodesHref(top) : "/home",
    }, bi);
  }, [projects, bi]);

  // 비동기 목록이 도착해 순서가 바뀌어도 입력·Luna의 DOM과 초점을 보존한다.
  const introduction = children == null ? null : <Fragment key="home-introduction">{children}</Fragment>;
  if (!ready || status !== "authenticated" || (userId !== null && ownerId === null)) return introduction;
  if (!nowCard) return <>{introduction}<HomePersonalStrip key="personal-strip" /></>;
  const card = (
    <NowCard
      key="home-now-card"
      className="mt-5"
      eyebrow={bi("지금 할 일", "Do this now")}
      title={nowCard.title}
      reason={nowCard.reason}
      progress={nowCard.progress}
      tone={nowCard.tone}
      dismissible={nowCard.dismissible}
      action={(
        <Link className="rd-personal-primary" href={nowCard.href}>
          {nowCard.actionLabel}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    />
  );
  return <>{nowCard.ruleId === "resume" || nowCard.ruleId === "deadline"
    ? [card, introduction] : [introduction, card]}</>;
}
