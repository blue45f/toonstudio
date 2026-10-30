import { useEffect, useState } from "react";
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";
import { getAuthSession, getAuthSessionRevision } from "@/domains/auth/public/session/auth-session-state";
import { getStudioScopedWritePolicy } from "../studio-collab/studio-scoped-write-client";
import { scopedTaskOutputPurposes, type TaskOutputScopedPurpose } from "./production-task-output-scoped-purpose";
import type { StudioScopedWritePolicy } from "@toonstudio/contracts/studio-scoped-write";
import { useProductionReviewClock } from "./use-production-review-clock";

export function useScopedTaskOutputPurposes(aggregate: ProductionProjectAggregate, task: ProductionTask | null | undefined, actorId: string | null, authRevision: number, canEdit: boolean) {
  const scope = JSON.stringify([aggregate.projectId, aggregate.workId, task?.id, actorId, authRevision]);
  const [state, setState] = useState<{ scope: string; policy: StudioScopedWritePolicy | null; error: string | null; loading: boolean }>({ scope, policy: null, error: null, loading: false });
  const policy = state.scope === scope ? state.policy : null;
  const at = Date.parse(useProductionReviewClock([...aggregate.assignments, ...(policy?.grants ?? [])],
    JSON.stringify([scope, canEdit, aggregate.revision, aggregate.parties, policy?.policyVersion, policy?.grants])));
  useEffect(() => {
    if (canEdit || !actorId || !task) return;
    const controller = new AbortController(), current = () => !controller.signal.aborted && getAuthSessionRevision() === authRevision && getAuthSession()?.user.id === actorId;
    setState({ scope, policy: null, error: null, loading: true });
    void getStudioScopedWritePolicy(aggregate.workId, controller.signal).then((policy) => {
      if (current()) setState({ scope, policy, error: null, loading: false });
    }, (cause: unknown) => { if (current()) setState({ scope, policy: null, error: cause instanceof Error ? cause.message : "담당 원고 제출 배정을 확인하지 못했습니다.", loading: false }); });
    return () => controller.abort();
  }, [canEdit, actorId, task, aggregate, authRevision, scope]);
  const choices: readonly TaskOutputScopedPurpose[] = policy && task && actorId ? scopedTaskOutputPurposes(policy, aggregate, task, actorId, at) : [];
  return state.scope === scope ? { ...state, choices } : { scope, choices: [], error: null, loading: !canEdit && Boolean(actorId && task) };
}
