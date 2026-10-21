/**
 * 통합 협업 알림 섹션 — 프로젝트/회차 표면 공용 마운트.
 *
 * 랜딩(PortfolioSection)이 프로젝트 횡단으로 같은 패널을 붙이는 것과 짝을 이룬다.
 * 여기서는 한 프로젝트의 aggregate만으로 투영한다: 서버 알림(멘션·검수), 승인·반려
 * 결정, 인계 준비 완료가 한 작업함에 모이고, 항목을 누르면 읽음 처리와 함께
 * item.target.href(핀 스레드·검수 게이트·인계 표면)로 한 번에 이동한다.
 * 회차 룸에서는 episodeId로 좁혀 그 회차 신호를 먼저 본다.
 *
 * 읽음 상태는 랜딩과 같은 저장 키를 공유한다 — 한 표면에서 읽으면 다른 표면에서도
 * 읽음으로 보인다 (기기 로컬 + 서버 알림 읽음 상태 병합, collab-notification-landing-source).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CollabNotificationInbox } from "./CollabNotificationInbox";
import {
  collabInboxReadIds,
  filterCollabInboxForEpisode,
  markAllCollabInboxRead,
  markCollabInboxRead,
  projectCollabInbox,
  type CollabInboxItem,
} from "./collab-notification-model";
import {
  collabEventsFromProjectAggregate,
  loadCollabInboxReadIds,
  saveCollabInboxReadIds,
  type CollabAggregateInput,
} from "./collab-notification-landing-source";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface ProductionCollabInboxSectionProps {
  /** ProductionProjectAggregate와 구조 호환되는 프로젝트 기록. */
  readonly aggregate: CollabAggregateInput;
  /** 현재 로그인 계정 id. 없으면(데모 등) 수신자 지정 알림은 비워 두고 공지만 투영한다. */
  readonly actorId: string | null;
  /** 회차 룸처럼 한 회차에 집중하는 표면에서만 지정한다. */
  readonly episodeId?: string;
}

export function ProductionCollabInboxSection({
  aggregate,
  actorId,
  episodeId,
}: ProductionCollabInboxSectionProps) {
  const bt = useBilingual("ProductionCollabInboxSection");
  const navigate = useNavigate();
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => loadCollabInboxReadIds());

  const items = useMemo<readonly CollabInboxItem[]>(() => {
    const { events, serverReadIds } = collabEventsFromProjectAggregate(aggregate, actorId ?? "");
    const merged = new Set<string>([...readIds, ...serverReadIds]);
    const projected = projectCollabInbox(events, merged);
    return episodeId ? filterCollabInboxForEpisode(projected, episodeId) : projected;
  }, [aggregate, actorId, episodeId, readIds]);

  const persist = (next: readonly CollabInboxItem[]) => {
    const ids = collabInboxReadIds(next);
    setReadIds(ids);
    saveCollabInboxReadIds(ids);
  };

  const openItem = (item: CollabInboxItem) => {
    persist(markCollabInboxRead(items, item.id));
    navigate(item.target.href);
  };

  return (
    <div>
      <CollabNotificationInbox
        items={items}
        onOpenItem={openItem}
        onMarkAllRead={() => persist(markAllCollabInboxRead(items))}
      />
      <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">
        {bt("읽음 표시는 이 기기에 저장됩니다.", "Read marks are stored on this device.")}
      </p>
    </div>
  );
}
