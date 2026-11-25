// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ASPECT_SAFE_ZONE_PROFILES, buildBpmBeatGrid, DEFAULT_MOVINGTOON_SCENES,
  evaluateParallaxFrame, evaluateParallaxSequence, generateBgmSidechainDuckingCurve,
  generateSubtitleTracks, StudioMovingtoonReelsPanel, validateSafeZoneLayout,
  type EvaluatedParallaxFrame, type MovingtoonCutScene, type StudioMovingtoonReelsPanelProps,
} from "./index";

const SCENE = DEFAULT_MOVINGTOON_SCENES[1];
if (!SCENE) throw new Error("예제 장면 누락");
const FRAME_OPTIONS = { presetId: "ken-burns-drift", frameIndex: 90, fps: 60, aspectTarget: "reels-9x16" } as const;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("무빙툰 수치 예제·자막 문자열의 경계", () => {
  it("비유한 BPM·길이·시작점과 표본 예산 초과를 반복문 전에 거부한다", () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(() => buildBpmBeatGrid({ bpm: invalid, durationSec: 5 })).toThrow();
      expect(() => buildBpmBeatGrid({ bpm: 120, durationSec: invalid })).toThrow();
      expect(() => buildBpmBeatGrid({ bpm: 120, durationSec: 5, offsetSec: invalid })).toThrow();
      expect(() => generateBgmSidechainDuckingCurve({ durationSec: invalid, triggers: [] })).toThrow();
    }
    expect(() => buildBpmBeatGrid({ bpm: 120, durationSec: 1e9 })).toThrow(/표본 수/);
    expect(() => generateBgmSidechainDuckingCurve({ durationSec: 1e9, triggers: [] })).toThrow(/표본 수/);
    expect(() => generateBgmSidechainDuckingCurve({ durationSec: 5, sampleStepMs: NaN, triggers: [] })).toThrow();
    expect(buildBpmBeatGrid({ bpm: 120, durationSec: 1 }).markers.map((marker) => marker.timeSec)).toEqual([0, 0.5, 1]);
  });

  it("회전 후 네 모서리 모두가 투영 경계 안에 들어간다", () => {
    const scene: MovingtoonCutScene = { ...SCENE, layers: SCENE.layers.map((layer) => layer.planeId === "character" ? { ...layer, safeAnchorLocked: false, normalizedBounds: { x: 0.4, y: 0.3, width: 0.1, height: 0.3 } } : layer) };
    const frame = evaluateParallaxFrame(scene, { ...FRAME_OPTIONS, presetId: "action-impact-shake", frameIndex: 80 });
    const plane = frame.planes.find((item) => item.planeId === "character");
    if (!plane) throw new Error("주요 인물 평면 누락");
    expect(Math.abs(plane.rotationDeg)).toBeGreaterThan(0);
    const width = frame.viewportWidthPx * 0.1;
    const height = frame.viewportHeightPx * 0.3;
    const cx = frame.viewportWidthPx * 0.45 + plane.translateXpx;
    const cy = frame.viewportHeightPx * 0.45 + plane.translateYpx;
    const angle = plane.rotationDeg * Math.PI / 180;
    for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) {
      const px = cx + plane.scale * (x * Math.cos(angle) - y * Math.sin(angle));
      const py = cy + plane.scale * (x * Math.sin(angle) + y * Math.cos(angle));
      expect(px).toBeGreaterThanOrEqual(plane.projectedBounds.x - 0.03);
      expect(px).toBeLessThanOrEqual(plane.projectedBounds.x + plane.projectedBounds.width + 0.03);
      expect(py).toBeGreaterThanOrEqual(plane.projectedBounds.y - 0.03);
      expect(py).toBeLessThanOrEqual(plane.projectedBounds.y + plane.projectedBounds.height + 0.03);
    }
    expect(plane.projectedBounds.width).toBeGreaterThan(width * plane.scale);
  });

  it("완전히 화면 밖인 주요 요소를 hazard 겹침 0으로 통과시키지 않는다", () => {
    const scene: MovingtoonCutScene = { ...SCENE, layers: SCENE.layers.map((layer) => layer.planeId === "speech-balloon" ? { ...layer, safeAnchorLocked: true, normalizedBounds: { x: 2, y: 2, width: 0.1, height: 0.1 } } : layer) };
    const frame = evaluateParallaxFrame(scene, FRAME_OPTIONS);
    expect(frame.safeZone.passed).toBe(false);
    const outside = frame.safeZone.issues.find((issue) => issue.hazardId === "viewport-outside");
    expect(outside?.severity).toBe("critical");
    expect(outside?.overlapRatio).toBe(1);
    expect(frame.safeZone.totalOverlapAreaPx2).toBeGreaterThan(0);
    expect(() => validateSafeZoneLayout(frame.planes.map((plane) => plane.safeZoneCritical ? { ...plane, projectedBounds: { ...plane.projectedBounds, x: NaN } } : plane), "reels-9x16")).toThrow(/유한/);
  });

  it("표본 검사 API의 NaN·무한 표본 수가 빈 성공을 만들지 않는다", () => {
    for (const sampleCount of [NaN, Infinity, 0, 1.5]) expect(() => evaluateParallaxSequence(SCENE, { ...FRAME_OPTIONS, sampleCount })).toThrow();
    const audit = evaluateParallaxSequence(SCENE, { ...FRAME_OPTIONS, sampleCount: 3 });
    expect(audit.sampledFrameCount).toBe(3);
    expect(audit.frames).toHaveLength(3);
    expect(audit.totalFrames).toBeGreaterThan(audit.sampledFrameCount);
    expect(evaluateParallaxSequence(SCENE, { ...FRAME_OPTIONS, sampleCount: 1 }).sampledFrameCount).toBe(1);
  });

  it("시퀀스의 잘못되거나 누락된 FPS를 빈 통과 결과로 처리하지 않는다", () => {
    for (const fps of [NaN, undefined, Infinity, 0, 24]) {
      // 타입이 없는 JS 호출에서도 누락되거나 비유한 FPS를 거부한다.
      expect(() => Reflect.apply(evaluateParallaxSequence, undefined, [SCENE, { ...FRAME_OPTIONS, fps }])).toThrow(/FPS/);
    }
    for (const fps of [30, 60] as const) {
      const audit = evaluateParallaxSequence(SCENE, { ...FRAME_OPTIONS, fps, sampleCount: 3 });
      expect(audit.frames).toHaveLength(3);
      expect(audit.frames.every((frame) => frame.fps === fps)).toBe(true);
    }
  });

  it.each([
    { id: "cue", text: "앞\n\n뒤" },
    { id: "cue\ninjected", text: "원문" },
    { id: "NOTE", text: "원문" },
    { id: "cue", text: "<b>원문</b>" },
  ])("지원하지 않는 자막 블록은 원문을 유지하고 형식 성공·출력 문자열을 만들지 않는다: %j", (input) => {
    const cues = [{ ...input, startSec: 0, endSec: 5 }];
    const before = JSON.stringify(cues);
    const result = generateSubtitleTracks(cues);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues.some((issue) => issue.kind === "unsupported-content")).toBe(true);
    expect(result.vttTimecodeFormatValid).toBe(false);
    expect(result.srtTimecodeFormatValid).toBe(false);
    expect(result.vttContent).toBe("");
    expect(result.srtContent).toBe("");
    expect(JSON.stringify(cues)).toBe(before);
  });

  it("안전한 다중행 대사 공백과 입력 시간을 보존하고 잘못된 헤더·밀리초 범위는 거부한다", () => {
    const text = "  원문\n둘째 줄  ";
    const result = generateSubtitleTracks([{ id: "cue", startSec: 0, endSec: 5, text }]);
    expect(result.validation.valid).toBe(true);
    expect(result.vttContent).toContain(`\n${text}\n`);
    expect(result.srtContent).toContain(`\n${text}\n`);
    expect(generateSubtitleTracks([{ id: "crlf", startSec: 0, endSec: 5, text: "첫 줄\r\n둘째 줄" }]).validation.valid).toBe(true);
    const source = [{ id: "cue", startSec: 0, endSec: 5, text: "원문" }];
    expect(generateSubtitleTracks(source, { title: "제목\n\n가짜 블록" }).validation.valid).toBe(false);
    expect(generateSubtitleTracks([{ ...source[0], id: "cue", text: "원문", startSec: 1, endSec: 1.0001 }]).validation.valid).toBe(false);
  });

  it("기본 UI의 자막 확인은 다운로드·미디어 출고 완료로 표시하지 않는다", () => {
    render(<StudioMovingtoonReelsPanel locale="ko" initialTab="audio-subtitles" />);
    expect(screen.getByTestId("movingtoon-reels-studio-panel").textContent).toContain("MP4 인코딩·송신·영구 저장·파일 다운로드에 연결되지 않습니다");
    fireEvent.click(screen.getByTestId("btn-export-subtitles"));
    expect(screen.getByTestId("subtitle-export-status").textContent).toContain("문자열 생성됨");
    expect(screen.getByTestId("subtitle-export-status").textContent).toContain("다운로드는 수행하지 않습니다");
    expect(screen.queryByTestId("example-callback-status")).toBeNull();
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("자막 알림 대기·거절·재시도는 같은 결과로 처리하며 출고 성공을 표시하지 않는다", async () => {
    let rejectPending: (reason: Error) => void = () => { throw new Error("대기 Promise 누락"); };
    const pending = new Promise<void>((_resolve, reject) => { rejectPending = reject; });
    const onExport = vi.fn<NonNullable<StudioMovingtoonReelsPanelProps["onExportSubtitles"]>>().mockImplementationOnce(() => pending).mockResolvedValueOnce(undefined);
    render(<StudioMovingtoonReelsPanel locale="ko" initialTab="audio-subtitles" onExportSubtitles={onExport} />);
    fireEvent.click(screen.getByTestId("btn-export-subtitles"));
    const payload = onExport.mock.calls[0]?.[0];
    expect(screen.getByTestId("example-callback-status").textContent).toContain("응답 대기");
    fireEvent.click(screen.getByTestId("btn-export-subtitles"));
    expect(onExport).toHaveBeenCalledTimes(1);
    await act(async () => { rejectPending(new Error("연결 수신 실패")); });
    expect(screen.getByRole("alert").textContent).toContain("연결 수신 실패");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" })); });
    expect(onExport).toHaveBeenCalledTimes(2);
    expect(onExport.mock.calls[1]?.[0]).toEqual(payload);
    expect(screen.getByTestId("example-callback-status").textContent).toContain("완료를 뜻하지 않습니다");
  });

  it("프레임 알림의 동기 실패 후 재시도해도 위치 보정을 반복하지 않는다", () => {
    const onFrame = vi.fn<(frame: EvaluatedParallaxFrame) => void | Promise<void>>().mockImplementationOnce(() => { throw new Error("프레임 수신 실패"); }).mockImplementationOnce(() => undefined);
    render(<StudioMovingtoonReelsPanel locale="ko" onParallaxEvaluated={onFrame} />);
    fireEvent.click(screen.getByTestId("btn-autofit-safezone"));
    const frame = onFrame.mock.calls[0]?.[0];
    expect(screen.getByRole("alert").textContent).toContain("프레임 수신 실패");
    fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" }));
    expect(onFrame.mock.calls[1]?.[0]).toBe(frame);
    expect(frame?.viewportWidthPx).toBe(ASPECT_SAFE_ZONE_PROFILES["reels-9x16"].widthPx);
  });
});
