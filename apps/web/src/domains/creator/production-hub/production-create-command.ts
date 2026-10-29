import { listWorks, type WorkSummary } from "@/platform/creator-client";
import { createProductionProject, type ProductionMutationResponse } from "./production-api";
import { getStudioTeam, type StudioTeamSnapshot } from "../studio-team-client";
import type { ProductionCreatePending, ProductionCreateScope } from "./production-create-pending";
import { productionCreatePendingStore, type ProductionCreatePendingStore } from "./production-create-pending-store";

export function productionCreateOwnedWorks(works: readonly WorkSummary[], actorId: string): readonly WorkSummary[] {
  return works.filter((work) => work.author?.id === actorId && typeof work.id === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u.test(work.id));
}
export async function loadProductionCreateOwnedWorks(actorId: string, signal?: AbortSignal): Promise<readonly WorkSummary[]> {
  return productionCreateOwnedWorks(await listWorks({ userId: actorId, sort: "recent" }, signal), actorId);
}
export function productionCreateOwnerConfirmed(team: StudioTeamSnapshot, scope: ProductionCreateScope): boolean {
  return team.workId === scope.workId && team.viewer.userId === scope.actorUserId
    && team.viewer.role === "owner" && team.viewer.status === "active";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** 새로 조회한 현재 head를 생성 영수증 대신 쓰지 않는다. 최초 생성 ACK의 고정 정체성을 확인한다. */
export function assertProductionCreateAck(response: unknown, pending: ProductionCreatePending): string {
  const aggregate = isRecord(response) ? response.aggregate : null, input = pending.input;
  if (!isRecord(aggregate) || aggregate.projectId !== input.projectId || aggregate.workId !== input.workId
    || aggregate.modelVersion !== 2 || aggregate.revision !== 1 || aggregate.title !== input.title
    || aggregate.collaborationModel !== input.collaborationModel || !Array.isArray(aggregate.parties)
    || !aggregate.parties.some((party: unknown) => isRecord(party) && party.id === input.ownerPartyId
      && party.accountUserId === pending.actorUserId && party.status === "active"
      && party.publicDisplayName === input.ownerDisplayName)) {
    throw new Error("생성 응답의 프로젝트·작품·소유자를 확인하지 못했습니다. 원래 요청으로 상태를 다시 확인하세요.");
  }
  return input.projectId;
}
export async function confirmProductionProjectCreate(pending: ProductionCreatePending, options: {
  readonly current: () => boolean; readonly store?: ProductionCreatePendingStore;
  readonly team?: typeof getStudioTeam;
  readonly post?: (input: ProductionCreatePending["input"], mutationId: string) => Promise<ProductionMutationResponse>;
}): Promise<string> {
  const store = options.store ?? productionCreatePendingStore;
  const current = () => { if (!options.current()) throw new Error("계정이나 작품이 변경되어 생성 확인을 중지했습니다."); };
  current();
  const scope = { actorUserId: pending.actorUserId, workId: pending.workId }, saved = await store.load(scope);
  current();
  if (!saved || saved.digest !== pending.digest) throw new Error("보관한 최초 생성 원문이 달라 전송을 중지했습니다.");
  const team = await (options.team ?? getStudioTeam)(scope.workId);
  current();
  if (!productionCreateOwnerConfirmed(team, scope)) throw new Error("현재 작품 소유자만 제작 프로젝트 생성을 확인할 수 있습니다.");
  const response = await (options.post ?? createProductionProject)(saved.input, saved.clientMutationId);
  current();
  const projectId = assertProductionCreateAck(response, saved);
  if (!await store.clear(scope, saved.clientMutationId, options.current)) throw new Error("보관한 생성 요청을 정리하지 못했습니다. 같은 요청의 상태를 확인하세요.");
  current();
  return projectId;
}
