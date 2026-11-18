import { resolveStudioBg3dRotationRing } from "../../scripts/lib/studio-bg3d-rotation-ring";

import type { Locator, Page } from "@playwright/test";

/** PNG는 선택 좌표의 관측에만 쓰고 앱의 객체·카메라·gizmo 상태는 변경하지 않는다. */
export async function readStudioBg3dRotationRing(page: Page, canvas: Locator, png?: Buffer) {
  const shot = png ?? await canvas.screenshot();
  const mask = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    try {
      const { width, height } = bitmap;
      const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("BG3D Y 링 PNG를 읽을 수 없습니다.");
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, width, height);
      const pixels: { x: number; y: number }[] = [];
      for (let y = Math.ceil(height * 0.2); y < height * 0.8; y += 1) {
        for (let x = Math.ceil(width * 0.2); x < width * 0.8; x += 1) {
          const i = (y * width + x) * 4;
          // Three TransformControls의 녹색 Y 축만 읽는다. 회색 배경·청록 선택선은 제외한다.
          if (data[i + 3] > 200 && data[i + 1] > 150
            && data[i + 1] > data[i] * 1.4 && data[i + 1] > data[i + 2] * 1.4) pixels.push({ x, y });
        }
      }
      return { width, height, pixels };
    } finally { bitmap.close(); }
  }, shot.toString("base64"));
  const ring = resolveStudioBg3dRotationRing(mask);
  const box = await canvas.boundingBox();
  if (!box || Math.abs(box.width - ring.width) > 1 || Math.abs(box.height - ring.height) > 1) {
    throw new Error("BG3D Y 링 PNG와 현재 1x 캔버스 표면이 다릅니다.");
  }
  const toPage = ({ x, y }: { x: number; y: number }) => ({
    x: box.x + (x + 0.5) / ring.width * box.width,
    y: box.y + (y + 0.5) / ring.height * box.height,
  });
  const start = toPage(ring.start), end = toPage(ring.end);
  const receivesPointer = await canvas.evaluate((element, point) =>
    element.ownerDocument.elementFromPoint(point.x, point.y) === element, start);
  if (!receivesPointer) throw new Error("BG3D Y 회전 링 입력점이 다른 DOM에 가려졌습니다.");
  return { ...ring, surface: box, start, end };
}
