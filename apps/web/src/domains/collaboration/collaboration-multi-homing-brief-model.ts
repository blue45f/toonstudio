/**
 * Asana (`global-3e239f192d.js`, `_next/static/chunks/*` 멀티호밍(Multi-Homing) 단일 과업 다중 보드 동기화) +
 * 노션(Notion 동기화 브리프 블록 & 최소 권한 원고 격리) 역공학 내재화 순수 모델.
 */

export type MultiHomedBoardId =
  | "board-public-gig"
  | "board-recruiting-slot"
  | "board-production-stage"
  | "board-studio-layer-seat";

export interface MultiHomedBoardTarget {
  readonly id: MultiHomedBoardId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly routePath: string;
  readonly permissionBoundaryKo: string;
  readonly permissionBoundaryEn: string;
  readonly synced: boolean;
}

export interface MultiHomingBriefInput {
  readonly postId: string;
  readonly roleKey: string;
  readonly syncedBoards: Readonly<Record<MultiHomedBoardId, boolean>>;
  readonly includeCharacterSheetBlock: boolean;
  readonly includeEpisodeCutRangeBlock: boolean;
  readonly enforcePrivateManuscriptIsolation: boolean;
}

export interface MultiHomingBriefEvaluation {
  readonly postId: string;
  readonly boards: readonly MultiHomedBoardTarget[];
  readonly syncedBoardCount: number;
  readonly readinessScore: number;
  readonly isolationSafe: boolean;
  readonly statusSummaryKo: string;
  readonly statusSummaryEn: string;
}

export function evaluateMultiHomingBriefSync(
  input: MultiHomingBriefInput
): MultiHomingBriefEvaluation {
  const safePostId = input.postId.trim() || "demo-post";
  const boards: MultiHomedBoardTarget[] = [
    {
      id: "board-public-gig",
      labelKo: "1. 공개 구인·의뢰 보드",
      labelEn: "1. Public Gig Board",
      routePath: `/collaborate/${encodeURIComponent(safePostId)}`,
      permissionBoundaryKo: "공개 범위·단가·마감 조건만 노출 (비공개 원고 비노출)",
      permissionBoundaryEn: "Public scope, pay & deadline only (private pages hidden)",
      synced: Boolean(input.syncedBoards["board-public-gig"]),
    },
    {
      id: "board-recruiting-slot",
      labelKo: "2. 인재·지원 채용 파이프라인",
      labelEn: "2. Recruiting Pipeline Slot",
      routePath: "/team/recruiting?panel=offers",
      permissionBoundaryKo: "지원자 이력서 버전·유급 샘플 3컷만 격리 열람",
      permissionBoundaryEn: "Isolated resume version & paid 3-cut sample review",
      synced: Boolean(input.syncedBoards["board-recruiting-slot"]),
    },
    {
      id: "board-production-stage",
      labelKo: "3. 프로덕션 회차 공정 칸반",
      labelEn: "3. Production Episode Kanban",
      routePath: "/production",
      permissionBoundaryKo: "합의된 회차·담당 공정 카드와 인계 체크리스트만 연동",
      permissionBoundaryEn: "Linked to agreed episode process card & handoff checklist",
      synced: Boolean(input.syncedBoards["board-production-stage"]),
    },
    {
      id: "board-studio-layer-seat",
      labelKo: "4. 스튜디오 레이어 좌석 임대",
      labelEn: "4. Studio Layer Seat Lease",
      routePath: "/studio",
      permissionBoundaryKo: `담당 레이어(layer:p1:${input.roleKey || "ink"}) 좌석만 최소 권한 부여`,
      permissionBoundaryEn: `Least-privilege seat lease on layer:p1:${input.roleKey || "ink"} only`,
      synced: Boolean(input.syncedBoards["board-studio-layer-seat"]),
    },
  ];

  const syncedBoardCount = boards.filter((b) => b.synced).length;
  const boardScore = Math.round((syncedBoardCount / boards.length) * 60);
  const blockScore =
    (input.includeCharacterSheetBlock ? 15 : 0) +
    (input.includeEpisodeCutRangeBlock ? 15 : 0) +
    (input.enforcePrivateManuscriptIsolation ? 10 : 0);

  const readinessScore = Math.min(100, boardScore + blockScore);
  const isolationSafe = input.enforcePrivateManuscriptIsolation;

  const statusSummaryKo = !isolationSafe
    ? "경고: 비공개 원고 전체 접근 차단(최소 권한 격리) 옵션이 해제되어 있습니다. 담당 레이어 좌석만 개방하도록 격리를 활성화하세요."
    : `Asana형 멀티호밍 동기화 완료 (${syncedBoardCount}/4개 보드 연결 · 준비도 ${readinessScore}점) — 데이터 중복 없이 공고·채용·제작·스튜디오 좌석이 단일 브리프 원장으로 연결됩니다.`;

  const statusSummaryEn = !isolationSafe
    ? "Warning: Private manuscript isolation is disabled. Enable least-privilege layer seat isolation."
    : `Asana-style multi-homing active (${syncedBoardCount}/4 boards linked · score ${readinessScore}/100) — gig, recruiting, production, and studio seat share one brief ledger without duplication.`;

  return Object.freeze({
    postId: safePostId,
    boards: Object.freeze(boards),
    syncedBoardCount,
    readinessScore,
    isolationSafe,
    statusSummaryKo,
    statusSummaryEn,
  });
}
