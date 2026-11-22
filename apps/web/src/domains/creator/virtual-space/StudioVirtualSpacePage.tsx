import { LifeBuoy, PenTool, Presentation, StickyNote } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useStudioLiveCollaboration } from "../live/studio-live-collaboration-context";
import { openStudioP2pHuddle } from "../live/huddle/studio-p2p-huddle-events";
import {
  getStudioConnectivityServerSnapshot,
  getStudioConnectivitySnapshot,
  startStudioConnectivityRuntime,
  subscribeStudioConnectivity,
} from "../offline/studio-connectivity";
import { StudioVirtualSpaceAmbientAudio } from "./StudioVirtualSpaceAmbientAudio";
import { StudioVirtualSpaceMiniTour } from "./StudioVirtualSpaceGuide";
import { StudioVirtualSpaceJoystick } from "./StudioVirtualSpaceJoystick";
import { StudioVirtualSpaceMegaphoneBanner } from "./StudioVirtualSpaceMegaphoneBanner";
import type { StudioNpcDialogueAction } from "./StudioVirtualSpaceNpcDialoguePanel";
import { StudioVirtualSpaceOfficeStart } from "./StudioVirtualSpaceOfficeStart";
import { StudioVirtualSpacePage as StudioVirtualSpacePageRoot } from "./StudioVirtualSpacePageRoot";
import { StudioVirtualSpacePanelGate } from "./StudioVirtualSpacePanelGate";
import { StudioVirtualSpaceSharedCursors, type StudioSharedCursorView } from "./StudioVirtualSpaceSharedCursors";
import { StudioVirtualSpaceSilentZoneBadge } from "./StudioVirtualSpaceSilentZoneBadge";
import { StudioVirtualSpaceStageSurface } from "./StudioVirtualSpaceStageSurface";
import { StudioWorldLoadNotice } from "./StudioWorldLoadNotice";
import { useStudioWorldRuleGate } from "./StudioWorldRuleGate";
import { applyStudioVirtualStageSearch, readStudioVirtualStageMode, resolveStudioVirtualStageKind, writeStudioVirtualPreferredEngineMode } from "./office2d/studio-virtual-space-stage-mode";
import type { StudioThreeLightingState, StudioThreePhotoCapture } from "./three/studio-virtual-space-three-stage-props";
import { VirtualThreeThemeProvider } from "./three/ui/VirtualThreeThemeProvider";
import type { SpaceAtmosphere } from "./hud/SpaceAtmosphereSettings";
import { SpaceChatInput } from "./hud/SpaceChatInput";
import { SpaceContextSuggestion } from "./hud/SpaceContextSuggestion";
import { SpaceCursorChatOverlay } from "./hud/SpaceCursorChatOverlay";
import { SpaceDeadlineCountdownWidget } from "./hud/SpaceDeadlineCountdownWidget";
import { SpaceDock } from "./hud/SpaceDock";
import { SpaceEventBanner } from "./hud/SpaceEventBanner";
import { SpaceFocusChip } from "./hud/SpaceFocusChip";
import { SpaceHudLayout } from "./hud/SpaceHudLayout";
import { SpaceInlineProfilePopover } from "./hud/SpaceInlineProfilePopover";
import { SpaceInteractPrompt, type SpaceInteractTarget } from "./hud/SpaceInteractPrompt";
import { SpaceLocationChip } from "./hud/SpaceLocationChip";
import { SpaceMinimap } from "./hud/SpaceMinimap";
import { SpaceMobileDock } from "./hud/SpaceMobileDock";
import { SpaceMovementStatus } from "./hud/SpaceMovementStatus";
import { SpaceProximityStrip } from "./hud/SpaceProximityStrip";
import { SpaceProximityVideo } from "./hud/SpaceProximityVideo";
import { SpaceRequestToast } from "./hud/SpaceRequestToast";
import { SpaceSidePanel } from "./hud/SpaceSidePanel";
import { SpaceToasts } from "./hud/SpaceToasts";
import { SpaceTownBanner } from "./hud/SpaceTownBanner";
import { SpaceWorkLauncher } from "./hud/SpaceWorkLauncher";
import { SpaceCelebrationRibbon, SpaceWorkStatusBar } from "./hud/SpaceWorkStatusBar";
import { SpaceZoneSplash, type SpaceZoneSplashInput } from "./hud/SpaceZoneSplash";
import { SpaceZoneWorkbar } from "./hud/SpaceZoneWorkbar";
import { SpaceZoomControls } from "./hud/SpaceZoomControls";
import { VirtualSpaceSidePanelContent } from "./hud/VirtualSpaceSidePanelContent";
import { VirtualSpaceStagePopovers, type SoloBoardTab } from "./hud/VirtualSpaceStagePopovers";
import { emitSpaceStatusExtrasChange, spaceStatusOptionById, useSpaceStatusExtras, writeSpaceStatusUrgency, type SpaceStatusOption } from "./hud/space-dock-model";
import { spaceHudChatHintBlocked, spaceHudShowsEventBanner } from "./hud/space-hud-priority";
import { StudioP2pHuddleLauncher, StudioVirtualSpaceCustomizationPanel } from "./hud/space-lazy-panels";
import { spaceMoreItems } from "./hud/space-more-items";
import { SPACE_PROXIMITY_MEDIA_RADIUS } from "./hud/space-proximity-media";
import { spaceZoneWorkItems, spaceZoneWorkKind } from "./hud/space-zone-workflow";
import { useSpaceAttentionLoss } from "./hud/use-space-attention-loss";
import { useSpaceAutoMeeting } from "./hud/use-space-auto-meeting";
import { useSpaceBuildPlacement } from "./hud/use-space-build-placement";
import { useSpaceConnectionStatus } from "./hud/use-space-connection-status";
import { useSpaceDeskPreference } from "./hud/use-space-desk-preference";
import { useSpaceDockClearance } from "./hud/use-space-dock-clearance";
import { useSpaceDesktop } from "./hud/use-space-media-query";
import { useSpacePreferences } from "./hud/use-space-preferences";
import { useSpacePrivateZoneNotice, useSpaceToasts } from "./hud/use-space-toasts";
import { useSpaceUiEvents } from "./hud/use-space-ui-events";
import { useSpaceUserZoom } from "./hud/use-space-user-zoom";
import { useSpaceWorkProject } from "./hud/use-space-work-project";
import { useVirtualSpaceYjsDoc } from "./crdt/studio-virtual-space-yjs-doc";
import { useVirtualSpaceOverlays } from "./state/use-virtual-space-overlays";
import { useVirtualSpacePermissions } from "./state/use-virtual-space-permissions";
import { useVirtualSpaceSocialAndMedia } from "./state/use-virtual-space-social-and-media";
import { useVirtualSpaceWorldRuntime } from "./state/use-virtual-space-world-runtime";
import { resolveStudioVirtualBuiltinWorld, STUDIO_VIRTUAL_CAMPUS_COMMONS_ID, studioVirtualCampusZoneMeta } from "./studio-virtual-space-campus-world";
import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import { createEntryCode, createEntryCodeRecord } from "./studio-virtual-space-entry-code";
import { readStudioVirtualSpaceAvatarIndex } from "./studio-virtual-space-entry-preference";
import { startStudioFocusSession, stopStudioFocusSession, type StudioFocusSession } from "./studio-virtual-space-focus-session";
import { studioVirtualSpaceDefaultGalleryFrames } from "./studio-virtual-space-gallery-defaults";
import { orchestrateStudioSpatialInteraction } from "./studio-virtual-space-interaction-orchestrator";
import { EMPTY_STUDIO_SPATIAL_INTERACTION_STATE, reduceStudioSpatialInteraction } from "./studio-virtual-space-interaction-state";
import { studioVirtualSpaceInitialPoint, studioVirtualSpaceState, type StudioVirtualSpaceActivity } from "./studio-virtual-space-model";
import { studioNpcRole } from "./studio-virtual-space-npc-director";
import { EMPTY_STUDIO_VIRTUAL_RUNTIME_METRICS, type StudioVirtualRuntimeMetrics } from "./studio-virtual-space-observability";
import { createStudioVirtualSpaceInitialSnapshot, distanceBetween, SIDE_PANEL_ID, studioNearbyCards, studioPromptNpc, TALK_DISTANCE } from "./studio-virtual-space-page-helpers";
import type { VirtualSpaceExperienceProps } from "./studio-virtual-space-page-props";
import { captureStudioVirtualPhoto } from "./studio-virtual-space-photo-mode";
import { readStudioVirtualPlaceId, studioVirtualPlaceWorldScope } from "./studio-virtual-space-place-world";
import type { StudioSpacePose } from "./studio-virtual-space-pose-controller";
import type { StudioVirtualSpacePresenceController, StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import { studioDefaultRecordingBoothConfig } from "./studio-virtual-space-recording-booth-defaults";
import { studioDistrictEnvironment } from "./studio-virtual-space-scene-direction";
import { useStudioVirtualSceneSnapshotBinding } from "./studio-virtual-space-scene-snapshot";
import { resolveStudioVirtualSpaceSessionPoint, studioVirtualSpacePositionScope, studioVirtualSpacePositionStorageKey, writeStudioVirtualSpaceSessionPoint } from "./studio-virtual-space-session-position";
import { studioSocialRequestFollowsPeer } from "./studio-virtual-space-social-walk";
import type { StudioVirtualSpace as StudioBookableSpace } from "./studio-virtual-space-space-booking";
import { studioSpatialActions, type StudioSpatialActionId } from "./studio-virtual-space-spatial-actions";
import { studioTownDeskPodForActor } from "./studio-virtual-space-town-program";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import type { StudioWorkDecision } from "./studio-virtual-space-work-bridge";
import {
  createStudioCelebrationEvent,
  playStudioCelebrationChime,
  useStudioWebtoonWorkStatus,
  type StudioCelebrationEvent,
  type StudioCelebrationKind,
  type StudioWebtoonWorkStatusId,
} from "./studio-virtual-space-work-status";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldPresenceState, studioWorldSpawn, type StudioWorldInteractionDefinition, type StudioWorldNpcDefinition } from "./studio-virtual-space-world-manifest";
import { useSpaceRolePreset } from "./use-space-role-preset";
import { useStudioPeerFollow } from "./use-studio-peer-follow";
import { useStudioSpaceChat } from "./use-studio-space-chat";
import { useStudioSpaceLighting } from "./use-studio-space-lighting";
import { useStudioSpaceReaction } from "./use-studio-space-reaction";
import { useStudioTileEffectWiring } from "./use-studio-tile-effect-wiring";
import { useStudioVirtualAvatarPersistence } from "./use-studio-virtual-avatar-persistence";
import { useStudioVirtualPeerConnectionTracker } from "./use-studio-virtual-peer-connection-tracker";
import { useStudioVirtualSpaceAppPresence } from "./use-studio-virtual-space-app-presence";
import { useStudioVirtualSpaceBoothAsset } from "./use-studio-virtual-space-booth-asset";
import { useStudioVirtualSpaceFocusSuggestions } from "./use-studio-virtual-space-focus-suggestions";
import { useStudioVirtualSpaceOperations } from "./use-studio-virtual-space-operations";
import { useStudioVirtualSpacePeerFixtures } from "./use-studio-virtual-space-peer-fixtures";
import { useStudioVirtualSpaceSocialSync } from "./use-studio-virtual-space-social-sync";
import { useStudioWorldDraftLifetime } from "./use-studio-world-draft-lifetime";
import "./studio-virtual-space.css";
import "./studio-workspace-live.css";
import "./hud/space-hud.css";

const CURSOR_COLORS = [
  "oklch(0.62 0.19 266)",
  "oklch(0.65 0.21 352)",
  "oklch(0.7 0.14 205)",
  "oklch(0.76 0.16 74)",
  "oklch(0.7 0.15 162)",
  "oklch(0.64 0.2 292)",
] as const;

export function VirtualSpaceExperience({
  projectId, preparing, signedIn, publication, homeHeader, personal = false,
  initialAvatarIndexOverride, initialArtStyleOverride, nickname, onNicknameChange,
  isGuest = false, guestSpawn = null, entryJustConfirmed = false,
}: VirtualSpaceExperienceProps) {
  const bt = useBilingual("StudioVirtualSpaceExperience");
  const location = useLocation();
  const navigate = useNavigate();
  const desktop = useSpaceDesktop();
  const touch = !desktop;
  const { toasts, notify, dismiss: dismissToast } = useSpaceToasts();
  const spaceUi = useSpaceUiEvents(bt, notify);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const authoringMode = searchParams.get("worldEdit") === "1" && !isGuest;
  const publishedWorld = publication.snapshot.active;
  const selectedPlaceId = useMemo(() => readStudioVirtualPlaceId(location.search, personal), [location.search, personal]);
  const builtinPlaceWorld = !publishedWorld && !authoringMode;
  const builtin = useMemo(() => (builtinPlaceWorld ? resolveStudioVirtualBuiltinWorld(selectedPlaceId, personal, { arrivalFrom: searchParams.get("from") }) : null), [builtinPlaceWorld, personal, searchParams, selectedPlaceId]);
  const activeWorldScope = publishedWorld?.scope ?? builtin?.worldScope ?? studioVirtualPlaceWorldScope(selectedPlaceId);
  const sharedWorldAllowed = !publication.enabled || (publication.snapshot.viewVerified && (Boolean(publishedWorld) || !publication.snapshot.hasPublishedWorld));
  const positionScope = useMemo(() => studioVirtualSpacePositionScope(projectId, authoringMode, builtin?.positionPlaceId), [authoringMode, builtin?.positionPlaceId, projectId]);
  const positionScopeKey = studioVirtualSpacePositionStorageKey(positionScope);
  const live = useStudioLiveCollaboration();
  const currentSession = useSession();
  const privateActorId = currentSession.data?.user?.id ?? null;
  const connectivity = useSyncExternalStore(subscribeStudioConnectivity, getStudioConnectivitySnapshot, getStudioConnectivityServerSnapshot);
  const connection = useSpaceConnectionStatus(preparing);
  const workProject = useSpaceWorkProject(projectId, personal);
  const spaceRole = useSpaceRolePreset(personal);
  const controllerRef = useRef<StudioVirtualSpacePresenceController | null>(null);
  const fallbackIdentity = live.room?.participant.sessionId ?? `space:${projectId}`;
  const decorationScope = JSON.stringify([projectId, activeWorldScope, authoringMode]);
  const officeNavigationScope = JSON.stringify([privateActorId, projectId, authoringMode, publishedWorld?.scope]);
  const [engineMode, setEngineMode] = useState<"2d" | "3d">(() => (readStudioVirtualStageMode(location.search || (typeof window === "undefined" ? "" : window.location.search)) === "3d" ? "3d" : "2d"));
  const stageKind = resolveStudioVirtualStageKind({ engineMode, authoringMode, search: location.search || (typeof window === "undefined" ? "" : window.location.search) });
  const preferences = useSpacePreferences({ initialArtStyle: initialArtStyleOverride, decorationScope, decorationOwner: privateActorId, notify });
  const { artStyle, characterCustomization, initialExperiencePreference, experiencePreference, selectExperiencePreference, spaceTheme, selectSpaceTheme, decorations, selectDecorations, placedFixtureRequests, selectPlacedFixtureRequests } = preferences;

  const initialPoint = useMemo(() => {
    const preferred = studioVirtualSpaceInitialPoint(fallbackIdentity);
    if (initialExperiencePreference.startLocation === "lobby") return studioWorldSpawn(DEFAULT_STUDIO_WORLD_MANIFEST, "lobby").point;
    if (initialExperiencePreference.startLocation === "desk") return studioTownDeskPodForActor(fallbackIdentity, live.room?.participant.role).point;
    return resolveStudioVirtualSpaceSessionPoint(positionScope, DEFAULT_STUDIO_WORLD_MANIFEST, preferred) ?? preferred;
  }, [fallbackIdentity, initialExperiencePreference.startLocation, live.room?.participant.role, positionScope]);
  const initialAvatarIndex = useMemo(() => initialAvatarIndexOverride ?? readStudioVirtualSpaceAvatarIndex(), [initialAvatarIndexOverride]);
  const [snapshot, setSnapshot] = useState<StudioVirtualSpaceSnapshot>(() => createStudioVirtualSpaceInitialSnapshot(studioVirtualSpaceState(initialPoint, "down", "available", false, initialAvatarIndex)));
  const selfRef = useRef(snapshot.self);
  const peersRef = useRef(snapshot.peers);
  useEffect(() => { selfRef.current = snapshot.self; peersRef.current = snapshot.peers; }, [snapshot.peers, snapshot.self]);

  const mergedPlacedFixtures = useStudioVirtualSpacePeerFixtures({ controllerRef, snapshot, selfSessionId: fallbackIdentity, localRequests: placedFixtureRequests });
  const { chatOpen, setChatOpen, chatSnapshot, chatTypingNames, sendSpaceChat, sendSpaceChatTyping, sendChatMessage, setChatTyping } = useStudioSpaceChat({ snapshot, setSnapshot, controllerRef, nickname });
  const statusExtras = useSpaceStatusExtras();
  const onChatInputChange = useCallback((typing: boolean) => {
    setChatTyping(typing);
    controllerRef.current?.setTyping(typing);
    setSnapshot((cur) => (cur.self.typing === (typing || undefined) ? cur : { ...cur, self: (selfRef.current = Object.freeze({ ...cur.self, typing: typing || undefined })) }));
  }, [setChatTyping]);

  const [activity, setActivity] = useState<StudioVirtualSpaceActivity>("available");
  const [avatarIndex, setAvatarIndex] = useState(initialAvatarIndex);
  const { save: persistAvatarChoice, status: avatarSaveStatus, retry: retryAvatarChoice } = useStudioVirtualAvatarPersistence();
  const [runtimeMetrics, setRuntimeMetrics] = useState<StudioVirtualRuntimeMetrics>(EMPTY_STUDIO_VIRTUAL_RUNTIME_METRICS);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const localPoseRef = useRef<StudioSpacePose>("stand");
  const [localPose, setLocalPose] = useState<StudioSpacePose>("stand");
  const [ghostMode, setGhostMode] = useState(false);
  const [soloBoardOpen, setSoloBoardOpen] = useState<SoloBoardTab | null>(null);
  const { statusId: workStatusId, setStatusId: setWorkStatusId } = useStudioWebtoonWorkStatus();
  const [celebrationEvent, setCelebrationEvent] = useState<StudioCelebrationEvent | null>(null);
  const checkpointCountRef = useRef(0);
  const [currentInteraction, setCurrentInteraction] = useState<StudioWorldInteractionDefinition | null>(null);
  const [pendingInteraction, setPendingInteraction] = useState<StudioWorldInteractionDefinition | null>(null);
  const [interactionState, dispatchInteraction] = useReducer(reduceStudioSpatialInteraction, EMPTY_STUDIO_SPATIAL_INTERACTION_STATE);
  const [dialogueNpc, setDialogueNpc] = useState<StudioWorldNpcDefinition | null>(null);
  const [atmosphere, setAtmosphere] = useState<SpaceAtmosphere>(() => {
    try { const s = localStorage.getItem("toonspectrum:virtual-atmosphere:v1"); return s === "focus" || s === "lively" ? s : "balanced"; } catch { return "balanced"; }
  });
  const desktopDockRef = useRef<HTMLDivElement>(null);
  const mobileDockRef = useRef<HTMLElement>(null);
  useSpaceDockClearance(desktop ? desktopDockRef : mobileDockRef);

  const engineBridge = useMemo(() => new StudioVirtualSpaceEngineBridge(), []);
  const userZoom = useSpaceUserZoom(engineBridge.userZoom);
  const buildPlacement = useSpaceBuildPlacement({ bridge: engineBridge, requests: placedFixtureRequests, onRequestsChange: selectPlacedFixtureRequests });
  const lighting = useStudioSpaceLighting(engineBridge);
  const operations = useStudioVirtualSpaceOperations(projectId, signedIn && !personal);
  const { tileEffects, cloneBinding, reloadTileEffects, changeTileEffects, tileSilentZones, tileMedia, setTileMedia, handleTileEffectTrigger } = useStudioTileEffectWiring({ decorationScope, engineBridge, owner: privateActorId, notify });
  const worldDraftLifetime = useStudioWorldDraftLifetime(privateActorId, projectId);
  const appPresence = useStudioVirtualSpaceAppPresence(tileEffects, { x: snapshot.self.x, y: snapshot.self.y });
  const { bookings: boothBookings, setBookings: setBoothBookings, waitlist: boothWaitlist, setWaitlist: setBoothWaitlist, galleryStats, setGalleryStats } = useStudioVirtualSpaceSocialSync({ projectId, worldScope: activeWorldScope, userId: privateActorId, enabled: !isGuest });
  const boothConfig = useMemo(() => studioDefaultRecordingBoothConfig(), []);
  const galleryFrames = useMemo(() => studioVirtualSpaceDefaultGalleryFrames(), []);

  const localName = live.room?.participant.displayName.replace(/\s*·\s*이 탭$/u, "") || nickname || bt("나", "Me");
  const selfListId = live.room?.participant.sessionId ?? fallbackIdentity;
  const spaceName = personal ? bt("나의 스튜디오", "My studio") : workProject.title ?? bt("현재 작품", "Current work");

  const { permissions, control: roomControl, dispatchHostAction } = useVirtualSpacePermissions({
    personal, signedIn, isGuest, teamRole: live.room?.participant.role, selfSessionId: selfListId, directPort: live.room?.direct,
    onHostForcedMute: () => notify(bt("방장이 마이크를 음소거했어요.", "The host muted your microphone."), "warn"),
    onKicked: () => { notify(bt("방장이 공간 입장을 종료했어요.", "Removed by host."), "warn"); navigate("/home"); },
  });
  const yjsSpace = useVirtualSpaceYjsDoc({ scopeId: `${projectId}:${activeWorldScope}`, selfSessionId: selfListId, selfDisplayName: localName, personal, signedIn, directPort: live.room?.direct, canEdit: permissions.canUseBoard });

  const closeDialogue = useCallback(() => { setDialogueNpc(null); engineBridge.focusWorld(); }, [engineBridge, setDialogueNpc]);
  const closePendingInteraction = useCallback(() => { setPendingInteraction(null); dispatchInteraction({ type: "close" }); engineBridge.focusWorld(); }, [dispatchInteraction, engineBridge, setPendingInteraction]);
  const writeSelfRef = useCallback((next: StudioVirtualSpaceSnapshot["self"]) => { selfRef.current = next; }, []);
  const writeControllerRef = useCallback((next: StudioVirtualSpacePresenceController | null, expectedCurrent?: StudioVirtualSpacePresenceController) => {
    if (expectedCurrent && controllerRef.current !== expectedCurrent) return;
    controllerRef.current = next;
  }, []);
  const writeLocalPoseRef = useCallback((next: StudioSpacePose) => {
    localPoseRef.current = next;
    setLocalPose((cur) => (cur === next ? cur : next));
  }, []);
  const cancelSlotsProxyRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const cancelApproachProxyRef = useRef<() => void>(() => undefined);
  const cancelFollowingProxyRef = useRef<() => void>(() => undefined);
  const setPanelProxyRef = useRef<(p: ReturnType<typeof useVirtualSpaceOverlays>["panel"]) => void>(() => undefined);
  const setMapOpenProxyRef = useRef<(open: boolean) => void>(() => undefined);
  const setSearchOpenProxyRef = useRef<(open: boolean) => void>(() => undefined);
  const markCoachProxyRef = useRef<(key: "moved" | "interacted" | "emoted") => void>(() => undefined);
  const blockingOpenRef = useRef(false);
  const [moveDestinationState, setMoveDestinationState] = useState<{ readonly x: number; readonly y: number } | null>(null);

  const { followingPeerId, setFollowingPeerId, followConfig, setFollowingPeer, updateFollowConfig, startFollowingPeer } = useStudioPeerFollow({ engineBridge, peersRef, cancelSlotsRef: cancelSlotsProxyRef });
  const { clearLocalReactionTimer, sendReaction, emote } = useStudioSpaceReaction({ engineBridge, controllerRef, setSnapshot, markCoach: (k) => markCoachProxyRef.current(k) });

  const worldRuntime = useVirtualSpaceWorldRuntime({
    projectId, personal, signedIn, authoringMode, currentSessionReady: currentSession.ready,
    builtin, builtinPlaceWorld, selectedPlaceId, explicitPlace: searchParams.has("place"), resumeRequested: searchParams.get("resume") === "1",
    publishedWorld, activeWorldScope, sharedWorldAllowed, positionScope, positionScopeKey, officeNavigationScope,
    fallbackIdentity, startLocation: initialExperiencePreference.startLocation, guestSpawn, live,
    connectivityMode: connectivity.mode, connectivityServerAvailable: connectivity.serverAvailable,
    decorations, characterCustomization, avatarIndex, setAvatarIndex, persistAvatarChoice, activity,
    snapshot, setSnapshot, selfRef, writeSelfRef, controllerRef, writeControllerRef, engineBridge, writeLocalPoseRef, clearLocalReactionTimer,
    setFollowingPeer, setFollowingPeerId,
    cancelSlotsAndApproach: () => { cancelApproachProxyRef.current(); void cancelSlotsProxyRef.current(); },
    markMoved: () => markCoachProxyRef.current("moved"),
    setPanel: (p) => setPanelProxyRef.current(p),
    setMapOpen: (o) => setMapOpenProxyRef.current(o),
    moveDestination: moveDestinationState, setMoveDestination: setMoveDestinationState,
    selectedPeerId, socialFocused: activity === "focused" || activity === "away" || atmosphere === "focus",
    cancelFollowing: () => cancelFollowingProxyRef.current(),
    locationPathname: location.pathname, locationSearch: location.search, navigate, notify, bt,
  });
  useSpaceAttentionLoss(worldRuntime.cancelGuideTour);
  useEffect(() => startStudioConnectivityRuntime(), []);

  const setPresenceActivity = useCallback((next: StudioVirtualSpaceActivity) => {
    if (next === "focused" || next === "away") engineBridge.clearMovement();
    setActivity(next);
    controllerRef.current?.setActivity(next);
    setSnapshot((cur) => ({ ...cur, self: studioWorldPresenceState(worldRuntime.worldManifest, { ...cur.self, activity: next }) }));
  }, [engineBridge, worldRuntime.worldManifest]);
  const setPresenceStatus = useCallback((option: SpaceStatusOption) => {
    if (option.activity !== activity) setPresenceActivity(option.activity);
    controllerRef.current?.setUserStatus?.(option.userStatus);
    setSnapshot((cur) => ({ ...cur, self: Object.freeze({ ...cur.self, userStatus: option.userStatus ?? undefined }) }));
  }, [activity, setPresenceActivity]);

  const socialAndMedia = useVirtualSpaceSocialAndMedia({
    projectId, personal, isGuest, permissions, live, worldManifest: worldRuntime.worldManifest, navigationWorld: worldRuntime.navigationWorld,
    activeWorldScope, publishedWorld, sharedWorldAllowed, worldReady: worldRuntime.worldReady, authoringMode,
    connectivityServerAvailable: connectivity.serverAvailable, snapshot, selfRef, moving: worldRuntime.moving, activity, atmosphere,
    ghostMode, fallbackIdentity, privateActorId, localName, officeNavigationScope, positionScope, boothConfig, tileSilentZones,
    engineBridge, followingPeerId, setFollowingPeer, startFollowingPeer, sendReaction, setPresenceStatus,
    setPanel: (p) => setPanelProxyRef.current(p), setSearchOpen: (o) => setSearchOpenProxyRef.current(o),
    setSelectedPeerId, blockingSurfaceOpen: blockingOpenRef.current, navigate: (to) => navigate(to), notify, bt,
  });
  cancelSlotsProxyRef.current = socialAndMedia.slots.cancel;
  cancelApproachProxyRef.current = socialAndMedia.officeApproach.cancel;

  const cancelFollowing = useCallback(() => {
    socialAndMedia.officeApproach.cancel();
    void socialAndMedia.slots.cancel();
    if (socialAndMedia.sharedActivity && studioSocialRequestFollowsPeer(socialAndMedia.sharedActivity)) socialAndMedia.finishSharedActivity();
    else setFollowingPeer(null);
  }, [setFollowingPeer, socialAndMedia]);
  cancelFollowingProxyRef.current = cancelFollowing;

  const openOfficeSeatsRef = useRef<() => void>(() => undefined);
  const deskScope = useMemo(() => ({ userId: privateActorId, projectId, activeWorldScope, authoringMode }), [activeWorldScope, authoringMode, privateActorId, projectId]);
  const { preferredSlotId, preferDesk } = useSpaceDeskPreference(deskScope, worldRuntime.worldManifest, () => notify(bt("이 기기에 자리를 기억하지 못했어요.", "Could not save desk."), "warn"));
  const handleDeskShortcut = useCallback(() => {
    if (!worldRuntime.worldReady) return;
    if (preferredSlotId && !personal) socialAndMedia.slots.requestSlot(preferredSlotId);
    else openOfficeSeatsRef.current();
  }, [personal, preferredSlotId, socialAndMedia.slots, worldRuntime.worldReady]);

  const overlays = useVirtualSpaceOverlays({
    search: location.search, personal, desktop, worldReady: worldRuntime.worldReady, entryJustConfirmed, engineBridge,
    chatOpen, setChatOpen, pendingInteraction, closePendingInteraction, dialogueNpc, closeDialogue,
    emote, zoomAvailable: userZoom.available, onDeskShortcut: handleDeskShortcut,
    onToggleQuietMode: socialAndMedia.proximityScope.toggleQuietMode,
    soloBoardOpen: soloBoardOpen !== null, onCloseSoloBoard: () => setSoloBoardOpen(null),
    appEffectOpen: appPresence.openEffect !== null, onCloseAppEffect: appPresence.close,
    tileMediaOpen: tileMedia !== null, onCloseTileMedia: () => setTileMedia(null),
  });
  setPanelProxyRef.current = overlays.setPanel;
  setMapOpenProxyRef.current = overlays.setMapOpen;
  setSearchOpenProxyRef.current = overlays.setSearchOpen;
  markCoachProxyRef.current = overlays.markCoach;
  blockingOpenRef.current = overlays.searchOpen || (!desktop && overlays.panel !== null) || pendingInteraction !== null || dialogueNpc !== null;
  openOfficeSeatsRef.current = () => { overlays.setDockPopover(null); if (personal) worldRuntime.walkToPersonalDesk(); else overlays.setPanel("seats"); };

  const roomById = useMemo(() => new Map(worldRuntime.worldManifest.rooms.map((r) => [r.id, r] as const)), [worldRuntime.worldManifest.rooms]);
  const currentRoom = roomById.get(snapshot.self.zoneId) ?? worldRuntime.worldManifest.rooms[0] ?? null;
  const productionProjectId = operations.snapshot.project?.aggregate.projectId ?? null;
  const nearbyPeerCount = snapshot.peers.filter((peer) => distanceBetween(peer.state, snapshot.self) <= TALK_DISTANCE).length;
  const worldRuleGate = useStudioWorldRuleGate(worldRuntime.worldManifest, activity, worldRuntime.activateAction);

  const requestInteraction = useCallback((interaction: StudioWorldInteractionDefinition) => {
    engineBridge.clearMovement(); setDialogueNpc(null); setPendingInteraction(interaction); overlays.markCoach("interacted");
    dispatchInteraction({ type: "choose", interactionId: interaction.id });
  }, [dispatchInteraction, engineBridge, overlays, setDialogueNpc, setPendingInteraction]);
  const handleEngineInteract = useCallback((interaction: StudioWorldInteractionDefinition | null) => {
    if (interaction) { requestInteraction(interaction); return; }
    if (currentInteraction) { requestInteraction(currentInteraction); return; }
    if (currentRoom?.action) requestInteraction({ id: `room-${currentRoom.id}`, zoneId: currentRoom.id, point: { x: snapshot.self.x, y: snapshot.self.y }, radius: 48, labelKo: currentRoom.labelKo, labelEn: currentRoom.labelEn, action: currentRoom.action });
  }, [currentInteraction, currentRoom, requestInteraction, snapshot.self.x, snapshot.self.y]);
  const handleEngineNpcInteract = useCallback((interaction: StudioWorldInteractionDefinition, npc: StudioWorldNpcDefinition) => {
    engineBridge.clearMovement(); setPendingInteraction(null); dispatchInteraction({ type: "close" }); setDialogueNpc(npc); setCurrentInteraction(interaction); overlays.markCoach("interacted");
  }, [dispatchInteraction, engineBridge, overlays, setCurrentInteraction, setDialogueNpc, setPendingInteraction]);

  const spatialContext = useMemo(() => ({ personal, nearbyPeerCount }), [nearbyPeerCount, personal]);
  const executeSpatialAction = useCallback((id: StudioSpatialActionId) => {
    if (!pendingInteraction) return;
    dispatchInteraction({ type: "run" }); setPendingInteraction(null);
    try {
      const decision = orchestrateStudioSpatialInteraction(id, { interaction: pendingInteraction, projectId, productionProjectId });
      if (decision.kind === "world-rule") worldRuleGate.request(decision.interaction);
      else if (decision.kind === "panel") overlays.setPanel(decision.panel);
      else if (decision.kind === "effect") { engineBridge.requestEnvironmentEffect(decision.effect, pendingInteraction.point); notify(bt("상호작용 이펙트를 실행했어요.", "Interaction effect activated."), "success"); }
      else navigate(decision.href);
      dispatchInteraction({ type: "complete" });
    } catch (e) { dispatchInteraction({ type: "fail", error: e instanceof Error ? e.message : "interaction-failed" }); }
  }, [bt, dispatchInteraction, engineBridge, navigate, notify, overlays, pendingInteraction, productionProjectId, projectId, setPendingInteraction, worldRuleGate]);
  const handleSpatialAction = useCallback((id: StudioSpatialActionId) => {
    if (!pendingInteraction) return;
    const selected = studioSpatialActions(pendingInteraction, roomById.get(pendingInteraction.zoneId), spatialContext).find((item) => item.id === id);
    if (!selected) return;
    const guarded = selected.risk === "authority" || selected.risk === "collaborative";
    dispatchInteraction({ type: "select-action", actionId: id, authority: guarded });
    if (guarded) dispatchInteraction({ type: "confirm" }); else executeSpatialAction(id);
  }, [dispatchInteraction, executeSpatialAction, pendingInteraction, roomById, spatialContext]);

  const changeAtmosphere = useCallback((next: SpaceAtmosphere) => {
    setAtmosphere(next);
    try { localStorage.setItem("toonspectrum:virtual-atmosphere:v1", next); } catch { /* ignore */ }
    if (next === "focus") { engineBridge.clearMovement(); socialAndMedia.finishSharedActivity(); }
  }, [engineBridge, socialAndMedia]);

  const sceneSnapshotBinding = useStudioVirtualSceneSnapshotBinding({
    scopeKey: decorationScope, userZoom: engineBridge.userZoom, cameraPan: engineBridge.cameraPan,
    lighting: { dayNightEnabled: lighting.dayNightEnabled, dayNightSpeedMs: lighting.dayNightSpeedMs, lightHourOverride: lighting.lightHourOverride, lightAutoMode: lighting.lightAutoMode, cycleTimeOfDay: lighting.cycleTimeOfDay, fixtures: lighting.lightFixtures },
    fallbackHour: lighting.lightHour, environment: preferences.environmentPreference, spaceTheme, atmosphere, decorations, placedFixtureRequests, world: worldRuntime.worldManifest, selfPoint: snapshot.self,
    onApplyRestore: (plan) => {
      engineBridge.userZoom.set(plan.camera.zoomLevel); engineBridge.cameraPan.applySnapshotView(plan.camera.panOffsetX, plan.camera.panOffsetY, plan.camera.zoomLevel);
      lighting.applyLightingSnapshot(plan.lighting); preferences.selectEnvironmentPreference(plan.environment); selectSpaceTheme(plan.spaceTheme);
      changeAtmosphere(plan.atmosphere); selectDecorations(plan.decorations); selectPlacedFixtureRequests(plan.placedFixtureRequests);
      if (plan.relocatedSelfPoint) engineBridge.requestTeleport(plan.relocatedSelfPoint);
    },
  });

  const zoneRoomId = worldRuntime.zone?.roomId ?? currentRoom?.id ?? null;
  const locationZone = useMemo(() => {
    const meta = zoneRoomId ? studioVirtualCampusZoneMeta(zoneRoomId) : null;
    const commons = zoneRoomId === STUDIO_VIRTUAL_CAMPUS_COMMONS_ID;
    return { roomId: zoneRoomId, labelKo: commons ? "캠퍼스 산책로" : meta?.labelKo ?? worldRuntime.zone?.labelKo ?? currentRoom?.labelKo ?? "", labelEn: commons ? "Campus walkway" : meta?.labelEn ?? worldRuntime.zone?.labelEn ?? currentRoom?.labelEn ?? "", privateZone: worldRuntime.zone?.privateZone ?? false };
  }, [currentRoom?.labelEn, currentRoom?.labelKo, worldRuntime.zone, zoneRoomId]);

  useSpacePrivateZoneNotice(!personal && worldRuntime.worldReady && !authoringMode && locationZone.privateZone, notify, () => bt("프라이빗 구역에 들어왔어요. 같은 구역 사람끼리만 들려요.", "Entered a private zone."));
  useSpaceAutoMeeting({ inPrivateZone: locationZone.privateZone, userStatus: snapshot.self.userStatus ?? null, activity, enabled: !personal && worldRuntime.worldReady && !authoringMode }, (status) => { setPresenceStatus(spaceStatusOptionById(status ?? "available")); });

  const applyWorkStatus = useCallback((userStatus: StudioUserStatus, nextActivity?: "focused" | "available") => {
    if (nextActivity) setPresenceActivity(nextActivity);
    controllerRef.current?.setUserStatus?.(userStatus === "available" ? null : userStatus);
    setSnapshot((c) => ({ ...c, self: Object.freeze({ ...c.self, userStatus: userStatus === "available" ? undefined : userStatus }) }));
  }, [setPresenceActivity]);
  const applyWorkDecisions = useCallback((decisions: readonly StudioWorkDecision[], setFocus: React.Dispatch<React.SetStateAction<StudioFocusSession>>) => {
    for (const d of decisions) {
      if (d.kind === "route") navigate(d.href);
      else if (d.kind === "panel") overlays.setPanel(d.panel);
      else if (d.kind === "status") applyWorkStatus(d.userStatus, d.activity);
      else if (d.kind === "emote") emote(d.emoteId);
      else if (d.kind === "focus") setFocus((c) => (d.command === "start" ? startStudioFocusSession(c, Date.now()) : stopStudioFocusSession(c)));
      else if (d.kind === "huddle") overlays.setPanel("chat");
    }
  }, [applyWorkStatus, emote, navigate, overlays]);

  const celebrationTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  useEffect(() => () => { if (celebrationTimerRef.current !== null) globalThis.clearTimeout(celebrationTimerRef.current); }, []);
  const triggerCelebration = useCallback((kind: StudioCelebrationKind, count?: number) => {
    const completedCount = count ?? (checkpointCountRef.current += 1);
    if (count !== undefined && count > checkpointCountRef.current) checkpointCountRef.current = count;
    setCelebrationEvent(createStudioCelebrationEvent({ kind, completedCount, workStatusId }));
    playStudioCelebrationChime();
    engineBridge.requestEnvironmentEffect("wish", selfRef.current);
    if (celebrationTimerRef.current !== null) globalThis.clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = globalThis.setTimeout(() => setCelebrationEvent(null), 5500);
  }, [engineBridge, workStatusId]);
  const handleSelectWorkStatus = useCallback((next: StudioWebtoonWorkStatusId) => {
    setWorkStatusId(next);
    if (next === "short-break") applyWorkStatus("break", "available");
    else if (next === "inking" || next === "coloring-bg") applyWorkStatus("focusing", "focused");
    else applyWorkStatus("available", "available");
  }, [applyWorkStatus, setWorkStatusId]);

  const { focusSession, focusNow, focusActive, activeSuggestion, atelierPulse, acceptSuggestion, dismissSuggestion, startFocusPulse, completeFocusSprintNow, pauseFocusSession, resumeFocusSession, stopFocusSession } = useStudioVirtualSpaceFocusSuggestions({
    worldReady: worldRuntime.worldReady, authoringMode, roomId: locationZone.roomId, privateZone: locationZone.privateZone,
    selfSeatedAtDesk: socialAndMedia.seatedActors.some((a) => a.id === fallbackIdentity), selfActivity: snapshot.self.activity, selfUserStatus: snapshot.self.userStatus ?? null,
    peers: personal ? [] : snapshot.peers.map((p) => ({ zoneId: p.state.zoneId, activity: p.state.activity, userStatus: p.state.userStatus ?? null, nearSelf: distanceBetween(p.state, snapshot.self) <= TALK_DISTANCE })),
    spotlightActive: Boolean(socialAndMedia.spotlightEventId), bt, notify, onApplyWorkStatus: applyWorkStatus, onApplyWorkDecisions: applyWorkDecisions,
    onFocusCompleted: (count) => triggerCelebration("focus-sprint", count),
  });

  const { requestSaveLogin, handleBoothProjectAsset } = useStudioVirtualSpaceBoothAsset({ bt, notify });
  const exitSpace = useCallback(() => { writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current); navigate(personal ? "/home?scope=personal" : `/home?project=${encodeURIComponent(projectId)}`); }, [navigate, personal, positionScope, projectId]);
  const openWorldEditor = useCallback(() => { const s = new URLSearchParams(location.search); s.set("worldEdit", "1"); navigate({ pathname: location.pathname, search: s.toString() }); }, [location.pathname, location.search, navigate]);
  const closeWorldEditor = useCallback(() => { const s = new URLSearchParams(location.search); s.delete("worldEdit"); navigate({ pathname: location.pathname, search: s.toString() }); }, [location.pathname, location.search, navigate]);
  const captureVirtualPhoto = useCallback(() => { void captureStudioVirtualPhoto().then((c) => notify(bt(`월드 사진을 저장했어요 · ${Math.max(1, Math.round(c.bytes / 1024))}KB`, "World photo saved"), "success")).catch(() => notify(bt("사진을 저장하지 못했어요.", "Photo failed."), "error")); }, [bt, notify]);
  const handlePhotoCaptureToCut = useCallback((capture: StudioThreePhotoCapture) => {
    globalThis.dispatchEvent(new CustomEvent("toonstudio:cut-layer-import", { detail: { projectId, ...capture } }));
    notify(bt(`3D 포토부스 스냅샷(${capture.width}×${capture.height})을 2D 웹툰 컷 레이어로 전송했어요.`, "Sent 3D shot to 2D cut layer."), "success");
  }, [bt, notify, projectId]);

  const inviteCode = useMemo(() => { try { return createEntryCode(); } catch { return "ST24AB"; } }, []);
  const [inviteIssuedAt] = useState(() => Date.now());
  const spaceUrlBase = typeof window !== "undefined" ? `${window.location.origin}${location.pathname}` : "https://toonstudio.cloud/studio/space";
  const inviteRecord = useMemo(() => createEntryCodeRecord({ code: inviteCode, spaceId: projectId, spaceName }) ?? { code: inviteCode, spaceId: projectId, spaceName, issuedAt: inviteIssuedAt, expiresAt: inviteIssuedAt + 86_400_000 }, [inviteCode, inviteIssuedAt, projectId, spaceName]);
  const inviteLink = `${spaceUrlBase}#code=${inviteRecord.code}`;

  const sharedCursorViews = useMemo<readonly StudioSharedCursorView[]>(() => snapshot.peers.map((peer, idx) => ({
    sessionId: peer.participant.sessionId, displayName: peer.participant.displayName, color: CURSOR_COLORS[idx % CURSOR_COLORS.length] ?? CURSOR_COLORS[0],
    x: Math.round((peer.state.x / Math.max(1, worldRuntime.worldManifest.width)) * (typeof window !== "undefined" ? window.innerWidth : 1280)),
    y: Math.round((peer.state.y / Math.max(1, worldRuntime.worldManifest.height)) * (typeof window !== "undefined" ? window.innerHeight : 800)),
    hidden: false,
  })), [snapshot.peers, worldRuntime.worldManifest.height, worldRuntime.worldManifest.width]);

  const threeLightingState = useMemo<StudioThreeLightingState>(() => {
    const dimmers = lighting.lightFixtures.map((f) => (f.on ? f.dimmer : 0));
    return { timeOfDayHours: lighting.dayNightEnabled ? lighting.cycleTimeOfDay * 24 : (lighting.lightHourOverride ?? lighting.lightHour), interiorDimmer: dimmers.length ? dimmers.reduce((a, b) => a + b, 0) / dimmers.length : 0.72 };
  }, [lighting.cycleTimeOfDay, lighting.dayNightEnabled, lighting.lightFixtures, lighting.lightHour, lighting.lightHourOverride]);

  const proximityLive = socialAndMedia.proximity.phase === "live";
  const openMedia = useCallback(() => { if (!socialAndMedia.mediaAvailable) { notify(bt("팀 프로젝트 공간에서 쓸 수 있어요.", "Available in team spaces."), "info"); return; } overlays.setPanel("chat"); openStudioP2pHuddle({ source: "virtual-space" }); }, [bt, notify, overlays, socialAndMedia.mediaAvailable]);
  const proximityControl = (toggle: () => void) => () => { if (!socialAndMedia.mediaAvailable) { openMedia(); return; } if (socialAndMedia.proximity.enabled) { if (proximityLive) toggle(); return; } overlays.setDockPopover(null); overlays.setMediaConsentOpen(true); };
  const shareScreenNearby = () => { if (proximityLive) { socialAndMedia.proximity.toggleScreen(); return; } if (!socialAndMedia.mediaAvailable) { openMedia(); return; } overlays.setMediaConsentOpen(true); };

  const promptNpc = studioPromptNpc(worldRuntime.nearbyNpcs, currentInteraction !== null);
  const interactTarget = useMemo<SpaceInteractTarget | null>(() => (currentInteraction ? { kind: "interaction", labelKo: currentInteraction.labelKo, labelEn: currentInteraction.labelEn } : promptNpc ? { kind: "npc", labelKo: promptNpc.labelKo, labelEn: promptNpc.labelEn } : null), [currentInteraction, promptNpc]);
  const incomingRequests = socialAndMedia.socialSnapshot.requests.filter((req) => req.direction === "incoming" && req.status === "offered");
  const peopleBadge = { nearby: personal ? 0 : snapshot.nearbyPeers.length, incoming: incomingRequests.length };
  const selfDock = { identity: fallbackIdentity, name: localName, activity: snapshot.self.activity, userStatus: snapshot.self.userStatus, avatarIndex: snapshot.self.avatarIndex, appearance: snapshot.self.appearance };
  const moreItems = spaceMoreItems({ personal, desktop, panel: overlays.panel, proximityVideoOn: socialAndMedia.proximity.enabled, pose: localPose, zoomLevel: userZoom.available ? userZoom.level : null }, {
    toggleProximityVideo: socialAndMedia.mediaAvailable ? () => { if (socialAndMedia.proximity.enabled) socialAndMedia.proximity.stop(); else overlays.setMediaConsentOpen(true); } : undefined,
    openPanel: overlays.setPanel, openSeats: () => openOfficeSeatsRef.current(), openSearch: () => overlays.setSearchOpen(true),
    capturePhoto: captureVirtualPhoto, unstuck: () => engineBridge.requestUnstuck(), openHelp: () => overlays.setHelpOpen(true),
    exit: exitSpace, togglePose: () => engineBridge.requestPose(localPose === "stand" ? "rest" : "stand"), zoom: (a) => engineBridge.userZoom.apply(a),
  });

  const userListUsers = useStudioVirtualPeerConnectionTracker({ selfId: selfListId, selfName: localName, self: snapshot.self, peers: snapshot.peers, liveAvailability: live.availability, connectivityMode: connectivity.mode, directReady: snapshot.direct });
  const minimapPeople = useMemo(() => snapshot.peers.map((p) => ({ id: p.participant.sessionId, name: p.participant.displayName, point: p.state })), [snapshot.peers]);
  const conversationMemberIds = socialAndMedia.activeConversation?.memberIds ?? socialAndMedia.pairConversation?.memberIds ?? [];
  const { people: nearbyPeopleCards, npcs: nearbyNpcCards } = studioNearbyCards({ personal, snapshot, nearbyNpcs: worldRuntime.nearbyNpcs, conversationMemberIds, promptNpcId: promptNpc?.id ?? null });
  const zoneWorkKind = worldRuntime.worldReady && !authoringMode ? spaceZoneWorkKind(locationZone.roomId, currentRoom?.action) : null;
  const zoneWorkItems = zoneWorkKind ? spaceZoneWorkItems(zoneWorkKind, { projectId, productionProjectId, personal }) : [];
  const socialDisabledReason = !permissions.canVoice || !snapshot.direct || authoringMode || !socialAndMedia.socialInteractive ? bt("팀원 연결을 확인하는 중이에요", "Checking connection") : socialAndMedia.socialFocused ? bt("집중·자리 비움 중에는 요청을 보내지 않아요", "Paused while focusing") : null;
  const proximityWaitingReason = socialAndMedia.proximity.phase !== "waiting" ? null : socialAndMedia.proximity.viewer ? bt("관람 모드에서는 근접 음성을 쓸 수 없어요.", "Viewer mode cannot use proximity voice.") : bt("팀원 연결을 확인하는 중이에요.", "Checking teammate connection.");

  const boothSpaces = useMemo<readonly StudioBookableSpace[]>(() => [
    { id: boothConfig.roomId, name: "녹음부스", capacity: 2, equipmentTags: ["마이크", "방음"] },
    ...worldRuntime.worldManifest.rooms.filter((r) => r.id !== boothConfig.roomId).map((r) => ({ id: r.id, name: r.labelKo, capacity: 8, equipmentTags: [] as readonly string[] })),
  ], [boothConfig.roomId, worldRuntime.worldManifest.rooms]);

  const workLauncher = (
    <SpaceWorkLauncher project={workProject} open={overlays.dockPopover === "work"} sheet={touch} onOpenChange={(o) => overlays.setDockPopover(o ? "work" : null)} trigger={(t) => <button type="button" {...t} data-workspace-primary-action="true" />}>
      <StudioVirtualSpaceOfficeStart snapshot={operations.snapshot} workId={projectId} showHeader={false} personal={personal} peerCount={snapshot.peers.length} onRefresh={operations.refresh} rolePreset={spaceRole} onGuidePlace={worldRuntime.moveToRoomOrPlace}
        onOpenWork={() => { overlays.setDockPopover(null); overlays.setPanel("work"); }} onOpenPeople={() => { overlays.setDockPopover(null); overlays.setPanel("people"); }} onOpenSeats={() => openOfficeSeatsRef.current()}
        onGuide={(d) => { overlays.setDockPopover(null); worldRuntime.moveToRoomOrPlace(d === "story" ? "writers" : d); }} />
    </SpaceWorkLauncher>
  );

  const sidePanelKeepAlive = [
    ...(!personal ? [{ id: "huddle", visible: overlays.panel === "chat", node: <Suspense fallback={null}><StudioP2pHuddleLauncher placement="inline" /></Suspense> }] : []),
    { id: "ambient-audio", visible: overlays.panel === "settings", node: <StudioVirtualSpaceAmbientAudio key={projectId} scope={worldRuntime.worldManifest} ready={worldRuntime.worldReady && !authoringMode} focused={atmosphere === "focus" || activity === "focused"} away={activity === "away"} hour={lighting.lightHourOverride ?? lighting.lightHour} /> },
    {
      id: "customization", visible: overlays.panel === "build", node: <StudioVirtualSpacePanelGate active={overlays.panel === "build"} preserveAfterOpen>
        <StudioVirtualSpaceCustomizationPanel artStyle={artStyle} spaceTheme={spaceTheme} onSpaceThemeChange={selectSpaceTheme} key={decorationScope} world={worldRuntime.worldManifest} nickname={nickname}
          character={characterCustomization} decorations={decorations} decorationSyncEnabled={preferences.decorationSyncEnabled} decorationSyncStatus={preferences.decorationSyncStatus} onRecoverDecorations={preferences.recoverDecorations} selfPoint={snapshot.self} sceneSnapshotBinding={sceneSnapshotBinding} fallbackHour={lighting.lightHour}
          tileEffects={tileEffects} onTileEffectsChange={changeTileEffects} placedFixtureRequests={placedFixtureRequests} onPlacedFixtureRequests={selectPlacedFixtureRequests} directPlacement={buildPlacement.panel}
          onNickname={onNicknameChange} onCharacter={preferences.selectCharacterCustomization} onDecorations={selectDecorations} onTriggerEmote={sendReaction} onSelectDistrict={(d) => preferences.selectEnvironmentPreference(studioDistrictEnvironment(d))} />
      </StudioVirtualSpacePanelGate>
    },
  ];

  const zoneSplashInput = useMemo<SpaceZoneSplashInput>(() => ({
    roomId: worldRuntime.zone?.roomId ?? null, labelKo: locationZone.labelKo, labelEn: locationZone.labelEn,
    descriptionKo: worldRuntime.zone?.roomId ? worldRuntime.worldManifest.zones?.find((c) => c.roomId === worldRuntime.zone?.roomId)?.descriptionKo : undefined,
    descriptionEn: worldRuntime.zone?.roomId ? worldRuntime.worldManifest.zones?.find((c) => c.roomId === worldRuntime.zone?.roomId)?.descriptionEn : undefined,
    privateZone: worldRuntime.zone?.privateZone ?? false, reason: worldRuntime.zone?.reason ?? "enter", worldReady: worldRuntime.worldReady,
  }), [locationZone, worldRuntime.worldManifest.zones, worldRuntime.worldReady, worldRuntime.zone]);

  const handleNpcDialogueAction = useCallback((action: StudioNpcDialogueAction) => {
    if (action === "guide") { const g = worldRuntime.worldManifest.npcs.find((n) => studioNpcRole(n) === "guide"); if (g) worldRuntime.startGuideTour(g.id); }
    else if (action === "cowork") overlays.openCowork(null);
    else if (action === "today") overlays.setPanel(personal ? "places" : "today");
    else if (action === "team") overlays.setPanel(personal ? "people" : "team");
    else if (action === "people" || action === "town") overlays.setPanel(action);
    else if (action === "review") overlays.setPanel(personal ? "places" : "work");
    else if (action === "assets") navigate(personal ? "/studio/assets" : `/studio/p/${encodeURIComponent(projectId)}/assets`);
    else navigate(productionProjectId ? `/production/projects/${encodeURIComponent(productionProjectId)}/${action === "schedule" ? "schedule" : "control"}` : `/studio/p/${encodeURIComponent(projectId)}/production`);
    setDialogueNpc(null);
  }, [navigate, overlays, personal, productionProjectId, projectId, setDialogueNpc, worldRuntime]);

  const handleAtelierPulseAction = () => {
    if (atelierPulse.quickActionId === "start-focus") startFocusPulse();
    else if (atelierPulse.quickActionId === "stop-focus") stopFocusSession();
    else if (atelierPulse.quickActionId === "open-review") overlays.setPanel("work");
    else if (atelierPulse.quickActionId === "join-huddle") overlays.openCowork(null);
    else overlays.setPanel("places");
  };

  const dockMedia = {
    available: socialAndMedia.mediaAvailable, onOpen: openMedia,
    micOn: proximityLive && socialAndMedia.proximity.snapshot ? !socialAndMedia.proximity.snapshot.muted : false,
    cameraOn: proximityLive && Boolean(socialAndMedia.proximity.snapshot?.camera),
    screenOn: proximityLive && Boolean(socialAndMedia.proximity.snapshot?.sharing),
    ...(socialAndMedia.mediaAvailable ? { onMic: proximityControl(socialAndMedia.toggleMicByUser), onCamera: proximityControl(socialAndMedia.proximity.toggleCamera), onScreen: shareScreenNearby } : {}),
  };

  return (
    <VirtualThreeThemeProvider spaceScopeId={decorationScope}>
      <div
        data-testid="virtual-space-stage-root"
        className="space-hud" data-own-control-size="true" data-studio-live-shell="true" data-studio-personal-space={personal || undefined}
        data-route-ready="studio-live-space" data-hud-layout={desktop ? "desktop" : "mobile"} data-panel-open={overlays.panel ? "true" : undefined}
        data-dock-popover={overlays.dockPopover ?? undefined} data-world-kind={builtin?.kind ?? "custom"}
        data-engine-status={worldRuntime.engineStatus} data-engine-mode={engineMode} data-handedness={experiencePreference.handedness}
      >
        <h1 className="sr-only">{spaceName} · {bt("가상 스튜디오", "Virtual studio")}</h1>
        <div className="space-hud__stage" data-studio-virtual-space="true" data-handedness={experiencePreference.handedness} data-control-mode={experiencePreference.controlMode} data-quality-preset={experiencePreference.qualityPreset} data-spotlight-active={socialAndMedia.spotlightEventId ? "true" : undefined}>
          {worldRuntime.worldReady ? (
            <StudioVirtualSpaceStageSurface
              workstationSpace={{ id: decorationScope, personal }}
              stageKind={stageKind}
              logical={{
                manifest: worldRuntime.worldManifest, snapshot: chatSnapshot, bridge: engineBridge, selfDisplayName: nickname,
                onRuntimeMetrics: setRuntimeMetrics, onNpcInteract: handleEngineNpcInteract, onLocalState: worldRuntime.handleEngineLocalState,
                onInteract: handleEngineInteract, onNearbyInteractionChange: (i) => { setCurrentInteraction(i); dispatchInteraction(i ? { type: "nearby", interactionId: i.id } : { type: "leave" }); },
                onPortal: worldRuntime.handleEnginePortal, onZoneChange: worldRuntime.setZone, onNearbyNpcsChange: worldRuntime.setNearbyNpcs, onEngineStatusChange: worldRuntime.setEngineStatus,
                onReturnTo2d: () => { setEngineMode("2d"); writeStudioVirtualPreferredEngineMode("2d"); navigate({ pathname: location.pathname, search: applyStudioVirtualStageSearch(location.search, "2d") }, { replace: true }); },
              }}
              twoD={{
                worldAssetUrls: publishedWorld?.assetUrls, selfIdentity: fallbackIdentity, seatedActors: socialAndMedia.seatedActors, waveActorIds: socialAndMedia.waveActorIds,
                guideTourRequest: worldRuntime.guideTourRequest, onGuideTourChange: (s) => { if (s.requestId === worldRuntime.guideRequestRef.current?.id) worldRuntime.setGuideTour(s); },
                debugWorld: authoringMode, atmosphere: activity === "focused" || activity === "away" ? "focus" : atmosphere,
                artStyle, spaceTheme, decorations, experiencePreference, environmentPreference: preferences.environmentPreference,
                onPeerSelect: (id) => { setSelectedPeerId(id); overlays.setPanel("people"); engineBridge.clearMovement(); setFollowingPeer(null); },
                onCancelFollow: cancelFollowing, onStuckChange: worldRuntime.setStuck, onDeskShortcut: handleDeskShortcut, onGhostModeChange: setGhostMode,
                onSpaceUiEvent: spaceUi.handleSpaceUiEvent, onSelfImpact: (vx, vy) => controllerRef.current?.sendImpact(vx, vy),
                onObjectStateChange: (change) => controllerRef.current?.sendObjectState(change.objectId, change.stateKey, change.stateChangedAt),
                tileEffects, placedFixtures: mergedPlacedFixtures, onBuildPlacementEvent: buildPlacement.handleCanvasEvent, onTileEffectTrigger: handleTileEffectTrigger,
              }}
              three={{
                decorations, placedFixtures: mergedPlacedFixtures, onBuildPlacementEvent: buildPlacement.handleCanvasEvent,
                seatedActors: socialAndMedia.seatedActors,
                onPeerSelect: (id) => { setSelectedPeerId(id); overlays.setPanel("people"); engineBridge.clearMovement(); setFollowingPeer(null); },
                onGhostModeChange: setGhostMode, onStuckChange: worldRuntime.setStuck,
                lightingState: threeLightingState, cameraMode: overlays.cameraMode, onCameraModeChange: overlays.setCameraMode,
                visemeByActorId: socialAndMedia.visemeByActorId, liveScreenStream: socialAndMedia.theaterFeed.stream,
                onPhotoCaptureToCut: handlePhotoCaptureToCut, onOpenCustomize: () => overlays.setPanel("build"),
                proximityRadiusPx: personal ? 0 : SPACE_PROXIMITY_MEDIA_RADIUS, ghostMode,
              }}
            />
          ) : (
            <StudioWorldLoadNotice error={worldRuntime.worldLoadError} onRetry={worldRuntime.retryWorldLoad} />
          )}
          <StudioVirtualSpaceSharedCursors cursors={sharedCursorViews} selfSessionId={selfListId} />
        </div>

        <SpaceZoneSplash input={zoneSplashInput} />
        <SpaceCursorChatOverlay enabled={worldRuntime.worldReady && !overlays.modalSurfaceOpen} onSend={sendChatMessage} onStamp={emote} onTypingChange={onChatInputChange} />

        <SpaceHudLayout
          topLeft={
            <>
              <SpaceLocationChip spaceName={spaceName} zone={locationZone} compact={touch} connection={personal ? null : connection} onExit={exitSpace}
                pulse={worldRuntime.worldReady && !authoringMode ? atelierPulse : null} engineMode={authoringMode ? undefined : engineMode}
                onToggleEngineMode={() => { const next = engineMode === "3d" ? "2d" : "3d"; setEngineMode(next); writeStudioVirtualPreferredEngineMode(next); navigate({ pathname: location.pathname, search: applyStudioVirtualStageSearch(location.search, next) }, { replace: true }); }}
                onQuickAction={handleAtelierPulseAction} onOpenSearch={() => { overlays.setDockPopover(null); overlays.setSearchOpen(true); }} />
              <div className="space-top-tools-row" data-space-interactive="true">
                <SpaceInlineProfilePopover nickname={localName} onNicknameChange={onNicknameChange} permissions={permissions} roomControl={roomControl}
                  onHostAction={dispatchHostAction} onOpenInvite={() => overlays.setInviteOpen(true)} onOpenAvatarCustomize={() => overlays.setPanel("build")}
                  peers={snapshot.peers.map((p) => ({ sessionId: p.participant.sessionId, displayName: p.participant.displayName }))} />
                {!touch ? <SpaceDeadlineCountdownWidget deadlines={yjsSpace.state.deadlines} compact /> : null}
                {personal ? (
                  <div className="flex items-center gap-1" data-space-interactive="true">
                    <button type="button" data-testid="space-quick-whiteboard-btn" onClick={() => setSoloBoardOpen((c) => (c === "whiteboard" ? null : "whiteboard"))} className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-panel/95 px-3 text-xs font-medium text-fg shadow-sm hover:border-accent">
                      <PenTool size={14} aria-hidden />{bt("화이트보드", "Board")}
                    </button>
                    <button type="button" data-testid="space-quick-stickies-btn" onClick={() => setSoloBoardOpen((c) => (c === "stickies" ? null : "stickies"))} className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-panel/95 px-3 text-xs font-medium text-fg shadow-sm hover:border-accent">
                      <StickyNote size={14} aria-hidden />{bt("포스트잇", "Stickies")}
                    </button>
                    <button type="button" data-testid="space-quick-annotation-btn" onClick={() => setSoloBoardOpen((c) => (c === "annotation" ? null : "annotation"))} className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-panel/95 px-3 text-xs font-medium text-fg shadow-sm hover:border-accent">
                      <Presentation size={14} aria-hidden />{bt("실시간 주석", "Annotate")}
                    </button>
                  </div>
                ) : !touch ? (
                  <button type="button" data-testid="space-quick-whiteboard-btn" onClick={() => overlays.togglePanel("board")} className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-panel/95 px-3 text-xs font-medium text-fg shadow-sm hover:border-accent">
                    <PenTool size={14} aria-hidden />{bt("화이트보드", "Board")}
                  </button>
                ) : null}
              </div>
              {worldRuntime.worldReady && !authoringMode ? (
                <SpaceWorkStatusBar activeStatusId={workStatusId} onSelectStatus={handleSelectWorkStatus} focusActive={focusActive && focusSession.phase !== "break"}
                  onStartFocusSprint={startFocusPulse} onCompleteCheckpoint={() => { if (focusSession.phase === "running" || focusSession.phase === "paused") completeFocusSprintNow(); else triggerCelebration("milestone-check"); }} />
              ) : null}
              {homeHeader}
              {worldRuntime.worldReady && overlays.tourOpen ? <StudioVirtualSpaceMiniTour progress={overlays.tourProgress} touch={touch} onDone={overlays.finishMiniTour} /> : null}
              <SpaceZoneWorkbar kind={zoneWorkKind} items={zoneWorkItems} pulse={worldRuntime.worldReady && !authoringMode ? atelierPulse : null} onPanel={overlays.setPanel} onCowork={() => overlays.openCowork(null)} onShare={shareScreenNearby} onPulseAction={handleAtelierPulseAction} />
              <StudioVirtualSpaceSilentZoneBadge zone={socialAndMedia.silentZone.zone} mutedByZone={socialAndMedia.silentZone.mutedByZone} />
            </>
          }
          topCenter={
            <>
              <SpaceCelebrationRibbon event={celebrationEvent} onDismiss={() => setCelebrationEvent(null)} />
              {worldRuleGate.element}
              <SpaceTownBanner personal={personal} spotlightActive={Boolean(socialAndMedia.spotlightEventId)} onStopSpotlight={socialAndMedia.stopSpotlight} onViewTown={() => overlays.setPanel("town")} />
              {spaceHudShowsEventBanner({ desktop, coachOpen: worldRuntime.worldReady && overlays.tourOpen }) ? <SpaceEventBanner banner={spaceUi.banner} onDismiss={spaceUi.dismissBanner} /> : null}
              {!personal ? <SpaceRequestToast requests={incomingRequests} greetings={socialAndMedia.socialSnapshot.greetings} acceptDisabledReason={socialAndMedia.socialFocused ? bt("집중·자리 비움 중에는 수락할 수 없어요", "Cannot accept while focusing") : null} onRespond={socialAndMedia.respondToRequest} onOpenPeople={() => overlays.setPanel("people")} onWaveBack={socialAndMedia.waveTo} onApproach={socialAndMedia.approachOfficePeer} /> : null}
              <SpaceProximityVideo phase={socialAndMedia.proximity.phase} snapshot={socialAndMedia.proximity.snapshot} busy={socialAndMedia.proximity.busy} scopeNames={socialAndMedia.proximityScope.scopeNames} selfName={localName} waitingReason={proximityWaitingReason}
                listenerPose={{ point: snapshot.self, cameraYawRadians: 0 }} peerPointsById={socialAndMedia.peerPointsById}
                onToggleCamera={socialAndMedia.proximity.toggleCamera} onToggleMic={socialAndMedia.toggleMicByUser} onToggleScreen={socialAndMedia.proximity.toggleScreen} onStop={socialAndMedia.proximity.stop}
                onOpenTheater={() => overlays.setTheaterOpen(true)} />
              {worldRuntime.worldReady ? <SpaceProximityStrip stageKind={stageKind} people={nearbyPeopleCards} npcs={nearbyNpcCards} artStyle={artStyle} socialDisabled={socialDisabledReason} followingPeerId={followingPeerId} whisperPeerId={socialAndMedia.proximityScope.whisperPeerId}
                onCowork={overlays.openCowork} onWhisper={socialAndMedia.proximityScope.toggleWhisper} onWave={socialAndMedia.waveTo} onTalk={(id) => socialAndMedia.requestActivity(id, "talk")}
                onFollow={(id) => { if (followingPeerId === id) cancelFollowing(); else startFollowingPeer(id); }}
                onNpcTalk={(id) => { const n = worldRuntime.nearbyNpcs.find((item) => item.id === id); if (n?.interaction) handleEngineNpcInteract(n.interaction, n.npc); }} /> : null}
              {socialAndMedia.megaphone.snapshot.status === "broadcasting" && !socialAndMedia.megaphoneBannerDismissed ? <StudioVirtualSpaceMegaphoneBanner snapshot={socialAndMedia.megaphone.snapshot} scope={socialAndMedia.megaphone.snapshot.scope} onDismiss={() => socialAndMedia.setMegaphoneBannerDismissed(true)} /> : null}
              <SpaceToasts toasts={toasts} onDismiss={dismissToast} />
            </>
          }
          topRight={worldRuntime.worldReady && desktop ? <SpaceMinimap manifest={worldRuntime.worldManifest} self={snapshot.self} people={minimapPeople} currentRoomId={locationZone.roomId} expanded={overlays.minimapExpanded} onToggleExpanded={() => overlays.setMinimapExpanded((c) => !c)} onOpenFull={overlays.toggleMap} onMoveTo={worldRuntime.queuePathTo} destination={moveDestinationState} highlightRoomIds={spaceRole.preset.roomIds} /> : null}
          bottomCenter={
            <>
              <div className="space-hud__prompts">
                <SpaceMovementStatus followingName={followingPeerId ? snapshot.peers.find((p) => p.participant.sessionId === followingPeerId)?.participant.displayName ?? null : null} sharedActivity={socialAndMedia.sharedActivity}
                  socialRequests={socialAndMedia.socialSnapshot.requests} config={followConfig} cameraPan={engineBridge.cameraPan} whisperPeerName={socialAndMedia.proximityScope.whisperPeerName}
                  proximityRange={personal ? "standard" : socialAndMedia.proximityScope.proximityRange} statusUrgency={statusExtras.statusUrgency}
                  onResetStatusUrgency={() => { writeSpaceStatusUrgency("normal"); emitSpaceStatusExtrasChange(); }} onStopFollowing={cancelFollowing} onStopLeading={socialAndMedia.finishSharedActivity}
                  onStopWhisper={() => socialAndMedia.proximityScope.setWhisperPeerId(null)} onResetProximityRange={() => socialAndMedia.proximityScope.setProximityRange("standard")} onConfig={updateFollowConfig} onRecentered={() => engineBridge.focusWorld()} />
                {worldRuntime.stuck ? <button type="button" className="space-status-chip space-status-chip--warn" data-space-interactive="true" onClick={() => engineBridge.requestUnstuck()}><LifeBuoy size={16} aria-hidden />{bt("끼었나요? 제자리로 이동", "Stuck? Move to safe spot")}</button> : null}
                {ghostMode ? <div className="space-status-chip" data-space-interactive="true"><p role="status">{bt("고스트 모드 · 벽과 사람을 통과합니다 (G)", "Ghost mode (G)")}</p><button type="button" data-testid="space-ghost-mode-off-btn" className="space-pill-button" onClick={() => { engineBridge.setGhostMode(false); setGhostMode(false); }}>{bt("끄기", "Off")}</button></div> : null}
                {worldRuntime.worldReady && !authoringMode ? <SpaceFocusChip session={focusSession} now={focusNow} onPause={pauseFocusSession} onResume={resumeFocusSession} onStop={stopFocusSession} onCompleteNow={completeFocusSprintNow} onEmote={emote} /> : null}
                {worldRuntime.worldReady && !authoringMode && activeSuggestion ? <SpaceContextSuggestion suggestion={activeSuggestion} onAccept={acceptSuggestion} onDismiss={dismissSuggestion} /> : null}
                {worldRuntime.worldReady ? <SpaceInteractPrompt target={interactTarget} touch={touch} onActivate={() => { if (currentInteraction) engineBridge.requestInteract(); else if (promptNpc?.interaction) handleEngineNpcInteract(promptNpc.interaction, promptNpc.npc); }} /> : null}
                {worldRuntime.worldReady ? <SpaceChatInput blocked={spaceHudChatHintBlocked({ surfaceOpen: blockingOpenRef.current || overlays.panel !== null || overlays.dockPopover !== null || overlays.mapOpen || overlays.helpOpen, chatPanelOpen: chatOpen, touch })} touch={touch} onTypingChange={onChatInputChange} onSend={sendChatMessage} onClosed={() => engineBridge.focusWorld()} /> : null}
              </div>
              {desktop ? (
                <SpaceDock stageKind={stageKind} artStyle={artStyle} self={selfDock} media={dockMedia} panel={overlays.panel} mapOpen={overlays.mapOpen} peopleBadge={peopleBadge} popover={overlays.dockPopover} moreItems={moreItems} workLauncher={workLauncher} panelId={SIDE_PANEL_ID} dockRef={desktopDockRef}
                  proximityRange={socialAndMedia.proximityScope.proximityRange} onProximityRange={socialAndMedia.proximityScope.setProximityRange} statusExpiryMinutes={socialAndMedia.proximityScope.statusExpiryMinutes} onStatusExpiry={socialAndMedia.proximityScope.setStatusExpiryMinutes}
                  onPopover={overlays.setDockPopover} onStatus={setPresenceStatus} onEditCharacter={() => overlays.setPanel("build")} onEmote={emote} onTogglePanel={overlays.togglePanel} onToggleMap={overlays.toggleMap} onExit={exitSpace} />
              ) : (
                <SpaceMobileDock popover={overlays.dockPopover} peopleBadge={peopleBadge} peopleOpen={overlays.panel === "people"} mapOpen={overlays.mapOpen} moreItems={moreItems} workLauncher={workLauncher} dockRef={mobileDockRef}
                  engineMode={engineMode} cameraMode={overlays.cameraMode} onCycleCameraMode={overlays.cycleCameraMode}
                  onPopover={overlays.setDockPopover} onEmote={emote} onTogglePeople={() => overlays.togglePanel("people")} onToggleMap={overlays.toggleMap} />
              )}
            </>
          }
          bottomEnd={touch && worldRuntime.worldReady && experiencePreference.controlMode !== "tap" ? <div className="space-joystick" data-handedness={experiencePreference.handedness} data-space-interactive="true"><StudioVirtualSpaceJoystick mode={experiencePreference.controlMode} onVectorChange={(v) => engineBridge.setJoystick(v)} /></div> : worldRuntime.worldReady ? <SpaceZoomControls store={engineBridge.userZoom} onPointerUse={() => engineBridge.focusWorld()} /> : null}
          rightPanel={
            <SpaceSidePanel id={SIDE_PANEL_ID} panel={overlays.panel} personal={personal} desktop={desktop} onSelect={overlays.setPanel} onClose={overlays.closePanel} keepAlive={sidePanelKeepAlive}>
              <Suspense fallback={<p role="status">{bt("패널 불러오는 중…", "Loading panel…")}</p>}>
                <VirtualSpaceSidePanelContent
                  panel={overlays.panel} personal={personal} signedIn={signedIn} isGuest={isGuest} projectId={projectId} productionProjectId={productionProjectId} activeWorldScope={activeWorldScope}
                  stageKind={stageKind} artStyle={artStyle} worldReady={worldRuntime.worldReady} authoringMode={authoringMode} builtinKind={builtin?.kind ?? null} builtinPlaceWorld={builtinPlaceWorld} selectedPlaceId={selectedPlaceId}
                  locationZone={locationZone} worldManifest={worldRuntime.worldManifest} authoringDraft={worldRuntime.authoringDraft} setAuthoringDraft={worldRuntime.setAuthoringDraft} draftBaseRevision={worldRuntime.draftBaseRevision} setDraftBaseRevision={worldRuntime.setDraftBaseRevision}
                  worldDraftLifetimeActive={() => worldDraftLifetime.active} publication={publication} live={live} connectivityServerAvailable={connectivity.serverAvailable} connectivityLocalOnly={connectivity.localOnly}
                  snapshot={snapshot} fallbackIdentity={fallbackIdentity} privateActorId={privateActorId} currentSessionReady={currentSession.ready} localName={localName} avatarIndex={avatarIndex} selectAvatar={worldRuntime.selectAvatar}
                  avatarSaveStatus={avatarSaveStatus} retryAvatarChoice={retryAvatarChoice} spaceRoleLabel={{ ko: spaceRole.definition ? (spaceRole.customRoleLabel ?? spaceRole.definition.shortLabel.ko) : null, en: spaceRole.definition ? (spaceRole.customRoleLabel ?? spaceRole.definition.shortLabel.en) : null }}
                  userListUsers={userListUsers} userListZones={worldRuntime.userListZones} selfListId={selfListId} selectedPeerId={selectedPeerId} setSelectedPeerId={setSelectedPeerId} permissions={permissions} socialAndMedia={socialAndMedia}
                  yjsSpace={yjsSpace} lighting={lighting} operations={operations} preferences={preferences} atmosphere={atmosphere} changeAtmosphere={changeAtmosphere} runtimeMetrics={runtimeMetrics} captureVirtualPhoto={captureVirtualPhoto}
                  returnToStartPosition={worldRuntime.returnToStartPosition} preferredSlotId={preferredSlotId} preferDesk={preferDesk} engineBridge={engineBridge} queuePathTo={worldRuntime.queuePathTo} selectPlace={worldRuntime.selectPlace}
                  startGuideToPlace={worldRuntime.startGuideToPlace} moveToRoomOrPlace={worldRuntime.moveToRoomOrPlace} walkToPersonalDesk={worldRuntime.walkToPersonalDesk} activateAction={worldRuntime.activateAction} requestInteraction={requestInteraction}
                  guideTour={worldRuntime.guideTour} guideTourRequested={worldRuntime.guideTourRequest !== null} startGuideTour={worldRuntime.startGuideTour} cancelGuideTour={worldRuntime.cancelGuideTour} replayMiniTour={overlays.replayMiniTour}
                  boothSpaces={boothSpaces} boothConfig={boothConfig} boothBookings={boothBookings} setBoothBookings={setBoothBookings} boothWaitlist={boothWaitlist} setBoothWaitlist={setBoothWaitlist}
                  galleryFrames={galleryFrames} galleryStats={galleryStats} setGalleryStats={setGalleryStats} requestSaveLogin={requestSaveLogin} handleBoothProjectAsset={handleBoothProjectAsset}
                  inviteRecord={inviteRecord} inviteLink={inviteLink} spaceUrlBase={spaceUrlBase} initialSessionId={searchParams.get("session")}
                  setPanel={overlays.setPanel} setHelpOpen={overlays.setHelpOpen} openWorldEditor={openWorldEditor} closeWorldEditor={closeWorldEditor} notify={notify} onOpenSoloBoard={personal ? setSoloBoardOpen : undefined}
                />
              </Suspense>
            </SpaceSidePanel>
          }
        />

        <VirtualSpaceStagePopovers
          projectId={projectId} personal={personal} touch={touch} worldReady={worldRuntime.worldReady} authoringMode={authoringMode} builtinKind={builtin?.kind ?? null}
          stageKind={stageKind} artStyle={artStyle} worldManifest={worldRuntime.worldManifest} roomById={roomById} locationZoneRoomId={locationZone.roomId}
          snapshot={snapshot} chatSnapshot={chatSnapshot} chatOpen={chatOpen} setChatOpen={setChatOpen} chatTypingNames={chatTypingNames} sendSpaceChat={sendSpaceChat}
          sendSpaceChatTyping={sendSpaceChatTyping} onChatInputChange={onChatInputChange} engineBridge={engineBridge} overlays={overlays} minimapPeople={minimapPeople}
          highlightRoomIds={spaceRole.preset.roomIds} queuePathTo={worldRuntime.queuePathTo} quickTravelTo={worldRuntime.quickTravelTo} selectPlace={worldRuntime.selectPlace}
          activateAction={worldRuntime.activateAction} returnToStartPosition={worldRuntime.returnToStartPosition} setSelectedPeerId={setSelectedPeerId} setPanel={overlays.setPanel}
          socialAndMedia={socialAndMedia} socialDisabledReason={socialDisabledReason} inviteLink={inviteLink} inviteRecord={inviteRecord} spaceUrlBase={spaceUrlBase}
          soloBoardOpen={soloBoardOpen} setSoloBoardOpen={setSoloBoardOpen} moveDestination={moveDestinationState} yjsSpace={yjsSpace} selfListId={selfListId} localName={localName} permissions={permissions}
          appOpenEffect={appPresence.openEffect} closeAppEffect={appPresence.close} tileMedia={tileMedia} setTileMedia={setTileMedia}
          pendingInteraction={pendingInteraction} interactionPhase={interactionState.phase} interactionActionId={interactionState.actionId as StudioSpatialActionId | null}
          spatialContext={spatialContext} handleSpatialAction={handleSpatialAction} executeSpatialAction={executeSpatialAction} closePendingInteraction={closePendingInteraction}
          dialogueNpc={dialogueNpc} operations={operations} experiencePreference={experiencePreference} selectExperiencePreference={selectExperiencePreference}
          handleNpcDialogueAction={handleNpcDialogueAction} closeDialogue={closeDialogue} privateActorId={privateActorId} publication={publication}
          authoringDraft={worldRuntime.authoringDraft} setAuthoringDraft={worldRuntime.setAuthoringDraft} draftBaseRevision={worldRuntime.draftBaseRevision}
          setDraftBaseRevision={worldRuntime.setDraftBaseRevision} baselineWorldManifestRef={worldRuntime.baselineWorldManifestRef}
          worldDraftLifetimeActive={() => worldDraftLifetime.active} reloadTileEffects={reloadTileEffects} cloneBinding={cloneBinding(searchParams, location.hash)}
        />
      </div>
    </VirtualThreeThemeProvider>
  );
}

export function StudioVirtualSpacePage(
  props: Omit<ComponentProps<typeof StudioVirtualSpacePageRoot>, "Experience"> = {},
) {
  return <StudioVirtualSpacePageRoot {...props} Experience={VirtualSpaceExperience} />;
}

export default StudioVirtualSpacePage;
