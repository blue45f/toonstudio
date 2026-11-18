import type { Locator } from "@playwright/test";

/** 실제 합성 프레임에서 녹색 Y축 회전 링의 오른쪽과 하단을 찾는다. */
export async function findBg3dRotationGesture(canvas: Locator) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("3D 회전 뷰포트의 위치를 읽지 못했습니다.");
  const screenshot = await canvas.screenshot({ scale: "css" });
  const [start, end] = await canvas.page().evaluate(async (encoded) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
    const buffer = new OffscreenCanvas(image.width, image.height);
    const context = buffer.getContext("2d");
    if (!context) throw new Error("회전 링 픽셀을 읽지 못했습니다.");
    context.drawImage(image, 0, 0);
    image.close();
    const { width, height } = buffer;
    const { data } = context.getImageData(0, 0, width, height);
    const points = [];
    for (let x = Math.floor(width * 0.25); x < width * 0.75; x++) {
      for (let y = Math.floor(height * 0.3); y < height * 0.7; y++) {
        const i = (y * width + x) * 4;
        if (data[i + 1] > Math.max(data[i], data[i + 2]) + 75) points.push({ x, y });
      }
    }
    if (points.length < 20) throw new Error("뷰포트에 Y축 회전 링이 나타나지 않았습니다.");
    const right = points[Math.floor(points.length * 0.88)];
    const bottom = points.reduce((lowest, point) => point.y > lowest.y ? point : lowest);
    return [right, bottom].map(({ x, y }) => ({ x: (x + 0.5) / width, y: (y + 0.5) / height }));
  }, screenshot.toString("base64"));
  const absolute = ({ x, y }: { x: number; y: number }) => ({ x: box.x + x * box.width, y: box.y + y * box.height });
  return { start: absolute(start), end: absolute(end) };
}
