import { useEffect, useMemo, useState } from "react";
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
 * §3.3 홈 밴드 ②는 "로그인 시 이어하기/지금 할 일, 게스트는 예시 작품 선반"이다 —
 * 그래서 게스트에게는 카드를 만들지 않는다(작품이 없다고 단정할 근거가 없다).
 * 로그인 사용자는 연재 센터 현황이 쓰는 같은 권위(listProductionProjects)로
 * 작품 목록을 읽어 공용 순수 함수(deriveNowCard)에 신호만 넘긴다. 목록을 읽는
 * 동안·실패하면 기존 개인 스트립이 그대로 개인 동선을 소유한다 — 카드가
 * 로딩 실패로 기존 동선을 지우지 않게 하기 위해서다.
 * 정렬은 연재 센터 현황과 같은 기준(밀린 작품 먼저, 다음 발행이 가까운 순)을
 * 써서 두 표면이 같은 작품을 "다음"으로 지목하게 한다.
 */
export function HomeNowCard() {
  const bi = useBilingualLocalizer("domains.marketing.ReferenceCreatorDashboard");
  const { status } = useSession();
  const userId = useApp((state) => state.userId);
  const [projects, setProjects] = useState<readonly ProductionProjectSummary[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId) {
      setProjects(null);
      return;
    }
    let active = true;
    void listProductionProjects()
      .then((result) => {
        if (active) setProjects(result.projects);
      })
      .catch(() => {
        // 실패 시 projects는 null로 남고 아래에서 기존 스트립으로 폴백한다.
        if (active) setProjects(null);
      });
    return () => {
      active = false;
    };
  }, [status, userId]);

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

  if (status !== "authenticated") return null;
  if (!nowCard) return <HomePersonalStrip />;
  return (
    <NowCard
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
}
