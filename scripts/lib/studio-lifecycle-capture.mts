import { isStudioLifecycleDocumentPublicationReady, planStudioLifecyclePhysicalCapture } from "./studio-lifecycle-capture-policy.mjs";

import type { PixelDiffEvidence } from "../studio-lifecycle-verifier-policy";
import type { JSHandle, Locator, Page } from "playwright";

export interface PixelCrop {
  leftRatio: number;
  topRatio: number;
  rightRatio: number;
  bottomRatio: number;
}

export async function comparePngPixels(
  page: Page,
  first: Buffer,
  second: Buffer,
  channelTolerance: number,
  crop: PixelCrop | null = null,
): Promise<PixelDiffEvidence> {
  return page.evaluate(async ({ firstBase64, secondBase64, tolerance, cropRatios }) => {
    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`data:image/png;base64,${firstBase64}`),
      fetch(`data:image/png;base64,${secondBase64}`),
    ]);
    const [firstBitmap, secondBitmap] = await Promise.all([
      createImageBitmap(await firstResponse.blob()),
      createImageBitmap(await secondResponse.blob()),
    ]);
    const firstCanvas = new OffscreenCanvas(firstBitmap.width, firstBitmap.height);
    const secondCanvas = new OffscreenCanvas(secondBitmap.width, secondBitmap.height);
    const firstContext = firstCanvas.getContext("2d", { willReadFrequently: true });
    const secondContext = secondCanvas.getContext("2d", { willReadFrequently: true });
    if (!firstContext || !secondContext) throw new Error("could not create PNG comparison context");
    firstContext.drawImage(firstBitmap, 0, 0);
    secondContext.drawImage(secondBitmap, 0, 0);
    const a = {
      width: firstCanvas.width,
      height: firstCanvas.height,
      data: firstContext.getImageData(0, 0, firstCanvas.width, firstCanvas.height).data,
    };
    const b = {
      width: secondCanvas.width,
      height: secondCanvas.height,
      data: secondContext.getImageData(0, 0, secondCanvas.width, secondCanvas.height).data,
    };
    firstBitmap.close();
    secondBitmap.close();
    if (a.width !== b.width || a.height !== b.height) {
      return {
        changedPixels: Math.max(a.width * a.height, b.width * b.height),
        totalPixels: Math.max(a.width * a.height, b.width * b.height),
        maxChannelDelta: 255,
      };
    }
    const left = cropRatios
      ? Math.max(0, Math.min(a.width - 1, Math.floor(a.width * cropRatios.leftRatio)))
      : 0;
    const top = cropRatios
      ? Math.max(0, Math.min(a.height - 1, Math.floor(a.height * cropRatios.topRatio)))
      : 0;
    const right = cropRatios
      ? Math.max(left + 1, Math.min(a.width, Math.ceil(a.width * cropRatios.rightRatio)))
      : a.width;
    const bottom = cropRatios
      ? Math.max(top + 1, Math.min(a.height, Math.ceil(a.height * cropRatios.bottomRatio)))
      : a.height;
    let changedPixels = 0;
    let maxChannelDelta = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * a.width + x) * 4;
        let pixelDelta = 0;
        for (let channel = 0; channel < 4; channel += 1) {
          pixelDelta = Math.max(
            pixelDelta,
            Math.abs(a.data[offset + channel]! - b.data[offset + channel]!),
          );
        }
        maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
        if (pixelDelta > tolerance) changedPixels += 1;
      }
    }
    return {
      changedPixels,
      totalPixels: (right - left) * (bottom - top),
      maxChannelDelta,
    };
  }, {
    firstBase64: first.toString("base64"),
    secondBase64: second.toString("base64"),
    tolerance: channelTolerance,
    cropRatios: crop,
  });
}


/** screenshot 영역은 정수 CSS로 잡고 원래 device-pixel ROI를 재표본화 없이 꺼낸다. */
async function cropArtworkPng(page: Page, bytes: Buffer, bounds: { left: number; top: number; right: number; bottom: number }): Promise<Buffer> {
  const cropped = await page.evaluate(async ({ base64, rectangle }) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const source = new OffscreenCanvas(bitmap.width, bitmap.height);
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const width = rectangle.right - rectangle.left;
    const height = rectangle.bottom - rectangle.top;
    if (!sourceContext || rectangle.left < 0 || rectangle.top < 0
      || rectangle.right > bitmap.width || rectangle.bottom > bitmap.height) {
      bitmap.close(); throw new Error("artwork 원본 device-pixel ROI가 캡처 PNG 밖에 있습니다.");
    }
    sourceContext.drawImage(bitmap, 0, 0); bitmap.close();
    const result = new OffscreenCanvas(width, height);
    const target = result.getContext("2d");
    if (!target) throw new Error("artwork 픽셀 보존 캔버스를 만들지 못했습니다.");
    target.putImageData(sourceContext.getImageData(rectangle.left, rectangle.top, width, height), 0, 0);
    return Array.from(new Uint8Array(await (await result.convertToBlob({ type: "image/png" })).arrayBuffer()));
  }, { base64: bytes.toString("base64"), rectangle: bounds });
  return Buffer.from(cropped);
}

interface CaptureCanvasIdentities {
  ids: WeakMap<Element, number>;
  next: number;
}

async function inspectFrame(stage: Locator, identities: JSHandle<CaptureCanvasIdentities>) {
  return stage.evaluate((element, canvasIdentities) => {
    const rect = element.getBoundingClientRect();
    const owner = element.closest('[data-studio-document-renderer]');
    const canvas = element.querySelector<HTMLCanvasElement>('[data-studio-skia-document-surface]');
    const style = canvas ? getComputedStyle(canvas) : null;
    if (canvas && !canvasIdentities.ids.has(canvas)) {
      canvasIdentities.ids.set(canvas, ++canvasIdentities.next);
    }
    const editor = element.closest('[data-studio-editor]');
    return {
      stage: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight },
      deviceScaleFactor: devicePixelRatio,
      publication: {
        authorityStatus: owner?.getAttribute('data-studio-vello-hub-authority') ?? null,
        documentRenderer: owner?.getAttribute('data-studio-document-renderer') ?? null,
        konvaDocumentShadow: owner?.getAttribute('data-studio-konva-document-shadow') ?? null,
        skiaSurface: canvas && style ? {
          visibility: style.display === 'none' || Number(style.opacity) === 0 ? 'hidden' : style.visibility,
          phase: canvas.getAttribute('data-studio-skia-phase'),
          cachedItems: Number(canvas.getAttribute('data-studio-skia-cached-items') ?? 0),
        } : null,
      },
      surfaceIdentity: canvas ? canvasIdentities.ids.get(canvas) ?? null : null,
      documentHistory: {
        entries: editor?.getAttribute('data-studio-history-entry-count') ?? null,
        undoDepth: editor?.getAttribute('data-studio-history-undo-depth') ?? null,
      },
      surfaceRequest: canvas?.getAttribute('data-studio-skia-request') ?? null,
    };
  }, identities);
}

/** 픽셀 예산은 그대로 두고 같은 문서 게시 상태의 물리 artwork 영역만 비교한다. */
export async function captureStableLifecycleArtwork(
  page: Page,
  stage: Locator,
  artworkCrop: PixelCrop,
  requirePublishedDocument = false,
): Promise<Buffer> {
  // 게시 대기는 기존 UI 단계 예산인 8초다. 픽셀 안정화의 최대 6샷 규칙과 구분한다.
  const publicationDeadline = performance.now() + 8_000;
  const identities = await page.evaluateHandle(() => ({ ids: new WeakMap<Element, number>(), next: 0 }));
  try {
    const captures: {
      previous: { bytes: Buffer; fingerprint: string } | null;
      lastValid: Buffer | null;
    } = { previous: null, lastValid: null };
    for (let attempt = 0; attempt <= 5; attempt += 1) {
      let before = await inspectFrame(stage, identities);
      while (requirePublishedDocument && !isStudioLifecycleDocumentPublicationReady(before.publication)) {
        if (performance.now() >= publicationDeadline) {
          throw new Error(`원고 문서 표면 게시가 완료되지 않았습니다: ${JSON.stringify(before.publication)}`);
        }
        await page.waitForTimeout(80);
        before = await inspectFrame(stage, identities);
      }
      const plan = planStudioLifecyclePhysicalCapture({ ...before, artworkCrop });
      const screenshot = await page.screenshot({ animations: 'disabled', clip: plan.screenshotClip });
      const bytes = await cropArtworkPng(page, screenshot, plan.screenshotArtworkBounds);
      const after = await inspectFrame(stage, identities);
      const fingerprint = JSON.stringify(before);
      const sameFrame = fingerprint === JSON.stringify(after)
        && (!requirePublishedDocument || isStudioLifecycleDocumentPublicationReady(after.publication));
      if (sameFrame) {
        captures.lastValid = bytes;
        const previous = captures.previous;
        if (previous !== null && previous.fingerprint === fingerprint) {
          const diff = await comparePngPixels(page, previous.bytes, bytes, 2);
          if (diff.changedPixels <= 3) return bytes;
        }
        captures.previous = { bytes, fingerprint };
      } else {
        captures.previous = null;
        captures.lastValid = null;
      }
      if (attempt < 5) await page.waitForTimeout(80);
    }
    // 기존 안정화 루프의 마지막 유효 프레임 규칙은 유지하되, 게시 중인 프레임은 채택하지 않는다.
    if (captures.lastValid) return captures.lastValid;
    throw new Error('원고 캡처 중 표면 소유권 또는 화면 좌표가 계속 변경되었습니다.');
  } finally {
    await identities.dispose();
  }
}
