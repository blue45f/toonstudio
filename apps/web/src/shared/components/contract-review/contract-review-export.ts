/**
 * 체크리스트 요약 내려받기. 요약은 브라우저 안에서 만들고 그대로 파일로 저장한다(서버 전송 없음).
 */

/** Blob URL 을 바로 해제하면 일부 브라우저(WebKit 계열)에서 0바이트 파일이 저장될 수 있어 잠시 둔다. */
const OBJECT_URL_REVOKE_DELAY_MS = 30_000;

export function contractReviewFilename(generatedAt: Date): string {
  const date = Number.isNaN(generatedAt.getTime()) ? "unknown-date" : generatedAt.toISOString().slice(0, 10);
  return `toonstudio-contract-review-${date}.md`;
}

/** 텍스트를 파일로 내려받는다. 이 환경에서 다운로드를 시작할 수 없으면 false. */
export function downloadTextFile(filename: string, text: string, mime = "text/markdown;charset=utf-8"): boolean {
  if (
    typeof document === "undefined"
    || !document.body
    || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }
  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.hidden = true;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
    return true;
  } catch {
    return false;
  } finally {
    if (objectUrl !== null) {
      const urlToRevoke = objectUrl;
      globalThis.setTimeout(() => URL.revokeObjectURL(urlToRevoke), OBJECT_URL_REVOKE_DELAY_MS);
    }
  }
}
