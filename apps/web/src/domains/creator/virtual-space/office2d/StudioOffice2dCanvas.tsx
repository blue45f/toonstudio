import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  bindStudioCameraGestures,
  setActiveMountedCameraPanStore,
} from "../studio-virtual-space-camera-pan";
import {
  getStudioSpaceSelectedObjectTarget,
  subscribeStudioSpaceSelectedObjectTarget,
} from "../studio-virtual-space-camera-recovery";
import {
  bindStudioSpaceTextEntryMovementStop,
  isStudioSpaceJoystickActive,
  isStudioSpaceTextEntryTarget,
} from "../studio-virtual-space-input-guard";
import type { StudioVirtualSpaceZoneChange } from "../studio-virtual-space-engine-events";
import { studioWorldRoomAt } from "../studio-virtual-space-world-manifest";
import {
  studioWorldMayTakeFocus,
  studioWorldShouldReclaimFocus,
  WORLD_KEY_CODES,
  type StudioVirtualSpacePhaserCanvasProps,
} from "../studio-virtual-space-phaser-canvas-model";
import { isToonHqManifest } from "./hq/toon-hq-manifest";
import {
  ILLUSTRATED_2D_WORKSTATIONS,
  subscribeIllustrated2dVfxBurst,
  subscribeIllustratedWorkstationModal,
} from "../studio-virtual-space-illustrated-2d-runtime";
import { StudioVirtualSpaceBootRecoveryCard } from "../StudioVirtualSpaceBootRecoveryCard";
import { StudioVirtualSpaceWorkstationLiveModal } from "../StudioVirtualSpaceWorkstationLiveModal";
import { office2dCharacterForAvatarSkin } from "./office2d-avatar-role";
import { createOffice2dAvatarProfileSource } from "./office2d-avatar-appearance";
import {
  office2dBackdropAssetUrls,
  resolveOffice2dSchematicClickTarget,
  resolveOffice2dWorkstation,
} from "./office2d-backdrop-art";
import { office2dBaseZoom } from "./office2d-camera";
import { bindOffice2dDeskShortcut } from "./bind-office2d-desk-shortcut";
import { createOffice2dDecorAssetLoader, type Office2dDecorAssetLoader } from "./office2d-decor-assets";
import { Office2dResolutionGovernor } from "./office2d-quality";
import { office2dSceneFor, office2dSceneSpriteKeys } from "./office2d-scene";
import { Office2dRuntime, type Office2dRuntimeCallbacks, type Office2dStageProps } from "./office2d-runtime";
import {
  playOffice2dSpatialCue,
  readOffice2dClaimedSeatId,
  readOffice2dSoundMuted,
  writeOffice2dClaimedSeatId,
  writeOffice2dSoundMuted,
} from "./office2d-stage-extensions";
import type { Office2dDrawable, Office2dRendererHost } from "./office2d-renderer";
import {
  Office2dSpriteStore,
  office2dBrowserImageLoader,
  office2dObjectUrl,
  office2dActorAssetPlan,
} from "./office2d-sprite-catalog";
import { StudioOffice2dPipelineRail } from "./StudioOffice2dPipelineRail";
import "./studio-office2d.css";

const ASSET_TIMEOUT_MS = 6_000;
export const STUDIO_OFFICE2D_BOOT_DEADLINE_MS = 12_000;
/** 창이 초점을 잃었지만 보이는 동안(옆 모니터에 띄워 둔 경우)의 프레임 간격. SoWork의 unfocused 12~15fps 정책을 따른다. */
const BLURRED_FRAME_MS = 1000 / 15;
const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

export interface StudioOffice2dCanvasProps extends StudioVirtualSpacePhaserCanvasProps {
  /** 테스트·느린 네트워크 진단용 입장 타임아웃(ms). 기본값은 12초다. */
  readonly bootDeadlineMs?: number;
}

function documentLanguage(): "ko" | "en" {
  return typeof document !== "undefined" && document.documentElement.lang?.toLowerCase().startsWith("en") ? "en" : "ko";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * ToonOffice 2D 스테이지(가상 스튜디오 2D 기본 엔진).
 *
 * Phaser·3D 스테이지와 같은 props 계약(StudioVirtualSpacePhaserCanvasProps)을 지키므로 페이지의 프레즌스·좌석·NPC 대화·HUD가 그대로 동작한다.
 * 그리기와 물리는 Office2dRuntime이 맡고, 이 컴포넌트는 캔버스 크기·입력·애니메이션 루프·자산 로딩만 연결한다.
 */
export function StudioOffice2dCanvas(props: StudioOffice2dCanvasProps) {
  const { manifest, bridge, selfIdentity = "local", bootDeadlineMs = STUDIO_OFFICE2D_BOOT_DEADLINE_MS } = props;
  const bt = useBilingual("StudioOffice2dCanvas");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<Office2dRuntime | null>(null);
  const storeRef = useRef<Office2dSpriteStore<HTMLImageElement> | null>(null);
  const refreshFloorRef = useRef<(() => void) | null>(null);
  const avatarProfileSourceRef = useRef<ReturnType<typeof createOffice2dAvatarProfileSource> | null>(null);
  const decorAssetsRef = useRef<Office2dDecorAssetLoader | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [schematicMode, setSchematicMode] = useState(false);
  const [claimedSeatId, setClaimedSeatId] = useState<string>(() => readOffice2dClaimedSeatId());
  const [soundMuted, setSoundMuted] = useState<boolean>(() => readOffice2dSoundMuted());
  const [workstationModalOpen, setWorkstationModalOpen] = useState(false);
  const [selectedWorkstationId, setSelectedWorkstationId] = useState<string | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // 오래 사는 키보드·포인터 이펙트가 최신 상태를 읽도록 ref로도 들고 있는다(stale closure 방지).
  const roomIdRef = useRef<string | null>(null);
  roomIdRef.current = roomId;
  const soundMutedRef = useRef(soundMuted);
  soundMutedRef.current = soundMuted;
  const claimedSeatIdRef = useRef(claimedSeatId);
  claimedSeatIdRef.current = claimedSeatId;
  const hq = isToonHqManifest(manifest);

  useEffect(() => {
    if (runtimeRef.current) {
      runtimeRef.current.extensions.schematicMode = schematicMode;
    }
  }, [schematicMode]);

  useEffect(() => {
    writeOffice2dClaimedSeatId(claimedSeatId);
    if (runtimeRef.current) {
      runtimeRef.current.extensions.claimedSeatId = claimedSeatId;
    }
  }, [claimedSeatId]);

  useEffect(() => {
    writeOffice2dSoundMuted(soundMuted);
  }, [soundMuted]);

  /**
   * 내 지정석 동작(SoWork SetMyWorkSpotModal + Gather AssignedDesk). 다른 좌석에 앉아 있으면 그 좌석을 지정석으로 바꾸고,
   * 그 밖에는 지정석으로 걸어가거나(같은 방·가까움) 순간 이동한다(먼 방). 런타임 착석 판정이 도착 후 자동으로 앉힌다.
   */
  const myDeskActionRef = useRef<() => void>(() => undefined);
  myDeskActionRef.current = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const scene = office2dSceneFor(manifest);
    const selfState = rt.debugState();
    const lang = documentLanguage();
    const currentClaim = claimedSeatIdRef.current;
    if (selfState.seatId && selfState.seatId !== currentClaim) {
      setClaimedSeatId(selfState.seatId);
      rt.extensions.pushComicBurst(lang === "en" ? "MY DESK SAVED" : "내 지정석 등록", "#c084fc", selfState.self.x, selfState.self.y - 52);
      playOffice2dSpatialCue("desk-claim", { muted: soundMutedRef.current, roomId: roomIdRef.current });
      bridge.focusWorld();
      return;
    }
    const targetSeat = scene.seats.find((seat) => seat.id === currentClaim) ?? null;
    if (!targetSeat || selfState.seatId === targetSeat.id) {
      bridge.focusWorld();
      return;
    }
    bridge.requestMove(targetSeat.anchor);
    rt.extensions.pushComicBurst(lang === "en" ? "TO MY DESK" : "내 자리로 이동", "#38bdf8", selfState.self.x, selfState.self.y - 52);
    playOffice2dSpatialCue("seat-sit", { muted: soundMutedRef.current, roomId: studioWorldRoomAt(manifest, targetSeat.anchor) });
    bridge.focusWorld();
  };
  const handleMyDeskAction = () => myDeskActionRef.current();

  useEffect(() => {
    const unsubModal = subscribeIllustratedWorkstationModal((stationId) => {
      setSelectedWorkstationId(stationId);
      setWorkstationModalOpen(true);
    });
    const unsubVfx = subscribeIllustrated2dVfxBurst((ev) => {
      const rt = runtimeRef.current;
      if (!rt) return;
      const selfPoint = rt.debugState().self;
      const hex = `#${(ev.color & 0xffffff).toString(16).padStart(6, "0")}`;
      rt.extensions.pushComicBurst(ev.label, hex, ev.worldX ?? selfPoint.x, (ev.worldY ?? selfPoint.y) - 48);
    });
    return () => {
      unsubModal();
      unsubVfx();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;
    const context = canvas.getContext("2d", { alpha: false });
    const emitStatus = (next: "loading" | "ready" | "error") => {
      setStatus(next);
      latest.current.onEngineStatusChange?.(next);
    };
    setFailureReason(null);
    if (!context) {
      setFailureReason(
        documentLanguage() === "en"
          ? "This browser could not initialize a 2D canvas rendering context."
          : "이 브라우저에서 2D 캔버스 그래픽 컨텍스트를 열지 못했습니다.",
      );
      emitStatus("error");
      return undefined;
    }
    emitStatus("loading");
    let disposed = false;
    let frameId = 0;
    const store = new Office2dSpriteStore<HTMLImageElement>(office2dBrowserImageLoader);
    storeRef.current = store;
    const avatarProfileSource = createOffice2dAvatarProfileSource();
    avatarProfileSourceRef.current = avatarProfileSource;
    const host: Office2dRendererHost = {
      selfAvatarProfile: avatarProfileSource.get,
      createSurface(width, height) {
        const surface = document.createElement("canvas");
        surface.width = width;
        surface.height = height;
        const surfaceContext = surface.getContext("2d");
        return surfaceContext ? { canvas: surface, context: surfaceContext } : null;
      },
      image(url): Office2dDrawable | null {
        return store.get(url);
      },
    };
    const callbacks = (): Office2dRuntimeCallbacks => {
      const current = latest.current;
      return {
        onLocalState: current.onLocalState,
        onInteract: current.onInteract,
        onNearbyInteractionChange: (interaction) => {
          current.onNearbyInteractionChange?.(interaction);
          if (!getStudioSpaceSelectedObjectTarget()) {
            bridge.cameraPan.setFocusTarget(
              interaction
                ? {
                    id: interaction.id,
                    labelKo: interaction.labelKo,
                    labelEn: interaction.labelEn,
                    x: interaction.point.x,
                    y: interaction.point.y,
                  }
                : null,
            );
          }
        },
        onPeerSelect: current.onPeerSelect,
        onCancelFollow: current.onCancelFollow,
        onPortal: current.onPortal,
        onZoneChange: (zone: StudioVirtualSpaceZoneChange) => {
          const previousRoomId = roomIdRef.current;
          if (previousRoomId && previousRoomId !== zone.roomId) {
            playOffice2dSpatialCue("room-enter", { muted: soundMutedRef.current, roomId: zone.roomId });
          }
          roomIdRef.current = zone.roomId;
          setRoomId(zone.roomId);
          current.onZoneChange?.(zone);
        },
        onNearbyNpcsChange: current.onNearbyNpcsChange,
        onStuckChange: current.onStuckChange,
        onGhostModeChange: current.onGhostModeChange,
        onNpcInteract: current.onNpcInteract,
        onSelfImpact: current.onSelfImpact,
        onRuntimeMetrics: current.onRuntimeMetrics,
        onObjectStateChange: current.onObjectStateChange,
        onTileEffectTrigger: current.onTileEffectTrigger,
        onGuideTourChange: current.onGuideTourChange,
      };
    };
    const stageProps = (): Office2dStageProps => {
      const current = latest.current;
      return {
        atmosphere: current.atmosphere,
        spaceTheme: current.spaceTheme,
        decorations: current.decorations,
        placedFixtures: current.placedFixtures,
        tileEffects: current.tileEffects,
        waveActorIds: current.waveActorIds,
        guideTourRequest: current.guideTourRequest,
      };
    };
    const runtime = new Office2dRuntime({
      manifest,
      bridge,
      host,
      selfIdentity,
      getSnapshot: () => latest.current.snapshot,
      getSelfName: () => latest.current.selfDisplayName ?? "",
      getSeatedActors: () => latest.current.seatedActors ?? [],
      getCallbacks: callbacks,
      getStageProps: stageProps,
      getLanguage: documentLanguage,
      getReducedMotion: prefersReducedMotion,
      getAvatarCharacter: office2dCharacterForAvatarSkin,
    });
    runtimeRef.current = runtime;

    // 프레임이 떨어지면 캔버스 픽셀 배율을 한 단계씩 낮추고 여유가 생기면 되돌린다(Kumospace 품질 단계와 같은 취지).
    const governor = new Office2dResolutionGovernor(window.devicePixelRatio || 1);
    let pixelRatio = 1;
    const resize = () => {
      const width = Math.max(1, container.clientWidth || window.innerWidth);
      const height = Math.max(1, container.clientHeight || window.innerHeight);
      pixelRatio = Math.max(1, governor.pixelRatio);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      runtime.setViewport(width, height);
      const baseZoom = office2dBaseZoom({ width, height });
      const fitRatio = Math.min(width / Math.max(1, manifest.width), height / Math.max(1, manifest.height)) / Math.max(0.2, baseZoom);
      bridge.userZoom.setFloor(fitRatio);
    };
    resize();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    window.addEventListener("resize", resize);

    bridge.cameraPan.attachZoomStore(bridge.userZoom);
    setActiveMountedCameraPanStore(bridge.cameraPan);
    bridge.cameraPan.setFocusTarget(getStudioSpaceSelectedObjectTarget());
    const unbindSelectedObjectTarget = subscribeStudioSpaceSelectedObjectTarget((target) => {
      bridge.cameraPan.setFocusTarget(target);
    });
    const handleHomeShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isStudioSpaceTextEntryTarget(event.target) || isStudioSpaceTextEntryTarget(document.activeElement)) return;
      if (!studioWorldMayTakeFocus(document.activeElement, container)) return;
      if (event.key === "Home") {
        event.preventDefault();
        bridge.cameraPan.homeView();
      }
    };
    window.addEventListener("keydown", handleHomeShortcut);
    bridge.setFocusHandler(() => canvas.focus({ preventScroll: true }));
    const scene = office2dSceneFor(manifest);
    const heldMoveCodes = new Set<string>();
    let pointerStart: { id: number; pointerType: string; startX: number; startY: number; lastX: number; lastY: number; dragged: boolean; requireButtons: boolean } | null = null;
    const haltMovementForTextInput = () => {
      heldMoveCodes.clear();
      pointerStart = null;
      runtime.releaseKeys();
      if (isStudioSpaceJoystickActive(bridge.getJoystick())) {
        bridge.setJoystick({ x: 0, y: 0 });
      }
      bridge.clearMovement();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const active = document.activeElement;
      if (isStudioSpaceTextEntryTarget(event.target) || isStudioSpaceTextEntryTarget(active)) {
        haltMovementForTextInput();
        return;
      }
      const reclaim = studioWorldShouldReclaimFocus({
        active,
        root: document,
        code: event.code,
        modified: event.altKey || event.ctrlKey || event.metaKey,
        composing: event.isComposing,
        blocked: false,
      });
      if (reclaim) canvas.focus({ preventScroll: true });
      else if (!studioWorldMayTakeFocus(active, container)) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      if (!WORLD_KEY_CODES.has(event.code)) return;
      if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
      heldMoveCodes.add(event.code);
      if (!event.repeat) runtime.keyDown(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      heldMoveCodes.delete(event.code);
      runtime.keyUp(event.code);
    };
    const handleBlur = () => {
      heldMoveCodes.clear();
      pointerStart = null;
      runtime.releaseKeys();
    };
    const unbindTextInputStop = bindStudioSpaceTextEntryMovementStop(haltMovementForTextInput);
    const unbindDeskShortcut = bindOffice2dDeskShortcut(canvas, () => (latest.current.onDeskShortcut ?? myDeskActionRef.current)());
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    const canPanCamera = () => !isStudioSpaceJoystickActive(bridge.getJoystick()) && heldMoveCodes.size === 0;
    const unbindCameraGestures = bindStudioCameraGestures(canvas, {
      zoom: bridge.userZoom,
      pan: bridge.cameraPan,
      canZoom: () => !isStudioSpaceJoystickActive(bridge.getJoystick()),
      canPan: canPanCamera,
      focused: () => studioWorldMayTakeFocus(document.activeElement, container),
      onPinchStart: () => {
        pointerStart = null;
      },
    });
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || bridge.cameraPan.isLooking() || isStudioSpaceJoystickActive(bridge.getJoystick())) return;
      pointerStart = {
        id: event.pointerId,
        pointerType: event.pointerType || "mouse",
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        dragged: false,
        requireButtons: event.buttons > 0,
      };
      canvas.focus({ preventScroll: true });
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerStart || event.pointerId !== pointerStart.id) return;
      if ((pointerStart.requireButtons && event.buttons === 0) || isStudioSpaceJoystickActive(bridge.getJoystick())) {
        pointerStart = null;
        return;
      }
      const totalMoved = Math.hypot(event.clientX - pointerStart.startX, event.clientY - pointerStart.startY);
      if (!pointerStart.dragged && totalMoved > 8) {
        pointerStart.dragged = true;
      }
      // 터치 한 손가락 끌기는 두 손가락 핀치·패닝 및 터치 조이스틱과 충돌하지 않도록 마우스·펜에서만 시점을 끈다.
      if (pointerStart.dragged && pointerStart.pointerType !== "touch" && canPanCamera()) {
        bridge.cameraPan.drag(event.clientX - pointerStart.lastX, event.clientY - pointerStart.lastY);
        pointerStart.lastX = event.clientX;
        pointerStart.lastY = event.clientY;
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerStart || event.pointerId !== pointerStart.id || event.button !== 0) return;
      const dragged = pointerStart.dragged || Math.hypot(event.clientX - pointerStart.startX, event.clientY - pointerStart.startY) > 8;
      pointerStart = null;
      if (dragged) return;
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      if (runtime.extensions.schematicMode) {
        const worldPt = runtime.debugState().screenToWorld(localX, localY);
        const schematicTarget = resolveOffice2dSchematicClickTarget(scene, worldPt);
        if (schematicTarget) {
          bridge.requestMove(schematicTarget.point);
          const lang = documentLanguage();
          runtime.extensions.pushComicBurst(
            lang === "en" ? "WARP TO ZONE" : "평면도 이동",
            "#38bdf8",
            schematicTarget.point.x,
            schematicTarget.point.y - 36,
          );
          playOffice2dSpatialCue("schematic", { muted: soundMutedRef.current, roomId: schematicTarget.roomId });
          return;
        }
      }
      runtime.tap(localX, localY);
    };
    const handlePointerCancel = () => {
      pointerStart = null;
    };
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("lostpointercapture", handlePointerCancel);

    const actorAssets = office2dActorAssetPlan(office2dCharacterForAvatarSkin(latest.current.snapshot.self.avatarIndex, selfIdentity));
    const urls = [
      ...office2dSceneSpriteKeys(scene).map(office2dObjectUrl),
      ...actorAssets.critical,
      ...scene.objects.flatMap((object) => (object.imageUrl ? [object.imageUrl] : [])),
      ...(scene.backgroundUrl ? [scene.backgroundUrl] : []),
    ];
    // 작업 자세 시트(착석 작업·제스처)와 고해상도 룸 배경 원화는 첫 화면 이후 이어 받으며, 도착 시 바닥 캐시를 다시 굽는다.
    const deferredUrls = [
      ...actorAssets.deferred,
      ...office2dBackdropAssetUrls(),
    ];
    let last = performance.now();
    let running = false;
    let ready = false;
    let windowFocused = typeof document.hasFocus === "function" ? document.hasFocus() : true;
    const loop = (time: number) => {
      if (disposed || !running) return;
      frameId = window.requestAnimationFrame(loop);
      const elapsedMs = time - last;
      // 보이지만 초점이 없는 창은 15fps로 낮춰 옆에 띄워 둔 드로잉 앱의 GPU·배터리를 덜 쓴다.
      if (!windowFocused && elapsedMs < BLURRED_FRAME_MS) return;
      last = time;
      const nextRatio = windowFocused ? governor.sample(elapsedMs) : null;
      if (nextRatio !== null) resize();
      if (isStudioSpaceTextEntryTarget(document.activeElement) && (heldMoveCodes.size > 0 || isStudioSpaceJoystickActive(bridge.getJoystick()))) {
        haltMovementForTextInput();
      }
      runtime.frame(elapsedMs / 1000);
      runtime.draw(context, pixelRatio);
    };
    const startLoop = () => {
      if (disposed || running || document.visibilityState === "hidden") return;
      running = true;
      last = performance.now();
      governor.resetWindow();
      frameId = window.requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      running = false;
      window.cancelAnimationFrame(frameId);
    };
    // 탭이 숨겨지면 렌더·물리를 멈추고(SoWork pause 정책), 다시 보이면 이어서 돈다. 키는 숨김 순간 모두 놓는다.
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        heldMoveCodes.clear();
        pointerStart = null;
        runtime.releaseKeys();
        stopLoop();
      } else if (ready) {
        startLoop();
      }
    };
    const handleWindowFocus = () => { windowFocused = true; };
    const handleWindowBlur = () => { windowFocused = false; };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);
    const refreshFloor = () => { if (!disposed) runtime.renderer.invalidateFloor(); };
    refreshFloorRef.current = refreshFloor;
    const decorAssets = createOffice2dDecorAssetLoader(store, ASSET_TIMEOUT_MS, refreshFloor);
    decorAssetsRef.current = decorAssets;
    const bootDeadlineId = window.setTimeout(() => {
      if (disposed || ready) return;
      disposed = true;
      decorAssets.dispose();
      stopLoop();
      setFailureReason(
        documentLanguage() === "en"
          ? "Studio assets took too long to respond and loading was stopped to prevent an infinite wait."
          : "스튜디오 리소스 응답 시간이 초과되어 무한 대기를 막고 입장을 중단했어요.",
      );
      emitStatus("error");
    }, Math.max(250, bootDeadlineMs));
    void Promise.all([
      store.loadAll(urls, ASSET_TIMEOUT_MS, refreshFloor),
      decorAssets.load(latest.current.decorations, latest.current.placedFixtures),
    ]).then(() => {
      window.clearTimeout(bootDeadlineId);
      if (disposed) return;
      runtime.start();
      ready = true;
      emitStatus("ready");
      startLoop();
      void store.loadAll(deferredUrls, ASSET_TIMEOUT_MS * 2, refreshFloor);
    }).catch((error: unknown) => {
      window.clearTimeout(bootDeadlineId);
      if (disposed) return;
      disposed = true;
      decorAssets.dispose();
      stopLoop();
      const detail = error instanceof Error && error.message.trim() ? error.message.trim() : null;
      setFailureReason(
        detail ?? (documentLanguage() === "en"
          ? "Failed to load studio scene assets."
          : "스튜디오 공간 리소스를 불러오지 못했어요."),
      );
      emitStatus("error");
    });

    return () => {
      disposed = true;
      window.clearTimeout(bootDeadlineId);
      decorAssets.dispose();
      if (decorAssetsRef.current === decorAssets) decorAssetsRef.current = null;
      if (storeRef.current === store) storeRef.current = null;
      if (refreshFloorRef.current === refreshFloor) refreshFloorRef.current = null;
      if (avatarProfileSourceRef.current === avatarProfileSource) avatarProfileSourceRef.current = null;
      avatarProfileSource.dispose();
      runtimeRef.current = null;
      stopLoop();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      unbindTextInputStop();
      unbindDeskShortcut();
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      unbindCameraGestures();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("lostpointercapture", handlePointerCancel);
      window.removeEventListener("keydown", handleHomeShortcut);
      unbindSelectedObjectTarget();
      bridge.cameraPan.attachZoomStore(null);
      if (bridge.cameraPan) setActiveMountedCameraPanStore(null);
      bridge.setFocusHandler(null);
    };
  }, [bootDeadlineMs, bridge, manifest, retryCount, selfIdentity]);

  // 꾸미기만 바뀌면 월드·입력·캐릭터 상태를 재생성하지 않고 새로 필요한 이미지만 이어 받는다.
  useEffect(() => {
    void decorAssetsRef.current?.load(props.decorations, props.placedFixtures);
  }, [props.decorations, props.placedFixtures]);

  // 캐릭터 스킨(avatarIndex)이 바뀌면 새 직군 시트의 필수·지연 에셋을 추가로 적재한다.
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    const plan = office2dActorAssetPlan(office2dCharacterForAvatarSkin(props.snapshot.self.avatarIndex, selfIdentity));
    const notify = () => refreshFloorRef.current?.();
    void store.loadAll(plan.critical, ASSET_TIMEOUT_MS, notify).then(() => {
      if (storeRef.current === store) {
        void store.loadAll(plan.deferred, ASSET_TIMEOUT_MS * 2, notify);
      }
    });
  }, [props.snapshot.self.avatarIndex, selfIdentity]);

  useEffect(() => {
    avatarProfileSourceRef.current?.refresh?.();
  }, [props.snapshot.self.appearance]);

  const activeWorkstation =
    (selectedWorkstationId
      ? ILLUSTRATED_2D_WORKSTATIONS.find((s) => s.id === selectedWorkstationId)
      : null) ?? resolveOffice2dWorkstation(roomId);

  return (
    <div ref={containerRef} className="studio-office2d" data-office2d-stage={status} data-office2d-world={hq ? "toon-hq" : "generic"} data-office2d-schematic={schematicMode || undefined}>
      <canvas
        ref={canvasRef}
        className="studio-office2d__canvas"
        tabIndex={0}
        aria-label={bt(
          "웹툰 스튜디오 2D 업무 공간. 방향키나 WASD로 걷고, E 키로 가까운 작업대와 상호작용하고, 클릭한 곳으로 이동해요.",
          "Webtoon studio 2D workspace. Walk with arrow keys or WASD, press E to use a nearby workstation, or click to move.",
        )}
      />
      {status === "loading" ? (
        <p className="studio-office2d__loading" role="status">{bt("스튜디오를 준비하는 중…", "Preparing the studio…")}</p>
      ) : null}
      {status === "error" ? (
        <StudioVirtualSpaceBootRecoveryCard
          failureReason={failureReason}
          onRetry={() => setRetryCount((count) => count + 1)}
        />
      ) : null}
      {hq && status === "ready" ? (
        <StudioOffice2dPipelineRail
          currentRoomId={roomId}
          bridge={bridge}
          schematicMode={schematicMode}
          soundMuted={soundMuted}
          onMyDeskAction={handleMyDeskAction}
          onToggleSchematic={() => {
            playOffice2dSpatialCue("schematic", { muted: soundMuted, roomId });
            setSchematicMode((prev) => !prev);
          }}
          onToggleSound={() => {
            // 켜는 순간 지금 방의 화음을 한 번 들려줘 소리가 켜졌음을 바로 알 수 있게 한다.
            if (soundMuted) playOffice2dSpatialCue("room-enter", { muted: false, roomId });
            setSoundMuted(!soundMuted);
          }}
          onOpenWorkstation={() => {
            setSelectedWorkstationId(null);
            setWorkstationModalOpen(true);
          }}
        />
      ) : null}
      {schematicMode && status === "ready" ? (
        <div
          className="studio-office2d-schematic-banner"
          data-testid="office2d-schematic-banner"
          data-space-interactive="true"
        >
          <span>
            {bt(
              "평면도 오버뷰 · 방이나 좌석 마커를 클릭하면 그곳으로 이동합니다",
              "Schematic Overview · Click any room or seat marker to move there",
            )}
          </span>
          <button
            type="button"
            className="studio-office2d-schematic-banner__close"
            onClick={() => setSchematicMode(false)}
          >
            {bt("닫기", "Close")}
          </button>
        </div>
      ) : null}
      {workstationModalOpen && activeWorkstation ? (
        <StudioVirtualSpaceWorkstationLiveModal
          station={activeWorkstation}
          onClose={() => {
            setWorkstationModalOpen(false);
            bridge.focusWorld();
          }}
          onSelectStation={(stationId) => setSelectedWorkstationId(stationId)}
        />
      ) : null}
    </div>
  );
}
