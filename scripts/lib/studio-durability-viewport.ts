import { captureStudioDocumentBeforeDeadline } from "./studio-document-pixel-capture.mjs";

import type { Page } from "playwright";

type Affine = readonly [number, number, number, number, number, number];
export interface StudioDurabilityRect { x: number; y: number; width: number; height: number }
export interface StudioDurabilityViewport {
  documentToScreen: Affine;
  stageBox: StudioDurabilityRect;
  stageSize: { width: number; height: number };
  visibleBox: StudioDurabilityRect;
  viewport: { width: number; height: number; devicePixelRatio: number };
  renderer: string | null;
}
export interface StudioDurabilityRoi { documentFromPixel: Affine; width: number; height: number }

export interface DeferredDurabilityResult {
  ok: boolean;
  navigationIssuedInMs: number;
  unloadGuardShown: boolean;
  /** 첫 획은 살아 있는 문서의 pointerup receipt, 둘째 획은 teardown 뒤 survivor로 판정한다. */
  receiptMarkerReason: string;
  receiptSettledInMs: number;
  receiptStrokeCount: number;
  survivorMarkerReason: string;
  survivorStrokeCount: number;
  unloadPromptHeldMs: number;
  payloadContainsEveryStroke: boolean;
  recoveryBannerShown: boolean;
  recoveredPixelsChanged: boolean;
  recoveryMode: "automatic" | "manual";
  recoveredStrokeVisibleSegments: number;
  screenshot: string;
  errorCount: number;
  viewportEvidence: Record<string, unknown>;
}

function multiply(a: Affine, b: Affine): Affine {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

function inverse(m: Affine): Affine {
  const determinant = m[0] * m[3] - m[1] * m[2];
  if (!m.every(Number.isFinite) || !Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) {
    throw new Error("내구 복원 ROI의 실제 좌표 변환이 유효하지 않습니다. 같은 durability 명령으로 확인하세요.");
  }
  return [m[3] / determinant, -m[1] / determinant, -m[2] / determinant, m[0] / determinant,
    (m[2] * m[5] - m[3] * m[4]) / determinant, (m[1] * m[4] - m[0] * m[5]) / determinant];
}

/** 최초 화면의 빈 비교 영역을 문서 좌표에 고정한다. 이후 화면 배율은 이 영역을 바꾸지 않는다. */
export function studioDurabilityDocumentRoi(view: StudioDurabilityViewport, rect: StudioDurabilityRect): StudioDurabilityRoi {
  if (!Object.values(rect).every(Number.isFinite) || rect.width < 1 || rect.height < 1) {
    throw new Error("내구 복원 ROI의 위치와 크기가 필요합니다. 같은 durability 명령으로 확인하세요.");
  }
  const width = Math.round(rect.width), height = Math.round(rect.height);
  return { width, height, documentFromPixel: multiply(inverse(view.documentToScreen),
    [rect.width / width, 0, 0, rect.height / height, rect.x, rect.y]) };
}

/** Stage의 clip·회전·반전과 CSS 배율을 합성한 실제 화면에서 같은 문서 픽셀을 찾는다. */
export function projectStudioDurabilityRoi(view: StudioDurabilityViewport, roi: StudioDurabilityRoi) {
  const pixelToScreen = multiply(view.documentToScreen, roi.documentFromPixel);
  const screenToPixel = inverse(pixelToScreen);
  const corners = [[0, 0], [roi.width, 0], [0, roi.height], [roi.width, roi.height]].map(([x, y]) => ({
    x: pixelToScreen[0] * x! + pixelToScreen[2] * y! + pixelToScreen[4],
    y: pixelToScreen[1] * x! + pixelToScreen[3] * y! + pixelToScreen[5],
  }));
  const box = view.visibleBox;
  const epsilon = 1e-7;
  if (corners.some(({ x, y }) => x < box.x - epsilon || y < box.y - epsilon
    || x > box.x + box.width + epsilon || y > box.y + box.height + epsilon)) {
    throw new Error("같은 내구 복원 문서 ROI가 현재 화면 밖에 있습니다. 보기를 바꾸지 말고 실제 배치를 확인하세요.");
  }
  // quarter turn의 sin/cos 왕복 오차가 정수 CSS 경계를 1px 늘리지 않게 한다.
  const x = Math.floor(Math.min(...corners.map((p) => p.x)) + epsilon), y = Math.floor(Math.min(...corners.map((p) => p.y)) + epsilon);
  const clip = { x, y, width: Math.ceil(Math.max(...corners.map((p) => p.x)) - epsilon) - x,
    height: Math.ceil(Math.max(...corners.map((p) => p.y)) - epsilon) - y };
  return { clip, screenshotToPixel: multiply(screenToPixel, [1, 0, 0, 1, x, y]) };
}

/** 기존 원고 캡처 helper와 같은 현재 Konva Stage를 읽으며 Stage·보기·게시를 변경하지 않는다. */
export async function readStudioDurabilityViewport(page: Page): Promise<StudioDurabilityViewport> {
  return page.evaluate(() => {
    interface Stage {
      container(): HTMLElement;
      width(): number;
      height(): number;
      getAbsoluteTransform(): { point(p: { x: number; y: number }): { x: number; y: number } };
    }
    const content = document.querySelector<HTMLElement>(".konvajs-content");
    const runtime = (window as typeof window & { Konva?: { stages?: Stage[] } }).Konva;
    const stage = runtime?.stages?.find((candidate) => candidate.container().querySelector(".konvajs-content") === content);
    if (!content?.isConnected || !stage) throw new Error("내구 복원을 관측할 현재 Stage가 없습니다.");
    const bounds = content.getBoundingClientRect(), width = stage.width(), height = stage.height();
    if (bounds.width <= 0 || bounds.height <= 0 || width <= 0 || height <= 0) throw new Error("내구 복원 Stage가 보이지 않습니다.");
    const sx = bounds.width / width, sy = bounds.height / height;
    const transform = stage.getAbsoluteTransform(), o = transform.point({ x: 0, y: 0 });
    const u = transform.point({ x: 1, y: 0 }), v = transform.point({ x: 0, y: 1 });
    let left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
    let right = Math.min(innerWidth, bounds.right), bottom = Math.min(innerHeight, bounds.bottom);
    for (let ancestor: HTMLElement | null = content; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor), rect = ancestor.getBoundingClientRect();
      const css = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
      if (!css.is2D || Math.abs(css.b) > 1e-9 || Math.abs(css.c) > 1e-9 || css.a <= 0 || css.d <= 0) {
        throw new Error("내구 복원 캡처가 지원하지 않는 CSS 회전·반전입니다. 실제 배치를 확인하세요.");
      }
      const ax = ancestor.offsetWidth > 0 ? rect.width / ancestor.offsetWidth : 1;
      const ay = ancestor.offsetHeight > 0 ? rect.height / ancestor.offsetHeight : 1;
      if (/^(auto|scroll|hidden|clip|overlay)$/u.test(style.overflowX)) {
        left = Math.max(left, rect.left + ancestor.clientLeft * ax);
        right = Math.min(right, rect.left + (ancestor.clientLeft + ancestor.clientWidth) * ax);
      }
      if (/^(auto|scroll|hidden|clip|overlay)$/u.test(style.overflowY)) {
        top = Math.max(top, rect.top + ancestor.clientTop * ay);
        bottom = Math.min(bottom, rect.top + (ancestor.clientTop + ancestor.clientHeight) * ay);
      }
    }
    return { documentToScreen: [(u.x - o.x) * sx, (u.y - o.y) * sy, (v.x - o.x) * sx,
      (v.y - o.y) * sy, bounds.left + o.x * sx, bounds.top + o.y * sy],
    stageBox: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }, stageSize: { width, height },
    visibleBox: { x: left, y: top, width: right - left, height: bottom - top },
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    renderer: content.closest("[data-studio-document-renderer]")?.getAttribute("data-studio-document-renderer") ?? null };
  });
}

export function createStudioDurabilityViewportAudit(page: Page) {
  const evidence: Record<string, unknown> = {};
  const capture = async (roi: StudioDurabilityRoi, phase: string, deadline?: number): Promise<Buffer | null> => {
    const observation: Record<string, unknown> = { roi, startedAt: performance.now(), deadline: deadline ?? null };
    evidence[phase] = observation;
    try {
      const result = await captureStudioDocumentBeforeDeadline(async () => {
        const before = await readStudioDurabilityViewport(page);
        const projection = projectStudioDurabilityRoi(before, roi);
        Object.assign(observation, { before, ...projection });
        const screenshot = await page.screenshot({ clip: projection.clip, animations: "disabled", scale: "css",
          ...(deadline === undefined ? {} : { timeout: Math.max(1, deadline - performance.now()) }) });
        const after = await readStudioDurabilityViewport(page);
        observation.after = after;
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          observation.unstable = true;
          if (deadline !== undefined) return null;
          throw new Error("내구 복원 촬영 중 실제 뷰포트가 바뀌었습니다. 같은 durability 명령으로 확인하세요.");
        }
        const png = await page.evaluate(async ({ base64, projection: frame, width, height }) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
          try {
            if (bitmap.width !== frame.clip.width || bitmap.height !== frame.clip.height) throw new Error("내구 복원 screenshot 해상도가 실제 CSS clip과 다릅니다.");
            const canvas = document.createElement("canvas");
            canvas.width = width; canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("내구 복원 문서 ROI를 비교할 수 없습니다.");
            context.imageSmoothingEnabled = false;
            context.setTransform(...frame.screenshotToPixel);
            context.drawImage(bitmap, 0, 0);
            return canvas.toDataURL("image/png").split(",")[1]!;
          } finally { bitmap.close(); }
        }, { base64: screenshot.toString("base64"), projection, width: roi.width, height: roi.height });
        return Buffer.from(png, "base64");
      }, deadline ?? Infinity, () => performance.now());
      observation.completedAt = performance.now();
      observation.accepted = result !== null;
      return result;
    } catch (error) {
      observation.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };
  return { evidence, capture, measure: () => readStudioDurabilityViewport(page) };
}
