/**
 * T-044: 가상 스튜디오 근접 원고 합평 테이블(Proximity Review Table) &
 * WebRTC 화면공유 시그널링 유한 상태 머신(FSM).
 */

export type ReviewPinCategory = "composition" | "dialogue" | "anatomy" | "lighting" | "pacing";

export interface ProximityParticipant {
  readonly id: string;
  readonly name: string;
  readonly roleKo: string;
  /** 합평 테이블 중심(0, 0) 기준 미터 좌표 */
  readonly x: number;
  readonly y: number;
  readonly micMuted: boolean;
  readonly activeCutId: string;
}

export interface ProximityAudioLink {
  readonly fromId: string;
  readonly toId: string;
  readonly distanceMeters: number;
  readonly gain: number;
  readonly active: boolean;
}

export interface SharedCutPointer {
  readonly participantId: string;
  readonly participantName: string;
  readonly cutId: string;
  readonly normX: number;
  readonly normY: number;
  readonly updatedAtMs: number;
}

export interface ReviewCommentPin {
  readonly id: string;
  readonly cutId: string;
  readonly normX: number;
  readonly normY: number;
  readonly authorId: string;
  readonly authorName: string;
  readonly category: ReviewPinCategory;
  readonly body: string;
  readonly resolved: boolean;
  readonly createdAtIso: string;
}

export interface ProximityReviewTableState {
  readonly episodeId: string;
  readonly tableCenter: { readonly x: 0; readonly y: 0 };
  readonly autoJoinTableRadiusM: number;
  readonly hearingRadiusM: number;
  readonly participants: readonly ProximityParticipant[];
  readonly pointers: readonly SharedCutPointer[];
  readonly commentPins: readonly ReviewCommentPin[];
}

export interface ProximityChannelEvaluation {
  readonly joinedTableIds: readonly string[];
  readonly outsideTableIds: readonly string[];
  readonly audioLinks: readonly ProximityAudioLink[];
  readonly activeVoicePairCount: number;
}

export function computeAvatarDistance(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;
}

export function createInitialProximityReviewTable(
  episodeId = "ep-12",
  nowIso = "2026-11-21T12:00:00.000Z",
): ProximityReviewTableState {
  return Object.freeze({
    episodeId,
    tableCenter: Object.freeze({ x: 0, y: 0 }),
    autoJoinTableRadiusM: 2.2,
    hearingRadiusM: 3.5,
    participants: Object.freeze([
      { id: "p-pd", name: "김도윤 PD", roleKo: "총괄 PD", x: -0.9, y: 0.4, micMuted: false, activeCutId: "cut-01" },
      { id: "p-line", name: "박서윤 작가", roleKo: "선화·연출", x: 1.0, y: 0.5, micMuted: false, activeCutId: "cut-01" },
      { id: "p-color", name: "이민지 채색", roleKo: "채색·조명", x: 3.8, y: 1.6, micMuted: false, activeCutId: "cut-02" },
    ]),
    pointers: Object.freeze([
      { participantId: "p-pd", participantName: "김도윤 PD", cutId: "cut-01", normX: 0.42, normY: 0.34, updatedAtMs: 1_763_720_000_000 },
    ]),
    commentPins: Object.freeze<readonly ReviewCommentPin[]>([
      { id: "pin-1", cutId: "cut-01", normX: 0.38, normY: 0.28, authorId: "p-pd", authorName: "김도윤 PD", category: "dialogue", body: "현우 첫 대사 말풍선 우측 여백 12px 확보 요청", resolved: false, createdAtIso: nowIso },
      { id: "pin-2", cutId: "cut-02", normX: 0.65, normY: 0.55, authorId: "p-line", authorName: "박서윤 작가", category: "lighting", body: "노을 역광 림라이트 강도 한 단계 상향", resolved: false, createdAtIso: nowIso },
    ]),
  });
}

export function evaluateProximityChannels(state: ProximityReviewTableState): ProximityChannelEvaluation {
  const joinedTableIds: string[] = [];
  const outsideTableIds: string[] = [];
  for (const participant of state.participants) {
    if (computeAvatarDistance(participant, state.tableCenter) <= state.autoJoinTableRadiusM) {
      joinedTableIds.push(participant.id);
    } else {
      outsideTableIds.push(participant.id);
    }
  }

  const audioLinks: ProximityAudioLink[] = [];
  for (let i = 0; i < state.participants.length; i += 1) {
    for (let j = i + 1; j < state.participants.length; j += 1) {
      const a = state.participants[i];
      const b = state.participants[j];
      if (!a || !b) continue;
      const dist = computeAvatarDistance(a, b);
      const inRange = dist <= state.hearingRadiusM;
      const rawGain = inRange ? Math.max(0.15, 1 - dist / state.hearingRadiusM) : 0;
      const gain = a.micMuted && b.micMuted ? 0 : Math.round(rawGain * 100) / 100;
      audioLinks.push(Object.freeze({ fromId: a.id, toId: b.id, distanceMeters: dist, gain, active: inRange && gain > 0 }));
    }
  }

  return Object.freeze({
    joinedTableIds: Object.freeze(joinedTableIds),
    outsideTableIds: Object.freeze(outsideTableIds),
    audioLinks: Object.freeze(audioLinks),
    activeVoicePairCount: audioLinks.filter((l) => l.active).length,
  });
}

export function moveProximityParticipant(
  state: ProximityReviewTableState,
  participantId: string,
  x: number,
  y: number,
): ProximityReviewTableState {
  const clampedX = Math.max(-6, Math.min(6, Math.round(x * 100) / 100));
  const clampedY = Math.max(-6, Math.min(6, Math.round(y * 100) / 100));
  return Object.freeze({
    ...state,
    participants: Object.freeze(
      state.participants.map((p) => (p.id === participantId ? Object.freeze({ ...p, x: clampedX, y: clampedY }) : p)),
    ),
  });
}

export function updateSharedCutPointer(
  state: ProximityReviewTableState,
  pointer: SharedCutPointer,
): ProximityReviewTableState {
  const clamped: SharedCutPointer = Object.freeze({
    ...pointer,
    normX: Math.min(1, Math.max(0, Math.round(pointer.normX * 1000) / 1000)),
    normY: Math.min(1, Math.max(0, Math.round(pointer.normY * 1000) / 1000)),
  });
  return Object.freeze({
    ...state,
    pointers: Object.freeze([...state.pointers.filter((p) => p.participantId !== pointer.participantId), clamped]),
  });
}

export function addReviewCommentPin(
  state: ProximityReviewTableState,
  input: Omit<ReviewCommentPin, "id" | "resolved"> & { readonly id?: string },
): ProximityReviewTableState {
  const pin: ReviewCommentPin = Object.freeze({
    id: input.id ?? `pin-${state.commentPins.length + 1}`,
    cutId: input.cutId,
    normX: Math.min(1, Math.max(0, input.normX)),
    normY: Math.min(1, Math.max(0, input.normY)),
    authorId: input.authorId,
    authorName: input.authorName,
    category: input.category,
    body: input.body.trim(),
    resolved: false,
    createdAtIso: input.createdAtIso,
  });
  return Object.freeze({ ...state, commentPins: Object.freeze([...state.commentPins, pin]) });
}

export function toggleReviewCommentPinResolved(
  state: ProximityReviewTableState,
  pinId: string,
): ProximityReviewTableState {
  return Object.freeze({
    ...state,
    commentPins: Object.freeze(
      state.commentPins.map((p) => (p.id === pinId ? Object.freeze({ ...p, resolved: !p.resolved }) : p)),
    ),
  });
}

// ---------------------------------------------------------------------------
// 화면공유 WebRTC 시그널링 유한 상태 머신 (FSM)
// ---------------------------------------------------------------------------

export type ScreenShareSignalStatus =
  | "idle"
  | "requesting"
  | "negotiating-offer"
  | "awaiting-answer"
  | "streaming"
  | "paused"
  | "ended"
  | "error";

export type ScreenShareQualityPreset = "1080p-30fps" | "1440p-15fps-lineart" | "720p-30fps-saver";

export interface ScreenShareSignalState {
  readonly status: ScreenShareSignalStatus;
  readonly presenterId: string | null;
  readonly presenterName: string | null;
  readonly qualityPreset: ScreenShareQualityPreset;
  readonly offerSdpHash: string | null;
  readonly answerSdpHash: string | null;
  readonly iceCandidateCount: number;
  readonly viewerIds: readonly string[];
  readonly lastErrorKo: string | null;
  readonly transitionCount: number;
}

export type ScreenShareSignalEvent =
  | { readonly type: "request-share"; readonly presenterId: string; readonly presenterName: string; readonly qualityPreset?: ScreenShareQualityPreset }
  | { readonly type: "offer-created"; readonly offerSdpHash: string }
  | { readonly type: "answer-received"; readonly answerSdpHash: string }
  | { readonly type: "ice-candidate-added" }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "viewer-joined"; readonly viewerId: string }
  | { readonly type: "viewer-left"; readonly viewerId: string }
  | { readonly type: "stop" }
  | { readonly type: "fail"; readonly reasonKo: string }
  | { readonly type: "reset" };

export function createInitialScreenShareSignalState(): ScreenShareSignalState {
  return Object.freeze({
    status: "idle",
    presenterId: null,
    presenterName: null,
    qualityPreset: "1440p-15fps-lineart",
    offerSdpHash: null,
    answerSdpHash: null,
    iceCandidateCount: 0,
    viewerIds: Object.freeze([]),
    lastErrorKo: null,
    transitionCount: 0,
  });
}

export function transitionScreenShareState(
  state: ScreenShareSignalState,
  event: ScreenShareSignalEvent,
): { readonly ok: boolean; readonly state: ScreenShareSignalState; readonly messageKo: string } {
  const bump = (patch: Partial<ScreenShareSignalState>, messageKo: string) => ({
    ok: true,
    state: Object.freeze({ ...state, ...patch, transitionCount: state.transitionCount + 1 }),
    messageKo,
  });
  const reject = (messageKo: string) => ({ ok: false, state, messageKo });

  switch (event.type) {
    case "request-share": {
      if (state.status !== "idle" && state.status !== "ended" && state.status !== "error") {
        return reject(`현재 '${state.presenterName ?? "발표자"}'가 화면을 공유 중입니다. 종료 후 전환하세요.`);
      }
      return bump(
        {
          status: "requesting",
          presenterId: event.presenterId,
          presenterName: event.presenterName,
          qualityPreset: event.qualityPreset ?? state.qualityPreset,
          offerSdpHash: null,
          answerSdpHash: null,
          iceCandidateCount: 0,
          lastErrorKo: null,
        },
        `${event.presenterName} 화면공유 권한을 요청했습니다.`,
      );
    }
    case "offer-created": {
      if (state.status !== "requesting" && state.status !== "negotiating-offer") {
        return reject("화면공유 요청 상태에서만 SDP Offer를 생성할 수 있습니다.");
      }
      return bump({ status: "awaiting-answer", offerSdpHash: event.offerSdpHash }, "SDP Offer 생성 완료 · 참여자 응답 대기 중");
    }
    case "answer-received": {
      if (state.status !== "awaiting-answer") {
        return reject("SDP Answer 대기 상태가 아닙니다.");
      }
      return bump({ status: "streaming", answerSdpHash: event.answerSdpHash }, "WebRTC 화면공유 스트리밍이 시작되었습니다.");
    }
    case "ice-candidate-added": {
      if (state.status === "idle" || state.status === "ended") {
        return reject("활성 세션이 없어 ICE 후보를 추가할 수 없습니다.");
      }
      return bump({ iceCandidateCount: state.iceCandidateCount + 1 }, `ICE 경로 후보 ${state.iceCandidateCount + 1}개 수집됨`);
    }
    case "pause": {
      if (state.status !== "streaming") return reject("스트리밍 중에만 일시 정지할 수 있습니다.");
      return bump({ status: "paused" }, "화면공유를 일시 정지했습니다.");
    }
    case "resume": {
      if (state.status !== "paused") return reject("일시 정지 상태에서만 재개할 수 있습니다.");
      return bump({ status: "streaming" }, "화면공유 스트리밍을 재개했습니다.");
    }
    case "viewer-joined": {
      const next = state.viewerIds.includes(event.viewerId) ? state.viewerIds : Object.freeze([...state.viewerIds, event.viewerId]);
      return bump({ viewerIds: next }, `합평 참여자(${event.viewerId})가 화면공유에 연결되었습니다.`);
    }
    case "viewer-left": {
      return bump({ viewerIds: Object.freeze(state.viewerIds.filter((id) => id !== event.viewerId)) }, `참여자(${event.viewerId})가 화면공유에서 나갔습니다.`);
    }
    case "stop": {
      return bump({ status: "ended", viewerIds: Object.freeze([]) }, "화면공유가 정상 종료되었습니다.");
    }
    case "fail": {
      return bump({ status: "error", lastErrorKo: event.reasonKo }, `화면공유 오류: ${event.reasonKo}`);
    }
    case "reset": {
      return { ok: true, state: createInitialScreenShareSignalState(), messageKo: "화면공유 시그널링 상태를 초기화했습니다." };
    }
  }
}
