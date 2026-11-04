import { StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";
import { studioScopedRequiresEffectAdmission, type StudioScopedAuthorization, type StudioScopedReceipt } from "./studio-scoped-write-store";

/** 과거 전체 편집의 dedupe ID를 새 제한 권한의 승인 영수증으로 채택하지 않는다. */
export function assertStudioScopedWriteReplay(authorization: StudioScopedAuthorization, receipt: StudioScopedReceipt | null): void {
  if (!studioScopedRequiresEffectAdmission(authorization)) return;
  const targets = new Set(authorization.targets.map((target) => target.definition.id));
  if (!receipt || receipt.actorUserId !== authorization.work.actorUserId || receipt.policyVersion !== authorization.policy.policyVersion
    || receipt.targetIds.some((id) => !targets.has(id))) throw new StudioScopedWriteDeniedError("policy");
}
