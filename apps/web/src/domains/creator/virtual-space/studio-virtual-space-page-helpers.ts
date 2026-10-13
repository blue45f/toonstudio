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

/** 근접 NPC 카드가 만드는 데 쓰는 최소 필드. 대화 가능 여부는 interaction이 있는지로만 본다. */
type StudioNearbyNpcSource = Pick<StudioVirtualSpaceNearbyNpc, "id" | "labelKo" | "labelEn" | "activityKo" | "activityEn" | "skinKey"> & {
  readonly interaction: unknown;
};

/**
 * 하단 상호작용 프롬프트가 말을 거는 NPC. 가까운 오브젝트 상호작용이 있으면 프롬프트는 그쪽을 가리키므로 NPC는 없고,
 * 아니면 가까운 NPC 중 대화할 수 있는 첫 NPC다.
 */
export function studioPromptNpc<Npc extends { readonly interaction: unknown }>(
  nearbyNpcs: readonly Npc[],
  hasObjectInteraction: boolean,
): Npc | null {
  return hasObjectInteraction ? null : nearbyNpcs.find((npc) => npc.interaction) ?? null;
}

/**
 * 근접 스트립이 그리는 사람·NPC 카드 파생. 개인 공간에서는 사람 카드를 비운다.
 * `promptNpcId`는 하단 프롬프트가 이미 말을 거는 NPC다. 같은 NPC 카드에 같은 동작의 대화 버튼을 또 두면 화면 위아래에 이름과 버튼이
 * 겹쳐 보이므로, 그 카드는 이름·활동만 보여 준다.
 */
export function studioNearbyCards(input: {
  readonly personal: boolean;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly nearbyNpcs: readonly StudioVirtualSpaceNearbyNpc[];
  readonly conversationMemberIds: readonly string[];
  readonly promptNpcId?: string | null;
}): {
  readonly people: ReturnType<typeof studioNearbyPeopleCards>;
  readonly npcs: ReturnType<typeof studioNearbyNpcCards>;
} {
  return Object.freeze({
    people: studioNearbyPeopleCards(input),
    npcs: studioNearbyNpcCards(input.nearbyNpcs, input.promptNpcId ?? null),
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

/** `canTalk`는 카드에 대화 버튼을 둘지다(대화할 수 있어도 하단 프롬프트가 맡은 NPC면 false). */
export function studioNearbyNpcCards(nearbyNpcs: readonly StudioNearbyNpcSource[], promptNpcId: string | null = null) {
  return nearbyNpcs.map((npc) => ({
    id: npc.id, labelKo: npc.labelKo, labelEn: npc.labelEn, activityKo: npc.activityKo, activityEn: npc.activityEn,
    skinKey: npc.skinKey, canTalk: Boolean(npc.interaction) && npc.id !== promptNpcId,
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
