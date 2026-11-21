import { describe, expect, it, vi } from "vitest";

import {
  addReferenceRedlineAnnotation,
  advanceGifPlaybackByMs,
  clearGifLoopRange,
  computeClickThroughCssProjection,
  createDefaultClickThroughState,
  createReferenceGifStepper,
  createReferenceProOverlayDocument,
  deserializeReferenceProOverlayDocument,
  openReferenceAlwaysOnTopBoard,
  removeReferenceRedlineAnnotation,
  serializeReferenceProOverlayDocument,
  setClickThroughOpacity,
  setGifLoopRange,
  setReferenceNonDestructiveCrop,
  shouldToggleClickThroughFromKeyEvent,
  stepGifFrame,
  toggleClickThroughGrayscaleCheck,
  toggleClickThroughTracing,
} from "./studio-reference-pro-overlay";

describe("studio-reference-pro-overlay", () => {
  it("클릭-스루 트레이싱(Alt+T), 투명도 범위, 흑백 명도 체크를 제어하고 입력창 포커스 시 단축키를 차단한다", () => {
    let ct = createDefaultClickThroughState("ref-1");
    expect(computeClickThroughCssProjection(ct).pointerEvents).toBe("auto");

    ct = toggleClickThroughTracing(ct);
    ct = setClickThroughOpacity(ct, 0.99); // 상한 0.85로 클램프
    ct = toggleClickThroughGrayscaleCheck(ct, 3);

    const css = computeClickThroughCssProjection(ct);
    expect(css.pointerEvents).toBe("none");
    expect(css.opacity).toBe(0.85);
    expect(css.filter).toContain("grayscale(100%)");
    expect(css.filter).toContain("contrast(185%)");

    expect(shouldToggleClickThroughFromKeyEvent({ key: "t", altKey: true })).toBe(true);
    expect(
      shouldToggleClickThroughFromKeyEvent({
        key: "t",
        altKey: true,
        targetTagName: "TEXTAREA",
      }),
    ).toBe(false);
    expect(
      shouldToggleClickThroughFromKeyEvent({ key: "t", altKey: true, isComposing: true }),
    ).toBe(false);
  });

  it("비파괴 크롭과 레드라인 주석을 직렬화·복원하고 삭제한다", () => {
    let doc = createReferenceProOverlayDocument();
    doc = setReferenceNonDestructiveCrop(doc, "ref-1", {
      x: 0.1,
      y: 0.2,
      width: 0.6,
      height: 0.5,
    });
    doc = addReferenceRedlineAnnotation(doc, "ref-1", {
      id: "ann-1",
      kind: "arrow",
      from: { x: 0.2, y: 0.3 },
      to: { x: 0.7, y: 0.6 },
      label: "시선 방향",
      tone: "accent",
    });

    const json = serializeReferenceProOverlayDocument(doc);
    const restored = deserializeReferenceProOverlayDocument(json);
    expect(restored.extensionsByItemId["ref-1"]?.cropRect).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.6,
      height: 0.5,
    });
    expect(restored.extensionsByItemId["ref-1"]?.annotations).toHaveLength(1);

    const afterRemove = removeReferenceRedlineAnnotation(restored, "ref-1", "ann-1");
    expect(afterRemove.extensionsByItemId["ref-1"]?.annotations).toHaveLength(0);
  });

  it("GIF 프레임 스텝 및 A-B 구간 루프를 정확히 순환한다", () => {
    let gif = createReferenceGifStepper({ itemId: "pose-gif", frameCount: 10, fps: 10 });
    gif = setGifLoopRange(gif, 3, 5);
    expect(gif.currentFrame).toBe(3);

    gif = stepGifFrame(gif, 1);
    expect(gif.currentFrame).toBe(4);
    gif = stepGifFrame(gif, 2);
    expect(gif.currentFrame).toBe(3); // 4 -> 5 -> 3 순환
    gif = stepGifFrame(gif, -1);
    expect(gif.currentFrame).toBe(5);

    const playing = { ...gif, playing: true };
    const advanced = advanceGifPlaybackByMs(playing, 250); // 10fps = 100ms/frame -> 2프레임 전진
    expect(advanced.currentFrame).toBe(4);

    const cleared = clearGifLoopRange(advanced);
    expect(cleared.loopStartFrame).toBeNull();
  });

  it("Document PiP 우선 실행 및 미지원 환경 보조 창 폴백을 정직하게 보고한다", async () => {
    const fakePipWindow = { document: {} as Document, close: vi.fn() };
    const pipResult = await openReferenceAlwaysOnTopBoard({
      globalObj: {
        documentPictureInPicture: {
          requestWindow: vi.fn().mockResolvedValue(fakePipWindow),
        },
      },
    });
    expect(pipResult.mode).toBe("document-pip");
    expect(pipResult.pipWindow).toBe(fakePipWindow);

    const fallbackResult = await openReferenceAlwaysOnTopBoard({
      globalObj: {},
      openCompanionPopupFallback: () => true,
    });
    expect(fallbackResult.mode).toBe("companion-popup");

    const unavailableResult = await openReferenceAlwaysOnTopBoard({
      globalObj: {},
    });
    expect(unavailableResult.mode).toBe("unavailable");
  });
});
