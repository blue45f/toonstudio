/**
 * Studio 3D 포즈 되돌리기/다시실행 히스토리 (순수 데이터+로직).
 *
 * 웹캠 트래킹처럼 매 프레임 바뀌는 연속 변경이 아니라, 프리셋 적용·미러·
 * 초기화·사진 포즈 적용·손 접촉·콘트라포스토 같은 "사용자가 한 번에 내린 결정" 단위로 기록한다.
 * 스냅샷은 참조를 공유하지 않으므로(불변 취급) 호출자는 깊은 복사를 신경
 * 쓸 필요가 없다. Three.js import 없음 — 단위 테스트 가능하다.
 */

import type {
  StudioMannequinContrappostoSide,
  StudioMannequinHandContactMap,
  StudioMannequinPose,
} from "./studio-mannequin-poses";

/** 되돌리기/다시실행 히스토리 최대 보관 깊이. */
export const STUDIO_POSE_HISTORY_MAX_DEPTH = 30 as const;

/** 포즈 스냅샷과 함께 오가는 선택적 의미론적 접촉·동세 메타데이터. */
export interface StudioMannequinPoseSemanticMeta {
  readonly handContacts?: StudioMannequinHandContactMap;
  readonly contrapposto?: StudioMannequinContrappostoSide | null;
}

export interface StudioPoseHistory {
  /** 되돌릴 수 있는 과거 스냅샷(오래된 순). */
  readonly past: readonly StudioMannequinPose[];
  /** 다시실행할 수 있는 미래 스냅샷(가까운 순). */
  readonly future: readonly StudioMannequinPose[];
  /** 과거 스냅샷별 접촉·콘트라포스토 메타데이터(생략 시 기본값). */
  readonly pastMeta?: readonly (StudioMannequinPoseSemanticMeta | undefined)[];
  /** 미래 스냅샷별 접촉·콘트라포스토 메타데이터(생략 시 기본값). */
  readonly futureMeta?: readonly (StudioMannequinPoseSemanticMeta | undefined)[];
}

/** 빈 히스토리를 만든다. */
export function createStudioPoseHistory(): StudioPoseHistory {
  return { past: [], future: [] };
}

function trimTail<T>(entries: readonly T[]): readonly T[] {
  return entries.length > STUDIO_POSE_HISTORY_MAX_DEPTH
    ? entries.slice(entries.length - STUDIO_POSE_HISTORY_MAX_DEPTH)
    : entries;
}

function normalizeHistoryMeta(
  meta: StudioMannequinPoseSemanticMeta | undefined,
): StudioMannequinPoseSemanticMeta | undefined {
  if (!meta) return undefined;
  const left = meta.handContacts?.left;
  const right = meta.handContacts?.right;
  const handContacts =
    left || right
      ? {
          ...(left ? { left } : {}),
          ...(right ? { right } : {}),
        }
      : undefined;
  const contrapposto =
    meta.contrapposto === "left" || meta.contrapposto === "right"
      ? meta.contrapposto
      : undefined;
  if (!handContacts && !contrapposto) return undefined;
  return {
    ...(handContacts ? { handContacts } : {}),
    ...(contrapposto ? { contrapposto } : {}),
  };
}

/**
 * 현재 포즈(및 선택적 접촉·콘트라포스토 메타데이터)를 과거 스택에 기록한다.
 * 새 결정을 내리면 다시실행 스택은 비운다.
 */
export function recordStudioPoseHistory(
  history: StudioPoseHistory,
  current: StudioMannequinPose,
  currentMeta?: StudioMannequinPoseSemanticMeta,
): StudioPoseHistory {
  const nextPast = trimTail([...history.past, current]);
  const normalizedMeta = normalizeHistoryMeta(currentMeta);
  if (!history.pastMeta && !normalizedMeta) {
    return { past: nextPast, future: [] };
  }
  const alignedPastMeta = Array.from(
    { length: history.past.length },
    (_, i) => history.pastMeta?.[i],
  );
  const nextPastMeta = trimTail([...alignedPastMeta, normalizedMeta]);
  return nextPastMeta.some((entry) => entry !== undefined)
    ? { past: nextPast, future: [], pastMeta: nextPastMeta }
    : { past: nextPast, future: [] };
}

/** 되돌리기가 가능한지 여부. */
export function canUndoStudioPose(history: StudioPoseHistory): boolean {
  return history.past.length > 0;
}

/** 다시실행이 가능한지 여부. */
export function canRedoStudioPose(history: StudioPoseHistory): boolean {
  return history.future.length > 0;
}

export interface StudioPoseHistoryStep {
  readonly history: StudioPoseHistory;
  /** 되돌리기/다시실행 결과로 적용해야 할 포즈. */
  readonly pose: StudioMannequinPose;
  /** 복원된 접촉·콘트라포스토 메타데이터(없으면 undefined). */
  readonly meta?: StudioMannequinPoseSemanticMeta;
}

/**
 * 한 단계 되돌린다. 현재 포즈와 메타데이터는 다시실행 스택으로 옮긴다.
 * 되돌릴 항목이 없으면 null 을 돌린다.
 */
export function undoStudioPoseHistory(
  history: StudioPoseHistory,
  current: StudioMannequinPose,
  currentMeta?: StudioMannequinPoseSemanticMeta,
): StudioPoseHistoryStep | null {
  if (history.past.length === 0) return null;
  const lastIndex = history.past.length - 1;
  const pose = history.past[lastIndex]!;
  const meta = history.pastMeta?.[lastIndex];
  const nextPast = history.past.slice(0, -1);
  const nextFuture = trimTail([current, ...history.future]);

  const normalizedCurrentMeta = normalizeHistoryMeta(currentMeta);
  const hasAnyMeta =
    Boolean(history.pastMeta?.some(Boolean)) ||
    Boolean(history.futureMeta?.some(Boolean)) ||
    normalizedCurrentMeta !== undefined;

  if (!hasAnyMeta) {
    return {
      history: { past: nextPast, future: nextFuture },
      pose,
    };
  }

  const nextPastMeta = Array.from({ length: nextPast.length }, (_, i) => history.pastMeta?.[i]);
  const existingFutureMeta = Array.from(
    { length: history.future.length },
    (_, i) => history.futureMeta?.[i],
  );
  const nextFutureMeta = [normalizedCurrentMeta, ...existingFutureMeta].slice(0, STUDIO_POSE_HISTORY_MAX_DEPTH);

  return {
    history: {
      past: nextPast,
      future: nextFuture,
      ...(nextPastMeta.some(Boolean) ? { pastMeta: nextPastMeta } : {}),
      ...(nextFutureMeta.some(Boolean) ? { futureMeta: nextFutureMeta } : {}),
    },
    pose,
    ...(meta ? { meta } : {}),
  };
}

/**
 * 한 단계 다시실행한다. 현재 포즈와 메타데이터는 되돌리기 스택으로 되돌린다.
 * 다시실행할 항목이 없으면 null 을 돌린다.
 */
export function redoStudioPoseHistory(
  history: StudioPoseHistory,
  current: StudioMannequinPose,
  currentMeta?: StudioMannequinPoseSemanticMeta,
): StudioPoseHistoryStep | null {
  if (history.future.length === 0) return null;
  const [pose, ...rest] = history.future;
  const meta = history.futureMeta?.[0];
  const nextPast = trimTail([...history.past, current]);

  const normalizedCurrentMeta = normalizeHistoryMeta(currentMeta);
  const hasAnyMeta =
    Boolean(history.pastMeta?.some(Boolean)) ||
    Boolean(history.futureMeta?.some(Boolean)) ||
    normalizedCurrentMeta !== undefined;

  if (!hasAnyMeta) {
    return {
      history: { past: nextPast, future: rest },
      pose: pose!,
    };
  }

  const alignedPastMeta = Array.from(
    { length: history.past.length },
    (_, i) => history.pastMeta?.[i],
  );
  const nextPastMeta = trimTail([...alignedPastMeta, normalizedCurrentMeta]);
  const nextFutureMeta = Array.from({ length: rest.length }, (_, i) => history.futureMeta?.[i + 1]);

  return {
    history: {
      past: nextPast,
      future: rest,
      ...(nextPastMeta.some(Boolean) ? { pastMeta: nextPastMeta } : {}),
      ...(nextFutureMeta.some(Boolean) ? { futureMeta: nextFutureMeta } : {}),
    },
    pose: pose!,
    ...(meta ? { meta } : {}),
  };
}

/**
 * 상태 표시용 요약. 버튼 비활성화·"되돌리기 3 · 다시실행 1" 같은
 * 안내 문구를 그릴 때 쓴다.
 */
export function describeStudioPoseHistory(history: StudioPoseHistory): {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
} {
  return {
    canUndo: canUndoStudioPose(history),
    canRedo: canRedoStudioPose(history),
    undoCount: history.past.length,
    redoCount: history.future.length,
  };
}
