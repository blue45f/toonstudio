/**
 * 키트 프리뷰 페이지 진입점(브라우저 전용, 개발 전용 — 프로덕션 번들에 들어가지 않는다). `kit-preview.html`이 로드하고,
 * `scripts/kit-preview.mjs`(Playwright)가 `window.__kitPreview`를 호출해 GLB를 올리고 뷰별 PNG를 받아 간다.
 * 사람이 브라우저로 열어도 상태 줄에 진행 로그가 보이지만 조작 UI는 없다(자동화 전용).
 */
import { KIT_PREVIEW_API_VERSION } from "./protocol";
import { KitPreviewSession } from "./session.browser";

import type { KitPreviewApi } from "./protocol";

declare global {
  interface Window {
    __kitPreview?: KitPreviewApi;
    /** CLI가 `page.exposeFunction`으로 꽂는 진행 로그 수신기(없으면 상태 줄에만 쓴다) */
    __kitPreviewLog?: (message: string) => void;
  }
}

const status = document.getElementById("kit-preview-status");
const canvas = document.getElementById("kit-preview-canvas");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("kit-preview-canvas 요소가 없습니다(kit-preview.html 확인).");

function log(message: string): void {
  if (status) status.textContent = `${status.textContent ?? ""}\n${message}`;
  window.__kitPreviewLog?.(message);
}

const session = new KitPreviewSession(canvas, log);

window.__kitPreview = {
  version: KIT_PREVIEW_API_VERSION,
  load: (request) => session.load(request),
  render: (request) => session.render(request),
  dispose: () => {
    session.dispose();
    return Promise.resolve();
  },
};

if (status) status.textContent = "kit-preview: 준비됨(window.__kitPreview.load / render / dispose)";
