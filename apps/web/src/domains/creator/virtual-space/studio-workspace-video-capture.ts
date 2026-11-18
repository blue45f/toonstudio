import type { StudioBotRecordingQuality } from "./studio-virtual-space-bot-recording";

import { requestWorkspaceVideoFrame } from "./studio-workspace-video-frame";

const PROFILES = {
  low: { fps: 15, bitrate: 1_500_000 },
  medium: { fps: 24, bitrate: 4_000_000 },
  high: { fps: 30, bitrate: 8_000_000 },
};

export interface WorkspaceVideoCapture {
  pause(): void;
  resume(): void;
  stop(): void;
  discard(): void;
}

export type WorkspaceVideoSource = "canvas" | "display";

export async function startWorkspaceVideoCapture(
  source: WorkspaceVideoSource,
  canvas: HTMLCanvasElement | null,
  quality: StudioBotRecordingQuality,
  onFinish: (video: Blob | null) => void,
): Promise<WorkspaceVideoCapture> {
  if (typeof MediaRecorder !== "function") throw new Error("unsupported");
  const { fps, bitrate } = PROFILES[quality];
  let stream: MediaStream;
  if (source === "canvas") {
    if (!canvas?.captureStream || !canvas.width || !canvas.height) throw new Error("no-canvas");
    stream = canvas.captureStream(fps);
  } else {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("unsupported");
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: true });
  }
  const tracks = stream.getTracks();
  let recorder: MediaRecorder;
  try {
    if (!stream.getVideoTracks().some(track => track.readyState === "live")) throw new Error("no-video");
    const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
      .find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), videoBitsPerSecond: bitrate });
  } catch (error) {
    tracks.forEach(track => track.stop());
    throw error;
  }
  const chunks: Blob[] = [];
  let bytes = 0;
  let closed = false;
  let frameTimer: ReturnType<typeof setInterval> | undefined;
  function stopFrames() {
    clearInterval(frameTimer);
    frameTimer = undefined;
  }
  function startFrames() {
    if (source !== "canvas" || !canvas || frameTimer !== undefined) return;
    // 내용이 같은 동안에도 MediaRecorder가 경과 시간을 인코딩하도록 캔버스를 가끔 다시 그린다.
    // 사용자가 조작할 때는 렌더러가 자체 주기로 그린 프레임을 그대로 캡처한다.
    requestWorkspaceVideoFrame(canvas);
    frameTimer = setInterval(() => requestWorkspaceVideoFrame(canvas), 100);
  }
  function stop() {
    stopFrames();
    if (recorder.state !== "inactive") recorder.stop();
  }
  function finish(save: boolean) {
    if (closed) return;
    closed = true;
    stopFrames();
    tracks.forEach(track => { track.removeEventListener("ended", stop); track.stop(); });
    if (save) onFinish(bytes > 0 ? new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type }) : null);
    chunks.length = 0;
  }
  recorder.ondataavailable = ({ data }) => {
    if (closed || !data.size) return;
    chunks.push(data);
    bytes += data.size;
    // 한 회차가 메모리 한도에 닿으면 마지막 청크까지 저장한다.
    if (bytes >= 128 * 1024 * 1024) stop();
  };
  recorder.onerror = () => {
    if (closed) return;
    stop();
    finish(false);
    onFinish(null);
  };
  recorder.onstop = () => finish(true);
  for (const track of stream.getVideoTracks()) track.addEventListener("ended", stop);
  try { recorder.start(1000); startFrames(); } catch (error) { finish(false); throw error; }
  return {
    pause: () => {
      if (recorder.state !== "recording") return;
      recorder.pause();
      stopFrames();
    },
    resume: () => {
      if (recorder.state !== "paused") return;
      recorder.resume();
      startFrames();
    },
    stop,
    discard: () => { stop(); finish(false); },
  };
}
