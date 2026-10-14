/**
 * 개요 NowCard — 회수 예정이 지난 복선을 프로젝트 개요(story 표면 상단)에
 * "지금 할 일"로 띄우는 작은 연결 컴포넌트.
 *
 * 규칙 (creative-features REPORT ★1 · NowCard 도출 규칙):
 * - 표시 조건은 하나뿐이다: 현재 회차 기준으로 회수 예정 구간이 지났는데
 *   아직 회수되지 않은 복선이 있을 때. 그 외에는 아무것도 렌더하지 않는다
 *   (장부가 비었거나, 저장본이 없거나, 판정할 수 없으면 침묵한다).
 * - 카드는 상태를 바꾸지 않는다. 행동은 복선 장부로 가는 링크 하나뿐이고,
 *   회수 판정은 장부에서 작가가 직접 한다.
 * - 현재 회차는 기획 저장소의 "가장 최근 회차"로 본다
 *   (StudioProjectStoryPlanning의 currentPlanningEpisodeId와 같은 정의).
 */
import { useEffect, useState } from "react";

import { NowCard } from "@/shared/components/layout/NowCard";
import Link from "@/shared/navigation/router-link";

import { studioProjectSectionHref } from "../studio-project-views";
import {
  STUDIO_PLANNING_UPDATED_EVENT,
  readStudioProjectPlanning,
  type StudioProjectPlanningState,
} from "./studio-planning-store";
import {
  STUDIO_FORESHADOW_UPDATED_EVENT,
  deriveForeshadowDigest,
  deriveForeshadowOverdueNotice,
  readStudioForeshadowLedger,
  type ForeshadowOverdueNotice,
} from "./studio-foreshadow-ledger";
import { currentPlanningEpisodeId } from "./StudioProjectStoryPlanning";

function loadNotice(projectId: string): ForeshadowOverdueNotice | null {
  if (typeof window === "undefined") return null;
  try {
    const planning: StudioProjectPlanningState | null =
      readStudioProjectPlanning(window.localStorage, projectId);
    const ledger = readStudioForeshadowLedger(window.localStorage, projectId);
    if (!planning || !ledger || ledger.seeds.length === 0) return null;
    const currentEpisodeId = currentPlanningEpisodeId(planning);
    if (!currentEpisodeId) return null;
    const digest = deriveForeshadowDigest({
      seeds: ledger.seeds,
      episodeOrder: planning.season.episodeOrder,
      currentEpisodeId,
    });
    return deriveForeshadowOverdueNotice(digest);
  } catch {
    return null;
  }
}

export function StudioForeshadowOverviewNotice({
  projectId,
}: {
  readonly projectId: string;
}) {
  const [notice, setNotice] = useState<ForeshadowOverdueNotice | null>(
    () => loadNotice(projectId),
  );

  useEffect(() => {
    setNotice(loadNotice(projectId));
    const onUpdated = () => setNotice(loadNotice(projectId));
    window.addEventListener(STUDIO_FORESHADOW_UPDATED_EVENT, onUpdated);
    window.addEventListener(STUDIO_PLANNING_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(STUDIO_FORESHADOW_UPDATED_EVENT, onUpdated);
      window.removeEventListener(STUDIO_PLANNING_UPDATED_EVENT, onUpdated);
    };
  }, [projectId]);

  if (!notice) return null;

  return (
    <NowCard
      className="mt-4"
      eyebrow="지금 할 일"
      tone="warning"
      title={`회수 예정이 지난 복선 ${notice.overdueCount}개`}
      reason={`‘${notice.firstTitle}’부터 확인해 보세요. 회수 여부는 장부에서 직접 정할 수 있어요.`}
      action={(
        <Link href={studioProjectSectionHref(projectId, "story", "foreshadow")}>
          복선 장부 열기
        </Link>
      )}
    />
  );
}
