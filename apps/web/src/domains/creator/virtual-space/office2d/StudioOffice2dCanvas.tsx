import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { bindStudioCameraGestures } from "../studio-virtual-space-camera-pan";
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
import { StudioVirtualSpaceWorkstationLiveModal } from "../StudioVirtualSpaceWorkstationLiveModal";
import { office2dCharacterForAvatarSkin } from "./office2d-avatar-role";
import { createOffice2dAvatarProfileSource } from "./office2d-avatar-appearance";
import {
  office2dBackdropAssetUrls,
  resolveOffice2dSchematicClickTarget,
  resolveOffice2dWorkstation,
} from "./office2d-backdrop-art";
import { office2dBaseZoom } from "./office2d-camera";
import { createOffice2dDecorAssetLoader, type Office2dDecorAssetLoader } from "./office2d-decor-assets";
import { Office2dResolutionGovernor } from "./office2d-quality";
import { office2dSceneFor, office2dSceneSpriteKeys } from "./office2d-scene";
import { Office2dRuntime, type Office2dRuntimeCallbacks, type Office2dStageProps } from "./office2d-runtime";
import {
  findOffice2dQuickEmote,
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
/** 창이 초점을 잃었지만 보이는 동안(옆 모니터에 띄워 둔 경우)의 프레임 간격. SoWork의 unfocused 12~15fps 정책을 따른다. */
const BLURRED_FRAME_MS = 1000 / 15;
const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

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
export function StudioOffice2dCanvas(props: StudioVirtualSpacePhaserCanvasProps) {
  const { manifest, bridge, selfIdentity = "local" } = props;
  const bt = useBilingual("StudioOffice2dCanvas");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<Office2dRuntime | null>(null);
  const decorAssetsRef = useRef<Office2dDecorAssetLoader | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
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
      rt.extensions.pushComicBurst(lang === "en" ? "📌 MY DESK SAVED!" : "📌 내 지정석 등록!", "#c084fc", selfState.self.x, selfState.self.y - 52);
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
    rt.extensions.pushComicBurst(lang === "en" ? "🚀 TO MY DESK!" : "🚀 내 자리로!", "#38bdf8", selfState.self.x, selfState.self.y - 52);
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
    if (!context) {
      emitStatus("error");
      return undefined;
    }
    emitStatus("loading");
    let disposed = false;
    let frameId = 0;
    const store = new Office2dSpriteStore<HTMLImageElement>(office2dBrowserImageLoader);
    const avatarProfileSource = createOffice2dAvatarProfileSource();
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
        onNearbyInteractionChange: current.onNearbyInteractionChange,
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

    bridge.setFocusHandler(() => canvas.focus({ preventScroll: true }));
    const scene = office2dSceneFor(manifest);
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
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
      // 1~6: 이모트 전송은 페이지 이모트 키맵이 맡고, 여기서는 웹툰 의성어 팝업과 짧은 효과음만 덧붙인다(WA EmoteStore 즐겨찾기 슬롯).
      const quickEmote = findOffice2dQuickEmote(event.code);
      if (quickEmote && !event.repeat) {
        const selfPt = runtime.debugState().self;
        runtime.extensions.pushComicBurst(documentLanguage() === "en" ? quickEmote.sfxEn : quickEmote.sfxKo, quickEmote.color, selfPt.x, selfPt.y - 48);
        playOffice2dSpatialCue("emote", { muted: soundMutedRef.current, roomId: roomIdRef.current });
        return;
      }
      if (event.code === "KeyH" && !event.repeat) {
        myDeskActionRef.current();
        return;
      }
      if (!WORLD_KEY_CODES.has(event.code)) return;
      if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
      if (!event.repeat) runtime.keyDown(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => runtime.keyUp(event.code);
    const handleBlur = () => runtime.releaseKeys();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    let pointerStart: { id: number; startX: number; startY: number; lastX: number; lastY: number; dragged: boolean } | null = null;
    const unbindCameraGestures = bindStudioCameraGestures(canvas, {
      zoom: bridge.userZoom,
      pan: bridge.cameraPan,
      canZoom: () => true,
      canPan: () => true,
      focused: () => studioWorldMayTakeFocus(document.activeElement, container),
      onPinchStart: () => {
        pointerStart = null;
      },
    });
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || bridge.cameraPan.isLooking()) return;
      pointerStart = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        dragged: false,
      };
      canvas.focus({ preventScroll: true });
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerStart || event.pointerId !== pointerStart.id) return;
      const totalMoved = Math.hypot(event.clientX - pointerStart.startX, event.clientY - pointerStart.startY);
      if (!pointerStart.dragged && totalMoved > 8) {
        pointerStart.dragged = true;
      }
      if (pointerStart.dragged) {
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
            lang === "en" ? "🗺️ WARP TO ZONE!" : "🗺️ 평면도 이동!",
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
    const decorAssets = createOffice2dDecorAssetLoader(store, ASSET_TIMEOUT_MS, refreshFloor);
    decorAssetsRef.current = decorAssets;
    void Promise.all([
      store.loadAll(urls, ASSET_TIMEOUT_MS, refreshFloor),
      decorAssets.load(latest.current.decorations, latest.current.placedFixtures),
    ]).then(() => {
      if (disposed) return;
      runtime.start();
      ready = true;
      emitStatus("ready");
      startLoop();
      void store.loadAll(deferredUrls, ASSET_TIMEOUT_MS * 2, refreshFloor);
    });

    return () => {
      disposed = true;
      decorAssets.dispose();
      if (decorAssetsRef.current === decorAssets) decorAssetsRef.current = null;
      avatarProfileSource.dispose();
      runtimeRef.current = null;
      stopLoop();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      unbindCameraGestures();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      bridge.setFocusHandler(null);
    };
  }, [bridge, manifest, selfIdentity]);

  // 꾸미기만 바뀌면 월드·입력·캐릭터 상태를 재생성하지 않고 새로 필요한 이미지만 이어 받는다.
  useEffect(() => {
    void decorAssetsRef.current?.load(props.decorations, props.placedFixtures);
  }, [props.decorations, props.placedFixtures]);

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
        <p className="studio-office2d__loading" role="alert">{bt("이 브라우저에서 2D 화면을 그릴 수 없어요. 새로고침하거나 다른 브라우저를 써 주세요.", "This browser cannot draw the 2D view. Reload or try another browser.")}</p>
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
              "🗺️ 평면도 오버뷰 · 방이나 좌석 마커를 클릭하면 그곳으로 이동합니다",
              "🗺️ Schematic Overview · Click any room or seat marker to move there",
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
