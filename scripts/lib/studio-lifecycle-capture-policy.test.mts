import { describe, expect, it } from "vitest";

import {
  isStudioLifecycleDocumentPublicationReady,
  planStudioLifecyclePhysicalCapture,
  type StudioLifecyclePublicationObservation,
} from "./studio-lifecycle-capture-policy.mts";

const publishedSurface = { visibility: "visible", phase: "presented", cachedItems: 1 };
const active: StudioLifecyclePublicationObservation = {
  authorityStatus: "active",
  documentRenderer: "skia-canvaskit-document-webgl2",
  konvaDocumentShadow: "unmounted",
  skiaSurface: publishedSurface,
};
const stage = { x: 350, y: 331, width: 733, height: 1099.5 };
const viewport = { width: 1440, height: 1000 };
const artworkCrop = {
  leftRatio: 0.1085948158253752,
  topRatio: 0.06289222373806273,
  rightRatio: 0.9145975443383357,
  bottomRatio: 0.26298317417007727,
};
const fullCrop = { leftRatio: 0, topRatio: 0, rightRatio: 1, bottomRatio: 1 };

describe("비어 있지 않은 Studio 문서의 게시 경계", () => {
  it("현재 GPU 표면이 비어 있지 않은 presented 화면을 게시했을 때만 준비된다", () => {
    expect(isStudioLifecycleDocumentPublicationReady(active)).toBe(true);
    for (const phase of ["rendering", "starting", null]) {
      expect(isStudioLifecycleDocumentPublicationReady({
        ...active, skiaSurface: { ...publishedSurface, phase },
      })).toBe(false);
    }
    for (const visibility of ["hidden", "collapse", null]) {
      expect(isStudioLifecycleDocumentPublicationReady({
        ...active, skiaSurface: { ...publishedSurface, visibility },
      })).toBe(false);
    }
    expect(isStudioLifecycleDocumentPublicationReady({ ...active, skiaSurface: null })).toBe(false);
    expect(isStudioLifecycleDocumentPublicationReady({
      ...active, documentRenderer: "compatibility",
    })).toBe(false);
  });

  it.each(["disabled", "starting", "legacy", null])(
    "이력 버튼이 가능해도 %s 권한은 게시 완료가 아니다", (authorityStatus) => {
      expect(isStudioLifecycleDocumentPublicationReady({ ...active, authorityStatus })).toBe(false);
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "잘못된 GPU 문서 개수 %s를 준비 상태로 인정하지 않는다", (cachedItems) => {
      expect(isStudioLifecycleDocumentPublicationReady({
        ...active, skiaSurface: { ...publishedSurface, cachedItems },
      })).toBe(false);
    },
  );

  it("GPU가 없거나 숨겨져도 unavailable의 명시적 Konva 문서 소유권을 허용한다", () => {
    const fallback = {
      authorityStatus: "unavailable",
      documentRenderer: "compatibility",
      konvaDocumentShadow: "mounted",
      skiaSurface: null,
    };
    expect(isStudioLifecycleDocumentPublicationReady(fallback)).toBe(true);
    expect(isStudioLifecycleDocumentPublicationReady({
      ...fallback, skiaSurface: { visibility: "hidden", phase: "rendering", cachedItems: 0 },
    })).toBe(true);
    expect(isStudioLifecycleDocumentPublicationReady({
      ...fallback, konvaDocumentShadow: "unmounted",
    })).toBe(false);
    expect(isStudioLifecycleDocumentPublicationReady({
      ...fallback, documentRenderer: "skia-canvaskit-document-webgl2",
    })).toBe(false);
    expect(isStudioLifecycleDocumentPublicationReady({
      ...fallback, authorityStatus: "starting",
    })).toBe(false);
  });
});

describe("원래 artwork device-pixel ROI를 보존하는 물리 viewport 캡처", () => {
  it("화면보다 긴 Stage에서도 원래 130,832픽셀을 그대로 선택한다", () => {
    const plan = planStudioLifecyclePhysicalCapture({ stage, viewport, artworkCrop });
    expect(plan.clip).toEqual({ x: 350, y: 331, width: 733, height: 669 });
    expect(plan.artworkBounds).toEqual({ left: 79, top: 69, right: 671, bottom: 290 });
    expect(plan.artworkClip).toEqual({ x: 429, y: 400, width: 592, height: 221 });
    expect(plan.screenshotClip).toEqual(plan.artworkClip);
    expect(plan.screenshotArtworkBounds).toEqual({ left: 0, top: 0, right: 592, bottom: 221 });
    expect(plan.artworkClip.width * plan.artworkClip.height).toBe(130_832);
    // 기존 비교기의 ratio→floor/ceil 왕복도 같은 정수 픽셀 경계를 선택해야 한다.
    expect({
      left: Math.floor(plan.clip.width * plan.artworkCrop.leftRatio),
      top: Math.floor(plan.clip.height * plan.artworkCrop.topRatio),
      right: Math.ceil(plan.clip.width * plan.artworkCrop.rightRatio),
      bottom: Math.ceil(plan.clip.height * plan.artworkCrop.bottomRatio),
    }).toEqual(plan.artworkBounds);
  });

  it("DPR 2에서는 legacy PNG의 ratio 선택을 보존하며 DPR 1 ROI를 단순 두 배로 만들지 않는다", () => {
    const plan = planStudioLifecyclePhysicalCapture({ stage, viewport, artworkCrop, deviceScaleFactor: 2 });
    expect(plan.clip).toEqual({ x: 350, y: 331, width: 733, height: 669 });
    expect(plan.artworkBounds).toEqual({ left: 159, top: 138, right: 1341, bottom: 579 });
    expect(plan.artworkClip).toEqual({ x: 429.5, y: 400, width: 591, height: 220.5 });
    expect(plan.artworkClip.width * 2).toBe(1182);
    expect(plan.artworkClip.height * 2).toBe(441);
    expect(plan.screenshotClip).toEqual({ x: 429, y: 400, width: 592, height: 221 });
    expect(plan.screenshotArtworkBounds).toEqual({ left: 1, top: 0, right: 1183, bottom: 441 });
    expect(plan.screenshotArtworkBounds.right - plan.screenshotArtworkBounds.left).toBe(1182);
    expect(plan.screenshotArtworkBounds.bottom - plan.screenshotArtworkBounds.top).toBe(441);
    expect({
      left: Math.floor(1466 * plan.artworkCrop.leftRatio),
      top: Math.floor(1338 * plan.artworkCrop.topRatio),
      right: Math.ceil(1466 * plan.artworkCrop.rightRatio),
      bottom: Math.ceil(1338 * plan.artworkCrop.bottomRatio),
    }).toEqual(plan.artworkBounds);
  });

  it("Stage가 일부 가려져도 원래 ROI 전체가 보이면 허용한다", () => {
    const plan = planStudioLifecyclePhysicalCapture({
      stage: { x: -40, y: -20, width: 200, height: 160 },
      viewport: { width: 120, height: 100 },
      artworkCrop: { leftRatio: 0.4, topRatio: 0.3, rightRatio: 0.7, bottomRatio: 0.7 },
    });
    expect(plan.clip).toEqual({ x: 0, y: 0, width: 120, height: 100 });
    expect(plan.artworkClip).toEqual({ x: 40, y: 28, width: 60, height: 64 });
    expect(() => planStudioLifecyclePhysicalCapture({
      stage: { x: -40, y: -20, width: 200, height: 160 },
      viewport: { width: 120, height: 100 },
      artworkCrop: { leftRatio: 0.4, topRatio: 0.3, rightRatio: 0.85, bottomRatio: 0.7 },
    })).toThrow(/ROI 일부/);
  });

  it("fractional Stage 원점에서도 소유 영역 밖 픽셀을 포함하지 않는다", () => {
    const plan = planStudioLifecyclePhysicalCapture({
      stage: { x: 10.25, y: 20.75, width: 100.5, height: 80.25 },
      viewport: { width: 160, height: 140 },
      artworkCrop: { leftRatio: 0.25, topRatio: 0.25, rightRatio: 0.75, bottomRatio: 0.75 },
      deviceScaleFactor: 2,
    });
    expect(plan.clip).toEqual({ x: 10.5, y: 21, width: 100, height: 80 });
    expect(plan.artworkBounds).toEqual({ left: 49, top: 38, right: 151, bottom: 120 });
    expect(plan.artworkClip).toEqual({ x: 35, y: 40, width: 51, height: 41 });
    expect(plan.clip.x).toBeGreaterThanOrEqual(10.25);
    expect(plan.clip.x + plan.clip.width).toBeLessThanOrEqual(110.75);
  });

  it.each([
    { x: 349.9999, y: 331, width: 733 },
    { x: 350, y: 330.9999, width: 733 },
    { x: 350.0001, y: 331, width: 733 },
    { x: 350, y: 331, width: 733.0001 },
  ])("정수 근처 배치 오차가 legacy artwork 픽셀을 이동시키지 않는다: %j", (patch) => {
    const plan = planStudioLifecyclePhysicalCapture({
      stage: { ...stage, ...patch }, viewport, artworkCrop,
    });
    expect(plan.artworkClip).toEqual({ x: 429, y: 400, width: 592, height: 221 });
    expect((plan.artworkBounds.right - plan.artworkBounds.left)
      * (plan.artworkBounds.bottom - plan.artworkBounds.top)).toBe(130_832);
  });

  it("viewport 내 위치가 바뀌어도 artwork PNG의 크기와 Stage 내 위치는 같다", () => {
    const first = planStudioLifecyclePhysicalCapture({ stage, viewport, artworkCrop });
    const moved = planStudioLifecyclePhysicalCapture({
      stage: { ...stage, y: 280 }, viewport, artworkCrop,
    });
    expect(moved.clip.height).toBe(720);
    expect(moved.artworkClip).toEqual({ ...first.artworkClip, y: 349 });
    expect(moved.artworkBounds).toEqual(first.artworkBounds);
  });

  it("fractional DPR도 screenshot과 원본의 device 격자가 같으면 무손실 ROI를 반환한다", () => {
    const plan = planStudioLifecyclePhysicalCapture({
      stage: { x: 0, y: 0, width: 100, height: 100 },
      viewport: { width: 200, height: 200 },
      artworkCrop: { leftRatio: 0.2, topRatio: 0.2, rightRatio: 0.8, bottomRatio: 0.8 },
      deviceScaleFactor: 1.25,
    });
    expect(plan.screenshotClip).toEqual({ x: 20, y: 20, width: 60, height: 60 });
    expect(plan.screenshotArtworkBounds).toEqual({ left: 0, top: 0, right: 75, bottom: 75 });
  });

  it("fractional DPR의 원점 차이를 반올림해 다른 device 픽셀을 선택하지 않는다", () => {
    expect(() => planStudioLifecyclePhysicalCapture({
      stage, viewport, artworkCrop, deviceScaleFactor: 1.25,
    })).toThrow(/device-pixel 격자가 일치하지/);
  });

  it("ROI가 보여도 정수 enclosing screenshot이 viewport 밖이면 거부한다", () => {
    expect(() => planStudioLifecyclePhysicalCapture({
      stage: { x: 0, y: 0, width: 121, height: 100 },
      viewport: { width: 120.75, height: 100 },
      artworkCrop: { leftRatio: 0.5, topRatio: 0.1, rightRatio: 240.75 / 242, bottomRatio: 0.5 },
      deviceScaleFactor: 2,
    })).toThrow(/정수 screenshot 영역이 viewport 밖/);
  });

  it.each([
    { stage: { ...stage, width: 0 } },
    { stage: { ...stage, height: -1 } },
    { stage: { ...stage, x: NaN } },
    { stage: { ...stage, width: Infinity } },
    { stage: { ...stage, x: 2000 } },
    { stage: { x: 1439.75, y: 331, width: 10, height: 10 } },
    { stage: { x: 350, y: 331, width: 0.5, height: 0.5 } },
    { viewport: { width: 1, height: 1 } },
    { viewport: { width: 0, height: 1000 } },
    { viewport: { width: 1440, height: NaN } },
    { deviceScaleFactor: 0 },
    { deviceScaleFactor: -1 },
    { deviceScaleFactor: Infinity },
    { artworkCrop: { ...artworkCrop, leftRatio: -0.1 } },
    { artworkCrop: { ...artworkCrop, rightRatio: 1.1 } },
    { artworkCrop: { ...artworkCrop, topRatio: NaN } },
    { artworkCrop: { ...artworkCrop, rightRatio: artworkCrop.leftRatio } },
  ])("유효하지 않거나 너무 작거나 보이지 않는 캡처를 거부한다: %j", (patch) => {
    expect(() => planStudioLifecyclePhysicalCapture({ stage, viewport, artworkCrop: fullCrop, ...patch }))
      .toThrow(/캡처 좌표 오류/);
  });
});
