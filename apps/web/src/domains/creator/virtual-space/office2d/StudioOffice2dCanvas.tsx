import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualSpaceZoneChange } from "../studio-virtual-space-engine-events";
import {
  studioWorldMayTakeFocus,
  studioWorldShouldReclaimFocus,
  WORLD_KEY_CODES,
  type StudioVirtualSpacePhaserCanvasProps,
} from "../studio-virtual-space-phaser-canvas-model";
import { isToonHqManifest } from "./hq/toon-hq-manifest";
import { office2dSceneFor, office2dSceneSpriteKeys } from "./office2d-scene";
import { Office2dRuntime, type Office2dRuntimeCallbacks } from "./office2d-runtime";
import type { Office2dDrawable, Office2dRendererHost } from "./office2d-renderer";
import {
  OFFICE2D_CHARACTERS,
  Office2dSpriteStore,
  office2dBrowserImageLoader,
  office2dCharacterUrl,
  office2dObjectUrl,
} from "./office2d-sprite-catalog";
import { StudioOffice2dPipelineRail } from "./StudioOffice2dPipelineRail";
import "./studio-office2d.css";

const ASSET_TIMEOUT_MS = 6_000;
const MAX_PIXEL_RATIO = 2;
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
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [roomId, setRoomId] = useState<string | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const hq = isToonHqManifest(manifest);

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
    const host: Office2dRendererHost = {
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
          setRoomId(zone.roomId);
          current.onZoneChange?.(zone);
        },
        onNearbyNpcsChange: current.onNearbyNpcsChange,
        onStuckChange: current.onStuckChange,
        onGhostModeChange: current.onGhostModeChange,
        onNpcInteract: current.onNpcInteract,
        onSelfImpact: current.onSelfImpact,
        onRuntimeMetrics: current.onRuntimeMetrics,
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
      getLanguage: documentLanguage,
      getReducedMotion: prefersReducedMotion,
    });

    let pixelRatio = 1;
    const resize = () => {
      const width = Math.max(1, container.clientWidth || window.innerWidth);
      const height = Math.max(1, container.clientHeight || window.innerHeight);
      pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      runtime.setViewport(width, height);
    };
    resize();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    window.addEventListener("resize", resize);

    bridge.setFocusHandler(() => canvas.focus({ preventScroll: true }));
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
      if (!WORLD_KEY_CODES.has(event.code)) return;
      if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
      if (!event.repeat) runtime.keyDown(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => runtime.keyUp(event.code);
    const handleBlur = () => runtime.releaseKeys();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    let pointerStart: { x: number; y: number } | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerStart = { x: event.clientX, y: event.clientY };
      canvas.focus({ preventScroll: true });
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerStart || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      pointerStart = null;
      if (moved > 8) return;
      const rect = canvas.getBoundingClientRect();
      runtime.tap(event.clientX - rect.left, event.clientY - rect.top);
    };
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      runtime.wheel(event.deltaY);
    };
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    const scene = office2dSceneFor(manifest);
    const urls = [
      ...office2dSceneSpriteKeys(scene).map(office2dObjectUrl),
      ...OFFICE2D_CHARACTERS.map(office2dCharacterUrl),
      ...scene.objects.flatMap((object) => (object.imageUrl ? [object.imageUrl] : [])),
      ...(scene.backgroundUrl ? [scene.backgroundUrl] : []),
    ];
    let last = performance.now();
    const loop = (time: number) => {
      if (disposed) return;
      frameId = window.requestAnimationFrame(loop);
      const delta = (time - last) / 1000;
      last = time;
      runtime.frame(delta);
      runtime.draw(context, pixelRatio);
    };
    void store.loadAll(urls, ASSET_TIMEOUT_MS).then(() => {
      if (disposed) return;
      runtime.start();
      emitStatus("ready");
      last = performance.now();
      frameId = window.requestAnimationFrame(loop);
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      bridge.setFocusHandler(null);
    };
  }, [bridge, manifest, selfIdentity]);

  return (
    <div ref={containerRef} className="studio-office2d" data-office2d-stage={status} data-office2d-world={hq ? "toon-hq" : "generic"}>
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
      {hq && status === "ready" ? <StudioOffice2dPipelineRail currentRoomId={roomId} bridge={bridge} /> : null}
    </div>
  );
}
