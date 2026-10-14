import { api, getApiErrorMessage } from "@/platform/api";

export interface StudioServerRevisionSummary {
  readonly revision: number;
  readonly restoredFromRevision: number | null;
  readonly createdAt: string;
}

interface CreatorWorkRevisionHead {
  readonly revision?: number;
  readonly isOwner?: boolean;
}

interface CreatorWorkMutationRevision {
  readonly revision: number;
}

export interface StudioServerRevisionState {
  readonly workId: string;
  readonly currentRevision: number;
  readonly revisions: readonly StudioServerRevisionSummary[];
}

const MAX_REVISION = 2_147_483_647;

/**
 * 서버 원고 revision 보존 정책 (확정): 작품당 최근 20개, 기간 제한 없음.
 * 정본은 서버 `CREATOR_WORK_REVISION_RETENTION`
 * (apps/api/src/server/creator-work-revisions.ts)과 docs/creator-work-revisions.md의
 * "보존·정리 정책"이다. 서버는 저장·복원 직후 같은 transaction에서 상한 초과분을
 * 오래된 순으로 삭제하고, 목록 조회 limit도 이 값으로 clamp하므로 클라이언트가
 * 이보다 큰 limit을 요청해도 더 오래된 revision은 돌아오지 않는다.
 */
export const STUDIO_SERVER_REVISION_RETENTION = 20;

/** 목록이 보존 상한에 닿았는지 — 닿으면 다음 저장 때 가장 오래된 revision부터 정리된다. */
export function studioServerRevisionRetentionReached(
  revisions: readonly StudioServerRevisionSummary[],
): boolean {
  return revisions.length >= STUDIO_SERVER_REVISION_RETENTION;
}

export function serverRevisionWorkId(scopeKey: string): string | null {
  if (!scopeKey.startsWith("work:")) return null;
  const workId = scopeKey.slice(5).trim();
  return workId.length > 0 && workId.length <= 160 ? workId : null;
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= MAX_REVISION;
}

function parseRevisionRows(value: unknown): StudioServerRevisionSummary[] {
  if (!Array.isArray(value)) throw new Error("서버 버전 목록 형식이 올바르지 않습니다.");
  return value.map((row) => {
    if (!row || typeof row !== "object") throw new Error("서버 버전 항목 형식이 올바르지 않습니다.");
    const candidate = row as Partial<StudioServerRevisionSummary>;
    if (
      !validRevision(candidate.revision)
      || (candidate.restoredFromRevision !== null && !validRevision(candidate.restoredFromRevision))
      || typeof candidate.createdAt !== "string"
      || Number.isNaN(Date.parse(candidate.createdAt))
    ) {
      throw new Error("서버 버전 항목 형식이 올바르지 않습니다.");
    }
    return {
      revision: candidate.revision,
      restoredFromRevision: candidate.restoredFromRevision,
      createdAt: candidate.createdAt,
    };
  });
}

export async function loadStudioServerRevisions(scopeKey: string): Promise<StudioServerRevisionState | null> {
  const workId = serverRevisionWorkId(scopeKey);
  if (!workId) return null;
  const encoded = encodeURIComponent(workId);
  try {
    const [head, rows] = await Promise.all([
      api.get<CreatorWorkRevisionHead>(`/creator/works/${encoded}`),
      api.get<unknown>(`/creator/works/${encoded}/revisions`, { params: { limit: STUDIO_SERVER_REVISION_RETENTION } }),
    ]);
    if (head.isOwner !== true || !validRevision(head.revision)) {
      throw new Error("현재 원고의 서버 revision을 확인할 수 없습니다.");
    }
    return { workId, currentRevision: head.revision, revisions: parseRevisionRows(rows) };
  } catch (error) {
    throw new Error(await getApiErrorMessage(error, "서버 원고 버전을 불러오지 못했습니다."), { cause: error });
  }
}

export async function restoreStudioServerRevision(
  state: StudioServerRevisionState,
  targetRevision: number,
): Promise<number> {
  if (!validRevision(targetRevision)) throw new Error("복원할 서버 revision이 올바르지 않습니다.");
  const encoded = encodeURIComponent(state.workId);
  try {
    const result = await api.post<CreatorWorkMutationRevision>(
      `/creator/works/${encoded}/revisions/${targetRevision}/restore`,
      { baseRevision: state.currentRevision },
    );
    if (!validRevision(result.revision)) throw new Error("복원 응답의 revision이 올바르지 않습니다.");
    return result.revision;
  } catch (error) {
    throw new Error(await getApiErrorMessage(error, "서버 원고 버전을 복원하지 못했습니다."), { cause: error });
  }
}
