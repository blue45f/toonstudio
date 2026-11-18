// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startWorkspaceVideoCapture } from "./studio-workspace-video-capture";
import { bindWorkspaceVideoFrame } from "./studio-workspace-video-frame";

class TestRecorder {
  static isTypeSupported() { return true; }
  state: RecordingState = "inactive";
  onstop?: () => void;
  onerror?: () => void;
  constructor() { recorders.push(this); }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() { this.state = "inactive"; Promise.resolve().then(() => this.onstop?.()); }
}
const recorders: TestRecorder[] = [];
beforeEach(() => { recorders.length = 0; vi.useFakeTimers(); vi.stubGlobal("MediaRecorder", TestRecorder); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  const track = Object.assign(new EventTarget(), { readyState: "live", stop: vi.fn() });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const canvas = Object.assign(document.createElement("canvas"), { captureStream: () => stream });
  const repaint = vi.fn(), finished = vi.fn();
  bindWorkspaceVideoFrame(canvas, repaint);
  return { canvas, repaint, finished, track, stream };
}

describe("녹화할 때만 정지 화면을 다시 그린다", () => {
  it("일시정지하면 멈추고 재개·정지 시각까지 프레임을 기록한다", async () => {
    const f = setup();
    const recording = await startWorkspaceVideoCapture("canvas", f.canvas, "medium", f.finished);
    expect(f.repaint).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(f.repaint).toHaveBeenCalledTimes(4);
    recording.pause(); vi.advanceTimersByTime(300);
    expect(f.repaint).toHaveBeenCalledTimes(4);
    recording.resume(); recording.resume(); vi.advanceTimersByTime(300);
    expect(f.repaint).toHaveBeenCalledTimes(8);
    recording.stop(); await Promise.resolve(); vi.advanceTimersByTime(300);
    expect(f.repaint).toHaveBeenCalledTimes(8);
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.finished).toHaveBeenCalledOnce();
  });

  it("같은 캔버스의 렌더러 교체 뒤에는 이전 렌더러를 호출하지 않는다", async () => {
    const f = setup(), previous = vi.fn(), next = vi.fn();
    const unbindPrevious = bindWorkspaceVideoFrame(f.canvas, previous);
    const recording = await startWorkspaceVideoCapture("canvas", f.canvas, "medium", f.finished);
    const unbindNext = bindWorkspaceVideoFrame(f.canvas, next);
    unbindPrevious(); vi.advanceTimersByTime(300);
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledTimes(3);
    unbindNext(); vi.advanceTimersByTime(300);
    expect(next).toHaveBeenCalledTimes(3);
    recording.discard();
  });

  it.each(["discard", "ended", "error"])("%s 이후 예약 프레임과 미디어 트랙을 해제한다", async reason => {
    const f = setup();
    const recording = await startWorkspaceVideoCapture("canvas", f.canvas, "low", f.finished);
    if (reason === "discard") recording.discard();
    else if (reason === "ended") f.track.dispatchEvent(new Event("ended"));
    else recorders[0]?.onerror?.();
    await Promise.resolve(); vi.advanceTimersByTime(500);
    expect(f.repaint).toHaveBeenCalledOnce();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.finished).toHaveBeenCalledTimes(reason === "discard" ? 0 : 1);
  });

  it("사용자가 공유한 탭·창은 브라우저 자체 프레임을 기록한다", async () => {
    const f = setup();
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: async () => f.stream } });
    const recording = await startWorkspaceVideoCapture("display", f.canvas, "high", f.finished);
    vi.advanceTimersByTime(500);
    expect(f.repaint).not.toHaveBeenCalled();
    recording.stop(); await Promise.resolve();
    expect(f.track.stop).toHaveBeenCalledOnce();
  });
});
