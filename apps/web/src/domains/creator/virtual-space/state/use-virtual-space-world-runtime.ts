import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioLiveCollaborationContextValue } from "../../live/studio-live-collaboration-context";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import { isStudioVirtualCampusRoom, resolveStudioVirtualBuiltinWorld, studioVirtualCampusZoneMeta } from "../studio-virtual-space-campus-world";
import { studioCharacterAppearanceForAvatarIndex, STUDIO_CHARACTER_SKINS } from "../studio-virtual-space-character-skins";
import { studioVirtualDecorationNavigationWorld } from "../studio-virtual-space-decoration-layout";
import type { StudioVirtualSpaceEngineStatus, StudioVirtualSpaceNearbyNpc, StudioVirtualSpaceZoneChange } from "../studio-virtual-space-engine-events";
import { resolveStudioLocateStage, studioLocateArrived, type StudioLocateTarget } from "../studio-virtual-space-locate-stages";
import {
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  studioVirtualSpaceDestination,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpaceZoneId,
} from "../studio-virtual-space-model";
import { studioNpcRole } from "../studio-virtual-space-npc-director";
import type { StudioVirtualNpcGuideTourRequest, StudioVirtualNpcGuideTourState } from "../studio-virtual-space-npc-guide";
import { resolveStudioOfficeDestination, studioVirtualPersonalDeskPoint } from "../studio-virtual-space-office-navigation";
import { writeStudioVirtualSpacePositionRecords } from "../studio-virtual-space-page-helpers";
import { studioVirtualPlaceById, studioVirtualPlaceIdForMode, studioVirtualPlaceIdFromPortalHref, studioVirtualPlaceSearch } from "../studio-virtual-space-place-world";
import { StudioVirtualSpacePresenceController, type StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import { resolveStudioVirtualSpaceSessionPoint, writeStudioVirtualSpaceSessionPoint, type StudioVirtualSpacePositionScope } from "../studio-virtual-space-session-position";
import type { StudioVirtualSpaceEngineLocalState } from "../studio-virtual-space-stage-state";
import { studioTownDeskPodForActor } from "../studio-virtual-space-town-program";
import { readStudioWorldAuthoringDraftRecord } from "../studio-virtual-space-world-authoring";
import { loadStudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-loader";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldPresenceState,
  studioWorldSpawn,
  validateStudioWorldManifest,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldPortalDefinition,
} from "../studio-virtual-space-world-manifest";
import { clampStudioWorldPoint, resolveStudioWorldSpawn } from "../studio-virtual-space-world-pathfinding";
import type { StudioCharacterCustomization, StudioVirtualDecorationState } from "../studio-virtual-space-customization";
import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import type { StudioSpacePose } from "../studio-virtual-space-pose-controller";

export interface UseVirtualSpaceWorldRuntimeInput {
  readonly projectId: string;
  readonly personal: boolean;
  readonly signedIn: boolean;
  readonly authoringMode: boolean;
  readonly currentSessionReady: boolean;
  readonly builtin: ReturnType<typeof resolveStudioVirtualBuiltinWorld> | null;
  readonly builtinPlaceWorld: boolean;
  readonly selectedPlaceId: string;
  readonly explicitPlace: boolean;
  readonly resumeRequested: boolean;
  readonly publishedWorld: { readonly publication: { readonly manifest: StudioVirtualSpaceWorldManifest; readonly revisionId: string }; readonly scope: string } | null | undefined;
  readonly activeWorldScope: string;
  readonly sharedWorldAllowed: boolean;
  readonly positionScope: StudioVirtualSpacePositionScope;
  readonly positionScopeKey: string;
  readonly officeNavigationScope: string;
  readonly fallbackIdentity: string;
  readonly startLocation: "last" | "lobby" | "desk";
  readonly guestSpawn: StudioVirtualSpacePoint | null;
  readonly live: StudioLiveCollaborationContextValue;
  readonly connectivityMode: string;
  readonly connectivityServerAvailable: boolean;
  readonly decorations: StudioVirtualDecorationState;
  readonly characterCustomization: StudioCharacterCustomization;
  readonly avatarIndex: number;
  readonly setAvatarIndex: (index: number) => void;
  readonly persistAvatarChoice: (index: number) => void;
  readonly activity: StudioVirtualSpaceActivity;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly setSnapshot: React.Dispatch<React.SetStateAction<StudioVirtualSpaceSnapshot>>;
  readonly selfRef: React.RefObject<StudioVirtualSpaceSnapshot["self"]>;
  readonly writeSelfRef: (next: StudioVirtualSpaceSnapshot["self"]) => void;
  readonly controllerRef: React.RefObject<StudioVirtualSpacePresenceController | null>;
  readonly writeControllerRef: (next: StudioVirtualSpacePresenceController | null, expectedCurrent?: StudioVirtualSpacePresenceController) => void;
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
  readonly writeLocalPoseRef: (next: StudioSpacePose) => void;
  readonly clearLocalReactionTimer: () => void;
  readonly setFollowingPeer: (id: string | null) => void;
  readonly setFollowingPeerId: (id: string | null) => void;
  readonly cancelSlotsAndApproach: () => void;
  readonly markMoved: () => void;
  readonly setPanel: (panel: StudioVirtualWorkspacePanel | null) => void;
  readonly setMapOpen: (open: boolean) => void;
  readonly moveDestination: StudioVirtualSpacePoint | null;
  readonly setMoveDestination: (point: StudioVirtualSpacePoint | null) => void;
  readonly selectedPeerId: string | null;
  readonly socialFocused: boolean;
  readonly cancelFollowing: () => void;
  readonly locationPathname: string;
  readonly locationSearch: string;
  readonly navigate: (to: string | { readonly pathname: string; readonly search: string }, options?: { readonly replace?: boolean }) => void;
  readonly notify: (msg: string, tone?: "info" | "success" | "warn" | "error") => void;
  readonly bt: (ko: string, en: string) => string;
}

/**
 * 월드 매니페스트 로딩, Presence 컨트롤러 수명주기, 아바타 이동·텔레포트·장소 전환·길 안내를 캡슐화한다.
 */
export function useVirtualSpaceWorldRuntime(input: UseVirtualSpaceWorldRuntimeInput) {
  const {
    projectId, personal, signedIn, authoringMode, currentSessionReady, builtin, builtinPlaceWorld,
    selectedPlaceId, explicitPlace, resumeRequested, publishedWorld, activeWorldScope,
    sharedWorldAllowed, positionScope, positionScopeKey, officeNavigationScope, fallbackIdentity,
    startLocation, guestSpawn, live, connectivityMode, connectivityServerAvailable, decorations,
    characterCustomization, avatarIndex, setAvatarIndex, persistAvatarChoice, activity, snapshot,
    setSnapshot, selfRef, writeSelfRef, controllerRef, writeControllerRef, engineBridge, writeLocalPoseRef, clearLocalReactionTimer,
    setFollowingPeer, setFollowingPeerId, cancelSlotsAndApproach, markMoved, setPanel, setMapOpen,
    moveDestination, setMoveDestination, selectedPeerId, socialFocused, cancelFollowing,
    locationPathname, locationSearch, navigate, notify, bt,
  } = input;

  const builtinKey = builtin?.key ?? null;
  const builtinRef = useRef(builtin);
  builtinRef.current = builtin;
  const explicitPlaceRef = useRef(explicitPlace);
  explicitPlaceRef.current = explicitPlace;
  const resumeRequestedRef = useRef(resumeRequested);
  resumeRequestedRef.current = resumeRequested;
  const movingRef = useRef(false);

  const [moving, setMoving] = useState(false);
  const [worldManifest, setWorldManifest] = useState<StudioVirtualSpaceWorldManifest>(DEFAULT_STUDIO_WORLD_MANIFEST);
  const [authoringDraft, setAuthoringDraft] = useState<StudioVirtualSpaceWorldManifest>(DEFAULT_STUDIO_WORLD_MANIFEST);
  const [draftBaseRevision, setDraftBaseRevision] = useState<string | null | undefined>(undefined);
  const baselineWorldManifestRef = useRef<StudioVirtualSpaceWorldManifest>(DEFAULT_STUDIO_WORLD_MANIFEST);
  const [worldLoaded, setWorldLoaded] = useState(false);
  const [loadedPositionScope, setLoadedPositionScope] = useState<string | null>(null);
  const [worldLoadError, setWorldLoadError] = useState<"floor" | "read" | null>(null);
  const [worldLoadAttempt, setWorldLoadAttempt] = useState(0);
  const [zone, setZone] = useState<StudioVirtualSpaceZoneChange | null>(null);
  const [nearbyNpcs, setNearbyNpcs] = useState<readonly StudioVirtualSpaceNearbyNpc[]>([]);
  const [stuck, setStuck] = useState(false);
  const [engineStatus, setEngineStatus] = useState<StudioVirtualSpaceEngineStatus>("loading");
  const [guideTarget, setGuideTarget] = useState<StudioLocateTarget | null>(null);
  const [guideTourRequest, setGuideTourRequest] = useState<StudioVirtualNpcGuideTourRequest | null>(null);
  const [guideTour, setGuideTour] = useState<StudioVirtualNpcGuideTourState | null>(null);
  const guideRequestRef = useRef<StudioVirtualNpcGuideTourRequest | null>(null);
  const guideSequence = useRef(0);
  const pendingArrival = useRef<{ scope: string; placeId: string; roomId: string; point?: StudioVirtualSpacePoint; desk?: boolean } | null>(null);

  const worldReady = worldLoaded && loadedPositionScope === positionScopeKey;
  const navigationWorld = useMemo(() => studioVirtualDecorationNavigationWorld(worldManifest, decorations), [decorations, worldManifest]);
  const participantRole = live.room?.participant.role;

  useEffect(() => {
    const abortController = new AbortController();
    if (authoringMode && !currentSessionReady) return undefined;
    const resolved = builtinRef.current;
    engineBridge.clearMovement();
    movingRef.current = false;
    setMoving(false);
    setFollowingPeerId(null);
    setZone(null);
    setNearbyNpcs([]);
    setStuck(false);
    setWorldLoaded(false);
    setLoadedPositionScope(null);
    setWorldLoadError(null);
    const manifestRequest = publishedWorld
      ? Promise.resolve(publishedWorld.publication.manifest)
      : resolved
        ? Promise.resolve(resolved.manifest)
        : loadStudioVirtualSpaceWorldManifest(undefined, undefined, abortController.signal);
    void manifestRequest.then(async (manifest) => {
      if (abortController.signal.aborted) return;
      baselineWorldManifestRef.current = manifest;
      const storedDraft = authoringMode ? await readStudioWorldAuthoringDraftRecord(projectId) : null;
      if (abortController.signal.aborted) return;
      const activeManifest = storedDraft?.manifest ?? manifest;
      setDraftBaseRevision(storedDraft ? storedDraft.basePublishedRevisionId : publishedWorld?.publication.revisionId ?? null);
      const spawn = studioWorldSpawn(activeManifest, resolved?.spawnId).point;
      const actor = studioTownDeskPodForActor(fallbackIdentity, participantRole);
      const preferStart = !guestSpawn && !resumeRequestedRef.current;
      const point = publishedWorld
        ? resolveStudioWorldSpawn(activeManifest, studioWorldSpawn(activeManifest).point)
        : (resolved && explicitPlaceRef.current && preferStart) || (preferStart && startLocation === "lobby")
          ? resolveStudioWorldSpawn(activeManifest, spawn)
          : preferStart && startLocation === "desk"
            ? resolveStudioWorldSpawn(activeManifest, actor?.point ?? spawn)
            : resolveStudioVirtualSpaceSessionPoint(positionScope, activeManifest, guestSpawn ?? spawn);
      setWorldManifest(activeManifest);
      setAuthoringDraft(activeManifest);
      if (!point) { setWorldLoaded(false); setWorldLoadError("floor"); return; }
      const self = studioWorldPresenceState(activeManifest, { ...selfRef.current, ...point, moving: false });
      writeSelfRef(self);
      setSnapshot((current) => ({ ...current, self }));
      setWorldLoadError(null);
      setLoadedPositionScope(positionScopeKey);
      setWorldLoaded(true);
    }).catch(() => { if (!abortController.signal.aborted) setWorldLoadError("read"); });
    return () => abortController.abort();
  }, [authoringMode, builtinKey, currentSessionReady, engineBridge, fallbackIdentity, guestSpawn, participantRole, positionScope, positionScopeKey, projectId, publishedWorld, selfRef, setFollowingPeerId, setSnapshot, startLocation, worldLoadAttempt, writeSelfRef]);

  useEffect(() => {
    if (!authoringMode || !worldReady || validateStudioWorldManifest(authoringDraft).length > 0) return undefined;
    const timeout = globalThis.setTimeout(() => {
      engineBridge.clearMovement();
      const point = resolveStudioWorldSpawn(authoringDraft, selfRef.current);
      if (!point) return;
      const self = studioWorldPresenceState(authoringDraft, { ...selfRef.current, ...point, moving: false });
      writeSelfRef(self);
      setWorldManifest(authoringDraft);
      setSnapshot((value) => ({ ...value, self }));
    }, 180);
    return () => globalThis.clearTimeout(timeout);
  }, [authoringDraft, authoringMode, engineBridge, selfRef, setSnapshot, worldReady, writeSelfRef]);

  useEffect(() => {
    if (!worldReady) return undefined;
    const timeout = globalThis.setTimeout(() => {
      writeStudioVirtualSpacePositionRecords({ positionScope, projectId, signedIn, placeId: selectedPlaceId, point: { x: snapshot.self.x, y: snapshot.self.y } });
    }, 180);
    return () => globalThis.clearTimeout(timeout);
  }, [positionScope, projectId, selectedPlaceId, signedIn, snapshot.self.x, snapshot.self.y, worldReady]);

  useEffect(() => {
    const room = live.room;
    if (!worldReady) return undefined;
    const directAllowed = connectivityServerAvailable || (live.mode === "local" && connectivityMode !== "offline");
    if (authoringMode || !sharedWorldAllowed || !directAllowed || !room?.direct || live.availability !== "ready") {
      controllerRef.current?.close();
      writeControllerRef(null);
      setSnapshot((current) => ({ ...current, peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null, peerTyping: [], peerFixtures: [], direct: false }));
      return undefined;
    }
    const controller = new StudioVirtualSpacePresenceController(room.participant, room.direct, selfRef.current, {
      appearanceForAvatarIndex: (index, identity) => studioCharacterAppearanceForAvatarIndex(index, identity, characterCustomization),
      worldScope: activeWorldScope,
    });
    clearLocalReactionTimer();
    writeControllerRef(controller);
    controller.setAvatarIndex(selfRef.current.avatarIndex);
    controller.setAppearance?.(studioCharacterAppearanceForAvatarIndex(selfRef.current.avatarIndex, fallbackIdentity, characterCustomization));
    const refresh = () => setSnapshot(controller.snapshot());
    const unsubscribe = controller.subscribe(refresh);
    controller.start();
    refresh();
    return () => { unsubscribe(); controller.close(); writeControllerRef(null, controller); };
  }, [activeWorldScope, authoringMode, characterCustomization, clearLocalReactionTimer, connectivityMode, connectivityServerAvailable, controllerRef, fallbackIdentity, live.availability, live.mode, live.room, selfRef, setSnapshot, sharedWorldAllowed, worldReady, writeControllerRef]);

  useEffect(() => {
    const appearance = studioCharacterAppearanceForAvatarIndex(avatarIndex, fallbackIdentity, characterCustomization);
    controllerRef.current?.setAppearance?.(appearance);
    const nextSelf = Object.freeze({ ...selfRef.current, avatarIndex, appearance });
    writeSelfRef(nextSelf);
    setSnapshot((current) => ({ ...current, self: nextSelf }));
  }, [avatarIndex, characterCustomization, controllerRef, fallbackIdentity, selfRef, setSnapshot, writeSelfRef]);

  const updatePosition = useCallback((point: StudioVirtualSpacePoint, facing: StudioVirtualSpaceFacing, zoneId?: string) => {
    const bounded = clampStudioWorldPoint(worldManifest, point);
    const nextState = studioWorldPresenceState(worldManifest, { ...selfRef.current, ...bounded, facing, activity, moving: movingRef.current, zoneId: zoneId ?? selfRef.current.zoneId });
    writeSelfRef(nextState);
    const controller = controllerRef.current;
    if (controller) { controller.update(bounded, facing, activity, movingRef.current, selfRef.current.avatarIndex, zoneId); setSnapshot(controller.snapshot()); return; }
    setSnapshot((current) => ({ ...current, self: nextState }));
  }, [activity, controllerRef, selfRef, setSnapshot, worldManifest, writeSelfRef]);

  const handleEngineLocalState = useCallback((next: StudioVirtualSpaceEngineLocalState) => {
    if (movingRef.current !== next.moving) {
      movingRef.current = next.moving;
      setMoving(next.moving);
      if (next.moving) markMoved();
    }
    writeLocalPoseRef(next.pose ?? "stand");
    updatePosition(next.point, next.facing, next.zoneId);
  }, [markMoved, updatePosition, writeLocalPoseRef]);

  const queuePathTo = useCallback((point: StudioVirtualSpacePoint) => {
    if (!worldReady) return;
    cancelSlotsAndApproach();
    setFollowingPeer(null);
    engineBridge.requestMove(point);
    setMoveDestination(point);
  }, [cancelSlotsAndApproach, engineBridge, setFollowingPeer, setMoveDestination, worldReady]);

  const quickTravelTo = useCallback((point: StudioVirtualSpacePoint) => {
    if (!worldReady) return;
    cancelSlotsAndApproach();
    setFollowingPeer(null);
    setMoveDestination(null);
    engineBridge.requestTeleport(point);
  }, [cancelSlotsAndApproach, engineBridge, setFollowingPeer, setMoveDestination, worldReady]);

  const returnToStartPosition = useCallback(() => {
    if (!worldReady) return;
    quickTravelTo(studioWorldSpawn(worldManifest).point);
    notify(bt("시작 위치로 돌아왔어요.", "Back at the start position."), "info");
  }, [bt, notify, quickTravelTo, worldManifest, worldReady]);

  useEffect(() => {
    if (moveDestination && Math.hypot(snapshot.self.x - moveDestination.x, snapshot.self.y - moveDestination.y) < 12) setMoveDestination(null);
  }, [moveDestination, setMoveDestination, snapshot.self]);

  useEffect(() => { engineBridge.setLocateTarget(selectedPeerId); }, [engineBridge, selectedPeerId]);

  const guideStage = useMemo(
    () => (guideTarget ? resolveStudioLocateStage({ currentKind: builtin?.kind ?? "other", currentPlaceId: selectedPlaceId, target: guideTarget, currentManifest: worldManifest }) : null),
    [builtin?.kind, guideTarget, selectedPlaceId, worldManifest],
  );
  useEffect(() => {
    if (!guideTarget || !guideStage) { engineBridge.setLocatePoint(null); return; }
    engineBridge.setLocatePoint(guideStage.point);
    if (studioLocateArrived(guideStage, snapshot.self, guideTarget)) {
      notify(bt(`${guideTarget.labelKo}에 도착했어요.`, `You arrived at ${guideTarget.labelEn}.`), "success");
      setGuideTarget(null);
    }
  }, [bt, engineBridge, guideStage, guideTarget, notify, snapshot.self]);

  const selectPlace = useCallback((placeId: string) => {
    const nextPlaceId = studioVirtualPlaceIdForMode(placeId, personal);
    if (!builtinPlaceWorld) return;
    const current = builtinRef.current;
    if (current?.kind === "campus" && isStudioVirtualCampusRoom(nextPlaceId)) {
      const spawn = worldManifest.spawns.find((item) => item.id === nextPlaceId)?.point ?? studioWorldSpawn(worldManifest, nextPlaceId).point;
      setPanel(null); setMapOpen(false); queuePathTo(spawn); return;
    }
    if (current?.kind === "place" && nextPlaceId === current.placeId) return;
    cancelSlotsAndApproach(); engineBridge.clearMovement(); setFollowingPeer(null); setPanel(null); setMapOpen(false);
    const nextSearch = new URLSearchParams(studioVirtualPlaceSearch(locationSearch, nextPlaceId, personal));
    if (current?.kind === "place" && isStudioVirtualCampusRoom(nextPlaceId)) nextSearch.set("from", current.placeId);
    else nextSearch.delete("from");
    navigate({ pathname: locationPathname, search: nextSearch.toString() ? `?${nextSearch.toString()}` : "" });
  }, [builtinPlaceWorld, cancelSlotsAndApproach, engineBridge, locationPathname, locationSearch, navigate, personal, queuePathTo, setFollowingPeer, setMapOpen, setPanel, worldManifest]);

  const moveToRoomOrPlace = useCallback((roomId: StudioVirtualSpaceZoneId, point?: StudioVirtualSpacePoint) => {
    if (!worldReady) return;
    const dest = resolveStudioOfficeDestination({ manifest: navigationWorld, builtinPlaceWorld, selectedPlaceId: builtinRef.current?.placeId ?? selectedPlaceId, personal, self: selfRef.current, roomId, point });
    if (!dest) { notify(bt("이 작업 자리까지 이동할 수 없어요.", "This workspace cannot be reached."), "warn"); return; }
    setPanel(null);
    if (dest.type === "place") { pendingArrival.current = { scope: officeNavigationScope, placeId: dest.placeId, roomId: dest.roomId ?? roomId, point: dest.point }; selectPlace(dest.placeId); }
    else queuePathTo(dest.point);
  }, [bt, builtinPlaceWorld, navigationWorld, notify, officeNavigationScope, personal, queuePathTo, selectPlace, selectedPlaceId, selfRef, setPanel, worldReady]);

  const walkToPersonalDesk = useCallback(() => {
    if (!worldReady) return;
    moveToRoomOrPlace("drawing", builtinPlaceWorld ? studioVirtualPersonalDeskPoint(navigationWorld) : undefined);
  }, [builtinPlaceWorld, moveToRoomOrPlace, navigationWorld, worldReady]);

  const handleEnginePortal = useCallback((portal: StudioWorldPortalDefinition) => {
    cancelSlotsAndApproach();
    const placeId = builtinPlaceWorld ? studioVirtualPlaceIdFromPortalHref(portal.href) : null;
    if (placeId) { selectPlace(placeId); if (placeId === selectedPlaceId) engineBridge.requestPortalReveal(); return; }
    if (portal.href) navigate(portal.href);
  }, [builtinPlaceWorld, cancelSlotsAndApproach, engineBridge, navigate, selectPlace, selectedPlaceId]);

  const activateAction = useCallback((action: StudioWorldInteractionDefinition["action"]) => {
    setPanel(null);
    writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current);
    if (action === "assistant") { globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open")); return; }
    if (action === "community") { if (personal) setPanel("people"); else navigate("/community"); return; }
    if (personal && action === "live") { setPanel("town"); return; }
    const destination = personal
      ? action === "assets" ? "/studio/assets" : action === "canvas" || action === "review" ? "/studio" : "/studio/new"
      : studioVirtualSpaceDestination(projectId, action);
    if (destination) navigate(destination);
  }, [navigate, personal, positionScope, projectId, selfRef, setPanel]);

  const selectAvatar = useCallback((nextIndex: number) => {
    if (!Number.isInteger(nextIndex) || nextIndex < STUDIO_VIRTUAL_SPACE_AUTO_AVATAR || nextIndex >= Math.max(STUDIO_CHARACTER_SKINS.length, 32)) return;
    setAvatarIndex(nextIndex);
    persistAvatarChoice(nextIndex);
    if (controllerRef.current) { controllerRef.current.setAvatarIndex(nextIndex); setSnapshot(controllerRef.current.snapshot()); return; }
    setSnapshot((current) => {
      const self = studioWorldPresenceState(worldManifest, { ...current.self, avatarIndex: nextIndex });
      writeSelfRef(self);
      return { ...current, self };
    });
  }, [controllerRef, persistAvatarChoice, setAvatarIndex, setSnapshot, worldManifest, writeSelfRef]);

  const cancelGuideTour = useCallback(() => {
    guideRequestRef.current = null;
    setGuideTourRequest(null);
    setGuideTour((c) => (c ? { ...c, status: "cancelled" } : null));
  }, []);

  const startGuideTour = useCallback((guideId: string) => {
    if (!worldReady || authoringMode || socialFocused || !worldManifest.npcs.some((npc) => npc.id === guideId && studioNpcRole(npc) === "guide")) return;
    const req = { id: `guide-tour:${++guideSequence.current}`, guideId };
    cancelFollowing(); engineBridge.clearMovement(); guideRequestRef.current = req; setGuideTour(null); setGuideTourRequest(req);
  }, [authoringMode, cancelFollowing, engineBridge, socialFocused, worldManifest.npcs, worldReady]);

  const startGuideToPlace = useCallback((placeId: string) => {
    const t = studioVirtualPlaceIdForMode(placeId, personal);
    const w = resolveStudioVirtualBuiltinWorld(t, personal);
    const p = studioVirtualPlaceById(t);
    setPanel(null);
    setMapOpen(false);
    setGuideTarget({ placeId: t, labelKo: p.labelKo, labelEn: p.labelEn, point: studioWorldSpawn(w.manifest).point });
  }, [personal, setMapOpen, setPanel]);

  const userListZones = useMemo(
    () => worldManifest.rooms.map((room) => ({ id: room.id, labelKo: studioVirtualCampusZoneMeta(room.id)?.labelKo ?? room.labelKo, labelEn: studioVirtualCampusZoneMeta(room.id)?.labelEn ?? room.labelEn })),
    [worldManifest.rooms],
  );

  return {
    moving, worldManifest, navigationWorld, authoringDraft, setAuthoringDraft,
    draftBaseRevision, setDraftBaseRevision, baselineWorldManifestRef,
    worldReady, worldLoadError, retryWorldLoad: () => setWorldLoadAttempt((v) => v + 1),
    zone, setZone, nearbyNpcs, setNearbyNpcs, stuck, setStuck, engineStatus, setEngineStatus,
    guideTourRequest, guideTour, setGuideTour, guideRequestRef, startGuideTour, cancelGuideTour, startGuideToPlace,
    handleEngineLocalState, queuePathTo, quickTravelTo, returnToStartPosition,
    selectPlace, moveToRoomOrPlace, walkToPersonalDesk, handleEnginePortal, activateAction, selectAvatar,
    userListZones,
  };
}
