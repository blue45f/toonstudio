import { useExampleNotification } from "./use-example-notification";

export interface BrowserOutput { readonly kind: "copy" | "download"; readonly text: string; readonly filename?: string; }

/** 브라우저의 실제 응답과 다운로드 요청 전달을 구분한다. 파일 저장 완료는 관찰하지 못한다. */
export function useBrowserOutput() {
  return useExampleNotification<BrowserOutput>((task) => {
    if (task.kind === "copy") {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("이 환경에서는 클립보드 복사를 지원하지 않습니다.");
      return navigator.clipboard.writeText(task.text);
    }
    if (typeof document === "undefined" || typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") throw new Error("이 환경에서는 SVG 다운로드를 지원하지 않습니다.");
    const href = URL.createObjectURL(new Blob([task.text], { type: "image/svg+xml;charset=utf-8" }));
    const revoke = URL.revokeObjectURL.bind(URL);
    const anchor = document.createElement("a");
    try {
      anchor.href = href; anchor.download = task.filename ?? "toonstudio-fx.svg";
      document.body.appendChild(anchor); anchor.click();
    } finally {
      anchor.remove();
      // 다운로드 소비자가 URL을 읽을 기회를 준 뒤 같은 URL을 정리한다.
      setTimeout(() => revoke(href), 0);
    }
  });
}
