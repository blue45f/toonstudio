/**
 * Wave 129 — 웹툰 연재 스튜디오 레드라인 핀 권한 분리(SoD) 상태 머신 및 결정론적 세션 엔진.
 *
 * 핵심 불변식 (Fail-Closed):
 * 1. 자기 승인 차단: `verified-closed` 승인은 검수 권한 역할(`pd-editor` | `art-director`)이면서
 *    수정 완료 처리자(`resolvedByActorId`)와 다른 사람만 수행할 수 있다.
 * 2. 불법 단계 건너뛰기 차단: `open → in-progress → resolved-pending-verify → verified-closed` 및
 *    `resolved-pending-verify → reopened → in-progress` 경로만 허용한다.
 * 3. 재수정 사유 필수: `reopened` 전이 시 공백이 아닌 사유를 반드시 기록해야 한다.
 */

import {
  STUDIO_ROLE_LABELS_KO,
  STUDIO_VERIFIER_ROLES,
  type EpisodeSignOffOptions,
  type RedlinePinItem,
  type RedlinePinStatus,
  type RedlinePinTransitionEvent,
  type RedlinePinTransitionInput,
  type RedlinePinTransitionResult,
  type RedlineRevisionLedgerSession,
  type StudioCollaboratorRole,
} from "./redline-markup-types";
import { computeRedlineLedgerSha256Hex } from "./redline-sha256-and-canonical";
import {
  DEFAULT_CLUSTER_RADIUS_NORM,
  MAX_CLUSTER_RADIUS_NORM,
  MIN_CLUSTER_RADIUS_NORM,
  clampNormalizedCoord,
  computeRemainingWorkloadByRole,
  detectOverlappingRedlinePins,
  diffRevisionRounds,
  evaluateEpisodeRevisionSignOff,
  normalizeRedlinePin,
  normalizeRedlinePins,
  sanitizeRoundNumber,
} from "./redline-spatial-clustering-and-signoff";

export {
  DEFAULT_CLUSTER_RADIUS_NORM,
  MAX_CLUSTER_RADIUS_NORM,
  MIN_CLUSTER_RADIUS_NORM,
  clampNormalizedCoord,
  computeRedlineLedgerSha256Hex,
  computeRemainingWorkloadByRole,
  detectOverlappingRedlinePins,
  diffRevisionRounds,
  evaluateEpisodeRevisionSignOff,
  normalizeRedlinePin,
  normalizeRedlinePins,
};

const ALLOWED_TRANSITIONS: Readonly<Record<RedlinePinStatus, readonly RedlinePinStatus[]>> = {
  open: ["in-progress"],
  "in-progress": ["resolved-pending-verify"],
  "resolved-pending-verify": ["verified-closed", "reopened"],
  "verified-closed": [],
  reopened: ["in-progress"],
};

/**
 * 검수 최종 승인(`verified-closed`) 권한을 가진 역할인지 판정한다.
 */
export function isVerifierRole(role: StudioCollaboratorRole): boolean {
  return STUDIO_VERIFIER_ROLES.includes(role);
}

/**
 * 두 상태 사이 전이가 스튜디오 합의 상태 머신에서 허용되는지 판정한다.
 */
export function canTransitionRedlineStatus(
  fromStatus: RedlinePinStatus,
  toStatus: RedlinePinStatus,
): boolean {
  return ALLOWED_TRANSITIONS[fromStatus].includes(toStatus);
}

/**
 * 엄격한 권한 분리(SoD) 및 상태 머신 가드를 적용해 레드라인 핀 상태를 전이한다.
 * 거부 시 입력 핀을 변경하지 않고 `rejected: true`와 사유 코드를 반환한다.
 */
export function transitionRedlinePinStatus(
  pin: RedlinePinItem,
  input: RedlinePinTransitionInput,
): RedlinePinTransitionResult {
  const current = normalizeRedlinePin(pin);
  const fromStatus = current.status;
  const toStatus = input.targetStatus;

  if (!canTransitionRedlineStatus(fromStatus, toStatus)) {
    return {
      rejected: true,
      rejectionCode: "INVALID_STATE_TRANSITION",
      reasonKo: `상태 전이 불가: '${fromStatus}'에서 '${toStatus}'로 바로 이동할 수 없습니다.`,
      previousStatus: fromStatus,
      nextStatus: fromStatus,
      pin: current,
    };
  }

  const actorId = input.actorId.trim();
  if (actorId.length === 0) {
    return {
      rejected: true,
      rejectionCode: "INVALID_ACTOR_ID",
      reasonKo: "작업자 식별자(actorId)가 비어 있어 상태 전이를 차단했습니다.",
      previousStatus: fromStatus,
      nextStatus: fromStatus,
      pin: current,
    };
  }

  const trimmedReason = input.reasonKo?.trim() ?? "";

  if (toStatus === "reopened" && trimmedReason.length === 0) {
    return {
      rejected: true,
      rejectionCode: "REOPEN_REASON_REQUIRED",
      reasonKo: "재수정 요청(reopened) 시 구체적인 반려 사유를 반드시 기록해야 합니다.",
      previousStatus: fromStatus,
      nextStatus: fromStatus,
      pin: current,
    };
  }

  if (toStatus === "verified-closed") {
    const resolverId = (current.resolvedByActorId ?? current.claimedByActorId ?? "").trim();
    if (resolverId.length > 0 && resolverId === actorId) {
      return {
        rejected: true,
        rejectionCode: "SELF_APPROVAL_FORBIDDEN",
        reasonKo: `자기 승인 차단: 수정 완료 처리자(${resolverId})는 본인 작업 핀(${current.pinId})을 검수 승인할 수 없습니다.`,
        previousStatus: fromStatus,
        nextStatus: fromStatus,
        pin: current,
      };
    }

    if (!isVerifierRole(input.actorRole)) {
      return {
        rejected: true,
        rejectionCode: "INSUFFICIENT_VERIFIER_ROLE",
        reasonKo: `검수 권한 부족: '${STUDIO_ROLE_LABELS_KO[input.actorRole]}' 역할은 최종 검수 승인(verified-closed)을 수행할 수 없습니다.`,
        previousStatus: fromStatus,
        nextStatus: fromStatus,
        pin: current,
      };
    }

    if (input.requireResolverActorId === true && resolverId.length === 0) {
      return {
        rejected: true,
        rejectionCode: "MISSING_RESOLVER_ACTOR",
        reasonKo: `수정 이력 누락: 핀(${current.pinId})의 수정 완료 처리자(resolvedByActorId)가 확인되지 않아 승인을 보류했습니다.`,
        previousStatus: fromStatus,
        nextStatus: fromStatus,
        pin: current,
      };
    }
  }

  const nextRoundNumber =
    typeof input.roundNumber === "number" && Number.isFinite(input.roundNumber)
      ? Math.max(current.roundNumber, sanitizeRoundNumber(input.roundNumber))
      : current.roundNumber;

  const prevHistory = current.history ?? [];
  const event: RedlinePinTransitionEvent = {
    sequence: prevHistory.length + 1,
    fromStatus,
    toStatus,
    actorId,
    actorRole: input.actorRole,
    roundNumber: nextRoundNumber,
    ...(trimmedReason.length > 0 ? { reasonKo: trimmedReason } : {}),
    ...(input.timestampIso?.trim() ? { timestampIso: input.timestampIso.trim() } : {}),
  };

  let nextPin: RedlinePinItem;

  if (toStatus === "in-progress") {
    nextPin = {
      pinId: current.pinId,
      cutId: current.cutId,
      normX: current.normX,
      normY: current.normY,
      category: current.category,
      severity: current.severity,
      authorId: current.authorId,
      authorRole: current.authorRole,
      assigneeRole: current.assigneeRole,
      noteKo: current.noteKo,
      roundNumber: nextRoundNumber,
      status: toStatus,
      claimedByActorId: actorId,
      reopenCount: current.reopenCount ?? 0,
      ...(current.lastReopenReasonKo ? { lastReopenReasonKo: current.lastReopenReasonKo } : {}),
      history: [...prevHistory, event],
    };
  } else if (toStatus === "resolved-pending-verify") {
    nextPin = {
      ...current,
      roundNumber: nextRoundNumber,
      status: toStatus,
      claimedByActorId: current.claimedByActorId ?? actorId,
      resolvedByActorId: actorId,
      resolvedByRole: input.actorRole,
      history: [...prevHistory, event],
    };
  } else if (toStatus === "verified-closed") {
    nextPin = {
      ...current,
      roundNumber: nextRoundNumber,
      status: toStatus,
      verifiedByActorId: actorId,
      verifiedByRole: input.actorRole,
      history: [...prevHistory, event],
    };
  } else {
    nextPin = {
      ...current,
      roundNumber: nextRoundNumber,
      status: toStatus,
      reopenCount: (current.reopenCount ?? 0) + 1,
      lastReopenReasonKo: trimmedReason,
      history: [...prevHistory, event],
    };
  }

  return {
    rejected: false,
    previousStatus: fromStatus,
    nextStatus: toStatus,
    pin: nextPin,
    event,
  };
}

/**
 * 레드라인 핀 원장 전이를 일관되게 관리하는 결정론적 세션 래퍼를 생성한다.
 */
export function createRedlineRevisionSession(
  initialPins: readonly RedlinePinItem[],
  defaultOptions?: EpisodeSignOffOptions,
): RedlineRevisionLedgerSession {
  const store = new Map<string, RedlinePinItem>();
  const normalizedInitial = normalizeRedlinePins(initialPins);
  for (let i = 0; i < normalizedInitial.length; i += 1) {
    const pin = normalizedInitial[i];
    if (pin) store.set(pin.pinId, pin);
  }

  const snapshot = (): readonly RedlinePinItem[] =>
    [...store.values()].sort((a, b) => a.pinId.localeCompare(b.pinId));

  return {
    getPins: snapshot,
    getPin: (pinId: string) => store.get(pinId.trim()),
    transitionPin: (pinId: string, input: RedlinePinTransitionInput) => {
      const key = pinId.trim();
      const existing = store.get(key);
      if (!existing) return undefined;
      const result = transitionRedlinePinStatus(existing, input);
      if (!result.rejected) {
        store.set(key, result.pin);
      }
      return result;
    },
    evaluateSignOff: (overrideOptions?: EpisodeSignOffOptions) =>
      evaluateEpisodeRevisionSignOff(snapshot(), {
        ...defaultOptions,
        ...overrideOptions,
      }),
    getLedgerSha256Hex: () => computeRedlineLedgerSha256Hex(snapshot()),
    snapshot,
  };
}
