import {
  isStudioLifecycleDocumentPublicationReady,
  type StudioLifecyclePublicationObservation,
} from "./studio-lifecycle-capture-policy.mjs";

import type { Page } from "playwright";

/** 실제 원고 소유권과 게시 영수증만 읽는다. Stage·보기·renderer를 변경하지 않는다. */
export function readStudioDurabilityPublication(): StudioLifecyclePublicationObservation {
  const content = document.querySelector(".konvajs-content");
  const owner = content?.closest("[data-studio-document-renderer]");
  const canvas = content?.querySelector<HTMLCanvasElement>("[data-studio-skia-document-surface]");
  const style = canvas ? getComputedStyle(canvas) : null;
  return {
    authorityStatus: owner?.getAttribute("data-studio-vello-hub-authority") ?? null,
    documentRenderer: owner?.getAttribute("data-studio-document-renderer") ?? null,
    konvaDocumentShadow: owner?.getAttribute("data-studio-konva-document-shadow") ?? null,
    skiaSurface: canvas && style ? {
      visibility: style.display === "none" || Number(style.opacity) === 0 ? "hidden" : style.visibility,
      phase: canvas.getAttribute("data-studio-skia-phase"),
      cachedItems: Number(canvas.getAttribute("data-studio-skia-cached-items") ?? 0),
    } : null,
  };
}

/** 호출자가 이미 시작한 복원 기한 안에서만 게시를 기다리며 별도 예산을 시작하지 않는다. */
export async function waitForStudioDurabilityPublication(
  page: Page,
  recoveryDeadline: number,
): Promise<StudioLifecyclePublicationObservation> {
  if (!Number.isFinite(recoveryDeadline)) throw new Error("내구 복원의 기존 유한 기한이 필요합니다.");
  let last: StudioLifecyclePublicationObservation | null = null;
  while (performance.now() < recoveryDeadline) {
    last = await page.evaluate(readStudioDurabilityPublication);
    if (performance.now() >= recoveryDeadline) break;
    if (isStudioLifecycleDocumentPublicationReady(last)) return last;
    const remaining = recoveryDeadline - performance.now();
    if (remaining > 0) await page.waitForTimeout(Math.min(80, remaining));
  }
  throw new Error(`원래 복원 기한 안에 문서 게시가 완료되지 않았습니다: ${JSON.stringify(last)}. 같은 durability 명령으로 확인하세요.`);
}
