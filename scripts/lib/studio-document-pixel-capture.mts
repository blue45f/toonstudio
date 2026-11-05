/** 실제 문서 게시 표면을 캡처한다. Konva의 선택 핸들과 숨겨진 호환 문서는 원고 픽셀이 아니다. */
export async function captureStudioDocumentRoi(
  documentCorners: readonly { x: number; y: number }[],
): Promise<string> {
  interface CaptureConfig { x: number; y: number; width: number; height: number; pixelRatio: number }
  interface CaptureNode { toCanvas: (config: CaptureConfig) => HTMLCanvasElement; isVisible: () => boolean }
  interface CaptureStage {
    container: () => HTMLElement;
    getAbsoluteTransform: () => { point: (point: { x: number; y: number }) => { x: number; y: number } };
    getLayers: () => CaptureNode[];
    findOne: (selector: string) => CaptureNode | undefined;
  }
  const runtime = (window as typeof window & { Konva?: { stages?: CaptureStage[] } }).Konva;
  const stage = runtime?.stages?.find((candidate) => {
    const content = candidate.container().querySelector<HTMLElement>(".konvajs-content");
    const bounds = content?.getBoundingClientRect();
    return content?.isConnected === true && Boolean(bounds && bounds.width > 0 && bounds.height > 0);
  });
  if (!stage) throw new Error("문서 증거를 캡처할 현재 Konva stage가 없습니다.");
  const content = stage.container().querySelector<HTMLElement>(".konvajs-content")!;
  const owner = content.closest("[data-studio-document-renderer]");
  const deadline = performance.now() + 8_000;
  let skia: HTMLCanvasElement | null = null;
  while (owner?.getAttribute("data-studio-document-renderer") === "skia-canvaskit-document-webgl2") {
    skia = content.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]");
    const style = skia ? getComputedStyle(skia) : null;
    if (skia?.dataset.studioSkiaPhase === "presented" && style?.visibility === "visible"
      && style.display !== "none" && Number(style.opacity) > 0) break;
    if (performance.now() >= deadline) throw new Error("현재 Skia 문서 표면의 게시가 완료되지 않았습니다.");
    skia = null;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 32));
  }
  const transformed = documentCorners.map((point) => stage.getAbsoluteTransform().point(point));
  const left = Math.min(transformed[0]!.x, transformed[1]!.x);
  const top = Math.min(transformed[0]!.y, transformed[1]!.y);
  const width = Math.abs(transformed[1]!.x - transformed[0]!.x);
  const height = Math.abs(transformed[1]!.y - transformed[0]!.y);
  const documentWidth = Math.abs(documentCorners[1]!.x - documentCorners[0]!.x);
  if (width < 1 || height < 1 || documentWidth < 1) throw new Error("문서 증거 ROI가 비어 있습니다.");
  const config = { x: left, y: top, width, height, pixelRatio: documentWidth / width };
  const background = stage.getLayers()[0];
  if (!background) throw new Error("문서 배경 레이어가 없습니다.");
  const canvas = background.toCanvas(config);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("문서 합성 캔버스를 만들지 못했습니다.");
  context.setTransform(1, 0, 0, 1, 0, 0);
  if (skia) {
    const bounds = skia.getBoundingClientRect();
    const stageBounds = content.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) throw new Error("Skia 문서 표면이 보이지 않습니다.");
    // 현재 CSS 카메라 이동·DPR을 같은 문서 좌표 ROI로 환산한다. 이미지 자체의 알파는 그대로 합성한다.
    context.drawImage(skia,
      (left - bounds.left + stageBounds.left) * skia.width / bounds.width,
      (top - bounds.top + stageBounds.top) * skia.height / bounds.height,
      width * skia.width / bounds.width, height * skia.height / bounds.height,
      0, 0, canvas.width, canvas.height);
  } else {
    const document = stage.findOne(".studio-konva-document-shadow");
    if (!document?.isVisible()) throw new Error("현재 문서 렌더러가 캡처 가능한 상태가 아닙니다.");
    context.drawImage(document.toCanvas(config), 0, 0);
  }
  const encoded = canvas.toDataURL("image/png");
  const separator = encoded.indexOf(",");
  if (separator < 0) throw new Error("문서 증거 PNG를 인코딩하지 못했습니다.");
  return encoded.slice(separator + 1);
}

/** 게시를 기다리는 내부 캡처가 길어져도 호출자의 원래 성공 기한을 연장하지 않는다. */
export async function captureStudioDocumentBeforeDeadline<T>(
  capture: () => Promise<T>,
  deadline: number,
  now: () => number = Date.now,
): Promise<T | null> {
  if (now() >= deadline) return null;
  const result = await capture();
  return now() < deadline ? result : null;
}
