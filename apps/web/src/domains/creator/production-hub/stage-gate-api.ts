import type {
  StageGateBundle, StageGateCommandInput, StageGateMutationResult, StageGateStageIdContract,
} from "@toonstudio/contracts/production-stage-gate";
import { api } from "@/platform/api";

const root = (projectId: string, episodeId: string): string =>
  `/production/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/stage-gates`;

/** 회차의 게이트 번들을 서버에서 읽는다 — 다기기 동기화의 읽기 단위. */
export function listStageGates(projectId: string, episodeId: string): Promise<StageGateBundle> {
  return api.get(root(projectId, episodeId));
}

export function commandStageGate(
  projectId: string,
  episodeId: string,
  stageId: StageGateStageIdContract,
  expectedRevision: number,
  command: StageGateCommandInput,
): Promise<StageGateMutationResult> {
  return api.post(`${root(projectId, episodeId)}/${encodeURIComponent(stageId)}/commands`, {
    ...command, expectedRevision, mutationId: crypto.randomUUID(),
  });
}
