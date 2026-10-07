/**
 * PDF 워크벤치 썸네일 — pdfjs-dist 어댑터. 페이지 카드에 보일 작은 미리보기만 맡는다.
 *
 * - pdfjs는 무겁기 때문에 동적 import로만 불러온다 — 워크벤치를 열지 않는 사용자는
 *   이 청크를 받지 않는다. 워커도 같은 패키지의 min 빌드를 Vite URL 자산으로 연결한다.
 * - 렌더는 호출마다 문서를 열고 닫는다. 카드 수가 많은 화면에서는 호출자가 보이는
 *   카드부터 순차적으로 요청하는 것을 전제한다 (동시 다발 렌더는 메인 스레드를 막는다).
 * - 실패는 호출자가 빈 카드+페이지 번호로 대체할 수 있게 예외로 알린다.
 */

import type * as PdfJsModule from "pdfjs-dist";
import PdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfjsPromise: Promise<typeof PdfJsModule> | null = null;

function loadPdfjs(): Promise<typeof PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((module) => {
      module.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;
      return module;
    });
  }
  return pdfjsPromise;
}

/**
 * 한 페이지를 targetWidth(px)에 맞춰 PNG data URL로 렌더한다.
 * pageIndex는 0-based (모델의 sourcePageIndex와 같은 기준).
 */
export async function renderPdfPageThumbnail(input: {
  readonly bytes: Uint8Array;
  readonly pageIndex: number;
  readonly targetWidth?: number;
  /** 원본 회전에 더해지는 추가 회전 (워크벤치 회전 상태와 화면을 맞춘다). */
  readonly rotationDelta?: number;
}): Promise<string> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: input.bytes.slice() });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(input.pageIndex + 1);
    const rotation = page.rotate + (input.rotationDelta ?? 0);
    const baseViewport = page.getViewport({ scale: 1, rotation });
    const targetWidth = input.targetWidth ?? 240;
    const viewport = page.getViewport({ scale: targetWidth / baseViewport.width, rotation });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("썸네일을 그릴 캔버스를 만들지 못했어요.");
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL("image/png");
  } finally {
    await loadingTask.destroy();
  }
}
