/**
 * 회차 팀 레퍼런스 보드 (비교 검수 4단계, FLAGSHIP §5.6).
 *
 * 지금까지 레퍼런스 보드는 에디터 개인 상태라 팀원이 같은 참고 이미지를 볼 수 없었고,
 * 인계 준비도의 "참고 자료" 지표와도 연결이 없었다. 이 모델은 보드에 회차 정체성을 부여한다:
 *
 * - 보드 id는 projectId+episodeId에서 결정적으로 만든다 — 팀원이 같은 회차를 열면 같은 보드다.
 * - 보드 문서는 기존 StudioReferenceBoardDocument(콘텐츠 해시 기반)를 그대로 쓴다.
 *   바이너리는 보드에 넣지 않고 에셋 라이브러리가 해시로 해석한다(기존 보드 원칙 유지).
 * - 인계 준비도 연결은 순수 판정으로 분리한다: 보드가 비면 "참고 자료" 미충족, 차면 충족.
 *   코어 준비도(evaluateHandoffReadiness)는 선택 입력 episodeReferenceBoard로 이 판정을 받는다.
 * - 보드 이미지는 buildReferenceCompareItem(1단계 소스 풀)로 바로 비교 소스가 된다.
 */

import {
  addStudioReferenceBoardItem,
  createStudioReferenceBoardDocument,
  type StudioReferenceBoardDocument,
  type StudioReferenceBoardItem,
} from "../studio-reference-board";
import { buildReferenceCompareItem, type ProcessCompareItem } from "./process-compare-model";

/** 보드가 속한 회차 범위. projectId·episodeId 쌍이 보드의 정체성이다. */
export interface EpisodeReferenceBoardScope {
  readonly projectId: string;
  readonly episodeId: string;
}

/** 회차 단위로 팀이 공유하는 레퍼런스 보드. */
export interface EpisodeReferenceBoard extends EpisodeReferenceBoardScope {
  /** episodeReferenceBoardId(projectId, episodeId)와 같은 결정적 id. */
  readonly boardId: string;
  readonly document: StudioReferenceBoardDocument;
  /** 마지막으로 보드를 바꾼 팀원의 actor id. 모르면 null. */
  readonly updatedBy: string | null;
  /** 마지막 변경 시각(ISO). 모르면 null. */
  readonly updatedAt: string | null;
}

/**
 * 회차 보드의 결정적 id. 같은 projectId+episodeId는 항상 같은 id를 만든다 —
 * 팀원이 각자 열어도 "같은 보드"를 가리키는 근거가 된다.
 * 빈 id는 보드로 취급하지 않으므로 null을 돌려준다.
 */
export function episodeReferenceBoardId(projectId: string, episodeId: string): string | null {
  const project = projectId.trim();
  const episode = episodeId.trim();
  if (!project || !episode) return null;
  return `episode-reference:${project}::${episode}`;
}

export function createEpisodeReferenceBoard(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly document?: StudioReferenceBoardDocument;
  readonly updatedBy?: string | null;
  readonly updatedAt?: string | null;
}): EpisodeReferenceBoard | null {
  const boardId = episodeReferenceBoardId(input.projectId, input.episodeId);
  if (!boardId) return null;
  return {
    boardId,
    projectId: input.projectId.trim(),
    episodeId: input.episodeId.trim(),
    document: input.document ?? createStudioReferenceBoardDocument(),
    updatedBy: input.updatedBy ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

/** 이 보드가 해당 회차의 팀 보드인가. 다른 회차 보드를 잘못 붙이는 사고를 막는다. */
export function isEpisodeReferenceBoardFor(
  board: EpisodeReferenceBoard,
  scope: EpisodeReferenceBoardScope,
): boolean {
  return board.projectId === scope.projectId
    && board.episodeId === scope.episodeId
    && board.boardId === episodeReferenceBoardId(scope.projectId, scope.episodeId);
}

export function episodeReferenceBoardItemCount(board: EpisodeReferenceBoard | null | undefined): number {
  return board?.document.items.length ?? 0;
}

/** 인계 준비도 "참고 자료" 충족 판정: 연결된 보드에 이미지가 1장이라도 있으면 충족. */
export function episodeReferenceBoardSatisfiesReferences(
  board: EpisodeReferenceBoard | null | undefined,
): boolean {
  return episodeReferenceBoardItemCount(board) > 0;
}

export type EpisodeReferenceBoardLinkStatus = "unlinked" | "empty" | "ready";

export interface EpisodeReferenceBoardLink {
  readonly status: EpisodeReferenceBoardLinkStatus;
  readonly boardId: string | null;
  readonly itemCount: number;
  /** 준비도 "참고 자료" 충족 여부. status가 ready일 때만 true. */
  readonly satisfiesReferences: boolean;
  readonly statusLabel: { readonly ko: string; readonly en: string };
}

/** 인계 표면·패널이 공유하는 보드 연결 상태. 보드 없음/빈 보드/채워진 보드를 구분한다. */
export function evaluateEpisodeReferenceBoardLink(
  board: EpisodeReferenceBoard | null | undefined,
): EpisodeReferenceBoardLink {
  if (!board) {
    return {
      status: "unlinked",
      boardId: null,
      itemCount: 0,
      satisfiesReferences: false,
      statusLabel: { ko: "회차 보드 없음", en: "No episode board" },
    };
  }
  const itemCount = board.document.items.length;
  if (itemCount === 0) {
    return {
      status: "empty",
      boardId: board.boardId,
      itemCount: 0,
      satisfiesReferences: false,
      statusLabel: { ko: "회차 보드가 비어 있음", en: "Episode board is empty" },
    };
  }
  return {
    status: "ready",
    boardId: board.boardId,
    itemCount,
    satisfiesReferences: true,
    statusLabel: { ko: `회차 보드 이미지 ${itemCount}장`, en: `${itemCount} board images` },
  };
}

/**
 * 개인(또는 다른 범위) 보드 문서를 이 회차 보드로 복사한다 (FLAGSHIP §5.6 "이 회차 보드로 복사").
 * 항목 id가 겹치거나 보드 상한(32장)에 닿은 항목은 기존 보드 연산 규칙대로 건너뛴다.
 * 원본 문서는 바꾸지 않는다.
 */
export function copyReferenceDocumentToEpisodeBoard(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly source: StudioReferenceBoardDocument;
  readonly existing?: EpisodeReferenceBoard | null;
  readonly updatedBy?: string | null;
  readonly updatedAt?: string | null;
}): EpisodeReferenceBoard | null {
  const base = input.existing && isEpisodeReferenceBoardFor(input.existing, input)
    ? input.existing
    : createEpisodeReferenceBoard({ projectId: input.projectId, episodeId: input.episodeId });
  if (!base) return null;
  let document = base.document;
  for (const item of input.source.items) {
    document = addStudioReferenceBoardItem(document, item);
  }
  return {
    ...base,
    document,
    updatedBy: input.updatedBy ?? base.updatedBy,
    updatedAt: input.updatedAt ?? base.updatedAt,
  };
}

/** 회차 보드 항목들을 개인 보드 문서로 가져온다. 보드 ↔ 개인 보드의 반대 방향 이동. */
export function copyEpisodeBoardItemsToDocument(
  board: EpisodeReferenceBoard,
  target: StudioReferenceBoardDocument,
): StudioReferenceBoardDocument {
  let document = target;
  for (const item of board.document.items) {
    document = addStudioReferenceBoardItem(document, item);
  }
  return document;
}

/**
 * 보드 이미지를 비교 소스 풀 항목으로 만든다 — 보드에 올린 사진이 곧 비교 소스가 된다.
 * resolveImageUrl이 없으면 imageUrl은 null이고 뷰어가 플레이스홀더를 쓴다(기존 관습).
 * boardLabel 기본값은 회차 라벨이 없을 때의 폴백이며, 호출부가 회차명을 아는 경우 넘긴다.
 */
export function buildEpisodeBoardCompareItems(
  board: EpisodeReferenceBoard,
  input: {
    readonly boardLabel?: string;
    readonly resolveImageUrl?: (item: StudioReferenceBoardItem) => string | null;
  } = {},
): ProcessCompareItem[] {
  const boardLabel = input.boardLabel ?? "회차 레퍼런스 보드";
  return board.document.items.map((item, index) => buildReferenceCompareItem({
    boardId: board.boardId,
    itemId: item.id,
    boardLabel,
    itemLabel: item.asset.name?.trim() || `레퍼런스 ${index + 1}`,
    imageUrl: input.resolveImageUrl ? input.resolveImageUrl(item) : null,
  }));
}
