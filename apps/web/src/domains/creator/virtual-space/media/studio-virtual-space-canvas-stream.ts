import { useCallback, useEffect, useRef, useState } from "react";

export const STUDIO_LIVE_CANVAS_THEATER_CHANNEL = "toonstudio:live-canvas-theater:v1";

export interface LiveCanvasTheaterFrameMessage {
  readonly kind: "canvas-frame";
  readonly projectId: string;
  readonly dataUrl: string;
  readonly label: string;
  readonly updatedAt: number;
}

export interface StudioLiveTheaterFeed {
  readonly stream: MediaStream | null;
  readonly source: "none" | "screen" | "canvas" | "remote-peer";
  readonly label: string | null;
  readonly startLocalCanvasStream: (canvas?: HTMLCanvasElement | null, fps?: number) => boolean;
  readonly stopLocalCanvasStream: () => void;
}

/**
 * Captures a ToonStudio 2D drawing canvas via `canvas.captureStream(30)` (or falls back
 * to the active WebRTC screen-share MediaStream) so Virtual Studio can project live art
 * directly onto the 3D Review Theater wall screen and the 2D focus theater view.
 */
export function captureCanvasToTheaterStream(
  canvas: HTMLCanvasElement,
  fps = 30,
): MediaStream | null {
  const captureFn = (canvas as HTMLCanvasElement & { captureStream?: (rate?: number) => MediaStream }).captureStream;
  if (typeof captureFn !== "function") return null;
  try {
    return captureFn.call(canvas, Math.max(10, Math.min(60, Math.round(fps))));
  } catch {
    return null;
  }
}

/**
 * Resolves the active live screen feed for the 3D wall monitor / 2D theater modal.
 * Priority: explicit local 2D canvas capture > local screen share > remote peer screen share.
 */
export function useStudioLiveCanvasTheaterFeed(input: {
  readonly projectId: string;
  readonly localScreenStream: MediaStream | null;
  readonly localSharing: boolean;
  readonly remoteScreenStream: MediaStream | null;
  readonly remotePresenterName: string | null;
}): StudioLiveTheaterFeed {
  const [canvasStream, setCanvasStream] = useState<MediaStream | null>(null);
  const [canvasLabel, setCanvasLabel] = useState<string | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const mirrorCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopLocalCanvasStream = useCallback(() => {
    const active = canvasStreamRef.current;
    canvasStreamRef.current = null;
    if (active) {
      active.getTracks().forEach((track) => track.stop());
    }
    setCanvasStream(null);
    setCanvasLabel(null);
  }, []);

  const startLocalCanvasStream = useCallback((explicitCanvas?: HTMLCanvasElement | null, fps = 30): boolean => {
    const candidate = explicitCanvas
      ?? (typeof document !== "undefined"
        ? document.querySelector<HTMLCanvasElement>('[data-studio-drawing-canvas="true"], canvas.studio-drawing-canvas, canvas')
        : null);
    if (!candidate) return false;
    const stream = captureCanvasToTheaterStream(candidate, fps);
    if (!stream) return false;
    stopLocalCanvasStream();
    canvasStreamRef.current = stream;
    setCanvasStream(stream);
    setCanvasLabel("ToonStudio 2D 캔버스 라이브");
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      videoTrack.onended = () => {
        if (canvasStreamRef.current === stream) stopLocalCanvasStream();
      };
    }
    return true;
  }, [stopLocalCanvasStream]);

  // Listen for live frames broadcast from an open ToonStudio 2D canvas tab.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined" || typeof document === "undefined") return undefined;
    const channel = new BroadcastChannel(STUDIO_LIVE_CANVAS_THEATER_CHANNEL);
    const onMessage = (event: MessageEvent<unknown>) => {
      const msg = event.data as Partial<LiveCanvasTheaterFrameMessage> | null;
      if (!msg || msg.kind !== "canvas-frame" || msg.projectId !== input.projectId || typeof msg.dataUrl !== "string") return;
      if (!msg.dataUrl.startsWith("data:image/")) return;
      let mirror = mirrorCanvasRef.current;
      if (!mirror) {
        mirror = document.createElement("canvas");
        mirror.width = 1280;
        mirror.height = 720;
        mirrorCanvasRef.current = mirror;
      }
      const ctx = mirror.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, mirror!.width, mirror!.height);
        ctx.drawImage(img, 0, 0, mirror!.width, mirror!.height);
        if (!canvasStreamRef.current) {
          const stream = captureCanvasToTheaterStream(mirror!, 30);
          if (stream) {
            canvasStreamRef.current = stream;
            setCanvasStream(stream);
            setCanvasLabel(msg.label || "실시간 원고 캔버스");
          }
        }
      };
      img.src = msg.dataUrl;
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [input.projectId]);

  useEffect(() => stopLocalCanvasStream, [stopLocalCanvasStream]);

  if (canvasStream) {
    return {
      stream: canvasStream,
      source: "canvas",
      label: canvasLabel ?? "ToonStudio 2D 캔버스 라이브",
      startLocalCanvasStream,
      stopLocalCanvasStream,
    };
  }
  if (input.localSharing && input.localScreenStream) {
    return {
      stream: input.localScreenStream,
      source: "screen",
      label: "내 화면 공유",
      startLocalCanvasStream,
      stopLocalCanvasStream,
    };
  }
  if (input.remoteScreenStream) {
    return {
      stream: input.remoteScreenStream,
      source: "remote-peer",
      label: input.remotePresenterName ? `${input.remotePresenterName} 화면` : "팀원 공유 화면",
      startLocalCanvasStream,
      stopLocalCanvasStream,
    };
  }
  return {
    stream: null,
    source: "none",
    label: null,
    startLocalCanvasStream,
    stopLocalCanvasStream,
  };
}
