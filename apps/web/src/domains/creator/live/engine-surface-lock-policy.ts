/**
 * 엔진 표면 잠금 강등 정책 — 병합 엔진이 닿는 표면의 잠금 역할 고정.
 *
 * 근거: realtime-stroke-merge-engine REPORT 5절 + HOST_INSERTION_SPEC 4절.
 * - 페이지 잠금(page-edit-lock-model)은 검수·공정 표면에서 "한 명이 고치는 중"을
 *   알리는 점유 신호 + 변경 가드로 유지된다.
 * - 실시간 스트로크 병합 엔진(CRDT/merge)이 닿는 드로잉 표면에서는 전원이
 *   동시에 그릴 수 있으므로, 잠금은 쓰기 장벽이 아니라 프레즌스 안내로 강등된다.
 * - 그 자리에서 충돌 안내는 (b) 레이어 점유 표시(studio-layer-occupancy)가
 *   맡는다: 누가 어느 레이어를 만지는지는 보여 주고 경고하되, 병합 표면에서는
 *   레이어 점유도 쓰기를 막지 않는다.
 *
 * 표면 판정 규칙 (이 모듈이 고정하는 단 하나의 기준):
 *   "이 표면에서 스트로크 op가 발생하는가"
 *   — 스트로크 op란 StudioCrdtDocument의 begin → append samples → finalize
 *     생애주기(또는 merge 코어의 StrokeOp 제출)를 말한다. 판정은 표면 서술자의
 *     `emitsStrokeOps` 하나로만 하며, 표면 이름·모드·역할 같은 다른 신호로
 *     우회 판정하지 않는다. 모르는 표면은 emitsStrokeOps를 명시하지 않으면
 *     가드 유지(guarded)가 기본이다 — 강등은 명시한 표면에서만 일어난다.
 *
 * 이 모듈은 순수 판정만 한다. 전송·상태 보관·렌더링은 호스트 몫이며,
 * 호스트는 쓰기 직전에 `evaluateSurfaceWriteAccess(...).allowed` 하나만 보면 된다.
 */

import {
  deriveLayerOccupant,
  deriveMyLayerConflicts,
  evaluateLayerConflict,
  summarizeLayerOccupancy,
  type LayerConflictEvaluation,
  type LayerConflictWarning,
  type LayerOccupancyEntry,
  type LayerOccupancySummary,
} from "../layer/studio-layer-occupancy";
import {
  canEditPage,
  derivePageEditLock,
  type PageEditDecision,
  type PageEditLock,
  type PagePresenceEntry,
} from "../production-hub/page-edit-lock-model";

// ── 표면 판정 ──────────────────────────────────────────────────────────────

export interface CollaborationSurfaceDescriptor {
  /** 표면 식별자(로그·테스트 고정용). 판정에는 쓰지 않는다. */
  readonly surfaceId: string;
  /**
   * 유일한 판정 기준: 이 표면에서 스트로크 op가 발생하는가.
   * true면 병합 표면(잠금 강등), false면 가드 표면(잠금 유지).
   */
  readonly emitsStrokeOps: boolean;
}

/**
 * 알려진 협업 표면의 판정 고정표.
 * - studio-drawing-canvas: 에디터 드로잉 표면. useStudioCrdtRuntime이
 *   StudioCrdtDocument를 붙이고 스트로크 begin/append/finalize가 발생한다 → 병합 표면.
 * - production-episode-review-room: 회차 룸 검수실. 핀·승인 변경만 있고
 *   스트로크 op가 없다 → 페이지 잠금 가드 유지.
 * - production-process-matrix: 공정 매트릭스. 프레즌스 요약만 소비한다 → 가드 유지.
 */
export const COLLABORATION_SURFACES = {
  studioDrawingCanvas: {
    surfaceId: "studio-drawing-canvas",
    emitsStrokeOps: true,
  },
  productionEpisodeReviewRoom: {
    surfaceId: "production-episode-review-room",
    emitsStrokeOps: false,
  },
  productionProcessMatrix: {
    surfaceId: "production-process-matrix",
    emitsStrokeOps: false,
  },
} as const satisfies Record<string, CollaborationSurfaceDescriptor>;

export type SurfaceLockMode = "merge" | "guarded";

/** 표면 → 잠금 모드. emitsStrokeOps 하나만 본다. */
export function classifySurfaceLockMode(surface: CollaborationSurfaceDescriptor): SurfaceLockMode {
  return surface.emitsStrokeOps ? "merge" : "guarded";
}

// ── 정책 ───────────────────────────────────────────────────────────────────

export type PageLockRole = "write-guard" | "presence-only";
export type LayerOccupancyRole = "write-guard" | "presence-and-warning";

export interface SurfaceLockPolicy {
  readonly mode: SurfaceLockMode;
  /** 페이지 잠금의 역할. 병합 표면에서는 프레즌스 표시 전용으로 강등된다. */
  readonly pageLockRole: PageLockRole;
  /** 레이어 점유의 역할. 병합 표면에서는 표시+경고 전용으로 강등된다. */
  readonly layerOccupancyRole: LayerOccupancyRole;
  /** 페이지 잠금을 쓰기 가드 목적으로 취득·유지해야 하는가. 병합 표면에서는 아니다(프레즌스 하트비트만). */
  readonly acquirePageLockAsGuard: boolean;
  /** 페이지 잠금 UI(잠금 잡기/해제 버튼·"편집 잠김" 배지)를 보여야 하는가. */
  readonly showPageLockControls: boolean;
  readonly blockWritesOnPageLock: boolean;
  readonly blockWritesOnLayerOccupancy: boolean;
}

export function resolveSurfaceLockPolicy(
  surface: CollaborationSurfaceDescriptor,
): SurfaceLockPolicy {
  if (classifySurfaceLockMode(surface) === "merge") {
    return {
      mode: "merge",
      pageLockRole: "presence-only",
      layerOccupancyRole: "presence-and-warning",
      acquirePageLockAsGuard: false,
      showPageLockControls: false,
      blockWritesOnPageLock: false,
      blockWritesOnLayerOccupancy: false,
    };
  }
  return {
    mode: "guarded",
    pageLockRole: "write-guard",
    layerOccupancyRole: "write-guard",
    acquirePageLockAsGuard: true,
    showPageLockControls: true,
    blockWritesOnPageLock: true,
    blockWritesOnLayerOccupancy: true,
  };
}

// ── 쓰기 판정 (페이지 잠금 × 레이어 점유 결합) ─────────────────────────────

export type SurfaceCollaborationWarningKind =
  /** 병합 표면: 다른 사람이 같은 페이지를 편집 중 — 막지 않고 알리기만 한다. */
  | "page-co-editing"
  /** 병합 표면: 다른 사람이 같은 레이어를 만지는 중 — 막지 않고 알리기만 한다. */
  | "layer-co-editing";

export interface SurfaceCollaborationWarning {
  readonly kind: SurfaceCollaborationWarningKind;
  /** 함께 작업 중인 상대. */
  readonly other: { readonly actorId: string; readonly displayName: string };
  /** layer-co-editing일 때만 있는 레이어 ID. */
  readonly layerId?: string;
}

export interface SurfaceWriteAccessInput {
  readonly surface: CollaborationSurfaceDescriptor;
  readonly pagePresence: readonly PagePresenceEntry[];
  readonly layerOccupancy: readonly LayerOccupancyEntry[];
  readonly pageId: string;
  /** 판정 대상 레이어. 레이어와 무관한 쓰기(핀 등)면 null. */
  readonly layerId: string | null;
  readonly actorId: string;
  readonly now: Date;
}

export interface SurfaceWriteAccess {
  readonly policy: SurfaceLockPolicy;
  /** 호스트가 쓰기 직전에 보는 단 하나의 결론. */
  readonly allowed: boolean;
  /** allowed가 false일 때 무엇이 막았는가. 병합 표면에서는 항상 null이다. */
  readonly blockedBy: "page-lock" | "layer-occupancy" | null;
  /** 원래 페이지 잠금 판정(강등 여부와 무관하게 그대로 실어 UI·로그가 근거를 본다). */
  readonly pageDecision: PageEditDecision;
  /** 원래 레이어 충돌 판정. layerId가 null이면 null. */
  readonly layerEvaluation: LayerConflictEvaluation | null;
  /** 병합 표면에서 페이지 잠금이 원래는 막았을 상황이었는가(강등이 실제로 일어났는가). */
  readonly pageLockDowngraded: boolean;
  /** 병합 표면에서 레이어 점유가 원래는 막았을 상황이었는가. */
  readonly layerOccupancyDowngraded: boolean;
  /** 강등된 충돌의 안내 목록. 가드 표면에서는 비어 있다(차단 자체가 안내를 겸한다). */
  readonly warnings: readonly SurfaceCollaborationWarning[];
}

/**
 * 쓰기 판정 결합 규칙:
 * - 가드 표면: 페이지 잠금이 막으면 차단, 아니면 레이어 점유가 막으면 차단.
 *   (기존 동작 그대로 — page-edit-lock의 canEditPage, 레이어 evaluateLayerConflict.)
 * - 병합 표면: 페이지 잠금·레이어 점유 모두 차단하지 않는다. 대신 원래
 *   막았을 상황이면 warnings로 "누가 같은 페이지/레이어를 작업 중인지"를
 *   돌려줘 프레즌스 표시에 결합한다.
 */
export function evaluateSurfaceWriteAccess(
  input: SurfaceWriteAccessInput,
): SurfaceWriteAccess {
  const policy = resolveSurfaceLockPolicy(input.surface);
  const pageDecision = canEditPage(input.pagePresence, input.pageId, input.actorId, input.now);
  const layerEvaluation =
    input.layerId === null
      ? null
      : evaluateLayerConflict(
          input.layerOccupancy,
          input.pageId,
          input.layerId,
          input.actorId,
          input.now,
        );

  if (policy.mode === "merge") {
    const warnings: SurfaceCollaborationWarning[] = [];
    if (!pageDecision.allowed && pageDecision.holder) {
      warnings.push({
        kind: "page-co-editing",
        other: {
          actorId: pageDecision.holder.actorId,
          displayName: pageDecision.holder.displayName,
        },
      });
    }
    if (layerEvaluation && !layerEvaluation.allowed && layerEvaluation.holder) {
      warnings.push({
        kind: "layer-co-editing",
        other: {
          actorId: layerEvaluation.holder.actorId,
          displayName: layerEvaluation.holder.displayName,
        },
        layerId: input.layerId!,
      });
    }
    return {
      policy,
      allowed: true,
      blockedBy: null,
      pageDecision,
      layerEvaluation,
      pageLockDowngraded: !pageDecision.allowed,
      layerOccupancyDowngraded: Boolean(layerEvaluation && !layerEvaluation.allowed),
      warnings,
    };
  }

  if (!pageDecision.allowed) {
    return {
      policy,
      allowed: false,
      blockedBy: "page-lock",
      pageDecision,
      layerEvaluation,
      pageLockDowngraded: false,
      layerOccupancyDowngraded: false,
      warnings: [],
    };
  }
  if (layerEvaluation && !layerEvaluation.allowed) {
    return {
      policy,
      allowed: false,
      blockedBy: "layer-occupancy",
      pageDecision,
      layerEvaluation,
      pageLockDowngraded: false,
      layerOccupancyDowngraded: false,
      warnings: [],
    };
  }
  return {
    policy,
    allowed: true,
    blockedBy: null,
    pageDecision,
    layerEvaluation,
    pageLockDowngraded: false,
    layerOccupancyDowngraded: false,
    warnings: [],
  };
}

// ── 프레즌스 요약 (표시 결합) ──────────────────────────────────────────────

export interface SurfacePresenceInput {
  readonly surface: CollaborationSurfaceDescriptor;
  readonly pagePresence: readonly PagePresenceEntry[];
  readonly layerOccupancy: readonly LayerOccupancyEntry[];
  readonly pageId: string;
  /** 내 작업 맥락 레이어들(선택 중 + 이 세션에서 주장했던 레이어). 경고 도출용. */
  readonly myLayerIds: readonly string[];
  readonly actorId: string;
  readonly now: Date;
}

export interface SurfacePresenceSummary {
  readonly policy: SurfaceLockPolicy;
  /** 페이지 프레즌스·잠금 도출값. 병합 표면에서는 holder가 있어도 "편집 중 표시"로만 쓴다. */
  readonly pageLock: PageEditLock;
  /** 페이지별 레이어 점유 요약(holder+contenders). (b) 표시의 정본. */
  readonly layers: readonly LayerOccupancySummary[];
  /** 내 레이어와 겹친 점유 경고. 병합·가드 표면 모두 표시용이다. */
  readonly myLayerWarnings: readonly LayerConflictWarning[];
  /** 지금 이 레이어를 만지는 사람(행 배지 대조용 단건 조회와 같은 결과). */
  readonly layerHolder: (layerId: string) => LayerOccupancyEntry | null;
}

/**
 * 한 표면의 표시 상태 결합: 페이지 프레즌스 + 레이어 점유를 한 번에 도출한다.
 * 프레즌스 바(EngineSurfacePresenceBar)와 레이어 패널이 같은 요약을 공유해
 * "페이지는 강등됐는데 레이어는 가드" 같은 표면 내 불일치가 생기지 않는다.
 */
export function summarizeSurfacePresence(input: SurfacePresenceInput): SurfacePresenceSummary {
  const policy = resolveSurfaceLockPolicy(input.surface);
  const pageLock = derivePageEditLock(input.pagePresence, input.pageId, input.now);
  const layers = summarizeLayerOccupancy(input.layerOccupancy, input.pageId, input.now);
  const myLayerWarnings = deriveMyLayerConflicts(
    input.layerOccupancy,
    input.pageId,
    input.myLayerIds,
    input.actorId,
    input.now,
  );
  return {
    policy,
    pageLock,
    layers,
    myLayerWarnings,
    layerHolder: (layerId: string) =>
      deriveLayerOccupant(input.layerOccupancy, input.pageId, layerId, input.now),
  };
}
