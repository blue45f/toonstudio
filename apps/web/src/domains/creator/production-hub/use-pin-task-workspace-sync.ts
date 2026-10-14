/**
 * 검수 핀 → 할 일 동기화 호스트 훅.
 *
 * 핀은 댓글 문서(StudioCommentsDocument)에 살고 할 일은 제작 워크스페이스
 * (ProductionWorkspace.tasks)에 산다. 두 저장소를 함께 소유한 표면이 아직
 * 없어, 핀 변경이 한 곳으로 모이는 회차 검수 룸이 이 훅으로 워크스페이스
 * 저장소를 직접 구동한다:
 *
 * - 스코프 키는 스튜디오 제작 스코프 규약(`work:<workId>`,
 *   studio-production-scope)과 같은 형식을 쓴다. aggregate.workId가
 *   그 작품 ID다.
 * - 커밋은 저장소(repository)의 잠금·돌연변이 투영을 그대로 타므로
 *   커맨드 센터(HubPageV2)가 같은 워크스페이스를 열고 있어도 충돌하지
 *   않고, 커밋 후 무효화(invalidation)를 방송해 열린 화면이 다시 읽는다.
 * - 변경이 없으면(probe 단계에서 changed:false) 커밋 자체를 건너뛰어
 *   리비전을 올리지 않는다. 동기화는 멱등이라 문서가 바뀔 때마다,
 *   그리고 진입 시 1회(소급 등록) 호출해도 안전하다.
 * - 담당자 변환: 핀 담당자는 검수 aggregate의 배정 ID이고 워크스페이스
 *   할 일은 역할 배정 ID를 쓴다. 배정 → 당사자(party)의 계정 ID →
 *   역할 배정(memberId 일치)으로 변환한다. 변환할 역할 배정이 없으면
 *   null을 돌려준다 — 이 경우 할 일은 등록되지만(제목·담당 표시 이름은
 *   정상) 역할 인박스의 '내 담당' 매칭에는 걸리지 않는다.
 * - 사람이 손댄 필드(기한·진행률·단계·의존성)를 덮지 않는 계약은 모델
 *   (refreshPinTask)이 보장하고, 이 훅은 모델 결과를 그대로 커밋만 한다.
 * - 데모 모드에서는 동기화하지 않는다. 데모 워크스페이스는 저장되지 않는
 *   인메모리 상태(HubPageV2 demo)가 정본이라, 로컬 저장소에 샘플 핀 할 일을
 *   남기지 않는다.
 * - 동기화 실패는 검수 자체를 막지 않는다(핀 변경은 이미 로컬에 반영됨).
 *   다음 문서 변경이나 재진입 때 멱등하게 다시 맞춘다.
 */
import { useCallback, useRef } from "react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { StudioCommentsDocument } from "../studio-comments";
import {
  commitStudioProductionWorkspace,
  createEmptyProductionWorkspace,
  createStudioProductionClientId,
  createStudioProductionWorkspaceInvalidation,
  loadStudioProductionWorkspace,
  STUDIO_PRODUCTION_NAMESPACE,
  type ProductionWorkspace,
} from "../studio-production/studio-production-workspace";
import {
  applyPinTaskSyncToWorkspace,
  type PinTaskSource,
} from "./pin-task-sync-model";

/** 핀 담당자(aggregate 배정 ID)를 워크스페이스 역할 배정 ID로 변환한다. */
function resolveWorkspaceAssigneeId(
  aggregate: ProductionProjectAggregate,
  workspace: ProductionWorkspace,
  source: PinTaskSource,
): string | null {
  if (!source.assigneeId) return null;
  const assignment = aggregate.assignments.find((entry) => entry.id === source.assigneeId);
  if (!assignment) return null;
  const accountUserId = aggregate.parties.find(
    (party) => party.id === assignment.partyId,
  )?.accountUserId ?? null;
  if (!accountUserId) return null;
  return workspace.roleAssignments.find(
    (roleAssignment) => roleAssignment.memberId === accountUserId,
  )?.id ?? null;
}

export interface PinTaskWorkspaceSync {
  /** 댓글 문서를 받아 핀 할 일을 워크스페이스와 맞춘다. 실패해도 reject하지 않는다. */
  readonly syncPinTasksFromDocument: (document: StudioCommentsDocument) => Promise<void>;
}

export function usePinTaskWorkspaceSync(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly isDemo: boolean;
  /** 댓글이 사는 회차. 핀 할 일에 기록돼 인박스에서 이 회차 룸으로 되돌아간다. */
  readonly episodeId: string;
}): PinTaskWorkspaceSync {
  const { aggregate, isDemo, episodeId } = input;
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const clientIdRef = useRef<string>(createStudioProductionClientId());

  const syncPinTasksFromDocument = useCallback((document: StudioCommentsDocument) => {
    if (isDemo || !aggregate.workId) return chainRef.current;
    const scopeKey = `work:${aggregate.workId}`;
    const run = async () => {
      try {
        const stored = await loadStudioProductionWorkspace(scopeKey);
        const fallback = stored ?? createEmptyProductionWorkspace(scopeKey);
        const probe = applyPinTaskSyncToWorkspace(fallback, document, {
          resolveAssigneeId: (source) => resolveWorkspaceAssigneeId(aggregate, fallback, source),
          episodeId,
        });
        if (!probe.result.changed) return;
        const next = await commitStudioProductionWorkspace(scopeKey, fallback, (current) =>
          applyPinTaskSyncToWorkspace(current, document, {
            resolveAssigneeId: (source) => resolveWorkspaceAssigneeId(aggregate, current, source),
            episodeId,
          }).workspace);
        try {
          const channel = new BroadcastChannel(`${STUDIO_PRODUCTION_NAMESPACE}:${scopeKey}`);
          channel.postMessage(createStudioProductionWorkspaceInvalidation({
            scopeKey,
            revision: next.revision,
            sourceClientId: clientIdRef.current,
          }));
          channel.close();
        } catch { /* 채널 실패는 저장된 워크스페이스 자체에 영향이 없다. */ }
      } catch { /* 동기화 실패는 검수를 막지 않는다 — 다음 변경·재진입에서 멱등 재시도된다. */ }
    };
    chainRef.current = chainRef.current.then(run, run);
    return chainRef.current;
  }, [aggregate, isDemo, episodeId]);

  return { syncPinTasksFromDocument };
}
