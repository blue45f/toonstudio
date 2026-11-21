import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualSpaceMiniTourProgress } from "../StudioVirtualSpaceGuide";
import { readStudioVirtualSpaceTourSeen, writeStudioVirtualSpaceTourSeen } from "../studio-virtual-space-entry-preference";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioVirtualWorkspacePanelForScope, type StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import { initialPanel } from "../studio-virtual-space-page-helpers";
import type { StudioWorldInteractionDefinition, StudioWorldNpcDefinition } from "../studio-virtual-space-world-manifest";
import type { SpaceDockPopover } from "../hud/space-dock-model";
import { useSpaceShortcuts } from "../hud/use-space-shortcuts";
import type { StudioThreeCameraMode } from "../three/studio-virtual-space-three-stage-props";
import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";

const CAMERA_MODES: readonly StudioThreeCameraMode[] = ["quarter", "third-person", "first-person"];

export interface UseVirtualSpaceOverlaysInput {
  readonly search: string;
  readonly personal: boolean;
  readonly desktop: boolean;
  readonly worldReady: boolean;
  readonly entryJustConfirmed: boolean;
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
  readonly chatOpen: boolean;
  readonly setChatOpen: (open: boolean) => void;
  readonly pendingInteraction: StudioWorldInteractionDefinition | null;
  readonly closePendingInteraction: () => void;
  readonly dialogueNpc: StudioWorldNpcDefinition | null;
  readonly closeDialogue: () => void;
  readonly emote: (id: StudioSpaceEmoteId) => void;
  readonly zoomAvailable: boolean;
  readonly onDeskShortcut: () => void;
  readonly onToggleQuietMode: () => void;
  readonly soloBoardOpen?: boolean;
  readonly onCloseSoloBoard?: () => void;
  readonly appEffectOpen?: boolean;
  readonly onCloseAppEffect?: () => void;
  readonly tileMediaOpen?: boolean;
  readonly onCloseTileMedia?: () => void;
}

/**
 * 가상 스튜디오 오버레이·패널·모달·단축키·미니투어·3D 카메라 모드·시어터 상태를 통합 관리한다.
 */
export function useVirtualSpaceOverlays({
  search,
  personal,
  desktop,
  worldReady,
  entryJustConfirmed,
  engineBridge,
  chatOpen,
  setChatOpen,
  pendingInteraction,
  closePendingInteraction,
  dialogueNpc,
  closeDialogue,
  emote,
  zoomAvailable,
  onDeskShortcut,
  onToggleQuietMode,
  soloBoardOpen = false,
  onCloseSoloBoard,
  appEffectOpen = false,
  onCloseAppEffect,
  tileMediaOpen = false,
  onCloseTileMedia,
}: UseVirtualSpaceOverlaysInput) {
  const [requestedPanel, setPanel] = useState<StudioVirtualWorkspacePanel | null>(() => initialPanel(search));
  const panel = studioVirtualWorkspacePanelForScope(requestedPanel, personal);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dockPopover, setDockPopover] = useState<SpaceDockPopover | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [minimapExpanded, setMinimapExpanded] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [mediaConsentOpen, setMediaConsentOpen] = useState(false);
  const [coworkOpen, setCoworkOpen] = useState(false);
  const [coworkTargetId, setCoworkTargetId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<StudioThreeCameraMode>("quarter");
  const [moveDestination, setMoveDestination] = useState<StudioVirtualSpacePoint | null>(null);
  const spaceSearchRef = useRef<HTMLInputElement>(null);

  const [tourOpen, setTourOpen] = useState(() => entryJustConfirmed && !readStudioVirtualSpaceTourSeen());
  const [tourProgress, setTourProgress] = useState<StudioVirtualSpaceMiniTourProgress>({
    moved: false,
    interacted: false,
    emoted: false,
  });

  const markCoach = useCallback((key: keyof StudioVirtualSpaceMiniTourProgress) => {
    setTourProgress((current) => (current[key] ? current : { ...current, [key]: true }));
  }, []);

  const finishMiniTour = useCallback((seen: boolean) => {
    if (seen) writeStudioVirtualSpaceTourSeen(true);
    setTourOpen(false);
    engineBridge.focusWorld();
  }, [engineBridge]);

  const replayMiniTour = useCallback(() => {
    writeStudioVirtualSpaceTourSeen(false);
    setTourProgress({ moved: false, interacted: false, emoted: false });
    setPanel(null);
    setTourOpen(true);
  }, []);

  const openCowork = useCallback((peerId: string | null) => {
    setDockPopover(null);
    setCoworkTargetId(peerId);
    setCoworkOpen(true);
  }, []);

  const cycleCameraMode = useCallback(() => {
    setCameraMode((current) => {
      const idx = CAMERA_MODES.indexOf(current);
      return CAMERA_MODES[(idx + 1) % CAMERA_MODES.length] ?? "quarter";
    });
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    engineBridge.focusWorld();
  }, [engineBridge]);

  const togglePanel = useCallback((next: StudioVirtualWorkspacePanel) => {
    setDockPopover(null);
    setPanel((current) => (current === next ? null : next));
  }, []);

  const toggleMap = useCallback(() => {
    setDockPopover(null);
    setMapOpen((current) => !current);
  }, []);

  const closeTopLayer = useCallback((): boolean => {
    if (theaterOpen) { setTheaterOpen(false); engineBridge.focusWorld(); return true; }
    if (soloBoardOpen && onCloseSoloBoard) { onCloseSoloBoard(); engineBridge.focusWorld(); return true; }
    if (inviteOpen) { setInviteOpen(false); engineBridge.focusWorld(); return true; }
    if (mediaConsentOpen) { setMediaConsentOpen(false); engineBridge.focusWorld(); return true; }
    if (coworkOpen) { setCoworkOpen(false); engineBridge.focusWorld(); return true; }
    if (appEffectOpen && onCloseAppEffect) { onCloseAppEffect(); engineBridge.focusWorld(); return true; }
    if (tileMediaOpen && onCloseTileMedia) { onCloseTileMedia(); engineBridge.focusWorld(); return true; }
    if (chatOpen) { setChatOpen(false); engineBridge.focusWorld(); return true; }
    if (dockPopover) { setDockPopover(null); engineBridge.focusWorld(); return true; }
    if (helpOpen) { setHelpOpen(false); engineBridge.focusWorld(); return true; }
    if (mapOpen) { setMapOpen(false); engineBridge.focusWorld(); return true; }
    if (dialogueNpc) { closeDialogue(); return true; }
    if (pendingInteraction) { closePendingInteraction(); return true; }
    if (panel) { setPanel(null); engineBridge.focusWorld(); return true; }
    return false;
  }, [
    appEffectOpen,
    chatOpen,
    closeDialogue,
    closePendingInteraction,
    coworkOpen,
    dialogueNpc,
    dockPopover,
    engineBridge,
    helpOpen,
    inviteOpen,
    mapOpen,
    mediaConsentOpen,
    onCloseAppEffect,
    onCloseSoloBoard,
    onCloseTileMedia,
    panel,
    pendingInteraction,
    setChatOpen,
    soloBoardOpen,
    theaterOpen,
    tileMediaOpen,
  ]);

  const modalSurfaceOpen = searchOpen
    || inviteOpen
    || theaterOpen
    || soloBoardOpen
    || coworkOpen
    || mediaConsentOpen
    || helpOpen
    || appEffectOpen
    || tileMediaOpen
    || (!desktop && (panel !== null || (dockPopover !== null && dockPopover !== "react") || mapOpen || pendingInteraction !== null || dialogueNpc !== null));

  useEffect(() => {
    if (modalSurfaceOpen) engineBridge.clearMovement();
  }, [modalSurfaceOpen, engineBridge]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (document.querySelector('dialog[open][aria-modal="true"]') && !searchOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      engineBridge.clearMovement();
      setDockPopover(null);
      setSearchOpen(true);
      spaceSearchRef.current?.focus();
    };
    window.addEventListener("keydown", openSearch, true);
    return () => window.removeEventListener("keydown", openSearch, true);
  }, [engineBridge, searchOpen]);

  useEffect(() => {
    if (searchOpen) spaceSearchRef.current?.focus({ preventScroll: true });
  }, [searchOpen]);

  const zoomHandler = useMemo(
    () => (zoomAvailable ? (action: "in" | "out" | "reset") => engineBridge.userZoom.apply(action) : undefined),
    [engineBridge.userZoom, zoomAvailable],
  );

  useSpaceShortcuts({
    onEmote: emote,
    onToggleMap: toggleMap,
    onTogglePeople: () => togglePanel("people"),
    onHelp: () => { setDockPopover(null); setHelpOpen((current) => !current); },
    onChat: () => setChatOpen(true),
    onSearch: () => { setDockPopover(null); setSearchOpen(true); },
    onEscape: closeTopLayer,
    onZoom: zoomHandler,
    onDesk: onDeskShortcut,
    onLocate: () => engineBridge.cameraPan.recenter(),
    onToggleQuietMode,
  }, worldReady && !searchOpen);

  return {
    panel,
    setPanel,
    closePanel,
    togglePanel,
    searchOpen,
    setSearchOpen,
    spaceSearchRef,
    dockPopover,
    setDockPopover,
    mapOpen,
    setMapOpen,
    toggleMap,
    minimapExpanded,
    setMinimapExpanded,
    helpOpen,
    setHelpOpen,
    inviteOpen,
    setInviteOpen,
    theaterOpen,
    setTheaterOpen,
    mediaConsentOpen,
    setMediaConsentOpen,
    coworkOpen,
    setCoworkOpen,
    coworkTargetId,
    setCoworkTargetId,
    openCowork,
    cameraMode,
    setCameraMode,
    cycleCameraMode,
    moveDestination,
    setMoveDestination,
    tourOpen,
    tourProgress,
    markCoach,
    finishMiniTour,
    replayMiniTour,
    modalSurfaceOpen,
  };
}
