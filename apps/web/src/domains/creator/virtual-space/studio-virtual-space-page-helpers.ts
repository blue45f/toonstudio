// 가상 스튜디오 경험 페이지의 순수 헬퍼 — 쿼리 기반 초기 패널 판정과 지점 거리.
// StudioVirtualSpacePage.tsx에서 분리한 모듈 스코프 상수·함수 묶음이다.
import { writeStudioVirtualSpaceLastPosition } from "./studio-virtual-space-last-position";
import type {
  StudioVirtualSpacePoint,
  StudioVirtualSpacePresenceState,
} from "./studio-virtual-space-model";
import type { StudioVirtualWorkspacePanel } from "./studio-virtual-space-panel-scope";
import type { StudioVirtualSpaceNearbyNpc } from "./studio-virtual-space-engine-events";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence-protocol";
import {
  writeStudioVirtualSpaceSessionPoint,
  type StudioVirtualSpacePositionScope,
} from "./studio-virtual-space-session-position";

export const SIDE_PANEL_ID = "studio-space-side-panel";
export const TALK_DISTANCE = 120;
export const SHARED_ACTIVITY_DISTANCE = 156;

export function initialPanel(search: string): StudioVirtualWorkspacePanel | null {
  const query = new URLSearchParams(search);
  if (query.get("activity") === "board") return "board";
  return query.has("session") || query.get("activity") === "sessions" ? "sessions" : null;
}

export function distanceBetween(left: StudioVirtualSpacePoint, right: StudioVirtualSpacePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/** 근접 스트립이 그리는 사람·NPC 카드 파생. 개인 공간에서는 사람 카드를 비운다. */
export function studioNearbyCards(input: {
  readonly personal: boolean;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly nearbyNpcs: readonly StudioVirtualSpaceNearbyNpc[];
  readonly conversationMemberIds: readonly string[];
}): {
  readonly people: ReturnType<typeof studioNearbyPeopleCards>;
  readonly npcs: ReturnType<typeof studioNearbyNpcCards>;
} {
  return Object.freeze({
    people: studioNearbyPeopleCards(input),
    npcs: studioNearbyNpcCards(input.nearbyNpcs),
  });
}

function studioNearbyPeopleCards(input: {
  readonly personal: boolean;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly conversationMemberIds: readonly string[];
}) {
  return input.personal ? [] : input.snapshot.nearbyPeers.map((peer) => ({
    id: peer.participant.sessionId, name: peer.participant.displayName, point: peer.state,
    activity: peer.state.activity, userStatus: peer.state.userStatus ?? null,
    avatarIndex: peer.state.avatarIndex, appearance: peer.state.appearance,
    inConversation: input.conversationMemberIds.includes(peer.participant.sessionId),
  }));
}

function studioNearbyNpcCards(nearbyNpcs: readonly StudioVirtualSpaceNearbyNpc[]) {
  return nearbyNpcs.map((npc) => ({
    id: npc.id, labelKo: npc.labelKo, labelEn: npc.labelEn, activityKo: npc.activityKo, activityEn: npc.activityEn,
    skinKey: npc.skinKey, canTalk: Boolean(npc.interaction),
  }));
}

/** 프레즌스 연결 전에 페이지가 그리는 빈 초기 스냅샷(자기 상태만 채워져 있다). */
export function createStudioVirtualSpaceInitialSnapshot(
  self: StudioVirtualSpacePresenceState,
): StudioVirtualSpaceSnapshot {
  return {
    self,
    peers: [],
    nearbyPeers: [],
    selfReaction: null,
    peerReactions: [],
    chatMessages: [],
    chatBubbles: [],
    selfChatBubble: null,
    peerTyping: [],
    peerImpacts: [],
    objectStates: [],
    peerFixtures: [],
    direct: false,
  };
}

/**
 * 현재 위치를 세션 기록에 남기고, 로그인 사용자는 탭을 닫아도 남는 마지막
 * 위치(W-2 위치 복원)도 함께 남긴다. 페이지의 디바운스 저장·pagehide 저장이 공유한다.
 */
export function writeStudioVirtualSpacePositionRecords(input: {
  readonly positionScope: StudioVirtualSpacePositionScope;
  readonly projectId: string;
  readonly signedIn: boolean;
  readonly placeId: string;
  readonly point: StudioVirtualSpacePoint;
}): void {
  writeStudioVirtualSpaceSessionPoint(input.positionScope, input.point);
  if (input.signedIn) {
    writeStudioVirtualSpaceLastPosition(input.projectId, { placeId: input.placeId, point: input.point });
  }
}
