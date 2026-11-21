/**
 * 실시간 회의실/근접 음성 대화 FSM + 글로벌 6개국어 웹툰 실무 자동 번역 채팅 엔진.
 *
 * WebRTC 가능 환경과 오프라인 무과금(₩0) 결정론적 시뮬레이션 폴백을 지원하고,
 * 회의실 출입 및 집중 작업 모드(방해 금지)에 따라 음성 채널과 게인을 자동 제어한다.
 */

import {
  ACOUSTIC_ROOMS,
  computeRoomAcousticAttenuation,
  type AcousticRoomId,
  type StudioPhysicsWorldState,
  type Vec2,
} from "./vspace-physics-interactions-engine";
import {
  PLAZA_LANGUAGE_CODES,
  translateWebtoonMessage,
  type PlazaLanguageCode,
} from "./webtoon-multilingual-glossary";

export {
  PLAZA_LANGUAGE_CODES,
  PLAZA_LANGUAGE_METADATA,
  QUICK_STUDIO_PHRASE_KEYS,
  WEBTOON_STUDIO_GLOSSARY,
  translateWebtoonMessage,
  type PlazaLanguageCode,
  type PlazaLanguageMetadata,
  type WebtoonGlossaryEntry,
  type WebtoonTranslationResult,
} from "./webtoon-multilingual-glossary";

export type PlazaPresenceMode = "plaza-open" | "focus-dnd";

export type VoiceTransportMode = "webrtc-live" | "local-sim-fallback";

export interface VoiceParticipantState {
  readonly id: string;
  readonly name: string;
  readonly roleKo: string;
  readonly lang: PlazaLanguageCode;
  readonly x: number;
  readonly y: number;
  readonly roomId: AcousticRoomId;
  readonly speaking: boolean;
  readonly muted: boolean;
  readonly handRaised: boolean;
  readonly effectiveGain: number;
  readonly acousticReasonKo: string;
}

export interface VoiceSessionState {
  readonly connectionStatus: "disconnected" | "connecting" | "connected";
  readonly transportMode: VoiceTransportMode;
  readonly presenceMode: PlazaPresenceMode;
  readonly activeRoomId: AcousticRoomId;
  readonly activeChannelId: string;
  readonly activeRoomNameKo: string;
  readonly muted: boolean;
  readonly handRaised: boolean;
  readonly screenSharing: boolean;
  readonly typingUserIds: readonly string[];
  readonly participants: readonly VoiceParticipantState[];
  readonly eventLog: readonly string[];
}

export interface PlazaChatMessage {
  readonly id: string;
  readonly channelId: string;
  readonly roomId: AcousticRoomId;
  readonly senderId: string;
  readonly senderName: string;
  readonly senderLang: PlazaLanguageCode;
  readonly originalText: string;
  readonly translations: Readonly<Record<PlazaLanguageCode, string>>;
  readonly matchedGlossaryIds: readonly string[];
  readonly createdAtIso: string;
  readonly messageKind: "chat" | "negotiation" | "system";
}

export function detectVoiceTransportMode(signalingConnected = false): VoiceTransportMode {
  const hasWebRtc = typeof globalThis !== "undefined" && "RTCPeerConnection" in globalThis;
  return hasWebRtc && signalingConnected ? "webrtc-live" : "local-sim-fallback";
}

export function computeInverseSquareGain(
  distance: number,
  refDistance = 76,
  maxDistance = 320,
): number {
  if (!Number.isFinite(distance) || distance < 0) return 1;
  if (distance >= maxDistance) return 0;
  return Number((1 / (1 + (distance / refDistance) ** 2)).toFixed(3));
}

export function channelIdForRoom(roomId: AcousticRoomId): string {
  return roomId === "open-lounge"
    ? "voice-proximity:open-lounge"
    : `voice-room:${roomId}`;
}

function roomNameForId(roomId: AcousticRoomId): string {
  return ACOUSTIC_ROOMS.find((room) => room.id === roomId)?.nameKo ?? "오픈 라운지";
}

export function createDefaultVoiceParticipants(): readonly VoiceParticipantState[] {
  return [
    {
      id: "peer-pd-kim",
      name: "김서연 PD",
      roleKo: "총괄 PD",
      lang: "ko",
      x: 158,
      y: 120,
      roomId: "storyboard-room-a",
      speaking: true,
      muted: false,
      handRaised: false,
      effectiveGain: 0,
      acousticReasonKo: "방음문 닫힘으로 음향 완전 격리",
    },
    {
      id: "peer-ad-han",
      name: "한도윤 AD",
      roleKo: "아트 디렉터",
      lang: "ko",
      x: 478,
      y: 120,
      roomId: "ad-review-room-b",
      speaking: false,
      muted: false,
      handRaised: false,
      effectiveGain: 0,
      acousticReasonKo: "방음문 닫힘으로 음향 완전 격리",
    },
    {
      id: "peer-vn-minh",
      name: "Minh Nguyen",
      roleKo: "베트남 선화 리드",
      lang: "vi",
      x: 792,
      y: 132,
      roomId: "global-meeting-room-c",
      speaking: true,
      muted: false,
      handRaised: false,
      effectiveGain: 0.14,
      acousticReasonKo: "방음문 개방 상태 누설 음향",
    },
    {
      id: "peer-th-nat",
      name: "Nattapong S.",
      roleKo: "태국 채색·명암",
      lang: "th",
      x: 522,
      y: 310,
      roomId: "open-lounge",
      speaking: true,
      muted: false,
      handRaised: false,
      effectiveGain: 0.74,
      acousticReasonKo: "오픈 라운지 근접 음성",
    },
    {
      id: "peer-id-raka",
      name: "Raka Pratama",
      roleKo: "인도네시아 3D 배경",
      lang: "id",
      x: 392,
      y: 344,
      roomId: "open-lounge",
      speaking: false,
      muted: false,
      handRaised: true,
      effectiveGain: 0.42,
      acousticReasonKo: "오픈 라운지 근접 음성",
    },
    {
      id: "peer-jp-yuki",
      name: "Yuki Sato",
      roleKo: "일본 식자·현지화",
      lang: "ja",
      x: 824,
      y: 158,
      roomId: "global-meeting-room-c",
      speaking: false,
      muted: true,
      handRaised: false,
      effectiveGain: 0.11,
      acousticReasonKo: "방음문 개방 상태 누설 음향",
    },
  ];
}

export function createInitialVoiceSession(
  world: StudioPhysicsWorldState,
  presenceMode: PlazaPresenceMode = "plaza-open",
): VoiceSessionState {
  const base: VoiceSessionState = {
    connectionStatus: "connected",
    transportMode: detectVoiceTransportMode(false),
    presenceMode,
    activeRoomId: world.activeRoomId,
    activeChannelId: channelIdForRoom(world.activeRoomId),
    activeRoomNameKo: roomNameForId(world.activeRoomId),
    muted: presenceMode === "focus-dnd",
    handRaised: false,
    screenSharing: false,
    typingUserIds: [],
    participants: createDefaultVoiceParticipants(),
    eventLog: [
      `${roomNameForId(world.activeRoomId)} 음성 채널 준비 완료 (무과금 로컬 폴백 활성)`,
    ],
  };
  return syncVoiceChannelWithRoom(base, world, world.player);
}

export function syncVoiceChannelWithRoom(
  session: VoiceSessionState,
  world: StudioPhysicsWorldState,
  listenerPos: Vec2,
): VoiceSessionState {
  const nextRoomId = world.activeRoomId;
  const nextChannelId = channelIdForRoom(nextRoomId);
  const nextRoomNameKo = roomNameForId(nextRoomId);
  const roomChanged = nextRoomId !== session.activeRoomId;

  const updatedParticipants = session.participants.map((peer) => {
    if (session.presenceMode === "focus-dnd") {
      return {
        ...peer,
        effectiveGain: 0,
        acousticReasonKo: "집중 작업 모드(방해 금지) — 군중 음성 차단",
      };
    }
    const attenuation = computeRoomAcousticAttenuation(world, peer, listenerPos);
    return {
      ...peer,
      effectiveGain: peer.muted ? 0 : attenuation.gain,
      acousticReasonKo: peer.muted ? "상대방 음소거 상태" : attenuation.reasonKo,
    };
  });

  const nextLog = roomChanged
    ? [
        `${nextRoomNameKo} 음성 채널 자동 연결 (${nextChannelId})`,
        ...session.eventLog.slice(0, 7),
      ]
    : session.eventLog;

  return {
    ...session,
    connectionStatus: session.presenceMode === "focus-dnd" ? "disconnected" : "connected",
    activeRoomId: nextRoomId,
    activeChannelId: nextChannelId,
    activeRoomNameKo: nextRoomNameKo,
    participants: updatedParticipants,
    eventLog: nextLog,
  };
}

export function setVoicePresenceMode(
  session: VoiceSessionState,
  world: StudioPhysicsWorldState,
  presenceMode: PlazaPresenceMode,
): VoiceSessionState {
  const isDnd = presenceMode === "focus-dnd";
  const logEntry = isDnd
    ? "집중 작업 모드 활성화: 광장 알림·군중 음성 완전 차단"
    : "광장 오픈 모드 복귀: 회의실 및 근접 음성 채널 재연결";
  const nextBase: VoiceSessionState = {
    ...session,
    presenceMode,
    muted: isDnd ? true : session.muted,
    screenSharing: isDnd ? false : session.screenSharing,
    eventLog: [logEntry, ...session.eventLog.slice(0, 7)],
  };
  return syncVoiceChannelWithRoom(nextBase, world, world.player);
}

export function toggleVoiceMute(session: VoiceSessionState): VoiceSessionState {
  const nextMuted = !session.muted;
  return {
    ...session,
    muted: nextMuted,
    eventLog: [
      nextMuted ? "내 마이크를 음소거했습니다." : "내 마이크를 켰습니다.",
      ...session.eventLog.slice(0, 7),
    ],
  };
}

export function toggleHandRaise(session: VoiceSessionState): VoiceSessionState {
  const nextHand = !session.handRaised;
  return {
    ...session,
    handRaised: nextHand,
    eventLog: [
      nextHand ? "발언 요청(손들기)을 올렸습니다." : "손들기를 내렸습니다.",
      ...session.eventLog.slice(0, 7),
    ],
  };
}

export function toggleScreenShare(session: VoiceSessionState): VoiceSessionState {
  const nextShare = !session.screenSharing;
  return {
    ...session,
    screenSharing: nextShare,
    eventLog: [
      nextShare
        ? `${session.activeRoomNameKo}에 원고 캔버스 화면 공유 시작`
        : "화면 공유를 종료했습니다.",
      ...session.eventLog.slice(0, 7),
    ],
  };
}

export function setTypingStatus(
  session: VoiceSessionState,
  userId: string,
  isTyping: boolean,
): VoiceSessionState {
  const exists = session.typingUserIds.includes(userId);
  if (isTyping && !exists) {
    return { ...session, typingUserIds: [...session.typingUserIds, userId] };
  }
  if (!isTyping && exists) {
    return {
      ...session,
      typingUserIds: session.typingUserIds.filter((id) => id !== userId),
    };
  }
  return session;
}

export function createTranslatedChatMessage(input: {
  readonly id: string;
  readonly channelId: string;
  readonly roomId: AcousticRoomId;
  readonly senderId: string;
  readonly senderName: string;
  readonly senderLang: PlazaLanguageCode;
  readonly text: string;
  readonly createdAtIso: string;
  readonly messageKind?: "chat" | "negotiation" | "system";
}): PlazaChatMessage {
  const translations = {} as Record<PlazaLanguageCode, string>;
  const matchedSet = new Set<string>();

  for (const lang of PLAZA_LANGUAGE_CODES) {
    const res = translateWebtoonMessage(input.text, input.senderLang, lang);
    translations[lang] = res.translatedText;
    for (const id of res.matchedGlossaryIds) matchedSet.add(id);
  }

  return {
    id: input.id,
    channelId: input.channelId,
    roomId: input.roomId,
    senderId: input.senderId,
    senderName: input.senderName,
    senderLang: input.senderLang,
    originalText: input.text.trim(),
    translations,
    matchedGlossaryIds: [...matchedSet],
    createdAtIso: input.createdAtIso,
    messageKind: input.messageKind ?? "chat",
  };
}

export function createInitialGlobalPlazaChatMessages(): readonly PlazaChatMessage[] {
  return [
    createTranslatedChatMessage({
      id: "msg-init-01",
      channelId: "voice-room:global-meeting-room-c",
      roomId: "global-meeting-room-c",
      senderId: "peer-pd-kim",
      senderName: "김서연 PD",
      senderLang: "ko",
      text: "EP12 선화 20컷 마감 일정과 단가 협의 진행합니다.",
      createdAtIso: "2026-11-21T14:00:00.000Z",
      messageKind: "negotiation",
    }),
    createTranslatedChatMessage({
      id: "msg-init-02",
      channelId: "voice-room:global-meeting-room-c",
      roomId: "global-meeting-room-c",
      senderId: "peer-vn-minh",
      senderName: "Minh Nguyen (VN)",
      senderLang: "vi",
      text: "Đã xác nhận, bắt đầu làm ngay · Hạn chót 20 khung đi nét",
      createdAtIso: "2026-11-21T14:01:20.000Z",
      messageKind: "chat",
    }),
    createTranslatedChatMessage({
      id: "msg-init-03",
      channelId: "voice-proximity:open-lounge",
      roomId: "open-lounge",
      senderId: "peer-th-nat",
      senderName: "Nattapong S. (TH)",
      senderLang: "th",
      text: "ปรับโทนสีให้สม่ำเสมอ · สามารถส่งงานได้ภายในคืนนี้ตามเวลา KST",
      createdAtIso: "2026-11-21T14:02:45.000Z",
      messageKind: "chat",
    }),
    createTranslatedChatMessage({
      id: "msg-init-04",
      channelId: "voice-proximity:open-lounge",
      roomId: "open-lounge",
      senderId: "peer-id-raka",
      senderName: "Raka Pratama (ID)",
      senderLang: "id",
      text: "Penyesuaian pencahayaan latar 3D · Pembayaran escrow bertahap",
      createdAtIso: "2026-11-21T14:04:10.000Z",
      messageKind: "negotiation",
    }),
  ];
}
