import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioLiveCollaborationContextValue } from "../../live/studio-live-collaboration-context";
import {
  closeStudioP2pHuddle,
  openStudioP2pHuddle,
  STUDIO_P2P_HUDDLE_CLOSED_EVENT,
  type StudioP2pHuddleClosedDetail,
} from "../../live/huddle/studio-p2p-huddle-events";
import type { StudioSpaceSocialAction, StudioSpaceSocialRequest } from "../StudioVirtualSpaceSocialPanel";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import { StudioAudioLipsyncMonitor, type StudioVisemeWeights } from "../audio/studio-virtual-space-audio-lipsync";
import { useStudioLiveCanvasTheaterFeed } from "../media/studio-virtual-space-canvas-stream";
import type { StudioVirtualSpaceActivity, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS, type StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import { verifyStudioVirtualSpaceReviewSubject } from "../studio-virtual-space-review-invitation";
import { studioVirtualSpaceSeatedActors } from "../studio-virtual-space-seated-actors";
import { writeStudioVirtualSpaceSessionPoint, type StudioVirtualSpacePositionScope } from "../studio-virtual-space-session-position";
import { isStudioSocialWalkTogether, studioSocialRequestFollowsPeer } from "../studio-virtual-space-social-walk";
import type { StudioTownEvent } from "../studio-virtual-space-town-program";
import { studioWorldSpawn, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { recordingBoothSilentZone } from "../studio-virtual-space-recording-booth-entry";
import type { StudioRecordingBoothConfig } from "../studio-virtual-space-recording-booth";
import { useStudioPrivateRoom } from "../private-room/use-studio-private-room";
import { useStudioOfficePeerApproach } from "../use-studio-office-peer-approach";
import { useStudioVirtualSpaceConversation } from "../use-studio-virtual-space-conversation";
import { useStudioVirtualSpaceMegaphone } from "../use-studio-virtual-space-megaphone";
import { useStudioVirtualSpaceSlots } from "../use-studio-virtual-space-slots";
import { useStudioVirtualSpaceSocial } from "../use-studio-virtual-space-social";
import { useStudioVirtualSpaceZoneMic } from "../use-studio-virtual-space-zone-mic";
import type { SpaceAtmosphere } from "../hud/SpaceAtmosphereSettings";
import { useSpaceAttentionLoss } from "../hud/use-space-attention-loss";
import { useSpaceProximityMedia, useSpaceProximityScope } from "../hud/use-space-proximity-media";
import type { SpaceStatusOption } from "../hud/space-dock-model";
import { distanceBetween, SHARED_ACTIVITY_DISTANCE, TALK_DISTANCE } from "../studio-virtual-space-page-helpers";
import type { VirtualSpacePermissions } from "./use-virtual-space-permissions";
import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import type { StudioVirtualSpaceZone } from "../studio-virtual-space-zones";

export interface UseVirtualSpaceSocialAndMediaInput {
  readonly projectId: string;
  readonly personal: boolean;
  readonly isGuest: boolean;
  readonly permissions: VirtualSpacePermissions;
  readonly live: StudioLiveCollaborationContextValue;
  readonly worldManifest: StudioVirtualSpaceWorldManifest;
  readonly navigationWorld: StudioVirtualSpaceWorldManifest;
  readonly activeWorldScope: string;
  readonly publishedWorld: { readonly publication: { readonly manifest: { readonly id: string }; readonly revisionId: string; readonly contentHash: string } } | null | undefined;
  readonly sharedWorldAllowed: boolean;
  readonly worldReady: boolean;
  readonly authoringMode: boolean;
  readonly connectivityServerAvailable: boolean;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly selfRef: React.RefObject<StudioVirtualSpaceSnapshot["self"]>;
  readonly moving: boolean;
  readonly activity: StudioVirtualSpaceActivity;
  readonly atmosphere: SpaceAtmosphere;
  readonly ghostMode: boolean;
  readonly fallbackIdentity: string;
  readonly privateActorId: string | null;
  readonly localName: string;
  readonly officeNavigationScope: string;
  readonly positionScope: StudioVirtualSpacePositionScope;
  readonly boothConfig: StudioRecordingBoothConfig;
  readonly tileSilentZones: readonly StudioVirtualSpaceZone[];
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
  readonly followingPeerId: string | null;
  readonly setFollowingPeer: (id: string | null) => void;
  readonly startFollowingPeer: (id: string) => void;
  readonly sendReaction: (id: StudioSpaceEmoteId) => void;
  readonly setPresenceStatus: (option: SpaceStatusOption) => void;
  readonly setPanel: (panel: StudioVirtualWorkspacePanel | null) => void;
  readonly setSearchOpen: (open: boolean) => void;
  readonly setSelectedPeerId: (id: string | null) => void;
  readonly blockingSurfaceOpen: boolean;
  readonly navigate: (to: string) => void;
  readonly notify: (message: string, tone?: "info" | "success" | "warn" | "error") => void;
  readonly bt: (ko: string, en: string) => string;
}

export function useVirtualSpaceSocialAndMedia(input: UseVirtualSpaceSocialAndMediaInput) {
  const {
    projectId, personal, isGuest, permissions, live, worldManifest, navigationWorld,
    activeWorldScope, publishedWorld, sharedWorldAllowed, worldReady, authoringMode,
    connectivityServerAvailable, snapshot, selfRef, moving, activity, atmosphere,
    ghostMode, fallbackIdentity, privateActorId, localName, officeNavigationScope,
    positionScope, boothConfig, tileSilentZones, engineBridge, followingPeerId,
    setFollowingPeer, startFollowingPeer, sendReaction, setPresenceStatus, setPanel,
    setSearchOpen, setSelectedPeerId, blockingSurfaceOpen, navigate, notify, bt,
  } = input;

  const [privateZoneSelection, setPrivateZoneSelection] = useState<string | null>(null);
  const [reviewPeerId, setReviewPeerId] = useState<string | null>(null);
  const [openingReview, setOpeningReview] = useState(false);
  const [sharedActivity, setSharedActivity] = useState<StudioSpaceSocialRequest | null>(null);
  const [waveActorIds, setWaveActorIds] = useState<readonly string[]>([]);
  const [spotlightEventId, setSpotlightEventId] = useState<string | null>(null);
  const [userMicMuted, setUserMicMuted] = useState(false);
  const [megaphoneBannerDismissed, setMegaphoneBannerDismissed] = useState(false);
  const [visemeByActorId, setVisemeByActorId] = useState<Readonly<Record<string, StudioVisemeWeights>>>({});

  const shownGreetings = useRef(new Set<string>());
  const sharedActivityRef = useRef<StudioSpaceSocialRequest | null>(null);
  const acceptedActivityHandler = useRef<(request: StudioSpaceSocialRequest) => void>(() => undefined);
  const cancelSlotsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const cancelOfficeApproachRef = useRef<() => void>(() => undefined);

  const canParticipateLive = permissions.canVoice || permissions.canSit;
  const socialFocused = activity === "focused" || activity === "away" || atmosphere === "focus";

  const slots = useStudioVirtualSpaceSlots({
    room: live.room,
    manifest: worldManifest,
    publishedScope: activeWorldScope,
    enabled: permissions.canSit && sharedWorldAllowed && worldReady && !authoringMode && !socialFocused,
    point: snapshot.self,
    moving,
    onApproach: (point) => {
      cancelOfficeApproachRef.current();
      setFollowingPeer(null);
      engineBridge.requestMove(point);
    },
  });
  useEffect(() => { cancelSlotsRef.current = slots.cancel; }, [slots.cancel]);

  const seatedActors = useMemo(() => studioVirtualSpaceSeatedActors({
    manifest: worldManifest,
    lease: slots.snapshot,
    selfSessionId: live.room?.participant.sessionId,
    selfActorId: fallbackIdentity,
    self: snapshot.self,
    peers: snapshot.peers,
  }), [fallbackIdentity, live.room?.participant.sessionId, slots.snapshot, snapshot.peers, snapshot.self, worldManifest]);

  const {
    snapshot: socialSnapshot,
    interactive: socialInteractive,
    request: requestSocial,
    respond: respondSocial,
    cancel: cancelSocial,
    requestReview,
    respondReview,
    setPeerBlocked,
    wave,
  } = useStudioVirtualSpaceSocial({
    workId: projectId,
    participant: live.room?.participant,
    port: live.room?.direct,
    manifest: worldManifest,
    publishedScope: activeWorldScope,
    presence: snapshot,
    acousticBindingAvailable: worldReady && !authoringMode && snapshot.direct,
    enabled: canParticipateLive && sharedWorldAllowed && worldReady && !authoringMode && snapshot.direct && !socialFocused,
    onAccepted: (request) => acceptedActivityHandler.current(request),
  });

  const officeApproachEnabled = !personal && canParticipateLive && worldReady && sharedWorldAllowed && !authoringMode
    && snapshot.direct && connectivityServerAvailable && socialInteractive && !socialFocused;

  const officeApproach = useStudioOfficePeerApproach({
    manifest: navigationWorld,
    scope: `${officeNavigationScope}:${activeWorldScope}`,
    self: snapshot.self,
    peers: snapshot.peers,
    blockedPeerIds: socialSnapshot.blockedPeerIds,
    moving,
    enabled: officeApproachEnabled,
    onMove: (point) => { void cancelSlotsRef.current(); setFollowingPeer(null); engineBridge.requestMove(point); },
    onStop: () => engineBridge.clearMovement(),
    onArrive: (sessionId) => {
      setSelectedPeerId(sessionId);
      setPanel("people");
      notify(bt("동료 가까이에 도착했어요. 대화 요청을 보내면 상대가 참여 여부를 선택해요.", "You are near your teammate. Send a conversation request so they can choose whether to join."), "success");
    },
  });
  useEffect(() => { cancelOfficeApproachRef.current = officeApproach.cancel; }, [officeApproach.cancel]);

  useEffect(() => {
    if (blockingSurfaceOpen && officeApproach.approachingPeerId) officeApproach.cancel();
  }, [blockingSurfaceOpen, officeApproach]);

  const approachOfficePeer = useCallback((sessionId: string) => {
    if (officeApproach.start(sessionId)) {
      setSelectedPeerId(sessionId);
      setPanel(null);
      setSearchOpen(false);
    }
  }, [officeApproach, setPanel, setSearchOpen, setSelectedPeerId]);

  const finishSharedActivity = useCallback(() => {
    const current = sharedActivityRef.current;
    if (!current) return;
    sharedActivityRef.current = null;
    setSharedActivity(null);
    setFollowingPeer(null);
    cancelSocial(current.id);
    closeStudioP2pHuddle({ conversationId: current.id });
  }, [cancelSocial, setFollowingPeer]);

  const gestureGreeting = socialSnapshot.greetings.find((g) => g.status === "delivered" || g.status === "received");
  useEffect(() => {
    setWaveActorIds([]);
    if (!socialSnapshot.available || !gestureGreeting || shownGreetings.current.has(gestureGreeting.id)
      || Date.now() - gestureGreeting.createdAt > 4_000) return undefined;
    shownGreetings.current.add(gestureGreeting.id);
    if (shownGreetings.current.size > 64) {
      const oldest = shownGreetings.current.values().next().value;
      if (oldest !== undefined) shownGreetings.current.delete(oldest);
    }
    setWaveActorIds([gestureGreeting.direction === "outgoing" ? fallbackIdentity : gestureGreeting.peer.sessionId]);
    const timer = globalThis.setTimeout(() => setWaveActorIds([]), 1_600);
    return () => globalThis.clearTimeout(timer);
  }, [fallbackIdentity, gestureGreeting, socialSnapshot.available]);

  useSpaceAttentionLoss(() => {
    if (isStudioSocialWalkTogether(sharedActivityRef.current?.action)) finishSharedActivity();
    setReviewPeerId(null);
  });

  const conversation = useStudioVirtualSpaceConversation({
    participant: live.room?.participant,
    port: live.room?.direct,
    manifest: worldManifest,
    publishedScope: activeWorldScope,
    presence: snapshot,
    acousticBindingAvailable: worldReady && !authoringMode && snapshot.direct,
    enabled: permissions.canVoice && sharedWorldAllowed && worldReady && !authoringMode && snapshot.direct && !socialFocused,
    blockedPeerIds: socialSnapshot.blockedPeerIds,
    onReady: (scope) => {
      finishSharedActivity();
      setFollowingPeer(null);
      setPanel("chat");
      openStudioP2pHuddle({
        conversationId: scope.id,
        peerIds: scope.memberIds.filter((id) => id !== live.room?.participant.sessionId),
        source: "virtual-space",
      });
    },
  });

  const privateZones = worldManifest.acousticZones?.filter((item) => Boolean(item.doorId)) ?? [];
  const privateZoneId = privateZones.find((item) => item.id === privateZoneSelection)?.id ?? privateZones[0]?.id ?? null;
  const privateRoom = useStudioPrivateRoom({
    workId: projectId,
    actorId: privateActorId,
    world: publishedWorld
      ? { worldId: publishedWorld.publication.manifest.id, revisionId: publishedWorld.publication.revisionId, contentHash: publishedWorld.publication.contentHash }
      : null,
    zones: worldManifest.acousticZones ?? [],
    zoneId: privateZoneId,
    room: live.room,
    presence: snapshot,
    enabled: permissions.canVoice && worldReady && !authoringMode && !socialFocused,
    onConversation: () => {
      finishSharedActivity();
      if (conversation.snapshot.active) conversation.leave(conversation.snapshot.active.id);
    },
  });

  const pairConversation = useMemo(
    () => (sharedActivity?.action === "talk" && live.room?.participant
      ? { id: sharedActivity.id, memberIds: [live.room.participant.sessionId, sharedActivity.peer.sessionId].sort() }
      : null),
    [live.room, sharedActivity],
  );
  const activeConversation = conversation.snapshot.active;
  const leaveConversation = conversation.leave;

  const stopSpotlight = useCallback(() => setSpotlightEventId(null), []);
  const startSpotlight = useCallback((event: StudioTownEvent) => {
    const scope = activeConversation ?? pairConversation;
    const selfSessionId = live.room?.participant.sessionId;
    if (!event.spotlight) return;
    if (!scope || !selfSessionId) {
      notify(bt("발표 전에 근처 팀원과 소그룹 대화나 회의를 먼저 합의해 주세요.", "Agree on a nearby group chat or meeting before starting Spotlight."), "warn");
      setPanel("people");
      return;
    }
    const peerIds = scope.memberIds.filter((id) => id !== selfSessionId);
    if (!peerIds.length) return;
    setSpotlightEventId(event.id);
    engineBridge.requestEnvironmentEffect("spotlight", studioWorldSpawn(worldManifest, event.roomId).point);
    openStudioP2pHuddle({ conversationId: scope.id, peerIds, source: "virtual-space" });
    notify(bt("현재 동의한 대화 그룹에 Spotlight를 준비했어요.", "Spotlight is prepared for the consenting conversation."), "success");
  }, [activeConversation, bt, engineBridge, live.room?.participant.sessionId, notify, pairConversation, setPanel, worldManifest]);

  const handleAcceptedActivity = useCallback((request: StudioSpaceSocialRequest) => {
    if (activeConversation) leaveConversation(activeConversation.id);
    if (sharedActivityRef.current?.id !== request.id) finishSharedActivity();
    sharedActivityRef.current = request;
    setSharedActivity(request);
    setSelectedPeerId(request.peer.sessionId);
    if (request.action === "talk") {
      setPanel("chat");
      openStudioP2pHuddle({ conversationId: request.id, peerIds: [request.peer.sessionId], source: "virtual-space" });
    } else if (studioSocialRequestFollowsPeer(request)) {
      startFollowingPeer(request.peer.sessionId);
    } else if (request.action === "high-five") {
      sendReaction("party");
    }
  }, [activeConversation, finishSharedActivity, leaveConversation, sendReaction, setPanel, setSelectedPeerId, startFollowingPeer]);
  useEffect(() => { acceptedActivityHandler.current = handleAcceptedActivity; }, [handleAcceptedActivity]);

  useEffect(() => {
    const handleClosed = (event: Event) => {
      const id = (event as CustomEvent<StudioP2pHuddleClosedDetail>).detail?.conversationId;
      if (id && sharedActivityRef.current?.id === id) finishSharedActivity();
    };
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, handleClosed);
    return () => globalThis.removeEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, handleClosed);
  }, [finishSharedActivity]);

  useEffect(() => {
    if (!sharedActivity) return;
    const peer = snapshot.peers.find((item) => item.participant.sessionId === sharedActivity.peer.sessionId);
    const request = socialSnapshot.requests.find((item) => item.id === sharedActivity.id);
    const distance = peer ? distanceBetween(peer.state, snapshot.self) : Infinity;
    if (!peer || socialFocused || peer.state.activity === "focused" || peer.state.activity === "away"
      || !socialSnapshot.available || !request || request.status !== "accepted"
      || ((sharedActivity.action === "talk" || sharedActivity.action === "high-five") && distance > SHARED_ACTIVITY_DISTANCE)
      || (studioSocialRequestFollowsPeer(sharedActivity) && !followingPeerId)) finishSharedActivity();
  }, [finishSharedActivity, followingPeerId, sharedActivity, snapshot.peers, snapshot.self, socialFocused, socialSnapshot]);

  useEffect(() => () => {
    const current = sharedActivityRef.current;
    sharedActivityRef.current = null;
    if (current) closeStudioP2pHuddle({ conversationId: current.id });
  }, []);

  useEffect(() => {
    if (sharedActivity?.action !== "high-five") return undefined;
    const timer = globalThis.setTimeout(finishSharedActivity, STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS);
    return () => globalThis.clearTimeout(timer);
  }, [finishSharedActivity, sharedActivity?.action, sharedActivity?.id]);

  const requestActivity = useCallback((sessionId: string, action: StudioSpaceSocialAction) => {
    const peer = snapshot.peers.find((item) => item.participant.sessionId === sessionId);
    if (!peer) return;
    if (action === "review") { setReviewPeerId(sessionId); return; }
    if ((action === "talk" || action === "high-five") && distanceBetween(peer.state, snapshot.self) > TALK_DISTANCE) {
      notify(bt("조금 더 가까이 이동한 뒤 요청해 주세요.", "Move a little closer before sending this invitation."), "warn");
      return;
    }
    const id = requestSocial(sessionId, action);
    if (!id) notify(bt("아직 연결을 확인하는 중이에요. 잠시 후 다시 요청해 주세요.", "Still confirming the connection. Please try again shortly."), "warn");
  }, [bt, notify, requestSocial, snapshot.peers, snapshot.self]);

  const cancelSocialRequest = useCallback((id: string) => {
    if (sharedActivity?.id === id) finishSharedActivity();
    else cancelSocial(id);
  }, [cancelSocial, finishSharedActivity, sharedActivity?.id]);

  const respondToRequest = useCallback((id: string, response: "accept" | "decline") => {
    const request = socialSnapshot.requests.find((item) => item.id === id);
    if (request?.action === "review") void respondReview(id, response);
    else respondSocial(id, response);
  }, [respondReview, respondSocial, socialSnapshot.requests]);

  const waveTo = useCallback((sessionId: string) => {
    if (!wave(sessionId)) notify(bt("인사를 보내지 못했어요. 상대 연결을 확인해 주세요.", "The greeting was not sent. Check the connection."), "warn");
  }, [bt, notify, wave]);

  const openSharedReview = useCallback(async () => {
    const current = sharedActivityRef.current;
    if (!current?.reviewSubject || openingReview || current.reviewSubject.workId !== projectId) return;
    setOpeningReview(true);
    try {
      const verified = await verifyStudioVirtualSpaceReviewSubject(current.reviewSubject, "view");
      if (sharedActivityRef.current?.id !== current.id) return;
      if (!verified.ok) {
        notify(bt("검수본이나 열람 권한이 변경되어 열 수 없어요.", "The review or your access changed."), "warn");
        return;
      }
      writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current);
      navigate(verified.href);
    } finally { setOpeningReview(false); }
  }, [bt, navigate, notify, openingReview, positionScope, projectId, selfRef]);

  const proximityScope = useSpaceProximityScope({
    selfPoint: snapshot.self,
    activity,
    userStatus: snapshot.self.userStatus ?? null,
    ghostMode,
    peers: snapshot.peers,
    acousticZones: worldManifest.acousticZones,
    blockedIds: socialSnapshot.blockedPeerIds,
    fallbackPeerLabel: bt("팀원", "Teammate"),
    onExpireStatus: setPresenceStatus,
  });

  const mediaAvailable = !personal && Boolean(live.canChat || isGuest);
  const proximityAvailable = mediaAvailable && permissions.canVoice && worldReady && !authoringMode
    && snapshot.direct && connectivityServerAvailable && Boolean(live.room?.direct);

  const proximity = useSpaceProximityMedia({
    participant: live.room?.participant,
    port: live.room?.direct,
    available: proximityAvailable,
    scopeIds: proximityScope.scopeIds,
    allowGuestVoice: isGuest && permissions.canVoice,
  });

  const toggleMicByUser = useCallback(() => {
    if (proximity.snapshot) setUserMicMuted(!proximity.snapshot.muted);
    proximity.toggleMic();
  }, [proximity]);

  const officeZones = useMemo(() => worldManifest.zones ?? [], [worldManifest]);
  const boothSilentZone = useMemo(() => recordingBoothSilentZone(boothConfig), [boothConfig]);
  const silentZone = useStudioVirtualSpaceZoneMic({
    officeZones,
    tileZones: [boothSilentZone, ...tileSilentZones],
    position: { x: snapshot.self.x, y: snapshot.self.y },
    userMicMuted,
    micMuted: proximity.snapshot ? proximity.snapshot.muted : null,
    onToggleMic: proximity.toggleMic,
  });

  const megaphone = useStudioVirtualSpaceMegaphone({
    role: live.room?.participant.role ?? "viewer",
    broadcasterName: localName,
    media: {
      startScreenShare: proximity.startScreenShare,
      stopScreenShare: () => { if (proximity.snapshot?.sharing) proximity.toggleScreen(); },
    },
  });
  useEffect(() => {
    if (megaphone.snapshot.status !== "broadcasting") setMegaphoneBannerDismissed(false);
  }, [megaphone.snapshot.status]);

  // Real WebAudio AnalyserNode -> VRM 1.0 viseme monitor for local & remote proximity audio streams.
  useEffect(() => {
    const hudSnap = proximity.snapshot;
    if (!hudSnap) {
      setVisemeByActorId({});
      return undefined;
    }
    const monitor = new StudioAudioLipsyncMonitor();
    monitor.attachStream("self", hudSnap.muted ? null : hudSnap.localStream);
    for (const peer of hudSnap.peers) {
      monitor.attachStream(`peer:${peer.participant.sessionId}`, peer.muted ? null : peer.stream);
    }
    const timer = globalThis.setInterval(() => {
      setVisemeByActorId(monitor.sampleAll(performance.now()));
    }, 60);
    return () => {
      globalThis.clearInterval(timer);
      monitor.dispose();
    };
  }, [proximity.snapshot]);

  const remoteSharingPeer = proximity.snapshot?.peers.find((peer) => peer.sharing && peer.stream) ?? null;
  const theaterFeed = useStudioLiveCanvasTheaterFeed({
    projectId,
    localScreenStream: proximity.snapshot?.localStream ?? null,
    localSharing: Boolean(proximity.snapshot?.sharing),
    remoteScreenStream: remoteSharingPeer?.stream ?? null,
    remotePresenterName: remoteSharingPeer?.participant.displayName ?? null,
  });

  const peerPointsById = useMemo<ReadonlyMap<string, StudioVirtualSpacePoint>>(
    () => new Map(snapshot.peers.map((peer) => [peer.participant.sessionId, peer.state] as const)),
    [snapshot.peers],
  );

  return {
    slots,
    cancelSlotsRef,
    seatedActors,
    socialSnapshot,
    socialInteractive,
    socialFocused,
    requestReview,
    setPeerBlocked,
    officeApproach,
    officeApproachEnabled,
    approachOfficePeer,
    sharedActivity,
    sharedActivityRef,
    finishSharedActivity,
    waveActorIds,
    conversation,
    pairConversation,
    activeConversation,
    privateZones,
    privateZoneId,
    setPrivateZoneSelection,
    privateRoom,
    spotlightEventId,
    startSpotlight,
    stopSpotlight,
    reviewPeerId,
    setReviewPeerId,
    openingReview,
    openSharedReview,
    requestActivity,
    cancelSocialRequest,
    respondToRequest,
    waveTo,
    proximityScope,
    mediaAvailable,
    proximityAvailable,
    proximity,
    userMicMuted,
    setUserMicMuted,
    toggleMicByUser,
    silentZone,
    megaphone,
    megaphoneBannerDismissed,
    setMegaphoneBannerDismissed,
    visemeByActorId,
    theaterFeed,
    peerPointsById,
  };
}
